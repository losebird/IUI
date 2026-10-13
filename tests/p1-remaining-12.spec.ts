import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isIuiSandboxFrameCommand } from '../src/shared/html-sandbox.ts'

describe('P1 remaining (.12)', () => {
  it('P1-N3: postMessage rejects event.source === null (strict contentWindow)', () => {
    const src = readFileSync(resolve(__dirname, '../src/client/html-fence.tsx'), 'utf8')
    expect(src).toMatch(/if \(event\.source !== frame\.contentWindow\) return/)
    expect(src).not.toMatch(/event\.source !== null && event\.source !== frame\.contentWindow/)
  })

  it('P1-N1: fenceIndexOf counts iui-html + sandbox bodies', () => {
    const src = readFileSync(resolve(__dirname, '../src/client/dom-fence.tsx'), 'utf8')
    expect(src).toMatch(/!isHtmlFenceLang\(language\)/)
    expect(src).toMatch(/!looksLikeHtmlSandboxBody\(candRaw\)/)
    // both fallback + row loops
    expect(src.split('!isHtmlFenceLang(language)').length - 1).toBeGreaterThanOrEqual(2)
  })

  it('P1-N2: DOM renderResolvedFenceNode blocks GenuiBlock', () => {
    const src = readFileSync(resolve(__dirname, '../src/client/fence-render.tsx'), 'utf8')
    expect(src).toMatch(/data-iui-legacy-catalog/)
    expect(src).toMatch(/never render ExportableGenuiBlock/)
    expect(src).not.toMatch(/<ExportableGenuiBlock/)
    expect(src).not.toMatch(/FencePanelPublisher/)
  })

  it('P1-N5: referee says language iui-html', () => {
    const src = readFileSync(resolve(__dirname, '../src/plugin/format-referee.ts'), 'utf8')
    expect(src).toMatch(/language iui-html, never json/)
    expect(src).not.toMatch(/language iui, never json/)
  })

  it('P1-N6: previewHtml command + frozen preview-shell key exist', () => {
    const fence = readFileSync(resolve(__dirname, '../src/client/html-fence.tsx'), 'utf8')
    const sandbox = readFileSync(resolve(__dirname, '../src/shared/html-sandbox.ts'), 'utf8')
    expect(fence).toMatch(/preview-shell/)
    expect(fence).toMatch(/type: 'previewHtml'/)
    expect(fence).toMatch(/type: 'previewCss'/)
    expect(fence).toMatch(/htmlSandboxSrcdocRebuildKey/)
    expect(sandbox).toMatch(/type: 'previewHtml'/)
    expect(sandbox).toMatch(/type: 'previewCss'/)
    expect(sandbox).toMatch(/iui-preview-root/)
    expect(sandbox).toMatch(/iui-author-css/)
    expect(isIuiSandboxFrameCommand({
      source: 'iui-html-host',
      type: 'previewHtml',
      frameId: 'x',
      html: '<p>hi</p>',
    })).toBe(true)
    expect(isIuiSandboxFrameCommand({
      source: 'iui-html-host',
      type: 'previewHtml',
      frameId: 'x',
      html: 'x'.repeat(200_065),
    })).toBe(false)
    expect(isIuiSandboxFrameCommand({
      source: 'iui-html-host',
      type: 'previewCss',
      frameId: 'x',
      css: '.w{display:grid}',
    })).toBe(true)
    expect(isIuiSandboxFrameCommand({
      source: 'iui-html-host',
      type: 'previewCss',
      frameId: 'x',
      css: 'x'.repeat(200_065),
    })).toBe(false)
  })

  it('P1-N4: README no longer advertises Gateway / 0.12 default path', () => {
    const en = readFileSync(resolve(__dirname, '../README.md'), 'utf8')
    const zh = readFileSync(resolve(__dirname, '../README.zh-CN.md'), 'utf8')
    for (const doc of [en, zh]) {
      expect(doc).toMatch(/iui-html/)
      expect(doc).toMatch(/sandbox|沙箱/)
      // Must not advertise the old default path (Gateway + FreeLLMAPI :3001).
      expect(doc).not.toMatch(/→ plugin fence \+ in-process Gateway/)
      expect(doc).not.toMatch(/→ 插件围栏 \+ 同进程 Gateway/)
      expect(doc).not.toMatch(/FreeLLMAPI `:3001`/)
      expect(doc).not.toMatch(/\.44`：规则/)
    }
  })
})
