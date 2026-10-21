/**
 * F24: page version registry — every settled ```iui-html page and every merged
 * ```iui-patch result registers here (per session), so a patch finds its base
 * page and each frame can offer「v1 · v2 · v3」.
 * @module @losebird/iui/client/page-versions
 */
import type { SandboxPage } from '../shared/sandbox-patch.ts'

export type PageVersion = {
  /** Fence identity (React key / DOM key); one entry per fence, idempotent. */
  fenceKey: string
  /** Normalized page id (explicit id or title); `null` = unnamed page. */
  pageId: string | null
  /** Serialized ```iui-html body of this version. */
  raw: string
  page: SandboxPage
  /** Persistent-state key shared along a page lineage (state inheritance). */
  storageKey: string | null
  /** Transcript order ([messageSeq, block, fence]) when known. */
  order?: readonly number[]
  /** Registration sequence (fallback ordering). */
  seq: number
}

type Scope = { entries: Map<string, PageVersion> }

const MAX_ENTRIES = 200
const scopes = new Map<string, Scope>()
const listeners = new Set<() => void>()
let seqCounter = 0
let revision = 0

function scopeOf(scope: string | undefined): Scope {
  const id = scope ?? ''
  let s = scopes.get(id)
  if (s === undefined) {
    s = { entries: new Map() }
    scopes.set(id, s)
  }
  return s
}

function notify(): void {
  revision++
  for (const fn of [...listeners]) {
    try { fn() } catch { /* listener errors stay local */ }
  }
}

/** Order comparison: transcript order when both sides know it, else registration order. */
export function compareVersions(a: Pick<PageVersion, 'order' | 'seq'>, b: Pick<PageVersion, 'order' | 'seq'>): number {
  if (a.order && b.order) {
    const n = Math.max(a.order.length, b.order.length)
    for (let i = 0; i < n; i++) {
      const d = (a.order[i] ?? 0) - (b.order[i] ?? 0)
      if (d !== 0) return d
    }
  }
  return a.seq - b.seq
}

export type RegisterInput = Omit<PageVersion, 'seq'>

/** Register (or refresh) one fence's version; notifies only on change. */
export function registerPageVersion(scope: string | undefined, input: RegisterInput): void {
  const s = scopeOf(scope)
  const prev = s.entries.get(input.fenceKey)
  if (prev && prev.raw === input.raw && prev.pageId === input.pageId && prev.storageKey === input.storageKey
    && String(prev.order ?? '') === String(input.order ?? '')) return
  s.entries.set(input.fenceKey, { ...input, seq: prev?.seq ?? ++seqCounter })
  // Entries outlive their frames (virtualized rows unmount); keep the newest.
  if (s.entries.size > MAX_ENTRIES) {
    const oldest = [...s.entries.values()].sort(compareVersions).slice(0, s.entries.size - MAX_ENTRIES)
    for (const v of oldest) s.entries.delete(v.fenceKey)
  }
  notify()
}

export function unregisterPageVersion(scope: string | undefined, fenceKey: string): void {
  const s = scopes.get(scope ?? '')
  if (s?.entries.delete(fenceKey)) notify()
}

function sorted(scope: string | undefined): PageVersion[] {
  return [...scopeOf(scope).entries.values()].sort(compareVersions)
}

/**
 * Base page for a patch: the latest version BEFORE the patch fence (by
 * transcript order) — of `pageId` when named, else of any page.
 * When the patch fence itself is unknown to the registry, "before" means
 * "registered so far".
 */
export function resolvePatchBase(
  scope: string | undefined,
  pageId: string | null,
  self: { fenceKey: string; order?: readonly number[] },
): PageVersion | null {
  const all = sorted(scope)
  const me = scopeOf(scope).entries.get(self.fenceKey)
  const pivot = me ?? (self.order ? { order: self.order, seq: Number.POSITIVE_INFINITY } : null)
  let best: PageVersion | null = null
  for (const v of all) {
    if (v.fenceKey === self.fenceKey) continue
    if (pivot !== null && compareVersions(v, pivot) >= 0) continue
    if (pageId !== null && v.pageId !== pageId && !(v.page.title && normalize(v.page.title) === pageId)) continue
    best = v
  }
  return best
}

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/gu, ' ').slice(0, 80)
}

/** All versions of the lineage `fenceKey` belongs to (same pageId; unnamed = just itself + patches on it). */
export function listPageVersions(scope: string | undefined, pageId: string | null, fenceKey: string): PageVersion[] {
  const all = sorted(scope)
  if (pageId === null) {
    const me = all.find((v) => v.fenceKey === fenceKey)
    if (!me || me.storageKey === null) return me ? [me] : []
    return all.filter((v) => v.pageId === null && v.storageKey === me.storageKey)
  }
  return all.filter((v) => v.pageId === pageId)
}

export function subscribePageVersions(fn: () => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

export function pageVersionsRevision(): number {
  return revision
}

/** Test hook. */
export function resetPageVersions(): void {
  scopes.clear()
  seqCounter = 0
  notify()
}
