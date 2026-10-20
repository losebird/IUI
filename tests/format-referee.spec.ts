import { describe, expect, it } from 'vitest'
import {
  classifyAsk,
  replyHasFence,
  replyLooksLikeMarkdownUi,
  replyMeetsSuccessShape,
  planFormatRefereeCorrection,
  buildRefereePromptBlock,
  buildFenceFirstHint,
  buildMidTurnFenceNudge,
} from '../src/plugin/format-referee.ts'
import { getIntentRule } from '../src/config/referee-rules.ts'

const sandboxFence = (title = '页面') =>
  '```iui-html\n' +
  JSON.stringify({
    title,
    css: '',
    html: '<div class="iui-sandbox-card">ok</div>',
    js: '',
  }) +
  '\n```'

describe('classifyAsk', () => {
  it('classifies resource / weather / form / compare as must_fence', () => {
    // Enforcement needs an explicit page request; bare topics are the model's call.
    expect(classifyAsk('看看本机 CPU 和内存')).toBeNull()
    expect(classifyAsk('今天北京天气')).toBeNull()
    expect(classifyAsk('对比方案 A 和 B')).toBeNull()
    expect(classifyAsk('用卡片展示这台电脑现在的资源使用情况')?.id).toBe('resource')
    expect(classifyAsk('画一个北京今天的天气卡片')?.id).toBe('weather')
    expect(classifyAsk('帮我做个报名表单')?.id).toBe('form')
    expect(classifyAsk('做一张方案 A/B 对比卡')?.id).toBe('compare')
  })

  it('leaves short facts unclassified (plain text OK)', () => {
    expect(classifyAsk('你好')).toBeNull()
    expect(classifyAsk('2+2')).toBeNull()
  })
})

describe('markdown-as-UI detection', () => {
  const resource = getIntentRule('resource')!

  it('flags Markdown metric lists without a fence', () => {
    const md = '- CPU: 34%\n- 内存: 8 GiB\n'
    expect(replyHasFence(md)).toBe(false)
    expect(replyLooksLikeMarkdownUi(md, resource)).toBe(true)
  })

  it('does not flag when a fence is already present', () => {
    const body = '概览：\n' + sandboxFence('本机') + '\n'
    expect(replyHasFence(body)).toBe(true)
    expect(replyLooksLikeMarkdownUi(body, resource)).toBe(false)
  })
})

describe('success shape (sandbox-first)', () => {
  const resource = getIntentRule('resource')!

  it('rejects legacy catalog trees', () => {
    const weak =
      '```iui\n{"items":[{"type":"progress","label":"CPU","value":0}]}\n```'
    expect(replyMeetsSuccessShape(weak, resource)).toBe(false)
  })

  it('accepts a parseable iui-html sandbox page', () => {
    expect(replyMeetsSuccessShape(sandboxFence('本机资源'), resource)).toBe(true)
  })
})

describe('planFormatRefereeCorrection', () => {
  it('steers when a resource ask gets Markdown only', () => {
    const plan = planFormatRefereeCorrection({
      ask: '用卡片展示这台电脑现在的资源使用情况',
      reply: '- CPU: 34%\n- 内存: 8 GiB\n- 磁盘: 62%\n- 负载: 1.2\n',
      turn: 1,
      aborted: false,
    })
    expect(plan).not.toBeNull()
    expect(plan!.kind).toBe('format')
    expect(plan!.intentId).toBe('resource')
    expect(plan!.text).toContain('```iui-html')
    expect(plan!.text).toContain('Success criteria')
  })

  it('stays silent for short facts', () => {
    expect(
      planFormatRefereeCorrection({
        ask: '你好',
        reply: '你好！',
        turn: 1,
        aborted: false,
      }),
    ).toBeNull()
  })

  it('stays silent when a sandbox fence is present', () => {
    expect(
      planFormatRefereeCorrection({
        ask: '电脑内存怎么样',
        reply: sandboxFence('本机'),
        turn: 1,
        aborted: false,
      }),
    ).toBeNull()
  })

  it('respects per-turn ledger and budget', () => {
    const base = {
      ask: '资源使用情况',
      reply: '- CPU: 1%\n',
      turn: 3,
      aborted: false,
    }
    expect(planFormatRefereeCorrection({ ...base, formatCorrectionsThisTurn: 2, correctionsTurn: 3 })).toBeNull()
    expect(planFormatRefereeCorrection({ ...base, correctionsThisTurn: 2, correctionsTurn: 3 })).toBeNull()
  })

  it('never steers after validate_dsh_ui success', () => {
    expect(
      planFormatRefereeCorrection({
        ask: '资源使用情况',
        reply: '- CPU: 1%\n',
        turn: 1,
        aborted: false,
        validatedOkThisTurn: true,
      }),
    ).toBeNull()
  })
})

describe('buildRefereePromptBlock', () => {
  it('teaches the sandbox fence and forbids file writes / legacy trees', () => {
    const block = buildRefereePromptBlock()
    expect(block).toContain('```iui-html')
    expect(block).toMatch(/legacy|组件树|json/i)
  })
})

describe('fence-first / mid-turn nudge', () => {
  it('fence-first hint leads with a copyable iui-html recipe', () => {
    const rule = getIntentRule('resource')!
    const hint = buildFenceFirstHint(rule)
    expect(hint).toContain('```iui-html')
    expect(hint).toContain('css')
  })

  it('mid-turn nudge asks to stop tools and emit fence', () => {
    const rule = getIntentRule('resource')!
    const nudge = buildMidTurnFenceNudge(rule)
    expect(nudge).toContain('HARD STOP')
    expect(nudge).toContain('```iui-html')
  })
})

describe('manual / map / booking / visual', () => {
  it('classifies 说明书 / 安装 as manual', () => {
    expect(classifyAsk('做一页自行车安装说明书')?.id).toBe('manual')
    expect(classifyAsk('怎么安装这个架子')).toBeNull()
  })

  it('rejects catalog callout-only for manual; accepts sandbox', () => {
    const manual = getIntentRule('manual')!
    const calloutOnly =
      '```iui\n{"title":"注意","items":[{"type":"callout","tone":"warning","title":"安全","content":"戴头盔"}]}\n```'
    expect(replyMeetsSuccessShape(calloutOnly, manual)).toBe(false)
    expect(replyMeetsSuccessShape(sandboxFence('安装'), manual)).toBe(true)
  })

  it('classifies map / booking / visual fallback', () => {
    expect(classifyAsk('给我一张南京地图')?.id).toBe('map')
    expect(classifyAsk('做一个高铁票预订表单')?.id).toBe('booking')
    expect(classifyAsk('帮我订一张高铁票')).toBeNull()
    expect(classifyAsk('把今日菜单给我看看')?.id).toBe('visual')
    const map = getIntentRule('map')!
    expect(map.repairHint).toMatch(/详解/)
    expect(map.repairHint).toMatch(/避坑/)
    expect(map.recipe).toMatch(/iui-cards-strip/)
  })

  it('steers visual fallback when unlisted UI ask has no fence', () => {
    const plan = planFormatRefereeCorrection({
      ask: '把今日菜单给我看看',
      reply: '今天有红烧肉、青菜、例汤。',
      turn: 1,
      aborted: false,
    })
    expect(plan).not.toBeNull()
    expect(plan!.intentId).toBe('visual')
  })

  it('map / booking accept sandbox and reject catalog shells', () => {
    const map = getIntentRule('map')!
    const booking = getIntentRule('booking')!
    expect(replyMeetsSuccessShape(sandboxFence('目的地'), map)).toBe(true)
    expect(
      replyMeetsSuccessShape(
        '```iui\n{"title":"珠江路","items":[{"type":"link","label":"高德"}]}\n```',
        map,
      ),
    ).toBe(false)
    expect(replyMeetsSuccessShape(sandboxFence('订票'), booking)).toBe(true)
    expect(
      replyMeetsSuccessShape(
        '```iui\n{"title":"订票","items":[{"type":"text","content":"请自行打开订票网站"}]}\n```',
        booking,
      ),
    ).toBe(false)
  })
})
