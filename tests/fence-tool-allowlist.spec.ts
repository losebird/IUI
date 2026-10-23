import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(async () => {
  const heuristics = await import('../src/config/stream-heuristics.ts')
  heuristics.setStreamHeuristicsOverride(null)
})

function photoToolsNamedInSkill(raw: string): string[] {
  const line = raw.split('\n').find((entry) => entry.includes('行程卡照片'))
  const span = line?.match(/优先调用工具 (.+?)（/)
  if (!span) return []
  return [...span[1].matchAll(/`([^`]+)`/g)].map((match) => match[1])
}

describe('fence tool allow-list follows stream heuristics', () => {
  it('referee prompts and the system section name every tool the live policy allows', async () => {
    const heuristics = await import('../src/config/stream-heuristics.ts')
    const referee = await import('../src/plugin/format-referee.ts')
    const section = await import('../src/plugin/section-text.ts')
    const rules = await import('../src/config/referee-rules.ts')
    const rule = rules.getIntentRule('map')!
    const prompts = [
      referee.buildRefereePromptBlock(),
      referee.buildFirstTokenContract(rule),
      referee.buildToolBeforeFenceAbort(rule),
      referee.buildFenceFirstHint(rule),
      section.buildGenuiSectionText(),
      section.GENUI_SECTION_TEXT,
    ]
    for (const name of heuristics.getStreamHeuristics().toolsAllowedBeforeFence) {
      for (const prompt of prompts) expect(prompt).toContain(name)
    }
  })

  it('referee prompts, the system section, and the design skill follow a replaced allow-list', async () => {
    vi.resetModules()
    const heuristics = await import('../src/config/stream-heuristics.ts')
    heuristics.setStreamHeuristicsOverride({
      ...heuristics.STREAM_HEURISTICS,
      toolsAllowedBeforeFence: ['zz_photo_tool'],
    })
    const referee = await import('../src/plugin/format-referee.ts')
    const section = await import('../src/plugin/section-text.ts')
    const rules = await import('../src/config/referee-rules.ts')
    const rule = rules.getIntentRule('map')!
    const prompts = [
      referee.buildRefereePromptBlock(),
      referee.buildFirstTokenContract(rule),
      referee.buildToolBeforeFenceAbort(rule),
      referee.buildFenceFirstHint(rule),
      section.buildGenuiSectionText(),
      section.GENUI_SECTION_TEXT,
    ]
    for (const prompt of prompts) {
      expect(prompt).toContain('zz_photo_tool')
      expect(prompt).not.toContain('get_trip_stop_images')
      expect(prompt).not.toContain('get_place_images')
    }
  })

  it('the system section follows a replaced allow-list', async () => {
    vi.resetModules()
    const heuristics = await import('../src/config/stream-heuristics.ts')
    heuristics.setStreamHeuristicsOverride({
      ...heuristics.STREAM_HEURISTICS,
      toolsAllowedBeforeFence: ['zz_photo_tool'],
    })
    const section = await import('../src/plugin/section-text.ts')
    for (const prompt of [section.buildGenuiSectionText(), section.GENUI_SECTION_TEXT]) {
      expect(prompt).toContain('zz_photo_tool')
      expect(prompt).not.toContain('get_trip_stop_images')
      expect(prompt).not.toContain('get_place_images')
    }
  })

  it('SKILL.md photo sentence lists the checked-in allow-list in the same order', async () => {
    const heuristics = await import('../src/config/stream-heuristics.ts')
    const raw = readFileSync(join(process.cwd(), 'SKILL.md'), 'utf8')
    // find_3d_models (R5-3) is allowed before the fence too, but it is not a photo tool.
    expect(photoToolsNamedInSkill(raw)).toEqual(heuristics.STREAM_HEURISTICS.toolsAllowedBeforeFence.filter((n) => /images/.test(n)))
  })
})
