import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { getHtmlSandboxStarter, listHtmlSandboxStarters } from '../src/shared/html-sandbox.ts'

describe('0.13.0-iui.16 stage chrome + weather', () => {
  it('hides stage chips unless streaming partial', () => {
    const src = readFileSync(resolve(__dirname, '../src/client/html-fence.tsx'), 'utf8')
    expect(src).toMatch(/function showStreamingStageChrome/)
    expect(src).toMatch(/showStreamingStageChrome\(parsed, ready\)/)
    expect(src).toMatch(/if \(!parsed\.partial\) setReady\(true\)/)
    // Must not show chips on every !ready
    expect(src).not.toMatch(/\{!ready && stages\.map/)
  })

  it('ships weather-dense starter', () => {
    const s = getHtmlSandboxStarter('weather-dense')
    expect(s).toBeTruthy()
    // visual(⑧): hero + stats strip + ECharts hourly + 7-day range bars
    expect(s!.spec.html).toMatch(/id="hr"/)
    expect(s!.spec.js).toMatch(/echarts\.init/)
    expect(s!.spec.js).toMatch(/class="bar"/)
    expect(listHtmlSandboxStarters().some((x) => x.id === 'weather-dense')).toBe(true)
  })
})
