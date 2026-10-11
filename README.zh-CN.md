# IUI — DeepSeek Harness 的智能界面

[English](./README.md) · **简体中文**

**IUI**（`@losebird/iui`）是一个 **dsh 插件**。它把普通对话回答变成**气泡内的自由 HTML/CSS/JS 页面**——图表、地图、行程、比价板、小工具——在隔离 iframe 里渲染，而不是另开应用，也不是固定组件目录。

| | |
|---|---|
| **版本** | `0.13.0-iui.26`（沙箱优先） |
| **形态** | 仅 dsh 插件 — **不是** MCP 产品 |
| **围栏** | `` ```iui-html ``（流式：css → html → js） |
| **许可** | MIT — 见 [LICENSE](./LICENSE) 与 [NOTICE](./NOTICE) |

> **仓库说明。** 本 GitHub 项目（[losebird/IUI](https://github.com/losebird/IUI)）曾托管 MCP / 目录栈；现已清空并替换为 IUI 插件。包名仍是 `@losebird/iui`；产品路径是**插件沙箱渲染**，不是「装个 MCP 就能看见页」。

---

## 你能得到什么

问一句需要「看得见、点得动」的话——*「帮我做个三日海岸行程」*、*「三档方案并排对比」*、*「这周降雨趋势」*——模型可以在助手气泡里直接给出**活页面**：

- **自由 HTML/CSS/JS**，无同源沙箱 iframe（CSP + 体积上限）
- **流式挂载**：占位 → CSS 预览 → HTML → JS 终态
- **共享设计系统**注入每个沙箱（主题 token、排版、行程/定价/地图套路）
- **CDN 白名单**（jsDelivr、cdnjs、esm.sh、unpkg，HTTPS）+ 常用库 import map（Chart.js、D3、Three、Leaflet 等）
- **宿主桥**：`sendPrompt`、`openLink`，以及 resize / ready / error
- **行程与地点配图**：Wikimedia 工具 / 补图，服务景点卡与封面
- **仅软约束**：systemPrompt、pre-step、steer、流式提示；插件侧不做采样硬卡

**0.13 已移除：** 组件 pack 目录、DIL 编译、Gateway / IR / frames、白名单当门槛、弱模型硬保证。删掉是为了只剩一条清楚的产品故事：**模型写页 → 插件沙箱挂载。**

---

## 真机样张

以下均为 **dsh 真机截图**：`` ```iui-html `` 围栏在沙箱 iframe 里挂载后的页面（不是假 HD 拼图）。页面内容与版式来自当次模型输出——图中的城市、价格与主题只是**某次会话长什么样**，不是写死的产品功能。

| 行程页（地图 + 站点卡） | 天气图表页 |
|---|---|
| ![真机 dsh — iui-html 沙箱行程页](./assets/examples/live-itinerary.jpg) | ![真机 dsh — iui-html 沙箱天气页](./assets/examples/live-weather.jpg) |

| 定价板（三档） | 住宿 / 地点卡 |
|---|---|
| ![真机 dsh — iui-html 沙箱定价板](./assets/examples/live-pricing.jpg) | ![真机 dsh — iui-html 沙箱住宿卡](./assets/examples/live-hotels.jpg) |

| 番茄钟小工具 | 看板 |
|---|---|
| ![真机 dsh — iui-html 沙箱番茄钟](./assets/examples/live-pomodoro.jpg) | ![真机 dsh — iui-html 沙箱看板](./assets/examples/live-kanban.jpg) |

| 房贷计算器 |
|---|
| ![真机 dsh — iui-html 沙箱房贷计算器](./assets/examples/live-mortgage.jpg) |

*样张来自 dsh web + IUI + Muse Spark 1.3（及同类会话）。每张是不同页面类型——行程、天气、定价、住宿卡、计时器、看板、计算器。*


---

## 怎么工作

```
你提出可视问句
  → dsh（不变）+ 你的模型
  → IUI 软约束（prompt / steer / 流式提示）
  → 模型输出闭合的 ```iui-html 围栏
  → 客户端边流边解析
       1. 可选占位 chrome
       2. css 齐 → 共享主题 + 作者 CSS → 预览 iframe
       3. html 渐进 → 预览更新
       4. js 在终态沙箱 iframe 执行
  → iframe ↔ 宿主（resize、sendPrompt、openLink、theme）
```

挂载兼容原版 dsh：宿主有 **fence-registry** 就走注册通道，否则走 **DOM MutationObserver**。激活成功时应看到：

```text
[iui] client active; fence-channel=registry|dom
```

---

## 安装

**前置：** PATH 上有 DeepSeek Harness 的 `dsh`（或用 `npx @deepseek-ai/dsh` / 源码目录里的 `pnpm dsh`），Node `^22.19 || >=24`，可用的 web profile。

**不必先 clone。** `dsh plugin add` 会自己下载并装进 profile。

### 推荐：从 GitHub 装进 profile

```bash
dsh plugin --profile <profile> add github:losebird/IUI
dsh web   # 或：dsh --profile <profile>
```

把 `<profile>` 换成你实际用的（常见是 `web`）。若你平时用 `npx` 起 UI、PATH 上没有 `dsh`：

```bash
npx @deepseek-ai/dsh plugin --profile <profile> add github:losebird/IUI
npx @deepseek-ai/dsh web
```

从 DeepSeek Harness 源码检出启动时，前面加 `pnpm`：

```bash
pnpm dsh plugin --profile <profile> add github:losebird/IUI
```

本仓库已带构建好的 `lib/`，git 安装一般不必本地再 build。不要用 `npm dsh`，也不要从家目录跑 `pnpm dsh`。`npx` **不会**装出全局 `dsh` 命令。

打开启动日志里**带 `?token=` 的完整 URL**。控制台应有 `[iui] client active…`；设置侧栏应出现 **IUI**。

### npm 发布之后

`@losebird/iui` 上架后：

```bash
dsh plugin --profile <profile> add @losebird/iui
```

> **npm 状态。** 首次发布仍被挡住：npm 上还没有 `@losebird` 组织（registry 返回 *Scope not found*）。建组织只能在 [npmjs.com](https://www.npmjs.com/) 做一次，CLI 建不了。在此之前请用上面的 GitHub 安装。

### 桌面端 / Electron profile

部分桌面宿主（DeepSeek Harness 桌面端、DSHEAC AIO 等）独占管理 profile，命令行 `dsh plugin add` 写不进去（常见报错：`profile "desktop" is managed exclusively by the Electron application`，或 profile 升级闸门拒绝意外的符号链接 / `link:` 依赖）。这时请用**应用内插件管理器**（设置 → 插件），或把真实目录拷进 profile 的 `node_modules`——不要用 `link:` / junction。同类约束见 [`dsh-our-free-model`](https://github.com/Ebony-Vinyl/dsh-our-free-model) 安装说明。

### 只有开发时才 clone

```bash
git clone https://github.com/losebird/IUI.git
cd IUI
pnpm install
pnpm run build
dsh plugin --profile <profile> add .
# 或同步进已有安装：
# bash scripts/sync-to-dsh-profile.sh . /path/to/profile/node_modules/@losebird/iui
```

**不要**再装第二个也抢同一围栏语言的插件——会抢同一表面。

更多： [docs/INSTALL.md](./docs/INSTALL.md) · [docs/SETTINGS.md](./docs/SETTINGS.md) · [docs/PILOT.zh-CN.md](./docs/PILOT.zh-CN.md)

## 试一下

1. 新会话，选一只有指令遵循力的模型（见下方 [模型与诚实说明](#模型与诚实说明)）。
2. 问需要「像页面」的东西，而不是 Markdown 表格——例如：*「做一个加州海岸三日行程页，带地图和景点横滑卡」*。
3. 助手回复里应出现闭合的 `` ```iui-html ``，并挂成 **iframe 沙箱页**，而不是原文 JSON / 代码块晾在气泡里。
4. 流式结束后，CSS/HTML/JS「加载中」条应消失。

### 围栏形态（模型写什么）

```iui-html
{
  "title": "加州海岸三日行程",
  "height": 560,
  "placeholder": "正在搭建行程板…",
  "css": "/* 本页特有样式；颜色优先用 CSS 变量 */",
  "html": "<div class=\"iui-itinerary\">…</div>",
  "js": "/* html 就绪后执行 */"
}
```

流式字段顺序：**title → height → placeholder → css → html → js**。宿主已注入设计系统基座、import map，以及 `createTripAnimator` 等助手。作者 CSS 请用主题变量；CDN 脚本必须在白名单内。

完整写作合同：[SKILL.md](./SKILL.md)

---

## 模型与诚实说明

| 话题 | 现实 |
|---|---|
| **试点推荐** | **Muse Spark 1.3**（`dsh-our-free-model`）— 行程 / 定价 / 天气类抽检较稳 |
| **是否锁死？** | **否。** 任意 OpenAI 兼容模型可切换；观感因模型而异 |
| **模型长尾** | JS 语法抖、不出围栏、限流 — **不在**插件 SLA。用重新生成 / 重问 |
| **第三方瓦片与图源** | Esri / OSM / Wikimedia **不可**合同保证可用性 |
| **宿主清空气泡** | `contentWiped` 时沙箱会重建；简单表单尽量恢复，复杂动画态可能重置 |

试点运维：[docs/PILOT.zh-CN.md](./docs/PILOT.zh-CN.md)

---

## 设置（短）

**设置 → IUI** 可调主题 token、围栏修复反馈、格式裁判（把可视问句导向 `` ```iui-html ``）、可选用户 HTML 模板，以及可选的 TypeSafe / Jev 格式路由（**无 key 默认关**）。

0.13 **没有** pack 选型、Gateway 旁路或 DIL 端点。详见 [docs/SETTINGS.md](./docs/SETTINGS.md)。

---

## 文档索引

| 文档 | 内容 |
|---|---|
| [docs/REDESIGN-SANDBOX-FIRST.zh-CN.md](./docs/REDESIGN-SANDBOX-FIRST.zh-CN.md) | 为何沙箱优先、删了什么、架构 |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | 英文架构快照 |
| [docs/INSTALL.md](./docs/INSTALL.md) | 安装与验证 |
| [docs/SETTINGS.md](./docs/SETTINGS.md) | 设置与软约束路径 |
| [docs/PILOT.zh-CN.md](./docs/PILOT.zh-CN.md) | 试点运维、模型、已知尾巴 |
| [SKILL.md](./SKILL.md) | 面向模型的围栏 / 模式合同 |
| [docs/ACCEPTANCE.md](./docs/ACCEPTANCE.md) | 验收清单 |
| [CHANGELOG.md](./CHANGELOG.md) | 版本历史 |

---

## 许可

MIT。第三方许可要求的归因见 [NOTICE](./NOTICE)。详见 [LICENSE](./LICENSE)。
