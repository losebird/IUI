/**
 * Batch F: offline ESM (gsap + d3/Chart.js shims) · auto vendor source with
 * China mirrors (zstatic / staticfile) · AMap basemap (GCJ-02) · map-card
 * photo fallback · settings "auto + advanced".
 */
import { existsSync, readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { buildHtmlSandboxSrcdoc, type HtmlSandboxSpec } from '../src/shared/html-sandbox.ts'
import { buildLeafletMapSrcdoc } from '../src/shared/map-embed.ts'
import {
  AMAP_TILE,
  GCJ_JS,
  cdnOrderFromProbe,
  decideMapTiles,
  decideNetContext,
  getNetContext,
  normalizeMapTilesSetting,
  withNetContext,
} from '../src/shared/net-context.ts'
import { networkProbeTargets, probeAdvice, type NetworkProbeSnapshot } from '../src/shared/network-probe.ts'
import { buildTripPhotoFillScript } from '../src/shared/trip-images.ts'
import { VENDOR_INTEGRITY } from '../src/shared/vendor-integrity.ts'
import {
  VENDOR_ESM_SHIMS,
  VENDOR_LIBS,
  buildVendorImportMap,
  normalizeCdnOrder,
  normalizeCdnPreset,
  vendorFileKey,
  vendorIntegrity,
  vendorJsUrls,
  vendorMirrorUrl,
  vendorUrls,
  withVendorSource,
} from '../src/shared/vendor-registry.ts'
import { NetworkProbeCard } from '../src/client/settings/NetworkProbeCard.tsx'
import { SETTINGS_FIELDS } from '../src/config/settings-fields.ts'

const BASE = 'https://dsh.example/plugins/iui/assets'

function page(html: string, js = ''): HtmlSandboxSpec {
  return { title: 't', css: '', html, js, stages: ['html', 'js'], partial: false, cssComplete: true, htmlComplete: true, jsComplete: true }
}

/** China-like network: Wikipedia/Wikimedia/jsDelivr/Esri blocked, domestic mirrors + AMap fast. */
const CHINA: NetworkProbeSnapshot = {
  at: Date.now(),
  results: [
    { id: 'jsdelivr', ok: false, ms: 2000 },
    { id: 'npmmirror', ok: true, ms: 90 },
    { id: 'unpkg', ok: false, ms: 2000 },
    { id: 'zstatic', ok: true, ms: 40 },
    { id: 'staticfile', ok: true, ms: 60 },
    { id: 'wikipedia', ok: false, ms: 2000 },
    { id: 'wikimedia', ok: false, ms: 2000 },
    { id: 'tiles', ok: true, ms: 1900 },
    { id: 'amap', ok: true, ms: 30 },
  ],
}
const GLOBAL: NetworkProbeSnapshot = {
  at: Date.now(),
  results: CHINA.results.map((r) => ({ ...r, ok: r.id === 'amap' ? true : true, ms: r.id === 'jsdelivr' ? 20 : r.id === 'amap' ? 300 : r.id === 'tiles' ? 80 : 150 })),
}

describe('F2 mirrors + auto preset', () => {
  it('auto is the default preset; unknown values fall back to auto', () => {
    expect(normalizeCdnPreset(undefined)).toBe('auto')
    expect(normalizeCdnPreset('china')).toBe('china')
    expect(SETTINGS_FIELDS.cdnPreset.default).toBe('auto')
    expect(SETTINGS_FIELDS.mapTiles).toMatchObject({ values: ['auto', 'amap', 'global'], default: 'auto' })
    expect(normalizeMapTilesSetting('AMAP')).toBe('auto')
    expect(normalizeMapTilesSetting('amap')).toBe('amap')
  })

  it('every mirror spells the same npm file; staticfile only where verified', () => {
    expect(vendorMirrorUrl('zstatic', 'leaflet', 'dist/leaflet.js')).toBe('https://s4.zstatic.net/npm/leaflet@1.9.4/dist/leaflet.js')
    expect(vendorMirrorUrl('staticfile', 'leaflet', 'dist/leaflet.js')).toBe('https://cdn.staticfile.net/leaflet/1.9.4/leaflet.js')
    expect(vendorMirrorUrl('staticfile', 'chart', 'dist/chart.umd.js')).toBe('https://cdn.staticfile.net/Chart.js/4.4.1/chart.umd.js')
    expect(vendorMirrorUrl('staticfile', 'mermaid', 'dist/mermaid.min.js')).toBeNull()
    expect(vendorMirrorUrl('npmmirror', 'd3', 'dist/d3.min.js')).toBe('https://registry.npmmirror.com/d3/7.9.0/files/dist/d3.min.js')
  })

  it('one SRI hash per file across every mirror', () => {
    for (const [id, file] of [['leaflet', 'dist/leaflet.js'], ['chart', 'dist/chart.umd.js'], ['echarts', 'dist/echarts.min.js'], ['leaflet', 'dist/leaflet.css']] as const) {
      const lib = VENDOR_LIBS[id]
      const key = `${lib.pkg}@${lib.version}/${file}`
      expect(VENDOR_INTEGRITY[key]).toMatch(/^sha384-/)
      for (const cdn of ['jsdelivr', 'npmmirror', 'unpkg', 'zstatic', 'staticfile'] as const) {
        const url = vendorMirrorUrl(cdn, id, file)!
        expect(vendorFileKey(url)).toBe(key)
        expect(vendorIntegrity(url)).toBe(VENDOR_INTEGRITY[key])
      }
    }
  })

  it('auto ranks probe-reachable mirrors first, then npmmirror → jsDelivr; local route always leads', () => {
    expect(cdnOrderFromProbe(CHINA)).toEqual(['zstatic', 'staticfile', 'npmmirror'])
    expect(cdnOrderFromProbe(null)).toEqual([])
    expect(normalizeCdnOrder('staticfile,bogus,zstatic,staticfile')).toEqual(['staticfile', 'zstatic'])
    const urls = withVendorSource({ preset: 'auto', order: cdnOrderFromProbe(CHINA) }, () => vendorJsUrls('leaflet', BASE))
    expect(urls.map((u) => new URL(u).host)).toEqual(['dsh.example', 's4.zstatic.net', 'cdn.staticfile.net', 'registry.npmmirror.com', 'cdn.jsdelivr.net'])
    // mermaid is not on staticfile → skipped, never a broken URL
    const mm = withVendorSource({ preset: 'auto', order: ['staticfile', 'zstatic'] }, () => vendorJsUrls('mermaid'))
    expect(mm.map((u) => new URL(u).host)).toEqual(['s4.zstatic.net', 'registry.npmmirror.com', 'cdn.jsdelivr.net'])
    const none = withVendorSource({ preset: 'auto' }, () => vendorJsUrls('chart'))
    expect(none.map((u) => new URL(u).host)).toEqual(['registry.npmmirror.com', 'cdn.jsdelivr.net'])
  })

  it('srcdoc CSP allows the China mirrors and preconnects to the first one', () => {
    const doc = withVendorSource({ preset: 'auto', order: ['zstatic'] }, () => buildHtmlSandboxSrcdoc(page('<div id="m"></div>', 'L.map("m")')))
    expect(doc).toMatch(/script-src [^;]*https:\/\/s4\.zstatic\.net/)
    expect(doc).toMatch(/script-src [^;]*https:\/\/cdn\.staticfile\.net/)
    const viaOpt = buildHtmlSandboxSrcdoc(page('<div id="m"></div>', 'L.map("m")'), { cdnSource: { preset: 'auto', order: ['zstatic'] } })
    expect(viaOpt).toContain('<link rel="preconnect" href="https://s4.zstatic.net" crossorigin/>')
  })

  it('probe covers every mirror + AMap; cdn-all-down needs every mirror down', () => {
    expect(networkProbeTargets().map((t) => t.id)).toEqual(['jsdelivr', 'npmmirror', 'unpkg', 'zstatic', 'staticfile', 'wikipedia', 'wikimedia', 'tiles', 'amap'])
    expect(probeAdvice(CHINA, 'auto')).toEqual(['no-wikimedia'])
  })
})

describe('F1 offline ESM', () => {
  it('importmap serves gsap + d3 + Chart.js from the plugin route (no esm.sh)', () => {
    const map = withVendorSource({ preset: 'auto' }, () => buildVendorImportMap(BASE)).imports
    expect(map.gsap).toBe(`${BASE}/vendor/gsap@3.12.5/index.js`)
    expect(map['gsap/']).toBe(`${BASE}/vendor/gsap@3.12.5/`)
    expect(map['gsap/ScrollTrigger']).toBe(`${BASE}/vendor/gsap@3.12.5/ScrollTrigger.js`)
    expect(map['gsap/all']).toBe(`${BASE}/vendor/gsap@3.12.5/all.js`)
    expect(map.d3).toBe(`${BASE}/vendor/iui-esm/${VENDOR_ESM_SHIMS.d3}`)
    expect(map['chart.js']).toBe(`${BASE}/vendor/iui-esm/chart.js@4.4.1.mjs`)
    expect(map['chart.js/auto']).toBe(map['chart.js'])
    expect(map['chart.js/helpers']).toBe(`${BASE}/vendor/iui-esm/chart.js@4.4.1-helpers.mjs`)
    // bare specifiers never touch esm.sh (only rare deep `chart.js/…` subpaths still do)
    expect(Object.entries(map).filter(([k, u]) => !k.endsWith('/') && u.includes('esm.sh'))).toEqual([])
  })

  it('without the plugin route gsap follows the mirror order; d3 / Chart.js keep esm.sh', () => {
    const china = withVendorSource({ preset: 'china' }, () => buildVendorImportMap()).imports
    expect(china.gsap).toBe('https://registry.npmmirror.com/gsap/3.12.5/files/index.js')
    const custom = withVendorSource({ preset: 'global' }, () => buildVendorImportMap(BASE)).imports
    expect(custom.d3).toContain('esm.sh/d3@7.9.0')
  })

  it('generated shims (lib build) wrap the pinned UMD files', () => {
    const dir = new URL('../lib/assets/vendor/iui-esm/', import.meta.url)
    if (!existsSync(dir)) return // lib/ not built in this checkout
    const d3 = readFileSync(new URL(VENDOR_ESM_SHIMS.d3, dir), 'utf8')
    expect(d3).toContain("import '../d3@7.9.0/dist/d3.min.js'")
    expect(d3).toMatch(/export const \{[^}]*\bselect\b[^}]*\bscaleLinear\b/)
    const chart = readFileSync(new URL(VENDOR_ESM_SHIMS.chart, dir), 'utf8')
    expect(chart).toContain("import '../chart.js@4.4.1/dist/chart.umd.js'")
    expect(chart).toContain('export const registerables = ')
    expect(chart).toMatch(/\bBarController\b/)
    expect(readFileSync(new URL(VENDOR_ESM_SHIMS.chartHelpers, dir), 'utf8')).toMatch(/\bcolor\b/)
  })
})

describe('F4 AMap basemap', () => {
  it('auto picks AMap for China-like networks only', () => {
    expect(decideMapTiles(CHINA)).toBe('amap')
    expect(decideMapTiles(GLOBAL)).toBe('default')
    expect(decideMapTiles(null)).toBe('default')
    expect(decideMapTiles(GLOBAL, 'amap')).toBe('amap')
    expect(decideMapTiles(CHINA, 'global')).toBe('default')
    const slowEsri: NetworkProbeSnapshot = { at: Date.now(), results: GLOBAL.results.map((r) => (r.id === 'tiles' ? { ...r, ms: 1900 } : r.id === 'amap' ? { ...r, ms: 50 } : r)) }
    expect(decideMapTiles(slowEsri)).toBe('amap')
    const noAmap: NetworkProbeSnapshot = { at: Date.now(), results: CHINA.results.map((r) => (r.id === 'amap' ? { ...r, ok: false } : r)) }
    expect(decideMapTiles(noAmap)).toBe('default')
    expect(decideNetContext(CHINA)).toEqual({ tiles: 'amap', wiki: false })
    expect(decideNetContext(GLOBAL)).toEqual({ tiles: 'default', wiki: true })
  })

  it('WGS-84 → GCJ-02 matches the published transform; identity abroad; inverse round-trips', () => {
    const win: Record<string, any> = {}
    runInNewContext(GCJ_JS, { window: win, Math, isFinite })
    // Tiananmen: WGS-84 39.9087, 116.3975 → GCJ-02 ≈ 39.91010, 116.40374
    const [lat, lng] = win.__iuiWgs2Gcj(39.9087, 116.3975)
    expect(lat - 39.9087).toBeGreaterThan(0.0010)
    expect(lat - 39.9087).toBeLessThan(0.0018)
    expect(lng - 116.3975).toBeGreaterThan(0.0055)
    expect(lng - 116.3975).toBeLessThan(0.0070)
    const back = win.__iuiGcj2Wgs(lat, lng)
    expect(Math.abs(back[0] - 39.9087)).toBeLessThan(1e-6)
    expect(Math.abs(back[1] - 116.3975)).toBeLessThan(1e-6)
    expect(win.__iuiWgs2Gcj(48.8584, 2.2945)).toEqual([48.8584, 2.2945])
    expect(win.__iuiInChina(31.23, 121.47)).toBe(true)
    expect(win.__iuiInChina(35.68, 139.76)).toBe(false)
  })

  it('sandbox tile guard: AMap first + GCJ CRS only when the net context says so', () => {
    const js = 'var m=L.map("m").setView([31.23,121.47],12);L.tileLayer("https://server.arcgisonline.com/x/{z}/{y}/{x}").addTo(m);'
    const def = buildHtmlSandboxSrcdoc(page('<div id="m"></div>', js))
    expect(def).toContain('var AMAP = null;')
    const amap = buildHtmlSandboxSrcdoc(page('<div id="m"></div>', js), { net: { tiles: 'amap', wiki: false } })
    expect(amap).toContain(`var AMAP = ${JSON.stringify(AMAP_TILE)};`)
    expect(amap).toContain('__iuiWgs2Gcj = w2g')
    expect(amap).toContain('L.CRS.IuiGcj')
    expect(amap).toContain('amap-outside-china')
    expect(amap).toMatch(/img-src [^;]*https:\/\/\*\.is\.autonavi\.com/)
    expect(amap).toContain('高德地图')
    // the option is scoped to this build
    expect(getNetContext()).toEqual({ tiles: 'default', wiki: true })
  })

  it('map embed draws AMap tiles in the GCJ CRS', () => {
    const doc = buildLeafletMapSrcdoc({ markers: [{ lat: 31.23, lng: 121.47, label: '上海' }], tiles: 'amap' } as never)
    expect(doc).toContain('is.autonavi.com/appmaptile')
    expect(doc).toContain('crs:L.CRS.IuiGcj')
    const viaCtx = withNetContext({ tiles: 'amap' }, () => buildLeafletMapSrcdoc({ markers: [{ lat: 31.23, lng: 121.47, label: '上海' }] } as never))
    expect(viaCtx).toContain('is.autonavi.com/appmaptile')
    expect(buildLeafletMapSrcdoc({ markers: [{ lat: 31.23, lng: 121.47, label: '上海' }] } as never)).not.toContain('autonavi')
  })
})

describe('F3 photo fallback', () => {
  it('no Wikimedia → map-card thumbnails immediately (script still parses)', () => {
    const off = buildTripPhotoFillScript({ wiki: false, tiles: 'amap' })
    expect(off).toContain('"wiki":false')
    expect(off).toContain('function addMapThumb(photo)')
    const body = off.replace(/^<script>\n/, '').replace(/<\/script>$/, '').replace(/<\\\/script>$/, '')
    expect(() => new Function(body)).not.toThrow()
    expect(buildTripPhotoFillScript()).toContain('"wiki":true')
  })
})

describe('F settings card', () => {
  it('auto summary shows the chosen mirrors, basemap and photo mode', () => {
    const html = renderToStaticMarkup(createElement(NetworkProbeCard, { t: (k: string) => k, preset: 'auto', mapTiles: 'auto', initial: CHINA }))
    expect(html).toContain('data-iui-net-auto="amap|map|zstatic,staticfile,npmmirror"')
    expect(html).toContain('netAutoLibs')
    for (const id of ['zstatic', 'staticfile', 'amap']) expect(html).toContain(`data-iui-probe="${id}"`)
    const g = renderToStaticMarkup(createElement(NetworkProbeCard, { t: (k: string) => k, preset: 'auto', mapTiles: 'auto', initial: GLOBAL }))
    expect(g).toContain('data-iui-net-auto="default|wiki|')
  })
})
