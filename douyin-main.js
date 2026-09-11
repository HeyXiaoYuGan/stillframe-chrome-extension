(() => {
  const MAX_DEPTH = 22;
  const MAX_VISITED = 75000;

  const text = (value) => String(value ?? "").trim();
  const number = (...values) => {
    for (const value of values) {
      const parsed = Number(value);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
    return 0;
  };
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
      const parsed = new URL(cleaned.startsWith("//") ? `https:${cleaned}` : cleaned);
      return /^https?:$/i.test(parsed.protocol) ? parsed.href : "";
    } catch {
      return "";
    }
  };
  const urlList = (value) => {
    if (!value) return [];
    if (typeof value === "string") {
      const url = normalizeUrl(value);
      return url ? [url] : [];
    }
    if (Array.isArray(value)) return value.flatMap(urlList);
    if (typeof value !== "object") return [];
    return [
      value.url_list,
      value.urlList,
      value.UrlList,
      value.urls,
      value.Urls,
      value.url,
      value.Url,
      value.src,
    ].flatMap(urlList);
  };
  const currentAwemeId = () => {
    try {
      const parsed = new URL(location.href);
      return (
        parsed.pathname.match(/\/(?:video|note)\/(\d{10,})/i)?.[1] ||
        parsed.searchParams.get("modal_id") ||
        parsed.searchParams.get("aweme_id") ||
        ""
      );
    } catch {
      return "";
    }
  };
  const addressValues = (value) => [
    value?.play_addr,
    value?.playAddr,
    value?.PlayAddr,
    value?.play_address,
    value?.playAddress,
    value?.play_addr_h264,
    value?.playAddrH264,
    value?.play_addr_265,
    value?.playAddr265,
  ].filter(Boolean);
  const qualityValues = (video) => [
    video?.bit_rate,
    video?.bitRate,
    video?.bit_rate_list,
    video?.bitRateList,
    video?.bitrate_info,
    video?.bitrateInfo,
    video?.video_quality_list,
    video?.videoQualityList,
  ].flatMap((value) => (Array.isArray(value) ? value : []));
  const hasVideoAddress = (video) =>
    Boolean(
      video &&
        typeof video === "object" &&
        (addressValues(video).length ||
          video.download_addr ||
          video.downloadAddr ||
          qualityValues(video).length),
    );
  const awemeIdOf = (value) =>
    text(
      value?.aweme_id ||
        value?.awemeId ||
        value?.item_id ||
        value?.itemId ||
        value?.group_id ||
        value?.groupId,
    );
  const nestedVideoOf = (value) => {
    const nested = value?.video || value?.videoInfo || value?.video_info;
    if (hasVideoAddress(nested)) return { owner: value, video: nested };
    return hasVideoAddress(value) ? { owner: value, video: value } : null;
  };

  const roots = [];
  const addRoot = (value, rank = 0) => {
    if (value && typeof value === "object") roots.push({ value, rank });
  };
  [
    globalThis._ROUTER_DATA,
    globalThis.__ROUTER_DATA__,
    globalThis.__INITIAL_STATE__,
    globalThis.__NEXT_DATA__,
    globalThis.__UNIVERSAL_DATA_FOR_REHYDRATION__,
    globalThis.__SSR_DATA__,
    globalThis.RENDER_DATA,
  ].forEach((value) => addRoot(value, 100));
  for (const key of Object.getOwnPropertyNames(globalThis)) {
    if (!/(?:router|render|initial|universal|loader|aweme|douyin|video).*(?:data|state|info)?/i.test(key)) {
      continue;
    }
    try {
      addRoot(globalThis[key], 40);
    } catch {
      // Ignore page globals implemented with throwing accessors.
    }
  }
  const domRoots = [
    document.documentElement,
    document.body,
    ...document.querySelectorAll("video"),
  ].filter(Boolean);
  domRoots.forEach((element) => {
    let current = element;
    for (let level = 0; current && level < 7; level += 1) {
      Object.keys(current)
        .filter((key) => /^__(?:react|vue)/i.test(key))
        .forEach((key) => {
          try {
            addRoot(current[key], 60);
          } catch {
            // Ignore framework internals that cannot be read safely.
          }
        });
      current = current.parentElement;
    }
  });

  const wantedAwemeId = currentAwemeId();
  const matches = [];
  const visited = new WeakSet();
  let visitedCount = 0;
  roots.forEach(({ value: root, rank }) => {
    const stack = [{ value: root, depth: 0 }];
    while (stack.length && visitedCount < MAX_VISITED) {
      const { value, depth } = stack.pop();
      if (!value || typeof value !== "object" || visited.has(value)) continue;
      visited.add(value);
      visitedCount += 1;
      const record = nestedVideoOf(value);
      if (record) {
        const awemeId = awemeIdOf(record.owner) || awemeIdOf(record.video);
        const qualityCount = qualityValues(record.video).length;
        matches.push({
          ...record,
          awemeId,
          score:
            (wantedAwemeId && awemeId === wantedAwemeId ? 1000000 : 0) +
            (awemeId ? 10000 : 0) +
            (record.owner?.desc || record.owner?.title ? 1000 : 0) +
            qualityCount * 100 +
            rank,
        });
      }
      if (depth >= MAX_DEPTH) continue;
      const children = Array.isArray(value) ? value : Object.values(value);
      for (let index = children.length - 1; index >= 0; index -= 1) {
        const child = children[index];
        if (child && typeof child === "object") {
          stack.push({ value: child, depth: depth + 1 });
        }
      }
    }
  });
  if (!matches.length) return null;
  matches.sort((left, right) => right.score - left.score);
  const selectedMatches = wantedAwemeId
    ? matches.filter((match) => match.awemeId === wantedAwemeId)
    : [];
  const sources = selectedMatches.length ? selectedMatches : [matches[0]];
  const primary = sources[0];
  const candidateGroups = new Map();
  const genericCandidates = new Map();

  const qualityDetails = (quality, address, baseWidth, baseHeight) => {
    let width = number(
      quality?.width,
      quality?.Width,
      quality?.video_width,
      address?.width,
      address?.Width,
      address?.video_width,
    );
    let height = number(
      quality?.height,
      quality?.Height,
      quality?.video_height,
      address?.height,
      address?.Height,
      address?.video_height,
    );
    const gearName = text(
      quality?.gear_name ||
        quality?.gearName ||
        quality?.GearName ||
        quality?.quality_name ||
        quality?.qualityName,
    );
    const shortSide = number(
      gearName.match(/(?:^|[_-])(\d{3,4})(?:p|[_-]|$)/i)?.[1],
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
    const bitRate = number(
      quality?.bit_rate,
      quality?.bitRate,
      quality?.bitrate,
      quality?.Bitrate,
      quality?.bandwidth,
      quality?.Bandwidth,
    );
    const fps = number(
      quality?.FPS,
      quality?.fps,
      address?.FPS,
      address?.fps,
    );
    const codecSource = text(
      quality?.format ||
        quality?.Format ||
        quality?.codec_type ||
        quality?.codecType ||
        quality?.CodecType ||
        quality?.video_extra ||
        address?.url_key ||
        address?.urlKey,
    ).toLowerCase();
    const isBytevc1 = Number(quality?.is_bytevc1 ?? quality?.isBytevc1) === 1;
    const codec = isBytevc1 || /bytevc1|h265|hevc/.test(codecSource)
      ? "HEVC"
      : /av01|av1/.test(codecSource)
        ? "AV1"
      : /h264|avc/.test(codecSource)
        ? "AVC"
        : "";
    const hdr = number(quality?.HDR_type, quality?.hdr_type, quality?.hdrType) > 0;
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
    return { width, height, bitRate, fps, codec, hdr, gearName, resolutionLabel };
  };
  const candidateLabel = (candidate) =>
    [
      candidate.resolutionLabel,
      candidate.width && candidate.height
        ? `${candidate.width} × ${candidate.height}`
        : "",
      candidate.bitRate
        ? `${(candidate.bitRate / 1_000_000).toFixed(1)} Mbps`
        : "",
      candidate.fps ? `${candidate.fps} FPS` : "",
      candidate.codec,
      candidate.hdr ? "HDR" : "",
    ]
      .filter(Boolean)
      .join(" · ");
  const addQuality = (quality, video, sourceIndex) => {
    const baseWidth = number(video?.width, video?.Width);
    const baseHeight = number(video?.height, video?.Height);
    const addresses = addressValues(quality);
    const urls = [
      ...new Set((addresses.length ? addresses : [quality]).flatMap(urlList)),
    ];
    if (!urls.length) return;
    const address = addresses.find((value) => urlList(value).length) || quality;
    const details = qualityDetails(quality, address, baseWidth, baseHeight);
    const qualityKey = [
      details.width,
      details.height,
      details.bitRate,
      details.fps,
      details.codec,
      details.hdr ? "hdr" : "sdr",
      details.gearName,
    ].join(":");
    const existing = candidateGroups.get(qualityKey);
    if (existing) {
      existing.urls.push(...urls.filter((url) => !existing.urls.includes(url)));
      return;
    }
    candidateGroups.set(qualityKey, {
      ...details,
      qualityKey,
      selectable: true,
      source: sourceIndex ? "page-main-quality-fallback" : "page-main-quality",
      urls,
    });
  };
  const addGeneric = (address, video) => {
    const baseWidth = number(video?.width, video?.Width);
    const baseHeight = number(video?.height, video?.Height);
    const details = qualityDetails({}, address, baseWidth, baseHeight);
    urlList(address).forEach((url) => {
      if (!genericCandidates.has(url)) {
        genericCandidates.set(url, {
          ...details,
          qualityKey: "",
          selectable: false,
          source: "page-main-play",
          urls: [url],
        });
      }
    });
  };

  sources.forEach(({ video }, sourceIndex) => {
    qualityValues(video).forEach((quality) => addQuality(quality, video, sourceIndex));
    addressValues(video).forEach((address) => addGeneric(address, video));
  });
  const orderedGroups = [...candidateGroups.values()].sort(
    (left, right) =>
      right.width * right.height - left.width * left.height ||
      right.bitRate - left.bitRate ||
      right.fps - left.fps,
  );
  const candidates = [
    ...orderedGroups,
    ...[...genericCandidates.values()].filter(
      (candidate) =>
        !orderedGroups.some((group) => group.urls.includes(candidate.urls[0])),
    ),
  ]
    .slice(0, 30)
    .map((candidate, index) => ({
      url: candidate.urls[0],
      fallbackUrls: candidate.urls.slice(1),
      width: candidate.width,
      height: candidate.height,
      bitRate: candidate.bitRate,
      fps: candidate.fps,
      codec: candidate.codec,
      hdr: candidate.hdr,
      qualityKey: candidate.qualityKey,
      selectable: candidate.selectable,
      label: candidateLabel(candidate) || `可用播放地址 ${index + 1}`,
      source: candidate.source,
    }));
  if (!candidates.length) return null;

  const owner = primary.owner || {};
  const video = primary.video || {};
  const cover = urlList(
    video.cover ||
      video.origin_cover ||
      video.originCover ||
      video.dynamic_cover ||
      video.dynamicCover,
  )[0] || "";
  const cleanTitle = (value) =>
    text(value)
      .replace(/\s*[—_-]\s*抖音.*$/i, "")
      .replace(/\s+/g, " ")
      .trim();
  const rawDuration = number(video.duration, video.Duration);
  return {
    awemeId: primary.awemeId || wantedAwemeId,
    title: cleanTitle(owner.desc || owner.title || document.title || "抖音视频"),
    author: cleanTitle(
      owner.author?.nickname ||
        owner.author?.unique_id ||
        owner.authorInfo?.nickname ||
        owner.nickname,
    ),
    cover,
    width: number(video.width, video.Width, candidates[0]?.width),
    height: number(video.height, video.Height, candidates[0]?.height),
    duration: rawDuration > 10000 ? rawDuration / 1000 : rawDuration,
    candidates,
  };
})();
