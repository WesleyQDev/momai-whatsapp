const { PUBLIC_PATHS, isPublicPath } = require('../api/router.js')

describe('PUBLIC_PATHS / isPublicPath', () => {
  it('includes /health (liveness probe)', () => {
    expect(PUBLIC_PATHS.has('/health')).toBe(true)
  })

  it('includes /extensions/events (SSE — browsers cannot send Authorization on EventSource)', () => {
    expect(PUBLIC_PATHS.has('/extensions/events')).toBe(true)
  })

  it('does not include other endpoints', () => {
    expect(PUBLIC_PATHS.has('/settings')).toBe(false)
    expect(PUBLIC_PATHS.has('/extensions')).toBe(false)
    expect(PUBLIC_PATHS.has('/extensions/install')).toBe(false)
  })
})

describe('isPublicPath', () => {
  it('bypasses OPTIONS on any path (CORS preflight)', () => {
    expect(isPublicPath('/settings', 'OPTIONS')).toBe(true)
    expect(isPublicPath('/extensions/install', 'OPTIONS')).toBe(true)
  })

  it('bypasses GET /health even without auth', () => {
    expect(isPublicPath('/health', 'GET')).toBe(true)
  })

  it('bypasses GET /extensions/events even without auth', () => {
    expect(isPublicPath('/extensions/events', 'GET')).toBe(true)
  })

  it('bypasses GET /extensions/:id/dist/* for dynamic imports', () => {
    expect(isPublicPath('/extensions/whatsapp/dist/page.js', 'GET')).toBe(true)
    expect(isPublicPath('/extensions/launcher/dist/panel.js', 'GET')).toBe(true)
  })

  it('does not bypass other paths', () => {
    expect(isPublicPath('/settings', 'GET')).toBe(false)
    expect(isPublicPath('/extensions', 'GET')).toBe(false)
    expect(isPublicPath('/extensions/install', 'POST')).toBe(false)
    expect(isPublicPath('/extensions/whatsapp/panel', 'GET')).toBe(false)
  })
})
