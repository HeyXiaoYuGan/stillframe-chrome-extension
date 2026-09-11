# StillFrame 权限说明

本文件依据当前仓库中的 `manifest.json` 权限清单维护。权限仅用于扩展现有的图片提取、通用媒体扫描、截图、ZIP、Pinterest、抖音和 B站功能；发布前应以同目录的 Manifest 为准进行核对。

## 扩展权限

| 权限 | 用途 |
| --- | --- |
| `contextMenus` | 创建图片、视频、打包、截图、Pinterest、抖音和 B站操作的右键菜单。 |
| `declarativeNetRequestWithHostAccess` | 创建两条媒体下载规则：访问 `bilivideo.com` / `bilivideo.cn` 时设置 B站 Referer；访问抖音及字节媒体 CDN 时设置 `Referer: https://www.douyin.com/`。它们使 Chrome 下载与页面正常播放请求保持相同来源边界，不修改 Cookie、Authorization 或响应内容。 |
| `downloads` | 把图片、媒体、ZIP、截图、PDF、HLS 合并结果和 B站封装结果交给 Chrome 下载管理器，并设置安全文件名。 |
| `notifications` | 在用户允许时提示后台打包、下载、合并的完成或失败状态。可在设置中关闭。 |
| `offscreen` | 在弹窗关闭后继续生成 ZIP、读取 HLS 分片、封装 B站 DASH 音视频和创建 Blob 下载结果。 |
| `scripting` | 为完整页面截图临时执行页面滚动/尺寸读取；读取当前 B站页面已公开给播放器的标题、BV/AV/CID 等上下文；以及读取当前抖音页面已加载到播放器状态中的作品信息、全部可用画质、明确提供的编码和封面。 |
| `storage` | 在 `local` 保存设置，在 `session` 保存短期任务状态和按标签页划分的临时媒体 URL。详细规则见 [PRIVACY.md](PRIVACY.md)。 |
| `webRequest` | 仅在实时扫描开启时观察网页媒体请求 URL、资源类型和响应 `Content-Type`，用于发现 MP4、WebM、HLS、Pinterest、抖音媒体和 B站 DASH。关闭实时扫描后不新增网络媒体记录，仅保留页面导航时的临时记录清理。不会读取请求正文、Cookie 或 Authorization 请求头。 |

`activeTab` 已删除：现有 `<all_urls>` 主机访问范围已经覆盖扫描、媒体读取和截图所需能力，重复声明没有必要。

## 主机权限与内容脚本

`host_permissions: ["<all_urls>"]` 和匹配 `http://*/*`、`https://*/*` 的内容脚本用于：

- 在实时扫描开启时发现任意普通网页中的图片、懒加载资源、CSS 背景图和媒体；关闭时仍允许用户主动执行单次扫描；
- 在任意来源页面执行可见区域与完整页面截图；
- 读取用户所选媒体及其 CDN/HLS 分片，用于预览、ZIP 和下载；
- 支持 Pinterest、抖音、B站以及普通网站使用不同媒体域名和临时 CDN 的情况。

该范围较宽，但它是通用网页扫描功能的直接要求。Chrome 内部页面、Chrome 网上应用店和其他扩展页面仍受浏览器保护，扩展无法读取。

## 站点边界

- **Pinterest**：站点专用请求只发往当前受支持的 Pinterest 源（`.com`、`.cn`、`.de`、`.fr`、`.co.uk`、`.jp`）及其 `pinimg.com` 媒体 CDN。请求令牌即时读取、仅同源使用、从不持久化。
- **抖音**：从当前 `douyin.com` 页面已加载的作品数据、视频元素和媒体请求中识别视频地址，并直接交给 Chrome 下载；不使用第三方解析网站。临时媒体地址只保存在页面内存或现有会话媒体记录中。
- **B站**：调用 `api.bilibili.com` 的页面、播放、字幕和弹幕接口；接口不可用时仅使用 `www.bilibili.com` 上对应的 B站同站路径作为回退，并读取接口返回的 `bilivideo.com` / `bilivideo.cn` 等 B站媒体 CDN。扩展使用当前浏览器会话实际拥有的访问权限，不构造会员、购买或地区权限。
- **YouTube**：不提供视频流解析或视频下载。普通图片扫描和网页截图仍属于通用网页功能。

## 未申请的能力

项目不申请 `cookies`、`history`、`identity`、`tabs`、`webRequestBlocking`、剪贴板后台权限或原生程序访问权限；不包含远程代码执行权限。
