import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildHtmlSandboxSrcdoc,
  IUI_MAP_TILE_FALLBACKS,
  parseHtmlSandboxFence,
  sanitizeAuthorRegexFlags,
  hardenAuthorJs,
  getHtmlSandboxStarter,
} from '../src/shared/html-sandbox.ts'
import { enrichPlaceMediaHtml, lookupKnownStop } from '../src/shared/trip-images.ts'
import { safeRegExp, safeRegExpTest } from '../src/shared/safe-regexp.ts'

describe('0.13.0-iui.18 non-model risk clear', () => {
  it('puts OSM FR HOT first in tile fallbacks (Asia gap fix)', () => {
    expect(IUI_MAP_TILE_FALLBACKS[0]!.url).toContain('openstreetmap.fr/hot')
    const fence = JSON.stringify({
      html: '<div id="map" class="iui-map-wrap" style="height:280px"></div>',
      css: '',
      js: "var map=L.map('map').setView([31.2,121.5],11);L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}').addTo(map);",
    })
    const doc = buildHtmlSandboxSrcdoc(parseHtmlSandboxFence(fence)!, { frameId: 'map-18' })
    expect(doc).toContain('east-asia')
    expect(doc).toContain('gap-text')
    expect(doc).toContain('settle-2.8s')
    expect(doc).toContain('openstreetmap.fr/hot')
  })

  it('sanitizes invalid regex flags in author JS', () => {
    expect(sanitizeAuthorRegexFlags("s.match(/ab/gixz)")).toBe('s.match(/ab/gi)')
    expect(hardenAuthorJs("s.replace(/x/foo, 'y')")).toContain("s.replace(/x/, 'y')")
  })

  it('safeRegExp never throws on bad flags/patterns', () => {
    expect(safeRegExp('foo', 'gixz')?.flags).toMatch(/g/)
    expect(safeRegExp('(', 'iu')).toBeNull()
    expect(safeRegExpTest('hello', 'iu', 'hello world')).toBe(true)
  })

  it('enriches hotel cards and hotel-covers starter', () => {
    expect(lookupKnownStop('外滩悦榕庄')?.status).toBe('available')
    const html = `<div class="iui-hotel-card" data-iui-place="上海"><div class="photo"></div><div class="name">外滩悦榕庄</div></div>`
    expect(enrichPlaceMediaHtml(html)).toMatch(/wikimedia|Special:FilePath/i)
    const starter = getHtmlSandboxStarter('hotel-covers')
    expect(starter).toBeTruthy()
    expect(starter!.spec.html).toContain('iui-hotel-card')
    const doc = buildHtmlSandboxSrcdoc(starter!.spec, { frameId: 'hotel-18' })
    expect(doc).toMatch(/Special:FilePath|wikimedia/i)
  })

  it('bridge + host restore localState (source anchors)', () => {
    const sandbox = readFileSync(resolve(__dirname, '../src/shared/html-sandbox.ts'), 'utf8')
    expect(sandbox).toContain("type: 'localState'")
    expect(sandbox).toContain("type: 'restoreLocalState'")
    expect(sandbox).toContain('captureLocalState')
    const fence = readFileSync(resolve(__dirname, '../src/client/html-fence.tsx'), 'utf8')
    expect(fence).toContain('localStateByFence')
    expect(fence).toContain('restoreLocalState')
  })

  it('allows get_place_images before fence', () => {
    const src = readFileSync(resolve(__dirname, '../src/config/stream-heuristics.ts'), 'utf8')
    expect(src).toContain('get_place_images')
  })
})
