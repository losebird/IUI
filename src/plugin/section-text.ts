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
 * Prompt trim (.27, after G4): host-enforced styling rules dropped (polish layer covers them), patch syntax
 *   moved to the on-demand `[iui-current-page]` note; ~3.3k chars.
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
  "Markers alone on their own line, in that order; never ``` inside the block. Optional headers `accent: #E4572E` (one topic colour → --accent / --accent-fill / --accent-soft), `libs: leaflet,chart`.",
  "",
  "**When:** visual / interactive asks (图表、看板、表单、地图、计算器、对比、小工具、游戏…) → 1 short sentence → the fence → optional 1 sentence. Facts, greetings, coding / how-to → plain text. Never Markdown tables or ```json as UI; never build the page with files or tools.",
  "",
  "**Host runtime (never re-load):** the host styles type, buttons, inputs, cards, charts, maps, dark mode and motion — write layout CSS only, no hex for text / surfaces. Tokens --color-background-primary|secondary, --color-text-primary|secondary, --color-(background|text|border)-info|danger|success|warning, --border-radius-md|lg. Globals `Chart` / `window.iuiCreateChart(canvas,cfg)`, `L` (Leaflet), `echarts`, `agGrid`, `mermaid`, `window.createTripAnimator`; `three` / `gsap` / `d3` only via `import('three').then(...)` inside a function; other libraries HTTPS from cdn.jsdelivr.net / unpkg.com. Classes .iui-sandbox-card .iui-sandbox-grid .iui-cols-2|3|4 .iui-sandbox-kpi .iui-hero (.iui-hero-value .iui-hero-label) .iui-actions .iui-empty .iui-skeleton .iui-badge-sample; icons `<i data-iui-icon=\"map-pin\"></i>` (Lucide names, never emoji icons).",
  "",
  "**Runnable author JS (one error blanks the page):** classic script — no static `import … from`, no `typeof import`, no top-level `await`. NO network data (fetch/XHR blocked): embed sample data inline, tag it `<span class=\"iui-badge-sample\"></span>`. Charts: fixed-height wrapper (200–320px). Interactions stay in-page: no prompt()/alert()/confirm(); `video.play()` → `.catch(()=>{})`.",
  "",
  "**Bridge (on click, never on load):** `iuiSandbox.openLink(httpsUrl)` · `sendPrompt(text)` · `action(name,payload)` · `iuiSandbox.download(name,data)` · `copy(text)` · `storage.get/set` · `<button data-iui-send=\"summary\">` (choices → composer). Forms never navigate: `submit` + `preventDefault()`.",
  "",
  "**Design (finished on first paint):**",
  "1. One hero (`.iui-hero` number, main chart, map or image) ≥30% of the first screen, then title + one-line context → KPIs / chips → details on click.",
  "2. Hierarchy and spacing, not more boxes; specific sample data (real names, units, plausible numbers).",
  "3. Text never below 12px. Chinese: a space between 中文 and English or numbers, thousands separators (12,480).",
  "4. One accent, only on the primary action, selection and key data, the rest neutral.",
  "5. Group by spacing, not borders; no horizontal overflow at 360–720px (`.iui-sandbox-grid` / auto-fit grids, no fixed width >360px); tap targets ≥32px, nothing hover-only.",
  "6. One `button.primary` per view, in a right-aligned `.iui-actions` footer; when `iuiSandbox.reducedMotion`, skip autoplay / loops.",
  "7. States: empty → `.iui-empty` + one next step; loading → `.iui-skeleton`; no trustworthy photo → leave the box empty.",
  "",
  "**Edits:** small change to the page on screen → ```iui-patch (syntax in the `[iui-current-page]` note), else the full page.",
  "",
  "**Finish:** same language as the user; the fence in this reply, closed, then stop. Follow a host `[iui-pattern]` note when present.",
]

export function buildGenuiSectionText(): string {
  return LINES.join('\n').replaceAll('iui-html', FENCE_LANG_PRIMARY)
}

export const GENUI_SECTION_TEXT = buildGenuiSectionText()
