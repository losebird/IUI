# IUI 黄金问句回归套件

目标版本跟 `package.json` 走（当前 `0.13.0-iui.27`）。回归报告从那里读取，不再把版本写死在 `scripts/golden/manifest.json`。

固定问句 + 验收脚本，用来压「模型写出能跑的页」。**过才算稳**；不要为单次 Muse 笔误再堆 soft-repair。

## 怎么跑

```bash
# 本机已起 web-iui :3081 + Muse Spark 1.3
export IUI_GOLDEN_URL='http://127.0.0.1:3081/?token=<token>'
pnpm run golden -- --url "$IUI_GOLDEN_URL" --out /workspace/uploads/iui-golden
```

产物：`/workspace/uploads/iui-golden/<id>.png` + `manifest.json`（pass/fail 明细）。

## 硬验收（每条 live 问句）

| 检查 | 含义 |
|------|------|
| `iframeReady` | 气泡内有 sandbox iframe，且 `data-iui-html-sandbox=ready` |
| `noRawFence` | 助手气泡不是 raw `"css":` / `<div class=` 源码块 |
| `expectChart` | 需要时 iframe 内存在 canvas，且 Chart 实例或像素非空 |
| `expectMap` | 需要时存在 `.leaflet-container`，且最好有 `.leaflet-tile-loaded` |
| `pipelineLive` | 无 `author pipeline missing` / 宿主橙条 `data-iui-host-fail` |
| `expectFailStrip` | **仅 fixture**：故意坏 JS → 红条 `data-iui-author-fail` + 重跑按钮 |

## 固定问句（不要改文案；新场景另开 id）

### G1 · billing（订阅账单 · Chart）

```
可视化我的订阅账单：Netflix、Spotify、iCloud、Claude 等月费，环形图占比，可勾选「下月取消」并重算，支持添加/重置。
```

期望：`expectChart` · 本地勾选/添加可交互 · 无失败红条。

### G2 · trip（行程地图 · Leaflet）

```
帮我做一个三日华东行程：苏州→杭州→上海，Leaflet 地图连线，每站 Wikimedia 实景卡，可 Pause/Replay。
```

期望：`expectMap` · 站点卡有图（允许 Commons 回退）· Replay 后瓦片仍在。

### G3 · weather（天气 · Chart）

```
做一个上海未来 7 天天气看板：大气温、体感/湿度芯片、逐时折线、点选某天切换。
```

期望：`expectChart` · 日卡可点 · 折线非空。

### G4 · mealplan（周食谱 · 新）

```
帮我做一个可交互的周食谱：7 天三餐，点某一天展开食材清单和总热量，能切换素食/高蛋白。
```

期望：`iframeReady` · 本地切换不调模型 · 无 raw fence。

### G5 · coffee-map（探店地图 · 新）

```
画一个本地咖啡探店地图：上海 6 家店标记，点标记出评分/价位/步行分钟，底部列表可筛选。
```

期望：`expectMap` · 列表筛选本地生效。

### F1 · author-fail（fixture · 非模型）

故意坏 JS 的静态 srcdoc（脚本生成），**不走 Muse**。

期望：`expectFailStrip` · `data-iui-author-fail` 可见 · `data-iui-rerun-author` 可点。

## 刻意不做

- 不为黄金问句写死城市/店名到宿主代码。
- 不把 `prompt()` soft-repair 当主路径；引导模型用页面内按钮/表单。
- 不把 flaky 瓦片/外网图源偶发抖动当成插件失败（Replay 后补瓦片可接受）。

## 与发版关系

改沙箱就绪门 / 分片执行 / 失败可见后，必须重跑本套件。CI 可只跑 F1 fixture；live G1–G5 需配额时人工/半自动跑。
