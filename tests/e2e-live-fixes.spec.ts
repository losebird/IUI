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
    expect(classifyIntentAsk('上海明天天气怎么样？')?.id).toBe('weather')
  })
})
