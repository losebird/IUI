import { describe, expect, it } from 'vitest'
import {
  MAX_TEMPLATES,
  MAX_TEMPLATE_SOURCE,
  mergeUserTemplates,
  parseUserTemplatesJson,
  removeUserTemplate,
  serializeUserTemplates,
  templateNameFromSource,
  templateSourceBody,
  upsertUserTemplate,
  userTemplatePrompt,
} from '../src/client/settings/user-templates.ts'

const page = 'title: 看板\n---html\n<p>hi</p>'

describe('user-templates (S6 v2: saved iui-html pages)', () => {
  it('parses v2 entries and skips legacy demo-only rows with a reason', () => {
    const { templates, errors } = parseUserTemplatesJson(JSON.stringify([
      { id: 'ok', name: 'OK', source: page },
      { id: 'prompt', name: 'P', instruction: '画一张看板' },
      { id: 'legacy', name: 'Old', demo: { title: 'x', items: [] } },
      { id: 'ok', name: 'dup', source: page },
      { name: '' },
    ]))
    expect(templates.map((t) => t.id)).toEqual(['ok', 'prompt'])
    expect(errors.join('\n')).toMatch(/legacy catalog/)
    expect(errors.join('\n')).toMatch(/duplicate id/)
    expect(errors.join('\n')).toMatch(/name required/)
  })

  it('accepts {templates:[]}, rejects bad JSON, caps count and page size', () => {
    expect(parseUserTemplatesJson('{"templates":[{"name":"a","source":"x"}]}').templates).toHaveLength(1)
    expect(parseUserTemplatesJson('{').errors).toEqual(['invalid JSON'])
    const many = Array.from({ length: MAX_TEMPLATES + 5 }, (_, i) => ({ id: `t${i}`, name: `T${i}`, source: 'x' }))
    const r = parseUserTemplatesJson(JSON.stringify(many))
    expect(r.templates).toHaveLength(MAX_TEMPLATES)
    expect(r.errors.at(-1)).toMatch(/truncated/)
    const big = parseUserTemplatesJson(JSON.stringify([{ name: 'big', source: 'x'.repeat(MAX_TEMPLATE_SOURCE + 1) }]))
    expect(big.templates).toHaveLength(0)
    expect(() => upsertUserTemplate([], { id: 'b', name: 'b', source: 'x'.repeat(MAX_TEMPLATE_SOURCE + 1) })).toThrow(/too large/)
  })

  it('upserts newest-first, removes, merges (imported wins) and round-trips', () => {
    let list = upsertUserTemplate([], { id: 'a', name: 'A', source: page })
    list = upsertUserTemplate(list, { id: 'b', name: 'B', source: page })
    list = upsertUserTemplate(list, { id: 'a', name: 'A2', source: page })
    expect(list.map((t) => t.name)).toEqual(['A2', 'B'])
    expect(() => upsertUserTemplate(list, { id: 'e', name: 'E' })).toThrow(/empty/)
    const json = serializeUserTemplates(list)
    expect(parseUserTemplatesJson(json).templates.map((t) => t.id)).toEqual(['a', 'b'])
    const merged = mergeUserTemplates(list, [{ id: 'b', name: 'B-imported', source: page }])
    expect(merged.find((t) => t.id === 'b')!.name).toBe('B-imported')
    expect(removeUserTemplate(list, 'a').map((t) => t.id)).toEqual(['b'])
    expect(serializeUserTemplates([])).toBe('')
  })

  it('strips a pasted fence, names from the header, and builds a fence-safe prompt', () => {
    expect(templateSourceBody('```iui-html\n' + page + '\n```')).toBe(page)
    expect(templateNameFromSource(page)).toBe('看板')
    expect(templateNameFromSource('{"title":"J","html":""}')).toBe('J')
    const tricky = 'title: t\n---html\n<pre>```js\nx\n```</pre>'
    const prompt = userTemplatePrompt({ id: 'x', name: 'X', source: tricky }, true)
    expect(prompt).toContain('「X」')
    expect(prompt).toContain('````iui-html\n')
    expect(prompt.trimEnd().endsWith('````')).toBe(true)
    expect(userTemplatePrompt({ id: 'p', name: 'P', instruction: '画图' }, false)).toBe('画图')
  })
})
