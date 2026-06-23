import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => true),
    encryptString: vi.fn((s: string) => Buffer.from('enc:' + s)),
    decryptString: vi.fn((b: Buffer) => b.toString().replace('enc:', ''))
  }
}))

vi.mock('../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}))

import { ipcMain, safeStorage } from 'electron'
import { registerSecureStorageHandlers } from './secure-storage-handler'

describe('secure-storage-handler', () => {
  beforeEach(() => vi.clearAllMocks())

  it('registers two IPC handlers: encrypt and decrypt', () => {
    registerSecureStorageHandlers()
    expect(ipcMain.handle).toHaveBeenCalledWith('secure-storage:encrypt', expect.any(Function))
    expect(ipcMain.handle).toHaveBeenCalledWith('secure-storage:decrypt', expect.any(Function))
  })

  it('encrypt handler returns null when safeStorage unavailable', async () => {
    vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValueOnce(false)
    registerSecureStorageHandlers()
    const handler = vi
      .mocked(ipcMain.handle)
      .mock.calls.find((c) => c[0] === 'secure-storage:encrypt')?.[1] as any
    expect(await handler({}, 'hello')).toBeNull()
  })

  it('encrypt handler returns Buffer when safeStorage available', async () => {
    registerSecureStorageHandlers()
    const handler = vi
      .mocked(ipcMain.handle)
      .mock.calls.find((c) => c[0] === 'secure-storage:encrypt')?.[1] as any
    const result = await handler({}, 'hello')
    expect(result).toBeInstanceOf(Buffer)
    expect(result?.toString()).toBe('enc:hello')
  })

  it('decrypt handler returns string when safeStorage available', async () => {
    registerSecureStorageHandlers()
    const handler = vi
      .mocked(ipcMain.handle)
      .mock.calls.find((c) => c[0] === 'secure-storage:decrypt')?.[1] as any
    const result = await handler({}, Buffer.from('enc:hello'))
    expect(result).toBe('hello')
  })
})
