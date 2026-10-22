export default async (page, { sleep }) => {
  const close = page.getByRole('button', { name: '关闭' }); if (await close.count()) await close.last().click().catch(() => {})
  await page.getByText('做一个东京3日行程', { exact: false }).first().click(); await sleep(8000)
  const fence = page.locator('.genui-dom-fence').first()
  await fence.screenshot({ path: 'o-fence.png' })
  const sb = page.locator('[data-iui-html-sandbox]').first()
  await sb.scrollIntoViewIfNeeded(); await page.mouse.wheel(0, -2000); await sleep(800)
  await sb.hover({ position: { x: 300, y: 60 } }); await sleep(600)
  const bb = await sb.boundingBox(); await page.screenshot({ path: 'o-toolbar.png', clip: { x: bb.x - 10, y: Math.max(0, bb.y - 10), width: bb.width + 20, height: 260 } })
  await sb.getByRole('button', { name: '更多' }).click(); await sleep(800)
  await page.screenshot({ path: 'o-more.png', clip: { x: bb.x - 10, y: Math.max(0, bb.y - 10), width: bb.width + 20, height: 560 } })
  console.log(await page.evaluate(() => [...document.querySelectorAll('[data-iui-html-sandbox] [role=menu] button, [data-iui-html-sandbox] [role=menuitem]')].map(e => (e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 30)).join(' | ')))
}
