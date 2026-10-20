import { describe, expect, it } from 'vitest'
import { createTripAnimatorSource } from '../src/themes/oiu-design-system.ts'
import { buildAuthorJsRuntimeSource } from '../src/shared/author-js-runtime.ts'
import { splitAuthorJsChunks } from '../src/shared/html-sandbox.ts'

/**
 * Screenshot symptom (Suzhou itinerary sandbox):
 *   TypeError: Cannot read properties of null (reading 'textContent')
 *   reported as 模型作者 JS 第 1/1 片失败
 *
 * Root cause: host createTripAnimator read pin.textContent without skipping
 * Leaflet marker.getElement() nulls. After the host guard, the same input
 * must not throw; live pins still animate.
 */

type TripTour = {
  play: () => void
  pause: () => void
  replay: () => void
  seek: (i: number) => void
  dispose: () => void
}

function installAnimator(): (options: Record<string, unknown>) => unknown {
  const src = createTripAnimatorSource()
  const factory = new Function(`${src}; return createTripAnimator;`) as () => (
    options: Record<string, unknown>,
  ) => unknown
  return factory()
}

describe('screenshot: null.textContent during author JS chunk 1/1', () => {
  it('createTripAnimator skips null pinElements and still numbers live pins', () => {
    const createTripAnimator = installAnimator()
    const pin = document.createElement('span')
    pin.className = 'iui-pin-dot'
    const frames: Array<{ activeStop: number }> = []

    const tour = createTripAnimator({
      stopCount: 3,
      durationMs: 6000,
      pinElements: [null, pin],
      onFrame(f: { activeStop: number }) { frames.push(f) },
    }) as TripTour

    expect(pin.textContent).toBe('1')
    expect(frames.length).toBeGreaterThan(0)
    expect(() => tour.seek(1)).not.toThrow()
    expect(() => tour.replay()).not.toThrow()
    tour.dispose()
  })

  it('IIFE itinerary scripts stay one chunk (screenshot reported the old throw as 1/1)', () => {
    const js = `(function(){
var map=L.map('map');
var pinEls=[];
stops.forEach(function(s,i){
  var m=L.marker([s.lat,s.lng],{icon:L.divIcon({html:'<span class="iui-pin-dot">'+(i+1)+'</span>'})}).addTo(map);
  pinEls.push(m.getElement());
});
var tour=window.createTripAnimator({stopCount:stops.length,durationMs:6000,pinElements:pinEls,onFrame:function(){}});
document.getElementById('pause').onclick=function(){tour.pause()};
})();`
    expect(splitAuthorJsChunks(js)).toHaveLength(1)
  })

  it('F2: missing elements stay null (no NULL_NODE) and paint one friendly strip', () => {
    const runtime = buildAuthorJsRuntimeSource()
    const run = new Function(`
      ${runtime}
      var root = document.createElement('div');
      root.id = 'iui-preview-root';
      document.body.appendChild(root);
      var pipe = window.__iuiAuthorPipeline;
      pipe.ensureLibsThenRun({
        js: 'window.__f2q = document.querySelector(".missing"); window.__f2id = document.getElementById("nope"); document.getElementById("status").textContent = "ok";',
        jsFunctions: '',
        jsExpressions: [],
        jsChunks: ['window.__f2q = document.querySelector(".missing"); window.__f2id = document.getElementById("nope"); document.getElementById("status").textContent = "ok";']
      });
      var strips = document.querySelectorAll('[data-iui-author-fail]');
      return { strips: strips.length, text: strips[0] ? strips[0].textContent : '', q: window.__f2q, id: window.__f2id, imgs: document.querySelectorAll('[data-iui-live-img]').length };
    `)
    const out = run() as { strips: number; text: string; q: unknown; id: unknown; imgs: number }
    expect(out.q).toBeNull()
    expect(out.id).toBeNull()
    expect(out.imgs).toBe(0)
    expect(out.strips).toBe(1)
    expect(out.text).toMatch(/找不到某个元素|could not find an element/)
    document.querySelectorAll('[data-iui-author-fail]').forEach((n) => n.remove())
  })

  it('createTripAnimator adopts late .iui-pin-dot nodes when pinElements is empty', () => {
    const createTripAnimator = installAnimator()
    const late = document.createElement('span')
    late.className = 'iui-pin-dot'
    document.body.appendChild(late)
    const tour = createTripAnimator({
      stopCount: 2,
      durationMs: 6000,
      pinElements: [null, null],
      onFrame() {},
    }) as TripTour
    expect(late.textContent).toBe('1')
    expect(late.style.opacity).toBe('1')
    tour.dispose()
    late.remove()
  })

  it('Leaflet-style marker.getElement() returning null no longer trips the host animator', () => {
    const createTripAnimator = installAnimator()
    const fakeMarker = { getElement() { return null } }
    const pinEls = [fakeMarker.getElement(), fakeMarker.getElement()]
    const frames: unknown[] = []

    expect(() => {
      const tour = createTripAnimator({
        stopCount: 2,
        durationMs: 6000,
        pinElements: pinEls,
        onFrame(f: unknown) { frames.push(f) },
      }) as TripTour
      tour.seek(0)
      tour.replay()
      tour.dispose()
    }).not.toThrow()
    expect(frames.length).toBeGreaterThan(0)
  })
})
