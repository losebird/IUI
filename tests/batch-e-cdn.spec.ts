/**
 * Batch E (第四轮 A · CDN): C2 single registry · C7 SRI · C9 declared libs ·
 * C10 connectivity probe · C11 preconnect.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { runInNewContext } from 'node:vm'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import { computeVendorIntegrity } from '../scripts/vendor-integrity.mts'
import { buildAuthorJsRuntimeSource } from '../src/shared/author-js-runtime.ts'
import {
  IUI_DEFAULT_MAP_TILE_URL,
  buildHtmlSandboxSrcdoc,
  detectSandboxLibs,
  parseHtmlSandboxFence,
  rewriteAuthorCdnTags,
  type HtmlSandboxSpec,
} from '../src/shared/html-sandbox.ts'
import { buildLeafletMapSrcdoc } from '../src/shared/map-embed.ts'
import {
  NETWORK_PROBE_TTL_MS,
  ensureNetworkProbe,
  isKnownUnreachable,
  networkProbeTargets,
  probeAdvice,
  probeNetwork,
  setNetworkProbeForTest,
  type NetworkProbeSnapshot,
} from '../src/shared/network-probe.ts'
import { VENDOR_INTEGRITY } from '../src/shared/vendor-integrity.ts'
import {
  VENDOR_LIBS,
  buildSriLookupSource,
  buildVendorImportMap,
  normalizeDeclaredLibs,
  vendorCssUrls,
  vendorFileKey,
  vendorIntegrity,
  vendorIntegrityFiles,
  vendorJsUrls,
  vendorUrls,
  withVendorSource,
  type VendorId,
} from '../src/shared/vendor-registry.ts'
import { createGetTripStopImagesTool } from '../src/plugin/trip-images-tool.ts'
import { NetworkProbeCard } from '../src/client/settings/NetworkProbeCard.tsx'

const ROOT = join(__dirname, '..')
const BASE = 'http://127.0.0.1:7777/plugins/@losebird/iui/assets'

function page(html: string, js = '', extra: Partial<HtmlSandboxSpec> = {}): HtmlSandboxSpec {
  return { title: 't', css: '', html, js, stages: ['html', 'js'], partial: false, cssComplete: true, htmlComplete: true, jsComplete: true, ...extra }
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx|mts)$/.test(n) ? [p] : []
  })
}

describe('C2 single vendor registry', () => {
  it('no public-CDN URL literal outside vendor-registry.ts', () => {
    const cdn = /https?:\/\/(?:[\w-]+\.)*(?:jsdelivr\.net|unpkg\.com|esm\.sh|cdnjs\.cloudflare\.com|npmmirror\.com|skypack\.dev|jspm\.(?:io|dev)|staticfile\.(?:org|net)|bootcdn\.net|bootcss\.com)/
    const offenders = walk(join(ROOT, 'src'))
      .filter((f) => !f.endsWith('vendor-registry.ts'))
      .flatMap((f) => readFileSync(f, 'utf8').split('\n').map((line, i) => ({ f, i, line })))
      .filter(({ line }) => cdn.test(line))
      .map(({ f, i, line }) => `${relative(ROOT, f)}:${i + 1} ${line.trim().slice(0, 120)}`)
    expect(offenders).toEqual([])
  })

  it('no pinned registry version spelled out elsewhere in src', () => {
    const pins = Object.values(VENDOR_LIBS).map((l) => `${l.pkg}@${l.version}`)
    const hits = walk(join(ROOT, 'src'))
      .filter((f) => !/vendor-(?:registry|integrity)\.ts$/.test(f))
      .filter((f) => pins.some((p) => readFileSync(f, 'utf8').includes(p)))
    expect(hits).toEqual([])
  })

  it('runtime defaults, starters and map embed derive from the registry', () => {
    const rt = buildAuthorJsRuntimeSource()
    expect(rt).toContain(`chart.js@${VENDOR_LIBS.chart.version}/dist/chart.umd.js`)
    expect(rt).toContain(`mermaid@${VENDOR_LIBS.mermaid.version}/dist/mermaid.min.js`)
    const map = buildLeafletMapSrcdoc({ lat: 31.2, lng: 121.5 })
    expect(map).toContain(vendorJsUrls('leaflet')[0]!)
    expect(map).not.toContain('unpkg.com')
    expect(buildLeafletMapSrcdoc({ lat: 1, lng: 2, assetBase: BASE })).toContain(`${BASE}/vendor/leaflet@1.9.4/dist/leaflet.js`)
  })

  it('every CDN candidate serves the npm file itself (no CDN-only .min variants)', () => {
    for (const id of Object.keys(VENDOR_LIBS) as VendorId[]) {
      const lib = VENDOR_LIBS[id] as { js?: string; cdnJs?: string }
      expect(lib.cdnJs).toBeUndefined()
      if (!lib.js) continue
      for (const preset of ['local', 'china', 'global'] as const) {
        for (const u of withVendorSource({ preset }, () => vendorJsUrls(id, BASE))) expect(u.endsWith('/' + lib.js)).toBe(true)
      }
    }
  })
})

describe('C7 subresource integrity', () => {
  it('generated table matches node_modules (re-run scripts/vendor-integrity.mts on drift)', () => {
    expect(VENDOR_INTEGRITY).toEqual(computeVendorIntegrity())
    expect(Object.keys(VENDOR_INTEGRITY)).toHaveLength(vendorIntegrityFiles().length)
    for (const v of Object.values(VENDOR_INTEGRITY)) expect(v).toMatch(/^sha384-[A-Za-z0-9+/]{64}$/)
  })

  it('one hash for jsDelivr / unpkg / npmmirror copies; none for local or custom URLs', () => {
    const urls = withVendorSource({ preset: 'global' }, () => vendorJsUrls('leaflet', BASE))
    const china = withVendorSource({ preset: 'china' }, () => vendorJsUrls('leaflet'))
    const h = VENDOR_INTEGRITY['leaflet@1.9.4/dist/leaflet.js']
    expect([...urls, ...china].filter((u) => !u.startsWith(BASE)).map(vendorIntegrity)).toEqual([h, h, h, h])
    expect(vendorIntegrity(`${BASE}/vendor/leaflet@1.9.4/dist/leaflet.js`)).toBeNull()
    const custom = withVendorSource({ preset: 'custom', template: 'https://cdn.example.com/npm/{name}@{version}/{file}' }, () => vendorJsUrls('leaflet')[0]!)
    expect(vendorIntegrity(custom)).toBeNull()
  })

  it('in-frame __iuiSriFor agrees with vendorFileKey/vendorIntegrity', () => {
    const win: Record<string, unknown> = {}
    runInNewContext(buildSriLookupSource(), { window: win })
    const sriFor = win.__iuiSriFor as (u: string) => string
    const all: string[] = []
    for (const preset of ['local', 'china', 'global'] as const) {
      withVendorSource({ preset }, () => {
        for (const id of Object.keys(VENDOR_LIBS) as VendorId[]) {
          all.push(...vendorJsUrls(id, BASE), ...vendorCssUrls(id, BASE).flat())
        }
      })
    }
    expect(all.length).toBeGreaterThan(30)
    for (const u of all) expect(sriFor(u)).toBe(vendorIntegrity(u) ?? '')
    expect(vendorFileKey('https://registry.npmmirror.com/ag-grid-community/32.3.3/files/styles/ag-grid.css')).toBe('ag-grid-community@32.3.3/styles/ag-grid.css')
    expect(sriFor('https://evil.example/leaflet@1.9.4/dist/leaflet.js')).toBe('')
  })

  it('injected CDN tags carry integrity + crossorigin; local first candidate does not', () => {
    const js = 'var m=L.map("m");new Chart(c,{type:"bar"});'
    const cdnDoc = buildHtmlSandboxSrcdoc(page('<div id="m"></div><canvas id="c"></canvas>', js))
    expect(cdnDoc).toMatch(/<script async data-iui-cdn data-iui-fallback="[^"]*" integrity="sha384-[^"]+" crossorigin="anonymous"[^>]*src="https:\/\/registry\.npmmirror\.com\/leaflet\/1\.9\.4\/files\/dist\/leaflet\.js"/)
    expect(cdnDoc).toMatch(/<link rel="stylesheet" data-iui-fallback="[^"]*" integrity="sha384-[^"]+" crossorigin="anonymous" media="print"/)
    const localDoc = buildHtmlSandboxSrcdoc(page('<div id="m"></div>', js), { assetBase: BASE })
    const tag = /<script async data-iui-cdn[^>]*leaflet\.js"><\/script>/.exec(localDoc)![0]
    expect(tag).toContain(`src="${BASE}/vendor/leaflet@1.9.4/dist/leaflet.js"`)
    expect(tag).not.toContain('integrity=')
    // the fallback swapper + runtime loader re-apply SRI per candidate
    expect(localDoc).toContain('window.__iuiSriFor = ')
    expect(localDoc).toContain("n.integrity = sri; n.crossOrigin = 'anonymous';")
    expect(buildAuthorJsRuntimeSource()).toContain('applySri(s, src);')
  })

  it('rewritten author tags drop the stale hash and get the registry one', () => {
    const authored = '<script src="https://unpkg.com/leaflet@1.7.1/dist/leaflet.js" integrity="sha384-OLD" crossorigin=""></script>'
    const cdn = rewriteAuthorCdnTags(authored)
    expect(cdn).not.toContain('sha384-OLD')
    expect(cdn).toContain(`integrity="${VENDOR_INTEGRITY['leaflet@1.9.4/dist/leaflet.js']}" crossorigin="anonymous"`)
    const local = rewriteAuthorCdnTags(authored, BASE)
    expect(local).toBe(`<script src="${BASE}/vendor/leaflet@1.9.4/dist/leaflet.js"></script>`)
    // unknown libraries keep the author's own SRI untouched
    const other = '<script src="https://cdn.jsdelivr.net/npm/lodash@4/lodash.min.js" integrity="sha384-X" crossorigin="anonymous"></script>'
    expect(rewriteAuthorCdnTags(other)).toBe(other)
  })

  it('importmap pins three with integrity only when it comes from a CDN', () => {
    const cdn = buildVendorImportMap()
    expect(cdn.integrity?.[`${cdn.imports['three/']}build/three.module.js`]).toBe(VENDOR_INTEGRITY['three@0.180.0/build/three.module.js'])
    expect(cdn.integrity?.[`${cdn.imports['three/']}build/three.core.js`]).toBe(VENDOR_INTEGRITY['three@0.180.0/build/three.core.js'])
    expect(buildVendorImportMap(BASE).integrity).toBeUndefined()
  })
})

describe('C9 declared libs + strict detection', () => {
  it('parses `libs:` header and JSON libs (aliases, unknown dropped)', () => {
    const sec = parseHtmlSandboxFence('title: 地图\nlibs: map, Chart.js, lodash\n---html\n<div></div>\n---js\nvar a=1')
    expect(sec?.libs).toEqual(['leaflet', 'chart'])
    const json = parseHtmlSandboxFence(JSON.stringify({ html: '<div>x</div>', js: '', libs: ['echarts', 'ag-grid', 'nope'] }))
    expect(json?.libs).toEqual(['echarts', 'agGrid'])
    expect(normalizeDeclaredLibs('three，mermaid、d3')).toEqual(['three', 'mermaid', 'd3'])
    expect(normalizeDeclaredLibs(42)).toEqual([])
  })

  it('a canvas game that says "line" / has id="map" no longer pulls Chart.js / Leaflet', () => {
    const html = '<div id="map"></div><canvas id="game"></canvas>'
    const js = 'var ctx=document.getElementById("game").getContext("2d");ctx.lineTo(1,2);var Chart=null;var bar=3;'
    expect([...detectSandboxLibs(html, js)]).toEqual([])
    const doc = buildHtmlSandboxSrcdoc(page(html, js))
    expect(doc).not.toMatch(/<script async data-iui-cdn[^>]*chart\.umd\.js/)
    expect(doc).not.toMatch(/<script async data-iui-cdn[^>]*leaflet\.js/)
    expect(doc).not.toContain('rel="preconnect"')
  })

  it('declared libs always load, real API calls still detected', () => {
    const doc = buildHtmlSandboxSrcdoc(page('<div id="x"></div>', 'window.go=function(){}', { libs: ['leaflet', 'mermaid'] }))
    expect(doc).toMatch(/<script async data-iui-cdn[^>]*dist\/leaflet\.js/)
    expect(doc).toMatch(/<script async data-iui-cdn[^>]*dist\/mermaid\.min\.js/)
    expect(doc).toContain('"libs":["leaflet","mermaid"]')
    expect([...detectSandboxLibs('', 'L.circle([1,2]).addTo(m);echarts.init(el);agGrid.createGrid(e,{});d3.select("svg")')].sort())
      .toEqual(['agGrid', 'd3', 'echarts', 'leaflet'])
  })

  it('echarts still injects when the page merely mentions "ECharts" in text', () => {
    const doc = buildHtmlSandboxSrcdoc(page('<h3>ECharts 趋势</h3><div id="c"></div>', 'echarts.init(document.getElementById("c"))'))
    expect(doc).toContain('dist/echarts.min.js')
  })

  it('streaming shell (JS not here yet) keeps markup preload hints', () => {
    const shell = buildHtmlSandboxSrcdoc(page('<div id="map"></div><canvas id="salesChart"></canvas>', '', { jsComplete: false }), { deferAuthorJs: true })
    expect(shell).toMatch(/<script async data-iui-cdn[^>]*dist\/leaflet\.js/)
    expect(shell).toMatch(/<script async data-iui-cdn[^>]*chart\.umd\.js/)
  })

  it('runtime loader honours declared libs and drops the #map / canvas guesses', () => {
    const rt = buildAuthorJsRuntimeSource()
    expect(rt).toContain("var DECLARED = Array.isArray(VND.libs) ? VND.libs : [];")
    expect(rt).not.toContain("'.iui-map-wrap, #map")
    expect(rt).not.toContain('hasCanvas')
  })
})

describe('C10 connectivity probe', () => {
  afterEach(() => setNetworkProbeForTest(null))

  const snap = (down: string[], at = Date.now()): NetworkProbeSnapshot => ({
    at,
    results: networkProbeTargets().map(({ id }) => ({ id, ok: !down.includes(id), ms: 40 })),
  })

  it('probes every target concurrently with HEAD; failures/timeouts are not ok', async () => {
    const seen: string[] = []
    const out = await probeNetwork({
      timeoutMs: 50,
      fetchImpl: (url, init) => {
        seen.push(`${init.method} ${url}`)
        if (url.includes('unpkg')) return Promise.reject(new Error('ECONNRESET'))
        if (url.includes('wikimedia')) return new Promise((_r, rej) => init.signal.addEventListener('abort', () => rej(new Error('aborted'))))
        return Promise.resolve({ status: url.includes('wikipedia') ? 405 : 200 })
      },
    })
    expect(seen.every((s) => s.startsWith('HEAD https://'))).toBe(true)
    expect(out.results.map((r) => `${r.id}:${r.ok}`)).toEqual(['jsdelivr:true', 'npmmirror:true', 'unpkg:false', 'zstatic:true', 'staticfile:true', 'wikipedia:true', 'wikimedia:false', 'tiles:true', 'amap:true', 'models:true'])
    expect(out.results.find((r) => r.id === 'wikipedia')?.status).toBe(405)
  })

  it('tile probe follows the default tile host; CDN probes come from the registry', () => {
    const t = networkProbeTargets()
    expect(new URL(t.find((x) => x.id === 'tiles')!.url).host).toBe(new URL(IUI_DEFAULT_MAP_TILE_URL.replace(/\{[xyz]\}/g, '0')).host)
    expect(t.find((x) => x.id === 'jsdelivr')!.url).toBe(withVendorSource({ preset: 'global' }, () => vendorUrls('leaflet', 'dist/leaflet.css')[0]))
    expect(t.find((x) => x.id === 'npmmirror')!.url).toBe(vendorUrls('leaflet', 'dist/leaflet.css')[0])
  })

  it('caches for an hour, shares one in-flight run, force re-probes', async () => {
    let calls = 0
    const fetchImpl = () => { calls++; return Promise.resolve({ status: 200 }) }
    let t = 1_000_000
    const now = () => t
    const [a, b] = await Promise.all([ensureNetworkProbe({ fetchImpl, now }), ensureNetworkProbe({ fetchImpl, now })])
    expect(a).toBe(b)
    const n = networkProbeTargets().length
    expect(calls).toBe(n)
    t += NETWORK_PROBE_TTL_MS - 1
    await ensureNetworkProbe({ fetchImpl, now })
    expect(calls).toBe(n)
    await ensureNetworkProbe({ fetchImpl, now, force: true })
    expect(calls).toBe(2 * n)
  })

  it('advice + known-unreachable only from a fresh probe', () => {
    expect(probeAdvice(snap(['jsdelivr', 'unpkg']), 'global')).toEqual(['switch-china'])
    expect(probeAdvice(snap(['npmmirror']), 'china')).toEqual(['switch-global'])
    expect(probeAdvice(snap(['jsdelivr', 'npmmirror', 'unpkg', 'zstatic', 'staticfile', 'tiles', 'amap']), 'local')).toEqual(['cdn-all-down', 'no-tiles'])
    // F2/F4: any reachable mirror or the AMap basemap means auto mode copes on its own
    expect(probeAdvice(snap(['jsdelivr', 'npmmirror', 'unpkg', 'tiles']), 'auto')).toEqual([])
    expect(probeAdvice(snap(['wikipedia', 'wikimedia']), 'local')).toEqual(['no-wikimedia'])
    expect(probeAdvice(null, 'local')).toEqual([])
    expect(isKnownUnreachable(['wikipedia', 'wikimedia'], snap(['wikipedia', 'wikimedia']))).toBe(true)
    expect(isKnownUnreachable(['wikipedia', 'wikimedia'], snap(['wikimedia']))).toBe(false)
    expect(isKnownUnreachable(['wikipedia', 'wikimedia'], snap(['wikipedia', 'wikimedia'], Date.now() - NETWORK_PROBE_TTL_MS))).toBe(false)
    expect(isKnownUnreachable(['wikipedia'], null)).toBe(false)
  })

  it('photo tool answers at once when Wikimedia is known-unreachable', async () => {
    setNetworkProbeForTest(snap(['wikipedia', 'wikimedia']))
    const t0 = Date.now()
    const out = String(await createGetTripStopImagesTool().execute({ wikipedia_titles: ['上海'] }))
    expect(out).toContain('status=unavailable')
    expect(out).toContain('reason=wikimedia_unreachable')
    expect(Date.now() - t0).toBeLessThan(500)
  })

  it('settings card lists every host and the preset advice', () => {
    const html = renderToStaticMarkup(createElement(NetworkProbeCard, { t: (k: string) => k, preset: 'global', initial: snap(['jsdelivr', 'unpkg']) }))
    for (const { id } of networkProbeTargets()) expect(html).toContain(`data-iui-probe="${id}"`)
    expect(html).toContain('data-iui-network-probe="8/10"')
    expect(html).toContain('data-iui-probe-advice="switch-china"')
    expect(html).toContain('netProbeRecheck')
    const idle = renderToStaticMarkup(createElement(NetworkProbeCard, { t: (k: string) => k, preset: 'local', initial: null }))
    expect(idle).toContain('netProbeNone')
  })

  it('plugin publishes the probe in runtime-config.json and serves network-probe.json', () => {
    const src = readFileSync(join(ROOT, 'src/plugin/index.ts'), 'utf8')
    expect(src).toContain("file === 'network-probe.json'")
    expect(src).toContain('networkProbe: getNetworkProbe()')
  })
})

describe('C11 preconnect', () => {
  it('warms the first CDN origin (with crossorigin for SRI fetches)', () => {
    const doc = buildHtmlSandboxSrcdoc(page('', 'L.map("m")'))
    expect(doc).toContain('<link rel="preconnect" href="https://registry.npmmirror.com" crossorigin/>')
    const g = buildHtmlSandboxSrcdoc(page('', 'L.map("m")'), { cdnSource: { preset: 'global' } })
    expect(g).toContain('<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin/>')
    const china = buildHtmlSandboxSrcdoc(page('', 'L.map("m")'), { cdnSource: { preset: 'china' } })
    expect(china).toContain('<link rel="preconnect" href="https://registry.npmmirror.com" crossorigin/>')
  })

  it('skips the plugin asset route and pages without libraries', () => {
    expect(buildHtmlSandboxSrcdoc(page('', 'L.map("m")'), { assetBase: BASE })).not.toContain('rel="preconnect"')
    expect(buildHtmlSandboxSrcdoc(page('<p>hi</p>', 'var a=1'))).not.toContain('rel="preconnect"')
    const global = buildHtmlSandboxSrcdoc(page('', 'L.map("m")'), { assetBase: BASE, cdnSource: { preset: 'global' } })
    expect(global).toContain('<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin/>')
  })
})
