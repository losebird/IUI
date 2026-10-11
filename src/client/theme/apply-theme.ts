import type { ThemePack, ThemeTokens } from '../../config/types.ts'
import { resolveTheme, resolveThemeId } from '../../config/resolve.ts'
import { DEFAULT_THEME_ID } from '../../config/defaults.ts'

/** Active theme id for this browser session (set by client boot / runtime-config). */
let activeThemeId: string = DEFAULT_THEME_ID
let customTokens: ThemeTokens = {}
const listeners = new Set<() => void>()

function notify(): void {
  for (const listener of listeners) listener()
}

export function setActiveThemeId(id: string | undefined | null): void {
  const next = resolveThemeId(id)
  if (next === activeThemeId) return
  activeThemeId = next
  notify()
}

export function getActiveThemeId(): string {
  return activeThemeId
}

export function subscribeActiveTheme(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** Parse optional user JSON token map (M3). Invalid JSON is ignored. */
export function setCustomTokens(json: string | undefined | null): void {
  const raw = (json ?? '').trim()
  let next: ThemeTokens = {}
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as unknown
      if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const out: Record<string, string> = {}
        for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
          if (!key.startsWith('--')) continue
          if (typeof value !== 'string') continue
          out[key] = value
        }
        next = out
      }
    } catch {
      next = {}
    }
  }
  const prev = JSON.stringify(customTokens)
  const upcoming = JSON.stringify(next)
  if (prev === upcoming) return
  customTokens = next
  notify()
}

export function getCustomTokens(): ThemeTokens {
  return customTokens
}

export function getActiveTheme(): ThemePack {
  return resolveTheme(activeThemeId)
}

/** Flatten theme tokens (+ optional dark + user overrides) into a React style object. */
export function themeToStyle(theme: ThemePack, dark = false): Record<string, string> {
  const merged: ThemeTokens = dark && theme.darkTokens
    ? { ...theme.tokens, ...theme.darkTokens, ...customTokens }
    : { ...theme.tokens, ...customTokens }
  return { ...merged }
}

export function isHostDarkTheme(): boolean {
  if (typeof document === 'undefined') return false
  return document.body?.hasAttribute('data-ds-dark-theme') === true
}
