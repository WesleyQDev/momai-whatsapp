const ALLOWED_EXTERNAL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:'])

export function isSafeExternalUrl(rawUrl: string): boolean {
  if (typeof rawUrl !== 'string' || rawUrl.length === 0) return false
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return false
  }
  return ALLOWED_EXTERNAL_PROTOCOLS.has(url.protocol)
}

export { ALLOWED_EXTERNAL_PROTOCOLS }
