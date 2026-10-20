// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildSandboxBridgeScript } from '../src/shared/html-sandbox'
import { buildAuthorJsRuntimeSource } from '../src/shared/author-js-runtime'

class FakeES {
  static all: FakeES[] = []
  onopen: (() => void) | null = null
  onmessage: ((ev: { data: string }) => void) | null = null
  onerror: (() => void) | null = null
  closed = false
  constructor(public url: string) { FakeES.all.push(this) }
  close() { this.closed = true }
}

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.resetModules(); FakeES.all = [] })

async function freshStore() {
  vi.useFakeTimers()
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ bindings: {} }), { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('EventSource', FakeES)
  const store = await import('../src/client/binding-store')
  return { store, fetchMock }
}

describe('F13 lazy binding watch', () => {
  it('does nothing until a page acquires it; stops 5 s after the last release', async () => {
    const { store, fetchMock } = await freshStore()
    store.setBindingSessionHint('s1')
    await vi.advanceTimersByTimeAsync(10_000)
    expect(FakeES.all.length).toBe(0)
    expect(fetchMock).not.toHaveBeenCalled()
    const states: boolean[] = []
    store.onBindingWatchActive((a) => states.push(a))
    const release = store.acquireBindingWatch()
    expect(store.isBindingWatchActive()).toBe(true)
    expect(FakeES.all.length).toBe(1)
    expect(FakeES.all[0]!.url).toContain('session=s1')
    release()
    await vi.advanceTimersByTimeAsync(4_000)
    expect(store.isBindingWatchActive()).toBe(true)
    await vi.advanceTimersByTimeAsync(1_500)
    expect(store.isBindingWatchActive()).toBe(false)
    expect(FakeES.all[0]!.closed).toBe(true)
    expect(states).toEqual([true, false])
  })

  it('SSE is primary: no polling while open, poll only after an error', async () => {
    const { store, fetchMock } = await freshStore()
    store.setBindingSessionHint('s1')
    const release = store.acquireBindingWatch()
    const es = FakeES.all[0]!
    es.onopen?.()
    fetchMock.mockClear()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(fetchMock).not.toHaveBeenCalled()
    es.onerror?.()
    await vi.advanceTimersByTimeAsync(2_600)
    expect(fetchMock).toHaveBeenCalled()
    fetchMock.mockClear()
    es.onopen?.()
    await vi.advanceTimersByTimeAsync(2_600)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(fetchMock).not.toHaveBeenCalled()
    release()
  })

  it('a session switch re-scopes SSE without a 1 s hint timer', async () => {
    const { store } = await freshStore()
    store.setBindingSessionHint('s1')
    const release = store.acquireBindingWatch()
    store.setBindingSessionHint('s2')
    expect(FakeES.all.length).toBe(2)
    expect(FakeES.all[0]!.closed).toBe(true)
    expect(FakeES.all[1]!.url).toContain('session=s2')
    release()
    const src = readFileSync(resolve(__dirname, '../src/client/binding-store.ts'), 'utf8')
    expect(src).not.toMatch(/setInterval\([^)]*\b1000\)/)
  })
})

describe('F13 bridge measurement', () => {
  const bridge = buildSandboxBridgeScript('f1')
  it('coalesces into one rAF and skips <2px changes', () => {
    expect(bridge).toContain('__iuiMeasureQueued')
    expect(bridge).toContain('Math.abs(h - __iuiLastHeight) < 2')
  })
  it('observes childList + characterData only (no attribute storms)', () => {
    expect(bridge).toContain('{ childList: true, subtree: true, characterData: true }')
    expect(bridge).not.toContain('characterData: true, attributes: true')
  })
  it('reads getComputedStyle only for the lowest child', () => {
    const m = bridge.slice(bridge.indexOf('function measureNow'), bridge.indexOf('function measure(force)'))
    expect(m.match(/getComputedStyle\(/g)?.length).toBe(2)
    expect(m).toContain('getComputedStyle(lowest)')
  })
  it('libraries load in parallel', () => {
    const rt = buildAuthorJsRuntimeSource()
    expect(rt).toContain('chain.forEach(function (fn)')
    expect(rt).not.toContain('chain[i++](step)')
  })
})
