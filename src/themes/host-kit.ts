/**
 * Host kit CSS for ```iui-html sandboxes: the hooks older pages and host
 * runtimes rely on (legacy colour bridge, SVG diagram classes, .iui-* layout /
 * map / itinerary / states, a11y, 3D stage, code tools).
 * visual(③): replaces the retired OIU design-system module — the OIU palette,
 * design skill and naming are gone; daisyUI + Tailwind are the authoring surface.
 * Legal attribution for adapted MIT material: see NOTICE.
 */
import { HOST_POLISH_CSS } from './host-polish.ts'
import { LEGACY_TOKEN_BRIDGE_CSS, legacyElementLayer } from './iui-daisy.ts'

/** SVG color-ramp + diagram helpers (.c-purple … .c-red, .box .node .arr .leader, .t .ts .th). */
export const HOST_SVG_CSS = `
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
export const HOST_FORM_CSS = `
/* visual(①): raw-element defaults sit in a layer below the daisyUI components (.btn, .input …). */
${legacyElementLayer(`* { box-sizing: border-box; margin: 0; }
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
`)}

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
.leaflet-overlay-pane svg { color: var(--color-base-content); }
.iui-leaflet-pin { background: none; border: 0; }
.iui-leaflet-pin > span { display: block; width: 18px; height: 18px; box-sizing: border-box; border-radius: 50%; background: var(--color-base-content); border: 3px solid var(--color-base-100); box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3); }
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
  background: var(--iui-pin-color, var(--accent-fill, #185FA5)); color: var(--iui-pin-on, var(--on-accent, #fff)); font: 600 12px var(--font-sans);
  border: 2px solid var(--color-base-100, #fff); box-shadow: 0 1px 4px rgba(0,0,0,0.28);
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
  /* visual(③): quiet quartz — 13px type, muted 500-weight header on the page surface,
     hairline borders, 44px rows, ink checkboxes / focus (grid.html). */
  --ag-font-family: var(--font-sans);
  --ag-font-size: 13px;
  --ag-foreground-color: var(--color-base-content);
  --ag-data-color: var(--color-base-content);
  --ag-secondary-foreground-color: var(--iui-chart-axis);
  --ag-header-foreground-color: var(--iui-chart-axis);
  --ag-header-background-color: var(--color-base-100);
  --ag-background-color: var(--color-base-100);
  --ag-odd-row-background-color: var(--color-base-100);
  --ag-control-panel-background-color: var(--color-base-100);
  --ag-border-color: var(--iui-chart-grid);
  --ag-secondary-border-color: var(--iui-chart-grid);
  --ag-row-border-color: var(--iui-chart-row);
  --ag-wrapper-border-radius: var(--radius-box, 16px);
  --ag-border-radius: var(--radius-field, 8px);
  --ag-row-hover-color: var(--iui-chart-hover);
  --ag-selected-row-background-color: var(--color-base-200);
  --ag-header-column-resize-handle-color: transparent;
  --ag-header-column-separator-display: none;
  --ag-checkbox-checked-color: var(--color-base-content);
  --ag-checkbox-unchecked-color: var(--iui-chart-axis);
  --ag-range-selection-border-color: var(--color-base-content);
  --ag-input-focus-border-color: var(--color-base-content);
  --ag-active-color: var(--color-base-content);
  --ag-cell-horizontal-padding: 14px;
  --ag-header-height: 40px;
  --ag-row-height: 44px;
  --ag-icon-font-color: var(--iui-chart-axis);
  --ag-modal-overlay-background-color: color-mix(in oklab, var(--color-base-100) 70%, transparent);
}
.ag-theme-iui .ag-header { border-bottom-color: var(--iui-chart-grid); }
.ag-theme-iui .ag-header-cell-text, .ag-theme-iui .ag-header-cell-label { font-weight: 500; }
.ag-theme-iui .ag-cell { font-variant-numeric: tabular-nums; }
.ag-theme-iui .ag-paging-panel { color: var(--iui-chart-axis); border-top-color: var(--iui-chart-grid); }
.iui-mindmap, .mermaid.iui-mindmap {
  background: var(--color-base-100);
  border: 1px solid var(--color-base-300);
  border-radius: var(--radius-box, 16px);
  padding: 16px;
  overflow: auto;
}
.iui-mindmap svg { max-width: 100%; height: auto; display: block; margin-inline: auto; }
/* visual(③): d3 axes follow the chart chrome (attributes lose to CSS; author CSS still wins). */
:where(svg) :where(.tick) > text { fill: var(--iui-chart-axis); font-family: var(--font-sans); font-size: 11px; }
:where(svg) :where(.tick) > line { stroke: var(--iui-chart-grid); }
:where(svg) :where(g) > path.domain { stroke: var(--iui-chart-grid); }

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
export const HOST_KIT_CSS = `
/* D1 type scale: 12 / 14 / 16 / 20 / 28 / 40 — nothing below 12px. */
/* G2: heading rhythm, Latin line height, aligned digits for numbers / prices / tables. */
${legacyElementLayer(`h1, h2, h3, h4 { line-height: var(--lh-heading, 1.25); }
:lang(en) body { line-height: var(--lh-latin, 1.5); }
h1 { font-size: var(--fs-lg); font-weight: 750; }
h2 { font-size: var(--fs-md); font-weight: 700; }
h3 { font-size: var(--fs-sm); font-weight: 650; }
h4 { font-size: var(--fs-xs); font-weight: 650; }
table { font-size: var(--fs-sm); }
`)}
.iui-stat-value, .iui-sandbox-kpi, .iui-kpi, .price, .num, [data-iui-num], td, th, time, progress + span { font-variant-numeric: tabular-nums; }
.iui-sandbox-title, .iui-itinerary-title { font-size: var(--fs-lg); }
.iui-sandbox-sub, .iui-itinerary-sub, .iui-kanban-card, .iui-tier li, .iui-tier .price small { font-size: var(--fs-sm); }
.iui-sandbox-badge { font-size: var(--fs-xs); }
.iui-text-xs { font-size: var(--fs-xs); } .iui-text-sm { font-size: var(--fs-sm); }
.iui-text-md { font-size: var(--fs-md); } .iui-text-lg { font-size: var(--fs-lg); }
.iui-text-xl { font-size: var(--fs-xl); } .iui-text-2xl { font-size: var(--fs-2xl); }

/* D2 page personalities: put data-iui-style on the page root.
   tool 工具型/简洁 · content 内容型/杂志 · data 数据型/看板 · toy 玩具型/活泼
   Compat only (no longer taught in the prompt). */
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
  --accent: var(--color-base-content); --accent-fill: var(--color-neutral); --accent-soft: var(--color-base-200); --on-accent: var(--color-neutral-content);
  --iui-style-bg: var(--color-background-primary); --iui-style-pad: 12px; --iui-gap: 8px;
  --border-radius-md: 6px; --border-radius-lg: 8px; --border-radius-xl: 10px;
  line-height: 1.55;
}
[data-iui-style="content"] {
  --accent: var(--color-base-content); --accent-fill: var(--color-neutral); --accent-soft: var(--color-base-200); --on-accent: var(--color-neutral-content);
  --iui-style-bg: var(--color-base-100); --iui-style-pad: 24px; --iui-gap: 20px;
  --border-radius-md: 4px; --border-radius-lg: 6px; --border-radius-xl: 8px;
  line-height: 1.75;
}
[data-iui-style="content"] h1, [data-iui-style="content"] h2, [data-iui-style="content"] h3 { font-family: var(--font-serif); letter-spacing: -0.01em; }
[data-iui-style="content"] h1 { font-size: var(--fs-xl); }
[data-iui-style="content"] p { max-width: 68ch; }
[data-iui-style="data"] {
  --accent: var(--color-base-content); --accent-fill: var(--color-neutral); --accent-soft: var(--color-base-200); --on-accent: var(--color-neutral-content);
  --iui-style-bg: var(--color-background-secondary); --iui-style-pad: 16px; --iui-gap: 12px;
  --border-radius-md: 8px; --border-radius-lg: 10px; --border-radius-xl: 12px;
  font-variant-numeric: tabular-nums; line-height: 1.5;
}
[data-iui-style="toy"] {
  --accent: var(--color-base-content); --accent-fill: var(--color-neutral); --accent-soft: var(--color-base-200); --on-accent: var(--color-neutral-content);
  --iui-style-bg: var(--color-base-200); --iui-style-pad: 20px; --iui-gap: 16px;
  --border-radius-md: 14px; --border-radius-lg: 20px; --border-radius-xl: 28px;
}
[data-iui-style="toy"] button { border-radius: 999px; }
/* visual(②): presets keep their spacing / radius / type personality but no
   own hues (were blue / rust / indigo / pink) — ink + greys from the theme, so
   light / dark follow the daisyUI tokens without a separate dark block. */

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
.iui-stop-card .num { background: var(--iui-pin-color, var(--accent-fill, #185FA5)); color: var(--iui-pin-on, var(--on-accent, #fff)); }
/* visual(⑧): category pins keep white numbers; plain pins follow primary / primary-content (ink in light, paper in dark). */
[data-cat] { --iui-pin-on: #fff; }

/* D8 code blocks: wrap toggle + copy (bridge wraps <pre> in .iui-code-wrap). */
${legacyElementLayer(`:where(pre:not(.mermaid)) {
  font: 13px/1.55 var(--font-mono); tab-size: 2;
  background: var(--color-background-secondary); color: var(--color-text-primary);
  border: 0.5px solid var(--color-border-tertiary); border-radius: var(--border-radius-lg);
  padding: 12px 14px; overflow: auto; margin: 0 0 8px;
}
`)}
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
export const HOST_A11Y_CSS = `
:focus-visible { outline: 2px solid var(--accent-fill, #185FA5); outline-offset: 2px; }
:focus:not(:focus-visible) { outline: none; }
input:focus-visible, textarea:focus-visible, select:focus-visible { outline: 2px solid var(--accent-fill, #185FA5); outline-offset: 1px; }
[data-iui-kbd]:focus-visible { border-radius: var(--border-radius-md, 8px); }
:where(span, a, i, b, em, strong, small, label)[data-iui-kbd] { display: inline-flex; align-items: center; }
button:not(.leaflet-container *), [role="button"]:not(.leaflet-container *):not(svg *), select, .iui-sandbox-tab, .iui-code-tools > button { min-height: 32px; }
button:not(.leaflet-container *) { min-width: 32px; }
input[type="checkbox"]:not(.checkbox):not(.toggle), input[type="radio"]:not(.radio) { width: 18px; height: 18px; accent-color: var(--accent-fill, #185FA5); }
label:has(> input[type="checkbox"]), label:has(> input[type="radio"]) { display: inline-flex; align-items: center; gap: 6px; min-height: 32px; cursor: pointer; }
button.primary:not(.btn), button[data-variant="primary"]:not(.btn), button[type="submit"]:not(.secondary):not(.ghost):not(.btn) {
  background: var(--accent-fill, #185FA5); border-color: var(--accent-fill, #185FA5); color: var(--on-accent, #fff); font-weight: 600;
}
button.primary:not(.btn):hover, button[type="submit"]:not(.secondary):not(.ghost):not(.btn):hover { background: var(--accent-fill, #185FA5); opacity: 0.92; }
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
export function buildHostKitCss(): string {
  return `${LEGACY_TOKEN_BRIDGE_CSS}\n${HOST_SVG_CSS}\n${HOST_FORM_CSS}\n${HOST_KIT_CSS}\n${HOST_POLISH_CSS}\n${HOST_A11Y_CSS}`
}
