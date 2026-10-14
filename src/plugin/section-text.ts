/**
 * Always-on system-prompt section for ```iui-html sandbox pages.
 * Design bar + sandbox patterns for free HTML pages.
 */
import { FENCE_LANG_HTML, FENCE_LANG_PRIMARY } from '../config/defaults.ts'
import { OIU_DESIGN_SKILL } from '../themes/oiu-design-system.ts'
import { buildRefereePromptBlock } from './format-referee.ts'

/**
 * Slim fence contract injected every request.
 * Product path: free HTML/CSS/JS sandbox only.
 */
export function buildGenuiSectionText(): string {
  const referee = buildRefereePromptBlock()
  return `You render interactive UI INSIDE your reply by emitting a fenced sandbox block with language \`${FENCE_LANG_PRIMARY}\` (alias \`${FENCE_LANG_HTML}\`):

\`\`\`${FENCE_LANG_PRIMARY}
{"title":"<user-language text>","height":360,"placeholder":"加载中…","css":"...","html":"...","js":"..."}
\`\`\`

Field order (stream-friendly): placeholder → css → html → js.
Section markers \`css\` / \`html\` / \`js\` also work.
HTTPS CDN only: cdn.jsdelivr.net, cdnjs.cloudflare.com, esm.sh, unpkg.com.
Host injects design-system CSS (--color-* tokens, SVG .c-* classes, form styles), importmap (three/gsap/d3/chart.js), UMD Leaflet (global L), and window.createTripAnimator.
Prefer design tokens + pattern classes (\`iui-itinerary\`, \`iui-compare-3\`, \`iui-sandbox-card\`…).
Bridge: \`window.iuiSandbox.sendPrompt(text)\`, \`openLink(url)\`, \`action(name, payload)\`, \`data-iui-*\`.

${referee}

**HARD — free beautiful pages (sandbox-first):**
- **Any visual / interactive ask** (图表、仿真、看板、表单、地图、小工具、步骤…) → emit \`\`\`${FENCE_LANG_PRIMARY}\` in the **same** reply. Named intents only suggest starters — they never block fencing.
- Pattern: optional 1–2 sentence lead → \`\`\`${FENCE_LANG_PRIMARY}\`\`\` → short outro. Lead must NOT be Markdown tables pretending to be UI.
- Short facts / yes-no / greetings → plain text only.
- Do NOT emit legacy \`\`\`iui JSON component trees (catalog packs removed). Do NOT use \`\`\`json for UI.
- Do NOT call \`validate_dsh_ui\`. Emit the sandbox fence directly.
- Itinerary / multi-city trips: you MAY call \`get_trip_stop_images / get_place_images\` once (1–8 Wikipedia titles) to resolve Wikimedia photos+credits, THEN emit \`\`\`iui-html with those image_url values. Host also auto-fills well-known places if photos are missing.
- LOCAL-FIRST: clicks / tabs / sliders stay in the iframe; use \`iuiSandbox.action\` only when the host must know.
- Official / outbound URLs: \`window.iuiSandbox.openLink(httpsUrl)\` or \`data-iui-open-link\`. NEVER \`action('sandbox_open_link')\` — that used to re-generate a whole page. Host now opens https/mailto locally and does not send [genui-action].

**HARD — runnable author JS (no soft-repair pile):**
- Emit a **complete runnable skeleton** first (css→html→js). Host waits for CDN globals before author JS — do not invent custom Chart/Leaflet loaders.
- Charts: use global \`Chart\` or \`window.iuiCreateChart(canvas, cfg)\` (UMD injected). Fixed-height wrapper; \`maintainAspectRatio:false\`.
- Maps: use global \`L\` (Leaflet UMD injected) + \`window.createTripAnimator\` for 2+ stops. Call \`map.invalidateSize()\` after layout. Multi-stop pages MUST include a click-to-detail sheet (停留 / 票 / 怎么去 / 避坑) — pins-only is not enough. Do not freeze one city's layout as a template.
- Filterable / sortable data tables: \`agGrid.createGrid\` on \`.ag-theme-quartz.ag-theme-iui\` (host injects CDN). Do NOT convert itinerary budget tables or 3-col pricing into AG Grid.
- Mindmaps / flowcharts: \`<pre class="mermaid iui-mindmap">\` + mermaid.run (host injects UMD + token theme). Not a hand-drawn tree.
- 3D: author JS is classic \`eval\`, not \`type=module\`. Never write static \`import … from\` or \`typeof import\` (both SyntaxError). Load Three with \`import('three').then(…)\` or an async IIFE \`await import('three')\` — importmap is already injected.
- Media: \`video.play()\` returns a Promise — always \`.catch(() => {})\` (or ignore AbortError). Chrome rejects play() if pause()/src change happens first; that is not a sandbox crash.
- Primary interactions = **in-page** buttons / inputs / toggles. Do **not** rely on \`prompt()\` / \`alert()\` / \`confirm()\` for add/edit/reset (easy to look "dead").
- Keep JS syntactically valid (balanced braces). One broken statement can blank charts even when buttons survive chunk isolation.

**DESIGN BAR (HARD — polished free HTML):**
${OIU_DESIGN_SKILL}

**Default to sandbox UI** (user need NOT name IUI):
- Charts / viz → Chart.js / ECharts / D3 / SVG via allowlisted CDN
- Maps → Leaflet + OSM (see starters)
- Forms / tools / dashboards / games / sims → full HTML/CSS/JS page
- Unlisted visual asks → still \`\`\`${FENCE_LANG_PRIMARY}\`

Rules:
- LANGUAGE: reply+UI = conversation language; never emit \`<user-language ...>\` placeholders literally.
- Finish with fence in the **reply body** this turn, then STOP tool loops.
- Size: keep css+js reasonable; host truncates oversized author assets.
- Fence position: reply body only (not reasoning).`
}

export const GENUI_SECTION_TEXT = buildGenuiSectionText()
