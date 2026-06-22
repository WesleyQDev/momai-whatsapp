import { describe, it, expect } from 'vitest'
import { isSafeExternalUrl, ALLOWED_EXTERNAL_PROTOCOLS } from './safe-external-url'

describe('isSafeExternalUrl (main)', () => {
  it('accepts https', () => expect(isSafeExternalUrl('https://example.com')).toBe(true))
  it('accepts http', () => expect(isSafeExternalUrl('http://example.com')).toBe(true))
  it('accepts mailto', () => expect(isSafeExternalUrl('mailto:user@example.com')).toBe(true))
  it('rejects javascript:', () => expect(isSafeExternalUrl('javascript:alert(1)')).toBe(false))
  it('rejects file:', () => expect(isSafeExternalUrl('file:///etc/passwd')).toBe(false))
  it('rejects empty', () => expect(isSafeExternalUrl('')).toBe(false))
  it('rejects garbage', () => expect(isSafeExternalUrl('nope')).toBe(false))
})

describe('ALLOWED_EXTERNAL_PROTOCOLS (main)', () => {
  it('matches Node side', () => {
    expect(ALLOWED_EXTERNAL_PROTOCOLS.has('https:')).toBe(true)
    expect(ALLOWED_EXTERNAL_PROTOCOLS.has('javascript:')).toBe(false)
  })
})
