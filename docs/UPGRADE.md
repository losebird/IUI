# IUI 升级

## 本机 file: 依赖

```bash
cd /path/to/IUI
git pull   # 或同步你的工作树
pnpm install
pnpm run build

# 重启 dsh web（会换 token）
# 浏览器硬刷新；旧标签页的 ?token= 会失效
```

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

将 profile 依赖指回上一版 `file:` 路径或 git tag，重建 `lib/`，重启 web。自定义模板 JSON 可事先从设置导出备份。
