import './env'
import { app, globalShortcut, BrowserWindow, ipcMain, shell } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { state, setIsQuitting } from './state'
import { registerIpcHandlers, createWindow, toggleWindow } from './windowManager'
import { saveOnboardingCompleted, isOnboardingCompleted } from './python'
import {
  startCoreBackend,
  shutdownCoreBackend,
  ensurePythonSidecar,
  forceKillAllSync
} from './coreManager'
import { logger, getLogsPath, getMainLogPath } from './logger'
import { setupUpdater } from './updater'
import { setupTTSHandlers, cleanupTTSHandlers } from './ttsIpcHandlers'
import {
  createFolder,
  createNote,
  deleteFolder,
  deleteNote,
  getNote,
  importNotes,
  listFolders,
  listNotes,
  openNoteFolder,
  renameFolder,
  searchNotes,
  updateNote
} from './notesService'

// Initialize first launch state correctly at startup
state.isFirstLaunch = !isOnboardingCompleted()

ipcMain.handle('get-auto-start', () => {
  return app.getLoginItemSettings().openAtLogin
})

ipcMain.handle('set-auto-start', (_, enabled: boolean) => {
  app.setLoginItemSettings({
    openAtLogin: enabled,
    openAsHidden: true
  })
  return app.getLoginItemSettings().openAtLogin
})

// Fix for invisible windows on Linux VMs (Hyper-V, VirtualBox) and some Wayland compositors
if (process.platform === 'linux') {
  app.disableHardwareAcceleration()
}

logger.info(
  `[Electron] Starting MomAI... ${app.getVersion()} (First launch: ${state.isFirstLaunch})`
)
logger.info(
  `[Electron] Platform: ${process.platform} | Arch: ${process.arch} | Node: ${process.version}`
)

const gotSingleInstanceLock = app.requestSingleInstanceLock()

if (!gotSingleInstanceLock) {
  logger.warn('[Electron] Another instance is already running, quitting...')
  app.quit()
} else {
  app.on('second-instance', () => {
    logger.info('[Electron] Second instance requested, showing window...')
    createWindow()
  })
}

process.on('uncaughtException', (error) => {
  logger.error('[Electron] Uncaught Exception:', error)
})

process.on('unhandledRejection', (reason) => {
  logger.error('[Electron] Unhandled Rejection:', reason)
})

ipcMain.handle('get-logs-path', () => getLogsPath())
ipcMain.handle('open-logs-folder', () => {
  const mainLogPath = getMainLogPath()
  shell.showItemInFolder(mainLogPath)
})
ipcMain.handle('read-logs', async (_, lines = 200) => {
  try {
    const fs = await import('fs/promises')
    const logPath = getMainLogPath()

    const content = await fs.readFile(logPath, 'utf-8')
    const allLines = content.trim().split('\n').filter(Boolean)
    const recentLines = allLines.slice(-lines)

    const logEntries = recentLines.map((line) => {
      const match = line.match(
        /^\[(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})\.(\d{3})\]\s*\[(\w+)\]\s*(.*)$/
      )
      if (match) {
        const [, , , , h, min, s, ms, level, message] = match
        const component = detectLogComponent(message)
        return {
          timestamp: `${h}:${min}:${s}.${ms}`,
          level: level.toLowerCase(),
          component,
          message,
          raw: line
        }
      }
      return { timestamp: '', level: 'info', component: 'system', message: line, raw: line }
    })

    return { success: true, entries: logEntries }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

function detectLogComponent(message: string): string {
  const msg = message.toLowerCase()
  if (msg.includes('[llama]') || msg.includes('model') || msg.includes('llama-server'))
    return 'model'
  if (msg.includes('[chat]') || msg.includes('streamllamachat') || msg.includes('assistant'))
    return 'chat'
  if (msg.includes('[voice]') || msg.includes('tts') || msg.includes('wake') || msg.includes('stt'))
    return 'voice'
  if (msg.includes('[embedding]') || msg.includes('semantic')) return 'embedding'
  if (msg.includes('[python]') || msg.includes('sidecar')) return 'python'
  if (msg.includes('[electron]') || msg.includes('bootstrap')) return 'system'
  return 'system'
}
ipcMain.handle('get-app-version', () => app.getVersion())

ipcMain.handle('is-first-launch', () => {
  return state.isFirstLaunch
})

ipcMain.on('reset-onboarding', () => {
  logger.info('[Electron] Resetting onboarding status')
  state.isFirstLaunch = true
  saveOnboardingCompleted(false)
})

ipcMain.on('restart-app', async () => {
  logger.info('[Electron] Restarting application services (Soft Restart)...')

  // 1. Physically reset onboarding status
  saveOnboardingCompleted(false)
  state.isFirstLaunch = true

  // 2. Reload the main window IMMEDIATELY for instant UI feedback
  const win = state.mainWindow
  if (win && !win.isDestroyed()) {
    win.webContents.reload()
  }

  // 3. Handle backend restart in the background
  // We don't await this so the UI doesn't hang
  void (async () => {
    try {
      // Shutdown current backends (cuts LLMs/Whisper immediately)
      await shutdownCoreBackend()
      setIsQuitting(false)
      // Start fresh backends
      await startCoreBackend()
    } catch (err) {
      logger.error('[Electron] Failed to background-restart backend:', err)
    }
  })()
})

ipcMain.on('mark-first-launch-finished', () => {
  logger.info('[Electron] Onboarding finished, marking first launch as false')
  state.isFirstLaunch = false
  saveOnboardingCompleted(true)

  // After onboarding, check if we need to start the Python sidecar (Pro/Ultra)
  void ensurePythonSidecar().catch((err) => {
    logger.warn('[Bootstrap] Failed to start Python sidecar after onboarding:', err)
  })
})

ipcMain.on('report-bootstrap-error', (_, error: string) => {
  logger.error('[Bootstrap] Error reported from renderer:', error)
  if (state.mainWindow && !state.mainWindow.isDestroyed()) {
    state.mainWindow.webContents.send('bootstrap-failed', error)
  }
})

ipcMain.handle('notes:list', async () => listNotes())
ipcMain.handle('notes:get', async (_, noteId: string) => getNote(noteId))
ipcMain.handle(
  'notes:create',
  async (_, payload: { title: string; content: string; path?: string }) =>
    createNote(payload.title, payload.content, payload.path)
)
ipcMain.handle(
  'notes:update',
  async (_, noteId: string, payload: { title?: string; content?: string; path?: string }) =>
    updateNote(noteId, payload)
)
ipcMain.handle('notes:delete', async (_, noteId: string) => deleteNote(noteId))
ipcMain.handle('notes:import', async (_, files: { name: string; content: string }[]) =>
  importNotes(files)
)
ipcMain.handle('notes:folders:list', async () => listFolders())
ipcMain.handle('notes:folders:create', async (_, pathValue: string) => createFolder(pathValue))
ipcMain.handle('notes:folders:rename', async (_, oldPath: string, newPath: string) =>
  renameFolder(oldPath, newPath)
)
ipcMain.handle('notes:folders:delete', async (_, pathValue: string) => deleteFolder(pathValue))
ipcMain.handle('notes:open-folder', async (_, noteId: string) => openNoteFolder(noteId))
ipcMain.handle('notes:search', async (_, query: string, limit?: number) =>
  searchNotes(query, limit ?? 6)
)

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.wesleyqdev.momai')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerIpcHandlers()
  setupTTSHandlers()
  setupUpdater()

  createWindow()
  startCoreBackend().catch((error) => {
    logger.error('[Electron] Failed to start core backend:', error)
  })

  globalShortcut.register('Alt+Space', toggleWindow)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => {
  if (state.isQuitting) return
  setIsQuitting(true)

  logger.info('[Electron] before-quit: Iniciando shutdown...')
  globalShortcut.unregisterAll()
  cleanupTTSHandlers()

  forceKillAllSync()

  logger.info('[Electron] Shutdown completo. Saindo...')
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
