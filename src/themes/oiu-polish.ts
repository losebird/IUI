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
