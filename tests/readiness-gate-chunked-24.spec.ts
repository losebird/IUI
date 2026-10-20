import { describe, expect, it } from 'vitest'
import {
  buildHtmlSandboxSrcdoc,
  buildSandboxBridgeScript,
  prepareAuthorJs,
  splitAuthorJsChunks,
} from '../src/shared/html-sandbox.ts'
import { buildAuthorJsRuntimeSource } from '../src/shared/author-js-runtime.ts'

describe('0.13.0-iui.24 readiness gate + chunked author JS', () => {
  it('splits top-level functions away from a bad Chart statement', () => {
    const src = `function addSub(){ window._add = 1; }
function resetDemo(){ window._reset = 1; }
var bad = new Chart(el,{type:'bar',options:{x:1}}}});
document.getElementById('x').onclick = addSub;`
    const chunks = splitAuthorJsChunks(src)
    expect(chunks.length).toBeGreaterThanOrEqual(4)
    expect(chunks.some((c) => c.includes('function addSub') && !c.includes('new Chart'))).toBe(true)
    expect(chunks.some((c) => c.includes('function resetDemo') && !c.includes('new Chart'))).toBe(true)
    expect(chunks.some((c) => c.includes('new Chart') && !c.includes('onclick'))).toBe(true)
    expect(chunks.some((c) => c.includes('onclick') && !c.includes('new Chart'))).toBe(true)
    // Surviving chunks must compile; the bad Chart chunk may not.
    for (const c of chunks) {
      if (c.includes('new Chart')) continue
      expect(() => new Function(c)).not.toThrow()
    }
  })

  it('bridge posts bridgeReady and uses shared pipeline (no same-source SyntaxError retry)', () => {
    const bridge = buildSandboxBridgeScript('t24')
    expect(bridge).toContain("type: 'bridgeReady'")
    expect(bridge).toContain('__iuiAuthorPipeline')
    expect(bridge).toContain('ensureLibsThenRun')
    expect(bridge).toContain('libsReady')
    expect(bridge).toContain('authorSettled')
    expect(bridge).not.toContain('soft retry')
    // Race gate: wait for L / Chart before author run
    expect(bridge).toContain('typeof L')
    expect(bridge).toContain('typeof Chart')
    expect(bridge).toContain('iui-preview-root')
    // F2: no global querySelector patch; host helpers use the captured native.
    expect(buildAuthorJsRuntimeSource()).not.toContain('installNullSafeQuery')
    expect(buildAuthorJsRuntimeSource()).not.toContain('NULL_NODE')
    expect(buildAuthorJsRuntimeSource()).not.toContain('ensureLiveImg')
    expect(buildAuthorJsRuntimeSource()).toContain('NQS.call(document, sel)')
    const body = bridge.replace(/^[\s\S]*?<script>/, '').replace(/<\/script>[\s\S]*$/, '')
    expect(() => new Function(body)).not.toThrow()
  })

  it('runtime source parses and mentions phase gate', () => {
    const src = buildAuthorJsRuntimeSource()
    expect(src).toContain('libsLoading')
    expect(src).toContain('libsReady')
    expect(src).toContain('authorSettled')
    expect(src).toContain('domPainted')
    expect(() => new Function(src)).not.toThrow()
  })

  it('final srcdoc uses the same ensureLibsThenRun pipeline + jsChunks', () => {
    const doc = buildHtmlSandboxSrcdoc({
      title: 'billing',
      height: 400,
      css: '',
      html: '<canvas id="pieChart"></canvas><button id="add" data-iui-on-click="addSub">+</button>',
      js: `function addSub(){ window._n = (window._n||0)+1; }
new Chart(document.getElementById('pieChart'), { type: 'doughnut', data: { labels: ['a'], datasets: [{ data: [1] }] } });`,
      stages: ['html', 'js'],
      partial: false,
      cssComplete: true,
      htmlComplete: true,
      jsComplete: true,
    }, { deferAuthorJs: false, frameId: 't24f' })
    expect(doc).toContain('chart.umd.min.js')
    expect(doc).toContain('ensureLibsThenRun')
    expect(doc).toContain('jsChunks')
    expect(doc).toContain('__iuiAuthorPipeline')
  })

  it('preview-shell still injects Leaflet/Chart CDN for map/canvas chrome when js deferred', () => {
    const mapDoc = buildHtmlSandboxSrcdoc({
      title: 'trip',
      height: 400,
      css: '',
      html: '<div class="iui-map-wrap"><div id="map"></div></div>',
      js: '',
      stages: ['html'],
      partial: false,
      cssComplete: true,
      htmlComplete: true,
      jsComplete: false,
    }, { deferAuthorJs: true, frameId: 't24m' })
    expect(mapDoc).toContain('leaflet@1.9.4/dist/leaflet.js')

    const chartDoc = buildHtmlSandboxSrcdoc({
      title: 'billing',
      height: 400,
      css: '',
      html: '<canvas id="shareChart"></canvas><button data-iui-on-click="addSub">+</button>',
      js: '',
      stages: ['html'],
      partial: false,
      cssComplete: true,
      htmlComplete: true,
      jsComplete: false,
    }, { deferAuthorJs: true, frameId: 't24c' })
    expect(chartDoc).toContain('chart.umd.min.js')
  })

  it('chunk isolation: prepare + split keeps button handlers compiling when Chart braces are excess', () => {
    const raw = `function addSub(){ var n=1; }
function resetDemo(){ var n=0; }
var ctx=document.getElementById('c');
new Chart(ctx,{type:'doughnut',data:{labels:['a'],datasets:[{data:[1]}]},options:{plugins:{legend:{display:true}}}}});
document.getElementById('add').onclick=addSub;`
    const prepared = prepareAuthorJs(raw)
    const chunks = splitAuthorJsChunks(prepared)
    const handlers = chunks.filter((c) => /function\s+(addSub|resetDemo)/.test(c))
    expect(handlers.length).toBe(2)
    for (const h of handlers) {
      expect(() => new Function(h)).not.toThrow()
    }
  })
})
