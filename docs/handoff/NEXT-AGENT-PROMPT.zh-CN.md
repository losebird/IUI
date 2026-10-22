你接手开源 dsh 插件 IUI（仓库 https://github.com/losebird/IUI，包名 @losebird/iui）的「视觉重做」。用简体中文回复，简洁，先说结论。

先读，按顺序：
1. docs/handoff/HANDOFF.zh-CN.md（现状、已确认决定、待确认事项、实施顺序）
2. docs/handoff/IUI-修复方案.zh-CN.md 最后两节「视觉方案定稿」「第 3 轮」
3. docs/handoff/sheets/ 里 12 张对比图（左现状、右推荐）
4. docs/handoff/demo/site/common.css（IUI 中性主题 token）和 demo/site/r2/*.html（推荐方案的参考实现）

工作分支：hotfix/0.13.0-iui.27（不是 main）。开始前先执行：
git fetch origin && git checkout hotfix/0.13.0-iui.27
确认 docs/handoff/ 存在后再读文件。所有提交都推到这个分支，不要推 main。

用 pnpm；改完跑 npx tsc --noEmit -p . 和 npx vitest run。

规则：
- 第 1、2 轮（图 ①–⑩）已确认，可以按 HANDOFF 第 6 节的顺序实施。
- 第 3 轮（图 ⑪ ⑫：插件界面、设置页）和 999px bug 修复还没确认：先问我，我点头前不要改这部分代码。
- 每完成一步：截「改前 / 改后」对比图（浅色、深色、390 宽）给我看，再继续下一步。
- 不要删用户数据和已有的 hotfix 修复；旧 GenUI 围栏只保留兼容，不再扩展。
- 提交信息写清楚对应的图号和条目（例如 "visual(①): ECharts 主题"）。

第一步：读完上面的文件后，用 5–8 行告诉我你理解的现状和你打算先做什么，然后问我第 3 轮和 999px 是否确认。
