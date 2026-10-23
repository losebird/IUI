/**
 * Write replayable dsh sessions (event log v4) so the real host renders fixed
 * assistant messages through its own markdown pipeline — no model needed.
 *
 * Layout (dsh 0.2.x): $DSH_HOME/sessions/-<cwd with / → ->--/<session-id>/session.v4.jsonl.zstd,
 * one Zstandard frame per line with the content checksum on (the reader
 * validates frames; a single unchecked frame is silently dropped).
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { constants, zstdCompressSync } from 'node:zlib'

export type SeedSession = { title: string; user: string; markdown: string }

const frame = (line: string): Buffer => zstdCompressSync(Buffer.from(line + '\n'), { params: { [constants.ZSTD_c_checksumFlag]: 1 } })

/** Seed sessions under `cwd` (must be a realpath); returns ids in input order. */
export function seedSessions(home: string, cwd: string, sessions: readonly SeedSession[]): string[] {
  const dir = join(home, 'sessions', '-' + cwd.replace(/\//g, '-') + '--')
  // Oldest first so the sidebar (newest on top) lists them in reverse; we open by id anyway.
  let t = Date.now() - (sessions.length + 1) * 60_000
  return sessions.map((s) => {
    t += 60_000
    const id = `session-${randomUUID()}`
    const lines: unknown[] = [{ type: 'session', version: 4, id, createdAt: t, cwd, isSeeded: false, delegationDepth: 0, agentPreset: 'standard' }]
    let seq = 0
    const ev = (type: string, data: unknown, extra: Record<string, unknown> = {}): void => { lines.push({ type, seq, time: t + seq, data, ...extra }); seq++ }
    const usage = { inputTokens: 1, outputTokens: 1, totalTokens: 2, reasoningTokens: 0 }
    ev('permission/preset', { preset: 'workspace-write' })
    ev('sandbox/mode', { mode: 'workspace-write' })
    ev('approval/policy', { policy: 'ask' })
    ev('model/selection', { provider: 'deepseek-official', model: 'deepseek-flash', reasoningEffort: 'high' })
    ev('turn/start', { turn: 1 })
    ev('step/start', { turn: 1, step: 1 })
    ev('user/message', { content: [{ type: 'text', text: s.user }], source: { kind: 'user', rpcId: randomUUID(), clientTimeZone: 'UTC' }, role: 'user', id: randomUUID() }, { surfaceOp: 'append' })
    ev('session/title', { title: s.title, messageSeqs: [seq - 1], source: { kind: 'fallback' } })
    ev('assistant/message', {
      turn: 1, step: 1, usage,
      message: { role: 'assistant', id: randomUUID(), source: { kind: 'model', provider: 'fixture', model: 'fixture' }, content: [{ type: 'text', text: s.markdown }] },
      stream: [
        { type: 'chunk', time: t, chunk: { type: 'block-start', index: 0, blockType: 'text' } },
        { type: 'chunk', time: t, chunk: { type: 'block-end', index: 0, block: { type: 'text', text: s.markdown } } },
        { type: 'chunk', time: t, chunk: { type: 'usage', usage } },
        { type: 'chunk', time: t, chunk: { type: 'finish', reason: { kind: 'stop' } } },
      ],
    }, { surfaceOp: 'append' })
    ev('step/end', { turn: 1, step: 1 })
    ev('turn/end', { turn: 1, reason: { kind: 'completed' } })
    mkdirSync(join(dir, id), { recursive: true })
    writeFileSync(join(dir, id, 'session.v4.jsonl.zstd'), Buffer.concat(lines.map((l) => frame(JSON.stringify(l)))))
    return id
  })
}
