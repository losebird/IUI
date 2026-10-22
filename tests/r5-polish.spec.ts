import { describe, expect, it } from 'vitest'
import { buildHtmlSandboxSrcdoc, HTML_SANDBOX_STARTERS } from '../src/shared/html-sandbox.ts'
import { buildMotionRuntimeScript } from '../src/shared/motion-runtime.ts'
import { HOST_POLISH_CSS } from '../src/themes/host-polish.ts'
import { buildHostKitCss } from '../src/themes/host-kit.ts'

function inlineScripts(html: string): string[] {
  return [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1])
}

describe('R5-1 default polish + motion (zero author tokens)', () => {
  it('polish layer ships inside the design system with motion tokens and reduced-motion opt-out', () => {
    expect(buildHostKitCss()).toContain(HOST_POLISH_CSS.trim().slice(0, 80))
    expect(HOST_POLISH_CSS).toContain('--iui-ease-out')
    expect(HOST_POLISH_CSS).toContain('.iui-swap-in')
    expect(HOST_POLISH_CSS).toContain('.iui-enter')
    expect(HOST_POLISH_CSS).toContain('[data-iui-clickable="card"]')
    expect(HOST_POLISH_CSS).toContain('.iui-tier.featured')
    expect(HOST_POLISH_CSS).toMatch(/prefers-reduced-motion: reduce/)
    expect(HOST_POLISH_CSS).toContain('tabular-nums')
  })

  it('motion runtime is valid JS, has no backslashes and honours the streaming flag', () => {
    for (const streaming of [false, true]) {
      const src = buildMotionRuntimeScript({ streaming })
      const body = inlineScripts(src)
      expect(body).toHaveLength(1)
      expect(() => new Function(body[0])).not.toThrow()
      expect(src).toContain(streaming ? 'streaming: true' : 'streaming: false')
    }
    expect(buildMotionRuntimeScript({ streaming: false }).replace('<\\/script>', '')).not.toContain('\\')
  })

  it('every sandbox srcdoc carries the motion runtime exactly once', () => {
    for (const s of HTML_SANDBOX_STARTERS.slice(0, 6)) {
      const doc = buildHtmlSandboxSrcdoc(s.spec, { frameId: 't', uiLang: 'zh' })
      expect(doc.match(/if \(window\.__iuiMotion\) return;/g) ?? []).toHaveLength(1)
    }
  })

  it('chart guards: quiet axes, gradient line area, rounded bars, index tooltips', () => {
    const spec = { title: 'c', html: '<canvas id="c"></canvas>', css: '', js: "new Chart(document.getElementById('c'),{type:'bar',data:{labels:['a'],datasets:[{data:[1]}]}})", stages: ['html', 'js'], partial: false } as any
    const doc = buildHtmlSandboxSrcdoc(spec, { frameId: 't', uiLang: 'zh' })
    expect(doc).toContain('maxTicksLimit')
    expect(doc).toContain('createLinearGradient')
    expect(doc).toContain('borderRadius')
    expect(doc).toContain("mode: 'index', intersect: false")
  })
})

describe('R5-2 visual corrections', () => {
  it('segmented toggle groups, frosted map controls, accent selection, neutral secondary buttons', () => {
    expect(HOST_POLISH_CSS).toContain('html [data-iui-seg]')
    expect(HOST_POLISH_CSS).toContain('.iui-map-chrome > button')
    expect(HOST_POLISH_CSS).toMatch(/\.iui-stop-card\[aria-current="true"\][^{]*\{\s*border-color: var\(--accent-fill\)/)
    expect(HOST_POLISH_CSS).toMatch(/button\.secondary[^{]*\{\s*background: var\(--color-background-primary\); color: var\(--color-text-primary\)/)
    expect(HOST_POLISH_CSS).toContain('.iui-tier.featured .iui-chip')
    const rt = buildMotionRuntimeScript({ streaming: false })
    expect(rt).toContain('data-iui-seg')
    expect(rt).toContain('function segScan')
  })

  it('weather / itinerary starters lean on host theming (no hard-coded chart ink, localised controls)', () => {
    const wx = HTML_SANDBOX_STARTERS.find((s) => s.id === 'weather-dense')!.spec
    expect(wx.js).not.toContain('#5f5e58')
    expect(wx.js).not.toContain("borderColor:'#185FA5'")
    const it = HTML_SANDBOX_STARTERS.find((s) => s.id === 'itinerary-coast')!.spec
    expect(it.html).toContain('>暂停<')
    expect(it.html).not.toContain('>Pause<')
  })
})

describe('resident prompt trim', () => {
  it('resident prompt stays short; host CSS answers common token guesses', async () => {
    const { GENUI_SECTION_TEXT } = await import('../src/plugin/section-text.ts')
    expect(GENUI_SECTION_TEXT.length).toBeLessThan(3600)
    expect(GENUI_SECTION_TEXT).toContain('use them for layout')
    expect(GENUI_SECTION_TEXT).toContain('[iui-current-page]')
    const css = buildHostKitCss()
    for (const t of ['--bg:', '--surface:', '--text:', '--muted:', '--border:', '--radius:']) expect(css).toContain(t)
  })
})
