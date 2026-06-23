import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const { mockSafeStorage } = vi.hoisted(() => ({
  mockSafeStorage: {
    isEncryptionAvailable: vi.fn(() => true),
    encryptString: vi.fn((s: string) => Buffer.from('enc:' + s, 'utf-8')),
    decryptString: vi.fn((b: Buffer) => {
      const s = b.toString('utf-8')
      return s.startsWith('enc:') ? s.slice(4) : ''
    })
  }
}))

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp'),
    getVersion: vi.fn(() => '1.0.0'),
    getName: vi.fn(() => 'MomAI'),
    getLocale: vi.fn(() => 'en-US')
  },
  safeStorage: mockSafeStorage
}))

import { safeStorage } from 'electron'
import { encryptNote, decryptNote } from './note-crypto'

describe('note-crypto', () => {
  let dataDir: string

  beforeEach(() => {
    mockSafeStorage.isEncryptionAvailable.mockImplementation(() => true)
    mockSafeStorage.encryptString.mockImplementation((s: string) =>
      Buffer.from('enc:' + s, 'utf-8')
    )
    mockSafeStorage.decryptString.mockImplementation((b: Buffer) => {
      const s = b.toString('utf-8')
      return s.startsWith('enc:') ? s.slice(4) : ''
    })
    mockSafeStorage.encryptString.mockClear()
    mockSafeStorage.decryptString.mockClear()
    mockSafeStorage.isEncryptionAvailable.mockClear()
    dataDir = mkdtempSync(join(tmpdir(), 'momai-note-crypto-'))
  })

  afterEach(() => {
    rmSync(dataDir, { recursive: true, force: true })
  })

  it('roundtrips plain text through encrypt/decrypt', () => {
    const plain = 'minha nota secreta: senha = 12345'
    const enc = encryptNote(plain, dataDir)
    expect(enc).not.toBeNull()
    expect(enc).not.toContain('senha')
    expect(enc).not.toContain('12345')
    expect(enc).not.toContain('nota secreta')
    expect(decryptNote(enc!, dataDir)).toBe(plain)
  })

  it('produces different ciphertext for the same plaintext (random IV)', () => {
    const plain = 'same content'
    const a = encryptNote(plain, dataDir)
    const b = encryptNote(plain, dataDir)
    expect(a).not.toBe(b)
    expect(decryptNote(a!, dataDir)).toBe(plain)
    expect(decryptNote(b!, dataDir)).toBe(plain)
  })

  it('returns null when safeStorage is unavailable on encrypt', () => {
    vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValueOnce(false)
    expect(encryptNote('test', dataDir)).toBeNull()
  })

  it('returns null when safeStorage is unavailable on decrypt', () => {
    const enc = encryptNote('test', dataDir)
    expect(enc).not.toBeNull()
    vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(false)
    expect(decryptNote(enc!, dataDir)).toBeNull()
  })

  it('returns null for tampered ciphertext (auth tag verification)', () => {
    const enc = encryptNote('original content', dataDir)
    expect(enc).not.toBeNull()
    const buf = Buffer.from(enc!, 'base64')
    buf[buf.length - 1] = buf[buf.length - 1] ^ 0xff
    const tampered = buf.toString('base64')
    expect(decryptNote(tampered, dataDir)).toBeNull()
  })

  it('returns null for ciphertext too short to contain IV + tag', () => {
    expect(decryptNote('AAAA', dataDir)).toBeNull()
  })

  it('persists the encryption marker across calls (stable key)', () => {
    const enc1 = encryptNote('first', dataDir)
    const enc2 = encryptNote('second', dataDir)
    expect(decryptNote(enc1!, dataDir)).toBe('first')
    expect(decryptNote(enc2!, dataDir)).toBe('second')
  })

  it('reuses the persisted marker when the dataDir is the same', () => {
    encryptNote('first call', dataDir)
    const callsAfterFirst = vi.mocked(safeStorage.encryptString).mock.calls.length
    encryptNote('second call', dataDir)
    expect(vi.mocked(safeStorage.encryptString).mock.calls.length).toBe(callsAfterFirst)
  })

  it('handles unicode content correctly', () => {
    const plain = 'Olá mundo! 你好世界 🌍 — chave: 漢字'
    const enc = encryptNote(plain, dataDir)
    expect(enc).not.toBeNull()
    expect(decryptNote(enc!, dataDir)).toBe(plain)
  })

  it('handles empty string', () => {
    const enc = encryptNote('', dataDir)
    expect(enc).not.toBeNull()
    expect(decryptNote(enc!, dataDir)).toBe('')
  })

  it('handles long content', () => {
    const plain = 'x'.repeat(10000)
    const enc = encryptNote(plain, dataDir)
    expect(enc).not.toBeNull()
    expect(decryptNote(enc!, dataDir)).toBe(plain)
  })
})
