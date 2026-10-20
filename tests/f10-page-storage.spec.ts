import { describe, expect, it, vi } from 'vitest'
import {
  PAGE_STATE_QUOTA_BYTES,
  pageStateKey,
  peekPageState,
  loadPageState,
  updatePageState,
  sanitizeStorageItems,
  clearAllPageState,
} from '../src/client/page-storage'
import {
  buildHtmlSandboxSrcdoc,
  buildSandboxBridgeScript,
  buildStorageSeedScript,
  isIuiSandboxFrameCommand,
} from '../src/shared/html-sandbox'

describe('F10 page storage keys', () => {
  it('scopes keys by session + stable fence key', () => {
    expect(pageStateKey('s1', 'html:abc')).toBe('iui:state:s1:html:abc')
    expect(pageStateKey(undefined, 'html:abc')).toBeNull()
    expect(pageStateKey('s1', undefined)).toBeNull()
    expect(pageStateKey('s1', 'dom:unknown:3')).toBeNull()
  })
})

describe('F10 memory LRU + quota', () => {
  it('stores, merges and peeks synchronously', async () => {
    await clearAllPageState()
    expect(updatePageState('k1', { items: { a: '1' } }, { persist: false })).toBe(true)
    expect(updatePageState('k1', { dom: { '#x': { value: 'y' } } }, { persist: false })).toBe(true)
    const rec = peekPageState('k1')
    expect(rec?.items).toEqual({ a: '1' })
    expect(rec?.dom).toEqual({ '#x': { value: 'y' } })
    expect((await loadPageState('k1')).items).toEqual({ a: '1' })
  })

  it('rejects writes over the per-page quota without clobbering', async () => {
    await clearAllPageState()
    updatePageState('q', { items: { a: 'small' } }, { persist: false })
    const big = 'x'.repeat(PAGE_STATE_QUOTA_BYTES + 10)
    expect(updatePageState('q', { items: { a: big } }, { persist: false })).toBe(false)
    expect(peekPageState('q')?.items).toEqual({ a: 'small' })
  })

  it('evicts least-recently-used entries beyond 50', async () => {
    await clearAllPageState()
    for (let i = 0; i < 51; i++) updatePageState(`lru${i}`, { items: { i: String(i) } }, { persist: false })
    expect(peekPageState('lru0')).toBeUndefined()
    expect(peekPageState('lru50')?.items).toEqual({ i: '50' })
  })

  it('loadPageState falls back to {} without IndexedDB', async () => {
    await clearAllPageState()
    expect(await loadPageState('missing')).toEqual({})
  })

  it('persist path is debounced and harmless without IndexedDB', async () => {
    vi.useFakeTimers()
    try {
      expect(updatePageState('p', { items: { a: '1' } })).toBe(true)
      vi.advanceTimersByTime(400)
    } finally {
      vi.useRealTimers()
    }
    expect(peekPageState('p')?.items).toEqual({ a: '1' })
  })
})

describe('F10 frame message validation', () => {
  it('keeps only string→string items', () => {
    expect(sanitizeStorageItems({ a: '1', b: 2, c: null })).toEqual({ a: '1' })
    expect(sanitizeStorageItems(['a'])).toBeNull()
    expect(sanitizeStorageItems(null)).toBeNull()
  })

  it('accepts storageInit / storageQuota host messages', () => {
    expect(isIuiSandboxFrameCommand({ source: 'iui-html-host', type: 'storageInit', frameId: 'f', items: {} })).toBe(true)
    expect(isIuiSandboxFrameCommand({ source: 'iui-html-host', type: 'storageQuota', frameId: 'f', limit: 1 })).toBe(true)
  })
})

describe('F10 srcdoc seeding', () => {
  it('inlines a script-safe seed before the bridge', () => {
    const doc = buildHtmlSandboxSrcdoc({ html: '<p>hi</p>', css: '', js: '' }, {
      frameId: 'f1',
      storageSeed: { todo: '</script><script>alert(1)</script>' },
    } as never)
    const seedAt = doc.indexOf('window.__iuiStorageSeed=')
    expect(seedAt).toBeGreaterThan(-1)
    expect(doc).not.toContain('</script><script>alert(1)')
    expect(seedAt).toBeLessThan(doc.indexOf('iuiSandbox'))
  })

  it('escapes U+2028/2029 and < in seed JSON', () => {
    const tag = buildStorageSeedScript({ k: '<\u2028\u2029' })
    expect(tag).toContain('\\u003c')
    expect(tag).toContain('\\u2028')
    expect(tag).toContain('\\u2029')
  })

  it('bridge exposes localStorage shim + iuiSandbox.storage', () => {
    const bridge = buildSandboxBridgeScript('f1')
    expect(bridge).toContain('__iuiStorageSeed')
    expect(bridge).toContain('storageSet')
    expect(bridge).toContain('__iuiStorageInit')
  })
})
