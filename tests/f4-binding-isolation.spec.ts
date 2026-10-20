// F4: bindings are session-scoped — server requires `session`, client clears on switch.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import * as GenUI from '../src/plugin/index.ts'

type Handler = (req: unknown, res: unknown) => Promise<void>

async function bootRoute(): Promise<{ handler: Handler; dispose: () => Promise<void> }> {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  let handler: Handler | undefined
  ctx.provide('webServer', {
    register: (route: unknown) => { handler = (route as { handler: Handler }).handler; return () => {} },
  })
  const fork = await ctx.plugin(GenUI)
  return { handler: handler!, dispose: () => fork.dispose() }
}

function call(handler: Handler, url: string, headers: Record<string, string> = {}): Promise<{ status: number; body: string }> {
  return new Promise((resolve) => {
    let status = 0
    let body = ''
    const res = {
      writeHead: (s: number) => { status = s; return res },
      write: (c: string) => { body += String(c); return true },
      end: (c?: string | Buffer) => { if (c !== undefined) body += String(c); resolve({ status, body }) },
    }
    void handler({ method: 'GET', url, headers, on: () => {} }, res)
  })
}

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules() })

describe('F4 server: bindings require a session', () => {
  it('400 without session, 403 cross-site, 200 scoped', async () => {
    const { handler, dispose } = await bootRoute()
    try {
      expect((await call(handler, '/plugins/@losebird/iui/assets/bindings.json')).status).toBe(400)
      expect((await call(handler, '/plugins/@losebird/iui/assets/bindings.sse')).status).toBe(400)
      expect((await call(handler, '/plugins/@losebird/iui/assets/bindings.json?session=a', { 'sec-fetch-site': 'cross-site' })).status).toBe(403)
      const ok = await call(handler, '/plugins/@losebird/iui/assets/bindings.json?session=a')
      expect(ok.status).toBe(200)
      expect(JSON.parse(ok.body).sessionId).toBe('a')
    } finally { await dispose() }
  })
})

describe('F4 client: binding store is scoped to the viewed session', () => {
  it('fetches nothing without a session and clears the map on switch', async () => {
    const fetchMock = vi.fn(async (url: string) => ({
      ok: true,
      json: async () => ({ bindings: { k: String(url).includes('session=A') ? 'from-A' : 'from-B' }, appData: {} }),
    }))
    vi.stubGlobal('fetch', fetchMock)
    const store = await import('../src/client/binding-store.ts')
    await store.refreshBindings()
    expect(fetchMock).not.toHaveBeenCalled()
    store.setBindingSessionHint('A')
    await store.refreshBindings()
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('session=A')
    expect(store.getBindingsSnapshot()).toEqual({ k: 'from-A' })
    store.setBindingSessionHint('B')
    expect(store.getBindingsSnapshot()).toEqual({})
    await store.refreshBindings()
    expect(store.getBindingsSnapshot()).toEqual({ k: 'from-B' })
  })

  it('only frames that read host data get appData', async () => {
    const { usesHostData } = await import('../src/client/html-fence.tsx')
    expect(usesHostData('{"html":"<div data-iui-bind=\\"cpu\\"></div>"}')).toBe(true)
    expect(usesHostData('{"js":"window.addEventListener(\'iui-appdata\',f)"}')).toBe(true)
    expect(usesHostData('{"html":"<div>static</div>","js":"x()"}')).toBe(false)
  })
})
