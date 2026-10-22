import { describe, expect, it } from 'vitest'
import { buildHtmlSandboxSrcdoc, buildSandboxDownloadHtml, parseHtmlSandboxFence, rewriteAuthorCdnTags } from '../src/shared/html-sandbox.ts'
import { VENDOR_LIBS, rewriteKnownCdnUrl, vendorJsUrls } from '../src/shared/vendor-registry.ts'

const BASE = 'http://127.0.0.1:5173/plugins/@losebird/iui/assets'
const chartSpec = () => parseHtmlSandboxFence('{"html":"<canvas id=\\"chart\\"></canvas>","js":"new Chart(document.getElementById(\'chart\'),{type:\'bar\'})"}')!

describe('C6 local vendor assets', () => {
  it('candidate order (auto, no probe yet) is local → npmmirror → jsDelivr', () => {
    const urls = vendorJsUrls('chart', BASE)
    expect(urls[0]).toBe(`${BASE}/vendor/chart.js@4.4.1/dist/chart.umd.js`)
    expect(urls[1]).toContain('registry.npmmirror.com/chart.js/4.4.1/files/')
    expect(urls[2]).toContain('cdn.jsdelivr.net/npm/chart.js@4.4.1/')
  })
  it('srcdoc loads libs from the asset route first and allows its origin in CSP', () => {
    const doc = buildHtmlSandboxSrcdoc(chartSpec(), { frameId: 't', assetBase: BASE })
    expect(doc).toMatch(/<script async data-iui-cdn data-iui-fallback="https:\/\/registry\.npmmirror\.com[^"]*"[^>]+src="http:\/\/127\.0\.0\.1:5173\/plugins/)
    expect(doc).toMatch(/script-src [^;]*http:\/\/127\.0\.0\.1:5173/)
    expect(doc).toContain('window.__iuiVendor')
  })
  it('downloaded HTML never points at the local route', () => {
    const doc = buildSandboxDownloadHtml(chartSpec(), { frameId: 't', assetBase: BASE })
    expect(doc).not.toContain('127.0.0.1:5173')
    expect(doc).toContain('cdn.jsdelivr.net/npm/chart.js@4.4.1')
  })
  it('C8: model-authored CDN tags for registry libs are rewritten; others untouched', () => {
    const html = '<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.3/dist/leaflet.css"/><script src="https://cdn.jsdelivr.net/npm/chart.js"></script><script src="https://cdn.jsdelivr.net/npm/lodash@4/lodash.min.js"></script>'
    const out = rewriteAuthorCdnTags(html, BASE)
    expect(out).toContain(`${BASE}/vendor/leaflet@1.9.4/dist/leaflet.css`)
    expect(out).toContain(`${BASE}/vendor/chart.js@4.4.1/dist/chart.umd.js`)
    expect(out).toContain('lodash@4/lodash.min.js')
    expect(rewriteKnownCdnUrl('https://cdnjs.cloudflare.com/ajax/libs/d3/7.8.5/d3.min.js', BASE)).toBe(`${BASE}/vendor/d3@7.9.0/dist/d3.min.js`)
  })
  it('registry versions match installed packages', async () => {
    const { readFileSync } = await import('node:fs')
    for (const lib of Object.values(VENDOR_LIBS)) {
      const pkg = JSON.parse(readFileSync(`node_modules/${lib.pkg}/package.json`, 'utf8')) as { version: string }
      expect(pkg.version, lib.pkg).toBe(lib.version)
    }
  })
})
