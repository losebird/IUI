/**
 * visual(①): daisyUI theme base for the ```iui-html sandbox.
 *
 * - Default theme "IUI 中性" (`iui` / `iui-dark`, token values from
 *   docs/handoff/demo/site/common.css); built-in switchable `corporate`, `dim`.
 * - Light/dark follow `prefers-color-scheme` on :root, so the bridge's forced
 *   scheme rewrite (G10) and host-following dark mode keep working unchanged.
 * - LEGACY_TOKEN_BRIDGE_CSS maps the old OIU / pack variable names onto the
 *   daisyUI tokens: old conversations and the host kit re-render in the new
 *   theme without touching their markup.
 */
import { DAISY_CSS, DAISY_THEMES_CSS } from './daisy.generated.ts'
import { vendorUrls } from '../shared/vendor-registry.ts'

/**
 * Settings → customTokensJson whitelist (accent, radius, density, font size).
 * Everything else is ignored and listed back to the user.
 */
export const CUSTOM_TOKEN_WHITELIST: readonly string[] = [
  '--color-primary', '--color-primary-content',
  '--radius-box', '--radius-field', '--radius-selector',
  '--size-field', '--size-selector',
  '--fs-xs', '--fs-sm', '--fs-md', '--fs-lg', '--fs-xl', '--fs-2xl',
]

export const IUI_THEME_IDS = ['iui', 'corporate', 'dim'] as const
export type IuiThemeId = (typeof IUI_THEME_IDS)[number]
export const DEFAULT_IUI_THEME: IuiThemeId = 'iui'

export function normalizeIuiTheme(value: unknown): IuiThemeId {
  return typeof value === 'string' && (IUI_THEME_IDS as readonly string[]).includes(value) ? value as IuiThemeId : DEFAULT_IUI_THEME
}

/** daisyUI shape tokens (`--border` is renamed `--border-w` in the bundle, see scripts/gen-daisy.mjs). */
const SHAPE = {
  '--radius-selector': '.375rem', '--radius-field': '999px', '--radius-box': '1.25rem',
  '--size-selector': '.25rem', '--size-field': '.25rem', '--border-w': '1px', '--depth': '0', '--noise': '0',
}

export const IUI_LIGHT_TOKENS: Readonly<Record<string, string>> = {
  'color-scheme': 'light',
  '--color-base-100': '#ffffff', '--color-base-200': '#f4f4f5', '--color-base-300': '#e7e7e9', '--color-base-content': '#0a0a0a',
  '--color-primary': '#0a0a0a', '--color-primary-content': '#ffffff',
  '--color-secondary': '#f4f4f5', '--color-secondary-content': '#0a0a0a',
  '--color-accent': '#16a34a', '--color-accent-content': '#ffffff',
  '--color-neutral': '#18181b', '--color-neutral-content': '#fafafa',
  '--color-info': '#2563eb', '--color-info-content': '#ffffff', '--color-success': '#16a34a', '--color-success-content': '#ffffff',
  '--color-warning': '#d97706', '--color-warning-content': '#ffffff', '--color-error': '#dc2626', '--color-error-content': '#ffffff',
  ...SHAPE,
}

export const IUI_DARK_TOKENS: Readonly<Record<string, string>> = {
  'color-scheme': 'dark',
  '--color-base-100': '#0a0a0a', '--color-base-200': '#161618', '--color-base-300': '#26262a', '--color-base-content': '#fafafa',
  '--color-primary': '#fafafa', '--color-primary-content': '#0a0a0a',
  '--color-secondary': '#1c1c1f', '--color-secondary-content': '#fafafa',
  '--color-accent': '#22c55e', '--color-accent-content': '#0a0a0a',
  '--color-neutral': '#e4e4e7', '--color-neutral-content': '#0a0a0a',
  '--color-info': '#60a5fa', '--color-info-content': '#0a0a0a', '--color-success': '#22c55e', '--color-success-content': '#0a0a0a',
  '--color-warning': '#f59e0b', '--color-warning-content': '#0a0a0a', '--color-error': '#f87171', '--color-error-content': '#0a0a0a',
  ...SHAPE,
}

/**
 * Chart series as plain hex (chart.js / ECharts parse colours themselves and
 * do not understand color-mix / oklch). ② : ink main series + light grey comparison.
 */
const SERIES: Record<'iui' | 'iui-dark' | 'corporate' | 'dim', readonly string[]> = {
  iui: ['#0a0a0a', '#d4d4d8', '#2563eb', '#16a34a', '#d97706', '#dc2626', '#71717a', '#7c3aed'],
  'iui-dark': ['#fafafa', '#3f3f46', '#60a5fa', '#22c55e', '#f59e0b', '#f87171', '#a1a1aa', '#a78bfa'],
  corporate: ['#0082ce', '#c7cbd1', '#0d9488', '#16a34a', '#d97706', '#dc2626', '#64748b', '#7c3aed'],
  dim: ['#9fe88d', '#4b5563', '#60a5fa', '#34d399', '#fbbf24', '#f87171', '#9ca3af', '#c084fc'],
}

function block(sel: string, vars: Readonly<Record<string, string>>): string {
  return `${sel}{${Object.entries(vars).map(([k, v]) => `${k}:${v}`).join(';')}}`
}

function seriesVars(id: keyof typeof SERIES): Record<string, string> {
  return Object.fromEntries(SERIES[id].map((c, i) => [`--iui-chart-${i + 1}`, c]))
}

/** Raw elements the host styles, and the daisyUI classes that own them instead. */
const DAISY_OWNED: Readonly<Record<string, string>> = {
  button: '.btn,.tab,.join-item,.swap',
  input: '.input,.input *,.toggle,.checkbox,.radio,.range,.file-input,.join-item,.validator',
  select: '.select,.select *,.join-item',
  textarea: '.textarea',
  table: '.table',
  th: '.table *',
  td: '.table *',
  a: '.btn,.tab,.link,.badge,.menu *,.breadcrumbs *,.join-item,.steps *',
}
const OWNED_RE = new RegExp(`^(${Object.keys(DAISY_OWNED).join('|')})(?![\\w-])`)

/** `button:hover` → `button:where(:not(.btn,…)):hover` (specificity unchanged), for the last compound of each selector. */
function scopeSelector(sel: string): string {
  const parts = sel.trim().split(/(\s*[>+~]\s*|\s+)/)
  const last = parts[parts.length - 1] ?? ''
  const m = OWNED_RE.exec(last)
  if (!m) return sel.trim()
  const guard = `:where(:not(${DAISY_OWNED[m[1]!]}))`
  const pe = last.indexOf('::')
  parts[parts.length - 1] = pe < 0 ? last + guard : last.slice(0, pe) + guard + last.slice(pe)
  return parts.join('')
}

/**
 * Host defaults for raw elements (`button`, `input`, `table` …): moved into
 * `@layer iui-base` (below the daisyUI components, and below author CSS as
 * before) and kept off elements that carry a daisyUI class, so `.btn` /
 * `<label class="input"><input>` / `.table` look exactly as daisyUI draws them.
 * Flat rules only (no nested at-rules).
 */
export function legacyElementLayer(css: string): string {
  const body = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|})([^{}]+)\{/g, (_m, close: string, sel: string) => {
    const lead = /^\s*/.exec(sel)![0]
    return `${close}${lead}${sel.split(',').map(scopeSelector).join(', ')} {`
  })
  return `@layer iui-base {\n${body}\n}`
}

/** Layer order: daisyUI base < host element defaults < daisyUI components (Tailwind `utilities`) < unlayered. */
export const SANDBOX_LAYER_ORDER_CSS = '@layer base, iui-base, utilities;'

/** iui / iui-dark on :root (scheme-following) + named themes for `data-theme`. */
export function buildIuiThemeCss(): string {
  const light = { ...IUI_LIGHT_TOKENS, ...seriesVars('iui') }
  const dark = { ...IUI_DARK_TOKENS, ...seriesVars('iui-dark') }
  return [
    block(':root', { ...light, ...LEGACY_SCALE_TOKENS }),
    `@media (prefers-color-scheme: dark){${block(':root', dark)}}`,
    block('[data-theme="iui"]', light),
    block('[data-theme="iui-dark"]', dark),
    DAISY_THEMES_CSS,
    block('[data-theme="corporate"]', seriesVars('corporate')),
    block('[data-theme="dim"]', seriesVars('dim')),
    // common.css: pill toggles, softer textarea, accordion groups, quiet progress ring track.
    ':where(:root,[data-theme^="iui"]) .toggle,:where(:root,[data-theme^="iui"]) .toggle:before{border-radius:999px}',
    ':where(:root,[data-theme^="iui"]) .textarea{border-radius:1rem}',
    ':where(:root,[data-theme^="iui"]) .join-vertical>.collapse{border-radius:0}:where(:root,[data-theme^="iui"]) .join-vertical>.collapse:first-child{border-radius:1rem 1rem 0 0}:where(:root,[data-theme^="iui"]) .join-vertical>.collapse:last-child{border-radius:0 0 1rem 1rem}',
    '.radial-progress{background:radial-gradient(closest-side,transparent calc(100% - var(--thickness,5px)),color-mix(in oklab,currentColor 10%,transparent) calc(100% - var(--thickness,5px)) 100%,transparent 0)}',
  ].join('\n')
}

const mix = (a: string, pct: number, b = 'var(--color-base-100)'): string => `color-mix(in oklab,${a} ${pct}%,${b})`
const INK = 'var(--color-base-content)'
const FONT_SANS = '"InterVar","PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans SC","Noto Sans CJK SC",system-ui,-apple-system,"Segoe UI",sans-serif'

/**
 * Non-colour legacy scale (type, spacing, radii, fonts). Emitted with the theme,
 * *before* host design tokens, so whitelisted custom tokens (--fs-*) can override.
 */
export const LEGACY_SCALE_TOKENS: Readonly<Record<string, string>> = {
  '--font-sans': FONT_SANS,
  '--font-serif': 'Georgia,"Times New Roman","Songti SC",serif',
  '--font-mono': 'ui-monospace,"SF Mono","JetBrains Mono",Menlo,monospace',
  '--border-radius-md': '8px',
  '--border-radius-lg': '12px',
  '--border-radius-xl': '16px',
  '--fs-xs': '12px', '--fs-sm': '14px', '--fs-md': '16px', '--fs-lg': '20px', '--fs-xl': '28px', '--fs-2xl': '40px',
  '--text-xs': 'var(--fs-xs)', '--text-sm': 'var(--fs-sm)', '--text-base': 'var(--fs-md)',
  '--text-lg': 'var(--fs-lg)', '--text-xl': 'var(--fs-xl)', '--text-2xl': 'var(--fs-2xl)',
  '--lh-body': '1.65', '--lh-latin': '1.5', '--lh-heading': '1.25',
  '--space-1': '4px', '--space-2': '8px', '--space-3': '12px', '--space-4': '16px',
  '--space-5': '20px', '--space-6': '24px', '--space-7': '32px', '--space-8': '40px',
}

/** Old OIU / pack / dsl colour names → daisyUI tokens (declared on every theme root). */
export const LEGACY_TOKEN_BRIDGE: Readonly<Record<string, string>> = {
  '--color-background-primary': 'var(--color-base-100)',
  '--color-background-secondary': 'var(--color-base-200)',
  '--color-background-tertiary': 'var(--color-base-300)',
  '--color-background-info': mix('var(--color-info)', 12),
  '--color-background-danger': mix('var(--color-error)', 12),
  '--color-background-success': mix('var(--color-success)', 12),
  '--color-background-warning': mix('var(--color-warning)', 14),
  '--color-text-primary': INK,
  '--color-text-secondary': mix(INK, 68),
  '--color-text-tertiary': mix(INK, 58),
  '--color-text-info': mix('var(--color-info)', 80, INK),
  '--color-text-danger': mix('var(--color-error)', 80, INK),
  '--color-text-success': mix('var(--color-success)', 70, INK),
  '--color-text-warning': mix('var(--color-warning)', 66, INK),
  '--color-border-primary': mix(INK, 40),
  '--color-border-secondary': mix(INK, 24),
  '--color-border-tertiary': 'var(--color-base-300)',
  '--color-border-info': 'var(--color-info)',
  '--color-border-danger': 'var(--color-error)',
  '--color-border-success': 'var(--color-success)',
  '--color-border-warning': 'var(--color-warning)',
  // IUI 中性 is flat (depth 0): resting cards rely on the hairline, popovers keep a soft lift.
  '--shadow-1': 'none',
  '--shadow-2': '0 4px 16px -6px color-mix(in oklab,var(--color-base-content) 16%,transparent)',
  '--shadow-3': '0 12px 32px -8px color-mix(in oklab,var(--color-base-content) 22%,transparent)',
  '--accent': 'var(--color-primary)',
  '--accent-fill': 'var(--color-primary)',
  '--accent-strong': mix('var(--color-primary)', 85, INK),
  '--accent-soft': mix('var(--color-primary)', 8),
  '--on-accent': 'var(--color-primary-content)',
  '--p': 'var(--color-text-primary)', '--s': 'var(--color-text-secondary)', '--t': 'var(--color-text-tertiary)',
  '--bg2': 'var(--color-background-secondary)', '--b': 'var(--color-border-tertiary)',
  '--iui-pack-surface': 'var(--color-base-100)',
  '--iui-pack-surface-muted': 'var(--color-base-200)',
  '--iui-pack-fg': INK,
  '--iui-pack-muted-fg': 'var(--color-text-secondary)',
  '--iui-pack-border': 'var(--color-base-300)',
  '--iui-pack-accent': 'var(--color-primary)',
  '--iui-pack-on-accent': 'var(--color-primary-content)',
  '--iui-pack-ok': 'var(--color-text-success)',
  '--iui-pack-warn': 'var(--color-text-warning)',
  '--iui-pack-danger': 'var(--color-text-danger)',
  '--iui-pack-tint': 'var(--accent-soft)',
  '--iui-pack-tint-strong': mix('var(--color-primary)', 16),
  '--iui-pack-secondary': 'var(--color-base-300)',
  '--iui-pack-hero-from': 'var(--color-base-200)',
  '--iui-pack-hero-to': 'var(--color-base-100)',
  '--iui-pack-font-family': FONT_SANS,
  '--iui-pack-radius': 'var(--radius-box)',
  '--iui-pack-radius-sm': 'var(--border-radius-lg)',
  '--iui-pack-radius-control': 'var(--border-radius-md)',
  '--iui-pack-elev': 'var(--shadow-1)',
  '--iui-pack-elev-2': 'var(--shadow-2)',
  // Base CSS swaps to the *-dark names under prefers-color-scheme: keep them on the same tokens.
  '--iui-pack-surface-dark': 'var(--color-base-100)',
  '--iui-pack-surface-muted-dark': 'var(--color-base-200)',
  '--iui-pack-fg-dark': INK,
  '--iui-pack-muted-fg-dark': 'var(--color-text-secondary)',
  '--iui-pack-border-dark': 'var(--color-base-300)',
  '--iui-pack-accent-dark': 'var(--color-primary)',
  '--dsl-g-fg': INK, '--dsl-g-bg': 'var(--color-base-100)', '--dsl-g-surface': 'var(--color-base-100)',
  '--dsl-g-muted-fg': 'var(--color-text-secondary)', '--dsl-g-border': 'var(--color-base-300)',
  '--bg': 'var(--color-base-100)', '--surface': 'var(--color-base-200)', '--card': 'var(--color-base-200)',
  '--text': INK, '--fg': INK, '--muted': 'var(--color-text-secondary)',
  '--border': 'var(--color-base-300)', '--radius': 'var(--border-radius-lg)',
}

/** The bridge, on :root and on every element that switches theme with `data-theme`. */
export const LEGACY_TOKEN_BRIDGE_CSS = block(':root,[data-theme]', LEGACY_TOKEN_BRIDGE)

/** Inter (latin, variable) from the plugin route first, CDNs as fallbacks; CJK falls through to system faces. */
export function interFontFaceCss(assetBase?: string): string {
  const src = vendorUrls('inter', 'files/inter-latin-wght-normal.woff2', assetBase)
    .map((u) => `url(${JSON.stringify(u)}) format("woff2")`).join(',')
  return `@font-face{font-family:"InterVar";src:${src};font-weight:100 900;font-style:normal;font-display:block;unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}`
}

/**
 * The handful of Tailwind utilities daisyUI markup leans on (`card bg-base-100
 * border border-base-300`, `text-error`). No Tailwind runtime in the sandbox.
 */
export const IUI_UTILITIES_CSS = '@layer utilities{'
  + '.border{border:var(--border-w,1px) solid var(--color-base-300)}.border-dashed{border-style:dashed}'
  + '.border-base-200{border-color:var(--color-base-200)}.border-base-300{border-color:var(--color-base-300)}'
  + '.bg-base-100{background-color:var(--color-base-100)}.bg-base-200{background-color:var(--color-base-200)}.bg-base-300{background-color:var(--color-base-300)}'
  + '.bg-primary{background-color:var(--color-primary);color:var(--color-primary-content)}'
  + '.text-base-content{color:var(--color-base-content)}.text-primary{color:var(--color-primary)}'
  + ['info', 'success', 'warning', 'error'].map((c) => `.text-${c}{color:var(--color-text-${c === 'error' ? 'danger' : c})}`).join('')
  + '}'

/** Theme base injected before host tokens: layer order, font, daisyUI, themes (the colour bridge ships with the host kit, after host tokens). */
export function buildIuiDaisyCss(assetBase?: string): string {
  return [
    SANDBOX_LAYER_ORDER_CSS,
    interFontFaceCss(assetBase),
    DAISY_CSS,
    IUI_UTILITIES_CSS,
    buildIuiThemeCss(),
    // daisyUI sizes are rem-based: keep the root at 16px (the host body copy sets its own size).
    'html{font-size:16px}',
    // body copy: Inter + CJK, tabular digits on demand (.num), same feature set as the demo.
    'html,body{font-family:var(--font-sans);font-feature-settings:"cv11","ss01"}',
    '.num{font-variant-numeric:tabular-nums}',
  ].join('\n')
}

/**
 * In-frame `__iuiCssColor(value)` → `#rrggbb` / `rgba()` for libraries that
 * parse colours themselves (Chart.js alpha helper, ECharts, Mermaid).
 * Plain hex / rgb pass through; color-mix / oklch / var() go through the
 * browser (computed colour → 1px canvas).
 */
export const CSS_COLOR_RESOLVER_SRC = `function __iuiCssColor(v) {
  v = String(v || '').trim();
  if (!v || /^(#|rgb)/i.test(v) || !/^(color-mix|oklch|oklab|lab|lch|hsl|hwb|color|var)\\(/i.test(v)) return v;
  try {
    var host = document.body || document.documentElement;
    var probe = document.createElement('i');
    probe.style.cssText = 'display:none';
    probe.style.color = v;
    host.appendChild(probe);
    var computed = getComputedStyle(probe).color;
    probe.remove();
    var cv = document.createElement('canvas');
    cv.width = cv.height = 1;
    var x = cv.getContext('2d');
    x.fillStyle = computed;
    x.fillRect(0, 0, 1, 1);
    var d = x.getImageData(0, 0, 1, 1).data;
    if (d[3] < 255) return 'rgba(' + d[0] + ',' + d[1] + ',' + d[2] + ',' + (d[3] / 255).toFixed(3) + ')';
    return '#' + [d[0], d[1], d[2]].map(function (n) { return (n | 256).toString(16).slice(1); }).join('');
  } catch (e) { return v; }
}`
