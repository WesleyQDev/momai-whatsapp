import { describe, it, expect } from 'vitest'
import { isEncryptionAvailable, encryptForStorage, decryptFromStorage } from './keychain'

describe('keychain helpers', () => {
  it('isEncryptionAvailable returns a boolean', () => {
    expect(typeof isEncryptionAvailable()).toBe('boolean')
  })

  it('round-trip (skipped if encryption unavailable in test env)', () => {
    if (!isEncryptionAvailable()) return
    const plain = 'sk-groq-12345'
    const enc = encryptForStorage(plain)
    expect(enc).toBeInstanceOf(Buffer)
    expect(enc.toString('utf8')).not.toBe(plain)
    expect(decryptFromStorage(enc)).toBe(plain)
  })

  it('encrypts the same input to different bytes (random IV/nonce)', () => {
    if (!isEncryptionAvailable()) return
    const a = encryptForStorage('same')
    const b = encryptForStorage('same')
    expect(a.equals(b)).toBe(false)
    expect(decryptFromStorage(a)).toBe('same')
    expect(decryptFromStorage(b)).toBe('same')
  })

  it('encryptForStorage throws when encryption is unavailable', () => {
    if (isEncryptionAvailable()) return
    expect(() => encryptForStorage('test')).toThrow(/not available/i)
  })
})
