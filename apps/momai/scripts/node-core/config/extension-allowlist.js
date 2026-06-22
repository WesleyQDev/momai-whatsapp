const EXTENSION_REQUIRE_ALLOWLIST = new Set([
  'path',
  'node:path',
  'url',
  'node:url',
  'querystring',
  'node:querystring',
  'util',
  'node:util',
  'events',
  'node:events',
  'stream',
  'node:stream',
  'buffer',
  'node:buffer',
  'string_decoder',
  'node:string_decoder',
  'punycode',
  'node:punycode'
])

function isRequireAllowed(id) {
  if (typeof id !== 'string') return false
  if (id.startsWith('.') || id.startsWith('/')) return false
  return EXTENSION_REQUIRE_ALLOWLIST.has(id)
}

function createRequireInterceptor(originalRequire) {
  return function intercepted(id) {
    if (!isRequireAllowed(id)) {
      throw new Error(
        `Extension tried to require "${id}" which is not allowed. ` +
          `Extensions can only use: ${[...EXTENSION_REQUIRE_ALLOWLIST].join(', ')}`
      )
    }
    return originalRequire(id)
  }
}

module.exports = {
  EXTENSION_REQUIRE_ALLOWLIST,
  isRequireAllowed,
  createRequireInterceptor
}
