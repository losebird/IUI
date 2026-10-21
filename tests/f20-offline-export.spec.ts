import { describe, expect, it } from 'vitest'
import { buildOfflineExport, type ExportFetcher } from '../src/client/offline-export.ts'
import { buildHtmlSandboxSrcdoc, isIuiSandboxHostMessage, parseHtmlSandboxFence } from '../src/shared/html-sandbox.ts'
import { vendorCssUrls, vendorJsUrls } from '../src/shared/vendor-registry.ts'

const BASE = 'http://127.0.0.1:3101/plugins/iui/assets'

function fakeFetch(files: Record<string, string>, calls: string[] = []): ExportFetcher {
  return async (url, as) => {
    calls.push(url)
    const body = files[url]
    if (body === undefined) return null
    return { body: as === 'text' ? body : new TextEncoder().encode(body), type: url.endsWith('.png') ? 'image/png' : 'text/plain' }
  }
}

function srcdoc(html: string, js: string, opts: Record<string, unknown> = {}): string {
  return buildHtmlSandboxSrcdoc(parseHtmlSandboxFence(JSON.stringify({ html, css: '', js }))!, { frameId: 'download', ...opts })
}

describe('F20 offline export', () => {
  it('inlines on-demand libs + css, drops the local origin and allows data: modules', async () => {
    const js = vendorJsUrls('leaflet', BASE)[0]!
    const css = vendorCssUrls('leaflet', BASE)[0]![0]!
    const doc = srcdoc('<div id="m"></div>', 'L.map("m")', { assetBase: BASE })
    const out = await buildOfflineExport(doc, [{ url: js, type: 'script' }, { url: css, type: 'link' }, { url: `${BASE}/vendor/leaflet@1.9.4/dist/images/layers.png`, type: 'css' }], {
      assetBase: BASE,
      fetcher: fakeFetch({ [js]: 'window.L={version:"x"};', [css]: '.leaflet-control-layers-toggle{background-image:url(images/layers.png)}', [`${BASE}/vendor/leaflet@1.9.4/dist/images/layers.png`]: 'PNG' }),
    })
    expect(out.failed).toEqual([])
    expect(out.html).toContain('window.L={version:"x"};')
    expect(out.html).toMatch(/\.leaflet-control-layers-toggle\{background-image:url\("data:image\/png;base64,/)
    expect(out.html.split('window.L={version').length).toBe(2)
    expect(out.html).not.toMatch(/<script[^>]+src=["'][^"']*leaflet\.js/)
    expect(out.html).not.toContain('127.0.0.1:3101')
    expect(out.html).toMatch(/script-src [^;]* data:/)
    expect(out.tooLarge).toBe(false)
  })

  it('maps modules flat in the import map (relative imports → absolute → data:)', async () => {
    const doc = srcdoc('<div id="t"></div>', 'import("three").then(function(){})')
    const root = 'https://cdn.jsdelivr.net/npm/three@0.180.0/'
    const mod = `${root}build/three.module.js`
    const core = `${root}build/three.core.js`
    const orbit = `${root}examples/jsm/controls/OrbitControls.js`
    const out = await buildOfflineExport(doc, [{ url: mod, type: 'script' }, { url: orbit, type: 'script' }], {
      fetcher: fakeFetch({
        [mod]: 'export * from "./three.core.js";\nimport { x } from \'./three.core.js\';',
        [core]: 'export const Scene = 1;',
        [orbit]: 'import { Scene } from "three"; export class OrbitControls {}',
      }),
    })
    const map = JSON.parse(/<script type="importmap">([\s\S]*?)<\/script>/.exec(out.html)![1]!.replace(/<\\\//g, '</')).imports as Record<string, string>
    expect(map.three).toMatch(/^data:text\/javascript;base64,/)
    expect(map['three/addons/controls/OrbitControls.js']).toMatch(/^data:/)
    expect(map[core]).toMatch(/^data:/)
    const modText = Buffer.from(map.three!.split(',')[1]!, 'base64').toString('utf8')
    expect(modText).toContain(`from "${core}"`)
    const orbitText = Buffer.from(map['three/addons/controls/OrbitControls.js']!.split(',')[1]!, 'base64').toString('utf8')
    expect(orbitText).toContain('from "three"')
  })

  it('collects page images and tiles into the asset table, reports failures', async () => {
    const img = 'https://upload.wikimedia.org/a/b/330px-x.jpg'
    const tile = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/12/1662/3401'
    const doc = srcdoc(`<img src="${img}"><div style="background:url(${img})"></div>`, '')
    const out = await buildOfflineExport(doc, [{ url: tile, type: 'img' }, { url: 'https://gone.example/a.png', type: 'img' }], {
      fetcher: fakeFetch({ [img]: 'JPG', [tile]: 'TILE' }), lang: 'zh',
    })
    expect(out.html).toContain('__iuiOfflineAssets')
    expect(out.html).toContain(JSON.stringify(tile))
    expect(out.html).toContain('离线：只保存了导出时看到的地图范围')
    expect(out.html).toMatch(/background:url\("data:/)
    expect(out.failed).toEqual(['https://gone.example/a.png'])
  })

  it('flags oversize exports', async () => {
    const doc = srcdoc('<p>x</p>', '')
    const out = await buildOfflineExport(doc, [], { fetcher: fakeFetch({}), maxBytes: 1000 })
    expect(out.tooLarge).toBe(true)
  })

  it('snapshot messages may carry fetched resources', () => {
    const base = { source: 'iui-html', type: 'snapshot', frameId: 'f', html: '', css: '', state: {} }
    expect(isIuiSandboxHostMessage({ ...base, resources: [{ url: 'https://a/b.js', type: 'script' }] })).toBe(true)
    expect(isIuiSandboxHostMessage({ ...base, resources: [{ url: 1, type: 'script' }] })).toBe(false)
    expect(isIuiSandboxHostMessage(base)).toBe(true)
  })
})
