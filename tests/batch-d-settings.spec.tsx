// @vitest-environment jsdom
// Batch D (第四轮 S1–S12): settings / theming follow-ups.
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HtmlSandboxFrame } from '../src/client/html-fence.tsx'
import { resetFrameActivityForTests } from '../src/client/frame-activity.ts'
import { hostColorScheme, subscribeHostScheme } from '../src/client/theme/apply-theme.ts'
import { readFileSync } from 'node:fs'
import { fireEvent, screen } from '@testing-library/react'
import { Config } from '../src/plugin/config-schema.ts'
import { HIDDEN_SETTINGS_FIELDS, SETTINGS_FIELD_NAMES } from '../src/config/settings-fields.ts'
import { checkCustomTokensJson } from '../src/client/settings/custom-tokens.ts'
import { isValidCdnTemplate, repairCounts, settingsPrimitivesAvailable } from '../src/client/settings/IuiSettingsSection.tsx'
import { deleteUserTemplate, getUserTemplates, replaceUserTemplates, saveUserTemplateFromPage } from '../src/client/user-template-store.ts'
import { TemplateDrawer } from '../src/client/TemplateDrawer.tsx'
import { genuiTemplates } from '../src/client/templates.ts'
import { RUNTIME_CONFIG_FALLBACK_MS, startRuntimeConfigWatch } from '../src/client/runtime-config.ts'

beforeEach(() => { resetFrameActivityForTests(); localStorage.clear() })
afterEach(() => {
  cleanup()
  localStorage.clear()
  document.body.removeAttribute('data-ds-dark-theme')
  document.body.style.removeProperty('--dsw-alias-bg-base')
})

describe('S2 host colour scheme', () => {
  it('detects dark / light / unknown host and notifies on change', async () => {
    expect(hostColorScheme()).toBeNull()
    document.body.style.setProperty('--dsw-alias-bg-base', '#fff')
    expect(hostColorScheme()).toBe('light')
    const fn = vi.fn()
    const off = subscribeHostScheme(fn)
    document.body.setAttribute('data-ds-dark-theme', '')
    await new Promise((r) => setTimeout(r, 0))
    expect(fn).toHaveBeenCalledTimes(1)
    expect(hostColorScheme()).toBe('dark')
    off()
  })

  it('an "auto" page follows the host theme (srcdoc + live appearance command)', async () => {
    document.body.setAttribute('data-ds-dark-theme', '')
    const raw = JSON.stringify({ title: 's2', css: '', html: '<p>hi</p>', js: '' })
    const view = render(<HtmlSandboxFrame raw={raw} />)
    const frame = view.container.querySelector('iframe')!
    expect(frame.getAttribute('srcdoc')).toContain('data-iui-scheme="dark"')
    const id = (frame.getAttribute('srcdoc') ?? '').match(/var FRAME_ID = "([^"]+)"/)?.[1] ?? ''
    const sent: Array<Record<string, unknown>> = []
    vi.spyOn(frame.contentWindow!, 'postMessage').mockImplementation(((m: Record<string, unknown>) => { sent.push(m) }) as never)
    await act(async () => {
      window.dispatchEvent(new MessageEvent('message', { source: frame.contentWindow, data: { source: 'iui-html', type: 'ready', frameId: id } }))
    })
    await act(async () => {
      document.body.removeAttribute('data-ds-dark-theme')
      document.body.style.setProperty('--dsw-alias-bg-base', '#fff')
      await new Promise((r) => setTimeout(r, 0))
    })
    expect(sent.filter((m) => m.type === 'appearance').at(-1)).toMatchObject({ scheme: 'light' })
  })
})

describe('S5 settings field registry', () => {
  it('covers every config-schema key (visible + hidden)', () => {
    const schemaKeys = Object.keys((Config as unknown as { dict: Record<string, unknown> }).dict).sort()
    expect([...SETTINGS_FIELD_NAMES, ...HIDDEN_SETTINGS_FIELDS].sort()).toEqual(schemaKeys)
  })

  it('feature-detects host settings primitives (jsdom stubs → boolean)', () => {
    expect(typeof settingsPrimitivesAvailable()).toBe('boolean')
  })
})

describe('S7 custom tokens / S3 CDN template validation', () => {
  it('flags unknown tokens and rejects unsafe values', () => {
    expect(checkCustomTokensJson('').error).toBeNull()
    expect(checkCustomTokensJson('{').error).toBe('json')
    expect(checkCustomTokensJson('[1]').error).toBe('shape')
    const r = checkCustomTokensJson(JSON.stringify({
      '--color-text-primary': '#111',
      '--my-brand': 'red',
      '--evil': 'red; } body { display:none',
      '--bg': 'url(https://x/y.png)',
      color: 'red',
    }))
    expect(r.tokens).toEqual({ '--color-text-primary': '#111', '--my-brand': 'red' })
    expect(r.unknown).toEqual(['--my-brand'])
    expect(r.rejected.sort()).toEqual(['--bg', '--evil', 'color'])
  })

  it('cdnTemplate needs https + {name} + {file}', () => {
    expect(isValidCdnTemplate('')).toBe(true)
    expect(isValidCdnTemplate('https://cdn.example.com/npm/{name}@{version}/{file}')).toBe(true)
    expect(isValidCdnTemplate('http://cdn.example.com/{name}/{file}')).toBe(false)
    expect(isValidCdnTemplate('https://cdn.example.com/{name}')).toBe(false)
  })
})

describe('S8 repair statistics / debug dump', () => {
  it('sums repair + format steers from fence-ops byKind', () => {
    expect(repairCounts(undefined)).toEqual({ repairs: 0, formats: 0 })
    expect(repairCounts({ render_steer: 2, delivery_steer: 1, format_steer: 3, json_masquerade: 1, other: 9 })).toEqual({ repairs: 3, formats: 4 })
  })

  it('system-section dump is gated behind IUI_DEBUG and goes to tmpdir', () => {
    const src = readFileSync('src/plugin/index.ts', 'utf8')
    expect(src).toMatch(/IUI_DEBUG/)
    expect(src).toMatch(/tmpdir\(\)/)
  })
})

describe('S10 runtime-config watch', () => {
  it('no fixed 2.5 s poll: refresh on visibility/focus + 60 s fallback', () => {
    const spy = vi.spyOn(window, 'setInterval')
    const stop = startRuntimeConfigWatch()
    expect(RUNTIME_CONFIG_FALLBACK_MS).toBeGreaterThanOrEqual(60_000)
    expect(spy.mock.calls.map((c) => c[1])).not.toContain(2500)
    expect(spy.mock.calls.map((c) => c[1])).toContain(RUNTIME_CONFIG_FALLBACK_MS)
    stop()
    spy.mockRestore()
  })
})

describe('S6 我的模板', () => {
  const page = 'title: 周报\n---html\n<p>week</p>'

  it('save / delete; local copy wins and config write is attempted', async () => {
    const write = vi.fn(async () => true)
    const { result, template } = await saveUserTemplateFromPage({ source: page }, write)
    expect(result).toBe('synced')
    expect(template.name).toBe('周报')
    expect(write).toHaveBeenCalledWith('userTemplatesJson', expect.stringContaining('周报'))
    expect(getUserTemplates().map((t) => t.name)).toEqual(['周报'])
    expect(localStorage.getItem('iui:user-templates')).toContain('周报')
    expect(await deleteUserTemplate(template.id, async () => false)).toBe('local')
    expect(getUserTemplates()).toHaveLength(0)
  })

  it('drawer shows the 我的模板 chip + cards, 试用 inserts the page source, 删除 removes', async () => {
    await replaceUserTemplates([{ id: 'mine-1', name: '我的周报', source: page }])
    const onUse = vi.fn()
    render(<TemplateDrawer tab="templates" onUse={onUse} />)
    fireEvent.click(screen.getByRole('tab', { name: '我的模板' }))
    const card = document.querySelector('[data-genui-template-mine="mine-1"]') as HTMLElement
    expect(card).toBeTruthy()
    fireEvent.click(card)
    fireEvent.click(screen.getByRole('button', { name: '试用：插入输入框' }))
    expect(onUse.mock.calls[0][0]).toContain('```iui-html\n' + page)
    await act(async () => { fireEvent.click(document.querySelector('[data-genui-template-mine-delete="mine-1"]')!) })
    expect(getUserTemplates()).toHaveLength(0)
  })

  it('⋯ menu → 保存为模板 stores the page locally', async () => {
    const raw = JSON.stringify({ title: '存我', css: '', html: '<p>save</p>', js: '' })
    render(<HtmlSandboxFrame raw={raw} />)
    fireEvent.click(document.querySelector('[data-iui-sandbox-menu]')!)
    const btn = document.querySelector('[data-iui-sandbox-save-template]') as HTMLButtonElement
    expect(btn.disabled).toBe(false)
    await act(async () => { fireEvent.click(btn); await new Promise((r) => setTimeout(r, 0)) })
    expect(getUserTemplates().map((t) => t.name)).toEqual(['存我'])
  })

  it('built-in template instructions target ```iui-html (no dsh-ui)', () => {
    for (const tpl of genuiTemplates()) expect(tpl.instruction).not.toMatch(/dsh-ui/)
  })
})
