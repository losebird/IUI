import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildHtmlSandboxSrcdoc,
  hardenAuthorJs,
  IUI_MAP_TILE_FALLBACKS,
  parseHtmlSandboxFence,
  prepareAuthorJs,
  rewriteChartEsmImports,
  getHtmlSandboxStarter,
} from '../src/shared/html-sandbox.ts'

describe('0.13.0-iui.17 production stabilize', () => {
  it('hardens smart quotes and soft-closes truncated braces', () => {
    const raw = 'var x = { a: “hi”, b: 1'
    const out = hardenAuthorJs(raw)
    expect(out).toContain('"hi"')
    expect(out).not.toContain('“')
    expect(out.endsWith('}')).toBe(true)
  })

  it('rewrites import("chart.js") to UMD global module', () => {
    const src = "var M = await import('chart.js'); var Chart = M.Chart;"
    const out = rewriteChartEsmImports(src)
    expect(out).toContain('__iuiChartMod')
    expect(out).not.toMatch(/import\s*\(\s*['"]chart\.js['"]\s*\)/)
  })

  it('prepareAuthorJs chains tile rewrite + chart + harden', () => {
    const src = "L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'); await import(\"chart.js\"); var o={a:“x”"
    const out = prepareAuthorJs(src)
    expect(out).toContain('server.arcgisonline.com')
    expect(out).toContain('__iuiChartMod')
    expect(out).toContain('"x"')
  })

  it('injects Chart UMD + guard for weather fences', () => {
    const fence = JSON.stringify({
      title: 'wx',
      height: 400,
      css: '',
      html: '<div class="iui-weather"><div class="iui-weather-chart"><canvas id="wxChart"></canvas></div></div>',
      js: "await import('chart.js'); new Chart(document.getElementById('wxChart'),{type:'line',data:{labels:[],datasets:[]},options:{}})",
    })
    const spec = parseHtmlSandboxFence(fence)!
    const doc = buildHtmlSandboxSrcdoc(spec, { frameId: 'wx-17' })
    expect(doc).toContain('chart.umd.js')
    expect(doc).toContain('iuiCreateChart')
    expect(doc).toContain('__iuiChartMod')
    expect(doc).toContain('__iuiChartOrig')
    // ESM import rewritten away in author JS
    expect(doc).not.toMatch(/await import\(['"]chart\.js['"]\)/)
  })

  it('tile guard ships fallback chain including OSM FR HOT', () => {
    expect(IUI_MAP_TILE_FALLBACKS.length).toBeGreaterThanOrEqual(2)
    expect(IUI_MAP_TILE_FALLBACKS.some((f) => f.url.includes('openstreetmap.fr'))).toBe(true)
    const fence = JSON.stringify({
      html: '<div id="map" class="iui-map-wrap" style="height:280px"></div>',
      css: '',
      js: "var map=L.map('map').setView([31.2,121.5],11);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);",
    })
    const doc = buildHtmlSandboxSrcdoc(parseHtmlSandboxFence(fence)!, { frameId: 'map-17' })
    expect(doc).toContain('openstreetmap.fr/hot')
    expect(doc).toContain('World_Light_Gray_Base')
    expect(doc).toContain('tile.openstreetmap.fr') // CSP
    expect(doc).toContain('swapLayer')
  })

  it('weather-dense starter uses UMD Chart path (no ESM import)', () => {
    const s = getHtmlSandboxStarter('weather-dense')!
    expect(s.spec.js).toMatch(/window\.Chart|iuiCreateChart/)
    expect(s.spec.js).not.toMatch(/import\(['"]chart\.js['"]\)/)
  })

  it('stage chrome hides partialHint when ready + ready timeout', () => {
    const src = readFileSync(resolve(__dirname, '../src/client/html-fence.tsx'), 'utf8')
    expect(src).toMatch(/parsed\.partial && !ready && <span>\{t\('sandbox\.partialHint'\)\}<\/span>/)
    expect(src).toMatch(/setTimeout\(\(\) => setReady\(true\), 2500\)/)
    expect(src).toMatch(/prepareAuthorJs\(parsed\.js\)/)
  })
})
