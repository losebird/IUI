import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { EmptyState, ErrorState, StatusBlock } from '../src/client/ui/StatusBlock.tsx'
import { setLocale } from '../src/client/i18n/index.ts'

describe('StatusBlock', () => {
  it('renders empty/error chrome in zh', () => {
    setLocale('zh')
    const empty = renderToStaticMarkup(<EmptyState kind="table" />)
    expect(empty).toContain('data-iui-status="table"')
    expect(empty).toContain('表格暂无数据')
    const err = renderToStaticMarkup(<ErrorState detail="boom" />)
    expect(err).toContain('role="alert"')
    expect(err).toContain('boom')
    const custom = renderToStaticMarkup(<StatusBlock tone="empty" title="X" kind="generic" />)
    expect(custom).toContain('X')
  })
})

  it('renders link/map empty chrome in zh', () => {
    setLocale('zh')
    const link = renderToStaticMarkup(<EmptyState kind="link" detail="高德" />)
    expect(link).toContain('data-iui-status="link"')
    expect(link).toContain('暂无可打开的链接')
    expect(link).toContain('高德')
    const map = renderToStaticMarkup(<EmptyState kind="map" />)
    expect(map).toContain('暂无目的地信息')
  })

