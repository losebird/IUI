// F23: focus ring, reduced motion, 32px targets, prominent primary actions, and
// keyboard activation for author-built click targets (browser-verified in
// scripts/browser-e2e.mts keyboardAuditCase).
import { describe, expect, it } from 'vitest'
import { HOST_A11Y_CSS, buildHostKitCss } from '../src/themes/host-kit.ts'
import { buildHtmlSandboxSrcdoc, buildSandboxBridgeScript } from '../src/shared/html-sandbox.ts'
import { GENUI_SECTION_TEXT } from '../src/plugin/section-text.ts'

describe('F23 accessibility css', () => {
  it('is the last design-system layer', () => {
    expect(buildHostKitCss().endsWith(HOST_A11Y_CSS)).toBe(true)
  })

  it('has a keyboard focus ring and hides it for mouse focus', () => {
    expect(HOST_A11Y_CSS).toContain(':focus-visible { outline: 2px solid var(--accent-fill, #185FA5); outline-offset: 2px; }')
    expect(HOST_A11Y_CSS).toContain(':focus:not(:focus-visible) { outline: none; }')
  })

  it('turns off animations and transitions under prefers-reduced-motion', () => {
    const block = HOST_A11Y_CSS.slice(HOST_A11Y_CSS.indexOf('@media (prefers-reduced-motion: reduce)'))
    expect(block).toContain('animation-duration: 0.01ms !important')
    // 0s, not 0.01ms: a 0.01ms duration (with transition-property: all) breaks Mermaid mindmap layout.
    expect(block).toContain('transition-duration: 0s !important')
    expect(block).toContain('scroll-behavior: auto !important')
  })

  it('keeps controls ≥32px (Leaflet chrome excluded) and fills primary actions with the accent', () => {
    expect(HOST_A11Y_CSS).toMatch(/button:not\(\.leaflet-container \*\), \[role="button"\][^{]*\{ min-height: 32px; \}/)
    expect(HOST_A11Y_CSS).toContain('button:not(.leaflet-container *) { min-width: 32px; }')
    // visual(①): daisyUI .btn keeps its own colours.
    expect(HOST_A11Y_CSS).toMatch(/button\.primary:not\(\.btn\), button\[data-variant="primary"\]:not\(\.btn\), button\[type="submit"\]:not\(\.secondary\):not\(\.ghost\):not\(\.btn\) \{\s*background: var\(--accent-fill/)
    expect(HOST_A11Y_CSS).toContain('.iui-actions { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end;')
  })

  it('ships inside every srcdoc', () => {
    const doc = buildHtmlSandboxSrcdoc({ title: 't', html: '<p>x</p>', css: '', js: '' })
    expect(doc).toContain('.iui-actions > button.primary')
  })
})

describe('F23 bridge runtime', () => {
  const src = buildSandboxBridgeScript('f23')
  it('makes outermost pointer / data-iui-action targets focusable with Enter/Space activation', () => {
    expect(src).toContain("el.setAttribute('tabindex', '0')")
    expect(src).toContain("el.setAttribute('data-iui-kbd', '1')")
    expect(src).toContain("getComputedStyle(par).cursor === 'pointer'")
    expect(src).toContain("if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;")
    expect(src).toMatch(/\[role=grid\],\[role=treegrid\],\[role=listbox\]/)
  })

  it('exposes iuiSandbox.reducedMotion and disables chart intro animation', () => {
    expect(src).toContain('get reducedMotion() { return window.__iuiReducedMotion(); }')
    const doc = buildHtmlSandboxSrcdoc({ title: 't', html: '<canvas id="c"></canvas>', css: '', js: 'new Chart(document.getElementById("c"),{type:"bar",data:{labels:[],datasets:[]}})' })
    expect(doc).toContain('cfg.options.animation = false')
  })
})

describe('F23 prompt', () => {
  it('asks for one primary action in an .iui-actions footer and real buttons', () => {
    expect(GENUI_SECTION_TEXT).toContain('`.iui-actions` footer')
    expect(GENUI_SECTION_TEXT).toContain('iuiSandbox.reducedMotion')
    expect(GENUI_SECTION_TEXT.length).toBeLessThan(3600)
  })
})
