// @vitest-environment jsdom
// visual(⑪⑫ 999px): sandbox chrome, patch-failure notice, skeleton, toasts, settings save bar, rectangle containers.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HtmlSandboxFrame } from '../src/client/html-fence.tsx'
import { resetFrameActivityForTests } from '../src/client/frame-activity.ts'
import { SandboxSkeleton, formatReceived, utf8Bytes } from '../src/client/sandbox-skeleton.tsx'
import { ToastCard } from '../src/client/tip-toast.tsx'
import { countChangedFields } from '../src/client/settings/IuiSettingsSection.tsx'
import { TemplateDrawer } from '../src/client/TemplateDrawer.tsx'

const src = (p: string): string => readFileSync(resolve(__dirname, '..', p), 'utf8')

beforeEach(() => { resetFrameActivityForTests(); localStorage.clear() })
afterEach(() => { cleanup(); localStorage.clear() })

describe('visual ⑪ sandbox chrome', () => {
  it('toolbar uses icon buttons; ⋯ menu is grouped (外观/重新加载 · 导出与分享 · 保存为模板 · 反馈)', () => {
    render(<HtmlSandboxFrame raw={JSON.stringify({ title: 'T', css: '', html: '<p>x</p>', js: '' })} />)
    const menuBtn = document.querySelector('[data-iui-sandbox-menu]') as HTMLElement
    expect(menuBtn.querySelector('svg')).toBeTruthy()
    fireEvent.click(menuBtn)
    for (const sel of ['appearance', 'reload', 'download', 'offline', 'save-image', 'copy', 'save-template']) {
      expect(document.querySelector(`[data-iui-sandbox-${sel}]`), sel).toBeTruthy()
    }
    expect(screen.getByText('导出与分享')).toBeTruthy()
    const order = ['appearance', 'reload', 'download', 'copy', 'save-template'].map((s) => document.querySelector(`[data-iui-sandbox-${s}]`)!)
    for (let i = 1; i < order.length; i++) {
      expect(order[i - 1]!.compareDocumentPosition(order[i]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
    expect(document.querySelectorAll('[data-iui-feedback]').length).toBeGreaterThan(0)
  })

  it('patch-failure card is a yellow notice with rewrite + technical details (no red error wall)', () => {
    const s = src('src/client/html-fence.tsx')
    expect(s).toMatch(/data-iui-patch-notice/)
    expect(s).toMatch(/data-iui-patch-rewrite/)
    expect(s).toMatch(/data-iui-patch-details/)
    expect(s).toMatch(/data-iui-patch-source/)
  })

  it('skeleton shows 已接收 X KB next to the label', () => {
    expect(formatReceived(512)).toBe('512 B')
    expect(formatReceived(12700)).toBe('12.4 KB')
    expect(utf8Bytes('a中😀')).toBe(1 + 3 + 4)
    render(<SandboxSkeleton label="正在生成页面…" pct={40} height={200} received={12700} />)
    expect(document.querySelector('[data-iui-skeleton-received]')?.textContent).toContain('12.4 KB')
  })

  it('ToastCard: success with 撤销 action and × close', () => {
    const undo = vi.fn()
    const close = vi.fn()
    render(<ToastCard tone="success" title="已保存为模板" action={{ label: '撤销', onClick: undo }} onClose={close} />)
    act(() => { (document.querySelector('[data-iui-toast-action]') as HTMLElement).click() })
    expect(undo).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: '关闭' }))
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('template drawer: no achievements page, panel has no dead 成就/目录 entries', () => {
    render(<TemplateDrawer onUse={() => {}} />)
    expect(document.querySelector('[data-genui-achievements]')).toBeNull()
    const panel = src('src/client/panel.tsx')
    expect(panel).not.toMatch(/panel\.achievements|panelTpl\b|catalog/i)
  })
})

describe('visual ⑫ settings', () => {
  it('countChangedFields counts only fields that differ from the saved baseline', () => {
    const cur = { a: { text: '1' }, b: { text: 'x' }, c: { text: '' } }
    expect(countChangedFields(cur, { a: '1', b: 'y', c: '' }, ['a', 'b', 'c'])).toBe(1)
    expect(countChangedFields(cur, { a: '2', b: 'y', c: 'z' }, ['a', 'b', 'c'])).toBe(3)
  })

  it('settings section renders the sticky save bar hooks', () => {
    const s = src('src/client/settings/IuiSettingsSection.tsx')
    for (const a of ['data-iui-settings-save-bar', 'data-iui-settings-discard', 'data-iui-settings-save']) expect(s).toContain(a)
  })
})

describe('visual 999px: containers are rectangles, only controls are pills', () => {
  it('GenuiBlock containers use --radius-box', () => {
    const css = src('src/client/GenuiBlock.module.css')
    for (const cls of ['.mediaPlayer', '.tableWrap', '.chartTip', '.detailBody', '.textarea', '.skeletonBlock']) {
      const i = css.indexOf(`${cls} {`)
      expect(i, cls).toBeGreaterThanOrEqual(0)
      const body = css.slice(i, css.indexOf('}', i))
      if (/border-radius/.test(body)) expect(body, cls).toMatch(/var\(--radius-box/)
    }
  })
})
