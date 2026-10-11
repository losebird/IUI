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
