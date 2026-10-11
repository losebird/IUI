import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import * as GenUI from '../src/plugin/index.ts'

/** Boot the plugin and return the assembled system-prompt sections. */
async function assemble() {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(GenUI)
  return ctx.systemPrompt.assemble({})
}

/** The complete whitelist the slim fence section must still advertise. */
const WHITELISTED_COMPONENT_TYPES = [
  'text', 'row', 'col', 'grid', 'card',
  'button', 'input', 'textarea', 'select', 'checkbox', 'switch', 'slider', 'radio', 'submit', 'quiz', 'link',
  'badge', 'stat', 'progress', 'divider', 'spacer', 'list', 'table', 'audio', 'video',
  'chart', 'tabs', 'accordion', 'avatar', 'plot', 'callout', 'steps',
  'keyvalue', 'json', 'code', 'diff', 'copy',
  'mermaid', 'scene3d', 'timeline', 'file-tree', 'breadcrumb',
] as const

const BROKEN_FENCE_REPLY = '```dsh-ui\n{"items":[{"type":"stat"}]}\n```'

/** 将已经结束的 assistant 回复写入真实 Cordis Context。 */
function emitAssistantReply(ctx: Context, session: object): void {
  ctx.emit('session/event', session as never, {
    type: 'assistant/message',
    seq: 1,
    time: 1,
    data: { message: { content: [{ type: 'text', text: BROKEN_FENCE_REPLY }] } },
  } as never)
}

/** 触发允许插件请求修正的回合结束事件。 */
function emitTurnStopping(ctx: Context, session: object, steer: () => void): void {
  ctx.emit('agent/turn-stopping', {
    agent: { session, steer },
    turn: 1,
    signal: new AbortController().signal,
  } as never)
}

describe('genui:fence section', () => {
  it('registers the dsh-ui fence language section', async () => {
    const assembly = await assemble()
    const names = assembly.sections.map(s => s.name)
    expect(names).toContain('iui:fence')
  })



  it('sorts the section among the tool-guidance sections', async () => {
    const assembly = await assemble()
    const names = assembly.sections.map(s => s.name)
    // The section lands among the tool-guidance band, not at the harness identity head.
    const index = names.indexOf('iui:fence')
    expect(index).toBeGreaterThan(0)
  })

  it('uses the named host order and deterministic tie-break for structured output', async () => {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    const order = ctx.systemPrompt.getSectionOrder('STRUCTURED_OUTPUT')
    const getSectionOrder = vi.spyOn(ctx.systemPrompt, 'getSectionOrder')
    ctx.systemPrompt.section({ name: 'aaa:structured-output', order, text: 'before' })

    await ctx.plugin(GenUI)
    const names = (await ctx.systemPrompt.assemble({})).sections.map(section => section.name)

    expect(getSectionOrder).toHaveBeenCalledWith('STRUCTURED_OUTPUT')
    expect(names.indexOf('aaa:structured-output')).toBeLessThan(names.indexOf('iui:fence'))
  })




  it('registers iui when the real skill service binds after the plugin', async () => {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(GenUI)
    await ctx.plugin(SkillRegistry)

    expect((await ctx.skills.list()).find(skill => skill.name === 'iui')).toMatchObject({
      name: 'iui',
      provider: 'iui',
      source: 'bundled',
    })
    expect(await ctx.skills.get('iui')).toBeDefined()
  })

  it('keeps the fence channel without a tools service', async () => {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(GenUI)
    const assembly = await ctx.systemPrompt.assemble({})
    expect(assembly.sections.map(s => s.name)).toContain('iui:fence')
  })


  it('allows final fence feedback to be disabled explicitly', async () => {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    const genui = await ctx.plugin(GenUI, { fenceFeedback: false })
    const session = { id: 'disabled-feedback', header: { id: 'disabled-feedback' }, snapshotEvents: () => [] }
    let steerCalls = 0
    const steer = () => { steerCalls += 1 }
    emitAssistantReply(ctx, session)
    emitTurnStopping(ctx, session, steer)
    expect(steerCalls).toBe(0)
    await genui.dispose()
  })

  it('removes the asset route before a plugin reload', async () => {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    const routes = new Map<string, unknown>()
    ctx.provide('webServer', {
      register: (route: unknown) => {
        const path = (route as { path: string }).path
        if (routes.has(path)) throw new Error(`duplicate route: ${path}`)
        routes.set(path, route)
        return () => { routes.delete(path) }
      },
    })

    const first = await ctx.plugin(GenUI)
    expect([...routes.keys()]).toEqual(['/plugins/@losebird/iui/assets'])

    await first.dispose()
    expect(routes.size).toBe(0)

    const second = await ctx.plugin(GenUI)
    expect([...routes.keys()]).toEqual(['/plugins/@losebird/iui/assets'])
    await second.dispose()
    expect(routes.size).toBe(0)
  })

  it('moves the asset route when the optional webServer is replaced', async () => {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    const genui = await ctx.plugin(GenUI)
    const firstRoutes = new Map<string, unknown>()
    const disposeFirstServer = ctx.provide('webServer', {
      register: (route: unknown) => {
        const path = (route as { path: string }).path
        firstRoutes.set(path, route)
        return () => { firstRoutes.delete(path) }
      },
    })
    await vi.waitFor(() => {
      expect(firstRoutes.get('/plugins/@losebird/iui/assets')).toEqual(expect.objectContaining({ kind: 'prefix' }))
    })

    await disposeFirstServer()
    expect(firstRoutes.size).toBe(0)

    const replacementRoutes = new Map<string, unknown>()
    ctx.provide('webServer', {
      register: (route: unknown) => {
        const path = (route as { path: string }).path
        replacementRoutes.set(path, route)
        return () => { replacementRoutes.delete(path) }
      },
    })
    await vi.waitFor(() => {
      expect(replacementRoutes.get('/plugins/@losebird/iui/assets')).toEqual(expect.objectContaining({ kind: 'prefix' }))
    })

    await genui.dispose()
    expect(replacementRoutes.size).toBe(0)
  })
})
