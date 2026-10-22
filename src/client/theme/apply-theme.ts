import type { ThemePack, ThemeTokens } from '../../config/types.ts'
import { resolveTheme, resolveThemeId } from '../../config/resolve.ts'
import { DEFAULT_THEME_ID } from '../../config/defaults.ts'
import { CUSTOM_TOKEN_WHITELIST } from '../../themes/iui-daisy.ts'

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
  // S2: host light/dark toggles change the dark token set too.
  const stopHost = subscribeHostScheme(listener)
  return () => { listeners.delete(listener); stopHost() }
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
          if (!/^--[a-zA-Z0-9-]{1,80}$/.test(key)) continue
          // S7: same value rules as the settings check (no declaration / rule breakout).
          if (typeof value !== 'string' || value.length > 200 || /[;{}<>]|\/\*|url\s*\(|expression\s*\(/i.test(value)) continue
          // visual(①): whitelist only (accent / radius / density / font size).
          if (!CUSTOM_TOKEN_WHITELIST.includes(key)) continue
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

/**
 * S2: the host's own light/dark theme. dsh marks dark with
 * `body[data-ds-dark-theme]` and always defines its `--dsw-alias-*` palette, so
 * no attribute + palette present = light. Elsewhere (no palette) → null, and
 * pages keep following the OS (`prefers-color-scheme`).
 */
/** Cached while observed (getSnapshot runs on every render; avoid a style recalc each time). */
export function hostColorScheme(): 'light' | 'dark' | null {
  if (hostSchemeObserver !== null) return lastHostScheme ?? null
  return readHostColorScheme()
}
function readHostColorScheme(): 'light' | 'dark' | null {
  if (typeof document === 'undefined' || !document.body) return null
  if (document.body.hasAttribute('data-ds-dark-theme')) return 'dark'
  try {
    const cs = getComputedStyle(document.body)
    if (cs.getPropertyValue('--dsw-alias-bg-base').trim() !== '') return 'light'
  } catch { /* detached */ }
  return null
}

const hostSchemeListeners = new Set<() => void>()
let hostSchemeObserver: MutationObserver | null = null
let lastHostScheme: 'light' | 'dark' | null | undefined

/** Fires when `hostColorScheme()` changes (one shared MutationObserver on body). */
export function subscribeHostScheme(listener: () => void): () => void {
  hostSchemeListeners.add(listener)
  if (hostSchemeObserver === null && typeof MutationObserver !== 'undefined' && typeof document !== 'undefined' && document.body) {
    lastHostScheme = readHostColorScheme()
    hostSchemeObserver = new MutationObserver(() => {
      const next = readHostColorScheme()
      if (next === lastHostScheme) return
      lastHostScheme = next
      for (const fn of [...hostSchemeListeners]) { try { fn() } catch { /* ignore */ } }
    })
    hostSchemeObserver.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme', 'class', 'style'] })
    hostSchemeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] })
  }
  return () => {
    hostSchemeListeners.delete(listener)
    if (hostSchemeListeners.size === 0 && hostSchemeObserver) { hostSchemeObserver.disconnect(); hostSchemeObserver = null }
  }
}
