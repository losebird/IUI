// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { needsBodyPortal } from '../src/client/html-fence'
import { buildSandboxBridgeScript, isIuiSandboxHostMessage } from '../src/shared/html-sandbox'
import { EN } from '../src/client/i18n/en'
import { ZH } from '../src/client/i18n/zh'

describe('F11 fullscreen', () => {
  it('detects ancestors that trap position:fixed', () => {
    const outer = document.createElement('div')
    const inner = document.createElement('div')
    outer.appendChild(inner)
    document.body.appendChild(outer)
    expect(needsBodyPortal(inner)).toBe(false)
    outer.style.transform = 'translateZ(0)'
    expect(needsBodyPortal(inner)).toBe(true)
    outer.style.transform = ''
    outer.style.filter = 'blur(1px)'
    expect(needsBodyPortal(inner)).toBe(true)
    outer.remove()
  })

  it('bridge forwards Escape; host accepts the message', () => {
    expect(buildSandboxBridgeScript('f')).toContain("post({ type: 'escape' })")
    expect(isIuiSandboxHostMessage({ source: 'iui-html', type: 'escape', frameId: 'f' })).toBe(true)
  })

  it('uses the Fullscreen API, locks scroll, returns focus', () => {
    const src = readFileSync(resolve(__dirname, '../src/client/html-fence.tsx'), 'utf8')
    expect(src).toContain('requestFullscreen')
    expect(src).toContain('fullscreenchange')
    expect(src).toContain("root.style.overflow = 'hidden'")
    expect(src).toContain('focus({ preventScroll: true })')
    expect(src).toContain('createPortal(content, document.body)')
  })
})

describe('D9 toolbar / D13 copy', () => {
  it('toolbar keeps only fullscreen + ⋯; rerun lives in the error strip', () => {
    const src = readFileSync(resolve(__dirname, '../src/client/html-fence.tsx'), 'utf8')
    const toolbar = src.slice(src.indexOf('const toolbar = ('), src.indexOf('const shellStyle'))
    expect(toolbar).toContain('aria-haspopup="menu"')
    expect(toolbar).not.toContain('rerunAuthorJsOnly')
    expect(src).toContain("label: t('sandbox.rerunAuthorJs'), onClick: () => rerunAuthorJsOnly()")
  })

  it('says 页面脚本, never 模型作者 JS', () => {
    for (const v of Object.values(ZH)) expect(String(v)).not.toMatch(/模型作者|作者 JS/)
    for (const v of Object.values(EN)) expect(String(v)).not.toMatch(/author JS/i)
    const rt = readFileSync(resolve(__dirname, '../src/shared/author-js-runtime.ts'), 'utf8')
    expect(rt).not.toMatch(/'[^']*模型作者[^']*'/)
    expect(rt).toContain('重跑页面脚本')
  })
})
