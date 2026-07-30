// Apply variant env vars and userData path BEFORE any other module reads them.
// Must be the first import in this file — see apply-variant-env.ts for details.
import './apply-variant-env'

import { app, globalShortcut, BrowserWindow, ipcMain, shell, Menu, session } from 'electron'
import { optimizer, is } from '@electron-toolkit/utils'
import { state, setIsQuitting, getMainWindow } from './state'
import { registerIpcHandlers, createWindow, toggleWindow } from './windowManager'
import { saveOnboardingCompleted, isOnboardingCompleted } from './python'
import {
  startCoreBackend,
  shutdownCoreBackend,
  ensurePythonSidecar,
  forceKillAllSync,
  stopActiveServices,
  getEconomyService
} from './coreManager'
import { logger, getLogsPath, getMainLogPath } from './logger'
import { setupUpdater } from './updater'
import { setupTTSHandlers, cleanupTTSHandlers } from './ttsIpcHandlers'
import { registerSecureStorageHandlers } from './ipc/secure-storage-handler'
import { registerPrivacyHandlers } from './ipc/privacy-handler'
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
import { CURRENT_VARIANT } from './variants'
import { ICON_PATH } from './constants'
import { TrayService } from './services/tray-service'
import { HttpLlamaControl } from './services/llama-control'
import { FileKeepInTrayReader } from './services/keep-in-tray-reader'
import { getOrCreateSessionToken } from './security/session-token'
import { shouldBlockWebviewAttachment } from './security/webview-block'
import { stopRendererStaticServer, ensureRendererStaticServer } from './renderer-static-server'
import {
  createYouTubeBeforeSendHeadersHandler,
  getYouTubeWebRequestFilterUrls
} from './youtube-session'
import { join, dirname } from 'path'
import { existsSync, mkdirSync } from 'fs'

let trayService: TrayService | null = null

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
ipcMain.handle('open-data-folder', () => shell.openPath(app.getPath('userData')))
ipcMain.handle('get-data-path', () => app.getPath('userData'))
ipcMain.handle('open-install-path', () => shell.openPath(dirname(app.getPath('exe'))))
ipcMain.handle('get-install-path', () => dirname(app.getPath('exe')))
ipcMain.handle('open-log-file', () => {
  const mainLogPath = getMainLogPath()
  shell.openPath(mainLogPath)
})
ipcMain.handle('open-models-folder', async () => {
  const modelsDir = process.env.MOMAI_MODELS_DIR || join(app.getPath('userData'), 'data', 'models')
  if (!existsSync(modelsDir)) {
    mkdirSync(modelsDir, { recursive: true })
  }
  const result = await shell.openPath(modelsDir)
  if (result) logger.warn('[Electron] open-models-folder:', result)
})
ipcMain.handle(
  'get-models-path',
  () => process.env.MOMAI_MODELS_DIR || join(app.getPath('userData'), 'data', 'models')
)
ipcMain.handle('open-llama-folder', async () => {
  const llamaDir = join(app.getAppPath(), 'bin', 'llama')
  const result = await shell.openPath(llamaDir)
  if (result) logger.warn('[Electron] open-llama-folder:', result)
})
ipcMain.handle('get-llama-path', () => join(app.getAppPath(), 'bin', 'llama'))
ipcMain.handle('check-model-file', async (_, fileName: string) => {
  const modelsDir = join(app.getPath('userData'), 'data', 'models')
  const filePath = join(modelsDir, fileName)
  return { exists: existsSync(filePath) }
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

// Log streaming state for real-time terminal view
const logStreamWatchers = new Map<
  string,
  { watcher: ReturnType<typeof import('fs').watch>; pos: number }
>()
ipcMain.handle('start-log-stream', (event) => {
  const mainLogPath = getMainLogPath()
  const fs = require('fs') as typeof import('fs')
  const sender = event.sender

  // Clean up previous watcher for this sender
  const key = event.sender.id.toString()
  const existing = logStreamWatchers.get(key)
  if (existing) {
    existing.watcher.close()
    logStreamWatchers.delete(key)
  }

  let pos = 0
  try {
    pos = fs.statSync(mainLogPath).size
  } catch {}

  const watcher = fs.watch(mainLogPath, () => {
    try {
      const currentSize = fs.statSync(mainLogPath).size
      if (currentSize <= pos) {
        pos = currentSize
        return
      }
      const fd = fs.openSync(mainLogPath, 'r')
      const buf = Buffer.alloc(currentSize - pos)
      fs.readSync(fd, buf, 0, buf.length, pos)
      fs.closeSync(fd)
      pos = currentSize
      const lines = buf.toString('utf-8').split('\n').filter(Boolean)
      for (const line of lines) {
        const match = line.match(/^\[(\d{2}):(\d{2}):(\d{2})\.(\d{3})\]\s*\[(\w+)\]\s*(.*)$/)
        if (match) {
          const [, h, min, s, ms, level, message] = match
          sender.send('log-line', {
            timestamp: `${h}:${min}:${s}.${ms}`,
            level: level.toLowerCase(),
            component: detectLogComponent(message),
            message,
            raw: line
          })
        } else {
          sender.send('log-line', {
            timestamp: '',
            level: 'info',
            component: 'system',
            message: line,
            raw: line
          })
        }
      }
    } catch {}
  })

  logStreamWatchers.set(key, { watcher, pos })
  sender.on('destroyed', () => {
    watcher.close()
    logStreamWatchers.delete(key)
  })
})
ipcMain.handle('stop-log-stream', (event) => {
  const key = event.sender.id.toString()
  const existing = logStreamWatchers.get(key)
  if (existing) {
    existing.watcher.close()
    logStreamWatchers.delete(key)
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

ipcMain.on('reset-onboarding', async () => {
  logger.info('[Electron] Resetting onboarding status')
  state.isFirstLaunch = true
  saveOnboardingCompleted(false)
  setIsQuitting(false)

  // Notify renderer to reset its boot/loading state. Without this, the
  // renderer's `wasEverBooted` and `animationFinished` flags stay sticky
  // from the previous session, so ContainerChat never re-shows the
  // LoadingAnimation while the Python sidecar is being reinstalled.
  if (state.mainWindow && !state.mainWindow.isDestroyed()) {
    state.mainWindow.webContents.send('momai_rebooting')
  }

  // Stop LLM, Python (Wake Word) and TTS to ensure silence during onboarding
  void stopActiveServices().catch((err) => {
    logger.error('[Electron] Failed to stop services on onboarding reset:', err)
  })
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

app.on('web-contents-created', (_event, contents) => {
  if (shouldBlockWebviewAttachment()) {
    contents.on('will-attach-webview', (event) => {
      event.preventDefault()
    })
  }
})

app.whenReady().then(async () => {
  // Generate a per-session token before any backend is spawned.
  process.env.MOMAI_SESSION_TOKEN = getOrCreateSessionToken()

  // Show the window immediately — everything else can happen after.
  createWindow()

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Deferred: register handlers, start backend, tray, etc.
  setImmediate(async () => {
    // Ensure Windows taskbar resolves correct name & icon in dev mode
    if (is.dev && process.platform === 'win32') {
      try {
        const shortcutPath = join(
          app.getPath('appData'),
          'Microsoft',
          'Windows',
          'Start Menu',
          'Programs',
          `${CURRENT_VARIANT.appName}.lnk`
        )
        shell.writeShortcutLink(shortcutPath, 'replace', {
          target: process.execPath,
          args: process.argv.slice(1).join(' '),
          appUserModelId: CURRENT_VARIANT.appId,
          icon: ICON_PATH,
          iconIndex: 0,
          description: CURRENT_VARIANT.appName
        })
      } catch (err) {
        logger.warn('[Electron] Failed to create dev Start Menu shortcut:', err)
      }
    }

    if (!is.dev) {
      Menu.setApplicationMenu(null)
    }

    registerIpcHandlers()
    setupTTSHandlers()
    registerSecureStorageHandlers()
    registerPrivacyHandlers()

    if (!is.dev) {
      await ensureRendererStaticServer(join(__dirname, '../renderer'))
    }

    session.defaultSession.webRequest.onBeforeSendHeaders(
      { urls: getYouTubeWebRequestFilterUrls() },
      createYouTubeBeforeSendHeadersHandler()
    )

    const mainWindow = getMainWindow()
    if (mainWindow) {
      trayService = new TrayService({
        window: mainWindow,
        llama: new HttpLlamaControl(CURRENT_VARIANT.llamaPort),
        keepInTray: new FileKeepInTrayReader(),
        isQuitting: () => state.isQuitting,
        variant: CURRENT_VARIANT,
        getEconomy: getEconomyService
      })
      trayService.start()
    }

    // Setup updater and start backend AFTER window is visible
    setupUpdater()
    startCoreBackend().catch((error) => {
      logger.error('[Electron] Failed to start core backend:', error)
    })

    globalShortcut.register('Alt+Space', toggleWindow)
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', (e) => {
  if (state.isQuitting) return
  e.preventDefault()
  setIsQuitting(true)

  logger.info('[Electron] before-quit: Iniciando shutdown...')
  globalShortcut.unregisterAll()
  cleanupTTSHandlers()
  stopRendererStaticServer()
  trayService?.stop()

  // Fechar imediatamente todas as janelas para dar resposta instantânea ao usuário
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.destroy()
    }
  }

  void (async () => {
    try {
      await shutdownCoreBackend()
    } catch (err) {
      logger.warn('[Electron] shutdownCoreBackend failed:', err)
    }

    forceKillAllSync()
    logger.info('[Electron] Shutdown completo. Saindo...')
    app.exit(0)
  })()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
