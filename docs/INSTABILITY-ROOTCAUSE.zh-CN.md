# IUI 不稳定根因报告（sandbox-first）

- **日期**：2026-10-11（Asia/Shanghai）
- **版本基线**：`@losebird/iui` `0.13.0-iui.23`（`losebird/IUI` main @ `dea922d`）
- **调查范围**：`/workspace/IUI`（与 profile `web-iui` 同步的源码）、重点文件见下
- **结论一句话**：Ace 看到的「空白图 / 死按钮 / L is not defined / 空照片 / Replay 掉瓦片」不是五个独立 bug，而是**同一套流式预览沙箱架构**里几类竞态 + **整段作者 JS 单点失败** + **对模型 JS 长尾的启发式补丁军备竞赛**叠加的结果。`.19`–`.23` 每版修的是 Ace 下一次撞到的症状面，宿主就绪语义从未统一。

---

## 0. 关键代码地图

| 区域 | 文件 | 关键符号 |
|------|------|---------|
| 沙箱合同 / srcdoc / CDN / bridge | `src/shared/html-sandbox.ts` | `parseHtmlSandboxFence`, `buildHtmlSandboxSrcdoc`, `autoCdnTags`, `prepareAuthorJs` / `hardenAuthorJs` / `softRepairSyntax`, `buildSandboxBridgeScript`（含 `previewHtml` / `runAuthorJs`）, `buildLeafletTileGuardScript`, `buildChartGuardScript` |
| 宿主挂载 / 流式冻结 | `src/client/html-fence.tsx` | `srcdocRebuildKey`, `deferAuthorJs`, `previewHtml` / `runAuthorJs` postMessage, `ready` |
| DOM 围栏接管 | `src/client/dom-fence.tsx` | MutationObserver 挂载；与沙箱竞态正交，但决定「什么时候」出现 iframe |
| 行程动画 | `src/themes/oiu-design-system.ts` | `createTripAnimator` / `replay` → `invalidateSize` / `L.iuiRefreshMaps` |
| 照片 | `src/shared/trip-images.ts`, `src/plugin/trip-images-tool.ts` | `enrichPlaceMediaHtml`, `buildTripPhotoFillScript`, Wikimedia 回退 |

---

## 1. 因果链（带函数名）

### 1.1 主路径：流式 `preview-shell`（Ace 真机最常见）

```
模型流式吐出 ```iui-html
  → parseHtmlSandboxFence()          // cssComplete / jsComplete / partial
  → HtmlFence srcdocRebuildKey
       css 未齐 → 反复 rebuild srcdoc
       css 齐   → 冻结 preview-shell（deferAuthorJs=true）
  → buildHtmlSandboxSrcdoc(spec, { deferAuthorJs: true })
       autoCdnTags(html, authorJs)    // ⚠️ 此时 js 常仍为空或不完整
       head 注入 CDN（可能漏 Chart/Leaflet）
       body: bridge + #iui-preview-root + （无作者 JS）+ photoFill
  → bridge 末尾立刻 post({ type: 'ready' })   // ⚠️ ≠ CDN 就绪 ≠ 作者 JS 已跑
  → html-fence 收到 ready → setReady(true)
       可立刻 previewHtml /（若 jsComplete）runAuthorJs
  → bridge runAuthorJs 处理器：
       __iuiAuthorJsRan = true（一次性）
       wantsLeaflet / wantsChart 启发式
       ensureScript + waitGlobal(L|Chart)     // .19/.21 补上的等待链
       runAuthor() → (0, eval)(fnSrc + body)  // ⚠️ 整段单点
```

### 1.2 症状 → 因果映射

#### A. `L is not defined`（灰地图 + 红条）— `.19` 修的面

1. `html-fence.tsx` 在 `cssComplete` 时冻结 `preview-shell`。
2. `buildHtmlSandboxSrcdoc` → `autoCdnTags(html, authorJs)`：作者 JS 尚未到齐时，`wantsLeaflet` 正则（`L.map` / `iui-map-wrap` / …）常为假 → **head 不注入 leaflet.js**。
3. bridge 在 CDN `<script src>` 未完成（或根本没有）时就 `post(ready)`（代码注释已写明，见 `buildSandboxBridgeScript` 内 `runAuthorJs` 段）。
4. 宿主在 `ready` 后发 `runAuthorJs`；作者代码顶层 `L.map(...)` → **ReferenceError**。
5. `.19`：`runAuthorJs` 内 `ensureScript` + `waitGlobal(() => typeof L !== 'undefined')`，并把 CDN 挪到 `<head>`。治的是「注入后仍抢跑」；**没有消灭「冻结时 CDN 集合错误」与「ready ≠ libs ready」**。

#### B. 空白 Chart + 添加/重置「全死」— `.21`–`.23` 修的面（Ace 订阅账单）

同一帧里常同时出现，因为它们共享失败点：

1. **Chart 未就绪**（与 L 同类）：`autoCdnTags` 在 js 空时漏 Chart；`runAuthorJs` 未等 `Chart` → 运行时挂 / 空 canvas。`.21` 补 Chart 等待 + 重放 `DOMContentLoaded`/`load`。
2. **DOM 就绪已过**：preview-shell 注入发生在 `document.readyState === 'complete'` 之后；模型写 `document.addEventListener('DOMContentLoaded', init)` → **init 永不跑** → 图不画、按钮不绑。`.21` 在 `runAuthor()` 里临时劫持 `addEventListener` 立即回放。
3. **`prompt()` 被 iframe sandbox 静默吞掉**：无 `allow-modals` 时 `prompt` 直接失败/空返回，UI 完整但「添加」像死按钮。`.22` 给 iframe 加 `allow-modals`。
4. **致命：整段 `eval` 单点 SyntaxError**  
   - `runAuthor()`：`(0, eval)(fnSrc + '\\n' + body)` 一次编译整包。  
   - 任一处括号/引号/`forEach(...};` / Chart `options` 多一个 `}` → **整包不执行** → 图表创建与 `onclick` 绑定一起消失。  
   - 宿主侧 `prepareAuthorJs` → `hardenAuthorJs` / `softFixArrayCallbackParens` / `softRepairSyntax` / `softTrimExcessClosers` 在 `.22`/`.23` 追着 Muse 的新笔误打补丁。  
   - bridge 内「SyntaxError soft retry」**用同一份源码再 `eval` 一次**（`html-sandbox.ts` ~1317–1322），对真正语法错误无效。

#### C. 行程卡空照片 — `.19`/`.20` 修的面

1. 模型常编造 Commons 文件名 → 404。
2. 静态 `enrichPlaceMediaHtml` 只覆盖 well-known / 已有结构；流式里卡片可能很晚才出现。
3. `buildTripPhotoFillScript` 运行时填图 + MutationObserver；`previewHtml` 用 `root.innerHTML = data.html` **整树替换**，会拆掉已绑定的 img/监听，依赖 observer 再跑。
4. opaque-origin srcdoc + Wikimedia 网络抖动 → 偶发空图。`.20` 做了通用 wiki/Commons 回退与 `loading=eager`，**仍依赖异步网络与 DOM 替换时序**。

#### D. Replay 后瓦片掉 — `.20` 修的面

1. Leaflet 在容器尺寸/滤镜/动画后必须 `invalidateSize` + tile `redraw`；Replay 常伴随 pin 动画与地图平移。
2. Esri / OSM FR 等瓦片在沙箱里偶发 stub / gap-text。
3. `createTripAnimator.replay` → `refreshMaps`；`buildLeafletTileGuardScript` 注册 map、钩 Replay 点击、`moveend`/`zoomend` settle。仍是**事后补偿**，不是单一就绪门。

### 1.3 次路径：原子 `final` srcdoc

若围栏在首次 paint 前已 `jsComplete` 且从未用过 preview-shell，则 `deferAuthorJs=false`，作者 JS 嵌在 srcdoc，在 `window.load` 后跑（相对稳）。Ace 真机对话几乎总是流式 → **多数流量走 preview-shell**，也就是竞态最多的那条路。

---

## 2. 架构级失败模式（为什么会「打地鼠」）

### F1. 「ready」语义错误（宿主契约崩了）

- iframe bridge 的 `ready` =「bridge 脚本执行到了 postMessage」。
- 宿主把它当成「可以注入作者 JS / 可以结束加载中」。
- **真正需要的门**：CDN globals（`L`/`Chart`/…）∧ DOM 已挂到 `#iui-preview-root` ∧（可选）photo-fill 首轮完成 ∧ 然后才允许作者 JS。
- 结果：每个依赖库都要在 `runAuthorJs` 里再写一套 `wantsX` + `ensureScript` + `waitGlobal`（`.19` Leaflet，`.21` Chart，下一个会是 echarts/d3…）。

### F2. 双路径执行模型（preview vs final）

| | preview-shell | final srcdoc |
|--|---------------|--------------|
| 作者 JS | `postMessage(runAuthorJs)` → 延迟 `eval` | 嵌入 `<script>`，等 `load` |
| CDN 集合 | 冻结瞬间的 `autoCdnTags` + 运行时补注 | 构建时一次 |
| DOM 事件 | 必须伪造 DOMContentLoaded | 通常自然 |
| 状态 | `__iuiAuthorJsRan` 一次性；失败难重试 | reload 整页 |

同一产品行为两条物理路径 → 修一条漏另一条；回归矩阵爆炸。

### F3. 作者 JS 单片 `eval`（故障爆炸半径 = 整页）

- 语法错误、早抛的 `L is not defined`、坏正则等，只要发生在顶层编译/执行，**图表初始化与按钮绑定同归于尽**。
- Ace 体感：「中间空了，下面按钮都没用」——正是同一 `eval` 失败的外观。
- soft-repair 只能覆盖**已知笔误形状**；Muse 下一轮换一种多括号方式，`.24` 又要来。

### F4. CDN / 能力探测是启发式，且绑在错误时刻

- `autoCdnTags` / `wantsChart` / `wantsLeaflet` 靠正则扫 html+js。
- 冻结发生在 **css 完成、js 常未到** → 系统化漏注。
- 运行时再补救有效，但与 F1 耦合；探测假阴性仍会漏。

### F5. 对模型 JS 的 soft-repair 军备竞赛

`.17` harden → `.22` forEach/var → `.23` Chart 多 `}`。每条都对症、都有测试，但：

- 没有完整 parser/transform 管线；
- iframe 侧 `softHarden` 是宿主 `prepareAuthorJs` 的残缺子集；
- SyntaxError「重试」不改变源码；
- **永远追不上**自由生成 JS 的长尾。

### F6. 外网与 opaque-origin srcdoc 的物理限制

- `sandbox="allow-scripts allow-modals"`（无 `allow-same-origin`）→ 存储 shim、瓦片 CORS、ESM importmap 不稳（故弃 esm chart/leaflet，改 UMD）。
- 地图/照片依赖第三方 CDN；网络/封锁/ stub 瓦片表现为「偶发灰/空」，被感知为产品不稳。

### F7. `previewHtml` 整树替换 vs 运行时增强

- `root.innerHTML = ...` 销毁 Leaflet map 实例、已绑定按钮、已填照片节点。
- 设计意图是「冻壳保照片」；若在作者 JS 跑后仍推 html，或 photo-fill / map 未再入，会出现「刚修好又空」。

---

## 3. 为什么 Ace 觉得「一点也不稳定」

1. **同一意图多次试，失败模式轮换**：先 L，再空照片，再 Replay 掉瓦片，再空白图+死按钮——像五个 bug，实则一条链上不同闸门。
2. **UI 外壳在、交互全死**：SyntaxError / 漏 CDN / 未回放 DOMContentLoaded 时，HTML/CSS 仍漂亮 → 「假活」比白屏更激怒。
3. **弱模型（Muse）放大 F3/F5**：自由 HTML 产品把正确性押在模型 JS 上；宿主用正则补丁托底，成功率随笔误分布抖动。
4. **`.19`–`.23` 节奏暴露了策略**：半天内五版，每版 changelog 都写「修 Ace 刚撞的面」→ 感知为打地鼠而非夯地基。
5. **无统一「deps ready」可观测性**：失败时常只有红 `pre` 或静默空 canvas；用户分不清是模型坏了还是运行时竞态。

---

## 4. 可持久的改法（方向，不是再堆症状补丁）

### 4.1 单一就绪门（P0 架构）

在 iframe 内显式状态机，例如：

`boot → libsLoading → libsReady → domPainted → authorRunning → authorSettled → live`

- bridge **禁止**在 `libsReady` 前接受业务含义的 `runAuthorJs`（可排队）。
- 对外 `ready` 拆成：`bridgeReady`（仅握手）与 `iuiSettled`（作者跑完或显式失败）。
- 宿主加载中 UI 绑 `iuiSettled`，不要绑现在的 `ready`。

### 4.2 隔离作者 JS 错误（P0，直接消灭「图空+钮死」耦合）

任选其一（建议组合）：

1. **按顶层语句/函数分片 `new Function` + 逐片 try/catch**（acorn 切分；失败片上报，其它片继续 → 按钮仍可活）。
2. **强制作者合同**：业务初始化放 `function iuiMain(){...}`；宿主只调 `iuiMain`，CDN/桥接/填图在之外。
3. **废弃「整包 eval 失败即整页死」**；SyntaxError 重试必须先跑 `prepareAuthorJs` 或分片，禁止同文再 eval。

### 4.3 CDN：声明式 + 早注入，少启发式

- 围栏 JSON 增加可选 `libs: ["chart","leaflet"]`（模型/裁判可填）。
- 或：**凡见 `<canvas` / `.iui-map-wrap` / `#map` 即注入对应 UMD**（假阳性成本远低于假阴性）。
- preview-shell 冻结后仍允许 **升级 head CDN**（已有 ensureScript；升为唯一真源，削弱冻结时刻 `autoCdnTags`）。

### 4.4 收敛 soft-repair，停止无限正则

- 保留无害规范化（智能引号、`</script>`、正则 flag）。
- 括号类：用 **parser 诊断**（acorn）生成可读错误 +「重新生成」动作，而不是猜着剥 `}`。
- 目标：新笔误 → 可见失败与重试，而不是静默空 UI 或再发 `.24` soft-repair。

### 4.5 照片 / 地图：与作者 JS 解耦的宿主增强

- 照片：`previewHtml` 后强制 `iuiPhotoFill.run()`；作者 JS 不负责找图。
- 地图：创建 map 的唯一推荐路径 `iuiCreateMap(el, opts)`（内置 tile guard + Replay 订阅）；Replay 不依赖模型是否调用 `invalidateSize`。

### 4.6 长期产品边界（诚实）

Sandbox-first = 把渲染正确性暴露给模型 JS。要「手感稳」必须：

- 宿主托底（libs、照片、地图、分片执行）变厚，或  
- 收紧作者合同（main + libs 声明），或  
- 接受弱模型长尾并显示「生成质量」而不是假活。

三者不选，只会继续 `.24` `.25` 打地鼠。

---

## 5. 下一步工程（按 P0 排序）

### P0（本周，结构性，小步可测）

1. **拆分 `ready`**：bridge `bridgeReady` vs `libsReady` vs `authorSettled`；`html-fence` 加载中与 `runAuthorJs` 门禁改绑。加单测：CDN 慢 200ms 时不得出现 `L is not defined` / 空 Chart。
2. **作者 JS 分片执行**：`runAuthor` / final 嵌入路径共用；一片 SyntaxError 不得阻止其它顶层绑定。回归：故意在 Chart 配置里塞多余 `}`，断言「添加」按钮仍绑定。
3. **删掉无效 SyntaxError 同文重试**；改为「已 prepare → 仍失败则分片 / 上报」。
4. **CDN 策略**：canvas / map 容器出现即注入；`runAuthorJs` 的 ensure+wait 升为唯一路径文档化。
5. **可观测性**：作者失败时在 chrome 显示「脚本第 N 片失败：…」+ 一键 Reload / 重问，禁止只留空 canvas。

### P1（紧随）

6. 围栏 schema 可选 `libs[]`；format-referee / skill 要求声明。
7. `iuiCreateMap` + 默认 Replay 刷新（模型可不写 Leaflet 样板）。
8. `previewHtml` 后显式重入 photo-fill；避免依赖中的 MutationObserver 竞态。
9. 用 acorn 做作者 JS 诊断（不引入完整 Babel，除非分片不够）。

### P2

10. 合并 preview/final 差异（最终只保留「冻壳 + 注入」或「完整 srcdoc」一条主路径）。
11. soft-repair 白名单化；changelog 禁止再以「又一种 Muse 笔误」作为唯一产品修复。
12. 瓦片/Wikimedia 健康探活与降级文案。

### 明确不要做的

- 再堆一条「只修当前 Ace 截图」的 soft-repair 而不动 F1/F3。
- 城市/场景硬编码（Ace 已禁）。
- 大重写整页运行时而不先落地 P0.1–P0.2 的测试闸。

---

## 6. `.19`–`.23` 为何是打地鼠（对照表）

| 版本 | 补丁 | 盖住的症状 | 未动的根 |
|------|------|------------|----------|
| `.19` | `runAuthorJs` 等/注入 L；CDN 进 head | `L is not defined` | ready≠libs；冻结时 CDN 集合；整包 eval |
| `.20` | wiki 照片回退；Replay `invalidateSize` | 空照片；Replay 掉瓦片 | previewHtml 替换；外网；无统一 map API |
| `.21` | 等 Chart；重放 DOMContentLoaded；safe onclick | 空图；部分死绑定 | 整包 SyntaxError；prompt/modals |
| `.22` | `allow-modals`；forEach/var soft-fix | 添加像死；一种 SyntaxError | 其它笔误；单片 eval |
| `.23` | 剥多余 Chart `}` | 又一种 SyntaxError → 空图+死钮 | soft-repair 军备竞赛本身 |

每一版都「真机验过变好」，下一次换问法/换笔误又爆——符合 Ace 的体感。

---

## 7. 建议给产品/排期的一句话

**先做「就绪门 + 作者 JS 分片」两件 P0，再停 soft-repair 扩容。**  
否则任何新的 Muse 笔误或新 CDN 都会再开一版号，稳定感回不来。

---

## 附录：关键代码锚点（便于 CR）

- bridge `ready` 抢跑注释与 `runAuthorJs`：`src/shared/html-sandbox.ts`（`buildSandboxBridgeScript` 内 `previewHtml` / `runAuthorJs`）
- 宿主冻壳与注入：`src/client/html-fence.tsx`（`srcdocRebuildKey`、`runAuthorJs` effect）
- 整包 eval：同文件 `runAuthor()` 与 `buildHtmlSandboxSrcdoc` 的 `jsBlock`
- soft-repair：`hardenAuthorJs` / `softRepairSyntax` / `softFixArrayCallbackParens`
- CDN 启发式：`autoCdnTags`
- 地图 Replay：`buildLeafletTileGuardScript`；`createTripAnimator` replay
- 照片：`buildTripPhotoFillScript`；`enrichPlaceMediaHtml`
