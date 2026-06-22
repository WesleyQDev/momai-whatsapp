const {
  EXTENSION_REQUIRE_ALLOWLIST,
  isRequireAllowed,
  createRequireInterceptor
} = require('./extension-allowlist.js')

describe('EXTENSION_REQUIRE_ALLOWLIST', () => {
  it('includes safe Node built-ins', () => {
    expect(EXTENSION_REQUIRE_ALLOWLIST.has('path')).toBe(true)
    expect(EXTENSION_REQUIRE_ALLOWLIST.has('url')).toBe(true)
    expect(EXTENSION_REQUIRE_ALLOWLIST.has('node:path')).toBe(true)
    expect(EXTENSION_REQUIRE_ALLOWLIST.has('node:url')).toBe(true)
  })

  it('excludes dangerous modules', () => {
    expect(EXTENSION_REQUIRE_ALLOWLIST.has('child_process')).toBe(false)
    expect(EXTENSION_REQUIRE_ALLOWLIST.has('node:child_process')).toBe(false)
    expect(EXTENSION_REQUIRE_ALLOWLIST.has('fs')).toBe(false)
    expect(EXTENSION_REQUIRE_ALLOWLIST.has('worker_threads')).toBe(false)
    expect(EXTENSION_REQUIRE_ALLOWLIST.has('cluster')).toBe(false)
  })
})

describe('isRequireAllowed', () => {
  it('returns true for allowed modules', () => {
    expect(isRequireAllowed('path')).toBe(true)
    expect(isRequireAllowed('node:path')).toBe(true)
  })

  it('returns false for disallowed modules', () => {
    expect(isRequireAllowed('child_process')).toBe(false)
    expect(isRequireAllowed('fs')).toBe(false)
  })

  it('returns false for relative requires (those are handled separately)', () => {
    expect(isRequireAllowed('./utils')).toBe(false)
    expect(isRequireAllowed('../shared')).toBe(false)
  })
})

describe('createRequireInterceptor', () => {
  it('returns a function that allows whitelisted requires and blocks the rest', () => {
    const calls = []
    const original = (id) => {
      calls.push(id)
      return { id }
    }
    const intercepted = createRequireInterceptor(original)
    expect(() => intercepted('path')).not.toThrow()
    expect(() => intercepted('node:path')).not.toThrow()
    expect(() => intercepted('child_process')).toThrow(/not allowed/i)
    expect(() => intercepted('fs')).toThrow(/not allowed/i)
  })
})
