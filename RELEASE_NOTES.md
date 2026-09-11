# StillFrame v1.2.0 版本说明 / Release Notes

## 中文

本版本将当前功能与修复统一归入 v1.2.0。

### B站

- 修复已登录大会员账号仍无法解析番剧的问题。
- 番剧播放请求使用当前 B站页面的登录会话，并携带对应的 `avid`、`cid`、`ep_id`、`season_id` 与临时播放 `session`。
- 支持从番剧页面读取正片与附加剧集；页面未直接提供 BV/AV 时，可通过番剧信息恢复剧集列表。
- 普通视频、分P、合集、字幕、弹幕、封面及 DASH 音视频本地封装能力保持不变。
- 仅使用当前账号已经拥有的播放权限，不绕过登录、会员、购买、地区或 DRM 限制。

### 抖音

- 支持列出页面实际提供的全部清晰度。
- 支持在页面明确提供编码信息时按 AVC、HEVC 或 AV1 筛选。
- 改进主页面数据、内容脚本数据和备用媒体地址的合并。

### 稳定性

- 增加 B站会员番剧请求及抖音清晰度解析的回归测试。
- 媒体解析、下载、ZIP 打包及 DASH 封装继续在浏览器本地完成。

## English

This release consolidates the current feature set and fixes under version 1.2.0.

### Bilibili

- Fixed episode resolution failing even when the signed-in account has an active Bilibili membership.
- PGC playback requests now use the current Bilibili page session and include the matching `avid`, `cid`, `ep_id`, `season_id`, and temporary playback `session` values.
- Added reliable episode-list recovery for PGC pages that do not directly expose a BV or AV identifier, including main and extra episodes.
- Existing support for regular videos, multipart videos, collections, subtitles, danmaku, covers, and local DASH audio/video muxing remains available.
- The extension only uses playback rights already granted to the current account. It does not bypass sign-in, membership, purchase, regional, or DRM restrictions.

### Douyin

- Lists every quality variant actually exposed by the current page.
- Supports AVC, HEVC, and AV1 filtering when codec metadata is explicitly available.
- Improves merging of main-world data, content-script data, and fallback media URLs.

### Reliability

- Added regression coverage for Bilibili member-episode requests and Douyin quality extraction.
- Media parsing, downloads, ZIP packaging, and DASH muxing continue to run locally in the browser.
