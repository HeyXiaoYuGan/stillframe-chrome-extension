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
    if (/m3u8|mpegurl|\bhls\b/.test(value)) return "hls";
    if (/\.webm(?:$|[?#])|video\/webm|\bwebm\b/.test(value)) return "webm";
    if (/\.mp4(?:$|[?#])|video\/mp4|format=mp4|\bmp4\b/.test(value)) return "mp4";
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

  const videos = [...document.querySelectorAll("video")];
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
      // Dimensions from the media element remain a useful fallback.
    }
    return Number(!video.paused && !video.ended) * 1e12 + area;
  };
  const pageVideo =
    videos.sort((left, right) => videoScore(right) - videoScore(left))[0] || null;
  const candidates = [];
  const seenUrls = new Set();
  let sawBlobUrl = false;
  let sawDashManifest = false;
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
    if (seenUrls.has(url)) return;
    const format = mediaFormat(url, metadata.format || metadata.type || "");
    if (!format) return;
    const quality = qualityNumber(
      metadata.quality,
      metadata.qualityLabel,
      metadata.height,
      metadata.label,
      url,
    );
    seenUrls.add(url);
    candidates.push({
      url,
      fallbackUrls: [],
      quality,
      height: Number(metadata.height || quality) || 0,
      width: Number(metadata.width || 0) || 0,
      bitrate:
        Number(
          metadata.bitrate ||
            metadata.bit_rate ||
            metadata.bandwidth ||
            metadata.videoBitrate ||
            0,
        ) || 0,
      sizeBytes:
        Number(
          metadata.sizeBytes ||
            metadata.fileSize ||
            metadata.filesize ||
            metadata.contentLength ||
            0,
        ) || 0,
      format,
      streamType: format === "hls" ? "hls" : "",
      selectable: true,
      label: quality ? `${quality}P · ${format.toUpperCase()}` : format.toUpperCase(),
    });
  };

  videos.forEach((video) => {
    addCandidate(video.currentSrc, {
      width: video.videoWidth,
      height: video.videoHeight,
    });
    addCandidate(video.src, {
      width: video.videoWidth,
      height: video.videoHeight,
    });
    [...(video.querySelectorAll?.("source") || [])].forEach((source) => {
      addCandidate(source.src, {
        type: source.type,
        width: video.videoWidth,
        height: video.videoHeight,
        label: source.getAttribute("size") || source.getAttribute("label"),
      });
    });
  });

  const inspectObject = (root) => {
    if (typeof root === "string") {
      addCandidate(root);
      return;
    }
    if (!root || typeof root !== "object") return;
    const visited = new WeakSet();
    const stack = [{ value: root, depth: 0 }];
    let visitedCount = 0;
    while (stack.length && visitedCount < 12000) {
      const { value, depth } = stack.pop();
      if (!value || typeof value !== "object" || visited.has(value)) continue;
      visited.add(value);
      visitedCount += 1;
      const metadata = {
        quality: value.quality ?? value.qualityLabel ?? value.height,
        height: value.height,
        width: value.width,
        format: value.format ?? value.type ?? value.mimeType,
        label: value.label ?? value.name,
        bitrate:
          value.bitrate ?? value.bit_rate ?? value.bandwidth ?? value.videoBitrate,
        sizeBytes:
          value.sizeBytes ?? value.fileSize ?? value.filesize ?? value.contentLength,
      };
      [
        value.videoUrl,
        value.video_url,
        value.playbackUrl,
        value.playback_url,
        value.source,
        value.src,
        value.url,
      ].forEach((url) => addCandidate(url, metadata));
      if (depth >= 10) continue;
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
  for (const script of document.querySelectorAll('script[type="application/json"], script[type="application/ld+json"]')) {
    try {
      inspectObject(JSON.parse(script.textContent || "null"));
    } catch {
      // Ignore unrelated or malformed application data.
    }
  }
  [
    globalThis.__NEXT_DATA__,
    globalThis.__NUXT__,
    globalThis.__APOLLO_STATE__,
    globalThis.__INITIAL_STATE__,
  ].forEach(inspectObject);
  const hookedRecords = Array.isArray(
    globalThis.__STILLFRAME_ONLYFANS_HOOK__?.records,
  )
    ? globalThis.__STILLFRAME_ONLYFANS_HOOK__.records.slice(0, 100)
    : [];
  hookedRecords.forEach((record) => {
    (record.candidates || []).forEach((candidate) =>
      addCandidate(candidate.url, candidate),
    );
  });

  const scriptMediaUrls = (rawText) => {
    const normalized = text(rawText)
      .replace(/\\u002f/gi, "/")
      .replace(/\\u0026/gi, "&")
      .replace(/\\\//g, "/")
      .replace(/&amp;/gi, "&");
    return normalized.match(/https?:\/\/[^"'\s<>\\]+/gi) || [];
  };
  [...(document.scripts || [])].slice(-120).forEach((script) => {
    const body = script.textContent || "";
    if (!/(?:\.m3u8|\.mp4|\.webm|\.mpd|playbackUrl|videoUrl)/i.test(body)) return;
    scriptMediaUrls(body).forEach((url) => addCandidate(url));
  });

  try {
    const recentMedia = performance
      .getEntriesByType("resource")
      .filter((entry) =>
        /\.m3u8(?:$|[?#])|\.mp4(?:$|[?#])|\.webm(?:$|[?#])|\.mpd(?:$|[?#])|format=mp4/i.test(
          entry.name || "",
        ),
      )
      .sort((left, right) => Number(right.startTime || 0) - Number(left.startTime || 0))
      .slice(0, 24);
    recentMedia.forEach((entry) => addCandidate(entry.name));
  } catch {
    // Resource timing can be unavailable or cleared by the page.
  }

  candidates.sort(
    (left, right) =>
      Number(right.quality || 0) - Number(left.quality || 0) ||
      Number(left.format !== "mp4") - Number(right.format !== "mp4"),
  );
  const fallbackTitle = text(
    document.querySelector('meta[property="og:title"]')?.content ||
      document.querySelector("h1")?.textContent ||
      document.title ||
      "OnlyFans video",
  )
    .replace(/\s*[-|]\s*OnlyFans.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  const videoTitle = (video, index) => {
    let nearbyTitle = "";
    try {
      nearbyTitle = text(
        video
          ?.closest("article, [role='article'], .post, .b-post")
          ?.querySelector(
            "h1, h2, h3, [data-name='post-title'], [data-name='post-text']",
          )?.textContent,
      );
    } catch {
      // Page markup changes should not block fallback metadata.
    }
    return (
      nearbyTitle.replace(/\s+/g, " ").slice(0, 120).trim() ||
      (videos.length > 1 ? `${fallbackTitle} · 视频 ${index + 1}` : fallbackTitle)
    );
  };
  const candidateByUrl = new Map(
    candidates.map((candidate) => [candidate.url, candidate]),
  );
  const assignedUrls = new Set();
  const videoItems = videos.map((video, index) => {
    const directUrls = [
      video.currentSrc,
      video.src,
      ...[...(video.querySelectorAll?.("source") || [])].map((source) => source.src),
    ]
      .map(normalizeUrl)
      .filter(Boolean);
    const directCandidates = directUrls
      .map((url) => candidateByUrl.get(url))
      .filter(Boolean);
    directCandidates.forEach((candidate) => assignedUrls.add(candidate.url));
    return {
      id: "",
      title: videoTitle(video, index),
      cover: normalizeUrl(video.poster || ""),
      duration: Number(video.duration || 0) || 0,
      pageUrl: location.href,
      siteLabel: "OnlyFans",
      pending: directCandidates.length === 0,
      candidates: directCandidates,
    };
  });
  hookedRecords.forEach((record, index) => {
    const recordCandidates = (record.candidates || [])
      .map((candidate) => candidateByUrl.get(normalizeUrl(candidate.url)))
      .filter(Boolean);
    if (!recordCandidates.length) return;
    const matchingItem = videoItems.find((item) =>
      item.candidates.some((candidate) =>
        recordCandidates.some(
          (recordCandidate) => recordCandidate.url === candidate.url,
        ),
      ),
    );
    if (matchingItem) {
      matchingItem.id = text(record.id) || matchingItem.id || "";
      matchingItem.title = text(record.title) || matchingItem.title;
      matchingItem.cover = normalizeUrl(record.cover || "") || matchingItem.cover;
      matchingItem.duration = Number(record.duration || matchingItem.duration || 0) || 0;
      recordCandidates.forEach((candidate) => {
        if (!matchingItem.candidates.some((item) => item.url === candidate.url)) {
          matchingItem.candidates.push(candidate);
        }
        assignedUrls.add(candidate.url);
      });
      matchingItem.pending = matchingItem.candidates.length === 0;
      return;
    }
    const freshRecordCandidates = recordCandidates.filter(
      (candidate) => !assignedUrls.has(candidate.url),
    );
    if (!freshRecordCandidates.length) return;
    freshRecordCandidates.forEach((candidate) => assignedUrls.add(candidate.url));
    videoItems.push({
      id: text(record.id),
      title: text(record.title) || `${fallbackTitle} · 视频 ${videoItems.length + index + 1}`,
      cover: normalizeUrl(record.cover || ""),
      duration: Number(record.duration || 0) || 0,
      pageUrl: location.href,
      siteLabel: "OnlyFans",
      pending: false,
      candidates: freshRecordCandidates,
    });
  });
  const unassignedCandidates = candidates.filter(
    (candidate) => !assignedUrls.has(candidate.url),
  );
  if (!videoItems.length && unassignedCandidates.length) {
    unassignedCandidates.forEach((candidate, index) => {
      videoItems.push({
        id: "",
        title: `${fallbackTitle} · 视频 ${index + 1}`,
        cover: "",
        duration: 0,
        pageUrl: location.href,
        siteLabel: "OnlyFans",
        pending: false,
        candidates: [candidate],
      });
    });
  } else if (videoItems.length && unassignedCandidates.length) {
    videoItems[0].candidates = [
      ...videoItems[0].candidates,
      ...unassignedCandidates,
    ];
    videoItems[0].pending = false;
  }
  const title = pageVideo
    ? videoTitle(pageVideo, 0)
    : videoItems[0]?.title || fallbackTitle;
  const cover = normalizeUrl(
    pageVideo?.poster ||
      videoItems[0]?.cover ||
      document.querySelector('meta[property="og:image"]')?.content ||
      "",
  );
  const unsupportedReason = !candidates.length
    ? sawDashManifest
      ? "当前页面只暴露了 DASH 播放清单，尚未读取到可直接保存的 MP4、WebM 或 HLS 地址。若该清单受 DRM 保护，扩展不会尝试解密。"
      : sawBlobUrl
        ? "播放器当前使用 Blob 地址，尚未捕获它对应的 MP4、WebM 或 HLS 请求。请播放视频几秒后再次识别。"
        : "没有从当前播放器读取到可直接保存的视频地址。请播放视频几秒后再次识别。"
    : "";
  return {
    title,
    cover,
    duration: Number(pageVideo?.duration || videoItems[0]?.duration || 0) || 0,
    pageUrl: location.href,
    siteLabel: "OnlyFans",
    unsupportedReason,
    candidates: candidates.slice(0, 30),
    videos: videoItems,
  };
})();
