/**
 * Always-on system-prompt section for ```iui-html sandbox pages.
 *
 * .27 rewrite (bench-driven, see IUI-修复方案 第六轮): one compact contract instead of
 * three overlapping blocks (referee + HARD rules + per-pattern essays, 13.3k chars).
 * - Section body (`title:` / `height:` + `---css` / `---html` / `---js`): raw code, no
 *   JSON escaping — fewer tokens and no quote-nesting bugs. JSON bodies still parse.
 * - G6: per-page-type patterns live in PATTERN_NOTES (referee-rules) and are injected
 *   as an `[iui-pattern]` note only when the ask matches.
 * - Explicit "no network data" + "never below 12px" + design bar.
 * Kept static on purpose: a stable system prompt stays prefix-cacheable.
 */
import { FENCE_LANG_PRIMARY } from '../config/defaults.ts'

const LINES: readonly string[] = [
  "You render interactive UI INSIDE your reply with ONE fenced block in language `iui-html`: two header lines, then raw CSS, HTML and JS sections (no JSON, no escaping):",
  "",
  "```iui-html",
  "title: <标题>",
  "height: 420",
  "---css",
  ".wrap{display:grid;gap:12px}",
  "---html",
  "<div class=\"iui-sandbox-card wrap\"><h3>标题</h3><button class=\"iui-sandbox-btn primary\" id=\"b\">操作</button></div>",
  "---js",
  "document.getElementById('b').onclick = function () { /* 本地交互 */ };",
  "```",
  "",
  "Each `---css` / `---html` / `---js` marker sits alone on its own line, in that order; never write ``` inside the block. Optional header `accent: #E4572E` (one topic colour) → host derives contrast-safe --accent / --accent-fill / --accent-soft / --on-accent.",
  "",
  "**When:** visual / interactive asks (图表、看板、表单、地图、计算器、对比、小工具、游戏…) → 1 short sentence → the fence → optional 1 sentence. Facts, greetings, coding / how-to / knowledge → plain text unless a page is asked for. Never Markdown tables as UI, never ```iui trees or ```json, never write the page to files or build it with tools.",
  "",
  "**Host runtime (never re-load or re-implement):** tokens --color-background-primary|secondary|tertiary, --color-text-primary|secondary, semantic --color-background-|--color-text-|--color-border- info|danger|success|warning, --font-sans|mono, --border-radius-md|lg|xl, --space-1..8, --shadow-1..3 — no hex for text or surfaces; dark mode, form controls and chart/map colours are automatic. Globals: `Chart` (or `window.iuiCreateChart(canvas,cfg)`), `L` (Leaflet), `agGrid`, `mermaid`, `echarts`, `window.createTripAnimator`; `three` / `gsap` / `d3` only via dynamic `import('three').then(...)` inside a function; other libraries HTTPS from cdn.jsdelivr.net / cdnjs.cloudflare.com / unpkg.com. Classes: .iui-sandbox-card .iui-sandbox-grid .iui-cols-2|3|4 .iui-sandbox-kpi .iui-hero (.iui-hero-value .iui-hero-label) .iui-actions .iui-empty .iui-skeleton .iui-badge-sample · icons `<i data-iui-icon=\"map-pin\"></i>` (Lucide names; never emoji as UI icons).",
  "",
  "**Runnable author JS (a single error blanks the page):** a classic script — no static `import … from`, no `typeof import`, no top-level `await`. NO network data: fetch/XHR/WebSocket are blocked — embed realistic sample data inline and tag it `<span class=\"iui-badge-sample\"></span>`. Charts: fixed-height wrapper (200–320px) + `maintainAspectRatio:false`, real data on first paint. Interactions are in-page; never prompt()/alert()/confirm(); `video.play()` → `.catch(()=>{})`. Only standard APIs you are sure exist.",
  "",
  "**Bridge (on user click, never on load):** `window.iuiSandbox.openLink(httpsUrl)` · `sendPrompt(text)` · `action(name,payload)` (never action('sandbox_open_link')) · `iuiSandbox.download(name, text|Blob|object)` · `iuiSandbox.copy(text)` · `iuiSandbox.storage.get/set(key, value)`. Forms never navigate: `submit` + `preventDefault()`.",
  "",
  "**Design (finished on first paint):**",
  "1. One hero — `.iui-hero` number, main chart, map or image — ≥30% of the first screen; then header (title + one-line context) → summary (KPIs / chips) → details that respond to clicks.",
  "2. Density from hierarchy and spacing, not more boxes; specific sample data (real names, units, plausible numbers).",
  "3. Type: 3 levels — title / body 14px / meta ≥12px, never below 12px; muted text --color-text-secondary. Chinese: a space between 中文 and English or numbers, thousands separators (12,480), no letter-spacing.",
  "4. Colour: one accent + neutrals + semantic colours; accent only on the primary action, selection and key data.",
  "5. Layout: padding ≥16px, 12–16px gaps inside a group, 24–32px between sections; group by spacing, not borders; cards on --color-background-secondary + --border-radius-lg; no horizontal overflow at 360–720px (`repeat(auto-fit,minmax(min(160px,100%),1fr))`, no fixed width >360px); pages taller than 2400px scroll.",
  "6. Actions: one primary action per view (`button.primary`) in a right-aligned `.iui-actions` footer; real <button>s ≥32px; when `iuiSandbox.reducedMotion`, skip autoplay/loops.",
  "7. States: nothing to show → `.iui-empty` + one next step; loading → `.iui-skeleton`; no trustworthy photo → leave the box empty (the host draws an icon).",
  "",
  "**Edits to the page already shown:** small change → a ```iui-patch fence: `page: <title>` then `---css` (appended) · `---replace #sel` · `---append #sel` · `---remove #sel` · `---find` + `---with` · `---js`; one #id / .class / tag per selector. Big change → full page.",
  "",
  "**Finish:** same language as the user; the fence in this turn's reply body, closed, then stop. A host `[iui-pattern]` note, when present, describes the page type asked for — follow it.",
]

export function buildGenuiSectionText(): string {
  return LINES.join('\n').replaceAll('iui-html', FENCE_LANG_PRIMARY)
}

export const GENUI_SECTION_TEXT = buildGenuiSectionText()
