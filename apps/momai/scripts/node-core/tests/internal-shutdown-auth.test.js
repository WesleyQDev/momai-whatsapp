const { isPublicPath } = require('../api/router.js')

describe('internal/shutdown auth (H4)', () => {
  it('/internal/shutdown is NOT in PUBLIC_PATHS (so the global auth middleware applies)', () => {
    expect(isPublicPath('/internal/shutdown', 'POST')).toBe(false)
  })

  it('/internal/shutdown requires auth on GET as well (defense in depth)', () => {
    expect(isPublicPath('/internal/shutdown', 'GET')).toBe(false)
  })
})
