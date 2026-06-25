import { ipcMain, BrowserWindow, dialog } from 'electron'
import { statSync, unlinkSync, existsSync, mkdirSync, copyFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { authFetch } from '../security/authenticated-fetch'
import { logger } from '../logger'
import { API_BASE_URL } from '../constants'

/**
 * LGPD (Brazilian data protection law) compliance endpoints, exposed to the
 * renderer as `window.momaiAPI.privacy.exportData()` and `deleteAll()`.
 *
 * The Node Core sidecar implements the actual logic:
 *   - GET  /privacy/export     → returns { ok, path } where `path` is a temp ZIP
 *   - POST /privacy/delete-all → returns { ok, removed }
 *
 * On export, we read the temp file the sidecar just wrote, ask the user
 * where to save via showSaveDialog, copy the bytes to the chosen location,
 * then unlink the source temp file to keep the userData dir clean.
 */
export function registerPrivacyHandlers(
  options: { getMainWindow?: () => BrowserWindow | null } = {}
) {
  const getMainWindow = options.getMainWindow ?? (() => BrowserWindow.getAllWindows()[0] || null)

  ipcMain.handle('privacy:export', async () => {
    let sourcePath: string | null = null
    try {
      const res = await authFetch(`${API_BASE_URL}/privacy/export`, { method: 'GET' })
      const payload = (await res.json().catch(() => ({}))) as {
        ok: boolean
        path?: string
        keepModels?: boolean
        error?: string
      }
      if (!res.ok || !payload.ok || !payload.path) {
        return { ok: false, error: payload.error || `export failed: HTTP ${res.status}` }
      }
      sourcePath = payload.path

      if (!existsSync(sourcePath)) {
        return { ok: false, error: 'export temp file missing' }
      }
      const size = statSync(sourcePath).size
      const win = getMainWindow()

      // Ask the user where to save. Fall back to userData if dialog fails.
      const defaultName = `momai-export-${new Date().toISOString().slice(0, 10)}.zip`
      let target = ''
      try {
        const r = await dialog.showSaveDialog(win ?? (undefined as any), {
          title: 'Export MomAI data',
          defaultPath: defaultName,
          filters: [{ name: 'ZIP archive', extensions: ['zip'] }]
        })
        if (r.canceled || !r.filePath) {
          return { ok: false, canceled: true }
        }
        target = r.filePath
      } catch (e) {
        logger.warn('[privacy] showSaveDialog failed, falling back to userData:', e)
        target = ''
      }

      if (!target) {
        // No dialog available — just report the path so the renderer can do
        // something. We won't unlink in this branch.
        return { ok: true, filePath: sourcePath, size, sourceOnly: true }
      }

      mkdirSync(dirname(target), { recursive: true })
      copyFileSync(sourcePath, target)
      logger.info(`[privacy] exported ${size} bytes to ${target}`)
      return { ok: true, filePath: target, size }
    } catch (err) {
      logger.error('[privacy] export failed:', err)
      return { ok: false, error: String((err as Error)?.message || err) }
    } finally {
      if (sourcePath && existsSync(sourcePath)) {
        try {
          unlinkSync(sourcePath)
          logger.info(`[privacy] cleaned up export temp file: ${sourcePath}`)
        } catch (e) {
          logger.warn('[privacy] failed to remove temp file:', e)
        }
      }
    }
  })

  ipcMain.handle('privacy:delete-all', async () => {
    try {
      const res = await authFetch(`${API_BASE_URL}/privacy/delete-all`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmation: 'DELETE_ALL_MY_DATA' })
      })
      const payload = (await res.json().catch(() => ({}))) as {
        ok: boolean
        removed?: string[]
        keepModels?: boolean
        error?: string
      }
      if (!res.ok || !payload.ok) {
        return {
          ok: false,
          error: payload.error || `delete-all failed: HTTP ${res.status}`,
          status: res.status
        }
      }
      logger.info(`[privacy] delete-all succeeded, removed ${payload.removed?.length || 0} entries`)
      return { ok: true, removed: payload.removed || [], keepModels: !!payload.keepModels }
    } catch (err) {
      logger.error('[privacy] delete-all failed:', err)
      return { ok: false, error: String((err as Error)?.message || err) }
    }
  })

  // Dev-only: wipes everything (DB, messages, LLMs, cache, python_env)
  // including skill data. Only registered when running via `pnpm run dev`.
  // The renderer is responsible for triggering the onboarding flow after
  // the wipe (same pattern as `resetOnboarding` in useSettingsCard):
  // call this endpoint, then call `window.momaiAPI.resetOnboarding()`
  // to mark first launch and show the welcome screen.
  ipcMain.handle('privacy:dev-reset', async () => {
    try {
      const res = await authFetch(`${API_BASE_URL}/privacy/dev-reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmation: 'DEV_RESET_TO_ZERO' })
      })
      const payload = (await res.json().catch(() => ({}))) as {
        ok: boolean
        removed?: string[]
        mode?: string
        error?: string
      }
      if (!res.ok || !payload.ok) {
        return {
          ok: false,
          error: payload.error || `dev-reset failed: HTTP ${res.status}`,
          status: res.status
        }
      }
      logger.info(
        `[privacy] dev-reset succeeded, removed ${payload.removed?.length || 0} entries`
      )
      return { ok: true, removed: payload.removed || [], mode: payload.mode }
    } catch (err) {
      logger.error('[privacy] dev-reset failed:', err)
      return { ok: false, error: String((err as Error)?.message || err) }
    }
  })
}
