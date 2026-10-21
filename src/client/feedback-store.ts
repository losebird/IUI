/**
 * G16: local feedback + self-check statistics.
 *
 * Everything stays in this browser. A page is identified only by a hash of
 * its source; no page content, prompt text or URL is stored. The user can
 * export an anonymous summary (after an explicit consent tick in Settings)
 * to help tune templates and rules: rules → generation → feedback.
 */
import { SELF_CHECK_KINDS, type SandboxSelfCheckIssue } from '../shared/html-sandbox.ts'

export const FEEDBACK_REASONS = ['ugly', 'unreadable', 'broken', 'notWanted'] as const
export type FeedbackReason = (typeof FEEDBACK_REASONS)[number]
export type FeedbackVote = 'up' | 'down'

const KEY = 'iui.feedback.v1'
const MAX_PAGES = 400

export interface PageRecord {
  /** Day (YYYY-MM-DD) the page was first seen. */
  day: string
  intent: string
  vote?: FeedbackVote
  reason?: FeedbackReason
  /** Self-check kinds → count (serious ones prefixed with `!`). */
  checks?: Record<string, number>
}

interface Store { v: 1; pages: Record<string, PageRecord>; order: string[] }

const listeners = new Set<() => void>()
let revision = 0

function storage(): Storage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage } catch { return null }
}

function read(): Store {
  try {
    const raw = storage()?.getItem(KEY)
    const v = raw ? JSON.parse(raw) as Partial<Store> : null
    if (v && v.v === 1 && v.pages && typeof v.pages === 'object' && Array.isArray(v.order)) return v as Store
  } catch { /* corrupt → reset */ }
  return { v: 1, pages: {}, order: [] }
}

function write(store: Store): void {
  while (store.order.length > MAX_PAGES) {
    const old = store.order.shift()
    if (old) delete store.pages[old]
  }
  try { storage()?.setItem(KEY, JSON.stringify(store)) } catch { /* quota */ }
  revision++
  for (const fn of listeners) { try { fn() } catch { /* ignore */ } }
}

export function subscribeFeedback(fn: () => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}
export function feedbackRevision(): number { return revision }

/** Stable anonymous id for a page source. */
export function pageFeedbackKey(source: string): string {
  let h1 = 0x811c9dc5, h2 = 0x01000193
  for (let i = 0; i < source.length; i++) {
    const c = source.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 16777619)
    h2 = Math.imul(h2 ^ c, 2246822507)
  }
  return `p${(h1 >>> 0).toString(36)}${(h2 >>> 0).toString(36)}`
}

function today(now: number): string {
  return new Date(now).toISOString().slice(0, 10)
}

function upsert(store: Store, key: string, intent: string, now: number): PageRecord {
  let rec = store.pages[key]
  if (!rec) {
    rec = { day: today(now), intent: intent.slice(0, 24) || 'visual' }
    store.pages[key] = rec
    store.order.push(key)
  }
  return rec
}

export function getPageFeedback(key: string): PageRecord | undefined {
  return read().pages[key]
}

export function recordVote(key: string, intent: string, vote: FeedbackVote | null, reason?: FeedbackReason, now = Date.now()): void {
  const store = read()
  const rec = upsert(store, key, intent, now)
  if (vote === null) { delete rec.vote; delete rec.reason }
  else {
    rec.vote = vote
    if (vote === 'down' && reason && (FEEDBACK_REASONS as readonly string[]).includes(reason)) rec.reason = reason
    else delete rec.reason
  }
  write(store)
}

export function recordSelfCheck(key: string, intent: string, issues: readonly SandboxSelfCheckIssue[], now = Date.now()): void {
  const store = read()
  const rec = upsert(store, key, intent, now)
  const checks: Record<string, number> = {}
  for (const issue of issues) {
    if (!(SELF_CHECK_KINDS as readonly string[]).includes(issue.kind)) continue
    checks[issue.serious ? `!${issue.kind}` : issue.kind] = Math.max(0, Math.min(9999, Math.round(issue.count)))
  }
  rec.checks = checks
  write(store)
}

export interface FeedbackSummary {
  pages: number
  up: number
  down: number
  reasons: Record<string, number>
  checks: Record<string, number>
  pagesWithSerious: number
}

export function summarizeFeedback(): FeedbackSummary {
  const out: FeedbackSummary = { pages: 0, up: 0, down: 0, reasons: {}, checks: {}, pagesWithSerious: 0 }
  for (const rec of Object.values(read().pages)) {
    out.pages++
    if (rec.vote === 'up') out.up++
    if (rec.vote === 'down') {
      out.down++
      if (rec.reason) out.reasons[rec.reason] = (out.reasons[rec.reason] ?? 0) + 1
    }
    let serious = false
    for (const k of Object.keys(rec.checks ?? {})) {
      const kind = k.replace(/^!/, '')
      out.checks[kind] = (out.checks[kind] ?? 0) + 1
      if (k.startsWith('!')) serious = true
    }
    if (serious) out.pagesWithSerious++
  }
  return out
}

/** Anonymous export: per-page rows without ids or content, plus the summary. */
export function exportFeedback(meta: { version: string; locale: string }): string {
  const rows = Object.values(read().pages).map((rec) => ({ ...rec }))
  return JSON.stringify({
    kind: 'iui-feedback',
    schema: 1,
    plugin: meta.version,
    locale: meta.locale,
    exportedDay: today(Date.now()),
    summary: summarizeFeedback(),
    pages: rows,
  }, null, 2)
}

export function clearFeedback(): void {
  try { storage()?.removeItem(KEY) } catch { /* ignore */ }
  revision++
  for (const fn of listeners) { try { fn() } catch { /* ignore */ } }
}
