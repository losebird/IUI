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
  /** F19/F2: sandbox library source (`auto` default · `local` · `china` · `global` · `custom`). */
  cdnPreset?: 'auto' | 'local' | 'china' | 'global' | 'custom'
  /** F4 (Batch F): map basemap — `auto` (AMap when the probe sees a mainland-China network) · `amap` · `global`. */
  mapTiles?: 'auto' | 'amap' | 'global'
  /** F19: custom library URL template, e.g. `https://my.cdn/{name}@{version}/{file}`. */
  cdnTemplate?: string
  /** G7: how readily replies become pages (`balanced` default). */
  uiEagerness?: 'restrained' | 'balanced' | 'eager'
  customTokensJson?: string
  /** G10: saved default page style (JSON: accent / density / scale / radius / scheme). */
  pageStyleJson?: string
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
