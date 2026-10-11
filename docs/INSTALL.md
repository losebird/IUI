# IUI 安装（`@losebird/iui`）

IUI 是 **DeepSeek Harness (dsh) 插件**，通过气泡内 `` ```iui-html `` 围栏渲染自由 HTML/CSS/JS 沙箱页（别名 `` ```iui `` / `` ```dsh-ui `` 仍可解析）。  
**没有 MCP 产品路径。**

[English README](../README.md) · [中文 README](../README.zh-CN.md)

## 前置

- PATH 上有 `dsh`（或 `npx @deepseek-ai/dsh` / 源码目录的 `pnpm dsh`）
- Node `^22.19 || >=24`，pnpm `>=11.7 <12`（仅开发克隆时需要）
- 可用的 web profile（常见名：`web`）

## 推荐：不必先 clone

日常安装用 GitHub 规格即可，`dsh` 会下载并装进 profile：

```bash
dsh plugin --profile <profile> add github:losebird/IUI
dsh web
```

把 `<profile>` 换成你实际用的。无全局 `dsh` 时：

```bash
npx @deepseek-ai/dsh plugin --profile <profile> add github:losebird/IUI
npx @deepseek-ai/dsh web
```

从 harness 源码检出：

```bash
pnpm dsh plugin --profile <profile> add github:losebird/IUI
```

本仓库已带 `lib/`，git 安装一般不跑构建脚本。不要用 `npm dsh`，也不要从家目录跑 `pnpm dsh`。

打开启动日志里的 **`?token=` URL**，硬刷新。控制台应出现：

```text
[iui] client active; fence-channel=registry|dom
```

设置侧栏应有 **IUI**。

## npm 包（组织就绪后）

```bash
dsh plugin --profile <profile> add @losebird/iui
```

当前阻塞：npm 上尚无 `@losebird` 组织（`npm publish` → *Scope not found*）。需在 npmjs.com 创建组织并把发包账号加进去；CLI 无法创建 org。在此之前请用上面的 GitHub 安装。

## 桌面端注意

Electron / AIO 桌面端常独占 profile：CLI `dsh plugin add` 可能被拒绝。请用**应用内插件管理器**，或拷贝真实目录进 `node_modules`（不要 `link:` / junction）。说明见 [dsh-our-free-model](https://github.com/Ebony-Vinyl/dsh-our-free-model) 安装节。

## 开发：本地路径

```bash
git clone https://github.com/losebird/IUI.git
cd IUI
pnpm install
pnpm run build
dsh plugin --profile <profile> add .
# 或：
# bash scripts/sync-to-dsh-profile.sh . /path/to/profile/node_modules/@losebird/iui
```

## 验证

1. 新会话，选可用模型（试点推荐 Muse Spark 1.3 via `dsh-our-free-model`）。
2. 发送需要「像页面」的问句，例如：`做一个加州海岸三日行程页，带地图和景点横滑卡`。
3. 助手正文应出现闭合的 `` ```iui-html ``，并在气泡内挂成 **iframe 沙箱**（非纯 Markdown / 原文 JSON）。
4. 设置 → IUI 可调主题 / 格式裁判 / 模板等。

## 常见失败

| 现象 | 处理 |
|------|------|
| 无 `[iui] client active` | 确认 `dsh plugin add` 已写入该 profile；重启 web + 硬刷新 |
| CLI 无法写入 desktop profile | 改用桌面端插件管理器 / 真实目录安装 |
| 设置无 IUI | 确认包自带 `cordis.patch.yml` 的 insert 已生效，且 client inject 含 settings |
| 只有 Markdown | 开格式裁判；换更强模型；看是否被 bash/搜网抢答 |
| token 换了旧页挂住 | 重启 web 会换 `?token=`，只用新链接 |
| 围栏被抢 | 不要同时装另一个也注册同一围栏语言的插件 |

验收清单见 [ACCEPTANCE.md](./ACCEPTANCE.md)。npm 发版见 [PUBLISH.md](./PUBLISH.md)。
