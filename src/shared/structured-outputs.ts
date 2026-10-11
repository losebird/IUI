/**
 * Optional cloud Structured Outputs helpers (OpenAI-style response_format).
 * Schema describes ```iui-html sandbox JSON — catalog/DIL removed.
 */

export type StructuredOutputsMode = 'off' | 'auto' | 'prefer'

export type OpenAiResponseFormat = {
  readonly type: 'json_schema'
  readonly json_schema: {
    readonly name: string
    readonly strict?: boolean
    readonly schema: Record<string, unknown>
  }
}

export type StructuredOutputsProbe = {
  readonly supported: boolean
  readonly reason: string
  readonly probedAt: number
  readonly baseUrl?: string
}

export type StructuredOutputsStatus = {
  readonly mode: StructuredOutputsMode
  readonly schemaVersion: string
  readonly responseFormatAvailable: boolean
  readonly probe: StructuredOutputsProbe | null
  readonly degradePath: 'soft_fence_iui_html'
}

export const SANDBOX_SCHEMA_VERSION = 'iui-html-1.0'

export function buildIuiResponseFormat(): OpenAiResponseFormat {
  return {
    type: 'json_schema',
    json_schema: {
      name: 'iui_html_sandbox',
      strict: false,
      schema: {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        title: 'IUI HTML sandbox fence body',
        type: 'object',
        additionalProperties: true,
        properties: {
          title: { type: 'string' },
          height: { type: 'number' },
          placeholder: { type: 'string' },
          css: { type: 'string' },
          html: { type: 'string' },
          js: { type: 'string' },
          jsFunctions: { type: 'string' },
          jsExpressions: {
            type: 'array',
            items: { type: 'string' },
          },
        },
        anyOf: [
          { required: ['html'] },
          { required: ['css'] },
          { required: ['js'] },
        ],
      },
    },
  }
}

let cachedProbe: StructuredOutputsProbe | null = null

export function getCachedStructuredOutputsProbe(): StructuredOutputsProbe | null {
  return cachedProbe
}

export function resetStructuredOutputsProbeForTests(): void {
  cachedProbe = null
}

export async function probeStructuredOutputSupport(opts: {
  readonly baseUrl: string
  readonly apiKey?: string
  readonly model?: string
  readonly fetchImpl?: typeof fetch
  readonly timeoutMs?: number
  readonly force?: boolean
}): Promise<StructuredOutputsProbe> {
  if (!opts.force && cachedProbe !== null) return cachedProbe

  const base = opts.baseUrl.replace(/\/+$/u, '').replace(/\/v1$/u, '')
  const url = `${base}/v1/chat/completions`
  const timeoutMs = opts.timeoutMs ?? 4000
  const fetchImpl = opts.fetchImpl ?? fetch
  const format = buildIuiResponseFormat()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    accept: 'application/json',
  }
  const key = opts.apiKey?.trim()
  if (key) headers.authorization = `Bearer ${key}`

  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        model: opts.model?.trim() || 'gpt-4o-mini',
        stream: false,
        max_tokens: 16,
        messages: [
          { role: 'user', content: 'Return minimal {"html":"<div/>","css":"","js":""}' },
        ],
        response_format: format,
      }),
    })
    const text = await res.text().catch(() => '')
    if (res.ok) {
      cachedProbe = {
        supported: true,
        reason: 'upstream_accepted_response_format',
        probedAt: Date.now(),
        baseUrl: base,
      }
      return cachedProbe
    }
    const lower = text.toLowerCase()
    const unsupported =
      res.status === 400
      || /response_format|json_schema|unknown.?field|not.?support|unsupported/iu.test(lower)
    cachedProbe = {
      supported: false,
      reason: unsupported
        ? `upstream_rejected_${res.status}`
        : `upstream_http_${res.status}`,
      probedAt: Date.now(),
      baseUrl: base,
    }
    return cachedProbe
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    cachedProbe = {
      supported: false,
      reason: /abort/iu.test(msg) ? 'probe_timeout' : `probe_error:${msg.slice(0, 80)}`,
      probedAt: Date.now(),
      baseUrl: base,
    }
    return cachedProbe
  } finally {
    clearTimeout(timer)
  }
}

export function resolveStructuredOutputsStatus(opts: {
  readonly mode: StructuredOutputsMode
  readonly probe?: StructuredOutputsProbe | null
}): StructuredOutputsStatus {
  const probe = opts.probe === undefined ? cachedProbe : opts.probe
  if (opts.mode === 'off') {
    return {
      mode: 'off',
      schemaVersion: SANDBOX_SCHEMA_VERSION,
      responseFormatAvailable: false,
      probe,
      degradePath: 'soft_fence_iui_html',
    }
  }
  const supported = probe?.supported === true
  return {
    mode: opts.mode,
    schemaVersion: SANDBOX_SCHEMA_VERSION,
    responseFormatAvailable: supported || opts.mode === 'prefer',
    probe,
    degradePath: 'soft_fence_iui_html',
  }
}

export function structuredOutputsRuntimePayload(status: StructuredOutputsStatus): {
  readonly structuredOutputs: StructuredOutputsStatus
  readonly responseFormat: OpenAiResponseFormat | null
} {
  return {
    structuredOutputs: status,
    responseFormat:
      status.mode === 'off'
        ? null
        : status.responseFormatAvailable || status.mode === 'prefer' || status.mode === 'auto'
          ? buildIuiResponseFormat()
          : null,
  }
}
