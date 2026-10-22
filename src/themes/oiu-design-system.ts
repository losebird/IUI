/**
 * IUI sandbox design-system (theme CSS + SVG/form helpers + importmap + trip animator).
 * Legal attribution for adapted MIT material: see NOTICE.
 *
 * Injected into every ```iui-html sandbox:
 * 1. Shared THEME + SVG + FORM CSS
 * 2. CDN importmap (three / gsap / d3 / chart.js; Leaflet = UMD auto-inject)
 * 3. Agent design skill teaching token usage + patterns
 * 4. createTripAnimator for map+pin-drop+carousel itineraries
 */
import { OIU_POLISH_CSS } from './oiu-polish.ts'
import { buildVendorImportMap } from '../shared/vendor-registry.ts'

/** Theme tokens — warm stone neutrals, semantic status colors, dark auto. */
export const OIU_THEME_CSS = `
:root {
  --color-background-primary: #ffffff;
  --color-background-secondary: #f7f6f3;
  --color-background-tertiary: #efeee9;
  --color-background-info: #E6F1FB;
  --color-background-danger: #FCEBEB;
  --color-background-success: #EAF3DE;
  --color-background-warning: #FAEEDA;

  --color-text-primary: #1a1a1a;
  --color-text-secondary: #5f5e58;
  --color-text-tertiary: #6b6a64;
  --color-text-info: #185FA5;
  --color-text-danger: #A32D2D;
  --color-text-success: #3B6D11;
  --color-text-warning: #854F0B;

  --color-border-primary: rgba(0, 0, 0, 0.4);
  --color-border-secondary: rgba(0, 0, 0, 0.3);
  --color-border-tertiary: rgba(0, 0, 0, 0.12);
  --color-border-info: #185FA5;
  --color-border-danger: #A32D2D;
  --color-border-success: #3B6D11;
  --color-border-warning: #854F0B;

  /* G2: explicit CJK faces — system-ui alone falls back to SimSun on some Windows / Linux setups. */
  --font-sans: system-ui, -apple-system, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", "Noto Sans CJK SC", Roboto, sans-serif;
  --font-serif: Georgia, "Times New Roman", serif;
  --font-mono: "SF Mono", "Fira Code", "Fira Mono", monospace;

  --border-radius-md: 8px;
  --border-radius-lg: 12px;
  --border-radius-xl: 16px;

  /* D1 type scale — the ONLY sizes pages should use (floor 12px). */
  --fs-xs: 12px;
  --fs-sm: 14px;
  --fs-md: 16px;
  --fs-lg: 20px;
  --fs-xl: 28px;
  --fs-2xl: 40px;
  /* G2 aliases + line heights (CJK body 1.65, Latin 1.5, headings 1.25). */
  --text-xs: var(--fs-xs); --text-sm: var(--fs-sm); --text-base: var(--fs-md);
  --text-lg: var(--fs-lg); --text-xl: var(--fs-xl); --text-2xl: var(--fs-2xl);
  --lh-body: 1.65; --lh-latin: 1.5; --lh-heading: 1.25;

  /* G2 spacing on a 4/8pt grid. */
  --space-1: 4px; --space-2: 8px; --space-3: 12px; --space-4: 16px;
  --space-5: 20px; --space-6: 24px; --space-7: 32px; --space-8: 40px;

  /* G2 elevation (1 = resting card, 2 = raised / hover, 3 = popover / sheet). */
  --shadow-1: 0 1px 2px rgba(16, 24, 40, 0.05), 0 3px 10px -4px rgba(16, 24, 40, 0.08);
  --shadow-2: 0 2px 4px rgba(16, 24, 40, 0.05), 0 12px 24px -8px rgba(16, 24, 40, 0.14);
  --shadow-3: 0 12px 32px rgba(0, 0, 0, 0.14), 0 2px 6px rgba(0, 0, 0, 0.06);

  /* D2 page accent (personality presets override it). */
  --accent: var(--color-text-info);
  --accent-soft: var(--color-background-info);
  --accent-fill: #185FA5;
  --accent-strong: #124a80;
  --on-accent: #ffffff;

  --p: var(--color-text-primary);
  --s: var(--color-text-secondary);
  --t: var(--color-text-tertiary);
  --bg2: var(--color-background-secondary);
  --b: var(--color-border-tertiary);

  /* Bridge: keep existing .iui-sandbox-* kit working on design tokens */
  --iui-pack-surface: var(--color-background-primary);
  --iui-pack-surface-muted: var(--color-background-secondary);
  --iui-pack-fg: var(--color-text-primary);
  --iui-pack-muted-fg: var(--color-text-secondary);
  --iui-pack-border: var(--color-border-tertiary);
  --iui-pack-accent: var(--accent, var(--color-text-info));
  --iui-pack-on-accent: #ffffff;
  --iui-pack-ok: var(--color-text-success);
  --iui-pack-warn: var(--color-text-warning);
  --iui-pack-danger: var(--color-text-danger);
  --iui-pack-tint: var(--color-background-info);
  --iui-pack-tint-strong: #cfe3f7;
  --iui-pack-secondary: var(--color-background-tertiary);
  --iui-pack-hero-from: var(--color-background-secondary);
  --iui-pack-hero-to: var(--color-background-tertiary);
  --iui-pack-font-family: var(--font-sans);
  --iui-pack-radius: var(--border-radius-lg);
  --iui-pack-radius-sm: var(--border-radius-md);
  --iui-pack-radius-control: var(--border-radius-md);
  --iui-pack-elev: var(--shadow-1);
  --iui-pack-elev-2: var(--shadow-2);
  --dsl-g-fg: var(--color-text-primary);
  --dsl-g-bg: var(--color-background-primary);
  --dsl-g-surface: var(--color-background-primary);
  --dsl-g-muted-fg: var(--color-text-secondary);
  --dsl-g-border: var(--color-border-tertiary);
  /* Prompt-trim aliases: short names authors often guess. */
  --bg: var(--color-background-primary); --surface: var(--color-background-secondary); --card: var(--color-background-secondary);
  --text: var(--color-text-primary); --fg: var(--color-text-primary); --muted: var(--color-text-secondary);
  --border: var(--color-border-tertiary); --radius: var(--border-radius-lg);
  --iui-chart-1: #185FA5;
  --iui-chart-2: #3B6D11;
  --iui-chart-3: #854F0B;
  --iui-chart-4: #A32D2D;
  --iui-chart-5: #534AB7;
  --iui-chart-6: #0F6E56;
  --iui-chart-7: #B4457A;
  --iui-chart-8: #5F5E58;
}

@media (prefers-color-scheme: dark) {
  :root {
    --color-background-primary: #1a1a18;
    --color-background-secondary: #2c2c2a;
    --color-background-tertiary: #222220;
    --color-background-info: #0C447C;
    --color-background-danger: #501313;
    --color-background-success: #173404;
    --color-background-warning: #412402;

    --color-text-primary: #e8e6de;
    --color-text-secondary: #a8a69e;
    --color-text-tertiary: #9a988f;
    --color-text-info: #85B7EB;
    --color-text-danger: #F09595;
    --color-text-success: #97C459;
    --color-text-warning: #EF9F27;

    --color-border-primary: rgba(255, 255, 255, 0.4);
    --color-border-secondary: rgba(255, 255, 255, 0.3);
    --color-border-tertiary: rgba(255, 255, 255, 0.15);
    --color-border-info: #85B7EB;
    --color-border-danger: #F09595;
    --color-border-success: #97C459;
    --color-border-warning: #EF9F27;

    --iui-pack-surface-dark: #1a1a18;
    --iui-pack-surface-muted-dark: #2c2c2a;
    --iui-pack-fg-dark: #e8e6de;
    --iui-pack-muted-fg-dark: #a8a69e;
    --iui-pack-border-dark: rgba(255, 255, 255, 0.15);
    --iui-pack-accent-dark: #85B7EB;

    --accent-strong: #2a73bd;
    --shadow-1: 0 1px 2px rgba(0, 0, 0, 0.4);
    --shadow-2: 0 4px 12px rgba(0, 0, 0, 0.45);
    --shadow-3: 0 12px 32px rgba(0, 0, 0, 0.55);
    /* G3: lighter series so charts stay readable on dark surfaces. */
    --iui-chart-1: #85B7EB;
    --iui-chart-2: #97C459;
    --iui-chart-3: #EF9F27;
    --iui-chart-4: #F09595;
    --iui-chart-5: #AFA9EC;
    --iui-chart-6: #5DCAA5;
    --iui-chart-7: #ED93B1;
    --iui-chart-8: #B4B2A9;
  }
}
`.trim()

/** SVG color-ramp + diagram helpers (.c-purple … .c-red, .box .node .arr .leader, .t .ts .th). */
export const OIU_SVG_CLASSES_CSS = `
svg text.t   { font: 400 14px var(--font-sans); fill: var(--p); }
svg text.ts  { font: 400 12px var(--font-sans); fill: var(--s); }
svg text.th  { font: 500 14px var(--font-sans); fill: var(--p); }

svg .box > rect, svg .box > circle, svg .box > ellipse { fill: var(--bg2); stroke: var(--b); }
svg .node { cursor: pointer; }
svg .node:hover { opacity: 0.8; }
svg .arr { stroke: var(--s); stroke-width: 1.5; fill: none; }
svg .leader { stroke: var(--t); stroke-width: 0.5; stroke-dasharray: 4 4; fill: none; }

svg .c-purple > rect, svg .c-purple > circle, svg .c-purple > ellipse,
svg rect.c-purple, svg circle.c-purple, svg ellipse.c-purple { fill: #EEEDFE; stroke: #534AB7; }
svg .c-purple text.th, svg .c-purple text.t { fill: #3C3489; }
svg .c-purple text.ts { fill: #534AB7; }

svg .c-teal > rect, svg .c-teal > circle, svg .c-teal > ellipse,
svg rect.c-teal, svg circle.c-teal, svg ellipse.c-teal { fill: #E1F5EE; stroke: #0F6E56; }
svg .c-teal text.th, svg .c-teal text.t { fill: #085041; }
svg .c-teal text.ts { fill: #0F6E56; }

svg .c-coral > rect, svg .c-coral > circle, svg .c-coral > ellipse,
svg rect.c-coral, svg circle.c-coral, svg ellipse.c-coral { fill: #FAECE7; stroke: #993C1D; }
svg .c-coral text.th, svg .c-coral text.t { fill: #712B13; }
svg .c-coral text.ts { fill: #993C1D; }

svg .c-pink > rect, svg .c-pink > circle, svg .c-pink > ellipse,
svg rect.c-pink, svg circle.c-pink, svg ellipse.c-pink { fill: #FBEAF0; stroke: #993556; }
svg .c-pink text.th, svg .c-pink text.t { fill: #72243E; }
svg .c-pink text.ts { fill: #993556; }

svg .c-gray > rect, svg .c-gray > circle, svg .c-gray > ellipse,
svg rect.c-gray, svg circle.c-gray, svg ellipse.c-gray { fill: #F1EFE8; stroke: #5F5E5A; }
svg .c-gray text.th, svg .c-gray text.t { fill: #444441; }
svg .c-gray text.ts { fill: #5F5E5A; }

svg .c-blue > rect, svg .c-blue > circle, svg .c-blue > ellipse,
svg rect.c-blue, svg circle.c-blue, svg ellipse.c-blue { fill: #E6F1FB; stroke: #185FA5; }
svg .c-blue text.th, svg .c-blue text.t { fill: #0C447C; }
svg .c-blue text.ts { fill: #185FA5; }

svg .c-green > rect, svg .c-green > circle, svg .c-green > ellipse,
svg rect.c-green, svg circle.c-green, svg ellipse.c-green { fill: #EAF3DE; stroke: #3B6D11; }
svg .c-green text.th, svg .c-green text.t { fill: #27500A; }
svg .c-green text.ts { fill: #3B6D11; }

svg .c-amber > rect, svg .c-amber > circle, svg .c-amber > ellipse,
svg rect.c-amber, svg circle.c-amber, svg ellipse.c-amber { fill: #FAEEDA; stroke: #854F0B; }
svg .c-amber text.th, svg .c-amber text.t { fill: #633806; }
svg .c-amber text.ts { fill: #854F0B; }

svg .c-red > rect, svg .c-red > circle, svg .c-red > ellipse,
svg rect.c-red, svg circle.c-red, svg ellipse.c-red { fill: #FCEBEB; stroke: #A32D2D; }
svg .c-red text.th, svg .c-red text.t { fill: #791F1F; }
svg .c-red text.ts { fill: #A32D2D; }

@media (prefers-color-scheme: dark) {
  svg text.t   { fill: #e8e6de; }
  svg text.ts  { fill: #a8a69e; }
  svg text.th  { fill: #e8e6de; }
  svg .c-purple > rect, svg .c-purple > circle, svg .c-purple > ellipse,
  svg rect.c-purple, svg circle.c-purple, svg ellipse.c-purple { fill: #3C3489; stroke: #AFA9EC; }
  svg .c-purple text.th, svg .c-purple text.t { fill: #CECBF6; }
  svg .c-purple text.ts { fill: #AFA9EC; }
  svg .c-teal > rect, svg .c-teal > circle, svg .c-teal > ellipse,
  svg rect.c-teal, svg circle.c-teal, svg ellipse.c-teal { fill: #085041; stroke: #5DCAA5; }
  svg .c-teal text.th, svg .c-teal text.t { fill: #9FE1CB; }
  svg .c-teal text.ts { fill: #5DCAA5; }
  svg .c-coral > rect, svg .c-coral > circle, svg .c-coral > ellipse,
  svg rect.c-coral, svg circle.c-coral, svg ellipse.c-coral { fill: #712B13; stroke: #F0997B; }
  svg .c-coral text.th, svg .c-coral text.t { fill: #F5C4B3; }
  svg .c-coral text.ts { fill: #F0997B; }
  svg .c-pink > rect, svg .c-pink > circle, svg .c-pink > ellipse,
  svg rect.c-pink, svg circle.c-pink, svg ellipse.c-pink { fill: #72243E; stroke: #ED93B1; }
  svg .c-pink text.th, svg .c-pink text.t { fill: #F4C0D1; }
  svg .c-pink text.ts { fill: #ED93B1; }
  svg .c-gray > rect, svg .c-gray > circle, svg .c-gray > ellipse,
  svg rect.c-gray, svg circle.c-gray, svg ellipse.c-gray { fill: #444441; stroke: #B4B2A9; }
  svg .c-gray text.th, svg .c-gray text.t { fill: #D3D1C7; }
  svg .c-gray text.ts { fill: #B4B2A9; }
  svg .c-blue > rect, svg .c-blue > circle, svg .c-blue > ellipse,
  svg rect.c-blue, svg circle.c-blue, svg ellipse.c-blue { fill: #0C447C; stroke: #85B7EB; }
  svg .c-blue text.th, svg .c-blue text.t { fill: #B5D4F4; }
  svg .c-blue text.ts { fill: #85B7EB; }
  svg .c-green > rect, svg .c-green > circle, svg .c-green > ellipse,
  svg rect.c-green, svg circle.c-green, svg ellipse.c-green { fill: #27500A; stroke: #97C459; }
  svg .c-green text.th, svg .c-green text.t { fill: #C0DD97; }
  svg .c-green text.ts { fill: #97C459; }
  svg .c-amber > rect, svg .c-amber > circle, svg .c-amber > ellipse,
  svg rect.c-amber, svg circle.c-amber, svg ellipse.c-amber { fill: #633806; stroke: #EF9F27; }
  svg .c-amber text.th, svg .c-amber text.t { fill: #FAC775; }
  svg .c-amber text.ts { fill: #EF9F27; }
  svg .c-red > rect, svg .c-red > circle, svg .c-red > ellipse,
  svg rect.c-red, svg circle.c-red, svg ellipse.c-red { fill: #791F1F; stroke: #F09595; }
  svg .c-red text.th, svg .c-red text.t { fill: #F7C1C1; }
  svg .c-red text.ts { fill: #F09595; }
}
`.trim()

/** Form controls + entrance stagger (thin borders, soft focus, fadeSlideIn). */
export const OIU_FORM_STYLES_CSS = `
* { box-sizing: border-box; margin: 0; }
html { background: transparent; }
body {
  font-family: var(--font-sans);
  font-size: 16px;
  line-height: var(--lh-body, 1.65);
  color: var(--color-text-primary);
  background: transparent;
  -webkit-font-smoothing: antialiased;
}
button {
  font-family: inherit;
  font-size: 14px;
  padding: 6px 16px;
  border: 0.5px solid var(--color-border-secondary);
  border-radius: var(--border-radius-md);
  background: transparent;
  color: var(--color-text-primary);
  cursor: pointer;
  transition: background 0.15s, transform 0.1s;
  min-height: 36px;
}
button:hover { background: var(--color-background-secondary); }
button:active { transform: scale(0.98); }
button.primary, button[data-variant="primary"] {
  background: var(--color-text-primary);
  color: var(--color-background-primary);
  border-color: var(--color-text-primary);
}
button.primary:hover { opacity: 0.9; }
input[type="text"],
input[type="number"],
input[type="email"],
input[type="search"],
input[type="date"],
textarea,
select {
  font-family: inherit;
  font-size: 14px;
  padding: 6px 12px;
  height: 36px;
  border: 0.5px solid var(--color-border-tertiary);
  border-radius: var(--border-radius-md);
  background: var(--color-background-primary);
  color: var(--color-text-primary);
  transition: border-color 0.15s;
  width: 100%;
}
input:hover, textarea:hover, select:hover { border-color: var(--color-border-secondary); }
input:focus, textarea:focus, select:focus {
  outline: none;
  border-color: var(--color-border-primary);
  box-shadow: 0 0 0 3px rgba(0, 0, 0, 0.06);
}
textarea { height: auto; min-height: 80px; resize: vertical; }
input::placeholder, textarea::placeholder { color: var(--color-text-tertiary); }
input[type="range"] {
  -webkit-appearance: none;
  appearance: none;
  height: 4px;
  background: var(--color-border-tertiary);
  border-radius: 2px;
  border: none;
  outline: none;
}
input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 18px; height: 18px;
  border-radius: 50%;
  background: var(--color-background-primary);
  border: 0.5px solid var(--color-border-secondary);
  cursor: pointer;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}
input[type="range"]::-moz-range-thumb {
  width: 18px; height: 18px;
  border-radius: 50%;
  background: var(--color-background-primary);
  border: 0.5px solid var(--color-border-secondary);
  cursor: pointer;
}
input[type="checkbox"], input[type="radio"] {
  width: 16px; height: 16px;
  accent-color: var(--color-text-info);
}
a { color: var(--color-text-info); text-decoration: none; }
a:hover { text-decoration: underline; }

/* Editorial card helpers used by itinerary / compare patterns */
.iui-itinerary {
  display: flex; flex-direction: column; gap: 12px;
  padding: 16px; border-radius: var(--border-radius-xl);
  background: var(--color-background-primary);
  border: 0.5px solid var(--color-border-tertiary);
  box-shadow: 0 1px 2px rgba(0,0,0,0.04);
  min-width: 0; max-width: 100%;
}
.iui-itinerary-head { display: flex; flex-wrap: wrap; gap: 8px; align-items: baseline; justify-content: flex-start; }
/* Title block takes the slack so trailing chips (3 天 · 3 站) group on the right instead of spreading. */
.iui-itinerary-head > :first-child { margin-right: auto; }
.iui-itinerary-title { font-size: 18px; font-weight: 600; letter-spacing: -0.015em; color: var(--color-text-primary); }
.iui-itinerary-sub { font-size: 13px; color: var(--color-text-secondary); }
.iui-chip {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 2px 10px; border-radius: 999px; font-size: 12px; font-weight: 500;
  background: var(--color-background-secondary); color: var(--color-text-secondary);
  border: 0.5px solid var(--color-border-tertiary);
}
.iui-map-wrap {
  position: relative; height: 300px; border-radius: var(--border-radius-lg);
  overflow: hidden; border: 0.5px solid var(--color-border-tertiary);
  background: var(--color-background-secondary);
}
/* D6: colored, slightly muted basemap by default; data-iui-map-style="mono" keeps the old grayscale look. */
.iui-map-wrap .leaflet-container,
.leaflet-container {
  height: 100%; width: 100%; min-height: 280px;
}
.leaflet-container .leaflet-tile-pane { filter: saturate(0.82) contrast(1.02); }
/* leaflet.css sets plus-lighter on tiles (zoom-gap fix); at rest on DPR 2 it leaves a light hairline between tile rows. Keep it only while zoom-animating. */
html body .leaflet-container img.leaflet-tile { mix-blend-mode: normal; }
html body .leaflet-container .leaflet-zoom-anim img.leaflet-tile { mix-blend-mode: plus-lighter; }
/* F25: Leaflet's 0.75rem chrome text renders ~10.5px — keep map labels, popups and tooltips at 12px. */
body .leaflet-container { font-size: var(--fs-xs, 12px); }
body .leaflet-popup-content, body .leaflet-tooltip { font-size: max(12px, 1em); }
/* G3: Leaflet chrome on tokens (popup, tooltip, zoom / attribution controls). */
.leaflet-container { font-family: var(--font-sans); background: var(--color-background-tertiary); }
/* Vendor leaflet.css loads after this sheet and resets the family to Helvetica: out-specify it. */
html body .leaflet-container, html body .leaflet-popup-content-wrapper, html body .leaflet-tooltip { font-family: var(--font-sans); }
.leaflet-popup-content-wrapper, .leaflet-popup-tip { background: var(--color-background-primary); color: var(--color-text-primary); box-shadow: var(--shadow-3); }
.leaflet-popup-content-wrapper { border-radius: var(--border-radius-lg); }
.leaflet-popup-content { margin: 10px 14px; line-height: 1.5; }
.leaflet-container a.leaflet-popup-close-button { color: var(--color-text-secondary); }
.leaflet-tooltip { background: var(--color-background-primary); color: var(--color-text-primary); border-color: var(--color-border-tertiary); border-radius: var(--border-radius-md); box-shadow: var(--shadow-2); }
.leaflet-bar { border: 0.5px solid var(--color-border-tertiary) !important; border-radius: var(--border-radius-md) !important; box-shadow: var(--shadow-1) !important; overflow: hidden; }
.leaflet-bar a, .leaflet-bar a:hover { background: var(--color-background-primary); color: var(--color-text-primary); border-bottom-color: var(--color-border-tertiary); }
.leaflet-container .leaflet-control-attribution { background: color-mix(in srgb, var(--color-background-primary) 80%, transparent); color: var(--color-text-secondary); }
.leaflet-container .leaflet-control-attribution a { color: var(--color-text-secondary); }
/* G8: "hold Ctrl/⌘ to zoom" / "two fingers" hint for cooperative map gestures. */
.iui-map-hint {
  position: absolute; inset: 0; z-index: 1001; display: flex; align-items: center; justify-content: center;
  padding: 16px; text-align: center; pointer-events: none; opacity: 0; transition: opacity 0.2s ease;
  background: rgba(0, 0, 0, 0.42); color: #fff; font: 600 14px/1.4 var(--font-sans);
}
.iui-map-hint[data-on] { opacity: 1; }
/* G8: horizontal scrollers keep the swipe instead of navigating / bouncing the chat. */
.iui-cards-strip, .iui-sandbox-tabbar, .iui-scroll-x, .iui-table-scroll, [data-iui-scroll-x] { overscroll-behavior-x: contain; }
[data-iui-map-style="mono"] .leaflet-tile-pane, .leaflet-container[data-iui-map-style="mono"] .leaflet-tile-pane {
  filter: grayscale(1) contrast(1.12) brightness(1.02);
}
@media (prefers-color-scheme: dark) {
  .leaflet-container .leaflet-tile-pane { filter: saturate(0.7) brightness(0.86) contrast(1.05); }
}
.iui-map-chrome {
  position: absolute; z-index: 500; left: 12px; bottom: 12px;
  display: flex; gap: 6px; align-items: center;
}
.iui-cards-strip {
  display: flex; gap: 10px; overflow-x: auto; padding-bottom: 4px;
  scroll-behavior: smooth; -webkit-overflow-scrolling: touch;
  min-width: 0; max-width: 100%; width: 100%;
}
.iui-stop-card {
  flex: 0 0 200px; border-radius: var(--border-radius-lg);
  border: 0.5px solid var(--color-border-tertiary);
  background: var(--color-background-primary); overflow: hidden;
  cursor: pointer; transition: border-color 0.15s, box-shadow 0.15s;
}
.iui-stop-card[aria-current="true"], .iui-stop-card.active {
  border-color: var(--color-text-primary);
  box-shadow: 0 0 0 1px var(--color-text-primary);
}
.iui-stop-card .photo {
  height: 110px; background: var(--color-background-tertiary);
  background-size: cover; background-position: center;
  overflow: hidden;
}
.iui-stop-card .photo img {
  width: 100%; height: 100%; object-fit: cover; display: block;
}
.iui-stop-card .body { padding: 10px 12px; }
.iui-stop-card .num {
  display: inline-flex; width: 20px; height: 20px; border-radius: 50%;
  align-items: center; justify-content: center; font-size: 12px; font-weight: 600;
  background: var(--color-text-primary); color: var(--color-background-primary); margin-right: 6px;
}
.iui-stop-card .name { font-size: 14px; font-weight: 600; color: var(--color-text-primary); }
.iui-stop-card .meta { font-size: 12px; color: var(--color-text-secondary); margin-top: 2px; }
.iui-hotel-card, .iui-product-card, .iui-place-card, .iui-cover-card {
  border: 1px solid var(--color-border-tertiary); border-radius: var(--border-radius-lg);
  background: var(--color-background-primary); overflow: hidden; min-width: 160px;
}
.iui-hotel-card .photo, .iui-hotel-card .cover,
.iui-product-card .photo, .iui-product-card .cover,
.iui-place-card .photo, .iui-place-card .cover,
.iui-cover-card .photo, .iui-cover-card .cover {
  height: 110px; background: var(--color-background-secondary);
  background-size: cover; background-position: center; overflow: hidden;
}
.iui-hotel-card .photo img, .iui-hotel-card .cover img,
.iui-product-card .photo img, .iui-product-card .cover img,
.iui-place-card .photo img, .iui-place-card .cover img,
.iui-cover-card .photo img, .iui-cover-card .cover img {
  width: 100%; height: 100%; object-fit: cover; display: block;
}
.iui-hotel-card .name, .iui-product-card .name, .iui-place-card .name, .iui-cover-card .name {
  font-size: 14px; font-weight: 600; color: var(--color-text-primary); padding: 10px 12px 4px;
}
.iui-gallery, .iui-hero-photo {
  width: 100%;
}
.iui-gallery .photo, .iui-hero-photo .photo, .iui-gallery .cover, .iui-hero-photo .cover {
  height: auto !important; min-height: 160px; max-height: none !important;
  overflow: visible; background: var(--color-background-secondary);
}
.iui-gallery .photo img, .iui-hero-photo .photo img, .iui-gallery .cover img, .iui-hero-photo .cover img {
  width: 100%; height: auto !important; max-height: min(70vh, 640px); object-fit: contain !important; display: block;
  background: var(--color-background-secondary);
}
/* Lone hero card (gallery). Two-plus sibling place/cover cards stay the 110px thumbnail rule above. */
.iui-sandbox-card > .photo, .iui-sandbox-card > .cover,
.iui-sandbox-card:not(:has(.iui-place-card ~ .iui-place-card)):not(:has(.iui-cover-card ~ .iui-cover-card)) > .iui-place-card > .photo,
.iui-sandbox-card:not(:has(.iui-place-card ~ .iui-place-card)):not(:has(.iui-cover-card ~ .iui-cover-card)) > .iui-place-card > .cover,
.iui-sandbox-card:not(:has(.iui-place-card ~ .iui-place-card)):not(:has(.iui-cover-card ~ .iui-cover-card)) > .iui-cover-card > .photo,
.iui-sandbox-card:not(:has(.iui-place-card ~ .iui-place-card)):not(:has(.iui-cover-card ~ .iui-cover-card)) > .iui-cover-card > .cover,
.iui-sandbox-card:not(:has(article ~ article)) > article > .photo,
.iui-sandbox-card:not(:has(article ~ article)) > article > .cover {
  height: auto !important; min-height: 160px; max-height: none !important; overflow: visible !important;
}
.iui-sandbox-card > .photo img, .iui-sandbox-card > .cover img,
.iui-sandbox-card:not(:has(.iui-place-card ~ .iui-place-card)):not(:has(.iui-cover-card ~ .iui-cover-card)) > .iui-place-card > .photo img,
.iui-sandbox-card:not(:has(.iui-place-card ~ .iui-place-card)):not(:has(.iui-cover-card ~ .iui-cover-card)) > .iui-place-card > .cover img,
.iui-sandbox-card:not(:has(.iui-place-card ~ .iui-place-card)):not(:has(.iui-cover-card ~ .iui-cover-card)) > .iui-cover-card > .photo img,
.iui-sandbox-card:not(:has(.iui-place-card ~ .iui-place-card)):not(:has(.iui-cover-card ~ .iui-cover-card)) > .iui-cover-card > .cover img,
.iui-sandbox-card:not(:has(article ~ article)) > article > .photo img,
.iui-sandbox-card:not(:has(article ~ article)) > article > .cover img {
  width: 100%; height: auto !important; max-height: min(70vh, 640px); object-fit: contain !important; display: block;
}
.iui-photo-credit {
  font-size: 12px; line-height: 1.35; padding: 4px 10px 8px;
  color: var(--color-text-tertiary, #9ca3af);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.iui-photo-credit a { color: inherit; text-decoration: none; }
.iui-photo-credit a:hover, .iui-photo-credit a:focus-visible { text-decoration: underline; text-underline-offset: 2px; }
.iui-pin-dot {
  display: flex; align-items: center; justify-content: center;
  width: 26px; height: 26px; border-radius: 50%;
  background: var(--iui-pin-color, var(--accent-fill, #185FA5)); color: #fff; font: 600 12px var(--font-sans);
  border: 2px solid #fff; box-shadow: 0 1px 4px rgba(0,0,0,0.28);
  opacity: 1; transition: scale 0.18s ease, box-shadow 0.18s ease;
}
/* D6: category colors (data-cat on the pin or its card), numbered, selected = bigger + ring + on top.
   Pins stay visible even if createTripAnimator never gets the DOM (inline opacity only while playing). */
.iui-pin-dot[data-cat="food"], .iui-pin-dot[data-cat="restaurant"], .iui-pin-dot[data-cat="cafe"] { --iui-pin-color: #C2410C; }
.iui-pin-dot[data-cat="sight"], .iui-pin-dot[data-cat="landmark"], .iui-pin-dot[data-cat="attraction"] { --iui-pin-color: #185FA5; }
.iui-pin-dot[data-cat="hotel"], .iui-pin-dot[data-cat="lodging"] { --iui-pin-color: #6D28D9; }
.iui-pin-dot[data-cat="shop"], .iui-pin-dot[data-cat="shopping"] { --iui-pin-color: #BE185D; }
.iui-pin-dot[data-cat="nature"], .iui-pin-dot[data-cat="park"] { --iui-pin-color: #15803D; }
.iui-pin-dot[data-cat="culture"], .iui-pin-dot[data-cat="museum"] { --iui-pin-color: #A16207; }
.iui-pin-dot[data-cat="transport"], .iui-pin-dot[data-cat="station"] { --iui-pin-color: #334155; }
.iui-pin-dot.active, .iui-pin-dot[aria-current="true"], .iui-itinerary .iui-pin-dot.active {
  scale: 1.25;
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--iui-pin-color, var(--accent-fill, #185FA5)) 35%, transparent), 0 2px 8px rgba(0,0,0,0.35);
}
.leaflet-marker-icon:has(.iui-pin-dot.active), .leaflet-marker-icon:has(.iui-pin-dot[aria-current="true"]) { z-index: 1000 !important; }
.leaflet-marker-icon[data-iui-declutter] { transition: translate 0.18s ease; }
@media (prefers-reduced-motion: reduce) { .iui-pin-dot, .leaflet-marker-icon[data-iui-declutter] { transition: none; } }

.ag-theme-iui, .ag-theme-quartz.ag-theme-iui {
  --ag-background-color: var(--color-background-primary);
  --ag-foreground-color: var(--color-text-primary);
  --ag-header-background-color: var(--color-background-secondary);
  --ag-header-foreground-color: var(--color-text-secondary);
  --ag-border-color: var(--color-border-tertiary);
  --ag-row-hover-color: var(--color-background-secondary);
  --ag-selected-row-background-color: var(--color-background-info);
  --ag-font-family: var(--font-sans);
  --ag-font-size: 13px;
  --ag-border-radius: var(--border-radius-md);
  border: 1px solid var(--color-border-tertiary);
  border-radius: var(--border-radius-lg);
  overflow: hidden;
}
.ag-theme-iui .ag-header-cell-label { font-weight: 600; }
.iui-mindmap, .mermaid.iui-mindmap {
  background: var(--color-background-secondary);
  border: 1px solid var(--color-border-tertiary);
  border-radius: var(--border-radius-lg);
  padding: 12px;
  overflow: auto;
}
.iui-mindmap svg { max-width: 100%; height: auto; display: block; }

.iui-weather { display: flex; flex-direction: column; gap: 14px; }
.iui-weather-hero {
  display: grid; grid-template-columns: 1fr auto; gap: 12px; align-items: center;
  padding: 18px 20px; border-radius: var(--border-radius-xl);
  background: linear-gradient(135deg, var(--accent-soft, var(--color-background-info)), var(--color-background-secondary));
}
.iui-weather-hero .temp {
  font-size: 56px; font-weight: 700; letter-spacing: -0.04em; line-height: 1;
  color: var(--color-text-primary);
}
.iui-weather-hero .meta { display: flex; flex-direction: column; gap: 6px; align-items: flex-end; text-align: right; }
.iui-weather-hero .icon { font-size: 42px; line-height: 1; }
.iui-weather-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
.iui-weather-chip {
  padding: 6px 12px; border-radius: 999px;
  background: color-mix(in srgb, var(--color-background-primary) 72%, transparent);
  font-size: 12px; color: var(--color-text-secondary);
}
.iui-weather-chip strong { color: var(--color-text-primary); font-weight: 600; margin-left: 4px; }
.iui-weather-chart { height: 200px; position: relative; padding: 8px 4px 0; }
.iui-weather-days { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 8px; }
.iui-weather-day {
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  padding: 10px 4px; border-radius: var(--border-radius-lg);
  border: 1px solid transparent;
  background: var(--color-background-secondary); cursor: pointer; font: inherit; color: inherit;
}
.iui-weather-day:hover { background: var(--color-background-tertiary, var(--color-background-secondary)); }
.iui-weather-day[aria-current="true"] {
  border-color: var(--accent-fill);
  background: var(--accent-soft);
  box-shadow: 0 0 0 1px var(--accent-fill);
}
.iui-weather-day .wd { font-size: 12px; font-weight: 600; }
.iui-weather-day .dt { font-size: 12px; color: var(--color-text-tertiary); }
.iui-weather-day .ic { font-size: 22px; line-height: 1.2; }
.iui-weather-day .cd { font-size: 12px; color: var(--color-text-secondary); }
.iui-weather-day .rg { font-size: 12px; font-weight: 600; }
@media (max-width: 560px) {
  .iui-weather-days { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .iui-weather-hero .temp { font-size: 44px; }
}

.iui-compare-3 {
  display: grid; gap: 12px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}
/* G1: 3 columns in the chat column; phones (≤ 520px) stack the tiers. */
@media (max-width: 520px) {
  .iui-compare-3 { grid-template-columns: 1fr; }
  .iui-compare-3 > .iui-tier.featured { order: -1; }
}
.iui-kanban-3 {
  display: grid; gap: 12px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  align-items: start;
}
/* G1: phones (≤ 520px) swipe between kanban columns instead of squeezing three. */
@media (max-width: 520px) {
  .iui-kanban-3 {
    display: flex; overflow-x: auto; scroll-snap-type: x mandatory; overscroll-behavior-x: contain;
    padding-bottom: 6px; -webkit-overflow-scrolling: touch;
  }
  .iui-kanban-3 > .iui-kanban-col { flex: 0 0 82%; scroll-snap-align: start; }
}
.iui-kanban-col {
  display: flex; flex-direction: column; gap: 8px;
  padding: 12px; border-radius: var(--border-radius-xl);
  border: 0.5px solid var(--color-border-tertiary);
  background: var(--color-background-secondary);
  min-height: 160px;
}
.iui-kanban-col-title {
  font-size: 12px; font-weight: 600; letter-spacing: 0.04em;
  text-transform: uppercase; color: var(--color-text-secondary);
  margin: 0 0 4px;
}
.iui-kanban-card {
  padding: 10px 12px; border-radius: var(--border-radius-lg);
  border: 0.5px solid var(--color-border-tertiary);
  background: var(--color-background-primary);
  font-size: 13px; color: var(--color-text-primary);
}
.iui-tier {
  display: flex; flex-direction: column; gap: 10px;
  padding: 16px; border-radius: var(--border-radius-xl);
  border: 0.5px solid var(--color-border-tertiary);
  background: var(--color-background-primary);
}
.iui-tier.featured {
  border-color: var(--color-text-primary);
  box-shadow: 0 0 0 1px var(--color-text-primary);
}
.iui-tier .price { font-size: 28px; font-weight: 700; letter-spacing: -0.03em; }
.iui-tier .price small { font-size: 13px; font-weight: 500; color: var(--color-text-secondary); }
.iui-tier ul { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 6px; }
.iui-tier li { font-size: 13px; color: var(--color-text-secondary); padding-left: 18px; position: relative; }
.iui-tier li::before { content: "✓"; position: absolute; left: 0; color: var(--color-text-success); font-weight: 600; }

#content > *, #content.initial-render > * {
  animation: fadeSlideIn 0.4s ease-out both;
}
#content > *:nth-child(1), #content.initial-render > *:nth-child(1) { animation-delay: 0s; }
#content > *:nth-child(2), #content.initial-render > *:nth-child(2) { animation-delay: 0.06s; }
#content > *:nth-child(3), #content.initial-render > *:nth-child(3) { animation-delay: 0.12s; }
#content > *:nth-child(4), #content.initial-render > *:nth-child(4) { animation-delay: 0.18s; }
#content > *:nth-child(5), #content.initial-render > *:nth-child(5) { animation-delay: 0.24s; }
#content > *:nth-child(n+6), #content.initial-render > *:nth-child(n+6) { animation-delay: 0.3s; }
.morph-enter { animation: fadeSlideIn 0.4s ease-out both; }
@keyframes fadeSlideIn {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
  }
}
`.trim()

/** D1–D8 design kit: type scale, page personalities, stat, scroll hints, equal-height cards, code tools, 3D stage. */
export const OIU_DESIGN_KIT_CSS = `
/* D1 type scale: 12 / 14 / 16 / 20 / 28 / 40 — nothing below 12px. */
/* G2: heading rhythm, Latin line height, aligned digits for numbers / prices / tables. */
h1, h2, h3, h4 { line-height: var(--lh-heading, 1.25); }
:lang(en) body { line-height: var(--lh-latin, 1.5); }
.iui-stat-value, .iui-sandbox-kpi, .iui-kpi, .price, .num, [data-iui-num], td, th, time, progress + span { font-variant-numeric: tabular-nums; }
h1 { font-size: var(--fs-lg); font-weight: 750; }
h2 { font-size: var(--fs-md); font-weight: 700; }
h3 { font-size: var(--fs-sm); font-weight: 650; }
h4 { font-size: var(--fs-xs); font-weight: 650; }
table { font-size: var(--fs-sm); }
.iui-sandbox-title, .iui-itinerary-title { font-size: var(--fs-lg); }
.iui-sandbox-sub, .iui-itinerary-sub, .iui-kanban-card, .iui-tier li, .iui-tier .price small { font-size: var(--fs-sm); }
.iui-sandbox-badge { font-size: var(--fs-xs); }
.iui-text-xs { font-size: var(--fs-xs); } .iui-text-sm { font-size: var(--fs-sm); }
.iui-text-md { font-size: var(--fs-md); } .iui-text-lg { font-size: var(--fs-lg); }
.iui-text-xl { font-size: var(--fs-xl); } .iui-text-2xl { font-size: var(--fs-2xl); }

/* D2 page personalities: put data-iui-style on the page root.
   tool 工具型/简洁 · content 内容型/杂志 · data 数据型/看板 · toy 玩具型/活泼 */
[data-iui-style] {
  color: var(--color-text-primary);
  background: var(--iui-style-bg, transparent);
  border-radius: var(--border-radius-xl);
  padding: var(--iui-style-pad, 12px);
  --iui-pack-accent: var(--accent);
  --iui-pack-tint: var(--accent-soft);
  --iui-pack-radius: var(--border-radius-lg);
  --iui-pack-radius-sm: var(--border-radius-md);
  --iui-pack-radius-control: var(--border-radius-md);
  --iui-pack-gap: var(--iui-gap, 12px);
}
[data-iui-style] a { color: var(--accent); }
[data-iui-style] input[type="checkbox"], [data-iui-style] input[type="radio"], [data-iui-style] input[type="range"] { accent-color: var(--accent-fill); }
[data-iui-style] button.primary, [data-iui-style] button[data-variant="primary"] {
  background: var(--accent-fill); border-color: var(--accent-fill); color: var(--on-accent);
}
[data-iui-style="tool"] {
  --accent: #185FA5; --accent-fill: #185FA5; --accent-soft: #E6F1FB;
  --iui-style-bg: var(--color-background-primary); --iui-style-pad: 12px; --iui-gap: 8px;
  --border-radius-md: 6px; --border-radius-lg: 8px; --border-radius-xl: 10px;
  line-height: 1.55;
}
[data-iui-style="content"] {
  --accent: #9A3412; --accent-fill: #9A3412; --accent-soft: #FBEDE3;
  --iui-style-bg: #FBF8F3; --iui-style-pad: 24px; --iui-gap: 20px;
  --border-radius-md: 4px; --border-radius-lg: 6px; --border-radius-xl: 8px;
  line-height: 1.75;
}
[data-iui-style="content"] h1, [data-iui-style="content"] h2, [data-iui-style="content"] h3 { font-family: var(--font-serif); letter-spacing: -0.01em; }
[data-iui-style="content"] h1 { font-size: var(--fs-xl); }
[data-iui-style="content"] p { max-width: 68ch; }
[data-iui-style="data"] {
  --accent: #4338CA; --accent-fill: #4338CA; --accent-soft: #EEF0FF;
  --iui-style-bg: var(--color-background-secondary); --iui-style-pad: 16px; --iui-gap: 12px;
  --border-radius-md: 8px; --border-radius-lg: 10px; --border-radius-xl: 12px;
  font-variant-numeric: tabular-nums; line-height: 1.5;
}
[data-iui-style="toy"] {
  --accent: #C2185B; --accent-fill: #D6336C; --accent-soft: #FDE7EF;
  --iui-style-bg: linear-gradient(160deg, #FFF4E6, #FDE7EF); --iui-style-pad: 20px; --iui-gap: 16px;
  --border-radius-md: 14px; --border-radius-lg: 20px; --border-radius-xl: 28px;
}
[data-iui-style="toy"] button { border-radius: 999px; }
@media (prefers-color-scheme: dark) {
  [data-iui-style="tool"] { --accent: #85B7EB; --accent-soft: #0C447C; }
  [data-iui-style="content"] { --accent: #F0A27A; --accent-fill: #C2410C; --accent-soft: #4A2412; --iui-style-bg: #201D19; }
  [data-iui-style="data"] { --accent: #A5B4FC; --accent-fill: #4F46E5; --accent-soft: #26245A; }
  [data-iui-style="toy"] { --accent: #F48FB1; --accent-soft: #4A1A2E; --iui-style-bg: linear-gradient(160deg, #2A1F17, #2C1822); }
}

/* D3 stat: big number on top, small caption below (never one line). */
.iui-stats { display: grid; gap: var(--iui-gap, 12px); grid-template-columns: repeat(auto-fit, minmax(min(132px, 100%), 1fr)); }
.iui-stat { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.iui-stats > .iui-stat {
  padding: 12px 14px; border-radius: var(--border-radius-lg);
  background: var(--color-background-primary); border: 0.5px solid var(--color-border-tertiary);
}
.iui-stat-value {
  font-size: var(--fs-xl); font-weight: 700; line-height: 1.1; letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums; color: var(--color-text-primary);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.iui-stat-value .unit, .iui-stat .unit, .iui-sandbox-kpi .value .unit {
  font-size: 0.5em; font-weight: 600; opacity: 0.6; margin-left: 0.15em; letter-spacing: 0;
}
.iui-stat-label { font-size: var(--fs-xs); line-height: 1.4; color: var(--color-text-secondary); }
.iui-stat-delta { font-size: var(--fs-xs); font-weight: 600; color: var(--color-text-success); }
.iui-stat-delta.down, .iui-stat-delta[data-dir="down"] { color: var(--color-text-danger); }
.iui-stat.lg .iui-stat-value { font-size: var(--fs-2xl); }
.iui-stat.sm .iui-stat-value { font-size: var(--fs-lg); }
.iui-sandbox-kpi .value { font-variant-numeric: tabular-nums; }

/* G5 hero + state components: one hero block, empty / loading / sample-data states. */
.iui-hero {
  display: flex; flex-direction: column; gap: var(--space-2); padding: var(--space-5) var(--space-5);
  border-radius: var(--border-radius-xl); background: var(--accent-soft); color: var(--color-text-primary);
}
.iui-hero .iui-stat-value, .iui-hero-value { font-size: var(--fs-2xl); font-weight: 750; line-height: 1.05; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
.iui-hero-label { font-size: var(--fs-sm); color: var(--color-text-secondary); }
.iui-empty {
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--space-2);
  padding: var(--space-7) var(--space-4); text-align: center; font-size: var(--fs-sm); color: var(--color-text-secondary);
  border: 1px dashed var(--color-border-secondary); border-radius: var(--border-radius-lg);
}
.iui-empty > strong, .iui-empty > b { font-size: var(--fs-md); color: var(--color-text-primary); }
.iui-skeleton {
  position: relative; overflow: hidden; min-height: 12px; border-radius: var(--border-radius-md);
  background: var(--color-background-secondary); color: transparent !important;
}
.iui-skeleton::after {
  content: ""; position: absolute; inset: 0; transform: translateX(-100%);
  background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--color-background-primary) 65%, transparent), transparent);
  animation: iuiSkeleton 1.4s ease-in-out infinite;
}
@keyframes iuiSkeleton { to { transform: translateX(100%); } }
@media (prefers-reduced-motion: reduce) { .iui-skeleton::after { animation: none; } }
.iui-badge-sample {
  display: inline-flex; align-items: center; gap: 4px; padding: 1px 8px; border-radius: 999px; vertical-align: middle;
  font-size: var(--fs-xs); font-weight: 600; line-height: 1.6; color: var(--color-text-warning); background: var(--color-background-warning);
}
.iui-badge-sample:empty::before { content: "示例数据"; }
:lang(en) .iui-badge-sample:empty::before { content: "Sample data"; }

/* D4 horizontal scroll hints (bridge sets data-iui-scroll-fade="l r" + indicator vars). */
[data-iui-scroll-fade] {
  --iui-fade-l: 0px; --iui-fade-r: 0px;
  -webkit-mask-image: linear-gradient(to right, transparent 0, #000 var(--iui-fade-l), #000 calc(100% - var(--iui-fade-r)), transparent 100%);
  mask-image: linear-gradient(to right, transparent 0, #000 var(--iui-fade-l), #000 calc(100% - var(--iui-fade-r)), transparent 100%);
}
[data-iui-scroll-fade~="l"] { --iui-fade-l: 28px; }
[data-iui-scroll-fade~="r"] { --iui-fade-r: 28px; }
[data-iui-scroll-ind] {
  background-image: linear-gradient(var(--iui-scroll-ind-color, color-mix(in srgb, var(--accent-fill, #185FA5) 55%, transparent)), var(--iui-scroll-ind-color, color-mix(in srgb, var(--accent-fill, #185FA5) 55%, transparent)));
  background-repeat: no-repeat;
  background-size: var(--iui-scroll-w, 0%) 3px;
  background-position: var(--iui-scroll-x, 0%) 100%;
}

/* D5 equal-height card grids + line clamps. */
.iui-card-grid {
  display: grid; gap: var(--iui-gap, 12px); align-items: stretch;
  grid-template-columns: repeat(auto-fill, minmax(min(200px, 100%), 1fr));
}
.iui-card-grid > * { display: flex; flex-direction: column; min-width: 0; height: 100%; }
.iui-card-foot, .iui-card-grid > * > .cta, .iui-tier > button:last-child, .iui-tier > .cta { margin-top: auto; }
.iui-clamp-1, .iui-clamp-2, .iui-clamp-3,
.iui-card-title,
.iui-hotel-card .name, .iui-product-card .name, .iui-place-card .name, .iui-cover-card .name,
.iui-card-summary,
.iui-hotel-card .summary, .iui-product-card .summary, .iui-place-card .summary, .iui-cover-card .summary,
.iui-hotel-card .desc, .iui-product-card .desc, .iui-place-card .desc, .iui-cover-card .desc,
.iui-stop-card .meta {
  display: -webkit-box; -webkit-box-orient: vertical; overflow: hidden;
}
.iui-clamp-1, .iui-stop-card .meta { -webkit-line-clamp: 1; line-clamp: 1; }
.iui-clamp-2, .iui-card-title,
.iui-hotel-card .name, .iui-product-card .name, .iui-place-card .name, .iui-cover-card .name { -webkit-line-clamp: 2; line-clamp: 2; }
.iui-clamp-3, .iui-card-summary,
.iui-hotel-card .summary, .iui-product-card .summary, .iui-place-card .summary, .iui-cover-card .summary,
.iui-hotel-card .desc, .iui-product-card .desc, .iui-place-card .desc, .iui-cover-card .desc { -webkit-line-clamp: 3; line-clamp: 3; }
.iui-card-title { font-size: var(--fs-md); font-weight: 600; line-height: 1.35; }
.iui-card-summary { font-size: var(--fs-sm); line-height: 1.5; color: var(--color-text-secondary); }

/* D6: card numbers match the pin colors. */
.iui-stop-card .num { background: var(--iui-pin-color, var(--accent-fill, #185FA5)); color: #fff; }

/* D8 code blocks: wrap toggle + copy (bridge wraps <pre> in .iui-code-wrap). */
:where(pre:not(.mermaid)) {
  font: 13px/1.55 var(--font-mono); tab-size: 2;
  background: var(--color-background-secondary); color: var(--color-text-primary);
  border: 0.5px solid var(--color-border-tertiary); border-radius: var(--border-radius-lg);
  padding: 12px 14px; overflow: auto; margin: 0 0 8px;
}
.iui-code-wrap { position: relative; margin: 0 0 8px; min-width: 0; max-width: 100%; }
.iui-code-wrap > pre { margin: 0; }
.iui-code-wrap[data-wrap="1"] > pre { white-space: pre-wrap; overflow-wrap: anywhere; word-break: break-word; }
.iui-code-tools {
  display: flex; justify-content: flex-end; gap: 4px; margin: 0 0 4px;
}
.iui-code-tools > button {
  min-height: 26px; padding: 2px 10px; font: 500 12px/1.4 var(--font-sans);
  border-radius: 6px; background: var(--color-background-primary); color: var(--color-text-secondary);
  border: 0.5px solid var(--color-border-secondary); box-shadow: none; transform: none;
}
.iui-code-tools > button:hover { background: var(--color-background-secondary); color: var(--color-text-primary); transform: none; box-shadow: none; }
.iui-code-tools > button[aria-pressed="true"] { color: var(--accent); border-color: var(--accent); }

/* D7 3D stage: fixed-height frame + loading placeholder until data-iui-3d-ready. */
.iui-3d-wrap {
  position: relative; height: 320px; border-radius: var(--border-radius-xl); overflow: hidden;
  background: radial-gradient(120% 90% at 50% 20%, var(--color-background-primary), var(--color-background-tertiary));
  border: 0.5px solid var(--color-border-tertiary);
}
.iui-3d-wrap canvas { display: block; width: 100% !important; height: 100% !important; touch-action: none; }
.iui-3d-loading {
  position: absolute; inset: 0; display: flex; flex-direction: column; gap: 10px;
  align-items: center; justify-content: center; font-size: var(--fs-xs); color: var(--color-text-secondary);
  pointer-events: none; transition: opacity 0.25s ease;
}
.iui-3d-loading::before {
  content: ""; width: 28px; height: 28px; border-radius: 50%;
  border: 3px solid var(--color-border-tertiary); border-top-color: var(--accent-fill, #185FA5);
  animation: iuiSpin 0.9s linear infinite;
}
.iui-3d-wrap[data-iui-3d-ready] .iui-3d-loading { opacity: 0; }
.iui-3d-wrap[data-iui-3d-error] .iui-3d-loading::before { display: none; }
@keyframes iuiSpin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .iui-3d-loading::before { animation: none; } }
`.trim()

/**
 * F23 accessibility + action layout (last layer, so it wins over form / kit styles):
 * visible keyboard focus ring, global reduced-motion fallback, 32px minimum targets,
 * accent-filled primary buttons and a right-aligned `.iui-actions` footer.
 */
export const OIU_A11Y_CSS = `
:focus-visible { outline: 2px solid var(--accent-fill, #185FA5); outline-offset: 2px; }
:focus:not(:focus-visible) { outline: none; }
input:focus-visible, textarea:focus-visible, select:focus-visible { outline: 2px solid var(--accent-fill, #185FA5); outline-offset: 1px; }
[data-iui-kbd]:focus-visible { border-radius: var(--border-radius-md, 8px); }
:where(span, a, i, b, em, strong, small, label)[data-iui-kbd] { display: inline-flex; align-items: center; }
button:not(.leaflet-container *), [role="button"]:not(.leaflet-container *):not(svg *), select, .iui-sandbox-tab, .iui-code-tools > button { min-height: 32px; }
button:not(.leaflet-container *) { min-width: 32px; }
input[type="checkbox"], input[type="radio"] { width: 18px; height: 18px; accent-color: var(--accent-fill, #185FA5); }
label:has(> input[type="checkbox"]), label:has(> input[type="radio"]) { display: inline-flex; align-items: center; gap: 6px; min-height: 32px; cursor: pointer; }
button.primary, button[data-variant="primary"], button[type="submit"]:not(.secondary):not(.ghost) {
  background: var(--accent-fill, #185FA5); border-color: var(--accent-fill, #185FA5); color: var(--on-accent, #fff); font-weight: 600;
}
button.primary:hover, button[type="submit"]:not(.secondary):not(.ghost):hover { background: var(--accent-fill, #185FA5); opacity: 0.92; }
.iui-actions { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 8px; margin-top: 12px; }
.iui-actions > .iui-actions-spacer { flex: 1; }
.iui-actions > button { min-height: 40px; padding-inline: 18px; }
.iui-actions > button.primary, .iui-actions > button[type="submit"] { min-width: 112px; }
@media (max-width: 480px) { .iui-actions > button { flex: 1 1 auto; } }
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important; animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important; transition-delay: 0s !important; scroll-behavior: auto !important;
  }
}
`.trim()

/** Full injected design-system CSS block. */
export function buildOiuDesignSystemCss(): string {
  return `${OIU_THEME_CSS}\n${OIU_SVG_CLASSES_CSS}\n${OIU_FORM_STYLES_CSS}\n${OIU_DESIGN_KIT_CSS}\n${OIU_POLISH_CSS}\n${OIU_A11Y_CSS}`
}

/** CDN import map for common libs (pinned; see vendor-registry). Leaflet = UMD auto-inject. */
export const OIU_IMPORTMAP = buildVendorImportMap()

export function buildOiuImportmapScriptTag(assetBase?: string): string {
  return `<script type="importmap">${JSON.stringify(buildVendorImportMap(assetBase))}</script>`
}

/**
 * Self-contained trip pin-drop animator for itinerary sandboxes.
 * Installed as window.createTripAnimator inside the sandbox.
 */
export function createTripAnimatorSource(): string {
  // Keep as a plain function body string so it serializes into the iframe.
  return `function createTripAnimator(options) {
  var stopCount = options.stopCount, onFrame = options.onFrame, onState = options.onState;
  var duration = options.durationMs != null ? options.durationMs : 6000;
  if (!Number.isInteger(stopCount) || stopCount < 2 || stopCount > 30)
    throw new Error("A trip needs 2–30 stops.");
  if (!Number.isFinite(duration) || duration < 1000 || duration > 120000)
    throw new Error("Trip duration must be between 1 and 120 seconds.");
  // Leaflet marker.getElement() is often still null on first paint. A truthy
  // pinElements array with holes must not throw. If the array is empty, adopt
  // .iui-pin-dot nodes already in the map pane.
  function resolvePins() {
    var out = [];
    var pins = options.pinElements;
    if (pins && typeof pins.forEach === 'function') {
      pins.forEach(function (pin) { if (pin) out.push(pin); });
    }
    if (out.length === 0) {
      var dots = document.querySelectorAll('.iui-pin-dot');
      for (var d = 0; d < dots.length; d++) out.push(dots[d]);
    }
    return out;
  }
  function eachPin(fn) {
    resolvePins().forEach(function (pin, index) {
      if (!pin) return;
      try { fn(pin, index); } catch (e) {}
    });
  }
  function showPins() {
    eachPin(function (pin, index) {
      if (!pin.textContent || !String(pin.textContent).trim()) pin.textContent = String(index + 1);
      if (pin.style) { pin.style.opacity = '1'; pin.style.transform = 'none'; }
    });
  }
  showPins();
  var elapsed = 0, lastTime = null, frameId = null, playing = false, disposed = false;
  function reduceMotion() {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }
  function emit() {
    var progress = Math.min(1, elapsed / duration);
    var step = progress * (stopCount - 1);
    var fromIndex = Math.min(stopCount - 2, Math.floor(step));
    var travel = Math.min(1, (step - fromIndex) / 0.8);
    var fraction = travel * travel * (3 - 2 * travel);
    var pinStep = progress * stopCount;
    var pinIndex = Math.min(stopCount - 1, Math.floor(pinStep));
    var pinProgress = progress === 1 ? 1 : Math.min(1, (pinStep - pinIndex) / 0.55);
    eachPin(function (pin, index) {
      if (!pin.style) return;
      if (!playing && elapsed === 0) {
        pin.style.opacity = "1";
        pin.style.transform = "none";
        return;
      }
      var landing = index < pinIndex ? 1 : index === pinIndex ? pinProgress : 0;
      var t = landing - 1;
      var ease = 1 + 2.2 * t * t * t + 1.2 * t * t;
      pin.style.opacity = landing > 0 ? "1" : "0";
      pin.style.transform = "translateY(" + (-18 * (1 - ease)) + "px) scale(" + (0.72 + 0.28 * ease) + ")";
    });
    onFrame({
      progress: progress, fromIndex: fromIndex, toIndex: fromIndex + 1, fraction: fraction,
      activeStop: pinIndex, pinIndex: pinIndex, pinProgress: pinProgress
    });
  }
  function pause() {
    if (disposed) return;
    playing = false; lastTime = null;
    if (frameId !== null) cancelAnimationFrame(frameId);
    frameId = null;
    if (onState) onState(elapsed >= duration ? "complete" : "paused");
  }
  function tick(time) {
    if (!playing || disposed) return;
    if (lastTime !== null) elapsed = Math.min(duration, elapsed + Math.max(0, time - lastTime));
    lastTime = time;
    emit();
    if (elapsed >= duration) pause();
    else frameId = requestAnimationFrame(tick);
  }
  function play() {
    if (disposed || playing) return;
    if (reduceMotion()) { elapsed = duration; emit(); if (onState) onState("complete"); return; }
    if (elapsed >= duration) return;
    playing = true; lastTime = null;
    if (onState) onState("playing");
    frameId = requestAnimationFrame(tick);
  }
  function seek(stop) {
    if (disposed) return;
    if (!Number.isInteger(stop) || stop < 0 || stop >= stopCount)
      throw new Error("Stop index is outside this trip.");
    pause();
    elapsed = stop === stopCount - 1 ? duration : duration * (stop + 0.6) / stopCount;
    emit();
    if (onState) onState(elapsed >= duration ? "complete" : "paused");
  }
  function refreshMaps() {
    try {
      if (options.map && typeof options.map.invalidateSize === 'function') {
        try { options.map.invalidateSize({ animate: false }); } catch (e0) { options.map.invalidateSize(); }
        try {
          options.map.eachLayer(function (layer) {
            if (layer && typeof layer.redraw === 'function') layer.redraw();
          });
        } catch (e1) {}
      }
    } catch (e) {}
    try {
      if (window.L && typeof L.iuiRefreshMaps === 'function') L.iuiRefreshMaps('animator-replay');
    } catch (e2) {}
  }
  function replay() {
    if (disposed) return;
    pause(); elapsed = 0; emit();
    refreshMaps();
    play();
    setTimeout(refreshMaps, 80);
    setTimeout(refreshMaps, 320);
    setTimeout(refreshMaps, 800);
  }
  function onVisibility() { if (document.hidden) pause(); }
  function dispose() {
    if (disposed) return;
    pause(); disposed = true;
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pagehide", dispose);
  }
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pagehide", dispose);
  if (reduceMotion()) elapsed = duration;
  emit();
  setTimeout(showPins, 0);
  setTimeout(showPins, 160);
  setTimeout(showPins, 480);
  return { play: play, pause: pause, replay: replay, seek: seek, dispose: dispose };
}`
}

export function buildTripAnimatorScriptTag(): string {
  return `<script>window.createTripAnimator=${createTripAnimatorSource()};<\/script>`
}

/**
 * Agent-facing design skill (trip/pricing/weather patterns). Injected via system prompt.
 */
export const OIU_DESIGN_SKILL = `
The sandbox already includes a shared design system. Build on it — do NOT restyle from scratch.

Colors (use CSS variables for text/surfaces; one topic colour via the \`accent:\` header line):
- Surfaces: --color-background-primary / secondary / tertiary
- Text: --color-text-primary / secondary / tertiary
- Semantic: --color-background-info|danger|success|warning + matching --color-text-* / --color-border-*
- Fonts: --font-sans / --font-serif / --font-mono
- Radii: --border-radius-md / lg / xl
- Dark mode is automatic via these variables.

Form controls (button, input, textarea, select, range, checkbox, radio) are pre-styled — do not restyle basics.

Type scale (ONLY these sizes; nothing below 12px): --fs-xs 12 / --fs-sm 14 / --fs-md 16 / --fs-lg 20 / --fs-xl 28 / --fs-2xl 40.
Body text contrast ≥ 4.5:1 (large ≥ 3:1) — use --color-text-* on --color-background-*.

Page personality (put on the page root): data-iui-style="tool" (工具型·简洁) | "content" (内容型·杂志) | "data" (数据型·看板) | "toy" (玩具型·活泼).
It sets --accent / --accent-fill / --accent-soft, background, radii and density. Use var(--accent) for highlights instead of a hardcoded brand color.
ONE visual hero per page (a lead photo, one big number, one chart, or the playable object) — everything else is quieter.

Stats: <div class="iui-stat"><div class="iui-stat-value">128<span class="unit">ms</span></div><div class="iui-stat-label">P95 延迟</div></div>
(.iui-stats grid for several; .iui-stat.lg / .sm; optional .iui-stat-delta[.down]). Number on top, caption below — never "128 次访问" in one line.
Cards side by side: .iui-card-grid (equal height); .iui-card-title clamps to 2 lines, .iui-card-summary to 3; .iui-card-foot sticks to the bottom; .iui-clamp-1/2/3 helpers.
Host auto-adds: edge fades + indicator on horizontal scrollers; 换行/复制 tools on <pre> (opt out: data-iui-no-tools).
3D: use the host stage — <div data-iui-3d='{"model":"polyhaven:ArmChair_01","hotspots":[{"id":"seat","label":"坐垫","at":[0,0.1,0.6],"text":"…"}]}'></div>
("model": "polyhaven:ID" | "khronos:Name" | an https .glb on jsDelivr or GitHub raw, from find_3d_models — never invent IDs; or "shape": torusKnot|sphere|box|icosahedron|torus|cone|cylinder|capsule).
The host does lights + soft shadow, auto-fit, damped OrbitControls, keyboard, Ctrl+wheel zoom, pins with camera fly, loading % and fallback.
Options: ground plinth|shadow|none, view [az,el], autoRotate, cursor "look", animation true|"Clip", color. Text layers: child with data-iui-3d-layer="back|front".
Events iui3d:ready / iui3d:hotspot (detail.id, label, spec); API window.iuiStage3d(el).then(s => s.focus('seat') / s.reset() / s.play()).
Hand-write three.js only for custom scenes: canvas inside .iui-3d-wrap + .iui-3d-loading, set data-iui-3d-ready on first frame, fit by projecting vertices.

SVG diagrams: use .c-purple .c-teal .c-coral .c-pink .c-gray .c-blue .c-green .c-amber .c-red plus .box .node .arr .leader and text .t .ts .th.

Layout helpers already injected:
- .iui-itinerary / .iui-map-wrap / .iui-cards-strip / .iui-stop-card / .iui-chip / .iui-map-chrome
- .iui-compare-3 / .iui-tier / .iui-tier.featured  (3 columns; stacks on phones ≤520px)
- .iui-kanban-3 / .iui-kanban-col / .iui-kanban-col-title / .iui-kanban-card  (3-col boards; scroll horizontally on phones)
- .iui-weather / .iui-weather-hero / .iui-weather-chip / .iui-weather-chart / .iui-weather-days
- .iui-actions  (right-aligned action footer: secondary buttons first, one button.primary last; full-width on phones)
- Icons (local Lucide, no emoji in UI chrome): <i data-iui-icon="map-pin"></i> or <svg class="iui-icon"><use href="#i-map-pin"/></svg>; size = font-size, colour = currentColor; .iui-icon-tile = soft accent square behind a feature icon
- .iui-cols-2 / .iui-cols-3 / .iui-cols-4  (equal columns with built-in breakpoints: 4→2 at ≤560px, all→1 at ≤480px; no horizontal overflow at 360px)
- Legacy kit still works: .iui-sandbox-card .iui-sandbox-grid .iui-sandbox-kpi .iui-sandbox-compare …

css parameter = widget-specific styles ONLY (theme/forms/SVG already loaded).

Importmap provides bare imports: three, gsap, d3 (chart.js map kept for compat). Prefer host-injected UMD globals: Chart (chart.js) and L (Leaflet) — do NOT rely on import("chart.js") or import("leaflet") in srcdoc (flaky → blank charts/maps). Author JS is classic eval, not a module: never \`import … from\` or \`typeof import\`. Load Three with import('three').then(...) or an async IIFE await import('three'). Load other CDN libs inside async functions (no top-level await in classic js).

## Pattern — maps / multi-stop (Nanjing density, not a frozen city template)
Lock the structure, not the copy. Any map with 2+ places (trip, 探店, 一日游, 景点详解) MUST ship:
1) REAL Leaflet in .iui-map-wrap (height 300px, colored muted basemap; data-iui-map-style="mono" only if asked). Pause/Replay chrome.
2) Numbered L.divIcon pins (.iui-pin-dot, data-cat="food|sight|hotel|shop|nature|culture|transport" colors them; .active = selected → bigger, ringed, on top). Host spreads overlapping pins apart. createTripAnimator — do not invent timers. Filter null getElement() before pinElements.
3) Horizontal .iui-cards-strip + .iui-stop-card (photo 110px + number + name + one-line). Extra cards SCROLL inside the first rounded frame (host sets min-width:0).
4) Click pin OR card opens an in-page detail sheet: 停留 / 票或预约 / 怎么去 / 避坑 (plus a why line). Do not leave the map as pins-only.
Single-place maps may skip the strip/animator; still real Leaflet + one marker + that place's detail.
Optional only when the ask has the data: day timeline, lodging .iui-compare-3, budget. NEVER force a 3-day Nanjing layout onto 探店/天气/单点.
- Host installs window.createTripAnimator:
  createTripAnimator({ stopCount, durationMs:6000, pinElements, map, onFrame, onState })
  → play()/pause()/replay()/seek(i)/dispose(). Pass map so replay() invalidateSize/redraws tiles.
- On activateStop: highlight card (aria-current), strip.scrollLeft to card offset (not scrollIntoView), fill the detail sheet, update status.
- Label polyline "示意行程连线 — 非核实驾车路线". Approximate coords OK if labeled.
- Map tiles (REQUIRED): Esri World Street Map (host mutes saturation slightly) https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x} (z/y/x) {attribution:'Tiles © Esri',maxZoom:19}. Host auto-falls back on tileerror (OSM FR HOT → Esri Light Gray). Never World_Topo_Map, tile.openstreetmap.org, or basemaps.cartocdn.com. scrollWheelZoom:false; invalidateSize after setup. Pins must stay visible (do not rely on opacity:0 CSS).
- Photos (REQUIRED on every itinerary stop card AND hotel/product/place/cover card):
  1) Prefer tool get_trip_stop_images or get_place_images({ wikipedia_titles: [...], coordinates: [{lat,lng}...] }) BEFORE the fence
     for ANY destination / hotel / cover. Only photos that demonstrably show the place come back (Commons file/description/
     categories name it, or within 300 m). Put image_url into .photo / .cover img + collapsed credit:
     <div class="iui-photo-credit"><a href="credit_url" title="artist · license">ⓘ 图片来自 Wikimedia</a></div> — never a file name.
  2) Unavailable / unsure → leave the .photo band EMPTY and put data-lat/data-lng on the card: the host draws a designed
     placeholder (category icon on an accent gradient). NEVER substitute a nearby or more famous place's photo
     (愚园路 ≠ 静安寺, a 安福路 café ≠ 外滩). A city photo is fine only for a whole-city stop.
  3) Host ALSO auto-fills .photo/.cover (strict well-known aliases + verified Wikipedia/Commons lookup, 300 m geo check)
     for .iui-stop-card / .iui-hotel-card / .iui-product-card / .iui-place-card / .iui-cover-card / [data-iui-place].
     Model-invented Commons filenames are replaced when they 404. Prefer loading=eager on stop photos.
     NEVER invent Unsplash/random hosts; no photo → leave the band empty (host placeholder), never a grey block.
  Never invent live traffic/hours.

## Pattern — hotel / product / place covers (non-itinerary)
Use .iui-hotel-card / .iui-product-card / .iui-place-card / .iui-cover-card with a .photo or .cover band
+ .name (or data-iui-place="Tokyo"). Same Wikimedia rules as itinerary stops. Host enrich+fill applies.

## Pattern — pricing / compare (3 columns)
Wrap tiers in <div class="iui-compare-3"> with three .iui-tier (one .featured). Each: plan name, .price + <small>/月</small>, feature <ul><li>, CTA button. Three columns side by side; host CSS stacks them on phones (≤520px) with the featured tier first.

## Pattern — kanban board (3 columns)
Use <div class="iui-kanban-3"> with three .iui-kanban-col (each .iui-kanban-col-title + .iui-kanban-card items). Move cards via buttons (local JS only). On phones (≤520px) the host turns the board into a horizontal scroll-snap strip.

## Pattern — weather (dense dashboard)
Hero first, then detail — a bare 3-KPI strip reads unfinished. Structure:
1) Hero band (.iui-weather-hero): city+date, LARGE temp (≥48px), condition icon, high/low.
2) Detail chips (.iui-weather-chip): feels-like, humidity, wind, AQI (or UV).
3) Hourly Chart.js line in a fixed-height (~200px) wrapper (.iui-weather-chart) — use global Chart / window.iuiCreateChart(canvas, cfg) (UMD injected); maintainAspectRatio:false; never leave the canvas blank. Chart cfg MUST parse (var cfg={type,data,options:{scales:{x,y,y1}}}; — count the closing braces; a missing } before ; is SyntaxError Unexpected token ';' ; closing the object with ) instead of } is Unexpected token ')').
4) 7-day row (.iui-weather-days > .iui-weather-day): icon + cond + hi/lo; click switches hero (local JS).
Use token colors only; soft info gradient on hero. Label sample data if not live.

## Pattern — calculators / charts
Real defaults on first paint; Chart.js/ECharts with maintainAspectRatio:false and fixed-height wrapper (220–320px). Validate finite numbers; no NaN.

## Pattern — filterable table (AG Grid only)
Use ONLY when the ask is a sortable/filterable multi-column sheet (名单、排行、明细). agGrid.createGrid(el, {columnDefs, rowData}); el class = ag-theme-quartz ag-theme-iui. Few rows: domLayout autoHeight. Host injects ag-grid-community + quartz and paints --ag-* from --color-*. NEVER wrap a 3-row budget table or itinerary facts in AG Grid.

## Pattern — mindmap (Mermaid)
<pre class="mermaid iui-mindmap">mindmap\\n  root((主题))\\n</pre> then mermaid.run. Host injects mermaid UMD and initializes themeVariables from --color-*. Do not emit ASCII trees or nested Markdown lists as the mindmap.

## Bridge
window.iuiSandbox.sendPrompt(text) / openLink(url) / action(name,payload) — only on user click, never on load.
Official sites (气象局 / booking / maps): openLink(httpsUrl) or data-iui-open-link. NEVER action('sandbox_open_link') — host opens the URL locally and must not [genui-action] a new page.
`.trim()
