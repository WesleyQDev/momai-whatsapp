import { safeStorage } from 'electron'

export function isEncryptionAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
}

export function encryptForStorage(plain: string): Buffer {
  if (!isEncryptionAvailable()) {
    throw new Error('OS keychain is not available. Refusing to write plaintext.')
  }
  return safeStorage.encryptString(plain)
}

export function decryptFromStorage(encrypted: Buffer): string {
  if (!isEncryptionAvailable()) {
    throw new Error('OS keychain is not available. Cannot decrypt.')
  }
  return safeStorage.decryptString(encrypted)
}
