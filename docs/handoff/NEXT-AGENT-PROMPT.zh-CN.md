你接手开源 dsh 插件 IUI（仓库 https://github.com/losebird/IUI，包名 @losebird/iui）的「视觉重做」。用简体中文回复，简洁，先说结论。

工作分支：hotfix/0.13.0-iui.27（不是 main）。开始前先执行：
git fetch origin && git checkout hotfix/0.13.0-iui.27
确认 docs/handoff/ 存在后再读文件。所有提交都推到这个分支，不要推 main。

先读，按顺序：
1. docs/handoff/HANDOFF.zh-CN.md（第 1 节进度表 +「第 6 步调研记录」、第 6 节实施顺序、第 7 节环境备忘）
2. docs/handoff/IUI-修复方案.zh-CN.md 最后两节「视觉方案定稿」「第 3 轮」（第 6 步视觉回归要求在约 911 行）
3. docs/handoff/demo/harness/README.md（无宿主截图 harness，第 4–5 步的对比图都用它出）
4. scripts/e2e-visual.mts、scripts/visual-score.mts、scripts/browser-e2e.mts、.github/workflows/ci.yml
5. docs/handoff/progress/step1–5/（已完成步骤的改前 / 改后图）

进度：HANDOFF 第 6 节第 1–5 步已完成、推送并经我确认（cbd9a0d、eb04998、cb8c4ef、3bba461、c0b24e7）。
下一步：第 6 步视觉回归，还没写代码。注意：CI 的 Browser regression（pnpm run test:browser）从第 1 步起一直失败（visual-score 基线过期、ECharts 主题断言过时、starter 自检对比度），第 6 步要先把它修绿，再加新的视觉回归。之后是第 7 步（上线前抽 20 个旧会话核对、更新说明）。

用 pnpm；改完跑 npx tsc --noEmit -p . 和 npx vitest run（全量，约 3 分钟）。本机如果没有 dsh 二进制，e2e-visual.mts 跑不了，要如实说明哪些是无宿主模拟、哪些在真实 dsh 里验证过。

规则：
- 按 HANDOFF 第 6 节顺序实施，每步一个（或几个）提交。
- 每完成一步：截「改前 / 改后」对比图（浅色 688、深色 688、390 宽）给我看，我确认后再继续下一步；对比图同时放进 docs/handoff/progress/stepN/，并更新 HANDOFF 第 1 节进度表。
- 视觉回归基线要在 CI 环境生成（字体 / chromium 版本差异），阈值判定在基线提交后再打开；超阈值时 CI 失败。
- 插件界面在沙箱外，跟随 dsh 宿主 token（--dsw-alias-*、--dsl-g-*）；不要动 src/client/mermaid-core.ts。
- 不要删用户数据和已有的 hotfix 修复；旧 GenUI 围栏（iui / dsh-ui）只保留兼容，不再扩展。
- 临时文件放 .tmp/，提交前删除。
- 提交信息写清楚对应的图号和条目（例如 "visual(⑥ 视觉回归): …"）。

第一步：读完上面的文件后，用 5–8 行告诉我你理解的现状和第 6 步打算怎么做（含 CI 修绿、基线生成方式、截图方式），等我回复再开工。
