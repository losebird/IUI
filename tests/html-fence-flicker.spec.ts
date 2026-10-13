import { describe, expect, it } from 'vitest'
import { htmlSandboxSrcdocRebuildKey, parseHtmlSandboxFence } from '../src/shared/html-sandbox.ts'

function keyFor(raw: string, extras: Partial<Parameters<typeof htmlSandboxSrcdocRebuildKey>[0]> = {}) {
  return htmlSandboxSrcdocRebuildKey({
    parsed: parseHtmlSandboxFence(raw),
    reloadToken: 0,
    starterOverride: null,
    forceFinalSrcdoc: false,
    usedPreviewShell: true,
    lockedFinal: false,
    ...extras,
  })
}

describe('html-fence streaming flicker', () => {
  it('keeps one rebuild key while css/html grow during a stream', () => {
    const chunks = [
      '{"title":"行程","height":420,"css":".w{display:grid',
      '{"title":"行程","height":420,"css":".w{display:grid;gap:12px}","html":"<div class=\\"w\\">',
      '{"title":"行程","height":420,"css":".w{display:grid;gap:12px}.card{padding:8px}","html":"<div class=\\"w\\"><h3>南京</h3>',
      '{"title":"行程","height":420,"css":".w{display:grid;gap:12px}.card{padding:8px}","html":"<div class=\\"w\\"><h3>南京</h3><p>玄武湖</p></div>","js":"document.body.dataset.ok=\'1\'',
    ]
    const keys = chunks.map((raw) => keyFor(raw))
    expect(new Set(keys).size).toBe(1)
    expect(keys[0]).toMatch(/^preview-shell\|/)
    expect(keys[0]).not.toMatch(/h:\d+|cssing|j:\d+/)
  })

  it('only switches to final after an explicit reload or atomic first paint', () => {
    const streaming = keyFor('{"title":"T","css":".a{}","html":"<b>ok"', { usedPreviewShell: true })
    const afterReload = keyFor(
      JSON.stringify({ title: 'T', css: '.a{}', html: '<b>ok</b>', js: '1' }),
      { forceFinalSrcdoc: true, usedPreviewShell: true },
    )
    const atomic = keyFor(
      JSON.stringify({ title: 'T', css: '.a{}', html: '<b>ok</b>', js: '1' }),
      { usedPreviewShell: false },
    )
    expect(streaming).toMatch(/^preview-shell\|/)
    expect(afterReload).toMatch(/^final\|/)
    expect(atomic).toMatch(/^final\|/)
    expect(streaming).not.toBe(afterReload)
  })
})
