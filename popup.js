const isPersistentSurface =
  new URLSearchParams(window.location.search).get("surface") === "window";
document.documentElement.classList.toggle("persistent-window", isPersistentSurface);

const state = {
  feature: "images",
  mode: "visible",
  tab: null,
  pageUrl: "",
  pageSessionId: "",
  busy: false,
  images: [],
  selectedImages: new Set(),
  autoSelectKinds: new Set(),
  mediaFilter: "all",
  zipJobId: "",
  hlsJobId: "",
  backgroundJobId: "",
  previewImageIndex: -1,
  previewReturnFocus: null,
  preferOriginalPreview: true,
  previewLayout: "square",
  imageFilterLevel: "standard",
  contentFilteredCount: 0,
  filteredImageKeys: new Set(),
  biliParts: [],
  selectedBiliCids: new Set(),
  biliMainTitle: "",
  biliCurrentPage: 1,
  biliCurrentBvid: "",
  biliListKind: "single",
  biliPartSizes: new Map(),
  biliSizeRequestId: 0,
  douyinVideo: null,
  douyinQualityChoices: [],
  secretVideo: null,
  secretVideos: [],
  secretVideoIndex: -1,
};
const pendingImageMeasurements = new Map();
let imageMeasurementGeneration = 0;
const BILIBILI_ZIP_CHUNK_LIMIT = 4_000_000_000;

const elements = {
  versionLabel: document.querySelector("#versionLabel"),
  openOptionsButton: document.querySelector("#openOptionsButton"),
  openGalleryButton: document.querySelector("#openGalleryButton"),
  featureTabs: [...document.querySelectorAll(".feature-tab")],
  secretEntryButton: document.querySelector("#secretEntryButton"),
  imagesPanel: document.querySelector("#imagesPanel"),
  screenshotPanel: document.querySelector("#screenshotPanel"),
  douyinPanel: document.querySelector("#douyinPanel"),
  douyinScanButton: document.querySelector("#douyinScanButton"),
  douyinScanButtonText: document.querySelector("#douyinScanButtonText"),
  douyinResults: document.querySelector("#douyinResults"),
  douyinEmptyHint: document.querySelector("#douyinEmptyHint"),
  douyinCover: document.querySelector("#douyinCover"),
  douyinVideoTitle: document.querySelector("#douyinVideoTitle"),
  douyinVideoAuthor: document.querySelector("#douyinVideoAuthor"),
  douyinVideoMeta: document.querySelector("#douyinVideoMeta"),
  douyinQuality: document.querySelector("#douyinQuality"),
  douyinCodecField: document.querySelector("#douyinCodecField"),
  douyinCodec: document.querySelector("#douyinCodec"),
  douyinCoverOption: document.querySelector("#douyinCoverOption"),
  douyinDownloadCover: document.querySelector("#douyinDownloadCover"),
  douyinDownloadButton: document.querySelector("#douyinDownloadButton"),
  secretPanel: document.querySelector("#secretPanel"),
  secretScanButton: document.querySelector("#secretScanButton"),
  secretScanButtonText: document.querySelector("#secretScanButtonText"),
  secretResults: document.querySelector("#secretResults"),
  secretEmptyHint: document.querySelector("#secretEmptyHint"),
  secretCover: document.querySelector("#secretCover"),
  secretVideoTitle: document.querySelector("#secretVideoTitle"),
  secretSiteLabel: document.querySelector("#secretSiteLabel"),
  secretVideoMeta: document.querySelector("#secretVideoMeta"),
  secretVideoList: document.querySelector("#secretVideoList"),
  secretQuality: document.querySelector("#secretQuality"),
  secretDownloadButton: document.querySelector("#secretDownloadButton"),
  bilibiliPanel: document.querySelector("#bilibiliPanel"),
  biliScanButton: document.querySelector("#biliScanButton"),
  biliScanButtonText: document.querySelector("#biliScanButtonText"),
  biliResults: document.querySelector("#biliResults"),
  biliEmptyHint: document.querySelector("#biliEmptyHint"),
  biliVideoTitle: document.querySelector("#biliVideoTitle"),
  biliPartSummary: document.querySelector("#biliPartSummary"),
  biliSelectAllButton: document.querySelector("#biliSelectAllButton"),
  biliPartList: document.querySelector("#biliPartList"),
  biliQuality: document.querySelector("#biliQuality"),
  biliAudioQuality: document.querySelector("#biliAudioQuality"),
  biliCodec: document.querySelector("#biliCodec"),
  biliAudio: document.querySelector("#biliAudio"),
  biliSrt: document.querySelector("#biliSrt"),
  biliAss: document.querySelector("#biliAss"),
  biliCover: document.querySelector("#biliCover"),
  biliDanmaku: document.querySelector("#biliDanmaku"),
  biliDownloadCurrentButton: document.querySelector("#biliDownloadCurrentButton"),
  biliPackageSelectedButton: document.querySelector("#biliPackageSelectedButton"),
  scanButton: document.querySelector("#scanButton"),
  scanButtonText: document.querySelector("#scanButtonText"),
  imageResults: document.querySelector("#imageResults"),
  emptyHint: document.querySelector("#emptyHint"),
  imageGrid: document.querySelector("#imageGrid"),
  resultCount: document.querySelector("#resultCount"),
  selectedCount: document.querySelector("#selectedCount"),
  imageFilterLevelSelect: document.querySelector("#imageFilterLevelSelect"),
  clearScannedButton: document.querySelector("#clearScannedButton"),
  bulkSelectAllButton: document.querySelector("#bulkSelectAllButton"),
  bulkSelectImagesButton: document.querySelector("#bulkSelectImagesButton"),
  bulkSelectVideosButton: document.querySelector("#bulkSelectVideosButton"),
  downloadImagesButton: document.querySelector("#downloadImagesButton"),
  packageImagesButton: document.querySelector("#packageImagesButton"),
  downloadCount: document.querySelector("#downloadCount"),
  format: document.querySelector("#format"),
  delay: document.querySelector("#delay"),
  captureButton: document.querySelector("#captureButton"),
  buttonText: document.querySelector("#buttonText"),
  progress: document.querySelector("#progress"),
  progressBar: document.querySelector("#progressBar"),
  progressPercent: document.querySelector("#progressPercent"),
  progressText: document.querySelector("#progressText"),
  cancelJobButton: document.querySelector("#cancelJobButton"),
  message: document.querySelector("#message"),
  captureOptions: [...document.querySelectorAll(".capture-option")],
  previewModal: document.querySelector("#previewModal"),
  previewTitle: document.querySelector("#previewTitle"),
  previewMeta: document.querySelector("#previewMeta"),
  previewImage: document.querySelector("#previewImage"),
  previewFallback: document.querySelector("#previewFallback"),
  previewCounter: document.querySelector("#previewCounter"),
  closePreviewButton: document.querySelector("#closePreviewButton"),
  previousPreviewButton: document.querySelector("#previousPreviewButton"),
  nextPreviewButton: document.querySelector("#nextPreviewButton"),
};

function pause(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function sanitizeFilename(value) {
  return String(value)
    .replace(/^www\./, "")
    .replace(/[^a-zA-Z0-9\u4e00-\u9fff._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function downloadPath(category, filename) {
  return ["定格下载", category, filename].filter(Boolean).join("/");
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

function pinterestVideoIdentity(rawUrl) {
  const match = String(rawUrl || "").match(
    /v1\.pinimg\.com\/videos\/(mc|iht)\/(?:expMp4|720p|hls)\/([a-f0-9]{2}\/[a-f0-9]{2}\/[a-f0-9]{2}\/[a-f0-9]{32,})/i,
  );
  return match ? `${match[1].toLowerCase()}:${match[2].toLowerCase()}` : "";
}

function canonicalImageIdentity(rawUrl) {
  const value = String(rawUrl || "");
  if (!value || /^data:/i.test(value)) return value;
  const pinterestOriginal = pinterestOriginalUrl(value);
  if (pinterestOriginal) {
    try {
      const url = new URL(pinterestOriginal);
      return `${url.hostname.toLowerCase()}${url.pathname
        .replace(/\/originals\//i, "/{size}/")
        .replace(/\.(?:avif|gif|jpe?g|png|webp)$/i, "")}`;
    } catch {
      return pinterestOriginal;
    }
  }
  try {
    const url = new URL(value);
    url.hostname = url.hostname
      .toLowerCase()
      .replace(/^i\d+\.hdslb\.com$/i, "i.hdslb.com")
      .replace(/^i\d+\.hdslb\.net$/i, "i.hdslb.net");
    url.hash = "";
    url.pathname = url.pathname
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

function imagePixelScore(image = {}) {
  const width = Number(image.width) || 0;
  const height = Number(image.height) || 0;
  let inferredWidth = 0;
  let inferredHeight = 0;
  const rawUrl = String(image.url || image.originalUrl || "");
  try {
    const url = new URL(rawUrl);
    inferredWidth =
      Number(url.searchParams.get("width") || url.searchParams.get("w")) || 0;
    inferredHeight =
      Number(url.searchParams.get("height") || url.searchParams.get("h")) || 0;
  } catch {
    // Use path dimensions below.
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
  return Math.max(Number(image.pixelScore) || 0, knownArea, inferredArea);
}

function canonicalImageKey(image) {
  if (image.kind === "video") {
    const pinterestIdentity = pinterestVideoIdentity(image.url);
    return pinterestIdentity
      ? `pinterest-video:${pinterestIdentity}`
      : `video:${image.url}`;
  }
  return `image:${canonicalImageIdentity(image.originalUrl || image.url)}`;
}

function uniquePreviewUrls(...values) {
  return [
    ...new Set(
      values
        .flat()
        .filter((value) => typeof value === "string" && value.trim())
        .map((value) => value.trim()),
    ),
  ];
}

function isHlsUrl(url) {
  return /\.m3u8(?:$|[?#])/i.test(String(url || ""));
}

function redactSensitiveDisplayText(value) {
  return String(value || "")
    .replace(/https?:\/\/[^\s"'<>]+/gi, "[media URL]")
    .replace(
      /\b(?:access[_-]?token|authorization|cookie|csrf(?:token)?|signature|sig|auth_key)=([^&\s]+)/gi,
      (match) => `${match.slice(0, match.indexOf("=") + 1)}[redacted]`,
    );
}

function showMessage(text, type = "") {
  const safeText = redactSensitiveDisplayText(text);
  elements.message.textContent = safeText;
  elements.message.className = `message ${type}`.trim();
  elements.message.hidden = !safeText;
}

function setProgress(percent, text) {
  const normalizedPercent = Math.max(0, Math.min(100, Math.round(percent)));
  elements.progress.hidden = false;
  elements.progressBar.style.width = `${normalizedPercent}%`;
  elements.progressPercent.textContent = `${normalizedPercent}%`;
  elements.progressText.textContent = redactSensitiveDisplayText(text);
}

function setBusy(busy) {
  state.busy = busy;
  elements.scanButton.disabled = busy;
  elements.captureButton.disabled = busy;
  elements.douyinScanButton.disabled = busy;
  elements.douyinDownloadButton.disabled = busy || !state.douyinVideo;
  elements.douyinQuality.disabled = busy || !state.douyinQualityChoices.length;
  elements.douyinCodec.disabled =
    busy || elements.douyinCodecField.hidden || elements.douyinCodec.options.length <= 1;
  elements.douyinDownloadCover.disabled = busy || elements.douyinCoverOption.hidden;
  elements.secretScanButton.disabled = busy;
  elements.secretEntryButton.disabled = busy;
  elements.secretVideoList
    .querySelectorAll("button")
    .forEach((button) => { button.disabled = busy; });
  elements.secretQuality.disabled = busy || !state.secretVideo?.candidates?.length;
  elements.secretDownloadButton.disabled =
    busy || !state.secretVideo?.candidates?.length;
  elements.biliScanButton.disabled = busy;
  elements.biliDownloadCurrentButton.disabled =
    busy || state.biliParts.length === 0;
  elements.biliPackageSelectedButton.disabled =
    busy || state.selectedBiliCids.size === 0;
  elements.biliSelectAllButton.disabled = busy || state.biliParts.length === 0;
  elements.clearScannedButton.disabled = busy || state.images.length === 0;
  elements.imageFilterLevelSelect.disabled = busy;
  elements.openGalleryButton.disabled = busy || state.images.length === 0;
  elements.bulkSelectAllButton.disabled = busy || state.images.length === 0;
  elements.bulkSelectImagesButton.disabled =
    busy || !state.images.some((item) => item.kind !== "video");
  elements.bulkSelectVideosButton.disabled =
    busy || !state.images.some((item) => item.kind === "video");
  elements.downloadImagesButton.disabled = busy || state.selectedImages.size === 0;
  elements.packageImagesButton.disabled = busy || state.selectedImages.size === 0;
  elements.featureTabs.forEach((button) => {
    button.disabled = busy;
  });
  elements.captureOptions.forEach((button) => {
    button.disabled = busy;
  });
}

async function getActiveTab() {
  const [currentTab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });
  if (currentTab?.id && canAccessPage(currentTab.url)) return currentTab;
  const [lastFocusedTab] = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true,
  });
  if (lastFocusedTab?.id && canAccessPage(lastFocusedTab.url)) {
    return lastFocusedTab;
  }
  const activeTabs = await chrome.tabs.query({ active: true });
  return activeTabs.find((tab) => tab?.id && canAccessPage(tab.url)) || currentTab || null;
}

function canAccessPage(url = "") {
  return /^https?:\/\//i.test(url) || /^file:\/\//i.test(url);
}

function isMissingContentScriptError(error) {
  return /receiving end does not exist|could not establish connection/i.test(
    String(error?.message || error || ""),
  );
}

async function requestPageMedia({ injectIfMissing = true } = {}) {
  try {
    return await chrome.tabs.sendMessage(state.tab.id, {
      type: "DINGGE_GET_IMAGES",
    });
  } catch (error) {
    if (!injectIfMissing || !isMissingContentScriptError(error)) throw error;
    await chrome.scripting.executeScript({
      target: { tabId: state.tab.id },
      files: ["i18n.js", "content.js"],
    });
    return chrome.tabs.sendMessage(state.tab.id, {
      type: "DINGGE_GET_IMAGES",
    });
  }
}

async function initialize() {
  elements.versionLabel.textContent = `V${chrome.runtime.getManifest().version}`;
  const preferences = await chrome.storage.local.get([
    "format",
    "delay",
    "mode",
    "feature",
    "preferOriginalPreview",
    "previewLayout",
    "imageFilterLevel",
    "douyinDownloadCover",
    "biliQuality",
    "biliAudioQuality",
    "biliCodec",
    "biliDownloadAudio",
    "biliDownloadSrt",
    "biliDownloadAss",
    "biliDownloadCover",
    "biliDownloadDanmaku",
  ]);
  state.mode = preferences.mode === "full" ? "full" : "visible";
  state.feature = ["images", "screenshot", "douyin", "bilibili", "secret"].includes(
    preferences.feature,
  )
    ? preferences.feature
    : "images";
  elements.format.value = ["png", "jpeg", "pdf"].includes(preferences.format)
    ? preferences.format
    : "png";
  elements.delay.value = ["0", "3", "5"].includes(preferences.delay)
    ? preferences.delay
    : "0";
  state.preferOriginalPreview = preferences.preferOriginalPreview !== false;
  state.previewLayout =
    preferences.previewLayout === "waterfall" ? "waterfall" : "square";
  state.imageFilterLevel = normalizeImageFilterLevel(
    preferences.imageFilterLevel,
  );
  elements.imageFilterLevelSelect.value = state.imageFilterLevel;
  elements.douyinDownloadCover.checked = preferences.douyinDownloadCover === true;
  elements.biliQuality.value = String(preferences.biliQuality || "80");
  elements.biliAudioQuality.value = String(
    preferences.biliAudioQuality || "30280",
  );
  elements.biliCodec.value = String(preferences.biliCodec || "avc");
  elements.biliAudio.checked = preferences.biliDownloadAudio !== false;
  elements.biliSrt.checked = preferences.biliDownloadSrt !== false;
  elements.biliAss.checked = preferences.biliDownloadAss === true;
  elements.biliCover.checked = preferences.biliDownloadCover === true;
  elements.biliDanmaku.checked = preferences.biliDownloadDanmaku === true;
  updateMode(state.mode);
  updateFeature(state.feature);

  try {
    state.tab = await getActiveTab();
    state.pageUrl = state.tab?.url || "";

    if (!canAccessPage(state.tab?.url)) {
      showMessage(
        "Chrome 内部页面和扩展商店受浏览器保护。请打开普通网页后再使用。",
        "error",
      );
      elements.scanButton.disabled = true;
      elements.captureButton.disabled = true;
    } else {
      if (state.feature === "bilibili") {
        await scanBilibiliVideos();
      } else if (state.feature === "douyin") {
        await scanDouyinVideo();
      } else if (state.feature === "secret") {
        await scanSecretVideo();
      } else {
        await syncImagesFromPage();
        await syncNetworkMedia();
      }
    }
  } catch {
    showMessage("请刷新网页后重新打开扩展。", "error");
    elements.scanButton.disabled = true;
    elements.captureButton.disabled = true;
  }
  await syncBackgroundJob();
}

function showBackgroundJob(job) {
  if (!job?.jobId) return;
  state.backgroundJobId = job.jobId;
  if (job.type === "zip") state.zipJobId = job.jobId;
  if (job.type === "hls") state.hlsJobId = job.jobId;
  setProgress(job.percent || 0, job.text || "后台正在处理媒体…");
  elements.cancelJobButton.hidden = false;
  setBusy(true);
}

function clearBackgroundJobUI() {
  state.backgroundJobId = "";
  elements.cancelJobButton.hidden = true;
  setBusy(false);
}

async function syncBackgroundJob() {
  try {
    const response = await chrome.runtime.sendMessage({
      type: "DINGGE_GET_JOB_STATUS",
      target: "background",
    });
    if (response?.job) showBackgroundJob(response.job);
  } catch {
    // The rest of the popup remains usable if status restoration fails.
  }
}

async function cancelBackgroundJob() {
  if (!state.backgroundJobId) return;
  elements.cancelJobButton.disabled = true;
  elements.cancelJobButton.textContent = "取消中…";
  try {
    const response = await chrome.runtime.sendMessage({
      type: "DINGGE_CANCEL_JOB",
      target: "background",
      jobId: state.backgroundJobId,
    });
    if (!response?.canceled) {
      throw new Error(response?.error || "取消任务失败。");
    }
    clearBackgroundJobUI();
    elements.progress.hidden = true;
    showMessage("后台任务已取消，可以重新选择并打包。", "success");
  } catch (error) {
    showMessage(error?.message || "取消任务失败。", "error");
  } finally {
    elements.cancelJobButton.disabled = false;
    elements.cancelJobButton.textContent = "取消任务";
  }
}

async function syncImagesFromPage() {
  try {
    const response = await requestPageMedia();
    if (Array.isArray(response?.images)) {
      const sessionChanged = Boolean(
        state.pageSessionId &&
          response.pageSessionId &&
          response.pageSessionId !== state.pageSessionId,
      );
      if (response.pageUrl) state.pageUrl = response.pageUrl;
      if (response.pageSessionId) state.pageSessionId = response.pageSessionId;
      mergeImages(response.images, sessionChanged, response.filteredCount);
    }
  } catch {
    // Protected pages and file URLs without explicit access cannot accept injection.
  }
}

async function syncNetworkMedia() {
  if (!state.tab?.id) return;
  try {
    const response = await chrome.runtime.sendMessage({
      type: "DINGGE_GET_NETWORK_MEDIA",
      target: "background",
      tabId: state.tab.id,
    });
    if (Array.isArray(response?.items)) mergeImages(response.items, false);
  } catch {
    // Network media is an additional source; DOM scanning can still continue.
  }
}

function isBilibiliPage(url = state.tab?.url || "") {
  try {
    return /(^|\.)bilibili\.com$/i.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

function isDouyinPage(url = state.tab?.url || "") {
  try {
    const hostname = new URL(url).hostname;
    return hostname === "douyin.com" || hostname.endsWith(".douyin.com");
  } catch {
    return false;
  }
}

function isPornhubHostname(hostname) {
  const normalized = String(hostname || "").toLowerCase().replace(/\.$/, "");
  return [
    "pornhub.com",
    "pornhub.org",
    "pornhub.xxx",
    "pornhubpremium.com",
  ].some(
    (baseHostname) =>
      normalized === baseHostname || normalized.endsWith(`.${baseHostname}`),
  );
}

function secretSiteKind(url = state.tab?.url || "") {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    if (hostname === "onlyfans.com" || hostname.endsWith(".onlyfans.com")) {
      return "onlyfans";
    }
    if (isPornhubHostname(hostname)) {
      return "pornhub";
    }
  } catch {
    // Invalid and protected browser URLs are not supported here.
  }
  return "";
}

function formatSecretDuration(rawSeconds) {
  const seconds = Math.max(0, Math.round(Number(rawSeconds) || 0));
  if (!seconds) return "";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
    : `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function secretMediaResourceKey(rawUrl) {
  const value = String(rawUrl || "").trim();
  if (!value) return "";
  try {
    const url = new URL(value);
    return `${url.hostname.toLowerCase()}${url.pathname}`;
  } catch {
    return value.replace(/[?#].*$/, "");
  }
}

function secretCandidateKey(candidate = {}) {
  const format = String(candidate.format || candidate.streamType || "").toLowerCase();
  return `${format}|${secretMediaResourceKey(candidate.url)}`;
}

function secretVideoKey(video = {}) {
  const site = String(video.siteKind || video.siteLabel || "").toLowerCase();
  const id = String(video.id || "").trim();
  if (id) return `${site}|id:${id}`;
  const resources = (video.candidates || [])
    .map(secretCandidateKey)
    .filter(Boolean)
    .sort();
  if (resources.length) return `${site}|media:${resources[0]}`;
  return `${site}|meta:${String(video.title || "").trim()}|${secretMediaResourceKey(video.cover)}`;
}

function mergeSecretVideoUpdates(existingVideos = [], incomingVideos = []) {
  const videos = existingVideos.filter(Boolean).map((video) => ({
    ...video,
    candidates: [...(video.candidates || [])],
  }));
  let addedCount = 0;
  incomingVideos.filter(Boolean).forEach((incoming) => {
    const incomingResources = new Set(
      (incoming.candidates || []).map(secretCandidateKey).filter(Boolean),
    );
    let index = videos.findIndex(
      (video) => secretVideoKey(video) === secretVideoKey(incoming),
    );
    if (index < 0 && incomingResources.size) {
      index = videos.findIndex((video) =>
        (video.candidates || []).some((candidate) =>
          incomingResources.has(secretCandidateKey(candidate)),
        ),
      );
    }
    if (index < 0) {
      videos.push({ ...incoming, candidates: [...(incoming.candidates || [])] });
      addedCount += 1;
      return;
    }
    const existing = videos[index];
    const seenCandidates = new Set();
    const candidates = [...(incoming.candidates || []), ...(existing.candidates || [])]
      .filter((candidate) => {
        const key = secretCandidateKey(candidate);
        if (!key || seenCandidates.has(key)) return false;
        seenCandidates.add(key);
        return true;
      });
    videos[index] = {
      ...existing,
      ...incoming,
      id: incoming.id || existing.id || "",
      title: incoming.title || existing.title,
      cover: incoming.cover || existing.cover,
      duration: Number(incoming.duration || existing.duration || 0) || 0,
      pending: candidates.length ? false : Boolean(incoming.pending ?? existing.pending),
      candidates,
    };
  });
  return { videos, addedCount };
}

function secretCandidateQualityNumber(candidate = {}) {
  const values = [
    candidate.quality,
    candidate.height,
    candidate.label,
    candidate.url,
  ];
  for (const value of values) {
    const match = String(value || "").match(/(?:^|\D)(\d{3,4})(?:p|\D|$)/i);
    const quality = Number(match?.[1] || 0);
    if (quality >= 144 && quality <= 4320) return quality;
  }
  return 0;
}

function secretQualityBitrate(quality) {
  if (quality <= 0) return 0;
  if (quality <= 240) return 450_000;
  if (quality <= 360) return 800_000;
  if (quality <= 480) return 1_200_000;
  if (quality <= 540) return 1_600_000;
  if (quality <= 720) return 2_500_000;
  if (quality <= 1080) return 5_000_000;
  if (quality <= 1440) return 9_000_000;
  if (quality <= 2160) return 18_000_000;
  return 32_000_000;
}

function estimateSecretCandidateSize(video = {}, candidate = {}) {
  const exactSize = Number(
    candidate.sizeBytes || candidate.fileSize || candidate.contentLength || 0,
  );
  if (Number.isFinite(exactSize) && exactSize > 0) {
    return { sizeBytes: Math.round(exactSize), estimated: false };
  }
  const suppliedEstimate = Number(candidate.estimatedSizeBytes || 0);
  if (Number.isFinite(suppliedEstimate) && suppliedEstimate > 0) {
    return { sizeBytes: Math.round(suppliedEstimate), estimated: true };
  }
  const duration = Number(video.duration || 0);
  if (!Number.isFinite(duration) || duration <= 0) {
    return { sizeBytes: 0, estimated: true };
  }
  let bitrate = Number(candidate.bitrate || candidate.bandwidth || 0);
  if (bitrate > 0 && bitrate < 100_000) bitrate *= 1000;
  if (!Number.isFinite(bitrate) || bitrate <= 0 || bitrate > 1_000_000_000) {
    bitrate = secretQualityBitrate(secretCandidateQualityNumber(candidate));
  }
  if (!bitrate) return { sizeBytes: 0, estimated: true };
  const audioBitrate = 128_000;
  return {
    sizeBytes: Math.round((duration * (bitrate + audioBitrate) * 1.03) / 8),
    estimated: true,
  };
}

function formatSecretFileSize(sizeBytes, estimated = true) {
  const size = Number(sizeBytes) || 0;
  if (!size) return "";
  const value =
    size >= 1024 ** 3
      ? `${(size / 1024 ** 3).toFixed(1)} GB`
      : size >= 1024 ** 2
        ? `${(size / 1024 ** 2).toFixed(size < 10 * 1024 ** 2 ? 1 : 0)} MB`
        : `${Math.max(1, Math.round(size / 1024))} KB`;
  return estimated ? `约 ${value}` : value;
}

function secretCandidateSizeLabel(video, candidate) {
  const size = estimateSecretCandidateSize(video, candidate);
  return formatSecretFileSize(size.sizeBytes, size.estimated);
}

function secretCandidateDisplayLabel(video, candidate, index = 0) {
  return [
    candidate?.label || `可用播放地址 ${index + 1}`,
    secretCandidateSizeLabel(video, candidate),
  ].filter(Boolean).join(" · ");
}

function updateSecretVideoMeta() {
  if (!state.secretVideo) return;
  const selected = state.secretVideo.candidates[
    Number(elements.secretQuality.value) || 0
  ];
  const duration = formatSecretDuration(state.secretVideo.duration);
  const quality = selected?.label || selected?.format?.toUpperCase() || "当前播放流";
  const size = secretCandidateSizeLabel(state.secretVideo, selected);
  elements.secretVideoMeta.textContent = [quality, duration, size]
    .filter(Boolean)
    .join(" · ");
}

function renderSecretVideo(video, index = -1, preferredCandidateKey = "") {
  state.secretVideo = video || null;
  state.secretVideoIndex = video ? index : -1;
  elements.secretVideoList
    .querySelectorAll(".secret-video-item")
    .forEach((row) => {
      row.classList.toggle("current", Number(row.dataset.index) === index);
    });
  elements.secretResults.hidden = !video;
  elements.secretEmptyHint.hidden = Boolean(video);
  elements.secretQuality.replaceChildren();
  if (!state.secretVideo) {
    elements.secretCover.removeAttribute("src");
    elements.secretQuality.disabled = true;
    elements.secretDownloadButton.disabled = true;
    return;
  }

  elements.secretVideoTitle.textContent = video.title || "当前页面视频";
  elements.secretSiteLabel.textContent = "当前网站";
  if (video.cover) {
    elements.secretCover.onerror = () => {
      elements.secretCover.onerror = null;
      elements.secretCover.removeAttribute("src");
      elements.secretCover.hidden = true;
    };
    elements.secretCover.src = video.cover;
    elements.secretCover.hidden = false;
  } else {
    elements.secretCover.onerror = null;
    elements.secretCover.removeAttribute("src");
    elements.secretCover.hidden = true;
  }
  (video.candidates || []).forEach((candidate, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = secretCandidateDisplayLabel(video, candidate, index);
    elements.secretQuality.append(option);
  });
  const hasCandidates = Boolean(video.candidates?.length);
  if (!hasCandidates) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "播放该视频后重新识别";
    elements.secretQuality.append(option);
    elements.secretVideoMeta.textContent = "等待页面加载媒体地址";
  } else {
    const preferredIndex = video.candidates.findIndex(
      (candidate) => secretCandidateKey(candidate) === preferredCandidateKey,
    );
    if (preferredIndex >= 0) elements.secretQuality.value = String(preferredIndex);
    updateSecretVideoMeta();
  }
  elements.secretQuality.disabled = state.busy || !hasCandidates;
  elements.secretDownloadButton.disabled = state.busy || !hasCandidates;
}

function renderSecretVideos(
  rawVideos,
  preferredVideoKey = "",
  preferredCandidateKey = "",
) {
  state.secretVideos = (Array.isArray(rawVideos) ? rawVideos : []).filter(Boolean);
  elements.secretVideoList.replaceChildren();
  if (!state.secretVideos.length) {
    renderSecretVideo(null);
    return;
  }
  state.secretVideos.forEach((video, index) => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "bili-part-item secret-video-item";
    row.dataset.index = String(index);
    const number = document.createElement("span");
    number.className = "bili-part-number";
    number.textContent = `V${index + 1}`;
    const name = document.createElement("span");
    name.className = "bili-part-name";
    name.textContent = String(video.title || `页面视频 ${index + 1}`);
    name.title = name.textContent;
    const meta = document.createElement("span");
    meta.className = "bili-part-meta";
    const status = document.createElement("span");
    status.className = "bili-part-size";
    const firstCandidate = video.candidates?.[0];
    const sizeLabel = firstCandidate
      ? secretCandidateSizeLabel(video, firstCandidate)
      : "";
    status.textContent = video.candidates?.length
      ? [`${video.candidates.length} 个清晰度`, sizeLabel]
          .filter(Boolean)
          .join(" · ")
      : "待播放";
    const duration = document.createElement("span");
    duration.textContent = formatSecretDuration(video.duration) || video.siteLabel || "";
    meta.append(duration, status);
    row.append(number, name, meta);
    row.addEventListener("click", () => renderSecretVideo(video, index));
    elements.secretVideoList.append(row);
  });
  const preferredIndex = preferredVideoKey
    ? state.secretVideos.findIndex(
        (video) => secretVideoKey(video) === preferredVideoKey,
      )
    : -1;
  const initialIndex = preferredIndex >= 0
    ? preferredIndex
    : Math.max(
        0,
        state.secretVideos.findIndex((video) => video?.candidates?.length),
      );
  renderSecretVideo(
    state.secretVideos[initialIndex],
    initialIndex,
    preferredIndex >= 0 ? preferredCandidateKey : "",
  );
}

async function scanSecretVideo() {
  if (state.busy) return;
  state.tab = await getActiveTab();
  state.pageUrl = state.tab?.url || "";
  if (!state.tab?.id || !secretSiteKind(state.tab.url)) {
    renderSecretVideos([]);
    showMessage("请打开你想打开的网站并尝试", "error");
    return;
  }
  setBusy(true);
  showMessage("");
  elements.secretScanButtonText.textContent = "正在识别当前页面视频…";
  try {
    const response = await chrome.runtime.sendMessage({
      type: "DINGGE_GET_SECRET_VIDEO",
      target: "background",
      tabId: state.tab.id,
    });
    const videos = Array.isArray(response?.videos)
      ? response.videos
      : response?.video
        ? [response.video]
        : [];
    if (!response?.ok || !videos.length) {
      throw new Error(response?.error || "没有读取到可下载的视频地址，请先播放视频几秒后重试。");
    }
    renderSecretVideos(videos);
    elements.secretScanButtonText.textContent = "重新识别当前页面视频";
    const downloadableCount = videos.filter((video) => video?.candidates?.length).length;
    showMessage(
      response.warning ||
        `已识别 ${videos.length} 个页面视频，其中 ${downloadableCount} 个可下载。`,
      downloadableCount ? "success" : "error",
    );
  } catch (error) {
    renderSecretVideos([]);
    elements.secretScanButtonText.textContent = "识别当前页面视频";
    showMessage(error?.message || "当前页面视频识别失败。", "error");
  } finally {
    setBusy(false);
  }
}

async function startSecretDownload() {
  if (state.busy || !state.tab?.id || !state.secretVideo?.candidates?.length) return;
  setBusy(true);
  showMessage("");
  try {
    const response = await chrome.runtime.sendMessage({
      type: "DINGGE_START_SECRET_DOWNLOAD",
      target: "background",
      tabId: state.tab.id,
      video: state.secretVideo,
      preferredIndex: Number(elements.secretQuality.value) || 0,
    });
    if (!response?.started) {
      throw new Error(response?.error || "无法启动当前视频下载。");
    }
    if (response.background && response.jobId) {
      state.backgroundJobId = response.jobId;
      state.hlsJobId = response.jobId;
      elements.cancelJobButton.hidden = false;
      setProgress(4, "已找到 HLS，正在读取播放列表…");
    }
    showMessage(
      response.background
        ? "视频正在后台读取并合并，可在此查看进度。"
        : "视频已交给 Chrome 下载管理器。",
      "success",
    );
  } catch (error) {
    showMessage(error?.message || "无法启动当前视频下载。", "error");
  } finally {
    if (!state.backgroundJobId) setBusy(false);
  }
}

async function requestDouyinVideo() {
  return chrome.runtime.sendMessage({
    type: "DINGGE_GET_DOUYIN_VIDEO",
    target: "background",
    tabId: state.tab.id,
  });
}

function formatDouyinDuration(rawSeconds) {
  const seconds = Math.max(0, Math.round(Number(rawSeconds) || 0));
  if (!seconds) return "";
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function normalizeDouyinCodec(value) {
  const normalized = String(value || "").trim().toUpperCase();
  return ["AVC", "HEVC", "AV1"].includes(normalized) ? normalized : "";
}

function douyinQualityChoices(video, requestedCodec = "") {
  const allCandidates = Array.isArray(video?.candidates) ? video.candidates : [];
  const selectable = allCandidates
    .map((candidate, index) => ({ candidate, index }))
    .filter(({ candidate }) => candidate.selectable === true);
  const normalizedCodec = normalizeDouyinCodec(requestedCodec);
  const codecMatches = normalizedCodec
    ? selectable.filter(
        ({ candidate }) => normalizeDouyinCodec(candidate.codec) === normalizedCodec,
      )
    : selectable;
  const source = codecMatches.length
    ? codecMatches
    : selectable.length
    ? selectable
    : allCandidates.slice(0, 1).map((candidate, index) => ({ candidate, index }));
  const seen = new Set();
  return source.filter(({ candidate }) => {
    const key =
      candidate.qualityKey ||
      [
        Number(candidate.width) || 0,
        Number(candidate.height) || 0,
        Number(candidate.bitRate) || 0,
        Number(candidate.fps) || 0,
        candidate.codec || "",
        candidate.hdr ? "hdr" : "sdr",
      ].join(":");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function updateDouyinQualityOptions() {
  const previous = state.douyinVideo?.candidates?.[
    Number(elements.douyinQuality.value) || 0
  ];
  const codec = elements.douyinCodecField.hidden ? "" : elements.douyinCodec.value;
  state.douyinQualityChoices = douyinQualityChoices(state.douyinVideo, codec);
  elements.douyinQuality.replaceChildren();
  state.douyinQualityChoices.forEach(({ candidate, index }) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = candidate.label || `可用播放地址 ${index + 1}`;
    elements.douyinQuality.append(option);
  });
  const previousChoice = state.douyinQualityChoices.find(
    ({ candidate }) => candidate.qualityKey === previous?.qualityKey,
  );
  if (previousChoice) elements.douyinQuality.value = String(previousChoice.index);
  elements.douyinQuality.disabled = state.busy || !state.douyinQualityChoices.length;
  updateDouyinVideoMeta();
}

function updateDouyinVideoMeta() {
  if (!state.douyinVideo) return;
  const selected = state.douyinVideo.candidates[
    Number(elements.douyinQuality.value) || 0
  ];
  const dimensions =
    selected?.width && selected?.height
      ? `${selected.width} × ${selected.height}`
      : "当前播放流";
  const duration = formatDouyinDuration(state.douyinVideo.duration);
  const qualityCount = state.douyinQualityChoices.length;
  elements.douyinVideoMeta.textContent = [
    dimensions,
    duration,
    qualityCount > 1 ? `${qualityCount} 档可用画质` : "1 档可用画质",
  ]
    .filter(Boolean)
    .join(" · ");
}

function renderDouyinVideo(video) {
  state.douyinVideo = video?.candidates?.length ? video : null;
  elements.douyinResults.hidden = !state.douyinVideo;
  elements.douyinEmptyHint.hidden = Boolean(state.douyinVideo);
  elements.douyinQuality.replaceChildren();
  elements.douyinCodec.replaceChildren();
  elements.douyinCodecField.hidden = true;
  elements.douyinCoverOption.hidden = true;
  state.douyinQualityChoices = [];
  if (!state.douyinVideo) {
    elements.douyinCover.removeAttribute("src");
    elements.douyinQuality.disabled = true;
    elements.douyinCodec.disabled = true;
    elements.douyinDownloadCover.disabled = true;
    elements.douyinDownloadButton.disabled = true;
    return;
  }

  elements.douyinVideoTitle.textContent = video.title || "当前抖音视频";
  elements.douyinVideoAuthor.textContent = video.author
    ? `@${video.author}`
    : "作者未知";
  if (video.cover) {
    elements.douyinCover.src = video.cover;
    elements.douyinCover.hidden = false;
  } else {
    elements.douyinCover.removeAttribute("src");
    elements.douyinCover.hidden = true;
  }
  elements.douyinCoverOption.hidden = !video.cover;
  elements.douyinDownloadCover.disabled = state.busy || !video.cover;
  const allChoices = douyinQualityChoices(video);
  const codecs = [
    ...new Set(allChoices.map(({ candidate }) => normalizeDouyinCodec(candidate.codec))),
  ].filter(Boolean);
  const codecsAreComplete =
    allChoices.length > 0 &&
    allChoices.every(({ candidate }) => normalizeDouyinCodec(candidate.codec));
  if (codecsAreComplete && codecs.length) {
    codecs.forEach((codec) => {
      const option = document.createElement("option");
      option.value = codec;
      option.textContent = codec;
      elements.douyinCodec.append(option);
    });
    elements.douyinCodec.value = normalizeDouyinCodec(allChoices[0].candidate.codec);
    elements.douyinCodecField.hidden = false;
    elements.douyinCodec.disabled = state.busy || codecs.length <= 1;
  }
  updateDouyinQualityOptions();
  elements.douyinDownloadButton.disabled = state.busy;
}

async function scanDouyinVideo() {
  if (state.busy) return;
  state.tab = await getActiveTab();
  state.pageUrl = state.tab?.url || "";
  if (!state.tab?.id || !isDouyinPage(state.tab.url)) {
    renderDouyinVideo(null);
    showMessage("请先打开一个网页版抖音视频页面。", "error");
    return;
  }
  setBusy(true);
  showMessage("");
  elements.douyinScanButtonText.textContent = "正在识别当前抖音视频…";
  try {
    const response = await requestDouyinVideo();
    if (!response?.ok || !response.video?.candidates?.length) {
      throw new Error(
        response?.error || "没有读取到可下载的视频地址，请先播放视频几秒后重试。",
      );
    }
    renderDouyinVideo(response.video);
    elements.douyinScanButtonText.textContent = "重新识别当前抖音视频";
    showMessage(
      `已识别“${response.video.title || "当前抖音视频"}”，请选择画质下载。`,
      "success",
    );
  } catch (error) {
    renderDouyinVideo(null);
    elements.douyinScanButtonText.textContent = "识别当前抖音视频";
    showMessage(error?.message || "抖音视频识别失败。", "error");
  } finally {
    setBusy(false);
  }
}

async function startDouyinDownload() {
  if (state.busy || !state.tab?.id || !state.douyinVideo) return;
  setBusy(true);
  showMessage("");
  try {
    const response = await chrome.runtime.sendMessage({
      type: "DINGGE_START_DOUYIN_DOWNLOAD",
      target: "background",
      tabId: state.tab.id,
      video: state.douyinVideo,
      preferredIndex: Number(elements.douyinQuality.value) || 0,
      downloadCover:
        !elements.douyinCoverOption.hidden && elements.douyinDownloadCover.checked,
    });
    if (!response?.started) {
      throw new Error(response?.error || "无法启动抖音视频下载。");
    }
    showMessage(
      response.coverDownloaded
        ? "抖音视频和封面已交给 Chrome 下载管理器。"
        : response.coverRequested
          ? "抖音视频已开始下载，但封面下载失败。"
        : "抖音视频已交给 Chrome 下载管理器。",
      "success",
    );
  } catch (error) {
    showMessage(error?.message || "无法启动抖音视频下载。", "error");
  } finally {
    setBusy(false);
  }
}

function formatBiliDuration(rawSeconds) {
  const seconds = Math.max(0, Math.round(Number(rawSeconds) || 0));
  if (!seconds) return "";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
    : `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function formatBiliSize(sizeBytes, estimated = true) {
  const size = Number(sizeBytes) || 0;
  if (!size) return "大小待识别";
  const value =
    size >= 1024 ** 3
      ? `${(size / 1024 ** 3).toFixed(1)} GB`
      : size >= 1024 ** 2
        ? `${(size / 1024 ** 2).toFixed(size < 10 * 1024 ** 2 ? 1 : 0)} MB`
        : `${Math.max(1, Math.round(size / 1024))} KB`;
  return estimated ? `约 ${value}` : value;
}

function updateBilibiliPartSizes(placeholder = "大小待识别") {
  elements.biliPartList
    .querySelectorAll(".bili-part-size[data-cid]")
    .forEach((element) => {
      const size = state.biliPartSizes.get(Number(element.dataset.cid));
      element.textContent = size
        ? formatBiliSize(size.sizeBytes, size.estimated)
        : placeholder;
    });
  updateBiliSelectionUI();
}

async function refreshBilibiliPartSizes() {
  if (!state.tab?.id || !state.biliParts.length) return;
  const requestId = ++state.biliSizeRequestId;
  state.biliPartSizes.clear();
  updateBilibiliPartSizes("正在估算…");
  try {
    const response = await chrome.runtime.sendMessage({
      type: "DINGGE_GET_BILIBILI_PART_SIZES",
      target: "background",
      tabId: state.tab.id,
      pageUrl: state.tab.url,
      settings: biliDownloadSettings(),
    });
    if (requestId !== state.biliSizeRequestId) return;
    if (!response?.ok) throw new Error(response?.error);
    (response.sizes || []).forEach((size) => {
      state.biliPartSizes.set(Number(size.cid), size);
    });
    updateBilibiliPartSizes();
  } catch {
    if (requestId === state.biliSizeRequestId) {
      updateBilibiliPartSizes("大小读取失败");
    }
  }
}

function updateBiliSelectionUI() {
  const selectedCount = state.selectedBiliCids.size;
  const selectableCount = Math.min(50, state.biliParts.length);
  const listLabel = state.biliListKind === "season" ? "视频" : "分P";
  const limitLabel =
    state.biliParts.length > 50 ? " · 当前选择上限 50 个" : "";
  const selectedSizes = [...state.selectedBiliCids]
    .map((cid) => state.biliPartSizes.get(Number(cid)))
    .filter((size) => Number(size?.sizeBytes) > 0);
  const selectedBytes = selectedSizes.reduce(
    (total, size) => total + Number(size.sizeBytes || 0),
    0,
  );
  const sizeLabel = selectedBytes
    ? ` · ${selectedSizes.length === selectedCount ? "预计" : "已识别"}${formatBiliSize(selectedBytes, false)}`
    : "";
  const splitLabel = selectedBytes > BILIBILI_ZIP_CHUNK_LIMIT
    ? " · 将自动拆分 ZIP"
    : "";
  elements.biliPartSummary.textContent = state.biliParts.length > 1
    ? `共 ${state.biliParts.length} 个${listLabel}${limitLabel} · 已选 ${selectedCount}${sizeLabel}${splitLabel}`
    : `主视频 · 已选 ${selectedCount}${sizeLabel}`;
  elements.biliSelectAllButton.textContent =
    selectedCount === selectableCount ? "取消全选" : "全选";
  elements.biliPackageSelectedButton.textContent = selectedCount
    ? `打包下载视频（${selectedCount}）`
    : "打包下载视频";
  elements.biliDownloadCurrentButton.disabled =
    state.busy || state.biliParts.length === 0;
  elements.biliPackageSelectedButton.disabled =
    state.busy || state.biliParts.length < 2 || selectedCount === 0;
}

function renderBilibiliParts(partList = {}) {
  state.biliParts = Array.isArray(partList.parts) ? partList.parts : [];
  state.biliMainTitle = String(partList.title || "当前 B站视频").trim();
  state.biliListKind = String(partList.kind || "single");
  state.biliCurrentBvid =
    new URL(state.tab?.url || location.href).pathname.match(
      /\/video\/(BV[a-zA-Z0-9]+)/i,
    )?.[1] || "";
  state.biliCurrentPage = Math.max(
    1,
    Number(new URL(state.tab?.url || location.href).searchParams.get("p")) || 1,
  );
  state.selectedBiliCids.clear();
  state.biliPartSizes.clear();
  elements.biliPartList.replaceChildren();
  state.biliParts.forEach((part) => {
    const row = document.createElement("label");
    row.className = "bili-part-item";
    const isCurrent =
      (part.bvid &&
        state.biliCurrentBvid &&
        part.bvid.toLowerCase() === state.biliCurrentBvid.toLowerCase()) ||
      (!part.bvid && Number(part.page) === state.biliCurrentPage);
    if (isCurrent) row.classList.add("current");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = state.selectedBiliCids.has(Number(part.cid));
    checkbox.disabled = Number(part.cid) <= 0;
    const number = document.createElement("span");
    number.className = "bili-part-number";
    number.textContent =
      state.biliParts.length > 1
        ? state.biliListKind === "season"
          ? `${part.page}`
          : `P${part.page}`
        : "主视频";
    const name = document.createElement("span");
    name.className = "bili-part-name";
    name.textContent = String(part.title || `P${part.page}`);
    name.title = name.textContent;
    const meta = document.createElement("span");
    meta.className = "bili-part-meta";
    const duration = document.createElement("span");
    duration.textContent = formatBiliDuration(part.duration);
    const size = document.createElement("span");
    size.className = "bili-part-size";
    size.dataset.cid = String(part.cid);
    meta.append(duration, size);
    checkbox.addEventListener("change", () => {
      const cid = Number(part.cid);
      if (checkbox.checked) {
        if (state.selectedBiliCids.size >= 50) {
          checkbox.checked = false;
          showMessage("一次最多选择 50 个分P。", "error");
          return;
        }
        state.selectedBiliCids.add(cid);
      } else {
        state.selectedBiliCids.delete(cid);
      }
      updateBiliSelectionUI();
    });
    row.append(checkbox, number, name, meta);
    elements.biliPartList.append(row);
  });
  elements.biliVideoTitle.textContent = state.biliMainTitle || "当前 B站视频";
  elements.biliResults.hidden = state.biliParts.length === 0;
  elements.biliEmptyHint.hidden = state.biliParts.length > 0;
  updateBiliSelectionUI();
  updateBilibiliPartSizes();
}

function limitBiliSelect(select, values) {
  const available = new Set(
    (Array.isArray(values) ? values : []).map((value) => String(value)),
  );
  if (!available.size) return;
  const preferred = select.value;
  [...select.options]
    .filter((option) => !available.has(option.value))
    .forEach((option) => option.remove());
  select.value = [...select.options].some((option) => option.value === preferred)
    ? preferred
    : select.options[0]?.value || preferred;
}

async function scanBilibiliVideos() {
  if (state.busy) return;
  state.tab = await getActiveTab();
  if (!state.tab?.id || !isBilibiliPage(state.tab.url)) {
    renderBilibiliParts({ parts: [] });
    showMessage("请先打开一个 B站视频页面。", "error");
    return;
  }
  setBusy(true);
  showMessage("");
  elements.biliScanButtonText.textContent = "正在读取主视频与分P…";
  try {
    const response = await chrome.runtime.sendMessage({
      type: "DINGGE_GET_BILIBILI_PARTS",
      target: "background",
      tabId: state.tab.id,
      pageUrl: state.tab.url,
    });
    if (!response?.ok || !response.partList?.parts?.length) {
      throw new Error(response?.error || "当前页面没有读取到主视频或分P。");
    }
    renderBilibiliParts(response.partList);
    elements.biliScanButtonText.textContent = "重新扫描主视频与分P";
    const qualityResponse = await chrome.runtime.sendMessage({
      type: "DINGGE_GET_BILIBILI_QUALITIES",
      target: "background",
      tabId: state.tab.id,
      pageUrl: state.tab.url,
    });
    if (qualityResponse?.ok) {
      limitBiliSelect(
        elements.biliQuality,
        qualityResponse.availableQualities,
      );
      limitBiliSelect(
        elements.biliAudioQuality,
        qualityResponse.availableAudioQualities,
      );
      limitBiliSelect(elements.biliCodec, qualityResponse.availableCodecs);
    }
    void refreshBilibiliPartSizes();
  } catch (error) {
    renderBilibiliParts({ parts: [] });
    elements.biliScanButtonText.textContent = "扫描主视频与分P";
    showMessage(error?.message || "B站视频扫描失败。", "error");
  } finally {
    setBusy(false);
    updateBiliSelectionUI();
  }
}

function biliDownloadSettings() {
  return {
    biliQuality: elements.biliQuality.value,
    biliAudioQuality: elements.biliAudioQuality.value,
    biliCodec: elements.biliCodec.value,
    biliDownloadAudio: elements.biliAudio.checked,
    biliDownloadSrt: elements.biliSrt.checked,
    biliDownloadAss: elements.biliAss.checked,
    biliDownloadCover: elements.biliCover.checked,
    biliDownloadDanmaku: elements.biliDanmaku.checked,
    biliDialogPreferencesSaved: true,
  };
}

async function startPanelBilibiliDownload(packageParts = false) {
  if (state.busy || !state.tab?.id || !state.biliParts.length) return;
  const partCids = packageParts ? [...state.selectedBiliCids] : [];
  if (packageParts && !partCids.length) {
    showMessage("请至少选择一个分P视频。", "error");
    return;
  }
  setBusy(true);
  showMessage("");
  setProgress(
    3,
    packageParts ? "正在启动分P后台打包…" : "正在解析当前分P…",
  );
  try {
    const currentPart =
      state.biliParts.find(
        (part) =>
          part.bvid &&
          state.biliCurrentBvid &&
          part.bvid.toLowerCase() === state.biliCurrentBvid.toLowerCase(),
      ) ||
      state.biliParts.find(
        (part) => Number(part.page) === state.biliCurrentPage,
      ) || state.biliParts[0];
    const currentTitle =
      state.biliParts.length > 1 && currentPart
        ? `${state.biliMainTitle} - ${
            state.biliListKind === "season" ? "" : "P"
          }${currentPart.page} ${currentPart.title}`
        : state.biliMainTitle;
    const response = await chrome.runtime.sendMessage({
      type: "DINGGE_START_BILIBILI_DOWNLOAD",
      target: "background",
      tabId: state.tab.id,
      title: currentTitle,
      pageUrl: state.tab.url,
      packageParts,
      partCids,
      settings: biliDownloadSettings(),
    });
    if (!response?.started) {
      throw new Error(response?.error || "无法启动 B站视频下载。");
    }
    state.backgroundJobId = response.jobId;
    elements.cancelJobButton.hidden = false;
  } catch (error) {
    elements.progress.hidden = true;
    setBusy(false);
    showMessage(error?.message || "无法启动 B站视频下载。", "error");
  }
}

function updateFeature(feature) {
  state.feature = feature;
  elements.featureTabs.forEach((button) => {
    button.classList.toggle("active", button.dataset.feature === feature);
  });
  elements.secretEntryButton.classList.toggle("active", feature === "secret");
  elements.secretEntryButton.setAttribute(
    "aria-pressed",
    feature === "secret" ? "true" : "false",
  );
  elements.imagesPanel.hidden = feature !== "images";
  elements.screenshotPanel.hidden = feature !== "screenshot";
  elements.douyinPanel.hidden = feature !== "douyin";
  elements.secretPanel.hidden = feature !== "secret";
  elements.bilibiliPanel.hidden = feature !== "bilibili";
  if (feature !== "images") closeImagePreview();
  showMessage("");
  if (!state.backgroundJobId) elements.progress.hidden = true;
  chrome.storage.local.set({ feature });
  if (
    feature === "douyin" &&
    state.tab?.id &&
    !state.douyinVideo &&
    !state.busy
  ) {
    scanDouyinVideo();
  } else if (
    feature === "secret" &&
    state.tab?.id &&
    !state.secretVideo &&
    !state.busy
  ) {
    scanSecretVideo();
  } else if (
    feature === "bilibili" &&
    state.tab?.id &&
    !state.biliParts.length &&
    !state.busy
  ) {
    scanBilibiliVideos();
  } else if (
    feature === "images" &&
    state.tab?.id &&
    !state.images.length &&
    !state.busy
  ) {
    syncImagesFromPage().then(syncNetworkMedia).catch(() => {});
  }
}

function updateMode(mode) {
  state.mode = mode;
  elements.captureOptions.forEach((option) => {
    option.classList.toggle("active", option.dataset.mode === mode);
  });
  elements.buttonText.textContent = mode === "full" ? "拍下完整页面" : "拍下可见区域";
  chrome.storage.local.set({ mode });
}

async function runInTab(func, args = []) {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId: state.tab.id },
    func,
    args,
  });
  return result?.result;
}

function collectPageImages() {
  const found = new Map();
  const add = (rawUrl, details = {}) => {
    if (!rawUrl || typeof rawUrl !== "string") return;
    const cleaned = rawUrl.trim().replace(/^url\((['"]?)(.*)\1\)$/i, "$2");
    if (!cleaned || cleaned === "none" || cleaned.startsWith("blob:")) return;

    try {
      const absoluteUrl = new URL(cleaned, document.baseURI).href;
      if (!/^https?:|^data:image\//i.test(absoluteUrl)) return;
      const existing = found.get(absoluteUrl);
      const width = Number(details.width) || 0;
      const height = Number(details.height) || 0;
      if (!existing || width * height > existing.width * existing.height) {
        found.set(absoluteUrl, {
          url: absoluteUrl,
          width,
          height,
          alt: String(details.alt || "").trim(),
          source: details.source || "image",
        });
      }
    } catch {
      // Ignore malformed image URLs.
    }
  };

  const addSrcset = (srcset, details) => {
    if (!srcset) return;
    srcset.split(",").forEach((candidate) => {
      add(candidate.trim().split(/\s+/)[0], details);
    });
  };

  document.querySelectorAll("img").forEach((image) => {
    const details = {
      width: image.naturalWidth || image.width,
      height: image.naturalHeight || image.height,
      alt: image.alt,
      source: "img",
    };
    add(image.currentSrc, details);
    add(image.src, details);
    ["data-src", "data-original", "data-lazy-src", "data-url", "data-image"].forEach(
      (attribute) => add(image.getAttribute(attribute), { ...details, source: "lazy" }),
    );
    addSrcset(image.srcset, details);
    addSrcset(image.getAttribute("data-srcset"), { ...details, source: "lazy" });
  });

  document.querySelectorAll("source").forEach((source) => {
    addSrcset(source.srcset, { source: "srcset" });
    addSrcset(source.getAttribute("data-srcset"), { source: "lazy" });
  });

  document
    .querySelectorAll('meta[property="og:image"], meta[name="twitter:image"], link[rel="image_src"]')
    .forEach((element) => {
      add(element.content || element.href, { source: "metadata" });
    });

  document.querySelectorAll("*").forEach((element) => {
    const background = getComputedStyle(element).backgroundImage;
    if (!background || background === "none") return;
    const matches = background.matchAll(/url\((['"]?)(.*?)\1\)/gi);
    for (const match of matches) {
      add(match[2], {
        width: element.clientWidth,
        height: element.clientHeight,
        alt: element.getAttribute("aria-label") || "",
        source: "background",
      });
    }
  });

  return [...found.values()].sort((a, b) => {
    const areaDifference = b.width * b.height - a.width * a.height;
    return areaDifference || a.url.localeCompare(b.url);
  });
}

async function scanImages() {
  if (state.busy || !state.tab) return;
  setBusy(true);
  showMessage("");
  elements.scanButtonText.textContent = "正在扫描网页…";
  setProgress(20, "正在读取页面资源…");

  try {
    state.tab = await getActiveTab();
    if (!state.tab || !canAccessPage(state.tab.url)) {
      throw new Error("当前页面受 Chrome 保护，无法读取媒体。");
    }

    let images;
    let pageSessionId = "";
    let contentFilteredCount = 0;
    try {
      const response = await requestPageMedia();
      if (response?.pageUrl) state.pageUrl = response.pageUrl;
      pageSessionId = response?.pageSessionId || "";
      images = response?.images;
      contentFilteredCount = Number(response?.filteredCount) || 0;
    } catch {
      images = await runInTab(collectPageImages);
    }
    const sessionChanged = Boolean(
      state.pageSessionId &&
        pageSessionId &&
        pageSessionId !== state.pageSessionId,
    );
    if (pageSessionId) state.pageSessionId = pageSessionId;
    mergeImages(
      Array.isArray(images) ? images : [],
      sessionChanged,
      contentFilteredCount,
    );
    await syncNetworkMedia();
    setProgress(75, "正在生成媒体预览…");

    elements.emptyHint.hidden = state.images.length > 0;
    elements.imageResults.hidden = state.images.length === 0;
    if (state.images.length === 0) {
      const filteredCount =
        state.contentFilteredCount + state.filteredImageKeys.size;
      showMessage(
        filteredCount
          ? `没有符合当前筛选条件的媒体，已过滤 ${filteredCount} 张小图。`
          : "这个页面中没有找到可提取的媒体资源。",
        filteredCount ? "success" : "error",
      );
    } else {
      showMessage(`扫描完成，共找到 ${state.images.length} 项不重复的媒体。`, "success");
    }
    setProgress(100, "扫描完成");
    setTimeout(() => {
      elements.progress.hidden = true;
    }, 1000);
  } catch (error) {
    elements.progress.hidden = true;
    showMessage(
      error?.message?.includes("Cannot access")
        ? "这个页面不允许扩展读取内容，请换一个普通网页后重试。"
        : error?.message || "扫描失败，请重试或确认扩展拥有当前网站的访问权限。",
      "error",
    );
  } finally {
    elements.scanButtonText.textContent = "重新扫描当前网页";
    setBusy(false);
  }
}

function normalizeImageFilterLevel(value) {
  return ["off", "relaxed", "standard", "strict"].includes(value)
    ? value
    : "standard";
}

function imageFilterThresholds() {
  return {
    relaxed: { minSide: 96, minArea: 20000, utilityMax: 128 },
    standard: { minSide: 120, minArea: 40000, utilityMax: 256 },
    strict: { minSide: 200, minArea: 120000, utilityMax: 512 },
  }[state.imageFilterLevel];
}

function isImageFilterExempt(image) {
  const descriptor = `${image.url || ""} ${image.alt || ""} ${
    image.title || ""
  } ${image.source || ""}`.toLowerCase();
  return (
    image.featured ||
    image.source === "metadata" ||
    /pinimg\.com\/originals\//i.test(image.url || "") ||
    /(?:^|[\/_.?=&-])(?:og|twitter)[-_]?image(?:[\/_.?=&-]|$)/i.test(
      descriptor,
    )
  );
}

function shouldHideSmallImage(image) {
  if (
    !image ||
    image.kind === "video" ||
    state.imageFilterLevel === "off" ||
    isImageFilterExempt(image)
  ) {
    return false;
  }
  const thresholds = imageFilterThresholds();
  const width = Number(image.width) || 0;
  const height = Number(image.height) || 0;
  const descriptor = `${image.url || ""} ${image.alt || ""} ${
    image.title || ""
  } ${image.source || ""}`.toLowerCase();
  const looksLikeUtilityImage =
    /(?:^|[\/_.?=&\s-])(?:favicon|avatar|profile|userpic|icon|logo|badge|emoji|sprite|thumbnail_?small)(?:[\/_.?=&\s-]|$)/i.test(
      descriptor,
    );
  if (
    width &&
    height &&
    (Math.min(width, height) < thresholds.minSide ||
      width * height < thresholds.minArea)
  ) {
    return true;
  }
  return (
    looksLikeUtilityImage &&
    (!width || !height || Math.max(width, height) <= thresholds.utilityMax)
  );
}

function shouldMeasureImage(image) {
  return (
    image?.kind !== "video" &&
    state.imageFilterLevel !== "off" &&
    !isImageFilterExempt(image) &&
    (!Number(image.width) || !Number(image.height)) &&
    !image.dimensionsMeasured
  );
}

function queueImageMeasurement(image) {
  const key = canonicalImageKey(image);
  if (pendingImageMeasurements.has(key)) return;
  const generation = imageMeasurementGeneration;
  const probe = new Image();
  pendingImageMeasurements.set(key, probe);
  probe.referrerPolicy = "no-referrer";
  const finish = (width = 0, height = 0) => {
    pendingImageMeasurements.delete(key);
    if (generation !== imageMeasurementGeneration) return;
    mergeImages([
      {
        ...image,
        width: Number(width) || Number(image.width) || 0,
        height: Number(height) || Number(image.height) || 0,
        dimensionsMeasured: true,
      },
    ]);
  };
  probe.onload = () => finish(probe.naturalWidth, probe.naturalHeight);
  probe.onerror = () => finish();
  probe.src = image.originalUrl || image.url;
}

function mergeImages(incoming, reset = false, contentFilteredCount = null) {
  const previousScrollTop = elements.imageGrid.scrollTop;
  if (reset) {
    closeImagePreview();
    state.images = [];
    state.selectedImages.clear();
    state.autoSelectKinds.clear();
    state.filteredImageKeys.clear();
    state.contentFilteredCount = 0;
    imageMeasurementGeneration += 1;
    pendingImageMeasurements.clear();
  }
  if (Number.isFinite(Number(contentFilteredCount))) {
    state.contentFilteredCount = Math.max(0, Number(contentFilteredCount) || 0);
  }

  const indexes = new Map(
    state.images.map((image, index) => [canonicalImageKey(image), index]),
  );
  let changed = reset;
  let promoted = false;
  const promoteImageAt = (index) => {
    if (index <= 0 || index >= state.images.length) return;
    const selectedItems = new Set(
      [...state.selectedImages]
        .map((selectedIndex) => state.images[selectedIndex])
        .filter(Boolean),
    );
    const [featuredImage] = state.images.splice(index, 1);
    state.images.unshift(featuredImage);
    state.selectedImages.clear();
    state.images.forEach((item, itemIndex) => {
      if (selectedItems.has(item)) state.selectedImages.add(itemIndex);
    });
    indexes.clear();
    state.images.forEach((item, itemIndex) => {
      indexes.set(canonicalImageKey(item), itemIndex);
    });
    promoted = true;
    changed = true;
  };
  incoming.forEach((image) => {
    if (!image?.url) return;
    const enrichedImage = {
      ...image,
      kind: image.kind || "image",
      originalUrl: image.kind === "video" ? "" : pinterestOriginalUrl(image.url),
      previewUrls: uniquePreviewUrls(
        image.poster,
        image.url,
        image.previewUrls || [],
        image.fallbackUrl,
      ),
    };
    const key = canonicalImageKey(enrichedImage);
    if (shouldHideSmallImage(enrichedImage)) {
      state.filteredImageKeys.add(key);
      changed = true;
      return;
    }
    if (shouldMeasureImage(enrichedImage)) {
      queueImageMeasurement(enrichedImage);
      return;
    }
    state.filteredImageKeys.delete(key);
    const existingIndex = indexes.get(key);
    if (existingIndex === undefined) {
      indexes.set(key, state.images.length);
      state.images.push(enrichedImage);
      const mediaType = enrichedImage.kind === "video" ? "video" : "image";
      if (state.autoSelectKinds.has(mediaType)) {
        state.selectedImages.add(state.images.length - 1);
      }
      changed = true;
      if (enrichedImage.kind === "image" && enrichedImage.featured) {
        promoteImageAt(state.images.length - 1);
      }
      return;
    }
    let existing = state.images[existingIndex];
    const incomingImageIsBetter =
      existing.kind === "image" &&
      enrichedImage.kind === "image" &&
      imagePixelScore(enrichedImage) > imagePixelScore(existing);
    const previewUrls = uniquePreviewUrls(
      incomingImageIsBetter ? enrichedImage.url : existing.url,
      incomingImageIsBetter ? enrichedImage.poster : existing.poster,
      incomingImageIsBetter
        ? enrichedImage.previewUrls || []
        : existing.previewUrls || [],
      incomingImageIsBetter ? existing.url : enrichedImage.url,
      incomingImageIsBetter ? existing.poster : enrichedImage.poster,
      incomingImageIsBetter
        ? existing.previewUrls || []
        : enrichedImage.previewUrls || [],
      existing.fallbackUrl,
      enrichedImage.fallbackUrl,
    );
    if (previewUrls.length !== (existing.previewUrls || []).length) {
      existing = { ...existing, previewUrls };
      state.images[existingIndex] = existing;
      changed = true;
    }
    if (existing.kind === "video" && enrichedImage.kind === "video") {
      const existingIsHls =
        existing.streamType === "hls" || isHlsUrl(existing.url);
      const incomingIsHls =
        enrichedImage.streamType === "hls" || isHlsUrl(enrichedImage.url);
      if (existingIsHls && !incomingIsHls) {
        state.images[existingIndex] = {
          ...existing,
          ...enrichedImage,
          previewUrls,
          hlsUrl: existing.hlsUrl || existing.url,
          fallbackUrl:
            enrichedImage.fallbackUrl || existing.fallbackUrl || existing.url,
        };
        changed = true;
        return;
      }
      if (!existingIsHls && incomingIsHls) {
        if (!existing.hlsUrl) {
          state.images[existingIndex] = {
            ...existing,
            previewUrls,
            hlsUrl: enrichedImage.url,
            fallbackUrl: existing.fallbackUrl || enrichedImage.url,
          };
          changed = true;
        }
        return;
      }
    }
    if (
      incomingImageIsBetter ||
      (!existing.alt && enrichedImage.alt) ||
      (!existing.poster && enrichedImage.poster) ||
      (!existing.audioUrl && enrichedImage.audioUrl) ||
      (!existing.originalUrl && enrichedImage.originalUrl) ||
      (!existing.hlsUrl && enrichedImage.hlsUrl)
    ) {
      const preferredIncoming =
        existing.kind === "image" &&
        enrichedImage.kind === "image" &&
        !incomingImageIsBetter
          ? {
              ...enrichedImage,
              url: existing.url,
              originalUrl: existing.originalUrl || enrichedImage.originalUrl,
              width: existing.width,
              height: existing.height,
              pixelScore: existing.pixelScore,
            }
          : enrichedImage;
      state.images[existingIndex] = {
        ...existing,
        ...preferredIncoming,
        previewUrls,
      };
      changed = true;
    }
    if (enrichedImage.kind === "image" && enrichedImage.featured) {
      promoteImageAt(existingIndex);
    }
  });

  if (changed) {
    renderImages();
    elements.imageGrid.scrollTop = promoted ? 0 : previousScrollTop;
    elements.emptyHint.hidden = state.images.length > 0;
    elements.imageResults.hidden = state.images.length === 0;
  }
}

function renderImages() {
  elements.imageGrid.textContent = "";
  state.images.forEach((image, index) => {
    const mediaType = image.kind === "video" ? "video" : "image";
    if (state.mediaFilter !== "all" && state.mediaFilter !== mediaType) return;
    const card = document.createElement("button");
    card.type = "button";
    card.className = "image-card";
    card.dataset.index = String(index);
    card.title = image.alt || image.url;

    const imageCandidates = uniquePreviewUrls(
      image.url,
      image.previewUrls || [],
      image.fallbackUrl,
      image.originalUrl,
    );
    const videoCandidates = imageCandidates.filter((url) => !isHlsUrl(url));
    let preview;

    const showPlaceholder = (text) => {
      const placeholder = document.createElement("div");
      placeholder.className = "media-preview media-placeholder";
      placeholder.textContent = text;
      card.classList.add("preview-error");
      if (preview?.isConnected) preview.replaceWith(placeholder);
      preview = placeholder;
    };

    const installPreview = (kind, candidates) => {
      const element =
        kind === "video"
          ? document.createElement("video")
          : document.createElement("img");
      element.className = "media-preview";
      let candidateIndex = 0;
      if (kind === "video") {
        element.muted = true;
        element.loop = true;
        element.playsInline = true;
        element.preload = "metadata";
        if (image.poster) element.poster = image.poster;
      } else {
        element.alt = image.alt || `网页媒体 ${index + 1}`;
        element.loading = "lazy";
        element.referrerPolicy = "no-referrer";
      }
      const loadCandidate = () => {
        element.src = candidates[candidateIndex];
        if (element instanceof HTMLVideoElement) element.load();
      };
      element.addEventListener("error", () => {
        candidateIndex += 1;
        if (candidateIndex < candidates.length) {
          loadCandidate();
          return;
        }
        if (kind === "video" && image.poster) {
          const previous = preview;
          preview = installPreview("image", [image.poster]);
          if (previous?.isConnected) previous.replaceWith(preview);
          return;
        }
        showPlaceholder(
          image.kind === "video"
            ? "视频预览受限\n仍可尝试下载"
            : "图片预览受限\n仍可尝试下载",
        );
      });
      loadCandidate();
      return element;
    };

    if (image.kind === "video") {
      if (image.poster) {
        preview = installPreview("image", [image.poster]);
      } else if (videoCandidates.length) {
        preview = installPreview("video", videoCandidates);
      } else {
        preview = document.createElement("div");
        preview.className = "media-preview media-placeholder";
        preview.textContent = isHlsUrl(image.url)
          ? "HLS 视频\n可合并下载"
          : "视频可下载";
      }
      card.addEventListener("mouseenter", () => {
        card.querySelector("video")?.play().catch(() => {});
      });
      card.addEventListener("mouseleave", () => {
        const video = card.querySelector("video");
        if (!video) return;
        video.pause();
        video.currentTime = 0;
      });
    } else if (imageCandidates.length) {
      preview = installPreview("image", imageCandidates);
    } else {
      preview = document.createElement("div");
      preview.className = "media-preview media-placeholder";
      preview.textContent = "图片地址不可用";
    }

    const check = document.createElement("span");
    check.className = "check";
    const isSelected = state.selectedImages.has(index);
    check.textContent = isSelected ? "✓" : "";
    card.classList.toggle("selected", isSelected);

    const footer = document.createElement("footer");
    const dimensions = document.createElement("span");
    dimensions.textContent =
      image.width && image.height ? `${image.width}×${image.height}` : "尺寸未知";
    const source = document.createElement("span");
    source.textContent =
      image.kind === "video"
        ? image.streamType === "dash-video"
          ? image.audioUrl
            ? "B站 DASH 音视频"
            : "B站 DASH 视频"
          : image.streamType === "hls" || image.hlsUrl
          ? "HLS 视频"
          : "视频"
        : image.originalUrl
          ? "可取原图"
          : image.source === "background"
            ? "背景"
            : "图片";
    footer.append(dimensions, source);

    card.append(preview, check);
    const zoom = document.createElement("span");
    zoom.className = "zoom-button";
    zoom.textContent = "⤢";
    zoom.title = image.kind === "image" ? "放大当前图片" : "浏览全部媒体";
    zoom.setAttribute("role", "button");
    zoom.setAttribute("tabindex", "0");
    zoom.setAttribute(
      "aria-label",
      image.kind === "image"
        ? `放大第 ${index + 1} 张图片`
        : `从第 ${index + 1} 项打开媒体浏览`,
    );
    const open = (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (image.kind === "image") openSingleImagePreview(index);
      else openImagePreview(index);
    };
    zoom.addEventListener("click", open);
    zoom.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") open(event);
    });
    card.append(zoom);
    card.append(footer);
    card.addEventListener("click", () => toggleImage(index));
    elements.imageGrid.append(card);
  });
  updateSelectionUI();
}

function imagePreviewIndexes() {
  return state.images.map((_image, index) => index);
}

function createViewerItem(imageIndex) {
  const image = state.images[imageIndex];
  if (!image) return null;
  const preferredUrls =
    image.kind === "video"
      ? uniquePreviewUrls(
          image.poster,
          image.previewUrls || [],
          image.fallbackUrl,
        ).filter((url) => !/\.(?:mp4|m3u8|webm|mov)(?:$|[?#])/i.test(url))
      : state.preferOriginalPreview
        ? uniquePreviewUrls(
            image.originalUrl,
            image.url,
            image.previewUrls || [],
            image.fallbackUrl,
          )
        : uniquePreviewUrls(
            image.url,
            image.previewUrls || [],
            image.fallbackUrl,
            image.originalUrl,
          );
  return {
    urls: preferredUrls,
    title:
      image.alt ||
      `${image.kind === "video" ? "视频" : "图片"} ${imageIndex + 1}`,
    meta:
      image.width && image.height
        ? `${image.width} × ${image.height}`
        : image.kind === "video"
          ? "网页视频"
          : "网页图片",
    kind: image.kind === "video" ? "video" : "image",
    url:
      image.kind === "video"
        ? image.hlsUrl || image.url
        : image.originalUrl || image.url,
    fallbackUrl:
      image.kind === "video"
        ? image.url
        : image.fallbackUrl || image.url,
    streamType: image.hlsUrl ? "hls" : image.streamType || "",
    audioUrl: image.audioUrl || "",
    name: imageFilename(image, imageIndex),
    selected: state.selectedImages.has(imageIndex),
    width: Number(image.width) || 0,
    height: Number(image.height) || 0,
  };
}

async function openSingleImagePreview(index) {
  if (!state.tab?.id) return;
  const image = state.images[index];
  if (!image || image.kind === "video") return;
  try {
    const response = await chrome.tabs.sendMessage(state.tab.id, {
      type: "DINGGE_SHOW_IMAGE_PREVIEW",
      items: [createViewerItem(index)],
      startIndex: 0,
      layout: state.previewLayout,
      detailOnly: true,
    });
    if (!response?.shown) throw new Error("页面预览层没有响应。");
    if (!isPersistentSurface) window.close();
  } catch {
    showMessage("无法在网页中放大图片，请刷新当前网页后重试。", "error");
  }
}

function showLargePreview(index) {
  const image = state.images[index];
  if (!image || image.kind === "video") return;
  const indexes = imagePreviewIndexes();
  const position = indexes.indexOf(index);
  const candidates = uniquePreviewUrls(
    image.originalUrl,
    image.url,
    image.previewUrls || [],
    image.fallbackUrl,
  );
  state.previewImageIndex = index;
  elements.previewTitle.textContent = image.alt || `图片 ${position + 1}`;
  elements.previewMeta.textContent =
    image.width && image.height
      ? `${image.width} × ${image.height}`
      : "自动尝试高清地址";
  elements.previewCounter.textContent = `${position + 1} / ${indexes.length}`;
  elements.previousPreviewButton.disabled = indexes.length <= 1;
  elements.nextPreviewButton.disabled = indexes.length <= 1;
  elements.previewFallback.hidden = true;
  elements.previewImage.hidden = false;
  let candidateIndex = 0;
  elements.previewImage.onload = () => {
    elements.previewFallback.hidden = true;
    elements.previewImage.hidden = false;
  };
  elements.previewImage.onerror = () => {
    candidateIndex += 1;
    if (candidateIndex < candidates.length) {
      elements.previewFallback.hidden = false;
      elements.previewFallback.textContent = "高清地址不可用，正在尝试备用图片…";
      elements.previewImage.src = candidates[candidateIndex];
      return;
    }
    elements.previewImage.hidden = true;
    elements.previewFallback.hidden = false;
    elements.previewFallback.textContent =
      "这张图片的远程预览受到网站限制，仍可返回列表尝试下载。";
  };
  if (candidates.length) {
    elements.previewImage.src = candidates[0];
  } else {
    elements.previewImage.hidden = true;
    elements.previewFallback.hidden = false;
    elements.previewFallback.textContent = "没有可用的图片预览地址。";
  }
}

async function openImagePreview(index) {
  if (!state.tab?.id) return;
  const indexes = imagePreviewIndexes();
  const items = indexes.map(createViewerItem).filter(Boolean);
  try {
    const response = await chrome.tabs.sendMessage(state.tab.id, {
      type: "DINGGE_SHOW_IMAGE_PREVIEW",
      items,
      startIndex: Math.max(0, indexes.indexOf(index)),
      layout: state.previewLayout,
    });
    if (!response?.shown) throw new Error("页面预览层没有响应。");
    if (!isPersistentSurface) window.close();
  } catch {
    showMessage("无法在网页中打开图片，请刷新当前网页后重试。", "error");
  }
}

async function openMediaGallery() {
  if (state.busy) return;
  if (!state.images.length) {
    await scanImages();
  }
  if (!state.images.length) {
    showMessage("当前网页还没有发现可浏览的图片或视频。", "error");
    return;
  }
  const selectedIndex = [...state.selectedImages]
    .sort((a, b) => a - b)
    .find((index) => state.images[index]);
  await openImagePreview(selectedIndex ?? 0);
}

function closeImagePreview() {
  if (elements.previewModal.hidden) return;
  elements.previewModal.hidden = true;
  elements.previewImage.onload = null;
  elements.previewImage.onerror = null;
  elements.previewImage.removeAttribute("src");
  state.previewImageIndex = -1;
  state.previewReturnFocus?.focus?.();
  state.previewReturnFocus = null;
}

function moveImagePreview(direction) {
  const indexes = imagePreviewIndexes();
  if (indexes.length <= 1) return;
  const position = indexes.indexOf(state.previewImageIndex);
  const nextPosition = (position + direction + indexes.length) % indexes.length;
  showLargePreview(indexes[nextPosition]);
}

function toggleImage(index) {
  const mediaType = state.images[index]?.kind === "video" ? "video" : "image";
  if (state.selectedImages.has(index)) {
    state.selectedImages.delete(index);
    state.autoSelectKinds.delete(mediaType);
  } else {
    state.selectedImages.add(index);
  }
  const card = elements.imageGrid.querySelector(`[data-index="${index}"]`);
  const selected = state.selectedImages.has(index);
  card?.classList.toggle("selected", selected);
  const check = card?.querySelector(".check");
  if (check) check.textContent = selected ? "✓" : "";
  updateSelectionUI();
}

function toggleMediaKind(kind) {
  const indexes = [];
  state.images.forEach((image, index) => {
    const mediaType = image.kind === "video" ? "video" : "image";
    if (mediaType === kind) indexes.push(index);
  });
  const turnOff = state.mediaFilter === kind;
  state.selectedImages.clear();
  state.autoSelectKinds.clear();
  if (turnOff) {
    state.mediaFilter = "all";
  } else {
    indexes.forEach((index) => state.selectedImages.add(index));
    state.autoSelectKinds.add(kind);
    state.mediaFilter = kind;
  }
  renderImages();
}

function toggleAllMedia() {
  const allSelected =
    state.images.length > 0 &&
    state.images.every((_image, index) => state.selectedImages.has(index));
  if (allSelected) {
    state.selectedImages.clear();
    state.autoSelectKinds.clear();
  } else {
    state.images.forEach((_image, index) => state.selectedImages.add(index));
    state.autoSelectKinds.add("image");
    state.autoSelectKinds.add("video");
  }
  state.mediaFilter = "all";
  renderImages();
}

async function clearScannedMedia() {
  if (state.busy || !state.tab) return;
  closeImagePreview();
  state.images = [];
  state.selectedImages.clear();
  state.autoSelectKinds.clear();
  state.filteredImageKeys.clear();
  state.contentFilteredCount = 0;
  imageMeasurementGeneration += 1;
  pendingImageMeasurements.clear();
  elements.imageGrid.textContent = "";
  elements.imageResults.hidden = true;
  elements.emptyHint.hidden = false;
  elements.scanButtonText.textContent = "扫描当前网页媒体";
  updateSelectionUI();
  try {
    await Promise.allSettled([
      chrome.tabs.sendMessage(state.tab.id, {
        type: "DINGGE_CLEAR_IMAGES",
      }),
      chrome.runtime.sendMessage({
        type: "DINGGE_CLEAR_NETWORK_MEDIA",
        target: "background",
        tabId: state.tab.id,
      }),
    ]);
    showMessage("已清空当前标签页的扫描结果；新出现的媒体仍会继续加入。", "success");
  } catch {
    showMessage("扫描列表已清空。", "success");
  }
}

function updateSelectionUI() {
  const count = state.selectedImages.size;
  const imageCount = state.images.filter((item) => item.kind !== "video").length;
  const videoCount = state.images.filter((item) => item.kind === "video").length;
  const filteredCount =
    state.contentFilteredCount + state.filteredImageKeys.size;
  elements.resultCount.textContent = `共 ${state.images.length} 项 · ${imageCount} 图 ${videoCount} 视频${
    filteredCount ? ` · 已过滤 ${filteredCount} 张小图` : ""
  }`;
  elements.selectedCount.textContent = `已选择 ${count} 项`;
  elements.bulkSelectAllButton.disabled = state.busy || state.images.length === 0;
  elements.bulkSelectImagesButton.disabled = state.busy || imageCount === 0;
  elements.bulkSelectVideosButton.disabled = state.busy || videoCount === 0;
  elements.bulkSelectAllButton.classList.toggle(
    "active",
    state.mediaFilter === "all" &&
      state.images.length > 0 &&
      state.images.every((_item, index) => state.selectedImages.has(index)),
  );
  elements.bulkSelectImagesButton.classList.toggle(
    "active",
    state.mediaFilter === "image",
  );
  elements.bulkSelectVideosButton.classList.toggle(
    "active",
    state.mediaFilter === "video",
  );
  elements.bulkSelectAllButton.setAttribute(
    "aria-pressed",
    String(
      state.mediaFilter === "all" &&
        state.images.length > 0 &&
        state.images.every((_item, index) => state.selectedImages.has(index)),
    ),
  );
  elements.bulkSelectImagesButton.setAttribute(
    "aria-pressed",
    String(state.mediaFilter === "image"),
  );
  elements.bulkSelectVideosButton.setAttribute(
    "aria-pressed",
    String(state.mediaFilter === "video"),
  );
  elements.clearScannedButton.disabled = state.busy || state.images.length === 0;
  elements.openGalleryButton.disabled = state.busy || state.images.length === 0;
  elements.downloadCount.textContent = String(count);
  elements.downloadImagesButton.disabled = state.busy || count === 0;
  elements.packageImagesButton.disabled = state.busy || count === 0;
}

function inferExtension(imageUrl) {
  if (/^data:(?:image|video)\//i.test(imageUrl)) {
    const type = imageUrl.slice(5).split(/[;,]/)[0].split("/")[1]?.toLowerCase();
    if (type === "jpeg") return "jpg";
    if (type === "quicktime") return "mov";
    return sanitizeFilename(type) || "bin";
  }
  try {
    const pathname = new URL(imageUrl).pathname;
    const extension = pathname.match(/\.([a-zA-Z0-9]{2,5})$/)?.[1]?.toLowerCase();
    if (extension === "m3u8") return "ts";
    return extension === "jpeg" ? "jpg" : extension || "jpg";
  } catch {
    return "jpg";
  }
}

function imageFilename(image, index) {
  let base = "";
  try {
    const pathname = decodeURIComponent(new URL(image.url).pathname);
    base = pathname.split("/").filter(Boolean).pop() || "";
    base = base.replace(/\.[a-zA-Z0-9]{2,5}$/i, "");
  } catch {
    base = image.alt;
  }
  const safeBase = sanitizeFilename(base || image.alt || `image-${index + 1}`);
  return `${String(index + 1).padStart(3, "0")}-${safeBase}.${inferExtension(image.url)}`;
}

async function resolveBestDownloadUrl(image) {
  if (!image.originalUrl || image.originalUrl === image.url) return image.url;
  try {
    const response = await fetch(image.originalUrl, {
      method: "HEAD",
      credentials: "include",
      cache: "no-store",
    });
    if (response.ok) {
      const contentType = response.headers.get("content-type") || "";
      if (!contentType || contentType.startsWith("image/")) return image.originalUrl;
    }
  } catch {
    // Fall back to the largest image URL already present in the page.
  }
  return image.url;
}

async function downloadSelectedImages() {
  if (state.busy || state.selectedImages.size === 0) return;
  setBusy(true);
  showMessage("");
  const selected = [...state.selectedImages]
    .sort((a, b) => a - b)
    .map((index) => ({ image: state.images[index], index }));
  let successCount = 0;
  const hlsItems = [];
  const dashItems = [];
  let dashAudioCount = 0;

  try {
    for (let position = 0; position < selected.length; position += 1) {
      const { image, index } = selected[position];
      if (image.streamType === "dash-video") {
        dashItems.push({
          url: image.url,
          audioUrl: image.audioUrl || "",
          name: imageFilename(image, index),
          kind: "video",
        });
        continue;
      }
      if (
        image.hlsUrl ||
        image.streamType === "hls" ||
        /\.m3u8(?:$|[?#])/i.test(image.url)
      ) {
        hlsItems.push({
          url: image.hlsUrl || image.url,
          name: imageFilename(image, index),
        });
        continue;
      }
      setProgress(
        Math.round((position / selected.length) * 95),
        `正在下载第 ${position + 1} / ${selected.length} 项…`,
      );
      try {
        const downloadUrl = await resolveBestDownloadUrl(image);
        if (image.kind !== "video") {
          const response = await chrome.runtime.sendMessage({
            type: "DINGGE_DOWNLOAD_IMAGE",
            target: "background",
            url: downloadUrl,
            filename: imageFilename(image, index),
          });
          if (!response?.started) {
            throw new Error(response?.error || "无法创建图片下载。");
          }
        } else {
          await chrome.downloads.download({
            url: downloadUrl,
            filename: downloadPath("媒体", imageFilename(image, index)),
            saveAs: false,
          });
        }
        successCount += 1;
      } catch {
        // Continue downloading the remaining images.
      }
      await pause(80);
    }
    if (dashItems.length) {
      setProgress(6, "正在创建 B站 DASH 音视频下载…");
      const dashResponse = await chrome.runtime.sendMessage({
        type: "DINGGE_BILIBILI_DASH_DOWNLOAD",
        target: "background",
        items: dashItems,
        pageUrl: state.tab?.url || "",
      });
      if (!dashResponse?.started) {
        throw new Error(dashResponse?.error || "无法启动 B站视频下载。");
      }
      successCount += dashResponse.videoCount || 0;
      dashAudioCount = dashResponse.audioCount || 0;
    }
    if (hlsItems.length) {
      const jobId = crypto.randomUUID();
      state.hlsJobId = jobId;
      state.backgroundJobId = jobId;
      setProgress(8, "正在启动后台 HLS 分片合并…");
      const response = await chrome.runtime.sendMessage({
        type: "DINGGE_START_HLS_DOWNLOAD",
        target: "background",
        jobId,
        items: hlsItems,
      });
      if (!response?.started) {
        throw new Error(response?.error || "无法启动 HLS 后台下载。");
      }
      elements.cancelJobButton.hidden = false;
      showMessage(
        `${successCount} 个普通或 B站视频流已创建下载任务，${hlsItems.length} 个 HLS 视频正在后台合并；现在可以关闭弹窗。`,
        "success",
      );
    } else {
      setProgress(100, "下载任务已创建");
      showMessage(
        dashItems.length
          ? dashAudioCount
            ? `B站 DASH 已分别下载视频流与音频流（音频 ${dashAudioCount} 个），可使用支持 M4S 的工具进行合并。`
            : "B站视频流已开始下载；尚未捕获音频流，请播放视频几秒后重试。"
          : successCount === selected.length
          ? `完成！${successCount} 项媒体已保存到“下载 / 定格媒体”。`
          : `已下载 ${successCount} 项，另有 ${selected.length - successCount} 项被原网站限制。`,
        successCount ? "success" : "error",
      );
    }
  } catch (error) {
    state.backgroundJobId = "";
    elements.cancelJobButton.hidden = true;
    await syncBackgroundJob();
    showMessage(error?.message || "下载任务启动失败。", "error");
  } finally {
    setBusy(Boolean(state.backgroundJobId));
    if (!state.backgroundJobId) {
      setTimeout(() => {
        elements.progress.hidden = true;
      }, 1600);
    }
  }
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zipDateTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  return {
    time:
      (date.getHours() << 11) |
      (date.getMinutes() << 5) |
      Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

function localZipHeader(nameLength, size, crc, time, date) {
  const buffer = new ArrayBuffer(30);
  const view = new DataView(buffer);
  view.setUint32(0, 0x04034b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 0x0800, true);
  view.setUint16(8, 0, true);
  view.setUint16(10, time, true);
  view.setUint16(12, date, true);
  view.setUint32(14, crc, true);
  view.setUint32(18, size, true);
  view.setUint32(22, size, true);
  view.setUint16(26, nameLength, true);
  view.setUint16(28, 0, true);
  return new Uint8Array(buffer);
}

function centralZipHeader(nameLength, size, crc, time, date, offset) {
  const buffer = new ArrayBuffer(46);
  const view = new DataView(buffer);
  view.setUint32(0, 0x02014b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 20, true);
  view.setUint16(8, 0x0800, true);
  view.setUint16(10, 0, true);
  view.setUint16(12, time, true);
  view.setUint16(14, date, true);
  view.setUint32(16, crc, true);
  view.setUint32(20, size, true);
  view.setUint32(24, size, true);
  view.setUint16(28, nameLength, true);
  view.setUint16(30, 0, true);
  view.setUint16(32, 0, true);
  view.setUint16(34, 0, true);
  view.setUint16(36, 0, true);
  view.setUint32(38, 0, true);
  view.setUint32(42, offset, true);
  return new Uint8Array(buffer);
}

function endZipHeader(count, centralSize, centralOffset) {
  const buffer = new ArrayBuffer(22);
  const view = new DataView(buffer);
  view.setUint32(0, 0x06054b50, true);
  view.setUint16(4, 0, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, count, true);
  view.setUint16(10, count, true);
  view.setUint32(12, centralSize, true);
  view.setUint32(16, centralOffset, true);
  view.setUint16(20, 0, true);
  return new Uint8Array(buffer);
}

function buildZip(files) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  const { time, date } = zipDateTime();
  let offset = 0;

  files.forEach((file) => {
    const nameBytes = encoder.encode(file.name);
    const checksum = crc32(file.bytes);
    const localHeader = localZipHeader(
      nameBytes.length,
      file.bytes.length,
      checksum,
      time,
      date,
    );
    localParts.push(localHeader, nameBytes, file.bytes);
    centralParts.push(
      centralZipHeader(
        nameBytes.length,
        file.bytes.length,
        checksum,
        time,
        date,
        offset,
      ),
      nameBytes,
    );
    offset += localHeader.length + nameBytes.length + file.bytes.length;
  });

  const centralOffset = offset;
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  return new Blob(
    [...localParts, ...centralParts, endZipHeader(files.length, centralSize, centralOffset)],
    { type: "application/zip" },
  );
}

async function packageSelectedImages() {
  if (state.busy || state.selectedImages.size === 0) return;
  setBusy(true);
  showMessage("");
  const selected = [...state.selectedImages]
    .sort((a, b) => a - b)
    .map((index) => ({ image: state.images[index], index }));
  const host = sanitizeFilename(new URL(state.tab.url).hostname) || "website";
  const jobId = crypto.randomUUID();
  state.zipJobId = jobId;
  state.backgroundJobId = jobId;
  setProgress(4, "正在把任务转入后台…");

  try {
    const response = await chrome.runtime.sendMessage({
      type: "DINGGE_START_ZIP",
      target: "background",
      jobId,
      archiveName: `${host}-media.zip`,
      images: selected.flatMap(({ image, index }) => {
        const name = imageFilename(image, index);
        if (image.streamType !== "dash-video") {
          return [{
            url:
              image.kind === "video"
                ? image.hlsUrl || image.url
                : image.originalUrl || image.url,
            fallbackUrl:
              image.kind === "video"
                ? image.url
                : image.fallbackUrl || image.url,
            name,
            streamType: image.hlsUrl ? "hls" : image.streamType || "",
          }];
        }
        const baseName = name.replace(/\.(?:m4s|mp4|webm|mov|m4v)$/i, "");
        return [
          {
            url: image.url,
            fallbackUrl: "",
            name: `${baseName}.video.m4s`,
            streamType: "",
          },
          ...(image.audioUrl
            ? [{
                url: image.audioUrl,
                fallbackUrl: "",
                name: `${baseName}.audio.m4s`,
                streamType: "",
              }]
            : []),
        ];
      }),
    });
    if (!response?.started) {
      throw new Error(response?.error || "无法启动后台打包任务。");
    }
    elements.cancelJobButton.hidden = false;
    setProgress(8, "后台打包已启动，可关闭扩展窗口");
    showMessage(
      `已在后台处理 ${selected.length} 项媒体。现在可以切换页面或关闭弹窗，完成后会自动下载并通知你。`,
      "success",
    );
  } catch (error) {
    state.backgroundJobId = "";
    elements.cancelJobButton.hidden = true;
    elements.progress.hidden = true;
    await syncBackgroundJob();
    showMessage(error?.message || "后台打包启动失败。", "error");
  } finally {
    setBusy(Boolean(state.backgroundJobId));
  }
}

function dataUrlToBlob(dataUrl) {
  const [header, base64] = dataUrl.split(",");
  const mime = header.match(/data:([^;]+)/)?.[1] || "image/png";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mime });
}

function joinBytes(parts) {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const joined = new Uint8Array(length);
  let offset = 0;
  parts.forEach((part) => {
    joined.set(part, offset);
    offset += part.length;
  });
  return joined;
}

function pdfText(value) {
  return new TextEncoder().encode(value);
}

function buildPdf(jpegPages) {
  const objects = [null];
  const pageReferences = jpegPages.map(
    (_page, index) => `${3 + index * 3} 0 R`,
  );
  objects[1] = pdfText("<< /Type /Catalog /Pages 2 0 R >>");
  objects[2] = pdfText(
    `<< /Type /Pages /Count ${jpegPages.length} /Kids [${pageReferences.join(" ")}] >>`,
  );

  jpegPages.forEach((page, index) => {
    const pageObject = 3 + index * 3;
    const imageObject = pageObject + 1;
    const contentObject = pageObject + 2;
    const landscape = page.width > page.height;
    const pageWidth = landscape ? 841.89 : 595.28;
    const pageHeight = landscape ? 595.28 : 841.89;
    const scale = Math.min(pageWidth / page.width, pageHeight / page.height);
    const drawWidth = page.width * scale;
    const drawHeight = page.height * scale;
    const drawX = (pageWidth - drawWidth) / 2;
    const drawY = (pageHeight - drawHeight) / 2;
    const content = pdfText(
      `q\n${drawWidth.toFixed(3)} 0 0 ${drawHeight.toFixed(3)} ${drawX.toFixed(3)} ${drawY.toFixed(3)} cm\n/Im0 Do\nQ\n`,
    );

    objects[pageObject] = pdfText(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth.toFixed(2)} ${pageHeight.toFixed(2)}] /Resources << /XObject << /Im0 ${imageObject} 0 R >> >> /Contents ${contentObject} 0 R >>`,
    );
    objects[imageObject] = joinBytes([
      pdfText(
        `<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.bytes.length} >>\nstream\n`,
      ),
      page.bytes,
      pdfText("\nendstream"),
    ]);
    objects[contentObject] = joinBytes([
      pdfText(`<< /Length ${content.length} >>\nstream\n`),
      content,
      pdfText("endstream"),
    ]);
  });

  const header = new Uint8Array([
    0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a,
    0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a,
  ]);
  const chunks = [header];
  const offsets = [0];
  let offset = header.length;
  for (let index = 1; index < objects.length; index += 1) {
    offsets[index] = offset;
    const objectBytes = joinBytes([
      pdfText(`${index} 0 obj\n`),
      objects[index],
      pdfText("\nendobj\n"),
    ]);
    chunks.push(objectBytes);
    offset += objectBytes.length;
  }
  const xrefOffset = offset;
  const xref = [
    `xref\n0 ${objects.length}\n`,
    "0000000000 65535 f \n",
    ...offsets
      .slice(1)
      .map((objectOffset) => `${String(objectOffset).padStart(10, "0")} 00000 n \n`),
    `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
  ].join("");
  chunks.push(pdfText(xref));
  return new Blob(chunks, { type: "application/pdf" });
}

async function jpegPageFromDataUrl(dataUrl) {
  const blob = dataUrlToBlob(dataUrl);
  const bitmap = await createImageBitmap(blob);
  const page = {
    bytes: new Uint8Array(await blob.arrayBuffer()),
    width: bitmap.width,
    height: bitmap.height,
  };
  bitmap.close();
  return page;
}

async function canvasToPdf(canvas) {
  const portraitPageRatio = 841.89 / 595.28;
  const landscape = canvas.width > canvas.height;
  const pageRatio = landscape ? 595.28 / 841.89 : portraitPageRatio;
  const sliceHeight = Math.max(1, Math.floor(canvas.width * pageRatio));
  const pages = [];
  for (let y = 0; y < canvas.height; y += sliceHeight) {
    const height = Math.min(sliceHeight, canvas.height - y);
    const pageCanvas = document.createElement("canvas");
    pageCanvas.width = canvas.width;
    pageCanvas.height = height;
    const pageContext = pageCanvas.getContext("2d", { alpha: false });
    pageContext.fillStyle = "#ffffff";
    pageContext.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
    pageContext.drawImage(
      canvas,
      0,
      y,
      canvas.width,
      height,
      0,
      0,
      canvas.width,
      height,
    );
    const jpegBlob = await new Promise((resolve, reject) => {
      pageCanvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("PDF 页面生成失败。"))),
        "image/jpeg",
        0.92,
      );
    });
    pages.push({
      bytes: new Uint8Array(await jpegBlob.arrayBuffer()),
      width: pageCanvas.width,
      height: pageCanvas.height,
    });
  }
  return buildPdf(pages);
}

async function downloadScreenshotBlob(blob, extension, suffix = "") {
  const objectUrl = URL.createObjectURL(blob);
  const host = sanitizeFilename(new URL(state.tab.url).hostname) || "website";
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const filename = `${host}-${timestamp}${suffix}.${extension}`;
  try {
    await chrome.downloads.download({
      url: objectUrl,
      filename: downloadPath("截图", filename),
      saveAs: false,
    });
  } finally {
    setTimeout(() => URL.revokeObjectURL(objectUrl), 15000);
  }
}

async function downloadScreenshot(dataUrl, format, suffix = "") {
  const extension = format === "jpeg" ? "jpg" : "png";
  await downloadScreenshotBlob(dataUrlToBlob(dataUrl), extension, suffix);
}

async function captureVisible(format) {
  setProgress(35, "正在捕捉当前画面…");
  const captureFormat = format === "pdf" ? "jpeg" : format;
  const dataUrl = await chrome.tabs.captureVisibleTab(state.tab.windowId, {
    format: captureFormat,
    quality: captureFormat === "jpeg" ? 92 : undefined,
  });
  setProgress(80, "正在准备下载…");
  if (format === "pdf") {
    setProgress(85, "正在生成 PDF…");
    await downloadScreenshotBlob(
      buildPdf([await jpegPageFromDataUrl(dataUrl)]),
      "pdf",
    );
  } else {
    await downloadScreenshot(dataUrl, format);
  }
}

function preparePage() {
  if (window.__dinggeCaptureState) return window.__dinggeCaptureState.metrics;
  const root = document.documentElement;
  const body = document.body;
  const width = Math.max(
    root.scrollWidth,
    root.offsetWidth,
    root.clientWidth,
    body?.scrollWidth || 0,
    body?.offsetWidth || 0,
  );
  const height = Math.max(
    root.scrollHeight,
    root.offsetHeight,
    root.clientHeight,
    body?.scrollHeight || 0,
    body?.offsetHeight || 0,
  );
  const fixedElements = [...document.querySelectorAll("*")]
    .filter((element) => {
      const position = getComputedStyle(element).position;
      return position === "fixed" || position === "sticky";
    })
    .map((element) => ({ element, visibility: element.style.visibility }));
  window.__dinggeCaptureState = {
    scrollX: window.scrollX,
    scrollY: window.scrollY,
    rootScrollBehavior: root.style.scrollBehavior,
    rootOverflow: root.style.overflow,
    bodyOverflow: body?.style.overflow || "",
    fixedElements,
    metrics: {
      width,
      height,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio || 1,
    },
  };
  root.style.scrollBehavior = "auto";
  root.style.overflow = "hidden";
  if (body) body.style.overflow = "hidden";
  return window.__dinggeCaptureState.metrics;
}

function movePage(x, y, hideFixed) {
  const captureState = window.__dinggeCaptureState;
  if (!captureState) return;
  captureState.fixedElements.forEach(({ element }) => {
    element.style.visibility = hideFixed ? "hidden" : "visible";
  });
  window.scrollTo(x, y);
}

function restorePage() {
  const captureState = window.__dinggeCaptureState;
  if (!captureState) return;
  const root = document.documentElement;
  const body = document.body;
  root.style.scrollBehavior = captureState.rootScrollBehavior;
  root.style.overflow = captureState.rootOverflow;
  if (body) body.style.overflow = captureState.bodyOverflow;
  captureState.fixedElements.forEach(({ element, visibility }) => {
    element.style.visibility = visibility;
  });
  window.scrollTo(captureState.scrollX, captureState.scrollY);
  delete window.__dinggeCaptureState;
}

async function captureFullPage(format) {
  const metrics = await runInTab(preparePage);
  if (!metrics) throw new Error("无法读取网页尺寸。");
  const maxCssHeight = Math.floor(30000 / Math.max(1, metrics.devicePixelRatio));
  const pageWidth = Math.min(metrics.width, metrics.viewportWidth);
  const pageHeight = Math.min(metrics.height, maxCssHeight);
  const rows = Math.ceil(pageHeight / metrics.viewportHeight);
  if (rows > 80) throw new Error("这个页面太长，超过了整页截图上限。");
  let canvas;
  let context;
  let scale = 1;

  try {
    for (let row = 0; row < rows; row += 1) {
      const y = Math.min(row * metrics.viewportHeight, pageHeight - metrics.viewportHeight);
      await runInTab(movePage, [0, Math.max(0, y), row > 0]);
      await pause(row === 0 ? 650 : 560);
      const tileUrl = await chrome.tabs.captureVisibleTab(state.tab.windowId, {
        format: "png",
      });
      const tile = await createImageBitmap(dataUrlToBlob(tileUrl));
      if (!canvas) {
        scale = tile.width / metrics.viewportWidth;
        canvas = document.createElement("canvas");
        canvas.width = Math.round(pageWidth * scale);
        canvas.height = Math.round(pageHeight * scale);
        context = canvas.getContext("2d", { alpha: false });
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
      }
      const destinationY = Math.round(Math.max(0, y) * scale);
      const drawHeight = Math.min(tile.height, canvas.height - destinationY);
      context.drawImage(
        tile,
        0,
        0,
        Math.min(tile.width, canvas.width),
        drawHeight,
        0,
        destinationY,
        Math.min(tile.width, canvas.width),
        drawHeight,
      );
      tile.close();
      setProgress(
        10 + Math.round(((row + 1) / rows) * 75),
        `正在拼接第 ${row + 1} / ${rows} 段…`,
      );
    }
  } finally {
    await runInTab(restorePage).catch(() => {});
  }

  if (format === "pdf") {
    setProgress(90, "正在分页生成 PDF…");
    await downloadScreenshotBlob(await canvasToPdf(canvas), "pdf", "-fullpage");
  } else {
    setProgress(90, "正在生成完整图片…");
    const mime = format === "jpeg" ? "image/jpeg" : "image/png";
    await downloadScreenshot(
      canvas.toDataURL(mime, format === "jpeg" ? 0.92 : undefined),
      format,
      "-fullpage",
    );
  }
}

async function captureScreenshot() {
  if (state.busy || !state.tab) return;
  const format = elements.format.value;
  const delay = Number(elements.delay.value);
  chrome.storage.local.set({ format, delay: elements.delay.value });
  setBusy(true);
  showMessage("");
  setProgress(3, delay ? `${delay} 秒后拍摄…` : "准备拍摄…");
  try {
    if (delay) {
      for (let remaining = delay; remaining > 0; remaining -= 1) {
        setProgress(((delay - remaining) / delay) * 10, `${remaining} 秒后拍摄…`);
        await pause(1000);
      }
    }
    state.tab = await getActiveTab();
    if (!state.tab || !canAccessPage(state.tab.url)) {
      throw new Error("当前页面受 Chrome 保护，无法截图。");
    }
    if (state.mode === "full") {
      await captureFullPage(format);
    } else {
      await captureVisible(format);
    }
    setProgress(100, "截图已保存");
    showMessage("完成！图片已保存到“下载 / 定格截图”文件夹。", "success");
  } catch (error) {
    elements.progress.hidden = true;
    showMessage(error?.message || "截图失败，请刷新网页后重试。", "error");
  } finally {
    setBusy(false);
    setTimeout(() => {
      elements.progress.hidden = true;
    }, 1800);
  }
}

elements.featureTabs.forEach((button) => {
  button.addEventListener("click", () => updateFeature(button.dataset.feature));
});
elements.secretEntryButton.addEventListener("click", () => updateFeature("secret"));
elements.openGalleryButton.addEventListener("click", openMediaGallery);
elements.imageFilterLevelSelect.addEventListener("change", () => {
  const imageFilterLevel = normalizeImageFilterLevel(
    elements.imageFilterLevelSelect.value,
  );
  chrome.storage.local.set({ imageFilterLevel }).catch((error) => {
    showMessage(error?.message || "图片筛选设置保存失败。", "error");
  });
});
elements.openOptionsButton.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});
elements.captureOptions.forEach((option) => {
  option.addEventListener("click", () => updateMode(option.dataset.mode));
});
elements.scanButton.addEventListener("click", scanImages);
elements.douyinScanButton.addEventListener("click", scanDouyinVideo);
elements.douyinDownloadButton.addEventListener("click", startDouyinDownload);
elements.douyinQuality.addEventListener("change", updateDouyinVideoMeta);
elements.douyinCodec.addEventListener("change", updateDouyinQualityOptions);
elements.douyinDownloadCover.addEventListener("change", () => {
  chrome.storage.local
    .set({ douyinDownloadCover: elements.douyinDownloadCover.checked })
    .catch(() => {});
});
elements.secretScanButton.addEventListener("click", scanSecretVideo);
elements.secretDownloadButton.addEventListener("click", startSecretDownload);
elements.secretQuality.addEventListener("change", updateSecretVideoMeta);
elements.biliScanButton.addEventListener("click", scanBilibiliVideos);
[elements.biliQuality, elements.biliAudioQuality, elements.biliCodec, elements.biliAudio]
  .forEach((control) => {
    control.addEventListener("change", () => {
      void refreshBilibiliPartSizes();
    });
  });
elements.biliSelectAllButton.addEventListener("click", () => {
  const selectable = state.biliParts.slice(0, 50);
  const allSelected = selectable.every((part) =>
    state.selectedBiliCids.has(Number(part.cid)),
  );
  state.selectedBiliCids.clear();
  if (!allSelected) {
    selectable.forEach((part) =>
      state.selectedBiliCids.add(Number(part.cid)),
    );
  }
  [...elements.biliPartList.querySelectorAll("input")].forEach(
    (input, index) => {
      input.checked = !allSelected && index < 50;
    },
  );
  updateBiliSelectionUI();
});
elements.biliDownloadCurrentButton.addEventListener("click", () =>
  startPanelBilibiliDownload(false),
);
elements.biliPackageSelectedButton.addEventListener("click", () =>
  startPanelBilibiliDownload(true),
);
elements.clearScannedButton.addEventListener("click", clearScannedMedia);
elements.bulkSelectAllButton.addEventListener("click", toggleAllMedia);
elements.bulkSelectImagesButton.addEventListener("click", () => toggleMediaKind("image"));
elements.bulkSelectVideosButton.addEventListener("click", () => toggleMediaKind("video"));
elements.downloadImagesButton.addEventListener("click", downloadSelectedImages);
elements.packageImagesButton.addEventListener("click", packageSelectedImages);
elements.captureButton.addEventListener("click", captureScreenshot);
elements.cancelJobButton.addEventListener("click", cancelBackgroundJob);
elements.closePreviewButton.addEventListener("click", closeImagePreview);
elements.previousPreviewButton.addEventListener("click", () => moveImagePreview(-1));
elements.nextPreviewButton.addEventListener("click", () => moveImagePreview(1));
elements.previewModal.addEventListener("click", (event) => {
  if (event.target === elements.previewModal) closeImagePreview();
});
document.addEventListener("keydown", (event) => {
  if (elements.previewModal.hidden) return;
  if (event.key === "Escape") {
    event.preventDefault();
    closeImagePreview();
  } else if (event.key === "ArrowLeft") {
    event.preventDefault();
    moveImagePreview(-1);
  } else if (event.key === "ArrowRight") {
    event.preventDefault();
    moveImagePreview(1);
  }
});
chrome.storage.onChanged?.addListener((changes, areaName) => {
  if (areaName !== "local") return;
  if (changes.preferOriginalPreview) {
    state.preferOriginalPreview = changes.preferOriginalPreview.newValue !== false;
  }
  if (changes.previewLayout) {
    state.previewLayout =
      changes.previewLayout.newValue === "waterfall" ? "waterfall" : "square";
  }
  if (changes.imageFilterLevel) {
    state.imageFilterLevel = normalizeImageFilterLevel(
      changes.imageFilterLevel.newValue,
    );
    elements.imageFilterLevelSelect.value = state.imageFilterLevel;
    closeImagePreview();
    state.images = [];
    state.selectedImages.clear();
    state.filteredImageKeys.clear();
    state.contentFilteredCount = 0;
    imageMeasurementGeneration += 1;
    pendingImageMeasurements.clear();
    renderImages();
    setTimeout(() => {
      syncImagesFromPage();
      syncNetworkMedia();
    }, 50);
  }
});

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type === "DINGGE_SECRET_VIDEOS_UPDATED") {
    if (
      state.feature !== "secret" ||
      sender.tab?.id !== state.tab?.id ||
      !Array.isArray(message.videos)
    ) return;
    const selectedVideoKey = secretVideoKey(state.secretVideo);
    const selectedCandidate = state.secretVideo?.candidates?.[
      Number(elements.secretQuality.value) || 0
    ];
    const merged = mergeSecretVideoUpdates(state.secretVideos, message.videos);
    renderSecretVideos(
      merged.videos,
      selectedVideoKey,
      secretCandidateKey(selectedCandidate),
    );
    if (merged.addedCount > 0) {
      elements.secretScanButtonText.textContent = "重新识别当前页面视频";
      showMessage(
        `新发现 ${merged.addedCount} 个页面视频，已自动加入列表。`,
        "success",
      );
    }
    return;
  }

  if (message?.type === "DINGGE_JOB_STATUS") {
    if (message.job) {
      showBackgroundJob(message.job);
    } else if (
      !message.canceledJobId ||
      message.canceledJobId === state.backgroundJobId
    ) {
      clearBackgroundJobUI();
    }
    return;
  }

  if (message?.jobId && message.jobId === state.hlsJobId) {
    if (message.type === "DINGGE_HLS_PROGRESS") {
      setProgress(message.percent || 0, message.text || "后台正在合并 HLS 分片…");
      return;
    }
    if (message.type === "DINGGE_HLS_DOWNLOAD_COMPLETE") {
      clearBackgroundJobUI();
      setProgress(100, "HLS 视频已开始下载");
      showMessage(
        message.failedCount
          ? `已合并 ${message.successCount} 个 HLS 视频，${message.failedCount} 个处理失败。`
          : `完成！${message.successCount} 个 HLS 视频已合并并开始下载。`,
        message.successCount ? "success" : "error",
      );
      setTimeout(() => {
        elements.progress.hidden = true;
      }, 1800);
      return;
    }
    if (message.type === "DINGGE_HLS_DOWNLOAD_ERROR") {
      clearBackgroundJobUI();
      elements.progress.hidden = true;
      showMessage(message.error || "HLS 视频处理失败。", "error");
      return;
    }
  }

  if (message?.jobId && message.jobId === state.zipJobId) {
    if (message.type === "DINGGE_ZIP_PROGRESS") {
      setProgress(message.percent || 0, message.text || "后台正在打包…");
      return;
    }
    if (message.type === "DINGGE_ZIP_DOWNLOAD_STARTED") {
      clearBackgroundJobUI();
      setProgress(100, "ZIP 已开始下载");
      showMessage(
        message.failedCount
          ? `ZIP 已开始下载：成功打包 ${message.successCount} 项，${message.failedCount} 项受原网站限制。`
          : `完成！${message.successCount} 项媒体已在后台打包并开始下载。`,
        "success",
      );
      setTimeout(() => {
        elements.progress.hidden = true;
      }, 1800);
      return;
    }
    if (message.type === "DINGGE_ZIP_ERROR") {
      clearBackgroundJobUI();
      elements.progress.hidden = true;
      showMessage(message.error || "后台打包失败。", "error");
      return;
    }
  }

  if (message?.type !== "DINGGE_IMAGES_ADDED") {
    return;
  }
  if (sender.tab?.id !== state.tab?.id || !Array.isArray(message.images)) return;

  const pageChanged = Boolean(
    state.pageSessionId &&
      message.pageSessionId &&
      message.pageSessionId !== state.pageSessionId,
  );
  if (message.pageUrl) state.pageUrl = message.pageUrl;
  if (message.pageSessionId) state.pageSessionId = message.pageSessionId;
  const before = state.images.length;
  mergeImages(message.images, pageChanged, message.filteredCount);
  const added = state.images.length - (pageChanged ? 0 : before);
  if (added > 0 && state.feature === "images") {
    elements.scanButtonText.textContent = "同步当前网页";
  }
});

initialize();
