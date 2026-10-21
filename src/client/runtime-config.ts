/**
 * Browser mirror of Host `/plugins/@losebird/iui/assets/runtime-config.json`.
 */
import { assetUrl } from './asset-loader.ts'
import { DEFAULT_THEME_ID } from '../config/defaults.ts'
import { setActiveThemeId, setCustomTokens } from './theme/apply-theme.ts'
import { setActivePackId } from './theme/apply-pack.ts'
import { isVisualPreviewLocked } from './theme/preview-lock.ts'
import { normalizeCdnPreset, type CdnPreset, type VendorSource } from '../shared/vendor-registry.ts'

export type RuntimeConfigSnapshot = {
  themeId: string
  packId: string
  fenceFeedback: boolean
  formatReferee: boolean
  /** F4: strict sandbox image policy (img-src data:/blob: + allowlist). */
  strictImagePolicy?: boolean
  /** F16: deprecated ```iui / ```dsh-ui fences still render (default off). */
  legacyFences?: boolean
  /** F19: library source preset + custom template. */
  cdnPreset?: CdnPreset
  cdnTemplate?: string
  /** G7: page eagerness (restrained · balanced · eager). */
  uiEagerness?: 'restrained' | 'balanced' | 'eager'
  customTokensJson: string
  /** G10: saved default page style JSON. */
  pageStyleJson?: string
  userTemplatesJson: string
  frameChannelMount?: boolean
  productPath?: 'sandbox-html'
  themes: ReadonlyArray<{ id: string; label: string; description?: string }>
  packs: ReadonlyArray<{ id: string; label: string; description?: string }>
}

const listeners = new Set<() => void>()
let snapshot: RuntimeConfigSnapshot = {
  themeId: DEFAULT_THEME_ID,
  packId: 'sandbox',
  fenceFeedback: true,
  formatReferee: true,
  customTokensJson: '',
  userTemplatesJson: '',
  frameChannelMount: false,
  productPath: 'sandbox-html',
  themes: [],
  packs: [{ id: 'sandbox', label: 'Sandbox HTML' }],
}
let inflight: Promise<void> | undefined

function publish(next: RuntimeConfigSnapshot): void {
  const preset = normalizeCdnPreset(next.cdnPreset)
  if (lastConfigPreset !== undefined && lastConfigPreset !== preset) {
    memoryCdnOverride = null
    try { globalThis.localStorage?.removeItem(CDN_OVERRIDE_KEY) } catch { /* ignore */ }
  }
  lastConfigPreset = preset
  snapshot = next
  if (!isVisualPreviewLocked()) {
    setActiveThemeId(next.themeId)
    setActivePackId('sandbox')
    setCustomTokens(next.customTokensJson)
  }
  for (const listener of listeners) listener()
}

export function getRuntimeConfigSnapshot(): RuntimeConfigSnapshot {
  return snapshot
}

/** F16: deprecated ```iui / ```dsh-ui fences render only with the compat switch on. */
export function isLegacyFencesEnabled(): boolean {
  return snapshot.legacyFences === true
}

const CDN_OVERRIDE_KEY = 'iui:cdnPreset:override'
let lastConfigPreset: CdnPreset | undefined
let memoryCdnOverride: string | null = null

function readCdnOverride(): { preset: CdnPreset; base: CdnPreset } | null {
  try {
    let raw: string | null = memoryCdnOverride
    try { raw = globalThis.localStorage?.getItem(CDN_OVERRIDE_KEY) ?? raw } catch { /* private mode */ }
    if (!raw) return null
    const v = JSON.parse(raw) as { preset?: unknown; base?: unknown }
    return { preset: normalizeCdnPreset(v.preset), base: normalizeCdnPreset(v.base) }
  } catch { return null }
}

/**
 * F19: effective library source. A strip's「切换…并重试」stores a browser-local
 * override; it is dropped as soon as the configured preset changes (the user
 * picked one in Settings).
 */
export function getCdnSource(): VendorSource {
  const configured = normalizeCdnPreset(snapshot.cdnPreset)
  const override = readCdnOverride()
  const preset = override && override.base === configured ? override.preset : configured
  return { preset, ...(snapshot.cdnTemplate ? { template: snapshot.cdnTemplate } : {}) }
}

/** F19: remember a strip-chosen preset for this browser and notify frames. */
export function setCdnPresetOverride(preset: CdnPreset): void {
  memoryCdnOverride = JSON.stringify({ preset, base: normalizeCdnPreset(snapshot.cdnPreset) })
  try {
    globalThis.localStorage?.setItem(CDN_OVERRIDE_KEY, memoryCdnOverride)
  } catch { /* private mode: the in-memory copy still applies for this session */ }
  snapshot = { ...snapshot }
  for (const listener of listeners) listener()
}

/** Test seam: overlay fields on the current snapshot (no fetch, no theme apply). */
export function patchRuntimeConfigForTest(patch: Partial<RuntimeConfigSnapshot>): void {
  snapshot = { ...snapshot, ...patch }
  for (const listener of listeners) listener()
}

export function subscribeRuntimeConfig(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export async function refreshRuntimeConfig(): Promise<RuntimeConfigSnapshot> {
  if (typeof fetch === 'undefined') return snapshot
  if (inflight) {
    await inflight
    return snapshot
  }
  inflight = (async () => {
    try {
      const res = await fetch(assetUrl('runtime-config.json'), { cache: 'no-store' })
      if (!res.ok) return
      const data = await res.json() as Partial<RuntimeConfigSnapshot>
      publish({
        themeId: typeof data.themeId === 'string' && data.themeId.trim() ? data.themeId.trim() : DEFAULT_THEME_ID,
        packId: 'sandbox',
        fenceFeedback: data.fenceFeedback !== false,
        formatReferee: data.formatReferee !== false,
        strictImagePolicy: data.strictImagePolicy === true,
        legacyFences: data.legacyFences === true,
        cdnPreset: normalizeCdnPreset(data.cdnPreset),
        cdnTemplate: typeof data.cdnTemplate === 'string' ? data.cdnTemplate : '',
        uiEagerness: data.uiEagerness === 'restrained' || data.uiEagerness === 'eager' ? data.uiEagerness : 'balanced',
        customTokensJson: typeof data.customTokensJson === 'string' ? data.customTokensJson : '',
        pageStyleJson: typeof data.pageStyleJson === 'string' ? data.pageStyleJson : '',
        userTemplatesJson: typeof data.userTemplatesJson === 'string' ? data.userTemplatesJson : '',
        frameChannelMount: false,
        productPath: 'sandbox-html',
        themes: Array.isArray(data.themes) ? data.themes : snapshot.themes,
        packs: [{ id: 'sandbox', label: 'Sandbox HTML' }],
      })
    } catch {
      /* offline / old host */
    } finally {
      inflight = undefined
    }
  })()
  await inflight
  return snapshot
}

export function startRuntimeConfigWatch(): () => void {
  void refreshRuntimeConfig()
  const onVis = () => {
    if (document.visibilityState === 'visible') void refreshRuntimeConfig()
  }
  document.addEventListener('visibilitychange', onVis)
  const timer = window.setInterval(() => { void refreshRuntimeConfig() }, 2500)
  return () => {
    document.removeEventListener('visibilitychange', onVis)
    window.clearInterval(timer)
  }
}
