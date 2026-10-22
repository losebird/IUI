/**
 * G2: one page accent → a full, contrast-safe token set.
 *
 * Authors declare `accent: #E4572E` in the fence header (or `"accent"` in JSON).
 * The host derives --accent (text/links, ≥ 4.5:1 on the page surface), --accent-fill
 * (buttons, pins, chart series 1), --accent-strong (hover/pressed), --accent-soft
 * (tinted surfaces) and --on-accent (ink on the fill, ≥ 4.5:1) for light and dark.
 */
import { mixHex, parseHex, relativeLuminance, rgbToHex } from '../themes/color-utils.ts'

export type AccentSet = {
  accent: string
  fill: string
  strong: string
  soft: string
  onAccent: string
}

const LIGHT_SURFACE = '#ffffff'
const DARK_SURFACE = '#0a0a0a'

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const [hi, lo] = la > lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

/** Normalise `#abc` / `#aabbcc` / `abc` → `#aabbcc`; null when not a hex colour. */
export function normalizeAccent(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const rgb = parseHex(raw.trim())
  return rgb ? rgbToHex(rgb) : null
}

/** Move `hex` toward `toward` until it reaches `min` contrast against `surface`. */
function ensureContrast(hex: string, surface: string, toward: string, min = 4.5): string {
  if (contrastRatio(hex, surface) >= min) return hex
  for (let t = 0.05; t <= 1.0001; t += 0.05) {
    const next = mixHex(hex, toward, t)
    if (contrastRatio(next, surface) >= min) return next
  }
  return toward
}

function inkFor(fill: string): string {
  const white = contrastRatio(fill, '#ffffff')
  const dark = contrastRatio(fill, '#111111')
  return white >= 4.5 || white >= dark ? '#ffffff' : '#111111'
}

/** Mid-tone fills (e.g. #8B5CF6) pass neither ink: nudge the fill until one ink reaches AA. */
function fitFill(fill: string, toward: '#000000' | '#ffffff'): string {
  const ok = (f: string) => Math.max(contrastRatio(f, '#ffffff'), contrastRatio(f, '#111111')) >= 4.5
  if (ok(fill)) return fill
  for (let t = 0.04; t <= 1.0001; t += 0.04) {
    const next = mixHex(fill, toward, t)
    if (ok(next)) return next
  }
  return toward
}

export function deriveAccentSet(raw: string, scheme: 'light' | 'dark'): AccentSet {
  const hex = normalizeAccent(raw) ?? raw
  if (scheme === 'light') {
    // Fill keeps the declared hue; darken only if neither ink reaches AA.
    const fill = fitFill(hex, '#000000')
    return {
      accent: ensureContrast(hex, LIGHT_SURFACE, '#000000'),
      fill,
      strong: mixHex(fill, '#000000', 0.18),
      soft: mixHex(hex, LIGHT_SURFACE, 0.9),
      onAccent: inkFor(fill),
    }
  }
  const accent = ensureContrast(hex, DARK_SURFACE, '#ffffff')
  const fill = fitFill(relativeLuminance(hex) < 0.04 ? mixHex(hex, '#ffffff', 0.25) : hex, '#ffffff')
  return {
    accent,
    fill,
    strong: mixHex(fill, '#ffffff', 0.18),
    soft: mixHex(hex, DARK_SURFACE, 0.8),
    onAccent: inkFor(fill),
  }
}

function toHsl(hex: string): [number, number, number] {
  const c = parseHex(hex) ?? { r: 128, g: 128, b: 128 }
  const r = c.r / 255, g = c.g / 255, b = c.b / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [h * 60, s, l]
}

function fromHsl(h: number, s: number, l: number): string {
  const hh = (((h % 360) + 360) % 360) / 360
  const ss = Math.max(0, Math.min(1, s)), ll = Math.max(0, Math.min(1, l))
  if (ss === 0) return rgbToHex({ r: ll * 255, g: ll * 255, b: ll * 255 })
  const q = ll < 0.5 ? ll * (1 + ss) : ll + ss - ll * ss
  const p = 2 * ll - q
  const f = (t: number) => {
    const x = t < 0 ? t + 1 : t > 1 ? t - 1 : t
    if (x < 1 / 6) return p + (q - p) * 6 * x
    if (x < 1 / 2) return q
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6
    return p
  }
  return rgbToHex({ r: f(hh + 1 / 3) * 255, g: f(hh) * 255, b: f(hh - 1 / 3) * 255 })
}

/**
 * Screenshot review: with an accent declared, series 2+ used the stock palette
 * (orange accent + stock green clashed). Derive a harmonised 8-step series:
 * 1 accent fill · 2 muted same-hue (the usual "previous period" comparison) ·
 * 3/4 analogous ±35° · 5 muted complement · 6/7 ±70° · 8 warm neutral.
 * Achromatic accents only override series 1–2. Every step keeps ≥ 3:1 against the page surface (WCAG non-text contrast).
 */
export function deriveSeriesPalette(fill: string, scheme: 'light' | 'dark'): string[] {
  const [h, s0, l0] = toHsl(fill)
  const s = Math.max(0.35, Math.min(0.8, s0))
  const l = scheme === 'light' ? Math.max(0.36, Math.min(0.52, l0)) : Math.max(0.55, Math.min(0.7, l0))
  const surface = scheme === 'light' ? LIGHT_SURFACE : DARK_SURFACE
  const toward = scheme === 'light' ? '#000000' : '#ffffff'
  const muted = scheme === 'light' ? fromHsl(h, s * 0.28, 0.6) : fromHsl(h, s * 0.25, 0.52)
  // Achromatic accents (black/grey) have no hue to rotate: keep the stock series 3+.
  if (s0 < 0.12) return [fill, scheme === 'light' ? '#8a8984' : '#8f8e88']
  const raw = [
    fill,
    muted,
    fromHsl(h + 35, s * 0.9, l),
    fromHsl(h - 35, s * 0.9, l),
    fromHsl(h + 180, s * 0.55, l),
    fromHsl(h + 70, s * 0.75, l),
    fromHsl(h - 70, s * 0.75, l),
    scheme === 'light' ? '#6b6a64' : '#a3a199',
  ]
  return raw.map((c, i) => (i === 0 ? c : ensureContrast(c, surface, toward, 3)))
}

function block(sel: string, s: AccentSet, scheme: 'light' | 'dark'): string {
  const series = deriveSeriesPalette(s.fill, scheme).map((c, i) => `--iui-chart-${i + 1}:${c}!important`).join(';')
  return `${sel}{--color-primary:${s.fill}!important;--color-primary-content:${s.onAccent}!important;--accent:${s.accent}!important;--accent-fill:${s.fill}!important;--accent-strong:${s.strong}!important;--accent-soft:${s.soft}!important;--on-accent:${s.onAccent}!important;${series}}`
}

/** CSS for a declared page accent: the primary group only (daisyUI primary + legacy --accent*, series); base / text colours stay the theme's. Dark via media query. */
export function pageAccentCss(raw: unknown): string {
  const hex = normalizeAccent(raw)
  if (hex === null) return ''
  const sel = ':root,[data-iui-style]'
  return `${block(sel, deriveAccentSet(hex, 'light'), 'light')}@media (prefers-color-scheme: dark){${block(sel, deriveAccentSet(hex, 'dark'), 'dark')}}`
}
