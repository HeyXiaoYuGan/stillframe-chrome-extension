(() => {
  if (globalThis.__STILLFRAME_ONLYFANS_HOOK__) return;

  const state = {
    records: [],
    signatures: new Set(),
    updatedAt: 0,
  };
  Object.defineProperty(globalThis, "__STILLFRAME_ONLYFANS_HOOK__", {
    value: state,
    configurable: false,
    enumerable: false,
    writable: false,
  });

  const text = (value) => String(value ?? "").trim();
  const cleanTitle = (value) =>
    text(value)
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;|&#160;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&quot;|&#34;/gi, '"')
      .replace(/&#39;|&apos;/gi, "'")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 160);
  const durationSeconds = (value) => {
    if (typeof value === "string" && value.includes(":")) {
      const parts = value.split(":").map(Number);
      if (parts.every(Number.isFinite)) {
        return parts.reduce((total, part) => total * 60 + part, 0);
      }
    }
    const duration = Number(value) || 0;
    return duration > 86400 ? duration / 1000 : duration;
  };
  const contextualTitle = (value) =>
    cleanTitle(
      value?.title ||
        value?.caption ||
        value?.text ||
        value?.rawText ||
        value?.description ||
        "",
    );
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
  const mediaFormat = (url, hint = "") => {
    const value = `${hint} ${url}`.toLowerCase();
    if (/m3u8|mpegurl|\bhls\b/.test(value)) return "hls";
    if (/\.webm(?:$|[?#])|video\/webm|\bwebm\b/.test(value)) return "webm";
    if (/\.mp4(?:$|[?#])|video\/mp4|format=mp4|\bmp4\b/.test(value)) return "mp4";
    if (/videoSources|videoUrl|video_url|playbackUrl|playback_url/i.test(hint)) {
      return "mp4";
    }
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
  const firstImageUrl = (value, seen = new WeakSet(), depth = 0) => {
    if (typeof value === "string") {
      const url = normalizeUrl(value);
      return /\.(?:jpe?g|png|webp)(?:$|[?#])/i.test(url) ? url : "";
    }
    if (!value || typeof value !== "object" || seen.has(value) || depth > 3) return "";
    seen.add(value);
    for (const [key, child] of Object.entries(value)) {
      if (!/(?:thumb|preview|poster|cover|files|images?)/i.test(key)) continue;
      const found = firstImageUrl(child, seen, depth + 1);
      if (found) return found;
    }
    return "";
  };
  const collectCandidates = (root) => {
    const candidates = [];
    const seenObjects = new WeakSet();
    const seenUrls = new Set();
    const stack = [{ value: root, depth: 0, hint: "", metadata: {} }];
    while (stack.length && candidates.length < 30) {
      const { value, depth, hint, metadata } = stack.pop();
      if (typeof value === "string") {
        const url = normalizeUrl(value);
        const format = mediaFormat(url, hint);
        if (!url || !format || seenUrls.has(url)) continue;
        seenUrls.add(url);
        const quality = qualityNumber(metadata.quality, metadata.height, hint, url);
        candidates.push({
          url,
          fallbackUrls: [],
          quality,
          height: Number(metadata.height || quality) || 0,
          width: Number(metadata.width || 0) || 0,
          bitrate: Number(metadata.bitrate || 0) || 0,
          sizeBytes: Number(metadata.sizeBytes || 0) || 0,
          format,
          streamType: format === "hls" ? "hls" : "",
          selectable: true,
          label: quality ? `${quality}P · ${format.toUpperCase()}` : format.toUpperCase(),
        });
        continue;
      }
      if (!value || typeof value !== "object" || seenObjects.has(value) || depth > 6) {
        continue;
      }
      seenObjects.add(value);
      const nextMetadata = {
        quality:
          value.quality ?? value.qualityLabel ?? value.height ?? metadata.quality,
        height: value.height ?? metadata.height,
        width: value.width ?? metadata.width,
        bitrate:
          value.bitrate ??
          value.bit_rate ??
          value.bandwidth ??
          value.videoBitrate ??
          metadata.bitrate,
        sizeBytes:
          value.sizeBytes ??
          value.fileSize ??
          value.filesize ??
          value.contentLength ??
          metadata.sizeBytes,
      };
      for (const [key, child] of Object.entries(value)) {
        if (child && typeof child === "object") {
          stack.push({
            value: child,
            depth: depth + 1,
            hint: `${hint} ${key}`,
            metadata: nextMetadata,
          });
        } else if (typeof child === "string") {
          stack.push({
            value: child,
            depth: depth + 1,
            hint: `${hint} ${key}`,
            metadata: nextMetadata,
          });
        }
      }
    }
    return candidates;
  };
  const looksLikeVideoObject = (value) => {
    if (!value || typeof value !== "object") return false;
    const descriptor = `${value.type || ""} ${value.mediaType || ""} ${value.mimeType || ""}`;
    return (
      /video/i.test(descriptor) ||
      Boolean(value.videoSources || value.videoUrl || value.video_url || value.playbackUrl) ||
      /video/i.test(String(value.files?.full?.type || value.source?.type || ""))
    );
  };
  const publishRecord = (record) => {
    try {
      globalThis.postMessage?.(
        {
          source: "stillframe-onlyfans-hook",
          type: "records-updated",
          updatedAt: state.updatedAt,
          records: [record],
        },
        location.origin,
      );
    } catch {
      // Page event delivery is optional; the in-memory record remains available.
    }
  };
  const addRecord = (value, context = {}) => {
    const candidates = collectCandidates(value);
    if (!candidates.length) return;
    const signature = candidates
      .map((candidate) => candidate.url)
      .sort()
      .join("\n");
    if (!signature || state.signatures.has(signature)) return;
    state.signatures.add(signature);
    if (state.signatures.size > 500) {
      state.signatures.delete(state.signatures.values().next().value);
    }
    const id = text(value.id || value.mediaId || value.postId || "");
    const record = {
      id,
      title:
        cleanTitle(value.title || value.caption || context.title || value.name) ||
        (id ? `OnlyFans 视频 ${id}` : "OnlyFans 视频"),
      cover: firstImageUrl(value),
      duration:
        durationSeconds(value.duration || value.videoDuration) ||
        Number(context.duration || 0) ||
        0,
      candidates,
    };
    const existingIndex = id
      ? state.records.findIndex((item) => item.id === id)
      : -1;
    if (existingIndex >= 0) state.records.splice(existingIndex, 1);
    state.records.unshift(record);
    if (state.records.length > 100) state.records.length = 100;
    state.updatedAt = Date.now();
    publishRecord(record);
  };
  const inspectPayload = (root) => {
    if (!root || typeof root !== "object") return;
    const seen = new WeakSet();
    const stack = [{ value: root, depth: 0, context: {} }];
    let visited = 0;
    while (stack.length && visited < 30000) {
      const { value, depth, context } = stack.pop();
      if (!value || typeof value !== "object" || seen.has(value)) continue;
      seen.add(value);
      visited += 1;
      const nextContext = {
        title: contextualTitle(value) || context.title || "",
        duration:
          durationSeconds(value.duration || value.videoDuration) ||
          Number(context.duration || 0) ||
          0,
      };
      if (looksLikeVideoObject(value)) addRecord(value, nextContext);
      if (depth >= 12) continue;
      const children = Array.isArray(value) ? value : Object.values(value);
      for (let index = children.length - 1; index >= 0; index -= 1) {
        const child = children[index];
        if (child && typeof child === "object") {
          stack.push({ value: child, depth: depth + 1, context: nextContext });
        }
      }
    }
  };
  const shouldInspectUrl = (rawUrl) => {
    try {
      const url = new URL(String(rawUrl || ""), location.href);
      return (
        (url.hostname === "onlyfans.com" || url.hostname.endsWith(".onlyfans.com")) &&
        /\/api(?:2)?\//i.test(url.pathname)
      );
    } catch {
      return false;
    }
  };
  const inspectResponse = async (response) => {
    if (!response || !shouldInspectUrl(response.url)) return;
    try {
      const contentType = String(response.headers?.get?.("content-type") || "");
      if (!/json/i.test(contentType)) return;
      inspectPayload(await response.clone().json());
    } catch {
      // Reading a response clone must never affect the page's own request.
    }
  };

  if (typeof globalThis.fetch === "function") {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async function (...args) {
      const response = await originalFetch.apply(this, args);
      void inspectResponse(response);
      return response;
    };
  }

  const xhrPrototype = globalThis.XMLHttpRequest?.prototype;
  if (xhrPrototype?.open && xhrPrototype?.send) {
    const originalOpen = xhrPrototype.open;
    const originalSend = xhrPrototype.send;
    xhrPrototype.open = function (method, url, ...rest) {
      this.__stillframeUrl = String(url || "");
      return originalOpen.call(this, method, url, ...rest);
    };
    xhrPrototype.send = function (...args) {
      if (shouldInspectUrl(this.__stillframeUrl)) {
        this.addEventListener(
          "load",
          () => {
            try {
              if (this.responseType === "json") inspectPayload(this.response);
              else if (!this.responseType || this.responseType === "text") {
                inspectPayload(JSON.parse(this.responseText || "null"));
              }
            } catch {
              // Ignore non-JSON and inaccessible responses.
            }
          },
          { once: true },
        );
      }
      return originalSend.apply(this, args);
    };
  }
})();
