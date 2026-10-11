import type { ThemePack } from './types.ts'
import { DEFAULT_THEME_ID } from './defaults.ts'
import { getThemePack, listThemePacks } from '../themes/index.ts'

export function resolveThemeId(requested?: string | null): string {
  const id = (requested ?? '').trim() || DEFAULT_THEME_ID
  return getThemePack(id) !== undefined ? id : DEFAULT_THEME_ID
}

export function resolveTheme(requested?: string | null): ThemePack {
  return getThemePack(resolveThemeId(requested))!
}

/** Packs deleted — always sandbox. */
export function resolvePackId(_requested?: string | null): string {
  return 'sandbox'
}

export function availableThemes(): ThemePack[] {
  return listThemePacks()
}

export function availablePacks(): Array<{ id: string; label: string }> {
  return [{ id: 'sandbox', label: 'Sandbox' }]
}
