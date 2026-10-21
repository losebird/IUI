import { afterEach, describe, expect, it } from 'vitest'
import {
  EAGERNESS_NOTES, eagernessNoteFor, eagernessWantsText, isOfferableAsk, normalizeUiEagerness, shouldOfferPage,
} from '../src/config/referee-rules.ts'
import { resolveLiveConfig } from '../src/plugin/config-schema.ts'
import { installPageOffer, pageOfferApplies } from '../src/client/page-offer.ts'

describe('G7 page eagerness', () => {
  it('explain / compare questions are offerable; page-native, coding, greetings and explicit asks are not', () => {
    for (const a of ['为什么天空是蓝色的', 'iPhone 15 和 Pixel 8 哪个更值得买', '解释一下光合作用的过程', '中国近十年人口变化趋势', '如何选择适合自己的跑鞋', '对比一下三种定价方案']) {
      expect(isOfferableAsk(a), a).toBe(true)
    }
    for (const a of ['上海明天天气怎么样', '南京三日游怎么安排', '帮我做一个记账看板', 'Python 里怎么反转列表', '你好', '画一张中国 GDP 折线图', 'React 和 Vue 的区别']) {
      expect(isOfferableAsk(a), a).toBe(false)
    }
  })

  it('modes: restrained keeps non-explicit asks in text, balanced only explain/compare, eager visualises', () => {
    expect(normalizeUiEagerness('x')).toBe('balanced')
    expect(resolveLiveConfig({}).uiEagerness).toBe('balanced')
    expect(resolveLiveConfig({ uiEagerness: 'eager' }).uiEagerness).toBe('eager')
    expect(eagernessNoteFor('balanced', '为什么天空是蓝色的')).toBe(EAGERNESS_NOTES.balanced)
    expect(eagernessNoteFor('balanced', '上海明天天气怎么样')).toBeNull()
    expect(eagernessNoteFor('restrained', '上海明天天气怎么样')).toBe(EAGERNESS_NOTES.restrained)
    expect(eagernessNoteFor('eager', '为什么天空是蓝色的')).toBe(EAGERNESS_NOTES.eager)
    expect(eagernessWantsText('eager', '为什么天空是蓝色的')).toBe(false)
    for (const m of ['restrained', 'balanced', 'eager'] as const) {
      expect(eagernessNoteFor(m, '帮我做一个记账看板'), m).toBeNull()
      expect(eagernessNoteFor(m, '你好'), m).toBeNull()
    }
    expect(EAGERNESS_NOTES.balanced).toContain('做成可交互页面')
  })

  it('offer gate: settled text answer to an offerable ask, never under a page', () => {
    const base = { ask: '为什么天空是蓝色的', answer: '因为瑞利散射：短波长的蓝光被大气分子散射得更多，所以白天的天空看起来是蓝色的，日落时则偏红。', hasFence: false, streaming: false, rescued: false }
    expect(pageOfferApplies(base)).toBe(true)
    expect(pageOfferApplies({ ...base, hasFence: true })).toBe(false)
    expect(pageOfferApplies({ ...base, streaming: true })).toBe(false)
    expect(pageOfferApplies({ ...base, answer: '短' })).toBe(false)
    expect(pageOfferApplies({ ...base, ask: '帮我做一个记账看板' })).toBe(false)
    expect(shouldOfferPage('上海明天天气怎么样')).toBe(true)
  })

  describe('DOM', () => {
    let stop: (() => void) | null = null
    afterEach(() => { stop?.(); stop = null; document.body.innerHTML = '' })
    it('mounts one button under the latest assistant row only', async () => {
      const answer = '因为瑞利散射：短波长的蓝光被大气分子散射得更多，所以白天的天空看起来是蓝色的，日落时则偏红。'
      document.body.innerHTML =
        `<div data-role="user">为什么天空是蓝色的</div><div data-role="assistant">${answer}</div>` +
        `<div data-role="user">那晚霞为什么是红色的？</div><div data-role="assistant" id="last">${answer}</div>`
      stop = installPageOffer()
      await new Promise((r) => setTimeout(r, 600))
      expect(document.querySelectorAll('[data-iui-page-offer="button"]')).toHaveLength(1)
      expect(document.getElementById('last')!.querySelector('[data-iui-page-offer="button"]')).not.toBeNull()
    })
  })
})
