import { afterEach, describe, expect, it } from 'vitest'
import {
  buildVendorImportMap,
  customCdnOrigin,
  isValidCdnTemplate,
  normalizeCdnPreset,
  vendorJsUrls,
  withVendorSource,
} from '../src/shared/vendor-registry.ts'
import { buildHtmlSandboxSrcdoc, isIuiSandboxHostMessage, parseHtmlSandboxFence } from '../src/shared/html-sandbox.ts'
import { buildAuthorJsRuntimeSource } from '../src/shared/author-js-runtime.ts'
import { getCdnSource, patchRuntimeConfigForTest, setCdnPresetOverride } from '../src/client/runtime-config.ts'
import { resolveLiveConfig } from '../src/plugin/config-schema.ts'

const BASE = 'https://dsh.example/plugins/iui/assets'

function doc(js: string, opts: Record<string, unknown> = {}): string {
  return buildHtmlSandboxSrcdoc(parseHtmlSandboxFence(JSON.stringify({ html: '<div id="m"></div>', css: '', js }))!, { frameId: 'f19', ...opts })
}

describe('F19 vendor source presets', () => {
  it('orders candidates per preset', () => {
    const hosts = (p: Parameters<typeof withVendorSource>[0]) => withVendorSource(p, () => vendorJsUrls('leaflet', BASE).map((u) => new URL(u).host))
    expect(hosts({ preset: 'local' })).toEqual(['dsh.example', 'cdn.jsdelivr.net', 'registry.npmmirror.com'])
    expect(hosts({ preset: 'china' })).toEqual(['dsh.example', 'registry.npmmirror.com', 'cdn.jsdelivr.net'])
    expect(hosts({ preset: 'global' })).toEqual(['cdn.jsdelivr.net', 'unpkg.com', 'dsh.example'])
    expect(hosts({ preset: 'custom', template: 'https://cdn.corp.cn/{name}@{version}/{file}' }))
      .toEqual(['cdn.corp.cn', 'dsh.example', 'cdn.jsdelivr.net', 'registry.npmmirror.com'])
  })

  it('expands the custom template and falls back to local for invalid ones', () => {
    const urls = withVendorSource({ preset: 'custom', template: 'https://cdn.corp.cn/{name}@{version}/{file}' }, () => vendorJsUrls('chart'))
    expect(urls[0]).toMatch(/^https:\/\/cdn\.corp\.cn\/chart\.js@4\.4\.1\/dist\//)
    expect(withVendorSource({ preset: 'custom', template: 'http://x.cn/{file}' }, () => vendorJsUrls('chart', BASE)[0]))
      .toContain('dsh.example')
  })

  it('validates templates and presets', () => {
    expect(isValidCdnTemplate('https://a.cn/{name}/{version}/{file}')).toBe(true)
    expect(isValidCdnTemplate('https://a.cn/{name}')).toBe(false)
    expect(isValidCdnTemplate('http://a.cn/{file}')).toBe(false)
    expect(isValidCdnTemplate('https://a.cn/{file}"><script>')).toBe(false)
    expect(normalizeCdnPreset('china')).toBe('china')
    expect(normalizeCdnPreset('mars')).toBe('auto')
    expect(normalizeCdnPreset('auto')).toBe('auto')
    expect(normalizeCdnPreset('local')).toBe('local')
    expect(customCdnOrigin({ preset: 'custom', template: 'https://a.cn:8443/{file}' })).toBe('https://a.cn:8443')
    expect(customCdnOrigin({ preset: 'china' })).toBeNull()
  })

  it('china importmap keeps three/gsap off esm.sh', () => {
    const map = withVendorSource({ preset: 'china' }, () => buildVendorImportMap()).imports
    expect(map.three).toContain('registry.npmmirror.com/three/')
    expect(map['three/addons/']).toContain('registry.npmmirror.com/three/')
    expect(map.gsap).toContain('registry.npmmirror.com/gsap/')
    const local = withVendorSource({ preset: 'local' }, () => buildVendorImportMap(BASE)).imports
    expect(local.three).toContain('dsh.example')
    expect(local.gsap).toBe(`${BASE}/vendor/gsap@3.12.5/index.js`)
    expect(local.d3).toBe(`${BASE}/vendor/iui-esm/d3@7.9.0.mjs`)
    expect(local['gsap/ScrollTrigger']).toBe(`${BASE}/vendor/gsap@3.12.5/ScrollTrigger.js`)
    const global = withVendorSource({ preset: 'global' }, () => buildVendorImportMap()).imports
    expect(global.gsap).toContain('cdn.jsdelivr.net/npm/gsap@3.12.5/')
  })

  it('srcdoc follows the source option and restores the default afterwards', () => {
    const custom = doc('L.map("m")', { cdnSource: { preset: 'custom', template: 'https://cdn.corp.cn/{name}@{version}/{file}' } })
    expect(custom).toMatch(/script-src[^;]*https:\/\/cdn\.corp\.cn/)
    expect(custom).toContain('"preset":"custom"')
    const china = doc('L.map("m")', { cdnSource: { preset: 'china' } })
    expect(china).toContain('leafletJsList')
    expect(china).toContain('"preset":"china"')
    expect(doc('L.map("m")')).toContain('"preset":"auto"')
  })

  it('accepts the switchCdn strip action', () => {
    expect(isIuiSandboxHostMessage({ source: 'iui-html', type: 'stripAction', frameId: 'a', action: 'switchCdn', detail: 'china' })).toBe(true)
    expect(isIuiSandboxHostMessage({ source: 'iui-html', type: 'stripAction', frameId: 'a', action: 'nuke' })).toBe(false)
  })

  it('runtime names the failing source and offers switch-and-retry', () => {
    const src = buildAuthorJsRuntimeSource()
    expect(() => new Function(src)).not.toThrow()
    expect(src).toContain('data-iui-lib-fail')
    expect(src).toContain('switchCdn')
    expect(src).toContain('切换国内源并重试')
    expect(src).toContain('LIB_SOURCE_TIMEOUT_MS = 8000')
  })
})

describe('F19 config + override', () => {
  afterEach(() => {
    try { globalThis.localStorage?.clear() } catch { /* no storage */ }
  })

  it('resolves config defaults', () => {
    expect(resolveLiveConfig({}).cdnPreset).toBe('auto')
    expect(resolveLiveConfig({}).mapTiles).toBe('auto')
    expect(resolveLiveConfig({ cdnPreset: 'china', cdnTemplate: '  https://a.cn/{file} ' })).toMatchObject({ cdnPreset: 'china', cdnTemplate: 'https://a.cn/{file}' })
    expect(resolveLiveConfig({ cdnPreset: 'bogus' }).cdnPreset).toBe('auto')
  })

  it('strip override applies until the configured preset changes', () => {
    patchRuntimeConfigForTest({ cdnPreset: 'local', cdnTemplate: '' })
    expect(getCdnSource().preset).toBe('local')
    setCdnPresetOverride('china')
    expect(getCdnSource().preset).toBe('china')
    patchRuntimeConfigForTest({ cdnPreset: 'global' })
    expect(getCdnSource().preset).toBe('global')
  })
})
