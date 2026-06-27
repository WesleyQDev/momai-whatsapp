const { getAllowedOrigins, isOriginAllowed } = require('./cors.js')

describe('getAllowedOrigins', () => {
  const originalEnv = { ...process.env }

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('returns file:// in production', () => {
    process.env.NODE_ENV = 'production'
    expect(getAllowedOrigins()).toEqual(['file://'])
  })

  it('returns localhost dev origins in development', () => {
    process.env.NODE_ENV = 'development'
    expect(getAllowedOrigins()).toContain('http://localhost:5173')
    expect(getAllowedOrigins()).toContain('http://127.0.0.1:5173')
  })

  it('does not return *', () => {
    expect(getAllowedOrigins()).not.toContain('*')
  })
})

describe('isOriginAllowed', () => {
  const originalEnv = { ...process.env }

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('returns true for file:// in production', () => {
    process.env.NODE_ENV = 'production'
    expect(isOriginAllowed('file://')).toBe(true)
  })

  it('returns true for production renderer static server origin', () => {
    process.env.NODE_ENV = 'production'
    expect(isOriginAllowed('http://127.0.0.1:48291')).toBe(true)
    expect(isOriginAllowed('http://localhost:48291')).toBe(true)
  })

  it('returns false for a non-allowed production origin', () => {
    process.env.NODE_ENV = 'production'
    expect(isOriginAllowed('http://evil.example.com')).toBe(false)
    expect(isOriginAllowed('https://127.0.0.1:48291')).toBe(false)
  })

  it('returns true for an allowed development origin', () => {
    process.env.NODE_ENV = 'development'
    expect(isOriginAllowed('http://localhost:5173')).toBe(true)
    expect(isOriginAllowed('http://127.0.0.1:5173')).toBe(true)
  })
})
