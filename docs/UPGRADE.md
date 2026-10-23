# IUI 升级

## GitHub Release tarball（推荐）

别人和本机「只想用新版、不改源码」都走这条。先卸掉旧的 git / `link:` 规格，再装最新 tarball：

```bash
dsh plugin --profile <profile> remove @losebird/iui
dsh plugin --profile <profile> add https://github.com/losebird/IUI/releases/latest/download/losebird-iui.tgz
```

然后重启 `dsh web`，硬刷新带 `?token=` 的页面。不要再用 `github:losebird/IUI` 升级——那会 clone 整仓并现场 `prepack`，进度常停在 `downloaded 0`。

钉某一版时用该 Release 下的 `losebird-iui-<version>.tgz`，不要用 `latest`。

## 本机 file: 依赖

```bash
cd /path/to/IUI
git pull   # 或同步你的工作树
pnpm install
pnpm run build

# 重启 dsh web（会换 token）
# 浏览器硬刷新；旧标签页的 ?token= 会失效
```

## 视觉重做（0.13.0-iui.27）

- **旧会话会自动换新主题**：页面在客户端重新渲染，打开旧对话就会用新的「IUI 中性」主题（浅 / 深跟随 dsh）。已抽 20 个改版前的会话在真实 dsh 里核对，全部能正常显示。
- **已下载的离线 HTML、已保存的图片不会变**：它们是当时导出的文件，样式已内联，不受升级影响；想要新样式就重新打开对话再导出一次。
- 你可能会注意到的变化：
  - 旧 3D 页面的模型从蓝色变为默认的陶土色（clay）；
  - 旧 Mermaid 脑图改为灰阶样式，显示更清楚；新脑图用 ECharts 树图；
  - 旧页面里写死浅色背景的地方，在深色模式下可能出现「发现 N 处排版问题 · 一键优化」提示（只填入修改请求，不会自动发送，可点 × 关闭）；
  - 旧 GenUI 目录组件卡已移除，显示为「目录组件卡已移除」提示。
- 自定义 token（`customTokensJson`）只应用白名单（主色、圆角、密度、字号）；其他名字（包括旧的底色 / 文字色）会被忽略，并在设置里标黄列出。

## 配置迁移

- `themeId` / `componentPackId`：未知 id 会回落到默认 `shadcn`
- `userTemplatesJson`：校验失败的条目会被丢弃并在设置里提示错误，不会抹掉整份配置
- `fenceFeedback` / `formatReferee`：布尔开关；升级后默认保持开启

## 破坏性变更（IUI 线）

- 产品路径 **不做 MCP**；旧 `intelligent-ui-mcp` / `dsh-intelligent-ui` 不应再与 IUI 同开
- 围栏主语言：`iui`（兼容 `dsh-ui`）；开放沙箱：`iui-html`
- 默认主题：`iui-default`（沙箱中性主题）

## 升级后自检

1. 控制台 `[iui] client active`
2. 设置 → IUI 可打开并保存
3. 资源 / 天气 / 表单 自然句能出围栏
4. `pnpm test` 中与 fence / sandbox / referee 相关用例通过

## 回滚

- **tarball：** `dsh plugin --profile <profile> remove @losebird/iui`，再 `add` 上一版 Release 里的 `losebird-iui-<version>.tgz`，重启 web。
- **本机 file:：** 将 profile 依赖指回上一版路径或 git tag，重建 `lib/`，重启 web。

自定义模板 JSON 可事先从设置导出备份。
