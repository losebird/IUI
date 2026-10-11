import type { ThemePack } from '../config/types.ts'
import { iuiDefaultTheme } from './iui-default.ts'

const THEME_PACKS: ThemePack[] = [iuiDefaultTheme]
const BY_ID = new Map(THEME_PACKS.map((t) => [t.id, t]))

export function listThemePacks(): ThemePack[] {
  return THEME_PACKS.slice()
}

export function getThemePack(id: string): ThemePack | undefined {
  return BY_ID.get(id)
}

export { iuiDefaultTheme }
export { IUI_TOKEN_CATALOG, IUI_COMPONENT_CATALOG } from './tokens.ts'
export { sandboxBrandCssVars, SANDBOX_BRAND_ID } from './sandbox-brand.ts'
