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
 * visual(②): daisyUI vocabulary (card / btn / badge / stats / tabs-box) + base tokens; Tailwind utilities compiled per page (visual ③).
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
  "<div class=\"card border\"><div class=\"card-body wrap\"><h2>标题</h2><button class=\"btn btn-primary\" id=\"b\">操作</button></div></div>",
  "---js",
  "document.getElementById('b').onclick = function () { /* 本地交互 */ };",
  "```",
  "",
  "Markers alone on their own line, in that order; never ``` inside the block. Optional headers `accent: #E4572E` (topic colour → --color-primary), `libs: leaflet,chart`.",
  "",
  "**When:** visual / interactive asks (图表、看板、表单、地图、计算器、对比、游戏…) → 1 short sentence → the fence → optional 1 sentence. Facts, chat, coding / how-to → plain text. Never Markdown tables or ```json as UI, never files or tools.",
  "",
  "**Host runtime (never re-load):** daisyUI 5 + IUI neutral theme (auto dark): card card-body, btn btn-primary|neutral|outline|ghost btn-sm, badge badge-soft, stats stat-title stat-value, tabs tabs-box tab-active, input select toggle, table, progress, avatar. Tailwind 4 utilities compiled per page (flex grid gap-4 p-6 md:grid-cols-3 text-base-content/60 rounded-box): use them for layout, no hex for text / surfaces. Tokens --color-base-100|200|300|content, --color-primary|success|warning|error. Globals `Chart` / `window.iuiCreateChart(canvas,cfg)`, `L` (Leaflet), `echarts`, `agGrid`, `mermaid`, `window.createTripAnimator`; `three` / `gsap` / `d3` only via `import('three').then(...)` inside a function; other libraries HTTPS from cdn.jsdelivr.net / unpkg.com. Host hooks .iui-cols-2|3|4 .iui-actions .iui-empty .iui-skeleton .iui-badge-sample; icons `<i data-iui-icon=\"map-pin\"></i>` (Lucide names, no emoji).",
  "",
  "**Runnable author JS (one error blanks the page):** classic script — no static `import … from`, no `typeof import`, no top-level `await`. NO network data (fetch/XHR blocked): embed sample data inline, tag it `<span class=\"iui-badge-sample\"></span>`. Charts: fixed-height wrapper (200–320px). Interactions stay in-page: no prompt()/alert()/confirm(); `video.play()` → `.catch(()=>{})`.",
  "",
  "**Bridge (on click, never on load):** `iuiSandbox.openLink(httpsUrl)` · `sendPrompt(text)` · `action(name,payload)` · `iuiSandbox.download(name,data)` · `copy(text)` · `storage.get/set` · `<button data-iui-send=\"summary\">` (choices → composer). Forms never navigate: `submit` + `preventDefault()`.",
  "",
  "**Design (finished on first paint):**",
  "1. One hero (big number, chart, map or image) ≥30% of the first screen, then title + one-line context → stats → details on click.",
  "2. Hierarchy and spacing, not more boxes; specific sample data (real names, units, numbers).",
  "3. Text never below 12px. Chinese: a space between 中文 and English or numbers, thousands separators (12,480).",
  "4. Neutral ink and greys; primary only on the main action and selection, colour only for status.",
  "5. Group by spacing, not borders; no horizontal overflow at 360–720px (auto-fit grids, no fixed width >360px); tap targets ≥32px, nothing hover-only.",
  "6. One btn-primary per view, in a right-aligned `.iui-actions` footer; when `iuiSandbox.reducedMotion`, skip autoplay / loops.",
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
