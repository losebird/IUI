---
name: iui
description: "Render free, polished HTML/CSS/JS pages inline through the iui-html sandbox fence. Preserve conversation language. Includes a shared design system and patterns. Use for charts, maps, itineraries, comparisons, tools, games, simulations."
---

# IUI — 沙箱自由页（```iui-html）

**Language:** all visible text in the conversation language.

## 合同
凡「要看/要玩的东西」，在回答正文直接输出**一个闭合**围栏（不要写文件、不要先调 bash 做页面）：

```iui-html
{"title":"加州海岸三日行程","height":560,"css":"...","html":"...","js":"..."}
```

- 字段顺序：title → height → placeholder(可选) → css → html → js；字符串内引号转义，换行写 `\\n`。
- **宿主已注入** 设计系统：`--color-*` 主题、SVG `.c-*`、表单样式、importmap（three/gsap/d3/chart.js/leaflet）、`window.createTripAnimator`。
- css 只写**本页特有**样式；颜色一律用 CSS 变量，禁止硬编码正文/背景色。
- CDN 仅 HTTPS：cdn.jsdelivr.net / cdnjs.cloudflare.com / esm.sh / unpkg.com。
- 交互本地完成；跟宿主通信用 `window.iuiSandbox.sendPrompt / openLink / action`。

## 关键模式

### 地图 / 多站（南京密度，不是冻成某一城的模版）
2 站及以上（行程、探店、一日游、景点详解）必须同时有：
1. 真 Leaflet（`.iui-map-wrap` 高 300px）+ Pause/Replay
2. 编号针 + `createTripAnimator`（`pinElements` 先丢掉 `getElement()` 的 null）
3. 横滑 `.iui-cards-strip` + `.iui-stop-card`（多卡在第一次圆角框里滚，不要撑破边框）
4. **点针或卡 → 页内详解**：停留 / 票或预约 / 怎么去 / 避坑（加一句为何排这一站）
单点地图可省略横滑和播放，仍要真图 + marker + 该点详情。
有日程/住宿/预算再画（住宿用 `.iui-compare-3`）；没有就省略。禁止把三日南京布局套到探店或天气。

行程卡照片：优先调用工具 `get_trip_stop_images`（1–8 个维基标题），把 `image_url` 写入 `.photo img`，并用 `.iui-photo-credit` 展示署名。

### 定价三列
`<div class="iui-compare-3">` 内三个 `.iui-tier`（一个 `.featured`）。桌面必须并排，禁止竖着堆三档。

### 图表 / 计算器
Chart.js 或 ECharts；首屏就有真实示例数据；数字校验 `Number.isFinite`。

## 禁止
- 旧 ```iui 组件树、```json 冒充 UI、Markdown 表格冒充界面。
- 只写说明书不出围栏；把页面写进文件。
- 假地图（手绘 SVG 冒充地图）；竖排三列定价。
