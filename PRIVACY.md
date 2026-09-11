# StillFrame 隐私说明

最后更新：2026-07-30

StillFrame 是一个在用户浏览器本地运行的 Chrome 扩展。项目不包含分析统计、广告 SDK、用户账户系统或由项目维护者运营的数据收集服务器。

## 读取的数据

- 当前标签页中的图片、视频元素、懒加载属性、CSS 背景图、页面媒体元数据和资源 URL。
- 为实时发现媒体而观察的网络请求 URL、资源类型及响应 `Content-Type`。扩展不读取请求正文、请求 Cookie 或 Authorization 请求头。
- 用户主动使用 Pinterest 视频保存时，内容脚本会即时读取当前 Pinterest 页面可访问的 `csrftoken` Cookie 值，仅用于同一 Pinterest 站点的 Pin 数据请求。
- 用户主动使用 B站功能时，读取当前页面的 BV/AV/CID、标题、分P或番剧信息，并请求 B站公开给当前浏览器会话的播放信息、字幕、弹幕或封面。
- 截图功能读取当前页面可见内容；完整页面截图会在本地滚动、拼接并生成 PNG、JPG 或 PDF。

## 本地处理和存储

`chrome.storage.local` 仅保存用户设置、界面语言、B站下载偏好、ZIP 递增序号和内置作者标识。它不保存 Cookie、访问令牌、完整请求头或媒体文件内容。

`chrome.storage.session` 临时保存当前后台任务状态，以及每个标签页最多 400 条媒体记录。媒体记录可能包含网站生成的临时或签名 URL；它们只用于扫描、预览和用户发起的下载，在标签页导航、标签页关闭或浏览器会话结束时清除，不写入长期存储。

Pinterest 请求令牌不写入 `chrome.storage.local` 或 `chrome.storage.session`，不进入通知、错误消息或日志。它仅在用户主动发起 Pinterest 视频保存时即时读取，添加到同源 Pinterest 请求，随后从内存引用中移除。

ZIP、HLS 合并、DASH 音视频封装和截图均在扩展的弹窗、后台 Service Worker 或 Offscreen 文档中本地完成。生成结果交给 Chrome 下载管理器。

## 网络请求

StillFrame 只会在实现用户当前操作时访问：

- 当前网页及其图片、视频、HLS、CDN 或备用资源地址；
- 当前页面所在的受支持 Pinterest 域名（`.com`、`.cn`、`.de`、`.fr`、`.co.uk`、`.jp`）及 `pinimg.com` 媒体 CDN；
- `api.bilibili.com`、`bilibili.com` 页面数据和 B站返回的媒体、字幕、封面、弹幕 CDN；
- 用户当前页面引用的其他媒体域名，用于通用媒体预览、验证、打包或下载。

扩展不会把浏览历史、媒体 URL、Cookie、令牌或下载内容上传到项目维护者或不相关服务器，也不会加载或执行远程代码。

## 平台与访问限制

StillFrame 不伪造会员、购买或账户权限，不破解 DRM、签名或加密媒体，也不绕过登录、付费、会员、地区或网站访问限制。B站规格仅来自当前浏览器会话实际获得的接口结果；Pinterest 请求使用当前页面已有权限。

## 用户控制

用户可以在设置页关闭实时扫描或系统通知。关闭实时扫描后，扩展不会在页面初始化时自动扫描，也不会自动收集后续 DOM 变化、媒体加载事件、性能条目或网络媒体请求；用户主动点击扫描、打开媒体画廊、截图，或使用 Pinterest、B站和下载功能时仍可按需读取当前页面及相关媒体。后台会继续在主框架导航时清除上一页面的临时媒体记录。重新开启实时扫描会在无需刷新页面的情况下扫描一次当前页面，并继续监听新媒体。

卸载扩展会删除 Chrome 为其保存的本地与会话数据。下载到磁盘的文件由用户自行管理。

## 使用责任

请仅处理自己拥有版权、已获得授权或目标网站明确允许保存的内容。用户应自行遵守网站条款、版权规则和当地法律。

---

## English summary

StillFrame processes media locally in the browser and has no analytics, ads, account system, or maintainer-operated collection server. Settings are stored locally; per-tab media URLs and task state are session-only. A Pinterest request token is read only when the user starts a Pinterest save, sent only to the same Pinterest origin, never persisted, logged, or shown, and discarded after the request. The extension does not bypass DRM, payment, membership, login, regional, or access restrictions. See [PERMISSIONS.md](PERMISSIONS.md) for permission details.
