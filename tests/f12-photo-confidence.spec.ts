import { describe, expect, it } from 'vitest'
import {
  PHOTO_MATCH_JS,
  geoMeters,
  looksLikeFilename,
  photoCreditLabel,
  photoMatchesPlace,
} from '../src/shared/photo-match.ts'
import {
  buildTripPhotoFillScript,
  enrichPlaceMediaHtml,
  fetchWikipediaTripImage,
  lookupKnownStop,
  NO_CONFIDENT_PHOTO_REASON,
  resolveTripStopImages,
} from '../src/shared/trip-images.ts'
import { createGetTripStopImagesTool } from '../src/plugin/trip-images-tool.ts'

type Api = {
  iuiPhotoMatches: (p: string, e: string) => boolean
  iuiGeoMeters: (a: unknown, b: unknown) => number
  iuiLooksLikeFilename: (s: unknown) => boolean
}
// eslint-disable-next-line @typescript-eslint/no-implied-eval
const inPage = new Function(`${PHOTO_MATCH_JS}; return { iuiPhotoMatches, iuiGeoMeters, iuiLooksLikeFilename };`)() as Api

const MATCH_CASES: Array<[string, string, boolean]> = [
  ['愚园路', "Jing'an_Temple_2019.jpg Jing'an Temple main hall Buddhist temples in Shanghai", false],
  ['静安寺', '静安寺 大雄宝殿.jpg', true],
  ['Pingyao', 'Pingyao_city_wall.jpg City wall', true],
  ['West Lake', 'West_Lake_Hangzhou_2019.jpg', true],
  ['West Lake', 'Leifeng_Pagoda.jpg', false],
  ['Day 2 · 拙政园', '拙政园 远香堂', true],
  ['Golden Gate Bridge', 'GoldenGateBridge-001.jpg', false],
  ['Golden Gate Bridge', 'Golden Gate Bridge at sunset.jpg', true],
  ['Seesaw Coffee 安福路', 'Seesaw Coffee Anfu Road store.jpg', true],
  ['Blue Door Bistro', 'Shanghai street corner.jpg', false],
]

describe('F12 photo matcher', () => {
  it.each(MATCH_CASES)('%s vs %s → %s (TS and in-page agree)', (place, evidence, want) => {
    expect(photoMatchesPlace(place, evidence)).toBe(want)
    expect(inPage.iuiPhotoMatches(place, evidence)).toBe(want)
  })

  it('geo distance and filename detection agree', () => {
    const a = { lat: 31.22, lon: 121.44 }
    const b = { lat: 31.2205, lng: 121.4402 }
    expect(geoMeters(a, b)).toBeGreaterThan(40)
    expect(geoMeters(a, b)).toBeLessThan(80)
    expect(Math.abs(inPage.iuiGeoMeters(a, b) - geoMeters(a, b))).toBeLessThan(0.01)
    expect(geoMeters(a, null)).toBe(Infinity)
    for (const s of ['File:Foo.jpg', 'Model_photo_2019.JPG', 'Jane Doe', 'CC BY-SA 4.0']) {
      expect(inPage.iuiLooksLikeFilename(s)).toBe(looksLikeFilename(s))
    }
    expect(looksLikeFilename('Bar.jpeg')).toBe(true)
    expect(looksLikeFilename('Jane Doe')).toBe(false)
    expect(photoCreditLabel(true)).toBe('ⓘ 图片来自 Wikimedia')
    expect(photoCreditLabel(false)).toBe('ⓘ Photo: Wikimedia')
  })
})

describe('F12 strict well-known lookup', () => {
  it('keeps exact and generic-suffix matches', () => {
    for (const p of ['上海', '苏州市', 'Day 2 上海', '第1天 · 苏州', '上海 外滩', 'Shanghai Bund', '外滩悦榕庄']) {
      expect(lookupKnownStop(p)?.status, p).toBe('available')
    }
  })

  it('rejects venues that merely contain a city name', () => {
    for (const p of ['上海 Seesaw 安福路', '愚园路', '上海迪士尼', 'Pingyao']) {
      expect(lookupKnownStop(p), p).toBeNull()
    }
  })

  it('static enrich leaves a venue card empty and uses a collapsed credit for known places', () => {
    const venue = enrichPlaceMediaHtml('<div class="iui-stop-card"><div class="photo"></div><span class="name">上海 Seesaw 安福路</span></div>')
    expect(venue).not.toContain('<img')
    const city = enrichPlaceMediaHtml('<div class="iui-stop-card"><div class="photo"></div><span class="name">上海</span></div>')
    expect(city).toContain('ⓘ 图片来自 Wikimedia')
    expect(city).toContain('title="Jakub Hałun · CC BY-SA 4.0"')
    expect(city).not.toMatch(/>[^<]*\.jpg</i)
  })
})

function mockFetch(routes: Record<string, unknown>) {
  const calls: string[] = []
  const impl = (async (input: RequestInfo | URL) => {
    const url = String(input)
    calls.push(url)
    for (const [needle, body] of Object.entries(routes)) {
      if (url.includes(needle)) {
        return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
      }
    }
    return new Response('{}', { status: 404 })
  }) as typeof fetch
  return { impl, calls }
}

const extmeta = (artist: string, desc: string, cats = '') => ({
  query: { pages: { '1': { imageinfo: [{ extmetadata: {
    Artist: { value: artist }, LicenseShortName: { value: 'CC BY-SA 4.0' },
    ImageDescription: { value: desc }, Categories: { value: cats },
  } }] } } },
})

describe('F12 fetchWikipediaTripImage confidence', () => {
  it('rejects a 静安寺 lead image for 愚园路 (zh + English title checked)', async () => {
    const { impl, calls } = mockFetch({
      'zh.wikipedia.org/api/rest_v1/page/summary/%E6%84%9A%E5%9B%AD%E8%B7%AF': {
        title: '愚园路',
        thumbnail: { source: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/Jing%27an_Temple_2019.jpg/320px-Jing%27an_Temple_2019.jpg' },
      },
      'File%3AJing': extmeta('Someone', "Jing'an Temple", "Jing'an Temple"),
      'prop=langlinks': { query: { pages: { '5': { langlinks: [{ '*': 'Yuyuan Road' }] } } } },
    })
    const hit = await fetchWikipediaTripImage('愚园路', { fetchImpl: impl })
    expect(hit.status).toBe('unavailable')
    expect(hit.reason).toBe(NO_CONFIDENT_PHOTO_REASON)
    expect(hit.reason).toMatch(/placeholder/)
    expect(calls.some((u) => u.includes('langlinks'))).toBe(true)
  })

  it('accepts when Commons metadata names the place; artist never a file name', async () => {
    const { impl } = mockFetch({
      'page/summary/Pingyao': {
        title: 'Pingyao',
        thumbnail: { source: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2b/Pingyao_city_wall.jpg/320px-Pingyao_city_wall.jpg' },
      },
      'File%3APingyao': extmeta('Pingyao_city_wall.jpg', 'City wall'),
    })
    const hit = await fetchWikipediaTripImage('Pingyao', { fetchImpl: impl })
    expect(hit.status).toBe('available')
    expect(hit.confidence).toBe('named')
    expect(hit.artist).toBe('Wikimedia Commons contributor')
    expect(hit.credit_url).toContain('File:Pingyao_city_wall.jpg')
  })

  it('accepts an unnamed lead image when the article is within 300 m of the stop', async () => {
    const { impl } = mockFetch({
      'page/summary/Blue%20Door': {
        title: 'Blue Door',
        coordinates: { lat: 31.2201, lon: 121.4401 },
        thumbnail: { source: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3c/IMG_1234.jpg/320px-IMG_1234.jpg' },
      },
      'File%3AIMG_1234': extmeta('Jane', 'Front'),
    })
    const near = await fetchWikipediaTripImage('Blue Door', { fetchImpl: impl, coords: { lat: 31.22, lon: 121.44 } })
    expect(near.status).toBe('available')
    expect(near.confidence).toBe('geo')
    const far = await fetchWikipediaTripImage('Blue Door', { fetchImpl: impl, coords: { lat: 31.3, lon: 121.5 } })
    expect(far.status).toBe('unavailable')
  })

  it('falls back to Commons geosearch: within 300 m AND named (nearby concert photo rejected)', async () => {
    const { impl, calls } = mockFetch({
      'generator=geosearch': { query: { pages: {
        '7': {
          title: 'File:Tiny Cafe X storefront.jpg',
          coordinates: [{ lat: 31.2205, lon: 121.4402 }],
          imageinfo: [{ thumburl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7a/s.jpg/480px-s.jpg', extmetadata: { Artist: { value: 'Geo Person' }, LicenseShortName: { value: 'CC BY 4.0' } } }],
        },
        '9': {
          title: 'File:Concert hall stage.jpg',
          coordinates: [{ lat: 31.2201, lon: 121.4401 }],
          imageinfo: [{ thumburl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/c.jpg/480px-c.jpg' }],
        },
        '8': {
          title: 'File:Tiny Cafe X far branch.jpg',
          coordinates: [{ lat: 31.24, lon: 121.46 }],
          imageinfo: [{ thumburl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8a/f.jpg/480px-f.jpg' }],
        },
      } } },
    })
    const res = await resolveTripStopImages(['Tiny Cafe X'], { fetchImpl: impl, coordinates: [{ lat: 31.22, lon: 121.44 }] })
    const stop = res.stops[0]!
    expect(stop.status).toBe('available')
    expect(stop.confidence).toBe('geo')
    expect(stop.image_url).toContain('/s.jpg')
    expect(stop.artist).toBe('Geo Person')
    expect(calls.some((u) => u.includes('ggsradius=300'))).toBe(true)
  })

  it('tool exposes coordinates + confidence and forbids substitutes', async () => {
    const tool = createGetTripStopImagesTool()
    expect(JSON.stringify(tool.parameters)).toContain('coordinates')
    expect(tool.description).toMatch(/never substitute/i)
    const out = String(await tool.execute({ wikipedia_titles: ['上海'] }))
    expect(out).toContain('confidence=known')
    expect(out).toContain('ⓘ 图片来自 Wikimedia')
  })
})

describe('F12 runtime fill script', () => {
  it('inlines matcher, placeholder, collapsed credit and negative cache', () => {
    const s = buildTripPhotoFillScript()
    expect(s).toContain('function iuiPhotoMatches')
    expect(s).toContain('iui-photo-ph')
    expect(s).toContain('data-iui-photo-state')
    expect(s).toContain('generator: \'geosearch\'')
    expect(s).toContain('ⓘ 图片来自 Wikimedia')
    expect(s).toContain('CACHE[key] = info || false')
    expect(s).toContain('sanitizeCredits')
    expect(s).not.toContain("' · Wikimedia'")
    const body = s.replace(/^<script>/, '').replace(/<\/script>$/, '')
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    expect(() => new Function(body)).not.toThrow()
  })
})
