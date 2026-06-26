const { extractWsToken, isValidWsUpgrade } = require('./ws-auth.js')

describe('extractWsToken', () => {
  it('returns the token from ?token=... query', () => {
    const url = new URL('/ws?token=abc123', 'http://localhost')
    expect(extractWsToken(url)).toBe('abc123')
  })

  it('returns null when no token is present', () => {
    const url = new URL('/ws', 'http://localhost')
    expect(extractWsToken(url)).toBeNull()
  })

  it('returns null when token is empty', () => {
    const url = new URL('/ws?token=', 'http://localhost')
    expect(extractWsToken(url)).toBeNull()
  })
})

describe('isValidWsUpgrade', () => {
  const originalToken = process.env.MOMAI_SESSION_TOKEN

  beforeEach(() => {
    process.env.MOMAI_SESSION_TOKEN = 'tok-xyz'
  })
  afterEach(() => {
    if (originalToken === undefined) delete process.env.MOMAI_SESSION_TOKEN
    else process.env.MOMAI_SESSION_TOKEN = originalToken
  })

  it('returns true when query token matches MOMAI_SESSION_TOKEN', () => {
    const url = new URL('/ws?token=tok-xyz', 'http://localhost')
    expect(isValidWsUpgrade(url)).toBe(true)
  })

  it('returns false when query token is wrong', () => {
    const url = new URL('/ws?token=other', 'http://localhost')
    expect(isValidWsUpgrade(url)).toBe(false)
  })

  it('returns false when token is missing', () => {
    const url = new URL('/ws', 'http://localhost')
    expect(isValidWsUpgrade(url)).toBe(false)
  })

  it('returns false when MOMAI_SESSION_TOKEN is not set (server misconfigured)', () => {
    delete process.env.MOMAI_SESSION_TOKEN
    const url = new URL('/ws?token=anything', 'http://localhost')
    expect(isValidWsUpgrade(url)).toBe(false)
  })
})
