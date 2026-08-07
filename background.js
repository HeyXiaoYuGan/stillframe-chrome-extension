const OFFSCREEN_PATH = "offscreen.html";
const ACTIVE_JOB_KEY = "activeMediaJob";
importScripts("i18n.js");

const MENU_OPEN_PANEL = "dingge-open-panel";
let creatingOffscreen;
const networkMediaByTab = new Map();
const contextMediaByTab = new Map();
const bilibiliDashByTab = new Map();
const canceledJobIds = new Set();
const jobStatusTabIds = new Set();
const forcedFilenameByUrl = new Map();
let activeJobCache;
const BILIBILI_HEADER_RULE_ID = 9767001;
let liveScanEnabled = false;
let liveScanSettingLoaded = false;

async function loadLiveScanSetting() {
  try {
    const stored = await chrome.storage.local.get({ liveScan: true });
    liveScanEnabled = stored.liveScan !== false;
  } finally {
    liveScanSettingLoaded = true;
  }
}

loadLiveScanSetting().catch(() => {
  liveScanSettingLoaded = true;
});

async function ensureBilibiliDownloadHeaders() {
  if (!chrome.declarativeNetRequest?.updateDynamicRules) return;
  await chrome.declarativeNetRequest.updateDynamicRules({
    // 9767002 removes a legacy dynamic rule created by an earlier release.
    removeRuleIds: [BILIBILI_HEADER_RULE_ID, 9767002],
    addRules: [{
      id: BILIBILI_HEADER_RULE_ID,
      priority: 1,
      action: {
        type: "modifyHeaders",
        requestHeaders: [{
          header: "Referer",
          operation: "set",
          value: "https://www.bilibili.com/",
        }],
      },
      condition: {
        regexFilter: "^https?://[^/]+\\.bilivideo\\.(com|cn)/",
        resourceTypes: ["media", "other", "xmlhttprequest"],
      },
    }],
  });
}

ensureBilibiliDownloadHeaders().catch(() => {});
chrome.runtime.onInstalled.addListener((details) => {
  ensureBilibiliDownloadHeaders().catch(() => {});
  chrome.storage.local.set({ authorSignature: "DINGGE" }).catch(() => {});
  chrome.storage.local.remove("downloadDirectory").catch(() => {});
  if (
    details.reason === "install" ||
    (details.reason === "update" &&
      /^2\.(?:[0-8]\.|9\.0$)/.test(String(details.previousVersion || "")))
  ) {
    chrome.storage.local
      .set({
        biliDownloadCover: false,
        biliCoverDefaultMigrated: true,
      })
      .catch(() => {});
  }
});

async function getActiveJob() {
  if (activeJobCache !== undefined) return activeJobCache;
  const stored = await chrome.storage.session.get(ACTIVE_JOB_KEY);
  activeJobCache = stored[ACTIVE_JOB_KEY] || null;
  if (
    activeJobCache &&
    Date.now() - Number(activeJobCache.startedAt || 0) > 30 * 60 * 1000
  ) {
    await clearActiveJob();
  }
  return activeJobCache;
}

function broadcastJobStatus(status) {
  const message = {
    type: "DINGGE_JOB_STATUS",
    ...status,
  };
  chrome.runtime.sendMessage(message).catch(() => {});
  [...jobStatusTabIds].forEach((tabId) => {
    chrome.tabs.sendMessage(tabId, message).catch(() => {
      jobStatusTabIds.delete(tabId);
    });
  });
}

async function setActiveJob(job) {
  activeJobCache = job;
  await chrome.storage.session.set({ [ACTIVE_JOB_KEY]: job });
  await updateJobSurfaces(job);
  broadcastJobStatus({ job });
}

async function updateActiveJob(jobId, changes) {
  const current = await getActiveJob();
  if (!current || current.jobId !== jobId) return;
  const next = { ...current, ...changes, updatedAt: Date.now() };
  await setActiveJob(next);
}

async function clearActiveJob(jobId = "", outcome = "completed") {
  if (jobId && activeJobCache?.jobId && activeJobCache.jobId !== jobId) return;
  const clearedJobId = activeJobCache?.jobId || jobId;
  activeJobCache = null;
  await chrome.storage.session.remove(ACTIVE_JOB_KEY);
  await updateJobSurfaces(null);
  broadcastJobStatus({
    job: null,
    completedJobId: outcome === "canceled" ? "" : clearedJobId,
    canceledJobId: outcome === "canceled" ? clearedJobId : "",
  });
}

async function updateJobSurfaces(job) {
  const percent = Math.max(0, Math.min(100, Math.round(job?.percent || 0)));
  try {
    await chrome.action.setBadgeBackgroundColor({ color: "#13261f" });
    await chrome.action.setBadgeText({ text: job ? (percent ? `${percent}%` : "…") : "" });
  } catch {
    // Badge updates are supplementary.
  }
  try {
    await chrome.contextMenus.update(MENU_OPEN_PANEL, {
      title: StillFrameI18n.t(
        job ? `处理中 ${percent}% · 浏览媒体` : "浏览媒体",
      ),
    });
  } catch {
    // Menus may not have been created yet during installation.
  }
}

function networkStorageKey(tabId) {
  return `networkMedia:${tabId}`;
}

async function getNetworkMedia(tabId) {
  if (networkMediaByTab.has(tabId)) return networkMediaByTab.get(tabId);
  const stored = await chrome.storage.session.get(networkStorageKey(tabId));
  const items = stored[networkStorageKey(tabId)] || [];
  networkMediaByTab.set(tabId, items);
  return items;
}

async function clearNetworkMedia(tabId) {
  if (tabId < 0) return;
  networkMediaByTab.delete(tabId);
  bilibiliDashByTab.delete(tabId);
  await chrome.storage.session.remove(networkStorageKey(tabId));
}

function bilibiliDashRole(rawUrl, contentType = "") {
  try {
    const url = new URL(rawUrl);
    if (!/(^|\.)bilivideo\.(?:com|cn)$/i.test(url.hostname)) return "";
    const mime = `${url.searchParams.get("mime") || ""} ${contentType}`.toLowerCase();
    if (!/\.m4s$/i.test(url.pathname) && !/audio|video/.test(mime)) return "";
    if (mime.includes("audio")) return "audio";
    if (mime.includes("video")) return "video";
    return "";
  } catch {
    return "";
  }
}

async function publishBilibiliDash(details, role) {
  if (
    !liveScanSettingLoaded ||
    !liveScanEnabled ||
    details.tabId < 0 ||
    !role
  ) return;
  const state = bilibiliDashByTab.get(details.tabId) || {
    videoUrls: [],
    audioUrls: [],
  };
  const target = role === "audio" ? state.audioUrls : state.videoUrls;
  if (!target.includes(details.url)) target.unshift(details.url);
  if (target.length > 8) target.length = 8;
  bilibiliDashByTab.set(details.tabId, state);

  const items = await getNetworkMedia(details.tabId);
  const changedMedia = [];
  if (role === "video") {
    const media = {
      url: details.url,
      kind: "video",
      streamType: "dash-video",
      source: "bilibili-dash",
      audioUrl: state.audioUrls[0] || "",
      fallbackUrl: "",
      width: 0,
      height: 0,
      alt: "B站 DASH 视频",
    };
    const existingIndex = items.findIndex((item) => item.url === media.url);
    if (existingIndex >= 0) items[existingIndex] = { ...items[existingIndex], ...media };
    else items.unshift(media);
    changedMedia.push(media);
  } else {
    items.forEach((item, index) => {
      if (item.source !== "bilibili-dash" || item.audioUrl === details.url) return;
      items[index] = { ...item, audioUrl: details.url };
      changedMedia.push(items[index]);
    });
  }
  if (items.length > 400) items.length = 400;
  networkMediaByTab.set(details.tabId, items);
  await chrome.storage.session.set({ [networkStorageKey(details.tabId)]: items });
  changedMedia.forEach((media) => {
    chrome.tabs
      .sendMessage(details.tabId, {
        type: "DINGGE_NETWORK_MEDIA",
        media,
      })
      .catch(() => {});
  });
}

function pinterestDirectVideoUrl(rawUrl) {
  const match = String(rawUrl).match(
    /v1\.pinimg\.com\/videos\/(mc|iht)\/(?:expMp4|720p|hls)\/([a-f0-9]{2}\/[a-f0-9]{2}\/[a-f0-9]{2}\/[a-f0-9]{32,})/i,
  );
  if (!match) return "";
  return match[1].toLowerCase() === "iht"
    ? `https://v1.pinimg.com/videos/iht/expMp4/${match[2]}_720w.mp4`
    : `https://v1.pinimg.com/videos/mc/720p/${match[2]}.mp4`;
}

function isVideoDownloadExcludedPage(rawUrl) {
  try {
    const hostname = new URL(rawUrl || "").hostname;
    return (
      /(^|\.)youtube\.com$/i.test(hostname) ||
      /(^|\.)youtube-nocookie\.com$/i.test(hostname) ||
      /(^|\.)youtu\.be$/i.test(hostname)
    );
  } catch {
    return false;
  }
}

async function isExcludedVideoRequest(details) {
  if (isVideoDownloadExcludedPage(details.initiator || details.documentUrl)) {
    return true;
  }
  if (details.tabId < 0) return false;
  try {
    const tab = await chrome.tabs.get(details.tabId);
    return isVideoDownloadExcludedPage(tab?.url);
  } catch {
    return false;
  }
}

function detectNetworkMediaCandidate(rawUrl, forcedType = "") {
  let streamType = forcedType;
  let pathname = "";
  try {
    pathname = new URL(rawUrl).pathname;
    if (!streamType && /\.m3u8$/i.test(pathname)) streamType = "hls";
    else if (!streamType && /\.(?:mp4|webm|mov|m4v)$/i.test(pathname)) {
      streamType = "video";
    }
  } catch {
    return null;
  }
  const pinterestCandidate = pinterestDirectVideoUrl(rawUrl);
  if (!streamType && pinterestCandidate) streamType = "video";
  if (!streamType) return null;
  return { pathname, pinterestCandidate, streamType };
}

async function publishNetworkMedia(details, forcedType = "") {
  if (
    !liveScanSettingLoaded ||
    !liveScanEnabled ||
    details.tabId < 0
  ) return;
  const candidate = detectNetworkMediaCandidate(details.url, forcedType);
  if (!candidate) return;
  if (await isExcludedVideoRequest(details)) return;
  const { pinterestCandidate, streamType } = candidate;
  const detectedHlsUrl = streamType === "hls" ? details.url : "";

  const media = {
    url: pinterestCandidate || details.url,
    hlsUrl: detectedHlsUrl,
    hlsUrls: detectedHlsUrl ? [detectedHlsUrl] : [],
    fallbackUrl:
      pinterestCandidate && detectedHlsUrl ? detectedHlsUrl : "",
    kind: "video",
    streamType: pinterestCandidate ? "" : streamType,
    source: pinterestCandidate ? "pinterest-video" : `network-${streamType}`,
    width: 0,
    height: 0,
    alt: "",
  };
  const items = await getNetworkMedia(details.tabId);
  const existingIndex = items.findIndex((item) => item.url === media.url);
  if (existingIndex >= 0) {
    const existing = items[existingIndex];
    items[existingIndex] = {
      ...existing,
      ...media,
      hlsUrl: existing.hlsUrl || media.hlsUrl,
      hlsUrls: [
        ...new Set([...(existing.hlsUrls || []), ...(media.hlsUrls || [])]),
      ],
      fallbackUrl: existing.fallbackUrl || media.fallbackUrl,
    };
  }
  else items.unshift(media);
  if (items.length > 400) items.length = 400;
  networkMediaByTab.set(details.tabId, items);
  await chrome.storage.session.set({ [networkStorageKey(details.tabId)]: items });

  chrome.tabs
    .sendMessage(details.tabId, {
      type: "DINGGE_NETWORK_MEDIA",
      media,
    })
    .catch(() => {});
}

chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (details.type === "main_frame") {
      contextMediaByTab.delete(details.tabId);
      clearNetworkMedia(details.tabId).catch(() => {});
      return;
    }
    if (!liveScanSettingLoaded || !liveScanEnabled) return;
    const dashRole = bilibiliDashRole(details.url);
    if (dashRole) {
      publishBilibiliDash(details, dashRole).catch(() => {});
      return;
    }
    publishNetworkMedia(details).catch(() => {});
  },
  { urls: ["<all_urls>"] },
);

chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    if (!liveScanSettingLoaded || !liveScanEnabled) return;
    const contentType = details.responseHeaders
      ?.find((header) => header.name.toLowerCase() === "content-type")
      ?.value?.toLowerCase();
    const dashRole = bilibiliDashRole(details.url, contentType);
    if (dashRole) {
      publishBilibiliDash(details, dashRole).catch(() => {});
      return;
    }
    if (
      contentType?.includes("mpegurl") ||
      contentType?.includes("application/x-mpegurl")
    ) {
      publishNetworkMedia(details, "hls").catch(() => {});
    } else if (
      contentType?.startsWith("video/") &&
      !/\.(?:m4s|ts|cmfv|cmfa)$/i.test(
        detectNetworkMediaCandidate(details.url, "video")?.pathname || "",
      )
    ) {
      publishNetworkMedia(details, "video").catch(() => {});
    }
  },
  { urls: ["<all_urls>"] },
  ["responseHeaders"],
);

chrome.tabs.onRemoved.addListener((tabId) => {
  networkMediaByTab.delete(tabId);
  contextMediaByTab.delete(tabId);
  bilibiliDashByTab.delete(tabId);
  chrome.storage.session.remove(networkStorageKey(tabId)).catch(() => {});
});

async function hasOffscreenDocument() {
  const offscreenUrl = chrome.runtime.getURL(OFFSCREEN_PATH);
  if ("getContexts" in chrome.runtime) {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ["OFFSCREEN_DOCUMENT"],
      documentUrls: [offscreenUrl],
    });
    return contexts.length > 0;
  }
  const matchedClients = await clients.matchAll();
  return matchedClients.some((client) => client.url === offscreenUrl);
}

async function ensureOffscreenDocument() {
  if (await hasOffscreenDocument()) return;
  if (creatingOffscreen) {
    await creatingOffscreen;
    return;
  }
  creatingOffscreen = chrome.offscreen.createDocument({
    url: OFFSCREEN_PATH,
    reasons: ["BLOBS"],
    justification: "在弹窗关闭后继续读取媒体、合并 HLS 分片并生成可下载文件。",
  });
  try {
    await creatingOffscreen;
  } finally {
    creatingOffscreen = null;
  }
}

function redactSensitiveDisplayText(value) {
  return String(value || "")
    .replace(/https?:\/\/[^\s"'<>]+/gi, "[media URL]")
    .replace(
      /\b(?:access[_-]?token|authorization|cookie|csrf(?:token)?|signature|sig|auth_key)=([^&\s]+)/gi,
      (match) => `${match.slice(0, match.indexOf("=") + 1)}[redacted]`,
    );
}

async function notify(title, message) {
  try {
    await StillFrameI18n.ready;
    const { notificationsEnabled = true } = await chrome.storage.local.get(
      "notificationsEnabled",
    );
    if (notificationsEnabled === false) return;
    await chrome.notifications.create({
      type: "basic",
      iconUrl: "icon-128.png",
      title: redactSensitiveDisplayText(StillFrameI18n.t(title)),
      message: redactSensitiveDisplayText(StillFrameI18n.t(message)),
    });
  } catch {
    // Notifications may be disabled by the browser or operating system.
  }
}

async function startZipTask(message) {
  const current = await getActiveJob();
  if (current) {
    throw new Error(`已有任务正在运行：${current.text || "后台正在处理媒体"}`);
  }
  await ensureOffscreenDocument();
  const { dinggeZipSequence = 0 } =
    await chrome.storage.local.get("dinggeZipSequence");
  const nextSequence = (Math.max(0, Number(dinggeZipSequence) || 0) % 999999) + 1;
  await chrome.storage.local.set({ dinggeZipSequence: nextSequence });
  const archiveName = `STILLFRAME-${String(nextSequence).padStart(3, "0")}.zip`;
  await setActiveJob({
    jobId: message.jobId,
    type: "zip",
    percent: 4,
    text: "后台打包任务已启动…",
    outputFilename: archiveName,
    startedAt: Date.now(),
    updatedAt: Date.now(),
  });
  try {
    const response = await chrome.runtime.sendMessage({
      ...message,
      archiveName,
      type: "DINGGE_RUN_ZIP",
      target: "offscreen",
    });
    if (!response?.accepted) {
      throw new Error(response?.error || "后台打包器当前不可用。");
    }
  } catch (error) {
    await clearActiveJob(message.jobId);
    throw error;
  }
}

async function startHlsTask(message, existingJobId = "") {
  const current = await getActiveJob();
  if (current && current.jobId !== existingJobId) {
    throw new Error(`已有任务正在运行：${current.text || "后台正在处理媒体"}`);
  }
  await ensureOffscreenDocument();
  await setActiveJob({
    jobId: message.jobId,
    type: "hls",
    percent: current ? Math.max(20, current.percent || 0) : 4,
    text: "已找到 HLS，正在读取播放列表…",
    outputFilename: message.items?.[0]?.name
      ? `${sanitizeFilename(
          String(message.items[0].name).replace(/\.[a-zA-Z0-9]{2,5}$/i, ""),
        ) || "bilibili-video"}.mp4`
      : current?.outputFilename || "",
    startedAt: current?.startedAt || Date.now(),
    updatedAt: Date.now(),
  });
  try {
    const response = await chrome.runtime.sendMessage({
      ...message,
      type: "DINGGE_RUN_HLS_DOWNLOAD",
      target: "offscreen",
    });
    if (!response?.accepted) {
      throw new Error(response?.error || "HLS 后台下载器当前不可用。");
    }
  } catch (error) {
    await clearActiveJob(message.jobId);
    throw error;
  }
}

async function startDashMuxTask(message, existingJobId = "") {
  const current = await getActiveJob();
  if (current && current.jobId !== existingJobId) {
    throw new Error(`已有任务正在运行：${current.text || "后台正在处理媒体"}`);
  }
  await ensureOffscreenDocument();
  const outputFilename =
    `${sanitizeFilename(
      String(message.filename || "").replace(/\.[a-zA-Z0-9]{2,5}$/i, ""),
    ) || "bilibili-video"}.mp4`;
  await setActiveJob({
    jobId: message.jobId,
    type: "dash-mux",
    percent: current ? Math.max(20, current.percent || 0) : 4,
    text: "已取得 DASH 视频和音频，正在准备无损合并…",
    outputFilename,
    startedAt: current?.startedAt || Date.now(),
    updatedAt: Date.now(),
  });
  try {
    const response = await chrome.runtime.sendMessage({
      ...message,
      filename: outputFilename,
      type: "DINGGE_RUN_DASH_MUX",
      target: "offscreen",
    });
    if (!response?.accepted) {
      throw new Error(response?.error || "DASH 无损合并器当前不可用。");
    }
  } catch (error) {
    await clearActiveJob(message.jobId);
    throw error;
  }
}

async function startBilibiliPartsZipTask(message, existingJobId = "") {
  const current = await getActiveJob();
  if (current && current.jobId !== existingJobId) {
    throw new Error(`已有任务正在运行：${current.text || "后台正在处理媒体"}`);
  }
  await ensureOffscreenDocument();
  const { dinggeZipSequence = 0 } =
    await chrome.storage.local.get("dinggeZipSequence");
  const nextSequence = (Math.max(0, Number(dinggeZipSequence) || 0) % 999999) + 1;
  await chrome.storage.local.set({ dinggeZipSequence: nextSequence });
  const archiveName = `STILLFRAME-${String(nextSequence).padStart(3, "0")}.zip`;
  await setActiveJob({
    jobId: message.jobId,
    type: "bilibili-parts-zip",
    percent: Math.max(12, current?.percent || 0),
    text: `已解析 ${message.items.length} 个分P，正在准备后台打包…`,
    outputFilename: archiveName,
    startedAt: current?.startedAt || Date.now(),
    updatedAt: Date.now(),
  });
  try {
    const response = await chrome.runtime.sendMessage({
      ...message,
      archiveName,
      type: "DINGGE_RUN_BILIBILI_PARTS_ZIP",
      target: "offscreen",
    });
    if (!response?.accepted) {
      throw new Error(response?.error || "分P后台打包器当前不可用。");
    }
  } catch (error) {
    await clearActiveJob(message.jobId);
    throw error;
  }
}

async function startVideoResolveTask(jobId) {
  const current = await getActiveJob();
  if (current) {
    throw new Error(`已有任务正在运行：${current.text || "后台正在处理媒体"}`);
  }
  await setActiveJob({
    jobId,
    type: "resolve-video",
    percent: 3,
    text: "正在识别右键选择的视频…",
    startedAt: Date.now(),
    updatedAt: Date.now(),
  });
}

async function assertActiveJob(jobId) {
  if (!jobId) return;
  const current = await getActiveJob();
  if (!current || current.jobId !== jobId) {
    throw new Error("视频处理任务已取消。");
  }
}

function sanitizeFilename(value) {
  let safe = String(value || "")
    .replace(/^www\./, "")
    .replace(/[^a-zA-Z0-9\u4e00-\u9fff._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/[ .]+$/g, "")
    .slice(0, 80)
    .replace(/[ .]+$/g, "");
  if (!safe || safe === "." || safe === "..") return "file";
  const firstNamePart = safe.split(".")[0];
  if (/^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(firstNamePart)) {
    safe = `_${safe}`.slice(0, 80).replace(/[ .]+$/g, "");
  }
  return safe || "file";
}

async function downloadPath(category, filename) {
  return ["定格下载", category, filename].filter(Boolean).join("/");
}

chrome.downloads.onDeterminingFilename?.addListener((item, suggest) => {
  const pending =
    forcedFilenameByUrl.get(item.url) ||
    forcedFilenameByUrl.get(item.finalUrl);
  if (!pending || pending.expiresAt < Date.now()) return;
  suggest({
    filename: pending.filename,
    conflictAction: "uniquify",
  });
  return true;
});

async function downloadWithForcedFilename(options) {
  const filename = String(options.filename || "");
  if (filename) {
    forcedFilenameByUrl.set(options.url, {
      filename,
      expiresAt: Date.now() + 60_000,
    });
  }
  try {
    return await chrome.downloads.download(options);
  } finally {
    setTimeout(() => {
      const pending = forcedFilenameByUrl.get(options.url);
      if (pending?.filename === filename) {
        forcedFilenameByUrl.delete(options.url);
      }
    }, 15_000);
  }
}

function pinterestOriginalUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (!/(^|\.)pinimg\.com$/i.test(url.hostname)) return "";
    const segments = url.pathname.split("/");
    const sizeIndex = segments.findIndex((segment) =>
      /^(?:\d+x\d+|\d+x|75x75_RS|originals)$/i.test(segment),
    );
    if (sizeIndex < 0) return "";
    segments[sizeIndex] = "originals";
    url.pathname = segments.join("/");
    url.search = "";
    return url.href;
  } catch {
    return "";
  }
}

function mediaFilename(item, index = 0) {
  let basename = "";
  let extension = item.kind === "video" ? "mp4" : "jpg";
  try {
    const pathname = decodeURIComponent(new URL(item.url).pathname);
    const leaf = pathname.split("/").filter(Boolean).pop() || "";
    basename = leaf.replace(/\.[a-zA-Z0-9]{2,5}$/i, "");
    const foundExtension = leaf.match(/\.([a-zA-Z0-9]{2,5})$/)?.[1]?.toLowerCase();
    if (foundExtension) extension = foundExtension === "m3u8" ? "ts" : foundExtension;
  } catch {
    basename = item.alt || "";
  }
  const safeName = sanitizeFilename(basename || item.alt || `media-${index + 1}`);
  return `${String(index + 1).padStart(3, "0")}-${safeName}.${extension}`;
}

function isLikelyWebpUrl(rawUrl) {
  const value = String(rawUrl || "");
  if (/^data:image\/webp(?:;|,)/i.test(value)) return true;
  try {
    const url = new URL(value);
    return (
      /\.webp(?:$|@)/i.test(url.pathname) ||
      /^(?:webp|image\/webp)$/i.test(
        url.searchParams.get("format") ||
          url.searchParams.get("fmt") ||
          url.searchParams.get("mime") ||
          "",
      )
    );
  } catch {
    return false;
  }
}

async function downloadWebpAsPng(url, filename) {
  await ensureOffscreenDocument();
  const response = await chrome.runtime.sendMessage({
    type: "DINGGE_CONVERT_WEBP_TO_PNG",
    target: "offscreen",
    url,
  });
  if (!response?.converted || !response.objectUrl) {
    throw new Error(response?.error || "WebP 转 PNG 失败。");
  }
  const pngFilename = String(filename || "image.webp").replace(
    /\.[a-zA-Z0-9]{2,5}$/i,
    "",
  ) + ".png";
  return chrome.downloads.download({
    url: response.objectUrl,
    filename: await downloadPath("媒体", pngFilename),
    saveAs: false,
  });
}

async function downloadImageWithPreferredFormat(url, filename) {
  if (isLikelyWebpUrl(url)) {
    try {
      return await downloadWebpAsPng(url, filename);
    } catch {
      // Fall back to the source WebP if decoding is unavailable.
    }
  }
  return chrome.downloads.download({
    url,
    filename: await downloadPath("媒体", filename),
    saveAs: false,
  });
}

function canonicalImageIdentity(rawUrl) {
  const value = String(rawUrl || "");
  if (!value || /^data:/i.test(value)) return value;
  try {
    const url = new URL(pinterestOriginalUrl(value) || value);
    url.hostname = url.hostname
      .toLowerCase()
      .replace(/^i\d+\.hdslb\.com$/i, "i.hdslb.com")
      .replace(/^i\d+\.hdslb\.net$/i, "i.hdslb.net");
    url.hash = "";
    url.pathname = url.pathname
      .replace(/\/originals\//i, "/{size}/")
      .replace(/(\.(?:avif|gif|jpe?g|png|webp))@[^/]+$/i, "$1")
      .replace(/[-_]\d{2,5}x\d{2,5}(?=\.(?:avif|gif|jpe?g|png|webp)$)/i, "")
      .replace(/[-_](?:thumb(?:nail)?|small|medium|large|original)(?=\.(?:avif|gif|jpe?g|png|webp)$)/i, "")
      .replace(/\/(?:w|h)?\d{2,5}x(?:\d{2,5})?\//gi, "/{size}/");
    const removableParams = new Set([
      "w", "width", "h", "height", "q", "quality", "dpr", "resize",
      "fit", "crop", "auto", "format", "fmt", "size", "thumbnail",
      "thumb", "x-oss-process", "x-bce-process", "imageview2",
      "imagemogr2", "image_process", "image-process", "token", "signature",
      "sig", "expires", "expiration", "auth_key", "timestamp", "from",
      "source", "refer", "spm_id_from",
    ]);
    [...url.searchParams.keys()].forEach((key) => {
      const normalizedKey = key.toLowerCase();
      if (
        removableParams.has(normalizedKey) ||
        /^utm_/i.test(normalizedKey) ||
        /^(?:imageview2|imagemogr2|image[_-]process)(?:\/|$)/i.test(normalizedKey) ||
        /^x-(?:amz|oss|tos|bce|expires|signature)/i.test(normalizedKey)
      ) {
        url.searchParams.delete(key);
      }
    });
    url.searchParams.sort();
    const identityPath = url.pathname.replace(
      /\.(?:avif|gif|jpe?g|png|webp)$/i,
      "",
    );
    const stableAssetToken = identityPath.match(
      /(?:^|\/)([a-f0-9]{24,})(?=[._/-]|$)/i,
    )?.[1];
    if (stableAssetToken) return `asset:${stableAssetToken.toLowerCase()}`;
    return `${url.hostname.toLowerCase()}${identityPath}${url.search}`;
  } catch {
    return value;
  }
}

function imagePixelScore(item = {}) {
  const width = Number(item.width) || 0;
  const height = Number(item.height) || 0;
  let inferredWidth = 0;
  let inferredHeight = 0;
  const rawUrl = String(item.url || "");
  try {
    const url = new URL(rawUrl);
    inferredWidth =
      Number(url.searchParams.get("width") || url.searchParams.get("w")) || 0;
    inferredHeight =
      Number(url.searchParams.get("height") || url.searchParams.get("h")) || 0;
  } catch {
    // Use dimensions embedded in the path.
  }
  const dimensionMatch = rawUrl.match(
    /(?:@|[-_=\/])(\d{2,5})[wx_](?:\D{0,4})?(\d{2,5})h?/i,
  );
  if (dimensionMatch) {
    inferredWidth = Math.max(inferredWidth, Number(dimensionMatch[1]) || 0);
    inferredHeight = Math.max(inferredHeight, Number(dimensionMatch[2]) || 0);
  }
  const knownArea = width && height ? width * height : 0;
  const inferredArea =
    inferredWidth && inferredHeight
      ? inferredWidth * inferredHeight
      : Math.max(inferredWidth, inferredHeight, width, height) ** 2;
  return Math.max(Number(item.pixelScore) || 0, knownArea, inferredArea);
}

function mediaIdentity(item) {
  const pinterestMatch = String(item.url || "").match(
    /v1\.pinimg\.com\/videos\/(mc|iht)\/(?:expMp4|720p|hls)\/([a-f0-9]{2}\/[a-f0-9]{2}\/[a-f0-9]{2}\/[a-f0-9]{32,})/i,
  );
  if (pinterestMatch) {
    return `pinterest-video:${pinterestMatch[1]}:${pinterestMatch[2]}`.toLowerCase();
  }
  return item.kind === "video"
    ? `video:${item.url}`
    : `image:${canonicalImageIdentity(item.url)}`;
}

async function collectTabMedia(tabId) {
  const [pageResult, networkItems] = await Promise.all([
    chrome.tabs
      .sendMessage(tabId, { type: "DINGGE_GET_IMAGES" })
      .then((response) => response?.images || [])
      .catch(() => []),
    getNetworkMedia(tabId).catch(() => []),
  ]);
  const media = new Map();
  [...pageResult, ...networkItems].forEach((item) => {
    if (!item?.url) return;
    const normalized = {
      ...item,
      kind: item.kind || "image",
    };
    const key = mediaIdentity(normalized);
    const existing = media.get(key);
    if (!existing) {
      media.set(key, normalized);
      return;
    }
    const existingIsHls = /\.m3u8(?:$|[?#])/i.test(existing.url);
    const incomingIsDirect = !/\.m3u8(?:$|[?#])/i.test(normalized.url);
    if (existingIsHls && incomingIsDirect) {
      media.set(key, {
        ...existing,
        ...normalized,
        fallbackUrl: normalized.fallbackUrl || existing.url,
        hlsUrl: existing.hlsUrl || normalized.hlsUrl || existing.url,
        hlsUrls: [
          ...new Set([...(existing.hlsUrls || []), ...(normalized.hlsUrls || [])]),
        ],
      });
    } else if (existing.kind === "video" && normalized.kind === "video") {
      media.set(key, {
        ...existing,
        hlsUrl: existing.hlsUrl || normalized.hlsUrl,
        hlsUrls: [
          ...new Set([...(existing.hlsUrls || []), ...(normalized.hlsUrls || [])]),
        ],
        fallbackUrl: existing.fallbackUrl || normalized.fallbackUrl,
        audioUrl: existing.audioUrl || normalized.audioUrl,
      });
    } else if (
      normalized.kind !== "video" &&
      imagePixelScore(normalized) > imagePixelScore(existing)
    ) {
      media.set(key, {
        ...existing,
        ...normalized,
        previewUrls: [
          ...new Set([
            normalized.url,
            ...(normalized.previewUrls || []),
            existing.url,
            ...(existing.previewUrls || []),
          ]),
        ],
      });
    }
  });
  return [...media.values()];
}

async function startContextPack(tab, kind = "all") {
  const allMedia = await collectTabMedia(tab.id);
  const selected = allMedia.filter((item) => {
    if (kind === "image") return item.kind !== "video";
    if (kind === "video") return item.kind === "video";
    return true;
  });
  if (!selected.length) {
    throw new Error(kind === "image" ? "当前页面没有发现图片。" : kind === "video" ? "当前页面没有发现视频。" : "当前页面没有发现媒体。");
  }
  const host = sanitizeFilename(new URL(tab.url).hostname) || "website";
  const label = kind === "image" ? "images" : kind === "video" ? "videos" : "media";
  await startZipTask({
    jobId: crypto.randomUUID(),
    archiveName: `${host}-${label}.zip`,
    images: selected.flatMap((item, index) => {
      const name = mediaFilename(item, index);
      if (item.streamType !== "dash-video") {
        return [{
          url:
            item.kind === "video"
              ? item.hlsUrl || item.url
              : pinterestOriginalUrl(item.url) || item.url,
          fallbackUrl:
            item.kind === "video"
              ? item.url
              : item.fallbackUrl || item.url,
          name,
          streamType: item.hlsUrl ? "hls" : item.streamType || "",
        }];
      }
      const baseName = name.replace(/\.(?:m4s|mp4|webm|mov|m4v)$/i, "");
      return [
        {
          url: item.url,
          fallbackUrl: "",
          name: `${baseName}.video.m4s`,
          streamType: "",
        },
        ...(item.audioUrl
          ? [{
              url: item.audioUrl,
              fallbackUrl: "",
              name: `${baseName}.audio.m4s`,
              streamType: "",
            }]
          : []),
      ];
    }),
  });
  await notify(
    "定格：后台打包已启动",
    `正在处理 ${selected.length} 项媒体；点击扩展图标可查看进度。`,
  );
}

async function fetchWithDeadline(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function readMediaFileSize(rawUrl) {
  let url;
  try {
    url = new URL(String(rawUrl || ""));
  } catch {
    return 0;
  }
  if (!/^https?:$/i.test(url.protocol)) return 0;

  const readLength = (response) => {
    const contentRange = response.headers.get("content-range") || "";
    const rangeTotal = Number(contentRange.match(/\/(\d+)\s*$/)?.[1]);
    if (Number.isFinite(rangeTotal) && rangeTotal > 0) return rangeTotal;
    const contentLength = Number(response.headers.get("content-length"));
    return Number.isFinite(contentLength) && contentLength > 0
      ? contentLength
      : 0;
  };

  try {
    const response = await fetchWithDeadline(
      url.href,
      {
        method: "HEAD",
        credentials: "include",
        cache: "no-store",
        redirect: "follow",
      },
      6000,
    );
    const size = readLength(response);
    if (size > 0) return size;
  } catch {
    // Some media hosts reject HEAD requests. A one-byte range request below
    // reads only response headers and is canceled immediately.
  }

  try {
    const response = await fetchWithDeadline(
      url.href,
      {
        method: "GET",
        headers: { Range: "bytes=0-0" },
        credentials: "include",
        cache: "no-store",
        redirect: "follow",
      },
      6000,
    );
    const size = readLength(response);
    await response.body?.cancel().catch(() => {});
    return size;
  } catch {
    return 0;
  }
}

function extractVideoUrlsFromText(rawText) {
  const normalized = String(rawText || "")
    .replace(/\\u002f/gi, "/")
    .replace(/\\u0026/gi, "&")
    .replace(/\\\//g, "/")
    .replace(/&amp;/gi, "&");
  const urls = [];
  for (const match of normalized.matchAll(/https?:\/\/[^"'\\\s<>]+/gi)) {
    const url = match[0].replace(/[),}\]]+$/g, "");
    if (/v1\.pinimg\.com\/videos\//i.test(url)) urls.push(url);
  }
  return [...new Set(urls)];
}

function collectVideoUrlsFromData(value, result = [], seen = new WeakSet()) {
  if (!value) return result;
  if (typeof value === "string") {
    result.push(...extractVideoUrlsFromText(value));
    if (/^https?:\/\/v1\.pinimg\.com\/videos\//i.test(value)) result.push(value);
    return result;
  }
  if (typeof value !== "object" || seen.has(value)) return result;
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item) => collectVideoUrlsFromData(item, result, seen));
  } else {
    Object.values(value).forEach((item) =>
      collectVideoUrlsFromData(item, result, seen),
    );
  }
  return result;
}

function buildPinterestMp4Candidates(mediaHashes, preferredBucket = "") {
  const urls = [];
  const buckets = preferredBucket
    ? [preferredBucket, preferredBucket === "mc" ? "iht" : "mc"]
    : ["mc", "iht"];
  mediaHashes.forEach((hash) => {
    buckets.forEach((bucket) => {
      if (bucket === "iht") {
        urls.push(
          `https://v1.pinimg.com/videos/iht/expMp4/${hash}_720w.mp4`,
          `https://v1.pinimg.com/videos/iht/expMp4/${hash}_t4.mp4`,
          `https://v1.pinimg.com/videos/iht/expMp4/${hash}_t3.mp4`,
          `https://v1.pinimg.com/videos/iht/expMp4/${hash}_t2.mp4`,
          `https://v1.pinimg.com/videos/iht/expMp4/${hash}_t1.mp4`,
        );
      } else {
        urls.push(
          `https://v1.pinimg.com/videos/mc/720p/${hash}.mp4`,
          `https://v1.pinimg.com/videos/mc/expMp4/${hash}_t4.mp4`,
          `https://v1.pinimg.com/videos/mc/expMp4/${hash}_t3.mp4`,
          `https://v1.pinimg.com/videos/mc/expMp4/${hash}_t2.mp4`,
          `https://v1.pinimg.com/videos/mc/expMp4/${hash}_t1.mp4`,
        );
      }
    });
  });
  return [...new Set(urls)];
}

async function probeVideoUrl(url) {
  try {
    const response = await fetchWithDeadline(
      url,
      {
        method: "GET",
        headers: { Range: "bytes=0-31" },
        cache: "no-store",
        credentials: "omit",
      },
      6000,
    );
    const contentType = (response.headers.get("content-type") || "").toLowerCase();
    let bytes = new Uint8Array();
    try {
      const reader = response.body?.getReader();
      if (reader) {
        const first = await reader.read();
        bytes = first.value || bytes;
        await reader.cancel();
      }
    } catch {
      response.body?.cancel().catch(() => {});
    }
    const ascii = String.fromCharCode(...bytes.slice(0, 24)).trimStart();
    const looksLikeTextError =
      contentType.startsWith("text/") ||
      contentType.includes("json") ||
      /^(?:<!doctype|<html|<\?xml|[{\[]|error\b)/i.test(ascii);
    const hasMp4Header =
      bytes.length >= 8 &&
      String.fromCharCode(...bytes.slice(4, 8)) === "ftyp";
    const hasWebmHeader =
      bytes.length >= 4 &&
      bytes[0] === 0x1a &&
      bytes[1] === 0x45 &&
      bytes[2] === 0xdf &&
      bytes[3] === 0xa3;
    const hasAudioHeader =
      String.fromCharCode(...bytes.slice(0, 4)) === "OggS" ||
      String.fromCharCode(...bytes.slice(0, 3)) === "ID3" ||
      (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xf0) === 0xf0);
    const valid =
      response.ok &&
      !looksLikeTextError &&
      (contentType.startsWith("video/") ||
        contentType.startsWith("audio/") ||
        contentType.startsWith("application/octet-stream") ||
        (!contentType && /\.mp4(?:$|[?#])/i.test(url))) &&
      (hasMp4Header ||
        hasWebmHeader ||
        hasAudioHeader ||
        contentType.startsWith("video/") ||
        contentType.startsWith("audio/"));
    return valid;
  } catch {
    return false;
  }
}

async function findFirstWorkingVideoUrl(urls, onProgress = () => {}) {
  const uniqueUrls = [...new Set(urls)].filter(
    (url) => /^https?:/i.test(url) && !/\.m3u8(?:$|[?#])/i.test(url),
  );
  for (let index = 0; index < uniqueUrls.length; index += 3) {
    onProgress(index, uniqueUrls.length);
    const batch = uniqueUrls.slice(index, index + 3);
    const results = await Promise.all(batch.map(probeVideoUrl));
    const matchIndex = results.findIndex(Boolean);
    if (matchIndex >= 0) return batch[matchIndex];
  }
  onProgress(uniqueUrls.length, uniqueUrls.length);
  return "";
}

function isPinterestHostname(hostname) {
  const normalized = String(hostname || "").toLowerCase();
  return [
    "pinterest.com",
    "pinterest.cn",
    "pinterest.de",
    "pinterest.fr",
    "pinterest.co.uk",
    "pinterest.jp",
  ].some(
    (baseHostname) =>
      normalized === baseHostname ||
      normalized.endsWith(`.${baseHostname}`),
  );
}

async function readPinterestRequestToken(tab) {
  try {
    if (!tab?.id || !isPinterestHostname(new URL(tab.url || "").hostname)) {
      return "";
    }
    const response = await chrome.tabs.sendMessage(tab.id, {
      type: "DINGGE_GET_PINTEREST_REQUEST_TOKEN",
    });
    return typeof response?.token === "string" ? response.token : "";
  } catch {
    return "";
  }
}

async function fetchPinterestPinVideoUrls(contextMedia, tab) {
  const pinId = contextMedia?.pinId;
  if (!pinId) return [];
  let origin = "";
  try {
    const tabPage = new URL(tab.url || "");
    if (!isPinterestHostname(tabPage.hostname)) return [];
    origin = tabPage.origin;
  } catch {
    return [];
  }
  const data = JSON.stringify({
    options: { id: String(pinId), field_set_key: "detailed" },
    context: {},
  });
  const apiUrl =
    `${origin}/resource/PinResource/get/?source_url=` +
    encodeURIComponent(`/pin/${pinId}/`) +
    `&data=${encodeURIComponent(data)}`;
  const headers = {
    Accept: "application/json, text/javascript, */*; q=0.01",
    "X-Requested-With": "XMLHttpRequest",
  };
  let requestToken = await readPinterestRequestToken(tab);
  if (requestToken) {
    try {
      headers["X-CSRFToken"] = decodeURIComponent(requestToken);
    } catch {
      headers["X-CSRFToken"] = requestToken;
    }
  }
  try {
    const response = await fetchWithDeadline(
      apiUrl,
      { credentials: "include", cache: "no-store", headers },
      8000,
    );
    if (response.ok) {
      const json = await response.json();
      const dataRoot = json?.resource_response?.data || json;
      const urls = collectVideoUrlsFromData(dataRoot);
      if (urls.length) return [...new Set(urls)];
    }
  } catch {
    // Fall through to parsing the public Pin page.
  } finally {
    requestToken = "";
    delete headers["X-CSRFToken"];
  }
  try {
    let pageUrl = `${origin}/pin/${pinId}/`;
    try {
      const candidatePage = new URL(contextMedia.pinUrl || pageUrl);
      if (candidatePage.origin === origin) pageUrl = candidatePage.href;
    } catch {
      // Use the same-origin Pin URL assembled above.
    }
    const response = await fetchWithDeadline(
      pageUrl,
      { credentials: "include", cache: "no-store" },
      8000,
    );
    if (response.ok) return extractVideoUrlsFromText(await response.text());
  } catch {
    // Direct hash probing remains available.
  }
  return [];
}

async function resolveAlternativePinterestVideo(
  contextMedia,
  tab,
  videos,
  jobId,
) {
  const mediaHashes = contextMedia?.mediaHashes || [];
  const pageCandidates = [
    ...(contextMedia?.scopeUrls || []),
    ...(contextMedia?.performanceUrls || []),
  ].filter(
    (url) =>
      /^https?:/i.test(url || "") &&
      (/v1\.pinimg\.com\/videos\//i.test(url) ||
        /\.(?:mp4|m3u8)(?:$|[?#])/i.test(url)),
  );
  const targetedPageCandidates = mediaHashes.length
    ? [
        ...pageCandidates.filter((url) =>
          mediaHashes.some((hash) => url.includes(hash)),
        ),
        ...pageCandidates.filter(
          (url) => !mediaHashes.some((hash) => url.includes(hash)),
        ),
      ]
    : pageCandidates;
  const matchingVideos = mediaHashes.length
    ? videos.filter((item) =>
        mediaHashes.some(
          (hash) =>
            item.url?.includes(hash) ||
            item.hlsUrl?.includes(hash) ||
            item.fallbackUrl?.includes(hash),
        ),
      )
    : [];
  const cachedDirectUrls = matchingVideos
    .flatMap((item) => [item.url, item.fallbackUrl])
    .filter((url) => /\.mp4(?:$|[?#])/i.test(url || ""));
  const preferredBucket =
    matchingVideos
      .map((item) => item.url?.match(/\/videos\/(mc|iht)\//i)?.[1]?.toLowerCase())
      .find(Boolean) || "";
  const hashCandidates = buildPinterestMp4Candidates(mediaHashes, preferredBucket);
  await assertActiveJob(jobId);
  await updateActiveJob(jobId, {
    percent: 18,
    text: `正在验证页面实际加载的视频地址（${targetedPageCandidates.length} 个候选）…`,
  });
  let workingUrl = await findFirstWorkingVideoUrl([
    ...targetedPageCandidates.filter((url) => /\.mp4(?:$|[?#])/i.test(url)),
    ...cachedDirectUrls,
    ...hashCandidates,
  ], (completed, total) => {
    const ratio = total ? completed / total : 1;
    updateActiveJob(jobId, {
      percent: 18 + Math.round(ratio * 42),
      text: `正在验证 MP4 地址 ${Math.min(completed + 1, total || 1)}/${total || 1}…`,
    }).catch(() => {});
  });
  await assertActiveJob(jobId);
  if (workingUrl) return workingUrl;
  const pageHlsUrl = targetedPageCandidates.find((url) =>
    /\.m3u8(?:$|[?#])/i.test(url),
  );
  if (pageHlsUrl) return pageHlsUrl;

  await updateActiveJob(jobId, {
    percent: 64,
    text: "哈希直链不可用，正在读取 Pinterest Pin 数据…",
  });
  const apiUrls = await fetchPinterestPinVideoUrls(contextMedia, tab);
  await assertActiveJob(jobId);
  await updateActiveJob(jobId, {
    percent: 76,
    text: `已读取 Pin 数据，正在验证 ${apiUrls.length} 个视频地址…`,
  });
  workingUrl = await findFirstWorkingVideoUrl(
    apiUrls.filter((url) => /\.mp4(?:$|[?#])/i.test(url)),
    (completed, total) => {
      const ratio = total ? completed / total : 1;
      updateActiveJob(jobId, {
        percent: 76 + Math.round(ratio * 15),
        text: `正在验证 Pin 视频地址 ${Math.min(completed + 1, total || 1)}/${total || 1}…`,
      }).catch(() => {});
    },
  );
  await assertActiveJob(jobId);
  if (workingUrl) return workingUrl;
  return apiUrls.find((url) => /\.m3u8(?:$|[?#])/i.test(url)) || "";
}

async function downloadContextMedia(info, tab, operationJobId = "") {
  let url = info.srcUrl || "";
  let kind = info.mediaType === "video" ? "video" : "image";
  let useHls = false;
  let hlsCandidates = [];
  if (kind === "video") {
    if (isVideoDownloadExcludedPage(tab.url)) {
      throw new Error("当前网站不提供视频下载。");
    }
    if (operationJobId) {
      await updateActiveJob(operationJobId, {
        percent: 10,
        text: "正在读取当前页面的视频记录…",
      });
    }
    const videos = (await collectTabMedia(tab.id)).filter((item) => item.kind === "video");
    const contextMedia = contextMediaByTab.get(tab.id);
    const bilibiliDash = videos.find(
      (item) => item.streamType === "dash-video" && item.url,
    );
    if (
      /(^|\.)bilibili\.com$/i.test(new URL(tab.url).hostname) &&
      (!url || url.startsWith("blob:"))
    ) {
      if (operationJobId) {
        await updateActiveJob(operationJobId, {
          percent: 82,
          text: "已识别 B站 DASH，正在创建音视频下载…",
        });
      }
      const result = await downloadBilibiliFromPage(
        tab.url,
        bilibiliDash || {},
        0,
        tab.id,
        operationJobId,
      );
      if (operationJobId && !result.hlsStarted) {
        await clearActiveJob(operationJobId);
      }
      await notify(
        "定格：B站下载已开始",
        result.hlsStarted
          ? "正在读取 m3u8 并合并视频分片，可在插件面板查看实时进度。"
          : result.audioDownloaded
          ? "视频流和音频流已分别开始下载。"
          : "视频流已开始下载；播放几秒后可再次尝试获取音频。",
      );
      return;
    }
    const mediaHashes = contextMedia?.mediaHashes || [];
    const matchingVideo = mediaHashes.length
      ? videos.find((item) =>
          mediaHashes.some(
            (hash) =>
              item.url?.includes(hash) ||
              item.hlsUrl?.includes(hash) ||
              item.hlsUrls?.some((hlsUrl) => hlsUrl.includes(hash)) ||
              item.fallbackUrl?.includes(hash),
          ),
        )
      : null;
    const hlsUrl =
      matchingVideo?.hlsUrl ||
      matchingVideo?.hlsUrls?.[0] ||
      (/\.m3u8(?:$|[?#])/i.test(matchingVideo?.fallbackUrl || "")
        ? matchingVideo.fallbackUrl
        : "") ||
      (/\.m3u8(?:$|[?#])/i.test(contextMedia?.url || "") ? contextMedia.url : "") ||
      "";
    hlsCandidates = [
      ...new Set(
        [
          hlsUrl,
          ...(matchingVideo?.hlsUrls || []),
          matchingVideo?.hlsUrl,
        ].filter(Boolean),
      ),
    ];
    if ((!url || mediaHashes.length || url.startsWith("blob:")) && !hlsUrl) {
      const alternativeUrl = await resolveAlternativePinterestVideo(
        contextMedia,
        tab,
        videos,
        operationJobId,
      );
      if (!alternativeUrl) {
        throw new Error(
          "无法从页面数据、网络记录或 CDN 地址取得可下载视频。",
        );
      }
      url = alternativeUrl;
      useHls = /\.m3u8(?:$|[?#])/i.test(alternativeUrl);
    }
    if (hlsUrl) {
      useHls = true;
      url = hlsUrl;
    } else if (!url || url.startsWith("blob:")) {
      url = contextMedia?.url || matchingVideo?.url || "";
    }
  }
  if (!url || url.startsWith("blob:")) {
    throw new Error("暂未取得这个视频的真实地址，请先播放视频后重试。");
  }
  if (kind === "video" && (useHls || /\.m3u8(?:$|[?#])/i.test(url))) {
    await assertActiveJob(operationJobId);
    const hlsJobId = operationJobId || crypto.randomUUID();
    await startHlsTask({
      jobId: hlsJobId,
      items: [{
        url,
        urls: hlsCandidates.length ? hlsCandidates : [url],
        name: mediaFilename({ url, kind }, 0),
      }],
    }, operationJobId);
    await notify("定格：HLS 下载已启动", "点击扩展图标可查看合并进度。");
    return;
  }
  const downloadUrl = kind === "image" ? pinterestOriginalUrl(url) || url : url;
  if (operationJobId) {
    await assertActiveJob(operationJobId);
    await updateActiveJob(operationJobId, {
      percent: 94,
      text: "已找到可用视频，正在交给 Chrome 下载…",
    });
  }
  const filename = mediaFilename({ url: downloadUrl, kind }, 0);
  const downloadId =
    kind === "image"
      ? await downloadImageWithPreferredFormat(downloadUrl, filename)
      : await chrome.downloads.download({
          url: downloadUrl,
          filename: await downloadPath("媒体", filename),
          saveAs: false,
        });
  if (downloadId === undefined) throw new Error("Chrome 没有创建媒体下载任务。");
  if (operationJobId) await clearActiveJob(operationJobId);
  await notify("定格：下载已开始", kind === "video" ? "视频正在下载。" : "图片正在下载。");
}

function replaceMediaExtension(filename, suffix) {
  const base = String(filename || "bilibili-video").replace(
    /\.(?:m4s|mp4|webm|mov|m4v)$/i,
    "",
  );
  return `${base}.${suffix}.m4s`;
}

async function bilibiliJson(path) {
  let lastError;
  for (const origin of [
    "https://api.bilibili.com",
    "https://www.bilibili.com",
  ]) {
    try {
      const response = await fetch(`${origin}${path}`, {
        credentials: "include",
        cache: "no-store",
        headers: { Accept: "application/json, text/plain, */*" },
      });
      if (!response.ok) {
        throw new Error(`B站接口请求失败（${response.status}）`);
      }
      const payload = await response.json();
      if (payload.code !== 0) {
        throw new Error(payload.message || `B站接口返回错误 ${payload.code}`);
      }
      return payload.data ?? payload.result;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("B站接口暂时不可用。");
}

async function readBilibiliPageIdentity(tabId) {
  if (!tabId) return {};
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: () => {
        const state = globalThis.__INITIAL_STATE__ || {};
        const playInfo = globalThis.__playinfo__ || {};
        const roots = [
          state.videoData,
          state.epInfo,
          state.mediaInfo,
          state,
          playInfo.data,
          playInfo.result,
        ].filter(Boolean);
        const first = (keys) => {
          for (const root of roots) {
            for (const key of keys) {
              if (root?.[key] !== undefined && root[key] !== null) {
                return root[key];
              }
            }
          }
          return "";
        };
        const canonical =
          document.querySelector('link[rel="canonical"]')?.href ||
          document.querySelector('meta[property="og:url"]')?.content ||
          location.href;
        const titleSelectors = [
          "h1.video-title",
          "h1[title]",
          ".video-title",
          ".bpx-player-video-title",
          ".media-title",
        ];
        const titleElement = titleSelectors
          .map((selector) => document.querySelector(selector))
          .find(Boolean);
        const currentVideoTitle = String(
          titleElement?.getAttribute("title") ||
            titleElement?.textContent ||
            document.title ||
            "",
        )
          .replace(/[_\-]\s*哔哩哔哩.*$/i, "")
          .replace(/\s+/g, " ")
          .trim();
        const hlsUrls = new Set();
        const visited = new WeakSet();
        const inspect = (value, depth = 0) => {
          if (depth > 10 || value === null || value === undefined) return;
          if (typeof value === "string") {
            const normalized = value.replace(/\\u002F/gi, "/").replace(/\\\//g, "/");
            if (/^https?:\/\/.+\.m3u8(?:$|[?#])/i.test(normalized)) {
              hlsUrls.add(normalized);
            }
            return;
          }
          if (typeof value !== "object" || visited.has(value)) return;
          visited.add(value);
          const entries = Array.isArray(value) ? value : Object.values(value);
          entries.forEach((entry) => inspect(entry, depth + 1));
        };
        inspect(playInfo);
        const rawPages =
          (Array.isArray(state.videoData?.pages) && state.videoData.pages) ||
          (Array.isArray(state.pages) && state.pages) ||
          [];
        const currentBvid =
          location.pathname.match(/\/video\/(BV[a-zA-Z0-9]+)/i)?.[1] || "";
        const playerEpisodes = [
          ...document.querySelectorAll(
            ".bpx-player-ctrl-eplist-multi-menu-item[data-cid]",
          ),
        ].map((element, index) => {
          const itemTitle = String(
            element.querySelector(
              ".bpx-player-ctrl-eplist-multi-menu-item-text",
            )?.textContent ||
              element.textContent ||
              `视频 ${index + 1}`,
          )
            .replace(/\s+/g, " ")
            .trim();
          const isCurrent =
            element.classList.contains("active") ||
            element.className.includes("current") ||
            itemTitle === currentVideoTitle;
          return {
            page: index + 1,
            cid: Number(element.dataset.cid || 0),
            bvid: isCurrent ? currentBvid : "",
            part: itemTitle,
            duration: 0,
          };
        }).filter((item) => item.cid > 0);
        if (typeof performance !== "undefined") {
          performance
            .getEntriesByType("resource")
            .map((entry) => entry.name)
            .filter((url) => /\.m3u8(?:$|[?#])/i.test(url))
            .forEach((url) => hlsUrls.add(url));
        }
        return {
          bvid: String(first(["bvid", "bVid"]) || ""),
          aid: Number(first(["aid", "avid"]) || 0),
          cid: Number(first(["cid"]) || 0),
          epId: Number(first(["ep_id", "epId", "id"]) || 0),
          title: String(first(["title", "h1Title"]) || document.title || ""),
          currentVideoTitle,
          pageUrl: location.href,
          canonical,
          hlsUrls: [...hlsUrls],
          playerEpisodes,
          pages: rawPages
            .filter((page) => Number(page?.cid) > 0)
            .map((page, index) => ({
              page: Number(page.page) || index + 1,
              cid: Number(page.cid),
              part: String(page.part || page.title || `P${index + 1}`),
              duration: Math.max(0, Number(page.duration) || 0),
            })),
        };
      },
    });
    return results?.[0]?.result || {};
  } catch {
    return {};
  }
}

async function readBilibiliPartList(pageUrl, tabId = 0) {
  const pageIdentity = tabId ? await readBilibiliPageIdentity(tabId) : {};
  const parsedPage = new URL(pageUrl);
  const bvid =
    parsedPage.pathname.match(/\/video\/(BV[a-zA-Z0-9]+)/i)?.[1] ||
    String(pageIdentity.bvid || "");
  const aid =
    Number(parsedPage.pathname.match(/\/video\/av(\d+)/i)?.[1] || 0) ||
    Number(pageIdentity.aid || 0);
  if (!bvid && !aid) {
    return { bvid: "", aid: 0, title: "", parts: [] };
  }
  const identityQuery = bvid
    ? `bvid=${encodeURIComponent(bvid)}`
    : `aid=${aid}`;
  const [pageListResult, viewResult] = await Promise.allSettled([
    bilibiliJson(`/x/player/pagelist?${identityQuery}`),
    bilibiliJson(`/x/web-interface/view?${identityQuery}`),
  ]);
  const view = viewResult.status === "fulfilled" ? viewResult.value : null;
  const seasonEpisodes = (
    Array.isArray(view?.ugc_season?.sections)
      ? view.ugc_season.sections
      : []
  ).flatMap((section) =>
    (Array.isArray(section?.episodes) ? section.episodes : []).map(
      (episode) => ({
        ...episode,
        cid: Number(episode?.cid || episode?.page?.cid || episode?.arc?.cid || 0),
        aid: Number(episode?.aid || episode?.arc?.aid || 0),
        bvid: String(episode?.bvid || episode?.arc?.bvid || ""),
        part: String(
          episode?.title ||
            episode?.arc?.title ||
            episode?.page?.part ||
            "",
        ),
        duration: Math.max(
          0,
          Number(
            episode?.duration ||
              episode?.arc?.duration ||
              episode?.page?.duration ||
              0,
          ),
        ),
      }),
    ),
  );
  const multipartPages = [
    ...(pageListResult.status === "fulfilled" &&
    Array.isArray(pageListResult.value)
      ? pageListResult.value
      : []),
    ...(Array.isArray(view?.pages) ? view.pages : []),
    ...(Array.isArray(pageIdentity.pages) ? pageIdentity.pages : []),
  ];
  const playerEpisodes = Array.isArray(pageIdentity.playerEpisodes)
    ? pageIdentity.playerEpisodes
    : [];
  const collectionEpisodes =
    seasonEpisodes.length > 1
      ? seasonEpisodes
      : playerEpisodes.length > 1
        ? playerEpisodes
        : [];
  const pageCandidates = collectionEpisodes.length > 1
    ? collectionEpisodes
    : multipartPages;
  const uniquePages = new Map();
  pageCandidates.forEach((part, index) => {
    const cid = Number(part?.cid);
    if (!cid || uniquePages.has(cid)) return;
    uniquePages.set(cid, {
      page:
        collectionEpisodes.length > 1
          ? uniquePages.size + 1
          : Number(part.page) || uniquePages.size + 1 || index + 1,
      cid,
      aid: Number(part.aid || part.arc?.aid || 0),
      bvid: String(part.bvid || part.arc?.bvid || ""),
      title: String(part.part || part.title || `P${index + 1}`).trim(),
      duration: Math.max(0, Number(part.duration) || 0),
    });
  });
  const fallbackCid = Number(pageIdentity.cid || view?.cid || 0);
  if (!uniquePages.size && fallbackCid > 0) {
    uniquePages.set(fallbackCid, {
      page: Math.max(1, Number(parsedPage.searchParams.get("p")) || 1),
      cid: fallbackCid,
      title: String(
        pageIdentity.currentVideoTitle || pageIdentity.title || "主视频",
      ).trim(),
      duration: 0,
    });
  }
  const title = String(
    view?.ugc_season?.title ||
      view?.title ||
      pageIdentity.currentVideoTitle ||
      pageIdentity.title ||
      "",
  ).trim();
  const parts = [...uniquePages.values()].sort(
    (left, right) => left.page - right.page,
  );
  return {
    bvid: String(view?.bvid || bvid || ""),
    aid: Number(view?.aid || aid || 0),
    title,
    kind:
      collectionEpisodes.length > 1
        ? "season"
        : parts.length > 1
          ? "multipart"
          : "single",
    maxSelectable: 50,
    total: parts.length,
    parts,
  };
}

async function readBilibiliPartSizes(
  pageUrl,
  tabId = 0,
  requestedSettings = {},
) {
  const partList = await readBilibiliPartList(pageUrl, tabId);
  if (!partList.parts.length) return { partList, sizes: [] };
  const savedPreferences = await chrome.storage.local.get({
    biliQuality: "80",
    biliAudioQuality: "30280",
    biliCodec: "avc",
    biliDownloadAudio: true,
  });
  const settings =
    requestedSettings && typeof requestedSettings === "object"
      ? requestedSettings
      : {};
  const preferences = {
    ...savedPreferences,
    biliQuality: String(
      settings.biliQuality || savedPreferences.biliQuality || "80",
    ),
    biliAudioQuality: String(
      settings.biliAudioQuality ||
        savedPreferences.biliAudioQuality ||
        "30280",
    ),
    biliCodec: ["avc", "hevc", "av1"].includes(settings.biliCodec)
      ? settings.biliCodec
      : savedPreferences.biliCodec,
    biliDownloadAudio:
      typeof settings.biliDownloadAudio === "boolean"
        ? settings.biliDownloadAudio
        : savedPreferences.biliDownloadAudio,
  };
  const qn = Number(preferences.biliQuality) || 80;
  const sizes = [];
  const parts = partList.parts;
  for (let offset = 0; offset < parts.length; offset += 4) {
    const batch = parts.slice(offset, offset + 4);
    const results = await Promise.all(
      batch.map(async (part) => {
        try {
          const identityQuery = part.bvid
            ? `bvid=${encodeURIComponent(part.bvid)}`
            : part.aid
              ? `aid=${part.aid}`
              : partList.bvid
                ? `bvid=${encodeURIComponent(partList.bvid)}`
                : `aid=${partList.aid}`;
          const play = await bilibiliJson(
            `/x/player/playurl?${identityQuery}&cid=${part.cid}&qn=${qn}&fnver=0&fnval=4048&fourk=1`,
          );
          const progressive = biliProgressiveStreams(play);
          if (progressive.length) {
            const exactSize = progressive.reduce(
              (total, stream) =>
                total + Math.max(0, Number(stream.size || stream.length) || 0),
              0,
            );
            if (exactSize > 0) {
              return { cid: part.cid, sizeBytes: exactSize, estimated: false };
            }
          }
          const videos = Array.isArray(play?.dash?.video)
            ? play.dash.video
            : [];
          const video = selectBiliDashVideo(
            videos,
            qn,
            preferences.biliCodec,
          );
          const regularAudio = Array.isArray(play?.dash?.audio)
            ? play.dash.audio
            : [];
          const hiresAudio = play?.dash?.flac?.audio
            ? [play.dash.flac.audio]
            : [];
          const dolbyAudio = Array.isArray(play?.dash?.dolby?.audio)
            ? play.dash.dolby.audio
            : [];
          const audioPool =
            preferences.biliAudioQuality === "hires" && hiresAudio.length
              ? hiresAudio
              : [...regularAudio, ...dolbyAudio].sort(
                  (left, right) =>
                    Number(right.bandwidth || right.id) -
                    Number(left.bandwidth || left.id),
                );
          const requestedAudio = Number(preferences.biliAudioQuality);
          const audio =
            audioPool.find((item) => Number(item.id) === requestedAudio) ||
            audioPool[0];
          const duration =
            Math.max(
              Number(part.duration) || 0,
              (Number(play?.timelength) || 0) / 1000,
            ) || 0;
          const bitrate =
            Math.max(0, Number(video?.bandwidth) || 0) +
            (preferences.biliDownloadAudio !== false
              ? Math.max(0, Number(audio?.bandwidth) || 0)
              : 0);
          return {
            cid: part.cid,
            sizeBytes:
              duration && bitrate ? Math.round((duration * bitrate) / 8) : 0,
            estimated: true,
          };
        } catch {
          return { cid: part.cid, sizeBytes: 0, estimated: true };
        }
      }),
    );
    sizes.push(...results);
  }
  return { partList, sizes };
}

async function collectBilibiliPartAttachments(resolved) {
  const attachments = [];
  if (resolved.preferences.biliDownloadCover && resolved.coverUrl) {
    attachments.push({
      name: `${resolved.baseName}.cover.jpg`,
      url: resolved.coverUrl,
    });
  }
  if (resolved.preferences.biliDownloadDanmaku) {
    attachments.push({
      name: `${resolved.baseName}.danmaku.xml`,
      url: `https://api.bilibili.com/x/v1/dm/list.so?oid=${resolved.cid}`,
    });
  }
  if (
    resolved.preferences.biliDownloadSrt ||
    resolved.preferences.biliDownloadAss
  ) {
    try {
      const player = await bilibiliJson(
        `/x/player/v2?bvid=${encodeURIComponent(resolved.bvid)}&cid=${resolved.cid}`,
      );
      const tracks = player?.subtitle?.subtitles || [];
      for (const [trackIndex, track] of tracks.entries()) {
        const subtitleUrl = String(track.subtitle_url || "").replace(
          /^\/\//,
          "https://",
        );
        if (!subtitleUrl) continue;
        const response = await fetch(subtitleUrl, { credentials: "include" });
        if (!response.ok) continue;
        const subtitle = await response.json();
        const label = sanitizeFilename(
          track.lan_doc || track.lan || `subtitle-${trackIndex + 1}`,
        );
        if (resolved.preferences.biliDownloadSrt) {
          attachments.push({
            name: `${resolved.baseName}.${label}.srt`,
            text: biliSubtitleSrt(subtitle.body),
          });
        }
        if (resolved.preferences.biliDownloadAss) {
          attachments.push({
            name: `${resolved.baseName}.${label}.ass`,
            text: biliSubtitleAss(subtitle.body),
          });
        }
      }
    } catch {
      // A missing subtitle track must not stop the selected videos.
    }
  }
  return attachments;
}

function biliStreamUrl(stream) {
  return biliStreamUrls(stream)[0] || "";
}

function biliStreamUrls(stream) {
  return [
    ...new Set(
      [
        stream?.baseUrl,
        stream?.base_url,
        stream?.url,
        ...(stream?.backupUrl || []),
        ...(stream?.backup_url || []),
      ].filter((url) => /^https?:/i.test(url || "")),
    ),
  ];
}

function collectM3u8Urls(value, result = new Set(), seen = new WeakSet(), depth = 0) {
  if (depth > 12 || value === null || value === undefined) return result;
  if (typeof value === "string") {
    const normalized = value.replace(/\\u002F/gi, "/").replace(/\\\//g, "/");
    if (/^https?:\/\/.+\.m3u8(?:$|[?#])/i.test(normalized)) {
      result.add(normalized);
    }
    return result;
  }
  if (typeof value !== "object" || seen.has(value)) return result;
  seen.add(value);
  const entries = Array.isArray(value) ? value : Object.values(value);
  entries.forEach((entry) => collectM3u8Urls(entry, result, seen, depth + 1));
  return result;
}

function biliProgressiveStreams(playData) {
  return Array.isArray(playData?.durl) ? playData.durl.filter(biliStreamUrl) : [];
}

function biliCodecMatches(stream, codec) {
  const value = String(stream?.codecs || "").toLowerCase();
  if (codec === "av1") return value.includes("av01");
  if (codec === "hevc") return value.includes("hev") || value.includes("hvc");
  return value.includes("avc");
}

const BILI_QUALITY_ORDER = [127, 126, 125, 120, 116, 112, 80, 74, 64, 32, 16, 6];

function biliQualityPosition(value) {
  const quality = Number(value);
  const position = BILI_QUALITY_ORDER.indexOf(quality);
  return position >= 0 ? position : BILI_QUALITY_ORDER.length + Math.max(0, 1000 - quality);
}

function biliCodecLabel(stream) {
  const value = String(stream?.codecs || "").toLowerCase();
  if (value.includes("av01")) return "AV1";
  if (value.includes("hev") || value.includes("hvc")) return "HEVC";
  if (value.includes("avc")) return "AVC";
  return String(stream?.codecs || "未知编码").split(".")[0].toUpperCase();
}

function biliCodecPreference(stream) {
  const value = String(stream?.codecs || "").toLowerCase();
  if (value.includes("av01")) return "av1";
  if (value.includes("hev") || value.includes("hvc")) return "hevc";
  if (value.includes("avc")) return "avc";
  return "";
}

function selectBiliDashVideo(videos, requestedQuality, requestedCodec) {
  const available = (Array.isArray(videos) ? videos : []).filter(biliStreamUrl);
  if (!available.length) return null;
  const requestedPosition = biliQualityPosition(requestedQuality);
  const byPreference = (left, right) => {
    const leftPosition = biliQualityPosition(left.id);
    const rightPosition = biliQualityPosition(right.id);
    const leftBelow = leftPosition >= requestedPosition;
    const rightBelow = rightPosition >= requestedPosition;
    if (leftBelow !== rightBelow) return leftBelow ? -1 : 1;
    const leftDistance = Math.abs(leftPosition - requestedPosition);
    const rightDistance = Math.abs(rightPosition - requestedPosition);
    if (leftDistance !== rightDistance) return leftDistance - rightDistance;
    return Number(right.bandwidth || right.codecid || 0) -
      Number(left.bandwidth || left.codecid || 0);
  };
  const exactCodec = available.filter(
    (item) =>
      Number(item.id) === Number(requestedQuality) &&
      biliCodecMatches(item, requestedCodec),
  );
  if (exactCodec.length) return exactCodec.sort(byPreference)[0];
  const exactQuality = available.filter(
    (item) => Number(item.id) === Number(requestedQuality),
  );
  if (exactQuality.length) return exactQuality.sort(byPreference)[0];
  const preferredCodec = available.filter((item) =>
    biliCodecMatches(item, requestedCodec),
  );
  return (preferredCodec.length ? preferredCodec : available).sort(byPreference)[0];
}

function biliTimestamp(seconds, ass = false) {
  const value = Math.max(0, Number(seconds) || 0);
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const secs = Math.floor(value % 60);
  const fraction = Math.floor((value % 1) * (ass ? 100 : 1000));
  return ass
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(fraction).padStart(2, "0")}`
    : `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")},${String(fraction).padStart(3, "0")}`;
}

function biliSubtitleSrt(body) {
  return (Array.isArray(body) ? body : [])
    .map(
      (line, index) =>
        `${index + 1}\n${biliTimestamp(line.from)} --> ${biliTimestamp(line.to)}\n${String(line.content || "").replace(/\n/g, " ")}\n`,
    )
    .join("\n");
}

function biliSubtitleAss(body) {
  const header = `[Script Info]\nScriptType: v4.00+\nPlayResX: 1920\nPlayResY: 1080\n\n[V4+ Styles]\nFormat: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding\nStyle: Default,Microsoft YaHei,48,&H00FFFFFF,&H000000FF,&H00000000,&H64000000,0,0,0,0,100,100,0,0,1,2,1,2,40,40,40,1\n\n[Events]\nFormat: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text\n`;
  return (
    header +
    (Array.isArray(body) ? body : [])
      .map(
        (line) =>
          `Dialogue: 0,${biliTimestamp(line.from, true)},${biliTimestamp(line.to, true)},Default,,0,0,0,,${String(line.content || "").replace(/[{}\n]/g, " ")}`,
      )
      .join("\n")
  );
}

async function downloadTextFile(text, filename, mime = "text/plain") {
  const url = `data:${mime};charset=utf-8,${encodeURIComponent(text)}`;
  return chrome.downloads.download({
    url,
    filename: await downloadPath("媒体", filename),
    saveAs: false,
  });
}

async function startMediaDownloadWithFallback(urls, filename, label = "媒体") {
  const candidates = [...new Set((urls || []).filter((url) => /^https?:/i.test(url)))];
  let lastError = null;
  for (const url of candidates) {
    try {
      const downloadId = await downloadWithForcedFilename({
        url,
        filename: await downloadPath("媒体", filename),
        saveAs: false,
      });
      if (downloadId === undefined) throw new Error("浏览器没有创建下载任务。");
      if (chrome.downloads.search) {
        await new Promise((resolve) => setTimeout(resolve, 1400));
        const [download] = await chrome.downloads.search({ id: downloadId });
        if (download?.state === "interrupted") {
          throw new Error(download.error || "CDN 中断了下载。");
        }
        if (
          !/\.txt$/i.test(filename) &&
          /\.(?:txt|html?)$/i.test(download?.filename || "")
        ) {
          try {
            await chrome.downloads.cancel?.(downloadId);
          } catch {
            // The failed text response may already have stopped.
          }
          throw new Error("CDN 返回了文本错误页，已拒绝保存并切换备用地址。");
        }
      }
      return downloadId;
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(
    `${label}的主 CDN 和备用 CDN 均下载失败：${lastError?.message || "未知错误"}`,
  );
}

async function resolveBilibiliDownload(pageUrl, pageIdentity = {}, preferHls = false) {
  const parsedPage = new URL(pageUrl);
  let bvid =
    String(pageIdentity.bvid || "") ||
    parsedPage.pathname.match(/\/video\/(BV[a-zA-Z0-9]+)/i)?.[1] ||
    "";
  let aid =
    Number(pageIdentity.aid || 0) ||
    Number(parsedPage.pathname.match(/\/video\/av(\d+)/i)?.[1] || 0);
  let cid = Number(pageIdentity.cid || 0);
  const epId =
    Number(parsedPage.pathname.match(/\/bangumi\/play\/ep(\d+)/i)?.[1] || 0) ||
    Number(pageIdentity.epId || 0);
  const seasonId = Number(
    parsedPage.pathname.match(/\/bangumi\/play\/ss(\d+)/i)?.[1] || 0,
  );
  const isPgc = Boolean(epId || seasonId || /\/bangumi\/play\//i.test(parsedPage.pathname));
  let pgcEpisode = null;
  let pgcSeason = null;
  if (!bvid && !aid && (epId || seasonId)) {
    pgcSeason = await bilibiliJson(
      epId
        ? `/pgc/view/web/season?ep_id=${epId}`
        : `/pgc/view/web/season?season_id=${seasonId}`,
    );
    const episodes = [
      ...(pgcSeason?.episodes || []),
      ...((pgcSeason?.section || []).flatMap((section) => section.episodes || [])),
    ];
    pgcEpisode =
      episodes.find((episode) => Number(episode.id) === epId) ||
      episodes.find((episode) => Number(episode.cid) === cid) ||
      episodes[0];
    bvid = String(pgcEpisode?.bvid || "");
    aid = Number(pgcEpisode?.aid || 0);
    cid = Number(pgcEpisode?.cid || cid || 0);
  }
  if (!bvid && !aid) {
    throw new Error("当前 B站页面没有读取到 BV/AV/番剧视频标识。");
  }
  let pageNumber = Math.max(1, Number(parsedPage.searchParams.get("p")) || 1);
  const identityQuery = bvid
    ? `bvid=${encodeURIComponent(bvid)}`
    : `aid=${aid}`;
  const [pages, view, preferences] = await Promise.all([
    bilibiliJson(`/x/player/pagelist?${identityQuery}`),
    bilibiliJson(`/x/web-interface/view?${identityQuery}`),
    chrome.storage.local.get({
      biliDownloadCover: false,
      biliDownloadAudio: true,
      biliDownloadDanmaku: false,
      biliDownloadSrt: false,
      biliDownloadAss: false,
      biliQuality: "80",
      biliAudioQuality: "30280",
      biliCodec: "avc",
      biliFilenameTemplate: "%title%",
    }),
  ]);
  const pageInfo =
    (cid && pages.find((page) => Number(page.cid) === cid)) ||
    pages[pageNumber - 1] ||
    pages[0] ||
    pgcEpisode;
  if (!pageInfo?.cid) throw new Error("无法取得当前分P的 CID。");
  cid = Number(pageInfo.cid);
  const resolvedPageIndex = pages.findIndex(
    (page) => Number(page.cid) === Number(pageInfo.cid),
  );
  if (resolvedPageIndex >= 0) pageNumber = resolvedPageIndex + 1;
  const qn = Number(preferences.biliQuality) || 80;
  const play = await bilibiliJson(
    `${isPgc ? "/pgc/player/web/playurl" : "/x/player/playurl"}?${identityQuery}&cid=${cid}&qn=${qn}&fnver=0&fnval=4048&fourk=1`,
  );
  const compatibilityPlays = [];
  if (preferHls || !biliProgressiveStreams(play).length) {
    const compatibilityQueries = [
      "fnver=0&fnval=0&fourk=1&platform=html5&high_quality=1",
      "fnver=0&fnval=1&fourk=1&platform=html5&high_quality=1",
      "fnver=0&fnval=16&fourk=1&platform=html5",
    ];
    for (const query of compatibilityQueries) {
      try {
        compatibilityPlays.push(
          await bilibiliJson(
            `${isPgc ? "/pgc/player/web/playurl" : "/x/player/playurl"}?${identityQuery}&cid=${cid}&qn=${qn}&${query}`,
          ),
        );
      } catch {
        // Individual compatibility modes may be unavailable by region or account.
      }
    }
  }
  const hlsUrls = [
    ...new Set([
      ...(Array.isArray(pageIdentity.hlsUrls) ? pageIdentity.hlsUrls : []),
      ...collectM3u8Urls(play),
      ...compatibilityPlays.flatMap((entry) => [...collectM3u8Urls(entry)]),
    ]),
  ].filter((url) => /^https?:/i.test(url));
  const allVideos = Array.isArray(play?.dash?.video) ? play.dash.video : [];
  const dashVideo = selectBiliDashVideo(
    allVideos,
    qn,
    preferences.biliCodec,
  );
  const progressiveVideo =
    [
      ...compatibilityPlays.flatMap(biliProgressiveStreams),
      ...biliProgressiveStreams(play),
    ].sort(
      (a, b) => Number(b.size || b.length) - Number(a.size || a.length),
    )[0] || null;
  if (!hlsUrls.length && !biliStreamUrl(dashVideo) && !biliStreamUrl(progressiveVideo)) {
    throw new Error("B站没有返回可下载的 DASH 或 MP4 视频流。");
  }

  const regularAudio = Array.isArray(play?.dash?.audio) ? play.dash.audio : [];
  const hiresAudio = play?.dash?.flac?.audio ? [play.dash.flac.audio] : [];
  const dolbyAudio = Array.isArray(play?.dash?.dolby?.audio)
    ? play.dash.dolby.audio
    : [];
  const audioPool =
    preferences.biliAudioQuality === "hires" && hiresAudio.length
      ? hiresAudio
      : [...regularAudio, ...dolbyAudio].sort(
          (a, b) => Number(b.bandwidth || b.id) - Number(a.bandwidth || a.id),
        );
  const requestedAudio = Number(preferences.biliAudioQuality);
  const audio =
    audioPool.find((item) => Number(item.id) === requestedAudio) || audioPool[0];
  const dashVideoCandidates = dashVideo ? biliStreamUrls(dashVideo) : [];
  const progressiveVideoCandidates = progressiveVideo
    ? biliStreamUrls(progressiveVideo)
    : [];
  const audioCandidates = biliStreamUrls(audio);
  const verifiedDashVideoUrl = await findFirstWorkingVideoUrl(dashVideoCandidates);
  const verifiedProgressiveVideoUrl = verifiedDashVideoUrl
    ? ""
    : await findFirstWorkingVideoUrl(progressiveVideoCandidates);
  const usingProgressive = !verifiedDashVideoUrl && Boolean(verifiedProgressiveVideoUrl);
  const video = usingProgressive ? progressiveVideo : dashVideo;
  const videoCandidates = usingProgressive
    ? progressiveVideoCandidates
    : dashVideoCandidates;
  const verifiedVideoUrl =
    verifiedDashVideoUrl ||
    verifiedProgressiveVideoUrl ||
    videoCandidates[0] ||
    "";
  const verifiedAudioUrl =
    (await findFirstWorkingVideoUrl(audioCandidates)) || audioCandidates[0] || "";
  if (!hlsUrls.length && !verifiedVideoUrl) {
    throw new Error("B站视频流的主 CDN 和备用 CDN 均不可用。");
  }
  const qualityLabel =
    play?.accept_quality?.includes(Number(video?.id || play.quality))
      ? play.accept_description?.[
          play.accept_quality.indexOf(Number(video?.id || play.quality))
        ]
      : usingProgressive
        ? String(play?.format || compatibilityPlays[0]?.format || "MP4")
        : dashVideo
          ? `${video?.id}P`
          : "HLS";
  const selectedCodec = usingProgressive ? "MP4" : biliCodecLabel(video);
  const availableQualities = [
    ...new Set([
      ...allVideos
        .filter(biliStreamUrl)
        .map((item) => Number(item.id)),
      ...(biliStreamUrl(progressiveVideo) || hlsUrls.length
        ? [Number(play?.quality)]
        : []),
    ].map(Number).filter(Boolean)),
  ].sort((left, right) => biliQualityPosition(left) - biliQualityPosition(right));
  const availableCodecs = [
    ...new Set(
      allVideos
        .filter(biliStreamUrl)
        .map(biliCodecPreference)
        .filter(Boolean),
    ),
  ];
  const availableAudioQualities = [
    ...new Set([
      ...(hiresAudio.some(biliStreamUrl) ? ["hires"] : []),
      ...[...regularAudio, ...dolbyAudio]
        .filter(biliStreamUrl)
        .map((item) => String(Number(item.id) || ""))
        .filter(Boolean),
    ]),
  ];
  const mainTitle = String(
    view?.title ||
      pageIdentity.currentVideoTitle ||
      pageIdentity.title ||
      pgcSeason?.title ||
      bvid ||
      `av${aid}`,
  ).trim();
  const partTitle = String(pageInfo?.part || "").trim();
  const episodeTitle = [
    pgcEpisode?.title,
    pgcEpisode?.long_title,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .filter((value, position, values) => values.indexOf(value) === position)
    .join(" ");
  const title = String(
    pageIdentity.titleOverride ||
    (isPgc && episodeTitle
      ? [pgcSeason?.title, episodeTitle].filter(Boolean).join(" - ")
      : pages.length > 1 && partTitle
        ? `${mainTitle} - P${pageNumber} ${partTitle}`
        : pageIdentity.currentVideoTitle || mainTitle || partTitle),
  ).trim();
  const template = String(preferences.biliFilenameTemplate || "%title%");
  const baseName = sanitizeFilename(
    template
      .replace(/%title%/g, title)
      .replace(/%bvid%/g, bvid || `av${aid}`)
      .replace(/%page%/g, String(pageNumber))
      .replace(/%quality%/g, qualityLabel || String(video?.id || "HLS")),
  ) || sanitizeFilename(title) || bvid || `av${aid}`;
  return {
    bvid,
    aid,
    cid: pageInfo.cid,
    pageNumber,
    title,
    baseName,
    qualityLabel,
    requestedQuality: qn,
    selectedQuality: Number(video?.id || play?.quality || 0),
    selectedCodec,
    availableQualities,
    availableCodecs,
    availableAudioQualities,
    hlsUrl: hlsUrls[0] || "",
    hlsUrls,
    videoUrl: verifiedVideoUrl,
    videoUrls: videoCandidates,
    audioUrl: usingProgressive ? "" : verifiedAudioUrl,
    audioUrls: usingProgressive ? [] : audioCandidates,
    videoExtension: usingProgressive ? "mp4" : "video.m4s",
    audioIncluded: usingProgressive,
    coverUrl: pgcSeason?.cover || pgcEpisode?.cover || view?.pic || "",
    preferences,
  };
}

async function downloadBilibiliFromPage(
  pageUrl,
  fallbackItem = {},
  index = 0,
  tabId = 0,
  operationJobId = "",
  requestOptions = {},
) {
  let resolved;
  try {
    const pageIdentity = await readBilibiliPageIdentity(tabId);
    if (String(requestOptions.title || "").trim()) {
      pageIdentity.currentVideoTitle = String(requestOptions.title).trim();
      pageIdentity.title = String(requestOptions.title).trim();
      pageIdentity.titleOverride = String(requestOptions.title).trim();
    }
    if (tabId) {
      const listenedHls = (await collectTabMedia(tabId))
        .flatMap((item) => [
          item.hlsUrl,
          ...(item.hlsUrls || []),
          /\.m3u8(?:$|[?#])/i.test(item.url || "") ? item.url : "",
          /\.m3u8(?:$|[?#])/i.test(item.fallbackUrl || "")
            ? item.fallbackUrl
            : "",
        ])
        .filter(Boolean);
      pageIdentity.hlsUrls = [
        ...new Set([...(pageIdentity.hlsUrls || []), ...listenedHls]),
      ];
    }
    let preferredUrl = pageUrl;
    try {
      if (
        pageIdentity.canonical &&
        /(^|\.)bilibili\.com$/i.test(
          new URL(pageIdentity.canonical).hostname,
        ) &&
        /\/(?:video|bangumi\/play)\//i.test(
          new URL(pageIdentity.canonical).pathname,
        )
      ) {
        preferredUrl = pageIdentity.canonical;
      }
    } catch {
      // Keep the current tab URL when the page exposes an invalid canonical URL.
    }
    resolved = await resolveBilibiliDownload(
      preferredUrl,
      pageIdentity,
      Boolean(operationJobId),
    );
    if (String(requestOptions.title || "").trim()) {
      resolved.title = String(requestOptions.title).trim();
      resolved.baseName =
        sanitizeFilename(requestOptions.title) ||
        resolved.baseName ||
        resolved.bvid ||
        `av${resolved.aid}`;
    }
  } catch (error) {
    try {
      const requestedName =
        sanitizeFilename(requestOptions.title) ||
        sanitizeFilename(fallbackItem?.name);
      const fallback = await downloadBilibiliDashItem(
        {
          ...fallbackItem,
          name: requestedName || fallbackItem?.name,
          audioUrl:
            requestOptions.settings?.biliDownloadAudio === false
              ? ""
              : fallbackItem?.audioUrl,
        },
        index,
      );
      return { ...fallback, fallback: true, warning: error?.message || "" };
    } catch {
      throw new Error(
        `${error?.message || "B站接口解析失败"}；同时没有监听到可备用的 DASH 视频流。`,
      );
    }
  }
  let videoId;
  let hlsStarted = false;
  let muxStarted = false;
  if (operationJobId) {
    const requested = String(resolved.requestedQuality || "");
    const selected = String(resolved.selectedQuality || "");
    const fallbackText =
      requested && selected && requested !== selected
        ? `（所选 ${requested} 不可用，已回退）`
        : "";
    await updateActiveJob(operationJobId, {
      percent: 72,
      text: `已识别 ${resolved.qualityLabel} / ${resolved.selectedCodec}${fallbackText}，正在创建下载…`,
    });
  }
  if (
    operationJobId &&
    resolved.videoUrl &&
    resolved.preferences.biliDownloadAudio &&
    resolved.audioUrl &&
    !resolved.audioIncluded
  ) {
    await assertActiveJob(operationJobId);
    await startDashMuxTask({
      jobId: operationJobId,
      videoUrls: [resolved.videoUrl, ...(resolved.videoUrls || [])],
      audioUrls: [resolved.audioUrl, ...(resolved.audioUrls || [])],
      filename: `${resolved.baseName}.mp4`,
    }, operationJobId);
    muxStarted = true;
  } else if (operationJobId && !resolved.videoUrl && resolved.hlsUrl) {
    await assertActiveJob(operationJobId);
    await startHlsTask({
      jobId: operationJobId,
      items: [{
        url: resolved.hlsUrl,
        urls: resolved.hlsUrls,
        name: `${resolved.baseName}.mp4`,
      }],
    }, operationJobId);
    hlsStarted = true;
  } else {
    videoId = await startMediaDownloadWithFallback(
      [resolved.videoUrl, ...(resolved.videoUrls || [])],
      `${resolved.baseName}.${resolved.videoExtension}`,
      "B站视频",
    );
  }
  let audioId;
  if (
    !hlsStarted &&
    !muxStarted &&
    resolved.preferences.biliDownloadAudio &&
    resolved.audioUrl
  ) {
    audioId = await startMediaDownloadWithFallback(
      [resolved.audioUrl, ...(resolved.audioUrls || [])],
      `${resolved.baseName}.audio.m4s`,
      "B站音频",
    );
  }
  if (resolved.preferences.biliDownloadCover && resolved.coverUrl) {
    await chrome.downloads.download({
      url: resolved.coverUrl,
      filename: await downloadPath("媒体", `${resolved.baseName}.cover.jpg`),
      saveAs: false,
    });
  }
  if (resolved.preferences.biliDownloadDanmaku) {
    const response = await fetch(
      `https://api.bilibili.com/x/v1/dm/list.so?oid=${resolved.cid}`,
      { credentials: "include", cache: "no-store" },
    );
    if (response.ok) {
      await downloadTextFile(
        await response.text(),
        `${resolved.baseName}.danmaku.xml`,
        "application/xml",
      );
    }
  }
  if (resolved.preferences.biliDownloadSrt || resolved.preferences.biliDownloadAss) {
    const player = await bilibiliJson(
      `/x/player/v2?bvid=${encodeURIComponent(resolved.bvid)}&cid=${resolved.cid}`,
    );
    const tracks = player?.subtitle?.subtitles || [];
    for (const [trackIndex, track] of tracks.entries()) {
      const subtitleUrl = String(track.subtitle_url || "").replace(/^\/\//, "https://");
      if (!subtitleUrl) continue;
      const response = await fetch(subtitleUrl, { credentials: "include" });
      if (!response.ok) continue;
      const subtitle = await response.json();
      const label = sanitizeFilename(track.lan_doc || track.lan || `subtitle-${trackIndex + 1}`);
      if (resolved.preferences.biliDownloadSrt) {
        await downloadTextFile(
          biliSubtitleSrt(subtitle.body),
          `${resolved.baseName}.${label}.srt`,
        );
      }
      if (resolved.preferences.biliDownloadAss) {
        await downloadTextFile(
          biliSubtitleAss(subtitle.body),
          `${resolved.baseName}.${label}.ass`,
        );
      }
    }
  }
  return {
    videoDownloaded: videoId !== undefined,
    audioDownloaded: audioId !== undefined,
    audioIncluded: resolved.audioIncluded,
    qualityLabel: resolved.qualityLabel,
    selectedCodec: resolved.selectedCodec,
    requestedQuality: resolved.requestedQuality,
    selectedQuality: resolved.selectedQuality,
    fallback: false,
    hlsStarted,
    muxStarted,
  };
}

async function downloadBilibiliContextVideo(tab, jobId, requestOptions = {}) {
  const hostname = new URL(tab.url).hostname;
  if (!/(^|\.)bilibili\.com$/i.test(hostname)) {
    throw new Error("“下载 B站视频”只能在 bilibili.com 页面使用。");
  }
  await updateActiveJob(jobId, {
    percent: 12,
    text: "正在读取 B站页面的 BV、CID 和番剧信息…",
  });
  const videos = (await collectTabMedia(tab.id)).filter(
    (item) => item.kind === "video",
  );
  const dashItem = videos.find(
    (item) => item.streamType === "dash-video" && /^https?:/i.test(item.url),
  ) || {};
  const contextMedia = contextMediaByTab.get(tab.id) || {};
  const pageUrl =
    /^https?:\/\/[^/]*bilibili\.com\//i.test(requestOptions.pageUrl || "")
      ? requestOptions.pageUrl
      : /^https?:\/\/[^/]*bilibili\.com\//i.test(contextMedia.bilibiliUrl || "")
      ? contextMedia.bilibiliUrl
      : tab.url;
  await updateActiveJob(jobId, {
    percent: 48,
    text: "正在探测 B站 HLS、HTML5 MP4 和 DASH 播放流…",
  });
  const result = await downloadBilibiliFromPage(
    pageUrl,
    dashItem,
    0,
    tab.id,
    jobId,
    requestOptions,
  );
  if (result.hlsStarted) {
    await notify(
      "定格：B站 HLS 下载已启动",
      "正在读取 m3u8 并合并视频分片，可在插件面板查看实时进度。",
    );
    return;
  }
  if (result.muxStarted) {
    await notify(
      "定格：B站无损合并已启动",
      `${result.qualityLabel || "高画质"} / ${result.selectedCodec || "原始编码"}：正在后台合并视频与音频，可在插件面板查看进度。`,
    );
    return;
  }
  await updateActiveJob(jobId, {
    percent: 94,
    text: `已取得 ${result.qualityLabel || "B站"} / ${result.selectedCodec || "视频"} 媒体流，正在创建下载…`,
  });
  await clearActiveJob(jobId);
  await notify(
    "定格：B站下载已开始",
    `${result.qualityLabel || "已选画质"} / ${result.selectedCodec || "原始编码"}：${
      result.audioIncluded
        ? "已创建包含声音的 MP4 视频下载。"
        : result.audioDownloaded
        ? "已分别创建视频流和音频流下载。"
        : "已创建视频流下载；当前页面没有取得音频流。"
    }`,
  );
}

async function packageBilibiliParts(tab, jobId, requestOptions = {}) {
  const pageUrl = String(requestOptions.pageUrl || tab.url || "");
  const partList = await readBilibiliPartList(pageUrl, tab.id);
  if (partList.parts.length < 2) {
    throw new Error("当前视频没有可打包的分P列表。");
  }
  const requestedCids = new Set(
    (Array.isArray(requestOptions.partCids) ? requestOptions.partCids : [])
      .map(Number)
      .filter((cid) => cid > 0),
  );
  const selectedParts = partList.parts.filter(
    (part) => !requestedCids.size || requestedCids.has(part.cid),
  );
  if (!selectedParts.length) throw new Error("请至少选择一个分P视频。");
  if (selectedParts.length > 50) {
    throw new Error("一次最多打包 50 个分P，请减少选择后重试。");
  }

  const resolvedItems = [];
  const attachments = [];
  const resolutionFailures = [];
  for (const [index, part] of selectedParts.entries()) {
    await assertActiveJob(jobId);
    await updateActiveJob(jobId, {
      percent: 8 + Math.round((index / selectedParts.length) * 26),
      text: `正在解析分P ${index + 1}/${selectedParts.length}：P${part.page} ${part.title}`,
    });
    try {
      const resolved = await resolveBilibiliDownload(
        pageUrl,
        {
          bvid: part.bvid || partList.bvid,
          aid: part.aid || partList.aid,
          cid: part.cid,
          currentVideoTitle: part.title || partList.title,
        },
        false,
      );
      resolvedItems.push({
        name: `${resolved.baseName}.mp4`,
        videoUrls: [resolved.videoUrl, ...(resolved.videoUrls || [])].filter(Boolean),
        audioUrls:
          resolved.preferences.biliDownloadAudio && !resolved.audioIncluded
            ? [resolved.audioUrl, ...(resolved.audioUrls || [])].filter(Boolean)
            : [],
        hlsUrls: [resolved.hlsUrl, ...(resolved.hlsUrls || [])].filter(Boolean),
        needsMux: resolved.videoExtension !== "mp4",
        page: part.page,
        title: resolved.title,
      });
      attachments.push(...(await collectBilibiliPartAttachments(resolved)));
    } catch (error) {
      resolutionFailures.push(
        `P${part.page} ${part.title}：${error?.message || "解析失败"}`,
      );
    }
  }
  if (!resolvedItems.length) {
    throw new Error(
      `所选分P均未返回当前账号可播放的视频流。${
        resolutionFailures.length ? ` ${resolutionFailures.slice(0, 3).join("；")}` : ""
      }`,
    );
  }
  await startBilibiliPartsZipTask(
    {
      jobId,
      items: resolvedItems,
      attachments,
      selectedCount: selectedParts.length,
      resolutionFailures,
    },
    jobId,
  );
  return {
    selectedCount: selectedParts.length,
    resolvedCount: resolvedItems.length,
  };
}

async function downloadBilibiliDashItem(item, index = 0) {
  const videoUrl = String(item?.url || "");
  const audioUrl = String(item?.audioUrl || "");
  if (!/^https?:/i.test(videoUrl)) {
    throw new Error("尚未读取到 B站 DASH 视频流，请先播放视频几秒。");
  }
  const baseName =
    sanitizeFilename(item?.name) ||
    mediaFilename({ url: videoUrl, kind: "video", alt: "bilibili-video" }, index);
  const videoId = await downloadWithForcedFilename({
    url: videoUrl,
    filename: await downloadPath("媒体", replaceMediaExtension(baseName, "video")),
    saveAs: false,
  });
  let audioId;
  if (/^https?:/i.test(audioUrl)) {
    audioId = await downloadWithForcedFilename({
      url: audioUrl,
      filename: await downloadPath("媒体", replaceMediaExtension(baseName, "audio")),
      saveAs: false,
    });
  }
  return {
    videoDownloaded: videoId !== undefined,
    audioDownloaded: audioId !== undefined,
  };
}

async function downloadGalleryMedia(message) {
  const items = (Array.isArray(message.items) ? message.items : []).slice(0, 500);
  if (!items.length) throw new Error("请先选择要下载的媒体。");
  const hlsItems = [];
  let directCount = 0;
  for (const [index, item] of items.entries()) {
    const kind = item?.kind === "video" ? "video" : "image";
    let url = String(item?.url || "");
    const fallbackUrl = String(item?.fallbackUrl || "");
    if (!url || url.startsWith("blob:")) url = fallbackUrl;
    const isHls =
      item?.streamType === "hls" || /\.m3u8(?:$|[?#])/i.test(url);
    const name =
      sanitizeFilename(item?.name) || mediaFilename({ url, kind }, index);
    if (kind === "video" && item?.streamType === "dash-video") {
      const isBilibiliPage = /(^|\.)bilibili\.com$/i.test(
        new URL(message.pageUrl || "https://invalid.local").hostname,
      );
      const dashResult = isBilibiliPage
        ? await downloadBilibiliFromPage(
            message.pageUrl,
            { ...item, url, name },
            index,
            message.tabId,
          )
        : await downloadBilibiliDashItem({ ...item, url, name }, index);
      directCount +=
        Number(dashResult.videoDownloaded) + Number(dashResult.audioDownloaded);
      continue;
    }
    if (kind === "video" && isHls) {
      hlsItems.push({
        url,
        urls: [...new Set([url, fallbackUrl].filter(Boolean))],
        name,
      });
      continue;
    }
    if (!/^https?:|^data:/i.test(url)) continue;
    const downloadUrl = kind === "image" ? pinterestOriginalUrl(url) || url : url;
    const downloadId =
      kind === "image"
        ? await downloadImageWithPreferredFormat(downloadUrl, name)
        : await chrome.downloads.download({
        url: downloadUrl,
        filename: await downloadPath("媒体", name),
        saveAs: false,
          });
    if (downloadId !== undefined) directCount += 1;
  }
  if (hlsItems.length) {
    await startHlsTask({
      jobId: message.jobId || crypto.randomUUID(),
      items: hlsItems,
    });
  }
  if (!directCount && !hlsItems.length) {
    throw new Error("所选媒体暂时没有可用的下载地址。");
  }
  await notify(
    "定格：画廊下载已启动",
    hlsItems.length
      ? `${directCount} 项直接下载，${hlsItems.length} 个视频正在后台合并。`
      : `${directCount} 项媒体已开始下载。`,
  );
  return { directCount, hlsCount: hlsItems.length };
}

async function captureContextScreenshot(tab) {
  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
    format: "png",
  });
  const host = sanitizeFilename(new URL(tab.url).hostname) || "website";
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  await chrome.downloads.download({
    url: dataUrl,
    filename: await downloadPath("截图", `${host}-${stamp}.png`),
    saveAs: false,
  });
}

async function openPopupWindow(tab) {
  if (chrome.windows?.create) {
    await chrome.windows.create({
      url: chrome.runtime.getURL("popup.html?surface=window"),
      type: "popup",
      width: 500,
      height: 760,
    });
    return;
  }
  if (typeof chrome.action.openPopup === "function") {
    await chrome.action.openPopup({ windowId: tab.windowId });
    return;
  }
  throw new Error("当前浏览器不支持打开功能窗口。");
}

async function openGalleryForTab(tab) {
  const { previewLayout = "square" } =
    await chrome.storage.local.get("previewLayout");
  const response = await chrome.tabs.sendMessage(tab.id, {
    type: "DINGGE_OPEN_MEDIA_GALLERY",
    layout: previewLayout === "waterfall" ? "waterfall" : "square",
  });
  if (!response?.shown) {
    throw new Error("当前网页还没有发现可浏览的图片或视频。");
  }
}

function createContextMenus() {
  void StillFrameI18n.ready.then(() => chrome.contextMenus.removeAll(() => {
    const t = StillFrameI18n.t;
    chrome.contextMenus.create({
      id: "dingge-root",
      title: t("定格 StillFrame"),
      contexts: ["all"],
    });
    chrome.contextMenus.create({
      id: "dingge-download-image",
      parentId: "dingge-root",
      title: t("下载这张图片"),
      contexts: ["image"],
    });
    chrome.contextMenus.create({
      id: "dingge-download-pinterest-video",
      parentId: "dingge-root",
      title: t("下载 Pinterest 视频"),
      contexts: ["video"],
      documentUrlPatterns: [
        "*://*.pinterest.com/*",
        "*://pinterest.com/*",
        "*://*.pinterest.cn/*",
        "*://pinterest.cn/*",
        "*://*.pinterest.de/*",
        "*://*.pinterest.fr/*",
        "*://*.pinterest.co.uk/*",
        "*://*.pinterest.jp/*",
      ],
    });
    chrome.contextMenus.create({
      id: "dingge-download-bilibili-video",
      parentId: "dingge-root",
      title: t("下载 B站视频"),
      contexts: ["page", "video", "link"],
      documentUrlPatterns: [
        "*://*.bilibili.com/*",
        "*://bilibili.com/*",
      ],
    });
    chrome.contextMenus.create({
      id: "dingge-download-video",
      parentId: "dingge-root",
      title: t("下载这个视频（其它网站）"),
      contexts: ["video"],
    });
    chrome.contextMenus.create({
      id: "dingge-pack-images",
      parentId: "dingge-root",
      title: t("打包本页全部图片"),
      contexts: ["page", "image", "video", "link"],
    });
    chrome.contextMenus.create({
      id: "dingge-pack-videos",
      parentId: "dingge-root",
      title: t("打包本页全部视频"),
      contexts: ["page", "image", "video", "link"],
    });
    chrome.contextMenus.create({
      id: "dingge-pack-all",
      parentId: "dingge-root",
      title: t("打包本页全部媒体"),
      contexts: ["page", "image", "video", "link"],
    });
    chrome.contextMenus.create({
      id: "dingge-visible-screenshot",
      parentId: "dingge-root",
      title: t("保存当前可见区域截图"),
      contexts: ["page", "image", "video", "link"],
    });
    chrome.contextMenus.create({
      id: "dingge-full-screenshot-panel",
      parentId: "dingge-root",
      title: t("打开完整页面截图面板"),
      contexts: ["page", "image", "video", "link"],
    });
    chrome.contextMenus.create({
      id: MENU_OPEN_PANEL,
      parentId: "dingge-root",
      title: t("浏览媒体"),
      contexts: ["all"],
    });
    getActiveJob().then(updateJobSurfaces).catch(() => {});
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab] = []) => {
      void chrome.runtime.lastError;
      updateSiteVideoMenus(tab?.url || "");
    });
  }));
}

chrome.runtime.onInstalled.addListener(createContextMenus);
chrome.runtime.onStartup.addListener(createContextMenus);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.uiLanguage) createContextMenus();
  if (area === "local" && changes.liveScan) {
    liveScanEnabled = changes.liveScan.newValue !== false;
    liveScanSettingLoaded = true;
  }
});

function updateSiteVideoMenus(rawUrl) {
  let hostname = "";
  try {
    hostname = new URL(rawUrl || "").hostname;
  } catch {
    // Leave site-specific entries hidden for invalid page URLs.
  }
  const isBilibili = /(^|\.)bilibili\.com$/i.test(hostname);
  const isPinterest = isPinterestHostname(hostname);
  const excludesVideoDownload = isVideoDownloadExcludedPage(rawUrl);
  const updates = [
    ["dingge-download-bilibili-video", isBilibili],
    ["dingge-download-pinterest-video", isPinterest],
    [
      "dingge-download-video",
      !isBilibili && !isPinterest && !excludesVideoDownload,
    ],
    ["dingge-pack-videos", !excludesVideoDownload],
  ];
  let remaining = updates.length;
  updates.forEach(([id, visible]) => {
    chrome.contextMenus.update(id, { visible }, () => {
      void chrome.runtime.lastError;
      remaining -= 1;
      if (!remaining && chrome.contextMenus.refresh) {
        chrome.contextMenus.refresh();
      }
    });
  });
}

if (chrome.contextMenus.onShown?.addListener) {
  chrome.contextMenus.onShown.addListener((info, tab) => {
    updateSiteVideoMenus(info.pageUrl || tab?.url || "");
  });
}

if (chrome.tabs.onActivated?.addListener) {
  chrome.tabs.onActivated.addListener(({ tabId }) => {
    chrome.tabs.get(tabId, (tab) => {
      void chrome.runtime.lastError;
      updateSiteVideoMenus(tab?.url || "");
    });
  });
}

if (chrome.tabs.onUpdated?.addListener) {
  chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
    if (tab?.active && (changeInfo.url || changeInfo.status === "complete")) {
      updateSiteVideoMenus(changeInfo.url || tab.url || "");
    }
  });
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab?.id) return;
  (async () => {
    switch (info.menuItemId) {
      case "dingge-download-image":
        await downloadContextMedia(info, tab);
        break;
      case "dingge-download-bilibili-video": {
        const settings = await chrome.storage.local.get({
          biliQuality: "80",
          biliAudioQuality: "30280",
          biliCodec: "avc",
          biliDownloadAudio: true,
          biliDownloadSrt: true,
          biliDownloadAss: false,
          biliDownloadCover: false,
          biliDownloadDanmaku: false,
          biliDialogPreferencesSaved: false,
        });
        const response = await chrome.tabs.sendMessage(tab.id, {
          type: "DINGGE_SHOW_BILIBILI_DOWNLOAD_DIALOG",
          settings,
        });
        if (!response?.shown) {
          throw new Error("无法在当前 B站页面显示下载设置弹窗。");
        }
        break;
      }
      case "dingge-download-pinterest-video":
      case "dingge-download-video": {
        const jobId = crypto.randomUUID();
        await startVideoResolveTask(jobId);
        await notify(
          "定格：正在加载视频",
          "已开始识别和探测视频地址；点击扩展图标可查看实时进度。",
        );
        try {
          await downloadContextMedia(info, tab, jobId);
        } catch (error) {
          await clearActiveJob(jobId);
          throw error;
        }
        break;
      }
      case "dingge-pack-images":
        await startContextPack(tab, "image");
        break;
      case "dingge-pack-videos":
        await startContextPack(tab, "video");
        break;
      case "dingge-pack-all":
        await startContextPack(tab, "all");
        break;
      case "dingge-visible-screenshot":
        await captureContextScreenshot(tab);
        await notify("定格：截图已保存", "可见区域截图已开始下载。");
        break;
      case "dingge-full-screenshot-panel":
        await chrome.storage.local.set({ feature: "screenshot", mode: "full" });
        await openPopupWindow(tab);
        break;
      case MENU_OPEN_PANEL:
        await openGalleryForTab(tab);
        break;
      default:
        return;
    }
  })().catch((error) => {
    notify("定格：操作失败", error?.message || "请刷新页面后重试。");
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.target !== "background") return;

  if (message.type === "DINGGE_GET_BILIBILI_PARTS") {
    (async () => {
      const tabId = Number(sender.tab?.id || message.tabId || 0);
      const tab = sender.tab || (tabId ? await chrome.tabs.get(tabId) : null);
      const pageUrl = String(message.pageUrl || tab?.url || "");
      if (!tabId || !/(^|\.)bilibili\.com$/i.test(new URL(pageUrl).hostname)) {
        throw new Error("当前标签页不是 B站视频页面。");
      }
      const partList = await readBilibiliPartList(pageUrl, tabId);
      sendResponse({ ok: true, partList });
    })().catch((error) => {
      sendResponse({
        ok: false,
        error: error?.message || "无法读取 B站分P列表。",
        partList: { parts: [] },
      });
    });
    return true;
  }

  if (message.type === "DINGGE_GET_BILIBILI_PART_SIZES") {
    (async () => {
      const tabId = Number(sender.tab?.id || message.tabId || 0);
      const tab = sender.tab || (tabId ? await chrome.tabs.get(tabId) : null);
      const pageUrl = String(message.pageUrl || tab?.url || "");
      if (!tabId || !/(^|\.)bilibili\.com$/i.test(new URL(pageUrl).hostname)) {
        throw new Error("当前标签页不是 B站视频页面。");
      }
      const result = await readBilibiliPartSizes(
        pageUrl,
        tabId,
        message.settings,
      );
      sendResponse({ ok: true, ...result });
    })().catch((error) => {
      sendResponse({
        ok: false,
        error: error?.message || "无法读取 B站视频大小。",
        sizes: [],
      });
    });
    return true;
  }

  if (message.type === "DINGGE_GET_BILIBILI_QUALITIES") {
    (async () => {
      const tabId = Number(sender.tab?.id || message.tabId || 0);
      const tab = sender.tab || (tabId ? await chrome.tabs.get(tabId) : null);
      const pageUrl = String(message.pageUrl || tab?.url || "");
      if (!tabId || !/(^|\.)bilibili\.com$/i.test(new URL(pageUrl).hostname)) {
        throw new Error("当前标签页不是 B站视频页面。");
      }
      const pageIdentity = await readBilibiliPageIdentity(tabId);
      const partList = await readBilibiliPartList(
        pageUrl,
        tabId,
      ).catch(() => ({ parts: [] }));
      let resolved;
      try {
        resolved = await resolveBilibiliDownload(
          pageUrl,
          pageIdentity,
          false,
        );
      } catch (error) {
        sendResponse({
          ok: false,
          error: error?.message || "清晰度识别失败。",
          partList,
        });
        return;
      }
      sendResponse({
        ok: true,
        availableQualities: resolved.availableQualities,
        availableCodecs: resolved.availableCodecs,
        availableAudioQualities: resolved.availableAudioQualities,
        selectedQuality: resolved.selectedQuality,
        selectedCodec: resolved.selectedCodec,
        partList,
      });
    })().catch((error) => {
      sendResponse({ ok: false, error: error?.message || "清晰度识别失败。" });
    });
    return true;
  }

  if (message.type === "DINGGE_CONTEXT_MEDIA" && sender.tab?.id) {
    const media = { ...(message.media || {}) };
    delete media.csrfToken;
    delete media.csrftoken;
    delete media.cookie;
    contextMediaByTab.set(sender.tab.id, media);
    sendResponse({ stored: true });
    return;
  }

  if (message.type === "DINGGE_START_BILIBILI_DOWNLOAD") {
    (async () => {
      const tabId = Number(sender.tab?.id || message.tabId || 0);
      const targetTab =
        sender.tab || (tabId ? await chrome.tabs.get(tabId) : null);
      if (!targetTab?.id) throw new Error("无法取得当前 B站标签页。");
      const hostname = new URL(targetTab.url || message.pageUrl).hostname;
      if (!/(^|\.)bilibili\.com$/i.test(hostname)) {
        throw new Error("当前页面不是 B站视频页面。");
      }
      const allowedSettings = {
        biliQuality: String(message.settings?.biliQuality || "80"),
        biliAudioQuality: String(
          message.settings?.biliAudioQuality || "30280",
        ),
        biliCodec: String(message.settings?.biliCodec || "avc"),
        biliDownloadAudio: message.settings?.biliDownloadAudio !== false,
        biliDownloadSrt: message.settings?.biliDownloadSrt === true,
        biliDownloadAss: message.settings?.biliDownloadAss === true,
        biliDownloadCover: message.settings?.biliDownloadCover === true,
        biliDownloadDanmaku:
          message.settings?.biliDownloadDanmaku === true,
        biliDialogPreferencesSaved: true,
      };
      const jobId = crypto.randomUUID();
      await startVideoResolveTask(jobId);
      await chrome.storage.local.set(allowedSettings);
      sendResponse({ started: true, jobId });
      await notify(
        "定格：正在解析 B站视频",
        `正在读取“${String(message.title || "当前视频").slice(0, 80)}”的播放信息。`,
      );
      try {
        const requestOptions = {
          title: String(message.title || "").trim(),
          pageUrl: String(message.pageUrl || targetTab.url || ""),
          settings: allowedSettings,
          partCids: (Array.isArray(message.partCids) ? message.partCids : [])
            .map(Number)
            .filter((cid) => cid > 0),
        };
        if (message.packageParts === true) {
          await packageBilibiliParts(targetTab, jobId, requestOptions);
        } else {
          await downloadBilibiliContextVideo(targetTab, jobId, requestOptions);
        }
      } catch (error) {
        await clearActiveJob(jobId);
        await notify(
          "定格：B站下载失败",
          error?.message || "无法解析当前 B站视频。",
        );
      }
    })().catch((error) => {
      sendResponse({
        started: false,
        error: error?.message || "无法启动 B站下载。",
      });
    });
    return true;
  }

  if (message.type === "DINGGE_GET_JOB_STATUS") {
    if (message.subscribe && Number.isInteger(sender.tab?.id)) {
      jobStatusTabIds.add(sender.tab.id);
    }
    getActiveJob()
      .then((job) => sendResponse({ job }))
      .catch(() => sendResponse({ job: null }));
    return true;
  }

  if (message.type === "DINGGE_UNSUBSCRIBE_JOB_STATUS") {
    if (Number.isInteger(sender.tab?.id)) {
      jobStatusTabIds.delete(sender.tab.id);
    }
    sendResponse({ unsubscribed: true });
    return;
  }

  if (message.type === "DINGGE_CANCEL_JOB") {
    (async () => {
      const current = await getActiveJob();
      if (!current) {
        sendResponse({ canceled: false, error: "当前没有运行中的任务。" });
        return;
      }
      if (message.jobId && current.jobId !== message.jobId) {
        sendResponse({
          canceled: false,
          error: "该打包任务已经结束或已被其他任务替换。",
        });
        return;
      }
      if (current.type === "resolve-video") {
        await clearActiveJob(current.jobId, "canceled");
        sendResponse({ canceled: true });
        return;
      }
      await ensureOffscreenDocument();
      canceledJobIds.add(current.jobId);
      const cancelResponse = await chrome.runtime.sendMessage({
        type: "DINGGE_CANCEL_OFFSCREEN_JOB",
        target: "offscreen",
        jobId: current.jobId,
      });
      if (!cancelResponse?.canceled) {
        canceledJobIds.delete(current.jobId);
        throw new Error("后台任务已结束或无法取消，请重新打开扩展确认状态。");
      }
      await clearActiveJob(current.jobId, "canceled");
      sendResponse({ canceled: true });
    })().catch((error) => {
      sendResponse({
        canceled: false,
        error: error?.message || "无法取消后台任务。",
      });
    });
    return true;
  }

  if (
    message.type === "DINGGE_ZIP_PROGRESS" ||
    message.type === "DINGGE_HLS_PROGRESS" ||
    message.type === "DINGGE_DASH_MUX_PROGRESS" ||
    message.type === "DINGGE_BILIBILI_PARTS_ZIP_PROGRESS"
  ) {
    updateActiveJob(message.jobId, {
      percent: message.percent || 0,
      text: message.text || "后台正在处理媒体…",
    }).catch(() => {});
    return;
  }

  if (message.type === "DINGGE_GET_NETWORK_MEDIA") {
    getNetworkMedia(message.tabId)
      .then((items) => sendResponse({ items }))
      .catch(() => sendResponse({ items: [] }));
    return true;
  }

  if (message.type === "DINGGE_GET_MEDIA_FILE_SIZE") {
    readMediaFileSize(message.url)
      .then((size) => sendResponse({ size }))
      .catch(() => sendResponse({ size: 0 }));
    return true;
  }

  if (message.type === "DINGGE_DOWNLOAD_IMAGE") {
    const url = String(message.url || "");
    if (!/^https?:|^data:image\//i.test(url)) {
      sendResponse({ started: false, error: "图片地址无效。" });
      return;
    }
    const filename =
      sanitizeFilename(message.filename) ||
      mediaFilename({ url, kind: "image" }, 0);
    downloadImageWithPreferredFormat(url, filename)
      .then((downloadId) =>
        sendResponse({ started: downloadId !== undefined, downloadId }),
      )
      .catch((error) =>
        sendResponse({
          started: false,
          error: error?.message || "无法创建图片下载。",
        }),
      );
    return true;
  }

  if (message.type === "DINGGE_CLEAR_NETWORK_MEDIA") {
    clearNetworkMedia(message.tabId || sender.tab?.id)
      .then(() => sendResponse({ cleared: true }))
      .catch(() => sendResponse({ cleared: false }));
    return true;
  }

  if (message.type === "DINGGE_GALLERY_DOWNLOAD") {
    downloadGalleryMedia({
      ...message,
      pageUrl: message.pageUrl || sender.tab?.url || "",
      tabId: message.tabId || sender.tab?.id,
    })
      .then(({ directCount, hlsCount }) =>
        sendResponse({
          started: true,
          background: hlsCount > 0,
          directCount,
          hlsCount,
        }),
      )
      .catch((error) =>
        sendResponse({
          started: false,
          error: error?.message || "无法启动画廊下载任务。",
        }),
      );
    return true;
  }

  if (message.type === "DINGGE_BILIBILI_DASH_DOWNLOAD") {
    (async () => {
      const items = (Array.isArray(message.items) ? message.items : []).slice(0, 50);
      if (!items.length) throw new Error("没有可下载的 B站视频流。");
      let videoCount = 0;
      let audioCount = 0;
      for (const [index, item] of items.entries()) {
        const result = /(^|\.)bilibili\.com$/i.test(
          new URL(message.pageUrl || "https://invalid.local").hostname,
        )
          ? await downloadBilibiliFromPage(
              message.pageUrl,
              item,
              index,
              message.tabId || sender.tab?.id,
            )
          : await downloadBilibiliDashItem(item, index);
        videoCount += Number(result.videoDownloaded);
        audioCount += Number(result.audioDownloaded);
      }
      await notify(
        "定格：B站下载已开始",
        audioCount
          ? `已创建 ${videoCount} 个视频流和 ${audioCount} 个音频流下载。`
          : `已创建 ${videoCount} 个视频流下载；尚未捕获音频流。`,
      );
      sendResponse({ started: true, videoCount, audioCount });
    })().catch((error) =>
      sendResponse({
        started: false,
        error: error?.message || "B站视频下载启动失败。",
      }),
    );
    return true;
  }

  if (message.type === "DINGGE_START_ZIP") {
    (async () => {
      try {
        await startZipTask(message);
        sendResponse({ started: true, jobId: message.jobId });
      } catch (error) {
        sendResponse({
          started: false,
          error: error?.message || "无法启动后台打包任务。",
        });
      }
    })();
    return true;
  }

  if (message.type === "DINGGE_START_HLS_DOWNLOAD") {
    (async () => {
      try {
        await startHlsTask(message);
        sendResponse({ started: true });
      } catch (error) {
        sendResponse({
          started: false,
          error: error?.message || "无法启动 HLS 后台下载。",
        });
      }
    })();
    return true;
  }

  if (message.type === "DINGGE_ZIP_READY") {
    sendResponse({ received: true });
    (async () => {
      try {
        await updateActiveJob(message.jobId, {
          percent: 96,
          text: "ZIP 已生成，正在交给 Chrome 下载…",
        });
        const current = await getActiveJob();
        const archiveName =
          current?.jobId === message.jobId &&
          /^STILLFRAME-\d+\.zip$/i.test(current.outputFilename || "")
            ? current.outputFilename
            : `STILLFRAME-${String(Date.now()).slice(-6)}.zip`;
        await downloadWithForcedFilename({
          url: message.objectUrl,
          filename: await downloadPath("媒体", archiveName),
          saveAs: false,
        });
        await notify(
          "定格：媒体打包完成",
          `${message.successCount} 项媒体已生成 ZIP，并开始下载。`,
        );
        chrome.runtime
          .sendMessage({
            type: "DINGGE_ZIP_DOWNLOAD_STARTED",
            jobId: message.jobId,
            successCount: message.successCount,
            failedCount: message.failedCount,
          })
          .catch(() => {});
        await clearActiveJob(message.jobId);
      } catch (error) {
        await clearActiveJob(message.jobId);
        await notify("定格：ZIP 下载失败", error?.message || "请重新尝试打包。");
        chrome.runtime
          .sendMessage({
            type: "DINGGE_ZIP_ERROR",
            jobId: message.jobId,
            error: error?.message || "ZIP 下载失败。",
          })
          .catch(() => {});
      }
    })();
    return;
  }

  if (message.type === "DINGGE_ZIP_FAILED") {
    clearActiveJob(message.jobId).catch(() => {});
    if (canceledJobIds.delete(message.jobId)) return;
    notify("定格：媒体打包失败", message.error || "请重新尝试打包。");
  }

  if (message.type === "DINGGE_DASH_MUX_READY") {
    (async () => {
      try {
        const current = await getActiveJob();
        const filename =
          current?.jobId === message.jobId && current.outputFilename
            ? current.outputFilename
            : message.filename || "bilibili-video.mp4";
        await updateActiveJob(message.jobId, {
          percent: 96,
          text: "视频与音频已合并，正在创建 MP4 下载…",
        });
        const downloadId = await downloadWithForcedFilename({
          url: message.objectUrl,
          filename: await downloadPath("媒体", filename),
          saveAs: false,
        });
        if (downloadId === undefined) {
          throw new Error("Chrome 没有创建合并后的视频下载任务。");
        }
        sendResponse({ downloaded: true, downloadId });
        await clearActiveJob(message.jobId);
        await notify(
          "定格：B站视频合并完成",
          "视频轨和音频轨已无损封装为一个 MP4，并开始下载。",
        );
      } catch (error) {
        await clearActiveJob(message.jobId);
        sendResponse({
          downloaded: false,
          error: error?.message || "Chrome 创建合并视频下载失败。",
        });
      }
    })();
    return true;
  }

  if (message.type === "DINGGE_DASH_MUX_FAILED") {
    clearActiveJob(message.jobId).catch(() => {});
    if (canceledJobIds.delete(message.jobId)) return;
    notify(
      "定格：B站视频合并失败",
      message.error || "无法把视频轨和音频轨无损封装为 MP4。",
    );
    return;
  }

  if (message.type === "DINGGE_BILIBILI_PARTS_ZIP_READY") {
    (async () => {
      try {
        const current = await getActiveJob();
        const requestedFilename = message.archiveName ||
          (current?.jobId === message.jobId && current.outputFilename
            ? current.outputFilename
            : "STILLFRAME-001.zip");
        const filename = /\.zip$/i.test(requestedFilename)
          ? requestedFilename
          : `${requestedFilename.replace(/\.[^.]+$/i, "")}.zip`;
        await updateActiveJob(message.jobId, {
          percent: message.isFinal ? 97 : Math.max(40, current?.percent || 0),
          text: message.isFinal
            ? "最后一个分P视频 ZIP 已生成，正在创建下载…"
            : `第 ${message.archiveIndex || 1} 个分P ZIP 已生成，正在创建下载…`,
        });
        const downloadId = await downloadWithForcedFilename({
          url: message.objectUrl,
          filename: await downloadPath("媒体", filename),
          saveAs: false,
        });
        if (downloadId === undefined) {
          throw new Error("Chrome 没有创建分P ZIP 下载任务。");
        }
        sendResponse({ downloaded: true, downloadId });
        if (message.isFinal) {
          await clearActiveJob(message.jobId);
          const failedText = message.failedCount
            ? `；${message.failedCount} 个失败${message.failureSummary ? `：${message.failureSummary}` : ""}`
            : "";
          await notify(
            "定格：分P视频打包完成",
            `${message.successCount || 0} 个分P已拆分为 ${message.archiveIndex || 1} 个 ZIP 并开始下载${failedText}。`,
          );
        } else {
          await updateActiveJob(message.jobId, {
            text: `第 ${message.archiveIndex || 1} 个 ZIP 已开始下载，继续处理剩余分P…`,
          });
        }
      } catch (error) {
        await clearActiveJob(message.jobId);
        sendResponse({
          downloaded: false,
          error: error?.message || "Chrome 创建分P ZIP 下载失败。",
        });
      }
    })();
    return true;
  }

  if (message.type === "DINGGE_BILIBILI_PARTS_ZIP_FAILED") {
    clearActiveJob(message.jobId).catch(() => {});
    if (canceledJobIds.delete(message.jobId)) return;
    notify(
      "定格：分P视频打包失败",
      message.error || "无法生成所选分P视频 ZIP。",
    );
    return;
  }

  if (message.type === "DINGGE_HLS_MEDIA_READY") {
    (async () => {
      try {
        const current = await getActiveJob();
        const filename =
          current?.jobId === message.jobId && current.outputFilename
            ? current.outputFilename.replace(
                /\.[a-zA-Z0-9]{2,5}$/i,
                String(message.filename || "").match(
                  /\.([a-zA-Z0-9]{2,5})$/i,
                )?.[0] || ".mp4",
              )
            : message.filename;
        const downloadId = await downloadWithForcedFilename({
          url: message.objectUrl,
          filename: await downloadPath("媒体", filename),
          saveAs: false,
        });
        if (downloadId === undefined) {
          throw new Error("Chrome 没有创建下载任务。");
        }
        sendResponse({ downloaded: true, downloadId });
      } catch (error) {
        sendResponse({
          downloaded: false,
          error: error?.message || "Chrome 创建视频下载失败。",
        });
      }
    })();
    return true;
  }

  if (message.type === "DINGGE_HLS_COMPLETE") {
    clearActiveJob(message.jobId).catch(() => {});
    notify(
      "定格：HLS 视频处理完成",
      `已合并 ${message.successCount} 个视频，${message.failedCount} 个失败。`,
    );
    chrome.runtime
      .sendMessage({
        type: "DINGGE_HLS_DOWNLOAD_COMPLETE",
        jobId: message.jobId,
        successCount: message.successCount,
        failedCount: message.failedCount,
      })
      .catch(() => {});
    return;
  }

  if (message.type === "DINGGE_HLS_FAILED") {
    clearActiveJob(message.jobId).catch(() => {});
    if (canceledJobIds.delete(message.jobId)) return;
    notify("定格：HLS 视频下载失败", message.error || "请重新尝试。");
  }
});
