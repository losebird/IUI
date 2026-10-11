/**
 * Session-scoped tool→UI binding registry.
 * Stores BOTH a flat BindingMap (legacy `$bind` string tokens) and a typed
 * AppDataMap (structured JSON projected onto components by schema).
 */

import { parseToolResultBindings, type BindingMap } from '../shared/binding-parse.ts'
import {
  flattenAppDataToBindings,
  parseToolResultAppData,
  type AppDataMap,
  type AppDataSnapshot,
} from '../shared/appdata-runtime.ts'

const MAX_SESSIONS = 64
const MAX_KEYS_PER_SESSION = 128

export type { BindingMap, AppDataMap, AppDataSnapshot }

interface SessionStore {
  bindings: BindingMap
  appData: AppDataMap
}

const sessions = new Map<string, SessionStore>()
const order: string[] = []
const lastCall = new Map<string, string>()

type BindingListener = (
  sessionId: string,
  map: BindingMap,
  meta?: { callId?: string; toolName?: string; appData?: AppDataMap },
) => void
const listeners = new Set<BindingListener>()

export function subscribeSessionBindings(listener: BindingListener): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

function notify(
  sessionId: string,
  store: SessionStore,
  meta?: { callId?: string; toolName?: string },
): void {
  const snap = { ...store.bindings }
  const appSnap = { ...store.appData }
  for (const listener of listeners) {
    try {
      listener(sessionId, snap, { ...meta, appData: appSnap })
    } catch { /* isolate */ }
  }
}

function touch(sessionId: string): SessionStore {
  let store = sessions.get(sessionId)
  if (store === undefined) {
    store = { bindings: {}, appData: {} }
    sessions.set(sessionId, store)
    order.unshift(sessionId)
    while (order.length > MAX_SESSIONS) {
      const evicted = order.pop()
      if (evicted !== undefined) {
        sessions.delete(evicted)
        lastCall.delete(evicted)
      }
    }
  } else {
    const idx = order.indexOf(sessionId)
    if (idx > 0) {
      order.splice(idx, 1)
      order.unshift(sessionId)
    }
  }
  return store
}

function trimStore(store: SessionStore): void {
  const keys = Object.keys(store.bindings)
  if (keys.length > MAX_KEYS_PER_SESSION) {
    for (const k of keys.slice(0, keys.length - MAX_KEYS_PER_SESSION)) {
      delete store.bindings[k]
    }
  }
  const akeys = Object.keys(store.appData)
  if (akeys.length > MAX_KEYS_PER_SESSION) {
    for (const k of akeys.slice(0, akeys.length - MAX_KEYS_PER_SESSION)) {
      delete store.appData[k]
    }
  }
}

/** Merge flat bindings (legacy). Also mirrors scalars into appData. */
export function mergeSessionBindings(
  sessionId: string,
  patch: BindingMap,
  meta?: { callId?: string; toolName?: string },
): BindingMap {
  if (sessionId === '' || Object.keys(patch).length === 0) {
    return sessions.get(sessionId)?.bindings ?? {}
  }
  const store = touch(sessionId)
  for (const [k, v] of Object.entries(patch)) {
    const key = k.slice(0, 64)
    store.bindings[key] = typeof v === 'number' ? v : String(v).slice(0, 8_000)
    if (!(key in store.appData)) store.appData[key] = store.bindings[key]
  }
  trimStore(store)
  if (meta?.callId) lastCall.set(sessionId, meta.callId)
  notify(sessionId, store, meta)
  return store.bindings
}

/** Merge typed appData payloads; rebuilds flat bindings for compatibility. */
export function mergeSessionAppData(
  sessionId: string,
  patch: AppDataMap,
  meta?: { callId?: string; toolName?: string },
): AppDataSnapshot {
  if (sessionId === '' || Object.keys(patch).length === 0) {
    return getSessionSnapshot(sessionId)
  }
  const store = touch(sessionId)
  for (const [k, v] of Object.entries(patch)) {
    store.appData[k.slice(0, 64)] = v
  }
  Object.assign(store.bindings, flattenAppDataToBindings(patch))
  trimStore(store)
  if (meta?.callId) lastCall.set(sessionId, meta.callId)
  notify(sessionId, store, meta)
  return { bindings: { ...store.bindings }, appData: { ...store.appData } }
}

/** Ingest a tool result: typed appData + flat bindings. */
export function ingestToolResultBindings(
  sessionId: string,
  content: string,
  toolName?: string,
  callId?: string,
): BindingMap {
  const typed = parseToolResultAppData(content, toolName, callId)
  const flat = parseToolResultBindings(content, toolName, callId)
  const meta: { callId?: string; toolName?: string } = {}
  if (toolName !== undefined) meta.toolName = toolName
  if (callId !== undefined) meta.callId = callId
  if (Object.keys(typed).length > 0) {
    mergeSessionAppData(sessionId, typed, meta)
  }
  if (Object.keys(flat).length > 0) {
    mergeSessionBindings(sessionId, flat, meta)
  }
  return getSessionBindings(sessionId)
}

export function getSessionBindings(sessionId: string): BindingMap {
  return { ...(sessions.get(sessionId)?.bindings ?? {}) }
}

export function getSessionAppData(sessionId: string): AppDataMap {
  return { ...(sessions.get(sessionId)?.appData ?? {}) }
}

export function getSessionSnapshot(sessionId: string): AppDataSnapshot {
  const store = sessions.get(sessionId)
  return {
    bindings: { ...(store?.bindings ?? {}) },
    appData: { ...(store?.appData ?? {}) },
  }
}

export function getLatestBindings(): BindingMap {
  const id = order[0]
  if (id === undefined) return {}
  return getSessionBindings(id)
}

export function getLatestSnapshot(): AppDataSnapshot {
  const id = order[0]
  if (id === undefined) return { bindings: {}, appData: {} }
  return getSessionSnapshot(id)
}

export function getSessionLastCallId(sessionId: string): string | undefined {
  return lastCall.get(sessionId)
}

export function clearSessionBindings(sessionId: string): void {
  sessions.delete(sessionId)
  lastCall.delete(sessionId)
  const idx = order.indexOf(sessionId)
  if (idx >= 0) order.splice(idx, 1)
}

export function resetBindingBridgeForTests(): void {
  sessions.clear()
  order.length = 0
  lastCall.clear()
  listeners.clear()
}
