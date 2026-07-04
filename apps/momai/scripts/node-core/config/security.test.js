import { vi, describe, beforeEach, afterEach, it, expect } from 'vitest'

describe('getSessionToken', () => {
  let getSessionToken

  beforeEach(() => {
    vi.resetModules()
    getSessionToken = require('./security.js').getSessionToken
  })

  afterEach(() => {
    delete process.env.MOMAI_SESSION_TOKEN
  })

  it('returns the token from MOMAI_SESSION_TOKEN env', () => {
    process.env.MOMAI_SESSION_TOKEN = 'tok-abc123'
    expect(getSessionToken()).toBe('tok-abc123')
  })

  it('returns null when MOMAI_SESSION_TOKEN is not set', () => {
    delete process.env.MOMAI_SESSION_TOKEN
    expect(getSessionToken()).toBeNull()
  })

  it('does NOT read from --momai-session-token argv', () => {
    const originalArgv = process.argv
    process.env.MOMAI_SESSION_TOKEN = 'tok-from-env'
    process.argv = [...originalArgv, '--momai-session-token=tok-from-argv']
    expect(getSessionToken()).toBe('tok-from-env')
    process.argv = originalArgv
  })
})
