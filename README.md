# 定格 StillFrame

StillFrame 是一款面向 Chrome 及 Chromium 浏览器的网页媒体提取扩展，用于在浏览器本地发现、筛选、预览和保存网页中的图片与视频资源。

它支持普通网页媒体扫描、图片画廊、批量下载、ZIP 打包、网页截图，并针对 Pinterest 和 B站提供专用处理能力。媒体解析、截图拼接、ZIP 生成以及 B站 DASH 音视频封装均在本地完成，不依赖维护者运营的服务器。

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

### B站支持

- 识别当前页面主视频
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

> StillFrame 是一款本地运行的 Chrome 网页媒体提取工具，支持图片与视频扫描、高清去重、媒体画廊、ZIP 打包、网页截图，以及 Pinterest 和 B站专用下载功能。

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

### Pinterest and Bilibili support

- Prefers original Pinterest images and supports Pinterest short videos and HLS media.
- Detects Bilibili main videos, multipart videos, episode lists, and collections.
- Supports selectable video quality, audio quality, and codec options based on the source response.
- Packages selected Bilibili parts and can include audio, SRT/ASS subtitles, XML danmaku, and cover images.
- Uses the bundled Mediabunny library locally to mux Bilibili DASH video and audio tracks into MP4 files.
- Does not bypass login, payment, membership, regional, access-control, or DRM restrictions.

### Privacy and limitations

- Stores settings and task state locally through Chrome storage.
- Contains no analytics SDK, advertising SDK, or maintainer account system.
- Does not upload browsing history, cookies, media content, or downloaded files to a maintainer server.
- Does not provide YouTube video extraction or downloading; ordinary image scanning and screenshots remain available on YouTube pages.
- Chrome internal pages, extension pages, encrypted media, expired signed URLs, and cross-origin-protected resources may not be downloadable.
