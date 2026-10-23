# IUI 安装（`@losebird/iui`）

IUI 是 **DeepSeek Harness (dsh) 插件**，通过气泡内 `` ```iui-html `` 围栏渲染自由 HTML/CSS/JS 沙箱页（别名 `` ```iui `` / `` ```dsh-ui `` 仍可解析）。  
**没有 MCP 产品路径。**

[English README](../README.md) · [中文 README](../README.zh-CN.md)

## 前置

- PATH 上有 `dsh`（或 `npx @deepseek-ai/dsh` / 源码目录的 `pnpm dsh`）
- Node `^22.19 || >=24`
- 可用的 web profile（常见名：`web`）
- 开发克隆才需要 pnpm `>=11.7 <12`

## 推荐：GitHub Release tarball（不必 clone）

日常安装用 **已经 build 好的包**。`dsh` 会下载 `losebird-iui.tgz` 并装进 profile，里面带 `lib/index.js`，不会在安装时再编译。

最新包（随 Release 更新）：

```bash
dsh plugin --profile <profile> add https://github.com/losebird/IUI/releases/latest/download/losebird-iui.tgz
dsh web
```

把 `<profile>` 换成你实际用的。无全局 `dsh` 时：

```bash
npx @deepseek-ai/dsh plugin --profile <profile> add https://github.com/losebird/IUI/releases/latest/download/losebird-iui.tgz
npx @deepseek-ai/dsh web
```

从 harness 源码检出：

```bash
pnpm dsh plugin --profile <profile> add https://github.com/losebird/IUI/releases/latest/download/losebird-iui.tgz
```

钉死某一版时，把 `latest/download/losebird-iui.tgz` 换成该 Release 里的版本文件，例如：

`https://github.com/losebird/IUI/releases/download/v0.13.0-iui.27/losebird-iui-0.13.0-iui.27.tgz`

Release 列表：[https://github.com/losebird/IUI/releases](https://github.com/losebird/IUI/releases)

不要用 `npm dsh`，也不要从家目录跑 `pnpm dsh`。

打开启动日志里的 **`?token=` URL**，硬刷新。控制台应出现：

```text
[iui] client active; fence-channel=registry|dom
```

设置侧栏应有 **IUI**。

### 不要用 `github:losebird/IUI`

`github:losebird/IUI` 会 clone **整仓源码**（含 handoff 截图、demo 视频等），且 `lib/` 不在 git 里，pnpm 还要跑 `prepack` 现场编译（九十多个构建依赖）。进度条会长时间停在：

```text
Progress: resolved 1, reused 0, downloaded 0, added 0
```

这不是死机，但对外安装不该走这条路。已经这样装过的，先卸再改用 tarball：

```bash
dsh plugin --profile <profile> remove @losebird/iui
dsh plugin --profile <profile> add https://github.com/losebird/IUI/releases/latest/download/losebird-iui.tgz
```

## npm 包（组织就绪后）

```bash
dsh plugin --profile <profile> add @losebird/iui
```

当前阻塞：npm 上尚无 `@losebird` 组织（`npm publish` → *Scope not found*）。需在 npmjs.com 创建组织并把发包账号加进去；CLI 无法创建 org。在此之前请用上面的 Release tarball。

## 桌面端注意

Electron / AIO 桌面端常独占 profile：CLI `dsh plugin add` 可能被拒绝。请用**应用内插件管理器**贴上同一个 `.tgz` URL，或拷贝真实目录进 `node_modules`（不要 `link:` / junction）。说明见 [dsh-our-free-model](https://github.com/Ebony-Vinyl/dsh-our-free-model) 安装节。

## 开发：本地路径

改插件源码时才 clone。`lib/` 是构建产物，**不在 git 里**，启用前必须先 build：

```bash
git clone https://github.com/losebird/IUI.git
cd IUI
pnpm install
pnpm run build
dsh plugin --profile <profile> add .
# 或：
# bash scripts/sync-to-dsh-profile.sh . /path/to/profile/node_modules/@losebird/iui
```

维护者如何打 tarball、挂 Release：见 [PUBLISH.md](./PUBLISH.md)。

## 验证

1. 新会话，选可用模型（试点推荐 Muse Spark 1.3 via `dsh-our-free-model`）。
2. 发送需要「像页面」的问句，例如：`做一个加州海岸三日行程页，带地图和景点横滑卡`。
3. 助手正文应出现闭合的 `` ```iui-html ``，并在气泡内挂成 **iframe 沙箱**（非纯 Markdown / 原文 JSON）。
4. 设置 → IUI 可调主题 / 格式裁判 / 模板等。

## 常见失败

| 现象 | 处理 |
|------|------|
| 进度停在 `resolved 1, downloaded 0` | 用了 `github:losebird/IUI`。改用上面的 Release tarball；不要立刻 Ctrl+C 再重试 git 规格 |
| tarball 404 | 还没有 Release，或 URL 写错。打开 [Releases](https://github.com/losebird/IUI/releases) 复制资源链接 |
| `启用失败 … failed to import` | 本地 `link:` / 源码路径安装时 `lib/` 被 gitignore，必须先 `pnpm install && pnpm run build` 再启用 |
| 无 `[iui] client active` | 确认 `dsh plugin add` 已写入该 profile；重启 web + 硬刷新 |
| CLI 无法写入 desktop profile | 改用桌面端插件管理器 / 真实目录安装 |
| 设置无 IUI | 确认包自带 `cordis.patch.yml` 的 insert 已生效，且 client inject 含 settings |
| 只有 Markdown | 开格式裁判；换更强模型；看是否被 bash/搜网抢答 |
| token 换了旧页挂住 | 重启 web 会换 `?token=`，只用新链接 |
| 围栏被抢 | 不要同时装另一个也注册同一围栏语言的插件 |

验收清单见 [ACCEPTANCE.md](./ACCEPTANCE.md)。发版见 [PUBLISH.md](./PUBLISH.md)。
