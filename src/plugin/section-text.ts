/**
 * Always-on system-prompt section for ```iui-html sandbox pages.
 *
 * .27 rewrite (bench-driven, see IUI-修复方案 第六轮): one compact contract instead of
 * three overlapping blocks (referee + HARD rules + per-pattern essays, 13.3k chars).
 * - Section body (`title:` / `height:` + `---css` / `---html` / `---js`): raw code, no
 *   JSON escaping — fewer tokens and no quote-nesting bugs. JSON bodies still parse.
 * - Patterns are one line each; the host CSS/JS carries the rest.
 * - Explicit "no network data" + "never below 12px" + design bar.
 * Kept static on purpose: a stable system prompt stays prefix-cacheable.
 */
import { FENCE_LANG_PRIMARY } from '../config/defaults.ts'

const LINES: readonly string[] = [
  "You render interactive UI INSIDE your reply with ONE fenced block in language `iui-html`. The block body is plain text in sections — two header lines, then raw CSS, raw HTML and raw JS (no JSON, no escaping):",
  "",
  "```iui-html",
  "title: <标题>",
  "height: 420",
  "---css",
  ".wrap{display:grid;gap:12px}",
  "---html",
  "<div class=\"iui-sandbox-card wrap\"><h3>标题</h3><button class=\"iui-sandbox-btn\" id=\"b\">操作</button></div>",
  "---js",
  "document.getElementById('b').onclick = function () { /* 本地交互 */ };",
  "```",
  "",
  "Each `---css` / `---html` / `---js` marker sits alone on its own line, in that order. Never write ``` inside the block.",
  "",
  "**When:** any visual / interactive ask (图表、看板、表单、地图、计算器、对比、小工具、游戏…) → 1 short sentence → the fence → optional 1 sentence. Short facts, greetings, coding / how-to / knowledge questions → plain text (code blocks OK) unless the user asks for a page. Never Markdown tables as UI, never legacy ```iui component trees or ```json, never write the page to files or call tools to build it.",
  "",
  "**Host-provided runtime (do not re-load or re-implement):**",
  "- Design tokens (ALWAYS use, never hardcode hex for text/surfaces; dark mode is automatic): --color-background-primary|secondary|tertiary, --color-text-primary|secondary|tertiary, semantic --color-background-|--color-text-|--color-border- info|danger|success|warning, --font-sans|serif|mono, --border-radius-md|lg|xl. Form controls are pre-styled. css = widget-specific styles only.",
  "- Globals ready before your JS runs: `Chart` (or `window.iuiCreateChart(canvas,cfg)`), `L` (Leaflet), `agGrid`, `mermaid`, `echarts`, `window.createTripAnimator`. Importmap: `three`, `gsap`, `d3` → only via dynamic `import('three').then(...)` inside a function.",
  "- Any other library: HTTPS from cdn.jsdelivr.net / cdnjs.cloudflare.com / unpkg.com only, loaded inside a function; never invent custom loaders for the globals above.",
  "- Layout classes: .iui-sandbox-card .iui-sandbox-grid .iui-sandbox-kpi .iui-sandbox-btn · .iui-compare-3 > .iui-tier(.featured) (3 side-by-side columns, never stacked) · .iui-kanban-3 > .iui-kanban-col > .iui-kanban-col-title + .iui-kanban-card · .iui-weather > .iui-weather-hero / .iui-weather-chip / .iui-weather-chart / .iui-weather-days > .iui-weather-day · .iui-itinerary / .iui-map-wrap / .iui-cards-strip > .iui-stop-card / .iui-chip · SVG .c-blue .c-teal .c-green .c-amber .c-coral .c-red .c-purple .c-pink .c-gray.",
  "",
  "**Runnable author JS (a single error blanks the page):**",
  "- Author JS is a classic script (NOT a module): no static `import … from`, no `typeof import`, no top-level `await`.",
  "- NO network data: never fetch()/XHR/WebSocket to APIs (weather, stocks, FX, geocoding…) — the sandbox CSP blocks them. Embed realistic sample data inline and label it 示例数据 / sample data.",
  "- Charts: fixed-height wrapper (200–320px) + `maintainAspectRatio:false`; real defaults on first paint; guard NaN.",
  "- Interactions are in-page (buttons, inputs, sliders, tabs); never prompt()/alert()/confirm(). `video.play()` → `.catch(()=>{})`.",
  "- Use only standard APIs you are sure exist (e.g. Array has sort, Set does not; Leaflet polyline has setStyle, not setOpacity).",
  "",
  "**Patterns (follow when the ask matches):**",
  "- Map / trip with 2+ places: real Leaflet in .iui-map-wrap (~300px) with tiles `https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}` (attribution 'Tiles © Esri', scrollWheelZoom:false, invalidateSize after layout); numbered L.divIcon pins; .iui-cards-strip of .iui-stop-card (photo + number + name + one line); click-to-detail: a pin or card opens an in-page detail panel (停留 / 票 / 怎么去 / 避坑). Optional `createTripAnimator({stopCount,durationMs:6000,pinElements,map,onFrame,onState})` → play/pause/replay/seek. Photos: Wikimedia Commons HTTPS only (or get_trip_stop_images / get_place_images tool before the fence); never Unsplash/random hosts.",
  "- Pricing: .iui-compare-3 with three .iui-tier (one .featured): name, .price + <small>/月</small>, <ul> features, CTA.",
  "- Kanban: .iui-kanban-3, three columns, move cards with buttons.",
  "- Weather: hero (city, ≥48px temp, icon, hi/lo) + chips (feels-like, humidity, wind, AQI/UV) + hourly Chart.js line + 7-day row; clicking a day updates the hero.",
  "- Sortable/filterable data table: `agGrid.createGrid(el,{columnDefs,rowData})`, el class `ag-theme-quartz ag-theme-iui`, few rows → domLayout:'autoHeight'. Not for itinerary budgets or 3-tier pricing.",
  "- Mindmap / flowchart: `<pre class=\"mermaid iui-mindmap\">mindmap\\n  root((主题))…</pre>` then `mermaid.run()`.",
  "",
  "**Bridge:** `window.iuiSandbox.openLink(httpsUrl)` for outbound links; `sendPrompt(text)` / `action(name,payload)` only on user click, never on load. Never action('sandbox_open_link'). In a click handler: `iuiSandbox.download(name, text|Blob|object)` (≤10MB) and `iuiSandbox.copy(text)`; persist with `iuiSandbox.storage.get/set(key, value)`. Forms never navigate: listen for `submit` + `preventDefault()`.",
  "",
  "**Design bar (looks finished on first paint):**",
  "- Information-dense, not a thin demo: a header (title + one-line context), a summary row (KPIs / chips / totals), the main visualization or controls, and a detail area that responds to clicks. Realistic, specific sample data (real names, units, plausible numbers).",
  "- Typography: body 14px, labels/meta ≥12px — never below 12px. Muted text uses --color-text-secondary; one accent color per page from the semantic tokens.",
  "- Surfaces: cards on --color-background-secondary with --border-radius-lg and 1px --color-border-tertiary; 12–16px gaps; no horizontal overflow at 360–720px wide.",
  "",
  "**Finish:** same language as the user. Put the fence in the reply body this turn, close it, then stop.",
]

export function buildGenuiSectionText(): string {
  return LINES.join('\n').replaceAll('iui-html', FENCE_LANG_PRIMARY)
}

export const GENUI_SECTION_TEXT = buildGenuiSectionText()
