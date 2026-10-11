/**
 * Browser-side tool-result bindings: prefer SSE push from Host, fall back to
 * tight poll when unresolved `$bind:` tokens remain, resolve placeholders
 * inside fence specs without a model round-trip.
 */

import { hasUnresolvedBind } from '../shared/binding-parse.ts'
import {
  injectAppDataIntoSpec,
  type AppDataMap,
  type AppDataSnapshot,
} from '../shared/appdata-runtime.ts'
import type { GenuiNode, GenuiSpec } from './spec.ts'

/** Avoid importing ./asset-loader (standalone alias conflict). */
function bindingsAssetUrl(file: string): string {
  return `/plugins/@losebird/iui/assets/${file}`
}

export type ClientBindingMap = Record<string, string | number>

const listeners = new Set<() => void>()
let bindings: ClientBindingMap = {}
let appData: AppDataMap = {}
let sessionHint = ''
let inflight: Promise<void> | undefined
/** True while any mounted spec still has unresolved $bind tokens. */
let needsTightPoll = false

function publish(next: ClientBindingMap, typed?: AppDataMap): void {
  bindings = next
  if (typed !== undefined) appData = typed
  for (const listener of listeners) listener()
}

/** Merge frame-channel / IR bind updates into the live client map. */
export function mergeClientBindings(
  next: ClientBindingMap,
  typed?: AppDataMap | Record<string, unknown>,
): void {
  const merged = { ...bindings, ...next }
  if (typed !== undefined) {
    publish(merged, { ...appData, ...(typed as AppDataMap) })
  } else {
    publish(merged)
  }
}

export function getBindingsSnapshot(): ClientBindingMap {
  return bindings
}

export function subscribeBindings(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** Hint the active session so bindings.json / SSE can scope (optional). */
export function setBindingSessionHint(sessionId: string): void {
  sessionHint = sessionId.trim()
}

/** Tell the watcher a live fence still needs `$bind` resolution. */
export function setBindingsNeedTightPoll(need: boolean): void {
  needsTightPoll = need
}

function scopedUrl(file: string): string {
  const base = bindingsAssetUrl(file)
  const join = base.includes('?') ? '&' : '?'
  return sessionHint !== ''
    ? `${base}${join}session=${encodeURIComponent(sessionHint)}`
    : base
}

export async function refreshBindings(): Promise<ClientBindingMap> {
  if (typeof fetch === 'undefined') return bindings
  if (inflight) {
    await inflight
    return bindings
  }
  inflight = (async () => {
    try {
      const res = await fetch(scopedUrl('bindings.json'), { cache: 'no-store' })
      if (!res.ok) return
      const data = await res.json() as { bindings?: ClientBindingMap; appData?: AppDataMap }
      if (data && typeof data.bindings === 'object' && data.bindings !== null) {
        const typed = data.appData && typeof data.appData === 'object' && data.appData !== null
          ? { ...data.appData }
          : undefined
        publish({ ...data.bindings }, typed)
      }
    } catch {
      /* offline */
    } finally {
      inflight = undefined
    }
  })()
  await inflight
  return bindings
}

/**
 * Prefer EventSource (SSE) for near-realtime binding push; poll as fallback.
 * Tight poll (400ms) only while unresolved binds remain; idle 2.5s otherwise.
 */
export function startBindingWatch(): () => void {
  void refreshBindings()
  let es: EventSource | undefined
  let pollTimer: number | undefined
  let pollMs = 2500

  const armPoll = (): void => {
    if (pollTimer !== undefined) window.clearInterval(pollTimer)
    pollMs = needsTightPoll ? 400 : 2500
    pollTimer = window.setInterval(() => {
      const next = needsTightPoll ? 400 : 2500
      if (next !== pollMs) {
        pollMs = next
        armPoll()
        return
      }
      void refreshBindings()
    }, pollMs)
  }

  const connectSse = (): void => {
    if (typeof EventSource === 'undefined') return
    try {
      es?.close()
      es = new EventSource(scopedUrl('bindings.sse'))
      es.onmessage = (ev) => {
        try {
          const data = JSON.parse(String(ev.data)) as { bindings?: ClientBindingMap; appData?: AppDataMap }
          if (data && typeof data.bindings === 'object' && data.bindings !== null) {
            const typed = data.appData && typeof data.appData === 'object' && data.appData !== null
              ? { ...data.appData }
              : undefined
            publish({ ...data.bindings }, typed)
          }
        } catch { /* ignore malformed */ }
      }
      es.onerror = () => {
        // Browser will retry EventSource; keep poll as safety net.
      }
    } catch {
      es = undefined
    }
  }

  connectSse()
  armPoll()

  const onVis = () => {
    if (document.visibilityState === 'visible') {
      void refreshBindings()
      connectSse()
    }
  }
  document.addEventListener('visibilitychange', onVis)

  // Re-scope SSE when session hint changes (cheap interval check).
  let lastHint = sessionHint
  const hintTimer = window.setInterval(() => {
    if (sessionHint !== lastHint) {
      lastHint = sessionHint
      connectSse()
      void refreshBindings()
    }
  }, 1000)

  return () => {
    document.removeEventListener('visibilitychange', onVis)
    if (pollTimer !== undefined) window.clearInterval(pollTimer)
    window.clearInterval(hintTimer)
    es?.close()
  }
}

/** Snapshot of flat + typed appData currently held by the client. */
export function getAppDataSnapshot(): AppDataSnapshot {
  return { bindings: { ...bindings }, appData: { ...appData } }
}

/**
 * Resolve `$bind` / `$appData` and project typed tool payloads onto component
 * fields by COMPONENT_SCHEMAS (not flat string map only).
 */
export function resolveSpecBindings(
  spec: GenuiSpec,
  map: ClientBindingMap = bindings,
  typed: AppDataMap = appData,
): GenuiSpec {
  const seed = spec.bindings !== undefined
    ? { ...map, ...spec.bindings }
    : map
  const withSeed: AppDataSnapshot = {
    bindings: seed,
    appData: Object.keys(typed).length > 0 ? typed : Object.fromEntries(
      Object.entries(seed).map(([k, v]) => [k, v]),
    ),
  }
  if (Object.keys(withSeed.bindings).length === 0 && Object.keys(withSeed.appData).length === 0) {
    const raw = JSON.stringify(spec)
    if (!hasUnresolvedBind(raw)) return spec
  }
  return injectAppDataIntoSpec(spec, withSeed) as GenuiSpec
}

/** Apply local field valueFrom: progress/stat read sibling field ids. */
export function applyValueFromFields(
  spec: GenuiSpec,
  fields: Readonly<Record<string, string>>,
): GenuiSpec {
  if (Object.keys(fields).length === 0) return spec
  const items = spec.items.map((node) => applyValueFromNode(node, fields) as GenuiNode)
  return { ...spec, items }
}

function applyValueFromNode(node: unknown, fields: Readonly<Record<string, string>>): typeof node {
  if (node === null || typeof node !== 'object') return node
  if (Array.isArray(node)) return node.map((c) => applyValueFromNode(c, fields))
  const rec = node as Record<string, unknown>
  const next: Record<string, unknown> = { ...rec }
  if (typeof rec.valueFrom === 'string' && rec.valueFrom.trim() !== '') {
    const raw = fields[rec.valueFrom]
    if (raw !== undefined && raw !== '') {
      if (rec.type === 'progress' || rec.type === 'slider') {
        const n = Number(raw)
        if (Number.isFinite(n)) next.value = n
      } else if (rec.type === 'stat' || rec.type === 'hero' || rec.type === 'text') {
        next.value = raw
        if (rec.type === 'text') next.content = raw
      } else {
        next.value = raw
      }
    }
  }
  if (Array.isArray(rec.items)) {
    next.items = rec.items.map((c) => applyValueFromNode(c, fields))
  }
  if (Array.isArray(rec.tabs)) {
    next.tabs = rec.tabs.map((tab) => applyValueFromNode(tab, fields))
  }
  return next
}
