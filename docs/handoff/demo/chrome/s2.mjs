export default async (page, { sleep }) => {
  const close = page.getByRole('button', { name: '关闭' }); if (await close.count()) await close.last().click().catch(() => {})
  await page.getByText('做一个东京3日行程', { exact: false }).first().click(); await sleep(8000)
  const host = page.locator('[data-iui-html-sandbox]').first()
  await host.scrollIntoViewIfNeeded(); await sleep(1500)
  const box = await host.boundingBox(); console.log('box', JSON.stringify(box))
  // outer wrapper with toolbar
  const wrap = await page.evaluate(() => { const s = document.querySelector('[data-iui-html-sandbox]'); let e = s; for (let i = 0; i < 6 && e.parentElement; i++) { e = e.parentElement; if (e.querySelector('[aria-label="更多"]')) break } e.setAttribute('data-x-wrap', '1'); const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height, e.className] })
  console.log('wrap', JSON.stringify(wrap))
  await page.locator('[data-x-wrap]').screenshot({ path: 'o-sandbox.png' })
  await page.getByRole('button', { name: '更多' }).first().click(); await sleep(800)
  await page.screenshot({ path: 'o-more.png' })
  console.log(await page.evaluate(() => [...document.querySelectorAll('[role=menu] *,[role=menuitem],[role=menuitemradio]')].map(e => (e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 30)).filter(Boolean).slice(0, 40).join(' | ')))
}
