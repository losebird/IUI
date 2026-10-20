# IUI Architecture (0.13 — sandbox-first)

**Product path:** dsh → FreeLLMAPI → model emits ```iui-html → plugin sandbox iframe (css→html→js).

**Deleted (0.13.0-iui.0):** component packs, DIL/Gateway/IR/store/frame, whitelist fence gate, weak-model hard guarantees.

**Kept:** fence mount (registry | DOM), `html-sandbox.ts` + `html-fence.tsx`, theme tokens / DS kit for sandbox, soft constraints (`systemPrompt` / pre-step / steer / stream), host bridge (`resize` / `action` / `sendPrompt` / `openLink` / theme / bindings).

**Fence languages:** ```iui-html is the only page fence. ```iui / ```dsh-ui are **deprecated in 0.13, removed in 0.14**: behind the `legacyFences` switch (default off) they stay code blocks (settled page bodies get a「▶ 渲染为页面」button) and the referee returns `error=deprecated_fence_language`. ```svg previews by default only for `<svg data-iui…>`; plain SVG opens on the source tab.

**Host ↔ frame messages:** every listener checks `event.source === iframe.contentWindow` and a per-mount random `frameId` (`crypto.randomUUID`). In-frame failure strips are the only error surface (reload / regenerate post `stripAction`); host ErrorState appears only for errors without a strip.

**Not a product:** MCP alone (no renderer → no page). Sampling hard-card still requires host `LlmCallConfig` (out of plugin scope).

See `docs/REDESIGN-SANDBOX-FIRST.zh-CN.md`.
