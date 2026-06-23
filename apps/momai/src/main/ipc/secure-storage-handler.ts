import { ipcMain, safeStorage } from 'electron'
import { logger } from '../logger'

/**
 * IPC handlers that allow subprocess workers (e.g. WhatsApp extension)
 * to encrypt/decrypt secrets using the OS keychain (DPAPI / Keychain / libsecret).
 *
 * Returns null on encryption failure (caller should fall back to plain + warn).
 */
export function registerSecureStorageHandlers(): void {
  ipcMain.handle(
    'secure-storage:encrypt',
    async (_event, plain: string): Promise<Buffer | null> => {
      if (!safeStorage.isEncryptionAvailable()) {
        logger.warn('[secure-storage] OS keychain not available, refusing to encrypt')
        return null
      }
      try {
        return safeStorage.encryptString(plain)
      } catch (e) {
        logger.error('[secure-storage] encrypt failed', e)
        return null
      }
    }
  )

  ipcMain.handle(
    'secure-storage:decrypt',
    async (_event, encrypted: Buffer): Promise<string | null> => {
      if (!safeStorage.isEncryptionAvailable()) {
        logger.warn('[secure-storage] OS keychain not available, refusing to decrypt')
        return null
      }
      try {
        return safeStorage.decryptString(encrypted)
      } catch (e) {
        logger.error('[secure-storage] decrypt failed', e)
        return null
      }
    }
  )
}
