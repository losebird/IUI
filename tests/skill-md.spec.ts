// SKILL.md frontmatter regression gate: the skill catalog silently IGNORES a
// skill whose YAML frontmatter fails to parse (the harness's yaml parser, not
// ours). The genui description historically contained `: ` sequences
// ("charts: callouts", "prose: 要点") which the parser rejects as compact
// nested mappings — the skill was invisible from install until quoted.
// This test pins the file against the SAME parser the host uses.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

/** Replicate skill-filesystem's parseFrontmatter: leading `---`, body until the
 * next `---` line. */
function frontmatterYaml(raw: string): string {
  const lines = raw.slice(4).split('\n')
  const out: string[] = []
  for (const line of lines) {
    if (line.trim() === '---') break
    out.push(line)
  }
  return out.join('\n')
}

describe('SKILL.md frontmatter (host yaml parser)', () => {
  const raw = readFileSync(join(process.cwd(), 'SKILL.md'), 'utf8')

  it('starts with the frontmatter fence', () => {
    expect(raw.startsWith('---\n')).toBe(true)
  })

  it('parses with the harness yaml parser', () => {
    expect(() => parse(frontmatterYaml(raw))).not.toThrow()
  })

  it('declares name and a non-empty description', () => {
    const data = parse(frontmatterYaml(raw)) as Record<string, unknown>
    expect(data.name).toBe('iui')
    expect(typeof data.description).toBe('string')
    expect((data.description as string).length).toBeGreaterThan(20)
    expect(data.description).toContain('Preserve conversation language')
    expect(data.description).toMatch(/HTML\/CSS\/JS|sandbox/i)
    expect(data.description).not.toMatch(/[\u3400-\u9fff]/u)
  })
})

describe('SKILL.md sandbox-first contract', () => {
  const raw = readFileSync(join(process.cwd(), 'SKILL.md'), 'utf8')

  it('requires iui-html fence contract and forbids legacy catalog / file writes', () => {
    expect(raw).toContain('```iui-html')
    expect(raw).toMatch(/不要写文件|不要先调 bash/)
    expect(raw).toMatch(/旧 ```iui 组件树|```json 冒充 UI/)
  })

  it('locks Nanjing map density (detail sheet) without freezing a city template', () => {
    expect(raw).toMatch(/点针或卡/)
    expect(raw).toMatch(/停留/)
    expect(raw).toMatch(/避坑/)
    expect(raw).toMatch(/不是冻成某一城的模版|禁止把三日南京布局/)
  })

  it('tells the model that onFrame receives a frame object, not a numeric index', () => {
    expect(raw).toContain('{progress, fromIndex, toIndex, fraction, activeStop, pinIndex, pinProgress}')
    expect(raw).toContain('onFrame:function(f){activate(f.pinIndex)}')
    expect(raw).toContain('参数不是数字下标')
  })

  it('tells the model to show onState\'s Chinese label and keep the English token', () => {
    expect(raw).toContain('onState 第一个参数是英文 token `playing`、`paused`、`complete`')
    expect(raw).toContain('第二个参数是显示用的中文标签「播放中」「已暂停」「已完成」')
  })
})
