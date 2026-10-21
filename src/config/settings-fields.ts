/**
 * S5: the one list of IUI settings fields the settings page binds. Must equal the
 * plugin `Config` schema keys minus HIDDEN_SETTINGS_FIELDS (enforced by a test), so
 * the page never registers a field the schema does not have.
 */
export type SettingsFieldKind =
  | { kind: 'bool'; default: boolean }
  | { kind: 'enum'; values: readonly string[]; default: string }
  | { kind: 'text' }

export const SETTINGS_FIELDS = {
  pageStyleJson: { kind: 'text' },
  uiEagerness: { kind: 'enum', values: ['restrained', 'balanced', 'eager'], default: 'balanced' },
  fenceFeedback: { kind: 'bool', default: true },
  formatReferee: { kind: 'bool', default: true },
  cdnPreset: { kind: 'enum', values: ['local', 'china', 'global', 'custom'], default: 'local' },
  cdnTemplate: { kind: 'text' },
  strictImagePolicy: { kind: 'bool', default: false },
  userTemplatesJson: { kind: 'text' },
  customTokensJson: { kind: 'text' },
  legacyFences: { kind: 'bool', default: false },
  jevEnabled: { kind: 'bool', default: false },
  jevApiKey: { kind: 'text' },
  jevBaseUrl: { kind: 'text' },
  jevModel: { kind: 'text' },
  structuredOutputsMode: { kind: 'enum', values: ['off', 'auto', 'prefer'], default: 'auto' },
  structuredOutputsProbeUrl: { kind: 'text' },
  structuredOutputsProbeKey: { kind: 'text' },
} as const satisfies Record<string, SettingsFieldKind>

export type SettingsFieldName = keyof typeof SETTINGS_FIELDS
export const SETTINGS_FIELD_NAMES = Object.keys(SETTINGS_FIELDS) as SettingsFieldName[]

/** Schema fields kept for compatibility but not shown (themeId: one theme since the sandbox rewrite). */
export const HIDDEN_SETTINGS_FIELDS = ['themeId'] as const
