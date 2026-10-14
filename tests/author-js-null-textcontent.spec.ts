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

    expect(pin.textContent).toBe('2')
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

  it('NULL_NODE stubs getElementById/querySelector, so missing #status would NOT produce this TypeError', () => {
    const runtime = buildAuthorJsRuntimeSource()
    const run = new Function(`
      ${runtime}
      var root = document.createElement('div');
      root.id = 'iui-preview-root';
      document.body.appendChild(root);
      var pipe = window.__iuiAuthorPipeline;
      pipe.ensureLibsThenRun({
        js: 'document.getElementById("status").textContent = "ok"; document.querySelector(".missing").textContent = "ok";',
        jsFunctions: '',
        jsExpressions: [],
        jsChunks: ['document.getElementById("status").textContent = "ok"; document.querySelector(".missing").textContent = "ok";']
      });
      return document.querySelectorAll('[data-iui-author-fail]').length;
    `)
    expect(run()).toBe(0)
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
