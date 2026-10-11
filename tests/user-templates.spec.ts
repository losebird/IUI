import { describe, expect, it } from 'vitest'
import {
  parseUserTemplatesJson,
  removeUserTemplate,
  serializeUserTemplates,
  upsertUserTemplate,
  formatIuiFence,
} from '../src/client/settings/user-templates.ts'

const demo = {
  title: 'T',
  items: [{ type: 'stat', label: 'CPU', value: '10%' }],
}

describe('user-templates', () => {
  it('parses valid templates and drops invalid demos', () => {
    const { templates, errors } = parseUserTemplatesJson(JSON.stringify([
      { id: 'ok', name: 'OK', demo },
      { id: 'bad', name: 'Bad', demo: { title: 'x', items: [{ type: 'not-a-real-type' }] } },
    ]))
    expect(templates).toHaveLength(1)
    expect(templates[0]!.id).toBe('ok')
    expect(errors.length).toBeGreaterThan(0)
  })

  it('upserts and removes', () => {
    let list = upsertUserTemplate([], { id: 'a', name: 'A', demo })
    expect(list).toHaveLength(1)
    list = upsertUserTemplate(list, { id: 'a', name: 'A2', demo })
    expect(list).toHaveLength(1)
    expect(list[0]!.name).toBe('A2')
    const json = serializeUserTemplates(list)
    expect(json).toContain('"A2"')
    list = removeUserTemplate(list, 'a')
    expect(list).toHaveLength(0)
  })
})

describe('formatIuiFence', () => {
  it('wraps demo as a composer-ready fence', () => {
    const text = formatIuiFence({ title: 'Demo', items: [{ type: 'stat', label: 'CPU', value: '1%' }] })
    expect(text).toContain('```iui')
    expect(text).toContain('"label": "CPU"')
  })

  it('prefers instruction prefix when provided', () => {
    const text = formatIuiFence(
      { items: [{ type: 'stat', label: 'A', value: '1' }] },
      { instruction: '画一张看板' },
    )
    expect(text.startsWith('画一张看板')).toBe(true)
  })
})
