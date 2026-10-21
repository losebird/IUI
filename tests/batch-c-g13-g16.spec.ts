import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it } from 'vitest'
import { pageIntentId } from '../src/config/referee-rules.ts'
import { nextStepChips, pageIntentFor, recentIntents, recordPageIntent, starterChips } from '../src/client/next-steps.ts'
import { templateMatches } from '../src/client/TemplateDrawer.tsx'
import {
  buildSandboxBridgeScript,
  isIuiSandboxHostMessage,
  SELF_CHECK_KINDS,
} from '../src/shared/html-sandbox.ts'
import { buildAuthorJsRuntimeSource } from '../src/shared/author-js-runtime.ts'
import {
  clearFeedback,
  exportFeedback,
  getPageFeedback,
  pageFeedbackKey,
  recordSelfCheck,
  recordVote,
  subscribeFeedback,
  summarizeFeedback,
} from '../src/client/feedback-store.ts'
import { selfCheckPrompt } from '../src/client/html-fence.tsx'
import { feedbackDigest } from '../src/client/settings/FeedbackStatsCard.tsx'
import { IUI_VERSION } from '../src/shared/version.ts'
import { ZH as zh } from '../src/client/i18n/zh.ts'
import { EN as en } from '../src/client/i18n/en.ts'

const tZh = (k: string): string => (zh as Record<string, string>)[k] ?? k

beforeEach(() => { localStorage.clear() })

describe('G13 next steps', () => {
  it('maps asks to intents, kanban first', () => {
    expect(pageIntentId('做一个本周任务看板')).toBe('kanban')
    expect(pageIntentId('')).toBeNull()
    expect(pageIntentFor('随便聊聊')).toBe('visual')
    expect(pageIntentFor('', '杭州两日游地图')).toBe(pageIntentId('\n杭州两日游地图') ?? 'visual')
  })

  it('offers 2–3 chips with prompts for any intent', () => {
    for (const intent of ['kanban', 'map', 'dashboard', 'visual', 'nope']) {
      const chips = nextStepChips(intent)
      expect(chips.length).toBeGreaterThanOrEqual(2)
      expect(chips.length).toBeLessThanOrEqual(3)
      for (const c of chips) { expect(c.label).toBeTruthy(); expect(c.prompt.length).toBeGreaterThan(4) }
    }
  })

  it('ranks starters by recent use and dedupes by source', () => {
    const now = Date.UTC(2025, 0, 20)
    expect(starterChips(4, now).map((c) => c.id)).toEqual(['map', 'dashboard', 'tool', 'weather'])
    recordPageIntent('kanban', 'page-a', now)
    recordPageIntent('kanban', 'page-a', now)
    recordPageIntent('kanban', 'page-b', now)
    recordPageIntent('weather', 'page-c', now - 60 * 86_400_000)
    recordPageIntent('not-an-intent', 'page-d', now)
    expect(recentIntents(now)[0]).toBe('kanban')
    const ids = starterChips(4, now).map((c) => c.id)
    expect(ids[0]).toBe('kanban')
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toHaveLength(4)
  })

  it('template search matches every term', () => {
    expect(templateMatches('销售 看板', '销售看板', '核心指标')).toBe(true)
    expect(templateMatches('销售 地图', '销售看板', '核心指标')).toBe(false)
    expect(templateMatches('chart', 'Sales', 'A trend chart')).toBe(true)
  })
})

describe('G15 self-check', () => {
  it('bridge ships the self-check and the runtime schedules it', () => {
    const bridge = buildSandboxBridgeScript('f1')
    expect(bridge).toContain('__iuiSelfCheck')
    expect(bridge).toContain("type: 'selfCheck'")
    for (const kind of SELF_CHECK_KINDS) expect(bridge).toContain(`'${kind}'`)
    expect(buildAuthorJsRuntimeSource()).toContain('__iuiScheduleSelfCheck')
  })

  it('validates selfCheck messages', () => {
    const ok = { source: 'iui-html', type: 'selfCheck', frameId: 'f', serious: 1, issues: [{ kind: 'smallText', count: 4, serious: true, detail: '10px' }] }
    expect(isIuiSandboxHostMessage(ok)).toBe(true)
    expect(isIuiSandboxHostMessage({ ...ok, issues: [{ kind: 'evil', count: 1, serious: true }] })).toBe(false)
    expect(isIuiSandboxHostMessage({ ...ok, issues: [{ kind: 'smallText', count: 'x', serious: true }] })).toBe(false)
    expect(isIuiSandboxHostMessage({ ...ok, issues: Array.from({ length: 11 }, () => ok.issues[0]) })).toBe(false)
    expect(isIuiSandboxHostMessage({ ...ok, issues: [{ kind: 'smallText', count: 1, serious: true, detail: 'x'.repeat(200) }] })).toBe(false)
  })

  it('builds a fix prompt that lists serious issues first and suggests iui-patch', () => {
    const text = selfCheckPrompt(tZh, [
      { kind: 'consoleError', count: 2, serious: false },
      { kind: 'overflowX', count: 1, serious: true, detail: '120px' },
    ])
    expect(text).toContain('iui-patch')
    const lines = text.split('\n')
    expect(lines[1]).toContain('横向溢出')
    expect(lines[1]).toContain('120px')
    expect(lines[2]).toContain('×2')
  })

  it('has zh/en labels for every kind', () => {
    for (const kind of SELF_CHECK_KINDS) {
      expect((zh as Record<string, string>)[`sandbox.selfCheck.${kind}`]).toBeTruthy()
      expect((en as Record<string, string>)[`sandbox.selfCheck.${kind}`]).toBeTruthy()
    }
  })
})

describe('G16 feedback store', () => {
  it('keys pages by an opaque hash', () => {
    const k = pageFeedbackKey('---html\n<h1>secret</h1>')
    expect(k).toMatch(/^p[0-9a-z]+$/)
    expect(k).not.toContain('secret')
    expect(pageFeedbackKey('a')).not.toBe(pageFeedbackKey('b'))
  })

  it('records votes, reasons and self-checks, and summarizes', () => {
    let hits = 0
    const off = subscribeFeedback(() => { hits++ })
    recordVote('p1', 'map', 'up')
    recordVote('p2', 'kanban', 'down', 'ugly')
    recordVote('p3', 'tool', 'up', 'ugly')
    recordSelfCheck('p2', 'kanban', [{ kind: 'smallText', count: 5, serious: true }, { kind: 'consoleError', count: 1, serious: false }])
    expect(getPageFeedback('p3')?.reason).toBeUndefined()
    expect(getPageFeedback('p2')?.checks).toEqual({ '!smallText': 5, consoleError: 1 })
    const s = summarizeFeedback()
    expect(s).toMatchObject({ pages: 3, up: 2, down: 1, pagesWithSerious: 1, reasons: { ugly: 1 }, checks: { smallText: 1, consoleError: 1 } })
    recordVote('p1', 'map', null)
    expect(getPageFeedback('p1')?.vote).toBeUndefined()
    expect(hits).toBeGreaterThanOrEqual(5)
    off()
  })

  it('exports anonymously and clears', () => {
    recordVote(pageFeedbackKey('<p>private text</p>'), 'map', 'down', 'broken')
    const json = exportFeedback({ version: IUI_VERSION, locale: 'zh' })
    const data = JSON.parse(json)
    expect(data).toMatchObject({ kind: 'iui-feedback', schema: 1, plugin: IUI_VERSION, locale: 'zh' })
    expect(json).not.toContain('private text')
    expect(json).not.toContain(pageFeedbackKey('<p>private text</p>'))
    expect(data.pages[0]).toMatchObject({ intent: 'map', vote: 'down', reason: 'broken' })
    clearFeedback()
    expect(summarizeFeedback().pages).toBe(0)
  })

  it('survives corrupt storage', () => {
    localStorage.setItem('iui.feedback.v1', '{not json')
    expect(summarizeFeedback().pages).toBe(0)
    recordVote('p9', 'map', 'up')
    expect(summarizeFeedback().up).toBe(1)
  })

  it('formats the settings digest', () => {
    const t = (k: string): string => k === 'feedbackDigest' ? '{pages}|{up}|{down}|{serious}' : k
    expect(feedbackDigest(t, { pages: 0, up: 0, down: 0, reasons: {}, checks: {}, pagesWithSerious: 0 })).toBe('feedbackEmpty')
    expect(feedbackDigest(t, { pages: 4, up: 2, down: 1, reasons: {}, checks: {}, pagesWithSerious: 3 })).toBe('4|2|1|3')
  })

  it('version constant matches package.json', () => {
    const pkg = JSON.parse(readFileSync(`${process.cwd()}/package.json`, 'utf8')) as { version: string }
    expect(IUI_VERSION).toBe(pkg.version)
  })
})
