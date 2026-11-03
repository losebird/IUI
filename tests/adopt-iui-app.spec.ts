import { describe, expect, it } from 'vitest'
import { adoptIuiAppPath, adoptIuiSessionId } from '../src/client/html-fence.tsx'

describe('adopt IUI as FDE app', () => {
  it('keeps /dsh-app prefix so the Host session proxy is hit', () => {
    expect(adoptIuiAppPath('http://127.0.0.1:5174/dsh-app/')).toBe('/dsh-app/fde-session/adopt-iui-app')
    expect(adoptIuiAppPath('http://127.0.0.1:59123/')).toBe('/fde-session/adopt-iui-app')
  })

  it('reads session id from the FDE hash when the fence did not pass one', () => {
    expect(adoptIuiSessionId('session-live')).toBe('session-live')
    const prev = globalThis.location
    Object.defineProperty(globalThis, 'location', {
      configurable: true,
      value: { hash: '#fde-session=session-from-hash&x=1' },
    })
    expect(adoptIuiSessionId('')).toBe('session-from-hash')
    Object.defineProperty(globalThis, 'location', { configurable: true, value: prev })
  })
})
