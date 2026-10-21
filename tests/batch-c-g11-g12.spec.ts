import { describe, expect, it } from 'vitest'
import {
  buildSandboxBridgeScript,
  isIuiSandboxFrameCommand,
  isIuiSandboxHostMessage,
} from '../src/shared/html-sandbox.ts'
import {
  isBlockedHostname,
  isPrivateAddress,
  parseProxyTarget,
  allowedProxyContentType,
  serveResourceProxy,
  PROXY_MAX_BYTES,
} from '../src/plugin/resource-proxy.ts'
import {
  CAPTURE_MAX_BYTES,
  CAPTURE_MAX_FETCHES,
  chargeCaptureBytes,
  dataUrlToBlob,
  fetchCaptureResource,
  imageFileName,
  isCapturableUrl,
  openCaptureBudget,
  proxyUrlFor,
  takeCaptureFetch,
} from '../src/client/image-export.ts'
import { GENUI_SECTION_TEXT } from '../src/plugin/section-text.ts'

describe('G11 send-summary bridge', () => {
  const bridge = buildSandboxBridgeScript('g11')
  it('ships the summary builder, click hook and API', () => {
    expect(bridge).toContain('function __iuiBuildSummary(')
    expect(bridge).toContain("data-iui-send") 
    expect(bridge).toContain('sendSummary')
    expect(bridge).toContain('summary: true')
  })
  it('accepts sendPrompt with a summary flag', () => {
    expect(isIuiSandboxHostMessage({ source: 'iui-html', type: 'sendPrompt', frameId: 'f', text: '口味：微辣', summary: true })).toBe(true)
  })
  it('teaches the summary button in the prompt', () => {
    expect(GENUI_SECTION_TEXT).toContain('data-iui-send=\\"summary\\"'.replace(/\\/g, ''))
  })
})

describe('G12 image export messages', () => {
  it('validates image / fetchResource / requestImage', () => {
    expect(isIuiSandboxHostMessage({ source: 'iui-html', type: 'image', frameId: 'f', dataUrl: 'data:image/png;base64,AAAA', width: 2, height: 2, failed: 0 })).toBe(true)
    expect(isIuiSandboxHostMessage({ source: 'iui-html', type: 'image', frameId: 'f', dataUrl: '', reason: 'tainted' })).toBe(true)
    expect(isIuiSandboxHostMessage({ source: 'iui-html', type: 'image', frameId: 'f', dataUrl: 'data:text/html,<b>' })).toBe(false)
    expect(isIuiSandboxHostMessage({ source: 'iui-html', type: 'fetchResource', frameId: 'f', url: 'https://a.example/x.png', as: 'dataUrl', reqId: 'r1' })).toBe(true)
    expect(isIuiSandboxHostMessage({ source: 'iui-html', type: 'fetchResource', frameId: 'f', url: 'file:///etc/passwd', as: 'dataUrl', reqId: 'r1' })).toBe(false)
    expect(isIuiSandboxHostMessage({ source: 'iui-html', type: 'fetchResource', frameId: 'f', url: 'https://a.example/x', as: 'json', reqId: 'r1' })).toBe(false)
    expect(isIuiSandboxFrameCommand({ source: 'iui-html-host', type: 'requestImage', frameId: 'f', background: '#fff' })).toBe(true)
    expect(isIuiSandboxFrameCommand({ source: 'iui-html-host', type: 'requestImage', frameId: 'f', background: 'x'.repeat(200) })).toBe(false)
  })
  it('bridge rasterises through host fetches', () => {
    const bridge = buildSandboxBridgeScript('g12')
    expect(bridge).toContain('function __iuiCaptureImage(')
    expect(bridge).toContain("type: 'fetchResource'")
    expect(bridge).toContain("data.type === 'requestImage'")
    expect(bridge).toContain('foreignObject')
  })
})

describe('G12 resource proxy guards', () => {
  it('blocks private / local hosts', () => {
    for (const h of ['localhost', 'a.localhost', '127.0.0.1', '10.1.2.3', '172.20.0.1', '192.168.1.1', '169.254.169.254', '[::1]', 'printer.local', 'intranet', '0.0.0.0', '100.64.0.1']) {
      expect(isBlockedHostname(h)).toBe(true)
    }
    expect(isBlockedHostname('images.unsplash.com')).toBe(false)
    expect(isBlockedHostname('8.8.8.8')).toBe(false)
    expect(isPrivateAddress('::ffff:127.0.0.1')).toBe(true)
    expect(isPrivateAddress('fd00::1')).toBe(true)
    expect(isPrivateAddress('2606:4700::1111')).toBe(false)
  })
  it('parses only public http(s) targets', () => {
    expect(parseProxyTarget('ftp://x.example/a')).toBe('bad-scheme')
    expect(parseProxyTarget('https://u:p@x.example/a')).toBe('bad-url')
    expect(parseProxyTarget('http://127.0.0.1/a')).toBe('blocked-host')
    expect(parseProxyTarget(null)).toBe('bad-url')
    expect(parseProxyTarget('https://x.example/a.png')).toBeInstanceOf(URL)
  })
  it('allows images and css only', () => {
    expect(allowedProxyContentType('image/png')).toBe('image/png')
    expect(allowedProxyContentType('text/css; charset=utf-8')).toBe('text/css; charset=utf-8')
    expect(allowedProxyContentType('text/html')).toBeNull()
    expect(allowedProxyContentType('application/javascript')).toBeNull()
  })

  type Captured = { status: number; headers: Record<string, string>; body: Buffer }
  const run = async (u: string, fetchImpl: typeof fetch, resolve = async () => ['93.184.216.34']): Promise<Captured> => {
    const out: Captured = { status: 0, headers: {}, body: Buffer.alloc(0) }
    const res = {
      writeHead(status: number, headers: Record<string, string> = {}) { out.status = status; out.headers = headers; return res },
      write(chunk: Buffer | string) { out.body = Buffer.concat([out.body, Buffer.from(chunk)]); return true },
      end(chunk?: Buffer | string) { if (chunk) out.body = Buffer.concat([out.body, Buffer.from(chunk)]) },
    }
    await serveResourceProxy({ method: 'GET', url: `/proxy?u=${encodeURIComponent(u)}` } as never, res as never, { fetch: fetchImpl, resolve })
    return out
  }
  it('serves a public image with locked-down headers', async () => {
    const r = await run('https://img.example.com/a.png', (async () => new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/png' } })) as never)
    expect(r.status).toBe(200)
    expect(r.body.length).toBe(3)
    expect(r.headers['access-control-allow-origin']).toBe('*')
    expect(r.headers['x-content-type-options']).toBe('nosniff')
    expect(r.headers['content-security-policy']).toContain('sandbox')
  })
  it('rejects html, private DNS answers, private redirects and oversize bodies', async () => {
    expect((await run('https://img.example.com/a', (async () => new Response('<b>', { headers: { 'content-type': 'text/html' } })) as never)).status).toBe(415)
    expect((await run('https://img.example.com/a.png', (async () => new Response('x')) as never, async () => ['10.0.0.5'])).status).toBe(403)
    const redirect = (async () => new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest' } })) as never
    expect((await run('https://img.example.com/a.png', redirect)).status).toBe(403)
    const big = (async () => new Response(new Uint8Array(PROXY_MAX_BYTES + 10), { headers: { 'content-type': 'image/png' } })) as never
    expect((await run('https://img.example.com/a.png', big)).status).toBe(413)
    expect((await run('http://localhost:3000/a.png', redirect)).status).toBe(400)
  })
})

describe('G12 host capture helpers', () => {
  it('bounds the capture window, count and bytes', () => {
    expect(takeCaptureFetch(null)).toBe(false)
    const b = openCaptureBudget(1000)
    expect(takeCaptureFetch(b, 1001)).toBe(true)
    expect(takeCaptureFetch(b, 1000 + 31_000)).toBe(false)
    b.fetches = CAPTURE_MAX_FETCHES
    expect(takeCaptureFetch(b, 1001)).toBe(false)
    expect(chargeCaptureBytes(b, CAPTURE_MAX_BYTES - 1)).toBe(true)
    expect(chargeCaptureBytes(b, 2)).toBe(false)
  })
  it('builds proxy urls and file names', () => {
    expect(isCapturableUrl('https://a.example/x.png')).toBe(true)
    expect(isCapturableUrl('javascript:alert(1)')).toBe(false)
    expect(proxyUrlFor('https://h.example/assets/', 'https://a.example/x.png?y=1')).toBe('https://h.example/assets/proxy?u=https%3A%2F%2Fa.example%2Fx.png%3Fy%3D1')
    expect(proxyUrlFor(undefined, 'https://a.example/x.png')).toBeNull()
    expect(proxyUrlFor('https://h.example/assets', 'blob:null/abc')).toBeNull()
    expect(imageFileName('周末 菜单/1')).toBe('周末_菜单_1.png')
    expect(imageFileName(undefined)).toBe('iui-page.png')
  })
  it('decodes data URLs to blobs', async () => {
    const blob = dataUrlToBlob('data:image/png;base64,AQID')
    expect(blob?.type).toBe('image/png')
    expect(blob?.size).toBe(3)
    expect(dataUrlToBlob('nope')).toBeNull()
  })
  it('falls back to the proxy when the direct fetch fails', async () => {
    const seen: string[] = []
    const fetchImpl = async (url: string): Promise<Response> => {
      seen.push(url)
      if (!url.includes('/proxy?u=')) throw new TypeError('cors')
      return new Response(new Uint8Array([137, 80, 78, 71]), { headers: { 'content-type': 'image/png' } })
    }
    const got = await fetchCaptureResource('https://a.example/x.png', 'dataUrl', { proxyBase: 'https://h.example/assets', fetchImpl })
    expect(seen).toHaveLength(2)
    expect(got?.data.startsWith('data:image/png')).toBe(true)
    expect(got?.bytes).toBe(4)
    const css = await fetchCaptureResource('https://a.example/x.css', 'text', {
      fetchImpl: async () => new Response('a{b:c}', { headers: { 'content-type': 'text/css' } }),
    })
    expect(css?.data).toBe('a{b:c}')
    const html = await fetchCaptureResource('https://a.example/x.png', 'dataUrl', {
      fetchImpl: async () => new Response('<b>', { headers: { 'content-type': 'text/html' } }),
    })
    expect(html).toBeNull()
  })
})
