# 定格 StillFrame

StillFrame 是一个 Manifest V3 Chrome 扩展，用于在浏览器本地发现网页图片与媒体、预览和筛选结果、生成网页截图，并把用户选择的内容交给 Chrome 下载。项目包含 Pinterest 和 B站的站点适配，但不以绕过平台访问控制为目标。

> 请仅处理自己拥有版权、已获得授权或目标网站明确允许保存的内容。使用者应自行遵守网站条款、版权规则和当地法律。

## 功能

- 可选的实时扫描会发现普通网页中的图片、`srcset`、懒加载属性、CSS 背景图、媒体元数据、HTML 视频和常见直链媒体；关闭后停止自动 DOM 与网络媒体收集，手动扫描仍可随时使用。
- 对同一图片的不同尺寸进行去重并优先保留高像素候选；提供关闭、宽松、标准和严格四档小图筛选，同时保留页面主图和分享封面。
- 在弹窗或网页中央画廊中浏览媒体，支持方块/瀑布流布局、图片放大、滚轮缩放、拖动查看、上一项/下一项和批量选择。
- 全选、全选图片、全选视频、下载所选和 ZIP 打包；后台任务在扩展弹窗关闭后仍可继续，并显示进度和取消按钮。
- 可见区域或完整页面截图，支持 PNG、JPG、PDF 和 0/3/5 秒延时。
- 下载内容按媒体与截图分类保存到 Chrome 默认下载目录内的“定格下载”文件夹，并支持 ZIP 递增命名和 B站文件名模板。
- 中文/English 界面切换，默认中文。
- Pinterest 图片原图候选、Pin 短视频直链/HLS 识别和按需保存。
- B站当前视频标题、分P/番剧信息、实际可用画质、音质和编码识别；在浏览器本地把可用的 DASH 视频轨与音频轨封装为 MP4，并可选保存接口实际返回的字幕、弹幕或封面。

## 明确不提供

- 不提供 YouTube 视频解析或视频下载。YouTube 页面仍可使用普通图片扫描和网页截图。
- 不破解 DRM、签名或加密媒体。
- 不伪造会员、购买或账户权限，不绕过登录、付费、会员、地区或其他访问限制。
- 不移除作者、平台或版权标识。
- 不运行录屏式视频抓取，也不上传媒体到项目维护者服务器。

## 安装

本项目无需构建。

1. 下载或克隆仓库，确保 `manifest.json`、脚本、样式、图标和 `vendor/` 保持原目录结构。
2. 打开 `chrome://extensions/`。
3. 开启“开发者模式”。
4. 选择“加载已解压的扩展程序”，指向本目录。
5. 固定“定格 StillFrame”到工具栏；普通网页会在首次扫描时自动载入内容脚本，无需手动刷新。

### 覆盖升级

将新版本文件覆盖到同一固定目录，然后在 `chrome://extensions/` 中点击该扩展的刷新按钮。`manifest.json` 中的公开扩展密钥用于保持未打包开发版本的扩展 ID 稳定；它不是私钥，也不能用于签名发布。

## 基本使用

### 图片与媒体

1. 打开普通网页并点击扩展图标。
2. 点击“扫描当前网页媒体”可立即读取当前页面，不要求刷新。开启实时扫描时，滚动或页面动态加载的新媒体会继续加入；关闭实时扫描后，不会自动首扫或收集后续 DOM/网络媒体，但手动扫描仍然有效。
3. 使用“全选 / 全选图片 / 全选视频”选择和筛选结果，或打开“浏览全部媒体”。
4. 选择“下载所选”或“打包 ZIP”。媒体 URL 受网站时效、登录状态、跨域策略和访问控制影响，过期或受限资源可能失败。

### 网页截图

切换到“网页截图”，选择可见区域或完整页面、PNG/JPG/PDF 和延时。完整页面会在本地滚动并拼接；超长页面、固定元素、懒加载内容和浏览器受保护页面可能影响结果。

### Pinterest

在 Pin 图片或视频上使用扩展面板或右键菜单。扩展会优先使用页面实际加载的资源，并按需尝试 Pinterest 页面数据和 `pinimg.com` CDN。Pinterest 请求令牌只在用户主动保存时即时读取，仅发往同一 Pinterest 源，不持久化。

### B站

在 B站视频页可打开插件面板中的“B站视频”，单独扫描主视频、传统分P以及播放器选集/合集，不会把页面图片混入该列表；也可以右键选择“下载 B站视频”。即使页面只有主视频，也会按单项列表显示。列表读取不会在 50 项处截断；超过 50 项时仍显示全部条目和总数，但会明确提示单次最多选择 50 项。列表会显示时长和当前规格的文件大小；切换画质、编码、音质或是否包含音频后会重新估算。DURL 返回值可提供精确大小，DASH 规格则按接口返回的码率与时长估算并标注“约”。面板支持逐个选择、下载当前视频，或把所选项目依次无损封装后生成 ZIP。画质列表会根据当前页面、当前浏览器会话和 B站接口实际返回的规格缩减；若首选规格不可用，会在已返回的可用规格中回退。ZIP 单次最多处理 50 项、合计最多 800 MB，以降低浏览器内存耗尽风险。

高画质 DASH 可能由独立视频轨和音频轨组成。StillFrame 使用本地 Mediabunny 将接口实际提供且验证可读的轨道封装为一个 MP4；这不是画质解锁、重新编码或权限绕过。付费、会员、登录、地区、DRM 或其他受限内容仍由 B站决定是否向当前会话提供。

## 数据与权限

- [隐私说明](PRIVACY.md)：读取内容、本地处理、临时媒体 URL、Pinterest 请求令牌和网络边界。
- [权限说明](PERMISSIONS.md)：逐项解释 `manifest.json` 权限、`<all_urls>`、内容脚本和站点用途。

StillFrame 没有分析统计、广告 SDK、维护者账户系统或维护者运营的数据收集服务器。设置保存在 `chrome.storage.local`；当前任务和标签页媒体 URL 临时保存在 `chrome.storage.session`，并在导航、关闭标签页或浏览器会话结束时清理。实时扫描关闭时，后台仍保留主框架导航清理逻辑，避免旧页面媒体记录残留，但不会新增网络媒体记录。

## 浏览器限制

- Chrome 内部页面、Chrome 网上应用店和其他扩展页面不能被扫描或截图。
- Canvas、MediaSource `blob:`、加密 HLS、DRM、签名过期资源和网站禁止读取的内容可能无法保存。
- HLS 和 ZIP 单任务有分片数、超时和内存上限；DASH 本地封装总输入超过 1 GB 时会停止，以避免浏览器内存耗尽。
- Chrome 扩展不能修改系统绝对下载路径；StillFrame 将文件分类保存到 Chrome 默认下载目录内的“定格下载”文件夹。
- 网站结构和接口可能变化；站点适配不保证永久有效。

## 开发与检查

发布前可执行：

```bash
node --check background.js
node --check content.js
node --check i18n.js
node --check offscreen.js
node --check options.js
node --check popup.js
```

还应在 `chrome://extensions/` 重新加载后人工验证安装、弹窗、设置、实时扫描、截图、ZIP、Pinterest 和 B站流程。静态检查不能替代真实浏览器测试。

## 第三方组件

Mediabunny 用于在浏览器本地封装 B站 DASH 音视频轨。其准确捆绑版本无法从现有文件可靠确定，因此以 SHA-256 标识该文件。版权、MPL-2.0 协议、完整哈希和上游地址见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)；许可证原文见 [vendor/mediabunny/LICENSE.txt](vendor/mediabunny/LICENSE.txt)。

## 开源许可

StillFrame 自有源码采用 [MIT License](LICENSE)。`vendor/mediabunny/` 继续适用其独立的 Mozilla Public License 2.0 条款。

---

## English

StillFrame is a Manifest V3 Chrome extension that locally discovers webpage images and media, provides a filterable gallery, captures visible or full pages as PNG/JPG/PDF, and downloads selected items or ZIP archives through Chrome.

It includes opt-in Pinterest and Bilibili integrations. It does not provide YouTube video downloading, bypass DRM, payment, membership, login, regional or access restrictions, remove watermarks, or upload media to a maintainer-operated service. Bilibili choices are limited to formats actually returned to the current browser session.

See [PRIVACY.md](PRIVACY.md), [PERMISSIONS.md](PERMISSIONS.md), and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Only process content you own, are authorized to use, or the source site permits you to save.
