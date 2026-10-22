import Schema from '@deepseek-ai/schemastery'
import { DEFAULT_THEME_ID } from '../config/defaults.ts'
import { normalizeCdnPreset } from '../shared/vendor-registry.ts'
import { normalizeMapTilesSetting } from '../shared/net-context.ts'
import { normalizeUiEagerness, type UiEagerness } from '../config/referee-rules.ts'

function themeIdField() {
  // Soft string: unknown/legacy pack theme ids (shadcn/mui/…) resolve to DEFAULT_THEME_ID at runtime.
  return Schema.string().default(DEFAULT_THEME_ID)
}

export const Config = Schema.object({
  themeId: themeIdField().volatile(),
  fenceFeedback: Schema.boolean().default(true).volatile(),
  formatReferee: Schema.boolean().default(true).volatile(),
  strictImagePolicy: Schema.boolean().default(false).volatile(),
  legacyFences: Schema.boolean().default(false).volatile(),
  cdnPreset: Schema.union(['auto', 'local', 'china', 'global', 'custom'] as const).default('auto').volatile(),
  mapTiles: Schema.union(['auto', 'amap', 'global'] as const).default('auto').volatile(),
  cdnTemplate: Schema.string().default('').volatile(),
  uiEagerness: Schema.union(['restrained', 'balanced', 'eager'] as const).default('balanced').volatile(),
  customTokensJson: Schema.string().default('').volatile(),
  pageStyleJson: Schema.string().default('').volatile(),
  userTemplatesJson: Schema.string().default('').volatile(),
  jevEnabled: Schema.boolean().default(false).volatile(),
  jevApiKey: Schema.string().role('secret').default('').volatile(),
  jevBaseUrl: Schema.string().default('').volatile(),
  jevModel: Schema.string().default('jev-latest').volatile(),
  structuredOutputsMode: Schema.union(['off', 'auto', 'prefer'] as const).default('auto').volatile(),
  structuredOutputsProbeUrl: Schema.string().default('').volatile(),
  structuredOutputsProbeKey: Schema.string().role('secret').default('').volatile(),
})

export type IuiConfigResolved = {
  themeId: string
  fenceFeedback: boolean
  formatReferee: boolean
  /** F4: sandbox img-src only data:/blob: + allowlisted image hosts. */
  strictImagePolicy: boolean
  /** F16: render deprecated ```iui / ```dsh-ui fences (removed in 0.14). */
  legacyFences: boolean
  /** F19: sandbox library source preset. */
  cdnPreset: 'auto' | 'local' | 'china' | 'global' | 'custom'
  /** Batch F: map basemap (auto · amap · global). */
  mapTiles: 'auto' | 'amap' | 'global'
  /** F19: custom source template `https://host/{name}@{version}/{file}`. */
  cdnTemplate: string
  /** G7: restrained = pages only on explicit asks; balanced = explain/compare answers in text + host offer; eager = visualise when it helps. */
  uiEagerness: UiEagerness
  customTokensJson: string
  pageStyleJson: string
  userTemplatesJson: string
  jevEnabled: boolean
  jevApiKey: string
  jevBaseUrl: string
  jevModel: string
  structuredOutputsMode: 'off' | 'auto' | 'prefer'
  structuredOutputsProbeUrl: string
  structuredOutputsProbeKey: string
}

export function readConfigValue<T>(value: unknown, fallback: T): T {
  if (value !== null && typeof value === 'object' && 'get' in value) {
    const getter = (value as { get?: () => unknown }).get
    if (typeof getter === 'function') {
      const next = getter.call(value)
      return (next === undefined ? fallback : next) as T
    }
  }
  return (value === undefined ? fallback : value) as T
}

export function resolveLiveConfig(config: unknown): IuiConfigResolved {
  const row = (config ?? {}) as Record<string, unknown>
  return {
    themeId: String(readConfigValue(row.themeId, DEFAULT_THEME_ID)),
    fenceFeedback: Boolean(readConfigValue(row.fenceFeedback, true)),
    formatReferee: Boolean(readConfigValue(row.formatReferee, true)),
    strictImagePolicy: Boolean(readConfigValue(row.strictImagePolicy, false)),
    legacyFences: Boolean(readConfigValue(row.legacyFences, false)),
    cdnPreset: normalizeCdnPreset(readConfigValue(row.cdnPreset, 'auto')),
    mapTiles: normalizeMapTilesSetting(readConfigValue(row.mapTiles, 'auto')),
    cdnTemplate: String(readConfigValue(row.cdnTemplate, '')).trim(),
    uiEagerness: normalizeUiEagerness(readConfigValue(row.uiEagerness, 'balanced')),
    customTokensJson: String(readConfigValue(row.customTokensJson, '')),
    pageStyleJson: String(readConfigValue(row.pageStyleJson, '')),
    userTemplatesJson: String(readConfigValue(row.userTemplatesJson, '')),
    jevEnabled: Boolean(readConfigValue(row.jevEnabled, false)),
    jevApiKey: String(readConfigValue(row.jevApiKey, '')),
    jevBaseUrl: String(readConfigValue(row.jevBaseUrl, '')),
    jevModel: String(readConfigValue(row.jevModel, 'jev-latest')),
    structuredOutputsMode: (() => {
      const m = String(readConfigValue(row.structuredOutputsMode, 'auto'))
      return m === 'off' || m === 'prefer' ? m : 'auto'
    })(),
    structuredOutputsProbeUrl: String(readConfigValue(row.structuredOutputsProbeUrl, '')),
    structuredOutputsProbeKey: String(readConfigValue(row.structuredOutputsProbeKey, '')),
  }
}
