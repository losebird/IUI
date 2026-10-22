export default async (page) => {
  await page.screenshot({ path: 'o-home.png' })
  console.log(await page.evaluate(() => [...document.querySelectorAll('button,a,[role=button]')].map(e => (e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 30)).filter(Boolean).slice(0, 60).join(' | ')))
}
