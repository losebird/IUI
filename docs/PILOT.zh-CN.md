# IUI 试点运维说明（sandbox-first）

- **版本目标**: 见 `package.json` → `version`（本文随 `0.13.0-iui.18` 起）
- **形态**: dsh **插件**挂载 `` ```iui-html `` 自由 HTML/CSS/JS 沙箱；**不是**「只装 MCP」
- **同步**: `scripts/sync-to-dsh-profile.sh <repo> <profile>/node_modules/@losebird/iui`；本机试点常用 **web-iui3081 / :3081**

## 推荐模型车道

| 车道 | 说明 |
|---|---|
| **Muse Spark 1.3**（`dsh-our-free-model`） | 当前试点主推：行程/定价/天气抽检较稳 |
| 其它 OFM / 自建 | 可在选择器切换；**不保证**任意模型每次都出完美 JS |

模型 JS 长尾（语法抖、限流、不出围栏）**不在插件 SLA 内**；失败用沙箱「重新生成」或重问。

## 验收硬标准（抽检）

1. 围栏挂成 **iframe 沙箱页**，不是源码 JSON /「代码块」
2. 行程横滑卡有 **Wikimedia 实景**（工具 / enrich / 运行时补图）
3. 酒店/封面类用 `.iui-hotel-card` 等，封面有图（可调 `get_place_images`）
4. 地图：灰阶底图可见（东亚优先 OSM FR HOT；Esri 缺口会回退）
5. 流式结束后 **无**卡住的 CSS/HTML/JS ·「加载中」条

## 已知尾巴（诚实）

| 项 | 说明 |
|---|---|
| 第三方瓦片/图源 | Esri / OSM FR / Wikimedia SLA 不可合同保证 |
| 宿主 contentWiped | 宿主清空气泡时会重建沙箱；插件会尽量 `localState` 恢复表单/暂停文案，复杂动画态可能仍重置 |
| pageerror 噪音 | Playwright `pageerror` 常捕获 **iframe 内**模型/CDN 异常；父页未崩。插件侧已 safeRegExp + 作者 JS 旗标清洗 |
| 未发 npm / 未合 main | 试点包以 profile 同步为准 |

## 启动

```bash
# 构建并同步到 3081 profile（示例）
pnpm run build
bash scripts/sync-to-dsh-profile.sh /workspace/IUI \
  /home/box/.dsh/profiles/web-iui3081/node_modules/@losebird/iui
# 用 dsh 启动该 profile 的 web（端口/token 以启动日志为准）
```

浏览器请打开日志里的 **带 `?token=` 的完整 URL**（`dsh web` 默认鉴权）。
