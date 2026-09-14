(() => {
  if (globalThis.StillFrameI18n) return;

  const translations = {
    "定格 StillFrame 设置": "StillFrame Settings",
    "定格 StillFrame": "StillFrame",
    "定格设置": "StillFrame Settings",
    "所有设置仅保存在当前浏览器中。": "All settings are stored only in this browser.",
    "界面语言": "Interface language",
    "切换插件面板、网页弹窗、右键菜单和通知语言": "Switch the language of panels, page dialogs, context menus, and notifications",
    "功能选择": "Feature selection",
    "批量选择": "Bulk selection",
    "提取图片与视频": "Extract Images & Videos",
    "网页截图": "Webpage Capture",
    "抖音": "Douyin",
    "抖音视频下载": "Douyin Video Download",
    "下载抖音视频": "Download Douyin Video",
    "读取当前网页版抖音作品，并选择页面实际提供的清晰度与编码。": "Read the current Douyin web video and choose a quality and codec provided by the page.",
    "识别当前抖音视频": "Detect Current Douyin Video",
    "重新识别当前抖音视频": "Detect Current Douyin Video Again",
    "正在识别当前抖音视频…": "Detecting the current Douyin video…",
    "当前抖音视频": "Current Douyin Video",
    "抖音视频封面": "Douyin video cover",
    "作者未知": "Unknown author",
    "等待读取视频信息": "Waiting for video details",
    "下载画质": "Download quality",
    "下载当前抖音视频": "Download Current Douyin Video",
    "下载地址来自当前页面，临时地址失效时请刷新抖音页面后重新识别。": "Download URLs come from the current page. Refresh Douyin and detect again if a temporary URL expires.",
    "等待识别抖音视频": "Waiting to detect a Douyin video",
    "支持 douyin.com 的视频作品页面": "Supports video pages on douyin.com",
    "请先打开一个网页版抖音视频页面。": "Open a Douyin video page first.",
    "当前标签页不是抖音网页。": "The current tab is not a Douyin webpage.",
    "没有读取到可下载的视频地址，请先播放视频几秒后重试。": "No downloadable video URL was found. Play the video for a few seconds and try again.",
    "当前抖音作品没有可下载的视频地址。": "The current Douyin post has no downloadable video URL.",
    "所选抖音画质没有可下载的视频地址。": "The selected Douyin quality has no downloadable video URL.",
    "抖音视频识别失败。": "Failed to detect the Douyin video.",
    "无法启动抖音视频下载。": "Unable to start the Douyin video download.",
    "Chrome 没有创建抖音视频下载任务。": "Chrome did not create the Douyin video download.",
    "抖音视频已交给 Chrome 下载管理器。": "The Douyin video was sent to Chrome's download manager.",
    "抖音视频和封面已交给 Chrome 下载管理器。": "The Douyin video and cover were sent to Chrome's download manager.",
    "抖音视频已开始下载，但封面下载失败。": "The Douyin video download started, but the cover download failed.",
    "定格：抖音视频下载已开始": "StillFrame: Douyin Download Started",
    "可用播放地址": "Available video URL",
    "备用": "Fallback",
    "个可用地址": "available URLs",
    "当前播放流": "Current playback stream",
    "档可用画质": "available quality levels",
    "神秘入口": "Secret Entry",
    "识别当前页面中可直接保存的视频。": "Detect directly downloadable videos on the current page.",
    "识别当前页面视频": "Detect Current Page Video",
    "重新识别当前页面视频": "Detect Current Page Video Again",
    "正在识别当前页面视频…": "Detecting the current page video…",
    "当前页面视频": "Current Page Video",
    "当前视频封面": "Current video cover",
    "仅保存当前账户可正常播放的未加密媒体，不绕过登录、付费、地区或 DRM 限制。": "Save only unencrypted media that the current account can already play. StillFrame does not bypass sign-in, payment, regional, or DRM restrictions.",
    "等待识别当前视频": "Waiting to detect the current video",
    "当前网站": "Current website",
    "请打开你想打开的网站并尝试": "Open the website you want to use and try again",
    "当前页面视频识别失败。": "Failed to detect the current page video.",
    "无法启动当前视频下载。": "Unable to start the current video download.",
    "视频正在后台读取并合并，可在此查看进度。": "The video is being read and merged in the background. Progress appears here.",
    "视频已交给 Chrome 下载管理器。": "The video was sent to Chrome's download manager.",
    "当前标签页不是受支持的视频页面。": "The current tab is not a supported video page.",
    "当前页面没有可下载的视频地址。": "The current page has no downloadable video URL.",
    "所选画质没有可下载的视频地址。": "The selected quality has no downloadable video URL.",
    "正在后台读取并合并当前页面的 HLS 视频。": "Reading and merging the current page's HLS video in the background.",
    "当前页面只暴露了 DASH 播放清单，尚未读取到可直接保存的 MP4、WebM 或 HLS 地址。若该清单受 DRM 保护，扩展不会尝试解密。": "The page exposes only a DASH manifest; no directly downloadable MP4, WebM, or HLS URL was found. StillFrame will not decrypt the manifest if it is DRM-protected.",
    "播放器当前使用 Blob 地址，尚未捕获它对应的 MP4、WebM 或 HLS 请求。请播放视频几秒后再次识别。": "The player is using a Blob URL, but its corresponding MP4, WebM, or HLS request has not been captured yet. Play the video for a few seconds and detect it again.",
    "没有从当前播放器读取到可直接保存的视频地址。请播放视频几秒后再次识别。": "No directly downloadable video URL was found in the current player. Play the video for a few seconds and detect it again.",
    "页面脚本注入失败": "page-script injection failed",
    "页面脚本已执行": "page script executed",
    "媒体请求": "media requests",
    "解析结果": "extractor results",
    "诊断：": "Diagnostics: ",
    "页面视频": "Page video",
    "播放该视频后重新识别": "Play This Video, Then Detect Again",
    "等待页面加载媒体地址": "Waiting for the page to load the media URL",
    "（待播放）": " (play to detect)",
    "待捕获的视频": "Video Waiting to Be Captured",
    "捕获媒体": "Captured Media",
    "个尚未加载媒体地址；播放对应视频后请再次识别。": " have not loaded a media URL yet. Play those videos and detect again.",
    "个页面视频，其中": " page videos; ",
    "个可下载。": " are downloadable.",
    "已自动加入列表。": " added to the list automatically.",
    "视频处理已启动": "Video Processing Started",
    "已识别“": "Detected “",
    "”，请选择画质下载。": "”. Choose a quality to download.",
    "B站视频": "Bilibili Video",
    "B站视频下载": "Bilibili Video Download",
    "下载当前视频": "Download Current Video",
    "打包下载视频": "Package Video Downloads",
    "B站主视频与分P。": "Bilibili Main Video & Parts.",
    "只读取当前页面的视频列表，不扫描页面图片。": "Read only the current page's video list without scanning page images.",
    "扫描主视频与分P": "Scan Main Video & Parts",
    "重新扫描主视频与分P": "Rescan Main Video & Parts",
    "正在读取主视频与分P…": "Reading main video and parts…",
    "当前 B站视频": "Current Bilibili Video",
    "找到 0 个视频": "0 videos found",
    "等待扫描 B站视频": "Waiting to scan Bilibili videos",
    "不会把页面图片加入此列表": "Page images will not be added to this list",
    "请先打开一个 B站视频页面。": "Open a Bilibili video page first.",
    "当前页面没有读取到主视频或分P。": "No main video or parts were found on this page.",
    "B站视频扫描失败。": "Failed to scan Bilibili videos.",
    "正在启动分P后台打包…": "Starting background multi-part ZIP…",
    "正在解析当前分P…": "Resolving the current part…",
    "一次最多选择 50 个分P。": "You may select up to 50 parts.",
    "当前处理进度": "Current progress",
    "准备处理…": "Preparing…",
    "取消任务": "Cancel task",
    "找到网页里的": "Find media on the page:",
    "图片与短视频。": "Images and short videos.",
    "实时扫描图片、懒加载资源、CSS 背景图和可下载的视频文件。": "Scan images, lazy-loaded assets, CSS backgrounds, and downloadable videos in real time.",
    "扫描当前网页媒体": "Scan Current Page",
    "重新扫描当前网页": "Rescan Current Page",
    "重新扫描": "Rescan",
    "找到 0 项媒体": "0 media items found",
    "实时监听": "Live monitoring",
    "已选择 0 项": "0 selected",
    "清空扫描": "Clear scan",
    "正在重新扫描当前页面…": "Rescanning the current page…",
    "扫描结果已清空": "Scan results cleared",
    "共 0 项媒体": "0 media items",
    "可点击“重新扫描”读取当前页面媒体": "Click “Rescan” to read media from the current page",
    "浏览全部媒体": "Browse All Media",
    "全选图片": "Select All Images",
    "全选视频": "Select All Videos",
    "全选": "Select All",
    "下载所选": "Download Selected",
    "打包 ZIP": "Create ZIP",
    "等待扫描": "Waiting to scan",
    "新出现的图片和视频会实时加入这里": "New images and videos will appear here in real time",
    "把整个网页定格下来。": "Freeze the entire webpage.",
    "保留当前屏幕画面，或者从页面顶部一直截到底部。": "Save the visible screen or capture the page from top to bottom.",
    "抓取范围": "Capture range",
    "可见区域": "Visible Area",
    "当前屏幕内容": "Current viewport",
    "完整页面": "Full Page",
    "从顶部截到底部": "From top to bottom",
    "图片格式": "Image format",
    "PNG · 高清": "PNG · High quality",
    "JPG · 小体积": "JPG · Smaller file",
    "PDF · 自动分页": "PDF · Automatic pagination",
    "延时拍摄": "Capture delay",
    "立即": "Immediately",
    "3 秒": "3 seconds",
    "5 秒": "5 seconds",
    "拍下可见区域": "Capture Visible Area",
    "拍下完整页面": "Capture Full Page",
    "图片预览": "Image Preview",
    "关闭图片预览": "Close image preview",
    "回到顶部": "Back to top",
    "到达底部": "Go to bottom",
    "放大的网页图片": "Enlarged webpage image",
    "正在尝试其他可用图片地址…": "Trying another available image URL…",
    "← 上一张": "← Previous",
    "下一张 →": "Next →",
    "媒体仅在你的浏览器中处理": "Media is processed only in your browser",
    "设置": "Settings",
    "常规": "General",
    "媒体扫描": "Media Scanning",
    "视频下载": "Video Downloads",
    "通知": "Notifications",
    "已保存": "Saved",
    "选择打开功能面板时默认显示的工具。": "Choose the tool shown when the panel opens.",
    "默认功能": "Default feature",
    "打开定格时首先显示的页面": "The first page shown when StillFrame opens",
    "媒体扫描与预览": "Media Scanning & Preview",
    "控制浏览网页时的实时发现和放大图片策略。": "Control real-time discovery and image preview behavior.",
    "实时扫描": "Real-time scanning",
    "新加载的图片和视频自动加入列表": "Automatically add newly loaded images and videos",
    "小图筛选": "Small-image filter",
    "图片筛选": "Image filter",
    "图片筛选级别": "Image filter level",
    "根据真实像素和图片用途过滤头像、图标及尺寸过小的图片": "Filter avatars, icons, and undersized images using their real pixel dimensions and purpose.",
    "不筛选": "Off",
    "宽松": "Relaxed",
    "标准（推荐）": "Standard (Recommended)",
    "严格": "Strict",
    "已过滤": "Filtered",
    "张小图": "small images",
    "没有符合当前筛选条件的媒体，": "No media matches the current filter. ",
    "放大时优先原图": "Prefer originals when zooming",
    "网页中央预览先尝试高清原图，失败后回退": "Try the high-resolution original first, then fall back",
    "多图浏览默认布局": "Default gallery layout",
    "打开网页中央图片画廊时采用的排列方式，也可在画廊内即时切换": "Layout used by the page gallery; it can also be changed inside the gallery",
    "方块模式": "Grid",
    "瀑布流模式": "Masonry",
    "方块": "Grid",
    "瀑布流": "Masonry",
    "B站视频下载": "Bilibili Video Download",
    "这里设置首选项；下载弹窗只显示当前会话实际返回的规格。": "Set preferences here; the download dialog only shows formats actually returned to the current session.",
    "附加内容": "Additional content",
    "封面默认关闭；需要时可手动开启": "Cover download is disabled by default",
    "封面": "Cover",
    "音频": "Audio",
    "XML弹幕": "XML Danmaku",
    "XML 弹幕": "XML Danmaku",
    "SRT字幕": "SRT Subtitles",
    "ASS字幕": "ASS Subtitles",
    "画质": "Video quality",
    "音质": "Audio quality",
    "编码": "Codec",
    "杜比视界": "Dolby Vision",
    "1080P 60帧": "1080P 60 FPS",
    "1080P 高码率": "1080P High Bitrate",
    "720P 60帧": "720P 60 FPS",
    "240P": "240P",
    "Hi-Res 优先": "Prefer Hi-Res",
    "命名模板": "Filename template",
    "支持 %title%、%bvid%、%page%、%quality%": "Supports %title%, %bvid%, %page%, and %quality%",
    "设置默认截图范围、格式和延时。": "Set the default capture range, format, and delay.",
    "默认范围": "Default range",
    "默认格式": "Default format",
    "控制下载与后台任务的完成提示。": "Control completion alerts for downloads and background tasks.",
    "系统通知": "System notifications",
    "下载、打包和视频处理完成后显示通知": "Show notifications after downloads, packaging, and video processing",
    "恢复默认": "Restore Defaults",
    "保存设置": "Save Settings",
    "已恢复默认": "Defaults restored",
    "下载 B站视频": "Download Bilibili Video",
    "分P视频列表": "Multi-part Video List",
    "视频列表": "Video List",
    "大小待识别": "Size pending",
    "正在估算…": "Estimating…",
    "大小读取失败": "Size unavailable",
    "无法读取 B站视频大小。": "Unable to read Bilibili video sizes.",
    "取消全选": "Clear All",
    "所选分P将按顺序无损合并，并生成一个 ZIP；单次最多 50 个，总大小上限 800 MB。": "Selected parts will be losslessly remuxed in order and placed in one ZIP. Up to 50 parts and 800 MB per task.",
    "打包所选分P": "ZIP Selected Parts",
    "下载当前分P": "Download Current Part",
    "正在启动分P解析与后台打包…": "Starting multi-part resolving and background ZIP…",
    "请至少选择一个分P视频。": "Select at least one video part.",
    "一次最多打包 50 个分P，请减少选择后重试。": "A ZIP can contain up to 50 parts. Select fewer parts and try again.",
    "当前视频没有可打包的分P列表。": "This video has no multi-part list available for ZIP packaging.",
    "正在生成分P视频 ZIP…": "Creating multi-part video ZIP…",
    "分P视频 ZIP 已生成，正在创建下载…": "Multi-part video ZIP created; starting download…",
    "最后一个分P视频 ZIP 已生成，正在创建下载…": "The final multi-part ZIP is ready; starting download…",
    "当前 ZIP 已达到安全容量，正在下载第 ${archiveCount + 1} 包…": "The current ZIP reached the safe size; downloading archive ${archiveCount + 1}…",
    "第 ${message.archiveIndex || 1} 个分P ZIP 已生成，正在创建下载…": "Multi-part ZIP ${message.archiveIndex || 1} is ready; starting download…",
    "第 ${message.archiveIndex || 1} 个 ZIP 已开始下载，继续处理剩余分P…": "ZIP ${message.archiveIndex || 1} started downloading; continuing with the remaining parts…",
    "单个分P超过 700 MB，浏览器内存不足以安全生成 ZIP。": "A single part exceeds 700 MB and cannot be safely packaged in browser memory.",
    "定格：分P视频打包完成": "StillFrame: Multi-part ZIP Complete",
    "定格：分P视频打包失败": "StillFrame: Multi-part ZIP Failed",
    "确认当前视频名称和下载参数": "Confirm the video title and download settings",
    "当前视频名称": "Current video title",
    "复制名称": "Copy title",
    "取消": "Cancel",
    "开始下载": "Start Download",
    "正在识别当前视频可用清晰度…": "Detecting available resolutions…",
    "清晰度将在开始下载时由 B站接口确认": "Resolution will be confirmed by the Bilibili API when downloading",
    "开始下载时确认": "Confirm when download starts",
    "由当前媒体流决定": "Determined by the current media stream",
    "当前视频没有返回独立音频规格": "No separate audio format was returned for this video",
    "名称已复制": "Title copied",
    "当前没有可复制的名称": "No title is available to copy",
    "正在启动解析…": "Starting analysis…",
    "多图浏览": "Media Gallery",
    "打包处理进度": "ZIP Progress",
    "取消打包": "Cancel ZIP",
    "准备打包…": "Preparing ZIP…",
    "点击媒体勾选 · 方向键定位 · Esc 关闭": "Click to select · Arrow keys to navigate · Esc to close",
    "上一项": "Previous",
    "下一项": "Next",
    "放大查看图片": "Enlarge Image",
    "下载": "Download",
    "关闭放大查看": "Close enlarged view",
    "滚轮缩放 · 按住拖动 · ← → 切换 · Esc 返回": "Wheel to zoom · Drag to pan · ← → to switch · Esc to return",
    "滚轮缩放 · 按住拖动 · Esc 关闭": "Wheel to zoom · Drag to pan · Esc to close",
    "← 上一页": "← Previous",
    "下一页 →": "Next →",
    "正在加载原图…": "Loading original image…",
    "正在尝试备用图片…": "Trying a fallback image…",
    "这张图片暂时无法放大预览": "This image cannot currently be enlarged",
    "正在加载…": "Loading…",
    "预览不可用": "Preview unavailable",
    "视频可选择下载": "Video available for download",
    "点击放大查看": "Click to enlarge",
    "实时加入": "Live",
    "下载已开始": "Download started",
    "下载失败": "Download failed",
    "后台处理中，可关闭画廊": "Processing in the background; the gallery may be closed",
    "正在创建下载…": "Creating download…",
    "正在创建下载任务…": "Creating download task…",
    "正在启动后台打包…": "Starting background ZIP task…",
    "后台打包中，可关闭画廊": "Creating ZIP in the background; the gallery may be closed",
    "取消中…": "Canceling…",
    "正在取消后台打包任务…": "Canceling the background ZIP task…",
    "重试取消": "Retry cancellation",
    "已取消": "Canceled",
    "扫描完成": "Scan complete",
    "正在扫描网页…": "Scanning page…",
    "正在读取页面资源…": "Reading page resources…",
    "正在生成媒体预览…": "Generating media previews…",
    "这个页面中没有找到可提取的媒体资源。": "No extractable media was found on this page.",
    "扫描失败，请刷新网页后重试。": "Scan failed. Refresh the page and try again.",
    "扫描失败，请重试或确认扩展拥有当前网站的访问权限。": "Scan failed. Try again or confirm that the extension can access this site.",
    "图片筛选设置保存失败。": "Failed to save the image filter setting.",
    "尺寸未知": "Unknown dimensions",
    "视频预览受限 仍可尝试下载": "Video preview restricted · Download may still work",
    "图片预览受限 仍可尝试下载": "Image preview restricted · Download may still work",
    "HLS 视频 可合并下载": "HLS video · Can be merged",
    "视频可下载": "Video available",
    "图片地址不可用": "Image URL unavailable",
    "B站 DASH 音视频": "Bilibili DASH video and audio",
    "B站 DASH 视频": "Bilibili DASH video",
    "HLS 视频": "HLS video",
    "网页视频": "Web video",
    "网页图片": "Web image",
    "可取原图": "Original available",
    "背景": "Background",
    "图片": "Image",
    "视频": "Video",
    "媒体": "Media",
    "截图": "Screenshots",
    "放大当前图片": "Enlarge current image",
    "自动尝试高清地址": "Automatically trying a high-resolution URL",
    "高清地址不可用，正在尝试备用图片…": "High-resolution URL unavailable; trying a fallback…",
    "没有可用的图片预览地址。": "No image preview URL is available.",
    "当前网页还没有发现可浏览的图片或视频。": "No browsable images or videos have been found on this page yet.",
    "扫描列表已清空。": "The scan list has been cleared.",
    "正在创建 B站 DASH 音视频下载…": "Preparing Bilibili DASH download…",
    "正在启动后台 HLS 分片合并…": "Starting background HLS segment merge…",
    "下载任务已创建": "Download task created",
    "下载任务启动失败。": "Failed to start the download task.",
    "正在把任务转入后台…": "Moving the task to the background…",
    "后台打包已启动，可关闭扩展窗口": "Background ZIP task started; the popup may be closed",
    "正在捕捉当前画面…": "Capturing the current view…",
    "正在准备下载…": "Preparing download…",
    "正在生成 PDF…": "Generating PDF…",
    "正在分页生成 PDF…": "Generating paginated PDF…",
    "正在生成完整图片…": "Generating full-page image…",
    "准备拍摄…": "Preparing capture…",
    "截图已保存": "Screenshot saved",
    "后台正在合并 HLS 分片…": "Merging HLS segments in the background…",
    "HLS 视频已开始下载": "HLS video download started",
    "后台正在打包…": "Creating ZIP in the background…",
    "ZIP 已开始下载": "ZIP download started",
    "同步当前网页": "Sync Current Page",
    "浏览媒体": "Browse Media",
    "下载这张图片": "Download This Image",
    "下载 Pinterest 视频": "Download Pinterest Video",
    "下载这个视频（其它网站）": "Download This Video (Other Sites)",
    "打包本页全部图片": "Package All Images on This Page",
    "打包本页全部视频": "Package All Videos on This Page",
    "打包本页全部媒体": "Package All Media on This Page",
    "保存当前可见区域截图": "Save Visible-Area Screenshot",
    "打开完整页面截图面板": "Open Full-Page Capture Panel",
    "后台正在处理媒体…": "Processing media in the background…",
    "后台正在处理媒体": "Processing media in the background",
    "后台打包任务已启动…": "Background ZIP task started…",
    "已找到 HLS，正在读取播放列表…": "HLS found; reading playlist…",
    "已取得 DASH 视频和音频，正在准备无损合并…": "DASH video and audio found; preparing lossless remux…",
    "正在识别右键选择的视频…": "Identifying the selected video…",
    "正在读取高画质视频流…": "Reading high-quality video stream…",
    "视频流读取完成，正在读取音频流…": "Video stream loaded; reading audio stream…",
    "视频与音频已合并，正在创建 MP4 下载…": "Video and audio merged; creating MP4 download…",
    "视频轨和音频轨已无损封装为一个 MP4，并开始下载。": "Video and audio were losslessly remuxed into one MP4. Download started.",
    "定格：B站视频合并完成": "StillFrame: Bilibili Remux Complete",
    "定格：B站视频合并失败": "StillFrame: Bilibili Remux Failed",
    "定格：B站无损合并已启动": "StillFrame: Bilibili Lossless Remux Started",
    "定格：B站下载已开始": "StillFrame: Bilibili Download Started",
    "定格：B站下载失败": "StillFrame: Bilibili Download Failed",
    "定格：正在解析 B站视频": "StillFrame: Analyzing Bilibili Video",
    "定格：媒体打包完成": "StillFrame: Media ZIP Complete",
    "定格：媒体打包失败": "StillFrame: Media ZIP Failed",
    "定格：ZIP 下载失败": "StillFrame: ZIP Download Failed",
    "定格：下载已开始": "StillFrame: Download Started",
    "定格：截图已保存": "StillFrame: Screenshot Saved",
    "定格：操作失败": "StillFrame: Operation Failed",
    "定格：HLS 视频处理完成": "StillFrame: HLS Processing Complete",
    "定格：HLS 视频下载失败": "StillFrame: HLS Download Failed",
    "定格：后台打包已启动": "StillFrame: Background ZIP Started",
    "当前视频": "Current video",
    "高画质": "High quality",
    "原始编码": "Original codec",
    "已选画质": "Selected quality",
    "未知编码": "Unknown codec",
    "未知错误": "Unknown error",
    "请刷新页面后重试。": "Refresh the page and try again.",
    "请重新尝试。": "Please try again.",
    "请重新尝试打包。": "Please try creating the ZIP again.",
    "当前没有运行中的任务。": "No task is currently running.",
    "后台任务已取消，可以重新选择并打包。": "The background task was canceled. You may select items and create a ZIP again.",
    "打包任务已取消，可以重新选择并打包": "The ZIP task was canceled. You may select items and try again.",
    "ZIP 已生成并开始下载": "ZIP generated and download started",
    "后台正在打包媒体…": "Packaging media in the background…",
    "无法启动 B站下载。": "Unable to start the Bilibili download.",
    "无法启动后台打包任务。": "Unable to start the background ZIP task.",
    "无法启动 HLS 后台下载。": "Unable to start the HLS background download.",
    "无法创建下载任务。": "Unable to create the download task.",
    "取消任务失败。": "Failed to cancel the task.",
    "取消打包失败": "Failed to cancel the ZIP task",
    "打包任务启动失败。": "Failed to start the ZIP task.",
    "后台打包启动失败。": "Failed to start the background ZIP task.",
    "后台打包失败。": "Background ZIP task failed.",
    "下载任务启动失败": "Failed to start the download task",
    "当前页面受 Chrome 保护，无法读取媒体。": "This page is protected by Chrome and cannot be scanned.",
    "当前页面受 Chrome 保护，无法截图。": "This page is protected by Chrome and cannot be captured.",
    "Chrome 内部页面和扩展商店受浏览器保护。请打开普通网页后再使用。": "Chrome internal pages and the extension store are protected. Open a regular webpage to use StillFrame.",
    "请刷新网页后重新打开扩展。": "Refresh the webpage and reopen the extension.",
    "这个页面不允许扩展读取内容，请换一个普通网页后重试。": "This page does not allow extension access. Try a regular webpage.",
    "无法读取网页尺寸。": "Unable to read the webpage dimensions.",
    "这个页面太长，超过了整页截图上限。": "This page exceeds the full-page capture limit.",
    "截图失败，请刷新网页后重试。": "Capture failed. Refresh the webpage and try again.",
    "PDF 页面生成失败。": "Failed to generate the PDF page.",
    "原视频支持": "The original video supports",
    "档清晰度；列表已只保留可用画质": "resolutions; only available qualities are shown",
    "已选": "Selected",
    "共": "Total",
    "项媒体": "media items",
    "项新媒体": "new media items",
    "项": "items",
    "图": "images",
    "个视频": "videos",
    "秒后拍摄…": "seconds until capture…",
    "正在无损合并视频与音频…": "Losslessly remuxing video and audio…",
    "正在创建 MP4 下载…": "Creating MP4 download…",
    "正在读取": "Reading",
    "正在处理": "Processing",
    "处理失败": "processing failed",
    "操作失败": "operation failed",
    "定格：": "StillFrame: ",
    "定格": "StillFrame",
    "B站": "Bilibili",
    "视频预览受限\n仍可尝试下载": "Video preview restricted\nDownload may still work",
    "图片预览受限\n仍可尝试下载": "Image preview restricted\nDownload may still work",
    "HLS 视频\n可合并下载": "HLS video\nCan be merged",
    "页面预览层没有响应。": "The page preview did not respond.",
    "无法在网页中放大图片，请刷新当前网页后重试。": "Unable to enlarge the image on the page. Refresh and try again.",
    "这张图片的远程预览受到网站限制，仍可返回列表尝试下载。": "Remote preview is restricted by the website. Return to the list to try downloading it.",
    "无法在网页中打开图片，请刷新当前网页后重试。": "Unable to open the image on the page. Refresh and try again.",
    "已清空当前标签页的扫描结果；新出现的媒体仍会继续加入。": "Scanned results for this tab were cleared. Newly detected media will continue to appear.",
    "无法启动 B站视频下载。": "Unable to start the Bilibili video download.",
    "B站视频流已开始下载；尚未捕获音频流，请播放视频几秒后重试。": "The Bilibili video stream download started, but no audio stream was captured. Play the video for a few seconds and try again.",
    "完成！图片已保存到“下载 / 定格截图”文件夹。": "Done! The image was saved in Downloads / StillFrame Screenshots.",
    "扫描完成，共找到 ${state.images.length} 项不重复的媒体。": "Scan complete. ${state.images.length} unique media items found.",
    "网页媒体 ${index + 1}": "Web media ${index + 1}",
    "放大第 ${index + 1} 张图片": "Enlarge image ${index + 1}",
    "从第 ${index + 1} 项打开媒体浏览": "Open the media gallery from item ${index + 1}",
    "已选择 ${count} 项": "${count} items selected",
    "正在下载第 ${position + 1} / ${selected.length} 项…": "Downloading item ${position + 1} / ${selected.length}…",
    "${successCount} 个普通或 B站视频流已创建下载任务，${hlsItems.length} 个 HLS 视频正在后台合并；现在可以关闭弹窗。": "${successCount} regular or Bilibili stream downloads were created; ${hlsItems.length} HLS videos are being merged in the background. You may close the popup.",
    "B站 DASH 已分别下载视频流与音频流（音频 ${dashAudioCount} 个），可使用支持 M4S 的工具进行合并。": "Bilibili DASH video and audio streams were downloaded separately (${dashAudioCount} audio streams). Use an M4S-compatible tool to merge them.",
    "完成！${successCount} 项媒体已保存到“下载 / 定格媒体”。": "Done! ${successCount} media items were saved to Downloads / StillFrame Media.",
    "已下载 ${successCount} 项，另有 ${selected.length - successCount} 项被原网站限制。": "${successCount} items downloaded; ${selected.length - successCount} were restricted by the source website.",
    "已在后台处理 ${selected.length} 项媒体。现在可以切换页面或关闭弹窗，完成后会自动下载并通知你。": "${selected.length} media items are being processed in the background. You may switch pages or close the popup.",
    "正在拼接第 ${row + 1} / ${rows} 段…": "Stitching segment ${row + 1} / ${rows}…",
    "已合并 ${message.successCount} 个 HLS 视频，${message.failedCount} 个处理失败。": "${message.successCount} HLS videos merged; ${message.failedCount} failed.",
    "完成！${message.successCount} 个 HLS 视频已合并并开始下载。": "Done! ${message.successCount} HLS videos were merged and started downloading.",
    "ZIP 已开始下载：成功打包 ${message.successCount} 项，${message.failedCount} 项受原网站限制。": "ZIP download started: ${message.successCount} items packaged; ${message.failedCount} were restricted.",
    "完成！${message.successCount} 项媒体已在后台打包并开始下载。": "Done! ${message.successCount} media items were packaged and started downloading.",
    "打包任务启动失败": "Failed to start the ZIP task",
    "在弹窗关闭后继续读取媒体、合并 HLS 分片并生成可下载文件。": "Continue reading media, merging HLS segments, and creating downloads after the popup closes.",
    "后台打包器当前不可用。": "The background ZIP processor is currently unavailable.",
    "HLS 后台下载器当前不可用。": "The background HLS downloader is currently unavailable.",
    "DASH 无损合并器当前不可用。": "The DASH lossless remuxer is currently unavailable.",
    "视频处理任务已取消。": "The video processing task was canceled.",
    "当前页面没有发现图片。": "No images were found on the current page.",
    "当前页面没有发现视频。": "No videos were found on the current page.",
    "当前页面没有发现媒体。": "No media was found on the current page.",
    "当前网站不提供视频下载。": "Video downloading is not provided on this site.",
    "哈希直链不可用，正在读取 Pinterest Pin 数据…": "The hashed direct URL is unavailable. Reading Pinterest Pin data…",
    "正在读取当前页面的视频记录…": "Reading video records from the current page…",
    "已识别 B站 DASH，正在创建音视频下载…": "Bilibili DASH detected. Creating video and audio downloads…",
    "正在读取 m3u8 并合并视频分片，可在插件面板查看实时进度。": "Reading m3u8 and merging video segments. View progress in the extension panel.",
    "视频流和音频流已分别开始下载。": "Separate video and audio stream downloads have started.",
    "视频流已开始下载；播放几秒后可再次尝试获取音频。": "The video stream download started. Play the video for a few seconds and try again to capture audio.",
    "无法从页面数据、网络记录或 CDN 地址取得可下载视频。": "No downloadable video could be obtained from page data, network records, or CDN URLs.",
    "暂未取得这个视频的真实地址，请先播放视频后重试。": "The actual video URL is not available yet. Play the video and try again.",
    "定格：HLS 下载已启动": "StillFrame: HLS Download Started",
    "点击扩展图标可查看合并进度。": "Click the extension icon to view merge progress.",
    "已找到可用视频，正在交给 Chrome 下载…": "A valid video was found and is being sent to Chrome…",
    "Chrome 没有创建媒体下载任务。": "Chrome did not create the media download.",
    "视频正在下载。": "The video is downloading.",
    "图片正在下载。": "The image is downloading.",
    "浏览器没有创建下载任务。": "The browser did not create a download.",
    "CDN 中断了下载。": "The CDN interrupted the download.",
    "CDN 返回了文本错误页，已拒绝保存并切换备用地址。": "The CDN returned a text error page. Switching to a fallback URL.",
    "当前 B站页面没有读取到 BV/AV/番剧视频标识。": "No BV, AV, or episode video identifier was found on this Bilibili page.",
    "无法取得当前分P的 CID。": "Unable to obtain the CID of the current part.",
    "B站没有返回可下载的 DASH 或 MP4 视频流。": "Bilibili did not return a downloadable DASH or MP4 stream.",
    "B站视频流的主 CDN 和备用 CDN 均不可用。": "Both the primary and fallback CDNs for the Bilibili stream are unavailable.",
    "B站接口解析失败": "Bilibili API analysis failed",
    "“下载 B站视频”只能在 bilibili.com 页面使用。": "“Download Bilibili Video” can only be used on bilibili.com.",
    "正在读取 B站页面的 BV、CID 和番剧信息…": "Reading BV, CID, and episode information from Bilibili…",
    "正在探测 B站 HLS、HTML5 MP4 和 DASH 播放流…": "Detecting Bilibili HLS, HTML5 MP4, and DASH streams…",
    "定格：B站 HLS 下载已启动": "StillFrame: Bilibili HLS Download Started",
    "已创建包含声音的 MP4 视频下载。": "An MP4 download with audio was created.",
    "已分别创建视频流和音频流下载。": "Separate video and audio stream downloads were created.",
    "已创建视频流下载；当前页面没有取得音频流。": "The video stream download was created, but no audio stream was obtained.",
    "已创建包含声音的视频下载。": "A video download with audio was created.",
    "尚未读取到 B站 DASH 视频流，请先播放视频几秒。": "No Bilibili DASH video stream has been captured. Play the video for a few seconds.",
    "请先选择要下载的媒体。": "Select media to download first.",
    "所选媒体暂时没有可用的下载地址。": "The selected media currently has no available download URL.",
    "定格：画廊下载已启动": "StillFrame: Gallery Download Started",
    "当前浏览器不支持打开功能窗口。": "This browser does not support opening the feature window.",
    "无法在当前 B站页面显示下载设置弹窗。": "Unable to show the download settings dialog on this Bilibili page.",
    "定格：正在加载视频": "StillFrame: Loading Video",
    "已开始识别和探测视频地址；点击扩展图标可查看实时进度。": "Video URL detection has started. Click the extension icon to view progress.",
    "可见区域截图已开始下载。": "The visible-area screenshot download started.",
    "清晰度识别失败。": "Resolution detection failed.",
    "当前页面不是 B站视频页面。": "The current page is not a Bilibili video page.",
    "无法解析当前 B站视频。": "Unable to analyze the current Bilibili video.",
    "该打包任务已经结束或已被其他任务替换。": "This ZIP task has ended or was replaced by another task.",
    "后台任务已结束或无法取消，请重新打开扩展确认状态。": "The background task ended or cannot be canceled. Reopen the extension to confirm its status.",
    "无法取消后台任务。": "Unable to cancel the background task.",
    "无法启动画廊下载任务。": "Unable to start the gallery download task.",
    "没有可下载的 B站视频流。": "No downloadable Bilibili video stream is available.",
    "B站视频下载启动失败。": "Failed to start the Bilibili video download.",
    "ZIP 已生成，正在交给 Chrome 下载…": "ZIP generated and being sent to Chrome…",
    "Chrome 没有创建合并后的视频下载任务。": "Chrome did not create the remuxed video download.",
    "Chrome 创建合并视频下载失败。": "Chrome failed to create the remuxed video download.",
    "无法把视频轨和音频轨无损封装为 MP4。": "Unable to losslessly remux the video and audio tracks into MP4.",
    "Chrome 没有创建下载任务。": "Chrome did not create the download.",
    "Chrome 创建视频下载失败。": "Chrome failed to create the video download.",
    "处理中 ${percent}% · 浏览媒体": "Processing ${percent}% · Browse Media",
    "已有任务正在运行：${current.text || \"后台正在处理媒体\"}": "A task is already running: ${current.text || \"Processing media in the background\"}",
    "正在处理 ${selected.length} 项媒体；点击扩展图标可查看进度。": "Processing ${selected.length} media items. Click the extension icon to view progress.",
    "正在验证页面实际加载的视频地址（${targetedPageCandidates.length} 个候选）…": "Verifying video URLs loaded by the page (${targetedPageCandidates.length} candidates)…",
    "正在验证 MP4 地址 ${Math.min(completed + 1, total || 1)}/${total || 1}…": "Verifying MP4 URL ${Math.min(completed + 1, total || 1)}/${total || 1}…",
    "已读取 Pin 数据，正在验证 ${apiUrls.length} 个视频地址…": "Pin data loaded. Verifying ${apiUrls.length} video URLs…",
    "正在验证 Pin 视频地址 ${Math.min(completed + 1, total || 1)}/${total || 1}…": "Verifying Pin video URL ${Math.min(completed + 1, total || 1)}/${total || 1}…",
    "B站接口请求失败（${response.status}）": "Bilibili API request failed (${response.status})",
    "B站接口返回错误 ${payload.code}": "Bilibili API returned error ${payload.code}",
    "${label}的主 CDN 和备用 CDN 均下载失败：${lastError?.message || \"未知错误\"}": "Both the primary and fallback CDNs for ${label} failed: ${lastError?.message || \"Unknown error\"}",
    "${error?.message || \"B站接口解析失败\"}；同时没有监听到可备用的 DASH 视频流。": "${error?.message || \"Bilibili API analysis failed\"}; no fallback DASH video stream was captured.",
    "（所选 ${requested} 不可用，已回退）": "(requested ${requested} unavailable; using a fallback)",
    "已识别 ${resolved.qualityLabel} / ${resolved.selectedCodec}${fallbackText}，正在创建下载…": "${resolved.qualityLabel} / ${resolved.selectedCodec}${fallbackText} detected. Creating download…",
    "${result.qualityLabel || \"高画质\"} / ${result.selectedCodec || \"原始编码\"}：正在后台合并视频与音频，可在插件面板查看进度。": "${result.qualityLabel || \"High quality\"} / ${result.selectedCodec || \"Original codec\"}: remuxing video and audio in the background. View progress in the panel.",
    "已取得 ${result.qualityLabel || \"B站\"} / ${result.selectedCodec || \"视频\"} 媒体流，正在创建下载…": "${result.qualityLabel || \"Bilibili\"} / ${result.selectedCodec || \"Video\"} stream obtained. Creating download…",
    "${directCount} 项直接下载，${hlsItems.length} 个视频正在后台合并。": "${directCount} direct downloads; ${hlsItems.length} videos are being merged in the background.",
    "${directCount} 项媒体已开始下载。": "${directCount} media items started downloading.",
    "正在读取“${String(message.title || \"当前视频\").slice(0, 80)}”的播放信息。": "Reading playback information for “${String(message.title || \"Current video\").slice(0, 80)}”.",
    "已创建 ${videoCount} 个视频流和 ${audioCount} 个音频流下载。": "Created ${videoCount} video stream and ${audioCount} audio stream downloads.",
    "已创建 ${videoCount} 个视频流下载；尚未捕获音频流。": "Created ${videoCount} video stream downloads; no audio stream was captured.",
    "${message.successCount} 项媒体已生成 ZIP，并开始下载。": "A ZIP containing ${message.successCount} media items was generated and started downloading.",
    "已合并 ${message.successCount} 个视频，${message.failedCount} 个失败。": "${message.successCount} videos merged; ${message.failedCount} failed.",
    "后台任务已取消。": "The background task was canceled.",
    "资源不是有效的 m3u8 播放列表。": "The resource is not a valid m3u8 playlist.",
    "HLS 主播放列表嵌套过深。": "The HLS master playlist is nested too deeply.",
    "该 HLS 视频使用了加密分片，当前版本无法合并。": "This HLS video uses encrypted segments and cannot be merged.",
    "m3u8 播放列表中没有可下载的分片。": "The m3u8 playlist contains no downloadable segments.",
    "HLS 分片超过 3000 个，已停止处理。": "Processing stopped because the HLS playlist contains more than 3,000 segments.",
    "单个 HLS 视频超过 500 MB，已停止处理。": "Processing stopped because the HLS video exceeds 500 MB.",
    "已有一个打包任务正在运行，请等待它完成。": "A ZIP task is already running. Wait for it to finish.",
    "所选媒体总大小超过 500 MB，请减少选择后重试。": "The selected media exceeds 500 MB. Select fewer items and try again.",
    "媒体受到原网站保护，暂时无法打包。可尝试使用“逐项下载”。": "The media is protected by the source website and cannot be packaged. Try downloading items individually.",
    "后台正在生成 ZIP…": "Generating ZIP in the background…",
    "CDN 返回了文本错误页": "The CDN returned a text error page",
    "没有可用 CDN": "No CDN is available",
    "视频和音频总大小超过 1 GB，浏览器内存不足以安全合并。": "The video and audio exceed 1 GB and cannot be safely remuxed in browser memory.",
    "视频 m4s 中没有可封装的视频轨。": "The video m4s contains no usable video track.",
    "音频 m4s 中没有可封装的音频轨。": "The audio m4s contains no usable audio track.",
    "无损合并没有生成有效的 MP4 文件。": "The lossless remux did not produce a valid MP4 file.",
    "已有一个后台媒体任务正在运行，请等待它完成。": "A background media task is already running. Wait for it to finish.",
    "视频流": "Video stream",
    "音频流": "Audio stream",
    "Chrome 无法创建合并后的视频下载。": "Chrome could not create the remuxed video download.",
    "HLS 播放列表均无法读取。": "None of the HLS playlists could be read.",
    "没有可下载的 HLS 视频。": "No downloadable HLS video is available.",
    "网络请求超过 ${Math.round(timeoutMs / 1000)} 秒，已跳过。": "The network request exceeded ${Math.round(timeoutMs / 1000)} seconds and was skipped.",
    "HLS 播放列表读取失败（${response.status}）": "Failed to read the HLS playlist (${response.status})",
    "HLS 分片 ${index + 1} 读取失败（${response.status}）": "Failed to read HLS segment ${index + 1} (${response.status})",
    "后台读取第 ${position + 1} / ${message.images.length} 项媒体…": "Reading media item ${position + 1} / ${message.images.length} in the background…",
    "正在合并第 ${position + 1} 个视频的 HLS 分片 ${segment + 1}/${total}…": "Merging HLS segment ${segment + 1}/${total} for video ${position + 1}…",
    "${label}读取失败：${lastError?.message || \"没有可用 CDN\"}": "Failed to read ${label}: ${lastError?.message || \"No CDN is available\"}",
    "正在合并第 ${position + 1}/${message.items.length} 个视频：${segment + 1}/${total} 分片": "Merging video ${position + 1}/${message.items.length}: segment ${segment + 1}/${total}",
  };

  const replacements = Object.entries(translations).sort(
    (left, right) => right[0].length - left[0].length,
  );
  const originalText = new WeakMap();
  const originalAttributes = new WeakMap();
  const roots = new Set();
  const observers = new Map();
  let language = "zh";

  const translate = (value) => {
    const input = String(value ?? "");
    if (language !== "en" || !/[\u3400-\u9fff]/.test(input)) return input;
    let result = input;
    for (const [source, target] of replacements) {
      if (result.includes(source)) result = result.split(source).join(target);
    }
    result = result
      .replace(/找到\s*(\d+)\s*items媒体/g, "$1 media items found")
      .replace(/已选择\s*(\d+)\s*items/g, "$1 selected")
      .replace(/Selected\s*(\d+)\s*\/\s*(\d+)/g, "Selected $1 / $2")
      .replace(/Total\s*(\d+)\s*items/g, "Total $1 items")
      .replace(/(\d+)\s*images\s*(\d+)\s*videos/g, "$1 images · $2 videos")
      .replace(/\s{2,}/g, " ");
    return result;
  };

  const applyTextNode = (node) => {
    if (!originalText.has(node)) originalText.set(node, node.nodeValue || "");
    const source = originalText.get(node);
    const next = language === "en" ? translate(source) : source;
    if (node.nodeValue !== next) node.nodeValue = next;
  };

  const translatableAttributes = ["title", "placeholder", "aria-label", "alt"];
  const applyElement = (element) => {
    let originals = originalAttributes.get(element);
    if (!originals) {
      originals = {};
      originalAttributes.set(element, originals);
    }
    for (const name of translatableAttributes) {
      if (!element.hasAttribute?.(name)) continue;
      if (!(name in originals)) originals[name] = element.getAttribute(name) || "";
      const next =
        language === "en" ? translate(originals[name]) : originals[name];
      if (element.getAttribute(name) !== next) element.setAttribute(name, next);
    }
    if (element.matches?.("[data-stillframe-language]")) {
      element.value = language;
      if (!element.dataset.stillframeLanguageBound) {
        element.dataset.stillframeLanguageBound = "true";
        element.addEventListener("change", () => {
          void setLanguage(element.value);
        });
      }
    }
  };

  const applyRoot = (root) => {
    if (!root) return;
    if (root.nodeType === Node.TEXT_NODE) applyTextNode(root);
    else if (root.nodeType === Node.ELEMENT_NODE) applyElement(root);
    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
    );
    let node;
    while ((node = walker.nextNode())) {
      if (node.nodeType === Node.TEXT_NODE) applyTextNode(node);
      else applyElement(node);
    }
  };

  const refresh = () => {
    if (typeof document === "undefined") return;
    roots.forEach(applyRoot);
    document.documentElement.lang = language === "en" ? "en" : "zh-CN";
  };

  const setLanguage = async (nextLanguage) => {
    language = nextLanguage === "en" ? "en" : "zh";
    await chrome.storage.local.set({ uiLanguage: language });
    refresh();
    return language;
  };

  const observeRoot = (root) => {
    if (!root || typeof MutationObserver === "undefined") return;
    roots.add(root);
    applyRoot(root);
    if (observers.has(root)) return;
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "attributes") {
          const element = mutation.target;
          const name = mutation.attributeName;
          const current = element.getAttribute(name) || "";
          const originals = originalAttributes.get(element) || {};
          const previousSource = originals[name];
          if (
            previousSource !== undefined &&
            language === "en" &&
            current === translate(previousSource)
          ) {
            continue;
          }
          originals[name] = current;
          originalAttributes.set(element, originals);
          applyElement(element);
          continue;
        }
        if (mutation.type === "characterData") {
          const current = mutation.target.nodeValue || "";
          const previousSource = originalText.get(mutation.target);
          if (
            previousSource !== undefined &&
            language === "en" &&
            current === translate(previousSource)
          ) {
            continue;
          }
          originalText.set(mutation.target, current);
          applyTextNode(mutation.target);
          continue;
        }
        mutation.addedNodes.forEach((node) => applyRoot(node));
      }
    });
    observer.observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: translatableAttributes,
    });
    observers.set(root, observer);
  };

  const ready = chrome.storage.local
    .get({ uiLanguage: "zh" })
    .then(({ uiLanguage }) => {
      language = uiLanguage === "en" ? "en" : "zh";
      if (typeof document !== "undefined") {
        const start = () => observeRoot(document.documentElement);
        if (document.readyState === "loading") {
          document.addEventListener("DOMContentLoaded", start, { once: true });
        } else {
          start();
        }
      }
      return language;
    });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes.uiLanguage) return;
    language = changes.uiLanguage.newValue === "en" ? "en" : "zh";
    refresh();
  });

  globalThis.StillFrameI18n = {
    ready,
    t: translate,
    getLanguage: () => language,
    setLanguage,
    observeRoot,
    refresh,
  };
})();
