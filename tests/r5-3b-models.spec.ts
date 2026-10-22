/**
 * R5-3b: bundled CC0 models (offline / mainland-safe), download stall + overall timeouts,
 * the `kind=model` proxy for hosts outside connect-src, offline-export model inlining and
 * node-hotspot framing.
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import { buildHtmlSandboxSrcdoc, type HtmlSandboxSpec } from '../src/shared/html-sandbox.ts'
import { BUNDLED_MODEL_NPM, buildStage3dRuntimeScript, bundledModelBases, parseModelRef, stage3dRuntimeConfig } from '../src/shared/stage3d-runtime.ts'
import { BUNDLED_MODELS, BUNDLED_MODELS_DIR, bundledModel, preferBundled, rankHits, resetPolyhavenCache, searchBundled, searchKhronos } from '../src/shared/model-catalog.ts'
import { createFind3dModelsTool } from '../src/plugin/model-search-tool.ts'
import { setNetworkProbeForTest } from '../src/shared/network-probe.ts'
import { withVendorSource } from '../src/shared/vendor-registry.ts'
import { IUI_VERSION } from '../src/shared/version.ts'
import { MODEL_PROXY_MAX_BYTES, PROXY_MAX_BYTES, modelProxyType, serveResourceProxy } from '../src/plugin/resource-proxy.ts'
import { buildOfflineExport, inlineGltfJson, stageModelRefs, type ExportFetcher } from '../src/client/offline-export.ts'
import { buildTestGlb } from '../scripts/test-glb.mts'

const BASE = 'http://127.0.0.1:5140/iui/assets'
const spec = (html: string): HtmlSandboxSpec => ({ title: 't', css: '', html, js: '', stages: ['html', 'js'], partial: false, cssComplete: true, htmlComplete: true, jsComplete: true }) as HtmlSandboxSpec

afterEach(() => { resetPolyhavenCache(); setNetworkProbeForTest(null) })

describe('R5-3b bundled models', () => {
  it('every bundled file exists, is a GLB, matches its catalog size and is credited', () => {
    const readme = readFileSync('assets/models/README.md', 'utf8')
    const notice = readFileSync('NOTICE', 'utf8')
    expect(BUNDLED_MODELS.length).toBe(11)
    let total = 0
    for (const b of BUNDLED_MODELS) {
      const f = `assets/models/${b.file}`
      expect(existsSync(f), b.file).toBe(true)
      const buf = readFileSync(f)
      expect(buf.subarray(0, 4).toString('latin1')).toBe('glTF')
      expect(Math.abs(buf.byteLength / 1024 - b.kb)).toBeLessThan(b.kb * 0.02 + 2)
      expect(buf.byteLength).toBeLessThan(1024 * 1024)
      expect(readme).toContain('`' + b.ref + '`')
      expect(parseModelRef(b.ref)?.kind).toMatch(/^(polyhaven|khronos)$/)
      total += buf.byteLength
    }
    expect(total / 1048576).toBeLessThan(4.5)
    expect(notice).toContain('iui-models@1')
    expect(notice).toMatch(/CC0/)
  })

  it('the build copies them under lib/assets/vendor and the asset route serves .glb', () => {
    const vendorScript = readFileSync('scripts/vendor-assets.mjs', 'utf8')
    expect(vendorScript).toContain('assets/models')
    const pack = readFileSync('scripts/verify-pack.mjs', 'utf8')
    expect(pack).toContain(`lib/assets/vendor/${BUNDLED_MODELS_DIR}/ArmChair_01.glb`)
    const src = readFileSync('src/plugin/index.ts', 'utf8')
    const reSrc = /const VENDOR_FILE_RE = (\/.+\/i)\n/.exec(src)![1]!
    const re = new Function(`return ${reSrc}`)() as RegExp
    expect(re.exec(`vendor/${BUNDLED_MODELS_DIR}/ArmChair_01.glb`)?.[1]).toBe('glb')
    expect(re.test('vendor/iui-models@1/../x.glb')).toBe(true) // the handler still rejects `..` segments
    expect(src).toContain("glb: 'model/gltf-binary'")
    expect(src).toMatch(/seg === '\.\.'/)
    const lib = `lib/assets/vendor/${BUNDLED_MODELS_DIR}/ToyCar.glb`
    if (existsSync(lib)) expect(statSync(lib).size).toBe(statSync('assets/models/ToyCar.glb').size)
  })

  it('bases: plugin route first, then npmmirror / jsDelivr copies of this package', () => {
    const file = `lib/assets/vendor/${BUNDLED_MODELS_DIR}/`
    expect(bundledModelBases(BASE)).toEqual([
      `${BASE}/vendor/${BUNDLED_MODELS_DIR}/`,
      `https://registry.npmmirror.com/${BUNDLED_MODEL_NPM}/${IUI_VERSION}/files/${file}`,
      `https://cdn.jsdelivr.net/npm/${BUNDLED_MODEL_NPM}@${IUI_VERSION}/${file}`,
    ])
    expect(bundledModelBases()).toHaveLength(2)
    const global = withVendorSource({ preset: 'global' }, () => bundledModelBases(BASE))
    expect(global[0]).toContain('/vendor/iui-models@')
    expect(global[1]).toContain('cdn.jsdelivr.net')
  })

  it('runtime config: lowercase bundled map, proxy only with an asset route, timeouts', () => {
    const c = stage3dRuntimeConfig({ assetBase: BASE + '/' })
    expect(c.bundled['polyhaven:armchair_01']).toBe('ArmChair_01.glb')
    expect(c.bundled['khronos:toycar']).toBe('ToyCar.glb')
    expect(c.proxy).toBe(`${BASE}/proxy`)
    expect(c.direct).toContain('http://127.0.0.1:5140')
    expect(c.direct).toContain('https://dl.polyhaven.org')
    expect(c.stallMs).toBe(15_000)
    expect(c.totalMs).toBe(90_000)
    expect(stage3dRuntimeConfig().proxy).toBe('')
    expect(bundledModel('POLYHAVEN:armchair_01')?.file).toBe('ArmChair_01.glb')
    expect(bundledModel('polyhaven:nope')).toBeUndefined()
  })

  it('runtime script: parses, tries inline → bundled → remote, has stall/total timers', () => {
    const s = buildStage3dRuntimeScript({ assetBase: BASE })
    const js = s.replace(/^<script>/, '').replace(/<\/script>\s*$/, '')
    expect(() => new Function(js)).not.toThrow()
    expect(js).toContain('__iuiModelInline')
    expect(js).toContain("why = 'stalled'")
    expect(js).toContain("why = 'timeout'")
    expect(js).toContain("'?kind=model&u='")
    expect(js).toContain('loader.parse(buf')
    expect(js.indexOf('CFG.bundled[mkey]')).toBeLessThan(js.indexOf('await resolveModel(spec)'))
    expect(js).not.toContain('loader.load(')
    // node hotspots frame the part: 0.5–1.2 × home distance
    expect(js).toContain('home.dist * 1.2')
    expect(js).toContain('home.dist * 0.5')
    const doc = buildHtmlSandboxSrcdoc(spec(`<div data-iui-3d='{"model":"polyhaven:ArmChair_01"}'></div>`), { frameId: 'x', assetBase: BASE } as never)
    expect(doc).toContain(`"bases":["${BASE}/vendor/${BUNDLED_MODELS_DIR}/"`)
    expect(doc).toContain(`"proxy":"${BASE}/proxy"`)
    expect(/connect-src[^;]*http:\/\/127\.0\.0\.1:5140/.test(doc)).toBe(true)
  })
})

describe('R5-3b find_3d_models prefers bundled', () => {
  it('searchBundled + preferBundled mark and rank shipped copies first', () => {
    expect(searchBundled('小黄鸭')[0]?.model).toBe('polyhaven:rubber_duck_toy')
    expect(searchBundled('台灯')[0]?.model).toBe('polyhaven:desk_lamp_arm_01')
    const merged = preferBundled([...searchKhronos('toy car'), ...searchBundled('toy car')])
    const car = merged.filter((h) => h.model === 'khronos:ToyCar')
    expect(car).toHaveLength(1)
    expect(car[0]!.bundled).toBe(true)
    expect(car[0]!.sizeMb).toBeLessThan(1)
    const top = rankHits(preferBundled([...searchKhronos('vase'), ...searchBundled('vase')]), 2)
    expect(top[0]!.model).toBe('polyhaven:antique_ceramic_vase_01')
  })

  it('tool output says bundled=yes and still answers when Poly Haven is unreachable', async () => {
    setNetworkProbeForTest({ at: Date.now(), results: [{ id: 'models', ok: false, ms: 2000 }] })
    const calls: string[] = []
    const out = String(await createFind3dModelsTool({ fetchJson: async (u: string) => { calls.push(u); throw new Error('x') } }).execute({ query: 'armchair' } as never, {} as never))
    expect(calls).toEqual([])
    expect(out).toContain('status=ok')
    expect(out).toContain('model=polyhaven:ArmChair_01')
    expect(out).toContain('bundled=yes')
    expect(out).toContain('only bundled models and Khronos samples')
  })
})

function fakeRes() {
  const r = { status: 0, headers: {} as Record<string, string>, body: Buffer.alloc(0), headersSent: false,
    writeHead(s: number, h: Record<string, string>) { r.status = s; r.headers = h; r.headersSent = true; return r },
    write(b: Buffer) { r.body = Buffer.concat([r.body, Buffer.from(b)]); return true },
    end(b?: string | Buffer) { if (b) r.body = Buffer.concat([r.body, Buffer.from(b)]) } }
  return r
}
const req = (u: string) => ({ method: 'GET', url: u }) as never
const pub = async () => ['93.184.216.34']

describe('R5-3b model proxy', () => {
  const glb = Buffer.from(buildTestGlb())
  it('sniffs GLB / glTF JSON / .bin / images; rejects html and arbitrary JSON', () => {
    expect(modelProxyType('application/octet-stream', '/m/box.glb', glb)).toBe('model/gltf-binary')
    expect(modelProxyType('text/plain', '/m/a.gltf', Buffer.from(' {"asset":{"version":"2.0"}}'))).toBe('model/gltf+json')
    expect(modelProxyType('application/octet-stream', '/m/a.bin', Buffer.from([1, 2, 3]))).toBe('application/octet-stream')
    expect(modelProxyType('image/webp', '/m/t.webp', Buffer.from([1]))).toBe('image/webp')
    expect(modelProxyType('application/json', '/data.json', Buffer.from('{"secret":1}'))).toBeNull()
    expect(modelProxyType('text/html', '/x', Buffer.from('<html>'))).toBeNull()
    expect(MODEL_PROXY_MAX_BYTES).toBeGreaterThan(PROXY_MAX_BYTES)
  })

  it('kind=model serves a GLB the image proxy would refuse', async () => {
    const fetch = (async () => new Response(glb, { status: 200, headers: { 'content-type': 'application/octet-stream' } })) as never
    const u = encodeURIComponent('https://models.example.org/box.glb')
    const a = fakeRes()
    await serveResourceProxy(req(`/proxy?kind=model&u=${u}`), a as never, { fetch, resolve: pub })
    expect(a.status).toBe(200)
    expect(a.headers['content-type']).toBe('model/gltf-binary')
    expect(a.headers['access-control-allow-origin']).toBe('*')
    expect(a.body.byteLength).toBe(glb.byteLength)
    const b = fakeRes()
    await serveResourceProxy(req(`/proxy?u=${u}`), b as never, { fetch, resolve: pub })
    expect(b.status).toBe(415)
  })

  it('kind=model keeps the SSRF guard and refuses html', async () => {
    const html = (async () => new Response('<html></html>', { status: 200, headers: { 'content-type': 'text/html' } })) as never
    const a = fakeRes()
    await serveResourceProxy(req(`/proxy?kind=model&u=${encodeURIComponent('https://x.example.org/a.glb')}`), a as never, { fetch: html, resolve: pub })
    expect(a.status).toBe(415)
    const b = fakeRes()
    await serveResourceProxy(req(`/proxy?kind=model&u=${encodeURIComponent('http://127.0.0.1/a.glb')}`), b as never, { fetch: html, resolve: pub })
    expect(b.status).toBe(400)
    const c = fakeRes()
    await serveResourceProxy(req(`/proxy?kind=model&u=${encodeURIComponent('https://intranet.example.org/a.glb')}`), c as never, { fetch: html, resolve: async () => ['10.0.0.5'] })
    expect(c.status).toBe(403)
  })
})

describe('R5-3b offline export inlines models', () => {
  const glb = buildTestGlb()
  it('finds model refs in data-iui-3d attributes and script literals', () => {
    const html = `<div data-iui-3d='{"model":"polyhaven:ArmChair_01"}'></div><div data-iui-3d="khronos:ToyCar"></div><div data-iui-3d="torusKnot"></div>
<div data-iui-3d="{&quot;model&quot;:&quot;https://x.example.org/a.glb&quot;}"></div><script>iuiStage3d.mount(el, { model: 'polyhaven:boombox' })</script>`
    expect(stageModelRefs(html)).toEqual(['polyhaven:ArmChair_01', 'khronos:ToyCar', 'https://x.example.org/a.glb', 'polyhaven:boombox'])
  })

  it('bundled ref → data:model/gltf-binary from the plugin route; proxy blanked; model folder → this package', async () => {
    const doc = buildHtmlSandboxSrcdoc(spec(`<div data-iui-3d='{"model":"polyhaven:ArmChair_01"}'></div>`), { frameId: 'x', assetBase: BASE } as never)
    const asked: string[] = []
    const fetcher: ExportFetcher = async (url, as) => {
      asked.push(url)
      if (url === `${BASE}/vendor/${BUNDLED_MODELS_DIR}/ArmChair_01.glb` && as === 'bytes') return { body: glb, type: 'model/gltf-binary' }
      return as === 'text' ? { body: '', type: 'text/javascript' } : null
    }
    const r = await buildOfflineExport(doc, [], { assetBase: BASE, fetcher })
    expect(asked).toContain(`${BASE}/vendor/${BUNDLED_MODELS_DIR}/ArmChair_01.glb`)
    expect(r.inlined).toContain('polyhaven:ArmChair_01')
    expect(r.html).toMatch(/window\.__iuiModelInline = \{"polyhaven:ArmChair_01":"data:model\/gltf-binary;base64,/)
    expect(r.html.indexOf('__iuiModelInline')).toBeLessThan(r.html.indexOf('var CFG ='))
    expect(r.html).toContain('"proxy":""')
    expect(r.html).not.toContain(BASE)
    expect(r.html).toContain(`https://cdn.jsdelivr.net/npm/${BUNDLED_MODEL_NPM}@${IUI_VERSION}/lib/assets/vendor/${BUNDLED_MODELS_DIR}/`)
    expect(r.html).not.toContain(`https://cdn.jsdelivr.net/npm/${BUNDLED_MODELS_DIR}/`)
  })

  it('polyhaven (not bundled) → glTF JSON with textures/buffers as data: URIs', async () => {
    const gltf = { asset: { version: '2.0' }, buffers: [{ uri: 'x.bin', byteLength: 3 }], images: [{ uri: 'textures/a.jpg' }] }
    const fetcher: ExportFetcher = async (url, as) => {
      if (url === 'https://api.polyhaven.com/files/old_chair') return { body: JSON.stringify({ gltf: { '1k': { gltf: { url: 'https://dl.polyhaven.org/m/old_chair/old_chair_1k.gltf', include: { 'x.bin': { url: 'https://dl.polyhaven.org/m/old_chair/x.bin' }, 'textures/a.jpg': { url: 'https://dl.polyhaven.org/t/a_1k.jpg' } } } } } }), type: 'application/json' }
      if (url.endsWith('old_chair_1k.gltf')) return { body: JSON.stringify(gltf), type: 'model/gltf+json' }
      if (url.endsWith('x.bin')) return { body: new Uint8Array([1, 2, 3]), type: 'application/octet-stream' }
      if (url.endsWith('a_1k.jpg')) return { body: new Uint8Array([0xff, 0xd8]), type: 'image/jpeg' }
      return as === 'text' ? { body: '', type: '' } : null
    }
    const doc = `<html><head><meta http-equiv="Content-Security-Policy" content="script-src 'self'"></head><body><div data-iui-3d='{"model":"polyhaven:old_chair"}'></div><script>1</script></body></html>`
    const r = await buildOfflineExport(doc, [{ url: 'https://dl.polyhaven.org/t/a_1k.jpg', type: 'fetch' }], { fetcher })
    const uri = /"polyhaven:old_chair":"(data:model\/gltf\+json;base64,[^"]+)"/.exec(r.html)![1]!
    const json = JSON.parse(Buffer.from(uri.split(',')[1]!, 'base64').toString('utf8'))
    expect(json.buffers[0].uri).toBe('data:application/octet-stream;base64,AQID')
    expect(json.images[0].uri).toMatch(/^data:image\/jpeg;base64,/)
    // the texture the stage fetched is not inlined a second time as a page image
    expect(r.html).not.toContain('__iuiOfflineAssets = {"https://dl.polyhaven.org')
  })

  it('a model over the size budget is skipped (listed as failed), the page still exports', async () => {
    const big = new Uint8Array(400_000); big.set([0x67, 0x6c, 0x54, 0x46])
    const fetcher: ExportFetcher = async (url, as) => (as === 'bytes' && url.endsWith('.glb') ? { body: big, type: 'model/gltf-binary' } : null)
    const doc = `<html><body><div data-iui-3d='{"model":"https://x.example.org/big.glb"}'></div></body></html>`
    const r = await buildOfflineExport(doc, [], { fetcher, maxBytes: 600_000 })
    expect(r.failed).toContain('https://x.example.org/big.glb')
    expect(r.html).not.toContain('__iuiModelInline')
    expect(r.tooLarge).toBe(false)
    const ok = await buildOfflineExport(doc, [], { fetcher, maxBytes: 2_000_000 })
    expect(ok.inlined).toContain('https://x.example.org/big.glb')
  })

  it('inlineGltfJson refuses non-glTF JSON', async () => {
    expect(await inlineGltfJson('{"a":1}', 'https://x.org/a.gltf', async () => null)).toBeNull()
    expect(await inlineGltfJson('not json', 'https://x.org/a.gltf', async () => null)).toBeNull()
  })
})
