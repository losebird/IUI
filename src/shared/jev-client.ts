/**
 * Optional TypeSafe Jev (System One) HTTP client.
 *
 * Jev does NOT generate UI text — it returns typed choices/probabilities.
 * Without an API key the client stays inert (routeFormat falls back to rules).
 *
 * Endpoint: POST {baseUrl}/v1/systemone  (default https://api.typesafe.ai)
 * Auth: Bearer <apiKey>
 *
 * Criteria / option ids are supplied by the caller (from intent catalog) —
 * this module never hard-codes product intents.
 */

export type JevChoiceQuestion = {
  readonly type: 'choice'
  readonly instructions: string
  readonly criteria: Readonly<Record<string, string>>
}

export type JevSystemOneRequest = {
  readonly model: string
  readonly state: string | Record<string, unknown> | readonly unknown[]
  readonly questions: Readonly<Record<string, JevChoiceQuestion>>
}

export type JevChoiceAnswer = {
  readonly type: 'choice'
  readonly choice: string
  readonly probabilities?: Readonly<Record<string, number>>
  readonly confidence?: number
}

export type JevSystemOneResponse = {
  readonly model?: string
  readonly answers?: Readonly<Record<string, JevChoiceAnswer>>
  readonly usage?: unknown
}

export type JevClientConfig = {
  /** TypeSafe API key. Empty / missing → client disabled. */
  readonly apiKey: string
  /** Override API root (no trailing slash). Default https://api.typesafe.ai */
  readonly baseUrl?: string
  /** Model id. Default jev-latest */
  readonly model?: string
  /** Fetch timeout ms. Default 2500 */
  readonly timeoutMs?: number
  /** Optional fetch impl (tests). */
  readonly fetchImpl?: typeof fetch
}

export type JevChoiceResult = {
  readonly ok: true
  readonly choice: string
  readonly confidence: number
  readonly probabilities: Readonly<Record<string, number>>
  readonly model: string
} | {
  readonly ok: false
  readonly reason: string
}

const DEFAULT_BASE = 'https://api.typesafe.ai'
const DEFAULT_MODEL = 'jev-latest'
const DEFAULT_TIMEOUT_MS = 2500

/** True when a non-empty API key is present (trim). */
export function isJevConfigured(apiKey: string | undefined | null): boolean {
  return typeof apiKey === 'string' && apiKey.trim().length > 0
}

/**
 * Ask Jev one named choice question. Never throws — failures return ok:false
 * so callers always degrade to the rules router.
 */
export async function jevChoose(
  config: JevClientConfig,
  params: {
    readonly state: string | Record<string, unknown>
    readonly questionId: string
    readonly instructions: string
    readonly criteria: Readonly<Record<string, string>>
  },
): Promise<JevChoiceResult> {
  const apiKey = config.apiKey.trim()
  if (apiKey.length === 0) {
    return { ok: false, reason: 'jev_disabled_no_key' }
  }
  const criteriaKeys = Object.keys(params.criteria)
  if (criteriaKeys.length === 0) {
    return { ok: false, reason: 'jev_empty_criteria' }
  }
  if (criteriaKeys.length > 255) {
    return { ok: false, reason: 'jev_criteria_overflow' }
  }

  const base = (config.baseUrl?.trim() || DEFAULT_BASE).replace(/\/+$/u, '')
  const model = (config.model?.trim() || DEFAULT_MODEL)
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const fetchImpl = config.fetchImpl ?? fetch

  const body: JevSystemOneRequest = {
    model,
    state: params.state,
    questions: {
      [params.questionId]: {
        type: 'choice',
        instructions: params.instructions,
        criteria: { ...params.criteria },
      },
    },
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetchImpl(`${base}/v1/systemone`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
        accept: 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    if (!res.ok) {
      return { ok: false, reason: `jev_http_${res.status}` }
    }
    const json = (await res.json()) as JevSystemOneResponse
    const answer = json.answers?.[params.questionId]
    if (answer === undefined || answer.type !== 'choice' || typeof answer.choice !== 'string') {
      return { ok: false, reason: 'jev_malformed_answer' }
    }
    if (!Object.prototype.hasOwnProperty.call(params.criteria, answer.choice)) {
      return { ok: false, reason: `jev_unknown_choice:${answer.choice}` }
    }
    const probabilities = answer.probabilities ?? {}
    const confidence =
      typeof answer.confidence === 'number' && Number.isFinite(answer.confidence)
        ? answer.confidence
        : typeof probabilities[answer.choice] === 'number'
          ? probabilities[answer.choice]!
          : 0
    return {
      ok: true,
      choice: answer.choice,
      confidence,
      probabilities: { ...probabilities },
      model: typeof json.model === 'string' ? json.model : model,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (/abort/iu.test(msg)) return { ok: false, reason: 'jev_timeout' }
    return { ok: false, reason: `jev_error:${msg.slice(0, 120)}` }
  } finally {
    clearTimeout(timer)
  }
}
