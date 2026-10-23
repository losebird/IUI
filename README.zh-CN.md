# IUI

[English](./README.md) · **简体中文**

**IUI**（`@losebird/iui`）是 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（**dsh**）插件。当回答更适合做成页面时——图表、地图、行程、比价板、小工具——模型可以输出自由 HTML/CSS/JS，IUI 在聊天气泡内的隔离沙箱 iframe 中挂载。

---

## 示例

| 行程 | 天气 |
|---|---|
| ![行程页](./assets/examples/live-itinerary.jpg) | ![天气页](./assets/examples/live-weather.jpg) |

| 定价 | 住宿 |
|---|---|
| ![定价板](./assets/examples/live-pricing.jpg) | ![住宿卡](./assets/examples/live-hotels.jpg) |

| 番茄钟 | 看板 |
|---|---|
| ![番茄钟](./assets/examples/live-pomodoro.jpg) | ![看板](./assets/examples/live-kanban.jpg) |

| 房贷计算器 |
|---|
| ![房贷计算器](./assets/examples/live-mortgage.jpg) |

---

## 安装

需要 PATH 上有 `dsh`（或用 `npx @deepseek-ai/dsh`）、Node `^22.19 || >=24`，以及可用的 web profile。**不必先 clone。** 请装 [Releases](https://github.com/losebird/IUI/releases) 里打好的 **tarball**，不要用 `github:losebird/IUI`（那会 clone 整仓源码，进度条常停在 `downloaded 0`）。

```bash
dsh plugin --profile <profile> add https://github.com/losebird/IUI/releases/latest/download/losebird-iui.tgz
dsh web
```

把 `<profile>` 换成你实际用的（常见是 `web`）。没有全局 `dsh` 时：

```bash
npx @deepseek-ai/dsh plugin --profile <profile> add https://github.com/losebird/IUI/releases/latest/download/losebird-iui.tgz
npx @deepseek-ai/dsh web
```

打开启动日志里**带 `?token=` 的完整 URL**，硬刷新浏览器。控制台应出现：

```text
[iui] client active; fence-channel=registry|dom
```

设置侧栏应出现 **IUI**。

完整安装说明：[docs/INSTALL.md](./docs/INSTALL.md)

---

## 快速使用

1. 新开会话，选一只有指令遵循力的模型。
2. 问需要「像页面」的内容，例如：*「做一个加州海岸三日行程页，带地图和景点卡。」*
3. 模型闭合 `` ```iui-html `` 围栏后，IUI 会在气泡里挂出可交互页面——而不是残留代码块。

普通文字回答仍是文字；只有围栏会变成页面。

### 围栏

```iui-html
{
  "title": "加州海岸三日行程",
  "height": 560,
  "css": "/* 本页样式 */",
  "html": "<div>…</div>",
  "js": "/* html 就绪后执行 */"
}
```

写作说明：[SKILL.md](./SKILL.md)

### 隐私

- 页面运行在沙箱 iframe 中（访问不到 dsh、你的文件或 Cookie）；页面脚本只能访问白名单里的 CDN、地图瓦片和图床。
- 可选的 **Jev 格式路由**（设置 → IUI → 格式路由）**默认关闭**。开启并填写 TypeSafe Key 后，每条用户消息的文字会发送给第三方 TypeSafe System One 服务来选择回复格式；关闭时只用本地规则判断。

---

## 文档

| 文档 | |
|---|---|
| [docs/INSTALL.md](./docs/INSTALL.md) | 安装与验证 |
| [docs/SETTINGS.md](./docs/SETTINGS.md) | 插件设置 |
| [SKILL.md](./SKILL.md) | 围栏与写作约定 |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | 架构概览 |
| [CHANGELOG.md](./CHANGELOG.md) | 版本记录 |

---

## 许可

MIT。见 [LICENSE](./LICENSE) 与 [NOTICE](./NOTICE)。
