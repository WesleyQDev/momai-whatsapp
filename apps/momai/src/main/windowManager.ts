import {
  BrowserWindow,
  screen,
  shell,
  ipcMain,
  Menu,
  nativeImage,
  app,
  Tray,
  Notification
} from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { is } from '@electron-toolkit/utils'
import {
  state,
  setMainWindow,
  setOverlayWindow,
  setTray,
  setIpcHandlersRegistered,
  setIsQuitting
} from './state'
import { logger } from './logger'
import { restartCoreBackend } from './coreManager'
import { scanInstalledGames } from './economyScanner'
import { API_BASE_URL } from './constants'

async function controlWakeWord(enabled: boolean): Promise<void> {
  try {
    await fetch(`${API_BASE_URL}/voice/wake-word`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled })
    })
    logger.info(`[WindowManager] Wake word ${enabled ? 'enabled' : 'disabled'}`)
  } catch (err) {
    logger.error('[WindowManager] Failed to control wake word:', err)
  }
}

function resolveIconPath(): string {
  const ext = process.platform === 'win32' ? 'ico' : 'png'

  if (is.dev) {
    const devPath = join(__dirname, `../../resources/icon.${ext}`)
    return existsSync(devPath) ? devPath : join(__dirname, '../../resources/icon.png')
  }

  // Em produção, os arquivos de 'resources' estão na raiz do process.resourcesPath
  // por conta da config 'from: resources, to: .' no electron-builder.yml
  const prodPath = join(process.resourcesPath, `icon.${ext}`)
  if (existsSync(prodPath)) return prodPath

  const prodPngPath = join(process.resourcesPath, 'icon.png')
  if (existsSync(prodPngPath)) return prodPngPath

  // Fallback
  return join(app.getAppPath(), `resources/icon.${ext}`)
}

const ICON_PATH = resolveIconPath()

let isWindowMinimizing = false

function getMainWindow(): BrowserWindow | null {
  return state.mainWindow && !state.mainWindow.isDestroyed() ? state.mainWindow : null
}

let lastEconomyState: any = { active: false, reason: null, detectedGames: [] }

export function broadcastEconomyState(state: {
  active: boolean
  reason: string | null
  detectedGames: { name: string; processName: string; steamGridId?: number | null; coverUrl?: string | null }[]
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
    app.quit()
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
    createOverlayWindow(data)
  })

  ipcMain.on('close-overlay', () => {
    if (state.overlayWindow && !state.overlayWindow.isDestroyed()) {
      state.overlayWindow.hide()
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
      const { readFileSync, existsSync, writeFileSync } = require('fs')
      const { join } = require('path')
      const prefsPath = join(app.getPath('userData'), 'economy-preferences.json')
      if (!existsSync(prefsPath)) writeFileSync(prefsPath, '{}', 'utf-8')
      return JSON.parse(readFileSync(prefsPath, 'utf-8'))
    } catch { return {} }
  })

  ipcMain.handle('economy:set-game-preference', (_event, gameName: string, economyEnabled: boolean) => {
    try {
      const { readFileSync, existsSync, writeFileSync } = require('fs')
      const { join } = require('path')
      const prefsPath = join(app.getPath('userData'), 'economy-preferences.json')
      const prefs = existsSync(prefsPath) ? JSON.parse(readFileSync(prefsPath, 'utf-8')) : {}
      prefs[gameName.toLowerCase()] = economyEnabled
      writeFileSync(prefsPath, JSON.stringify(prefs, null, 2), 'utf-8')
      return true
    } catch { return false }
  })

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

export function createOverlayWindow(data?: any): void {
  let isNew = false

  if (!state.overlayWindow || state.overlayWindow.isDestroyed()) {
    isNew = true
    const overlayWindow = new BrowserWindow({
      width: 450,
      height: 670,
      show: false,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      resizable: false,
      hasShadow: false,
      skipTaskbar: true,
      icon: ICON_PATH,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false
      }
    })

    setOverlayWindow(overlayWindow)

    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      overlayWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/#/overlay`)
    } else {
      overlayWindow.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'overlay' })
    }
  }

  const overlayWin = state.overlayWindow
  if (overlayWin) {
    const primaryDisplay = screen.getPrimaryDisplay()
    const { width } = primaryDisplay.workAreaSize
    overlayWin.setPosition(width - 480, 50)
    overlayWin.showInactive()

    const sendData = (): void => {
      if (data) overlayWin.webContents.send('update-overlay-content', data)
    }

    if (isNew || overlayWin.webContents.isLoading()) {
      overlayWin.webContents.once('did-finish-load', sendData)
    } else {
      sendData()
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
    icon: ICON_PATH,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon: nativeImage.createFromPath(ICON_PATH) } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
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
      const response = await fetch(`${API_BASE_URL}/settings`)
      if (response.ok) {
        const settings = await response.json()
        // Re-enable detector if wake word is enabled OR call mode is active
        if (settings.wake_word_enabled && settings.ai_tier === 'ultra') {
          controlWakeWord(true)
        } else {
          // Check if call mode is active — detector must stay running for it
          try {
            const callModeResp = await fetch(`${API_BASE_URL}/mode/call-mode/status`)
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

  mainWindow.on('close', (event) => {
    if (process.platform === 'darwin') return
    if (state.isQuitting) return
    event.preventDefault()
    setIsQuitting(true)

    if (state.tray) {
      state.tray.destroy()
      setTray(null as any)
    }

    app.quit()
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

  setupTray()
  setupContextMenu()

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Tratamento de CTRL+R: em dev reinicia frontend+backend, em prod bloqueia
  mainWindow.webContents.on('before-input-event', async (event, input) => {
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

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

function setupTray(): void {
  if (state.tray) return

  const tray = new Tray(nativeImage.createFromPath(ICON_PATH))
  tray.setToolTip('MomAI')

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Abrir',
      click: () => {
        const win = getMainWindow()
        if (win) {
          win.show()
          win.focus()
        }
      }
    },
    {
      label: 'Sair',
      click: () => app.quit()
    }
  ])

  tray.setContextMenu(contextMenu)

  tray.on('click', () => {
    const win = getMainWindow()
    if (!win) return

    if (win.isVisible()) {
      win.hide()
    } else {
      win.show()
      win.focus()
    }
  })

  setTray(tray)
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
      win.webContents.send('focus-input')
    }
  } else {
    createWindow()
  }
}
