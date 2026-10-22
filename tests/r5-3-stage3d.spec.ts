/**
 * R5-3 host 3D stage + CC0 model search: model refs, runtime injection/CSP, vendored loaders,
 * Poly Haven / Khronos search (mocked fetch), find_3d_models output, starter + prompt wiring.
 */
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import { buildHtmlSandboxSrcdoc, type HtmlSandboxSpec } from '../src/shared/html-sandbox.ts'
import { buildStage3dRuntimeScript, KHRONOS_SAMPLE_COMMIT, MODEL_CONNECT_ORIGINS, pageWants3d, parseModelRef, STAGE3D_SHAPES } from '../src/shared/stage3d-runtime.ts'
import { KHRONOS_CC0, queryTerms, rankHits, resetPolyhavenCache, searchKhronos, searchPolyhaven } from '../src/shared/model-catalog.ts'
import { createFind3dModelsTool } from '../src/plugin/model-search-tool.ts'
import { setNetworkProbeForTest } from '../src/shared/network-probe.ts'
import { VENDOR_LIBS } from '../src/shared/vendor-registry.ts'
import { getStreamHeuristics, isToolBeforeFenceName } from '../src/config/stream-heuristics.ts'
import { PATTERN_STARTERS } from '../src/shared/pattern-starters.ts'
import { buildTestGlb } from '../scripts/test-glb.mts'

const spec = (html: string, js = ''): HtmlSandboxSpec => ({ title: 't', css: '', html, js, stages: ['html', 'js'], partial: false, cssComplete: true, htmlComplete: true, jsComplete: true }) as HtmlSandboxSpec

const POLY_INDEX = {
  ArmChair_01: { name: 'Arm Chair 01', type: 2, tags: ['chair', 'armchair', 'seat'], categories: ['furniture', 'seating'], authors: { 'Jane Doe': 'All' }, dimensions: [800, 900, 750], polycount: 9000 },
  potted_plant_01: { name: 'Potted Plant 01', type: 2, tags: ['plant', 'pot', 'indoor'], categories: ['plants'], authors: { 'A B': 'All' }, polycount: 20000 },
  brick_wall: { name: 'Brick Wall', type: 1, tags: ['chair'] },
}
const POLY_FILES = { gltf: { '1k': { gltf: { size: 200_000, include: { 'textures/a.jpg': { size: 300_000 }, 'a.bin': { size: 548_576 } } } } } }
function mockFetch(calls: string[] = []) {
  return async (url: string): Promise<unknown> => {
    calls.push(url)
    if (url.includes('/assets?t=models')) return POLY_INDEX
    if (url.includes('/files/')) return POLY_FILES
    throw new Error('unexpected ' + url)
  }
}

afterEach(() => { resetPolyhavenCache(); setNetworkProbeForTest(null) })

describe('R5-3 model refs + runtime', () => {
  it('parses polyhaven / khronos / url refs and rejects junk', () => {
    expect(parseModelRef('polyhaven:ArmChair_01')).toEqual({ kind: 'polyhaven', id: 'ArmChair_01' })
    const k = parseModelRef('khronos:ToyCar')!
    expect(k.kind).toBe('khronos')
    if (k.kind === 'khronos') {
      expect(k.urls[0]).toBe(`https://cdn.jsdelivr.net/gh/KhronosGroup/glTF-Sample-Assets@${KHRONOS_SAMPLE_COMMIT}/Models/ToyCar/glTF-Binary/ToyCar.glb`)
      expect(k.urls[1]).toContain('raw.githubusercontent.com')
    }
    expect(parseModelRef('https://x.test/a.glb')).toEqual({ kind: 'url', url: 'https://x.test/a.glb' })
    expect(parseModelRef('http://x.test/a.glb')).toBeNull()
    expect(parseModelRef('polyhaven:../../etc')).toBeNull()
    expect(parseModelRef('javascript:alert(1)')).toBeNull()
  })
  it('pageWants3d: attribute / API / streaming shells only', () => {
    expect(pageWants3d('<div data-iui-3d=\'{"shape":"box"}\'></div>', false)).toBe(true)
    expect(pageWants3d('window.iuiStage3d(el,{})', false)).toBe(true)
    expect(pageWants3d('<div data-iui-3d-ready></div>', false)).toBe(false)
    expect(pageWants3d('<p>hi</p>', false)).toBe(false)
    expect(pageWants3d('<p>hi</p>', true)).toBe(true)
  })
  it('runtime script compiles and mirrors the shared constants', () => {
    const tag = buildStage3dRuntimeScript()
    const body = tag.replace(/^<script>/, '').replace(/<\/script>$/, '').replace(/<\\\/script>/g, '</script>')
    expect(() => new Function(body)).not.toThrow()
    expect(body).toContain(KHRONOS_SAMPLE_COMMIT)
    for (const s of STAGE3D_SHAPES) expect(body).toContain(`'${s}'`.replace("'torusKnot'", 'TorusKnot'))
    for (const k of ['iui3d:ready', 'iui3d:hotspot', 'data-iui-3d-layer', 'IntersectionObserver', 'ctrlKey', 'GLTFLoader', 'DRACOLoader', 'RoomEnvironment', 'api.polyhaven.com/files/']) expect(body).toContain(k)
  })
  it('srcdoc injects the runtime only when the page uses it; CSP allows model hosts + blob workers', () => {
    const plain = buildHtmlSandboxSrcdoc(spec('<p>hello</p>'), { frameId: 'p' })
    expect(plain).not.toContain('window.iuiStage3d = function')
    const doc = buildHtmlSandboxSrcdoc(spec('<div data-iui-3d=\'{"model":"polyhaven:ArmChair_01"}\'></div>'), { frameId: 's' })
    expect(doc).toContain('window.iuiStage3d = function')
    const csp = /Content-Security-Policy" content="([^"]+)"/.exec(doc)![1]!
    const connect = /connect-src ([^;]+)/.exec(csp)![1]!
    for (const o of MODEL_CONNECT_ORIGINS) expect(connect).toContain(o)
    expect(connect).toContain('blob:')
    expect(csp).toContain('worker-src blob:')
  })
  it('vendored three ships the loaders, environment, Draco decoder and wasm route', () => {
    const extra = VENDOR_LIBS.three.extra as readonly string[]
    for (const f of ['examples/jsm/loaders/GLTFLoader.js', 'examples/jsm/loaders/DRACOLoader.js', 'examples/jsm/environments', 'examples/jsm/libs/meshopt_decoder.module.js', 'examples/jsm/libs/draco/gltf/draco_decoder.wasm']) expect(extra).toContain(f)
    const plugin = readFileSync('src/plugin/index.ts', 'utf8')
    expect(/const VENDOR_FILE_RE = .*\|wasm(\|glb)?\)/.test(plugin)).toBe(true)
    expect(plugin).toContain("wasm: 'application/wasm'")
    expect(readFileSync('scripts/verify-pack.mjs', 'utf8')).toContain('draco_decoder.wasm')
  })
  it('test GLB fixture is a valid glTF 2.0 binary with Body/Lid + Spin', () => {
    const glb = buildTestGlb()
    const dv = new DataView(glb.buffer, glb.byteOffset, glb.byteLength)
    expect(dv.getUint32(0, true)).toBe(0x46546c67)
    expect(dv.getUint32(4, true)).toBe(2)
    expect(dv.getUint32(8, true)).toBe(glb.byteLength)
    const len = dv.getUint32(12, true)
    const json = JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + len)))
    expect(json.nodes.map((n: { name: string }) => n.name)).toEqual(expect.arrayContaining(['Body', 'Lid']))
    expect(json.animations[0].name).toBe('Spin')
  })
})

describe('R5-3 model catalog', () => {
  it('queryTerms maps Chinese + singularises', () => {
    expect(queryTerms('扶手椅')).toContain('armchair')
    expect(queryTerms('花瓶')).toEqual(['vase'])
    expect(queryTerms('台灯')).toEqual(['desk', 'lamp'])
    expect(queryTerms('Toy Cars')).toEqual(expect.arrayContaining(['toy', 'car']))
    expect(queryTerms('')).toEqual([])
  })
  it('searchKhronos finds curated CC0 samples', () => {
    expect(KHRONOS_CC0.length).toBeGreaterThanOrEqual(10)
    expect(searchKhronos('toy car')[0]!.model).toBe('khronos:ToyCar')
    expect(searchKhronos('xyzzy')).toEqual([])
  })
  it('searchPolyhaven filters to models, adds size + dimensions, caches the index', async () => {
    const calls: string[] = []
    const hits = await searchPolyhaven('armchair', mockFetch(calls))
    expect(hits.map((h) => h.model)).toEqual(['polyhaven:ArmChair_01'])
    expect(hits[0]!.sizeMb).toBe(1)
    expect(hits[0]!.dimensionsM).toEqual([0.8, 0.9, 0.75])
    expect(hits[0]!.license).toBe('CC0-1.0')
    await searchPolyhaven('plant', mockFetch(calls))
    expect(calls.filter((u) => u.includes('/assets?')).length).toBe(1)
  })
  it('rankHits prefers score, then smaller downloads', () => {
    const h = (model: string, score: number, sizeMb?: number) => ({ model, name: model, source: 'Poly Haven' as const, license: 'CC0-1.0' as const, author: '', page: '', tags: [], score, ...(sizeMb !== undefined ? { sizeMb } : {}) })
    expect(rankHits([h('a', 5, 9), h('b', 5, 1), h('c', 9, 20)], 2).map((x) => x.model)).toEqual(['c', 'b'])
  })
})

describe('R5-3 find_3d_models tool', () => {
  it('returns stage ids with usage, empty + invalid states', async () => {
    const tool = createFind3dModelsTool({ fetchJson: mockFetch() })
    expect(tool.name).toBe('find_3d_models')
    const ok = String(await tool.execute({ query: 'armchair' } as never, {} as never))
    expect(ok).toContain('status=ok')
    expect(ok).toContain('model=polyhaven:ArmChair_01')
    expect(ok).toContain('bundled=yes') // R5-3b: the shipped copy (0.4 MB) replaces the 1 MB remote hit
    expect(ok).toContain('size_mb=0.4')
    expect(ok).toContain('usage=<div data-iui-3d=')
    expect(String(await tool.execute({ query: 'xyzzy' } as never, {} as never))).toContain('status=empty')
    expect(String(await tool.execute({} as never, {} as never))).toContain('status=invalid')
  })
  it('skips Poly Haven when the probe says models are unreachable, and survives fetch errors', async () => {
    const calls: string[] = []
    setNetworkProbeForTest({ at: Date.now(), results: [{ id: 'models', ok: false, ms: 2000 }] })
    const out = String(await createFind3dModelsTool({ fetchJson: mockFetch(calls) }).execute({ query: 'toy car' } as never, {} as never))
    expect(calls).toEqual([])
    expect(out).toContain('model=khronos:ToyCar')
    expect(out).toContain('unreachable')
    setNetworkProbeForTest(null)
    const failed = String(await createFind3dModelsTool({ fetchJson: async () => { throw new Error('boom') } }).execute({ query: 'toy car' } as never, {} as never))
    expect(failed).toContain('status=ok')
    expect(failed).toContain('search failed')
  })
  it('may run before the fence', () => {
    expect(getStreamHeuristics().toolsAllowedBeforeFence).toContain('find_3d_models')
    expect(isToolBeforeFenceName('find_3d_models')).toBe(false)
  })
})

describe('R5-3 starter + guidance', () => {
  it('scene-3d starter is declarative', () => {
    const s3 = PATTERN_STARTERS.find((s) => s.id === 'scene-3d')!
    const opts = JSON.parse(/data-iui-3d='([^']+)'/.exec(s3.spec.html)![1]!)
    expect(STAGE3D_SHAPES).toContain(opts.shape)
    for (const h of opts.hotspots) for (const v of h.at) expect(Math.abs(v)).toBeLessThanOrEqual(1)
    expect(s3.spec.html).toContain('data-iui-3d-layer="back"')
  })
  it('referee 3D note points at the host stage + find_3d_models', () => {
    const rules = readFileSync('src/config/referee-rules.ts', 'utf8')
    const at = rules.indexOf("id: 'scene-3d'")
    const note = rules.slice(at, rules.indexOf('\n  },', at))
    expect(note).toContain('data-iui-3d')
    expect(note).toContain('find_3d_models')
    expect(note).not.toContain('OrbitControls.js')
  })
})
