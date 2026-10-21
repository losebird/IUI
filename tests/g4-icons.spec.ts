import { describe, expect, it } from 'vitest'
import { buildHtmlSandboxSrcdoc, HTML_SANDBOX_STARTERS } from '../src/shared/html-sandbox.ts'
import { buildIconRuntimeScript, ICON_ALIASES, pageWantsIcons, resolveIconName } from '../src/shared/icon-runtime.ts'
import { ICON_NAMES, ICON_PATHS } from '../src/shared/icon-sprite.ts'
import { OIU_POLISH_CSS } from '../src/themes/oiu-polish.ts'
import { GENUI_SECTION_TEXT } from '../src/plugin/section-text.ts'

const inlineScripts = (s: string) => [...s.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1])
const RUNTIME_MARK = /if \(window\.__iuiIcons\) return;/g

describe('G4 local Lucide icons', () => {
  it('sprite ships 130 icons with real path data; every alias resolves', () => {
    expect(ICON_NAMES.length).toBe(130)
    for (const n of ['map-pin', 'sun', 'cloud-rain', 'cloud-sun', 'house', 'chart-line', 'check', 'x']) {
      expect(ICON_PATHS[n]).toMatch(/<(path|circle|polygon|rect|line|polyline)/)
    }
    for (const [k, v] of Object.entries(ICON_ALIASES)) expect(ICON_PATHS[v], `${k} → ${v}`).toBeTruthy()
  })

  it('resolveIconName handles kebab, camel/Pascal, prefixes and synonyms', () => {
    expect(resolveIconName('map-pin')).toBe('map-pin')
    expect(resolveIconName('MapPin')).toBe('map-pin')
    expect(resolveIconName('lucide-sun')).toBe('sun')
    expect(resolveIconName('rain')).toBe('cloud-rain')
    expect(resolveIconName('home')).toBe('house')
    expect(resolveIconName('not-a-real-icon')).toBeUndefined()
  })

  it('pageWantsIcons only when markup mentions icons (or while streaming)', () => {
    expect(pageWantsIcons('<div>hi</div>', false)).toBe(false)
    expect(pageWantsIcons('<i data-iui-icon="sun"></i>', false)).toBe(true)
    expect(pageWantsIcons('<svg><use href="#i-sun"/></svg>', false)).toBe(true)
    expect(pageWantsIcons('', true)).toBe(true)
  })

  it('runtime is one valid inline script with no backslashes', () => {
    const src = buildIconRuntimeScript()
    const body = inlineScripts(src)
    expect(body).toHaveLength(1)
    expect(() => new Function(body[0])).not.toThrow()
    expect(src.replace('<\\/script>', '')).not.toContain('\\')
    expect(src).toContain('data-iui-gap')
  })

  it('srcdoc carries the runtime only when the page uses icons', () => {
    const base = { title: 't', css: '', js: '', stages: ['html'], partial: false } as any
    const plain = buildHtmlSandboxSrcdoc({ ...base, html: '<div class="iui-sandbox-card">x</div>' }, { frameId: 't', uiLang: 'zh' })
    expect(plain.match(RUNTIME_MARK) ?? []).toHaveLength(0)
    const withIcon = buildHtmlSandboxSrcdoc({ ...base, html: '<button><i data-iui-icon="map-pin"></i>地图</button>' }, { frameId: 't', uiLang: 'zh' })
    expect(withIcon.match(RUNTIME_MARK) ?? []).toHaveLength(1)
  })

  it('weather starter uses icons, not emoji; polish CSS sizes and tints icons; prompt teaches the tag', () => {
    const wx = HTML_SANDBOX_STARTERS.find((s) => s.id === 'weather-dense')!.spec
    const all = wx.html + wx.js
    expect(all).toContain('data-iui-icon')
    expect(all).not.toMatch(/[\u2600-\u26ff\u{1F300}-\u{1FAFF}]/u)
    expect(OIU_POLISH_CSS).toContain('[data-iui-icon]')
    expect(OIU_POLISH_CSS).toContain('.iui-icon-tile')
    expect(OIU_POLISH_CSS).toContain('[data-iui-gap="end"]')
    expect(GENUI_SECTION_TEXT).toContain('data-iui-icon')
  })
})
