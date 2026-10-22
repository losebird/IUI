export default async (page, { sleep }) => {
  const close = page.getByRole('button', { name: '关闭' }); if (await close.count()) await close.last().click().catch(() => {})
  await page.getByText('更多', { exact: true }).last().click(); await sleep(800)
  await page.screenshot({ path: 'o-moremenu.png' })
  const s = page.getByText('设置', { exact: true }).first(); console.log('settings', await s.count())
  await s.click(); await sleep(2000)
  const iui = page.getByText('IUI', { exact: true }).first(); console.log('iui', await iui.count()); await iui.click(); await sleep(3000)
  await page.screenshot({ path: 'o-settings.png' }); await page.evaluate(() => { const e = document.querySelector('[class*="_options"]'); e.setAttribute('data-x-opt','1') }); await page.locator('[data-x-opt]').screenshot({ path: 'o-settings-full.png' })
  const h = await page.evaluate(() => { const el = [...document.querySelectorAll('*')].filter(e => e.scrollHeight > e.clientHeight + 50 && getComputedStyle(e).overflowY !== 'visible'); return el.map(e => e.className.toString().slice(0, 40) + ':' + e.scrollHeight).join(' | ') }); console.log(h)
}
export const full = 1
