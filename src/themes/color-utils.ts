/**
 * Small hex helpers for brand → surface derivation.
 * Packs never hard-code secondary/tint/hero washes; they derive from accent.
 */

export type Rgb = { r: number; g: number; b: number }

export function parseHex(hex: string): Rgb | null {
  const raw = hex.trim().replace(/^#/, '')
  if (!/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(raw)) return null
  const full = raw.length === 3
    ? raw.split('').map((c) => c + c).join('')
    : raw
  const n = Number.parseInt(full, 16)
  if (!Number.isFinite(n)) return null
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)))
  return `#${[clamp(r), clamp(g), clamp(b)].map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

/** Linear mix in sRGB: t=0 → a, t=1 → b. */
export function mixHex(a: string, b: string, t: number): string {
  const A = parseHex(a)
  const B = parseHex(b)
  if (!A || !B) return a
  const u = Math.max(0, Math.min(1, t))
  return rgbToHex({
    r: A.r + (B.r - A.r) * u,
    g: A.g + (B.g - A.g) * u,
    b: A.b + (B.b - A.b) * u,
  })
}

/** Tint toward white (amount 0..1). */
export function tintHex(hex: string, amount = 0.88): string {
  return mixHex(hex, '#ffffff', amount)
}

/** Shade toward black (amount 0..1). */
export function shadeHex(hex: string, amount = 0.35): string {
  return mixHex(hex, '#000000', amount)
}

/**
 * Derive a secondary accent by rotating hue ~40° in HSL (keeps saturation/lightness).
 * Falls back to a muted mix with blue if parse fails.
 */
export function deriveSecondary(accent: string): string {
  const rgb = parseHex(accent)
  if (!rgb) return mixHex(accent, '#6366f1', 0.45)
  const { r, g, b } = rgb
  const max = Math.max(r, g, b) / 255
  const min = Math.min(r, g, b) / 255
  const l = (max + min) / 2
  const d = max - min
  let h = 0
  let s = 0
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    const rr = r / 255
    const gg = g / 255
    const bb = b / 255
    switch (max) {
      case rr:
        h = ((gg - bb) / d + (gg < bb ? 6 : 0)) / 6
        break
      case gg:
        h = ((bb - rr) / d + 2) / 6
        break
      default:
        h = ((rr - gg) / d + 4) / 6
    }
  }
  h = (h + 40 / 360) % 1
  const hue2rgb = (p: number, q: number, t: number) => {
    let tt = t
    if (tt < 0) tt += 1
    if (tt > 1) tt -= 1
    if (tt < 1 / 6) return p + (q - p) * 6 * tt
    if (tt < 1 / 2) return q
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6
    return p
  }
  if (s === 0) return rgbToHex({ r: l * 255, g: l * 255, b: l * 255 })
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  return rgbToHex({
    r: hue2rgb(p, q, h + 1 / 3) * 255,
    g: hue2rgb(p, q, h) * 255,
    b: hue2rgb(p, q, h - 1 / 3) * 255,
  })
}

/** Relative luminance (WCAG) for picking on-accent ink. */
export function relativeLuminance(hex: string): number {
  const rgb = parseHex(hex)
  if (!rgb) return 0
  const lin = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  const R = lin(rgb.r)
  const G = lin(rgb.g)
  const B = lin(rgb.b)
  return 0.2126 * R + 0.7152 * G + 0.0722 * B
}

export function onAccentInk(accent: string): string {
  return relativeLuminance(accent) > 0.45 ? '#111827' : '#ffffff'
}

export type BrandSurfaces = {
  secondary: string
  tint: string
  tintStrong: string
  heroFrom: string
  heroTo: string
  surface: string
  surfaceMuted: string
  fg: string
  mutedFg: string
  border: string
  onAccent: string
  /** Dark-mode counterparts */
  surfaceDark: string
  surfaceMutedDark: string
  fgDark: string
  mutedFgDark: string
  borderDark: string
  heroFromDark: string
  heroToDark: string
}

/** Derive a full surface kit from a brand accent (+ optional semantic ok/warn/danger unused here). */
export function deriveBrandSurfaces(accent: string, secondary?: string): BrandSurfaces {
  const sec = secondary ?? deriveSecondary(accent)
  return {
    secondary: sec,
    tint: tintHex(accent, 0.9),
    tintStrong: tintHex(accent, 0.78),
    heroFrom: tintHex(accent, 0.9),
    heroTo: tintHex(sec, 0.9),
    surface: '#ffffff',
    surfaceMuted: tintHex(accent, 0.96),
    fg: '#111827',
    mutedFg: '#6b7280',
    border: mixHex('#e5e7eb', accent, 0.08),
    onAccent: onAccentInk(accent),
    surfaceDark: '#0f172a',
    surfaceMutedDark: mixHex('#0f172a', accent, 0.12),
    fgDark: '#f8fafc',
    mutedFgDark: '#94a3b8',
    borderDark: mixHex('#1e293b', accent, 0.2),
    heroFromDark: shadeHex(accent, 0.55),
    heroToDark: shadeHex(sec, 0.55),
  }
}

/** CSS linear-gradient string for heroes (light). */
export function heroGradientCss(from: string, to: string, angle = '135deg'): string {
  return `linear-gradient(${angle}, ${from}, ${to})`
}
