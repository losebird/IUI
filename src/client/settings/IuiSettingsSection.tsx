/**
 * IUI settings: pack cards, structured token overrides, live GenuiBlock preview.
 * Theme follows the selected pack (no mismatched segmented theme control).
 */
import { useMemo, useState } from 'react'
import {
  SettingsForm,
  SettingsFormModel,
  Switch,
  settingsTextField,
  type SettingsFormScope,
  type SettingsFormShell,
  type SettingsFieldState,
} from '@deepseek-ai/dsh-client-ui-primitives'
const listComponentPacks = () => [{ id: 'sandbox', label: 'Sandbox HTML', description: 'Free HTML/CSS/JS pages', maturity: 'native' as 'native' | 'scaffold', defaultThemeId: 'iui-default' }]
const getComponentPack = (id: string) => listComponentPacks().find(p => p.id === id)
import { listThemePacks } from '../../themes/index.ts'
import { ThemeRoot } from '../theme/ThemeRoot.tsx'
import { setActiveThemeId, setCustomTokens } from '../theme/apply-theme.ts'
import { lockVisualPreview, unlockVisualPreview } from '../theme/preview-lock.ts'
import { setActivePackId } from '../theme/apply-pack.ts'
import { refreshRuntimeConfig } from '../runtime-config.ts'
import { clearAllPageState } from '../page-storage.ts'
import { GenuiBlock } from '../GenuiBlock.tsx'
import { SETTINGS_PREVIEW_SPEC } from './preview-spec.ts'
import { composeOverrides, parseOverrides, type TokenOverrideForm } from './token-overrides.ts'
import {
  formatIuiFence,
  parseUserTemplatesJson,
  removeUserTemplate,
  serializeUserTemplates,
  upsertUserTemplate,
  type UserTemplate,
} from './user-templates.ts'
import { insertIntoComposer } from '../composer-bridge.ts'
import type { GenuiSpec } from '../spec.ts'
import { assetUrl } from '../asset-loader.ts'
import styles from './IuiSettingsSection.module.css'

export type IuiSettingsSectionValue = {
  themeId?: string
  packId?: string
  fenceFeedback?: boolean
  formatReferee?: boolean
  strictImagePolicy?: boolean
  legacyFences?: boolean
  customTokensJson?: string
  userTemplatesJson?: string
  gatewayMode?: 'in-process' | 'sidecar' | 'off'
  gatewaySidecarUrl?: string
  instanceStorePersist?: boolean
  instanceStorePersistPath?: string
  frameChannelMount?: boolean
  jevEnabled?: boolean
  jevApiKey?: string
  jevBaseUrl?: string
  jevModel?: string
  structuredOutputsMode?: 'off' | 'auto' | 'prefer'
  structuredOutputsProbeUrl?: string
  structuredOutputsProbeKey?: string
}

type CardSnapshot = SettingsFormShell & {
  themeId: SettingsFieldState
  packId: SettingsFieldState
  fenceFeedback: SettingsFieldState
  formatReferee: SettingsFieldState
  strictImagePolicy: SettingsFieldState
  legacyFences: SettingsFieldState
  customTokensJson: SettingsFieldState
  userTemplatesJson: SettingsFieldState
  gatewayMode: SettingsFieldState
  gatewaySidecarUrl: SettingsFieldState
  instanceStorePersist: SettingsFieldState
  instanceStorePersistPath: SettingsFieldState
  frameChannelMount: SettingsFieldState
  jevEnabled: SettingsFieldState
  jevApiKey: SettingsFieldState
  jevBaseUrl: SettingsFieldState
  jevModel: SettingsFieldState
  structuredOutputsMode: SettingsFieldState
  structuredOutputsProbeUrl: SettingsFieldState
  structuredOutputsProbeKey: SettingsFieldState
}

type Injected = {
  hooks: { iuiSettings: { subscribe(listener: () => void): () => void; getSnapshot(): CardSnapshot } }
  edit: (field: string, text: string) => void
  resetField: (field: string) => void
  save: () => void
  discard: () => void
}

type LocaleT = (key: string) => string

function boolField(field: string) {
  return {
    field,
    format: (value: unknown) => (value === false ? 'false' : 'true'),
    parse: (text: string) => {
      if (text === 'true') return { kind: 'set' as const, value: true }
      if (text === 'false') return { kind: 'set' as const, value: false }
      return undefined
    },
  }
}

function enumField(field: string, allowed: readonly string[]) {
  const set = new Set(allowed)
  return {
    field,
    format: (value: unknown) => (typeof value === 'string' ? value : ''),
    parse: (text: string) => {
      if (!text) return { kind: 'clear' as const }
      if (!set.has(text)) return undefined
      return { kind: 'set' as const, value: text }
    },
  }
}

function formLabels(t: LocaleT) {
  return {
    unavailable: t('unavailable'),
    readOnly: t('readOnly'),
    saveFailed: t('saveFailed'),
    save: t('save'),
    saving: t('saving'),
  }
}

function selectPack(
  packId: string,
  edit: (field: string, text: string) => void,
): void {
  lockVisualPreview()
  edit('packId', packId)
  setActivePackId(packId)
  const themeId = getComponentPack(packId)?.defaultThemeId
  if (themeId) {
    edit('themeId', themeId)
    setActiveThemeId(themeId)
  }
}

export function IuiSettingsSection(props: {
  t: LocaleT
  useIuiSettings: (select: (s: CardSnapshot) => CardSnapshot) => CardSnapshot
  edit: (field: string, text: string) => void
  resetField: (field: string) => void
  save: () => void
  discard: () => void
}) {
  const { t } = props
  const state = props.useIuiSettings((s) => s)
  const packs = useMemo(() => listComponentPacks(), [])
  const packValue = packs.some((p) => p.id === state.packId.text)
    ? state.packId.text
    : (packs[0]?.id ?? 'shadcn')

  const overrides = useMemo(
    () => parseOverrides(state.customTokensJson.text),
    [state.customTokensJson.text],
  )
  const parsedTemplates = useMemo(
    () => parseUserTemplatesJson(state.userTemplatesJson.text),
    [state.userTemplatesJson.text],
  )
  const [pageStorageNotice, setPageStorageNotice] = useState<string | null>(null)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const [templateDesc, setTemplateDesc] = useState('')
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)
  const [previewSpec, setPreviewSpec] = useState<GenuiSpec>(SETTINGS_PREVIEW_SPEC)
  const [templateNotice, setTemplateNotice] = useState<string | null>(null)
  const [gatewayHealth, setGatewayHealth] = useState<string | null>(null)
  const [gatewayChecking, setGatewayChecking] = useState(false)
  const [fenceOpsLine, setFenceOpsLine] = useState<string | null>(null)

  const writeOverrides = (next: TokenOverrideForm) => {
    lockVisualPreview()
    const json = composeOverrides(next)
    props.edit('customTokensJson', json)
    setCustomTokens(json)
  }

  const writeTemplates = (templates: UserTemplate[]) => {
    lockVisualPreview()
    props.edit('userTemplatesJson', serializeUserTemplates(templates))
  }

  const activeTemplate = parsedTemplates.templates.find((tpl) => tpl.id === selectedTemplateId)

  return (
    <div className={styles.section}>
      <div>
        <h2 className={styles.heading}>{t('title')}</h2>
        <p className={styles.intro}>{t('intro')}</p>
      </div>

      <SettingsForm
        labels={formLabels(t)}
        state={state}
        onSave={() => {
          props.save()
          window.setTimeout(() => {
            void refreshRuntimeConfig().then(() => unlockVisualPreview())
          }, 200)
          window.setTimeout(() => { void refreshRuntimeConfig() }, 800)
        }}
        onDiscard={() => {
          props.discard()
          unlockVisualPreview()
          void refreshRuntimeConfig()
        }}
      >
        <section className={styles.group}>
          <h3 className={styles.groupTitle}>{t('packId')}</h3>
          <p className={styles.groupHint}>{t('packIdHint')}</p>
          <div className={styles.packGrid} role="listbox" aria-label={t('packId')}>
            {packs.map((pack) => {
              const active = pack.id === packValue
              const maturity = pack.maturity === 'scaffold' ? 'scaffold' : 'native'
              return (
                <button
                  key={pack.id}
                  type="button"
                  role="option"
                  aria-selected={active}
                  disabled={!state.writable}
                  className={`${styles.packCard}${active ? ` ${styles.packCardActive}` : ''}`}
                  onClick={() => selectPack(pack.id, props.edit)}
                >
                  <div className={styles.packCardTop}>
                    <span className={styles.packName}>{pack.label}</span>
                    <span className={`${styles.badge} ${maturity === 'native' ? styles.badgeNative : styles.badgeScaffold}`}>
                      {maturity === 'native' ? t('maturityNative') : t('maturityScaffold')}
                    </span>
                  </div>
                  {pack.description ? <p className={styles.packDesc}>{pack.description}</p> : null}
                </button>
              )
            })}
          </div>
        </section>

        <section className={styles.group}>
          <h3 className={styles.groupTitle}>{t('appearance')}</h3>
          <p className={styles.groupHint}>{t('appearanceHint')}</p>
          <div className={styles.overrides}>
            <label className={styles.overrideField}>
              <span className={styles.overrideLabel}>{t('tokenAccent')}</span>
              <div className={styles.colorRow}>
                <input
                  className={styles.colorInput}
                  type="color"
                  disabled={!state.writable}
                  value={/^#[0-9a-fA-F]{6}$/.test(overrides.accent) ? overrides.accent : '#6366f1'}
                  onChange={(event) => writeOverrides({ ...overrides, accent: event.currentTarget.value })}
                />
                <input
                  className={styles.colorText}
                  type="text"
                  disabled={!state.writable}
                  placeholder="#6366f1"
                  value={overrides.accent}
                  onChange={(event) => writeOverrides({ ...overrides, accent: event.currentTarget.value })}
                />
              </div>
            </label>
            <label className={styles.overrideField}>
              <span className={styles.overrideLabel}>{t('tokenRadius')}</span>
              <select
                className={styles.select}
                disabled={!state.writable}
                value={overrides.radius}
                onChange={(event) => writeOverrides({
                  ...overrides,
                  radius: event.currentTarget.value as TokenOverrideForm['radius'],
                })}
              >
                <option value="">{t('tokenInherit')}</option>
                <option value="sm">{t('radiusSm')}</option>
                <option value="md">{t('radiusMd')}</option>
                <option value="lg">{t('radiusLg')}</option>
              </select>
            </label>
            <label className={styles.overrideField}>
              <span className={styles.overrideLabel}>{t('tokenDensity')}</span>
              <select
                className={styles.select}
                disabled={!state.writable}
                value={overrides.density}
                onChange={(event) => writeOverrides({
                  ...overrides,
                  density: event.currentTarget.value as TokenOverrideForm['density'],
                })}
              >
                <option value="">{t('tokenInherit')}</option>
                <option value="compact">{t('densityCompact')}</option>
                <option value="comfortable">{t('densityComfortable')}</option>
              </select>
            </label>
          </div>
        </section>

        <section className={styles.group}>
          <h3 className={styles.groupTitle}>{t('behavior')}</h3>
          <div className={styles.switchCard}>
            <div className={styles.switchCopy}>
              <div className={styles.switchTitle}>{t('fenceFeedback')}</div>
              <p className={styles.switchHint}>{t('fenceFeedbackHint')}</p>
            </div>
            <Switch
              checked={state.fenceFeedback.text !== 'false'}
              disabled={!state.writable}
              label={t('fenceFeedback')}
              onChange={(checked) => props.edit('fenceFeedback', checked ? 'true' : 'false')}
            />
          </div>
          <div className={styles.switchCard}>
            <div className={styles.switchCopy}>
              <div className={styles.switchTitle}>{t('formatReferee')}</div>
              <p className={styles.switchHint}>{t('formatRefereeHint')}</p>
            </div>
            <Switch
              checked={state.formatReferee.text !== 'false'}
              disabled={!state.writable}
              label={t('formatReferee')}
              onChange={(checked) => props.edit('formatReferee', checked ? 'true' : 'false')}
            />
          </div>
          <div className={styles.switchCard}>
            <div className={styles.switchCopy}>
              <div className={styles.switchTitle}>{t('strictImagePolicy')}</div>
              <p className={styles.switchHint}>{t('strictImagePolicyHint')}</p>
            </div>
            <Switch
              checked={state.strictImagePolicy.text === 'true'}
              disabled={!state.writable}
              label={t('strictImagePolicy')}
              onChange={(checked) => props.edit('strictImagePolicy', checked ? 'true' : 'false')}
            />
          </div>
          <div className={styles.switchCard}>
            <div className={styles.switchCopy}>
              <div className={styles.switchTitle}>{t('pageStorage')}</div>
              <p className={styles.switchHint}>{pageStorageNotice ?? t('pageStorageHint')}</p>
            </div>
            <button
              type="button"
              className={styles.secondaryBtn}
              onClick={() => {
                void clearAllPageState().then(() => setPageStorageNotice(t('pageStorageCleared')))
              }}
            >
              {t('pageStorageClear')}
            </button>
          </div>
        </section>

        <section className={styles.group}>
          <h3 className={styles.groupTitle}>{t('gateway')}</h3>
          <p className={styles.groupHint}>{t('gatewayHint')}</p>
          <label className={styles.overrideField}>
            <span className={styles.overrideLabel}>{t('gatewayMode')}</span>
            <select
              className={styles.select}
              disabled={!state.writable}
              value={['in-process', 'sidecar', 'off'].includes(state.gatewayMode.text) ? state.gatewayMode.text : 'in-process'}
              onChange={(event) => props.edit('gatewayMode', event.currentTarget.value)}
            >
              <option value="in-process">{t('gatewayModeInProcess')}</option>
              <option value="sidecar">{t('gatewayModeSidecar')}</option>
              <option value="off">{t('gatewayModeOff')}</option>
            </select>
          </label>
          <label className={styles.overrideField}>
            <span className={styles.overrideLabel}>{t('gatewaySidecarUrl')}</span>
            <input
              className={styles.colorText}
              type="url"
              disabled={!state.writable || state.gatewayMode.text !== 'sidecar'}
              placeholder="http://127.0.0.1:3097"
              value={state.gatewaySidecarUrl.text}
              onChange={(event) => props.edit('gatewaySidecarUrl', event.currentTarget.value)}
            />
            <span className={styles.hint}>{t('gatewaySidecarUrlHint')}</span>
          </label>
          <div className={styles.gatewayActions}>
            <button
              type="button"
              className={styles.secondaryBtn}
              disabled={gatewayChecking}
              onClick={() => {
                setGatewayChecking(true)
                setGatewayHealth(null)
                void (async () => {
                  try {
                    const res = await fetch(assetUrl('gateway/health'), { cache: 'no-store' })
                    const body = await res.json() as {
                      ok?: boolean
                      schemaVersion?: string
                      transport?: string
                      error?: string
                      fenceOps?: { total?: number; lastKind?: string | null }
                    }
                    if (res.ok && body.ok !== false) {
                      setGatewayHealth(
                        t('gatewayHealthOk')
                          .replace('{schema}', body.schemaVersion ?? '—')
                          .replace('{transport}', body.transport ?? state.gatewayMode.text),
                      )
                    } else {
                      setGatewayHealth(
                        t('gatewayHealthFail').replace('{error}', body.error ?? `HTTP ${res.status}`),
                      )
                    }
                    const ops = body.fenceOps
                    if (ops && typeof ops.total === 'number' && ops.total > 0) {
                      setFenceOpsLine(`${ops.total} · last=${ops.lastKind ?? '—'}`)
                    } else {
                      setFenceOpsLine(null)
                    }
                  } catch (err) {
                    setGatewayHealth(
                      t('gatewayHealthFail').replace(
                        '{error}',
                        err instanceof Error ? err.message : 'fetch failed',
                      ),
                    )
                  } finally {
                    setGatewayChecking(false)
                  }
                })()
              }}
            >
              {gatewayChecking ? t('gatewayHealthChecking') : t('gatewayHealthCheck')}
            </button>
            {gatewayHealth ? (
              <span
                className={`${styles.healthChip}${gatewayHealth.startsWith('Unreachable') || gatewayHealth.includes('不可达') ? ` ${styles.healthBad}` : ` ${styles.healthOk}`}`}
                role="status"
              >
                {gatewayHealth}
              </span>
            ) : null}
          </div>
          <p className={styles.hint}>
            {t('fenceOps')}: {fenceOpsLine ?? t('fenceOpsEmpty')}
          </p>
        </section>

        <section className={styles.group}>
          <h3 className={styles.groupTitle}>{t('instanceStore')}</h3>
          <p className={styles.groupHint}>{t('instanceStoreHint')}</p>
          <div className={styles.switchCard}>
            <div className={styles.switchCopy}>
              <div className={styles.switchTitle}>{t('instanceStorePersist')}</div>
            </div>
            <Switch
              checked={state.instanceStorePersist?.text === 'true'}
              disabled={!state.writable}
              label={t('instanceStorePersist')}
              onChange={(checked) => props.edit('instanceStorePersist', checked ? 'true' : 'false')}
            />
          </div>
          <label className={styles.overrideField}>
            <span className={styles.overrideLabel}>{t('instanceStorePersistPath')}</span>
            <input
              className={styles.colorText}
              type="text"
              disabled={!state.writable || state.instanceStorePersist?.text !== 'true'}
              placeholder="/home/box/.dsh/profiles/web/iui-instance-store.jsonl"
              value={state.instanceStorePersistPath?.text ?? ''}
              onChange={(event) => props.edit('instanceStorePersistPath', event.currentTarget.value)}
            />
            <span className={styles.hint}>{t('instanceStorePersistPathHint')}</span>
          </label>
          <div className={styles.switchCard}>
            <div className={styles.switchCopy}>
              <div className={styles.switchTitle}>{t('legacyFences')}</div>
              <p className={styles.groupHint}>{t('legacyFencesHint')}</p>
            </div>
            <Switch
              checked={state.legacyFences?.text === 'true'}
              disabled={!state.writable}
              label={t('legacyFences')}
              onChange={(checked) => props.edit('legacyFences', checked ? 'true' : 'false')}
            />
          </div>
          <div className={styles.switchCard}>
            <div className={styles.switchCopy}>
              <div className={styles.switchTitle}>{t('frameChannelMount')}</div>
              <p className={styles.groupHint}>{t('frameChannelMountHint')}</p>
            </div>
            <Switch
              checked={state.frameChannelMount?.text !== 'false'}
              disabled={!state.writable}
              label={t('frameChannelMount')}
              onChange={(checked) => props.edit('frameChannelMount', checked ? 'true' : 'false')}
            />
          </div>
          <p className={styles.hint}>
            <strong>{t('forceFenceDoc')}</strong> — {t('forceFenceDocHint')}
          </p>
        </section>

        <section className={styles.group}>
          <h3 className={styles.groupTitle}>{t('formatRouter')}</h3>
          <p className={styles.groupHint}>{t('formatRouterHint')}</p>
          <div className={styles.switchCard}>
            <div className={styles.switchCopy}>
              <div className={styles.switchTitle}>{t('jevEnabled')}</div>
              <p className={styles.groupHint}>{t('jevEnabledHint')}</p>
            </div>
            <Switch
              checked={state.jevEnabled?.text === 'true'}
              disabled={!state.writable}
              label={t('jevEnabled')}
              onChange={(checked) => props.edit('jevEnabled', checked ? 'true' : 'false')}
            />
          </div>
          <label className={styles.overrideField}>
            <span className={styles.overrideLabel}>{t('jevApiKey')}</span>
            <input
              className={styles.colorText}
              type="password"
              autoComplete="off"
              disabled={!state.writable || state.jevEnabled?.text !== 'true'}
              placeholder="TypeSafe API key"
              value={state.jevApiKey?.text ?? ''}
              onChange={(event) => props.edit('jevApiKey', event.currentTarget.value)}
            />
            <span className={styles.hint}>{t('jevApiKeyHint')}</span>
          </label>
          <label className={styles.overrideField}>
            <span className={styles.overrideLabel}>{t('jevBaseUrl')}</span>
            <input
              className={styles.colorText}
              type="text"
              disabled={!state.writable || state.jevEnabled?.text !== 'true'}
              placeholder="https://api.typesafe.ai"
              value={state.jevBaseUrl?.text ?? ''}
              onChange={(event) => props.edit('jevBaseUrl', event.currentTarget.value)}
            />
          </label>
          <label className={styles.overrideField}>
            <span className={styles.overrideLabel}>{t('jevModel')}</span>
            <input
              className={styles.colorText}
              type="text"
              disabled={!state.writable || state.jevEnabled?.text !== 'true'}
              placeholder="jev-latest"
              value={state.jevModel?.text ?? 'jev-latest'}
              onChange={(event) => props.edit('jevModel', event.currentTarget.value)}
            />
          </label>
          <label className={styles.overrideField}>
            <span className={styles.overrideLabel}>{t('structuredOutputsMode')}</span>
            <select
              className={styles.colorText}
              disabled={!state.writable}
              value={['off', 'auto', 'prefer'].includes(state.structuredOutputsMode?.text ?? '') ? state.structuredOutputsMode.text : 'auto'}
              onChange={(event) => props.edit('structuredOutputsMode', event.currentTarget.value)}
            >
              <option value="auto">{t('structuredOutputsAuto')}</option>
              <option value="prefer">{t('structuredOutputsPrefer')}</option>
              <option value="off">{t('structuredOutputsOff')}</option>
            </select>
            <span className={styles.hint}>{t('structuredOutputsModeHint')}</span>
          </label>
          <label className={styles.overrideField}>
            <span className={styles.overrideLabel}>{t('structuredOutputsProbeUrl')}</span>
            <input
              className={styles.colorText}
              type="text"
              disabled={!state.writable || state.structuredOutputsMode?.text === 'off'}
              placeholder="http://127.0.0.1:3001"
              value={state.structuredOutputsProbeUrl?.text ?? ''}
              onChange={(event) => props.edit('structuredOutputsProbeUrl', event.currentTarget.value)}
            />
            <span className={styles.hint}>{t('structuredOutputsProbeUrlHint')}</span>
          </label>
          <label className={styles.overrideField}>
            <span className={styles.overrideLabel}>{t('structuredOutputsProbeKey')}</span>
            <input
              className={styles.colorText}
              type="password"
              autoComplete="off"
              disabled={!state.writable || state.structuredOutputsMode?.text === 'off'}
              value={state.structuredOutputsProbeKey?.text ?? ''}
              onChange={(event) => props.edit('structuredOutputsProbeKey', event.currentTarget.value)}
            />
          </label>
        </section>

        <section className={styles.group}>
          <h3 className={styles.groupTitle}>{t('templates')}</h3>
          <p className={styles.groupHint}>{t('templatesHint')}</p>
          {parsedTemplates.errors.length > 0 && (
            <p className={styles.hint} role="alert">{t('templateInvalid')} {parsedTemplates.errors[0]}</p>
          )}
          <div className={styles.templateList}>
            {parsedTemplates.templates.length === 0 ? (
              <p className={styles.hint}>{t('templateEmpty')}</p>
            ) : (
              parsedTemplates.templates.map((tpl) => {
                const active = tpl.id === selectedTemplateId
                return (
                  <div
                    key={tpl.id}
                    className={`${styles.templateRow}${active ? ` ${styles.templateRowActive}` : ''}`}
                  >
                    <button
                      type="button"
                      className={styles.templateMain}
                      disabled={!state.writable}
                      onClick={() => {
                        setSelectedTemplateId(tpl.id)
                        setTemplateName(tpl.name)
                        setTemplateDesc(tpl.description ?? '')
                        setPreviewSpec(tpl.demo)
                        setTemplateNotice(null)
                      }}
                    >
                      <span className={styles.templateName}>{tpl.name}</span>
                      {tpl.description ? <span className={styles.templateDesc}>{tpl.description}</span> : null}
                    </button>
                    <div className={styles.templateActions}>
                      <button
                        type="button"
                        className={styles.miniBtn}
                        disabled={!state.writable}
                        onClick={() => {
                          setSelectedTemplateId(tpl.id)
                          setPreviewSpec(tpl.demo)
                          setTemplateNotice(null)
                        }}
                      >
                        {t('templateLoad')}
                      </button>
                      <button
                        type="button"
                        className={styles.miniBtn}
                        onClick={() => {
                          const fence = formatIuiFence(tpl.demo, tpl.instruction ? { instruction: tpl.instruction } : {})
                          void insertIntoComposer(fence).then((result) => {
                            if (result === 'inserted') setTemplateNotice(t('templateInserted'))
                            else if (result === 'copied') setTemplateNotice(t('templateCopied'))
                            else setTemplateNotice(t('templateInsertFailed'))
                          })
                        }}
                      >
                        {t('templateInsert')}
                      </button>
                      <button
                        type="button"
                        className={styles.miniBtnDanger}
                        disabled={!state.writable}
                        onClick={() => {
                          writeTemplates(removeUserTemplate(parsedTemplates.templates, tpl.id))
                          if (selectedTemplateId === tpl.id) {
                            setSelectedTemplateId(null)
                            setPreviewSpec(SETTINGS_PREVIEW_SPEC)
                          }
                        }}
                      >
                        {t('templateDelete')}
                      </button>
                    </div>
                  </div>
                )
              })
            )}
          </div>
          <div className={styles.templateEditor}>
            <label className={styles.overrideField}>
              <span className={styles.overrideLabel}>{t('templateName')}</span>
              <input
                className={styles.colorText}
                type="text"
                disabled={!state.writable}
                value={templateName}
                onChange={(event) => setTemplateName(event.currentTarget.value)}
              />
            </label>
            <label className={styles.overrideField}>
              <span className={styles.overrideLabel}>{t('templateDesc')}</span>
              <input
                className={styles.colorText}
                type="text"
                disabled={!state.writable}
                value={templateDesc}
                onChange={(event) => setTemplateDesc(event.currentTarget.value)}
              />
            </label>
            <div className={styles.templateEditorActions}>
              <button
                type="button"
                className={styles.primaryBtn}
                disabled={!state.writable}
                onClick={() => {
                  const name = templateName.trim()
                  if (!name) {
                    setTemplateNotice(t('templateNameRequired'))
                    return
                  }
                  try {
                    const next = upsertUserTemplate(parsedTemplates.templates, {
                      id: selectedTemplateId ?? `tpl-${Date.now()}`,
                      name,
                      description: templateDesc,
                      demo: previewSpec,
                    })
                    writeTemplates(next)
                    const saved = next[0]
                    if (saved) setSelectedTemplateId(saved.id)
                    setTemplateNotice(t('templateSaved'))
                  } catch (error) {
                    setTemplateNotice(error instanceof Error ? error.message : t('templateInvalid'))
                  }
                }}
              >
                {t('templateSave')}
              </button>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={() => {
                  const fence = formatIuiFence(
                    previewSpec,
                    activeTemplate?.instruction ? { instruction: activeTemplate.instruction } : {},
                  )
                  void insertIntoComposer(fence).then((result) => {
                    if (result === 'inserted') setTemplateNotice(t('templateInserted'))
                    else if (result === 'copied') setTemplateNotice(t('templateCopied'))
                    else setTemplateNotice(t('templateInsertFailed'))
                  })
                }}
              >
                {t('templateInsertPreview')}
              </button>
            </div>
            {templateNotice ? <p className={styles.hint}>{templateNotice}</p> : null}
            {activeTemplate?.instruction ? (
              <p className={styles.hint}>{activeTemplate.instruction}</p>
            ) : null}
          </div>
        </section>

        <ThemeRoot>
          <div className={styles.preview} data-iui-settings-preview="">
            <div className={styles.previewHead}>
              <p className={styles.previewTitle}>{t('previewTitle')}</p>
              <p className={styles.previewMeta}>
                {t('previewMeta')
                  .replace('{theme}', state.themeId.text || packValue)
                  .replace('{pack}', packValue)}
                {selectedTemplateId ? ` · ${selectedTemplateId}` : ''}
              </p>
            </div>
            <div className={styles.previewBody}>
              <GenuiBlock spec={previewSpec} animateEntrance={false} />
            </div>
          </div>
        </ThemeRoot>

        <details
          className={styles.advanced}
          open={advancedOpen}
          onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}
        >
          <summary>{t('advancedTokens')}</summary>
          <div className={styles.advancedBody}>
            <textarea
              className={styles.textarea}
              value={state.customTokensJson.text}
              disabled={!state.writable}
              placeholder='{"--dsl-g-accent":"#22c55e"}'
              spellCheck={false}
              onChange={(event) => { props.edit('customTokensJson', event.target.value); setCustomTokens(event.target.value) }}
            />
            <p className={styles.hint}>{t('customTokensJsonHint')}</p>
            <p className={styles.overrideLabel}>{t('templateEditor')}</p>
            <textarea
              className={styles.textarea}
              value={state.userTemplatesJson.text}
              disabled={!state.writable}
              placeholder='[{"id":"my-dash","name":"My dashboard","demo":{"title":"...","items":[]}}]'
              spellCheck={false}
              onChange={(event) => props.edit('userTemplatesJson', event.target.value)}
            />
            <p className={styles.hint}>{t('templateEditorHint')}</p>
          </div>
        </details>
      </SettingsForm>
    </div>
  )
}

export class IuiSettingsCardController {
  private readonly form: SettingsFormModel<IuiSettingsSectionValue>
  private readonly store: { subscribe(listener: () => void): () => void; getSnapshot(): CardSnapshot }

  constructor(scope: SettingsFormScope<IuiSettingsSectionValue>) {
    const packIds = listComponentPacks().map((p) => p.id)
    const themeAllowed = listThemePacks().map((theme) => theme.id)
    this.form = new SettingsFormModel(scope, [
      enumField('themeId', themeAllowed),
      enumField('packId', packIds),
      boolField('fenceFeedback'),
      boolField('formatReferee'),
      boolField('strictImagePolicy'),
      boolField('legacyFences'),
      enumField('gatewayMode', ['in-process', 'sidecar', 'off']),
      settingsTextField('gatewaySidecarUrl'),
      boolField('instanceStorePersist'),
      settingsTextField('instanceStorePersistPath'),
      boolField('frameChannelMount'),
      boolField('jevEnabled'),
      settingsTextField('jevApiKey'),
      settingsTextField('jevBaseUrl'),
      settingsTextField('jevModel'),
      enumField('structuredOutputsMode', ['off', 'auto', 'prefer']),
      settingsTextField('structuredOutputsProbeUrl'),
      settingsTextField('structuredOutputsProbeKey'),
      settingsTextField('customTokensJson'),
      settingsTextField('userTemplatesJson'),
    ])
    this.store = this.form.bind(() => ({
      ...this.form.shell(),
      themeId: this.form.field('themeId'),
      packId: this.form.field('packId'),
      fenceFeedback: this.form.field('fenceFeedback'),
      formatReferee: this.form.field('formatReferee'),
      strictImagePolicy: this.form.field('strictImagePolicy'),
      legacyFences: this.form.field('legacyFences'),
      gatewayMode: this.form.field('gatewayMode'),
      gatewaySidecarUrl: this.form.field('gatewaySidecarUrl'),
      instanceStorePersist: this.form.field('instanceStorePersist'),
      instanceStorePersistPath: this.form.field('instanceStorePersistPath'),
      frameChannelMount: this.form.field('frameChannelMount'),
      jevEnabled: this.form.field('jevEnabled'),
      jevApiKey: this.form.field('jevApiKey'),
      jevBaseUrl: this.form.field('jevBaseUrl'),
      jevModel: this.form.field('jevModel'),
      structuredOutputsMode: this.form.field('structuredOutputsMode'),
      structuredOutputsProbeUrl: this.form.field('structuredOutputsProbeUrl'),
      structuredOutputsProbeKey: this.form.field('structuredOutputsProbeKey'),
      customTokensJson: this.form.field('customTokensJson'),
      userTemplatesJson: this.form.field('userTemplatesJson'),
    }))
  }

  inject(): Injected {
    return {
      hooks: { iuiSettings: this.store },
      ...this.form.actions(),
    }
  }

  dispose(): void {
    this.form.dispose()
  }
}
