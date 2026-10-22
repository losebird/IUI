export default async (page, { sleep }) => {
  const close = page.getByRole('button', { name: '关闭' }); if (await close.count()) await close.last().click().catch(() => {})
  await page.getByText('做一个东京3日行程', { exact: false }).first().click(); await sleep(8000)
  const c = page.locator('[data-composer-input]'); await c.click(); await c.fill('/panel'); await sleep(1200)
  await page.screenshot({ path: 'o-slash.png' })
  await c.press('Enter'); await sleep(800); await c.press('Enter'); await sleep(3000)
  await page.screenshot({ path: 'o-panel.png' })
  const tpl = page.getByRole('button', { name: /模板/ }).first(); console.log('tpl', await tpl.count())
  if (await tpl.count()) { await tpl.click(); await sleep(2500); await page.screenshot({ path: 'o-tpl.png' }) }
  const ach = page.getByRole('button', { name: /成就/ }).first(); console.log('ach', await ach.count())
  if (await ach.count()) { await ach.click(); await sleep(2500); await page.screenshot({ path: 'o-ach.png' }) }
}
