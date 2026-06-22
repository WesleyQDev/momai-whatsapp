const { isSafeExternalUrl, ALLOWED_EXTERNAL_PROTOCOLS } = require('./safe-external-urls.js')

describe('ALLOWED_EXTERNAL_PROTOCOLS', () => {
  it('includes only http, https, and mailto', () => {
    expect(ALLOWED_EXTERNAL_PROTOCOLS.has('http:')).toBe(true)
    expect(ALLOWED_EXTERNAL_PROTOCOLS.has('https:')).toBe(true)
    expect(ALLOWED_EXTERNAL_PROTOCOLS.has('mailto:')).toBe(true)
  })

  it('does NOT include dangerous protocols', () => {
    expect(ALLOWED_EXTERNAL_PROTOCOLS.has('file:')).toBe(false)
    expect(ALLOWED_EXTERNAL_PROTOCOLS.has('javascript:')).toBe(false)
    expect(ALLOWED_EXTERNAL_PROTOCOLS.has('data:')).toBe(false)
    expect(ALLOWED_EXTERNAL_PROTOCOLS.has('vbscript:')).toBe(false)
    expect(ALLOWED_EXTERNAL_PROTOCOLS.has('ms-msdt:')).toBe(false)
  })
})

describe('isSafeExternalUrl', () => {
  it('accepts https URLs', () => {
    expect(isSafeExternalUrl('https://example.com/page')).toBe(true)
  })

  it('accepts http URLs', () => {
    expect(isSafeExternalUrl('http://example.com')).toBe(true)
  })

  it('accepts mailto URLs', () => {
    expect(isSafeExternalUrl('mailto:user@example.com')).toBe(true)
  })

  it('rejects javascript: URLs', () => {
    expect(isSafeExternalUrl('javascript:alert(1)')).toBe(false)
  })

  it('rejects file: URLs', () => {
    expect(isSafeExternalUrl('file:///etc/passwd')).toBe(false)
  })

  it('rejects data: URLs', () => {
    expect(isSafeExternalUrl('data:text/html,<script>alert(1)</script>')).toBe(false)
  })

  it('rejects empty string', () => {
    expect(isSafeExternalUrl('')).toBe(false)
  })

  it('rejects invalid URLs', () => {
    expect(isSafeExternalUrl('not a url')).toBe(false)
  })
})
