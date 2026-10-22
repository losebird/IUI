export default async (page, { sleep }) => {
  const close = page.getByRole('button', { name: '关闭' }); if (await close.count()) await close.last().click().catch(() => {})
  await page.getByText('更多', { exact: true }).last().click(); await sleep(600)
  await page.getByText('设置', { exact: true }).first().click(); await sleep(1500)
  await page.getByText('IUI', { exact: true }).first().click(); await sleep(3000)
  await page.evaluate(() => document.querySelector('[class*="_options"]').setAttribute('data-x-opt', '1'))
  const sc = page.locator('[data-x-opt]')
  const [sh, ch] = await sc.evaluate(e => [e.scrollHeight, e.clientHeight])
  let i = 0
  for (let y = 0; y < sh; y += ch) { await sc.evaluate((e, y) => { e.scrollTop = y }, y); await sleep(700); await sc.screenshot({ path: `o-set-${i++}.png` }) }
  console.log(sh, ch, i)
}
