/**
 * G10: zero-token appearance tweaks for a page (⋯ → 外观).
 *
 * Accent, density, font size, corner radius and light/dark are applied by the
 * host as CSS variables / an in-frame scheme switch — the model is not involved.
 * A saved default is injected into later pages and summarised for the prompt.
 */
import { normalizeAccent, pageAccentCss } from './page-accent.ts'

export type PageDensity = 'compact' | 'standard' | 'comfortable'
export type PageFontScale = 'S' | 'M' | 'L'
export type PageRadius = 'square' | 'standard' | 'round'
export type PageScheme = 'auto' | 'light' | 'dark'

export interface PageAppearance {
  /** `#rrggbb`, or null to keep the page's own accent. */
  accent: string | null
  density: PageDensity
  scale: PageFontScale
  radius: PageRadius
  scheme: PageScheme
}

export const DEFAULT_PAGE_APPEARANCE: Readonly<PageAppearance> = Object.freeze({
  accent: null, density: 'standard', scale: 'M', radius: 'standard', scheme: 'auto',
})

/** Six presets (blue, teal, indigo, orange, rose, graphite) — all derive AA-safe token sets. */
export const ACCENT_PRESETS: ReadonlyArray<{ id: string; hex: string }> = [
  { id: 'blue', hex: '#185FA5' },
  { id: 'teal', hex: '#0F766E' },
  { id: 'indigo', hex: '#4F46E5' },
  { id: 'orange', hex: '#E4572E' },
  { id: 'rose', hex: '#D6336C' },
  { id: 'graphite', hex: '#3F3F46' },
]

const DENSITIES: readonly PageDensity[] = ['compact', 'standard', 'comfortable']
const SCALES: readonly PageFontScale[] = ['S', 'M', 'L']
const RADII: readonly PageRadius[] = ['square', 'standard', 'round']
const SCHEMES: readonly PageScheme[] = ['auto', 'light', 'dark']

function pick<T extends string>(list: readonly T[], value: unknown, fallback: T): T {
  return typeof value === 'string' && (list as readonly string[]).includes(value) ? value as T : fallback
}

/** Accepts an object or its JSON; unknown / invalid fields fall back to defaults. */
export function normalizePageAppearance(raw: unknown): PageAppearance {
  let value: unknown = raw
  if (typeof raw === 'string') {
    const text = raw.trim()
    if (text === '') return { ...DEFAULT_PAGE_APPEARANCE }
    try { value = JSON.parse(text) } catch { return { ...DEFAULT_PAGE_APPEARANCE } }
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return { ...DEFAULT_PAGE_APPEARANCE }
  const r = value as Record<string, unknown>
  return {
    accent: normalizeAccent(r.accent),
    density: pick(DENSITIES, r.density, 'standard'),
    scale: pick(SCALES, r.scale, 'M'),
    radius: pick(RADII, r.radius, 'standard'),
    scheme: pick(SCHEMES, r.scheme, 'auto'),
  }
}

export function isDefaultPageAppearance(a: PageAppearance): boolean {
  return a.accent === null && a.density === 'standard' && a.scale === 'M' && a.radius === 'standard' && a.scheme === 'auto'
}

/** Compact JSON with only the non-default fields ('' when everything is default). */
export function serializePageAppearance(a: PageAppearance): string {
  const out: Record<string, string> = {}
  if (a.accent !== null) out.accent = a.accent
  if (a.density !== 'standard') out.density = a.density
  if (a.scale !== 'M') out.scale = a.scale
  if (a.radius !== 'standard') out.radius = a.radius
  if (a.scheme !== 'auto') out.scheme = a.scheme
  return Object.keys(out).length ? JSON.stringify(out) : ''
}

const TOKEN_SEL = ':root,[data-theme],[data-iui-style],.iui-sandbox-card,.iui-sandbox-kpi'

const DENSITY_VARS: Record<Exclude<PageDensity, 'standard'>, Record<string, string>> = {
  compact: {
    '--iui-pack-pad': '12px', '--iui-pack-gap': '8px', '--iui-gap': '8px', '--iui-style-pad': '10px',
    '--space-2': '6px', '--space-3': '9px', '--space-4': '12px', '--space-5': '15px', '--space-6': '18px', '--space-7': '24px', '--space-8': '30px',
    '--size-field': '.22rem', '--size-selector': '.22rem',
  },
  comfortable: {
    '--iui-pack-pad': '24px', '--iui-pack-gap': '18px', '--iui-gap': '18px', '--iui-style-pad': '26px',
    '--space-2': '10px', '--space-3': '15px', '--space-4': '20px', '--space-5': '25px', '--space-6': '30px', '--space-7': '40px', '--space-8': '50px',
    '--size-field': '.28rem', '--size-selector': '.28rem',
  },
}

const RADIUS_VARS: Record<Exclude<PageRadius, 'standard'>, Record<string, string>> = {
  square: {
    '--border-radius-md': '3px', '--border-radius-lg': '4px', '--border-radius-xl': '6px',
    '--iui-pack-radius': '4px', '--iui-pack-radius-sm': '3px', '--iui-pack-radius-control': '3px',
    '--radius-box': '6px', '--radius-field': '4px', '--radius-selector': '3px',
  },
  round: {
    '--border-radius-md': '12px', '--border-radius-lg': '18px', '--border-radius-xl': '24px',
    '--iui-pack-radius': '18px', '--iui-pack-radius-sm': '12px', '--iui-pack-radius-control': '12px',
    '--radius-box': '1.75rem', '--radius-field': '999px', '--radius-selector': '.75rem',
  },
}

/** Font size via `zoom` so author px sizes scale too (fixes "text too small"). */
export const PAGE_FONT_ZOOM: Readonly<Record<PageFontScale, number>> = { S: 0.9, M: 1, L: 1.15 }

function varsBlock(vars: Record<string, string>): string {
  return `${TOKEN_SEL}{${Object.entries(vars).map(([k, v]) => `${k}:${v}!important`).join(';')}}`
}

/** CSS for the in-frame `#iui-appearance` style ('' for the default look). */
export function pageAppearanceCss(a: PageAppearance): string {
  const parts: string[] = []
  if (a.accent !== null) parts.push(pageAccentCss(a.accent))
  if (a.density !== 'standard') parts.push(varsBlock(DENSITY_VARS[a.density]))
  if (a.radius !== 'standard') parts.push(varsBlock(RADIUS_VARS[a.radius]))
  if (a.scale !== 'M') parts.push(`html{zoom:${PAGE_FONT_ZOOM[a.scale]}}`)
  if (a.scheme !== 'auto') parts.push(`:root{color-scheme:${a.scheme}}`)
  return parts.join('\n')
}

const ZH = {
  density: { compact: '紧凑', standard: '标准', comfortable: '宽松' },
  scale: { S: '小', M: '中', L: '大' },
  radius: { square: '方正', standard: '标准', round: '圆润' },
  scheme: { auto: '跟随宿主', light: '浅色', dark: '深色' },
} as const

/** One prompt line for a saved default style (null when everything is default). */
export function pageAppearanceNote(a: PageAppearance): string | null {
  if (isDefaultPageAppearance(a)) return null
  const bits: string[] = []
  if (a.accent !== null) bits.push(`主色 ${a.accent}`)
  if (a.density !== 'standard') bits.push(`密度${ZH.density[a.density]}`)
  if (a.scale !== 'M') bits.push(`字号${ZH.scale[a.scale]}`)
  if (a.radius !== 'standard') bits.push(`圆角${ZH.radius[a.radius]}`)
  if (a.scheme !== 'auto') bits.push(ZH.scheme[a.scheme])
  return `[iui-style] 用户偏好：${bits.join('，')}。宿主会自动套用到页面，不必在 CSS 里写这些颜色和尺寸，也不用写 accent 头。`
}
