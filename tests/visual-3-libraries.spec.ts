import { beforeAll, describe, expect, it } from 'vitest'
import { buildHtmlSandboxSrcdoc } from '../src/shared/html-sandbox.ts'
import { buildTailwindCss, tailwindCandidates, whenTailwindReady } from '../src/themes/tailwind-jit.ts'
import { buildIuiDaisyCss, CHART_CHROME } from '../src/themes/iui-daisy.ts'
import { buildHostKitCss } from '../src/themes/host-kit.ts'
import { buildStage3dRuntimeScript } from '../src/shared/stage3d-runtime.ts'
import { buildPatternNote, getIntentRule } from '../src/config/referee-rules.ts'
import { lintSandboxDesign } from '../src/shared/design-lint.ts'

const doc = (html: string, js = '', css = '') => buildHtmlSandboxSrcdoc({ title: 't', height: 300, html, css, js }, { frameId: 'v3' })

describe('visual ③ — Tailwind compiled per page', () => {
  beforeAll(async () => { await whenTailwindReady() })

  it('compiles only used candidates, sorted, inside @layer utilities', () => {
    const css = buildTailwindCss('<div class="md:grid-cols-3 grid gap-4 p-6 unknown-thing"></div>')
    expect(css).toMatch(/^(@property[^@]*)*@layer utilities\{/u)
    expect(css).toMatch(/\.grid\{display: ?grid\}/u)
    expect(css).toContain('.gap-4{')
    expect(css).not.toContain('unknown-thing')
    expect(css.indexOf('.grid{')).toBeLessThan(css.indexOf('md\\:grid-cols-3'))
    expect(css).toContain('40rem') // md breakpoint tuned for the 688px chat column
  })

  it('maps daisyUI tokens and dark variant; leaves host-owned classes alone', () => {
    const css = buildTailwindCss('bg-base-content/5 bg-base-200 rounded-box dark:bg-base-300')
    expect(css).toContain('--color-base-content')
    expect(css).not.toContain('.bg-base-200{')
    expect(css).toContain('--radius-box')
    expect(css).toContain('iui-dark')
    expect(css).toContain('prefers-color-scheme: dark')
    expect(tailwindCandidates('border bg-base-100 flex')).toEqual(['flex'])
  })

  it('srcdoc ships the static sheet before author CSS and the live top-up bridge', () => {
    const d = doc('<div class="flex gap-3"><p class="text-sm">x</p></div>', '', '.mine{color:red}')
    expect(d).toContain('id="iui-tw-static"')
    expect(d.indexOf('iui-tw-static')).toBeLessThan(d.indexOf('.mine{color:red}'))
    expect(d).toContain("'iui-tailwind'")
  })

  it('lint no longer flags layout utilities', () => {
    expect(lintSandboxDesign({ html: '<div class="flex gap-4 p-6 md:grid-cols-3"></div>', css: '' })).toEqual([])
  })
})

describe('visual ③ — library defaults', () => {
  it('chart chrome tokens ship with the theme', () => {
    const css = buildIuiDaisyCss()
    for (const k of Object.keys(CHART_CHROME)) expect(css).toContain(k)
  })

  it('ECharts: quiet theme, area gradient, tree branches', () => {
    const d = doc('<div id="c"></div>', "echarts.init(document.getElementById('c')).setOption({series:[{type:'line',data:[1,2]}]})")
    expect(d).toContain('markPoint')
    expect(d).toContain("'tree'")
  })

  it('Mermaid: grey host theme with focal / muted / ext classes', () => {
    const d = doc('<pre class="mermaid">flowchart LR\n a-->b</pre>', "mermaid.run()")
    expect(d).toContain('__iuiMermaidConfig')
    expect(d).toMatch(/focal/u)
    expect(d).toMatch(/\.ext\b/u)
  })

  it('AG Grid theme follows grid.html; Leaflet pin; d3 / gsap defaults', () => {
    const kit = buildHostKitCss()
    expect(kit).toContain('.ag-theme-iui')
    expect(kit).toContain('.iui-leaflet-pin')
    expect(doc('<svg id="s"></svg>', "import('d3').then(d3=>d3.select('#s'))")).toMatch(/schemeCategory10|Tableau10/u)
    expect(doc('<div class="box"></div>', "import('gsap').then(({gsap})=>gsap.to('.box',{x:1}))")).toContain('power3.out')
  })

  it('3D stage defaults to the clay look, offers toon / data', () => {
    const s = buildStage3dRuntimeScript()
    expect(s).toContain("['clay', 'toon', 'data', 'studio']")
    expect(s).toContain('MeshToonMaterial')
    expect(s).toContain('OutlineEffect')
  })

  it('prompts: ECharts tree mindmap, flowchart LR, motion recipe', () => {
    expect(getIntentRule('mindmap')!.recipe).toContain("type:'tree'")
    expect(buildPatternNote('画个思维导图')).toContain('flowchart LR')
    expect(buildPatternNote('给卡片列表加点动画')).toContain('FLIP')
  })
})
