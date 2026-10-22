/**
 * Settings → IUI (Batch D, 第四轮 S1–S12).
 * Groups: 外观 · 生成 · 网络与资源 · 隐私与安全 · 模板 · 开发者 (collapsed).
 * - Fields come from SETTINGS_FIELDS (= Config schema minus hidden fields; tested).
 * - Appearance edits the default page style (G10) and is pushed live to open pages,
 *   previewed in a real sandbox page in light + dark; templates save immediately.
 * - Everything else is staged and written by Save; it applies to new messages.
 */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ChangeEvent } from 'react'
import {
  SettingsForm,
  SettingsFormModel,
  Switch,
  type SettingsFieldSpec,
  type SettingsFormScope,
  type SettingsFormShell,
  type SettingsFieldState,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { SETTINGS_FIELDS, SETTINGS_FIELD_NAMES, type SettingsFieldKind, type SettingsFieldName } from '../../config/settings-fields.ts'
import { isValidCdnTemplate as isRuntimeCdnTemplate, type CdnPreset } from '../../shared/vendor-registry.ts'
import { DEFAULT_PAGE_APPEARANCE, isDefaultPageAppearance, type PageAppearance } from '../../shared/page-appearance.ts'
import { AppearancePanel } from '../appearance-panel.tsx'
import { assetUrl } from '../asset-loader.ts'
import { insertIntoComposer } from '../composer-bridge.ts'
import { currentLocale } from '../i18n/index.ts'
import { getDefaultPageAppearance, saveDefaultPageAppearance, subscribeDefaultPageAppearance } from '../page-appearance-store.ts'
import { clearAllPageState } from '../page-storage.ts'
import { getRuntimeConfigSnapshot, refreshRuntimeConfig } from '../runtime-config.ts'
import { setCustomTokens } from '../theme/apply-theme.ts'
import { lockVisualPreview, unlockVisualPreview } from '../theme/preview-lock.ts'
import { deleteUserTemplate, getUserTemplates, replaceUserTemplates, subscribeUserTemplates } from '../user-template-store.ts'
import { writeIuiConfigField } from './config-bridge.ts'
import { checkCustomTokensJson, TOKEN_EXAMPLES } from './custom-tokens.ts'
import { FeedbackStatsCard } from './FeedbackStatsCard.tsx'
import { NetworkProbeCard } from './NetworkProbeCard.tsx'
import { SettingsPreview } from './SettingsPreview.tsx'
import { mergeUserTemplates, parseUserTemplatesJson, serializeUserTemplates, userTemplatePrompt } from './user-templates.ts'
import styles from './IuiSettingsSection.module.css'

export type IuiSettingsSectionValue = Partial<Record<SettingsFieldName, string | boolean>>

type CardSnapshot = SettingsFormShell & Record<SettingsFieldName, SettingsFieldState>

type Injected = {
  hooks: { iuiSettings: { subscribe(listener: () => void): () => void; getSnapshot(): CardSnapshot } }
  edit: (field: string, text: string) => void
  resetField: (field: string) => void
  save: () => void
  discard: () => void
}

type LocaleT = (key: string) => string

/** S5: older hosts resolve these externals to undefined — callers fall back to an upgrade card. */
export function settingsPrimitivesAvailable(): boolean {
  return typeof SettingsFormModel === 'function' && typeof SettingsForm === 'function' && Switch != null
}

/** Runtime rule (https, {file}, no quotes/spaces, ≤300) plus {name}; empty is fine (built-in copy). */
export function isValidCdnTemplate(text: string): boolean {
  const v = text.trim()
  return v === '' || (isRuntimeCdnTemplate(v) && v.includes('{name}'))
}

function fieldSpec(name: SettingsFieldName, kind: SettingsFieldKind): SettingsFieldSpec {
  if (kind.kind === 'bool') {
    return {
      field: name,
      format: (value) => (value === true ? 'true' : value === false ? 'false' : ''),
      parse: (text) => (text === 'true' ? { kind: 'set', value: true } : text === 'false' ? { kind: 'set', value: false } : text === '' ? { kind: 'clear' } : undefined),
    }
  }
  if (kind.kind === 'enum') {
    const allowed = new Set<string>(kind.values)
    return {
      field: name,
      format: (value) => (typeof value === 'string' ? value : ''),
      parse: (text) => (!text ? { kind: 'clear' } : allowed.has(text) ? { kind: 'set', value: text } : undefined),
    }
  }
  const validate = name === 'cdnTemplate'
    ? isValidCdnTemplate
    : name === 'customTokensJson'
      ? (text: string) => checkCustomTokensJson(text).error === null
      : name === 'userTemplatesJson'
        ? (text: string) => text.trim() === '' || parseUserTemplatesJson(text).errors[0] !== 'invalid JSON'
        : () => true
  return {
    field: name,
    format: (value) => (typeof value === 'string' ? value : value == null ? '' : String(value)),
    parse: (text) => (!validate(text) ? undefined : text === '' ? { kind: 'clear' } : { kind: 'set', value: text }),
  }
}

function boolOf(state: SettingsFieldState | undefined, name: SettingsFieldName): boolean {
  const kind = SETTINGS_FIELDS[name] as SettingsFieldKind
  const fallback = kind.kind === 'bool' ? kind.default : false
  return state?.text === 'true' ? true : state?.text === 'false' ? false : fallback
}

function enumOf(state: SettingsFieldState | undefined, name: SettingsFieldName): string {
  const kind = SETTINGS_FIELDS[name] as SettingsFieldKind
  if (kind.kind !== 'enum') return state?.text ?? ''
  return state && (kind.values as readonly string[]).includes(state.text) ? state.text : kind.default
}

function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in values ? String(values[k]) : m))
}

function formLabels(t: LocaleT) {
  return { unavailable: t('unavailable'), readOnly: t('readOnly'), saveFailed: t('saveFailed'), save: t('save'), saving: t('saving') }
}

function downloadJson(name: string, json: string): void {
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

/** S8: how often auto repair / format correction cost an extra model round. */
export function repairCounts(byKind: Readonly<Record<string, number>> | undefined): { repairs: number; formats: number } {
  const n = (k: string) => (byKind && typeof byKind[k] === 'number' ? byKind[k]! : 0)
  return { repairs: n('render_steer') + n('delivery_steer'), formats: n('format_steer') + n('json_masquerade') }
}

function SwitchRow(props: { title: string; hint: string; checked: boolean; disabled: boolean; onChange: (v: boolean) => void; attr: string; children?: React.ReactNode }) {
  return (
    <div className={styles.switchCard} data-iui-setting={props.attr}>
      <div className={styles.switchCopy}>
        <div className={styles.switchTitle}>{props.title}</div>
        <p className={styles.switchHint}>{props.hint}</p>
        {props.children}
      </div>
      <Switch checked={props.checked} disabled={props.disabled} label={props.title} onChange={props.onChange} />
    </div>
  )
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
  const zh = currentLocale() === 'zh'
  const ro = !state.writable

  // ---- 外观 (instant: local + live push, config write debounced) ----
  const appearance = useSyncExternalStore(subscribeDefaultPageAppearance, getDefaultPageAppearance, getDefaultPageAppearance)
  const [appearanceNote, setAppearanceNote] = useState<string | null>(null)
  const saveTimer = useRef(0)
  useEffect(() => () => window.clearTimeout(saveTimer.current), [])
  const chooseAppearance = (next: PageAppearance): void => {
    void saveDefaultPageAppearance(next)
    setAppearanceNote(null)
    window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      void saveDefaultPageAppearance(next, writeIuiConfigField).then((r) => setAppearanceNote(t(r === 'synced' ? 'appearanceSaved' : 'appearanceSavedLocal')))
    }, 500)
  }

  // ---- 生成: repair / correction counters (S8) ----
  const [counts, setCounts] = useState<{ repairs: number; formats: number } | null>(null)
  useEffect(() => {
    let alive = true
    void fetch(assetUrl('fence-ops.json'), { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { fenceOps?: { byKind?: Record<string, number> } } | null) => { if (alive && body) setCounts(repairCounts(body.fenceOps?.byKind)) })
      .catch(() => { /* old host / offline */ })
    return () => { alive = false }
  }, [])

  // ---- 隐私 ----
  const [pageStorageNotice, setPageStorageNotice] = useState<string | null>(null)

  // ---- 模板 (instant) ----
  const templates = useSyncExternalStore(subscribeUserTemplates, getUserTemplates, getUserTemplates)
  const [templateNotice, setTemplateNotice] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const rawTemplatesTouched = useRef(false)
  const onImport = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file) return
    void file.text().then((text) => {
      const parsed = parseUserTemplatesJson(text)
      if (parsed.templates.length === 0) {
        setTemplateNotice(fill(t('templateImportFailed'), { error: parsed.errors[0] ?? 'empty' }))
        return
      }
      const merged = mergeUserTemplates(getUserTemplates(), parsed.templates)
      void replaceUserTemplates(merged, writeIuiConfigField)
      const skipped = parsed.errors.length > 0 ? ` ${fill(t('templateSkipped'), { count: parsed.errors.length, first: parsed.errors[0]! })}` : ''
      setTemplateNotice(fill(t('templateImported'), { count: parsed.templates.length }) + skipped)
    }).catch((error: unknown) => setTemplateNotice(fill(t('templateImportFailed'), { error: error instanceof Error ? error.message : String(error) })))
  }

  // ---- 开发者 ----
  const tokenCheck = useMemo(() => checkCustomTokensJson(state.customTokensJson?.text), [state.customTokensJson?.text])
  const jevOn = boolOf(state.jevEnabled, 'jevEnabled')
  const soMode = enumOf(state.structuredOutputsMode, 'structuredOutputsMode')
  const cdnPreset = enumOf(state.cdnPreset, 'cdnPreset')
  const cdnTemplate = state.cdnTemplate?.text ?? ''
  const textInput = (name: SettingsFieldName, opts: { type?: string; placeholder?: string; disabled?: boolean } = {}) => (
    <input
      className={styles.textInput}
      type={opts.type ?? 'text'}
      autoComplete="off"
      spellCheck={false}
      disabled={ro || opts.disabled === true}
      placeholder={opts.placeholder}
      value={state[name]?.text ?? ''}
      data-iui-setting-input={name}
      onChange={(event) => props.edit(name, event.currentTarget.value)}
    />
  )

  return (
    <div className={styles.section} data-iui-settings="v2">
      <div>
        <h2 className={styles.heading}>{t('title')}</h2>
        <p className={styles.intro}>{t('intro')}</p>
      </div>

      <SettingsForm
        labels={formLabels(t)}
        state={state}
        onSave={() => {
          props.save()
          if (rawTemplatesTouched.current) {
            rawTemplatesTouched.current = false
            void replaceUserTemplates(parseUserTemplatesJson(state.userTemplatesJson?.text).templates)
          }
          window.setTimeout(() => { void refreshRuntimeConfig().then(() => unlockVisualPreview()) }, 200)
          window.setTimeout(() => { void refreshRuntimeConfig() }, 800)
        }}
        onDiscard={() => {
          props.discard()
          rawTemplatesTouched.current = false
          setCustomTokens(getRuntimeConfigSnapshot().customTokensJson)
          unlockVisualPreview()
          void refreshRuntimeConfig()
        }}
      >
        <section className={styles.group} data-iui-settings-group="appearance">
          <h3 className={styles.groupTitle}>{t('groupAppearance')}</h3>
          <p className={styles.groupHint}>{t('groupAppearanceHint')}</p>
          <div className={styles.appearanceLayout}>
            <div className={styles.inlineActions} style={{ flexDirection: 'column', alignItems: 'stretch' }}>
              <AppearancePanel
                embedded
                value={appearance}
                customized={!isDefaultPageAppearance(appearance)}
                onChange={chooseAppearance}
                onReset={() => chooseAppearance({ ...DEFAULT_PAGE_APPEARANCE })}
                onSaveDefault={() => undefined}
                onBack={() => undefined}
              />
              <div className={styles.inlineActions}>
                <button type="button" className={styles.secondaryBtn} data-iui-settings-appearance-reset="1"
                  disabled={isDefaultPageAppearance(appearance)}
                  onClick={() => chooseAppearance({ ...DEFAULT_PAGE_APPEARANCE })}
                >
                  {t('appearanceReset')}
                </button>
                {appearanceNote ? <span className={styles.hint} data-iui-settings-appearance-note="1">{appearanceNote}</span> : null}
              </div>
            </div>
            <div>
              <SettingsPreview appearance={appearance} tokensKey={tokenCheck.error === null ? JSON.stringify(tokenCheck.tokens) : ''} t={t} />
              <p className={styles.hint}>{t('previewHint')}</p>
            </div>
          </div>
        </section>

        <section className={styles.group} data-iui-settings-group="generation">
          <h3 className={styles.groupTitle}>{t('groupGeneration')}</h3>
          <label className={styles.overrideField}>
            <span className={styles.overrideLabel}>{t('uiEagerness')}</span>
            <select className={styles.select} disabled={ro} value={enumOf(state.uiEagerness, 'uiEagerness')}
              onChange={(event) => props.edit('uiEagerness', event.currentTarget.value)}
            >
              <option value="restrained">{t('uiEagernessRestrained')}</option>
              <option value="balanced">{t('uiEagernessBalanced')}</option>
              <option value="eager">{t('uiEagernessEager')}</option>
            </select>
            <span className={styles.hint}>{t('uiEagernessHint')}</span>
          </label>
          <SwitchRow attr="fenceFeedback" title={t('fenceFeedback')} hint={t('fenceFeedbackHint')}
            checked={boolOf(state.fenceFeedback, 'fenceFeedback')} disabled={ro}
            onChange={(v) => props.edit('fenceFeedback', v ? 'true' : 'false')}
          />
          <SwitchRow attr="formatReferee" title={t('formatReferee')} hint={t('formatRefereeHint')}
            checked={boolOf(state.formatReferee, 'formatReferee')} disabled={ro}
            onChange={(v) => props.edit('formatReferee', v ? 'true' : 'false')}
          />
          <p className={styles.hint} data-iui-settings-repairs={counts ? `${counts.repairs}/${counts.formats}` : ''}>
            {counts === null ? null : counts.repairs + counts.formats === 0 ? t('repairStatsNone') : fill(t('repairStats'), counts)}
          </p>
        </section>

        <section className={styles.group} data-iui-settings-group="network">
          <h3 className={styles.groupTitle}>{t('groupNetwork')}</h3>
          <p className={styles.groupHint}>{t('cdnSourceHint')}</p>
          <label className={styles.overrideField}>
            <span className={styles.overrideLabel}>{t('cdnPreset')}</span>
            <select className={styles.select} disabled={ro} value={cdnPreset}
              onChange={(event) => props.edit('cdnPreset', event.currentTarget.value)}
            >
              <option value="local">{t('cdnPresetLocal')}</option>
              <option value="china">{t('cdnPresetChina')}</option>
              <option value="global">{t('cdnPresetGlobal')}</option>
              <option value="custom">{t('cdnPresetCustom')}</option>
            </select>
          </label>
          {cdnPreset === 'custom' && (
            <label className={styles.overrideField}>
              <span className={styles.overrideLabel}>{t('cdnTemplate')}</span>
              {textInput('cdnTemplate', { type: 'url', placeholder: 'https://cdn.example.com/npm/{name}@{version}/{file}' })}
              {isValidCdnTemplate(cdnTemplate)
                ? <span className={styles.hint}>{t('cdnTemplateHint')}</span>
                : <span className={styles.error} role="alert" data-iui-settings-invalid="cdnTemplate">{t('cdnTemplateInvalid')}</span>}
            </label>
          )}
          <NetworkProbeCard t={t} preset={cdnPreset as CdnPreset} />
        </section>

        <section className={styles.group} data-iui-settings-group="privacy">
          <h3 className={styles.groupTitle}>{t('groupPrivacy')}</h3>
          <SwitchRow attr="strictImagePolicy" title={t('strictImagePolicy')} hint={t('strictImagePolicyHint')}
            checked={boolOf(state.strictImagePolicy, 'strictImagePolicy')} disabled={ro}
            onChange={(v) => props.edit('strictImagePolicy', v ? 'true' : 'false')}
          />
          <div className={styles.switchCard}>
            <div className={styles.switchCopy}>
              <div className={styles.switchTitle}>{t('pageStorage')}</div>
              <p className={styles.switchHint}>{pageStorageNotice ?? t('pageStorageHint')}</p>
            </div>
            <button type="button" className={styles.secondaryBtn}
              onClick={() => { void clearAllPageState().then(() => setPageStorageNotice(t('pageStorageCleared'))) }}
            >
              {t('pageStorageClear')}
            </button>
          </div>
          <FeedbackStatsCard t={t} />
        </section>

        <section className={styles.group} data-iui-settings-group="templates">
          <h3 className={styles.groupTitle}>{t('groupTemplates')}</h3>
          <p className={styles.groupHint}>{t('templatesHint')}</p>
          <div className={styles.templateList}>
            {templates.length === 0 ? (
              <p className={styles.hint}>{t('templateEmpty')}</p>
            ) : templates.map((tpl) => (
              <div key={tpl.id} className={styles.templateRow} data-iui-settings-template={tpl.id}>
                <div className={styles.templateMain}>
                  <span className={styles.templateName}>{tpl.name}</span>
                  <span className={styles.templateDesc}>{tpl.description ?? (tpl.createdAt ? tpl.createdAt.slice(0, 10) : '')}</span>
                </div>
                <div className={styles.templateActions}>
                  <button type="button" className={styles.miniBtn}
                    onClick={() => {
                      void insertIntoComposer(userTemplatePrompt(tpl, zh)).then((r) => setTemplateNotice(t(r === 'inserted' ? 'templateInserted' : r === 'copied' ? 'templateCopied' : 'templateInsertFailed')))
                    }}
                  >
                    {t('templateUse')}
                  </button>
                  <button type="button" className={styles.miniBtnDanger} data-iui-settings-template-delete={tpl.id}
                    onClick={() => { void deleteUserTemplate(tpl.id, writeIuiConfigField) }}
                  >
                    {t('templateDelete')}
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className={styles.inlineActions}>
            <button type="button" className={styles.secondaryBtn} data-iui-settings-template-import="1" onClick={() => fileRef.current?.click()}>
              {t('templateImport')}
            </button>
            <button type="button" className={styles.secondaryBtn} data-iui-settings-template-export="1" disabled={templates.length === 0}
              onClick={() => downloadJson(`iui-templates-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(JSON.parse(serializeUserTemplates(templates) || '[]'), null, 2))}
            >
              {t('templateExport')}
            </button>
            <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={onImport} data-iui-settings-template-file="1" />
          </div>
          {templateNotice ? <p className={styles.hint} role="status">{templateNotice}</p> : null}
        </section>

        <details className={styles.devDetails} data-iui-settings-group="developer">
          <summary>{t('groupDeveloper')}</summary>
          <div className={styles.devBody}>
            <p className={styles.groupHint}>{t('groupDeveloperHint')}</p>
            <label className={styles.overrideField}>
              <span className={styles.overrideLabel}>{t('customTokensJson')}</span>
              <textarea
                className={styles.textarea}
                value={state.customTokensJson?.text ?? ''}
                disabled={ro}
                placeholder='{"--color-text-info":"#0f766e"}'
                spellCheck={false}
                data-iui-setting-input="customTokensJson"
                onChange={(event) => {
                  const v = event.currentTarget.value
                  lockVisualPreview()
                  props.edit('customTokensJson', v)
                  if (checkCustomTokensJson(v).error === null) setCustomTokens(v)
                }}
              />
              <span className={styles.hint}>{fill(t('customTokensJsonHint'), { examples: TOKEN_EXAMPLES.join(' ') })}</span>
              {tokenCheck.error !== null && <span className={styles.error} role="alert" data-iui-settings-invalid="customTokensJson">{t('customTokensInvalidJson')}</span>}
              {tokenCheck.unknown.length > 0 && <span className={styles.warn} data-iui-settings-unknown-tokens={tokenCheck.unknown.join(' ')}>{fill(t('customTokensUnknown'), { keys: tokenCheck.unknown.join(', ') })}</span>}
              {tokenCheck.rejected.length > 0 && <span className={styles.warn}>{fill(t('customTokensRejected'), { keys: tokenCheck.rejected.join(', ') })}</span>}
            </label>
            <SwitchRow attr="legacyFences" title={t('legacyFences')} hint={t('legacyFencesHint')}
              checked={boolOf(state.legacyFences, 'legacyFences')} disabled={ro}
              onChange={(v) => props.edit('legacyFences', v ? 'true' : 'false')}
            />
            <label className={styles.overrideField}>
              <span className={styles.overrideLabel}>{t('templatesJson')}</span>
              <textarea
                className={styles.textarea}
                value={state.userTemplatesJson?.text ?? ''}
                disabled={ro}
                placeholder='[{"id":"my-page","name":"My page","source":"title: …\n---html\n…"}]'
                spellCheck={false}
                onChange={(event) => { rawTemplatesTouched.current = true; props.edit('userTemplatesJson', event.currentTarget.value) }}
              />
              <span className={styles.hint}>{t('templatesJsonHint')}</span>
            </label>
            <h4 className={styles.switchTitle} style={{ margin: '4px 0 0' }}>{t('formatRouter')}</h4>
            <SwitchRow attr="jevEnabled" title={t('jevEnabled')} hint={t('jevEnabledHint')}
              checked={jevOn} disabled={ro}
              onChange={(v) => props.edit('jevEnabled', v ? 'true' : 'false')}
            >
              {jevOn && <p className={styles.warn} role="alert" data-iui-settings-jev-warning="1">{t('jevWarning')}</p>}
            </SwitchRow>
            {jevOn && (<>
              <label className={styles.overrideField}>
                <span className={styles.overrideLabel}>{t('jevApiKey')}</span>
                {textInput('jevApiKey', { type: 'password' })}
                <span className={styles.hint}>{t('jevApiKeyHint')}</span>
              </label>
              <label className={styles.overrideField}>
                <span className={styles.overrideLabel}>{t('jevBaseUrl')}</span>
                {textInput('jevBaseUrl', { type: 'url' })}
              </label>
              <label className={styles.overrideField}>
                <span className={styles.overrideLabel}>{t('jevModel')}</span>
                {textInput('jevModel', { placeholder: 'jev-latest' })}
              </label>
            </>)}
            <label className={styles.overrideField}>
              <span className={styles.overrideLabel}>{t('structuredOutputsMode')}</span>
              <select className={styles.select} disabled={ro} value={soMode}
                onChange={(event) => props.edit('structuredOutputsMode', event.currentTarget.value)}
              >
                <option value="auto">{t('structuredOutputsAuto')}</option>
                <option value="prefer">{t('structuredOutputsPrefer')}</option>
                <option value="off">{t('structuredOutputsOff')}</option>
              </select>
              <span className={styles.hint} data-iui-settings-so-note="1">{t('structuredOutputsModeHint')}</span>
            </label>
            {soMode !== 'off' && (<>
              <label className={styles.overrideField}>
                <span className={styles.overrideLabel}>{t('structuredOutputsProbeUrl')}</span>
                {textInput('structuredOutputsProbeUrl', { type: 'url', placeholder: 'http://127.0.0.1:3001' })}
              </label>
              <label className={styles.overrideField}>
                <span className={styles.overrideLabel}>{t('structuredOutputsProbeKey')}</span>
                {textInput('structuredOutputsProbeKey', { type: 'password' })}
              </label>
            </>)}
            <p className={styles.hint}>{t('debugLog')}</p>
          </div>
        </details>

        <p className={styles.hint} data-iui-settings-save-scope="1">{t('saveScope')}</p>
      </SettingsForm>
    </div>
  )
}

export class IuiSettingsCardController {
  private readonly form: SettingsFormModel<IuiSettingsSectionValue>
  private readonly store: { subscribe(listener: () => void): () => void; getSnapshot(): CardSnapshot }

  /** S5: exactly SETTINGS_FIELDS (schema keys minus hidden) — never a field the schema lacks. */
  static readonly fields: readonly SettingsFieldName[] = SETTINGS_FIELD_NAMES

  constructor(scope: SettingsFormScope<IuiSettingsSectionValue>) {
    this.form = new SettingsFormModel(scope, SETTINGS_FIELD_NAMES.map((name) => fieldSpec(name, SETTINGS_FIELDS[name] as SettingsFieldKind)))
    this.store = this.form.bind(() => {
      const snap = { ...this.form.shell() } as CardSnapshot
      for (const name of SETTINGS_FIELD_NAMES) snap[name] = this.form.field(name)
      return snap
    })
  }

  inject(): Injected {
    return { hooks: { iuiSettings: this.store }, ...this.form.actions() }
  }

  dispose(): void {
    this.form.dispose()
  }
}
