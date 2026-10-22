/**
 * Browser mirror of Host `/plugins/@losebird/iui/assets/runtime-config.json`.
 */
import { assetUrl } from './asset-loader.ts'
import { DEFAULT_THEME_ID } from '../config/defaults.ts'
import { setActiveThemeId, setCustomTokens } from './theme/apply-theme.ts'
import { setActivePackId } from './theme/apply-pack.ts'
import { isVisualPreviewLocked } from './theme/preview-lock.ts'
import { normalizeCdnPreset, type CdnPreset, type VendorSource } from '../shared/vendor-registry.ts'
import { cdnOrderFromProbe, decideNetContext, normalizeMapTilesSetting, type MapTilesSetting, type NetContext } from '../shared/net-context.ts'
import type { NetworkProbeSnapshot } from '../shared/network-probe.ts'

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
  /** Batch F: basemap setting (auto · amap · global). */
  mapTiles?: MapTilesSetting
  /** C10/Batch F: last plugin connectivity probe (drives the `auto` choices). */
  networkProbe?: NetworkProbeSnapshot | null
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
const PROBE_CACHE_KEY = 'iui:networkProbe'
/** A cached probe keeps `auto` stable across reloads (no rebuild when the fresh one lands). */
const PROBE_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000

function isProbeSnapshot(v: unknown): v is NetworkProbeSnapshot {
  return !!v && typeof v === 'object' && typeof (v as NetworkProbeSnapshot).at === 'number' && Array.isArray((v as NetworkProbeSnapshot).results)
}

function readCachedProbe(): NetworkProbeSnapshot | null {
  try {
    const raw = globalThis.localStorage?.getItem(PROBE_CACHE_KEY)
    if (!raw) return null
    const v = JSON.parse(raw) as unknown
    return isProbeSnapshot(v) && Date.now() - v.at < PROBE_CACHE_MAX_AGE_MS ? v : null
  } catch { return null }
}

/** Same probe → same key → no iframe rebuild. */
function probeSignature(snap: NetworkProbeSnapshot | null | undefined): string {
  if (!snap) return ''
  const ctx = decideNetContext(snap, 'auto')
  return `${cdnOrderFromProbe(snap).join(',')}|${ctx.tiles}|${ctx.wiki}|${snap.results.find((r) => r.id === 'amap')?.ok === true}`
}

let snapshot: RuntimeConfigSnapshot = {
  networkProbe: readCachedProbe(),
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

/**
 * Batch F: store a probe (runtime-config, network-probe.json or the settings
 * card's re-check). Listeners fire only when the derived choices change.
 */
export function setNetworkProbeSnapshot(snap: NetworkProbeSnapshot | null): void {
  if (snap !== null && !isProbeSnapshot(snap)) return
  const changed = probeSignature(snap) !== probeSignature(snapshot.networkProbe)
  snapshot = { ...snapshot, networkProbe: snap }
  try { if (snap) globalThis.localStorage?.setItem(PROBE_CACHE_KEY, JSON.stringify(snap)) } catch { /* private mode */ }
  if (changed) for (const listener of listeners) listener()
}

/** Batch F: basemap + photo strategy for the next srcdoc build. */
export function getNetContextForBuild(): NetContext {
  return decideNetContext(snapshot.networkProbe, normalizeMapTilesSetting(snapshot.mapTiles))
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
  const order = preset === 'auto' ? cdnOrderFromProbe(snapshot.networkProbe) : []
  return { preset, ...(snapshot.cdnTemplate ? { template: snapshot.cdnTemplate } : {}), ...(order.length ? { order } : {}) }
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
        mapTiles: normalizeMapTilesSetting(data.mapTiles),
        networkProbe: isProbeSnapshot(data.networkProbe) ? data.networkProbe : snapshot.networkProbe ?? null,
        uiEagerness: data.uiEagerness === 'restrained' || data.uiEagerness === 'eager' ? data.uiEagerness : 'balanced',
        customTokensJson: typeof data.customTokensJson === 'string' ? data.customTokensJson : '',
        pageStyleJson: typeof data.pageStyleJson === 'string' ? data.pageStyleJson : '',
        userTemplatesJson: typeof data.userTemplatesJson === 'string' ? data.userTemplatesJson : '',
        frameChannelMount: false,
        productPath: 'sandbox-html',
        themes: Array.isArray(data.themes) ? data.themes : snapshot.themes,
        packs: [{ id: 'sandbox', label: 'Sandbox HTML' }],
      })
      if (isProbeSnapshot(data.networkProbe)) setNetworkProbeSnapshot(data.networkProbe)
      else void fetchProbeOnce()
    } catch {
      /* offline / old host */
    } finally {
      inflight = undefined
    }
  })()
  await inflight
  return snapshot
}

/**
 * S10: no fixed 2.5 s poll. Settings saves call refreshRuntimeConfig() directly;
 * otherwise refresh when the tab becomes visible / focused, plus a slow fallback
 * (edits made elsewhere, e.g. the CLI) that only runs while the page is visible.
 */
export const RUNTIME_CONFIG_FALLBACK_MS = 60_000
export function startRuntimeConfigWatch(): () => void {
  void refreshRuntimeConfig()
  let last = Date.now()
  const refresh = () => { last = Date.now(); void refreshRuntimeConfig() }
  const onVis = () => {
    if (document.visibilityState === 'visible' && Date.now() - last > 1000) refresh()
  }
  document.addEventListener('visibilitychange', onVis)
  window.addEventListener('focus', onVis)
  const timer = window.setInterval(() => {
    if (document.visibilityState === 'visible' && Date.now() - last >= RUNTIME_CONFIG_FALLBACK_MS - 50) refresh()
  }, RUNTIME_CONFIG_FALLBACK_MS)
  return () => {
    document.removeEventListener('visibilitychange', onVis)
    window.removeEventListener('focus', onVis)
    window.clearInterval(timer)
  }
}

let probeFetched = false
/** The plugin probes on first request (≤ 2 s); pick the result up once. */
async function fetchProbeOnce(): Promise<void> {
  if (probeFetched || typeof fetch === 'undefined') return
  probeFetched = true
  try {
    const res = await fetch(assetUrl('network-probe.json'), { cache: 'no-store' })
    if (!res.ok) return
    const data = await res.json() as { networkProbe?: unknown }
    if (isProbeSnapshot(data.networkProbe)) setNetworkProbeSnapshot(data.networkProbe)
  } catch { /* old host / offline */ }
}
