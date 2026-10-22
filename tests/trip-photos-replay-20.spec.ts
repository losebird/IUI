import { describe, expect, it } from 'vitest'
import { buildHtmlSandboxSrcdoc, IUI_MAP_TILE_FALLBACKS } from '../src/shared/html-sandbox.ts'
import { buildTripPhotoFillScript, fetchWikipediaTripImage, lookupKnownStop } from '../src/shared/trip-images.ts'
import { createTripAnimatorSource } from '../src/shared/trip-animator.ts'

describe('0.13.0-iui.20 trip photos + replay tiles', () => {
  it('photo fill script includes Wikipedia/Commons network path (not well-known only)', () => {
    const script = buildTripPhotoFillScript()
    expect(script).toContain('wikipedia.org/api/rest_v1/page/summary')
    expect(script).toContain("api('commons.wikimedia.org'")
    expect(script).toContain("'/w/api.php?'")
    expect(script).toContain('loading = \'eager\'')
    expect(script).toContain('titleVariants')
    expect(script).toContain('resolveNetwork')
    // soft cache still present
    expect(script).toContain('上海')
    expect(script).toContain('suzhou')
  })

  it('srcdoc CSP allows Wikipedia connect-src for runtime photo lookup', () => {
    const doc = buildHtmlSandboxSrcdoc({
      title: 't',
      height: 400,
      css: '',
      html: '<div class="iui-stop-card" data-iui-place="Kyoto"><div class="photo"></div><div class="name">Kyoto</div></div>',
      js: '',
      stages: ['html'],
      partial: false,
      cssComplete: true,
      htmlComplete: true,
      jsComplete: true,
    }, { frameId: 'p20' })
    expect(doc).toContain('https://en.wikipedia.org')
    expect(doc).toContain('https://zh.wikipedia.org')
    expect(doc).toContain('https://commons.wikimedia.org')
    expect(doc).toContain('resolveNetwork')
  })

  it('tile guard refreshes maps on Replay click and exposes L.iuiRefreshMaps', () => {
    // buildLeafletTileGuardScript is not exported — assert via srcdoc
    const doc = buildHtmlSandboxSrcdoc({
      title: 'm',
      height: 300,
      css: '',
      html: '<div class="iui-map-wrap"><div id="map"></div><button id="bReplay">Replay</button></div>',
      js: "var map=L.map('map').setView([31.2,121.5],6);",
      stages: ['html', 'js'],
      partial: false,
      cssComplete: true,
      htmlComplete: true,
      jsComplete: true,
    }, { frameId: 'm20' })
    expect(doc).toContain('L.iuiRefreshMaps')
    expect(doc).toContain('replay-click')
    expect(doc).toContain('view-empty')
    expect(doc).toContain('bReplay')
    expect(IUI_MAP_TILE_FALLBACKS[0]!.url).toContain('openstreetmap.fr')
    expect(IUI_MAP_TILE_FALLBACKS.some((f) => f.url.includes('World_Topo'))).toBe(false)
    expect(doc).not.toContain('World_Topo_Map')
  })

  it('createTripAnimator.replay refreshes maps (invalidateSize / iuiRefreshMaps)', () => {
    const src = createTripAnimatorSource()
    expect(src).toContain('refreshMaps')
    expect(src).toContain('iuiRefreshMaps')
    expect(src).toContain('animator-replay')
    expect(src).toMatch(/function replay\([\s\S]*refreshMaps/)
    expect(src).toContain('if (!pin) return')
  })

  it('well-known remains soft cache for Suzhou/Jinan (not the only path)', () => {
    expect(lookupKnownStop('苏州')?.status).toBe('available')
    expect(lookupKnownStop('济南')?.status).toBe('available')
    expect(lookupKnownStop('Suzhou')?.status).toBe('available')
    expect(lookupKnownStop('Jinan')?.status).toBe('available')
  })
})

describe('0.13.0-iui.20 wikipedia fetch (network, soft)', () => {
  it('resolves an arbitrary place via Wikipedia without well-known entry', async () => {
    // "Chengdu" is well-known; pick a less-common but real wiki title if network works.
    // Use "West Lake" which may or may not be in well-known as hangzhou landmark — "Hangzhou" is known.
    // Prefer a title unlikely in soft cache: "Pingyao"
    const known = lookupKnownStop('Pingyao')
    expect(known).toBeNull()
    const hit = await fetchWikipediaTripImage('Pingyao')
    if (hit.status !== 'available') {
      // Network may be blocked in CI — do not fail the suite hard.
      expect(['unavailable']).toContain(hit.status)
      return
    }
    expect(hit.image_url).toMatch(/wikimedia|wikipedia/i)
    expect(hit.source).toBe('wikipedia')
  }, 20000)
})
