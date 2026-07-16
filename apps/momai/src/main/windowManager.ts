import {
  BrowserWindow,
  screen,
  shell,
  ipcMain,
  Menu,
  nativeImage,
  app,
  Notification
} from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import {
  state,
  setMainWindow,
  setOverlayWindow,
  setIpcHandlersRegistered,
  setIsQuitting,
  setPendingOverlayData,
  consumePendingOverlayData
} from './state'
import { logger } from './logger'
import { restartCoreBackend } from './coreManager'
import { scanInstalledGames } from './economyScanner'
import { API_BASE_URL, WS_BASE_URL, ICON_PATH } from './constants'
import { authFetch } from './security/authenticated-fetch'
import { isSafeExternalUrl } from './security/safe-external-url'
import { shouldBlockDevToolsShortcut } from './security/devtools-block'
import { secureWriteFileSync } from './security/fs-permissions'
import { ensureRendererStaticServer } from './renderer-static-server'
import { resolveRendererLoadUrl } from './renderer-load-path'

const RENDERER_DIR = join(__dirname, '../renderer')

function loadRendererContents(window: BrowserWindow, routeHash?: string): void {
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void window.loadURL(
      resolveRendererLoadUrl({
        isDev: true,
        electronRendererUrl: process.env['ELECTRON_RENDERER_URL'],
        productionBaseUrl: '',
        routeHash
      })
    )
    return
  }

  void (async () => {
    const baseUrl = await ensureRendererStaticServer(RENDERER_DIR)
    const url = resolveRendererLoadUrl({
      isDev: false,
      productionBaseUrl: baseUrl,
      routeHash
    })
    await window.loadURL(url)
  })()
}

async function controlWakeWord(enabled: boolean): Promise<void> {
  try {
    await authFetch(`${API_BASE_URL}/voice/wake-word`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled })
    })
    logger.info(`[WindowManager] Wake word ${enabled ? 'enabled' : 'disabled'}`)
  } catch (err) {
    logger.error('[WindowManager] Failed to control wake word:', err)
  }
}

let isWindowMinimizing = false

function getMainWindow(): BrowserWindow | null {
  return state.mainWindow && !state.mainWindow.isDestroyed() ? state.mainWindow : null
}

let lastEconomyState: any = { active: false, reason: null, detectedGames: [] }

export function broadcastEconomyState(state: {
  active: boolean
  reason: string | null
  detectedGames: {
    name: string
    processName: string
    steamGridId?: number | null
    coverUrl?: string | null
  }[]
}): void {
  lastEconomyState = state
  const win = getMainWindow()
  if (win) {
    win.webContents.send('economy:state-change', state)
  }
}

export function getLastEconomyState(): any {
  return lastEconomyState
}

export function registerIpcHandlers(): void {
  if (state.ipcHandlersRegistered) return
  setIpcHandlersRegistered(true)

  ipcMain.on('window-minimize', () => {
    const win = getMainWindow()
    if (win) win.minimize()
  })

  ipcMain.on('window-focus', () => {
    const win = getMainWindow()
    if (win) {
      if (win.isMinimized()) win.restore()
      if (!win.isVisible()) win.show()
      win.focus()
      win.webContents.send('focus-input')
    }
  })

  ipcMain.on('window-maximize', () => {
    const win = getMainWindow()
    if (!win) return
    if (win.isMaximized()) {
      win.unmaximize()
    } else {
      win.maximize()
    }
  })

  ipcMain.handle('is-window-maximized', () => {
    const win = getMainWindow()
    return win ? win.isMaximized() : false
  })

  ipcMain.on('window-close', () => {
    const win = getMainWindow()
    if (win) {
      win.close()
    } else {
      app.quit()
    }
  })

  ipcMain.on('window-set-resizable', (_, resizable: boolean) => {
    const win = getMainWindow()
    if (win) {
      win.setResizable(resizable)
      win.setMaximizable(resizable)
      if (!resizable && win.isMaximized()) {
        win.unmaximize()
      }
    }
  })

  ipcMain.on('show-notification', (event, { title, body, voice_response }) => {
    if (!Notification.isSupported()) return
    const n = new Notification({
      title,
      body,
      icon: ICON_PATH
    })

    n.on('click', () => {
      event.sender.send('notification-clicked', { title, body, voice_response })
    })

    n.on('failed', (_event, error) => {
      logger.warn('[WindowManager] Notification failed (macOS without code-signing):', error)
    })

    n.show()
  })

  ipcMain.handle('get-window-state', () => {
    const win = getMainWindow()
    if (!win) {
      return { minimized: false, visible: false }
    }
    return {
      minimized: win.isMinimized(),
      visible: win.isVisible()
    }
  })

  ipcMain.on('open-overlay', (_, data) => {
    logger.info(`[WindowManager] open-overlay IPC received, creating overlay window`)
    createOverlayWindow(data)
  })

  ipcMain.on('overlay-ready', () => {
    logger.info(`[WindowManager] overlay-ready IPC received, sending pending data`)
    const pendingData = consumePendingOverlayData()
    if (pendingData && state.overlayWindow && !state.overlayWindow.isDestroyed()) {
      state.overlayWindow.webContents.send('update-overlay-content', pendingData)
    }
  })

  ipcMain.on('close-overlay', () => {
    if (state.overlayWindow && !state.overlayWindow.isDestroyed()) {
      state.overlayWindow.hide()
    }
    const win = getMainWindow()
    if (win) {
      win.webContents.send('overlay-closed')
    }
  })

  ipcMain.on('overlay-action', (_, action) => {
    const win = getMainWindow()
    if (!win) return
    win.webContents.send('trigger-action', action)
  })

  ipcMain.on('app-ready', () => {
    const win = getMainWindow()
    if (!win) return
    if (win.isMaximized()) win.unmaximize()
    win.setSize(880, 670)
    win.setMinimumSize(450, 670)
  })

  ipcMain.handle('restart-backend', async () => {
    logger.info('[WindowManager] Reiniciando backend Node via IPC...')
    setIsQuitting(false)
    return restartCoreBackend()
  })

  ipcMain.handle('economy:get-state', () => {
    return getLastEconomyState()
  })

  ipcMain.handle('economy:get-preferences', () => {
    try {
      const { readFileSync, existsSync } = require('fs')
      const { join } = require('path')
      const prefsPath = join(app.getPath('userData'), 'economy-preferences.json')
      if (!existsSync(prefsPath)) secureWriteFileSync(prefsPath, '{}')
      return JSON.parse(readFileSync(prefsPath, 'utf-8'))
    } catch {
      return {}
    }
  })

  ipcMain.handle(
    'economy:set-game-preference',
    (_event, gameName: string, economyEnabled: boolean) => {
      try {
        const { readFileSync, existsSync } = require('fs')
        const { join } = require('path')
        const prefsPath = join(app.getPath('userData'), 'economy-preferences.json')
        const prefs = existsSync(prefsPath) ? JSON.parse(readFileSync(prefsPath, 'utf-8')) : {}
        prefs[gameName.toLowerCase()] = economyEnabled
        secureWriteFileSync(prefsPath, JSON.stringify(prefs, null, 2))
        return true
      } catch {
        return false
      }
    }
  )

  ipcMain.handle('economy:get-catalog', () => {
    try {
      const { readFileSync } = require('fs')
      const { join } = require('path')
      const catalogPath = join(__dirname, '../../src/main/data/known-games.json')
      const data = readFileSync(catalogPath, 'utf-8')
      return JSON.parse(data)
    } catch {
      return []
    }
  })

  ipcMain.handle('economy:scan-libraries', () => {
    return scanInstalledGames()
  })

  ipcMain.on('window-reset-size', () => {
    const win = getMainWindow()
    if (win) {
      if (win.isMaximized()) win.unmaximize()
      win.setSize(880, 670)
      win.center()
    }
  })
}

function getOverlayDimensions(data?: {
  structuredResponse?: { type?: string; data?: { conversationHistory?: unknown[] } }
}) {
  const type = data?.structuredResponse?.type
  if (type === 'extension-panel') {
    return { width: 440, height: 420 }
  }
  const historyLen = data?.structuredResponse?.data?.conversationHistory?.length ?? 0
  const width = 440
  if (historyLen > 0) {
    return { width, height: 540 }
  }
  return { width, height: 400 }
}

export function createOverlayWindow(data?: any): void {
  let isNew = false
  const { width, height } = getOverlayDimensions(data)

  if (data) {
    setPendingOverlayData(data)
  }

  if (!state.overlayWindow || state.overlayWindow.isDestroyed()) {
    isNew = true
    const overlayWindow = new BrowserWindow({
      width,
      height,
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      alwaysOnTop: true,
      resizable: false,
      hasShadow: true,
      skipTaskbar: true,
      icon: ICON_PATH,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: true,
        additionalArguments: [
          `--momai-api-url=${API_BASE_URL}`,
          `--momai-ws-url=${WS_BASE_URL}`,
          `--momai-is-dev=${is.dev}`
        ]
      }
    })

    setOverlayWindow(overlayWindow)

    loadRendererContents(overlayWindow, 'overlay')

    overlayWindow.webContents.setWindowOpenHandler((details) => {
      if (isSafeExternalUrl(details.url)) {
        shell.openExternal(details.url)
      } else {
        logger.warn(
          `[WindowManager] Blocked setWindowOpenHandler URL with unsafe protocol (overlay): ${details.url}`
        )
      }
      return { action: 'deny' }
    })
  }

  const overlayWin = state.overlayWindow
  if (overlayWin) {
    logger.info(`[WindowManager] Overlay window exists, showing (${width}x${height})`)
    const [curW, curH] = overlayWin.getSize()
    if (curW !== width || curH !== height) {
      overlayWin.setSize(width, height)
    }
    if (isNew) {
      const primaryDisplay = screen.getPrimaryDisplay()
      const { workArea } = primaryDisplay
      overlayWin.setPosition(
        Math.round((workArea.width - width) / 2),
        Math.round((workArea.height - height) / 2)
      )
    }
    overlayWin.showInactive()
    overlayWin.setAlwaysOnTop(true, 'screen-saver')
    overlayWin.focus()

    if (!isNew && !overlayWin.webContents.isLoading()) {
      const pendingData = consumePendingOverlayData()
      if (pendingData) {
        overlayWin.webContents.send('update-overlay-content', pendingData)
      }
    }
  }
}

function createMainWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 880,
    height: 670,
    show: false,
    backgroundColor: '#0a0a0a',
    frame: false,
    resizable: true,
    center: true,
    icon: nativeImage.createFromPath(ICON_PATH),
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      additionalArguments: [
        `--momai-api-url=${API_BASE_URL}`,
        `--momai-ws-url=${WS_BASE_URL}`,
        `--momai-is-dev=${is.dev}`
      ]
    }
  })

  setMainWindow(mainWindow)

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
    if (process.platform === 'linux') {
      mainWindow.focus()
    }

    if (state.lastBootstrapError) {
      logger.info('[WindowManager] Sending pending bootstrap error to renderer')
      mainWindow.webContents.send('bootstrap-error', state.lastBootstrapError)
    }
  })

  // Pause wake word when minimized to save resources
  mainWindow.on('minimize', () => {
    isWindowMinimizing = true
    controlWakeWord(false)
  })

  // Resume wake word when restored/shown
  mainWindow.on('restore', async () => {
    isWindowMinimizing = false
    try {
      const response = await authFetch(`${API_BASE_URL}/settings`)
      if (response.ok) {
        const settings = await response.json()
        // Re-enable detector if wake word is enabled OR call mode is active
        if (settings.wake_word_enabled && settings.ai_tier === 'ultra') {
          controlWakeWord(true)
        } else {
          // Check if call mode is active — detector must stay running for it
          try {
            const callModeResp = await authFetch(`${API_BASE_URL}/mode/call-mode/status`)
            if (callModeResp.ok) {
              const callMode = await callModeResp.json()
              if (callMode.call_mode) {
                controlWakeWord(true)
              }
            }
          } catch {
            // Fallback: if we can't check, just enable to be safe
          }
        }
      }
    } catch (err) {
      logger.error('[WindowManager] Failed to check wake word state on restore:', err)
    }
  })

  mainWindow.on('show', () => {
    if (!isWindowMinimizing) {
      mainWindow.webContents.send('check-wake-word-on-show')
    }
  })

  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('window-state-changed', { maximized: true })
  })

  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('window-state-changed', { maximized: false })
  })

  setupContextMenu()

  mainWindow.webContents.setWindowOpenHandler((details) => {
    if (isSafeExternalUrl(details.url)) {
      shell.openExternal(details.url)
    } else {
      logger.warn(
        `[WindowManager] Blocked setWindowOpenHandler URL with unsafe protocol: ${details.url}`
      )
    }
    return { action: 'deny' }
  })

  // Tratamento de CTRL+R: em dev reinicia frontend+backend, em prod bloqueia
  mainWindow.webContents.on('before-input-event', async (event, input) => {
    // M3: Block DevTools shortcuts in production
    if (
      shouldBlockDevToolsShortcut({
        isDev: is.dev,
        key: input.key,
        control: input.control,
        shift: input.shift,
        alt: input.alt,
        meta: input.meta
      })
    ) {
      event.preventDefault()
      return
    }

    // CTRL+R ou F5
    const isReloadKey = (input.control && input.key.toLowerCase() === 'r') || input.key === 'F5'
    const isHardReload = input.control && input.shift && input.key.toLowerCase() === 'r'

    if (isReloadKey || isHardReload) {
      event.preventDefault()

      if (is.dev) {
        // Em desenvolvimento: reinicia o backend Python e recarrega o frontend
        logger.info(
          '[WindowManager] CTRL+R detectado em modo DEV - reiniciando backend e frontend...'
        )
        try {
          const result = await restartCoreBackend()
          if (!result.success) {
            throw new Error(result.error || 'Falha ao reiniciar backend')
          }
          logger.info('[WindowManager] Backend reiniciado, recarregando frontend...')
          mainWindow.webContents.reload()
        } catch (error) {
          logger.error('[WindowManager] Erro ao reiniciar backend:', error)
          mainWindow.webContents.reload()
        }
      } else {
        // Em produção: apenas bloqueia o reload para evitar loop de splash
        logger.info('[WindowManager] CTRL+R bloqueado em modo produção')
      }
    }
  })

  loadRendererContents(mainWindow)

  return mainWindow
}

function setupContextMenu(): void {
  const win = getMainWindow()
  if (!win) return

  win.webContents.on('context-menu', (_event, params) => {
    const contextMenuTemplate: Electron.MenuItemConstructorOptions[] = []

    if (params.selectionText) {
      contextMenuTemplate.push(
        { label: 'Copiar', role: 'copy', accelerator: 'CmdOrCtrl+C' },
        { type: 'separator' }
      )
    }

    if (params.isEditable) {
      contextMenuTemplate.push(
        { label: 'Recortar', role: 'cut', accelerator: 'CmdOrCtrl+X' },
        { label: 'Colar', role: 'paste', accelerator: 'CmdOrCtrl+V' },
        { type: 'separator' }
      )
    }

    contextMenuTemplate.push({
      label: 'Selecionar Tudo',
      role: 'selectAll',
      accelerator: 'CmdOrCtrl+A'
    })

    const contextMenu = Menu.buildFromTemplate(contextMenuTemplate)
    contextMenu.popup()
  })
}

export function createWindow(): void {
  const win = getMainWindow()
  if (win) {
    if (process.platform === 'linux') {
      const { workArea } = screen.getPrimaryDisplay()
      win.setBounds(workArea)

      setTimeout(() => {
        if (win.isMinimized()) win.restore()
        if (!win.isVisible()) win.show()
        win.moveTop()
        win.focus()
      }, 150)
    } else {
      win.maximize()
    }
    return
  }
  createMainWindow()
}

export function toggleWindow(): void {
  const win = getMainWindow()
  if (win) {
    if (win.isVisible() && win.isFocused()) {
      win.hide()
    } else {
      if (win.isMinimized()) win.restore()
      win.show()
      win.focus()
      win.setSize(450, 670)
      win.center()
      // Restart llama if waking from tray
      // TODO: integrate with TrayService — this Alt+Space shortcut path is not yet covered by TrayService
      authFetch(`${API_BASE_URL}/llama/start`, { method: 'POST' }).catch(() => {})
      win.webContents.send('focus-input')
    }
  } else {
    createWindow()
  }
}
