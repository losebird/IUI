/**
 * R5-1 polish: host defaults that make every page look finished without the
 * author writing more CSS (zero extra prompt / output tokens).
 *
 * Rules:
 * - Generic rules sit inside :where() (specificity 0) so author CSS always wins; host
 *   components (.iui-sandbox-kpi, .iui-tier) use plain selectors so they beat the base kit.
 * - Motion is transitions only (no layout shift); prefers-reduced-motion turns it off.
 */
const CHECK_SVG =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M20 6 9 17l-5-5'/%3E%3C/svg%3E\")"

export const OIU_POLISH_CSS = `
/* R5-1 motion tokens */
:root {
  --iui-ease-out: cubic-bezier(.22, 1, .36, 1);
  --iui-dur-fast: 140ms;
  --iui-dur: 220ms;
  --iui-dur-slow: 360ms;
}
/* Depth: nested tiles drop the duplicate border + shadow and sit on a quiet tint. */
.iui-sandbox-card .iui-sandbox-kpi {
  background: var(--color-background-secondary); border-color: transparent; box-shadow: none;
}
.iui-sandbox-card .iui-sandbox-card { box-shadow: none; }
/* R5-2: panels inside a page frame are flat tints, not another bordered box. */
.iui-itinerary .iui-sandbox-card, .iui-sandbox-card .iui-sandbox-card {
  background: var(--color-background-secondary); border-color: transparent; box-shadow: none;
}
/* Hero: accent tint fading across the block (lighter than a flat slab, esp. in dark mode). */
.iui-hero {
  background: linear-gradient(135deg, var(--accent-soft), color-mix(in srgb, var(--accent-soft) 30%, var(--color-background-primary)));
}
/* Button hierarchy: one accent primary; everything else neutral (no accent-tinted secondary). */
button { border-color: var(--color-border-tertiary); }
button.secondary, button[data-variant="secondary"] {
  background: var(--color-background-primary); color: var(--color-text-primary); border-color: var(--color-border-tertiary);
}
button.secondary:hover, button[data-variant="secondary"]:hover { background: var(--color-background-secondary); }
button.ghost, button[data-variant="ghost"] { background: transparent; border-color: transparent; color: var(--color-text-secondary); }
button.ghost:hover, button[data-variant="ghost"]:hover { background: var(--color-background-secondary); color: var(--color-text-primary); }
/* Toggle groups (runtime marks a row of buttons carrying a pressed/active state) render as one segmented control. */
html [data-iui-seg] {
  display: inline-flex; flex-wrap: nowrap; gap: 2px; padding: 3px; width: max-content; max-width: 100%; overflow-x: auto;
  border-radius: calc(var(--border-radius-md) + 3px); background: var(--color-background-secondary);
  border: 0.5px solid var(--color-border-tertiary); scrollbar-width: none;
}
html [data-iui-seg] > button {
  min-height: 32px; padding: 4px 12px; border: 0; border-radius: var(--border-radius-md); background: transparent;
  box-shadow: none; color: var(--color-text-secondary); font-weight: 500; white-space: nowrap; transform: none;
}
html [data-iui-seg] > button:hover { background: transparent; color: var(--color-text-primary); box-shadow: none; }
html [data-iui-seg] > button:is([aria-pressed="true"], [aria-selected="true"], [aria-current="true"], .active, .selected, .on, .is-active, .current, .primary) {
  background: var(--color-background-primary); color: var(--color-text-primary); box-shadow: var(--shadow-1); opacity: 1;
}
/* Overlay controls on maps / media: small frosted pills instead of full-size buttons. */
.iui-map-chrome > button, .iui-map-chrome > .iui-chip {
  min-height: 32px; padding: 4px 12px; border-radius: 999px; font-size: 13px; font-weight: 500;
  color: var(--color-text-primary); border: 0.5px solid var(--color-border-tertiary); box-shadow: var(--shadow-1);
  background: color-mix(in srgb, var(--color-background-primary) 84%, transparent);
  -webkit-backdrop-filter: blur(10px) saturate(1.4); backdrop-filter: blur(10px) saturate(1.4);
}
.iui-map-chrome > button:hover { background: var(--color-background-primary); }
/* Selection = accent everywhere (stop cards, chosen tiles), never a black outline. */
.iui-stop-card[aria-current="true"], .iui-stop-card.active {
  border-color: var(--accent-fill); box-shadow: 0 0 0 1px var(--accent-fill), var(--shadow-2);
}
.iui-tier.featured .iui-chip { background: var(--accent-soft); color: var(--accent); border-color: transparent; }
/* G4 icons: <i data-iui-icon="name"> / <svg class="iui-icon"><use href="#i-name"/></svg>; 1.15em, currentColor. */
[data-iui-icon] {
  display: inline-flex; align-items: center; justify-content: center; flex: none;
  width: 1.15em; height: 1.15em; vertical-align: -0.2em; font-style: normal; line-height: 1;
}
svg.iui-icon {
  display: inline-block; flex: none; width: 1.15em; height: 1.15em; vertical-align: -0.2em;
  fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round;
}
[data-iui-icon] > svg.iui-icon { width: 100%; height: 100%; vertical-align: top; }
/* The icon runtime marks the side that touches label text (data-iui-gap = end | start | none). */
:where([data-iui-icon], svg.iui-icon)[data-iui-gap="end"] { margin-inline-end: 0.4em; }
:where([data-iui-icon], svg.iui-icon)[data-iui-gap="start"] { margin-inline-start: 0.4em; }
/* Icon tile: a soft accent square behind a feature / list icon. */
.iui-icon-tile {
  display: inline-flex; align-items: center; justify-content: center; flex: none;
  width: 36px; height: 36px; border-radius: var(--border-radius-md); font-size: 18px;
  background: var(--accent-soft); color: var(--accent);
}
/* Weather glyphs get natural tints (scoped so UI chrome icons stay neutral). */
.iui-weather :is([data-iui-icon="sun"], [data-iui-icon="sunny"], [data-iui-icon="sunrise"], [data-iui-icon="clear"]) { color: #F59E0B; }
.iui-weather :is([data-iui-icon="cloud-sun"], [data-iui-icon="partly-cloudy"]) { color: #E0A21B; }
.iui-weather :is([data-iui-icon="cloud"], [data-iui-icon="cloudy"], [data-iui-icon="wind"]) { color: var(--color-text-secondary); }
.iui-weather :is([data-iui-icon="cloud-rain"], [data-iui-icon="rain"], [data-iui-icon="umbrella"], [data-iui-icon="droplets"], [data-iui-icon="snowflake"], [data-iui-icon="snow"]) { color: #3B82F6; }
.iui-weather :is([data-iui-icon="moon"]) { color: #8B7FD8; }
/* Numbers: aligned digits, tighter display tracking. */
:where(.iui-stat-value, .iui-hero-value, .iui-sandbox-kpi .value, .iui-tier .price, .temp, .num, .iui-num, [data-num], td.num) {
  font-variant-numeric: tabular-nums lining-nums;
}
:where(.iui-hero-value) { letter-spacing: -0.03em; }
:where(.iui-sandbox-muted, .iui-stat-label, .iui-hero-label) { text-wrap: pretty; }
:where(h1, h2, h3, .iui-sandbox-title, .iui-itinerary-title) { text-wrap: balance; }
/* Featured plan: accent ring + soft lift instead of a hard black outline. */
.iui-tier.featured {
  border-color: var(--accent-fill);
  box-shadow: 0 0 0 1px var(--accent-fill), 0 18px 36px -18px color-mix(in srgb, var(--accent-fill) 55%, transparent);
  background: linear-gradient(180deg, color-mix(in srgb, var(--accent-fill) 6%, var(--color-background-primary)), var(--color-background-primary) 60%);
}
/* Feature ticks: drawn check instead of the ✓ glyph (crisper, font-independent). */
.iui-tier li::before {
  content: ""; width: 14px; height: 14px; top: 0.28em;
  background: var(--color-text-success);
  -webkit-mask: ${CHECK_SVG} center / contain no-repeat; mask: ${CHECK_SVG} center / contain no-repeat;
}
/* State changes ease instead of snapping. */
button, a, input, select, textarea, .iui-chip, .iui-sandbox-tab, .iui-sandbox-kpi, .iui-tier, .iui-stop-card,
.iui-place-card, .iui-cover-card, [role="tab"], [role="option"], [role="button"], [data-iui-clickable] {
  transition: background-color var(--iui-dur) var(--iui-ease-out), border-color var(--iui-dur) var(--iui-ease-out),
    color var(--iui-dur) var(--iui-ease-out), box-shadow var(--iui-dur) var(--iui-ease-out),
    opacity var(--iui-dur) var(--iui-ease-out), transform var(--iui-dur-fast) var(--iui-ease-out);
}
/* Clickable non-buttons (marked by the runtime when author JS binds a click). */
:where([data-iui-clickable], [role="button"]:not(button), [role="option"]) { cursor: pointer; }
@media (hover: hover) {
  :where([data-iui-clickable="card"]):hover { transform: translateY(-2px); box-shadow: var(--shadow-2); }
}
:where([data-iui-clickable="card"]):active { transform: translateY(0) scale(0.985); }
button:not(:disabled):active { transform: scale(0.97); }
/* Content swapped by a click/input eases in (class added by the runtime). */
.iui-swap-in { animation: iuiSwapIn var(--iui-dur-slow) var(--iui-ease-out) both; }
@keyframes iuiSwapIn { from { opacity: 0.35; transform: translateY(3px); } to { opacity: 1; transform: none; } }
/* Entrance (runtime adds .iui-enter once per block; streaming re-renders do not replay it). */
.iui-enter { animation: iuiEnter var(--iui-dur-slow) var(--iui-ease-out) both; animation-delay: var(--iui-enter-delay, 0ms); }
@keyframes iuiEnter { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) {
  .iui-enter, .iui-swap-in { animation: none !important; }
  :where([data-iui-clickable="card"]):hover, :where([data-iui-clickable="card"]):active, button:not(:disabled):active { transform: none; }
}
`.trim()
