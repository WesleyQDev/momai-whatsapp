import './env'
import { app, globalShortcut, BrowserWindow, ipcMain, shell } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { state, setIsQuitting } from './state'
import { registerIpcHandlers, createWindow, toggleWindow } from './windowManager'
import { saveOnboardingCompleted } from './pythonManager'
import { startCoreBackend, shutdownCoreBackend } from './coreManager'
import { logger, getLogsPath, getMainLogPath } from './logger'
import { setupUpdater } from './updater'
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

logger.info(`[Electron] Starting MomAI... ${app.getVersion()}`)

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
ipcMain.handle('get-app-version', () => app.getVersion())

ipcMain.handle('is-first-launch', () => {
  return state.isFirstLaunch
})

ipcMain.on('reset-onboarding', () => {
  logger.info('[Electron] Resetting onboarding status')
  state.isFirstLaunch = true
  saveOnboardingCompleted(false)
})

ipcMain.on('mark-first-launch-finished', () => {
  logger.info('[Electron] Onboarding finished, marking first launch as false')
  state.isFirstLaunch = false
  saveOnboardingCompleted(true)
})

ipcMain.on('report-bootstrap-error', (_, error: string) => {
  logger.error('[Bootstrap] Error reported from renderer:', error)
  if (state.mainWindow && !state.mainWindow.isDestroyed()) {
    state.mainWindow.webContents.send('bootstrap-failed', error)
  }
})

ipcMain.handle('notes:list', async () => listNotes())
ipcMain.handle('notes:get', async (_, noteId: string) => getNote(noteId))
ipcMain.handle('notes:create', async (_, payload: { title: string; content: string; path?: string }) =>
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
ipcMain.handle('notes:search', async (_, query: string, limit?: number) => searchNotes(query, limit ?? 6))

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.wesleyqdev.momai')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerIpcHandlers()
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

app.on('will-quit', async (event) => {
  if (state.isQuitting) return
  setIsQuitting(true)
  event.preventDefault()

  logger.info('[Electron] will-quit event triggered. Iniciando shutdown...')
  globalShortcut.unregisterAll()

  await shutdownCoreBackend()

  logger.info('[Electron] Shutdown completo.')
  app.quit()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
