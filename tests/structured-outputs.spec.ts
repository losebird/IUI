import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  buildIuiResponseFormat,
  probeStructuredOutputSupport,
  resetStructuredOutputsProbeForTests,
  resolveStructuredOutputsStatus,
  structuredOutputsRuntimePayload,
} from '../src/shared/structured-outputs.ts'
import { SANDBOX_SCHEMA_VERSION as DIL_SCHEMA_VERSION } from '../src/shared/structured-outputs.ts'
import { listIntentRules } from '../src/config/referee-rules.ts'

describe('structured-outputs', () => {
  beforeEach(() => {
    resetStructuredOutputsProbeForTests()
  })

  it('buildIuiResponseFormat describes iui-html sandbox schema', () => {
    const format = buildIuiResponseFormat()
    expect(format.type).toBe('json_schema')
    expect(format.json_schema.name).toBe('iui_html_sandbox')
    const props = format.json_schema.schema.properties as Record<string, unknown>
    expect(props.html).toBeTruthy()
    expect(props.css).toBeTruthy()
    expect(props.js).toBeTruthy()
  })

  it('off mode never advertises response format availability', () => {
    const status = resolveStructuredOutputsStatus({ mode: 'off', probe: null })
    expect(status.responseFormatAvailable).toBe(false)
    expect(status.degradePath).toBe('soft_fence_iui_html')
    expect(status.schemaVersion).toBe(DIL_SCHEMA_VERSION)
  })

  it('auto degrades when probe unsupported', () => {
    const status = resolveStructuredOutputsStatus({
      mode: 'auto',
      probe: { supported: false, reason: 'upstream_rejected_400', probedAt: 1 },
    })
    expect(status.responseFormatAvailable).toBe(false)
    expect(status.degradePath).toBe('soft_fence_iui_html')
  })

  it('probe marks supported on 2xx', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => '{"id":"x"}',
    }))
    const probe = await probeStructuredOutputSupport({
      baseUrl: 'http://example.test',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      force: true,
    })
    expect(probe.supported).toBe(true)
    expect(fetchImpl).toHaveBeenCalledOnce()
  })

  it('probe marks unsupported on 400 response_format', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 400,
      text: async () => 'Unknown parameter: response_format',
    }))
    const probe = await probeStructuredOutputSupport({
      baseUrl: 'http://example.test/v1',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      force: true,
    })
    expect(probe.supported).toBe(false)
  })

  it('runtime payload includes schema when mode auto', () => {
    const status = resolveStructuredOutputsStatus({ mode: 'auto', probe: null })
    const payload = structuredOutputsRuntimePayload(status)
    expect(payload.responseFormat?.type).toBe('json_schema')
  })

  it('intent catalog still data-driven (sanity)', () => {
    expect(listIntentRules().length).toBeGreaterThan(5)
  })
})
