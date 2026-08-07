import {
  ALL_FORMATS,
  BlobSource,
  Conversion,
  Input,
  LogLevel,
  Logging,
  Mp4OutputFormat,
  Output,
  StreamTarget,
} from "./vendor/mediabunny/mediabunny.min.mjs";

Logging.level = LogLevel.Silent;

let busy = false;
let activeJobId = "";
let activeAbortController = null;

const BILIBILI_ZIP_CHUNK_LIMIT = 4_000_000_000;
const BILIBILI_SINGLE_PART_LIMIT = 700 * 1024 * 1024;
const BILIBILI_ARCHIVE_CLEANUP_DELAY = 6 * 60 * 60 * 1000;
const MEDIA_IO_CHUNK_SIZE = 4 * 1024 * 1024;

async function fetchWithTimeout(url, options = {}, timeoutMs = 30000, signal) {
  const controller = new AbortController();
  const abortFromJob = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener("abort", abortFromJob, { once: true });
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } catch (error) {
    if (signal?.aborted) throw new Error("后台任务已取消。");
    if (error?.name === "AbortError") {
      throw new Error(`网络请求超过 ${Math.round(timeoutMs / 1000)} 秒，已跳过。`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abortFromJob);
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

function updateCrc32(crc, bytes) {
  for (let index = 0; index < bytes.length; index += 1) {
    crc = CRC_TABLE[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
  }
  return crc;
}

function yieldToBrowser() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function crc32Async(bytes, signal) {
  let crc = 0xffffffff;
  for (let offset = 0; offset < bytes.length; offset += MEDIA_IO_CHUNK_SIZE) {
    if (signal?.aborted) throw new Error("后台任务已取消。");
    crc = updateCrc32(crc, bytes.subarray(offset, offset + MEDIA_IO_CHUNK_SIZE));
    await yieldToBrowser();
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

function localZipHeader(nameLength, size, checksum, time, date, streamed = false) {
  const buffer = new ArrayBuffer(30);
  const view = new DataView(buffer);
  view.setUint32(0, 0x04034b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 0x0800 | (streamed ? 0x0008 : 0), true);
  view.setUint16(8, 0, true);
  view.setUint16(10, time, true);
  view.setUint16(12, date, true);
  view.setUint32(14, streamed ? 0 : checksum, true);
  view.setUint32(18, streamed ? 0 : size, true);
  view.setUint32(22, streamed ? 0 : size, true);
  view.setUint16(26, nameLength, true);
  return new Uint8Array(buffer);
}

function centralZipHeader(nameLength, size, checksum, time, date, offset, streamed = false) {
  const buffer = new ArrayBuffer(46);
  const view = new DataView(buffer);
  view.setUint32(0, 0x02014b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 20, true);
  view.setUint16(8, 0x0800 | (streamed ? 0x0008 : 0), true);
  view.setUint16(10, 0, true);
  view.setUint16(12, time, true);
  view.setUint16(14, date, true);
  view.setUint32(16, checksum, true);
  view.setUint32(20, size, true);
  view.setUint32(24, size, true);
  view.setUint16(28, nameLength, true);
  view.setUint32(42, offset, true);
  return new Uint8Array(buffer);
}

function zipDataDescriptor(size, checksum) {
  const buffer = new ArrayBuffer(16);
  const view = new DataView(buffer);
  view.setUint32(0, 0x08074b50, true);
  view.setUint32(4, checksum, true);
  view.setUint32(8, size, true);
  view.setUint32(12, size, true);
  return new Uint8Array(buffer);
}

function endZipHeader(count, centralSize, centralOffset) {
  const buffer = new ArrayBuffer(22);
  const view = new DataView(buffer);
  view.setUint32(0, 0x06054b50, true);
  view.setUint16(8, count, true);
  view.setUint16(10, count, true);
  view.setUint32(12, centralSize, true);
  view.setUint32(16, centralOffset, true);
  return new Uint8Array(buffer);
}

async function buildZip(files, signal) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  const { time, date } = zipDateTime();
  let offset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const checksum = await crc32Async(file.bytes, signal);
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
  }

  const centralOffset = offset;
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  return new Blob(
    [...localParts, ...centralParts, endZipHeader(files.length, centralSize, centralOffset)],
    { type: "application/zip" },
  );
}

function sourceByteLength(source) {
  if (source instanceof Blob) return source.size;
  if (source instanceof ArrayBuffer) return source.byteLength;
  if (ArrayBuffer.isView(source)) return source.byteLength;
  throw new TypeError("不支持的媒体数据类型。");
}

async function streamSourceToWritable(source, writable, signal) {
  let crc = 0xffffffff;
  let bytesSinceYield = 0;
  const writeChunk = async (chunk) => {
    if (signal?.aborted) throw new Error("后台任务已取消。");
    crc = updateCrc32(crc, chunk);
    await writable.write(chunk);
    bytesSinceYield += chunk.byteLength;
    if (bytesSinceYield >= MEDIA_IO_CHUNK_SIZE) {
      bytesSinceYield = 0;
      await yieldToBrowser();
    }
  };

  if (source instanceof Blob) {
    const reader = source.stream().getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        await writeChunk(value);
      }
    } catch (error) {
      await reader.cancel(error).catch(() => {});
      throw error;
    } finally {
      reader.releaseLock();
    }
  } else {
    const bytes = source instanceof Uint8Array
      ? source
      : new Uint8Array(source.buffer || source, source.byteOffset || 0, source.byteLength);
    for (let offset = 0; offset < bytes.length; offset += MEDIA_IO_CHUNK_SIZE) {
      await writeChunk(bytes.subarray(offset, offset + MEDIA_IO_CHUNK_SIZE));
    }
  }

  return (crc ^ 0xffffffff) >>> 0;
}

async function createDiskZipWriter(jobId, archiveIndex) {
  if (!navigator.storage?.getDirectory) {
    throw new Error("当前 Chrome 不支持磁盘流式 ZIP，请升级浏览器后重试。");
  }
  const root = await navigator.storage.getDirectory();
  const safeJobId = String(jobId || "job").replace(/[^a-zA-Z0-9_-]/g, "");
  const tempName = `.stillframe-zip-${safeJobId}-${archiveIndex}-${Date.now()}.tmp`;
  const handle = await root.getFileHandle(tempName, { create: true });
  const writable = await handle.createWritable();
  const encoder = new TextEncoder();
  const entries = [];
  const { time, date } = zipDateTime();
  let offset = 0;
  let centralSize = 0;
  let closed = false;

  const removeTempFile = async () => {
    try {
      await root.removeEntry(tempName);
    } catch {
      // The temporary archive may already have been removed.
    }
  };

  return {
    get entryCount() {
      return entries.length;
    },
    projectedSize(name, size) {
      const nameLength = encoder.encode(name).length;
      return (
        offset +
        30 +
        nameLength +
        size +
        centralSize +
        46 +
        nameLength +
        16 +
        22
      );
    },
    async add(name, source, signal) {
      if (closed) throw new Error("ZIP 写入器已关闭。");
      const nameBytes = encoder.encode(name);
      const size = sourceByteLength(source);
      const localOffset = offset;
      const header = localZipHeader(
        nameBytes.length,
        size,
        0,
        time,
        date,
        true,
      );
      await writable.write(header);
      await writable.write(nameBytes);
      const checksum = await streamSourceToWritable(source, writable, signal);
      const descriptor = zipDataDescriptor(size, checksum);
      await writable.write(descriptor);
      offset += header.length + nameBytes.length + size + descriptor.length;
      centralSize += 46 + nameBytes.length;
      entries.push({
        nameBytes,
        size,
        checksum,
        offset: localOffset,
      });
    },
    async finalize() {
      if (closed) throw new Error("ZIP 写入器已关闭。");
      const centralOffset = offset;
      for (const entry of entries) {
        const header = centralZipHeader(
          entry.nameBytes.length,
          entry.size,
          entry.checksum,
          time,
          date,
          entry.offset,
          true,
        );
        await writable.write(header);
        await writable.write(entry.nameBytes);
        offset += header.length + entry.nameBytes.length;
      }
      await writable.write(endZipHeader(entries.length, centralSize, centralOffset));
      await writable.close();
      closed = true;
      const storedFile = await handle.getFile();
      const file = storedFile.slice(0, storedFile.size, "application/zip");
      return { file, removeTempFile };
    },
    async discard() {
      if (!closed) {
        try {
          await writable.abort();
        } catch {
          // Ignore an already closed writer.
        }
        closed = true;
      }
      await removeTempFile();
    },
  };
}

function sendProgress(jobId, percent, text) {
  chrome.runtime
    .sendMessage({
      type: "DINGGE_ZIP_PROGRESS",
      target: "background",
      jobId,
      percent,
      text,
    })
    .catch(() => {});
}

function isHlsUrl(rawUrl) {
  try {
    return /\.m3u8$/i.test(new URL(rawUrl).pathname);
  } catch {
    return false;
  }
}

function parseHlsAttributes(line) {
  const attributes = {};
  const body = line.slice(line.indexOf(":") + 1);
  for (const match of body.matchAll(/([A-Z0-9-]+)=("[^"]*"|[^,]*)/gi)) {
    attributes[match[1].toUpperCase()] = match[2].replace(/^"|"$/g, "");
  }
  return attributes;
}

async function fetchHlsText(url, signal) {
  const response = await fetchWithTimeout(url, {
    credentials: "include",
    cache: "no-store",
  }, 30000, signal);
  if (!response.ok) throw new Error(`HLS 播放列表读取失败（${response.status}）`);
  const text = await response.text();
  if (!text.trimStart().startsWith("#EXTM3U")) {
    throw new Error("资源不是有效的 m3u8 播放列表。");
  }
  return text;
}

async function resolveHlsMediaPlaylist(url, depth = 0, signal) {
  if (depth > 4) throw new Error("HLS 主播放列表嵌套过深。");
  const text = await fetchHlsText(url, signal);
  const lines = text.split(/\r?\n/).map((line) => line.trim());
  const variants = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (!lines[index].startsWith("#EXT-X-STREAM-INF:")) continue;
    const attributes = parseHlsAttributes(lines[index]);
    const nextLine = lines.slice(index + 1).find((line) => line && !line.startsWith("#"));
    if (!nextLine) continue;
    variants.push({
      url: new URL(nextLine, url).href,
      bandwidth: Number(attributes.BANDWIDTH) || 0,
      resolution: attributes.RESOLUTION || "",
    });
  }
  if (!variants.length) return { url, text, lines };
  variants.sort((a, b) => b.bandwidth - a.bandwidth);
  return resolveHlsMediaPlaylist(variants[0].url, depth + 1, signal);
}

function concatenateBytes(chunks, totalLength) {
  const merged = new Uint8Array(totalLength);
  let offset = 0;
  chunks.forEach((chunk) => {
    merged.set(chunk, offset);
    offset += chunk.length;
  });
  return merged;
}

async function fetchHlsVideo(url, onProgress = () => {}, signal) {
  const playlist = await resolveHlsMediaPlaylist(url, 0, signal);
  if (
    playlist.lines.some(
      (line) => line.startsWith("#EXT-X-KEY:") && !/METHOD=NONE(?:,|$)/i.test(line),
    )
  ) {
    throw new Error("该 HLS 视频使用了加密分片，当前版本无法合并。");
  }

  const resources = [];
  let hasInitSegment = false;
  let pendingByteRange = null;
  let previousRangeEnd = 0;
  for (let index = 0; index < playlist.lines.length; index += 1) {
    const line = playlist.lines[index];
    if (line.startsWith("#EXT-X-MAP:")) {
      const attributes = parseHlsAttributes(line);
      if (attributes.URI) {
        const [lengthText, offsetText] = String(attributes.BYTERANGE || "").split("@");
        const length = Number(lengthText) || 0;
        const start = Number(offsetText) || 0;
        resources.push({
          url: new URL(attributes.URI, playlist.url).href,
          range: length ? { start, length } : null,
        });
        hasInitSegment = true;
      }
      continue;
    }
    if (line.startsWith("#EXT-X-BYTERANGE:")) {
      const [lengthText, offsetText] = line.slice(line.indexOf(":") + 1).split("@");
      const length = Number(lengthText) || 0;
      pendingByteRange = length
        ? {
            start: offsetText === undefined ? previousRangeEnd : Number(offsetText) || 0,
            length,
          }
        : null;
      continue;
    }
    if (!line || line.startsWith("#")) continue;
    resources.push({
      url: new URL(line, playlist.url).href,
      range: pendingByteRange,
    });
    if (pendingByteRange) {
      previousRangeEnd = pendingByteRange.start + pendingByteRange.length;
      pendingByteRange = null;
    }
  }

  if (!resources.length) throw new Error("m3u8 播放列表中没有可下载的分片。");
  if (resources.length > 3000) throw new Error("HLS 分片超过 3000 个，已停止处理。");

  const chunks = [];
  let totalLength = 0;
  for (let index = 0; index < resources.length; index += 1) {
    onProgress(index, resources.length);
    const resource = resources[index];
    const response = await fetchWithTimeout(resource.url, {
      credentials: "include",
      cache: "force-cache",
      headers: resource.range
        ? {
            Range: `bytes=${resource.range.start}-${resource.range.start + resource.range.length - 1}`,
          }
        : undefined,
    }, 30000, signal);
    if (!response.ok) {
      throw new Error(`HLS 分片 ${index + 1} 读取失败（${response.status}）`);
    }
    let bytes = new Uint8Array(await response.arrayBuffer());
    if (resource.range && response.status === 200 && bytes.length > resource.range.length) {
      bytes = bytes.slice(
        resource.range.start,
        resource.range.start + resource.range.length,
      );
    }
    totalLength += bytes.length;
    if (totalLength > 500 * 1024 * 1024) {
      throw new Error("单个 HLS 视频超过 500 MB，已停止处理。");
    }
    chunks.push(bytes);
  }

  const firstMediaPath = new URL(resources[hasInitSegment ? 1 : 0]?.url || resources[0].url)
    .pathname;
  const extension =
    hasInitSegment || /\.(?:m4s|mp4)$/i.test(firstMediaPath) ? "mp4" : "ts";
  return {
    bytes: concatenateBytes(chunks, totalLength),
    extension,
  };
}

function replaceExtension(filename, extension) {
  return filename.replace(/\.[a-zA-Z0-9]{2,5}$/i, "") + `.${extension}`;
}

async function convertWebpBytesToPng(bytes) {
  const sourceBlob = new Blob([bytes], { type: "image/webp" });
  const bitmap = await createImageBitmap(sourceBlob);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("无法创建图片转换画布。");
    context.drawImage(bitmap, 0, 0);
    const pngBlob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("WebP 转 PNG 失败。"))),
        "image/png",
      );
    });
    return new Uint8Array(await pngBlob.arrayBuffer());
  } finally {
    bitmap.close();
  }
}

async function convertWebpUrlToObjectUrl(url) {
  const response = await fetchWithTimeout(
    url,
    { credentials: "include", cache: "force-cache" },
    30000,
  );
  if (!response.ok) throw new Error(`WebP 图片读取失败（${response.status}）`);
  const pngBytes = await convertWebpBytesToPng(
    new Uint8Array(await response.arrayBuffer()),
  );
  const objectUrl = URL.createObjectURL(
    new Blob([pngBytes], { type: "image/png" }),
  );
  setTimeout(() => URL.revokeObjectURL(objectUrl), 120000);
  return objectUrl;
}

async function runZipJob(message) {
  if (busy) {
    throw new Error("已有一个打包任务正在运行，请等待它完成。");
  }
  busy = true;
  activeJobId = message.jobId;
  activeAbortController = new AbortController();
  const files = [];
  let totalBytes = 0;

  try {
    for (let position = 0; position < message.images.length; position += 1) {
      const image = message.images[position];
      sendProgress(
        message.jobId,
        Math.round((position / message.images.length) * 78),
        `后台读取第 ${position + 1} / ${message.images.length} 项媒体…`,
      );
      try {
        const candidates = [...new Set([image.url, image.fallbackUrl].filter(Boolean))];
        let bytes;
        let extension = "";
        let shouldConvertWebp = false;
        for (const candidate of candidates) {
          try {
            if (
              isHlsUrl(candidate) ||
              (image.streamType === "hls" && candidate === image.url)
            ) {
              const hls = await fetchHlsVideo(candidate, (segment, total) => {
                sendProgress(
                  message.jobId,
                  Math.round(((position + segment / total) / message.images.length) * 78),
                  `正在合并第 ${position + 1} 个视频的 HLS 分片 ${segment + 1}/${total}…`,
                );
              }, activeAbortController.signal);
              bytes = hls.bytes;
              extension = hls.extension;
              break;
            }
            const response = await fetchWithTimeout(candidate, {
              credentials: "include",
              cache: "force-cache",
            }, 30000, activeAbortController.signal);
            if (!response.ok) continue;
            const contentType = response.headers.get("content-type") || "";
            const isSupportedMedia =
              !contentType ||
              contentType.startsWith("image/") ||
              contentType.startsWith("video/") ||
              contentType.startsWith("application/octet-stream");
            if (!isSupportedMedia) continue;
            bytes = new Uint8Array(await response.arrayBuffer());
            shouldConvertWebp =
              /^image\/webp(?:;|$)/i.test(contentType) ||
              /^data:image\/webp/i.test(candidate) ||
              /\.webp(?:$|[?#@])/i.test(candidate);
            break;
          } catch {
            // Try the next available image size.
          }
        }
        if (!bytes) throw new Error("Image request failed");
        if (shouldConvertWebp && image.kind !== "video") {
          try {
            bytes = await convertWebpBytesToPng(bytes);
            extension = "png";
          } catch {
            // Keep the original WebP when the browser cannot decode it.
          }
        }
        totalBytes += bytes.length;
        if (totalBytes > 500 * 1024 * 1024) {
          throw new Error("所选媒体总大小超过 500 MB，请减少选择后重试。");
        }
        files.push({
          name: extension ? replaceExtension(image.name, extension) : image.name,
          bytes,
        });
      } catch (error) {
        if (activeAbortController.signal.aborted) throw new Error("后台任务已取消。");
        if (error?.message?.includes("500 MB")) throw error;
      }
    }

    if (!files.length) {
      throw new Error("媒体受到原网站保护，暂时无法打包。可尝试使用“逐项下载”。");
    }

    sendProgress(message.jobId, 86, "后台正在生成 ZIP…");
    const zipBlob = await buildZip(files, activeAbortController.signal);
    const objectUrl = URL.createObjectURL(zipBlob);
    setTimeout(() => URL.revokeObjectURL(objectUrl), 120000);

    await chrome.runtime.sendMessage({
      type: "DINGGE_ZIP_READY",
      target: "background",
      jobId: message.jobId,
      objectUrl,
      archiveName: message.archiveName,
      successCount: files.length,
      failedCount: message.images.length - files.length,
    });
  } finally {
    busy = false;
    activeJobId = "";
    activeAbortController = null;
  }
}

async function fetchFirstMediaBlob(urls, label, signal) {
  let lastError;
  for (const url of [...new Set((urls || []).filter(Boolean))]) {
    try {
      const response = await fetchWithTimeout(url, {
        credentials: "include",
        cache: "force-cache",
      }, 60000, signal);
      if (!response.ok) throw new Error(`${response.status}`);
      const contentType = response.headers.get("content-type") || "";
      if (/text|html|json/i.test(contentType)) {
        throw new Error("CDN 返回了文本错误页");
      }
      return await response.blob();
    } catch (error) {
      lastError = error;
      if (signal?.aborted) throw new Error("后台任务已取消。");
    }
  }
  throw new Error(`${label}读取失败：${lastError?.message || "没有可用 CDN"}`);
}

async function createTemporaryMediaTarget(jobId) {
  if (!navigator.storage?.getDirectory) {
    throw new Error("当前 Chrome 不支持磁盘流式视频合并，请升级浏览器后重试。");
  }
  const root = await navigator.storage.getDirectory();
  const safeJobId = String(jobId || "job").replace(/[^a-zA-Z0-9_-]/g, "");
  const tempName = `.stillframe-media-${safeJobId}-${Date.now()}.mp4.tmp`;
  const handle = await root.getFileHandle(tempName, { create: true });
  const writable = await handle.createWritable();
  const removeTempFile = async () => {
    try {
      await root.removeEntry(tempName);
    } catch {
      // The temporary media file may already have been removed.
    }
  };
  return { handle, writable, removeTempFile };
}

async function muxDashMedia(
  videoSource,
  audioSource,
  jobId,
  signal,
  onProgress = null,
) {
  const hasAudio = Boolean(audioSource && sourceByteLength(audioSource));
  if (sourceByteLength(videoSource) + (hasAudio ? sourceByteLength(audioSource) : 0) > 1024 * 1024 * 1024) {
    throw new Error("视频和音频总大小超过 1 GB，浏览器内存不足以安全合并。");
  }
  const videoBlob = videoSource instanceof Blob
    ? videoSource
    : new Blob([videoSource], { type: "video/mp4" });
  const audioBlob = hasAudio
    ? audioSource instanceof Blob
      ? audioSource
      : new Blob([audioSource], { type: "audio/mp4" })
    : null;
  const videoInput = new Input({
    source: new BlobSource(videoBlob),
    formats: ALL_FORMATS,
  });
  const temporaryTarget = await createTemporaryMediaTarget(jobId);
  const target = new StreamTarget(temporaryTarget.writable, {
    chunked: true,
    chunkSize: MEDIA_IO_CHUNK_SIZE,
  });
  const output = new Output({
    format: new Mp4OutputFormat(),
    target,
  });
  let videoConversion;
  let audioConversion;
  try {
    videoConversion = await Conversion.init({
      input: videoInput,
      output,
      composable: true,
      video: { forceTranscode: false },
      audio: { discard: true },
      showWarnings: false,
    });
    audioConversion = hasAudio
      ? await Conversion.init({
          input: new Input({
            source: new BlobSource(audioBlob),
            formats: ALL_FORMATS,
          }),
          output,
          composable: true,
          video: { discard: true },
          audio: { forceTranscode: false },
          showWarnings: false,
        })
      : null;
    if (!videoConversion.utilizedTracks.length) {
      throw new Error("视频 m4s 中没有可封装的视频轨。");
    }
    if (audioConversion && !audioConversion.utilizedTracks.length) {
      throw new Error("音频 m4s 中没有可封装的音频轨。");
    }
    let videoProgress = 0;
    let audioProgress = hasAudio ? 0 : 1;
    const reportProgress = () => {
      const combinedProgress = hasAudio
        ? (videoProgress + audioProgress) / 2
        : videoProgress;
      if (typeof onProgress === "function") {
        onProgress(combinedProgress);
        return;
      }
      const percent = 52 + Math.round(combinedProgress * 42);
      chrome.runtime
        .sendMessage({
          type: "DINGGE_DASH_MUX_PROGRESS",
          target: "background",
          jobId,
          percent,
          text: `正在无损合并视频与音频… ${Math.round(
            combinedProgress * 100,
          )}%`,
        })
        .catch(() => {});
    };
    videoConversion.onProgress = (progress) => {
      videoProgress = progress;
      reportProgress();
    };
    if (audioConversion) {
      audioConversion.onProgress = (progress) => {
        audioProgress = progress;
        reportProgress();
      };
    }
    const cancelConversions = () => {
      videoConversion.cancel().catch(() => {});
      audioConversion?.cancel().catch(() => {});
    };
    signal?.addEventListener("abort", cancelConversions, { once: true });
    await output.start();
    try {
      await Promise.all(
        [videoConversion, audioConversion]
          .filter(Boolean)
          .map((conversion) => conversion.execute()),
      );
      await output.finalize();
    } finally {
      signal?.removeEventListener("abort", cancelConversions);
    }
    const storedFile = await temporaryTarget.handle.getFile();
    if (!storedFile.size) throw new Error("无损合并没有生成有效的 MP4 文件。");
    const file = storedFile.slice(0, storedFile.size, "video/mp4");
    return { file, removeTempFile: temporaryTarget.removeTempFile };
  } catch (error) {
    videoConversion?.cancel().catch(() => {});
    audioConversion?.cancel().catch(() => {});
    await output.cancel().catch(() => {});
    await temporaryTarget.removeTempFile();
    throw error;
  }
}

async function runDashMuxJob(message) {
  if (busy) throw new Error("已有一个后台媒体任务正在运行，请等待它完成。");
  busy = true;
  activeJobId = message.jobId;
  activeAbortController = new AbortController();
  let muxedMedia = null;
  try {
    chrome.runtime
      .sendMessage({
        type: "DINGGE_DASH_MUX_PROGRESS",
        target: "background",
        jobId: message.jobId,
        percent: 24,
        text: "正在读取高画质视频流…",
      })
      .catch(() => {});
    const videoBlob = await fetchFirstMediaBlob(
      message.videoUrls,
      "视频流",
      activeAbortController.signal,
    );
    chrome.runtime
      .sendMessage({
        type: "DINGGE_DASH_MUX_PROGRESS",
        target: "background",
        jobId: message.jobId,
        percent: 42,
        text: "视频流读取完成，正在读取音频流…",
      })
      .catch(() => {});
    const audioBlob = await fetchFirstMediaBlob(
      message.audioUrls,
      "音频流",
      activeAbortController.signal,
    );
    muxedMedia = await muxDashMedia(
      videoBlob,
      audioBlob,
      message.jobId,
      activeAbortController.signal,
    );
    const objectUrl = URL.createObjectURL(muxedMedia.file);
    let downloadStarted = false;
    try {
      const response = await chrome.runtime.sendMessage({
        type: "DINGGE_DASH_MUX_READY",
        target: "background",
        jobId: message.jobId,
        objectUrl,
        filename: message.filename,
      });
      if (!response?.downloaded) {
        throw new Error(response?.error || "Chrome 无法创建合并后的视频下载。");
      }
      downloadStarted = true;
    } finally {
      if (downloadStarted) {
        const completedMedia = muxedMedia;
        setTimeout(() => {
          URL.revokeObjectURL(objectUrl);
          completedMedia.removeTempFile().catch(() => {});
        }, BILIBILI_ARCHIVE_CLEANUP_DELAY);
        muxedMedia = null;
      } else {
        URL.revokeObjectURL(objectUrl);
      }
    }
  } finally {
    await muxedMedia?.removeTempFile();
    busy = false;
    activeJobId = "";
    activeAbortController = null;
  }
}

async function runBilibiliPartsZipJob(message) {
  if (busy) throw new Error("已有一个后台媒体任务正在运行，请等待它完成。");
  busy = true;
  activeJobId = message.jobId;
  activeAbortController = new AbortController();
  let zipWriter = null;
  let successCount = 0;
  let archiveCount = 0;
  const failures = Array.isArray(message.resolutionFailures)
    ? message.resolutionFailures.map(String)
    : [];
  const items = (Array.isArray(message.items) ? message.items : []).slice(0, 50);
  const selectedCount = Math.max(items.length, Number(message.selectedCount) || 0);

  const archiveFilename = (index, isOnlyArchive = false) => {
    const original = String(message.archiveName || "STILLFRAME-001.zip");
    if (isOnlyArchive) return original;
    return `${original.replace(/\.zip$/i, "")}-part-${String(index).padStart(2, "0")}.zip`;
  };

  const downloadArchive = async (isFinal = false) => {
    if (!zipWriter?.entryCount) return;
    const completedWriter = zipWriter;
    zipWriter = null;
    archiveCount += 1;
    let completedArchive;
    try {
      completedArchive = await completedWriter.finalize();
    } catch (error) {
      await completedWriter.discard();
      throw error;
    }
    const objectUrl = URL.createObjectURL(completedArchive.file);
    const filename = archiveFilename(archiveCount, isFinal && archiveCount === 1);
    let downloadStarted = false;
    try {
      const response = await chrome.runtime.sendMessage({
        type: "DINGGE_BILIBILI_PARTS_ZIP_READY",
        target: "background",
        jobId: message.jobId,
        objectUrl,
        archiveName: filename,
        archiveIndex: archiveCount,
        isFinal,
        successCount,
        failedCount: selectedCount - successCount,
        failureSummary: failures.slice(0, 3).join("；"),
      });
      if (!response?.downloaded) {
        throw new Error(response?.error || `Chrome 无法创建第 ${archiveCount} 个分P ZIP 下载。`);
      }
      downloadStarted = true;
    } finally {
      if (downloadStarted) {
        setTimeout(() => {
          URL.revokeObjectURL(objectUrl);
          completedArchive.removeTempFile().catch(() => {});
        }, BILIBILI_ARCHIVE_CLEANUP_DELAY);
      } else {
        URL.revokeObjectURL(objectUrl);
        await completedArchive.removeTempFile();
      }
    }
    if (!isFinal) {
      zipWriter = await createDiskZipWriter(message.jobId, archiveCount + 1);
    }
  };

  try {
    zipWriter = await createDiskZipWriter(message.jobId, 1);
    for (const [index, item] of items.entries()) {
      if (activeAbortController.signal.aborted) {
        throw new Error("后台任务已取消。");
      }
      const startPercent = 36 + Math.round((index / items.length) * 50);
      chrome.runtime
        .sendMessage({
          type: "DINGGE_BILIBILI_PARTS_ZIP_PROGRESS",
          target: "background",
          jobId: message.jobId,
          percent: startPercent,
          text: `正在处理分P ${index + 1}/${items.length}：${item.title || item.name}`,
        })
        .catch(() => {});
      let temporaryMedia = null;
      try {
        let source;
        if (item.videoUrls?.length) {
          const videoBlob = await fetchFirstMediaBlob(
            item.videoUrls,
            `分P ${index + 1} 视频流`,
            activeAbortController.signal,
          );
          if (item.needsMux) {
            const audioBlob = item.audioUrls?.length
              ? await fetchFirstMediaBlob(
                  item.audioUrls,
                  `分P ${index + 1} 音频流`,
                  activeAbortController.signal,
                )
              : null;
            temporaryMedia = await muxDashMedia(
              videoBlob,
              audioBlob,
              message.jobId,
              activeAbortController.signal,
              (progress) => {
                chrome.runtime
                  .sendMessage({
                    type: "DINGGE_BILIBILI_PARTS_ZIP_PROGRESS",
                    target: "background",
                    jobId: message.jobId,
                    percent:
                      startPercent +
                      Math.round((50 / items.length) * progress),
                    text: `正在无损合并分P ${index + 1}/${items.length}… ${Math.round(progress * 100)}%`,
                  })
                  .catch(() => {});
              },
            );
            source = temporaryMedia.file;
          } else {
            source = videoBlob;
          }
        } else if (item.hlsUrls?.length) {
          let lastError;
          for (const hlsUrl of item.hlsUrls) {
            try {
              source = (
                await fetchHlsVideo(
                  hlsUrl,
                  () => {},
                  activeAbortController.signal,
                )
              ).bytes;
              break;
            } catch (error) {
              lastError = error;
            }
          }
          if (!source) throw lastError || new Error("没有可用的 HLS 视频流。");
        }
        const sourceSize = source ? sourceByteLength(source) : 0;
        if (!sourceSize) throw new Error("该分P没有返回可打包的视频数据。");
        if (sourceSize > BILIBILI_SINGLE_PART_LIMIT) {
          throw new Error("单个分P超过 700 MB，浏览器内存不足以安全生成 ZIP。");
        }
        const outputName = replaceExtension(item.name, "mp4");
        if (
          zipWriter.entryCount &&
          zipWriter.projectedSize(outputName, sourceSize) > BILIBILI_ZIP_CHUNK_LIMIT
        ) {
          chrome.runtime
            .sendMessage({
              type: "DINGGE_BILIBILI_PARTS_ZIP_PROGRESS",
              target: "background",
              jobId: message.jobId,
              percent: startPercent,
              text: `当前 ZIP 已达到安全容量，正在下载第 ${archiveCount + 1} 包…`,
            })
            .catch(() => {});
          await downloadArchive(false);
        }
        if (zipWriter.projectedSize(outputName, sourceSize) > BILIBILI_ZIP_CHUNK_LIMIT) {
          throw new Error("单个分P无法放入 4 GB ZIP。");
        }
        await zipWriter.add(outputName, source, activeAbortController.signal);
        successCount += 1;
      } catch (error) {
        if (activeAbortController.signal.aborted) throw error;
        failures.push(
          `${item.title || item.name || `分P ${index + 1}`}：${error?.message || "读取或合并失败"}`,
        );
      } finally {
        await temporaryMedia?.removeTempFile();
      }
    }

    for (const attachment of Array.isArray(message.attachments)
      ? message.attachments
      : []) {
      try {
        let source;
        if (typeof attachment.text === "string") {
          source = new TextEncoder().encode(attachment.text);
        } else if (/^https?:/i.test(attachment.url || "")) {
          const response = await fetchWithTimeout(
            attachment.url,
            { credentials: "include", cache: "force-cache" },
            30000,
            activeAbortController.signal,
          );
          if (!response.ok) continue;
          source = await response.blob();
        }
        const sourceSize = source ? sourceByteLength(source) : 0;
        if (!sourceSize) continue;
        if (sourceSize > BILIBILI_SINGLE_PART_LIMIT) continue;
        if (
          zipWriter.entryCount &&
          zipWriter.projectedSize(attachment.name, sourceSize) >
            BILIBILI_ZIP_CHUNK_LIMIT
        ) {
          await downloadArchive(false);
        }
        if (
          zipWriter.projectedSize(attachment.name, sourceSize) >
          BILIBILI_ZIP_CHUNK_LIMIT
        ) continue;
        await zipWriter.add(attachment.name, source, activeAbortController.signal);
      } catch {
        // Optional attachments do not stop the video ZIP.
      }
    }

    if (!successCount) {
      throw new Error(
        `所选分P均无法读取或合并。${failures.length ? ` ${failures.slice(0, 3).join("；")}` : ""}`,
      );
    }
    chrome.runtime
      .sendMessage({
        type: "DINGGE_BILIBILI_PARTS_ZIP_PROGRESS",
        target: "background",
        jobId: message.jobId,
        percent: 92,
        text: "正在生成分P视频 ZIP…",
      })
      .catch(() => {});
    await downloadArchive(true);
  } finally {
    await zipWriter?.discard();
    busy = false;
    activeJobId = "";
    activeAbortController = null;
  }
}

async function runHlsDownloadJob(message) {
  if (busy) throw new Error("已有一个后台媒体任务正在运行，请等待它完成。");
  busy = true;
  activeJobId = message.jobId;
  activeAbortController = new AbortController();
  let successCount = 0;
  let lastError;
  try {
    for (let position = 0; position < message.items.length; position += 1) {
      const item = message.items[position];
      try {
        let hls;
        let candidateError;
        const candidates = [...new Set([...(item.urls || []), item.url].filter(Boolean))];
        for (const candidate of candidates) {
          try {
            hls = await fetchHlsVideo(candidate, (segment, total) => {
              chrome.runtime
                .sendMessage({
                  type: "DINGGE_HLS_PROGRESS",
                  target: "background",
                  jobId: message.jobId,
                  percent: Math.round(
                    ((position + segment / total) / message.items.length) * 95,
                  ),
                  text: `正在合并第 ${position + 1}/${message.items.length} 个视频：${segment + 1}/${total} 分片`,
                })
                .catch(() => {});
            }, activeAbortController.signal);
            break;
          } catch (error) {
            candidateError = error;
            if (activeAbortController.signal.aborted) throw error;
          }
        }
        if (!hls) throw candidateError || new Error("HLS 播放列表均无法读取。");
        const blob = new Blob([hls.bytes], {
          type: hls.extension === "mp4" ? "video/mp4" : "video/mp2t",
        });
        const objectUrl = URL.createObjectURL(blob);
        setTimeout(() => URL.revokeObjectURL(objectUrl), 120000);
        const downloadResponse = await chrome.runtime.sendMessage({
          type: "DINGGE_HLS_MEDIA_READY",
          target: "background",
          jobId: message.jobId,
          objectUrl,
          filename: replaceExtension(item.name, hls.extension),
        });
        if (!downloadResponse?.downloaded) {
          throw new Error(
            downloadResponse?.error || "Chrome 无法创建合并后的视频下载。",
          );
        }
        successCount += 1;
      } catch (error) {
        if (activeAbortController.signal.aborted) throw new Error("后台任务已取消。");
        lastError = error;
        // Continue with the remaining HLS videos.
      }
    }
    if (!successCount) {
      throw lastError || new Error("没有可下载的 HLS 视频。");
    }
    await chrome.runtime.sendMessage({
      type: "DINGGE_HLS_COMPLETE",
      target: "background",
      jobId: message.jobId,
      successCount,
      failedCount: message.items.length - successCount,
    });
  } finally {
    busy = false;
    activeJobId = "";
    activeAbortController = null;
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.target !== "offscreen") return;
  if (message.type === "DINGGE_CONVERT_WEBP_TO_PNG") {
    convertWebpUrlToObjectUrl(String(message.url || ""))
      .then((objectUrl) => sendResponse({ converted: true, objectUrl }))
      .catch((error) =>
        sendResponse({
          converted: false,
          error: error?.message || "WebP 转 PNG 失败。",
        }),
      );
    return true;
  }
  if (message.type === "DINGGE_CANCEL_OFFSCREEN_JOB") {
    if (busy && (!message.jobId || message.jobId === activeJobId)) {
      activeAbortController?.abort();
      sendResponse({ canceled: true });
    } else {
      sendResponse({ canceled: false });
    }
    return;
  }
  if (
    ![
      "DINGGE_RUN_ZIP",
      "DINGGE_RUN_HLS_DOWNLOAD",
      "DINGGE_RUN_DASH_MUX",
      "DINGGE_RUN_BILIBILI_PARTS_ZIP",
    ].includes(message.type)
  ) return;
  if (busy) {
    sendResponse({
      accepted: false,
      error: "已有一个打包任务正在运行，请等待它完成。",
    });
    return;
  }
  sendResponse({ accepted: true });
  const task =
    message.type === "DINGGE_RUN_ZIP"
      ? runZipJob(message)
      : message.type === "DINGGE_RUN_DASH_MUX"
        ? runDashMuxJob(message)
        : message.type === "DINGGE_RUN_BILIBILI_PARTS_ZIP"
          ? runBilibiliPartsZipJob(message)
        : runHlsDownloadJob(message);
  task.catch((error) => {
    const failure = {
      type:
        message.type === "DINGGE_RUN_ZIP"
          ? "DINGGE_ZIP_FAILED"
          : message.type === "DINGGE_RUN_DASH_MUX"
            ? "DINGGE_DASH_MUX_FAILED"
            : message.type === "DINGGE_RUN_BILIBILI_PARTS_ZIP"
              ? "DINGGE_BILIBILI_PARTS_ZIP_FAILED"
          : "DINGGE_HLS_FAILED",
      target: "background",
      jobId: message.jobId,
      error: error?.message || "后台打包失败。",
    };
    chrome.runtime.sendMessage(failure).catch(() => {});
    chrome.runtime
      .sendMessage({
        ...failure,
        type:
          message.type === "DINGGE_RUN_ZIP"
            ? "DINGGE_ZIP_ERROR"
            : message.type === "DINGGE_RUN_DASH_MUX"
              ? "DINGGE_DASH_MUX_ERROR"
              : message.type === "DINGGE_RUN_BILIBILI_PARTS_ZIP"
                ? "DINGGE_BILIBILI_PARTS_ZIP_ERROR"
            : "DINGGE_HLS_DOWNLOAD_ERROR",
        target: "popup",
      })
      .catch(() => {});
  });
});
