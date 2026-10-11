import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('dom-fence sweep iui-html routing (P0-1)', () => {
  it('sweep update branch calls renderHtmlFence for iui-html', () => {
    const src = readFileSync(resolve(__dirname, '../src/client/dom-fence.tsx'), 'utf8')
    expect(src).toMatch(/mount\.language === 'iui-html'[\s\S]{0,80}?renderHtmlFence\(raw, key, context\)/)
    expect(src).not.toMatch(
      /const node = mount\.language === 'svg' \? renderSvgFence\(raw, key\) : renderResolvedFenceNode\(raw, key, context\)/,
    )
  })
})
