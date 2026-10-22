---
name: iui
description: "Render free, polished HTML/CSS/JS pages inline through the iui-html sandbox fence. Preserve conversation language. Includes a shared design system and patterns. Use for charts, maps, itineraries, comparisons, tools, games, simulations."
---

# IUI — 沙箱自由页（```iui-html）

**Language:** all visible text in the conversation language.

## 合同
凡「要看/要玩的东西」，在回答正文直接输出**一个闭合**围栏（不要写文件、不要先调 bash 做页面）：

```iui-html
title: 加州海岸三日行程
height: 560
---css
.wrap{display:grid;gap:12px}
---html
<div class="iui-sandbox-card wrap">…</div>
---js
document.getElementById('b').onclick = function () { /* 本地交互 */ };
```

- 分段格式：先 `title:` / `height:` 两行，再 `---css` / `---html` / `---js` 各占一行，下面直接写原始代码（不需要 JSON 转义）。旧的 JSON 体 `{"title","height","css","html","js"}` 仍可解析。
- 不要联网取数（fetch/XHR 被沙箱 CSP 拦截）：内嵌示例数据并标注「示例数据」。文字不小于 12px。
- **宿主已注入** 设计系统：`--color-*` 主题、SVG `.c-*`、表单样式、importmap（three/gsap/d3/chart.js/leaflet）、`window.createTripAnimator`。
- css 只写**本页特有**样式；颜色一律用 CSS 变量，禁止硬编码正文/背景色。
- CDN 仅 HTTPS：cdn.jsdelivr.net / cdnjs.cloudflare.com / esm.sh / unpkg.com。
- 交互本地完成；跟宿主通信用 `window.iuiSandbox.sendPrompt / openLink / action`。

## 设计规则（宿主已注入对应样式）
- **字号只用 12 / 14 / 16 / 20 / 28 / 40**（`--fs-xs` `--fs-sm` `--fs-md` `--fs-lg` `--fs-xl` `--fs-2xl`），任何文字不小于 12px；正文对比度 ≥ 4.5:1。
- **页面性格**：在页面根元素写 `data-iui-style="tool|content|data|toy"`（工具型简洁 / 内容型杂志 / 数据型看板 / 玩具型活泼），宿主据此给主色 `--accent`、背景、圆角和密度。每页只有**一个视觉主角**（一张大图、一个大数字、一张图表或一个可玩的物体），其他元素都退后。
- **数字**：`.iui-stat` > `.iui-stat-value`（大号数字，单位放 `<span class="unit">`）+ `.iui-stat-label`（小号说明在下面）；多个放 `.iui-stats`。数字和说明不要写在同一行。
- **卡片**：并列卡片用 `.iui-card-grid`（自动等高），标题 `.iui-card-title` 最多 2 行，摘要 `.iui-card-summary` 最多 3 行，底部按钮加 `.iui-card-foot`。
- 横向滚动区域、代码块（`<pre>`）宿主会自动加渐隐提示和「换行 / 复制」按钮，不用自己做。
- **3D**：用宿主舞台 `<div data-iui-3d='{"model":"polyhaven:ArmChair_01","hotspots":[{"id":"seat","label":"坐垫","at":[0,0.1,0.6],"text":"…"}]}'></div>`。模型先用 `find_3d_models` 搜（返回 `polyhaven:ID` / `khronos:Name`，CC0，带体积与来源；`bundled=yes` 的随插件分发、离线和国内网络也能加载，优先选），不要编 ID；没有合适模型就用 `"shape":"torusKnot|sphere|box|…"`。宿主负责灯光阴影、自动取景、阻尼旋转、键盘、Ctrl+滚轮缩放、热点飞镜头、加载进度与失败兜底；子元素加 `data-iui-3d-layer="back|front"` 做大字背景/前景；监听 `iui3d:hotspot`。只有自定义场景才手写 three.js（`.iui-3d-wrap` + `data-iui-3d-ready`）。

## 关键模式

### 地图 / 多站（南京密度，不是冻成某一城的模版）
2 站及以上（行程、探店、一日游、景点详解）必须同时有：
1. 真 Leaflet（`.iui-map-wrap` 高 300px，默认彩色底图）+ Pause/Replay
2. 编号针 `.iui-pin-dot`（按类别加 `data-cat="food|sight|hotel|shop|nature|culture|transport"` 着色，选中项加 `.active` 会放大置顶；宿主自动把挤在一起的针错开）+ `createTripAnimator`（`pinElements` 先丢掉 `getElement()` 的 null）
3. 横滑 `.iui-cards-strip` + `.iui-stop-card`（多卡在第一次圆角框里滚，不要撑破边框）
4. **点针或卡 → 页内详解**：停留 / 票或预约 / 怎么去 / 避坑（加一句为何排这一站）
单点地图可省略横滑和播放，仍要真图 + marker + 该点详情。
有日程/住宿/预算再画（住宿用 `.iui-compare-3`）；没有就省略。禁止把三日南京布局套到探店或天气。

行程卡照片：优先调用工具 `get_trip_stop_images`（1–8 个维基标题，可附 `coordinates`），只会返回确实拍的是该地点的照片（Commons 文件名/描述/分类点名，或 300 m 内）。把 `image_url` 写入 `.photo img`，署名用折叠链接 `<a href=credit_url title="作者 · 许可">ⓘ 图片来自 Wikimedia</a>`（不要写文件名）。没有可信照片时保留空 `.photo` 并在卡片上写 `data-lat/data-lng`，宿主会画设计过的占位图；绝不用别处（如更有名的邻近地标）的照片顶替。

### 定价三列
`<div class="iui-compare-3">` 内三个 `.iui-tier`（一个 `.featured`）。桌面必须并排，禁止竖着堆三档。

### 图表 / 计算器
Chart.js 或 ECharts；首屏就有真实示例数据；数字校验 `Number.isFinite`。

### 外链
官网 / 预订 / 地图用 `iuiSandbox.openLink(httpsUrl)` 或 `data-iui-open-link`。禁止 `action('sandbox_open_link')`（会再生成一页）。宿主对 https/mailto 只打开、不喊模型。

### 可筛表格（AG Grid，不是所有 table）
只有「可排序/筛选/多列数据表」才用 `agGrid.createGrid`，容器加 `ag-theme-quartz ag-theme-iui`。少行用 `domLayout:'autoHeight'`。行程里的小表、预算格子、三列定价不要改成 Grid。宿主探测到 `agGrid` 会挂 CDN 并补主题。

### 脑图（Mermaid）
脑图 / 流程图用 `<pre class="mermaid iui-mindmap">` 或 `mermaid.run`。不要手绘树、不要 Markdown 缩进树。宿主探测到 mermaid 会挂 UMD 并用 `--color-*` 初始化。

### 沙箱能力表（页面在 `sandbox="allow-scripts"` iframe 里）
| 想做 | 沙箱里直接做 | 改用 |
|---|---|---|
| 下载文件 | `<a download>` / `blob:` 链接无效（宿主会自动接管） | 点击里调 `iuiSandbox.download(文件名, 文本/Blob/对象)`，≤10MB |
| 复制 | `navigator.clipboard` 不可用 | 点击里调 `iuiSandbox.copy(text)`，失败会提示 |
| 保存数据 | `localStorage` 可用但别依赖 | `iuiSandbox.storage.get/set/remove/keys`（JSON，刷新/切会话仍在） |
| 表单提交 | 不会跳转、不会刷新 | 监听 `submit` 并 `preventDefault()`，或监听 `iui:submit`（`e.detail.data`） |
| 弹窗 | `alert/confirm/prompt` 只变成提示条 | 页面内对话框 / 提示 |
| 打开链接 | 不能导航 | `iuiSandbox.openLink(httpsUrl)` |
| 联网取数 | fetch/XHR 被 CSP 拦 | 内嵌示例数据并标「示例数据」 |

## 禁止
- 旧 ```iui 组件树、```json 冒充 UI、Markdown 表格冒充界面。
- 只写说明书不出围栏；把页面写进文件。
- 假地图（手绘 SVG 冒充地图）；竖排三列定价。
