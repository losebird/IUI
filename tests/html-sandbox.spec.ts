import { describe, expect, it } from 'vitest'
import {
  HTML_SANDBOX_CDN_ALLOWLIST,
  buildHtmlSandboxSrcdoc,
  isIuiSandboxHostMessage,
  parseHtmlSandboxFence,
  sanitizeSandboxCss,
  sanitizeSandboxMarkup,
  HTML_SANDBOX_MAX_HTML_BYTES,
  HTML_SANDBOX_MAX_AUTHOR_BYTES,
  sandboxStageLabels,
  isSandboxSpecEmpty,
  isIuiSandboxFrameCommand,
  buildSandboxDownloadHtml,
} from '../src/shared/html-sandbox.ts'

describe('html-sandbox', () => {
  it('parses JSON fence and reports stages', () => {
    const spec = parseHtmlSandboxFence(JSON.stringify({
      title: 'Demo',
      height: 400,
      css: '.x{color:red}',
      html: '<div class="x">hi</div>',
      js: 'console.log(1)',
    }))
    expect(spec).not.toBeNull()
    expect(spec!.partial).toBe(false)
    expect(sandboxStageLabels(spec!)).toEqual(['css', 'html', 'js'])
    expect(spec!.height).toBe(400)
  })

  it('parses streaming partial JSON', () => {
    const raw = '{"title":"T","css":".a{}","html":"<b>ok"'
    const spec = parseHtmlSandboxFence(raw)
    expect(spec).not.toBeNull()
    expect(spec!.partial).toBe(true)
    expect(spec!.css).toContain('.a')
    expect(spec!.html).toContain('<b>ok')
  })

  it('parses section markers', () => {
    const spec = parseHtmlSandboxFence('css\n.a{}\nhtml\n<div>x</div>\njs\n1')
    expect(spec?.stages).toEqual(['css', 'html', 'js'])
    expect(spec?.html).toContain('<div>x</div>')
  })

  it('blocks non-HTTPS and non-allowlisted script src', () => {
    const dirty = '<script src="http://evil.test/x.js"></script><script src="https://cdn.jsdelivr.net/npm/x"></script>'
    const clean = sanitizeSandboxMarkup(dirty)
    expect(clean).toContain('blocked script src')
    expect(clean).toContain('cdn.jsdelivr.net')
  })

  it('strips inline handlers and nested iframes', () => {
    const clean = sanitizeSandboxMarkup('<div onclick="alert(1)"></div><iframe src="https://x"></iframe>')
    expect(clean).not.toContain('onclick')
    expect(clean).toContain('blocked iframe')
  })

  it('keeps Wikimedia img tags (itinerary photo path)', () => {
    const html = '<div class="photo"><img src="https://commons.wikimedia.org/wiki/Special:FilePath/GoldenGateBridge-001.jpg?width=480" alt="SF" loading="lazy"></div>'
    const clean = sanitizeSandboxMarkup(html)
    expect(clean).toContain('Special:FilePath/GoldenGateBridge-001.jpg')
    expect(clean).toContain('<img')
    const spec = parseHtmlSandboxFence(JSON.stringify({ html, css: '', js: '' }))!
    const doc = buildHtmlSandboxSrcdoc(spec, { frameId: 'photo' })
    expect(doc).toContain('img-src')
    expect(doc).toContain('commons.wikimedia.org')
    expect(doc).toContain('upload.wikimedia.org')
  })

  it('blocks base / meta-refresh / external form actions', () => {
    const clean = sanitizeSandboxMarkup(
      '<base href="https://evil.test/"><meta http-equiv="refresh" content="0;url=https://evil.test"><form action="https://evil.test/x"><button>go</button></form>',
    )
    expect(clean).toContain('blocked base')
    expect(clean).toContain('blocked meta')
    expect(clean).toContain('blocked form action')
  })

  it('sanitizes dangerous CSS', () => {
    const dirty = "@import url('https://evil.test/x.css'); body{background:url(javascript:alert(1)); behavior:url(x);}"
    const clean = sanitizeSandboxCss(dirty)
    expect(clean).toContain('blocked import')
    expect(clean).not.toContain('@import')
    expect(clean.toLowerCase()).not.toContain('javascript:')
    expect(clean).toContain('/* blocked behavior */')
  })

  it('injects design tokens and CSP into srcdoc', () => {
    const spec = parseHtmlSandboxFence(JSON.stringify({ html: '<div>a</div>', css: '', js: '' }))!
    const doc = buildHtmlSandboxSrcdoc(spec, { designTokens: { '--dsl-g-accent': '#22c55e' } })
    expect(doc).toContain('--dsl-g-accent: #22c55e')
    expect(doc).toContain('Content-Security-Policy')
    expect(doc).toContain('iui-sandbox-card')
    for (const host of HTML_SANDBOX_CDN_ALLOWLIST) {
      expect(doc).toContain(host)
    }
    // allowlist hosts (incl. unpkg) must appear in CSP
  })

  it('injects resize/action bridge with frameId', () => {
    const spec = parseHtmlSandboxFence(JSON.stringify({ html: '<button data-iui-action="ping">Go</button>', css: '', js: '' }))!
    const doc = buildHtmlSandboxSrcdoc(spec, { frameId: 'frame-42' })
    expect(doc).toContain('frame-42')
    expect(doc).toContain("type: 'resize'")
    expect(doc).toContain('iuiSandbox')
    expect(doc).toContain('data-iui-action')
  })

  it('type-guards host messages', () => {
    expect(isIuiSandboxHostMessage({ source: 'iui-html', type: 'resize', frameId: 'a', height: 200 })).toBe(true)
    expect(isIuiSandboxHostMessage({ source: 'iui-html', type: 'action', frameId: 'a', action: 'go', payload: { x: 1 } })).toBe(true)
    expect(isIuiSandboxHostMessage({ source: 'other', type: 'resize', frameId: 'a', height: 200 })).toBe(false)
    expect(isIuiSandboxHostMessage({ source: 'iui-html', type: 'resize', frameId: 'a', height: NaN })).toBe(false)
  })

  it('caps oversized author CSS/JS in srcdoc', () => {
    const huge = 'x'.repeat(120_000)
    const spec = parseHtmlSandboxFence(JSON.stringify({ html: '<div>ok</div>', css: huge, js: huge }))!
    const doc = buildHtmlSandboxSrcdoc(spec, { frameId: 'cap' })
    expect(doc).toContain('/* css truncated */')
    expect(doc).toContain('/* js truncated */')
    expect(doc.length).toBeLessThan(200_000)
  })
})

describe('sandbox host messages + CSP', () => {
  it('accepts ready and error envelopes', () => {
    expect(isIuiSandboxHostMessage({ source: 'iui-html', type: 'ready', frameId: 'f1' })).toBe(true)
    expect(isIuiSandboxHostMessage({ source: 'iui-html', type: 'error', frameId: 'f1', message: 'boom' })).toBe(true)
    expect(isIuiSandboxHostMessage({ source: 'iui-html', type: 'error', frameId: 'f1' })).toBe(false)
  })

  it('includes hardened CSP directives', () => {
    const spec = parseHtmlSandboxFence(JSON.stringify({ html: '<div>a</div>', css: '', js: '' }))!
    const doc = buildHtmlSandboxSrcdoc(spec, { frameId: 'abc' })
    expect(doc).toContain("base-uri 'none'")
    expect(doc).toContain("base-uri 'none'")
    expect(doc).toContain('type: \'ready\'')
  })
})

describe('sandbox product helpers', () => {
  it('detects empty specs', () => {
    const empty = parseHtmlSandboxFence(JSON.stringify({ html: '', css: '', js: '' }))
    // parse returns null when all empty JSON
    expect(empty).toBeNull()
    const partial = parseHtmlSandboxFence('{"html":"","css":"","js":"x"')
    expect(partial).not.toBeNull()
    expect(isSandboxSpecEmpty(partial!)).toBe(false)
    const bare = parseHtmlSandboxFence(JSON.stringify({ html: '<p></p>', css: '', js: '' }))!
    expect(isSandboxSpecEmpty(bare)).toBe(false)
    // Whitespace-only body is treated as empty content by the parser (null).
    expect(parseHtmlSandboxFence(JSON.stringify({ html: '   ', css: '', js: '' }))).toBeNull()
    const sectionEmpty = parseHtmlSandboxFence('css\n\nhtml\n\njs\n')
    expect(sectionEmpty).toBeNull()
  })

  it('guards host→sandbox commands', () => {
    expect(isIuiSandboxFrameCommand({ source: 'iui-html-host', type: 'measure', frameId: 'f' })).toBe(true)
    expect(isIuiSandboxFrameCommand({ source: 'iui-html', type: 'measure', frameId: 'f' })).toBe(false)
  })

  it('builds downloadable html', () => {
    const spec = parseHtmlSandboxFence(JSON.stringify({ html: '<div>dl</div>', css: '', js: '' }))!
    const doc = buildSandboxDownloadHtml(spec, { designTokens: { '--dsl-g-accent': '#111' } })
    expect(doc).toContain('<div>dl</div>')
    expect(doc).toContain('--dsl-g-accent: #111')
  })

  it('bridge listens for host measure', () => {
    const spec = parseHtmlSandboxFence(JSON.stringify({ html: '<div>a</div>', css: '', js: '' }))!
    const doc = buildHtmlSandboxSrcdoc(spec, { frameId: 'm1' })
    expect(doc).toContain('iui-html-host')
    expect(doc).toContain("type === 'measure'")
  })
})

describe('sandbox starters + host commands', () => {
  it('lists neutral Chinese starters', async () => {
    const { listHtmlSandboxStarters, starterToFenceBody, getHtmlSandboxStarter } = await import('../src/shared/html-sandbox.ts')
    const list = listHtmlSandboxStarters()
    expect(list.length).toBeGreaterThanOrEqual(3)
    expect(list.map((s) => s.id)).toEqual(expect.arrayContaining(['counter', 'kpi-grid', 'mini-form']))
    const counter = getHtmlSandboxStarter('counter')!
    const body = starterToFenceBody(counter)
    expect(body).toContain('"title"')
    expect(body).toContain('计数器')
    expect(JSON.parse(body).html).toContain('iui-sandbox-card')
  })

  it('accepts theme + bindings host commands', async () => {
    const { isIuiSandboxFrameCommand, buildHtmlSandboxSrcdoc, getHtmlSandboxStarter } = await import('../src/shared/html-sandbox.ts')
    expect(isIuiSandboxFrameCommand({ source: 'iui-html-host', type: 'theme', frameId: 'f', tokens: { '--x': '1' } })).toBe(true)
    expect(isIuiSandboxFrameCommand({ source: 'iui-html-host', type: 'bindings', frameId: 'f', values: { cpu: '1%' } })).toBe(true)
    expect(isIuiSandboxFrameCommand({ source: 'iui-html-host', type: 'bindings', frameId: 'f', values: [] as unknown as Record<string, string> })).toBe(false)
    const doc = buildHtmlSandboxSrcdoc(getHtmlSandboxStarter('kpi-grid')!.spec, { frameId: 'f1' })
    expect(doc).toContain('data.type === \'bindings\'')
    expect(doc).toContain('data-iui-bind')
  })
})

describe('sandbox product depth (.36)', () => {
  it('ships product starters including todo/spark/links', async () => {
    const { listHtmlSandboxStarters, getHtmlSandboxStarter, HTML_SANDBOX_CDN_ALLOWLIST, isIuiSandboxFrameCommand } = await import('../src/shared/html-sandbox.ts')
    const ids = listHtmlSandboxStarters().map((s) => s.id)
    expect(ids).toEqual(expect.arrayContaining(['counter', 'kpi-grid', 'mini-form', 'todo', 'spark', 'links']))
    expect(getHtmlSandboxStarter('todo')?.title).toBe('待办清单')
    expect([...HTML_SANDBOX_CDN_ALLOWLIST]).toEqual(expect.arrayContaining(['unpkg.com', 'cdn.skypack.dev']))
    expect(isIuiSandboxFrameCommand({ source: 'iui-html-host', type: 'appData', frameId: 'f', data: { cpu: 1 } })).toBe(true)
  })
})

describe('sandbox deepen (.43)', () => {
  it('base CSS uses shared catalog density tokens', async () => {
    const { buildSandboxBaseCss } = await import('../src/shared/html-sandbox.ts')
    const { IUI_TOKEN_CATALOG } = await import('../src/themes/tokens.ts')
    const css = buildSandboxBaseCss('sandbox')
    expect(css).toContain(IUI_TOKEN_CATALOG.density.gap)
    expect(css).toContain('--iui-pack-control-h')
    expect(css).toContain('#18181b')
  })

  it('mergeSandboxDesignTokens lets host override brand', async () => {
    const { mergeSandboxDesignTokens } = await import('../src/shared/html-sandbox.ts')
    const { IUI_TOKEN_CATALOG } = await import('../src/themes/tokens.ts')
    const merged = mergeSandboxDesignTokens({ '--dsl-g-accent': '#ff00aa' }, 'antd')
    expect(merged['--dsl-g-accent']).toBe('#ff00aa')
    expect(merged['--iui-pack-gap']).toBe(IUI_TOKEN_CATALOG.density.gap)
  })

  it('lists deepened starters including compare/tabs/echarts/form-bridge', async () => {
    const { listHtmlSandboxStarters } = await import('../src/shared/html-sandbox.ts')
    const ids = listHtmlSandboxStarters().map((s) => s.id)
    expect(ids).toEqual(expect.arrayContaining([
      'compare-cards', 'tabs-panel', 'echarts-mini', 'form-bridge', 'leaflet-map',
    ]))
  })

  it('srcdoc merges pack tokens and exposes form bridge helpers', async () => {
    const { buildHtmlSandboxSrcdoc, parseHtmlSandboxFence } = await import('../src/shared/html-sandbox.ts')
    const spec = parseHtmlSandboxFence(JSON.stringify({
      html: '<form data-iui-form="x"><input name="a"/></form>',
      css: '',
      js: '',
    }))!
    const doc = buildHtmlSandboxSrcdoc(spec, { brandId: 'sandbox' })
    expect(doc).toContain('--iui-pack-accent')
    expect(doc).toContain('submitForm')
    expect(doc).toContain('data-iui-form')
    expect(doc).toContain('#18181b')
  })
})

describe('sandbox design-system deepen (.45)', () => {
  it('base CSS is surface-token driven and ships ds kit classes', async () => {
    const { buildSandboxBaseCss, listHtmlSandboxStarters, buildHtmlSandboxSrcdoc, getHtmlSandboxStarter } = await import('../src/shared/html-sandbox.ts')
    const css = buildSandboxBaseCss('sandbox')
    expect(css).toContain('--iui-pack-surface')
    expect(css).toContain('--iui-pack-hero-from')
    expect(css).toContain('.iui-sandbox-badge')
    expect(css).toContain('.iui-sandbox-alert')
    expect(css).toContain('.iui-sandbox-field')
    expect(css).toContain('.iui-sandbox-hero')
    expect(css).toContain('prefers-color-scheme:dark')
    // no orphan hardcoded body ink — uses vars
    expect(css).toContain('color:var(--iui-pack-fg')
    const ids = listHtmlSandboxStarters().map((s) => s.id)
    expect(ids).toContain('ds-kit')
    const doc = buildHtmlSandboxSrcdoc(getHtmlSandboxStarter('ds-kit')!.spec, { brandId: 'sandbox' })
    expect(doc).toContain('iui-sandbox-badge')
    expect(doc).toContain('#18181b')
  })
})


describe('sandbox bridge P2', () => {
  it('type-guards sendPrompt and openLink', async () => {
    const { isIuiSandboxHostMessage, isAllowedSandboxOpenUrl } = await import('../src/shared/html-sandbox.ts')
    expect(isIuiSandboxHostMessage({ source: 'iui-html', type: 'sendPrompt', frameId: 'f', text: 'hi' })).toBe(true)
    expect(isIuiSandboxHostMessage({ source: 'iui-html', type: 'sendPrompt', frameId: 'f', text: '' })).toBe(false)
    expect(isIuiSandboxHostMessage({ source: 'iui-html', type: 'openLink', frameId: 'f', url: 'https://example.com' })).toBe(true)
    expect(isAllowedSandboxOpenUrl('https://example.com/x')).toBe(true)
    expect(isAllowedSandboxOpenUrl('http://example.com')).toBe(false)
    expect(isAllowedSandboxOpenUrl('javascript:alert(1)')).toBe(false)
  })
})


describe('map tile guard', () => {
  it('rewrites blocked OSM.org tile URLs to CartoCDN', async () => {
    const { rewriteBlockedMapTileUrls, buildHtmlSandboxSrcdoc, parseHtmlSandboxFence, IUI_DEFAULT_MAP_TILE_URL } = await import('../src/shared/html-sandbox.ts')
    const rewritten = rewriteBlockedMapTileUrls(
      "L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19}).addTo(map)",
    )
    expect(rewritten).toContain('server.arcgisonline.com')
    expect(rewritten).not.toContain('tile.openstreetmap.org')
    expect(IUI_DEFAULT_MAP_TILE_URL).toContain('server.arcgisonline.com')

    const fence = JSON.stringify({
      title: 'map',
      height: 320,
      css: '',
      html: '<div id="map" style="height:280px"></div>',
      js: "var map=L.map('map').setView([48.8,2.3],5);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19}).addTo(map);",
    })
    const spec = parseHtmlSandboxFence(fence)
    const doc = buildHtmlSandboxSrcdoc(spec, { frameId: 'map-guard' })
    expect(doc).toContain('server.arcgisonline.com')
    expect(doc).toContain('__iuiTileGuard')
    expect(doc).toContain('iuiDefaultTileLayer')
    // Author OSM URL should be rewritten in srcdoc body
    expect(doc).not.toMatch(/L\.tileLayer\(['"]https:\/\/\{s\}\.tile\.openstreetmap\.org/)
  })
})


describe('html-sandbox production harden (P1-3/5/6)', () => {
  it('strips inline script bodies', () => {
    const clean = sanitizeSandboxMarkup('<div></div><script>window.iuiSandbox.sendPrompt("x")</script>')
    expect(clean).toContain('blocked inline script')
    expect(clean).not.toContain('sendPrompt')
  })

  it('keeps allowlisted external script src', () => {
    const clean = sanitizeSandboxMarkup('<script src="https://cdn.jsdelivr.net/npm/x"></script>')
    expect(clean).toContain('cdn.jsdelivr.net')
    expect(clean).not.toContain('blocked')
  })

  it('truncates oversized HTML and shows banner', () => {
    const huge = '<div>' + 'x'.repeat(HTML_SANDBOX_MAX_HTML_BYTES + 100) + '</div>'
    const spec = parseHtmlSandboxFence(JSON.stringify({ html: huge, css: '', js: '1' }))!
    const doc = buildHtmlSandboxSrcdoc(spec, { frameId: 'cap-html' })
    expect(doc).toContain('html truncated')
    expect(doc).toContain('data-iui-error')
    expect(doc).toContain('资源过大已截断')
  })

  it('defers author JS when deferAuthorJs / jsComplete=false', () => {
    const spec = parseHtmlSandboxFence(JSON.stringify({
      html: '<div id="n">0</div>',
      css: '',
      js: 'document.getElementById("n").textContent="1"',
    }))!
    const preview = buildHtmlSandboxSrcdoc({ ...spec, partial: true, jsComplete: false }, {
      frameId: 'prev',
      deferAuthorJs: true,
    })
    expect(preview).not.toContain('textContent="1"')
    const finalDoc = buildHtmlSandboxSrcdoc({ ...spec, partial: false, jsComplete: true }, {
      frameId: 'fin',
      deferAuthorJs: false,
    })
    expect(finalDoc).toContain('textContent="1"')
  })
})
