/**
 * Format router: decide whether / which IUI intent a user ask should use.
 *
 * Default path (no key, no network): data-driven rules via classifyIntentAsk.
 * Optional path: TypeSafe Jev System One when jevApiKey is configured — Jev
 * only picks among catalog options; generation stays on dsh's model.
 *
 * Never hard-codes intent ids in criteria — built from listIntentRules().
 */

import {
  classifyIntentAsk,
  getIntentRule,
  listIntentRules,
  type IntentRule,
} from '../config/referee-rules.ts'
import { isJevConfigured, jevChoose, type JevClientConfig } from '../shared/jev-client.ts'

export type FormatRouteSource = 'rules' | 'jev' | 'jev_fallback_rules'

export type FormatRouteResult = {
  /** Matching intent rule, or null → plain text OK. */
  readonly rule: IntentRule | null
  /** Stable id: intent id, or "none" when plain. */
  readonly formatId: string
  readonly source: FormatRouteSource
  /** Jev confidence when source=jev; else 1 for rules / 0 for fallback. */
  readonly confidence: number
  /** Diagnostic reason (jev failure code, etc.). */
  readonly detail?: string
}

export type FormatRouterConfig = {
  /** When true and apiKey set, try Jev before settling on rules. Default false. */
  readonly jevEnabled?: boolean
  readonly jevApiKey?: string
  readonly jevBaseUrl?: string
  readonly jevModel?: string
  readonly jevTimeoutMs?: number
  /** Min Jev confidence to accept; below → rules. Default 0.35 */
  readonly jevMinConfidence?: number
  readonly fetchImpl?: typeof fetch
}

const PLAIN_OPTION = 'none' as const

/** Build Jev choice criteria from the live intent catalog (+ plain). */
export function buildFormatCriteria(
  rules: readonly IntentRule[] = listIntentRules(),
): Record<string, string> {
  const criteria: Record<string, string> = {
    [PLAIN_OPTION]:
      'Plain text reply only — greetings, yes/no, short facts, arithmetic; no interactive UI card needed.',
  }
  for (const rule of rules) {
    const preferred = rule.preferredTypes.slice(0, 6).join(', ')
    criteria[rule.id] =
      `${rule.label}. Sandbox pattern: ${preferred || 'iui-html'}. ${rule.successCriteria[0] ?? ''}`.trim()
  }
  return criteria
}

function jevConfigFrom(router: FormatRouterConfig): JevClientConfig | null {
  if (router.jevEnabled !== true) return null
  const key = router.jevApiKey?.trim() ?? ''
  if (!isJevConfigured(key)) return null
  return {
    apiKey: key,
    ...(router.jevBaseUrl ? { baseUrl: router.jevBaseUrl } : {}),
    ...(router.jevModel ? { model: router.jevModel } : {}),
    ...(router.jevTimeoutMs !== undefined ? { timeoutMs: router.jevTimeoutMs } : {}),
    ...(router.fetchImpl ? { fetchImpl: router.fetchImpl } : {}),
  }
}

/**
 * Synchronous rules-only route (same as classifyAsk). Used when Jev is off
 * or when a cached async result is unavailable.
 */
export function routeFormatSync(ask: string): FormatRouteResult {
  const rule = classifyIntentAsk(ask)
  return {
    rule,
    formatId: rule?.id ?? PLAIN_OPTION,
    source: 'rules',
    confidence: 1,
  }
}

/**
 * Async route: optional Jev, always degrades to rules on any failure / low confidence.
 */
export async function routeFormat(
  ask: string,
  config: FormatRouterConfig = {},
): Promise<FormatRouteResult> {
  const text = ask.trim()
  if (text.length === 0) {
    return { rule: null, formatId: PLAIN_OPTION, source: 'rules', confidence: 1 }
  }

  const jev = jevConfigFrom(config)
  if (jev === null) return routeFormatSync(text)

  const criteria = buildFormatCriteria()
  const minConfidence = config.jevMinConfidence ?? 0.35
  const judged = await jevChoose(jev, {
    state: { ask: text },
    questionId: 'format',
    instructions:
      'Choose the best reply format for this user ask. Pick "none" for plain chat; otherwise pick the UI intent that best matches.',
    criteria,
  })

  if (!judged.ok) {
    const fallback = routeFormatSync(text)
    return {
      ...fallback,
      source: 'jev_fallback_rules',
      confidence: 0,
      detail: judged.reason,
    }
  }

  if (judged.choice === PLAIN_OPTION) {
    if (judged.confidence < minConfidence) {
      const fallback = routeFormatSync(text)
      return {
        ...fallback,
        source: 'jev_fallback_rules',
        confidence: judged.confidence,
        detail: 'jev_low_confidence_none',
      }
    }
    return {
      rule: null,
      formatId: PLAIN_OPTION,
      source: 'jev',
      confidence: judged.confidence,
    }
  }

  const rule = getIntentRule(judged.choice) ?? null
  if (rule === null || judged.confidence < minConfidence) {
    const fallback = routeFormatSync(text)
    return {
      ...fallback,
      source: 'jev_fallback_rules',
      confidence: judged.confidence,
      detail: rule === null ? `jev_unknown_intent:${judged.choice}` : 'jev_low_confidence',
    }
  }

  return {
    rule,
    formatId: rule.id,
    source: 'jev',
    confidence: judged.confidence,
  }
}

/** Snapshot for settings / ops UI (no secrets). */
export function formatRouterStatus(config: FormatRouterConfig): {
  readonly jevEnabled: boolean
  readonly jevConfigured: boolean
  readonly criteriaCount: number
} {
  const key = config.jevApiKey?.trim() ?? ''
  return {
    jevEnabled: config.jevEnabled === true,
    jevConfigured: isJevConfigured(key),
    criteriaCount: Object.keys(buildFormatCriteria()).length,
  }
}
