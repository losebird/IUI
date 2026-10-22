# IUI 视觉重做 · 交接文档

> 交接时间：2026-10 ｜ 分支：`hotfix/0.13.0-iui.27`（版本 `0.13.0-iui.27`）｜ 仓库：losebird/IUI
> 本目录：`docs/handoff/`

## 1. 现在在哪一步

- 视觉方案已经过 **3 轮对比图**讨论：第 1、2 轮用户已确认（全部按「推荐」）；第 3 轮（⑪ 插件界面、⑫ 设置页 + 主题管不到的部分）已出图，**等用户确认**。
- **仓库代码还没有为视觉重做改过一行**。本目录只是文档、对比图和演示页。
- `999px` bug 的修复也**等用户点头**后再动（见第 4 节）。
- 之前的 36 个 hotfix 提交（F1–F28、G1–G16、Batch C–F、R5 等）都在这个分支上，详见 `IUI-修复方案.zh-CN.md`。

## 2. 文件说明

| 路径 | 内容 |
|---|---|
| `IUI-修复方案.zh-CN.md` | 完整方案（Phase 0–3、G1–G16、CDN、R5、R6 暂缓、**视觉方案定稿**、**第 3 轮**）。最后两节是本次重做的依据 |
| `sheets/01–12-*.jpg` | 对比图。每格左「现状」右「推荐」，带说明 |
| `demo/site/` | 演示页（daisyUI 5 + Tailwind 4 browser）。`common.css` 里是 **IUI 中性主题（iui / iui-dark）的 token 定义**，实现时以它为准 |
| `demo/site/r2/*.html` | 第 2、3 轮演示页：`forms/info/media/data/itinerary/weather/pricing/hotels/rooms/kanban/states/mobile/mermaid/gchart/interact/dev` + `chrome-page/chrome-chat/chrome-settings`（第 3 轮）。`?theme=iui|iui-dark|corporate|dim`、`?w=宽度` |
| `demo/shoot.mjs` / `compose.py` / `sheets*.json` | 截图与拼图脚本 |
| `demo/chrome/` | 在真实 dsh web 里截插件界面的脚本（`launch.sh` 起 dsh，`drv.mjs <step>.mjs` 跑步骤） |
| `demo/vis.mts` | `scripts/e2e-visual.mts` 的草稿副本（注入方式需改，见 6.3） |

演示页运行方法见 `demo/README.md`。

## 3. 已确认的决定（第 1、2 轮）

1. **主题**：默认 daisyUI「IUI 中性」（`iui` / `iui-dark`），内置可切换 `corporate`、`dim`；**移除旧 OIU 主题**（`src/themes/oiu-design-system.ts`、`oiu-polish.ts` 及沙箱里的 `buildOiuDesignSystemCss()` 注入，`src/shared/html-sandbox.ts` ~4664 行）。
2. **图表** ECharts 精修（① ②）；**表格** AG Grid 精修（③）；**脑图** ECharts 树图（④）；**3D** 默认陶土 Clay，保留 Toon、Data（⑤）；**动效** = 动效规范 + Motion/Flip 配方；**字体** Inter（离线），**HDRI** 离线内置。
3. 第 2 轮 ⑥–⑩ **全部按推荐**：表单/交互、内容/数据/媒体、6 个页面模板（行程浅灰底图 + 墨色编号路线、天气温度区间条、定价推荐档反色、酒店评分标签、会议室「现在」线、看板状态点/进度/头像）、图形（横向流程图、Mermaid 灰阶主题）、暗色 / 手机 390 / 加载-空-出错-降级状态。

## 4. 待用户确认

- **第 3 轮 ⑪ ⑫**（详见方案文档「第 3 轮」）：图标工具栏 + 分组菜单、外观弹层分段控件、修改失败卡改黄色 + 人话 + 技术细节折叠、统一骨架屏/toast、模板抽屉改名「模板」+ 缩略图、**删除成就/目录两个死入口**、设置页单份预览 + 行列表 + 连通性小表。
- **999px bug**：`src/themes/iui-default.ts:20` `'--dsl-g-radius-control': '999px'` 被表格外框、视频等容器使用 → 变成椭圆。修法：控件（按钮/输入）保留胶囊，容器改用 `--radius-box`。注意：daisyUI 主题里的 `--radius-field: 999px` 是**有意的**（只作用于控件），不是这个 bug。

## 5. 现状里发现的问题（第 3 轮截图证据）

- 旧 `iui` / `dsh-ui` JSON GenUI 围栏已废弃（F16），默认关闭（`legacyFences`，`src/client/dom-fence.tsx` ~1010 行）。主路径是 `iui-html` 沙箱；GenUI 只剩模板抽屉、设置预览等插件自用。
- `/panel` 打开的面板（`panel.tsx`）：标题「GenUI 面板」；「成就」「目录面板」只显示「已移除…请改用 iui-html」，是死入口。
- 修改失败卡把 `---find text not found: "L.tileLayer(...` 原样给用户，红色「错误」，比消息列宽。
- 更多菜单「这页怎么样?」折行；按钮无图标、无分组。
- 设置预览：「12,48」截断（应为 12,480）、「平均时长」「4m 12s」折行、底部按钮被裁；「清除页面存储」「导出 JSON」按钮折行；浅/深两份预览叠放很高。
- 模型自己写的样式：东京行程「第 1 天」选中态橙字橙底（design-lint 抓不到 JS 切换的状态）。

## 6. 建议的实施顺序（用户确认后）

1. **主题底座**：把 `common.css` 的 iui / iui-dark token 落到 `src/themes/`，沙箱注入 daisyUI + 主题；保留 `corporate`、`dim`；删 OIU；`page-accent.ts` 只改 primary 一组；`custom-tokens.ts` 只开放白名单 token。
2. **同步提示词**：`src/shared/oiu-pattern-starters.ts`、常驻提示、`design-lint.ts` 的 `designLintNote()`（仍写着 `--color-text-*`、`.iui-stat`）全部换成 daisyUI 写法；starter 按 ⑧ 的 6 个模板重做。
3. **库默认主题**：`vendor-registry.ts` 里 chart.js / d3 / leaflet / gsap 启动时注入跟随主题的默认值；ECharts / AG Grid / Mermaid / 3D 按 ①–⑤、⑨。
4. **插件界面**：按 ⑪ ⑫（`html-fence.tsx` 工具栏、`appearance-panel.tsx`、`next-steps-ui.tsx`、修改失败卡、`TemplateDrawer.tsx`、`achievement-toast.tsx`、`panel.tsx`、`src/client/settings/*`）。
5. **设计检查**：渲染后按计算颜色查对比度（G15）；< 3:1 走一次 iui-patch 自动修（可在「自动修复」里关）。
6. **视觉回归**：`scripts/e2e-visual.mts` 改为注入 `iui-html`（现在注入 `dsh-ui` 会失败），另留一组 `legacyFences` 用例；覆盖 iui-html 模板页/状态页、iui-patch、svg、PlotBlock、KaTeX、Mermaid、ECharts、AG Grid、脑图、3D、插件界面、导出（离线 HTML、保存为图片、standalone-theme）；每项浅/深/390 三张 + `visual-score.mts`，超阈值 CI 失败。
7. **上线前**：抽 20 个旧会话截图核对（旧对话客户端重渲染会自动换主题）；更新说明写明已下载的离线 HTML / 图片不会变。

## 7. 开发环境备忘

- 包管理 pnpm；在仓库根目录：`npx tsc --noEmit -p .`、`npx vitest run`、`npx tsx scripts/…`。
- 真实 dsh 验证：`demo/chrome/launch.sh`（`DSH_HOME`、profile `wchrome`、`plugin add link:<仓库路径>`、`--port 3099`），日志里 `dsh web: http…` 是带 token 的地址；`drv.mjs` 用 Playwright 打开并执行步骤脚本。路径是原沙箱里的，换机器需改。
- 常用选择器：沙箱 `[data-iui-html-sandbox]`，围栏 `.genui-dom-fence`，输入框 `[data-composer-input]`；设置在左下「更多」→「设置」→「IUI」。
- 用户偏好：简体中文、简洁、先给结论；**改代码前先出对比图让用户确认**。
