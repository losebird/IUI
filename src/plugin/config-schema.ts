import Schema from '@deepseek-ai/schemastery'
import { DEFAULT_THEME_ID } from '../config/defaults.ts'

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
  customTokensJson: Schema.string().default('').volatile(),
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
  customTokensJson: string
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
    customTokensJson: String(readConfigValue(row.customTokensJson, '')),
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
