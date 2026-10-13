import { describe, expect, it } from 'vitest'
import {
  buildTripPhotoFillScript,
  commonsFilePathUrl,
  enrichItineraryHtml,
  listWellKnownStopKeys,
  lookupKnownStop,
  resolveTripStopImages,
} from '../src/shared/trip-images.ts'
import { createGetTripStopImagesTool } from '../src/plugin/trip-images-tool.ts'
import { buildHtmlSandboxSrcdoc, parseHtmlSandboxFence } from '../src/shared/html-sandbox.ts'

describe('trip-images well-known', () => {
  it('resolves Shanghai / Paris / Nice / Tokyo', () => {
    for (const place of ['上海', 'Shanghai', '巴黎', 'Paris', '尼斯', 'Nice', '东京', 'Tokyo']) {
      const hit = lookupKnownStop(place)
      expect(hit?.status, place).toBe('available')
      expect(hit?.image_url).toMatch(/commons\.wikimedia\.org|wikimedia/)
      expect(hit?.artist).toBeTruthy()
      expect(hit?.license).toMatch(/CC|Public domain/)
    }
  })

  it('lists a non-trivial well-known table', () => {
    expect(listWellKnownStopKeys().length).toBeGreaterThan(30)
  })

  it('commonsFilePathUrl encodes spaces', () => {
    expect(commonsFilePathUrl('Foo Bar.jpg', 320)).toContain('Foo_Bar.jpg')
    expect(commonsFilePathUrl('Foo Bar.jpg', 320)).toContain('width=320')
  })
})

describe('enrichItineraryHtml + photo fill script', () => {
  it('injects img into empty photo band', () => {
    const html = `<div class="iui-itinerary"><div class="iui-cards-strip">
      <div class="iui-stop-card"><div class="photo"></div><div class="body"><span class="name">上海</span><div class="meta">Day 1</div></div></div>
      <div class="iui-stop-card"><div class="body"><span class="name">巴黎</span></div></div>
    </div></div>`
    const out = enrichItineraryHtml(html)
    expect(out).toContain('Special:FilePath')
    expect(out).toMatch(/alt="上海"/)
    expect(out).toContain('iui-photo-credit')
  })

  it('photo fill script embeds well-known map', () => {
    const script = buildTripPhotoFillScript()
    expect(script).toContain('上海')
    expect(script).toContain('paris')
    expect(script).toContain('Special:FilePath')
    expect(script).toContain('iui-photo-credit')
    expect(script).toContain('iuiSandbox.fillPhotos')
    expect(script).not.toMatch(/obs.disconnect\(\).*16000/)
  })

  it('srcdoc includes photo fill for itinerary HTML', () => {
    const body = JSON.stringify({
      title: 'trip',
      height: 420,
      css: '.x{}',
      html: '<div class="iui-itinerary"><div class="iui-cards-strip"><div class="iui-stop-card"><div class="photo"></div><div class="body"><span class="name">巴黎</span></div></div></div></div>',
      js: '/* cards */',
    })
    const parsed = parseHtmlSandboxFence(body)
    expect(parsed).not.toBeNull()
    const doc = buildHtmlSandboxSrcdoc(parsed!)
    expect(doc).toContain('Special:FilePath')
    expect(doc).toContain('iui-photo-credit')
    expect(doc).toMatch(/function norm\(s\)|var MAP =/)
  })
})

describe('get_trip_stop_images tool', () => {
  it('exposes tool definition', () => {
    const tool = createGetTripStopImagesTool()
    expect(tool.name).toBe('get_trip_stop_images')
    expect(tool.description).toMatch(/Wikimedia|Wikipedia/i)
  })

  it('resolveTripStopImages uses well-known without network when preferNetwork false', async () => {
    const result = await resolveTripStopImages(['Shanghai', 'Paris', 'Nice'], { preferNetwork: false })
    expect(result.stops).toHaveLength(3)
    expect(result.stops.every((s) => s.status === 'available')).toBe(true)
    expect(result.stops[0]?.image_url).toMatch(/wikimedia/i)
  })

  it('execute returns available stops for known places (offline path)', async () => {
    const tool = createGetTripStopImagesTool()
    // Monkey: resolve will try network; for CI stability call preferNetwork via resolve directly.
    // Tool execute always prefers network but falls back to well-known on failure.
    const out = String(await tool.execute({ wikipedia_titles: ['Shanghai', 'Paris'] }))
    expect(out).toContain('[iui-trip-images]')
    expect(out).toMatch(/status=ok|status=available|image_url=/)
  })
})

describe('P1-.15 remaining risks', () => {
  it('enrichPlaceMediaHtml fills hotel/product cards', async () => {
    const { enrichPlaceMediaHtml } = await import('../src/shared/trip-images.ts')
    const html = `<div class="iui-hotel-card"><div class="photo"></div><div class="name">东京</div></div>
      <div class="iui-product-card" data-iui-place="Paris"><div class="cover"></div><span class="name">香水</span></div>`
    const out = enrichPlaceMediaHtml(html)
    expect(out).toMatch(/Special:FilePath|wikimedia/)
    expect(out).toContain('iui-photo-credit')
  })

  it('resolves Tokyo / California / Shanghai daytrip landmarks', async () => {
    const { lookupKnownStop } = await import('../src/shared/trip-images.ts')
    for (const place of ['东京', 'Tokyo', '旧金山', 'San Francisco', 'Big Sur', '豫园', '东方明珠', '陆家嘴', '南京路']) {
      const hit = lookupKnownStop(place)
      expect(hit?.status, place).toBe('available')
      expect(hit?.image_url, place).toMatch(/wikimedia|commons/i)
    }
  })

  it('resolveTripStopImages accepts timeoutMs option', async () => {
    const { resolveTripStopImages, TRIP_IMAGES_FETCH_TIMEOUT_MS } = await import('../src/shared/trip-images.ts')
    expect(TRIP_IMAGES_FETCH_TIMEOUT_MS).toBe(8000)
    const result = await resolveTripStopImages(['Tokyo'], { preferNetwork: false, timeoutMs: 1000 })
    expect(result.stops[0]?.status).toBe('available')
  })

  it('srcdoc always embeds photo fill script', async () => {
    const { buildHtmlSandboxSrcdoc, parseHtmlSandboxFence } = await import('../src/shared/html-sandbox.ts')
    const body = JSON.stringify({ title: 'x', css: '.a{}', html: '<div>no itinerary</div>', js: '1' })
    const parsed = parseHtmlSandboxFence(body)!
    const doc = buildHtmlSandboxSrcdoc(parsed)
    expect(doc).toMatch(/var MAP =/)
  })

  it('frame command accepts runAuthorJs', async () => {
    const { isIuiSandboxFrameCommand } = await import('../src/shared/html-sandbox.ts')
    expect(isIuiSandboxFrameCommand({
      source: 'iui-html-host',
      type: 'runAuthorJs',
      frameId: 'f1',
      js: 'var x=1',
      jsFunctions: '',
      jsExpressions: [],
    })).toBe(true)
    expect(isIuiSandboxFrameCommand({
      source: 'iui-html-host',
      type: 'runAuthorJs',
      frameId: 'f1',
      js: 'x'.repeat(200_065),
    })).toBe(false)
  })
})
