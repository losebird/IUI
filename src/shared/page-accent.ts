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
const DARK_SURFACE = '#1a1a18'

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
      soft: mixHex(hex, LIGHT_SURFACE, 0.88),
      onAccent: inkFor(fill),
    }
  }
  const accent = ensureContrast(hex, DARK_SURFACE, '#ffffff')
  const fill = fitFill(relativeLuminance(hex) < 0.04 ? mixHex(hex, '#ffffff', 0.25) : hex, '#ffffff')
  return {
    accent,
    fill,
    strong: mixHex(fill, '#ffffff', 0.18),
    soft: mixHex(hex, DARK_SURFACE, 0.72),
    onAccent: inkFor(fill),
  }
}

function block(sel: string, s: AccentSet): string {
  return `${sel}{--accent:${s.accent}!important;--accent-fill:${s.fill}!important;--accent-strong:${s.strong}!important;--accent-soft:${s.soft}!important;--on-accent:${s.onAccent}!important;--iui-chart-1:${s.fill}!important}`
}

/** CSS for a declared page accent (beats personality presets; dark via media query). */
export function pageAccentCss(raw: unknown): string {
  const hex = normalizeAccent(raw)
  if (hex === null) return ''
  const sel = ':root,[data-iui-style]'
  return `${block(sel, deriveAccentSet(hex, 'light'))}@media (prefers-color-scheme: dark){${block(sel, deriveAccentSet(hex, 'dark'))}}`
}
