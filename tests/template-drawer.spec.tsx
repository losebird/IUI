// @vitest-environment jsdom
// TemplateDrawer: sandbox-first (P1-DEAD-SURFACE) — no GenuiBlock catalog preview.
import { cleanup, fireEvent, render, screen, act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TemplateDrawer } from '../src/client/TemplateDrawer.tsx'
import { genuiTemplates } from '../src/client/templates.ts'

const GENUI_TEMPLATES = genuiTemplates()

const renderDrawer = (onUse: (t: string) => void = () => {}): ReturnType<typeof render> =>
  render(<TemplateDrawer tab="templates" onUse={onUse} />)

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  cleanup()
})

describe('TemplateDrawer', () => {
  it('渲染全部分类 chip 与模板卡片', () => {
    renderDrawer()
    for (const c of ['全部', '仪表盘', '数据', '流程', '图表', '交互', '测验', '高级']) {
      expect(screen.getByRole('tab', { name: c })).toBeTruthy()
    }
    for (const tpl of GENUI_TEMPLATES) {
      expect(screen.getByText(tpl.name)).toBeTruthy()
    }
  })

  it('分类过滤：点「测验」只显示测验类模板', () => {
    renderDrawer()
    fireEvent.click(screen.getByRole('tab', { name: '测验' }))
    expect(screen.queryByText('项目仪表盘')).toBeNull()
    expect(screen.getByText('随堂测验')).toBeTruthy()
  })

  it('点击卡片：显示描述、指令与试用/复制（无 GenuiBlock、无「已移除」死文案）', async () => {
    renderDrawer()
    fireEvent.click(screen.getByText('项目仪表盘'))
    const preview = document.querySelector('[data-genui-template-preview]')
    expect(preview).toBeTruthy()
    expect(document.querySelector('[data-iui-legacy-catalog]')).toBeNull()
    expect(preview!.textContent).not.toMatch(/已移除|removed/)
    expect(preview!.querySelector('pre')?.textContent).toContain('仪表盘')
    expect(screen.getByRole('button', { name: '试用：插入输入框' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /复制指令/ })).toBeTruthy()
  })

  it('「试用」回调收到模板指令', () => {
    const onUse = vi.fn()
    renderDrawer(onUse)
    fireEvent.click(screen.getByText('项目仪表盘'))
    fireEvent.click(screen.getByRole('button', { name: '试用：插入输入框' }))
    expect(onUse).toHaveBeenCalledTimes(1)
    expect(onUse.mock.calls[0][0]).toContain('仪表盘')
  })

  it('「复制指令」走 clipboard（无 navigator 时静默容错）', async () => {
    const writeText = vi.fn()
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    const onUse = vi.fn()
    renderDrawer(onUse)
    fireEvent.click(screen.getByText('项目仪表盘'))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /复制指令/ }))
    })
    expect(writeText).toHaveBeenCalledTimes(1)
  })

  it('visual(⑪)：卡片带缩略图，抽屉不再有成就页', () => {
    renderDrawer()
    expect(document.querySelectorAll('[data-genui-template-thumb]').length).toBeGreaterThan(0)
    expect(document.querySelector('[data-genui-achievements]')).toBeNull()
    expect(screen.queryByRole('tab', { name: '成就' })).toBeNull()
    expect(screen.getByRole('tab', { name: '我的' })).toBeTruthy()
  })
})
