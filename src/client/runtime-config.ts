/**
 * Browser mirror of Host `/plugins/@losebird/iui/assets/runtime-config.json`.
 */
import { assetUrl } from './asset-loader.ts'
import { DEFAULT_THEME_ID } from '../config/defaults.ts'
import { setActiveThemeId, setCustomTokens } from './theme/apply-theme.ts'
import { setActivePackId } from './theme/apply-pack.ts'
import { isVisualPreviewLocked } from './theme/preview-lock.ts'

export type RuntimeConfigSnapshot = {
  themeId: string
  packId: string
  fenceFeedback: boolean
  formatReferee: boolean
  /** F4: strict sandbox image policy (img-src data:/blob: + allowlist). */
  strictImagePolicy?: boolean
  /** F16: deprecated ```iui / ```dsh-ui fences still render (default off). */
  legacyFences?: boolean
  customTokensJson: string
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
        customTokensJson: typeof data.customTokensJson === 'string' ? data.customTokensJson : '',
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
