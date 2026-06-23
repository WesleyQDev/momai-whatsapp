// TDD: Privacy IPC handler in the main process. It bridges the renderer
// (`window.momaiAPI.privacy.exportData()` / `deleteAll()`) to the Node Core
// sidecar (GET /privacy/export and POST /privacy/delete-all).
//
// On export, the main process asks the user where to save (showSaveDialog),
// copies the sidecar's temp file to the chosen location, then unlinks the
// temp file to keep the userData dir clean.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  BrowserWindow: {
    getAllWindows: () => []
  },
  dialog: {
    showSaveDialog: vi.fn()
  },
  app: {
    isPackaged: false,
    getAppPath: () => '/mock/app',
    getPath: (name: string) => `/mock/${name}`,
    getVersion: () => '0.0.0-test'
  }
}))

vi.mock('../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}))

vi.mock('../security/authenticated-fetch', () => ({
  authFetch: vi.fn()
}))

import { ipcMain, dialog } from 'electron'
import { authFetch } from '../security/authenticated-fetch'
import { registerPrivacyHandlers } from './privacy-handler'

function makeTempFile() {
  const dir = mkdtempSync(join(tmpdir(), 'momai-ipc-privacy-'))
  const file = join(dir, 'export.zip')
  writeFileSync(file, 'fake-zip-content')
  return { dir, file }
}

function getHandler(channel) {
  const call = vi.mocked(ipcMain.handle).mock.calls.find((c) => c[0] === channel)
  if (!call) throw new Error(`no handler for ${channel}`)
  return call[1] as (event: any) => Promise<any>
}

describe('privacy-handler IPC', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('registers two IPC handlers: privacy:export and privacy:delete-all', () => {
    registerPrivacyHandlers()
    expect(ipcMain.handle).toHaveBeenCalledWith('privacy:export', expect.any(Function))
    expect(ipcMain.handle).toHaveBeenCalledWith('privacy:delete-all', expect.any(Function))
  })

  it('privacy:export fetches the ZIP path from node-core, copies to user-chosen location, cleans up', async () => {
    const { dir, file } = makeTempFile()
    const saved = join(dir, 'saved.zip')
    try {
      vi.mocked(authFetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, path: file, keepModels: false })
      } as any)
      vi.mocked(dialog.showSaveDialog).mockResolvedValueOnce({
        canceled: false,
        filePath: saved
      } as any)

      registerPrivacyHandlers()
      const handler = getHandler('privacy:export')
      const result = await handler({})

      expect(result).toEqual({ ok: true, filePath: saved, size: 16 })
      expect(authFetch).toHaveBeenCalledWith(
        expect.stringContaining('/privacy/export'),
        expect.objectContaining({ method: 'GET' })
      )
      // file copied to user-chosen location
      expect(existsSync(saved)).toBe(true)
      expect(readFileSync(saved, 'utf8')).toBe('fake-zip-content')
      // source temp file is removed after copy
      expect(existsSync(file)).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('privacy:export returns canceled:true when user cancels the dialog', async () => {
    const { dir, file } = makeTempFile()
    try {
      vi.mocked(authFetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, path: file, keepModels: false })
      } as any)
      vi.mocked(dialog.showSaveDialog).mockResolvedValueOnce({
        canceled: true
      } as any)

      registerPrivacyHandlers()
      const handler = getHandler('privacy:export')
      const result = await handler({})
      expect(result).toEqual({ ok: false, canceled: true })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('privacy:export returns ok:false and does not throw when node-core responds with error', async () => {
    vi.mocked(authFetch).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ ok: false, error: 'export failed' })
    } as any)

    registerPrivacyHandlers()
    const handler = getHandler('privacy:export')
    const result = await handler({})
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/export failed/i)
  })

  it('privacy:delete-all POSTs to node-core with confirmation token', async () => {
    vi.mocked(authFetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, removed: ['node-core-store.json'] })
    } as any)

    registerPrivacyHandlers()
    const handler = getHandler('privacy:delete-all')
    const result = await handler({})

    expect(result.ok).toBe(true)
    expect(result.removed).toContain('node-core-store.json')
    expect(authFetch).toHaveBeenCalledWith(
      expect.stringContaining('/privacy/delete-all'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ confirmation: 'DELETE_ALL_MY_DATA' })
      })
    )
  })

  it('privacy:delete-all surfaces 400 from node-core (no confirmation)', async () => {
    vi.mocked(authFetch).mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({
        ok: false,
        error: 'confirmation required: send { "confirmation": "DELETE_ALL_MY_DATA" }'
      })
    } as any)

    registerPrivacyHandlers()
    const handler = getHandler('privacy:delete-all')
    const result = await handler({})
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/confirmation/i)
  })
})
