/**
 * G13: discoverability without model tokens.
 *
 * - 「继续修改」chips under the latest generated page, picked statically by the
 *   page's intent (ask + title). A click only fills the composer.
 * - Example chips for a blank conversation, led by the intents the user made
 *   pages for most recently (local counts only).
 */
import { pageIntentId } from '../config/referee-rules.ts'
import { currentLocale } from './i18n/index.ts'

export interface Chip { id: string; label: string; prompt: string }
type L10n = { zh: [string, string]; en: [string, string] }

/** Follow-up edits: [label, prompt]. Prompts ask for an in-place change. */
const NEXT: Record<string, L10n> = {
  dark: { zh: ['换成深色', '把上面的页面换成深色配色，结构和内容保持不变'], en: ['Make it dark', 'Switch the page above to a dark colour scheme; keep the layout and content'] },
  filter: { zh: ['加一个筛选', '给上面的页面加一个筛选控件，选择后列表和图表跟着变'], en: ['Add a filter', 'Add a filter control to the page above; the list and charts should follow it'] },
  mobile: { zh: ['做成手机版', '把上面的页面改成适合手机竖屏的版本：单列、按钮够大、不横向滚动'], en: ['Make it mobile', 'Rework the page above for a phone in portrait: one column, large buttons, no sideways scrolling'] },
  transport: { zh: ['加上交通方式', '在上面的行程里给每两站之间加上交通方式和耗时'], en: ['Add transport', 'Add the transport mode and travel time between stops in the itinerary above'] },
  budget: { zh: ['加个预算表', '在上面的页面底部加一个预算小结（分项和合计）'], en: ['Add a budget', 'Add a budget summary (items and total) at the bottom of the page above'] },
  clothing: { zh: ['加穿衣建议', '在上面的天气页里加上每天的穿衣和出行建议'], en: ['Add what to wear', 'Add daily clothing and travel tips to the weather page above'] },
  highlight: { zh: ['突出推荐项', '在上面的对比里突出最推荐的一项，并写一句理由'], en: ['Highlight the pick', 'Highlight the recommended option in the comparison above with a one-line reason'] },
  validate: { zh: ['加输入校验', '给上面的表单加上即时输入校验和错误提示'], en: ['Add validation', 'Add inline validation and error messages to the form above'] },
  export: { zh: ['加导出按钮', '给上面的表格加一个导出 CSV 的按钮'], en: ['Add CSV export', 'Add an export-to-CSV button to the table above'] },
  expand: { zh: ['再展开一层', '把上面的脑图每个分支再展开一层'], en: ['Expand a level', 'Expand every branch of the mind map above by one more level'] },
  chart: { zh: ['加一张图表', '给上面的页面加一张最能说明问题的图表'], en: ['Add a chart', 'Add the one chart that best explains the data on the page above'] },
  steps: { zh: ['加进度勾选', '给上面的步骤加上可勾选的进度，刷新后保留'], en: ['Track progress', 'Make the steps above checkable with progress that survives a reload'] },
}

const NEXT_BY_INTENT: Record<string, readonly string[]> = {
  dashboard: ['filter', 'dark', 'mobile'],
  resource: ['filter', 'chart', 'mobile'],
  map: ['transport', 'budget', 'mobile'],
  weather: ['clothing', 'dark', 'mobile'],
  compare: ['highlight', 'chart', 'mobile'],
  booking: ['validate', 'dark', 'mobile'],
  form: ['validate', 'dark', 'mobile'],
  'grid-table': ['filter', 'export', 'dark'],
  mindmap: ['expand', 'dark', 'mobile'],
  kanban: ['filter', 'dark', 'mobile'],
  tool: ['chart', 'dark', 'mobile'],
  steps: ['steps', 'dark', 'mobile'],
  manual: ['steps', 'dark', 'mobile'],
}
const NEXT_DEFAULT = ['dark', 'filter', 'mobile'] as const

/** Example asks for a blank conversation, per intent. */
const STARTERS: Record<string, L10n> = {
  map: { zh: ['杭州两日游', '帮我规划一个杭州两日游行程，带地图和每站照片'], en: ['2-day Hangzhou trip', 'Plan a 2-day Hangzhou trip with a map and a photo for each stop'] },
  dashboard: { zh: ['销售看板', '做一个本周销售数据看板：核心指标、趋势图和明细'], en: ['Sales dashboard', 'Build a weekly sales dashboard: key metrics, a trend chart and details'] },
  weather: { zh: ['一周天气', '做一个北京未来 7 天的天气卡片'], en: ['Weekly weather', 'Make a 7-day weather card for Beijing'] },
  compare: { zh: ['套餐对比', '对比三种云服务器套餐，帮我选一个'], en: ['Compare plans', 'Compare three cloud server plans and help me pick one'] },
  tool: { zh: ['房贷计算器', '做一个房贷计算器，能调利率和年限'], en: ['Mortgage calculator', 'Build a mortgage calculator with adjustable rate and term'] },
  mindmap: { zh: ['学习脑图', '画一张学习 TypeScript 的思维导图'], en: ['Learning mind map', 'Draw a mind map for learning TypeScript'] },
  form: { zh: ['订座表单', '做一个餐厅订座表单，选人数、日期和时段'], en: ['Booking form', 'Make a restaurant booking form with party size, date and time slot'] },
  kanban: { zh: ['任务看板', '做一个本周任务看板：待办、进行中、已完成'], en: ['Task board', 'Make a task board for this week: to do, doing, done'] },
  'grid-table': { zh: ['可筛选表格', '做一个可排序、可筛选的员工信息表'], en: ['Sortable table', 'Make a sortable, filterable employee table'] },
}
STARTERS.booking = STARTERS.form!
STARTERS.resource = STARTERS.dashboard!
const STARTER_DEFAULT = ['map', 'dashboard', 'tool', 'weather'] as const

function pick(entry: L10n): [string, string] {
  return currentLocale() === 'zh' ? entry.zh : entry.en
}

export function pageIntentFor(ask: string, title?: string): string {
  return pageIntentId(`${ask}\n${title ?? ''}`) ?? 'visual'
}

/** 2–3 follow-up chips for a page of `intent`. */
export function nextStepChips(intent: string, max = 3): Chip[] {
  const ids = NEXT_BY_INTENT[intent] ?? NEXT_DEFAULT
  return ids.slice(0, max).map((id) => {
    const [label, prompt] = pick(NEXT[id]!)
    return { id, label, prompt }
  })
}

/* ---------------- recent intents (local only) ---------------- */

const STORE_KEY = 'iui.intents.v1'
const MAX_SEEN = 200

interface IntentStore { counts: Record<string, { n: number; at: number }>; seen: string[] }

function storage(): Storage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage } catch { return null }
}

function readStore(): IntentStore {
  try {
    const raw = storage()?.getItem(STORE_KEY)
    const v = raw ? JSON.parse(raw) as Partial<IntentStore> : {}
    return {
      counts: v.counts && typeof v.counts === 'object' ? v.counts : {},
      seen: Array.isArray(v.seen) ? v.seen.filter((x): x is string => typeof x === 'string').slice(-MAX_SEEN) : [],
    }
  } catch {
    return { counts: {}, seen: [] }
  }
}

function hashKey(text: string): string {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619) }
  return (h >>> 0).toString(36)
}

/** Count one generated page (deduped by its source, so history reloads do not inflate). */
export function recordPageIntent(intent: string, source: string, now = Date.now()): void {
  if (!STARTERS[intent]) return
  const store = readStore()
  const key = hashKey(source)
  if (store.seen.includes(key)) return
  store.seen.push(key)
  if (store.seen.length > MAX_SEEN) store.seen.splice(0, store.seen.length - MAX_SEEN)
  const cur = store.counts[intent] ?? { n: 0, at: 0 }
  store.counts[intent] = { n: cur.n + 1, at: now }
  try { storage()?.setItem(STORE_KEY, JSON.stringify(store)) } catch { /* quota */ }
}

/** Intents ranked by use with a 14-day recency decay. */
export function recentIntents(now = Date.now()): string[] {
  const { counts } = readStore()
  return Object.entries(counts)
    .filter(([id]) => STARTERS[id])
    .map(([id, v]) => ({ id, score: v.n * Math.pow(0.5, Math.max(0, now - v.at) / (14 * 86_400_000)) }))
    .sort((a, b) => b.score - a.score)
    .map((x) => x.id)
}

/** 3–4 example chips for a blank conversation (recent intents first). */
export function starterChips(max = 4, now = Date.now()): Chip[] {
  const order: string[] = []
  for (const id of [...recentIntents(now), ...STARTER_DEFAULT]) {
    const canonical = id === 'booking' ? 'form' : id === 'resource' ? 'dashboard' : id
    if (!order.includes(canonical)) order.push(canonical)
  }
  return order.slice(0, max).map((id) => {
    const [label, prompt] = pick(STARTERS[id]!)
    return { id, label, prompt }
  })
}
