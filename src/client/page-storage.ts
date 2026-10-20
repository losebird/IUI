/**
 * F10 / F18: persistent per-page state for ```iui-html sandboxes.
 *
 * Sandboxed frames have an opaque origin, so their own Web Storage throws.
 * The host keeps each page's `localStorage` / `iuiSandbox.storage` items and
 * its DOM snapshot (form fields, checks, aria state) in the host origin's
 * IndexedDB under `iui:state:<sessionId>:<stableKey>`, with a 50-entry
 * in-memory LRU in front so a remount restores synchronously.
 */

export type PageStateRecord = {
  /** Author `localStorage` / `iuiSandbox.storage` items (string values). */
  items?: Record<string, string>
  /** DOM snapshot from the bridge's captureLocalState(). */
  dom?: Record<string, unknown>
  updatedAt?: number
}

/** Per-page quota (JSON bytes of items + dom). */
export const PAGE_STATE_QUOTA_BYTES = 256 * 1024
const LRU_LIMIT = 50
const DB_NAME = 'iui-page-state'
const STORE = 'kv'
const WRITE_DEBOUNCE_MS = 300

const cache = new Map<string, PageStateRecord>()
const pendingWrites = new Map<string, ReturnType<typeof setTimeout>>()
let dbPromise: Promise<IDBDatabase | null> | undefined

function touch(key: string, record: PageStateRecord): void {
  cache.delete(key)
  cache.set(key, record)
  while (cache.size > LRU_LIMIT) {
    const oldest = cache.keys().next().value
    if (oldest === undefined) break
    cache.delete(oldest)
  }
}

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') { resolve(null); return }
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => {
        try { req.result.createObjectStore(STORE) } catch { /* exists */ }
      }
      req.onsuccess = () => {
        pruneStale(req.result)
        resolve(req.result)
      }
      req.onerror = () => resolve(null)
      req.onblocked = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
  return dbPromise
}

/** Records untouched for 90 days are dropped once per page load. */
const STALE_MS = 90 * 24 * 3600 * 1000

function pruneStale(db: IDBDatabase): void {
  try {
    const cutoff = Date.now() - STALE_MS
    const req = db.transaction(STORE, 'readwrite').objectStore(STORE).openCursor()
    req.onsuccess = () => {
      const cursor = req.result
      if (!cursor) return
      const v = cursor.value as PageStateRecord | undefined
      if (typeof v?.updatedAt !== 'number' || v.updatedAt < cutoff) cursor.delete()
      cursor.continue()
    }
  } catch { /* best effort */ }
}

/** Stable storage key for a page: session + fence identity (null when not persistable). */
export function pageStateKey(sessionId: string | undefined, fenceKey: string | undefined): string | null {
  if (!sessionId || !fenceKey) return null
  // Fallback identities (`dom:unknown:N`) are positional and would collide.
  if (fenceKey.includes(':unknown:')) return null
  return `iui:state:${sessionId}:${fenceKey}`
}

/** Synchronous cache hit (undefined = not loaded yet). */
export function peekPageState(key: string): PageStateRecord | undefined {
  const hit = cache.get(key)
  if (hit !== undefined) touch(key, hit)
  return hit
}

export async function loadPageState(key: string): Promise<PageStateRecord> {
  const hit = cache.get(key)
  if (hit !== undefined) return hit
  const db = await openDb()
  const record = await new Promise<PageStateRecord>((resolve) => {
    if (db === null) { resolve({}); return }
    try {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key)
      req.onsuccess = () => {
        const v = req.result as PageStateRecord | undefined
        resolve(v !== null && typeof v === 'object' ? v : {})
      }
      req.onerror = () => resolve({})
    } catch {
      resolve({})
    }
  })
  // A write that landed while we were reading wins.
  const raced = cache.get(key)
  if (raced !== undefined) return raced
  touch(key, record)
  return record
}

function sizeOf(record: PageStateRecord): number {
  try { return JSON.stringify({ items: record.items ?? {}, dom: record.dom ?? {} }).length } catch { return Infinity }
}

/**
 * Merge a patch into a page's record (memory now, IndexedDB debounced 300 ms).
 * Returns false when the result would exceed the per-page quota (nothing saved).
 */
export function updatePageState(
  key: string,
  patch: Partial<Pick<PageStateRecord, 'items' | 'dom'>>,
  options: { persist?: boolean } = {},
): boolean {
  const prev = cache.get(key) ?? {}
  const next: PageStateRecord = { ...prev, ...patch, updatedAt: Date.now() }
  if (sizeOf(next) > PAGE_STATE_QUOTA_BYTES) return false
  touch(key, next)
  if (options.persist === false) return true
  const timer = pendingWrites.get(key)
  if (timer !== undefined) clearTimeout(timer)
  pendingWrites.set(key, setTimeout(() => {
    pendingWrites.delete(key)
    void openDb().then((db) => {
      if (db === null) return
      try {
        const latest = cache.get(key) ?? next
        db.transaction(STORE, 'readwrite').objectStore(STORE).put(latest, key)
      } catch { /* quota / private mode: memory copy still works this session */ }
    })
  }, WRITE_DEBOUNCE_MS))
  return true
}

/** Privacy: drop every stored page state (memory + IndexedDB). */
export async function clearAllPageState(): Promise<void> {
  cache.clear()
  for (const timer of pendingWrites.values()) clearTimeout(timer)
  pendingWrites.clear()
  const db = await openDb()
  if (db === null) return
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).clear()
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    } catch {
      resolve()
    }
  })
}

/** Validate a frame-sent items map: string→string only. */
export function sanitizeStorageItems(value: unknown): Record<string, string> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null
  const out: Record<string, string> = {}
  let count = 0
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v !== 'string' || k.length > 256) continue
    out[k] = v
    if (++count > 1000) break
  }
  return out
}
