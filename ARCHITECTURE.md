# IUI Architecture (0.13 — sandbox-first)

**Product path:** dsh → FreeLLMAPI → model emits ```iui-html → plugin sandbox iframe (css→html→js).

**Deleted (0.13.0-iui.0):** component packs, DIL/Gateway/IR/store/frame, whitelist fence gate, weak-model hard guarantees.

**Kept:** fence mount (registry | DOM), `html-sandbox.ts` + `html-fence.tsx`, theme tokens / DS kit for sandbox, soft constraints (`systemPrompt` / pre-step / steer / stream), host bridge (`resize` / `action` / `sendPrompt` / `openLink` / theme / bindings).

**Not a product:** MCP alone (no renderer → no page). Sampling hard-card still requires host `LlmCallConfig` (out of plugin scope).

See `docs/REDESIGN-SANDBOX-FIRST.zh-CN.md`.
