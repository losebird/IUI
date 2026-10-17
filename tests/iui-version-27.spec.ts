import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('0.13.0-iui.27', () => {
  it('package.json and the changelog name this release', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }
    const log = readFileSync('CHANGELOG.md', 'utf8')
    expect(pkg.version).toBe('0.13.0-iui.27')
    expect(log).toContain('## 0.13.0-iui.27')
  })
})
