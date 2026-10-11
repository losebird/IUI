# IUI Settings & soft fence path (`0.13`)

Plugin-only path (no MCP, no dsh core fork, **no Gateway / packs / `:3101` / vLLM**).  
Default: **dsh → FreeLLMAPI (`:3001`) → model**; IUI plugin does systemPrompt / pre-step / steer / stream hints, then mounts ```iui-html sandbox.

Chinese remodel plan: `docs/REDESIGN-SANDBOX-FIRST.zh-CN.md`.

## Settings → IUI

| Control | Default | Meaning |
|---------|---------|---------|
| Theme | `iui-default` | Neutral sandbox theme tokens / DS kit (legacy pack ids resolve here) |
| Fence repair feedback | on | Same-turn repair hint when a fence fails to render |
| Format referee | on | Visual / must-fence asks → steer toward ```iui-html |
| Custom tokens JSON | — | Optional token overrides for sandbox CSS vars |
| User templates JSON | — | HTML/CSS/JS starters the user saved |
| Enable Jev router | **off** | TypeSafe System One format pick; **off without key** |
| TypeSafe API key | — | Secret; empty keeps Jev off |
| TypeSafe base URL / model | defaults | Optional overrides (`jev-latest`) |
| Structured Outputs | **auto** | Build/advertise json_schema; degrade to soft fence if unsupported |
| Probe base URL | — | Optional OpenAI-compatible root (e.g. `http://127.0.0.1:3001`) |
| Probe API key | — | Secret for probe only |

**Removed in 0.13 (do not expect these controls):** component pack picker, Gateway transport/sidecar, instance-store persist, frames.sse mount, DIL schema endpoints.

Save applies to **new** fences (hard refresh if the client mirror looks stale).

Endpoints (no secrets):  
`…/assets/response-format.json`, `…/assets/format-router.json`, `…/assets/runtime-config.json`.

## FreeLLMAPI env (optional soft fence)

Host / FreeLLMAPI may expose `IUI_FENCE_*` style hints; they do **not** become sampling constraints. Prefer plugin Settings toggles above.


## Sandbox bridge security note

Sandbox iframes are opaque (`sandbox="allow-scripts"` without `allow-same-origin`), so `postMessage` uses `targetOrigin: "*"` with frameId + `event.source === contentWindow` checks. Do not treat `*` alone as sufficient without those checks.
