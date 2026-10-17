import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { buildAuthorJsRuntimeSource, splitAuthorJsChunks } from '../src/shared/author-js-runtime.ts'
import { getHtmlSandboxStarter, prepareAuthorJs } from '../src/shared/html-sandbox.ts'
import { buildTripAnimatorScriptTag } from '../src/themes/oiu-design-system.ts'

type Settled = { type?: string; ok?: boolean; failedChunks?: number }

const fixtures = join(process.cwd(), 'tests/fixtures')
const nameArtifact = JSON.parse(readFileSync(join(fixtures, 'onframe-reading-name.json'), 'utf8')) as { html: string; js: string }
const dayJs = readFileSync(join(fixtures, 'onframe-reading-day.js'), 'utf8')

const nativeQuery = {
  document: Document.prototype.querySelector,
  element: Element.prototype.querySelector,
  getElementById: document.getElementById,
}

function leafletStandIn() {
  const chain = (): unknown => new Proxy(function () {}, {
    get(_target, key) {
      if (key === 'getElement') return () => document.createElement('span')
      return chain()
    },
    apply: () => chain(),
  })
  return chain()
}

function installHostPage(html: string) {
  Document.prototype.querySelector = nativeQuery.document
  Element.prototype.querySelector = nativeQuery.element
  document.getElementById = nativeQuery.getElementById
  ;(document as unknown as { __iuiNullSafe?: boolean }).__iuiNullSafe = false
  document.body.innerHTML = `<div id="iui-preview-root">${html}</div>`
  const win = window as unknown as {
    L: unknown
    Chart: unknown
    createTripAnimator?: unknown
    __iuiAuthorPipeline?: { ensureLibsThenRun: (opts: unknown) => void; phase?: string }
    __trip?: { play: () => void; replay: () => void }
  }
  win.__iuiAuthorPipeline = undefined
  win.L = leafletStandIn()
  ;(globalThis as unknown as { L: unknown }).L = win.L
  function Chart(this: unknown) { return this }
  win.Chart = Chart
  ;(globalThis as unknown as { Chart: unknown }).Chart = Chart
  const tag = buildTripAnimatorScriptTag()
  const installer = tag.replace(/^<script>/, '').replace(/<\/script>$/, '')
  new Function(installer)()
  new Function(buildAuthorJsRuntimeSource())()
  return win
}

async function runAuthorJs(js: string, html: string) {
  const win = installHostPage(html)
  const messages: unknown[] = []
  const logs: string[] = []
  const origPost = window.parent.postMessage.bind(window.parent)
  const origError = console.error
  window.parent.postMessage = ((data: unknown) => { messages.push(data) }) as typeof window.parent.postMessage
  console.error = (...args: unknown[]) => {
    logs.push(args.map((arg) => (arg instanceof Error ? `${arg.name}: ${arg.message}` : String(arg))).join(' '))
    origError(...args)
  }
  try {
    const chunks = splitAuthorJsChunks(prepareAuthorJs(js))
    win.__iuiAuthorPipeline!.ensureLibsThenRun({
      js: '',
      jsFunctions: '',
      jsExpressions: [],
      jsChunks: chunks,
    })
    const started = Date.now()
    while (!messages.some((msg) => typeof msg === 'object' && msg !== null && (msg as Settled).type === 'authorSettled') && Date.now() - started < 2000) {
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
  } finally {
    window.parent.postMessage = origPost
    console.error = origError
  }
  const settled = messages.find((msg): msg is Settled => {
    return typeof msg === 'object' && msg !== null && (msg as Settled).type === 'authorSettled'
  })
  return {
    win,
    settled,
    logs,
    authorFail: document.querySelectorAll('[data-iui-author-fail]').length,
    titles: [...document.querySelectorAll('[data-iui-author-fail] .iui-fail-title')].map((el) => el.textContent ?? ''),
    alerts: [...document.querySelectorAll('[role="alert"]')].map((el) => el.textContent ?? ''),
  }
}

describe('author JS that indexes the onFrame argument', () => {
  afterEach(() => {
    Document.prototype.querySelector = nativeQuery.document
    Element.prototype.querySelector = nativeQuery.element
    document.getElementById = nativeQuery.getElementById
    ;(document as unknown as { __iuiNullSafe?: boolean }).__iuiNullSafe = false
    document.body.innerHTML = ''
  })

  it('low-effort Hangzhou script keeps the page and still shows reading name', async () => {
    const observed = await runAuthorJs(nameArtifact.js, nameArtifact.html)
    expect({
      authorChunkFailed: observed.authorFail > 0,
      settledOk: observed.settled?.ok === true,
      failedChunks: observed.settled?.failedChunks ?? null,
      failureTitle: observed.titles.join(''),
      visibleAlert: observed.alerts.join('\n'),
      logged: observed.logs.some((line) => line.includes("reading 'name'")),
      animatorReturned: typeof observed.win.__trip === 'object' && observed.win.__trip !== null,
      pauseHandler: typeof document.getElementById('pause')?.onclick,
    }).toEqual({
      authorChunkFailed: false,
      settledOk: true,
      failedChunks: 0,
      failureTitle: '',
      visibleAlert: expect.stringContaining("reading 'name'"),
      logged: true,
      animatorReturned: true,
      pauseHandler: 'function',
    })
    const alertsBefore = document.querySelectorAll('[role="alert"]').length
    expect(() => observed.win.__trip!.play()).not.toThrow()
    expect(() => observed.win.__trip!.replay()).not.toThrow()
    expect(document.querySelectorAll('[role="alert"]').length).toBe(alertsBefore)
  })

  it('high-effort Hangzhou script keeps the page and still shows reading day', async () => {
    const html = '<button id="btnPause"></button><button id="btnReplay"></button><div id="map"></div><canvas id="budgetChart"></canvas>'
    const observed = await runAuthorJs(dayJs, html)
    expect({
      authorChunkFailed: observed.authorFail > 0,
      settledOk: observed.settled?.ok === true,
      failedChunks: observed.settled?.failedChunks ?? null,
      failureTitle: observed.titles.join(''),
      visibleAlert: observed.alerts.join('\n'),
      logged: observed.logs.some((line) => line.includes("reading 'day'")),
    }).toEqual({
      authorChunkFailed: false,
      settledOk: true,
      failedChunks: 0,
      failureTitle: '',
      visibleAlert: expect.stringContaining("reading 'day'"),
      logged: true,
    })
  })

  it('the animator alert explains the pause in Chinese and keeps the original error secondary', async () => {
    const observed = await runAuthorJs(nameArtifact.js, nameArtifact.html)
    const alert = document.querySelector('[role="alert"]')
    const title = alert?.querySelector('.iui-fail-title')?.textContent ?? ''
    const hint = alert?.querySelector('.iui-fail-hint')?.textContent ?? ''
    const meta = alert?.querySelector('.iui-fail-meta')?.textContent ?? ''
    expect(title).toBe('这段动画的代码出错了，动画已暂停。')
    expect(hint).toBe('可以点「重播」再试一次，或让 AI 重新生成这一页。')
    expect(meta).toContain("reading 'name'")
    expect(title).not.toContain('name')
    expect(observed.logs.some((line) => line.includes("reading 'name'"))).toBe(true)
    expect(observed.authorFail).toBe(0)
  })

  it('replay after a stop calls the throwing callback again and keeps one notice', async () => {
    await runAuthorJs(nameArtifact.js, nameArtifact.html)
    let errors = 0
    const orig = console.error
    console.error = (...args: unknown[]) => {
      const line = args.map((arg) => (arg instanceof Error ? `${arg.name}: ${arg.message}` : String(arg))).join(' ')
      if (line.includes("reading 'name'")) errors += 1
      orig(...args)
    }
    try {
      document.getElementById('replay')!.click()
    } finally {
      console.error = orig
    }
    expect(errors).toBeGreaterThan(0)
    expect(document.querySelectorAll('[data-iui-author-fail]').length).toBe(0)
    expect(document.querySelectorAll('[data-iui-animator-fail]').length).toBe(1)
    expect(nativeQuery.document.call(document, '[role="alert"] .iui-fail-meta')?.textContent ?? '').toContain("reading 'name'")
  })

  async function waitFor(pred: () => boolean, timeoutMs = 2500) {
    const started = Date.now()
    while (!pred() && Date.now() - started < timeoutMs) {
      await new Promise((resolve) => setTimeout(resolve, 16))
    }
  }

  function animatorNotice(): string {
    return [...document.querySelectorAll('[data-iui-animator-fail]')].map((el) => el.textContent ?? '').join('\n')
  }

  it('clears the pause notice after replay when only the first frame threw', async () => {
    const js = `(function(){
      window.__calls = 0;
      window.__states = [];
      window.__tour = createTripAnimator({
        stopCount: 2,
        durationMs: 1000,
        pinElements: [],
        onFrame: function(){
          window.__calls++;
          if (window.__calls === 1) throw new Error('boom-frame');
        },
        onState: function(st){ window.__states.push(st); }
      });
      document.getElementById('replay').onclick = function(){ window.__tour.replay(); };
    })();`
    await runAuthorJs(js, '<button id="replay"></button>')
    const win = window as unknown as { __calls: number; __states: string[] }
    expect(win.__calls).toBe(1)
    expect(animatorNotice()).toContain('动画已暂停')
    document.getElementById('replay')!.click()
    await waitFor(() => win.__states.includes('complete'))
    expect(win.__states).toContain('complete')
    expect(document.querySelectorAll('[data-iui-animator-fail]').length).toBe(0)
    expect(animatorNotice()).not.toContain('动画已暂停')
  })

  it('clears the pause notice after replay when the fifth frame threw once', async () => {
    const js = `(function(){
      window.__calls = 0;
      window.__states = [];
      window.__tour = createTripAnimator({
        stopCount: 3,
        durationMs: 1000,
        pinElements: [],
        onFrame: function(){
          window.__calls++;
          if (window.__calls === 5) throw new Error('boom-fifth');
        },
        onState: function(st){ window.__states.push(st); }
      });
      document.getElementById('replay').onclick = function(){ window.__tour.replay(); };
    })();`
    await runAuthorJs(js, '<button id="replay"></button>')
    const win = window as unknown as { __calls: number; __states: string[]; __tour: { play: () => void } }
    win.__tour.play()
    await waitFor(() => win.__calls >= 5)
    expect(win.__calls).toBe(5)
    expect(animatorNotice()).toContain('动画已暂停')
    document.getElementById('replay')!.click()
    await waitFor(() => win.__states.includes('complete'))
    expect(win.__states).toContain('complete')
    expect(document.querySelectorAll('[data-iui-animator-fail]').length).toBe(0)
    expect(animatorNotice()).not.toContain('动画已暂停')
  })

  for (const statusId of ['mapStatus', 'tripStatus', 'status', 'routeNote']) {
    it(`shows 播放中, 已暂停, and 已完成 on #${statusId} from onState's second argument`, async () => {
      const js = `(function(){
        window.__calls = 0;
        window.__states = [];
        window.__tour = createTripAnimator({
          stopCount: 2,
          durationMs: 1000,
          pinElements: [],
          onFrame: function(){
            window.__calls++;
            if (window.__calls === 1) throw new Error('boom-status');
          },
          onState: function(st, label){
            window.__states.push(st);
            document.getElementById('${statusId}').textContent = label;
          }
        });
        document.getElementById('replay').onclick = function(){ window.__tour.replay(); };
      })();`
      await runAuthorJs(js, `<p id="${statusId}"></p><button id="replay"></button>`)
      const win = window as unknown as { __states: string[] }
      const status = () => document.getElementById(statusId)?.textContent ?? ''
      expect(win.__states).toContain('paused')
      expect(status()).toBe('已暂停')
      document.getElementById('replay')!.click()
      expect(win.__states).toContain('playing')
      expect(status()).toBe('播放中')
      await waitFor(() => win.__states.includes('complete'))
      expect(win.__states).toContain('complete')
      expect(status()).toBe('已完成')
      expect(win.__states.every((state) => state === 'playing' || state === 'paused' || state === 'complete')).toBe(true)
    })
  }

  it('the itinerary starter shows the Chinese label on #status', async () => {
    const starter = getHtmlSandboxStarter('itinerary-coast')
    await runAuthorJs(starter!.spec.js, starter!.spec.html)
    const status = () => document.getElementById('status')?.textContent ?? ''
    document.getElementById('pause')!.click()
    expect(status()).toBe('已暂停')
    document.getElementById('pause')!.click()
    expect(status()).toBe('播放中')
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(status()).toBe('播放中')
    await waitFor(() => status() === '已完成', 8000)
    expect(status()).toBe('已完成')
  })

  it('leaves #mapStatus alone when the author displays the English token', async () => {
    const js = `(function(){
      window.__states = [];
      window.__labels = [];
      window.__tour = createTripAnimator({
        stopCount: 2,
        durationMs: 1000,
        pinElements: [],
        onFrame: function(){ throw new Error('boom-status'); },
        onState: function(st, label){
          window.__states.push(st);
          window.__labels.push(label);
          document.getElementById('mapStatus').textContent = st;
        }
      });
    })();`
    await runAuthorJs(js, '<p id="mapStatus"></p>')
    const win = window as unknown as { __states: string[]; __labels: string[] }
    expect(win.__states).toContain('paused')
    expect(document.getElementById('mapStatus')?.textContent).toBe('paused')
    expect(win.__labels).toContain('已暂停')
  })

  it('replay after a frame error can run again and pause can stop it', async () => {
    const js = `(function(){
      window.__calls = 0;
      window.__states = [];
      window.__tour = createTripAnimator({
        stopCount: 2,
        durationMs: 6000,
        pinElements: [],
        onFrame: function(){
          window.__calls++;
          if (window.__calls === 1) throw new Error('boom-frame');
        },
        onState: function(st){ window.__states.push(st); }
      });
      document.getElementById('replay').onclick = function(){ window.__tour.replay(); };
      document.getElementById('pause').onclick = function(){ window.__tour.pause(); };
    })();`
    await runAuthorJs(js, '<button id="pause"></button><button id="replay"></button>')
    const win = window as unknown as { __calls: number; __states: string[] }
    expect(win.__calls).toBe(1)
    document.getElementById('replay')!.click()
    expect(win.__calls).toBeGreaterThan(1)
    expect(win.__states).toContain('playing')
    const callsAtPlay = win.__calls
    document.getElementById('pause')!.click()
    expect(win.__states[win.__states.length - 1]).toBe('paused')
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(win.__calls).toBe(callsAtPlay)
  })

  it('a callback that reads pinIndex still receives the frame and does not raise an alert', async () => {
    const js = `(function(){
      window.__frames = [];
      window.__tour = createTripAnimator({
        stopCount: 2,
        durationMs: 6000,
        pinElements: [],
        onFrame: function(f){ window.__frames.push(f.pinIndex); }
      });
    })();`
    const observed = await runAuthorJs(js, '<button id="pause"></button>')
    const frames = (window as unknown as { __frames?: unknown[] }).__frames ?? []
    expect(observed.authorFail).toBe(0)
    expect(observed.settled?.ok).toBe(true)
    expect(observed.alerts.join('\n')).not.toContain('reading')
    expect(frames.length).toBeGreaterThan(0)
    expect(frames.every((index) => typeof index === 'number')).toBe(true)
  })
})
