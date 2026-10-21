// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  SANDBOX_DOWNLOAD_MAX_BYTES,
  createDownloadLimiter,
  hostCopy,
  hostDownload,
  safeDownloadMime,
  sanitizeDownloadName,
} from '../src/client/sandbox-delegate.ts'
import { buildHtmlSandboxSrcdoc, isIuiSandboxFrameCommand, isIuiSandboxHostMessage, parseHtmlSandboxFence } from '../src/shared/html-sandbox.ts'
import { GENUI_SECTION_TEXT } from '../src/plugin/section-text.ts'

function setActivation(isActive: boolean | undefined): void {
  Object.defineProperty(navigator, 'userActivation', { configurable: true, value: isActive === undefined ? undefined : { isActive } })
}

describe('F18 host download / copy', () => {
  afterEach(() => { setActivation(undefined); vi.restoreAllMocks() })

  it('sanitizes file names and refuses executables', () => {
    expect(sanitizeDownloadName('../../etc/passwd')).toBe('passwd')
    expect(sanitizeDownloadName('C:\\Users\\a\\报表.csv')).toBe('报表.csv')
    expect(sanitizeDownloadName('  .hidden')).toBe('hidden')
    expect(sanitizeDownloadName('')).toBe('download')
    expect(sanitizeDownloadName('a\u202Etxt.exe')).toBeNull()
    expect(sanitizeDownloadName('setup.EXE')).toBeNull()
    expect(sanitizeDownloadName('report.pdf.bat')).toBeNull()
    expect(sanitizeDownloadName('x'.repeat(300) + '.json')!.length).toBe(120)
    expect(sanitizeDownloadName('x'.repeat(300) + '.json')!.endsWith('.json')).toBe(true)
  })

  it('keeps simple mime types only', () => {
    expect(safeDownloadMime('text/csv;charset=utf-8')).toBe('text/csv;charset=utf-8')
    expect(safeDownloadMime('application/json')).toBe('application/json')
    expect(safeDownloadMime('text/html"><x')).toBe('application/octet-stream')
  })

  it('limits bursts per frame', () => {
    let t = 0
    const allow = createDownloadLimiter(() => t)
    expect([allow(), allow(), allow(), allow()]).toEqual([true, true, true, false])
    t = 11_000
    expect(allow()).toBe(true)
  })

  it('needs a gesture, a safe name and ≤10 MB', () => {
    const create = vi.fn(() => 'blob:x')
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: vi.fn() })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    setActivation(false)
    expect(hostDownload('a.txt', 'x', 'text/plain', () => true)).toBe('gesture')
    setActivation(true)
    expect(hostDownload('a.exe', 'x', 'text/plain', () => true)).toBe('blocked')
    expect(hostDownload('a.bin', new ArrayBuffer(SANDBOX_DOWNLOAD_MAX_BYTES + 1), '', () => true)).toBe('tooLarge')
    expect(hostDownload('a.txt', 'x', 'text/plain', () => false)).toBe('rate')
    expect(hostDownload('a.txt', 'x', 'text/plain', () => true)).toBe('ok')
    expect(create).toHaveBeenCalledTimes(1)
    expect(click).toHaveBeenCalledTimes(1)
  })

  it('copy needs a gesture and reports failure', async () => {
    setActivation(false)
    expect(await hostCopy('x')).toBe('gesture')
    setActivation(true)
    const writeText = vi.fn(() => Promise.resolve())
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    expect(await hostCopy('hello')).toBe('ok')
    expect(writeText).toHaveBeenCalledWith('hello')
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new Error('denied')) } })
    Object.assign(document, { execCommand: () => false })
    expect(await hostCopy('hello')).toBe('failed')
  })
})

describe('F18 messages + bridge', () => {
  it('validates download / copy / hostResult messages', () => {
    const base = { source: 'iui-html', frameId: 'f' }
    expect(isIuiSandboxHostMessage({ ...base, type: 'download', filename: 'a.csv', mime: 'text/csv', data: 'a,b', reqId: 'q1' })).toBe(true)
    expect(isIuiSandboxHostMessage({ ...base, type: 'download', filename: 'a.bin', mime: '', data: new ArrayBuffer(4) })).toBe(true)
    expect(isIuiSandboxHostMessage({ ...base, type: 'download', filename: 'a.bin', mime: '', data: { x: 1 } })).toBe(false)
    expect(isIuiSandboxHostMessage({ ...base, type: 'copyText', text: 'x', reqId: 'q'.repeat(41) })).toBe(false)
    expect(isIuiSandboxFrameCommand({ source: 'iui-html-host', frameId: 'f', type: 'hostResult', reqId: 'q1', ok: false, reason: 'gesture' })).toBe(true)
    expect(isIuiSandboxFrameCommand({ source: 'iui-html-host', frameId: 'f', type: 'hostResult', ok: true })).toBe(false)
  })

  it('bridge exposes download/copy and intercepts forms + download links', () => {
    const doc = buildHtmlSandboxSrcdoc(parseHtmlSandboxFence(JSON.stringify({ html: '<p>x</p>', css: '', js: '' }))!, { frameId: 'f18' })
    expect(doc).toContain('download: function (filename, content, mime)')
    expect(doc).toContain('copy: function (text)')
    expect(doc).toContain("new CustomEvent('iui:submit'")
    expect(doc).toContain('HTMLFormElement.prototype')
    expect(doc).toContain('HTMLAnchorElement.prototype.click')
    expect(doc).toContain('URL.createObjectURL = function')
    expect(doc).toContain('/^data:([^,]*),([\\s\\S]*)$/i')
    const scripts = [...doc.matchAll(/<script(?![^>]*type="(?:importmap|module)")[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]!)
    for (const src of scripts) expect(() => new Function(src)).not.toThrow()
  })

  it('prompt + SKILL document the capability table', () => {
    expect(GENUI_SECTION_TEXT).toContain('iuiSandbox.download(')
    expect(GENUI_SECTION_TEXT).toContain('Forms never navigate')
    const skill = readFileSync(join(__dirname, '..', 'SKILL.md'), 'utf8')
    expect(skill).toContain('沙箱能力表')
    expect(skill).toContain('iui:submit')
  })
})
