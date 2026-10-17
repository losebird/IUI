/**
 * Format referee: classifies the user ask against config intent rules, detects
 * Markdown-as-UI failures, checks fence success shapes, and plans same-turn
 * corrections. Pure core — host wiring lives in fence-feedback.
 *
 * @module @losebird/iui/plugin/format-referee
 */

import {
  classifyIntentAsk,
  listIntentRules,
  type IntentRule,
  type SuccessShape,
} from '../config/referee-rules.ts'
import { resolveFence } from '../shared/fence-resolve.ts'
import { looksLikeGenuiSpecBody } from '../shared/genui-shape.ts'
import { parseHtmlSandboxFence } from '../shared/html-sandbox.ts'
import { describeToolsAllowedBeforeFence } from '../config/stream-heuristics.ts'
import { safeRegExp } from '../shared/safe-regexp.ts'

/** Sandbox-first recipe used by every prime/steer (catalog recipes removed). */
export const SANDBOX_RECIPE = '{"title":"<按当前问句起标题>","height":420,"css":".wrap{display:grid;gap:12px}.row{display:flex;gap:8px;flex-wrap:wrap}","html":"<div class=\\"iui-sandbox-card wrap\\"><h3>标题</h3><div class=\\"iui-sandbox-grid\\" id=\\"g\\"></div><div class=\\"row\\"><button class=\\"iui-sandbox-btn\\" id=\\"b\\">操作</button></div></div>","js":"document.getElementById(\'b\').onclick=function(){/* 本地交互 */}"}'

function isSandboxSpec(raw: string): boolean {
  try { return parseHtmlSandboxFence(raw) !== null } catch { return false }
}

/** Exact fence opener (≤3 spaces) — keep in sync with fence-feedback. */
const FENCE_OPEN_LINE = /^ {0,3}```[ \t]*(?:iui-html|iui|dsh-ui)[ \t]*$/u
const FENCE_CLOSE_LINE = /^ {0,3}```[ \t]*$/u
const MAX_FENCES = 40

interface ExtractedFence {
  readonly raw: string
  readonly closed: boolean
}

function extractIuiFences(text: string): ExtractedFence[] {
  const lines = text.split('\n')
  const fences: ExtractedFence[] = []
  let open: { start: number } | null = null
  for (let line = 0; line < lines.length; line++) {
    const current = lines[line] ?? ''
    if (open === null) {
      if (FENCE_OPEN_LINE.test(current)) open = { start: line + 1 }
      continue
    }
    if (!FENCE_CLOSE_LINE.test(current)) continue
    fences.push({ raw: lines.slice(open.start, line).join('\n'), closed: true })
    open = null
    if (fences.length >= MAX_FENCES) return fences
  }
  if (open !== null && fences.length < MAX_FENCES) {
    fences.push({ raw: lines.slice(open.start).join('\n'), closed: false })
  }
  return fences
}

const FENCE_OPEN_IN_BODY = /```[ \t]*(?:iui-html|iui|dsh-ui)\b/iu
const JSON_FENCE_OPEN_LINE = /^ {0,3}```[ \t]*(?:json|json5|jsonc)[ \t]*$/u

/** Extract ```json / json5 / jsonc fences (weak models mislabel GenUI as json). */
function extractJsonFences(text: string): ExtractedFence[] {
  const lines = text.split('\n')
  const fences: ExtractedFence[] = []
  let open: { start: number } | null = null
  for (let line = 0; line < lines.length; line++) {
    const current = lines[line] ?? ''
    if (open === null) {
      if (JSON_FENCE_OPEN_LINE.test(current)) open = { start: line + 1 }
      continue
    }
    if (!FENCE_CLOSE_LINE.test(current)) continue
    fences.push({ raw: lines.slice(open.start, line).join('\n'), closed: true })
    open = null
    if (fences.length >= MAX_FENCES) return fences
  }
  if (open !== null && fences.length < MAX_FENCES) {
    fences.push({ raw: lines.slice(open.start).join('\n'), closed: false })
  }
  return fences
}

/** True when the reply has GenUI-shaped ```json but no ```iui-html (weak-model trap). */
export function replyHasJsonMasquerade(text: string): boolean {
  if (replyHasFence(text)) return false
  for (const fence of extractJsonFences(text)) {
    if (looksLikeGenuiSpecBody(fence.raw)) return true
  }
  return false
}


/** Compiled rule for fast ask matching. */
interface CompiledRule {
  readonly rule: IntentRule
  readonly ask: RegExp[]
  readonly markdownFail: RegExp[]
}

let compiledCache: CompiledRule[] | null = null

function compiledRules(): CompiledRule[] {
  if (compiledCache !== null) return compiledCache
  compiledCache = listIntentRules().map((rule) => ({
    rule,
    ask: rule.askPatterns.map((source) => safeRegExp(source, 'iu')).filter((re): re is RegExp => re !== null),
    markdownFail: rule.markdownFailPatterns.map((source) => safeRegExp(source, 'imu')).filter((re): re is RegExp => re !== null),
  }))
  return compiledCache
}

/** Test helper: drop memoized regexes after mutating rule tables in-process. */
export function resetRefereeCacheForTests(): void {
  compiledCache = null
}

/**
 * Classify a user ask: named intent recipes first, else `visual` fallback when
 * UI-worthy (askNeedsUi). Whitelist never blocks fencing — it only tightens
 * quality. Short yes/no / facts stay `null` → plain text OK.
 */
export function classifyAsk(ask: string): IntentRule | null {
  return classifyIntentAsk(ask)
}

/** True when the assistant body already contains an iui / dsh-ui fence opener. */
export function replyHasFence(text: string): boolean {
  return extractIuiFences(text).length > 0 || FENCE_OPEN_IN_BODY.test(text)
}

/**
 * True when the body looks like a Markdown dashboard / list that should have
 * been a fence for this intent (Markdown-as-UI anti-pattern).
 */
export function replyLooksLikeMarkdownUi(text: string, rule: IntentRule): boolean {
  const entry = compiledRules().find((row) => row.rule.id === rule.id)
  if (entry === undefined) return false
  // If a fence is present, markdown anti-patterns alone are not enough to fail —
  // successShape decides quality. Still fail when there is NO fence and anti-pattern hits.
  if (replyHasFence(text)) return false
  return entry.markdownFail.some((re) => re.test(text))
}

const APOLOGY_FAIL = [
  /搜索(?:功能)?不可用/u,
  /无法(?:为你)?(?:获取|打开|生成|提供).{0,24}(?:地图|界面|看板|表单|卡片)/u,
  /很抱歉[，,].{0,40}(?:无法|不能)/u,
  /暂时无法/u,
  /请(?:直接)?(?:点击|打开|访问).{0,40}(?:高德|百度|链接)/u,
]

/** True when the reply apologizes / points to external links instead of fencing. */
export function replyLooksLikeApologyInsteadOfUi(text: string): boolean {
  if (replyHasFence(text)) return false
  const body = text.trim()
  if (body.length < 12) return false
  return APOLOGY_FAIL.some((re) => re.test(body))
}

/** Walk a fence JSON tree and collect component type + shallow fields. */
interface WalkedNode {
  type: string
  value?: unknown
  size?: unknown
  data?: unknown
  series?: unknown
  /** Count of ordered entries for steps / timeline / list. */
  orderedCount?: number
  /** Steps with non-empty desc (manual QA). */
  stepDescCount?: number
  /** True when button/submit has a non-empty action string. */
  hasAction?: boolean
  /** True when link has a non-empty http(s)/mailto href. */
  hasHref?: boolean
}

function walkNodes(node: unknown, out: WalkedNode[]): void {
  if (node === null || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const child of node) walkNodes(child, out)
    return
  }
  const record = node as Record<string, unknown>
  if (typeof record.type === 'string') {
    let orderedCount: number | undefined
    let stepDescCount: number | undefined
    let hasAction: boolean | undefined
    let hasHref: boolean | undefined
    if (record.type === 'steps') {
      const arr = Array.isArray(record.steps)
        ? record.steps
        : Array.isArray(record.items)
          ? record.items
          : null
      orderedCount = arr === null ? 0 : arr.length
      if (arr !== null) {
        stepDescCount = arr.filter((entry) => {
          if (entry === null || typeof entry !== 'object') return false
          const desc = (entry as Record<string, unknown>).desc
          return typeof desc === 'string' && desc.trim().length > 0
        }).length
      } else {
        stepDescCount = 0
      }
    } else if (record.type === 'timeline' || record.type === 'list') {
      orderedCount = Array.isArray(record.items) ? record.items.length : 0
    }
    if (record.type === 'button' || record.type === 'submit') {
      hasAction = typeof record.action === 'string' && record.action.trim().length > 0
    }
    if (record.type === 'link') {
      const href = typeof record.href === 'string' ? record.href.trim() : ''
      hasHref = href.length > 0 && (/^https?:\/\//i.test(href) || /^mailto:/i.test(href))
    }
    if (record.type === 'map' && Array.isArray(record.links)) {
      hasHref = record.links.some((entry) => {
        if (entry === null || typeof entry !== 'object') return false
        const href = (entry as Record<string, unknown>).href
        return typeof href === 'string' && /^https?:\/\//i.test(href.trim())
      })
    }
    const walked: WalkedNode = {
      type: record.type,
      value: record.value,
      size: record.size,
      data: record.data,
      series: record.series,
    }
    if (orderedCount !== undefined) walked.orderedCount = orderedCount
    if (stepDescCount !== undefined) walked.stepDescCount = stepDescCount
    if (hasAction !== undefined) walked.hasAction = hasAction
    if (hasHref !== undefined) walked.hasHref = hasHref
    out.push(walked)
  }
  for (const key of ['items', 'tabs', 'children']) {
    if (key in record) walkNodes(record[key], out)
  }
  if (Array.isArray(record.tabs)) {
    for (const tab of record.tabs) walkNodes(tab, out)
  }
}

function parseFenceNodes(raw: string): WalkedNode[] | null {
  const resolution = resolveFence(raw, { settled: true })
  if (resolution.spec === null) return null
  const out: WalkedNode[] = []
  walkNodes(resolution.spec, out)
  return out
}

function hasFilledProgressOrChart(nodes: WalkedNode[]): boolean {
  for (const node of nodes) {
    if (node.type === 'progress') {
      const n = typeof node.value === 'number' ? node.value : Number(node.value)
      if (Number.isFinite(n) && n > 0 && n <= 100) return true
    }
    if (node.type === 'chart' || node.type === 'echart') {
      if (Array.isArray(node.data) && node.data.length > 0) return true
      if (Array.isArray(node.series) && node.series.length > 0) return true
    }
  }
  return false
}

function countStatValues(nodes: WalkedNode[]): number {
  let n = 0
  for (const node of nodes) {
    if (node.type !== 'stat') continue
    if (node.value === undefined || node.value === null) continue
    if (String(node.value).trim() === '') continue
    n += 1
  }
  return n
}

function hasHero(nodes: WalkedNode[]): boolean {
  return nodes.some(
    (node) => node.type === 'hero' || (node.type === 'stat' && node.size === 'hero'),
  )
}

/**
 * Whether any closed fence in the reply satisfies the intent's successShape.
 * Returns true when there is no successShape (presence of a renderable fence is enough).
 */
export function replyMeetsSuccessShape(text: string, rule: IntentRule): boolean {
  const shape = rule.successShape
  const fences = extractIuiFences(text).filter((fence) => fence.closed)
  if (fences.length === 0) return false
  // Sandbox-first: any parseable iui-html page satisfies the intent (no catalog shapes).
  if (fences.some((fence) => isSandboxSpec(fence.raw))) return true
  // Catalog trees no longer meet intents when successShape is absent.
  if (shape === undefined) return false
  for (const fence of fences) {
    const nodes = parseFenceNodes(fence.raw)
    if (nodes === null) continue
    if (shapePasses(nodes, shape)) return true
  }
  return false
}

function shapePasses(nodes: WalkedNode[], shape: SuccessShape): boolean {
  const types = new Set(nodes.map((node) => node.type))
  if (shape.requireTypesAny !== undefined && shape.requireTypesAny.length > 0) {
    if (!shape.requireTypesAny.some((type) => types.has(type))) return false
  }
  if (shape.requireTypesAll !== undefined && shape.requireTypesAll.length > 0) {
    if (!shape.requireTypesAll.every((type) => types.has(type))) return false
  }
  if (shape.forbidTypesAny !== undefined && shape.forbidTypesAny.length > 0) {
    if (shape.forbidTypesAny.some((type) => types.has(type))) return false
  }
  if (shape.minStatValues !== undefined && countStatValues(nodes) < shape.minStatValues) {
    return false
  }
  if (shape.requireFilledProgressOrChart === true && !hasFilledProgressOrChart(nodes)) {
    return false
  }
  if (shape.requireHero === true && !hasHero(nodes)) return false
  if (shape.minOrderedItems !== undefined) {
    let maxOrdered = 0
    for (const node of nodes) {
      if (shape.countOnlySteps === true) {
        if (node.type !== 'steps') continue
      } else if (node.type !== 'steps' && node.type !== 'timeline' && node.type !== 'list') {
        continue
      }
      const n = node.orderedCount ?? 0
      if (n > maxOrdered) maxOrdered = n
    }
    if (maxOrdered < shape.minOrderedItems) return false
  }
  if (shape.minStepDescs !== undefined) {
    let maxDescs = 0
    for (const node of nodes) {
      if (node.type !== 'steps') continue
      const n = node.stepDescCount ?? 0
      if (n > maxDescs) maxDescs = n
    }
    if (maxDescs < shape.minStepDescs) return false
  }
  if (shape.requireActionButton === true) {
    const hasBtn = nodes.some(
      (node) => (node.type === 'button' || node.type === 'submit') && node.hasAction === true,
    )
    if (!hasBtn) return false
  }
  if (shape.requireExternalHref !== undefined) {
    const hrefCount = nodes.filter((node) => (node.type === 'link' || node.type === 'map') && node.hasHref === true).length
    if (hrefCount < shape.requireExternalHref) return false
  }
  // preferHero is soft — does not fail the shape alone
  return true
}

/** Why the format referee wants a correction (for logs / correction text). */
export type FormatFailReason =
  | 'missing_fence'
  | 'markdown_as_ui'
  | 'weak_fence'
  | 'wrong_fence_lang'

export interface FormatRefereePlanInput {
  readonly ask: string
  readonly reply: string
  readonly turn: number
  readonly aborted: boolean
  /** Corrections already steered this turn (shared with fence-feedback budget). */
  readonly correctionsThisTurn?: number
  readonly correctionsTurn?: number
  /** Max corrections per turn (shared). Hard-capped at 1 to stop retry storms. */
  readonly maxCorrections?: number
  /**
   * How many format corrections already steered this turn.
   * Cap is 1: a second format steer in the same turn is never planned.
   */
  readonly formatCorrectionsThisTurn?: number
  /**
   * validate_dsh_ui already returned status=valid (or emit_* next) this turn.
   * Never re-steer format after a successful validation.
   */
  readonly validatedOkThisTurn?: boolean
}

export interface FormatRefereePlan {
  readonly text: string
  readonly turn: number
  readonly kind: 'format'
  readonly intentId: string
  readonly reason: FormatFailReason
}

const DEFAULT_MAX = 1

/** True when the reply already has at least one closed, parseable ```iui-html / dsh-ui fence. */
export function replyHasValidFence(text: string): boolean {
  for (const fence of extractIuiFences(text)) {
    if (!fence.closed) continue
    if (isSandboxSpec(fence.raw)) return true
    if (resolveFence(fence.raw, { settled: true }).spec !== null) return true
  }
  return false
}

/**
 * Decide whether this turn should steer a format correction.
 * Fires for any classified must_fence ask (named OR visual fallback) when the
 * reply lacks a fence. Whitelist recipes tighten weak_fence checks; they do
 * not decide whether fencing is required.
 * Hard stop: at most one steer per turn; never after a valid fence or validate OK.
 */
export function planFormatRefereeCorrection(input: FormatRefereePlanInput): FormatRefereePlan | null {
  if (input.aborted) return null
  if (input.validatedOkThisTurn === true) return null
  const used = input.correctionsTurn === input.turn ? (input.correctionsThisTurn ?? 0) : 0
  const max = Math.min(1, input.maxCorrections ?? DEFAULT_MAX)
  if (used >= max) return null
  const formatUsed = input.correctionsTurn === input.turn ? (input.formatCorrectionsThisTurn ?? 0) : 0
  if (formatUsed >= 1) return null

  const rule = classifyAsk(input.ask)
  if (rule === null || rule.mode !== 'must_fence') return null

  // Closed fence that fails successShape still fails format — steer once.
  // manual/steps: callout-only / leftover compare; booking: missing fields;
  // visual: empty generic card without actionable structure (weak-model trap).
  const hardenWeakShape =
    rule.id === 'manual' ||
    rule.id === 'steps' ||
    rule.id === 'booking' ||
    rule.id === 'visual' ||
    rule.id === 'form' ||
    rule.id === 'map'
  if (replyHasValidFence(input.reply)) {
    if (!hardenWeakShape) return null
    if (replyMeetsSuccessShape(input.reply, rule)) return null
  }

  let reason: FormatFailReason | null = null
  if (!replyHasFence(input.reply)) {
    if (replyHasJsonMasquerade(input.reply)) {
      reason = 'wrong_fence_lang'
    } else {
      reason = (
        replyLooksLikeMarkdownUi(input.reply, rule) || replyLooksLikeApologyInsteadOfUi(input.reply)
      ) ? 'markdown_as_ui' : 'missing_fence'
    }
  } else if (replyHasValidFence(input.reply) && hardenWeakShape && !replyMeetsSuccessShape(input.reply, rule)) {
    reason = 'weak_fence'
  } else {
    // Fence opener present but not yet a closed valid tree — treat as missing
    // only when nothing parseable closed; otherwise stay silent (handled above).
    reason = 'missing_fence'
  }

  return {
    text: formatCorrectionText(rule, reason),
    turn: input.turn,
    kind: 'format',
    intentId: rule.id,
    reason,
  }
}

/** Marker prefix shared with fence-feedback accounting style. */
const FORMAT_MARKER_PREFIX = '[genui-fence-repair #format-turn-'

export function formatCorrectionText(rule: IntentRule, reason: FormatFailReason): string {
  const criteria = rule.successCriteria.map((line) => `- ${line}`).join('\n')
  const wrongLang = reason === 'wrong_fence_lang'
    ? 'WRONG LANG: you emitted \`\`\`json (or json5). That is NOT a valid IUI fence. Rewrite as \`\`\`iui-html with the SAME JSON body. Never use \`\`\`json for UI.\n\n'
    : ''
  return (
    `${FORMAT_MARKER_PREFIX}${rule.id}]\n\n` +
    `[iui-format-referee]\n` +
    `status=format_failed\n` +
    `intent=${rule.id}\n` +
    `reason=${reason}\n` +
    `next=emit_fence_in_body\n` +
    wrongLang +
    `repeat_rendered_content=false\n` +
    `no_more_bash=true\n` +
    `no_more_validate=true\n` +
    `reply_language=conversation\n\n` +
    `${rule.repairHint}\n\n` +
    `HARD STOP: emit one \`\`\`iui-html fence in the reply body NOW as the FIRST content. Answer the CURRENT ask only — do not reuse leftover compare/dashboard cards from prior turns. Do NOT call bash again for the same metrics. Do NOT call validate_dsh_ui (disabled). Placeholders are OK.\n\n` +
    `Success criteria:\n${criteria}\n\n` +
    `Recipe (adapt language + numbers; emit as \`\`\`iui-html in the reply body):\n` +
    `\`\`\`iui-html\n${SANDBOX_RECIPE}\n\`\`\`\n`
  )
}

/**
 * Compact HARD block for the always-on system-prompt section.
 * Built from the intent catalog — single source of truth with SKILL recipes.
 */
export function buildRefereePromptBlock(): string {
  return [
    '**Format referee (sandbox-first):**',
    '- Short facts / yes-no / greetings → plain text only.',
    '- Any visual / interactive ask (图表、可视化、看板、表单、地图、对比、小工具、动画、游戏…) → ONE closed ```iui-html fence in the reply body THIS turn. Do NOT write files, do NOT call bash/shell/search to build the page — the fence IS the page. ' + describeToolsAllowedBeforeFence(),
    '- Body = one JSON object {"title","height","css","html","js"} (JSON strings, escape quotes). Write real, polished CSS + HTML + JS (local interactivity, animations, CDN libs allowed).',
    '- Never emit legacy ```iui component trees ({"type":"hero"...}) or ```json for UI. Never use Markdown tables/lists as the UI.',
    '- Pattern: 1 short sentence → ```iui-html → optional 1 sentence.',
    '- Skeleton: `' + SANDBOX_RECIPE + '`',
    '- Charts/maps: global Chart / L (host-injected). Prefer in-page controls over prompt()/alert().',
  ].join('\n')
}

/**
 * Same-turn pre-step prime for weak models: inject the recipe BEFORE the first
 * model step when the ask is already classified as must_fence.
 */

/**
 * Ultra-short first-token contract for weak models (injected with prime).
 * Goal: the first non-whitespace of the assistant body is ```iui-html.
 */
export function buildFirstTokenContract(rule: IntentRule): string {
  return (
    `[iui-format-referee]\n` +
    `status=first_token_contract\n` +
    `intent=${rule.id}\n` +
    'FIRST_CHARS_MUST_BE=```iui-html\n' +
    `${describeToolsAllowedBeforeFence()}\n` +
    `no_markdown_as_ui=true\n` +
    `no_apology_only=true\n\n` +
    `HARD first-token: for intent=${rule.id}, the FIRST non-whitespace characters of your assistant body MUST be the fence opener ` +
    '```iui-html (language iui-html, never json). ' +
    `Optional 1–2 sentence lead AFTER the closed fence is OK; lead BEFORE the fence is discouraged for weak models. ` +
    `Do NOT call bash/search/web. Do NOT open with apology / "搜索不可用" / Markdown lists.\n`
  )
}

/** Same-step abort when the model already burned a tool before any fence. */
export function buildToolBeforeFenceAbort(rule: IntentRule): string {
  return (
    `[iui-format-referee]\n` +
    `status=tool_before_fence_abort\n` +
    `intent=${rule.id}\n` +
    `next=emit_fence_now\n` +
    `no_more_bash=true\n` +
    `no_more_validate=true\n` +
    `${describeToolsAllowedBeforeFence()}\n\n` +
    `ABORT TOOLS: you called a tool before emitting ` +
    '```iui-html' +
    ` for intent=${rule.id}. ` +
    `Ignore further tool urges. Your NEXT assistant content MUST open with ` +
    '```iui-html' +
    ` and a closed fence (copy recipe). Placeholders OK.\n\n` +
    'Recipe:\n```iui-html\n' +
    `${SANDBOX_RECIPE}\n` +
    '```\n'
  )
}

export function buildFenceFirstHint(rule: IntentRule): string {
  const weakExtra =
    rule.id === 'visual' || rule.id === 'booking'
      ? `Unlisted/booking visual asks: do NOT wait for a new intent id. Emit the recipe NOW (optional 1–2 sentence lead prose AFTER the fence OK).\n`
      : ''
  return (
    `[iui-format-referee]\n` +
    `status=fence_first_prime\n` +
    `intent=${rule.id}\n` +
    `next=emit_fence_first\n` +
    'FIRST_CHARS_MUST_BE=```iui-html\n' +
    `no_more_bash=true\n` +
    `no_more_validate=true\n` +
    `${describeToolsAllowedBeforeFence()}\n` +
    `brief_prose_wrap_ok=true\n` +
    `prose_after_fence_preferred=true\n` +
    `no_markdown_as_ui=true\n\n` +
    `HARD (weak-model first-token): intent=${rule.id} (${rule.label}).\n` +
    `FIRST non-whitespace of the assistant body SHOULD be ` +
    '```iui-html' +
    `. Preferred ChatGPT pattern for strong models: short lead → fence → outro; for weak models prefer fence-first then short outro.\n` +
    `Do NOT call bash/search/web first. Do NOT open with Markdown-as-UI, apology-only, or "搜索不可用". Placeholders OK.\n` +
    `FENCE LANG HARD: language MUST be iui (or dsh-ui). NEVER open with ` +
    '```json / ```json5' +
    ` — the host will not treat those as IUI.\n` +
    weakExtra +
    `Markdown lists/tables/bold metrics = FAIL. Content-fit: current ask only — no leftover UI from earlier turns.\n\n` +
    '```iui-html\n' +
    `${SANDBOX_RECIPE}\n` +
    '```\n\n' +
    `${rule.repairHint}\n`
  )
}

export function buildMidTurnFenceNudge(rule: IntentRule): string {
  return (
    `[iui-format-referee]\n` +
    `status=mid_turn_fence_nudge\n` +
    `intent=${rule.id}\n` +
    `next=emit_fence_now\n` +
    `no_more_bash=true\n` +
    `no_more_validate=true\n` +
    `no_markdown_dashboard=true\n\n` +
    `HARD STOP: you already spent steps without a valid \`\`\`iui-html fence (tools-first / Markdown-as-UI / apology / "搜索不可用"). ` +
    `Your NEXT assistant content MUST be one closed \`\`\`iui-html fence for intent=${rule.id} — copy the recipe. ` +
    `Do NOT call bash/search again. Do NOT write bullet metrics. Placeholders OK.\n\n` +
    `Recipe:\n\`\`\`iui-html\n${SANDBOX_RECIPE}\n\`\`\`\n`
  )
}

/** Host-side stream sentinel detected non-fence first tokens on a must_fence turn. */
export function buildFirstTokenViolationSteer(rule: IntentRule, prefixSample: string): string {
  const sample = prefixSample.replace(/\s+/g, ' ').slice(0, 48)
  return (
    `[iui-format-referee]\n` +
    `status=first_token_violation\n` +
    `intent=${rule.id}\n` +
    'FIRST_CHARS_MUST_BE=```iui-html\n' +
    `host_stream_sentinel=true\n` +
    `next=emit_fence_now\n` +
    `no_more_bash=true\n` +
    `no_more_validate=true\n\n` +
    `HOST FIRST-TOKEN VIOLATION: your assistant body opened with non-fence text` +
    (sample ? ` ("${sample}…")` : '') +
    ` for intent=${rule.id}. ` +
    `dsh plugin APIs cannot force constrained decoding — this is a same-turn steer. ` +
    `Your NEXT content MUST open with ` +
    '```iui-html' +
    ` and a closed fence (copy recipe). Placeholders OK. No apology lead.\n\n` +
    `Recipe:\n\`\`\`iui-html\n${SANDBOX_RECIPE}\n\`\`\`\n`
  )
}

export function buildNextTurnFormatReminder(rule: IntentRule): string {
  return (
    `[iui-format-referee]\n` +
    `status=prior_turn_without_valid_fence\n` +
    `intent=${rule.id}\n` +
    `next=emit_fence_first\n` +
    `no_more_bash=true\n` +
    `no_more_validate=true\n\n` +
    `Previous turn for this ${rule.id} ask ended without a valid \`\`\`iui-html fence (Markdown-as-UI or missing fence). ` +
    `THIS turn: the FIRST content in the reply body MUST be one closed \`\`\`iui-html fence (placeholders OK). ` +
    `Do not open with Markdown lists/tables/bold metrics. Do not call bash first. Do not call validate_dsh_ui.\n\n` +
    `${rule.repairHint}\n\n` +
    `Recipe:\n\`\`\`iui-html\n${SANDBOX_RECIPE}\n\`\`\`\n`
  )
}


/** Detect format-referee markers in steered correction text (for accounting). */
export function formatMarkersIn(text: string): { intentIds: string[] } {
  const intentIds: string[] = []
  const re = /\[genui-fence-repair #format-turn-([^\]]+)\]/g
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    if (match[1]) intentIds.push(match[1])
  }
  return { intentIds }
}
