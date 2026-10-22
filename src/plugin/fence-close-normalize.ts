import type { StreamChunk } from '@deepseek-ai/dsh-llm'

/**
 * Weak models (seen live: MiniMax M3.1 Flash) close an iui fence with the
 * section marker glued to the backticks — a line `---```` instead of `---`
 * then "```". Markdown keeps such a fence open, so the page never renders and
 * the referee asks for a full regeneration. Rewrite that line to a plain
 * closing fence while streaming (held back only inside an open iui fence).
 */
const OPEN = /^ {0,3}```[ \t]*(?:iui-html|iui-patch|iui|dsh-ui)[ \t]*$/u
const CLOSE = /^ {0,3}```[ \t]*$/u
const GLUED_CLOSE = /^[ \t]*-{3,}[ \t]*```[ \t]*$/u
/** A line start that can still grow into {@link GLUED_CLOSE}. */
const GLUED_PREFIX = /^[ \t]*-{1,}[ \t]*`{0,3}[ \t]*$/u

/** Line-oriented rewriter; feed text, get text back (may hold a short tail). */
export class FenceCloseNormalizer {
  private inFence = false
  /** Text of the current line already emitted. */
  private line = ''
  /** Start of the current line held back (only when `line` is empty). */
  private held = ''

  push(text: string): string {
    let out = ''
    let buf = this.held + text
    this.held = ''
    for (;;) {
      const nl = buf.indexOf('\n')
      if (nl < 0) break
      out += this.completeLine(buf.slice(0, nl)) + '\n'
      buf = buf.slice(nl + 1)
    }
    if (buf !== '') {
      if (this.inFence && this.line === '' && GLUED_PREFIX.test(buf)) this.held = buf
      else { this.line += buf; out += buf }
    }
    return out
  }

  /** End of stream / non-text chunk: release whatever is held. */
  flush(): string {
    const tail = this.held
    this.held = ''
    if (tail === '') return ''
    if (this.inFence && GLUED_CLOSE.test(tail)) {
      this.inFence = false
      this.line = '```'
      return '```'
    }
    this.line += tail
    return tail
  }

  private completeLine(segment: string): string {
    const full = this.line + segment
    const fresh = this.line === ''
    this.line = ''
    if (!this.inFence) {
      if (OPEN.test(full)) this.inFence = true
      return segment
    }
    if (CLOSE.test(full)) { this.inFence = false; return segment }
    if (fresh && GLUED_CLOSE.test(full)) { this.inFence = false; return '```' }
    return segment
  }
}

/** Stream wrapper around {@link FenceCloseNormalizer} for assistant text. */
export async function* normalizeFenceCloseStream(
  source: AsyncIterable<StreamChunk>,
): AsyncGenerator<StreamChunk> {
  const norm = new FenceCloseNormalizer()
  let index = 0
  for await (const chunk of source) {
    if (chunk.type === 'text-delta' && typeof chunk.text === 'string') {
      index = chunk.index
      const text = norm.push(chunk.text)
      if (text === chunk.text) yield chunk
      else if (text !== '') yield { ...chunk, text }
      continue
    }
    const tail = norm.flush()
    if (tail !== '') yield { type: 'text-delta', index, text: tail }
    yield chunk
  }
  const tail = norm.flush()
  if (tail !== '') yield { type: 'text-delta', index, text: tail }
}
