/**
 * IUI config types — sandbox-first product path.
 */

export type ThemeTokens = Readonly<Record<string, string>>

export interface ThemePack {
  id: string
  label: string
  description?: string
  tokens: ThemeTokens
  darkTokens?: ThemeTokens
}

export interface IuiPluginConfig {
  themeId?: string
  fenceFeedback?: boolean
  formatReferee?: boolean
  strictImagePolicy?: boolean
  /** F16: deprecated ```iui / ```dsh-ui fence compatibility (default off; removed in 0.14). */
  legacyFences?: boolean
  /** F19: sandbox library source (`local` default · `china` · `global` · `custom`). */
  cdnPreset?: 'local' | 'china' | 'global' | 'custom'
  /** F19: custom library URL template, e.g. `https://my.cdn/{name}@{version}/{file}`. */
  cdnTemplate?: string
  customTokensJson?: string
  userTemplatesJson?: string
  /** Optional TypeSafe Jev format router. */
  jevEnabled?: boolean
  jevApiKey?: string
  jevBaseUrl?: string
  jevModel?: string
  structuredOutputsMode?: 'off' | 'auto' | 'prefer'
  structuredOutputsProbeUrl?: string
  structuredOutputsProbeKey?: string
}
