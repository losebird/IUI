import { describe, expect, it } from 'vitest'
import {
  buildHtmlSandboxSrcdoc,
  buildSandboxBridgeScript,
  isIuiSandboxFrameCommand,
  isIuiSandboxHostMessage,
  splitAuthorJsChunks,
} from '../src/shared/html-sandbox.ts'
import { buildAuthorJsRuntimeSource } from '../src/shared/author-js-runtime.ts'
import { EN } from '../src/client/i18n/en.ts'
import { ZH } from '../src/client/i18n/zh.ts'

describe('0.13.0-iui.25 failure-visible author JS', () => {
  it('runtime exposes failure strip + rerunAuthorJs (no soft-repair as main path)', () => {
    const src = buildAuthorJsRuntimeSource()
    expect(src).toContain('data-iui-author-fail')
    expect(src).toContain('data-iui-host-fail')
    expect(src).toContain('rerunAuthorJs')
    expect(src).toContain('data-iui-rerun-author')
    expect(src).toContain('clearFailureStrips')
    expect(src).toContain('模型作者 JS')
    expect(src).toContain('Model author JS chunk')
    expect(src).toContain("kind: 'author'")
    expect(src).toContain("kind: 'host'")
    // Soft-repair must not be the main failure path (harden helpers may still exist elsewhere).
    expect(src).not.toContain('softRepairSyntax')
    expect(() => new Function(src)).not.toThrow()
  })

  it('bridge accepts rerunAuthorJs and force runAuthorJs', () => {
    const bridge = buildSandboxBridgeScript('t25')
    expect(bridge).toContain("type === 'rerunAuthorJs'")
    expect(bridge).toContain('force === true')
    expect(bridge).toContain('rerunAuthorJs')
    expect(bridge).toContain("kind: 'host'")
    const body = bridge.replace(/^[\s\S]*?<script>/, '').replace(/<\/script>[\s\S]*$/, '')
    expect(() => new Function(body)).not.toThrow()

    expect(isIuiSandboxFrameCommand({
      source: 'iui-html-host',
      type: 'rerunAuthorJs',
      frameId: 't25',
    })).toBe(true)

    expect(isIuiSandboxFrameCommand({
      source: 'iui-html-host',
      type: 'runAuthorJs',
      frameId: 't25',
      js: 'var x=1',
      force: true,
      jsChunks: ['var x=1'],
    })).toBe(true)

    expect(isIuiSandboxHostMessage({
      source: 'iui-html',
      type: 'error',
      frameId: 't25',
      message: '[author] chunk 2/4: Unexpected token',
      kind: 'author',
      chunkIndex: 1,
      chunkTotal: 4,
    })).toBe(true)

    expect(isIuiSandboxHostMessage({
      source: 'iui-html',
      type: 'error',
      frameId: 't25',
      message: '[host] author pipeline missing',
      kind: 'host',
    })).toBe(true)
  })

  it('chunk isolation still keeps good handlers when a later chunk is syntax-broken', () => {
    const src = `function addSub(){ window._add = 1; }
function resetDemo(){ window._reset = 1; }
var bad = new Chart(el,{type:'bar',options:{x:1}}}});
document.getElementById('x').onclick = addSub;`
    const chunks = splitAuthorJsChunks(src)
    expect(chunks.length).toBeGreaterThanOrEqual(4)
    for (const c of chunks) {
      if (c.includes('new Chart')) continue
      expect(() => new Function(c)).not.toThrow()
    }
  })

  it('final srcdoc still embeds shared pipeline with failure-visible API', () => {
    const doc = buildHtmlSandboxSrcdoc({
      title: 'fail-visible',
      height: 360,
      css: '',
      html: '<canvas id="c"></canvas><button id="add">+</button>',
      js: `function addSub(){ window.n=(window.n||0)+1 }
new Chart(document.getElementById('c'), { type: 'doughnut', data: { labels: ['a'], datasets: [{ data: [1] }] } });
document.getElementById('add').onclick = addSub;`,
      stages: ['html', 'js'],
      partial: false,
      cssComplete: true,
      htmlComplete: true,
      jsComplete: true,
    }, { deferAuthorJs: false, frameId: 't25f' })
    expect(doc).toContain('rerunAuthorJs')
    expect(doc).toContain('data-iui-author-fail')
    expect(doc).toContain('ensureLibsThenRun')
  })

  it('i18n ships zh/en keys for rerun + author/host distinction', () => {
    for (const key of [
      'sandbox.rerunAuthorJs',
      'sandbox.authorChunkFail',
      'sandbox.authorFail',
      'sandbox.hostFail',
      'sandbox.authorFailHint',
      'sandbox.hostFailHint',
    ] as const) {
      expect(EN[key]).toBeTruthy()
      expect(ZH[key]).toBeTruthy()
    }
    expect(ZH['sandbox.rerunAuthorJs']).toContain('重跑作者 JS')
    expect(EN['sandbox.rerunAuthorJs']).toContain('Re-run author JS')
  })
})
