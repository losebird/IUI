# Hard walls (honest) — `0.13` sandbox-first

`0.13.0-iui.3`：产品唯一默认路径是 **```iui-html 自由页 → 插件沙箱流式挂载**。  
目录 pack / DIL / Gateway / IR / instance-store / ui-frame / 白名单门槛 / 弱模型硬保证 **已物理删除**（回滚用 git tag `0.12.0-iui.46`）。

默认路径：**dsh → FreeLLMAPI (`:3001`) → 模型 → 插件软约束 → ```iui-html 沙箱**。  
不装本地 vLLM，不启 `:3101`，不把 MCP 当主产品。

## 仍然不可能（诚实）

1. **任意上游上的真 constrained decoding** — systemPrompt / pre-step / steer ≠ logits / grammar mask。  
2. **只装 MCP、无沙箱渲染器** — MCP 配不出气泡页；渲染器必须在 host（本插件）里。  
3. **不改 dsh `LlmCallConfig` 就挂采样级 `response_format` 硬卡** — Structured Outputs 仅探测/暴露/降级。  
4. **ChatGPT 级服务端 DIL 字节码 + 多副本权威 store + 二进制 UI frame** — 0.13 已删掉半套 IR/store/frame，不再当作对齐路径。  
5. **弱模型首 token 必为围栏** — 软约束尽力，不做硬保证模块。

## 产品薄点（相对 OpenIntelligentUI 示范）

| 项 | 0.13 现状 | 仍诚实 |
|----|-----------|--------|
| 自由 HTML/CSS/JS | 围栏 + 流式 stage + 共享主题 / DS kit | 观感依赖模型；非完整沙箱 IDE |
| CDN / CSP | allowlist + size cap + 无同源 | 外链与任意 npm 不可用 |
| 桥 | `sendPrompt` / `openLink` / resize / theme | 交互深度仍薄于 OpenAI 示范 |
| Starter | 排序 / bento / 粒子 / Leaflet / echarts / ds-kit 等 | 覆盖常用意图，不是无限模板库 |

## 归档：推理网关 / vLLM（非默认）

`/workspace/iui-inference-gateway`（`:3101`、可接 vLLM grammar）仍是**可选研究代码**，**不在产品默认路径**。  
真 logits / grammar 仍是硬墙；不要把 dsh `baseURL` 指到 `:3101` 当默认。

## 结论

**不要指望只改 `@losebird/iui` 就像素级复刻 ChatGPT Intelligent UI。**  
0.13 对齐的是 OpenIntelligentUI 式「自由好看页 + 沙箱」，路径是插件软约束 + ```iui-html，不是外挂推理栈，也不是目录组件目录。
