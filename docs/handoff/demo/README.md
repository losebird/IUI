# 演示页运行方法

```bash
cd docs/handoff/demo
npm i                       # daisyui、@tailwindcss/browser、echarts、ag-grid、mermaid、three、motion 等
ln -s ../node_modules site/nm
# 部分页面（3D、ECharts 主题对照）引用 site/iui：
ln -s ../../../../lib/assets site/iui   # 仓库构建产物 lib/assets；不需要这几页可跳过
python3 -m http.server 8765 --directory site
# 浏览器打开 http://localhost:8765/r2/chrome-chat.html?theme=iui-dark&w=860
```

截图：`node shoot.mjs '[["r2/forms.html?w=688","r2/new-forms",720]]'` → `out/r2/new-forms.png`（需改脚本里的 playwright / chromium 路径）。
拼图：`python3 compose.py sheets3.json`（tiles 路径相对 `out/`；字体路径为 Noto Sans SC）。
