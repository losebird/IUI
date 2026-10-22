export default async (page, { sleep }) => {
  const close = page.getByRole('button', { name: '关闭' }); if (await close.count()) await close.last().click().catch(() => {})
  await page.getByText('做一个东京3日行程', { exact: false }).first().click(); await sleep(8000)
  console.log(await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === '全屏' || x.getAttribute('aria-label') === '全屏'); const out = []; let e = b; for (let i = 0; i < 10 && e; i++) { out.push(e.tagName + '.' + String(e.className).slice(0, 40) + ' [' + [...e.attributes].map(a => a.name).filter(n => n.startsWith('data')).join(',') + '] contains-sb=' + !!e.querySelector('[data-iui-html-sandbox]')); e = e.parentElement } ; const sibs = [...b.parentElement.querySelectorAll('button')].map(x => x.getAttribute('aria-label') || x.textContent.trim()); return out.join('\n') + '\n' + sibs.join(' | ') }))
}
