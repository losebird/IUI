import { describe, expect, it } from 'vitest'
import { buildHtmlSandboxSrcdoc, detectSandboxLibs, getHtmlSandboxStarter, parseHtmlSandboxFence } from '../src/shared/html-sandbox.ts'
import { buildHostKitCss } from '../src/themes/host-kit.ts'
import { buildPatternNote, classifyIntentAsk, getIntentRule } from '../src/config/referee-rules.ts'
import { buildGenuiSectionText } from '../src/plugin/section-text.ts'

function fence(html: string, js: string) {
  return buildHtmlSandboxSrcdoc(parseHtmlSandboxFence(JSON.stringify({ html, css: '', js }))!, { frameId: 'cdn' })
}

describe('AG Grid / Mermaid CDN + token skin (narrow)', () => {
  it('injects ag-grid-community + quartz when author calls agGrid.createGrid', () => {
    const doc = fence(
      '<div id="grid" class="ag-theme-quartz"></div>',
      "agGrid.createGrid(document.getElementById('grid'),{columnDefs:[{field:'a'}],rowData:[{a:1}]});",
    )
    expect(doc).toMatch(/<script[^>]+ag-grid-community\.min\.js/)
    expect(doc).toMatch(/<link[^>]+ag-theme-quartz\.css/)
    expect(doc).toContain('ag-theme-iui')
    expect(doc).toContain('paintHost')
  })

  it('does not inject AG Grid for a plain itinerary budget table', () => {
    const doc = fence(
      '<table><tr><td>门票</td><td>900</td></tr></table>',
      'document.getElementById("x")',
    )
    expect(doc).not.toMatch(/<script[^>]+ag-grid-community\.min\.js/)
    expect(doc).not.toMatch(/<link[^>]+ag-grid\.css/)
    expect(doc).not.toContain('paintHost')
  })

  it('injects mermaid UMD when .iui-mindmap / mermaid.run is present', () => {
    const doc = fence(
      '<pre class="mermaid iui-mindmap">mindmap\n  root((主题))</pre>',
      'mermaid.run({querySelector:".mermaid"})',
    )
    expect(doc).toMatch(/<script[^>]+mermaid\.min\.js/)
    expect(doc).toContain('themeVariables')
    expect(doc).toContain('iui-mindmap')
  })

  it('does not inject mermaid for a map itinerary', () => {
    const doc = fence(
      '<div class="iui-map-wrap"><div id="map"></div></div>',
      "var map=L.map('map').setView([31,120],10);",
    )
    expect(doc).not.toMatch(/<script[^>]+mermaid\.min\.js/)
    expect(doc).not.toContain('themeVariables')
    expect(doc).toContain('leaflet@1.9.4')
  })

  it('design system ships token skins', () => {
    const css = buildHostKitCss()
    expect(css).toContain('.ag-theme-iui')
    expect(css).toContain('--ag-background-color')
    expect(css).toContain('.iui-mindmap')
  })

  it('starters exist and trigger CDN in srcdoc', () => {
    const grid = getHtmlSandboxStarter('ag-grid-sheet')
    const mind = getHtmlSandboxStarter('mermaid-mindmap')
    const flow = getHtmlSandboxStarter('mermaid-flow')
    expect(grid?.spec.js).toContain('agGrid.createGrid')
    expect(mind?.spec.html).toContain('iui-mindmap')
    expect(mind?.spec.js).toContain("type:'tree'")
    const gDoc = buildHtmlSandboxSrcdoc(grid!.spec, { frameId: 'g' })
    const mDoc = buildHtmlSandboxSrcdoc(mind!.spec, { frameId: 'm' })
    const fDoc = buildHtmlSandboxSrcdoc(flow!.spec, { frameId: 'f' })
    expect(gDoc).toContain('ag-grid-community')
    expect(fDoc).toContain('mermaid@11')
    // ④ ECharts tree in .iui-mindmap must not pull in Mermaid (it rendered "Syntax error in text").
    expect(mDoc).toContain('echarts')
    expect([...detectSandboxLibs(mind!.spec.html, mind!.spec.js)]).not.toContain('mermaid')
    expect([...detectSandboxLibs(flow!.spec.html, flow!.spec.js)]).toContain('mermaid')
  })

  it('old Mermaid mindmap pages (text inside .iui-mindmap) still load Mermaid', () => {
    expect([...detectSandboxLibs('<pre class="iui-mindmap">mindmap\n  root((A))\n    B</pre>', '')]).toContain('mermaid')
    expect([...detectSandboxLibs('<div id="mm" class="iui-mindmap h-[360px]"></div>', '')]).not.toContain('mermaid')
  })

  it('referee only matches filterable-table / mindmap asks', () => {
    expect(classifyIntentAsk('给我一张可筛选的明细表')?.id).toBe('grid-table')
    expect(classifyIntentAsk('画一个产品脑图')?.id).toBe('mindmap')
    expect(classifyIntentAsk('苏州三日行程')?.id).not.toBe('grid-table')
    expect(classifyIntentAsk('苏州三日行程')?.id).not.toBe('mindmap')
    expect(getIntentRule('grid-table')!.repairHint).toMatch(/行程里的预算小表不要改成 Grid/)
  })

  it('system prompt mentions both without forcing every table', () => {
    const section = buildGenuiSectionText()
    expect(section).toContain('agGrid')
    expect(section).toContain('mermaid')
    const grid = buildPatternNote('做一个可排序的员工数据表')!
    expect(grid).toContain('agGrid.createGrid')
    expect(grid).toMatch(/Not for itinerary budgets or 3-tier pricing/)
    expect(buildPatternNote('画个思维导图')).toContain('iui-mindmap')
  })
})
