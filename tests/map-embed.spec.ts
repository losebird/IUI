import { describe, expect, it } from 'vitest'
import {
  buildDefaultMapLinks,
  buildLeafletMapSrcdoc,
  buildOsmEmbedUrl,
  finiteCoords,
  resolveMapSurface,
} from '../src/shared/map-embed.ts'

describe('map-embed', () => {
  it('builds OSM embed from coords', () => {
    const url = buildOsmEmbedUrl(32.0439, 118.7881, 15)
    expect(url).toContain('openstreetmap.org/export/embed.html')
    expect(url).toContain('marker=32.043900%2C118.788100')
  })

  it('rejects invalid coords', () => {
    expect(finiteCoords(91, 0)).toBeUndefined()
    expect(finiteCoords(32, 'x')).toBeUndefined()
  })

  it('builds default CTAs from query (no hardcoded place table)', () => {
    const links = buildDefaultMapLinks('Somewhere Park')
    expect(links.length).toBeGreaterThanOrEqual(2)
    expect(links.every((l) => l.href.startsWith('https://'))).toBe(true)
    expect(links.some((l) => l.href.includes(encodeURIComponent('Somewhere Park')))).toBe(true)
  })

  it('leaflet srcdoc includes CartoCDN tiles + optional geocode', () => {
    const withCoords = buildLeafletMapSrcdoc({ lat: 31.2, lng: 121.5, title: '示例' })
    expect(withCoords).toContain('leaflet')
    expect(withCoords).toContain('server.arcgisonline.com')
    expect(withCoords).not.toContain('tile.openstreetmap.org')
    expect(withCoords).toContain('31.2')

    const byQuery = buildLeafletMapSrcdoc({ query: 'city park' })
    expect(byQuery).toContain('nominatim.openstreetmap.org')
    expect(byQuery).toContain('city park')
  })

  it('resolveMapSurface prefers author embed; default leaflet; osm when asked', () => {
    const embed = resolveMapSurface({
      embed: 'https://www.openstreetmap.org/export/embed.html?bbox=1,2,3,4',
      safeEmbedUrl: (u) => u,
    })
    expect(embed.kind).toBe('iframe-src')

    const osm = resolveMapSurface({ lat: 32.04, lng: 118.78, provider: 'osm' })
    expect(osm.kind).toBe('iframe-src')
    if (osm.kind === 'iframe-src') expect(osm.mode).toBe('osm')

    const leafletDefault = resolveMapSurface({ lat: 32.04, lng: 118.78 })
    expect(leafletDefault.kind).toBe('iframe-srcdoc')

    const leaflet = resolveMapSurface({ query: '南京珠江路', provider: 'leaflet' })
    expect(leaflet.kind).toBe('iframe-srcdoc')
  })

  it('leaflet srcdoc pins multiple markers', () => {
    const html = buildLeafletMapSrcdoc({
      title: '园区',
      markers: [
        { lat: 31.23, lng: 121.47, label: '东门' },
        { lat: 31.231, lng: 121.472, label: '西门' },
      ],
    })
    expect(html).toContain('东门')
    expect(html).toContain('fitBounds')
  })

})
