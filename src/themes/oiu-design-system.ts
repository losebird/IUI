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
  --color-border-tertiary: rgba(0, 0, 0, 0.15);
  --color-border-info: #185FA5;
  --color-border-danger: #A32D2D;
  --color-border-success: #3B6D11;
  --color-border-warning: #854F0B;

  --font-sans: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --font-serif: Georgia, "Times New Roman", serif;
  --font-mono: "SF Mono", "Fira Code", "Fira Mono", monospace;

  --border-radius-md: 8px;
  --border-radius-lg: 12px;
  --border-radius-xl: 16px;

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
  --iui-pack-accent: var(--color-text-info);
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
  --iui-pack-elev: 0 1px 2px rgba(0,0,0,0.04);
  --iui-pack-elev-2: 0 4px 12px rgba(0,0,0,0.06);
  --dsl-g-fg: var(--color-text-primary);
  --dsl-g-bg: var(--color-background-primary);
  --dsl-g-surface: var(--color-background-primary);
  --dsl-g-muted-fg: var(--color-text-secondary);
  --dsl-g-border: var(--color-border-tertiary);
  --iui-chart-1: #185FA5;
  --iui-chart-2: #3B6D11;
  --iui-chart-3: #854F0B;
  --iui-chart-4: #A32D2D;
  --iui-chart-5: #534AB7;
  --iui-chart-6: #0F6E56;
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
  line-height: 1.7;
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
.iui-itinerary-head { display: flex; flex-wrap: wrap; gap: 8px; align-items: baseline; justify-content: space-between; }
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
.iui-map-wrap .leaflet-container,
.leaflet-container {
  height: 100%; width: 100%; min-height: 280px;
  filter: grayscale(1) contrast(1.12) brightness(1.02);
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
  align-items: center; justify-content: center; font-size: 11px; font-weight: 600;
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
  font-size: 11px; line-height: 1.35; padding: 4px 10px 8px;
  color: var(--color-text-tertiary, #9ca3af);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.iui-photo-credit a { color: inherit; text-decoration: none; }
.iui-photo-credit a:hover, .iui-photo-credit a:focus-visible { text-decoration: underline; text-underline-offset: 2px; }
.iui-pin-dot {
  display: flex; align-items: center; justify-content: center;
  width: 26px; height: 26px; border-radius: 50%;
  background: #fff; color: #111; font: 600 12px var(--font-sans);
  border: 2px solid #111; box-shadow: 0 1px 3px rgba(0,0,0,0.2);
  opacity: 1;
}
/* Pins stay visible even if createTripAnimator never gets the DOM.
   Drop animation uses inline opacity only while playing. */
.iui-pin-dot.active, .iui-itinerary .iui-pin-dot.active { background: #111; color: #fff; }

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
  background: linear-gradient(135deg, var(--color-background-info), var(--color-background-secondary));
  border: 1px solid var(--color-border-tertiary);
}
.iui-weather-hero .temp {
  font-size: 56px; font-weight: 700; letter-spacing: -0.04em; line-height: 1;
  color: var(--color-text-primary);
}
.iui-weather-hero .meta { display: flex; flex-direction: column; gap: 6px; align-items: flex-end; text-align: right; }
.iui-weather-hero .icon { font-size: 42px; line-height: 1; }
.iui-weather-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
.iui-weather-chip {
  padding: 8px 12px; border-radius: 999px;
  background: var(--color-background-secondary);
  border: 1px solid var(--color-border-tertiary);
  font-size: 12px; color: var(--color-text-secondary);
}
.iui-weather-chip strong { color: var(--color-text-primary); font-weight: 600; margin-left: 4px; }
.iui-weather-chart { height: 200px; position: relative; padding: 8px 4px 0; }
.iui-weather-days { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 8px; }
.iui-weather-day {
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  padding: 10px 4px; border-radius: var(--border-radius-lg);
  border: 1px solid var(--color-border-tertiary);
  background: var(--color-background-primary); cursor: pointer; font: inherit; color: inherit;
}
.iui-weather-day[aria-current="true"] {
  border-color: var(--color-border-info);
  background: var(--color-background-info);
  box-shadow: 0 0 0 1px var(--color-border-info);
}
.iui-weather-day .wd { font-size: 12px; font-weight: 600; }
.iui-weather-day .dt { font-size: 10px; color: var(--color-text-tertiary); }
.iui-weather-day .ic { font-size: 22px; line-height: 1.2; }
.iui-weather-day .cd { font-size: 11px; color: var(--color-text-secondary); }
.iui-weather-day .rg { font-size: 11px; font-weight: 600; }
@media (max-width: 560px) {
  .iui-weather-days { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .iui-weather-hero .temp { font-size: 44px; }
}

.iui-compare-3 {
  display: grid; gap: 12px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}
/* Chat bubbles are ~680px; 720px mq collapsed pricing to 1 col. Keep 3-col until phone-narrow. */
@media (max-width: 480px) {
  .iui-compare-3 { grid-template-columns: 1fr; }
}
.iui-kanban-3 {
  display: grid; gap: 12px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  align-items: start;
}
@media (max-width: 480px) {
  .iui-kanban-3 { grid-template-columns: 1fr; }
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

/** Full injected design-system CSS block. */
export function buildOiuDesignSystemCss(): string {
  return `${OIU_THEME_CSS}\n${OIU_SVG_CLASSES_CSS}\n${OIU_FORM_STYLES_CSS}`
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

Colors (ALWAYS use CSS variables — never hardcode hex for text/backgrounds):
- Surfaces: --color-background-primary / secondary / tertiary
- Text: --color-text-primary / secondary / tertiary
- Semantic: --color-background-info|danger|success|warning + matching --color-text-* / --color-border-*
- Fonts: --font-sans / --font-serif / --font-mono
- Radii: --border-radius-md / lg / xl
- Dark mode is automatic via these variables.

Form controls (button, input, textarea, select, range, checkbox, radio) are pre-styled — do not restyle basics.

SVG diagrams: use .c-purple .c-teal .c-coral .c-pink .c-gray .c-blue .c-green .c-amber .c-red plus .box .node .arr .leader and text .t .ts .th.

Layout helpers already injected:
- .iui-itinerary / .iui-map-wrap / .iui-cards-strip / .iui-stop-card / .iui-chip / .iui-map-chrome
- .iui-compare-3 / .iui-tier / .iui-tier.featured  (MUST be 3 side-by-side columns in chat bubbles)
- .iui-kanban-3 / .iui-kanban-col / .iui-kanban-col-title / .iui-kanban-card  (3-col boards)
- .iui-weather / .iui-weather-hero / .iui-weather-chip / .iui-weather-chart / .iui-weather-days
- Legacy kit still works: .iui-sandbox-card .iui-sandbox-grid .iui-sandbox-kpi .iui-sandbox-compare …

css parameter = widget-specific styles ONLY (theme/forms/SVG already loaded).

Importmap provides bare imports: three, gsap, d3 (chart.js map kept for compat). Prefer host-injected UMD globals: Chart (chart.js) and L (Leaflet) — do NOT rely on import("chart.js") or import("leaflet") in srcdoc (flaky → blank charts/maps). Author JS is classic eval, not a module: never \`import … from\` or \`typeof import\`. Load Three with import('three').then(...) or an async IIFE await import('three'). Load other CDN libs inside async functions (no top-level await in classic js).

## Pattern — maps / multi-stop (Nanjing density, not a frozen city template)
Lock DENSITY, not copy. Any map with 2+ places (trip, 探店, 一日游, 景点详解) MUST ship:
1) REAL Leaflet in .iui-map-wrap (height 300px, grayscale). Pause/Replay chrome.
2) Numbered L.divIcon pins (.iui-pin-dot). createTripAnimator — do not invent timers. Filter null getElement() before pinElements.
3) Horizontal .iui-cards-strip + .iui-stop-card (photo 110px + number + name + one-line). Extra cards SCROLL inside the first rounded frame (host sets min-width:0).
4) Click pin OR card opens an in-page detail sheet: 停留 / 票或预约 / 怎么去 / 避坑 (plus a why line). Do not leave the map as pins-only.
Single-place maps may skip the strip/animator; still real Leaflet + one marker + that place's detail.
Optional only when the ask has the data: day timeline, lodging .iui-compare-3, budget. NEVER force a 3-day Nanjing layout onto 探店/天气/单点.
- Host installs window.createTripAnimator:
  createTripAnimator({ stopCount, durationMs:6000, pinElements, map, onFrame, onState })
  → play()/pause()/replay()/seek(i)/dispose(). Pass map so replay() invalidateSize/redraws tiles.
- On activateStop: highlight card (aria-current), strip.scrollLeft to card offset (not scrollIntoView), fill the detail sheet, update status.
- Label polyline "示意行程连线 — 非核实驾车路线". Approximate coords OK if labeled.
- Map tiles (REQUIRED): Esri World Street Map (grayscale via CSS) https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x} (z/y/x) {attribution:'Tiles © Esri',maxZoom:19}. Host auto-falls back on tileerror (OSM FR HOT → Esri Light Gray). Never World_Topo_Map, tile.openstreetmap.org, or basemaps.cartocdn.com. scrollWheelZoom:false; invalidateSize after setup. Pins must stay visible (do not rely on opacity:0 CSS).
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
     NEVER invent Unsplash/random hosts; NEVER use solid muted blocks as photo stand-ins.
  Never invent live traffic/hours.

## Pattern — hotel / product / place covers (non-itinerary)
Use .iui-hotel-card / .iui-product-card / .iui-place-card / .iui-cover-card with a .photo or .cover band
+ .name (or data-iui-place="Tokyo"). Same Wikimedia rules as itinerary stops. Host enrich+fill applies.

## Pattern — pricing / compare (3 columns)
Wrap tiers in <div class="iui-compare-3"> with three .iui-tier (one .featured). Each: plan name, .price + <small>/月</small>, feature <ul><li>, CTA button. NEVER stack three pricing cards vertically — host CSS keeps 3 columns down to ~480px.

## Pattern — kanban board (3 columns)
Use <div class="iui-kanban-3"> with three .iui-kanban-col (each .iui-kanban-col-title + .iui-kanban-card items). Move cards via buttons (local JS only). NEVER stack columns vertically in the chat bubble.

## Pattern — weather (dense dashboard)
NEVER ship a thin 3-KPI strip. Required density:
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
