import { describe, it, expect } from 'vitest'
import { shouldBlockDevToolsShortcut } from './devtools-block'

describe('shouldBlockDevToolsShortcut', () => {
  it('returns true in production for F12', () => {
    expect(shouldBlockDevToolsShortcut({ isDev: false, key: 'F12' })).toBe(true)
  })

  it('returns false in dev for F12', () => {
    expect(shouldBlockDevToolsShortcut({ isDev: true, key: 'F12' })).toBe(false)
  })

  it('returns true in production for Ctrl+Shift+I', () => {
    expect(
      shouldBlockDevToolsShortcut({ isDev: false, key: 'I', control: true, shift: true })
    ).toBe(true)
  })

  it('returns false in production for regular typing', () => {
    expect(shouldBlockDevToolsShortcut({ isDev: false, key: 'a' })).toBe(false)
  })
})
