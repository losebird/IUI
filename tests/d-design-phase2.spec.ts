import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  DESIGN_MIN_FONT_PX,
  DESIGN_TYPE_SCALE_PX,
  contrastRatio,
  designLintNote,
  fontSizeToPx,
  lintSandboxDesign,
  parseCssColor,
} from '../src/shared/design-lint'
import { DESIGN_ENHANCE_JS } from '../src/shared/design-enhance'
import { buildSandboxBridgeScript, isIuiSandboxHostMessage } from '../src/shared/html-sandbox'
import { buildHostKitCss } from '../src/themes/host-kit'
import { PATTERN_STARTERS } from '../src/shared/pattern-starters'
import { queueDesignNote } from '../src/plugin/fence-feedback'
import { sandboxStreamProgress } from '../src/client/sandbox-skeleton'
import { fitSceneBounds } from '../src/client/scene3d-core'

const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8')

describe('D1 design lint', () => {
  it('parses colors, sizes and contrast', () => {
    expect(parseCssColor('#fff')).toMatchObject({ r: 255, g: 255, b: 255 })
    expect(parseCssColor('rgb(0, 0, 0)')).toMatchObject({ r: 0, g: 0, b: 0 })
    expect(parseCssColor('var(--x)')).toBeNull()
    expect(fontSizeToPx('11px')).toBe(11)
    expect(fontSizeToPx('0.75rem')).toBe(12)
    expect(fontSizeToPx('9pt')).toBe(12)
    expect(contrastRatio(parseCssColor('#000')!, parseCssColor('#fff')!)).toBeCloseTo(21, 0)
    expect(DESIGN_MIN_FONT_PX).toBe(12)
    expect([...DESIGN_TYPE_SCALE_PX]).toEqual([12, 14, 16, 20, 28, 40])
  })

  it('flags sub-12px fonts in css, <style> and inline, with exemptions', () => {
    const kinds = (html: string, css = '') => lintSandboxDesign({ html, css }).map((i) => i.kind)
    expect(kinds('<p>x</p>', '.meta{font-size:10px}')).toContain('min-font')
    expect(kinds('<style>.a{font-size:11px}</style><p class="a">x</p>')).toContain('min-font')
    expect(kinds('<span style="font-size:10px">x</span>')).toContain('min-font')
    expect(kinds('<sup style="font-size:9px">1</sup>')).toEqual([])
    expect(kinds('<p>x</p>', 'svg text{font-size:9px}.leaflet-control{font-size:10px}')).toEqual([])
    expect(kinds('<p>x</p>', '.a{font-size:12px}.b{font-size:var(--fs-xs)}')).toEqual([])
  })

  it('flags low contrast only when both colors are literal', () => {
    const kinds = (css: string) => lintSandboxDesign({ html: '<p>x</p>', css }).map((i) => i.kind)
    expect(kinds('.a{color:#bbb;background:#fff}')).toContain('contrast')
    expect(kinds('.a{color:#333;background:#fff}')).toEqual([])
    expect(kinds('.a{color:#bbb;background:var(--color-background-primary)}')).toEqual([])
  })

  it('flags stat value glued to its caption', () => {
    const issues = lintSandboxDesign({ html: '<div class="stat">12 间空闲</div>', css: '' })
    expect(issues.map((i) => i.kind)).toContain('stat-label')
    const ok = lintSandboxDesign({ html: '<div class="iui-stat"><div class="iui-stat-value">12</div><div class="iui-stat-label">空闲</div></div>', css: '' })
    expect(ok).toEqual([])
  })

  it('is bounded and produces a non-steering note', () => {
    const css = Array.from({ length: 20 }, (_, i) => `.c${i}{font-size:${8 + (i % 3)}px}`).join('')
    const issues = lintSandboxDesign({ html: '', css })
    expect(issues.length).toBeLessThanOrEqual(6)
    const note = designLintNote(issues)
    expect(note).toContain('[iui-design-referee]')
    expect(note).toContain('不要因此重做已完成的页面')
    expect(note).toContain('12/14/16/20/28/40')
    expect(designLintNote([])).toBe('')
  })

  it('queueDesignNote lints each closed fence once', () => {
    const fence = '```iui-html\n<style>.m{font-size:10px}</style><p class="m">hi</p>\n```'
    const state = { text: `x\n${fence}\n`, pendingDesignNote: null as string | null, designLinted: new Set<string>() }
    const note = queueDesignNote(state)
    expect(note).toContain('min-font')
    expect(state.pendingDesignNote).toBe(note)
    state.pendingDesignNote = null
    expect(queueDesignNote(state)).toBeNull()
    expect(state.pendingDesignNote).toBeNull()
    const open = { text: '```iui-html\n<style>.m{font-size:10px}</style>', pendingDesignNote: null, designLinted: new Set<string>() }
    expect(queueDesignNote(open)).toBeNull()
  })

  it('built-in starters are lint-clean', () => {
    for (const s of PATTERN_STARTERS) {
      expect(lintSandboxDesign({ html: s.spec.html, css: s.spec.css }), s.id).toEqual([])
    }
  })
})

describe('D2–D8 design kit CSS + skill', () => {
  const css = buildHostKitCss()
  it('ships type scale, accent tokens, personalities and stat', () => {
    for (const tok of ['--fs-xs', '--fs-2xl', '--accent-fill', '--on-accent']) expect(css).toContain(tok)
    for (const p of ['tool', 'content', 'data', 'toy']) expect(css).toContain(`[data-iui-style="${p}"]`)
    for (const c of ['.iui-stat-value', '.iui-stat-label', '.iui-stat-delta', '.iui-card-grid', '.iui-clamp-2', '[data-iui-scroll-fade', '.iui-code-tools', '.iui-3d-loading']) {
      expect(css).toContain(c)
    }
  })
  it('colored map by default, mono opt-in, categorized pins', () => {
    expect(css).not.toMatch(/\.leaflet-container(?!\[data-iui-map-style)[^{,]*\{[^}]*grayscale/u)
    expect(css).toMatch(/\[data-iui-map-style="mono"\][^{]*\{[^}]*grayscale/u)
    expect(css).toContain('data-cat')
    expect(css).toContain('.iui-pin-dot.active')
  })
  it('skill text documents the rules', () => {
    const skill = read('SKILL.md')
    expect(skill).toContain('设计规则')
  })
})

describe('D4/D6/D8 bridge enhancements', () => {
  const bridge = buildSandboxBridgeScript('f1')
  it('injects the enhancer and declutter hook', () => {
    expect(bridge).toContain(DESIGN_ENHANCE_JS.trim().slice(0, 80))
    expect(DESIGN_ENHANCE_JS).toContain('__iuiEnhance')
    expect(DESIGN_ENHANCE_JS).toContain('__iuiTrackDeclutter')
    expect(DESIGN_ENHANCE_JS).toContain('iuiNoDeclutter')
    expect(DESIGN_ENHANCE_JS).toContain('data-iui-no-tools')
    expect(bridge).toContain('__iuiTrackDeclutter')
  })
  it('enhancer source is valid ES5-parsable JS', () => {
    expect(() => new Function(DESIGN_ENHANCE_JS)).not.toThrow()
  })
  it('validates copyText host messages', () => {
    expect(isIuiSandboxHostMessage({ source: 'iui-html', type: 'copyText', frameId: 'f1', text: 'hi' })).toBe(true)
    expect(isIuiSandboxHostMessage({ source: 'iui-html', type: 'copyText', frameId: 'f1', text: 5 })).toBe(false)
    expect(isIuiSandboxHostMessage({ source: 'iui-html', type: 'copyText', frameId: 'f1', text: 'x'.repeat(300_000) })).toBe(false)
  })
  it('host pin rebind skips markers the author already placed', () => {
    const src = read('src/shared/html-sandbox.ts')
    const at = src.indexOf('L.iuiRebindMarkers = function')
    expect(at).toBeGreaterThan(0)
    expect(src.slice(at, at + 6000)).toMatch(/authorKeys\[[^\]]*toFixed\(5\)[^\]]*\]\) continue/u)
  })
})

describe('D10 streaming skeleton', () => {
  it('reports monotone phases', () => {
    expect(sandboxStreamProgress(null).phase).toBe('waiting')
    const base = { html: '', css: '', js: '', partial: true }
    expect(sandboxStreamProgress(base).phase).toBe('waiting')
    const c = sandboxStreamProgress({ ...base, css: '.a{}' })
    const h = sandboxStreamProgress({ ...base, css: '.a{}', html: '<p>x</p>' })
    const j = sandboxStreamProgress({ ...base, css: '.a{}', html: '<p>x</p>', js: 'go()' })
    const done = sandboxStreamProgress({ ...base, partial: false })
    expect([c.phase, h.phase, j.phase, done.phase]).toEqual(['css', 'html', 'js', 'loading'])
    expect(c.pct).toBeLessThan(h.pct)
    expect(h.pct).toBeLessThan(j.pct)
    expect(j.pct).toBeLessThan(100)
  })
  it('has i18n labels', () => {
    for (const f of ['src/client/i18n/zh.ts', 'src/client/i18n/en.ts']) {
      const t = read(f)
      for (const k of ['waiting', 'css', 'html', 'js', 'loading']) expect(t).toContain(`sandbox.skeleton.${k}`)
    }
  })
})

describe('D补充 starters + 3D fit', () => {
  it('scene-3d and meeting-rooms starters exist', () => {
    const ids = PATTERN_STARTERS.map((s) => s.id)
    expect(ids).toContain('scene-3d')
    expect(ids).toContain('meeting-rooms')
    const room = PATTERN_STARTERS.find((s) => s.id === 'meeting-rooms')!
    expect(room.spec.js + room.spec.html).toContain('stat-value') // visual(⑧): daisyUI stats
    const s3 = PATTERN_STARTERS.find((s) => s.id === 'scene-3d')!
    expect(s3.spec.html).toContain("data-iui-3d='")
    expect(JSON.parse(/data-iui-3d='([^']+)'/.exec(s3.spec.html)![1]!).hotspots.length).toBeGreaterThanOrEqual(3)
    expect(s3.spec.js).toContain('iui3d:hotspot')
    expect(s3.spec.js).not.toContain('WebGLRenderer')
  })
  it('fitSceneBounds encloses the meshes', () => {
    const fit = fitSceneBounds({ meshes: [{ shape: 'box', size: [2, 2, 2], position: [4, 1, 0] }, { shape: 'sphere', size: 1, position: [-4, 1, 0] }] } as never)
    expect(fit.radius).toBeGreaterThanOrEqual(4)
    expect(fit.center[0]).toBeCloseTo(0, 0)
    expect(fit.minY).toBeCloseTo(0, 1)
    expect(fitSceneBounds({ meshes: [] } as never)).toEqual({ center: [0, 0, 0], radius: 1, minY: 0 })
  })
})
