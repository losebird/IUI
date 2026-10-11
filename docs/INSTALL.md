# IUI 安装（`@losebird/iui`）

IUI 是 **DeepSeek Harness (dsh) 插件**，通过气泡内 ` ```iui ` 围栏渲染交互 UI。  
**没有 MCP 产品路径。**

## 前置

- Node `^22.19 || >=24`，pnpm `>=11.7 <12`
- 已安装可用的 `dsh`（web profile）
- 本仓库已 `pnpm install && pnpm run build`（产出 `lib/`）

## 本机 link（开发推荐）

在 dsh web profile 中声明本地路径依赖并启用插件：

```bash
cd /path/to/dsh-genui-fork
pnpm install
pnpm run build

# 示例：profile 的 package.json 依赖
# "@losebird/iui": "file:/path/to/dsh-genui-fork"

dsh plugin --profile web add @losebird/iui   # 若宿主支持
# 或直接编辑 profile 依赖 + cordis 插件列表后：
dsh --profile web --host 127.0.0.1 --port 3080
```

硬刷新浏览器。控制台应出现：

```text
[iui] client active; fence-channel=registry|dom
```

设置侧栏应有 **IUI**（主题包 / 模板 / 格式裁判）。

## 验证

1. 新会话，选可用模型（推荐较强指令遵循模型）。
2. 发送：`告诉我这台电脑现在的资源使用情况`
3. 助手正文应出现 ` ```iui ` 围栏并在气泡内渲染（非纯 Markdown 列表）。
4. 设置 → IUI → 保存模板 → **插入输入框**，应写入 composer（失败则退化为剪贴板）。

## 常见失败

| 现象 | 处理 |
|------|------|
| 无 `[iui] client active` | 检查 profile 依赖键是否为 `@losebird/iui`，重启 web + 硬刷新 |
| 设置无 IUI | 确认 `cordis.patch.yml` 含 `insert`，且 client inject 含 settings |
| 只有 Markdown | 开格式裁判；换更强模型；看是否被 bash/搜网抢答 |
| token 换了旧页挂住 | 重启 web 会换 `?token=`，只用新链接 |

## 与 GenUI 上游

本包 fork 自 `omdsh-dev/dsh-genui`（MIT），挂载层同源；皮肤 / 裁判 / 沙箱 / 设置为 IUI 自有。不要再装 `@changfenhuang/dsh-genui` 与 IUI 双开抢围栏。

验收清单见 [ACCEPTANCE.md](./ACCEPTANCE.md)。npm 发版见 [PUBLISH.md](./PUBLISH.md)。
