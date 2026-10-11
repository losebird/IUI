# IUI 方案落地说明（`0.13` 沙箱优先）

旧 `.44` 目录卡 + Gateway 路径已废弃。现行方案见：

- `docs/REDESIGN-SANDBOX-FIRST.zh-CN.md`
- `ARCHITECTURE.md`
- `docs/SETTINGS.md` / `docs/HARD-WALLS.md` / `docs/ACCEPTANCE.md`

## 默认路径

```
用户 → dsh → FreeLLMAPI(:3001) → 模型
              ↓
         IUI 插件钩子：systemPrompt / agent/pre-step / agent/turn-stopping(steer) / llm/stream
              ↓
         回复体 ```iui-html（css → html → js）
              ↓
         插件沙箱 iframe 流式挂载 + 宿主桥（resize / sendPrompt / openLink / theme）
```

## 明确不做

- 默认启用 `:3101` / 本地 vLLM  
- 改 dsh 核心 / agent-loop  
- MCP 当主产品路径  
- 复活 pack / DIL / Gateway  
