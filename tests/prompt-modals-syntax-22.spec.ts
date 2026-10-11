import { describe, expect, it } from 'vitest'
import { prepareAuthorJs, softFixArrayCallbackParens } from '../src/shared/html-sandbox.ts'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

describe('0.13.0-iui.22 prompt modals + syntax soft-fix', () => {
  it('soft-fixes var d ctx1 = double-identifier typos', () => {
    const src = "var d ctx1=document.getElementById('cDonut'); let x y = 1; const a b = 2;"
    const out = prepareAuthorJs(src)
    expect(out).toMatch(/var ctx1\s*=/)
    expect(out).toContain('let y =')
    expect(out).toContain('const b =')
    expect(out).not.toMatch(/var d ctx1/)
  })

  it('soft-fixes forEach(function(){...}; missing paren', () => {
    const src = "subs.forEach(function(s,i){list.appendChild(row)};updateKpi())"
    const out = softFixArrayCallbackParens(src)
    expect(out).toContain('appendChild(row)});updateKpi()')
  })

  it('iframe sandbox includes allow-modals', () => {
    const src = readFileSync(join(root, 'src/client/html-fence.tsx'), 'utf8')
    expect(src).toContain('sandbox="allow-scripts allow-modals"')
  })
})
