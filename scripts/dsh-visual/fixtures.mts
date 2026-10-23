/**
 * visual(⑥): fixed conversations replayed in the real dsh host. Every fence
 * kind the plugin owns appears here; each item is one screenshot per mode.
 */
import { HTML_SANDBOX_STARTERS, type HtmlSandboxSpec } from '../../src/shared/html-sandbox.ts'
import { gallerySpec } from '../../src/client/gallery.ts'
import type { SeedSession } from './seed.mts'

export type Pick = { fence: number } | { message: true }
export type Item = {
  id: string
  session: string
  pick: Pick
  /** Max share of differing pixels vs baseline (default 0.005). */
  tolerance?: number
  /** Score the page srcdoc with visual-score (iui-html only). */
  score?: string
  /**
   * Interaction before the shot (see runner): hover / menu / appearance on the fence chrome;
   * export-html / export-png download through the ⋯ menu and shoot the file; drawer opens the
   * /panel template drawer; settings opens 设置 → IUI.
   */
  act?: 'hover' | 'menu' | 'appearance' | 'export-html' | 'export-png' | 'drawer' | 'settings'
}

const fence = (lang: string, body: string): string => '```' + lang + '\n' + body + '\n```'
const page = (spec: Partial<HtmlSandboxSpec>): string => fence('iui-html', JSON.stringify({ title: spec.title, height: spec.height, css: spec.css ?? '', html: spec.html ?? '', js: spec.js ?? '' }))
const starter = (id: string): string => {
  const s = HTML_SANDBOX_STARTERS.find((x) => x.id === id)
  if (!s) throw new Error(`starter ${id} missing`)
  return page(s.spec)
}

const STATES_PAGE = page({
  title: '状态页',
  height: 520,
  css: '.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px}.box{min-height:150px}',
  html: '<div class="grid">'
    + '<div class="card border box"><div class="card-body gap-3"><h3 class="card-title text-base">加载中</h3><div class="skeleton h-4 w-3/4"></div><div class="skeleton h-4 w-full"></div><div class="skeleton h-4 w-1/2"></div></div></div>'
    + '<div class="card border box"><div class="card-body items-center text-center"><span data-iui-icon="inbox" class="text-base-content/50"></span><h3 class="card-title text-base">还没有数据</h3><p class="text-sm text-base-content/70">添加第一条记录后会显示在这里。</p><button class="btn btn-primary btn-sm">新建</button></div></div>'
    + '<div class="card border box"><div class="card-body"><h3 class="card-title text-base">出错了</h3><div role="alert" class="alert alert-error alert-soft"><span>无法连接服务器，请稍后重试。</span></div><button class="btn btn-sm">重试</button></div></div>'
    + '<div class="card border box"><div class="card-body"><h3 class="card-title text-base">已降级</h3><div role="alert" class="alert alert-warning alert-soft"><span>地图不可用，已改为列表显示。</span></div><ul class="list text-sm"><li class="list-row">旧金山</li><li class="list-row">蒙特雷</li></ul></div></div>'
    + '</div>',
})

const LEDGER = page({
  title: '记账本',
  height: 300,
  css: '.sum{font-size:28px;font-weight:600}',
  html: '<div class="card border"><div class="card-body"><h2 class="card-title">记账本</h2><p class="text-sm text-base-content/70" id="hint">每月预算 3,000 元</p><div id="summary" class="sum">已用 1,240 元</div><progress class="progress w-full" value="41" max="100"></progress><div class="iui-actions"><button class="btn btn-primary btn-sm">记一笔</button><button class="btn btn-sm">导出</button></div></div></div>',
})
const PATCH_OK = fence('iui-patch', 'page: 记账本\n---find\n每月预算 3,000 元\n---with\n本月预算 3,500 元\n---replace #summary\n<div id="summary" class="sum">已用 1,240 元 · 剩余 2,260 元</div>')
const PATCH_BAD = fence('iui-patch', 'page: 记账本\n---find\nL.tileLayer(\'https://tile.example/{z}/{x}/{y}.png\')\n---with\nL.tileLayer(\'https://tiles.example/{z}/{x}/{y}.png\')')
const SVG = fence('svg', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 120" width="320" height="120"><rect x="8" y="8" width="96" height="40" rx="8" fill="none" stroke="currentColor"/><text x="56" y="33" text-anchor="middle" font-size="13" fill="currentColor">需求</text><path d="M104 28h48" stroke="currentColor" marker-end="url(#a)"/><rect x="152" y="8" width="96" height="40" rx="8" fill="currentColor" opacity=".9"/><text x="200" y="33" text-anchor="middle" font-size="13" fill="#fff">设计</text><defs><marker id="a" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="8" markerHeight="8" orient="auto"><path d="M0 0l8 4-8 4z" fill="currentColor"/></marker></defs><circle cx="290" cy="90" r="20" fill="none" stroke="currentColor" stroke-dasharray="4 3"/></svg>')

export const SESSIONS: Record<string, SeedSession> = {
  templatesA: { title: '模板 A', user: '行程 / 天气 / 定价', markdown: ['三个模板：', starter('itinerary-coast'), starter('weather-dense'), starter('pricing-3col')].join('\n\n') },
  templatesB: { title: '模板 B', user: '酒店 / 会议室 / 看板', markdown: ['三个模板：', starter('hotel-covers'), starter('meeting-rooms'), starter('kanban-board')].join('\n\n') },
  libs: { title: '图表库', user: 'ECharts / AG Grid / 脑图 / 3D', markdown: [starter('echarts-mini'), starter('ag-grid-sheet'), starter('mermaid-mindmap'), starter('scene-3d')].join('\n\n') },
  fences: {
    title: '围栏', user: '状态页、svg、修改',
    markdown: [STATES_PAGE, SVG, LEDGER, '改一下预算：', PATCH_OK, '再改地图瓦片：', PATCH_BAD].join('\n\n'),
  },
  // Host markdown next to plugin output: KaTeX is the host's; plain ```mermaid stays a code block
  // in chat (IUI renders Mermaid only inside iui-html) — recorded so a change in either shows up.
  markdown: {
    title: '宿主 Markdown', user: '公式和代码块',
    markdown: ['公式（宿主 KaTeX）：$E = mc^2$，以及', '$$\\int_0^1 x^2\\,dx = \\tfrac13$$', '```mermaid\nflowchart LR\n  A --> B\n```'].join('\n\n'),
  },
  legacy: { title: '旧 GenUI', user: '组件画廊', markdown: fence('dsh-ui', JSON.stringify(gallerySpec)) },
}

/** Fence indices count only plugin-mounted fences (`.genui-dom-fence`) in the assistant message, in order. */
export const ITEMS: readonly Item[] = [
  { id: 'tpl-itinerary', session: 'templatesA', pick: { fence: 0 }, score: 'itinerary-coast', tolerance: 0.03 },
  { id: 'tpl-weather', session: 'templatesA', pick: { fence: 1 }, score: 'weather-dense' },
  { id: 'tpl-pricing', session: 'templatesA', pick: { fence: 2 }, score: 'pricing-3col' },
  { id: 'tpl-hotels', session: 'templatesB', pick: { fence: 0 }, score: 'hotel-covers' },
  { id: 'tpl-rooms', session: 'templatesB', pick: { fence: 1 }, score: 'meeting-rooms' },
  { id: 'tpl-kanban', session: 'templatesB', pick: { fence: 2 }, score: 'kanban-board' },
  { id: 'lib-echarts', session: 'libs', pick: { fence: 0 }, score: 'echarts-mini' },
  { id: 'lib-aggrid', session: 'libs', pick: { fence: 1 }, score: 'ag-grid-sheet' },
  { id: 'lib-mindmap', session: 'libs', pick: { fence: 2 }, score: 'mermaid-mindmap' },
  { id: 'lib-3d', session: 'libs', pick: { fence: 3 }, score: 'scene-3d', tolerance: 0.04 },
  { id: 'md-katex', session: 'markdown', pick: { message: true } },
  { id: 'states', session: 'fences', pick: { fence: 0 } },
  { id: 'svg', session: 'fences', pick: { fence: 1 } },
  { id: 'patch-page', session: 'fences', pick: { fence: 2 } },
  { id: 'patch-ok', session: 'fences', pick: { fence: 3 } },
  { id: 'patch-failed', session: 'fences', pick: { fence: 4 } },
  { id: 'chrome-toolbar', session: 'fences', pick: { fence: 2 }, act: 'hover' },
  { id: 'chrome-menu', session: 'fences', pick: { fence: 2 }, act: 'menu' },
  { id: 'chrome-appearance', session: 'fences', pick: { fence: 2 }, act: 'appearance' },
  { id: 'export-html', session: 'fences', pick: { fence: 2 }, act: 'export-html' },
  { id: 'export-png', session: 'fences', pick: { fence: 2 }, act: 'export-png' },
  { id: 'ui-drawer', session: 'markdown', pick: { message: true }, act: 'drawer' },
  { id: 'ui-settings', session: 'markdown', pick: { message: true }, act: 'settings' },
  { id: 'legacy-gallery', session: 'legacy', pick: { fence: 0 } },
]
