// @vitest-environment jsdom
// Phase 3 (F15–F17): legacy fence gate, single error surface, plugin-locale
// strips, random frame ids, download revoke delay, privacy disclosure, and
// author-JS re-run hygiene.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { fenceFailures, isLegacyFencesEnabled, setLegacyFencesEnabled } from '../src/plugin/fence-feedback.ts'
import { patchRuntimeConfigForTest } from '../src/client/runtime-config.ts'
import { renderGenuiFence } from '../src/client/fence-render.tsx'
import { isIuiMarkedSvg } from '../src/client/svg-fence.tsx'
import { newSandboxFrameId } from '../src/client/html-fence.tsx'
import { downloadBlob } from '../src/client/artifact/download.ts'
import { buildAuthorJsRuntimeSource } from '../src/shared/author-js-runtime.ts'
import { buildHtmlSandboxSrcdoc, isIuiSandboxHostMessage } from '../src/shared/html-sandbox.ts'
import { EN as en } from '../src/client/i18n/en.ts'
import { ZH as zh } from '../src/client/i18n/zh.ts'

const ROOT = join(__dirname, '..')
const PAGE_BODY = '{"html":"<main><h1>Hi</h1></main>","css":"main{padding:8px}","js":""}'
const SOURCE = { id: 'dom:test:0', order: [1, 0, 0] as const }

afterEach(() => { cleanup(); patchRuntimeConfigForTest({ legacyFences: false }) })

describe('F16 legacy fences (server feedback)', () => {
  it('flags ```iui / ```dsh-ui as deprecated when the compat switch is off', () => {
    expect(isLegacyFencesEnabled()).toBe(false)
    for (const lang of ['iui', 'dsh-ui']) {
      const failures = fenceFailures(`intro\n\`\`\`${lang}\n${PAGE_BODY}\n\`\`\`\n`)
      expect(failures).toHaveLength(1)
      expect(failures[0]!.detail).toContain('error=deprecated_fence_language')
      expect(failures[0]!.detail).toContain(`language=${lang}`)
      expect(failures[0]!.detail).toContain('```iui-html')
    }
    expect(fenceFailures(`\`\`\`iui-html\n${PAGE_BODY}\n\`\`\`\n`)).toHaveLength(0)
  })

  it('accepts the same body when legacyFences is on', () => {
    setLegacyFencesEnabled(true)
    try {
      expect(fenceFailures(`\`\`\`iui\n${PAGE_BODY}\n\`\`\`\n`)).toHaveLength(0)
    } finally { setLegacyFencesEnabled(false) }
  })
})

describe('F16 legacy fences (client registry gate)', () => {
  it('shows plain code plus a render offer for a settled page body, and renders on click', () => {
    const view = render(<>{renderGenuiFence(PAGE_BODY, 'k', { source: SOURCE }, 'iui')}</>)
    expect(view.container.querySelector('[data-iui-legacy-fence="code"]')).not.toBeNull()
    const offer = view.container.querySelector('[data-iui-render-offer] button') as HTMLButtonElement | null
    expect(offer).not.toBeNull()
    fireEvent.click(offer!)
    expect(view.container.querySelector('[data-iui-legacy-fence="code"]')).toBeNull()
  })

  it('offers nothing while streaming (no settled source)', () => {
    const view = render(<>{renderGenuiFence(PAGE_BODY, 'k', { streaming: true }, 'dsh-ui')}</>)
    expect(view.container.querySelector('[data-iui-legacy-fence="code"]')).not.toBeNull()
    expect(view.container.querySelector('[data-iui-render-offer]')).toBeNull()
  })

  it('bypasses the gate when the compat switch is on', () => {
    patchRuntimeConfigForTest({ legacyFences: true })
    const view = render(<>{renderGenuiFence(PAGE_BODY, 'k', { source: SOURCE }, 'iui')}</>)
    expect(view.container.querySelector('[data-iui-legacy-fence]')).toBeNull()
  })

  it('has offer strings in both locales', () => {
    expect(zh['fence.renderAsPage']).toContain('渲染为页面')
    expect(en['fence.renderAsPage']).toMatch(/Render as page/)
  })
})

describe('F16 svg default tab', () => {
  it('only data-iui marked SVG previews by default', () => {
    expect(isIuiMarkedSvg('<svg xmlns="http://www.w3.org/2000/svg" data-iui="1" viewBox="0 0 1 1"/>')).toBe(true)
    expect(isIuiMarkedSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"/>')).toBe(false)
    expect(isIuiMarkedSvg('<div data-iui="1"></div>')).toBe(false)
  })
})

describe('F17 locale, messages, ids, downloads', () => {
  it('stamps a validated <html lang>', () => {
    const spec = { title: 't', html: '<p>x</p>', css: '', js: '' }
    expect(buildHtmlSandboxSrcdoc(spec, { uiLang: 'zh-CN' })).toMatch(/<html[^>]* lang="zh-CN"/)
    expect(buildHtmlSandboxSrcdoc(spec, { uiLang: 'en' })).toMatch(/<html[^>]* lang="en"/)
    expect(buildHtmlSandboxSrcdoc(spec, { uiLang: '"><script>' })).not.toContain('<script>"')
    expect(buildHtmlSandboxSrcdoc(spec, { uiLang: '"><x' })).not.toMatch(/lang="&?"?>/)
  })

  it('validates strip errors and strip actions from the frame', () => {
    const base = { source: 'iui-html', frameId: 'f1' }
    expect(isIuiSandboxHostMessage({ ...base, type: 'error', message: 'boom', kind: 'author', strip: true })).toBe(true)
    expect(isIuiSandboxHostMessage({ ...base, type: 'error', message: 'boom', strip: 'yes' })).toBe(false)
    expect(isIuiSandboxHostMessage({ ...base, type: 'stripAction', action: 'reload' })).toBe(true)
    expect(isIuiSandboxHostMessage({ ...base, type: 'stripAction', action: 'reask', detail: 'TypeError' })).toBe(true)
    expect(isIuiSandboxHostMessage({ ...base, type: 'stripAction', action: 'delete' })).toBe(false)
    expect(isIuiSandboxHostMessage({ ...base, type: 'stripAction', action: 'reask', detail: 'x'.repeat(2001) })).toBe(false)
  })

  it('frame ids are random and unguessable', () => {
    const ids = new Set(Array.from({ length: 200 }, () => newSandboxFrameId()))
    expect(ids.size).toBe(200)
    for (const id of ids) expect(id).toMatch(/^iui-html-[0-9a-f-]{32,36}$/)
  })

  it('falls back to getRandomValues without randomUUID', () => {
    const spy = vi.spyOn(globalThis.crypto, 'randomUUID').mockImplementation(() => { throw new Error('insecure') })
    try {
      expect(newSandboxFrameId()).toMatch(/^iui-html-[0-9a-f]{32}$/)
    } finally { spy.mockRestore() }
  })

  it('revokes the download object URL only after a delay', () => {
    vi.useFakeTimers()
    const create = vi.fn(() => 'blob:test')
    const revoke = vi.fn()
    const origCreate = URL.createObjectURL
    const origRevoke = URL.revokeObjectURL
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    try {
      downloadBlob(new Blob(['x']), 'a.html')
      expect(click).toHaveBeenCalledOnce()
      vi.advanceTimersByTime(500)
      expect(revoke).not.toHaveBeenCalled()
      vi.advanceTimersByTime(600)
      expect(revoke).toHaveBeenCalledWith('blob:test')
    } finally {
      click.mockRestore()
      Object.assign(URL, { createObjectURL: origCreate, revokeObjectURL: origRevoke })
      vi.useRealTimers()
    }
  })

  it('discloses the Jev third-party call in settings and READMEs', () => {
    const settings = readFileSync(join(ROOT, 'src/client/settings/index.ts'), 'utf8')
    expect(settings).toMatch(/Privacy: when on/)
    expect(settings).toMatch(/隐私提示/)
    expect(settings).toMatch(/legacyFences/)
    expect(readFileSync(join(ROOT, 'README.md'), 'utf8')).toMatch(/### Privacy/)
    expect(readFileSync(join(ROOT, 'README.zh-CN.md'), 'utf8')).toMatch(/### 隐私/)
  })
})

describe('F15 rerun hygiene (author zone)', () => {
  it('tears down timers, listeners and body nodes between re-runs', () => {
    const run = new Function(`
      ${buildAuthorJsRuntimeSource()}
      var root = document.createElement('div');
      root.id = 'iui-preview-root';
      root.innerHTML = '<ul id="log"></ul>';
      document.body.appendChild(root);
      window.__keys = 0;
      var js = 'const log = document.getElementById("log");'
        + 'for (let i = 0; i < 3; i++) log.appendChild(document.createElement("li"));'
        + 'document.body.appendChild(document.createElement("aside"));'
        + 'setInterval(function () {}, 1000);'
        + 'document.addEventListener("keydown", function () { window.__keys++; });';
      var pipe = window.__iuiAuthorPipeline;
      pipe.ensureLibsThenRun({ js: js, jsFunctions: '', jsExpressions: [], jsChunks: [js] });
      var snap = function () {
        return {
          lis: document.querySelectorAll('#log li').length,
          asides: document.querySelectorAll('body > aside').length,
          stats: window.__iuiAuthorZone.stats()
        };
      };
      var first = snap();
      pipe.rerunAuthorJs(); pipe.rerunAuthorJs(); pipe.rerunAuthorJs();
      var after = snap();
      document.dispatchEvent(new KeyboardEvent('keydown'));
      var keys = window.__keys;
      window.__iuiAuthorZone.reset();
      return { first: first, after: after, keys: keys, strips: document.querySelectorAll('.iui-fail-strip').length };
    `)
    const out = run() as {
      first: { lis: number; asides: number; stats: Record<string, number> }
      after: { lis: number; asides: number; stats: Record<string, number> }
      keys: number
      strips: number
    }
    expect(out.first.lis).toBe(3)
    expect(out.first.asides).toBe(1)
    expect(out.first.stats.intervals).toBe(1)
    expect(out.first.stats.listeners).toBe(1)
    expect(out.after).toEqual(out.first)
    expect(out.keys).toBe(1)
    expect(out.strips).toBe(0)
  })
})

describe('F15 coverage gaps', () => {
  it('hoist leaves comments untouched', async () => {
    const { hoistTopLevelLexical } = await import('../src/shared/author-js-runtime.ts')
    const src = '// const a = 1\n/* let b = 2; class C {} */\nconst real = 3'
    const out = hoistTopLevelLexical(src)
    expect(out).toContain('// const a = 1')
    expect(out).toContain('/* let b = 2; class C {} */')
  })

  it('plain JSON is not mistaken for a page', async () => {
    const { looksLikeHtmlSandboxBody, looksLikeGenuiSpecBody, isJsonMasqueradingAsIui } = await import('../src/shared/genui-shape.ts')
    for (const body of ['{"name":"Ada","age":36,"tags":["x"]}', '[1,2,3]', '{"html":5}', '{"items":"none"}']) {
      expect(looksLikeHtmlSandboxBody(body)).toBe(false)
      expect(isJsonMasqueradingAsIui('json', body)).toBe(false)
    }
    expect(looksLikeGenuiSpecBody('{"name":"Ada"}')).toBe(false)
  })

  it('a syntax error in one chunk does not stop the others', () => {
    const run = new Function(`
      ${buildAuthorJsRuntimeSource()}
      var root = document.getElementById('iui-preview-root') || document.body.appendChild(Object.assign(document.createElement('div'), { id: 'iui-preview-root' }));
      root.innerHTML = '';
      window.__iuiAuthorJsRan = false;
      var chunks = ['window.__ok1 = 1;', 'var = ;', 'window.__ok2 = 2;'];
      window.__iuiAuthorPipeline.ensureLibsThenRun({ force: true, js: chunks.join('\\n'), jsFunctions: '', jsExpressions: [], jsChunks: chunks });
      return { a: window.__ok1, b: window.__ok2, strips: document.querySelectorAll('[data-iui-author-fail]').length };
    `)
    const out = run() as { a: number; b: number; strips: number }
    expect(out.a).toBe(1)
    expect(out.b).toBe(2)
    expect(out.strips).toBe(1)
  })
})
