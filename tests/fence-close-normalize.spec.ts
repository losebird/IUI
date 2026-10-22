import { describe, expect, it } from 'vitest'
import type { StreamChunk } from '@deepseek-ai/dsh-llm'
import { FenceCloseNormalizer, normalizeFenceCloseStream } from '../src/plugin/fence-close-normalize.ts'
import { isPartialFenceOpener, matchesForbiddenFirstPrefix } from '../src/config/stream-heuristics.ts'

/** Feed text split at every possible boundary pattern and join the output. */
function run(parts: readonly string[]): string {
  const n = new FenceCloseNormalizer()
  return parts.map((p) => n.push(p)).join('') + n.flush()
}

const BODY = "```iui-html\n---html\n<div id=m></div>\n---js\nmap.invalidateSize();\n"

describe('glued ---``` fence close (live MiniMax)', () => {
  it('rewrites a glued close in one chunk', () => {
    expect(run([BODY + '---```\n\n地图使用 Esri'])).toBe(BODY + '```\n\n地图使用 Esri')
  })

  it('rewrites across every chunk boundary, including end of stream', () => {
    const text = BODY + '---```'
    for (let cut = 1; cut < text.length; cut++) {
      expect(run([text.slice(0, cut), text.slice(cut)])).toBe(BODY + '```')
    }
    const chars = [...(BODY + '---```\nok')]
    expect(run(chars)).toBe(BODY + '```\nok')
  })

  it('leaves section markers, normal closes and text outside fences alone', () => {
    const ok = BODY + '```\n---```\n'
    expect(run([ok])).toBe(ok)
    const chars = [...BODY, '-', '-', '-', 'c', 's', 's', '\n']
    expect(run(chars)).toBe(BODY + '---css\n')
    expect(run(['plain\n---```\n'])).toBe('plain\n---```\n')
  })

  it('stream wrapper keeps untouched chunks identical and flushes before block end', async () => {
    const chunks: StreamChunk[] = [
      { type: 'text-delta', index: 0, text: 'hi\n' },
      { type: 'text-delta', index: 0, text: BODY + '---' },
      { type: 'text-delta', index: 0, text: '```' },
      { type: 'finish', reason: 'stop' } as unknown as StreamChunk,
    ]
    async function* src() { yield* chunks }
    const out: StreamChunk[] = []
    for await (const c of normalizeFenceCloseStream(src())) out.push(c)
    expect(out[0]).toBe(chunks[0])
    const text = out.filter((c) => c.type === 'text-delta').map((c) => (c as { text: string }).text).join('')
    expect(text).toBe('hi\n' + BODY + '```')
    expect(out.at(-1)).toBe(chunks[3])
  })
})

describe('first-token watcher waits for a split opener', () => {
  it('treats opener prefixes as undecided', () => {
    for (const p of ['`', '``', '```', '```i', '```iui-ht', '  ```iui-pat']) {
      expect(isPartialFenceOpener(p)).toBe(true)
      expect(matchesForbiddenFirstPrefix(p)).toBe(false)
    }
    expect(isPartialFenceOpener('```iui-html')).toBe(false)
    expect(isPartialFenceOpener('```json')).toBe(false)
    expect(matchesForbiddenFirstPrefix('```json')).toBe(true)
    expect(matchesForbiddenFirstPrefix('好的，')).toBe(true)
  })
})
