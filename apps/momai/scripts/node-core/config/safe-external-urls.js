const ALLOWED_EXTERNAL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:'])

function isSafeExternalUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || rawUrl.length === 0) return false
  let url
  try {
    url = new URL(rawUrl)
  } catch {
    return false
  }
  return ALLOWED_EXTERNAL_PROTOCOLS.has(url.protocol)
}

module.exports = { ALLOWED_EXTERNAL_PROTOCOLS, isSafeExternalUrl }
