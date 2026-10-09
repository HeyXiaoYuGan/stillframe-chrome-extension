(async () => {
  const text = (value) => String(value ?? "").trim();
  const normalizeUrl = (rawUrl) => {
    if (typeof rawUrl !== "string") return "";
    const cleaned = rawUrl
      .trim()
      .replace(/\\u002f/gi, "/")
      .replace(/\\u0026/gi, "&")
      .replace(/\\\//g, "/")
      .replace(/&amp;/gi, "&");
    if (!cleaned || cleaned.startsWith("blob:")) return "";
    try {
      const parsed = new URL(cleaned.startsWith("//") ? `https:${cleaned}` : cleaned, location.href);
      return /^https?:$/i.test(parsed.protocol) ? parsed.href : "";
    } catch {
      return "";
    }
  };
  const mediaFormat = (rawUrl, hint = "") => {
    const value = `${hint} ${rawUrl}`.toLowerCase();
    if (/m3u8|\bhls\b/.test(value)) return "hls";
    if (/\.webm(?:$|[?#])|\bwebm\b/.test(value)) return "webm";
    if (/\.mp4(?:$|[?#])|\bmp4\b/.test(value)) return "mp4";
    return "";
  };
  const qualityNumber = (...values) => {
    for (const value of values) {
      const match = text(value).match(/(?:^|\D)(\d{3,4})(?:p|\D|$)/i);
      const quality = Number(match?.[1] || 0);
      if (quality >= 144 && quality <= 4320) return quality;
    }
    return 0;
  };
  const candidates = new Map();
  const endpoints = new Map();
  let sawBlobUrl = false;
  let sawDashManifest = false;
  const isPornhubHostname = (hostname) => {
    const normalized = text(hostname).toLowerCase().replace(/\.$/, "");
    return [
      "pornhub.com",
      "pornhub.org",
      "pornhub.xxx",
      "pornhubpremium.com",
    ].some(
      (baseHostname) =>
        normalized === baseHostname || normalized.endsWith(`.${baseHostname}`),
    );
  };
  const addCandidate = (rawUrl, metadata = {}) => {
    const rawValue = text(rawUrl);
    if (
      rawValue &&
      !/^(?:https?:)?\/\//i.test(rawValue) &&
      !/^blob:/i.test(rawValue) &&
      !/\.(?:m3u8|mp4|webm|mpd)(?:$|[?#])/i.test(rawValue)
    ) return;
    if (/^blob:/i.test(rawValue)) sawBlobUrl = true;
    const url = normalizeUrl(rawUrl);
    if (!url) return;
    if (
      /\.mpd(?:$|[?#])|\bmpeg-dash\b|application\/dash\+xml/i.test(
        `${metadata.format || ""} ${metadata.type || ""} ${url}`,
      )
    ) {
      sawDashManifest = true;
      return;
    }
    const isQualityEndpoint = (() => {
      try {
        const parsed = new URL(url);
        return (
          isPornhubHostname(parsed.hostname) &&
          /\/(?:video\/)?get_media(?:\/|$)/i.test(parsed.pathname)
        );
      } catch {
        return false;
      }
    })();
    if (isQualityEndpoint) {
      endpoints.set(url, { ...metadata });
      return;
    }
    const format = mediaFormat(url, metadata.format || metadata.type || "");
    const quality = qualityNumber(
      metadata.quality,
      metadata.qualityLabel,
      metadata.height,
      metadata.label,
      url,
    );
    if (!format) return;
    const key = `${quality || "auto"}:${format}`;
    const existing = candidates.get(key);
    if (existing) {
      if (url !== existing.url && !existing.fallbackUrls.includes(url)) {
        existing.fallbackUrls.push(url);
      }
      return;
    }
    candidates.set(key, {
      url,
      fallbackUrls: [],
      quality,
      height: quality,
      format,
      streamType: format === "hls" ? "hls" : "",
      selectable: true,
      label: quality ? `${quality}P · ${format.toUpperCase()}` : format.toUpperCase(),
    });
  };
  const inspectObject = (root) => {
    if (typeof root === "string") {
      addCandidate(root);
      return;
    }
    if (!root || typeof root !== "object") return;
    const visited = new WeakSet();
    const stack = [{ value: root, depth: 0 }];
    let visitedCount = 0;
    while (stack.length && visitedCount < 20000) {
      const { value, depth } = stack.pop();
      if (!value || typeof value !== "object" || visited.has(value)) continue;
      visited.add(value);
      visitedCount += 1;
      const metadata = {
        quality: value.quality ?? value.qualityLabel ?? value.height,
        format: value.format ?? value.type ?? value.mediaType,
        label: value.label ?? value.text,
      };
      [
        value.videoUrl,
        value.video_url,
        value.mediaUrl,
        value.media_url,
        value.playbackUrl,
        value.playback_url,
        value.downloadUrl,
        value.download_url,
        value.url,
        value.src,
        value.remoteUrl,
        value.remote_url,
      ].forEach((url) => addCandidate(url, metadata));
      if (depth >= 12) continue;
      const children = Array.isArray(value) ? value : Object.values(value);
      for (let index = children.length - 1; index >= 0; index -= 1) {
        const child = children[index];
        if (child && typeof child === "object") {
          stack.push({ value: child, depth: depth + 1 });
        } else if (typeof child === "string") {
          addCandidate(child, metadata);
        }
      }
    }
  };
  const scriptMediaUrls = (rawText) => {
    const normalized = text(rawText)
      .replace(/\\u002f/gi, "/")
      .replace(/\\u0026/gi, "&")
      .replace(/\\\//g, "/")
      .replace(/&amp;/gi, "&");
    return normalized.match(/https?:\/\/[^"'\s<>\\]+/gi) || [];
  };

  let jsonLd = null;
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const parsed = JSON.parse(script.textContent || "null");
      const entries = Array.isArray(parsed) ? parsed : [parsed];
      jsonLd = entries.find((entry) => /VideoObject/i.test(String(entry?.["@type"] || ""))) || jsonLd;
      entries.forEach(inspectObject);
    } catch {
      // Ignore unrelated or malformed structured data.
    }
  }
  const knownRoots = [
    globalThis.flashvars,
    globalThis.playerObjList,
    globalThis.videoVars,
    globalThis.videoData,
  ];
  for (const key of Object.getOwnPropertyNames(globalThis)) {
    if (!/^(?:flashvars_|playerObjList|videoVars|videoData)/i.test(key)) continue;
    try {
      knownRoots.push(globalThis[key]);
    } catch {
      // Ignore page globals implemented with throwing accessors.
    }
  }
  knownRoots.forEach(inspectObject);
  const pageVideos = [...document.querySelectorAll("video")];
  const videoScore = (video) => {
    let area = Number(video.videoWidth || 0) * Number(video.videoHeight || 0);
    try {
      const rect = video.getBoundingClientRect();
      const visibleWidth = Math.max(
        0,
        Math.min(rect.right, innerWidth) - Math.max(rect.left, 0),
      );
      const visibleHeight = Math.max(
        0,
        Math.min(rect.bottom, innerHeight) - Math.max(rect.top, 0),
      );
      area = Math.max(area, visibleWidth * visibleHeight);
    } catch {
      // Intrinsic dimensions remain available when layout access fails.
    }
    return Number(!video.paused && !video.ended) * 1e12 + area;
  };
  const pageVideo =
    document.querySelector("#player video, .videoWrapper video, .mgp_videoWrapper video") ||
    pageVideos.sort((left, right) => videoScore(right) - videoScore(left))[0] ||
    null;
  const captureFirstFrame = async (video) => {
    const sourceWidth = Number(video?.videoWidth || 0);
    const sourceHeight = Number(video?.videoHeight || 0);
    if (!video || Number(video.readyState || 0) < 2 || !sourceWidth || !sourceHeight) {
      return "";
    }
    const originalTime = Number(video.currentTime || 0);
    const wasPaused = Boolean(video.paused);
    let movedToStart = false;
    try {
      const seekableStart = video.seekable?.length
        ? Number(video.seekable.start(0) || 0)
        : 0;
      const firstFrameTime = Math.max(0, seekableStart + 0.05);
      if (Math.abs(originalTime - firstFrameTime) > 0.15) {
        await new Promise((resolve) => {
          let settled = false;
          const finish = () => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            video.removeEventListener?.("seeked", finish);
            resolve();
          };
          const timer = setTimeout(finish, 1500);
          video.addEventListener?.("seeked", finish, { once: true });
          try {
            video.currentTime = firstFrameTime;
            movedToStart = true;
          } catch {
            finish();
          }
        });
      }
      const scale = Math.min(1, 640 / sourceWidth, 360 / sourceHeight);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(sourceWidth * scale));
      canvas.height = Math.max(1, Math.round(sourceHeight * scale));
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) return "";
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
      return /^data:image\/jpeg;base64,/i.test(dataUrl) && dataUrl.length <= 400_000
        ? dataUrl
        : "";
    } catch {
      return "";
    } finally {
      if (movedToStart && Number.isFinite(originalTime)) {
        try {
          video.currentTime = originalTime;
          if (!wasPaused && video.paused) video.play?.().catch(() => {});
        } catch {
          // Restoring playback is best-effort after frame capture.
        }
      }
    }
  };
  [
    pageVideo?.currentSrc,
    pageVideo?.src,
    ...[...(pageVideo?.querySelectorAll?.("source") || [])].map((source) => source.src),
    jsonLd?.contentUrl,
  ].forEach((url) => addCandidate(url));
  [...(document.scripts || [])].slice(-300).forEach((script) => {
    const body = script.textContent || "";
    if (!/(?:mediaDefinitions?|videoUrl|mediaUrl|playbackUrl|downloadUrl)/i.test(body)) return;
    scriptMediaUrls(body).forEach((url) => addCandidate(url));
  });

  try {
    performance
      .getEntriesByType("resource")
      .filter((entry) =>
        /\/get_media(?:[/?#]|$)|\.m3u8(?:$|[?#])|\.mp4(?:$|[?#])|\.webm(?:$|[?#])|\.mpd(?:$|[?#])|format=mp4/i.test(
          entry.name || "",
        ),
      )
      .sort((left, right) => Number(right.startTime || 0) - Number(left.startTime || 0))
      .slice(0, 100)
      .forEach((entry) => addCandidate(entry.name));
  } catch {
    // Resource timing can be unavailable or cleared by the page.
  }

  for (const [endpoint, metadata] of [...endpoints.entries()].slice(0, 8)) {
    try {
      const response = await fetch(endpoint, {
        credentials: "include",
        cache: "no-store",
        headers: { Accept: "application/json, text/plain, */*" },
      });
      if (!response.ok) continue;
      const body = await response.text();
      try {
        const parsed = JSON.parse(body);
        if (typeof parsed === "string") addCandidate(parsed, metadata);
        else inspectObject(parsed);
      } catch {
        scriptMediaUrls(body).forEach((url) => addCandidate(url, metadata));
      }
    } catch {
      // A failed quality endpoint must not hide direct media URLs already found.
    }
  }

  const orderedCandidates = [...candidates.values()]
    .sort(
      (left, right) =>
        Number(right.quality || 0) - Number(left.quality || 0) ||
        Number(left.format !== "mp4") - Number(right.format !== "mp4"),
    )
    .slice(0, 30);
  const title = text(
    jsonLd?.name ||
      document.querySelector('meta[property="og:title"]')?.content ||
      document.querySelector("h1")?.textContent ||
      document.title ||
      "Pornhub video",
  )
    .replace(/\s*[-|]\s*Pornhub.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  const cover =
    (await captureFirstFrame(pageVideo)) ||
    normalizeUrl(
      jsonLd?.thumbnailUrl?.[0] ||
        jsonLd?.thumbnailUrl ||
        document.querySelector('meta[property="og:image"]')?.content ||
        pageVideo?.poster ||
        "",
    );
  const durationText = text(jsonLd?.duration);
  const durationMatch = durationText.match(
    /^PT(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?$/i,
  );
  const duration = durationMatch
    ? Number(durationMatch[1] || 0) * 3600 +
      Number(durationMatch[2] || 0) * 60 +
      Number(durationMatch[3] || 0)
    : Number(pageVideo?.duration || 0) || 0;
  const unsupportedReason = !orderedCandidates.length
    ? sawDashManifest
      ? "当前页面只暴露了 DASH 播放清单，尚未读取到可直接保存的 MP4、WebM 或 HLS 地址。若该清单受 DRM 保护，扩展不会尝试解密。"
      : sawBlobUrl
        ? "播放器当前使用 Blob 地址，尚未捕获它对应的 MP4、WebM 或 HLS 请求。请播放视频几秒后再次识别。"
        : "没有从当前播放器读取到可直接保存的视频地址。请播放视频几秒后再次识别。"
    : "";
  return {
    title,
    cover,
    duration,
    pageUrl: location.href,
    siteLabel: "Pornhub",
    unsupportedReason,
    candidates: orderedCandidates,
  };
})();
