/**
 * visual(⑦ 上线前): 20 conversations as they were written BEFORE the redesign (pages captured from
 * the pre-redesign starters at b24b35b — the shapes the old prompts taught: `iui-sandbox-*` classes,
 * `--color-text-*` tokens, Mermaid mindmap, old 3D / map / grid pages), plus an old iui-patch and an
 * old `iui` GenUI fence. Replayed with the old plugin build and the current one to check that old
 * sessions re-render (and re-theme) cleanly. Report-only: `--suite legacy [--plugin <dir>]`.
 */
import { readFileSync } from 'node:fs'
import { gallerySpec } from '../../src/client/gallery.ts'
import type { Item } from './fixtures.mts'
import type { SeedSession } from './seed.mts'

type Spec = { title: string; height: number; css: string; html: string; js: string }
const PAGES = JSON.parse(readFileSync(new URL('./legacy-pages.json', import.meta.url), 'utf8')) as Record<string, Spec>
const fence = (lang: string, body: string): string => '```' + lang + '\n' + body + '\n```'
const page = (id: string): string => {
  const s = PAGES[id]
  if (!s) throw new Error(`legacy page ${id} missing`)
  return fence('iui-html', JSON.stringify(s))
}

/** [page id, what the user asked] — order = session list. */
const ASKS: Array<[string, string]> = [
  ['counter', '做个计数器'], ['kpi-grid', '本机 CPU / 内存 / 磁盘概览'], ['mini-form', '读书会报名表'], ['todo', '今日待办清单'],
  ['spark', '最近趋势折线'], ['leaflet-map', '在地图上标出公司位置'], ['compare-cards', '两个方案并排对比'], ['tabs-panel', '分段面板'],
  ['echarts-mini', 'ECharts 画个趋势'], ['ds-kit', '看看设计系统'], ['bento-dash', '本周概览看板'], ['sort-viz', '演示冒泡排序'],
  ['itinerary-coast', '加州海岸三日行程'], ['weather-dense', '上海天气'], ['pricing-3col', '三档定价页'], ['hotel-covers', '上海酒店推荐'],
  ['ag-grid-sheet', '本周明细表'], ['mermaid-mindmap', '产品结构脑图'], ['scene-3d', '3D 展示台'], ['meeting-rooms', '会议室看板'],
]
const PATCH = fence('iui-patch', 'page: 计数器\n---find\n本地交互示例\n---with\n本地交互示例 · 已改')

export const SESSIONS: Record<string, SeedSession> = Object.fromEntries(ASKS.map(([id, user], i) => {
  const parts = ['好的：', page(id)]
  if (id === 'counter') parts.push('按你的要求改一下说明：', PATCH)
  if (id === 'kpi-grid') parts.push('旧版组件卡：', fence('iui', JSON.stringify(gallerySpec)))
  return [`old${String(i + 1).padStart(2, '0')}`, { title: `旧会话 ${i + 1} · ${PAGES[id]!.title}`, user, markdown: parts.join('\n\n') }]
}))

export const ITEMS: readonly Item[] = ASKS.flatMap(([id], i): Item[] => {
  const session = `old${String(i + 1).padStart(2, '0')}`
  const out: Item[] = [{ id: `${session}-${id}`, session, pick: { fence: 0 } }]
  if (id === 'counter') out.push({ id: `${session}-patch`, session, pick: { fence: 1 } })
  if (id === 'kpi-grid') out.push({ id: `${session}-genui`, session, pick: { fence: 1 } })
  return out
})
