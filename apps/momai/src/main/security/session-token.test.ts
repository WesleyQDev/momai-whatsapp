import { describe, it, expect, vi, beforeEach } from 'vitest'
import { generateSessionToken, getOrCreateSessionToken } from './session-token'

describe('generateSessionToken', () => {
  it('returns a 64-character hex string', () => {
    const token = generateSessionToken()
    expect(token).toMatch(/^[a-f0-9]{64}$/)
  })

  it('returns a different value on each call', () => {
    const a = generateSessionToken()
    const b = generateSessionToken()
    expect(a).not.toBe(b)
  })
})

describe('getOrCreateSessionToken', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('returns the existing token if one is cached in module state', async () => {
    const { getOrCreateSessionToken: get1 } = await import('./session-token')
    const token1 = get1()
    const { getOrCreateSessionToken: get2 } = await import('./session-token')
    const token2 = get2()
    expect(token2).toBe(token1)
  })

  it('returns a token matching the hex format', () => {
    const token = getOrCreateSessionToken()
    expect(token).toMatch(/^[a-f0-9]{64}$/)
  })
})
