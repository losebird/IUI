/**
 * Fence feedback loop (issue #160): a reply whose ```dsh-ui fence the guard
 * cannot render should not stay broken for the reader. The host's
 * `agent/turn-stopping` boundary lets a plugin steer input into the SAME turn —
 * the machine re-reads its inbox and runs another step instead of closing
 * (see the `dsh-agent` runtime contract) — so the model can resend a corrected
 * fence while the user is still looking at the raw JSON.
 *
 * The loop is deliberately narrow, matching the contract agreed on the issue:
 * - **默认开启。** 插件配置中的 `fenceFeedback: false` 可以关闭回合转向。
 * - **修正上限。** 每个 turn 最多发送 **一条** correction；render failure、delivery reminder、
 *   format referee 共用上限。合法 ```iui 围栏或 validate_dsh_ui 成功后不再 steer。
 * - **不再改写 EMPTY_RESPONSE。** 已验证回合若只含 reasoning，交给同轮 steer（至多一次），
 *   不再触发宿主 1/5 重试风暴。
 * - **Never for subagents.** A child session's fence belongs to a parent reply.
 * - **Exact fence matching.** Only an info string of exactly `dsh-ui` opens a
 *   fence, so ` ```dsh-ui-dark `, indented prose, or a mention of the name is
 *   never rewritten.
 * - **Accounted before sending.** The fingerprint is recorded before `steer`,
 *   so a re-entrant boundary cannot deliver the same correction twice.
 * - **Cancellation-aware.** An aborted must-fence turn without a valid fence stores a next-turn reminder (injected once on the following pre-step).
 *
 * 检查会复用 renderer 在回合结束后的流程，包括 JSON 修复和坏节点清理；
 * 已经可以渲染的最终回复不会收到修正请求。
 * @module @losebird/iui/plugin/fence-feedback
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import type { Session, SessionEvent, SessionStore, UserMessage } from '@deepseek-ai/dsh-session'
import { createHash, randomUUID } from 'node:crypto'
import { droppedNodeFailure } from './genui-diagnostic.ts'
import { resolveFence } from '../shared/fence-resolve.ts'
import { parseHtmlSandboxFence } from '../shared/html-sandbox.ts'
import { parseSandboxPatch } from '../shared/sandbox-patch.ts'
import { createPageMemory, currentPage, currentPageNote, looksLikePageEditAsk, trackPageFences, type PageMemory } from './page-memory.ts'
import {
  planFormatRefereeCorrection,
  formatMarkersIn,
  replyHasValidFence,
  replyLooksLikeMarkdownUi,
  classifyAsk,
  buildNextTurnFormatReminder,
  buildFenceFirstHint,
  buildFirstTokenContract,
  buildToolBeforeFenceAbort,
  buildMidTurnFenceNudge,
  buildFirstTokenViolationSteer,
  replyHasJsonMasquerade,
} from './format-referee.ts'
import {
  routeFormat,
  type FormatRouterConfig,
} from './format-router.ts'
import {
  fenceFirstRegex,
  getStreamHeuristics,
  isToolBeforeFenceName,
  looksLikeJsonMasqueradeOpen,
  matchesForbiddenFirstPrefix,
} from '../config/stream-heuristics.ts'
import { buildPatternNote, getIntentRule, isExplicitUiAsk } from '../config/referee-rules.ts'
import { recordFenceOp } from '../shared/fence-ops.ts'
import { designLintNote, lintSandboxDesign, type DesignIssue } from '../shared/design-lint.ts'
import { ingestToolResultBindings } from './binding-bridge.ts'

/** Plugin name recorded on every message this loop steers. */
export const FEEDBACK_PLUGIN_NAME = '@losebird/iui'
/** Source kind persisted by this plugin in Session format v4. */
export const FEEDBACK_SOURCE_KIND = `plugin:${FEEDBACK_PLUGIN_NAME}` as const

/** Marker prefix inside the correction text: `[genui-fence-repair #<fingerprint>]`. */
const MARKER_PREFIX = '[genui-fence-repair #'
/**
 * 同一个 turn 内 fence-feedback correction 的共享上限。
 * Render failure 和 nothing-delivered reminder 共用该 budget；各自的 ledger 独立阻止重复修正。
 */
export const MAX_CORRECTIONS_PER_TURN = 1

/** Marker prefix written by older plugin versions. */
const LEGACY_MARKER_PREFIX = '[genui 自修 #'

/** A fence opener is an info string of exactly `dsh-ui` (≤3 spaces indent). */
const FENCE_OPEN = /^ {0,3}```[ \t]*(iui-html|iui-patch|iui|dsh-ui)[ \t]*$/u
/** Any fence closer (the renderer never nests fences in one body). */
const FENCE_CLOSE = /^ {0,3}```[ \t]*$/u
/** Upper bound on fences inspected per reply — a reply is text, not a corpus. */
const MAX_FENCES = 40

/** One ```dsh-ui fence found in an assistant reply. */
export interface ExtractedFence {
  /** Raw body between the fences (no delimiters). */
  readonly raw: string
  /** False when the reply ended before the closing fence. */
  readonly closed: boolean
  /** 1-based position among this reply's fences. */
  readonly index: number
  /** Info string of the opener. */
  readonly lang?: 'iui-html' | 'iui-patch' | 'iui' | 'dsh-ui'
}

/**
 * F16: deprecated ```iui / ```dsh-ui fences. Off by default — the browser
 * shows them as code, so the referee must not count them as delivered pages.
 */
let legacyFencesEnabled = false

export function setLegacyFencesEnabled(enabled: boolean): void {
  legacyFencesEnabled = enabled
}

export function isLegacyFencesEnabled(): boolean {
  return legacyFencesEnabled
}

/**
 * Extract every ```dsh-ui fence from one assistant reply.
 *
 * @param text - the assistant message text.
 * @returns the fences in document order (at most {@link MAX_FENCES}).
 */
export function extractDshUiFences(text: string): ExtractedFence[] {
  const lines = text.split('\n')
  const fences: ExtractedFence[] = []
  let open: { start: number; index: number; lang: 'iui-html' | 'iui-patch' | 'iui' | 'dsh-ui' } | null = null
  for (let line = 0; line < lines.length; line++) {
    const current = lines[line] ?? ''
    if (open === null) {
      const m = FENCE_OPEN.exec(current)
      if (m !== null) open = { start: line + 1, index: fences.length + 1, lang: m[1] as 'iui-html' | 'iui-patch' | 'iui' | 'dsh-ui' }
      continue
    }
    if (!FENCE_CLOSE.test(current)) continue
    fences.push({ raw: lines.slice(open.start, line).join('\n'), closed: true, index: open.index, lang: open.lang })
    open = null
    if (fences.length >= MAX_FENCES) return fences
  }
  if (open !== null && fences.length < MAX_FENCES) {
    fences.push({ raw: lines.slice(open.start).join('\n'), closed: false, index: open.index, lang: open.lang })
  }
  return fences
}

/** Stable, log-safe identity of one fence body (same body → same fingerprint). */
export function fenceFingerprint(raw: string): string {
  return createHash('sha256').update(raw.trim()).digest('hex').slice(0, 12)
}

/** One fence the guard refuses to render, with its model-facing reason. */
export interface FenceFailure {
  readonly index: number
  readonly fingerprint: string
  /** Actionable diagnosis, in the same wording the validator tool uses. */
  readonly detail: string
}

/**
 * Validate every fence in a reply the way the DOM channel would render it.
 *
 * @param text - the assistant message text.
 * @returns the fences that would stay a raw code block, in document order.
 */
export function fenceFailures(text: string): FenceFailure[] {
  const failures: FenceFailure[] = []
  for (const fence of extractDshUiFences(text)) {
    const detail = fenceFailureDetail(fence)
    if (detail !== null) failures.push({ index: fence.index, fingerprint: fenceFingerprint(fence.raw), detail })
  }
  return failures
}

/** `null` when this fence renders; otherwise the reason it does not. */
function fenceFailureDetail(fence: ExtractedFence): string | null {
  if (!fence.closed) return 'error=unterminated_fence\nrequired=closing_fence'
  if (!legacyFencesEnabled && (fence.lang === 'iui' || fence.lang === 'dsh-ui')) {
    return `error=deprecated_fence_language\nlanguage=${fence.lang}\nrequired=\`\`\`iui-html (same body; the browser shows \`\`\`${fence.lang} as plain code)`
  }
  if (fence.lang === 'iui-patch') return patchFailureDetail(fence.raw)
  try { if (parseHtmlSandboxFence(fence.raw) !== null) return null } catch { /* fall through */ }
  const resolution = resolveFence(fence.raw, { settled: true })
  if (resolution.spec !== null) return null
  if (resolution.processed !== null) {
    const dropped = droppedNodeFailure(resolution.processed, resolution.value)
    return dropped?.join('\n')
      ?? ['error=invalid_spec', ...resolution.processed.errors.map(error => `diagnostic=${JSON.stringify(error)}`)].join('\n')
  }
  return 'error=invalid_json\nrepair=failed'
}

/** F24: a patch is valid when it parses into edits (applying needs the page, checked in the browser). */
function patchFailureDetail(raw: string): string | null {
  const patch = parseSandboxPatch(raw)
  if (patch === null) return 'error=empty_patch\nrequired=---css | ---replace #sel | ---append #sel | ---remove #sel | ---find + ---with | ---js blocks'
  if (patch.errors.length > 0) return ['error=invalid_patch', ...patch.errors.map((e) => `diagnostic=${JSON.stringify(e)}`)].join('\n')
  return null
}

/**
 * Build the correction input for a reply with unrenderable fences.
 *
 * @param failures - fences {@link fenceFailures} rejected.
 * @returns the message text to steer into the running turn.
 */
export function fenceCorrectionText(failures: readonly FenceFailure[]): string {
  const body = failures
    .map(failure => `fence=${failure.index}\nfingerprint=${failure.fingerprint}\n${failure.detail}`)
    .join('\n\n')
  const marker = failures.map(failure => `${MARKER_PREFIX}${failure.fingerprint}]`).join(' ')
  return `${marker}\n\n[genui-fence-repair]\nstatus=render_failed\nfences=${failures.length}\nnext=resend_corrected_fence_only\nrepeat_rendered_content=false\nreply_language=conversation\n\n${body}\n`
}

/**
 * Create the identified user-role message this loop steers.
 *
 * Mirrors `createUserMessage` from `@deepseek-ai/dsh-llm` (id + role + frozen)
 * without a runtime dependency on that package: the node half of this plugin
 * deliberately imports no `@deepseek-ai/*` values, so a linked or npm-installed
 * copy resolves identically on every host.
 *
 * @param text - the correction text.
 * @param sessionFormatVersion - the format recorded by the active session.
 * @returns a frozen user message attributed to this plugin as a notice.
 */
export function createFeedbackMessage(text: string, sessionFormatVersion: number): UserMessage {
  const source = sessionFormatVersion >= 4
    ? {
        kind: FEEDBACK_SOURCE_KIND,
        form: 'notice' as const,
        summary: 'genui fence repair requested',
      }
    : {
        kind: 'plugin' as const,
        plugin: FEEDBACK_PLUGIN_NAME,
        form: 'notice' as const,
        summary: 'genui fence repair requested',
      }
  const message = {
    id: randomUUID(),
    role: 'user',
    content: [{ type: 'text', text }],
    source,
  }
  Object.freeze(message.content)
  return Object.freeze(message) as unknown as UserMessage
}

/** Per-session bookkeeping for the loop (process lifetime). */
interface SessionFeedback {
  /** Latest assistant reply text of the current turn (fences are read from here). */
  text: string
  /** Latest direct user ask text for this turn (format referee). */
  lastUserAsk: string
  /** Cached format-router intent id for this turn (from rules or optional Jev). */
  routedFormatId: string | null
  /** Where the cached route came from. */
  routedSource: 'rules' | 'jev' | 'jev_fallback_rules' | null
  /**
   * After the user aborts a must-fence turn without a valid fence, remind on
   * the next turn's first pre-step (once). Cleared after injection.
   */
  pendingNextTurnReminder: string | null
  /** D1: design-lint note from the last delivered page (next UI turn only, never a steer). */
  pendingDesignNote: string | null
  /** Fence fingerprints already design-linted (one note per page body). */
  designLinted: Set<string>
  /** Fence-first prime already injected this turn. */
  primedThisTurn: boolean
  /** Mid-turn fence nudge already injected (step>0, still no fence). */
  midNudgedThisTurn: boolean
  /** Model called tools (bash/search/…) before emitting a valid fence. */
  toolsBeforeFence: boolean
  /** Queue aggressive abort nudge after tools-before-fence (consumed once). */
  pendingToolAbortNudge: boolean
  /** Host llm/stream sentinel: first non-ws assistant text was not ```iui. */
  firstTokenViolation: boolean
  /** Sample of the violating prefix (for steer text). */
  firstTokenSample: string
  /**
   * A `validate_dsh_ui` call happened in this turn. This is the FORMAL signal
   * that the turn is GenUI-related — the loop never guesses intent by scanning
   * the reasoning block.
   */
  validatedThisTurn: boolean
  /** validate_dsh_ui returned status=valid / next=emit_* this turn — stop further steers. */
  validatedOkThisTurn: boolean
  /** Outstanding validate_dsh_ui callIds waiting for tool/result. */
  pendingValidates: Set<string>
  /** callId → tool name for binding ingest on tool/result. */
  pendingToolNames: Map<string, string>
  /** 子代理会话的输出不会直接交给用户。 */
  isSubagent: boolean
  /**
   * The turn delivered something formal: a non-empty body text, or a
   * `render_ui` call whose RESULT reports success. A failed render is not an
   * answer, and a call whose result has not arrived yet proves nothing.
   */
  deliveredThisTurn: boolean
  /**
   * `render_ui` calls of this turn whose result has not arrived yet. The
   * result — not the call — decides delivery, so an outstanding call blocks
   * steering at the boundary instead of being guessed about.
   */
  pendingRenders: Set<string>
  /** Fence fingerprints already corrected for a RENDER failure in the current turn. */
  correctedSpec: Set<string>
  /**
   * Turns already given the "nothing was delivered" reminder. Kept separate from
   * {@link correctedSpec}: a missing delivery must not consume the render-failure
   * ledger (nor the other way round).
   */
  deliveryRemindedTurns: Set<number>
  /** Format-referee steers already sent in {@link correctionsTurn}. */
  formatCorrectionsThisTurn: number
  /** Corrections already steered in {@link correctionsTurn}. */
  correctionsThisTurn: number
  /** Turn {@link correctionsThisTurn} counts. */
  correctionsTurn: number | undefined
  /** 从 session event 中恢复的当前 turn。 */
  currentTurn: number | undefined
  /** 已计入 correction budget 的 message ID。 */
  accountedCorrectionMessageIds: Set<string>
}

/** What the pure planner needs to decide whether a correction may be sent. */
export interface FenceFeedbackPlanInput {
  /** Latest assistant reply text of the current turn. */
  readonly text: string
  readonly turn: number
  /** Fence bodies already corrected for a render failure in the current turn. */
  readonly correctedSpec: ReadonlySet<string>
  /** Turns already given the delivery reminder. */
  readonly deliveryRemindedTurns?: ReadonlySet<number> | undefined
  /** A `validate_dsh_ui` call happened this turn (formal GenUI signal). */
  readonly validatedThisTurn?: boolean | undefined
  /** validate_dsh_ui already returned a successful emit verdict this turn. */
  readonly validatedOkThisTurn?: boolean | undefined
  /** The turn already delivered a body or a successful `render_ui` result. */
  readonly deliveredThisTurn?: boolean | undefined
  readonly aborted: boolean
  /** Corrections already steered in this turn (shared hard cap). */
  readonly correctionsThisTurn?: number | undefined
  /** Turn {@link correctionsThisTurn} counts (stale counts are ignored). */
  readonly correctionsTurn?: number | undefined
}

/** A correction the caller must account for before steering. */
export interface FenceFeedbackPlan {
  readonly text: string
  readonly fingerprints: readonly string[]
  readonly turn: number
  /**
   * `render` corrects a fence that failed to resolve; `delivery` reminds the
   * model that the turn produced nothing formal. They share the per-turn budget
   * but keep separate ledgers.
   */
  readonly kind: 'render' | 'delivery'
}

/**
 * Decide whether this turn boundary should steer a correction — the pure core of
 * the loop, so every bound (per-turn cap, per-fence ledger, cancellation) is
 * testable without a host.
 *
 * The decision is driven by FORMAL events only: fences in the reply body, a
 * `validate_dsh_ui` call, a delivered body text or a successful `render_ui`
 * result. The reasoning block is
 * never read here — a draft inside the thinking block is not proof that the model
 * chose to deliver it, so it must not change any decision.
 *
 * @param input - reply text, turn identity, formal signals, and the accounting.
 * @returns the correction to send, or null when the loop must stay silent.
 */
export function planFenceFeedback(input: FenceFeedbackPlanInput): FenceFeedbackPlan | null {
  if (input.aborted) return null
  // Successful validate already told the model to emit — do not steer again.
  if (input.validatedOkThisTurn === true) return null
  const used = input.correctionsTurn === input.turn ? (input.correctionsThisTurn ?? 0) : 0
  if (used >= MAX_CORRECTIONS_PER_TURN) return null
  const failures = fenceFailures(input.text).filter(failure => !input.correctedSpec.has(failure.fingerprint))
  if (failures.length > 0) {
    return {
      text: fenceCorrectionText(failures),
      fingerprints: failures.map(failure => failure.fingerprint),
      turn: input.turn,
      kind: 'render',
    }
  }
  // No un-corrected render failure. If the turn formally validated a spec and
  // then delivered nothing, remind the model once for this turn.
  if (input.validatedThisTurn !== true || input.deliveredThisTurn === true) return null
  if (input.deliveryRemindedTurns?.has(input.turn) === true) return null
  return { text: missingBodyCorrectionText(input.turn, used + 1), fingerprints: [], turn: input.turn, kind: 'delivery' }
}

/**
 * Correction for a validated GenUI turn that reached the boundary without any
 * formal delivery.
 *
 * @param turn - turn that reached the boundary.
 * @param attempt - correction number within the shared turn budget.
 * @returns the message text to steer into the running turn.
 */
export function missingBodyCorrectionText(turn: number, attempt = 1): string {
  const head = `${MARKER_PREFIX}turn-${turn}]\n\n[genui-fence-repair]\nstatus=nothing_delivered\nfences=0\nnext=emit_fence_in_body\nrepeat_rendered_content=false\nno_more_bash=true\nno_more_validate=true\nreply_language=conversation\n\n`
  const emphasis = attempt <= 1 ? '' : `（第 ${attempt} 次提醒）`
  return `${head}本轮尚未产生正式回答，也没有通过支持的通道交付结果${emphasis}。请立刻在回答正文输出最终的 iui-html 沙箱围栏（占位数字可用）。不要再跑 bash 采集同一批指标，也不要再调用 validate_dsh_ui。不能完成时，请在正文说明原因。\n`
}

/**
 * 将 GenUI 回合中仅含 reasoning 的完整响应转换为宿主已有的可重试空响应错误。
 *
 * @param options - LLM stream waterfall 拦截的请求。
 * @param source - 本次请求的 provider stream。
 * @returns 原始 stream；仅符合条件的终止 stop 会被改写。
 */
/**
 * Formerly rewrote reasoning-only stops after validate_dsh_ui into EMPTY_RESPONSE,
 * which kicked the host's 1/5 retry storm (re-bash + re-validate). Pass through.
 */
async function* retryReasoningOnlyGenuiStream(
  _options: GenerateOptions,
  source: AsyncIterable<StreamChunk>,
): AsyncGenerator<StreamChunk> {
  yield* source
}

/**
 * Host-side first-token enforcement within dsh plugin APIs:
 * watch assistant text-delta; if the first non-whitespace chars are not a fence
 * opener on a must_fence turn, mark SessionFeedback.firstTokenViolation.
 * Cannot force constrained decoding — turn-stopping steers a same-turn repair.
 */
async function* watchFirstTokenFenceStream(
  _options: GenerateOptions,
  source: AsyncIterable<StreamChunk>,
  state: SessionFeedback,
  intentId: string,
  ctx: Context,
): AsyncGenerator<StreamChunk> {
  let prefix = ''
  let decided = state.firstTokenViolation
  for await (const chunk of source) {
    if (!decided && chunk.type === 'text-delta' && typeof chunk.text === 'string') {
      prefix += chunk.text
      const trimmed = prefix.replace(/^\s+/u, '')
      const policy = getStreamHeuristics()
      if (trimmed.length >= policy.firstTokenDecideAfter) {
        decided = true
        const bad = matchesForbiddenFirstPrefix(trimmed, policy) || !fenceFirstRegex(policy).test(trimmed)
        if (bad) {
          state.firstTokenViolation = true
          state.firstTokenSample = trimmed.slice(0, 48)
          const masquerade = looksLikeJsonMasqueradeOpen(trimmed)
          recordFenceOp(
            masquerade ? 'json_masquerade' : 'first_token_violation',
            `${intentId}:${state.firstTokenSample}`,
          )
          ctx.logger?.info?.(
            `iui: host first-token violation intent=${intentId} sample=${JSON.stringify(state.firstTokenSample)}`,
          )
        }
      }
    }
    yield chunk
  }
}

/** Text of one message's textual blocks, in order. */
function textOfContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .map(block => {
      if (typeof block === 'string') return block
      if (typeof block !== 'object' || block === null) return ''
      const record = block as { type?: unknown; text?: unknown; content?: unknown }
      if (typeof record.text === 'string' && (record.type === 'text' || record.type === 'markdown' || record.type === undefined)) {
        return record.text
      }
      if (typeof record.content === 'string' && (record.type === 'text' || record.type === 'markdown')) {
        return record.content
      }
      return ''
    })
    .filter(part => part !== '')
    .join('\n')
}

/** Latest direct human ask from a live session snapshot (fallback when state.lastUserAsk is empty). */
/** F24: rebuild the current page (and its version) from the transcript. */
export function pageMemoryFromSession(session: Session): PageMemory {
  const memory = createPageMemory()
  const snap = typeof session.snapshotEvents === 'function' ? session.snapshotEvents() : null
  if (snap == null) return memory
  for (const event of snap) {
    if (event.type === 'user/message') {
      const data = event.data as { source?: { kind?: unknown; plugin?: unknown } }
      if (isFeedbackSource(data.source)) continue
      if (data.source?.kind !== undefined && data.source.kind !== 'user') continue
      memory.asksSinceLatest++
      continue
    }
    if (event.type !== 'assistant/message') continue
    const text = textOfContent((event.data as { message?: { content?: unknown } }).message?.content)
    if (text.includes('```')) trackPageFences(memory, extractDshUiFences(text))
  }
  return memory
}

/**
 * F24: the `[iui-current-page]` note for an edit ask about the page still on
 * screen (latest page delivered within the last two asks), else `null`.
 */
export function currentPageNoteFor(session: Session, ask: string): string | null {
  if (!looksLikePageEditAsk(ask)) return null
  const memory = pageMemoryFromSession(session)
  const entry = currentPage(memory)
  // The current ask is already in the transcript → it counts as 1.
  if (entry === null || memory.asksSinceLatest > 2) return null
  return currentPageNote(entry)
}

function latestUserAskFromSession(session: Session): string {
  const snap = typeof session.snapshotEvents === 'function' ? session.snapshotEvents() : null
  if (snap == null) return ''
  let ask = ''
  for (const event of snap) {
    if (event.type !== 'user/message') continue
    const data = event.data as { content?: unknown; source?: { kind?: unknown; plugin?: unknown } }
    if (isFeedbackSource(data.source)) continue
    if (data.source?.kind !== undefined && data.source.kind !== 'user') continue
    const text = textOfContent(data.content).trim()
    if (text !== '') ask = text
  }
  return ask
}


/** True when validate_dsh_ui result says the spec is ready to emit. */
function validateResultSucceeded(content: unknown): boolean {
  const text = textOfContent(content)
  if (!text.includes('[genui-validation]')) return false
  if (/^status=valid$/mu.test(text)) return true
  if (/^next=emit_fence$/mu.test(text)) return true
  if (/^next=emit_repaired_fence$/mu.test(text)) return true
  return false
}

type RenderResultStatus = 'rendered' | 'invalid'

/** 读取 render_ui result protocol 中明确返回的 status。 */
function renderResultStatus(content: unknown): RenderResultStatus | undefined {
  const lines = textOfContent(content).split(/\r?\n/u)
  if (lines[0]?.trim() !== '[genui-render]') return undefined
  for (const line of lines.slice(1)) {
    if (line === 'status=rendered') return 'rendered'
    if (line === 'status=invalid') return 'invalid'
  }
  return undefined
}

interface ObservedToolResult {
  readonly callId: string
  readonly isError: boolean
  readonly content: unknown
}

/** 从 legacy wrapper 与 Session format v4 中提取 tool result 数据。 */
function observedToolResult(message: unknown): ObservedToolResult | null {
  if (typeof message !== 'object' || message === null) return null
  const record = message as { toolCallId?: unknown; isError?: unknown; content?: unknown }
  if (typeof record.toolCallId === 'string') {
    return { callId: record.toolCallId, isError: record.isError === true, content: record.content }
  }
  if (!Array.isArray(record.content)) return null
  const block = record.content.find(part => typeof part === 'object' && part !== null
    && (part as { type?: unknown }).type === 'tool-result') as {
      toolCallId?: unknown
      isError?: unknown
      content?: unknown
    } | undefined
  if (typeof block?.toolCallId !== 'string') return null
  return { callId: block.toolCallId, isError: block.isError === true, content: block.content }
}

/** Tool whose SUCCESSFUL result is a formal delivery. */
const DELIVERY_TOOL = 'render_ui'

/**
 * Whether one assistant message delivered a non-empty body text.
 *
 * Deliberately narrow: a non-empty text block. A `render_ui` call is decided
 * by its `tool/result`, not by the call appearing in a message — a call that
 * failed (or whose result has not arrived) is not a delivery. Other tools
 * (validate_dsh_ui, bash, …) may succeed without producing any answer, so
 * they are NOT counted as delivery.
 *
 * @param content - assistant content blocks.
 * @returns true when this message delivered a body text.
 */
function deliveredBodyText(content: unknown): boolean {
  if (!Array.isArray(content)) return false
  return content.some(block => {
    if (typeof block !== 'object' || block === null) return false
    const record = block as { type?: unknown; text?: unknown }
    return record.type === 'text' && typeof record.text === 'string' && record.text.trim() !== ''
  })
}


interface FeedbackMarkers {
  readonly renderFingerprints: string[]
  readonly deliveryTurns: number[]
}

/** 分类当前与 legacy correction message 中的 marker。 */
function feedbackMarkersIn(text: string): FeedbackMarkers {
  const renderFingerprints: string[] = []
  const deliveryTurns: number[] = []
  let cursor = 0
  while (cursor < text.length) {
    const current = text.indexOf(MARKER_PREFIX, cursor)
    const legacy = text.indexOf(LEGACY_MARKER_PREFIX, cursor)
    if (current < 0 && legacy < 0) break
    const useLegacy = legacy >= 0 && (current < 0 || legacy < current)
    const prefix = useLegacy ? LEGACY_MARKER_PREFIX : MARKER_PREFIX
    const index = useLegacy ? legacy : current
    const end = text.indexOf(']', index + prefix.length)
    if (end < 0) break
    const marker = text.slice(index + prefix.length, end)
    const turn = /^turn-(\d+)$/u.exec(marker)
    if (turn !== null) deliveryTurns.push(Number(turn[1]))
    else renderFingerprints.push(marker)
    cursor = end + 1
  }
  return { renderFingerprints, deliveryTurns }
}

/** 恢复一条持久化 correction 消耗的 turn budget。 */
function accountReplayedCorrection(state: SessionFeedback, turn: number): void {
  if (state.correctionsTurn !== turn) {
    state.correctionsTurn = turn
    state.correctionsThisTurn = 1
    return
  }
  state.correctionsThisTurn = Math.min(MAX_CORRECTIONS_PER_TURN, state.correctionsThisTurn + 1)
}

/** Identify this plugin's source across current and migrated session shapes. */
function isFeedbackSource(source: { kind?: unknown; plugin?: unknown } | undefined): boolean {
  return source?.kind === FEEDBACK_SOURCE_KIND
    || (source?.kind === 'plugin' && source.plugin === FEEDBACK_PLUGIN_NAME)
}

/**
 * 注册 GenUI 回合跟踪、宿主重试判定和可选的围栏修正流程。
 *
 * @param ctx - 宿主 Context。
 * @param enabled - 是否启用同回合围栏修正。
 */
/** Live options for fence repair + format referee (mutable; Settings can flip). */
export interface FenceFeedbackOptions {
  fenceFeedback: boolean
  formatReferee: boolean
  /** Live format-router config (optional Jev). Called each route; must not throw. */
  getFormatRouterConfig?: () => FormatRouterConfig
}

/**
 * D1: lint every closed iui-html fence of a delivered reply once and keep a
 * short note for the next UI turn. Never steers the current turn.
 */
export function queueDesignNote(
  state: { text: string; pendingDesignNote: string | null; designLinted: Set<string> },
  logger?: { info?: (msg: string) => void },
): string | null {
  const issues: DesignIssue[] = []
  for (const fence of extractDshUiFences(state.text)) {
    if (!fence.closed) continue
    const fp = fenceFingerprint(fence.raw)
    if (state.designLinted.has(fp)) continue
    state.designLinted.add(fp)
    if (state.designLinted.size > 64) state.designLinted.delete(state.designLinted.values().next().value!)
    if (fence.lang === 'iui-patch') continue
    const spec = parseHtmlSandboxFence(fence.raw)
    if (spec === null) continue
    issues.push(...lintSandboxDesign({ html: spec.html, css: spec.css }))
  }
  if (issues.length === 0) return null
  const note = designLintNote(issues)
  state.pendingDesignNote = note
  recordFenceOp('design_lint', [...new Set(issues.map((i) => i.kind))].join(','))
  logger?.info?.(`iui: design lint queued ${issues.length} issue(s) for next UI turn`)
  return note
}

export function installFenceFeedback(
  ctx: Context,
  options: FenceFeedbackOptions | boolean,
): void {
  const opts: FenceFeedbackOptions = typeof options === 'boolean'
    ? { fenceFeedback: options, formatReferee: options }
    : options

  const routerConfig = (): FormatRouterConfig => {
    try {
      return opts.getFormatRouterConfig?.() ?? {}
    } catch {
      return {}
    }
  }

  /** Prefer turn-cached format route (rules or optional Jev); else sync rules. */
  const resolveAskRule = (ask: string, state: SessionFeedback) => {
    // First principles: the host only enforces when a page was explicitly asked for.
    if (!isExplicitUiAsk(ask)) return null
    if (state.routedFormatId === 'none') return null
    if (state.routedFormatId) {
      const byId = getIntentRule(state.routedFormatId)
      if (byId !== undefined) return byId
    }
    return classifyAsk(ask)
  }

  const sessions = new Map<string, SessionFeedback>()
  const stateOf = (sessionId: string): SessionFeedback => {
    let state = sessions.get(sessionId)
    if (state === undefined) {
      state = {
        text: '',
        lastUserAsk: '',
        routedFormatId: null,
        routedSource: null,
        pendingNextTurnReminder: null,
        pendingDesignNote: null,
        designLinted: new Set(),
        primedThisTurn: false,
        midNudgedThisTurn: false,
        toolsBeforeFence: false,
        pendingToolAbortNudge: false,
        firstTokenViolation: false,
        firstTokenSample: '',
        validatedThisTurn: false,
        validatedOkThisTurn: false,
        isSubagent: false,
        deliveredThisTurn: false,
        pendingRenders: new Set(),
        pendingValidates: new Set(),
        pendingToolNames: new Map(),
        correctedSpec: new Set(),
        deliveryRemindedTurns: new Set(),
        formatCorrectionsThisTurn: 0,
        correctionsThisTurn: 0,
        correctionsTurn: undefined,
        currentTurn: undefined,
        accountedCorrectionMessageIds: new Set(),
      }
      sessions.set(sessionId, state)
    }
    return state
  }

  ctx.on('session/disposed', (session): void => {
    sessions.delete(String(session.id))
  })

  const resetTurnState = (state: SessionFeedback, turn: number | undefined): void => {
    state.text = ''
    state.validatedThisTurn = false
    state.validatedOkThisTurn = false
    state.deliveredThisTurn = false
    state.primedThisTurn = false
    state.midNudgedThisTurn = false
    state.toolsBeforeFence = false
    state.pendingToolAbortNudge = false
    state.firstTokenViolation = false
    state.firstTokenSample = ''
    state.routedFormatId = null
    state.routedSource = null
    state.pendingRenders.clear()
    state.pendingValidates.clear()
    state.pendingToolNames.clear()
    state.currentTurn = turn
  }

  const observeEvent = (session: Session, event: SessionEvent): void => {
    const sessionId = String(session.id)
    if (event.type === 'turn/start') {
      // The formal turn boundary: whatever happened in the previous turn is
      // settled and this turn starts clean. The `user/message` reset below is
      // only a fallback for direct prompts.
      const state = stateOf(sessionId)
      state.isSubagent = session.header.parentSession !== undefined
      // 去重只约束当前回合，新一轮仍可修正相同错误。
      state.correctedSpec.clear()
      const nextTurn = (event.data as { turn?: number }).turn
      if (state.correctionsTurn !== nextTurn) {
        state.formatCorrectionsThisTurn = 0
      }
      resetTurnState(state, nextTurn)
      return
    }
    if (event.type === 'assistant/message') {
      const content = (event.data as { message?: { content?: unknown } }).message?.content
      const text = textOfContent(content)
      const state = stateOf(sessionId)
      state.isSubagent = session.header.parentSession !== undefined
      // Keep the full body for format-referee (Markdown-as-UI detection).
      // Fence repair still reads fences from this same text.
      state.text = text
      // Delivery is sticky for the turn: once a body text exists, the turn has
      // answered and must never be corrected into publishing again. A
      // `render_ui` call in the content proves nothing here — its result does.
      state.deliveredThisTurn = state.deliveredThisTurn || deliveredBodyText(content)
      // A closed parseable ```iui fence counts as formal delivery — stop steers.
      if (replyHasValidFence(text)) state.deliveredThisTurn = true
      return
    }
    if (event.type === 'tool/call') {
      const data = event.data as { name?: unknown; callId?: unknown }
      const state = stateOf(sessionId)
      state.isSubagent = session.header.parentSession !== undefined
      // Weak models often bash/search BEFORE the fence — flag for mid-nudge (policy-driven).
      const toolName = typeof data.name === 'string' ? data.name : ''
      if (!replyHasValidFence(state.text) && (toolName === '' || isToolBeforeFenceName(toolName))) {
        const ask = state.lastUserAsk.trim()
        if (ask !== '') {
          const rule = resolveAskRule(ask, state)
          if (rule !== null && rule.mode === 'must_fence') {
            state.toolsBeforeFence = true
            state.pendingToolAbortNudge = true
          }
        }
      }
      // validate_dsh_ui is the FORMAL signal that this turn is GenUI-related.
      if (data.name === 'validate_dsh_ui') {
        state.validatedThisTurn = true
        if (typeof data.callId === 'string') state.pendingValidates.add(data.callId)
      }
      // The result — not the call — decides whether render_ui delivered.
      if (data.name === DELIVERY_TOOL && typeof data.callId === 'string') {
        state.pendingRenders.add(data.callId)
      }
      if (typeof data.callId === 'string' && typeof data.name === 'string') {
        state.pendingToolNames.set(data.callId, data.name)
      }
      return
    }
    if (event.type === 'tool/result') {
      const data = event.data as { message?: unknown; error?: unknown; name?: unknown }
      const result = observedToolResult(data.message)
      if (result === null) return
      const state = stateOf(sessionId)
      state.isSubagent = session.header.parentSession !== undefined
      // Tool→UI data binding: parse metrics/JSON into `$bind:id` map for the client.
      try {
        const toolName = typeof data.name === 'string'
          ? data.name
          : state.pendingToolNames.get(result.callId)
        const content = typeof result.content === 'string'
          ? result.content
          : Array.isArray(result.content)
            ? result.content.map((part) => {
                if (typeof part === 'string') return part
                if (part && typeof part === 'object' && 'text' in part) return String((part as { text?: unknown }).text ?? '')
                return ''
              }).join('\n')
            : JSON.stringify(result.content ?? '')
        if (content.trim() !== '') {
          ingestToolResultBindings(String(sessionId), content, toolName, result.callId)
        }
      } catch {
        /* binding parse must never break the fence loop */
      }
      state.pendingToolNames.delete(result.callId)
      if (state.pendingValidates.delete(result.callId)) {
        if (data.error === undefined && result.isError !== true && validateResultSucceeded(result.content)) {
          state.validatedOkThisTurn = true
        }
      }
      if (!state.pendingRenders.delete(result.callId)) return
      if (data.error === undefined && result.isError !== true && renderResultStatus(result.content) === 'rendered') {
        state.deliveredThisTurn = true
      }
      return
    }
    if (event.type !== 'user/message') return
    const data = event.data as { id?: unknown; content?: unknown; source?: { kind?: unknown; plugin?: unknown } }
    if (isFeedbackSource(data.source)) {
      const body = textOfContent(data.content)
      const markers = feedbackMarkersIn(body)
      const formatMarks = formatMarkersIn(body)
      if (markers.renderFingerprints.length === 0 && markers.deliveryTurns.length === 0 && formatMarks.intentIds.length === 0) return
      const state = stateOf(sessionId)
      state.isSubagent = session.header.parentSession !== undefined
      for (const fingerprint of markers.renderFingerprints) state.correctedSpec.add(fingerprint)
      for (const turn of markers.deliveryTurns) state.deliveryRemindedTurns.add(turn)
      if (formatMarks.intentIds.length > 0) {
        if (state.correctionsTurn === state.currentTurn) {
          state.formatCorrectionsThisTurn = Math.min(
            MAX_CORRECTIONS_PER_TURN,
            Math.max(state.formatCorrectionsThisTurn, 1),
          )
        }
      }
      if (typeof data.id === 'string' && !state.accountedCorrectionMessageIds.has(data.id)) {
        state.accountedCorrectionMessageIds.add(data.id)
        const turn = markers.deliveryTurns[0] ?? state.currentTurn
        if (turn !== undefined) accountReplayedCorrection(state, turn)
      }
      return
    }
    // A DIRECT human prompt starts a new turn: the previous reply is settled.
    // Synthetic context that rides the same user surface — `agent.inject()`
    // notices, team member messages — carries a different source kind and
    // arrives MID-TURN: resetting here used to wipe the turn's validation and
    // delivery state before the boundary could use it.
    if (data.source?.kind !== 'user') return
    const state = stateOf(sessionId)
    state.isSubagent = session.header.parentSession !== undefined
    state.lastUserAsk = textOfContent(data.content)
    state.routedFormatId = null
    state.routedSource = null
    // turn/start 先于用户消息；清掉正文状态时保留正式回合身份与 ask。
    resetTurnState(state, state.currentTurn)
  }

  const restoreHistory = (session: Session): void => {
    if (sessions.has(String(session.id))) return
    for (const event of session.snapshotEvents()) observeEvent(session, event)
  }
  ctx.on('session/event', (session, event) => {
    // 服务注入是异步的；首条实时事件也先接管历史，避免丢失旧纠错次数。
    restoreHistory(session)
    observeEvent(session, event)
  })
  ctx.on('session/created', restoreHistory)
  const restoreSessions = (sessionCtx: Context): void => {
    const store = sessionCtx.reflect.get('sessions') as SessionStore | undefined
    if (store === undefined) return
    for (const session of store.list()) restoreHistory(session)
  }
  // 宿主不重播历史；安装时同步接管已有会话，异步注入负责晚到的服务。
  restoreSessions(ctx)
  ctx.inject(['sessions'], restoreSessions)

  ctx.on('llm/stream', (options, next) => {
    if (options.sessionId === undefined || options.purpose !== undefined) return next()
    const state = sessions.get(String(options.sessionId))
    if (state === undefined || state.isSubagent) return next()
    // Host-side first-token sentinel (must_fence): dsh has no constrained
    // decoding / forced-prefix API — watch text-delta and flag violations early.
    const ask = state.lastUserAsk.trim()
    const rule = ask !== '' ? resolveAskRule(ask, state) : null
    const watchFirst = opts.formatReferee && rule !== null && rule.mode === 'must_fence'
    if (!watchFirst && state.validatedThisTurn !== true) return next()
    if (!watchFirst) return retryReasoningOnlyGenuiStream(options, next())
    return watchFirstTokenFenceStream(options, next(), state, rule!.id, ctx)
  }, { global: true })

  // Next-turn reminder + same-turn fence-first prime + mid-turn nudge for weak models.
  ctx.on('agent/pre-step', async ({ agent, turn, step, signal }, next) => {
    const decision = await next()
    if (decision.kind !== 'enter') return decision
    if (!opts.formatReferee || signal.aborted) return decision
    if (agent.session.header.parentSession !== undefined) return decision
    const state = sessions.get(String(agent.session.id))
    if (state === undefined) return decision
    const extras: ReturnType<typeof createFeedbackMessage>[] = []

    if (step === 0) {
      const reminder = state.pendingNextTurnReminder
      const askNow = state.lastUserAsk.trim() !== ''
        ? state.lastUserAsk
        : latestUserAskFromSession(agent.session)
      // A reminder from the previous ask only applies if THIS ask also wants a page.
      const reminderApplies = reminder !== null && reminder !== undefined && isExplicitUiAsk(askNow)
      if (!reminderApplies) state.pendingNextTurnReminder = null
      const designNote = state.pendingDesignNote
      if (designNote !== null && isExplicitUiAsk(askNow)) {
        extras.push(createFeedbackMessage(designNote, agent.session.header.version))
        ctx.logger?.info?.(`iui: injecting design-lint note turn=${turn}`)
      }
      state.pendingDesignNote = null
      const pageNote = askNow.trim() === '' ? null : currentPageNoteFor(agent.session, askNow)
      if (pageNote !== null) {
        extras.push(createFeedbackMessage(pageNote, agent.session.header.version))
        ctx.logger?.info?.(`iui: injecting current-page note turn=${turn} chars=${pageNote.length}`)
      }
      // G6: page-type pattern (map / weather / kanban / 3D …) only when the ask matches.
      const patternNote = askNow.trim() === '' ? null : buildPatternNote(askNow)
      if (patternNote !== null) {
        extras.push(createFeedbackMessage(patternNote, agent.session.header.version))
        ctx.logger?.info?.(`iui: injecting pattern note turn=${turn} chars=${patternNote.length}`)
      }
      if (reminderApplies) {
        state.pendingNextTurnReminder = null
        extras.push(createFeedbackMessage(reminder, agent.session.header.version))
        state.primedThisTurn = true
        ctx.logger?.info?.(`iui: injecting next-turn format reminder turn=${turn}`)
      } else if (!state.primedThisTurn) {
        const ask = state.lastUserAsk.trim() !== ''
          ? state.lastUserAsk
          : latestUserAskFromSession(agent.session)
        if (ask !== '') {
          if (state.lastUserAsk.trim() === '') state.lastUserAsk = ask
          // Optional Jev format route (off without key); always degrades to rules.
          const routed = await routeFormat(ask, routerConfig())
          state.routedFormatId = routed.formatId
          state.routedSource = routed.source
          if (routed.detail) {
            ctx.logger?.info?.(
              `iui: format-router source=${routed.source} format=${routed.formatId} detail=${routed.detail}`,
            )
          } else if (routed.source === 'jev') {
            ctx.logger?.info?.(
              `iui: format-router jev format=${routed.formatId} confidence=${routed.confidence.toFixed(2)}`,
            )
          }
          const rule = isExplicitUiAsk(ask) ? routed.rule : null
          if (rule !== null && rule.mode === 'must_fence') {
            // Contract first (short HARD), then full recipe prime — weak models see FIRST_CHARS first.
            extras.push(createFeedbackMessage(buildFirstTokenContract(rule), agent.session.header.version))
            extras.push(createFeedbackMessage(buildFenceFirstHint(rule), agent.session.header.version))
            state.primedThisTurn = true
            recordFenceOp('prime', rule.id)
            ctx.logger?.info?.(`iui: injecting first-token + fence-first prime intent=${rule.id} turn=${turn} via=${routed.source}`)
          }
        }
      }
    } else if (step >= getStreamHeuristics().midNudgeAfterSteps && step <= 6 && !state.midNudgedThisTurn && !state.validatedOkThisTurn) {
      // Weak models: ignore prime, burn bash/search, apology prose, or Markdown-as-UI.
      // HARD: any must_fence turn without a valid fence by midNudgeAfterSteps gets ONE mid-nudge.
      // Prefer tool-before-fence abort when the model already called tools.
      // Only a real tools-first failure (bash/search/file writes before any
      // fence) earns a mid-turn nudge. Loading the skill or photo tools is the
      // model doing its job — nudging then ("HARD STOP … placeholders OK")
      // fired on every live dsh page turn and rushed the page.
      if (!replyHasValidFence(state.text) && (state.toolsBeforeFence || state.pendingToolAbortNudge)) {
        const ask = state.lastUserAsk.trim() !== ''
          ? state.lastUserAsk
          : latestUserAskFromSession(agent.session)
        if (ask !== '') {
          const rule = resolveAskRule(ask, state)
          if (rule !== null && rule.mode === 'must_fence') {
            const mdFail = replyLooksLikeMarkdownUi(state.text, rule)
            const jsonMasq = replyHasJsonMasquerade(state.text) || looksLikeJsonMasqueradeOpen(state.text)
            const useAbort = state.pendingToolAbortNudge || state.toolsBeforeFence
            const body = useAbort
              ? buildToolBeforeFenceAbort(rule)
              : buildMidTurnFenceNudge(rule)
            extras.push(createFeedbackMessage(body, agent.session.header.version))
            state.midNudgedThisTurn = true
            state.pendingToolAbortNudge = false
            if (useAbort) recordFenceOp('tool_before_fence', rule.id)
            else if (jsonMasq) recordFenceOp('json_masquerade', rule.id)
            else recordFenceOp('mid_nudge', `${rule.id}:md=${mdFail}`)
            ctx.logger?.info?.(
              `iui: injecting ${useAbort ? 'tool-before-fence-abort' : 'mid-turn-fence-nudge'} intent=${rule.id} turn=${turn} step=${step} toolsFirst=${state.toolsBeforeFence} mdFail=${mdFail} jsonMasq=${jsonMasq}`,
            )
          }
        }
      }
    }

    if (extras.length === 0) return decision
    return { kind: 'enter' as const, messages: [...decision.messages, ...extras] }
  }, { global: true })

  ctx.on('agent/turn-stopping', ({ agent, turn, signal }): void => {
    if (!opts.fenceFeedback && !opts.formatReferee) return
    // A child session's fence belongs to a parent reply, and an aborted turn is
    // on its way out: never steer into either.
    if (agent.session.header.parentSession !== undefined) return
    const state = sessions.get(String(agent.session.id))
    if (state === undefined) return
    state.currentTurn = turn
    // Aborted must-fence turn without a valid fence → remind next turn (once).
    if (signal.aborted && opts.formatReferee) {
      const ask = state.lastUserAsk.trim() !== ''
        ? state.lastUserAsk
        : latestUserAskFromSession(agent.session)
      if (ask !== '' && !replyHasValidFence(state.text)) {
        const rule = resolveAskRule(ask, state)
        if (rule !== null && rule.mode === 'must_fence') {
          state.pendingNextTurnReminder = buildNextTurnFormatReminder(rule)
          recordFenceOp('next_turn_reminder', rule.id)
          ctx.logger?.info?.(
            `iui: queued next-turn format reminder intent=${rule.id} after abort`,
          )
        }
      }
      return
    }
    // A render_ui result still outstanding could deliver (or fail) after this
    // boundary fires: steering now would race the late result, so stay silent
    // and let the next boundary decide on settled facts.
    if (state.pendingRenders.size > 0) return
    // Hard stop: valid fence or successful validate → never steer again this turn.
    if (state.validatedOkThisTurn || replyHasValidFence(state.text)) {
      state.deliveredThisTurn = true
      if (opts.formatReferee) queueDesignNote(state, ctx.logger)
      return
    }
    const usedThisTurn = state.correctionsTurn === turn ? state.correctionsThisTurn : 0
    if (usedThisTurn >= MAX_CORRECTIONS_PER_TURN) return
    const formatUsed = state.correctionsTurn === turn ? state.formatCorrectionsThisTurn : 0
    const ask = state.lastUserAsk.trim() !== ''
      ? state.lastUserAsk
      : latestUserAskFromSession(agent.session)
    if (ask !== '' && state.lastUserAsk.trim() === '') state.lastUserAsk = ask

    let steeredText: string | null = null
    let steeredKind: 'render' | 'delivery' | 'format' | null = null

    // Format referee FIRST when the reply has no ```iui fence: must-fence
    // Markdown must not settle. Fence render/delivery repair runs otherwise.
    if (opts.formatReferee) {
      if (state.firstTokenViolation && ask !== '' && !replyHasValidFence(state.text)) {
        const rule = resolveAskRule(ask, state)
        if (rule !== null && rule.mode === 'must_fence') {
          steeredText = buildFirstTokenViolationSteer(rule, state.firstTokenSample)
          steeredKind = 'format'
          ctx.logger?.info?.(
            `iui: first-token violation steering turn=${turn} intent=${rule.id}`,
          )
        }
      }
      if (steeredText === null) {
        const formatPlan = planFormatRefereeCorrection({
          ask,
          reply: state.text,
          turn,
          aborted: signal.aborted,
          correctionsThisTurn: usedThisTurn,
          ...(state.correctionsTurn !== undefined ? { correctionsTurn: state.correctionsTurn } : {}),
          formatCorrectionsThisTurn: formatUsed,
          validatedOkThisTurn: state.validatedOkThisTurn,
        })
        if (formatPlan !== null) {
          steeredText = formatPlan.text
          steeredKind = 'format'
          ctx.logger?.info?.(
            `iui: format referee steering turn=${turn} intent=${formatPlan.intentId} reason=${formatPlan.reason}`,
          )
        }
      }
    }

    if (steeredText === null && opts.fenceFeedback) {
      const plan = planFenceFeedback({
        text: state.text,
        turn,
        correctedSpec: state.correctedSpec,
        deliveryRemindedTurns: state.deliveryRemindedTurns,
        validatedThisTurn: state.validatedThisTurn,
        validatedOkThisTurn: state.validatedOkThisTurn,
        deliveredThisTurn: state.deliveredThisTurn,
        aborted: signal.aborted,
        correctionsThisTurn: usedThisTurn,
        correctionsTurn: state.correctionsTurn,
      })
      if (plan !== null) {
        for (const fingerprint of plan.fingerprints) state.correctedSpec.add(fingerprint)
        if (plan.kind === 'delivery') state.deliveryRemindedTurns.add(plan.turn)
        steeredText = plan.text
        steeredKind = plan.kind
      }
    }

    // If we cannot (or will not) steer this turn but a must-fence ask still
    // has no valid fence, queue a next-turn reminder for weak models.
    if (steeredText === null && opts.formatReferee && ask !== '') {
      if (!replyHasValidFence(state.text)) {
        const rule = resolveAskRule(ask, state)
        if (rule !== null && rule.mode === 'must_fence') {
          state.pendingNextTurnReminder = buildNextTurnFormatReminder(rule)
          ctx.logger?.info?.(
            `iui: queued next-turn format reminder intent=${rule.id} after settle-without-fence`,
          )
        }
      }
      return
    }
    if (steeredText === null) return
    // Account BEFORE sending: a re-entrant boundary must not deliver twice.
    state.correctionsTurn = turn
    state.correctionsThisTurn = usedThisTurn + 1
    if (steeredKind === 'format') {
      recordFenceOp(
        state.firstTokenViolation && looksLikeJsonMasqueradeOpen(state.firstTokenSample || state.text)
          ? 'json_masquerade'
          : 'format_steer',
        ask.slice(0, 48),
      )
      state.formatCorrectionsThisTurn = formatUsed + 1
    } else if (steeredKind === 'render') {
      recordFenceOp('render_steer')
    } else if (steeredKind === 'delivery') {
      recordFenceOp('delivery_steer')
    }
    try {
      const message = createFeedbackMessage(steeredText, agent.session.header.version)
      state.accountedCorrectionMessageIds.add(message.id)
      agent.steer(message)
    } catch (error) {
      ctx.logger?.warn?.(`iui: fence feedback steering failed (${error instanceof Error ? error.message : String(error)})`)
    }
  })
}
