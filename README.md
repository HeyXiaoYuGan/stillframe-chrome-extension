# 定格 StillFrame

**当前版本 / Current version: 1.0.3**

[版本说明 / Release notes](RELEASE_NOTES.md)

StillFrame 是一款面向 Chrome 及 Chromium 浏览器的网页媒体提取扩展，用于在浏览器本地发现、筛选、预览和保存网页中的图片与视频资源。

它支持普通网页媒体扫描、图片画廊、批量下载、ZIP 打包、网页截图，并针对 Pinterest、网页版抖音和 B站提供专用处理能力。媒体解析、截图拼接、ZIP 生成以及 B站 DASH 音视频封装均在本地完成，不依赖维护者运营的服务器。

## 主要功能

### 图片与媒体扫描

- 扫描网页中的图片、视频和 CSS 背景图
- 支持 `srcset`、懒加载属性、媒体元数据和常见媒体直链
- 实时监听页面动态加载的新媒体
- 关闭实时扫描后仍可手动扫描当前页面
- 自动识别重复图片，优先保留分辨率更高的版本
- 提供关闭、宽松、标准和严格四档小图筛选

### 媒体浏览与预览

- 方块和瀑布流两种画廊布局
- 按图片或视频筛选媒体
- 图片点击放大查看
- 支持鼠标滚轮缩放和拖动浏览
- 显示图片分辨率和文件大小
- 支持上一项、下一项、回到顶部和到达底部

### 下载与打包

- 单项下载与下载所选媒体
- 全选、全选图片和全选视频
- ZIP 批量打包下载
- 后台持续处理，关闭扩展弹窗后任务不会中断
- 显示打包、合并和下载进度
- 支持取消正在处理的任务
- 自动生成安全文件名并处理 Windows 保留名称
- WebP 图片可按设置转换为 PNG

### 网页截图

- 保存当前可见区域
- 截取完整网页
- 支持 PNG、JPG 和 PDF
- 支持立即、3 秒和 5 秒延时截图
- 完整页面截图在浏览器本地滚动、拼接和生成

### Pinterest 支持

- 优先识别 Pin 原始大图
- 识别 Pinterest 短视频和 HLS 视频
- 支持面板和右键菜单下载
- Pinterest 请求令牌仅在用户主动下载时临时使用
- 令牌不会写入长期存储、日志或通知

### 网页版抖音支持

- 识别 `douyin.com` 当前视频作品
- 从页面已加载的作品数据、视频元素和媒体请求中合并可用地址
- 显示作品标题、作者、封面、时长和分辨率
- 列出当前作品页面实际提供的全部清晰度，可任选一档下载 MP4
- 页面明确提供编码信息时，可按 AVC、HEVC 或 AV1 筛选视频流
- 可选同时下载当前作品封面
- 抖音 MP4 已包含页面提供的声音；页面没有独立音轨列表时，不显示音质或独立音频选项
- 支持扩展面板和右键菜单下载
- 临时媒体地址只在当前页面与下载流程中使用，不发送到第三方解析服务

### 神秘小入口

- 支持识别当前页面已加载的 MP4、WebM 与 HLS 视频，并在同页存在多个播放器时逐项列出
- 某视频网站页面会在内存中读取页面自身已经收到的视频元数据，因此接口已下发直链时无需先播放
- 开启实时扫描后，页面向下加载更多内容时，新捕获的视频会通过页面事件增量保存并加入列表；工具栏弹窗因滚动关闭后，重新打开仍会恢复同一标签页已捕获的视频
- 尽量读取每个视频所属帖子的标题，并按页面实际提供的清晰度选择视频
- 画质列表会优先显示页面给出的文件大小；没有明确大小时，根据时长、清晰度和典型码率显示估算值
- 可保存当前选中的视频
- HLS 在浏览器本地读取和合并，检测到加密播放列表时会停止并报告保护类型
- 仅使用当前账户已经能够正常播放的媒体地址，不绕过登录、付费、地区或 DRM 限制

### B站支持

- 识别当前页面主视频
- 使用当前已登录的 B站账号会话读取该账号有权播放的普通视频与会员番剧
- 支持传统分P、选集和合集列表
- 分P视频可单独选择或批量打包
- 大批量分P会使用浏览器磁盘空间流式打包，并按 4 GB 自动拆分为多个 ZIP
- 视频合并、CRC 校验和 ZIP 写入均采用磁盘流式与分块处理，避免长时间占满浏览器内存和主线程
- 单个分P超过 700 MB 时会跳过并报告具体原因
- 根据接口实际结果显示可用画质、音质和编码
- 显示视频时长和预估文件大小
- 支持下载当前视频和打包所选视频
- 可选择音频、SRT 字幕、ASS 字幕、XML 弹幕和封面
- 使用本地 Mediabunny 将 DASH 视频轨与音频轨封装为 MP4
- 可识别 HLS 与 DASH/MP4 中常见的加密和 DRM 标记，并明确报告保护类型
- 不解锁画质，不伪造会员或购买权限，不绕过登录、付费、地区和 DRM 限制

### 其他功能

- 中文与 English 界面切换，默认使用中文
- 面板、网页中央画廊和右键菜单操作
- 设置、任务状态和媒体记录均保存在浏览器本地
- 不包含分析统计、广告 SDK 或维护者账户系统
- 不提供 YouTube 视频解析或视频下载
- YouTube 页面仍可使用普通图片扫描和网页截图

## 隐私与使用限制

StillFrame 主要在用户浏览器本地处理数据。设置保存在 `chrome.storage.local`，当前任务和临时媒体地址保存在 `chrome.storage.session`。扩展不会把浏览历史、Cookie、媒体内容或下载文件上传至维护者服务器。

请仅处理自己拥有版权、已经获得授权，或目标网站明确允许保存的内容。使用者应自行遵守目标网站条款、版权规则及所在地区法律。

详细信息请参阅：[隐私说明](PRIVACY.md)、[权限说明](PERMISSIONS.md) 和 [第三方依赖说明](THIRD_PARTY_NOTICES.md)。

## 浏览器限制

以下内容可能无法正常保存：

- Chrome 内部页面、Chrome 应用商店和其他扩展页面
- DRM、加密媒体或受到访问控制的内容
- 已过期的临时签名地址
- 网站禁止跨域读取的媒体
- 基于 Canvas、MediaSource 或特殊 Blob 流播放的内容
- 网站更新后发生结构或接口变化的站点专用功能

## 开源许可

StillFrame 自有源码采用 [MIT License](LICENSE)。Mediabunny 继续适用其独立的 Mozilla Public License 2.0 条款。

> StillFrame 是一款本地运行的 Chrome 网页媒体提取工具，支持图片与视频扫描、高清去重、媒体画廊、ZIP 打包、网页截图，以及 Pinterest、网页版抖音和 B站专用下载功能。

## Features
StillFrame is a local-first media extraction extension for Chrome and Chromium-based browsers. It discovers, filters, previews, and saves images and videos from web pages without uploading media or browsing data to a maintainer-operated server.

### Media discovery and preview

- Scans images, videos, CSS background images, `srcset`, lazy-loading attributes, and common direct media URLs.
- Detects dynamically loaded media and supports manual rescanning.
- Removes duplicates while preferring higher-resolution sources.
- Provides grid and masonry galleries, image zoom and drag controls, media-type filters, dimensions, and file-size information.

### Downloads, archives, and screenshots

- Downloads individual or selected media and supports image-only or video-only selection.
- Creates ZIP archives in the background with progress reporting and cancellation.
- Streams large Bilibili packages to browser storage and automatically splits output into ZIP files of up to 4 GB.
- Processes video merging, CRC calculation, and ZIP output in chunks to reduce memory pressure and browser stalls.
- Converts WebP images to PNG when enabled.
- Captures the visible area or a full page as PNG, JPG, or PDF, with optional 3-second or 5-second delays.

### Pinterest, Douyin, and Bilibili support

- Prefers original Pinterest images and supports Pinterest short videos and HLS media.
- Detects the current video on `douyin.com` from page data, video elements, and media requests, then lets the user choose an available quality and download it locally.
- Uses the current signed-in Bilibili browser session for regular videos and member episodes that the account is authorized to play.
- Detects Bilibili main videos, multipart videos, episode lists, and collections.
- Supports selectable video quality, audio quality, and codec options based on the source response.
- Packages selected Bilibili parts and can include audio, SRT/ASS subtitles, XML danmaku, and cover images.
- Uses the bundled Mediabunny library locally to mux Bilibili DASH video and audio tracks into MP4 files.
- Detects common HLS and DASH/MP4 encryption or DRM markers and reports the protection type explicitly.
- Does not bypass login, payment, membership, regional, access-control, or DRM restrictions.

### Private video entry

- Detects MP4, WebM, and HLS media already loaded by the current page and lists multiple players separately.
- Reads video metadata already returned by a video website to the page in memory, allowing detection without playback when the API response includes direct media URLs.
- With live scanning enabled, saves and appends newly captured videos through page events as more content loads; reopening the toolbar popup restores videos captured for the same tab while it was closed.
- Tries to label every video with its parent post title and lists the quality variants actually exposed by the page.
- Shows a page-provided file size when available, otherwise estimates each quality's size from duration and a typical bitrate.
- Lets the user save the currently selected video.
- Reads and merges clear HLS locally, and stops with an explicit error when an encrypted playlist is detected.
- Uses only media the current account can already play and does not bypass sign-in, payment, regional, access-control, or DRM restrictions.

### Privacy and limitations

- Stores settings and task state locally through Chrome storage.
- Contains no analytics SDK, advertising SDK, or maintainer account system.
- Does not upload browsing history, cookies, media content, or downloaded files to a maintainer server.
- Does not provide YouTube video extraction or downloading; ordinary image scanning and screenshots remain available on YouTube pages.
- Chrome internal pages, extension pages, encrypted media, expired signed URLs, and cross-origin-protected resources may not be downloadable.
