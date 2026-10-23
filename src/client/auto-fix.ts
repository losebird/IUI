/**
 * visual ⑤ / G15: one automatic contrast repair per freshly generated page.
 *
 * The in-frame self-check measures COMPUTED colors (after daisyUI themes, JS
 * toggled states and translucent layers). When text sits below 3:1 on a page
 * that streamed in this browser session, the host sends one short message
 * asking the model for a ```iui-patch that only fixes those colors. The server
 * adds the current page source + patch syntax (page-memory), so the reply is a
 * small patch, not a rewrite.
 *
 * Guards: the 自动修复 setting (fenceFeedback) gates it; pages re-rendered from
 * history never qualify (only fences seen streaming here); a persisted ledger
 * keeps it to one attempt per page lineage, so the patched version cannot loop.
 */
import type { SandboxContrastSample, SandboxSelfCheckIssue } from '../shared/html-sandbox.ts'

/** Below this ratio text is unreadable at any size (WCAG large-text floor). */
export const AUTO_FIX_CONTRAST_RATIO = 3

type Sender = (sessionId: string | undefined, text: string) => Promise<boolean>
let sender: Sender | null = null

/** Register the conversation sender (client apply). */
export function registerConversationSender(fn: Sender): () => void {
  sender = fn
  return () => { if (sender === fn) sender = null }
}

/** Test helper. */
export function resetAutoFixForTests(): void {
  sender = null
  liveFences.clear()
  memoryLedger.clear()
}

// ---- fences seen streaming in this browser session ----
const liveFences = new Set<string>()
const LIVE_MAX = 200

/** Called while a fence renders with streaming=true. */
export function markFenceLive(scope: string | undefined, fenceKey: string): void {
  const k = `${scope ?? ''}|${fenceKey}`
  if (liveFences.has(k)) return
  liveFences.add(k)
  if (liveFences.size > LIVE_MAX) liveFences.delete(liveFences.values().next().value!)
}

export function isFenceLive(scope: string | undefined, fenceKey: string): boolean {
  return liveFences.has(`${scope ?? ''}|${fenceKey}`)
}

// ---- one attempt per page lineage (persisted) ----
const LEDGER_KEY = 'iui.autofix.contrast.v1'
const LEDGER_MAX = 200
const memoryLedger = new Set<string>()

function readLedger(): string[] {
  try {
    const raw = globalThis.localStorage?.getItem(LEDGER_KEY)
    const list = raw ? JSON.parse(raw) as unknown : []
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : []
  } catch { return [] }
}

/** True the first time for `key`; records it so later calls return false. */
export function claimAutoFix(key: string): boolean {
  if (memoryLedger.has(key)) return false
  const list = readLedger()
  if (list.includes(key)) { memoryLedger.add(key); return false }
  memoryLedger.add(key)
  list.push(key)
  try { globalThis.localStorage?.setItem(LEDGER_KEY, JSON.stringify(list.slice(-LEDGER_MAX))) } catch { /* storage full: memory ledger still holds */ }
  return true
}

/** The low-contrast issue worth an automatic patch, if any. */
export function contrastIssueToFix(issues: readonly SandboxSelfCheckIssue[]): SandboxSelfCheckIssue | null {
  const hit = issues.find((x) => x.kind === 'lowContrast')
  if (!hit || typeof hit.minRatio !== 'number' || hit.minRatio >= AUTO_FIX_CONTRAST_RATIO) return null
  if (!hit.samples || hit.samples.length === 0) return null
  return hit
}

function sampleLine(s: SandboxContrastSample): string {
  const text = s.text.replace(/[`\n]/g, ' ').slice(0, 20)
  return `- 「${text}」 ${s.sel} · ${s.ratio}:1（文字 ${s.fg} / 背景 ${s.bg}）`
}

/**
 * The repair ask. Kept under 400 chars and worded as an edit (改/颜色) so the
 * server's page-memory attaches the current page source + iui-patch syntax.
 */
export function contrastFixPrompt(issue: SandboxSelfCheckIssue, title: string | null): string {
  const lines = (issue.samples ?? []).slice(0, 3).map(sampleLine)
  const head = `[iui-autofix] 页面${title ? `「${title.slice(0, 24)}」` : ''}渲染后有 ${issue.count} 处文字和背景对比度低于 3:1，看不清。请只输出一个 iui-patch 修改这些元素的颜色（文字改用 text-base-content / text-primary-content 等主题色，或换背景），不要改布局和内容，不要解释：`
  return `${head}\n${lines.join('\n')}`.slice(0, 400)
}

/** Send one message to the conversation; false when no sender / it failed. */
export async function sendAutoFix(sessionId: string | undefined, text: string): Promise<boolean> {
  if (sender === null) return false
  try { return await sender(sessionId, text) } catch { return false }
}
