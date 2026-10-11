# IUI 改造方案：沙箱优先（自由好看页）

基准：`@losebird/iui` **0.12.0-iui.46**（仓库根目录）  
目标形态：自由 HTML/CSS/JS 沙箱流式好看页  
约束：仍是 **dsh 插件**；不 fork dsh 核心；不把 MCP 当主产品；未获 Ace 明示前不 merge main、本方案不要求 npm 发版。  
**硬规则（Ace）**：不需要的能力 **直接删除**，不「降权留尸」——避免越做越乱。

---

## 1) 目标一句话

把 IUI 从「目录组件 + DIL 围栏为主」改成「**模型自由吐好看页（HTML/CSS/JS）→ 插件沙箱流式挂载**」为**唯一默认产品路径**；原 pack / DIL / Gateway / 白名单门槛 / 三库对齐 / 弱模型硬保证 **在 P0 物理删除**，不以「可选/legacy」名义保留。

---

## 2) 保留 / 删除 / 新建

### 保留（直接复用，别扔）

| 能力 | 现状锚点 |
|------|----------|
| 围栏挂载 | `` ```iui-html `` / `` ```dsh-ui ``（及兼容解析）；fence-registry 或 DOM MutationObserver |
| 沙箱核心 | `src/shared/html-sandbox.ts` + `src/client/html-fence.tsx`（srcdoc、CSP、CDN 白名单、size cap、stages） |
| 主题 token / DS kit（**服务沙箱**） | `IUI_TOKEN_CATALOG`、sandbox 用 CSS vars、`.iui-sandbox-*` DS kit 注入沙箱（中性主题，不绑目录卡） |
| 流式预览 | 部分 JSON / section 解析 → `partial` + stage chrome（css→html→js） |
| 宿主桥 | postMessage：`resize` / `action` / `ready` / `error`；host→`theme` / `bindings` / `appData`（沙箱需要的留下） |
| 软约束钩子 | 已有 `systemPrompt` / `agent/pre-step` / `agent/turn-stopping`+steer / `llm/stream`（不发明新 dsh API） |
| 安全底线 | 无同源、HTTPS CDN allowlist、危险标签剥离、高度上限 |

说明：保留的 token/DS kit **只服务沙箱好看页**，不是三库目录卡对齐工程。

### 删除（P0 硬删，不降权、不标 optional）

| 能力 | 删除范围（代码 / 配置 / 文档） |
|------|--------------------------------|
| **Pack 目录选型 / 目录卡产品路径** | 删 `src/packs/**`（antd / chakra / mui / shadcn / iui-default / charts 等目录卡产品）、`register-client` / `runtime` / `load` 中仅服务目录卡的路径；删 Settings 里 pack 选型主开关；删「先选 pack 再出卡」的 prompt/裁判逻辑。主题里**仅服务目录卡**的 pack brand 文件一并清；**沙箱用**中性 token / DS kit 留下。 |
| **DIL / Gateway 编译路径** | 删 `dil-schema` / `dil-lite` / `dil-ir` / `iui-gateway` / `gateway-client` / `instance-store*` / `ui-frame` / frames SSE / compile-service 接线；删 DIL 相关 docs（如 `DIL-SCHEMA.md`）与依赖脚本；围栏不再走 DIL→IR 编译。 |
| **白名单当门槛** | 删「命名 intent 白名单决定出不出围栏」的门闸逻辑；`askNeedsUi` / `visual` 兜底改为**默认沙箱**，命名 intent **不得**挡住 `iui-html`。可保留轻量「starter 提示」表（仅影响示例质量），但**不是 gate**。 |
| **三库对齐 ChatGPT 工程** | 停止并删除为「MUI/Ant/Chakra/shadcn 目录卡像素对齐 ChatGPT」投入的模板、样张流水线、对齐专用样式与验收项；不再维护三库目录观感对标。 |
| **弱模型硬保证** | 删 `weak-model-policy` 及「首 token / 首轮必出围栏」硬保证实现与相关验收；抖动本阶段不投入、不挡发版节奏（插件内已知限制即可）。 |

删除原则：

- **能编译通过的最小沙箱插件** = 围栏 + `iui-html` + token/DS + 流式 + 桥 + 软约束 + 安全。  
- 凡是只为目录卡 / DIL / 三库对齐 / 弱模型硬保证服务的测试、脚本、预览目录、Settings 项、CHANGELOG 表述，P0 一并清掉或改写，避免半死引用。  
- **禁止**：`// legacy`、`optional: true` 空壳、feature flag 藏尸。要留回滚用 **git tag `0.12.0-iui.46`**，不留死代码。

### 新建 / 加深（本改造核心）

| 项 | 说明 |
|----|------|
| **默认围栏 = `iui-html`** | 视觉/可交互问句优先吐 `` ```iui-html ``；不再提供目录 JSON 卡主路径 |
| **有序流式合同（仿 generateSandboxedUi）** | 见 §3；落到围栏 body，不靠虚构的 dsh Activity API |
| **共享主题 CSS + importmap 产品化** | 固定注入 design-system base + CDN importmap（Chart.js / D3 / Three / Leaflet 等 allowlist 内） |
| **预览→终态两阶段挂载** | CSS 齐后开 preview iframe；HTML 完成后切 final；JS 分函数/表达式执行（兼容现有单 `js` 字段） |
| **桥能力对齐** | 在现有 `action` 上规范化 `sendPrompt` / `openLink`（校验 HTTPS、payload schema）；可选 `reload` |
| **Prompt / Skill / 裁判改写** | `section-text`、SKILL、referee：只教「自由页 + 字段顺序」；去掉 pack/DIL/白名单门闸话术 |
| **Starter 库** | 图表 / 仿真 / 表单小工具 / 地图 Leaflet / bento 看板等中性中文 starter（无抄袭品牌文案）——以 **HTML 片段** 形式存在，不是 pack 组件目录 |

---

## 3) 目标架构（短）

```
用户可视问句
  → dsh（不变）
  → FreeLLMAPI / 上游模型
  → IUI 插件软约束（systemPrompt / pre-step / steer / stream 提示）
  → 模型在回复体输出 ```iui-html（默认且唯一产品围栏）
  → 客户端流式解析围栏
       1) placeholder / 占位文案（可选，chrome 显示）
       2) css 完整 → 注入共享主题 + author css → 开 preview
       3) html 渐进 → preview 更新（防闪：整段替换或轻量 morph）
       4) js（或 jsFunctions → jsExpressions）→ final iframe 执行
  → 沙箱 iframe（无同源）↔ 宿主桥（resize / sendPrompt / openLink / theme）
```

**流式合同（围栏 body，兼容两种写法）**

1. **推荐 JSON（字段序便于流式）**  
   `placeholder`（或 `placeholderMessages`）→ `css` → `html` → `js`  
   扩展（可选、向后兼容）：`height` / `title` / `jsFunctions` / `jsExpressions[]`  
   解析器：**按字段完成度推进 stage**（css 未齐不预览；html 流式可 partial；js 齐后再跑脚本）。

2. **兼容现有 section 标记**  
   `css` / `html` / `js` 分段正文（已有 `SECTION_HEADER`）继续可用。

3. **不发明的东西**  
   不假设 dsh 有 `generateSandboxedUi` 工具注册、AG-UI activity、或采样 grammar。  
   若未来上游支持 tool-call 流，可再加「工具参数 → 同构围栏」适配层；**首版只用围栏 + 软约束**。

**与 MCP 的关系（写死）**  
MCP 最多当「跨 harness 装配 HTML」旁路；**dsh 能看见页的唯一必要条件是本插件沙箱渲染器**。本产品路径仍是插件，不是「装 MCP 即用」。

**已删除路径在架构图中不再出现**：无 pack 选型、无 DIL compile、无 Gateway、无 frames/store 主链路。

---

## 4) 分阶段步骤（可执行 + 验收）

### P0 — 删除旧路径 + 默认改道（约 1–2 天）→ 建议版本 `0.13.0-iui.0`

**删除（本阶段必须做完，不可推迟到 P4）**

- 物理删除 pack 目录卡产品路径（`src/packs/**` 及仅服务目录卡的 client 注册/runtime）。  
- 物理删除 DIL / Gateway / IR / instance-store / ui-frame 及相关脚本与文档。  
- 物理删除白名单门闸：裁判/配置里「未命中命名 intent 就不围栏」逻辑；改为视觉问句默认引导/rescue **`iui-html`**。  
- 物理删除弱模型硬保证模块与相关验收。  
- 清掉三库 ChatGPT 对齐专用资产与验收项；Settings/文案不再出现 pack/DIL/Gateway 主开关。  
- 修编译与测试：凡引用已删符号的单测/e2e/smoke **改沙箱或删除**，禁止 skip 藏尸。

**改道**

- 改 `ARCHITECTURE.md` / `README` / `SKILL` / `section-text`：唯一默认 = 沙箱自由页。  
- referee：`must_fence` 视觉问句以 **`iui-html`** 为准；rescue recipe 挂沙箱 starter。  
- 旧 `` ```iui `` JSON 目录卡：**不再作为产品路径维护**；若解析层仍能碰到历史消息，可做「忽略/降级提示」或最短兼容只读，**不**再渲染目录组件树（避免半套 pack 复活）。具体兼容策略在实现时选「最短、无 pack 依赖」一种并写进 CHANGELOG。

**验收**

- [ ] 仓库内无 DIL/Gateway/pack-runtime 主路径源码（`rg` 抽检通过）。  
- [ ] 文档与 prompt 无「优先目录组件 / DIL 编译 / 白名单门槛 / 弱模型硬保证」产品表述。  
- [ ] 问「做个会动的排序可视化」→ 引导出 `` ```iui-html ``。  
- [ ] `pack:dry`（若脚本仍存在则改名/删）+ unit / `smoke:fence`（沙箱）绿。  
- [ ] 构建产物可同步到 dsh profile，硬刷新后旧目录卡链路不再出现。

### P1 — 流式合同与预览质量（核心，约 2–3 天）→ `0.13.0-iui.1`

- 扩展 `HtmlSandboxSpec`：`placeholder` / `jsFunctions` / `jsExpressions`；旧 `js` = 整包兼容。  
- 挂载策略：cssComplete → preview；htmlComplete → final；表达式逐条（失败单条上报 `error`，不整页白屏）。  
- 共享 base CSS + importmap 固化；CDN 仍走 `HTML_SANDBOX_CDN_ALLOWLIST`。  
- chrome：占位文案 → stage 指示 → ready；高度 `resize` 夹紧。

**验收**

- [ ] 单测：部分 JSON 流（只 css / css+半截 html / 全字段）stage 与 `partial` 正确。  
- [ ] 浏览器：预览可见渐进 HTML；完成后 JS 生效；刷新不丢已 settle 消息。  
- [ ] 超大 css/js 触 size cap 有明确空态/错态，不崩气泡。  
- [ ] Playwright：至少 1 条「流式沙箱」冒烟。

### P2 — 桥与交互闭环（约 1–2 天）→ `0.13.0-iui.2`

- 规范化 sandbox → host：`sendPrompt({ text })`、`openLink({ url })`（仅 https/允许协议）、保留 `resize`/`ready`/`error`。  
- host → sandbox：主题热更新、可选 `appData` 推数（已有则接线文档化；无 DIL bind 依赖）。  
- Prompt 写明桥 API，让模型生成可点的「继续问」「外链」控件。

**验收**

- [ ] 沙箱按钮能触发宿主发一条用户消息（或等价 steer 入口，以现有 dsh 插件能力为准）。  
- [ ] 非法 `openLink` 被拒并 `error`；合法链接打开。  
- [ ] 无同源：沙箱读不到宿主 cookie/storage（抽检）。

### P3 — 观感与常用意图真机打磨（约 2–4 天）→ `0.13.0-iui.3`

- Starter：图表、步骤工具、对比看板、Leaflet 地图、小游戏/仿真各 1+（HTML/CSS/JS 片段）。  
- 真机抽常用意图（可视化 / 交互小工具 / 仪表盘 / 地图 / 表单页）打磨留白、动效、暗色。  
- **不再**维护目录卡捷径。

**验收**

- [ ] ≥8 张 HD 真机挂载样张（全部沙箱）。  
- [ ] 主观过线：自由页好看、像产品界面，而非表格堆砌。  
- [ ] e2e:session 或手工脚本：3 个常用意图端到端出沙箱。

### P4 — 收口文档（约 0.5 天）→ `0.13.0-iui.4`（可合并进 .3）

- 更新 `ACCEPTANCE.md` / `HARD-WALLS.md` / `SETTINGS.md`：硬墙改为「无采样硬卡 / 无跨 harness 无渲染器 / 已删除目录·DIL 路径」等诚实表述。  
- **确认** P0 删除清单无回潮（再 `rg` 一次）。  
- **不** npm publish；**不** merge main（除非 Ace 明示）。

**验收**

- [ ] Ace 硬刷验收清单勾完。  
- [ ] CHANGELOG 写清 **breaking**：目录 pack / DIL / Gateway / 白名单门槛 / 弱模型硬保证已删除；默认唯一路径为 `iui-html` 沙箱。

---

## 5) 对 dsh 的影响（应接近零）

- **不改** dsh 核心、agent-loop、`LlmCallConfig`、fence-registry 宿主实现。  
- **只动** `@losebird/iui` 插件包 + 同步到 profile 的插件目录。  
- 继续用现有 Cordis 钩子做软约束；无新宿主 API 依赖。  
- 重启/硬刷新 dsh Web 即可验；端口与 FreeLLMAPI 路径保持现状。  
- P0 删除后插件体积应明显下降；同步脚本去掉 pack/DIL 相关步骤。

---

## 6) 风险与不做清单

### 风险

| 风险 | 缓解 |
|------|------|
| 自由 HTML 一致性差 | 强制注入共享主题 + DS kit class；prompt 要求优先用 kit |
| XSS / 逃逸 | 保持 CSP、标签剥离、CDN 白名单、无同源；桥严格 schema |
| 弱模型乱吐 Markdown 或不按字段序 | 软约束 + rescue 挂 starter；**不**再做硬保证模块 |
| 包体积 / CDN 失败 | importmap 按需；失败有错态；允许降级无图表 |
| P0 大删导致短期回归 | 以 `0.12.0-iui.46` git tag 回滚；P0 验收以沙箱 smoke/unit 绿为门；不留半套 pack「兼容层」 |

### 明确不做

- Fork dsh / 改采样硬卡 / 本地 vLLM / `:3101` 默认路径  
- 「只装 MCP、无沙箱渲染器」当产品  
- 以 ChatGPT 目录组件像素级为目标回摆  
- **降权留尸**：pack / DIL / Gateway / 白名单门槛 / 弱模型硬保证 以 optional、legacy、flag 形式残留  
- 本阶段 npm 发版、merge main  
- 把白名单 intent 重新做成「不出围栏」的门闸  
- 复刻外部完整 Agent UI 运行时（除非 dsh 将来原生支持，另开方案）

---

## 7) 建议首版版本号命名

| 版本 | 含义 |
|------|------|
| **`0.13.0-iui.0`** | **改道首版**：P0 **删除**旧路径 + 默认沙箱优先——建议 Ace 批准后的第一个可同步包 |
| `0.13.0-iui.1` | 流式合同 + preview/final（P1） |
| `0.13.0-iui.2` | sendPrompt/openLink 桥（P2） |
| `0.13.0-iui.3` | 真机观感/starter 打磨（P3） |
| `0.13.0-iui.4` | 文档/ACCEPTANCE 收口（可选） |

次版本从 `0.12` → **`0.13`** 标记产品主路径 **breaking**（删除目录/DIL 等）；补丁段 `-iui.N` 延续现有节奏。  
`0.12.0-iui.46` 打 git tag 作为「目录优先最后快照」，需要时用 tag 回滚，**不用死代码回滚**。

---

**请 Ace 批准焦点**：是否按 **P0（先硬删再改道）→ P1 → P2 → P3** 开干，首包打 **`0.13.0-iui.0`**？批准后从 P0 **直接删除** pack/DIL/Gateway/白名单门槛/三库对齐工程/弱模型硬保证，再改默认路径与 prompt；**不**先降权留代码。

---

## P4 状态（自动化收口）

- 代码已推进至 **`0.13.0-iui.3`**（P0→P3 见 CHANGELOG）。
- `docs/ACCEPTANCE.md` / `HARD-WALLS.md` / `SETTINGS.md` 已按沙箱优先改写（2026-10-11）。
- 仍待 Ace：**硬刷 dsh 验收**；未 npm publish；未 merge main。
