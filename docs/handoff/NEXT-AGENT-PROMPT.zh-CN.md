你接手开源 dsh 插件 IUI（仓库 https://github.com/losebird/IUI，包名 @losebird/iui）的「视觉重做」。用简体中文回复，简洁，先说结论。

工作分支：hotfix/0.13.0-iui.27（不是 main）。开始前先执行：
git fetch origin && git checkout hotfix/0.13.0-iui.27
确认 docs/handoff/ 存在后再读文件。所有提交都推到这个分支，不要推 main。

先读，按顺序：
1. docs/handoff/HANDOFF.zh-CN.md（进度、第 3 步实现要点、第 4 步清单、实施顺序）
2. docs/handoff/IUI-修复方案.zh-CN.md 最后两节「视觉方案定稿」「第 3 轮」
3. docs/handoff/sheets/ 12 张对比图（左现状、右推荐），重点 11-plugin-chrome.jpg、12-settings.jpg
4. docs/handoff/demo/site/r2/chrome-page.html、chrome-chat.html、chrome-settings.html（⑪ ⑫ 参考实现）
5. docs/handoff/progress/step1–3/（已完成步骤的改前 / 改后图）

进度：HANDOFF 第 6 节第 1–3 步已完成并推送（cbd9a0d、eb04998、cb8c4ef）。3 轮方案和 999px 修复都已确认。
下一步：第 4 步插件界面（⑪ ⑫：工具栏 / 更多菜单、外观弹层、修改失败卡、骨架屏与 toast、模板抽屉、删成就 / 目录死入口、设置页）+ 999px 修复；然后第 5–7 步。

用 pnpm；改完跑 npx tsc --noEmit -p . 和 npx vitest run（全量）。

规则：
- 按 HANDOFF 第 6 节顺序实施，每步一个（或几个）提交。
- 每完成一步：截「改前 / 改后」对比图（浅色 688、深色 688、390 宽）给我看，我确认后再继续下一步；对比图同时放进 docs/handoff/progress/stepN/。
- 插件界面在沙箱外，跟随 dsh 宿主 token（--dsw-alias-*、--dsl-g-*），深色宿主自动适配；不要动 src/client/mermaid-core.ts。
- 不要删用户数据和已有的 hotfix 修复（例如地图默认彩色底图、灰阶只在 data-iui-map-style="mono"）；旧 GenUI 围栏只保留兼容，不再扩展。删成就面板入口时保留成就数据和 toast。
- 提交信息写清楚对应的图号和条目（例如 "visual(⑪): 工具栏图标 + 分组菜单"）。

第一步：读完上面的文件后，用 5–8 行告诉我你理解的现状和第 4 步打算怎么做（含截图方式），等我回复再开工。
