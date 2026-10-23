# 无宿主截图 harness（第 4–5 步「改前 / 改后」图用的就是它）

不需要 dsh：用 Vite 直接打包仓库里真实的 React 组件（`src/client/*`）+ 沙箱 srcdoc，Playwright 截图。

```bash
# 1. 复制到仓库根目录的 .tmp/（main.tsx 里的 import 是 ../../src/…，必须放在 <仓库>/.tmp/harness）
mkdir -p .tmp && cp -r docs/handoff/demo/harness .tmp/harness
# 2. 打包（约 1 分钟）
timeout 200 npx vite build --config .tmp/harness/vite.config.ts
# 3. 起静态服务（换一个没用过的端口）
cd .tmp/harness/dist && (nohup python3 -m http.server 8750 >/dev/null 2>&1 &) && cd -
# 4. 截图：浅色 688 / 深色 688 / 浅色 390，2x，全高
node .tmp/harness/shoot.mjs http://127.0.0.1:8750 /data/work/shots/after [场景,逗号分隔]
# 5. 拼图（SHOTS 目录下放 before/ 和 after/；改前图用 git worktree 检出上一步提交，同样流程截一遍）
SHOTS=/data/work/shots python3 .tmp/harness/compose.py out.jpg light-688 场景1 场景2
# 6. 收尾删除 .tmp/（不要提交）
```

- 场景（`index.html#场景[-dark][-dirty]`）：`chrome`（沙箱外壳 + 工具栏）、`states`（修改失败卡、骨架屏、toast）、`drawer`（模板抽屉）、`table`（旧 GenUI 表格 / 提示条）、`settings` / `settings-dirty`（设置页）、`contrast`（第 5 步对比度自动修复全过程）、`probe`（从 sessionStorage 读任意页面 spec）。
- `shoot.mjs` 里只配了 `contrast` 场景；要截别的场景，在 `scenes` / `hashOf` 里加（值是截图前要做的交互，例如点开 ⋯ 菜单）。
- `shoot.mjs` 的 playwright 路径 `/vercel/sandbox/node_modules/playwright/index.mjs`、chromium `/usr/local/bin/chromium` 是原 agent 机器的路径，换机器要改。
- `probe.mjs` + `starters.json`：把 24 个 starter 逐个塞进 `probe` 场景，读沙箱自检结果（第 5 步用来确认对比度检查零误报）。
- 深色：`-dark` 给 body 加 `data-ds-dark-theme`（模拟 dsh 深色宿主）。
