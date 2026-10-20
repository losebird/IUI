import { describe, expect, it } from 'vitest'
import { splitAuthorJsChunks } from '../src/shared/author-js-runtime.ts'
import { classifyIntentAsk, isKnowledgeAsk } from '../src/config/referee-rules.ts'

const parses = (c: string): boolean => { try { new Function(c); return true } catch { return false } }

describe('live dsh E2E fixes', () => {
  it('does not orphan `else` after a top-level `;` (trip page: Unexpected token else)', () => {
    const js = "var anim=null;function fallbackPlay(){}\nif (!anim) fallbackPlay(); else { playing = true; }\nsetTimeout(function(){},250);"
    const chunks = splitAuthorJsChunks(js)
    expect(chunks.every(parses)).toBe(true)
    expect(chunks.some((c) => /^if \(!anim\) fallbackPlay\(\);\s*else/.test(c))).toBe(true)
  })

  it('keeps brace-less if/else-if chains and try/catch intact', () => {
    const js = "var a=1;\nif (a) a++; else if (a<0) a--; else a=0;\ntry { a() } catch (e) { a=2 } finally { a=3 }\nvar b=2;"
    expect(splitAuthorJsChunks(js).every(parses)).toBe(true)
  })

  it('routes coding / brief knowledge questions to plain text', () => {
    for (const ask of ['Python 里怎么把一个列表反转？简单说一下。', '怎么安装 Node.js？', '解释一下 React 的 useEffect 流程']) {
      expect(isKnowledgeAsk(ask)).toBe(true)
      expect(classifyIntentAsk(ask)).toBeNull()
    }
  })

  it('explicit build/show asks still fence', () => {
    expect(classifyIntentAsk('用卡片展示 Python 列表反转的三种写法')?.id).toBe('visual')
    expect(classifyIntentAsk('做一个房贷计算器')?.id).toBe('tool')
    expect(classifyIntentAsk('画一个本地咖啡探店地图')?.id).toBe('map')
    expect(classifyIntentAsk('帮我做一个三日华东行程：苏州→杭州→上海')).not.toBeNull()
    expect(classifyIntentAsk('上海明天天气怎么样？')).toBeNull()
  })
})

describe('referee only steps in on explicit page asks', () => {
  it('isExplicitUiAsk: build/show verbs + artifacts, opt-out, coding questions', async () => {
    const { isExplicitUiAsk } = await import('../src/config/referee-rules.ts')
    for (const a of ['做一个房贷计算器', '画一个产品脑图', '可视化我的订阅账单', '把今日菜单给我看看', '给我一张南京地图', 'show me a dashboard of my spending'])
      expect(isExplicitUiAsk(a), a).toBe(true)
    for (const a of ['红烧肉怎么做', '帮我做一个决定', '写一个命令行工具统计行数', 'React 里怎么显示一个表单', '不要做页面，文字说明就行：上海三日游怎么安排', '上海明天天气怎么样？'])
      expect(isExplicitUiAsk(a), a).toBe(false)
  })

  it('never re-steers a delivered page (no weak_fence)', async () => {
    const { planFormatRefereeCorrection } = await import('../src/plugin/format-referee.ts')
    const reply = '```iui-html\ntitle: 菜单\nheight: 200\n---html\n<div class="iui-sandbox-card">x</div>\n```'
    expect(planFormatRefereeCorrection({ ask: '把今日菜单给我看看', reply, turn: 1, aborted: false })).toBeNull()
    expect(planFormatRefereeCorrection({ ask: '做一页自行车安装说明书', reply, turn: 1, aborted: false })).toBeNull()
  })

  it('does not steer plain answers to non-explicit asks', async () => {
    const { planFormatRefereeCorrection } = await import('../src/plugin/format-referee.ts')
    expect(planFormatRefereeCorrection({ ask: '告诉我这台电脑现在的资源使用情况', reply: '- CPU: 34%\n- 内存: 8 GiB', turn: 1, aborted: false })).toBeNull()
  })
})
