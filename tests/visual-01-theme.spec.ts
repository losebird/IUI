import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { DAISY_CSS, DAISY_THEMES_CSS, DAISY_VERSION } from '../src/themes/daisy.generated.ts'
import { CUSTOM_TOKEN_WHITELIST, IUI_DARK_TOKENS, IUI_LIGHT_TOKENS, buildIuiDaisyCss, legacyElementLayer } from '../src/themes/iui-daisy.ts'
import { buildHtmlSandboxSrcdoc } from '../src/shared/html-sandbox.ts'
import { pageAccentCss } from '../src/shared/page-accent.ts'
import { getCustomTokens, setCustomTokens } from '../src/client/theme/apply-theme.ts'

const require = createRequire(import.meta.url)
const spec = { title: 't', html: '<button class="btn btn-primary">ok</button>', css: '', js: '' }

describe('visual(①) daisyUI theme base', () => {
  it('bundle matches the installed daisyUI and has no responsive variants', () => {
    const pkg = JSON.parse(readFileSync(require.resolve('daisyui/package.json'), 'utf8')) as { version: string }
    expect(DAISY_VERSION).toBe(pkg.version)
    expect(DAISY_CSS).not.toContain('@media (width>=')
    expect(DAISY_CSS).toContain('.btn')
    expect(DAISY_THEMES_CSS).toContain('[data-theme="corporate"]')
    expect(DAISY_THEMES_CSS).toContain('[data-theme="dim"]')
  })

  it('renames daisyUI --border so the legacy colour alias keeps working', () => {
    expect(DAISY_CSS + DAISY_THEMES_CSS).not.toMatch(/--border[:),\s]/)
    expect(DAISY_CSS).toContain('var(--border-w)')
  })

  it('uses the common.css IUI 中性 tokens, light and dark', () => {
    expect(IUI_LIGHT_TOKENS['--color-base-content']).toBe('#0a0a0a')
    expect(IUI_LIGHT_TOKENS['--radius-field']).toBe('999px')
    expect(IUI_DARK_TOKENS['--color-base-100']).toBe('#0a0a0a')
    const css = buildIuiDaisyCss()
    expect(css.startsWith('@layer base, iui-base, utilities;')).toBe(true)
    expect(css).toMatch(/@media \(prefers-color-scheme: dark\)\{:root\{color-scheme:dark/)
    expect(css).toContain('font-family:"InterVar"')
  })

  it('srcdoc: theme base before host tokens, bridge after; old OIU palette gone', () => {
    const doc = buildHtmlSandboxSrcdoc(spec)
    expect(doc).not.toContain('#f7f6f3') // OIU warm-stone surface
    expect(doc.indexOf('@layer base, iui-base, utilities;')).toBeLessThan(doc.indexOf('--iui-pack-gap'))
    expect(doc.lastIndexOf('--color-background-primary:var(--color-base-100)')).toBeGreaterThan(doc.indexOf('--iui-pack-gap'))
    expect(doc).not.toMatch(/<html[^>]*data-theme=/)
    expect(buildHtmlSandboxSrcdoc(spec, { theme: 'dim' })).toMatch(/<html[^>]*data-theme="dim"/)
    expect(buildHtmlSandboxSrcdoc(spec, { theme: 'bogus' as never })).not.toMatch(/<html[^>]*data-theme=/)
  })

  it('keeps host element defaults off daisyUI-classed controls (same specificity)', () => {
    const out = legacyElementLayer('button.primary:hover, input::placeholder { a: 1 }\n.x > td { b: 2 }\nh1 { c: 3 }')
    expect(out.startsWith('@layer iui-base {')).toBe(true)
    expect(out).toContain('button.primary:hover:where(:not(.btn,.tab,.join-item,.swap))')
    expect(out).toContain('input:where(:not(.input,.input *,')
    expect(out).toMatch(/input:where\([^)]*\)\)::placeholder/)
    expect(out).toContain('.x > td:where(:not(.table *))')
    expect(out).toContain('h1 { c: 3 }')
  })

  it('page accent changes the primary group only', () => {
    const css = pageAccentCss('#E4572E')
    expect(css).toContain('--color-primary:')
    expect(css).toContain('--color-primary-content:')
    expect(css).not.toMatch(/--color-base-|--color-text-/)
  })

  it('custom tokens: whitelist only', () => {
    expect(CUSTOM_TOKEN_WHITELIST).toContain('--color-primary')
    setCustomTokens(JSON.stringify({ '--color-primary': '#0f766e', '--color-base-100': '#000', '--fs-sm': '15px' }))
    expect(getCustomTokens()).toEqual({ '--color-primary': '#0f766e', '--fs-sm': '15px' })
    setCustomTokens('')
  })
})
