# IUI 视觉重做 · 交接文档

> 交接时间：2026-10（第 6 步完成、待用户确认时更新） ｜ 分支：`hotfix/0.13.0-iui.27`（版本 `0.13.0-iui.27`）｜ 仓库：losebird/IUI
> 本目录：`docs/handoff/`（只在 `hotfix/0.13.0-iui.27` 分支上，`main` 没有；先 `git fetch origin && git checkout hotfix/0.13.0-iui.27`）

## 1. 现在在哪一步

- 3 轮视觉方案**全部已确认**（第 1、2 轮按「推荐」；第 3 轮 ⑪ ⑫ 和 999px 修复也已确认要做）。
- 第 6 节第 1–6 步**已完成并推送**（`hotfix/0.13.0-iui.27`）：

  | 步骤 | 提交 | 内容 | 对比图 |
  |---|---|---|---|
  | 1 主题底座 | `cbd9a0d` | daisyUI「IUI 中性」（iui / iui-dark + corporate / dim）内联进沙箱；OIU 配色删除，旧变量桥接到 daisyUI token；Inter 离线；page-accent 只改 primary；customTokensJson 白名单 | `progress/step1/` |
  | 2 提示词 / starter | `eb04998` | 常驻提示、页面类型提示、兜底示例、design-lint 换 daisyUI 写法；⑧ 6 个模板重做（`pattern-starters.ts`） | `progress/step2/` |
  | 3 库默认主题 | `cb8c4ef` | **Tailwind 4 按页编译**（`src/themes/tailwind-jit.ts`，见下）；**OIU 文件已删**（→ `host-kit.ts` / `host-polish.ts` / `shared/trip-animator.ts`）；①② Chart.js / ECharts 精修；③ AG Grid；④ 脑图 = ECharts 树图；⑤ 3D `look` 预设 clay（默认）/ toon / data / studio；⑨ Mermaid 灰阶 + `flowchart LR` + `:::focal/:::muted/:::ext`；Leaflet / d3 / GSAP 默认值；动效配方 | `progress/step3/` |
  | 4 插件界面 ⑪⑫ + 999px | `3bba461` | 工具栏图标 + ⋯ 菜单分组；外观弹层；修改失败卡改黄色提示；骨架屏「已接收 X KB」；ToastCard（撤销）；模板中心（缩略图、「我的」）；删成就 / 目录死入口；设置页行列表 / 单预览 / 连通性小表 / 保存条；容器圆角改 `--radius-box` | `progress/step4/` |
  | 5 设计检查 | `c0b24e7` | G15 对比度改按**渲染后计算颜色**：canvas 归一化 oklch/oklab、半透明背景逐层合成、`elementsFromPoint` 取真实底色（图片 / 渐变上跳过）、点击后复检（JS 切换的选中态）；< 3:1 且页面是本次会话里流式生成的 → 自动发一条 `[iui-autofix]` 请求只改颜色的 iui-patch（`src/client/auto-fix.ts`；「自动修复」开关控制；每个页面 lineage 只一次，持久化防循环） | `progress/step5/` |
  | 6 视觉回归 | `37ee29c` `96e18dd` `86c13ad` `53c606d` `c6c4708` `e06af30` `4739e23` | CI 修绿；**真实 dsh 视觉回归** `pnpm run test:dsh-visual`（`scripts/dsh-visual.mts`，24 项 × 浅 688 / 深 688 / 390 = 72 张，像素差 + `scoreSrcdoc` 打分，CI 任务 `dsh-visual` 带 `--gate`，基线 `scripts/golden/dsh-visual/` 由 CI 生成）；真实 dsh 里发现并修了 7 处（见下）；CI run 39932541465 两个 job 全绿（门禁已生效） | `progress/step6/` |

- 第 1–5 步用户都已确认；第 6 步**待用户确认**。之后是第 7 步（抽 20 个旧会话核对、更新说明）。

### 第 6 步实现要点（接手必读）

- **CI 修绿**（`37ee29c`）：调研记录里的 3 类失败——评分基线过期（重新生成 `visual-baseline.json`）、ECharts 断言改为跟随主题墨色、帧内自检改为等入场动画结束再取色（CI 的「主色没上」是动画首帧误报，starter 本身无需改色）。
- **真实 dsh 回归**（`86c13ad`）：`@deepseek-ai/dsh@0.2.1-rc.2` 可直接 npm 安装（固定版本）。脚本用临时 `DSH_HOME`，`dsh plugin --profile web add link:<repo>` 装插件（装的是 `lib/` 构建产物，改 src 后要先 `pnpm run build`），覆盖写 `profiles/web/cordis.patch.yml` 关掉首启弹窗；`DEEPSEEK_API_KEY` 用假 key 只为列出模型、**不调用模型**；会话通过写入存储回放（`seed.mts`），所以截图里的内容是固定 fixture（`fixtures.mts`）。视口 1280×2400 / 390×2400。
  - 本地：`DSH_BIN=… CHROMIUM_PATH=… PLAYWRIGHT_PATH=… npx tsx scripts/dsh-visual.mts [--only a,b] [--gate] [--update-baseline]`，全量约 10–12 分钟；报告 `.e2e-artifacts/dsh-visual/report.md`。
  - **基线只能用 CI 产物更新**：去掉 `--gate` 跑一次（或看失败 run 的 artifact `dsh-visual`），下载 `shots/*.png` 覆盖 `scripts/golden/dsh-visual/`。容差默认 0.5%，行程页（地图）3%，3D 4%。
  - `scripts/e2e-visual.mts` 已改为转发到 `dsh-visual.mts`（旧 `dsh-ui` 注入方式作废）；无宿主 harness / `test:browser` / `visual-score` 降为辅助。
- **真实 dsh 里发现并修复**（`96e18dd`）：① 减弱动效 `transition-duration` 0.01ms→0s（脑图在 reduce 下布局炸开）；② 屏幕外 iframe 高度卡在最大值（rAF 暂停时 120ms 兜底 + 观察 body 顶层子元素），390 下行程页曾 2400px 高；③ 3D 热点编号深色白底白字；④ 旧围栏提示 / CHIP 深色白底；⑤ 设置页保存栏常驻 sticky 盖住表单 → 只在有改动时 sticky；⑥ 设置页预览 390 下一字一行 → `min-width:320px` + 横向滚动。⑦（`4739e23`，开门禁后 CI 发现）行程页 390 框架高度偶发仍卡在 2483px：Tailwind 样式写进 `<head>` 不触发 body 的 MutationObserver、屏幕外 iframe 的 ResizeObserver 也可能不回调 → 样式到达后主动重测，并在 load / 样式到达后 0–4s 内有限次重测。`e06af30` 修了 `--gate` 像素差在 CI 报 `__name is not defined`。
- **已知 / 未覆盖**：390 下 3D 热点标签互相重叠（未修）；旧 GenUI 目录组件（含 PlotBlock）已移除，只回归「目录组件卡已移除」提示；普通 ```mermaid 由宿主显示为代码块（IUI 只在 iui-html 内渲染 Mermaid）；390 下 dsh 自身折叠侧栏、设置弹窗保留左侧导航（宿主行为）；深色 KaTeX 偏暗在真实 dsh 里不复现。没有覆盖真实模型流式输出（回放会话）。

- 之前的 36 个 hotfix 提交（F1–F28、G1–G16、Batch C–F、R5 等）都在这个分支上，详见 `IUI-修复方案.zh-CN.md`。

### 第 3 步留下的实现要点（接手必读）

- **Tailwind 按页编译**：`tailwindcss@4.3.3`（devDependency，被 tsdown 打进 `lib/client.js` / `lib/index.js`，client.js 约 +250 kB）。`__unstable__loadDesignSystem` 在微任务内就绪；`buildTailwindCss(源码)` 只生成用到的类，输出 `@layer utilities{…}`。主题：Tailwind 默认主题内联（无 `:root` 变量）+ daisyUI 语义色 / 圆角 / 字体；断点 sm 30 / md 40 / lg 56 / xl 72 / 2xl 90 rem；`dark:` = prefers-color-scheme + `data-theme=iui-dark|dim`。主题 CSS 由 `scripts/gen-tailwind-theme.mjs` 生成 `tailwind-theme.generated.ts`。
- srcdoc 里 `<style id="iui-tw-static">`（切 html/css/js 文本得到的类，位于作者 CSS 之前）；iframe 内 MutationObserver 收集新 class → `postMessage({source:'iui-tailwind',type:'need'})` → 宿主 `installTailwindHost()` 编译回 `<style id="iui-tw">`。`IUI_UTILITIES_CSS` 里已有的类（`border`、`bg-base-*`、`text-base-content/NN` 等）和 daisyUI 的 `collapse/table/filter` 不再生成。
- design-lint：`tailwind-utility` 规则已删，改为 `tailwind-hex`（只拦 `text-[#333]` 这类写死颜色）。
- 库补丁注意：AG Grid UMD 命名空间只读，`createGrid` 包装是 `Object.create(agGrid)` 后替换 `window.agGrid`；AG Grid / Mermaid 在脚本 `load` 事件**捕获阶段**打补丁（作者 JS 由轮询 `data-iui-done` 触发，晚于捕获阶段）。
- 截图脚本：第 4–5 步用的无宿主 harness 已放进 `docs/handoff/demo/harness/`（用法见其 README）。第 1–3 步用的是原 agent 机器上的 `shot-specs.mts`（按 spec 生成 srcdoc → Playwright 截浅色 688 / 深色 688 / 浅色 390）+ `compose.py`（改前 / 改后拼图）。改前用 `git worktree` 检出上一步提交，同脚本输出。

## 2. 文件说明

| 路径 | 内容 |
|---|---|
| `IUI-修复方案.zh-CN.md` | 完整方案（Phase 0–3、G1–G16、CDN、R5、R6 暂缓、**视觉方案定稿**、**第 3 轮**）。最后两节是本次重做的依据 |
| `sheets/01–12-*.jpg` | 对比图。每格左「现状」右「推荐」，带说明 |
| `demo/site/` | 演示页（daisyUI 5 + Tailwind 4 browser）。`common.css` 里是 **IUI 中性主题（iui / iui-dark）的 token 定义**，实现时以它为准 |
| `demo/site/r2/*.html` | 第 2、3 轮演示页：`forms/info/media/data/itinerary/weather/pricing/hotels/rooms/kanban/states/mobile/mermaid/gchart/interact/dev` + `chrome-page/chrome-chat/chrome-settings`（第 3 轮）。`?theme=iui|iui-dark|corporate|dim`、`?w=宽度` |
| `demo/shoot.mjs` / `compose.py` / `sheets*.json` | 截图与拼图脚本 |
| `demo/chrome/` | 在真实 dsh web 里截插件界面的脚本（`launch.sh` 起 dsh，`drv.mjs <step>.mjs` 跑步骤） |
| `progress/step1–5/` | 已完成各步的改前 / 改后对比图（浅色 688、深色 688、390） |
| `demo/harness/` | 无宿主截图 harness（Vite 打包真实组件 + Playwright 截浅/深/390 + 拼图），第 4–5 步对比图都用它，见其 README |
| `demo/vis.mts` | 旧 `scripts/e2e-visual.mts` 的草稿副本（已被 `scripts/dsh-visual.mts` 取代） |

演示页运行方法见 `demo/README.md`。

## 3. 已确认的决定

1. **主题**：默认 daisyUI「IUI 中性」（`iui` / `iui-dark`），内置可切换 `corporate`、`dim`；**移除旧 OIU 主题**（`src/themes/oiu-design-system.ts`、`oiu-polish.ts` 及沙箱里的 `buildOiuDesignSystemCss()` 注入，`src/shared/html-sandbox.ts` ~4664 行）。
2. **图表** ECharts 精修（① ②）；**表格** AG Grid 精修（③）；**脑图** ECharts 树图（④）；**3D** 默认陶土 Clay，保留 Toon、Data（⑤）；**动效** = 动效规范 + Motion/Flip 配方；**字体** Inter（离线），**HDRI** 离线内置。
3. 第 2 轮 ⑥–⑩ **全部按推荐**：表单/交互、内容/数据/媒体、6 个页面模板（行程浅灰底图 + 墨色编号路线、天气温度区间条、定价推荐档反色、酒店评分标签、会议室「现在」线、看板状态点/进度/头像）、图形（横向流程图、Mermaid 灰阶主题）、暗色 / 手机 390 / 加载-空-出错-降级状态。
4. 第 3 轮 ⑪ ⑫ 插件界面 / 设置页、999px 修复：**已确认，按推荐做**（见第 4 节）。

## 4. 第 4 步要做的（已确认）

- **第 3 轮 ⑪ ⑫**（详见方案文档「第 3 轮」和 `sheets/11-plugin-chrome.jpg`、`sheets/12-settings.jpg`，参考实现 `demo/site/r2/chrome-*.html`）：
  - 工具栏：全屏 / ⋯ 改图标按钮；更多菜单分组（外观… · 重新加载 /「导出与分享」分享 HTML、下载离线版、保存为图片、复制源码 / 保存为模板 / 反馈一行「这页怎么样?」👍👎 不折行），菜单项带图标（可用 `src/shared/icon-sprite.ts` 的 Lucide 路径）。代码：`src/client/html-fence.tsx` ~1380–1630 行，样式是内联 `CSSProperties`（`TOOLBAR_BTN`、`MENU_ITEM`、`MENU_STYLE`）。
  - 外观弹层（`appearance-panel.tsx`）：分段控件、标「仅此页」、强调色 7 个 + 自定义、底部「重置」+「设为我的默认风格」。
  - 修改失败卡：红色「错误」→ 黄色提示 + 人话（「已保留修改前的版本」），原始报错收进「技术细节」折叠；宽度对齐消息列（`html-fence.tsx` ~1986 行附近 iui-patch 相关）。
  - 统一状态：生成中骨架屏（带已接收字节，`sandbox-skeleton.tsx`）；toast 统一（成就、「已保存为模板」+ 撤销；`achievement-toast.tsx`、`tip-toast.tsx`）。
  - 模板抽屉（`TemplateDrawer.tsx`）：标题「GenUI 面板」→「模板」，加「我的」分类，卡片带缩略预览。
  - 删除 `panel.tsx` 里「成就」「目录面板」两个死入口（成就只保留 toast）；不要删成就数据本身。
  - 设置 → IUI（`src/client/settings/*`）：单份预览 + 浅/深切换（修 12,48 截断、平均时长折行、底部按钮被裁）；各项改行列表；连通性改三列小表；按钮不折行；底部「N 项改动未保存」条。
  - 插件界面在沙箱外，跟随 **dsh 宿主 token**（`--dsw-alias-*`、`--dsl-g-*`），深色宿主自动适配；不要把 daisyUI 注入宿主页面。
- **999px bug**：`src/themes/iui-default.ts:20` `'--dsl-g-radius-control': '999px'` 被表格外框、视频等容器使用 → 变成椭圆。修法：控件（按钮/输入）保留胶囊，容器改用 `--radius-box`。注意：daisyUI 主题里的 `--radius-field: 999px` 是**有意的**（只作用于控件），不是这个 bug。
- 截图：插件界面需要真实 dsh（`demo/chrome/launch.sh` + `drv.mjs`）或自建 harness（Vite / tsdown 打包组件 + standalone primitive adapter `src/client/standalone/primitive-adapter.tsx` + Playwright）。
- 不改：`src/client/mermaid-core.ts`（聊天内 Mermaid，跟随 dsh 宿主 token，已决定不动）。

## 5. 现状里发现的问题（第 3 轮截图证据）

- 旧 `iui` / `dsh-ui` JSON GenUI 围栏已废弃（F16），默认关闭（`legacyFences`，`src/client/dom-fence.tsx` ~1010 行）。主路径是 `iui-html` 沙箱；GenUI 只剩模板抽屉、设置预览等插件自用。
- `/panel` 打开的面板（`panel.tsx`）：标题「GenUI 面板」；「成就」「目录面板」只显示「已移除…请改用 iui-html」，是死入口。
- 修改失败卡把 `---find text not found: "L.tileLayer(...` 原样给用户，红色「错误」，比消息列宽。
- 更多菜单「这页怎么样?」折行；按钮无图标、无分组。
- 设置预览：「12,48」截断（应为 12,480）、「平均时长」「4m 12s」折行、底部按钮被裁；「清除页面存储」「导出 JSON」按钮折行；浅/深两份预览叠放很高。
- 模型自己写的样式：东京行程「第 1 天」选中态橙字橙底（design-lint 抓不到 JS 切换的状态）。

## 6. 实施顺序（已全部确认）

（1–5 已完成并经用户确认，见第 1 节；从 6 开始，调研记录见第 1 节）

1. **主题底座**：把 `common.css` 的 iui / iui-dark token 落到 `src/themes/`，沙箱注入 daisyUI + 主题；保留 `corporate`、`dim`；删 OIU；`page-accent.ts` 只改 primary 一组；`custom-tokens.ts` 只开放白名单 token。
2. **同步提示词**：`src/shared/oiu-pattern-starters.ts`（现为 `pattern-starters.ts`）、常驻提示、`design-lint.ts` 的 `designLintNote()`（仍写着 `--color-text-*`、`.iui-stat`）全部换成 daisyUI 写法；starter 按 ⑧ 的 6 个模板重做。
3. **库默认主题**：`vendor-registry.ts` 里 chart.js / d3 / leaflet / gsap 启动时注入跟随主题的默认值；ECharts / AG Grid / Mermaid / 3D 按 ①–⑤、⑨。
4. **插件界面**：按 ⑪ ⑫（`html-fence.tsx` 工具栏、`appearance-panel.tsx`、`next-steps-ui.tsx`、修改失败卡、`TemplateDrawer.tsx`、`achievement-toast.tsx`、`panel.tsx`、`src/client/settings/*`）。
5. **设计检查**：渲染后按计算颜色查对比度（G15）；< 3:1 走一次 iui-patch 自动修（可在「自动修复」里关）。
6. **视觉回归**：`scripts/e2e-visual.mts` 改为注入 `iui-html`（现在注入 `dsh-ui` 会失败），另留一组 `legacyFences` 用例；覆盖 iui-html 模板页/状态页、iui-patch、svg、PlotBlock、KaTeX、Mermaid、ECharts、AG Grid、脑图、3D、插件界面、导出（离线 HTML、保存为图片、standalone-theme）；每项浅/深/390 三张 + `visual-score.mts`，超阈值 CI 失败。
7. **上线前**：抽 20 个旧会话截图核对（旧对话客户端重渲染会自动换主题）；更新说明写明已下载的离线 HTML / 图片不会变。

## 7. 开发环境备忘

- 包管理 pnpm；在仓库根目录：`npx tsc --noEmit -p .`、`npx vitest run`、`npx tsx scripts/…`。
- 真实 dsh 验证：`demo/chrome/launch.sh`（`DSH_HOME`、profile `wchrome`、`plugin add link:<仓库路径>`、`--port 3099`），日志里 `dsh web: http…` 是带 token 的地址；`drv.mjs` 用 Playwright 打开并执行步骤脚本。路径是原沙箱里的，换机器需改。
- 常用选择器：沙箱 `[data-iui-html-sandbox]`，围栏 `.genui-dom-fence`，输入框 `[data-composer-input]`；设置在左下「更多」→「设置」→「IUI」。
- 全量 `npx vitest run` 约 3 分钟（151 个文件 / 1418 个测试，`c0b24e7` 全绿），建议后台跑：`(npx vitest run > log 2>&1; echo EXIT=$? >> log) &`。
- 第 5 步实现要点：自检逻辑在 `src/shared/html-sandbox.ts` 帧内脚本（`__iuiOver` / `__iuiComposite` / `__iuiBackdrop`，抽样 600，点击后最多复检 6 次、只在结果变化时上报）；`lowContrast` 带 `minRatio` + `samples{text,sel,ratio,fg,bg}`；自动修复在 `src/client/auto-fix.ts`（localStorage `iui.autofix.contrast.v1` 防重复，只对本会话流式生成的页面生效）；测试 `tests/visual-5-contrast.spec.tsx`。
- 推送需要 token（原 agent 用 `http.extraHeader` 带 Basic 认证），提交作者沿用 `git log -1` 的作者。
- 用户偏好：简体中文、简洁、先给结论；每步做完出「改前 / 改后」对比图（浅色 688、深色 688、390 宽）给用户确认后再继续。
