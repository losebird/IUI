import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(async () => {
  const heuristics = await import('../src/config/stream-heuristics.ts')
  heuristics.setStreamHeuristicsOverride(null)
})

describe('fence tool allow-list follows stream heuristics', () => {
  it('the three referee builders name every tool the live policy allows', async () => {
    const heuristics = await import('../src/config/stream-heuristics.ts')
    const referee = await import('../src/plugin/format-referee.ts')
    const rules = await import('../src/config/referee-rules.ts')
    const rule = rules.getIntentRule('map')!
    const prompts = [
      referee.buildRefereePromptBlock(),
      referee.buildFirstTokenContract(rule),
      referee.buildToolBeforeFenceAbort(rule),
    ]
    for (const name of heuristics.getStreamHeuristics().toolsAllowedBeforeFence) {
      for (const prompt of prompts) expect(prompt).toContain(name)
    }
  })

  it('referee prompts and the design skill follow a replaced allow-list', async () => {
    vi.resetModules()
    const heuristics = await import('../src/config/stream-heuristics.ts')
    heuristics.setStreamHeuristicsOverride({
      ...heuristics.STREAM_HEURISTICS,
      toolsAllowedBeforeFence: ['zz_photo_tool'],
    })
    const referee = await import('../src/plugin/format-referee.ts')
    const skill = await import('../src/themes/oiu-design-system.ts')
    const rules = await import('../src/config/referee-rules.ts')
    const rule = rules.getIntentRule('map')!
    const prompts = [
      referee.buildRefereePromptBlock(),
      referee.buildFirstTokenContract(rule),
      referee.buildToolBeforeFenceAbort(rule),
      skill.OIU_DESIGN_SKILL,
    ]
    for (const prompt of prompts) {
      expect(prompt).toContain('zz_photo_tool')
      expect(prompt).not.toContain('get_trip_stop_images')
      expect(prompt).not.toContain('get_place_images')
    }
  })
})
