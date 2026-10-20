import { describe, expect, it, vi } from 'vitest'
import {
  buildFormatCriteria,
  routeFormat,
  routeFormatSync,
  formatRouterStatus,
} from '../src/plugin/format-router.ts'
import { listIntentRules } from '../src/config/referee-rules.ts'

describe('format-router', () => {
  it('buildFormatCriteria includes none + every catalog intent', () => {
    const criteria = buildFormatCriteria()
    expect(criteria.none).toBeTruthy()
    for (const rule of listIntentRules()) {
      expect(criteria[rule.id]).toBeTruthy()
    }
  })

  it('routeFormatSync matches rules for resource asks', () => {
    const routed = routeFormatSync('用卡片展示这台电脑现在的资源使用情况')
    expect(routed.source).toBe('rules')
    expect(routed.formatId).toBe('resource')
    expect(routed.rule?.mode).toBe('must_fence')
  })

  it('routeFormat without key stays on rules', async () => {
    const routed = await routeFormat('画一个北京今天的天气卡片', { jevEnabled: true, jevApiKey: '' })
    expect(routed.source).toBe('rules')
    expect(routed.formatId).toBe('weather')
    // No explicit page request → plain text is the model's call.
    expect((await routeFormat('北京今天天气怎么样', { jevEnabled: true, jevApiKey: '' })).formatId).toBe('none')
  })

  it('routeFormat uses Jev when configured and confidence ok', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        answers: {
          format: {
            type: 'choice',
            choice: 'map',
            confidence: 0.9,
            probabilities: { map: 0.9, none: 0.1 },
          },
        },
      }),
    }))
    const routed = await routeFormat('去南京珠江路，把地图给我', {
      jevEnabled: true,
      jevApiKey: 'sk-test',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    expect(routed.source).toBe('jev')
    expect(routed.formatId).toBe('map')
    expect(routed.rule?.id).toBe('map')
  })

  it('routeFormat falls back to rules on Jev http error', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 401,
      json: async () => ({}),
    }))
    const routed = await routeFormat('做一张对比卡', {
      jevEnabled: true,
      jevApiKey: 'sk-bad',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    expect(routed.source).toBe('jev_fallback_rules')
    expect(routed.rule?.id).toBe('compare')
  })

  it('formatRouterStatus never exposes secrets', () => {
    const status = formatRouterStatus({ jevEnabled: true, jevApiKey: 'sk-secret' })
    expect(status.jevConfigured).toBe(true)
    expect(JSON.stringify(status)).not.toContain('sk-secret')
  })
})
