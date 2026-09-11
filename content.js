(() => {
  const images = new Map();
  const videos = new Map();
  const pageSessionId =
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let currentUrl = location.href;
  let scheduled = false;
  let liveScanEnabled = false;
  let started = false;
  let backgroundScanGeneration = 0;
  const pendingAutomaticBackgroundRoots = new WeakSet();
  const MEDIA_SELECTOR =
    "img, video, source, [style], [data-video-url], [data-video-src], [data-m3u8], [data-m3u8-url], [data-hls-url], [data-player-url], script[type='application/json'], script[type='application/ld+json'], script[data-relay-completed-request='true'], meta[property='og:image'], meta[name='twitter:image'], meta[property^='og:video'], meta[name='twitter:player:stream'], link[rel='image_src']";
  let imageViewerHost = null;
  let imageViewerKeyHandler = null;
  let imageViewerAppendItems = null;
  let imageViewerJobUpdate = null;
  let imageViewerFilterUpdate = null;
  let bilibiliDialogHost = null;
  let featuredImageIdentity = "";
  const capturedVideoFrames = new WeakSet();
  let capturedVideoFrameCount = 0;
  let extensionContextValid = true;
  let imageFilterLevel = "standard";
  const mediaFileSizeCache = new Map();

  function hasExtensionContext() {
    if (!extensionContextValid) return false;
    try {
      return Boolean(chrome?.runtime?.id);
    } catch {
      return false;
    }
  }

  function isInvalidatedContextError(error) {
    return /extension context invalidated|context invalidated/i.test(
      String(error?.message || error || ""),
    );
  }

  function invalidateExtensionContext() {
    extensionContextValid = false;
    liveScanEnabled = false;
    backgroundScanGeneration += 1;
  }

  async function safeRuntimeSendMessage(message) {
    if (!hasExtensionContext()) {
      invalidateExtensionContext();
      return null;
    }
    try {
      return await chrome.runtime.sendMessage(message);
    } catch (error) {
      if (isInvalidatedContextError(error) || !hasExtensionContext()) {
        invalidateExtensionContext();
        return null;
      }
      throw error;
    }
  }

  async function safeLocalStorageGet(defaults) {
    if (!hasExtensionContext()) {
      invalidateExtensionContext();
      return defaults;
    }
    try {
      return await chrome.storage.local.get(defaults);
    } catch (error) {
      if (isInvalidatedContextError(error) || !hasExtensionContext()) {
        invalidateExtensionContext();
        return defaults;
      }
      throw error;
    }
  }

  async function safeLocalStorageSet(values) {
    if (!hasExtensionContext()) {
      invalidateExtensionContext();
      return false;
    }
    try {
      await chrome.storage.local.set(values);
      return true;
    } catch (error) {
      if (isInvalidatedContextError(error) || !hasExtensionContext()) {
        invalidateExtensionContext();
        return false;
      }
      throw error;
    }
  }

  function safeAddRuntimeMessageListener(listener) {
    if (!hasExtensionContext()) return false;
    try {
      chrome.runtime.onMessage.addListener(listener);
      return true;
    } catch (error) {
      if (isInvalidatedContextError(error) || !hasExtensionContext()) {
        invalidateExtensionContext();
        return false;
      }
      throw error;
    }
  }

  function safeAddStorageChangeListener(listener) {
    if (!hasExtensionContext()) return false;
    try {
      chrome.storage.onChanged?.addListener(listener);
      return true;
    } catch (error) {
      if (isInvalidatedContextError(error) || !hasExtensionContext()) {
        invalidateExtensionContext();
        return false;
      }
      throw error;
    }
  }

  function createPageJobId() {
    return (
      globalThis.crypto?.randomUUID?.() ||
      `${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
  }

  function redactSensitiveDisplayText(value) {
    return String(value || "")
      .replace(/https?:\/\/[^\s"'<>]+/gi, "[media URL]")
      .replace(
        /\b(?:access[_-]?token|authorization|cookie|csrf(?:token)?|signature|sig|auth_key)=([^&\s]+)/gi,
        (match) => `${match.slice(0, match.indexOf("=") + 1)}[redacted]`,
      );
  }

  function isVideoDownloadExcludedPage() {
    return (
      /(^|\.)youtube\.com$/i.test(location.hostname) ||
      /(^|\.)youtube-nocookie\.com$/i.test(location.hostname) ||
      /(^|\.)youtu\.be$/i.test(location.hostname)
    );
  }

  function isPinterestHostname(hostname = location.hostname) {
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

  function isDouyinHostname(hostname = location.hostname) {
    const normalized = String(hostname || "").toLowerCase();
    return normalized === "douyin.com" || normalized.endsWith(".douyin.com");
  }

  function currentDouyinAwemeId(rawUrl = location.href) {
    try {
      const url = new URL(rawUrl, location.href);
      return (
        url.pathname.match(/\/(?:video|note)\/(\d{10,})/i)?.[1] ||
        url.searchParams.get("modal_id") ||
        url.searchParams.get("aweme_id") ||
        ""
      );
    } catch {
      return "";
    }
  }

  function normalizeDouyinVideoUrl(rawUrl) {
    if (typeof rawUrl !== "string") return "";
    const cleaned = rawUrl
      .trim()
      .replace(/\\u002f/gi, "/")
      .replace(/\\u0026/gi, "&")
      .replace(/\\\//g, "/")
      .replace(/&amp;/gi, "&");
    if (!cleaned || cleaned.startsWith("blob:")) return "";
    try {
      const url = new URL(cleaned.startsWith("//") ? `https:${cleaned}` : cleaned);
      return /^https?:$/i.test(url.protocol) ? url.href : "";
    } catch {
      return "";
    }
  }

  function douyinUrlList(value) {
    if (!value) return [];
    if (typeof value === "string") {
      const direct = normalizeDouyinVideoUrl(value);
      return direct ? [direct] : [];
    }
    if (Array.isArray(value)) return value.flatMap(douyinUrlList);
    if (typeof value !== "object") return [];
    return [
      value.url_list,
      value.urlList,
      value.urls,
      value.url,
      value.src,
    ].flatMap(douyinUrlList);
  }

  function parseDouyinPageData(script) {
    const text = String(script?.textContent || "").trim();
    if (!text) return null;
    const attempts = [text];
    if (/%[0-9a-f]{2}/i.test(text)) {
      try {
        attempts.push(decodeURIComponent(text));
      } catch {
        // Some page payloads contain literal percent signs.
      }
    }
    for (const candidate of attempts) {
      try {
        let parsed = JSON.parse(candidate);
        if (typeof parsed === "string") parsed = JSON.parse(parsed);
        return parsed;
      } catch {
        // Try the next representation.
      }
    }
    return null;
  }

  function findDouyinAwemeObjects(root, wantedAwemeId) {
    if (!root || typeof root !== "object") return [];
    const matches = [];
    const seen = new WeakSet();
    const stack = [{ value: root, depth: 0 }];
    let visited = 0;
    while (stack.length && visited < 50000) {
      const { value, depth } = stack.pop();
      if (!value || typeof value !== "object" || seen.has(value)) continue;
      seen.add(value);
      visited += 1;
      const video = value.video || value.videoInfo || value.video_info;
      if (video && typeof video === "object") {
        const awemeId = String(
          value.aweme_id || value.awemeId || value.item_id || value.itemId || "",
        );
        const hasVideoAddress = [
          video.play_addr,
          video.playAddr,
          video.download_addr,
          video.downloadAddr,
          video.bit_rate,
          video.bitRate,
        ].some(Boolean);
        if (hasVideoAddress) {
          matches.push({
            value,
            score:
              (wantedAwemeId && awemeId === wantedAwemeId ? 1000000 : 0) +
              (awemeId ? 10000 : 0) +
              (value.desc || value.title ? 1000 : 0) +
              douyinUrlList(video.play_addr || video.playAddr).length * 10,
          });
        }
      }
      if (depth >= 18) continue;
      const children = Array.isArray(value) ? value : Object.values(value);
      for (let index = children.length - 1; index >= 0; index -= 1) {
        const child = children[index];
        if (child && typeof child === "object") {
          stack.push({ value: child, depth: depth + 1 });
        }
      }
    }
    return matches.sort((left, right) => right.score - left.score);
  }

  function douyinQualityDetails(quality, playAddress, baseWidth, baseHeight) {
    const address =
      playAddress && typeof playAddress === "object" && !Array.isArray(playAddress)
        ? playAddress
        : {};
    let width =
      Number(quality?.width || quality?.video_width) ||
      Number(address.width || address.video_width) ||
      0;
    let height =
      Number(quality?.height || quality?.video_height) ||
      Number(address.height || address.video_height) ||
      0;
    const gearName = String(
      quality?.gear_name || quality?.gearName || quality?.quality_name || "",
    );
    const shortSide = Number(
      gearName.match(/(?:^|[_-])(\d{3,4})(?:p|[_-]|$)/i)?.[1] || 0,
    );
    if ((!width || !height) && shortSide && baseWidth && baseHeight) {
      if (baseHeight >= baseWidth) {
        width = shortSide;
        height = Math.round((shortSide * baseHeight) / baseWidth);
      } else {
        height = shortSide;
        width = Math.round((shortSide * baseWidth) / baseHeight);
      }
    }
    const fps =
      Number(quality?.FPS || quality?.fps || address.FPS || address.fps) || 0;
    const codecSource = String(
      quality?.format ||
        quality?.codec_type ||
        quality?.codecType ||
        quality?.video_extra ||
        "",
    ).toLowerCase();
    const isBytevc1 = Number(quality?.is_bytevc1 ?? quality?.isBytevc1) === 1;
    const codec = isBytevc1 || /bytevc1|h265|hevc/.test(codecSource)
      ? "HEVC"
      : /av01|av1/.test(codecSource)
        ? "AV1"
      : /h264|avc/.test(codecSource)
        ? "AVC"
        : "";
    const hdrType = Number(quality?.HDR_type || quality?.hdr_type) || 0;
    const resolution = Math.min(width || Infinity, height || Infinity);
    const resolutionLabel = Number.isFinite(resolution)
      ? resolution >= 2160
        ? "4K"
        : resolution >= 1440
          ? "2K"
          : resolution >= 1080
            ? "1080P"
            : resolution >= 720
              ? "720P"
              : resolution >= 540
                ? "540P"
                : resolution >= 480
                  ? "480P"
                  : resolution >= 360
                    ? "360P"
                    : `${resolution}P`
      : "";
    return {
      width,
      height,
      fps,
      codec,
      hdr: hdrType > 0,
      resolutionLabel,
      gearName,
    };
  }

  function collectDouyinVideo() {
    if (!isDouyinHostname()) return null;
    const wantedAwemeId = currentDouyinAwemeId();
    const candidates = new Map();
    const addCandidate = (rawUrl, details = {}) => {
      const url = normalizeDouyinVideoUrl(rawUrl);
      if (!url) return;
      const existing = candidates.get(url) || {};
      const width = Math.max(Number(existing.width) || 0, Number(details.width) || 0);
      const height = Math.max(Number(existing.height) || 0, Number(details.height) || 0);
      const bitRate = Math.max(
        Number(existing.bitRate) || 0,
        Number(details.bitRate) || 0,
      );
      const sourceRank = Math.max(
        Number(existing.sourceRank) || 0,
        Number(details.sourceRank) || 0,
      );
      const selectable = existing.selectable === true || details.selectable === true;
      candidates.set(url, {
        ...existing,
        ...details,
        url,
        width,
        height,
        bitRate,
        sourceRank,
        selectable,
        qualityKey: existing.qualityKey || details.qualityKey || "",
        score: sourceRank * 1e12 + width * height * 1000 + bitRate,
      });
    };

    let selectedAweme = null;
    const scripts = [
      ...document.querySelectorAll(
        'script#RENDER_DATA, script#__UNIVERSAL_DATA_FOR_REHYDRATION__, script[type="application/json"], script[type="application/ld+json"]',
      ),
    ];
    const awemeMatches = scripts
      .map(parseDouyinPageData)
      .filter(Boolean)
      .flatMap((payload) => findDouyinAwemeObjects(payload, wantedAwemeId));
    if (awemeMatches.length) selectedAweme = awemeMatches[0].value;

    const structuredVideo =
      selectedAweme?.video || selectedAweme?.videoInfo || selectedAweme?.video_info;
    const baseWidth = Number(structuredVideo?.width) || 0;
    const baseHeight = Number(structuredVideo?.height) || 0;
    const bitRates = structuredVideo?.bit_rate || structuredVideo?.bitRate || [];
    (Array.isArray(bitRates) ? bitRates : []).forEach((quality) => {
      const playAddress = quality.play_addr || quality.playAddr || quality.play_address;
      const details = douyinQualityDetails(
        quality,
        playAddress,
        baseWidth,
        baseHeight,
      );
      const bitRate = Number(quality.bit_rate || quality.bitRate) || 0;
      const qualityKey = [
        details.width,
        details.height,
        bitRate,
        details.fps,
        details.codec,
        details.hdr ? "hdr" : "sdr",
        details.gearName,
      ].join(":");
      douyinUrlList(playAddress).forEach((url) =>
        addCandidate(url, {
          width: details.width,
          height: details.height,
          bitRate,
          fps: details.fps,
          codec: details.codec,
          hdr: details.hdr,
          resolutionLabel: details.resolutionLabel,
          qualityKey,
          selectable: true,
          source: "page-quality",
          sourceRank: 5,
        }),
      );
    });
    [
      structuredVideo?.play_addr,
      structuredVideo?.playAddr,
      structuredVideo?.play_addr_h264,
      structuredVideo?.playAddrH264,
    ].forEach((address) => {
      const details = douyinQualityDetails({}, address, baseWidth, baseHeight);
      douyinUrlList(address).forEach((url) =>
        addCandidate(url, {
          width: details.width || baseWidth,
          height: details.height || baseHeight,
          resolutionLabel: details.resolutionLabel,
          qualityKey: `default:${details.width || baseWidth}:${details.height || baseHeight}`,
          selectable: !Array.isArray(bitRates) || bitRates.length === 0,
          source: "page-play",
          sourceRank: 4,
        }),
      );
    });
    [structuredVideo?.download_addr, structuredVideo?.downloadAddr].forEach(
      (address) =>
        douyinUrlList(address).forEach((url) =>
          addCandidate(url, {
            width: baseWidth,
            height: baseHeight,
            selectable: false,
            source: "page-download",
            sourceRank: 2,
          }),
        ),
    );

    const visibleVideos = [...document.querySelectorAll("video")].sort((left, right) => {
      const leftRect = left.getBoundingClientRect();
      const rightRect = right.getBoundingClientRect();
      return rightRect.width * rightRect.height - leftRect.width * leftRect.height;
    });
    visibleVideos.forEach((video, index) => {
      [video.currentSrc, video.src, ...[...video.querySelectorAll("source")].map((s) => s.src)]
        .forEach((url) =>
          addCandidate(url, {
            width: video.videoWidth,
            height: video.videoHeight,
            selectable: false,
            source: "page-video",
            sourceRank: index === 0 ? 3 : 1,
          }),
        );
    });
    const playbackWidth = Number(visibleVideos[0]?.videoWidth) || 0;
    const playbackHeight = Number(visibleVideos[0]?.videoHeight) || 0;

    const looksLikeDouyinVideoUrl = (rawUrl) => {
      const value = String(rawUrl || "");
      return (
        /(?:douyinvod|douyinstatic|douyinpic|bytecdn|byteimg|bytedance|bytevcloud|ibytedtos|pstatp|zjcdn|byted)\./i.test(value) &&
        /(?:video|\.mp4|mime_type=video|format=mp4|vr_type=0)/i.test(value)
      );
    };
    performance
      .getEntriesByType("resource")
      .slice(-500)
      .reverse()
      .forEach((entry) => {
        if (!looksLikeDouyinVideoUrl(entry.name)) return;
        addCandidate(entry.name, {
          width: playbackWidth,
          height: playbackHeight,
          source: "network",
          selectable: false,
          sourceRank: 3,
        });
      });
    [...videos.values()].forEach((video) => {
      if (!looksLikeDouyinVideoUrl(video.url)) return;
      addCandidate(video.url, {
        width: video.width,
        height: video.height,
        selectable: false,
        source: "network-scan",
        sourceRank: 3,
      });
    });

    const expandedCandidates = [...candidates.values()]
      .sort((left, right) => right.score - left.score)
      .map((candidate, index) => {
        const dimensions =
          candidate.width && candidate.height
            ? `${candidate.width} × ${candidate.height}`
            : "";
        const rate = candidate.bitRate
          ? `${(candidate.bitRate / 1_000_000).toFixed(1)} Mbps`
          : "";
        const frameRate = candidate.fps ? `${candidate.fps} FPS` : "";
        const baseLabel =
          [
            candidate.resolutionLabel,
            dimensions,
            rate,
            frameRate,
            candidate.codec,
            candidate.hdr ? "HDR" : "",
          ]
            .filter(Boolean)
            .join(" · ") ||
          `可用播放地址 ${index + 1}`;
        return {
          url: candidate.url,
          width: candidate.width,
          height: candidate.height,
          bitRate: candidate.bitRate,
          fps: candidate.fps,
          codec: candidate.codec,
          hdr: candidate.hdr,
          qualityKey: candidate.qualityKey,
          selectable: candidate.selectable,
          label: baseLabel,
          fallbackUrls: [],
          source: candidate.source,
        };
      });
    const qualityGroupIndexes = new Map();
    const sortedCandidates = [];
    expandedCandidates.forEach((candidate) => {
      if (candidate.selectable && candidate.qualityKey) {
        const existingIndex = qualityGroupIndexes.get(candidate.qualityKey);
        if (existingIndex !== undefined) {
          sortedCandidates[existingIndex].fallbackUrls.push(candidate.url);
          return;
        }
        qualityGroupIndexes.set(candidate.qualityKey, sortedCandidates.length);
      }
      sortedCandidates.push(candidate);
    });
    sortedCandidates.splice(30);
    if (!sortedCandidates.length) return null;

    const cover = douyinUrlList(
      structuredVideo?.cover ||
        structuredVideo?.origin_cover ||
        structuredVideo?.originCover ||
        structuredVideo?.dynamic_cover,
    )[0] || visibleVideos[0]?.poster || "";
    const cleanTitle = (value) =>
      String(value || "")
        .replace(/\s*[—_-]\s*抖音.*$/i, "")
        .replace(/\s+/g, " ")
        .trim();
    const rawDuration = Number(structuredVideo?.duration) || 0;
    return {
      awemeId: String(
        selectedAweme?.aweme_id ||
          selectedAweme?.awemeId ||
          selectedAweme?.item_id ||
          wantedAwemeId ||
          "",
      ),
      title: cleanTitle(
        selectedAweme?.desc ||
          selectedAweme?.title ||
          document.querySelector('meta[property="og:title"]')?.content ||
          document.title ||
          "抖音视频",
      ),
      author: cleanTitle(
        selectedAweme?.author?.nickname ||
          selectedAweme?.author?.unique_id ||
          selectedAweme?.authorInfo?.nickname ||
          "",
      ),
      cover,
      width: baseWidth || sortedCandidates[0].width || 0,
      height: baseHeight || sortedCandidates[0].height || 0,
      duration: rawDuration > 10000 ? rawDuration / 1000 : rawDuration,
      candidates: sortedCandidates,
    };
  }

  function canonicalImageIdentity(rawUrl) {
    const value = String(rawUrl || "");
    if (!value || /^data:/i.test(value)) return value;
    try {
      const url = new URL(value, document.baseURI);
      url.hostname = url.hostname
        .toLowerCase()
        .replace(/^i\d+\.hdslb\.com$/i, "i.hdslb.com")
        .replace(/^i\d+\.hdslb\.net$/i, "i.hdslb.net");
      const pinterestSizeIndex = url.pathname
        .split("/")
        .findIndex((part) => /^(?:\d+x\d+|\d+x|75x75_RS|originals)$/i.test(part));
      if (/(^|\.)pinimg\.com$/i.test(url.hostname) && pinterestSizeIndex >= 0) {
        const parts = url.pathname.split("/");
        parts[pinterestSizeIndex] = "{size}";
        url.pathname = parts.join("/");
      }
      url.hash = "";
      url.pathname = url.pathname
        .replace(/(\.(?:avif|gif|jpe?g|png|webp))@[^/]+$/i, "$1")
        .replace(/=[wh]\d+(?:-[wh]\d+)*(?=\.(?:avif|gif|jpe?g|png|webp)?$|$)/i, "")
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
    const rawUrl = String(item.url || item.originalUrl || "");
    try {
      const url = new URL(rawUrl, document.baseURI);
      inferredWidth =
        Number(url.searchParams.get("width") || url.searchParams.get("w")) || 0;
      inferredHeight =
        Number(url.searchParams.get("height") || url.searchParams.get("h")) || 0;
    } catch {
      // Continue with dimensions encoded in the path.
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
    return Math.max(
      Number(item.pixelScore) || 0,
      knownArea,
      inferredArea,
    );
  }

  function detectBilibiliVideoTitle() {
    const mainSelectors = [
      "h1.video-title",
      "h1[title]",
      ".video-title",
      ".bpx-player-video-title",
      ".media-title",
    ];
    const mainElement = mainSelectors
      .map((selector) => document.querySelector(selector))
      .find((node) => String(node?.getAttribute("title") || node?.textContent || "").trim());
    const clean = (value) =>
      String(value || "")
        .replace(/[_\-]\s*哔哩哔哩.*$/i, "")
        .replace(/\s+/g, " ")
        .trim();
    const mainTitle = clean(
      mainElement?.getAttribute("title") ||
        mainElement?.textContent ||
        document.querySelector('meta[property="og:title"]')?.content ||
        document.title ||
        "",
    );
    const partSelectors = [
      ".video-pod__list .active .title-txt",
      ".video-pod__list [class*='active'] .title-txt",
      ".cur-list .on",
      ".video-episode-card.active .video-episode-card__info-title",
      ".video-episode-card[class*='active'] .video-episode-card__info-title",
      ".ep-list-wrapper [class*='active']",
    ];
    const partElement = partSelectors
      .map((selector) => document.querySelector(selector))
      .find((node) => clean(node?.getAttribute("title") || node?.textContent));
    const partTitle = clean(
      partElement?.getAttribute("title") || partElement?.textContent,
    );
    if (partTitle && !mainTitle.includes(partTitle)) {
      const pageNumber = Math.max(
        1,
        Number(new URL(location.href).searchParams.get("p")) || 1,
      );
      return mainTitle
        ? `${mainTitle} - P${pageNumber} ${partTitle}`
        : partTitle;
    }
    return partTitle || mainTitle;
  }

  function showBilibiliDownloadDialog(settings = {}) {
    bilibiliDialogHost?.remove();
    const host = document.createElement("div");
    host.style.cssText =
      "all:initial;position:fixed;inset:0;z-index:2147483647;display:block;";
    const shadow = host.attachShadow({ mode: "open" });
    globalThis.StillFrameI18n?.observeRoot(shadow);
    shadow.innerHTML = `
      <style>
        :host{--ink:#13261f;--paper:#f3f1e8;--acid:#d8ff3e;--muted:#64716b;--line:rgba(19,38,31,.17)}
        *{box-sizing:border-box}
        .mask{position:fixed;inset:0;background:rgba(7,14,11,.72);display:grid;place-items:center;padding:24px;font-family:Arial,"Microsoft YaHei",sans-serif;color:var(--ink)}
        .dialog{width:min(620px,calc(100vw - 32px));max-height:calc(100vh - 32px);overflow:auto;border:1px solid var(--ink);border-radius:10px;box-shadow:8px 8px 0 rgba(19,38,31,.42);background:linear-gradient(rgba(19,38,31,.026) 1px,transparent 1px),linear-gradient(90deg,rgba(19,38,31,.026) 1px,transparent 1px),var(--paper);background-size:34px 34px}
        header{min-height:76px;padding:16px 22px;display:flex;align-items:center;gap:13px;border-bottom:1px solid var(--line);background:rgba(243,241,232,.94)}
        .brand-mark{width:36px;height:36px;flex:0 0 36px;border:2px solid var(--ink);border-radius:9px;display:grid;place-items:center;transform:rotate(-4deg)}
        .brand-mark i{width:12px;height:12px;border:2px solid var(--ink);border-radius:50%;background:var(--acid)}
        h2{font-size:21px;letter-spacing:-.04em;line-height:1.2;margin:0 0 5px} header p{margin:0;color:var(--muted);font-size:11px}
        .tag{margin-left:auto;padding:7px 10px;border:1px solid var(--line);border-radius:999px;color:var(--muted);font:700 9px/1 "Courier New",monospace;letter-spacing:.1em}
        form{padding:20px 22px 22px}.field{display:grid;gap:8px;margin-bottom:18px}.field-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.field-head>span,.group-title{font-size:11px;font-weight:800}
        .copy-name{height:27px;padding:0 10px;border:1px solid var(--line);border-radius:999px;background:rgba(255,255,255,.62);color:var(--ink);font:800 10px Arial,"Microsoft YaHei",sans-serif;cursor:pointer}.copy-name:hover{border-color:var(--ink);background:var(--acid)}
        input[type=text],select{width:100%;height:40px;border:1px solid var(--line);border-radius:7px;background:white;padding:0 11px;font:12px Arial,"Microsoft YaHei",sans-serif;color:var(--ink);outline:none}
        input[type=text]:focus,select:focus{border-color:var(--ink);box-shadow:0 0 0 3px rgba(216,255,62,.5)}
        .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px}.grid label{display:grid;gap:8px;font-size:11px;font-weight:800}
        .checks{display:flex;flex-wrap:wrap;gap:8px;margin:9px 0 20px}.checks label{display:flex;align-items:center;gap:6px;padding:9px 11px;border:1px solid var(--line);border-radius:7px;background:rgba(255,255,255,.62);font-size:11px;font-weight:700;cursor:pointer}
        .checks label:hover{border-color:var(--ink)}.checks input{accent-color:var(--ink);width:15px;height:15px}.status{min-height:20px;color:#a43e2d;font-size:11px;margin-bottom:8px}
        .parts{margin:0 0 18px;padding:12px;border:1px solid var(--line);border-radius:8px;background:rgba(255,255,255,.72)}.parts[hidden]{display:none}.parts-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:9px}.parts-head strong{font-size:13px}.parts-toggle{height:30px;padding:0 11px;border:1px solid var(--line);border-radius:6px;background:white;color:var(--ink);font-size:11px;font-weight:800;cursor:pointer}.part-list{max-height:190px;overflow:auto;display:grid;gap:6px;padding-right:3px}.part-item{min-height:42px;display:grid;grid-template-columns:auto 42px minmax(0,1fr) auto;align-items:center;gap:8px;padding:7px 8px;border:1px solid var(--line);border-radius:6px;background:white;color:var(--ink);cursor:pointer}.part-item:hover{border-color:var(--ink)}.part-item.current{border-color:var(--ink);box-shadow:inset 4px 0 0 var(--acid)}.part-item input{width:15px;height:15px;margin:0;accent-color:var(--ink)}.part-number{color:var(--ink);font:800 11px/1 "Courier New",monospace}.part-name{min-width:0;overflow:hidden;font-size:12px;font-weight:700;text-overflow:ellipsis;white-space:nowrap}.part-meta{display:grid;justify-items:end;gap:3px;color:var(--muted);font:700 11px/1 "Courier New",monospace}.part-size{color:var(--ink);font-weight:800}.parts-note{display:block;margin-top:9px;color:var(--muted);font-size:11px;line-height:1.45}
        footer{display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap}.button{height:42px;border-radius:7px;padding:0 20px;font:800 12px Arial,"Microsoft YaHei",sans-serif;cursor:pointer}
        .cancel{border:1px solid var(--line);background:white;color:var(--ink)}.confirm{border:1px solid var(--ink);background:var(--acid);color:var(--ink);box-shadow:3px 3px 0 var(--ink)}.confirm:disabled{opacity:.55;cursor:wait}
        .package-parts{border:1px solid var(--ink);background:var(--ink);color:var(--acid)}.package-parts:disabled{opacity:.45;cursor:not-allowed}
        @media(max-width:560px){.grid{grid-template-columns:1fr}.dialog{max-height:calc(100vh - 16px)}.mask{padding:8px}}
      </style>
      <div class="mask">
        <section class="dialog" role="dialog" aria-modal="true" aria-labelledby="dingge-bili-title">
          <header><span class="brand-mark"><i></i></span><div><h2 id="dingge-bili-title">B站视频下载</h2><p>确认当前视频名称和下载参数</p></div><span class="tag">BILIBILI</span></header>
          <form>
            <label class="field"><span class="field-head"><span>当前视频名称</span><button class="copy-name" type="button">复制名称</button></span><input id="videoTitle" type="text" maxlength="180"></label>
            <section class="parts" hidden>
              <div class="parts-head"><strong>视频列表</strong><button class="parts-toggle" type="button">全选</button></div>
              <div class="part-list"></div>
              <small class="parts-note">所选视频将按顺序无损合并，并生成一个 ZIP；单次最多 50 个，总大小上限 800 MB。</small>
            </section>
            <div class="grid">
              <label>画质<select id="quality"><option value="127">8K</option><option value="126">杜比视界</option><option value="125">HDR</option><option value="120">4K</option><option value="116">1080P 60帧</option><option value="112">1080P 高码率</option><option value="80">1080P</option><option value="74">720P 60帧</option><option value="64">720P</option><option value="32">480P</option><option value="16">360P</option><option value="6">240P</option></select></label>
              <label>音质<select id="audioQuality"><option value="hires">Hi-Res 优先</option><option value="30280">192K</option><option value="30232">132K</option><option value="30216">64K</option></select></label>
              <label>编码<select id="codec"><option value="avc">AVC</option><option value="hevc">HEVC</option><option value="av1">AV1</option></select></label>
            </div>
            <div class="group-title">附加内容</div>
            <div class="checks">
              <label><input id="audio" type="checkbox">音频</label>
              <label><input id="srt" type="checkbox">SRT 字幕</label>
              <label><input id="ass" type="checkbox">ASS 字幕</label>
              <label><input id="cover" type="checkbox">封面</label>
              <label><input id="danmaku" type="checkbox">XML 弹幕</label>
            </div>
            <div class="status" aria-live="polite"></div>
            <footer><button class="button cancel" type="button">取消</button><button class="button package-parts" type="button" disabled>打包下载视频</button><button class="button confirm" type="submit">下载当前视频</button></footer>
          </form>
        </section>
      </div>`;
    document.documentElement.appendChild(host);
    bilibiliDialogHost = host;
    const $ = (selector) => shadow.querySelector(selector);
    const titleInput = $("#videoTitle");
    titleInput.value = detectBilibiliVideoTitle();
    $("#quality").value = String(settings.biliQuality || "80");
    $("#audioQuality").value = String(settings.biliAudioQuality || "30280");
    $("#codec").value = String(settings.biliCodec || "avc");
    const hasSavedDialogSettings = settings.biliDialogPreferencesSaved === true;
    $("#audio").checked = hasSavedDialogSettings
      ? settings.biliDownloadAudio !== false
      : true;
    $("#srt").checked = hasSavedDialogSettings
      ? settings.biliDownloadSrt === true
      : true;
    $("#ass").checked = hasSavedDialogSettings && settings.biliDownloadAss === true;
    $("#cover").checked = hasSavedDialogSettings && settings.biliDownloadCover === true;
    $("#danmaku").checked =
      hasSavedDialogSettings && settings.biliDownloadDanmaku === true;
    const qualityStatus = $(".status");
    let availableParts = [];
    const partSizeByCid = new Map();
    let partSizeRequestId = 0;
    const formatPartSize = (sizeBytes, estimated = true) => {
      const size = Number(sizeBytes) || 0;
      if (!size) return "大小待识别";
      const value =
        size >= 1024 ** 3
          ? `${(size / 1024 ** 3).toFixed(1)} GB`
          : size >= 1024 ** 2
            ? `${(size / 1024 ** 2).toFixed(size < 10 * 1024 ** 2 ? 1 : 0)} MB`
            : `${Math.max(1, Math.round(size / 1024))} KB`;
      return estimated ? `约 ${value}` : value;
    };
    const updateRenderedPartSizes = (placeholder = "大小待识别") => {
      shadow.querySelectorAll(".part-size[data-cid]").forEach((element) => {
        const size = partSizeByCid.get(Number(element.dataset.cid));
        element.textContent = size
          ? formatPartSize(size.sizeBytes, size.estimated)
          : placeholder;
      });
    };
    const currentPartSizeSettings = () => ({
      biliQuality: $("#quality").value,
      biliAudioQuality: $("#audioQuality").value,
      biliCodec: $("#codec").value,
      biliDownloadAudio: $("#audio").checked,
    });
    const refreshPartSizes = async () => {
      const requestId = ++partSizeRequestId;
      partSizeByCid.clear();
      updateRenderedPartSizes("正在估算…");
      try {
        const response = await safeRuntimeSendMessage({
          type: "DINGGE_GET_BILIBILI_PART_SIZES",
          target: "background",
          pageUrl: location.href,
          settings: currentPartSizeSettings(),
        });
        if (!host.isConnected || requestId !== partSizeRequestId) return;
        if (!response?.ok) throw new Error(response?.error);
        (response.sizes || []).forEach((size) => {
          partSizeByCid.set(Number(size.cid), size);
        });
        updateRenderedPartSizes();
      } catch {
        if (host.isConnected && requestId === partSizeRequestId) {
          updateRenderedPartSizes("大小读取失败");
        }
      }
    };
    const selectedPartCids = () =>
      [...shadow.querySelectorAll(".part-item input:checked")]
        .map((input) => Number(input.value))
        .filter((cid) => cid > 0);
    const updatePartSelection = () => {
      const selectedCount = selectedPartCids().length;
      const packageButton = $(".package-parts");
      packageButton.disabled = selectedCount === 0 || availableParts.length < 2;
      packageButton.textContent = selectedCount
        ? `打包下载视频（${selectedCount}）`
        : "打包下载视频";
      const selectableCount = Math.min(50, availableParts.length);
      $(".parts-toggle").textContent =
        selectedCount === selectableCount ? "取消全选" : "全选";
    };
    const renderPartList = (partList) => {
      availableParts = Array.isArray(partList?.parts) ? partList.parts : [];
      if (!availableParts.length) return;
      const listKind = String(partList?.kind || "single");
      const currentPage = Math.max(
        1,
        Number(new URL(location.href).searchParams.get("p")) || 1,
      );
      const list = $(".part-list");
      list.replaceChildren();
      availableParts.forEach((part, partIndex) => {
        const row = document.createElement("label");
        row.className = "part-item";
        if (Number(part.page) === currentPage) row.classList.add("current");
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.value = String(part.cid);
        checkbox.checked = false;
        const number = document.createElement("span");
        number.className = "part-number";
        number.textContent =
          availableParts.length > 1
            ? listKind === "season"
              ? `${part.page}`
              : `P${part.page}`
            : "主视频";
        const name = document.createElement("span");
        name.className = "part-name";
        name.textContent = part.title || `P${part.page}`;
        name.title = name.textContent;
        const meta = document.createElement("span");
        meta.className = "part-meta";
        const duration = document.createElement("span");
        const seconds = Math.max(0, Number(part.duration) || 0);
        duration.textContent = seconds
          ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
          : "";
        const size = document.createElement("span");
        size.className = "part-size";
        size.dataset.cid = String(part.cid);
        meta.append(duration, size);
        checkbox.addEventListener("change", updatePartSelection);
        row.append(checkbox, number, name, meta);
        list.append(row);
      });
      $(".parts").hidden = false;
      $(".parts-note").textContent =
        availableParts.length > 50
          ? `已读取 ${availableParts.length} 个视频；当前单次最多选择 50 个，总大小上限 800 MB。`
          : "所选视频将按顺序无损合并，并生成一个 ZIP；单次最多 50 个，总大小上限 800 MB。";
      updatePartSelection();
      updateRenderedPartSizes();
    };
    $(".parts-toggle").addEventListener("click", () => {
      const inputs = [...shadow.querySelectorAll(".part-item input")];
      const shouldSelect = !inputs
        .slice(0, 50)
        .every((input) => input.checked);
      inputs.forEach((input, index) => {
        input.checked = shouldSelect && index < 50;
      });
      updatePartSelection();
    });
    const limitSelectToAvailable = (select, values, unavailableLabel) => {
      const availableValues = new Set(
        (Array.isArray(values) ? values : []).map((value) => String(value)),
      );
      const preferred = select.value;
      if (!availableValues.size) {
        const fallback = document.createElement("option");
        fallback.value = preferred;
        fallback.textContent = unavailableLabel;
        select.replaceChildren(fallback);
        select.disabled = true;
        return false;
      }
      [...select.options]
        .filter((option) => !availableValues.has(option.value))
        .forEach((option) => option.remove());
      if (!select.options.length) {
        const fallback = document.createElement("option");
        fallback.value = preferred;
        fallback.textContent = unavailableLabel;
        select.replaceChildren(fallback);
        select.disabled = true;
        return false;
      }
      select.value = [...select.options].some(
        (option) => option.value === preferred,
      )
        ? preferred
        : select.options[0]?.value || preferred;
      select.disabled = false;
      return true;
    };
    qualityStatus.textContent = "正在识别当前视频可用清晰度…";
    safeRuntimeSendMessage({
      type: "DINGGE_GET_BILIBILI_PARTS",
      target: "background",
      pageUrl: location.href,
    })
      .then((response) => {
        if (host.isConnected && response?.ok) {
          renderPartList(response.partList);
        }
      })
      .catch(() => {});
    safeRuntimeSendMessage({
        type: "DINGGE_GET_BILIBILI_QUALITIES",
        target: "background",
        pageUrl: location.href,
      })
      .then((response) => {
        if (!host.isConnected) return;
        renderPartList(response?.partList);
        const available = new Set(
          (response?.availableQualities || []).map((value) => String(value)),
        );
        if (!response?.ok || !available.size) {
          limitSelectToAvailable($("#quality"), [], "开始下载时确认");
          limitSelectToAvailable($("#audioQuality"), [], "开始下载时确认");
          limitSelectToAvailable($("#codec"), [], "由当前媒体流决定");
          qualityStatus.textContent = "清晰度将在开始下载时由 B站接口确认";
          void refreshPartSizes();
          return;
        }
        const select = $("#quality");
        const preferredQuality = select.value;
        const originalOptions = [...select.options];
        const preferredIndex = Math.max(
          0,
          originalOptions.findIndex((option) => option.value === preferredQuality),
        );
        originalOptions
          .filter((option) => !available.has(option.value))
          .forEach((option) => option.remove());
        if (!select.options.length) {
          limitSelectToAvailable(select, [], "开始下载时确认");
          qualityStatus.textContent =
            "清晰度将在开始下载时由 B站接口确认";
          void refreshPartSizes();
          return;
        }
        const preferredOption = [...select.options].find(
          (option) => option.value === preferredQuality,
        );
        if (preferredOption) select.value = preferredOption.value;
        else if (select.options.length) {
          const closestOption = [...select.options]
            .map((option) => ({
              option,
              index: originalOptions.findIndex(
                (original) => original.value === option.value,
              ),
            }))
            .sort((left, right) => {
              const leftIsLower = left.index >= preferredIndex;
              const rightIsLower = right.index >= preferredIndex;
              if (leftIsLower !== rightIsLower) return leftIsLower ? -1 : 1;
              return (
                Math.abs(left.index - preferredIndex) -
                Math.abs(right.index - preferredIndex)
              );
            })[0]?.option;
          if (closestOption) select.value = closestOption.value;
        }
        const hasAudioOptions = limitSelectToAvailable(
          $("#audioQuality"),
          response.availableAudioQualities,
          "当前视频没有返回独立音频规格",
        );
        limitSelectToAvailable(
          $("#codec"),
          response.availableCodecs,
          "由当前媒体流决定",
        );
        if (!hasAudioOptions) {
          $("#audio").checked = false;
          $("#audio").disabled = true;
        }
        qualityStatus.textContent =
          `原视频支持 ${select.options.length} 档清晰度；列表已只保留可用画质`;
        void refreshPartSizes();
      })
      .catch(() => {
        if (host.isConnected) {
          limitSelectToAvailable($("#quality"), [], "开始下载时确认");
          limitSelectToAvailable($("#audioQuality"), [], "开始下载时确认");
          limitSelectToAvailable($("#codec"), [], "由当前媒体流决定");
          qualityStatus.textContent = "清晰度将在开始下载时由 B站接口确认";
          void refreshPartSizes();
        }
      });
    [$("#quality"), $("#audioQuality"), $("#codec"), $("#audio")].forEach(
      (control) => {
        control.addEventListener("change", () => {
          void refreshPartSizes();
        });
      },
    );
    $(".copy-name").addEventListener("click", async () => {
      const status = $(".status");
      const title = titleInput.value.trim() || detectBilibiliVideoTitle();
      try {
        await navigator.clipboard.writeText(title);
      } catch {
        titleInput.focus();
        titleInput.select();
        document.execCommand("copy");
      }
      status.textContent = title ? "名称已复制" : "当前没有可复制的名称";
    });
    const close = () => {
      host.remove();
      if (bilibiliDialogHost === host) bilibiliDialogHost = null;
    };
    $(".cancel").addEventListener("click", close);
    $(".mask").addEventListener("click", (event) => {
      if (event.target === $(".mask")) close();
    });
    const startDownload = async (packageParts = false) => {
      const confirm = $(".confirm");
      const packageButton = $(".package-parts");
      const status = $(".status");
      confirm.disabled = true;
      packageButton.disabled = true;
      status.textContent = packageParts
        ? "正在启动分P解析与后台打包…"
        : "正在启动解析…";
      try {
        const partCids = packageParts ? selectedPartCids() : [];
        if (packageParts && !partCids.length) {
          throw new Error("请至少选择一个分P视频。");
        }
        if (packageParts && partCids.length > 50) {
          throw new Error("一次最多打包 50 个分P，请减少选择后重试。");
        }
        const response = await safeRuntimeSendMessage({
          type: "DINGGE_START_BILIBILI_DOWNLOAD",
          target: "background",
          title: titleInput.value.trim() || detectBilibiliVideoTitle(),
          pageUrl: location.href,
          packageParts,
          partCids,
          settings: {
            biliQuality: $("#quality").value,
            biliAudioQuality: $("#audioQuality").value,
            biliCodec: $("#codec").value,
            biliDownloadAudio: $("#audio").checked,
            biliDownloadSrt: $("#srt").checked,
            biliDownloadAss: $("#ass").checked,
            biliDownloadCover: $("#cover").checked,
            biliDownloadDanmaku: $("#danmaku").checked,
            biliDialogPreferencesSaved: true,
          },
        });
        if (!response?.started) {
          throw new Error(response?.error || "无法启动 B站下载。");
        }
        close();
      } catch (error) {
        status.textContent = redactSensitiveDisplayText(
          error?.message || "无法启动 B站下载。",
        );
        confirm.disabled = false;
        updatePartSelection();
      }
    };
    shadow.querySelector("form").addEventListener("submit", async (event) => {
      event.preventDefault();
      await startDownload(false);
    });
    $(".package-parts").addEventListener("click", () => startDownload(true));
    titleInput.focus();
    titleInput.select();
    return true;
  }

  function normalizePageViewerItem(rawItem) {
    const item = rawItem && typeof rawItem === "object" ? rawItem : {};
    const kind = item.kind === "video" ? "video" : "image";
    const url = String(item.hlsUrl || item.url || "");
    const rawUrls = Array.isArray(item.urls)
      ? item.urls
      : kind === "video"
        ? [item.poster, ...(item.previewUrls || []), item.fallbackUrl]
        : [
            item.originalUrl,
            item.url,
            ...(item.previewUrls || []),
            item.fallbackUrl,
          ];
    const urls = [
      ...new Set(
        rawUrls
          .filter((value) => typeof value === "string" && value.trim())
          .map((value) => value.trim())
          .filter(
            (value) =>
              kind !== "video" ||
              !/\.(?:mp4|m3u8|webm|mov)(?:$|[?#])/i.test(value),
          ),
      ),
    ];
    if (!url && !urls.length) return null;
    let fallbackName = `${kind}-${Date.now()}`;
    try {
      fallbackName = new URL(url || urls[0], document.baseURI).pathname
        .split("/")
        .filter(Boolean)
        .pop() || fallbackName;
    } catch {
      // Keep a stable generic name when the URL cannot be parsed.
    }
    const width = Number(item.width) || 0;
    const height = Number(item.height) || 0;
    return {
      urls,
      title: String(
        item.title || item.alt || (kind === "video" ? "网页视频" : "网页图片"),
      ),
      meta: String(
        item.meta ||
          (width && height
            ? `${width} × ${height}`
            : kind === "video"
              ? "网页视频"
              : "网页图片"),
      ),
      kind,
      url,
      fallbackUrl: String(item.fallbackUrl || item.url || ""),
      streamType: String(item.streamType || (item.hlsUrl ? "hls" : "")),
      audioUrl: String(item.audioUrl || ""),
      name: String(item.name || fallbackName),
      selected: Boolean(item.selected),
      featured: Boolean(item.featured),
      featuredScore: Number(item.featuredScore) || 0,
      width,
      height,
      pixelScore: imagePixelScore(item),
    };
  }

  function pageViewerItemKey(item) {
    return item.kind === "image"
      ? `image:${canonicalImageIdentity(item.url || item.urls[0] || item.name)}`
      : `${item.kind}:${item.url || item.urls[0] || item.name}`;
  }

  function closePageImageViewer() {
    if (imageViewerKeyHandler) {
      document.removeEventListener("keydown", imageViewerKeyHandler, true);
      imageViewerKeyHandler = null;
    }
    imageViewerHost?.remove();
    imageViewerHost = null;
    imageViewerAppendItems = null;
    imageViewerJobUpdate = null;
    imageViewerFilterUpdate = null;
    safeRuntimeSendMessage({
        type: "DINGGE_UNSUBSCRIBE_JOB_STATUS",
        target: "background",
      })
      .catch(() => {});
  }

  function showPageImageViewer(
    rawItems,
    rawStartIndex = 0,
    rawLayout = "square",
    rawDetailOnly = false,
  ) {
    const dedupedItems = new Map();
    (Array.isArray(rawItems) ? rawItems : [])
      .map(normalizePageViewerItem)
      .filter(Boolean)
      .forEach((item) => {
        const key = pageViewerItemKey(item);
        const existing = dedupedItems.get(key);
        if (
          !existing ||
          (item.kind === "image" &&
            imagePixelScore(item) > imagePixelScore(existing))
        ) {
          dedupedItems.set(key, item);
        } else if (item.kind === "image" && item.featured) {
          dedupedItems.set(key, {
            ...existing,
            featured: true,
            featuredScore: Math.max(
              Number(existing.featuredScore) || 0,
              item.featuredScore,
            ),
            urls: [...new Set([...(existing.urls || []), ...(item.urls || [])])],
          });
        }
      });
    const items = [...dedupedItems.values()].sort(
      (left, right) =>
        Number(right.kind === "image" && right.featured) -
          Number(left.kind === "image" && left.featured) ||
        Number(right.featuredScore || 0) - Number(left.featuredScore || 0),
    );
    if (!items.length) return false;
    const detailOnly = Boolean(rawDetailOnly);
    const itemIndexes = new Map(
      items.map((item, index) => [pageViewerItemKey(item), index]),
    );
    closePageImageViewer();

    const host = document.createElement("div");
    host.id = "dingge-page-image-viewer";
    host.style.setProperty("all", "initial", "important");
    host.style.setProperty("position", "fixed", "important");
    host.style.setProperty("inset", "0", "important");
    host.style.setProperty("z-index", "2147483647", "important");
    host.style.setProperty("display", "block", "important");
    const shadow = host.attachShadow({ mode: "closed" });
    globalThis.StillFrameI18n?.observeRoot(shadow);
    const style = document.createElement("style");
    style.textContent = `
      :host { color-scheme: dark; }
      * { box-sizing: border-box; }
      .overlay {
        position: fixed; inset: 0; display: grid; place-items: center;
        padding: 12px 24px; overflow: hidden; background: rgba(19,38,31,.28); color: #13261f;
        backdrop-filter: blur(2px);
        font-family: Arial, "Microsoft YaHei", sans-serif;
      }
      .dialog {
        width: min(1120px, calc(100vw - 48px));
        height: min(820px, calc(100vh - 48px));
        height: min(820px, calc(100dvh - 48px));
        min-height: 0; padding: 18px 18px 10px;
        display: grid; grid-template-columns: minmax(0, 1fr);
        grid-template-rows: auto auto auto minmax(0, 1fr) minmax(44px, auto);
        grid-template-areas:
          "header"
          "bulk"
          "job"
          "gallery"
          "footer";
        overflow: hidden; border: 1px solid #13261f;
        border-radius: 10px;
        background:
          linear-gradient(rgba(19,38,31,.026) 1px,transparent 1px),
          linear-gradient(90deg,rgba(19,38,31,.026) 1px,transparent 1px),
          #f3f1e8;
        background-size: 34px 34px;
        box-shadow: 10px 10px 0 rgba(19,38,31,.32);
      }
      .dialog > .header,
      .dialog > .bulk-actions,
      .dialog > .job-progress,
      .dialog > .gallery,
      .dialog > .footer {
        width: 100%; min-width: 0; max-width: 100%;
      }
      .dialog > .header { grid-area: header; }
      .dialog > .bulk-actions { grid-area: bulk; }
      .dialog > .job-progress { grid-area: job; }
      .dialog > .gallery { grid-area: gallery; }
      .dialog > .footer { grid-area: footer; }
      .header, .footer { display: flex; align-items: center; justify-content: space-between; gap: 14px; }
      .header {
        overflow: hidden; padding-bottom: 12px;
        border-bottom: 1px solid rgba(19,38,31,.17);
      }
      .header-actions, .layout-switch { display: flex; flex: 0 0 auto; align-items: center; gap: 7px; }
      .image-filter-control {
        height: 34px; padding: 0 7px 0 9px; border: 1px solid rgba(19,38,31,.24);
        border-radius: 7px; background: rgba(255,255,255,.72);
        display: flex; align-items: center; gap: 7px;
      }
      .image-filter-control > span {
        color: #64716b; font-size: 10px; font-weight: 700; white-space: nowrap;
      }
      .image-filter-control select {
        width: 112px; height: 26px; padding: 0 22px 0 7px;
        border: 1px solid rgba(19,38,31,.2); border-radius: 5px;
        background: #fff; color: #13261f; outline: none;
        font: 700 10px/1 Arial, "Microsoft YaHei", sans-serif;
      }
      .info { min-width: 0; flex: 1 1 auto; display: flex; flex-direction: column; gap: 4px; }
      .title {
        width: 100%; max-width: 100%; overflow: hidden;
        font-size: 19px; font-weight: 800; letter-spacing: -.035em;
        text-overflow: ellipsis; white-space: nowrap;
      }
      .meta { color: #64716b; font-size: 11px; }
      button {
        height: 40px; padding: 0 16px; border: 1px solid rgba(19,38,31,.22);
        border-radius: 8px; background: rgba(255,255,255,.58); color: #13261f;
        cursor: pointer; font: 700 13px/1 Arial, sans-serif;
      }
      button:hover, button:focus-visible { outline: none; border-color: #13261f; background: #d8ff3e; }
      button:disabled { cursor: default; opacity: .35; }
      .close { width: 42px; padding: 0; border-radius: 50%; font-size: 25px; }
      .layout-switch button { height: 34px; padding: 0 11px; font-size: 11px; }
      .layout-switch button.active { border-color: #13261f; background: #d8ff3e; color: #13261f; }
      .bulk-actions {
        display: grid; grid-template-columns: repeat(5, minmax(0, 1fr));
        gap: 7px; margin-top: 12px;
      }
      .bulk-actions button { height: 34px; padding: 0 8px; font-size: 11px; }
      .bulk-actions button.active {
        border-color: #13261f; background: #d8ff3e; color: #13261f;
      }
      .job-progress {
        margin-top: 10px; padding: 10px 12px; border: 1px solid rgba(19,38,31,.2);
        border-radius: 8px; background: rgba(255,255,255,.52);
      }
      .job-progress[hidden] { display: none; }
      .job-progress-heading {
        margin-bottom: 7px; display: flex; align-items: center;
        justify-content: space-between; gap: 12px;
      }
      .job-progress-heading strong { font-size: 11px; }
      .job-progress-actions { display: flex; align-items: center; gap: 7px; }
      .job-progress-heading b {
        padding: 3px 7px; border-radius: 999px; background: #d8ff3e;
        color: #07100c; font: 800 10px/1 "Courier New", monospace;
      }
      .job-cancel {
        width: auto; height: 26px; padding: 0 9px; border-color: rgba(19,38,31,.28);
        color: #13261f; font-size: 10px;
      }
      .job-cancel:hover, .job-cancel:focus-visible {
        border-color: #13261f; background: #13261f; color: #d8ff3e;
      }
      .job-progress-track {
        height: 6px; overflow: hidden; border-radius: 999px;
        background: rgba(255,255,255,.12);
      }
      .job-progress-track i {
        display: block; width: 0; height: 100%; border-radius: inherit;
        background: #d8ff3e; transition: width 180ms ease;
      }
      .job-progress-text {
        display: block; margin-top: 7px; overflow: hidden;
        color: #64716b; font-size: 10px;
        text-overflow: ellipsis; white-space: nowrap;
      }
      .gallery {
        width: 100%; height: 100%; min-height: 0; margin: 10px 0 0; padding: 12px;
        align-self: stretch;
        position: relative; z-index: 1;
        border-radius: 8px; background: #242424;
        overflow-x: hidden; overflow-y: auto; overscroll-behavior: contain;
        scrollbar-color: rgba(19,38,31,.38) transparent;
      }
      .gallery-content { width: 100%; min-width: 0; min-height: 100%; }
      .gallery-content.square {
        display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
        align-content: start; gap: 12px;
      }
      .gallery-content.waterfall {
        display: block; width: 100%; column-count: 4; column-gap: 12px;
      }
      .card {
        position: relative; width: 100%; min-width: 0; height: auto; padding: 0;
        overflow: hidden; border: 1px solid rgba(19,38,31,.18); border-radius: 8px;
        background: #242424; color: #fff; cursor: pointer;
      }
      .card.filtered-out { display: none !important; }
      .square .card { aspect-ratio: 1; contain: layout paint; }
      .waterfall .card {
        display: inline-block; min-height: 90px; margin: 0 0 12px;
        break-inside: avoid; vertical-align: top;
      }
      .card.selected { border-color: #d8ff3e; box-shadow: 0 0 0 2px rgba(216,255,62,.28); }
      .card.checked { border-color: #d8ff3e; }
      .card img { display: block; width: 100%; background: #242424; }
      .square .card img { position: absolute; inset: 0; height: 100%; object-fit: cover; }
      .waterfall .card img { height: auto; max-width: 100%; object-fit: contain; }
      .card .index {
        position: absolute; top: 7px; left: 7px; padding: 4px 6px;
        border-radius: 999px; background: rgba(7,14,11,.78);
        color: #d8ff3e; font: 700 10px/1 "Courier New", monospace;
      }
      .card .kind {
        position: absolute; top: 7px; right: 7px; padding: 4px 6px;
        border-radius: 999px; background: rgba(7,14,11,.78);
        color: #fff; font: 700 10px/1 Arial, sans-serif;
      }
      .card .resolution {
        position: absolute; left: 7px; bottom: 7px; padding: 4px 6px;
        border-radius: 999px; background: rgba(7,14,11,.82);
        color: #d8ff3e; font: 700 9px/1 "Courier New", monospace;
        pointer-events: none;
      }
      .card .resolution:empty { display: none; }
      .card .check {
        position: absolute; right: 8px; bottom: 8px; width: 24px; height: 24px;
        display: grid; place-items: center; border: 1px solid rgba(255,255,255,.6);
        border-radius: 6px; background: rgba(7,14,11,.78); color: transparent;
        font: 900 15px/1 Arial, sans-serif;
      }
      .card.checked .check { border-color: #d8ff3e; background: #d8ff3e; color: #07100c; }
      .card .status {
        position: absolute; inset: 0; display: grid; place-items: center; padding: 16px;
        color: rgba(255,255,255,.72); font-size: 11px; text-align: center;
      }
      .card.loaded .status { display: none; }
      .counter {
        min-width: 86px; padding: 7px 10px; border: 1px solid rgba(19,38,31,.24);
        border-radius: 7px; background: rgba(255,255,255,.68); color: #13261f;
        text-align: center; font: 800 11px/1 Arial, "Microsoft YaHei", sans-serif;
      }
      .hint { color: #64716b; font-size: 11px; }
      .footer {
        min-height: 48px; margin-top: 8px; padding: 8px 0 0;
        position: relative; z-index: 2; flex-wrap: wrap; align-self: end;
        border-top: 1px solid rgba(19,38,31,.17); background: #f3f1e8;
      }
      .footer-info, .footer-nav, .download-actions { display: flex; align-items: center; gap: 9px; }
      .footer-info { min-width: 0; flex: 1 1 180px; }
      .footer-nav, .download-actions { flex: 0 0 auto; }
      .footer-nav button { width: 38px; height: 36px; padding: 0; font-size: 17px; }
      .gallery-message { color: #64716b; font-size: 11px; }
      .download-actions button { height: 36px; padding: 0 13px; font-size: 11px; }
      .download-actions .primary { border-color: #13261f; background: #d8ff3e; color: #13261f; }
      .detail-overlay {
        position: absolute; inset: 0; z-index: 5; display: grid; place-items: center;
        padding: 24px; background: rgba(19,38,31,.38); backdrop-filter: blur(5px);
      }
      .detail-overlay[hidden] { display: none; }
      .detail-view {
        width: min(1120px, calc(100vw - 48px));
        height: min(820px, calc(100vh - 48px));
        height: min(820px, calc(100dvh - 48px));
        min-width: 0; min-height: 0; display: grid;
        grid-template-rows: auto minmax(0,1fr) auto;
        overflow: hidden; border: 1px solid #13261f;
        border-radius: 10px;
        background:
          linear-gradient(rgba(19,38,31,.026) 1px,transparent 1px),
          linear-gradient(90deg,rgba(19,38,31,.026) 1px,transparent 1px),
          #f3f1e8;
        background-size: 34px 34px;
        box-shadow: 10px 10px 0 rgba(19,38,31,.36);
      }
      .detail-header, .detail-footer {
        display: flex; align-items: center; justify-content: space-between;
        gap: 12px; padding: 12px 14px;
      }
      .detail-title {
        min-width: 0; flex: 1 1 auto; overflow: hidden; color: #13261f; font-size: 13px;
        font-weight: 800; text-overflow: ellipsis; white-space: nowrap;
      }
      .detail-resolution {
        flex: 0 0 auto; padding: 6px 9px; border-radius: 999px;
        background: #13261f; color: #d8ff3e;
        font: 700 10px/1 "Courier New", monospace;
      }
      .detail-resolution:empty { display: none; }
      .detail-tools, .detail-nav { display: flex; align-items: center; gap: 8px; }
      .detail-tools button, .detail-nav button {
        height: 34px; padding: 0 12px; font-size: 11px;
      }
      .detail-download {
        width: 88px; min-width: 88px; max-width: 88px; flex: 0 0 88px;
        height: 34px !important; padding: 0 12px !important;
        border: 1px solid #13261f !important; border-radius: 7px;
        background: #d8ff3e; color: #07100c;
        font-size: 11px !important; font-weight: 700;
      }
      .detail-close { width: 36px; padding: 0 !important; font-size: 20px !important; }
      .zoom-label {
        min-width: 54px; color: #13261f; font: 700 11px/1 "Courier New", monospace;
        text-align: center;
      }
      .detail-stage {
        min-width: 0; min-height: 0; position: relative;
        overflow: hidden; overscroll-behavior: contain;
        display: grid; place-items: center; padding: 18px;
        border-top: 1px solid rgba(19,38,31,.14);
        border-bottom: 1px solid rgba(19,38,31,.14);
        background: #242424; touch-action: none;
      }
      .detail-stage.pannable { cursor: grab; }
      .detail-stage.dragging { cursor: grabbing; }
      .detail-image {
        position: absolute; left: 50%; top: 50%; display: block;
        width: auto; height: auto;
        max-width: calc(100% - 36px); max-height: calc(100% - 36px);
        object-fit: contain;
        transform-origin: center center; transition: transform 100ms ease-out;
        user-select: none; -webkit-user-drag: none; pointer-events: none;
      }
      .detail-stage.dragging .detail-image { transition: none; }
      .detail-status {
        position: absolute; inset: 0; display: grid; place-items: center;
        padding: 18px; color: rgba(255,255,255,.72); font-size: 11px;
        pointer-events: none;
      }
      .detail-hint { color: #64716b; font-size: 11px; }
      @media (max-width: 520px) {
        .overlay { padding: 6px; }
        .dialog { width: calc(100vw - 12px); height: calc(100vh - 12px); min-height: 0; padding: 12px 12px 8px; }
        .dialog { width: calc(100vw - 12px); height: calc(100dvh - 12px); min-height: 0; padding: 12px 12px 8px; }
        .gallery-content.square { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
        .gallery-content.waterfall { column-count: 2; column-gap: 8px; }
        .waterfall .card { margin-bottom: 8px; }
        .bulk-actions { grid-template-columns: repeat(3, 1fr); }
        .footer-info { flex-basis: 100%; }
        .download-actions { flex: 1 1 auto; }
        .download-actions button { flex: 1; }
        .hint { display: none; }
        .image-filter-control > span { display: none; }
        .image-filter-control select { width: 92px; }
        button { padding: 0 11px; }
        .detail-overlay { padding: 10px; }
        .detail-view { width: calc(100vw - 20px); height: calc(100dvh - 20px); }
        .detail-header, .detail-footer { padding: 9px; }
        .detail-hint { display: none; }
      }
      @media (min-width: 521px) and (max-width: 760px) {
        .gallery-content.waterfall { column-count: 3; }
      }
    `;
    const overlay = document.createElement("div");
    overlay.className = "overlay";
    const header = document.createElement("div");
    header.className = "header";
    const info = document.createElement("div");
    info.className = "info";
    const title = document.createElement("div");
    title.className = "title";
    const meta = document.createElement("div");
    meta.className = "meta";
    info.append(title, meta);
    const headerActions = document.createElement("div");
    headerActions.className = "header-actions";
    const imageFilterControl = document.createElement("label");
    imageFilterControl.className = "image-filter-control";
    imageFilterControl.hidden = detailOnly;
    const imageFilterLabel = document.createElement("span");
    imageFilterLabel.textContent = "图片筛选";
    const imageFilterSelect = document.createElement("select");
    [
      ["off", "不筛选"],
      ["relaxed", "宽松"],
      ["standard", "标准"],
      ["strict", "严格"],
    ].forEach(([value, label]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      imageFilterSelect.append(option);
    });
    imageFilterSelect.value = imageFilterLevel;
    imageFilterControl.append(imageFilterLabel, imageFilterSelect);
    const layoutSwitch = document.createElement("div");
    layoutSwitch.className = "layout-switch";
    const squareButton = document.createElement("button");
    squareButton.type = "button";
    squareButton.textContent = "方块";
    const waterfallButton = document.createElement("button");
    waterfallButton.type = "button";
    waterfallButton.textContent = "瀑布流";
    layoutSwitch.append(squareButton, waterfallButton);
    const close = document.createElement("button");
    close.className = "close";
    close.type = "button";
    close.textContent = "×";
    close.setAttribute("aria-label", "关闭图片预览");
    headerActions.append(imageFilterControl, layoutSwitch, close);
    header.append(info, headerActions);
    const bulkActions = document.createElement("div");
    bulkActions.className = "bulk-actions";
    const selectAllButton = document.createElement("button");
    selectAllButton.type = "button";
    selectAllButton.textContent = "全选";
    const selectImagesButton = document.createElement("button");
    selectImagesButton.type = "button";
    selectImagesButton.textContent = "全选图片";
    const selectVideosButton = document.createElement("button");
    selectVideosButton.type = "button";
    selectVideosButton.textContent = "全选视频";
    const rescanButton = document.createElement("button");
    rescanButton.type = "button";
    rescanButton.textContent = "重新扫描";
    const clearScanButton = document.createElement("button");
    clearScanButton.type = "button";
    clearScanButton.textContent = "清空扫描";
    bulkActions.append(
      selectAllButton,
      selectImagesButton,
      selectVideosButton,
      rescanButton,
      clearScanButton,
    );
    const jobProgress = document.createElement("div");
    jobProgress.className = "job-progress";
    jobProgress.hidden = true;
    const jobProgressHeading = document.createElement("div");
    jobProgressHeading.className = "job-progress-heading";
    const jobProgressTitle = document.createElement("strong");
    jobProgressTitle.textContent = "打包处理进度";
    const jobProgressPercent = document.createElement("b");
    jobProgressPercent.textContent = "0%";
    const jobProgressActions = document.createElement("div");
    jobProgressActions.className = "job-progress-actions";
    const jobCancelButton = document.createElement("button");
    jobCancelButton.className = "job-cancel";
    jobCancelButton.type = "button";
    jobCancelButton.textContent = "取消打包";
    jobCancelButton.hidden = true;
    jobProgressActions.append(jobProgressPercent, jobCancelButton);
    jobProgressHeading.append(jobProgressTitle, jobProgressActions);
    const jobProgressTrack = document.createElement("div");
    jobProgressTrack.className = "job-progress-track";
    const jobProgressBar = document.createElement("i");
    jobProgressTrack.append(jobProgressBar);
    const jobProgressText = document.createElement("span");
    jobProgressText.className = "job-progress-text";
    jobProgressText.textContent = "准备打包…";
    jobProgress.append(jobProgressHeading, jobProgressTrack, jobProgressText);
    const gallery = document.createElement("div");
    gallery.className = "gallery";
    const galleryContent = document.createElement("div");
    galleryContent.className = "gallery-content";
    gallery.append(galleryContent);
    const footer = document.createElement("div");
    footer.className = "footer";
    const footerInfo = document.createElement("div");
    footerInfo.className = "footer-info";
    const counter = document.createElement("b");
    counter.className = "counter";
    const hint = document.createElement("span");
    hint.className = "hint";
    hint.textContent = "点击媒体勾选 · 方向键定位 · Esc 关闭";
    const galleryMessage = document.createElement("span");
    galleryMessage.className = "gallery-message";
    const footerNav = document.createElement("div");
    footerNav.className = "footer-nav";
    const previousButton = document.createElement("button");
    previousButton.type = "button";
    previousButton.textContent = "↑";
    previousButton.setAttribute("aria-label", "回到顶部");
    const nextButton = document.createElement("button");
    nextButton.type = "button";
    nextButton.textContent = "↓";
    nextButton.setAttribute("aria-label", "到达底部");
    footerNav.append(previousButton, nextButton);
    const downloadActions = document.createElement("div");
    downloadActions.className = "download-actions";
    const downloadButton = document.createElement("button");
    downloadButton.className = "primary";
    downloadButton.type = "button";
    downloadButton.textContent = "下载所选";
    const packageButton = document.createElement("button");
    packageButton.type = "button";
    packageButton.textContent = "打包 ZIP";
    downloadActions.append(downloadButton, packageButton);
    footerInfo.append(counter, hint, galleryMessage);
    footer.append(footerInfo, footerNav, downloadActions);
    const dialog = document.createElement("div");
    dialog.className = "dialog";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-label", "多图浏览");
    dialog.append(header, bulkActions, jobProgress, gallery, footer);
    let galleryZipJobId = "";
    let galleryJobHideTimer = 0;
    const updateJobProgress = (job, status = {}) => {
      if (!job) {
        if (!galleryZipJobId) return;
        const wasCanceled =
          status.canceledJobId &&
          status.canceledJobId === galleryZipJobId;
        jobProgress.hidden = false;
        jobProgressPercent.textContent = wasCanceled ? "已取消" : "100%";
        jobProgressBar.style.width = wasCanceled ? "0%" : "100%";
        jobProgressText.textContent = wasCanceled
          ? "打包任务已取消，可以重新选择并打包"
          : "ZIP 已生成并开始下载";
        jobCancelButton.hidden = true;
        jobCancelButton.disabled = false;
        jobCancelButton.textContent = "取消打包";
        packageButton.disabled = false;
        galleryZipJobId = "";
        updateCheckedUI();
        clearTimeout(galleryJobHideTimer);
        galleryJobHideTimer = setTimeout(() => {
          jobProgress.hidden = true;
          jobProgressPercent.textContent = "0%";
          jobProgressBar.style.width = "0%";
          jobProgressText.textContent = "";
        }, 1600);
        return;
      }
      if (job.type !== "zip") return;
      clearTimeout(galleryJobHideTimer);
      galleryZipJobId = job.jobId || galleryZipJobId;
      const percent = Math.max(
        0,
        Math.min(100, Math.round(Number(job.percent) || 0)),
      );
      jobProgress.hidden = false;
      jobProgressPercent.textContent = `${percent}%`;
      jobProgressBar.style.width = `${percent}%`;
      jobProgressText.textContent = job.text || "后台正在打包媒体…";
      jobCancelButton.hidden = false;
      jobCancelButton.disabled = false;
      jobCancelButton.textContent = "取消打包";
      packageButton.disabled = true;
    };
    imageViewerJobUpdate = updateJobProgress;
    const detailOverlay = document.createElement("div");
    detailOverlay.className = "detail-overlay";
    detailOverlay.hidden = true;
    const detailView = document.createElement("div");
    detailView.className = "detail-view";
    detailView.setAttribute("role", "dialog");
    detailView.setAttribute("aria-modal", "true");
    detailView.setAttribute("aria-label", "放大查看图片");
    const detailHeader = document.createElement("div");
    detailHeader.className = "detail-header";
    const detailTitle = document.createElement("div");
    detailTitle.className = "detail-title";
    const detailResolution = document.createElement("span");
    detailResolution.className = "detail-resolution";
    const detailTools = document.createElement("div");
    detailTools.className = "detail-tools";
    const zoomLabel = document.createElement("span");
    zoomLabel.className = "zoom-label";
    zoomLabel.textContent = "100%";
    const detailDownload = document.createElement("button");
    detailDownload.className = "detail-download";
    detailDownload.type = "button";
    detailDownload.textContent = "下载";
    const detailClose = document.createElement("button");
    detailClose.className = "detail-close";
    detailClose.type = "button";
    detailClose.textContent = "×";
    detailClose.setAttribute("aria-label", "关闭放大查看");
    detailTools.append(zoomLabel, detailDownload, detailClose);
    detailHeader.append(detailTitle, detailResolution, detailTools);
    const detailStage = document.createElement("div");
    detailStage.className = "detail-stage";
    const detailImage = document.createElement("img");
    detailImage.className = "detail-image";
    detailImage.alt = "";
    detailImage.draggable = false;
    const detailStatus = document.createElement("span");
    detailStatus.className = "detail-status";
    detailStage.append(detailImage, detailStatus);
    const detailFooter = document.createElement("div");
    detailFooter.className = "detail-footer";
    const detailHint = document.createElement("span");
    detailHint.className = "detail-hint";
    detailHint.textContent = "滚轮缩放 · 按住拖动 · ← → 切换 · Esc 返回";
    const detailNav = document.createElement("div");
    detailNav.className = "detail-nav";
    const detailPrevious = document.createElement("button");
    detailPrevious.type = "button";
    detailPrevious.textContent = "← 上一页";
    const detailNext = document.createElement("button");
    detailNext.type = "button";
    detailNext.textContent = "下一页 →";
    detailNav.append(detailPrevious, detailNext);
    if (detailOnly) {
      detailNav.hidden = true;
      detailHint.textContent = "滚轮缩放 · 按住拖动 · Esc 关闭";
    }
    detailFooter.append(detailHint, detailNav);
    detailView.append(detailHeader, detailStage, detailFooter);
    detailOverlay.append(detailView);
    overlay.append(dialog, detailOverlay);
    shadow.append(style, overlay);
    document.documentElement.append(host);
    imageViewerHost = host;

    let currentIndex = Math.max(0, Math.min(items.length - 1, Number(rawStartIndex) || 0));
    let layout = rawLayout === "waterfall" ? "waterfall" : "square";
    let kindFilter = "all";
    const cards = [];
    const selectedIndexes = new Set(
      items.map((item, index) => (item.selected ? index : -1)).filter((index) => index >= 0),
    );
    const selectedItems = () =>
      [...selectedIndexes].sort((a, b) => a - b).map((index) => items[index]);
    let detailIndex = -1;
    let detailZoom = 1;
    let detailPanX = 0;
    let detailPanY = 0;
    let detailDragPointerId = null;
    let detailDragLastX = 0;
    let detailDragLastY = 0;
    const formatFileSize = (bytes) => {
      const size = Number(bytes);
      if (!Number.isFinite(size) || size <= 0) return "";
      if (size < 1024) return `${Math.round(size)} B`;
      if (size < 1024 ** 2) return `${(size / 1024).toFixed(size < 10240 ? 1 : 0)} KB`;
      if (size < 1024 ** 3) {
        return `${(size / 1024 ** 2).toFixed(size < 10 * 1024 ** 2 ? 1 : 0)} MB`;
      }
      return `${(size / 1024 ** 3).toFixed(1)} GB`;
    };
    const readDataUrlSize = (url) => {
      const match = String(url || "").match(/^data:([^,]*?),(.*)$/is);
      if (!match) return 0;
      try {
        if (/;base64/i.test(match[1])) {
          const data = match[2].replace(/\s/g, "");
          return Math.max(0, Math.floor((data.length * 3) / 4) - (data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0));
        }
        return new TextEncoder().encode(decodeURIComponent(match[2])).length;
      } catch {
        return 0;
      }
    };
    const ensureItemFileSize = async (item, url = item?.urls?.[0]) => {
      if (item?.kind !== "image" || !url) return 0;
      if (Number(item.fileSize) > 0) return Number(item.fileSize);
      const normalizedUrl = String(url);
      if (!mediaFileSizeCache.has(normalizedUrl)) {
        const sizePromise = /^data:/i.test(normalizedUrl)
          ? Promise.resolve(readDataUrlSize(normalizedUrl))
          : safeRuntimeSendMessage({
              type: "DINGGE_GET_MEDIA_FILE_SIZE",
              target: "background",
              url: normalizedUrl,
            })
              .then((response) => Number(response?.size) || 0)
              .catch(() => 0);
        mediaFileSizeCache.set(normalizedUrl, sizePromise);
      }
      const size = await mediaFileSizeCache.get(normalizedUrl);
      if (size > 0) item.fileSize = size;
      return size;
    };
    const formatImageMeta = (item, width = item?.width, height = item?.height) =>
      [
        formatPixelSize(width, height),
        formatFileSize(item?.fileSize),
      ].filter(Boolean).join(" · ");
    const detailIndexes = () =>
      items
        .map((item, index) =>
          item.kind === "image" &&
          item.urls?.length &&
          (kindFilter === "all" || kindFilter === "image")
            ? index
            : -1,
        )
        .filter((index) => index >= 0);
    const renderDetailTransform = () => {
      detailImage.style.transform =
        `translate3d(-50%, -50%, 0) translate3d(${detailPanX}px, ${detailPanY}px, 0) scale(${detailZoom})`;
    };
    const detailPanBounds = () => {
      const stageStyle = getComputedStyle(detailStage);
      const availableWidth = Math.max(
        1,
        detailStage.clientWidth -
          (Number.parseFloat(stageStyle.paddingLeft) || 0) -
          (Number.parseFloat(stageStyle.paddingRight) || 0),
      );
      const availableHeight = Math.max(
        1,
        detailStage.clientHeight -
          (Number.parseFloat(stageStyle.paddingTop) || 0) -
          (Number.parseFloat(stageStyle.paddingBottom) || 0),
      );
      return {
        x: Math.max(
          0,
          (detailImage.clientWidth * detailZoom - availableWidth) / 2,
        ),
        y: Math.max(
          0,
          (detailImage.clientHeight * detailZoom - availableHeight) / 2,
        ),
      };
    };
    const clampDetailPan = () => {
      const bounds = detailPanBounds();
      detailPanX = Math.max(-bounds.x, Math.min(bounds.x, detailPanX));
      detailPanY = Math.max(-bounds.y, Math.min(bounds.y, detailPanY));
      return bounds;
    };
    const setDetailZoom = (nextZoom) => {
      detailZoom = Math.max(0.25, Math.min(8, Number(nextZoom) || 1));
      const bounds = clampDetailPan();
      renderDetailTransform();
      detailStage.classList.toggle("pannable", bounds.x > 0 || bounds.y > 0);
      if (bounds.x === 0 && bounds.y === 0) {
        detailStage.classList.remove("dragging");
      }
      zoomLabel.textContent = `${Math.round(detailZoom * 100)}%`;
    };
    const formatPixelSize = (width, height) => {
      const normalizedWidth = Math.round(Number(width) || 0);
      const normalizedHeight = Math.round(Number(height) || 0);
      return normalizedWidth && normalizedHeight
        ? `${normalizedWidth} × ${normalizedHeight} px`
        : "";
    };
    const loadDetailImage = (item) => {
      let urlIndex = 0;
      detailImage.hidden = false;
      detailResolution.textContent = formatImageMeta(item);
      detailStatus.textContent = "正在加载原图…";
      detailImage.onload = () => {
        if (detailImage.naturalWidth && detailImage.naturalHeight) {
          item.width = detailImage.naturalWidth;
          item.height = detailImage.naturalHeight;
          item.pixelScore = imagePixelScore(item);
          detailResolution.textContent = formatImageMeta(
            item,
            detailImage.naturalWidth,
            detailImage.naturalHeight,
          );
        }
        detailStatus.textContent = "";
        requestAnimationFrame(() => setDetailZoom(1));
        ensureItemFileSize(item, detailImage.currentSrc || detailImage.src).then(() => {
          if (items[detailIndex] === item) {
            detailResolution.textContent = formatImageMeta(
              item,
              detailImage.naturalWidth,
              detailImage.naturalHeight,
            );
          }
        });
      };
      detailImage.onerror = () => {
        urlIndex += 1;
        if (urlIndex < item.urls.length) {
          detailStatus.textContent = "正在尝试备用图片…";
          detailImage.src = item.urls[urlIndex];
          return;
        }
        detailImage.hidden = true;
        detailStatus.textContent = "这张图片暂时无法放大预览";
      };
      detailImage.src = item.urls[0];
    };
    const openDetail = (index) => {
      if (items[index]?.kind !== "image" || !items[index]?.urls?.length) return;
      detailIndex = index;
      const item = items[index];
      detailTitle.textContent = `${index + 1} / ${items.length} · ${item.title}`;
      detailImage.alt = item.title;
      detailOverlay.hidden = false;
      detailStage.scrollTop = 0;
      detailStage.scrollLeft = 0;
      detailPanX = 0;
      detailPanY = 0;
      setDetailZoom(1);
      loadDetailImage(item);
      detailClose.focus();
    };
    const closeDetail = () => {
      if (detailOnly) {
        closePageImageViewer();
        return;
      }
      detailOverlay.hidden = true;
      detailImage.onload = null;
      detailImage.onerror = null;
      detailImage.removeAttribute("src");
      detailIndex = -1;
      detailPanX = 0;
      detailPanY = 0;
      setDetailZoom(1);
    };
    const moveDetail = (direction) => {
      const indexes = detailIndexes();
      if (!indexes.length) return;
      const position = Math.max(0, indexes.indexOf(detailIndex));
      openDetail(
        indexes[(position + direction + indexes.length) % indexes.length],
      );
    };
    const updateCheckedUI = () => {
      cards.forEach((card, index) => {
        const checked = selectedIndexes.has(index);
        card.classList.toggle("checked", checked);
        card.querySelector(".check").textContent = checked ? "✓" : "";
        card.setAttribute("aria-pressed", String(checked));
      });
      const count = selectedIndexes.size;
      counter.textContent = `已选 ${count} / ${items.length}`;
      downloadButton.disabled = count === 0;
      packageButton.disabled = count === 0 || Boolean(galleryZipJobId);
      selectImagesButton.disabled = !items.some((item) => item.kind === "image");
      selectVideosButton.disabled = !items.some((item) => item.kind === "video");
      selectAllButton.classList.toggle(
        "active",
        items.length > 0 && selectedIndexes.size === items.length,
      );
      selectImagesButton.classList.toggle("active", kindFilter === "image");
      selectVideosButton.classList.toggle("active", kindFilter === "video");
      selectAllButton.setAttribute(
        "aria-pressed",
        String(items.length > 0 && selectedIndexes.size === items.length),
      );
      selectImagesButton.setAttribute(
        "aria-pressed",
        String(kindFilter === "image"),
      );
      selectVideosButton.setAttribute(
        "aria-pressed",
        String(kindFilter === "video"),
      );
    };
    const visibleIndexes = () =>
      items
        .map((item, index) =>
          kindFilter === "all" || item.kind === kindFilter ? index : -1,
        )
        .filter((index) => index >= 0);
    const applyKindFilter = () => {
      cards.forEach((card, index) => {
        card.classList.toggle(
          "filtered-out",
          kindFilter !== "all" && items[index]?.kind !== kindFilter,
        );
      });
      const visible = visibleIndexes();
      if (visible.length && !visible.includes(currentIndex)) {
        currentIndex = visible[0];
      }
      updateCheckedUI();
      if (visible.length) selectCard(currentIndex, false);
    };
    const selectCard = (index, shouldScroll = true) => {
      currentIndex = Math.max(0, Math.min(items.length - 1, index));
      const item = items[currentIndex];
      title.textContent = item.title;
      meta.textContent = `${item.meta} · 共 ${items.length} 项媒体`;
      cards.forEach((card, cardIndex) => {
        card.classList.toggle("selected", cardIndex === currentIndex);
      });
      if (shouldScroll) {
        cards[currentIndex]?.scrollIntoView({
          behavior: "smooth",
          block: "center",
          inline: "center",
        });
      }
    };
    const setLayout = (nextLayout, persist = false) => {
      layout = nextLayout === "waterfall" ? "waterfall" : "square";
      galleryContent.className = `gallery-content ${layout}`;
      squareButton.classList.toggle("active", layout === "square");
      waterfallButton.classList.toggle("active", layout === "waterfall");
      squareButton.setAttribute("aria-pressed", String(layout === "square"));
      waterfallButton.setAttribute("aria-pressed", String(layout === "waterfall"));
      if (persist) safeLocalStorageSet({ previewLayout: layout }).catch(() => {});
      requestAnimationFrame(() => selectCard(currentIndex));
    };

    const appendCard = (item, itemIndex) => {
      const card = document.createElement("button");
      card.className = "card";
      card.type = "button";
      card.title = item.title;
      const image = document.createElement("img");
      image.alt = item.title;
      image.referrerPolicy = "no-referrer";
      image.loading = "eager";
      const status = document.createElement("span");
      status.className = "status";
      status.textContent = "正在加载…";
      const badge = document.createElement("span");
      badge.className = "index";
      badge.textContent = String(itemIndex + 1).padStart(2, "0");
      const kind = document.createElement("span");
      kind.className = "kind";
      kind.textContent = item.kind === "video" ? "视频" : "图片";
      const check = document.createElement("span");
      check.className = "check";
      const resolution = document.createElement("span");
      resolution.className = "resolution";
      resolution.textContent =
        item.kind === "image" ? formatImageMeta(item) : "";
      let urlIndex = 0;
      image.onload = () => {
        card.classList.add("loaded");
        if (
          item.kind === "image" &&
          image.naturalWidth &&
          image.naturalHeight
        ) {
          item.width = image.naturalWidth;
          item.height = image.naturalHeight;
          item.pixelScore = imagePixelScore(item);
          resolution.textContent = formatImageMeta(
            item,
            image.naturalWidth,
            image.naturalHeight,
          );
          ensureItemFileSize(item, image.currentSrc || image.src).then(() => {
            resolution.textContent = formatImageMeta(
              item,
              image.naturalWidth,
              image.naturalHeight,
            );
          });
        }
      };
      image.onerror = () => {
        urlIndex += 1;
        if (urlIndex < item.urls.length) {
          status.textContent = "正在尝试备用图片…";
          image.src = item.urls[urlIndex];
          return;
        }
        image.hidden = true;
        status.textContent = "预览不可用";
      };
      if (item.urls[0]) image.src = item.urls[0];
      else {
        image.hidden = true;
        status.textContent = item.kind === "video" ? "视频可选择下载" : "预览不可用";
      }
      card.append(image, status, badge, kind, resolution, check);
      if (item.kind === "image") {
        image.title = "点击放大查看";
        image.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          openDetail(items.indexOf(item));
        });
      }
      card.addEventListener("click", () => {
        const liveIndex = items.indexOf(item);
        if (liveIndex < 0) return;
        if (selectedIndexes.has(liveIndex)) selectedIndexes.delete(liveIndex);
        else selectedIndexes.add(liveIndex);
        selectCard(liveIndex, false);
        updateCheckedUI();
      });
      cards.push(card);
      card.classList.toggle(
        "filtered-out",
        kindFilter !== "all" && item.kind !== kindFilter,
      );
      galleryContent.append(card);
    };
    items.forEach(appendCard);

    const promoteViewerItem = (index) => {
      if (index <= 0 || index >= items.length) return;
      const selectedItems = new Set(
        [...selectedIndexes].map((selectedIndex) => items[selectedIndex]).filter(Boolean),
      );
      const currentItem = items[currentIndex];
      const detailItem = items[detailIndex];
      const [featuredItem] = items.splice(index, 1);
      const [featuredCard] = cards.splice(index, 1);
      items.unshift(featuredItem);
      cards.unshift(featuredCard);
      galleryContent.prepend(featuredCard);
      itemIndexes.clear();
      items.forEach((item, itemIndex) => {
        itemIndexes.set(pageViewerItemKey(item), itemIndex);
        cards[itemIndex].querySelector(".index").textContent =
          String(itemIndex + 1).padStart(2, "0");
      });
      selectedIndexes.clear();
      items.forEach((item, itemIndex) => {
        if (selectedItems.has(item)) selectedIndexes.add(itemIndex);
      });
      currentIndex = Math.max(0, items.indexOf(currentItem));
      detailIndex = detailItem ? items.indexOf(detailItem) : -1;
      updateCheckedUI();
      applyKindFilter();
      gallery.scrollTop = 0;
    };

    imageViewerAppendItems = (newRawItems) => {
      let addedCount = 0;
      (Array.isArray(newRawItems) ? newRawItems : []).forEach((rawItem) => {
        const item = normalizePageViewerItem(rawItem);
        if (!item) return;
        const key = pageViewerItemKey(item);
        const existingIndex = itemIndexes.get(key);
        if (existingIndex !== undefined) {
          const existing = items[existingIndex];
          const incomingIsBetter =
            item.kind === "image" &&
            imagePixelScore(item) > imagePixelScore(existing);
          const urls = [
            ...new Set(
              incomingIsBetter
                ? [...(item.urls || []), ...(existing.urls || [])]
                : [...(existing.urls || []), ...(item.urls || [])],
            ),
          ];
          const hasNewPreview = urls.length > (existing.urls || []).length;
          Object.assign(
            existing,
            item.kind !== "image" || incomingIsBetter ? item : {},
            {
            urls,
            selected: selectedIndexes.has(existingIndex),
            },
          );
          const card = cards[existingIndex];
          card.title = existing.title;
          if (hasNewPreview && existing.urls[0]) {
            const image = card.querySelector("img");
            image.hidden = false;
            card.classList.remove("loaded");
            image.src = existing.urls[0];
          }
          if (item.kind === "image" && item.featured) {
            promoteViewerItem(existingIndex);
          }
          return;
        }
        const itemIndex = items.length;
        items.push(item);
        itemIndexes.set(key, itemIndex);
        appendCard(item, itemIndex);
        if (kindFilter === item.kind) selectedIndexes.add(itemIndex);
        if (item.kind === "image" && item.featured) {
          promoteViewerItem(itemIndex);
        }
        addedCount += 1;
      });
      if (!addedCount) return;
      updateCheckedUI();
      applyKindFilter();
      selectCard(currentIndex, false);
      galleryMessage.textContent = `实时加入 ${addedCount} 项新媒体`;
      setTimeout(() => {
        if (galleryMessage.textContent.includes("实时加入")) {
          galleryMessage.textContent = "";
        }
      }, 1600);
    };

    close.addEventListener("click", closePageImageViewer);
    const reopenWithImageFilter = (nextLevel, persist = true) => {
      const selectedKeys = new Set(
        [...selectedIndexes]
          .map((index) => items[index])
          .filter(Boolean)
          .map(pageViewerItemKey),
      );
      const currentKey = items[currentIndex]
        ? pageViewerItemKey(items[currentIndex])
        : "";
      imageFilterLevel = normalizeImageFilterLevel(nextLevel);
      imageFilterSelect.value = imageFilterLevel;
      if (persist) {
        safeLocalStorageSet({ imageFilterLevel }).catch(() => {});
      }
      const { items: nextRawItems } = filteredMediaSnapshot();
      const preparedItems = nextRawItems.map((item) => {
        const normalized = normalizePageViewerItem(item);
        return {
          ...item,
          selected: normalized
            ? selectedKeys.has(pageViewerItemKey(normalized))
            : false,
        };
      });
      const nextStartIndex = Math.max(
        0,
        preparedItems.findIndex((item) => {
          const normalized = normalizePageViewerItem(item);
          return normalized && pageViewerItemKey(normalized) === currentKey;
        }),
      );
      closePageImageViewer();
      if (preparedItems.length) {
        showPageImageViewer(preparedItems, nextStartIndex, layout, false);
      }
    };
    if (!detailOnly) {
      imageViewerFilterUpdate = (nextLevel) =>
        reopenWithImageFilter(nextLevel, false);
      imageFilterSelect.addEventListener("change", () => {
        reopenWithImageFilter(imageFilterSelect.value, true);
      });
    }
    squareButton.addEventListener("click", () => setLayout("square", true));
    waterfallButton.addEventListener("click", () => setLayout("waterfall", true));
    previousButton.addEventListener("click", () => {
      gallery.scrollTo({ top: 0, behavior: "smooth" });
    });
    nextButton.addEventListener("click", () => {
      gallery.scrollTo({ top: gallery.scrollHeight, behavior: "smooth" });
    });
    selectAllButton.addEventListener("click", () => {
      const allSelected = selectedIndexes.size === items.length;
      selectedIndexes.clear();
      if (!allSelected) items.forEach((_item, index) => selectedIndexes.add(index));
      kindFilter = "all";
      applyKindFilter();
    });
    const toggleKind = (kind) => {
      const indexes = items
        .map((item, index) => (item.kind === kind ? index : -1))
        .filter((index) => index >= 0);
      const turnOff = kindFilter === kind;
      selectedIndexes.clear();
      if (turnOff) {
        kindFilter = "all";
      } else {
        indexes.forEach((index) => selectedIndexes.add(index));
        kindFilter = kind;
      }
      applyKindFilter();
    };
    selectImagesButton.addEventListener("click", () => toggleKind("image"));
    selectVideosButton.addEventListener("click", () => toggleKind("video"));
    rescanButton.addEventListener("click", async () => {
      rescanButton.disabled = true;
      galleryMessage.textContent = "正在重新扫描当前页面…";
      await scanTree(document);
      const { items: rescannedItems } = filteredMediaSnapshot();
      const preparedItems = rescannedItems.map((item) => ({
        ...item,
        selected: selectedIndexes.has(
          itemIndexes.get(pageViewerItemKey(normalizePageViewerItem(item))),
        ),
      }));
      closePageImageViewer();
      if (preparedItems.length) {
        showPageImageViewer(preparedItems, 0, layout, false);
      }
    });
    clearScanButton.addEventListener("click", async () => {
      clearScanButton.disabled = true;
      images.clear();
      videos.clear();
      currentUrl = location.href;
      await safeRuntimeSendMessage({
        type: "DINGGE_CLEAR_NETWORK_MEDIA",
        target: "background",
      }).catch(() => null);
      items.splice(0);
      cards.splice(0).forEach((card) => card.remove());
      itemIndexes.clear();
      selectedIndexes.clear();
      title.textContent = "扫描结果已清空";
      meta.textContent = "共 0 项媒体";
      galleryMessage.textContent = "可点击“重新扫描”读取当前页面媒体";
      previousButton.disabled = true;
      nextButton.disabled = true;
      updateCheckedUI();
      clearScanButton.disabled = false;
    });
    detailClose.addEventListener("click", closeDetail);
    detailOverlay.addEventListener("click", (event) => {
      if (event.target === detailOverlay) closeDetail();
    });
    detailPrevious.addEventListener("click", () => moveDetail(-1));
    detailNext.addEventListener("click", () => moveDetail(1));
    detailStage.addEventListener("pointerdown", (event) => {
      if (
        event.button !== 0 ||
        !detailStage.classList.contains("pannable") ||
        detailImage.hidden
      ) {
        return;
      }
      event.preventDefault();
      detailDragPointerId = event.pointerId;
      detailDragLastX = event.clientX;
      detailDragLastY = event.clientY;
      detailStage.classList.add("dragging");
      detailStage.setPointerCapture(event.pointerId);
    });
    detailStage.addEventListener("pointermove", (event) => {
      if (detailDragPointerId !== event.pointerId) return;
      event.preventDefault();
      detailPanX += event.clientX - detailDragLastX;
      detailPanY += event.clientY - detailDragLastY;
      detailDragLastX = event.clientX;
      detailDragLastY = event.clientY;
      clampDetailPan();
      renderDetailTransform();
    });
    const stopDetailDrag = (event) => {
      if (detailDragPointerId !== event.pointerId) return;
      detailDragPointerId = null;
      detailStage.classList.remove("dragging");
      if (detailStage.hasPointerCapture(event.pointerId)) {
        detailStage.releasePointerCapture(event.pointerId);
      }
    };
    detailStage.addEventListener("pointerup", stopDetailDrag);
    detailStage.addEventListener("pointercancel", stopDetailDrag);
    detailStage.addEventListener("lostpointercapture", (event) => {
      if (detailDragPointerId === event.pointerId) {
        detailDragPointerId = null;
        detailStage.classList.remove("dragging");
      }
    });
    detailStage.addEventListener(
      "wheel",
      (event) => {
        event.preventDefault();
        const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
        setDetailZoom(detailZoom * factor);
      },
      { passive: false },
    );
    detailDownload.addEventListener("click", async () => {
      const item = items[detailIndex];
      if (!item) return;
      detailDownload.disabled = true;
      detailStatus.textContent = "正在创建下载…";
      try {
        const response = await safeRuntimeSendMessage({
          type: "DINGGE_GALLERY_DOWNLOAD",
          target: "background",
          jobId: createPageJobId(),
          items: [item],
        });
        if (!response?.started) {
          throw new Error(response?.error || "无法创建下载任务。");
        }
        detailStatus.textContent = "下载已开始";
      } catch (error) {
        detailStatus.textContent = redactSensitiveDisplayText(
          error?.message || "下载失败",
        );
      } finally {
        detailDownload.disabled = false;
      }
    });
    downloadButton.addEventListener("click", async () => {
      galleryMessage.textContent = "正在创建下载任务…";
      downloadButton.disabled = true;
      packageButton.disabled = true;
      try {
        const response = await safeRuntimeSendMessage({
          type: "DINGGE_GALLERY_DOWNLOAD",
          target: "background",
          jobId: createPageJobId(),
          items: selectedItems(),
        });
        if (!response?.started) throw new Error(response?.error || "下载任务启动失败。");
        galleryMessage.textContent = response.background
          ? "后台处理中，可关闭画廊"
          : "下载已开始";
      } catch (error) {
        galleryMessage.textContent = redactSensitiveDisplayText(
          error?.message || "下载任务启动失败",
        );
      } finally {
        updateCheckedUI();
      }
    });
    jobCancelButton.addEventListener("click", async () => {
      const jobId = galleryZipJobId;
      if (!jobId) return;
      jobCancelButton.disabled = true;
      jobCancelButton.textContent = "取消中…";
      jobProgressText.textContent = "正在取消后台打包任务…";
      try {
        const response = await safeRuntimeSendMessage({
          type: "DINGGE_CANCEL_JOB",
          target: "background",
          jobId,
        });
        if (!response?.canceled) {
          throw new Error(response?.error || "取消打包失败");
        }
        updateJobProgress(null, { canceledJobId: jobId });
      } catch (error) {
        jobProgressText.textContent = redactSensitiveDisplayText(
          error?.message || "取消打包失败",
        );
        jobCancelButton.disabled = false;
        jobCancelButton.textContent = "重试取消";
      }
    });
    packageButton.addEventListener("click", async () => {
      galleryMessage.textContent = "正在启动后台打包…";
      downloadButton.disabled = true;
      packageButton.disabled = true;
      galleryZipJobId = createPageJobId();
      updateJobProgress({
        jobId: galleryZipJobId,
        type: "zip",
        percent: 2,
        text: "正在启动后台打包…",
      });
      const hostName = (location.hostname || "website")
        .replace(/[^a-zA-Z0-9\u4e00-\u9fff._-]+/g, "-")
        .slice(0, 80);
      try {
        const response = await safeRuntimeSendMessage({
          type: "DINGGE_START_ZIP",
          target: "background",
          jobId: galleryZipJobId,
          archiveName: `${hostName || "website"}-media.zip`,
          images: selectedItems().flatMap((item) => {
            if (item.streamType !== "dash-video") {
              return [{
                url: item.url,
                fallbackUrl: item.fallbackUrl,
                name: item.name,
                streamType: item.streamType,
              }];
            }
            const baseName = String(item.name || "bilibili-video").replace(
              /\.(?:m4s|mp4|webm|mov|m4v)$/i,
              "",
            );
            return [
              {
                url: item.url,
                fallbackUrl: item.fallbackUrl,
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
        if (!response?.started) throw new Error(response?.error || "打包任务启动失败。");
        galleryMessage.textContent = "后台打包中，可关闭画廊";
      } catch (error) {
        galleryMessage.textContent = redactSensitiveDisplayText(
          error?.message || "打包任务启动失败",
        );
        jobProgress.hidden = true;
        galleryZipJobId = "";
      } finally {
        updateCheckedUI();
      }
    });
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) closePageImageViewer();
    });
    imageViewerKeyHandler = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        if (!detailOverlay.hidden) closeDetail();
        else closePageImageViewer();
      } else if (event.key === "ArrowLeft") {
        if (!detailOverlay.hidden) {
          event.preventDefault();
          event.stopPropagation();
          moveDetail(-1);
        }
      } else if (event.key === "ArrowRight") {
        if (!detailOverlay.hidden) {
          event.preventDefault();
          event.stopPropagation();
          moveDetail(1);
        }
      } else if (event.key === "ArrowUp" && detailOverlay.hidden) {
        event.preventDefault();
        event.stopPropagation();
        previousButton.click();
      } else if (event.key === "ArrowDown" && detailOverlay.hidden) {
        event.preventDefault();
        event.stopPropagation();
        nextButton.click();
      }
    };
    document.addEventListener("keydown", imageViewerKeyHandler, true);
    setLayout(layout);
    requestAnimationFrame(() => selectCard(currentIndex));
    updateCheckedUI();
    safeRuntimeSendMessage({
        type: "DINGGE_GET_JOB_STATUS",
        target: "background",
        subscribe: true,
      })
      .then((response) => {
        if (imageViewerHost === host && response?.job?.type === "zip") {
          updateJobProgress(response.job);
        }
      })
      .catch(() => {});
    if (detailOnly) {
      requestAnimationFrame(() => openDetail(currentIndex));
    } else {
      close.focus();
    }
    return true;
  }

  function pinterestMediaHash(rawValue) {
    const match = String(rawValue || "").match(
      /(?:^|\/)([a-f0-9]{2})\/([a-f0-9]{2})\/([a-f0-9]{2})\/([a-f0-9]{32,})(?=[._/?#]|$)/i,
    );
    return match
      ? `${match[1]}/${match[2]}/${match[3]}/${match[4]}`.toLowerCase()
      : "";
  }

  function pinterestVideoUrlsFromText(rawText) {
    const normalized = String(rawText || "")
      .replace(/\\u002f/gi, "/")
      .replace(/\\u0026/gi, "&")
      .replace(/\\\//g, "/")
      .replace(/&amp;/gi, "&");
    const urls = [];
    for (const match of normalized.matchAll(/https?:\/\/[^"'\\\s<>]+/gi)) {
      const url = match[0].replace(/[),}\]]+$/g, "");
      if (
        /v1\.pinimg\.com\/videos\/|\.(?:mp4|m3u8)(?:$|[?#])/i.test(url)
      ) {
        urls.push(url);
      }
    }
    return [...new Set(urls)];
  }

  function normalizeImageUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== "string") return "";
    const cleaned = rawUrl.trim().replace(/^url\((['"]?)(.*)\1\)$/i, "$2");
    if (!cleaned || cleaned === "none" || cleaned.startsWith("blob:")) return "";
    try {
      const absolute = new URL(cleaned, document.baseURI).href;
      return /^https?:|^data:image\//i.test(absolute) ? absolute : "";
    } catch {
      return "";
    }
  }

  function cssBackgroundUrl(element) {
    if (!(element instanceof Element)) return "";
    const value = getComputedStyle(element).backgroundImage;
    const match = value?.match(/url\((['"]?)(.*?)\1\)/i);
    return normalizeImageUrl(match?.[2] || "");
  }

  function findVideoPoster(video = null) {
    const directPoster = normalizeImageUrl(video?.poster || "");
    if (directPoster) return directPoster;
    const playerScope =
      video?.closest(
        "#bilibili-player, .bpx-player-container, .bilibili-player, [class*='player']",
      ) || video?.parentElement;
    const backgroundSelectors = [
      ".bpx-player-poster",
      ".bilibili-player-video-panel",
      "[class*='poster']",
      "[class*='cover']",
    ];
    for (const selector of backgroundSelectors) {
      const poster = cssBackgroundUrl(playerScope?.querySelector(selector));
      if (poster) return poster;
    }
    const nearbyImages = [...(playerScope?.querySelectorAll("img") || [])]
      .map((image) => ({
        url: normalizeImageUrl(image.currentSrc || image.src),
        area:
          (image.naturalWidth || image.width || 0) *
          (image.naturalHeight || image.height || 0),
      }))
      .filter((item) => item.url)
      .sort((a, b) => b.area - a.area);
    if (nearbyImages[0]?.url) return nearbyImages[0].url;
    return normalizeImageUrl(
      document.querySelector(
        'meta[property="og:image"], meta[name="twitter:image"]',
      )?.content || "",
    );
  }

  function publishVideoFrame(video) {
    if (
      !(video instanceof HTMLVideoElement) ||
      capturedVideoFrames.has(video) ||
      capturedVideoFrameCount >= 40 ||
      video.readyState < 2 ||
      !video.videoWidth ||
      !video.videoHeight
    ) {
      return;
    }
    try {
      const width = Math.min(360, video.videoWidth);
      const height = Math.max(1, Math.round((width / video.videoWidth) * video.videoHeight));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d", { alpha: false }).drawImage(video, 0, 0, width, height);
      const poster = canvas.toDataURL("image/jpeg", 0.72);
      if (!poster || poster.length > 260000) return;
      capturedVideoFrames.add(video);
      capturedVideoFrameCount += 1;
      const additions = [];
      const details = {
        width: video.videoWidth,
        height: video.videoHeight,
        poster,
        alt: video.getAttribute("aria-label") || video.title,
        source: "video-frame",
      };
      addVideo(video.currentSrc, details, additions);
      addVideo(video.src, details, additions);
      videos.forEach((item, url) => {
        if (item.poster || item.source !== "bilibili-dash") return;
        const updated = { ...item, poster };
        videos.set(url, updated);
        additions.push(updated);
        imageViewerAppendItems?.([updated]);
      });
      if (additions.length) {
        safeRuntimeSendMessage({
            type: "DINGGE_IMAGES_ADDED",
            pageUrl: location.href,
            pageSessionId,
            images: additions,
            filteredCount: filteredMediaSnapshot().filteredCount,
          })
          .catch(() => {});
      }
    } catch {
      // Cross-origin protected videos cannot be drawn to canvas.
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
    }[imageFilterLevel];
  }

  function isImageFilterExempt(image) {
    const descriptor = `${image.url || ""} ${image.alt || ""} ${
      image.hint || ""
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

  function shouldExcludeSmallImage(image) {
    if (!image || image.kind === "video" || imageFilterLevel === "off") {
      return false;
    }
    if (isImageFilterExempt(image)) return false;
    const thresholds = imageFilterThresholds();
    const knownWidth = Number(image.width) || 0;
    const knownHeight = Number(image.height) || 0;
    const descriptor = `${image.url || ""} ${image.alt || ""} ${
      image.hint || ""
    } ${image.source || ""}`.toLowerCase();
    const looksLikeUtilityImage =
      /(?:^|[\/_.?=&\s-])(?:favicon|avatar|profile|userpic|icon|logo|badge|emoji|sprite|thumbnail_?small)(?:[\/_.?=&\s-]|$)/i.test(
        descriptor,
      );
    if (
      knownWidth &&
      knownHeight &&
      (Math.min(knownWidth, knownHeight) < thresholds.minSide ||
        knownWidth * knownHeight < thresholds.minArea)
    ) {
      return true;
    }
    return (
      looksLikeUtilityImage &&
      (!knownWidth ||
        !knownHeight ||
        Math.max(knownWidth, knownHeight) <= thresholds.utilityMax)
    );
  }

  function filteredMediaSnapshot() {
    const visibleImages = [...images.values()].filter(
      (image) => !shouldExcludeSmallImage(image),
    );
    return {
      items: [...visibleImages, ...videos.values()],
      filteredCount: images.size - visibleImages.length,
    };
  }

  function featuredImageScore(element) {
    if (!(element instanceof HTMLImageElement)) return 0;
    if (
      !isPinterestHostname() &&
      !/(^|\.)huaban\.com$/i.test(location.hostname)
    ) {
      return 0;
    }
    const rect = element.getBoundingClientRect();
    const visibleWidth = Math.max(
      0,
      Math.min(rect.right, innerWidth) - Math.max(rect.left, 0),
    );
    const visibleHeight = Math.max(
      0,
      Math.min(rect.bottom, innerHeight) - Math.max(rect.top, 0),
    );
    const visibleArea = visibleWidth * visibleHeight;
    if (
      visibleWidth < Math.min(280, innerWidth * 0.42) ||
      visibleHeight < Math.min(280, innerHeight * 0.42) ||
      visibleArea < 90000
    ) {
      return 0;
    }
    const inMainViewer = Boolean(
      element.closest(
        '[role="dialog"], [data-test-id*="closeup"], [data-test-id*="pin-view"], [class*="lightbox"], [class*="viewer"], [class*="pin-view"], [class*="image-detail"], [class*="zoom"]',
      ),
    );
    const nearTopOrLeft =
      rect.top < innerHeight * 0.34 || rect.left < innerWidth * 0.34;
    if (!inMainViewer && !nearTopOrLeft) return 0;
    return Math.round(
      visibleArea *
        (inMainViewer ? 1.8 : 1) +
        (element.naturalWidth || 0) * (element.naturalHeight || 0) * 0.04,
    );
  }

  function promoteStoredImage(identity) {
    const item = images.get(identity);
    if (!item) return;
    const firstIdentity = images.keys().next().value;
    featuredImageIdentity = identity;
    if (firstIdentity === identity) return;
    const remaining = [...images.entries()].filter(([key]) => key !== identity);
    images.clear();
    images.set(identity, item);
    remaining.forEach(([key, value]) => images.set(key, value));
  }

  function addImage(rawUrl, details = {}, additions = []) {
    const url = normalizeImageUrl(rawUrl);
    if (!url) return;
    const width = Number(details.width) || 0;
    const height = Number(details.height) || 0;
    const hint = `${details.alt || ""} ${details.hint || ""}`;
    const next = {
      url,
      kind: "image",
      width,
      height,
      pixelScore: Math.max(
        Number(details.pixelScore) || 0,
        imagePixelScore({ url, width, height }),
      ),
      alt: String(details.alt || "").trim(),
      source: details.source || "image",
      hint,
      featured: Boolean(details.featured),
      featuredScore: Number(details.featuredScore) || 0,
    };
    const identity = canonicalImageIdentity(url);
    const existing = images.get(identity);
    const isBetter =
      !existing ||
      imagePixelScore(next) > imagePixelScore(existing) ||
      (!existing.alt && next.alt);
    const becameFeatured =
      next.featured &&
      (!existing?.featured ||
        next.featuredScore >= Number(existing.featuredScore || 0));
    if (isBetter || becameFeatured) {
      images.set(identity, {
        ...existing,
        ...next,
        featured: Boolean(existing?.featured || next.featured),
        featuredScore: Math.max(
          Number(existing?.featuredScore) || 0,
          next.featuredScore,
        ),
      });
      const savedImage = images.get(identity);
      if (savedImage.featured) promoteStoredImage(identity);
      if (!shouldExcludeSmallImage(savedImage)) {
        additions.push(savedImage);
        imageViewerAppendItems?.([savedImage]);
      }
    }
  }

  function addVideo(rawUrl, details = {}, additions = []) {
    if (isVideoDownloadExcludedPage()) return;
    if (!rawUrl || typeof rawUrl !== "string" || rawUrl.startsWith("blob:")) return;
    let url;
    try {
      url = new URL(rawUrl, document.baseURI).href;
    } catch {
      return;
    }
    if (!/^https?:|^data:video\//i.test(url)) return;
    const existing = videos.get(url);
    const next = {
      url,
      kind: "video",
      streamType: details.streamType || (/\.m3u8(?:$|[?#])/i.test(url) ? "hls" : ""),
      fallbackUrl: details.fallbackUrl || "",
      hlsUrl: details.hlsUrl || "",
      hlsUrls: Array.isArray(details.hlsUrls) ? details.hlsUrls : [],
      audioUrl: details.audioUrl || "",
      width: Number(details.width) || 0,
      height: Number(details.height) || 0,
      poster: normalizeImageUrl(details.poster),
      alt: String(details.alt || "").trim(),
      source: details.source || "video",
    };
    if (
      !existing ||
      next.width * next.height > existing.width * existing.height ||
      (!existing.poster && next.poster) ||
      (!existing.audioUrl && next.audioUrl) ||
      (!existing.streamType && next.streamType)
    ) {
      videos.set(url, { ...existing, ...next });
      const savedVideo = videos.get(url);
      additions.push(savedVideo);
      imageViewerAppendItems?.([savedVideo]);
    }
  }

  function addSrcset(srcset, details, additions) {
    if (!srcset) return;
    srcset.split(",").forEach((candidate) => {
      const [url, descriptor = ""] = candidate.trim().split(/\s+/);
      const candidateWidth = descriptor.endsWith("w")
        ? Number.parseInt(descriptor, 10) || 0
        : 0;
      const density = descriptor.endsWith("x")
        ? Number.parseFloat(descriptor) || 0
        : 0;
      const baseWidth = Number(details.width) || 0;
      const baseHeight = Number(details.height) || 0;
      const width = Math.max(baseWidth, candidateWidth, baseWidth * density);
      const height =
        baseWidth && baseHeight && width
          ? Math.round((width / baseWidth) * baseHeight)
          : baseHeight;
      addImage(
        url,
        {
          ...details,
          width,
          height,
          pixelScore: width && height ? width * height : width ** 2,
        },
        additions,
      );
    });
  }

  function addVideoUrlsFromText(rawText, additions) {
    if (!rawText || typeof rawText !== "string") return;
    const normalized = rawText
      .replace(/\\u002f/gi, "/")
      .replace(/\\u0026/gi, "&")
      .replace(/\\\//g, "/")
      .replace(/&amp;/gi, "&");
    for (const match of normalized.matchAll(/https?:\/\/[^"'\\\s<>]+/gi)) {
      const candidate = match[0].replace(/[),}\]]+$/g, "");
      if (
        /v1\.pinimg\.com\/videos\//i.test(candidate) ||
        /\.(?:mp4|m4v|mov|webm|m3u8)(?:$|[?#])/i.test(candidate)
      ) {
        addVideo(
          candidate,
          {
            source: "page-data",
            streamType: /\.m3u8(?:$|[?#])/i.test(candidate) ? "hls" : "",
          },
          additions,
        );
      }
    }
  }

  function addBackgroundImages(element, background, additions) {
    if (!background || background === "none") return;
    for (const match of background.matchAll(/url\((['"]?)(.*?)\1\)/gi)) {
      addImage(
        match[2],
        {
          width: element.clientWidth,
          height: element.clientHeight,
          alt: element.getAttribute("aria-label") || "",
          source: "background",
        },
        additions,
      );
    }
  }

  function scanElement(element, additions) {
    if (!(element instanceof Element)) return;

    if (element.matches("img")) {
      const featuredScore = featuredImageScore(element);
      const details = {
        width: element.naturalWidth || element.width,
        height: element.naturalHeight || element.height,
        alt: element.alt,
        hint: `${element.id || ""} ${element.className || ""} ${
          element.getAttribute("role") || ""
        } ${element.getAttribute("aria-label") || ""}`,
        source: "img",
        featured: featuredScore > 0,
        featuredScore,
      };
      addImage(element.currentSrc, details, additions);
      addImage(element.src, details, additions);
      ["data-src", "data-original", "data-lazy-src", "data-url", "data-image"].forEach(
        (attribute) => {
          addImage(
            element.getAttribute(attribute),
            { ...details, source: "lazy" },
            additions,
          );
        },
      );
      addSrcset(element.srcset, details, additions);
      addSrcset(
        element.getAttribute("data-srcset"),
        { ...details, source: "lazy" },
        additions,
      );
    }

    if (element.matches("video")) {
      const details = {
        width: element.videoWidth || element.clientWidth,
        height: element.videoHeight || element.clientHeight,
        poster: findVideoPoster(element),
        alt: element.getAttribute("aria-label") || element.title,
        source: "video",
      };
      addVideo(element.currentSrc, details, additions);
      addVideo(element.src, details, additions);
      addVideo(element.getAttribute("data-src"), details, additions);
      [
        "data-video-url",
        "data-video-src",
        "data-m3u8",
        "data-m3u8-url",
        "data-hls-url",
        "data-player-url",
      ].forEach((attribute) => {
        addVideo(element.getAttribute(attribute), details, additions);
      });
    }

    if (element.matches("source")) {
      if (element.closest("video") || element.type?.startsWith("video/")) {
        const parentVideo = element.closest("video");
        addVideo(
          element.src || element.getAttribute("data-src"),
          {
            width: parentVideo?.videoWidth || parentVideo?.clientWidth,
            height: parentVideo?.videoHeight || parentVideo?.clientHeight,
            poster: findVideoPoster(parentVideo),
            source: "video-source",
          },
          additions,
        );
      } else {
        addSrcset(element.srcset, { source: "srcset" }, additions);
        addSrcset(
          element.getAttribute("data-srcset"),
          { source: "lazy" },
          additions,
        );
      }
    }

    if (
      element.matches(
        'meta[property="og:image"], meta[name="twitter:image"], link[rel="image_src"]',
      )
    ) {
      addImage(element.content || element.href, { source: "metadata" }, additions);
    }

    if (
      element.matches(
        'meta[property="og:video"], meta[property="og:video:url"], meta[property="og:video:secure_url"], meta[name="twitter:player:stream"]',
      )
    ) {
      addVideo(element.content, { source: "metadata" }, additions);
    }

    [
      "data-video-url",
      "data-video-src",
      "data-m3u8",
      "data-m3u8-url",
      "data-hls-url",
      "data-player-url",
    ].forEach((attribute) => {
      const value = element.getAttribute(attribute);
      if (value) addVideo(value, { source: "video-attribute" }, additions);
    });

    if (
      element.matches(
        'script[type="application/json"], script[type="application/ld+json"], script[data-relay-completed-request="true"]',
      )
    ) {
      addVideoUrlsFromText(element.textContent, additions);
    }

    addBackgroundImages(element, element.style?.backgroundImage, additions);
  }

  function publishScanAdditions(additions) {
    if (additions.length) {
      safeRuntimeSendMessage({
          type: "DINGGE_IMAGES_ADDED",
          pageUrl: location.href,
          pageSessionId,
          images: additions,
          filteredCount: filteredMediaSnapshot().filteredCount,
        })
        .catch(() => {});
    }
  }

  function idleCallback(callback) {
    if (typeof requestIdleCallback === "function") {
      return requestIdleCallback(callback, { timeout: 250 });
    }
    return setTimeout(
      () => callback({ didTimeout: true, timeRemaining: () => 0 }),
      16,
    );
  }

  function scheduleComputedBackgroundScan(root, { automatic = false } = {}) {
    const scanRoot =
      root instanceof Document || root instanceof Element ? root : document;
    if (automatic && pendingAutomaticBackgroundRoots.has(scanRoot)) {
      return Promise.resolve([]);
    }
    if (automatic) pendingAutomaticBackgroundRoots.add(scanRoot);

    const generation = backgroundScanGeneration;
    const pageUrl = location.href;
    const walker = document.createTreeWalker(
      scanRoot,
      NodeFilter.SHOW_ELEMENT,
    );
    let current =
      scanRoot instanceof Element ? scanRoot : walker.nextNode();
    const allAdditions = [];

    return new Promise((resolve) => {
      const finish = () => {
        if (automatic) pendingAutomaticBackgroundRoots.delete(scanRoot);
        resolve(allAdditions);
      };
      const runBatch = (deadline) => {
        if (
          generation !== backgroundScanGeneration ||
          location.href !== pageUrl ||
          (automatic && !liveScanEnabled)
        ) {
          finish();
          return;
        }

        const additions = [];
        let processed = 0;
        while (
          current &&
          processed < 120 &&
          (processed < 20 ||
            deadline.didTimeout ||
            deadline.timeRemaining() > 2)
        ) {
          addBackgroundImages(
            current,
            getComputedStyle(current).backgroundImage,
            additions,
          );
          current = walker.nextNode();
          processed += 1;
        }
        allAdditions.push(...additions);
        publishScanAdditions(additions);
        if (current) idleCallback(runBatch);
        else finish();
      };
      idleCallback(runBatch);
    });
  }

  async function scanTree(root = document, { automatic = false } = {}) {
    if (automatic && !liveScanEnabled) return [];
    const additions = [];
    if (root instanceof Element) scanElement(root, additions);
    root
      .querySelectorAll?.(MEDIA_SELECTOR)
      .forEach((element) => scanElement(element, additions));
    publishScanAdditions(additions);
    const backgroundAdditions = await scheduleComputedBackgroundScan(root, {
      automatic,
    });
    return [...additions, ...backgroundAdditions];
  }

  function scheduleFullScan() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      if (location.href !== currentUrl) {
        currentUrl = location.href;
        backgroundScanGeneration += 1;
      }
      if (liveScanEnabled) void scanTree(document, { automatic: true });
    }, 180);
  }

  const observer = new MutationObserver((mutations) => {
    if (!liveScanEnabled) return;
    const additions = [];
    const backgroundRoots = new Set();
    mutations.forEach((mutation) => {
      if (mutation.type === "attributes") {
        scanElement(mutation.target, additions);
        backgroundRoots.add(mutation.target);
      }
      mutation.addedNodes.forEach((node) => {
        if (node instanceof Element) {
          scanElement(node, additions);
          node
            .querySelectorAll?.(MEDIA_SELECTOR)
            .forEach((element) => scanElement(element, additions));
          backgroundRoots.add(node);
        }
      });
    });
    publishScanAdditions(additions);
    backgroundRoots.forEach((root) => {
      void scheduleComputedBackgroundScan(root, { automatic: true });
    });
  });

  function start() {
    if (started || !document.documentElement) return;
    started = true;
    if (liveScanEnabled) void scanTree(document, { automatic: true });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [
        "src",
        "srcset",
        "style",
        "class",
        "data-src",
        "data-srcset",
        "data-original",
        "data-lazy-src",
        "data-video-url",
        "data-video-src",
        "data-m3u8",
        "data-m3u8-url",
        "data-hls-url",
        "data-player-url",
        "poster",
      ],
    });
    document.addEventListener(
      "load",
      (event) => {
        if (!liveScanEnabled) return;
        if (event.target instanceof HTMLImageElement) {
          const additions = [];
          scanElement(event.target, additions);
          if (additions.length) {
            safeRuntimeSendMessage({
                type: "DINGGE_IMAGES_ADDED",
                pageUrl: location.href,
                pageSessionId,
                images: additions,
                filteredCount: filteredMediaSnapshot().filteredCount,
              })
              .catch(() => {});
          }
        }
      },
      true,
    );
    document.addEventListener(
      "contextmenu",
      (event) => {
        const target = event.target instanceof Element ? event.target : null;
        const pinScopeSelector =
          '[data-test-id="pinWrapper"], [data-grid-item="true"], [data-test-id="pin"], [data-test-id="story-pin-video-block"], div[role="listitem"]';
        const initialScope = target?.closest(pinScopeSelector);
        const video =
          target?.closest("video") ||
          document
            .elementsFromPoint(event.clientX, event.clientY)
            .find((element) => element instanceof HTMLVideoElement) ||
          initialScope?.querySelector("video");
        const image = target?.closest("img");
        if (!video && !image) return;
        if (video && isVideoDownloadExcludedPage()) return;
        const scope = initialScope || video?.closest(pinScopeSelector);
        const candidates = new Set(
          video
            ? [video.currentSrc, video.src, video.poster]
            : [image.currentSrc, image.src],
        );
        if (video) {
          [...video.querySelectorAll("source")].forEach((source) => {
            candidates.add(source.src);
            candidates.add(source.getAttribute("data-src"));
          });
          scope
            ?.querySelectorAll(
              "video, source, img, [src], [data-src], [poster], [data-video-url], [data-m3u8-url]",
            )
            .forEach((element) => {
              [
                element.currentSrc,
                element.src,
                element.getAttribute("src"),
                element.getAttribute("data-src"),
                element.getAttribute("poster"),
                element.getAttribute("data-video-url"),
                element.getAttribute("data-m3u8-url"),
              ].forEach((value) => candidates.add(value));
            });
        }
        const candidateList = [...candidates].filter(Boolean);
        const mediaHashes = [
          ...new Set(candidateList.map(pinterestMediaHash).filter(Boolean)),
        ];
        const performanceUrls = video
          ? [
              ...new Set(
                performance
                  .getEntriesByType("resource")
                  .slice(-300)
                  .flatMap((entry) => pinterestVideoUrlsFromText(entry.name)),
              ),
            ].slice(-80).reverse()
          : [];
        const scopeUrls = [];
        if (video && scope) {
          scope.querySelectorAll("*").forEach((element) => {
            [...element.attributes].forEach((attribute) => {
              scopeUrls.push(...pinterestVideoUrlsFromText(attribute.value));
            });
          });
          scope.querySelectorAll("script").forEach((script) => {
            scopeUrls.push(...pinterestVideoUrlsFromText(script.textContent));
          });
        }
        let bilibiliUrl = "";
        if (/((^|\.)bilibili\.com)$/i.test(location.hostname)) {
          let nearby = target;
          for (let depth = 0; nearby && depth < 8; depth += 1) {
            const link =
              nearby.matches?.('a[href*="/video/"], a[href*="/bangumi/play/"]')
                ? nearby
                : nearby.querySelector?.(
                    'a[href*="/video/"], a[href*="/bangumi/play/"]',
                  );
            if (link?.href) {
              bilibiliUrl = link.href;
              break;
            }
            nearby = nearby.parentElement;
          }
          if (!bilibiliUrl && /\/(?:video|bangumi\/play)\//i.test(location.pathname)) {
            bilibiliUrl = location.href;
          }
        }
        const pinAnchor =
          target?.closest('a[href*="/pin/"]') ||
          scope?.querySelector('a[href*="/pin/"]');
        let pinUrl = "";
        try {
          pinUrl = pinAnchor?.href
            ? new URL(pinAnchor.href, location.href).href
            : /\/pin\/\d+/i.test(location.pathname)
              ? location.href
              : "";
        } catch {
          pinUrl = "";
        }
        const pinId = pinUrl.match(/\/pin\/(\d+)/i)?.[1] || "";
        const directUrl =
          candidateList.find(
            (candidate) =>
              !candidate.startsWith("blob:") &&
              /^https?:/i.test(candidate) &&
              (video
                ? /v1\.pinimg\.com\/videos\/|\.(?:mp4|m3u8)(?:$|[?#])/i.test(candidate)
                : true),
          ) || "";
        safeRuntimeSendMessage({
            type: "DINGGE_CONTEXT_MEDIA",
            target: "background",
            media: {
              kind: video ? "video" : "image",
              url: directUrl,
              mediaHashes,
              performanceUrls,
              scopeUrls: [...new Set(scopeUrls)].slice(0, 80),
              poster: video?.poster || "",
              bilibiliUrl,
              pinId,
              pinUrl,
            },
          })
          .catch(() => {});
      },
      true,
    );
    document.addEventListener(
      "loadedmetadata",
      (event) => {
        if (!liveScanEnabled) return;
        if (event.target instanceof HTMLVideoElement) {
          const additions = [];
          scanElement(event.target, additions);
          if (additions.length) {
            safeRuntimeSendMessage({
                type: "DINGGE_IMAGES_ADDED",
                pageUrl: location.href,
                pageSessionId,
                images: additions,
                filteredCount: filteredMediaSnapshot().filteredCount,
              })
              .catch(() => {});
          }
        }
      },
      true,
    );
    ["loadeddata", "timeupdate"].forEach((eventName) => {
      document.addEventListener(
        eventName,
        (event) => {
          if (!liveScanEnabled || !(event.target instanceof HTMLVideoElement)) return;
          publishVideoFrame(event.target);
        },
        true,
      );
    });

    const videoResourceType = (rawUrl) => {
      try {
        const parsed = new URL(rawUrl, location.href);
        if (/\.m3u8$/i.test(parsed.pathname)) return "hls";
        if (/\.(?:mp4|webm|mov)$/i.test(parsed.pathname)) return "video";
        return "";
      } catch {
        return "";
      }
    };

    const addPerformanceVideos = (entries) => {
      if (!liveScanEnabled) return;
      const additions = [];
      entries.forEach((entry) => {
        const resourceType = videoResourceType(entry.name);
        if (resourceType) {
          addVideo(
            entry.name,
            {
              source: resourceType === "hls" ? "network-hls" : "network-video",
              streamType: resourceType === "hls" ? "hls" : "",
              poster: findVideoPoster(document.querySelector("video")),
            },
            additions,
          );
        }
      });
      if (additions.length) {
        safeRuntimeSendMessage({
            type: "DINGGE_IMAGES_ADDED",
            pageUrl: location.href,
            pageSessionId,
            images: additions,
            filteredCount: filteredMediaSnapshot().filteredCount,
          })
          .catch(() => {});
      }
    };

    addPerformanceVideos(performance.getEntriesByType("resource"));
    try {
      const performanceObserver = new PerformanceObserver((list) => {
        addPerformanceVideos(list.getEntries());
      });
      performanceObserver.observe({ type: "resource", buffered: true });
    } catch {
      // Older browsers still discover videos from the DOM.
    }
    setInterval(() => {
      if (liveScanEnabled && location.href !== currentUrl) scheduleFullScan();
    }, 1000);
  }

  safeAddRuntimeMessageListener((message, _sender, sendResponse) => {
    if (message?.type === "DINGGE_GET_DOUYIN_VIDEO") {
      if (!isDouyinHostname()) {
        sendResponse({
          ok: false,
          error: "当前标签页不是抖音网页。",
        });
        return;
      }
      const video = collectDouyinVideo();
      sendResponse({
        ok: Boolean(video?.candidates?.length),
        video,
        error: video?.candidates?.length
          ? ""
          : "没有读取到可下载的视频地址，请先播放视频几秒后重试。",
      });
      return;
    }

    if (message?.type === "DINGGE_GET_PINTEREST_REQUEST_TOKEN") {
      const isPinterest = isPinterestHostname();
      const token = isPinterest
        ? document.cookie.match(/(?:^|;\s*)csrftoken=([^;]*)/)?.[1] || ""
        : "";
      sendResponse({ token });
      return;
    }

    if (message?.type === "DINGGE_JOB_STATUS") {
      imageViewerJobUpdate?.(message.job || null, message);
      return;
    }

    if (message?.type === "DINGGE_SHOW_BILIBILI_DOWNLOAD_DIALOG") {
      sendResponse({
        shown: showBilibiliDownloadDialog(message.settings || {}),
        title: detectBilibiliVideoTitle(),
      });
      return;
    }

    if (message?.type === "DINGGE_SHOW_IMAGE_PREVIEW") {
      sendResponse({
        shown: showPageImageViewer(
          message.items,
          message.startIndex,
          message.layout,
          message.detailOnly,
        ),
      });
      return;
    }

    if (message?.type === "DINGGE_OPEN_MEDIA_GALLERY") {
      void (async () => {
        await scanTree(document);
        const { items: mediaItems, filteredCount } = filteredMediaSnapshot();
        sendResponse({
          shown: mediaItems.length
            ? showPageImageViewer(mediaItems, 0, message.layout)
            : false,
          count: mediaItems.length,
          filteredCount,
        });
      })();
      return true;
    }

    if (message?.type === "DINGGE_CLEAR_IMAGES") {
      images.clear();
      videos.clear();
      currentUrl = location.href;
      sendResponse({ cleared: true, pageSessionId });
      return;
    }

    if (message?.type === "DINGGE_NETWORK_MEDIA" && message.media?.url) {
      if (!liveScanEnabled) {
        sendResponse({ added: false, disabled: true });
        return;
      }
      const additions = [];
      addVideo(
        message.media.url,
        {
          ...message.media,
          source: message.media.source || "network-video",
          poster:
            message.media.poster ||
            findVideoPoster(document.querySelector("video")),
        },
        additions,
      );
      if (additions.length) {
        safeRuntimeSendMessage({
            type: "DINGGE_IMAGES_ADDED",
            pageUrl: location.href,
            pageSessionId,
            images: additions,
            filteredCount: filteredMediaSnapshot().filteredCount,
          })
          .catch(() => {});
      }
      sendResponse({ added: additions.length > 0 });
      return;
    }

    if (message?.type === "DINGGE_GET_IMAGES") {
      void (async () => {
        if (location.href !== currentUrl) {
          currentUrl = location.href;
          backgroundScanGeneration += 1;
        }
        await scanTree(document);
        const { items, filteredCount } = filteredMediaSnapshot();
        sendResponse({
          pageUrl: location.href,
          pageSessionId,
          images: items,
          filteredCount,
        });
      })();
      return true;
    }
  });

  safeLocalStorageGet({ liveScan: true, imageFilterLevel: "standard" })
    .then(({ liveScan, imageFilterLevel: storedImageFilterLevel }) => {
      if (!hasExtensionContext()) return;
      liveScanEnabled = liveScan !== false;
      imageFilterLevel = normalizeImageFilterLevel(storedImageFilterLevel);
      if (document.documentElement) {
        start();
      } else {
        document.addEventListener("DOMContentLoaded", start, { once: true });
      }
    })
    .catch(() => {
      if (document.documentElement) {
        start();
      } else {
        document.addEventListener("DOMContentLoaded", start, { once: true });
      }
    });
  safeAddStorageChangeListener((changes, areaName) => {
    if (areaName === "local" && changes.liveScan) {
      const wasEnabled = liveScanEnabled;
      liveScanEnabled = changes.liveScan.newValue !== false;
      if (!liveScanEnabled) {
        backgroundScanGeneration += 1;
      } else if (!wasEnabled) {
        scheduleFullScan();
      }
    }
    if (areaName === "local" && changes.imageFilterLevel) {
      const nextImageFilterLevel = normalizeImageFilterLevel(
        changes.imageFilterLevel.newValue,
      );
      if (nextImageFilterLevel === imageFilterLevel) return;
      imageFilterLevel = nextImageFilterLevel;
      imageViewerFilterUpdate?.(nextImageFilterLevel);
    }
  });
})();
