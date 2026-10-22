export default async (page, { sleep }) => {
  const close = page.getByRole('button', { name: '关闭' }); if (await close.count()) await close.last().click().catch(() => {})
  await sleep(800); await page.screenshot({ path: 'o-home2.png' })
  await page.getByText('做一个东京3日行程', { exact: false }).first().click(); await sleep(9000)
  await page.screenshot({ path: 'o-tokyo.png' })
  console.log(await page.evaluate(() => JSON.stringify({ sb: document.querySelectorAll('[data-iui-html-sandbox]').length, states: [...document.querySelectorAll('[data-iui-html-sandbox]')].map(e => e.getAttribute('data-iui-html-sandbox')), btns: [...document.querySelectorAll('main button, [data-chat-flow] button')].map(e => (e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 24)).filter(Boolean).slice(0, 50) })))
}
