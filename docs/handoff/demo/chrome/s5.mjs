export default async (page, { sleep }) => {
  const close = page.getByRole('button', { name: '关闭' }); if (await close.count()) await close.last().click().catch(() => {})
  await page.getByText('做一个东京3日行程', { exact: false }).first().click(); await sleep(10000)
  const sb = page.locator('[data-iui-html-sandbox]').first()
  await sb.scrollIntoViewIfNeeded(); await page.mouse.wheel(0, -2000); await sleep(600)
  await sb.hover({ position: { x: 300, y: 60 } }); await sb.getByRole('button', { name: '更多' }).click(); await sleep(500)
  await page.getByRole('menuitem', { name: '外观' }).or(page.getByText('外观', { exact: true })).first().click(); await sleep(1200)
  const bb = await sb.boundingBox(); await page.screenshot({ path: 'o-appear.png', clip: { x: bb.x - 10, y: Math.max(0, bb.y - 10), width: bb.width + 20, height: 820 } })
  await page.keyboard.press('Escape'); await sleep(400)
  // next steps + patch error
  const ns = page.getByText('继续修改', { exact: false }).first(); await ns.scrollIntoViewIfNeeded(); await sleep(500)
  const nb = await ns.boundingBox(); await page.screenshot({ path: 'o-next.png', clip: { x: nb.x - 20, y: nb.y - 30, width: 620, height: 80 } })
  const er = page.getByText('这次修改没能应用到页面上').first(); await er.scrollIntoViewIfNeeded(); await sleep(500)
  const eb = await er.boundingBox(); await page.screenshot({ path: 'o-patcherr.png', clip: { x: eb.x - 30, y: eb.y - 50, width: 600, height: 150 } })
}
