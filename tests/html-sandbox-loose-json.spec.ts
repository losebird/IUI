import { describe, expect, it } from 'vitest'
import { parseHtmlSandboxFence, sanitizeSandboxMarkup } from '../src/shared/html-sandbox.ts'

describe('html-sandbox loose JSON', () => {
  it('repairs raw newlines inside JSON strings and marks complete', () => {
    const raw = '{\n  "title": "t",\n  "height": 400,\n  "css": ".a{color:red}",\n  "html": "<div id=\\"map\\" class=\\"map-container\\"></div>\\n<p>x</p>",\n  "js": "var m=L.map(\'map\').setView([31.2,121.4],12);"\n}'
    // Simulate model emitting a literal newline inside the html string value
    const loose = raw.replace('\\n<p>x</p>', '\n<p>x</p>')
    expect(() => JSON.parse(loose)).toThrow()
    const p = parseHtmlSandboxFence(loose)
    expect(p).not.toBeNull()
    expect(p!.partial).toBe(false)
    expect(p!.jsComplete).toBe(true)
    expect(p!.js).toContain('L.map')
    expect(p!.html).toContain('id="map"')
  })

  it('sanitizes \\\\p> typo to <p>', () => {
    expect(sanitizeSandboxMarkup('hi\\p>there')).toContain('<p>')
  })
})
