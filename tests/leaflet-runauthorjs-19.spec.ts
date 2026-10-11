import { describe, expect, it } from 'vitest'
import { buildHtmlSandboxSrcdoc, buildSandboxBridgeScript } from '../src/shared/html-sandbox.ts'
import { lookupKnownStop } from '../src/shared/trip-images.ts'

describe('0.13.0-iui.19 leaflet race + photos', () => {
  it('puts Leaflet CDN tags in <head> before bridge ready', () => {
    const doc = buildHtmlSandboxSrcdoc({
      title: 'trip',
      height: 400,
      css: '',
      html: '<div class="iui-map-wrap"><div id="map"></div></div>',
      js: "var map=L.map('map').setView([31.2,121.5],11);",
      stages: ['html', 'js'],
      partial: false,
      cssComplete: true,
      htmlComplete: true,
      jsComplete: true,
    }, { deferAuthorJs: true, frameId: 't19' })
    const headEnd = doc.indexOf('</head>')
    const leafInHead = doc.indexOf('leaflet@1.9.4/dist/leaflet.js')
    const readyIdx = doc.indexOf("post({ type: 'ready' })")
    expect(leafInHead).toBeGreaterThan(-1)
    expect(leafInHead).toBeLessThan(headEnd)
    expect(readyIdx).toBeGreaterThan(headEnd)
  })

  it('runAuthorJs bridge waits/injects Leaflet before eval', () => {
    const bridge = buildSandboxBridgeScript('t19')
    expect(bridge).toContain('runAuthorJs')
    expect(bridge).toContain('ensureScript')
    expect(bridge).toContain('wantsLeaflet')
    expect(bridge).toContain('typeof L')
    expect(bridge).toContain('leaflet@1.9.4/dist/leaflet.js')
  })

  it('detects #map alone as leaflet need', () => {
    const doc = buildHtmlSandboxSrcdoc({
      title: 'm',
      height: 300,
      css: '',
      html: '<div id="map" style="height:280px"></div>',
      js: '',
      stages: ['html'],
      partial: false,
      cssComplete: true,
      htmlComplete: true,
      jsComplete: true,
    }, { deferAuthorJs: true })
    expect(doc).toContain('leaflet@1.9.4/dist/leaflet.js')
  })

  it('well-known China stops resolve to live Commons files', () => {
    for (const place of ['上海', '苏州', '南京', '济南', '北京']) {
      const hit = lookupKnownStop(place)
      expect(hit?.status).toBe('available')
      expect(hit?.image_url).toMatch(/Special:FilePath\//)
    }
  })
})
