import { BrowserWindow, screen, shell, ipcMain, Menu, app, Notification } from 'electron'
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
import { CURRENT_VARIANT } from './variants'

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
  overlaySize?: { width?: number; height?: number }
  structuredResponse?: { type?: string; data?: { conversationHistory?: unknown[] } }
}) {
  const type = data?.structuredResponse?.type
  if (type === 'extension-panel') {
    return { width: 440, height: 420 }
  }

  const requestedWidth = data?.overlaySize?.width
  const requestedHeight = data?.overlaySize?.height
  if (requestedWidth && requestedHeight) {
    return {
      width: Math.min(Math.max(requestedWidth, 320), 900),
      height: Math.min(Math.max(requestedHeight, 240), 720)
    }
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
      title: CURRENT_VARIANT.appName,
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
      const url = details.url || ''
      if (url.includes('accounts.google.com/o/oauth2') || url.includes('oauth2/v2/auth')) {
        return {
          action: 'allow',
          overrideBrowserWindowOptions: {
            width: 540,
            height: 680,
            autoHideMenuBar: true,
            title: 'Google OAuth - MomAI',
            center: true,
            webPreferences: {
              nodeIntegration: false,
              contextIsolation: true
            }
          }
        }
      }

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
    title: CURRENT_VARIANT.appName,
    width: 880,
    height: 670,
    show: false,
    backgroundColor: '#0a0a0a',
    frame: false,
    resizable: true,
    center: true,
    icon: ICON_PATH,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      webviewTag: true,
      additionalArguments: [
        `--momai-api-url=${API_BASE_URL}`,
        `--momai-ws-url=${WS_BASE_URL}`,
        `--momai-is-dev=${is.dev}`
      ]
    }
  })

  if (process.platform === 'win32') {
    mainWindow.setIcon(ICON_PATH)
  }

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
    const url = details.url || ''
    if (url.includes('accounts.google.com/o/oauth2') || url.includes('oauth2/v2/auth')) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 540,
          height: 680,
          autoHideMenuBar: true,
          title: 'Google OAuth - MomAI',
          center: true,
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            userAgent:
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
          }
        }
      }
    }

    if (isSafeExternalUrl(details.url)) {
      shell.openExternal(details.url)
    } else {
      logger.warn(
        `[WindowManager] Blocked setWindowOpenHandler URL with unsafe protocol: ${details.url}`
      )
    }
    return { action: 'deny' }
  })

  // Intercepta o callback de OAuth da janela popup e notifica a janela principal
  mainWindow.webContents.on('did-create-window', (childWindow) => {
    const handleNavigation = async (event: any, url: string) => {
      const isCallbackUrl =
        url.startsWith('http://127.0.0.1:3333/callback') ||
        url.startsWith('http://localhost:3333/callback') ||
        url.startsWith('http://127.0.0.1:3333/') ||
        url.startsWith('http://localhost:3333/')

      if (isCallbackUrl) {
        logger.info(`[WindowManager] Intercepted OAuth completion callback URL: ${url}`)
        event.preventDefault()
        try {
          if (!childWindow.isDestroyed()) {
            childWindow.close()
          }
        } catch {}

        let realEmail: string | null = null
        let accessToken: string | null = null
        let idToken: string | null = null

        try {
          const parsedUrl = new URL(url)

          // 1. Extração via hash fragment (#access_token=...&id_token=...)
          if (parsedUrl.hash) {
            const hashParams = new URLSearchParams(parsedUrl.hash.replace(/^#/, ''))
            if (hashParams.has('access_token')) {
              accessToken = hashParams.get('access_token')
            }
            if (hashParams.has('id_token')) {
              idToken = hashParams.get('id_token')
            }
          }

          // 2. Extração via querystring (?access_token=... ou ?id_token=...)
          if (!accessToken && parsedUrl.searchParams.has('access_token')) {
            accessToken = parsedUrl.searchParams.get('access_token')
          }
          if (!idToken && parsedUrl.searchParams.has('id_token')) {
            idToken = parsedUrl.searchParams.get('id_token')
          }

          // 3. Se id_token foi obtido da URL
          if (idToken) {
            try {
              const base64Url = idToken.split('.')[1]
              const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/')
              const jsonPayload = Buffer.from(base64, 'base64').toString('utf8')
              const parsedJwt = JSON.parse(jsonPayload)
              if (parsedJwt?.email) {
                realEmail = parsedJwt.email
                logger.info(`[WindowManager] Extracted Google email from hash/query id_token: ${realEmail}`)
              }
            } catch (jwtErr) {
              logger.warn(`[WindowManager] Could not parse id_token from URL: ${jwtErr}`)
            }
          }

          // 4. Se access_token foi obtido da URL, consulta API UserInfo
          if (!realEmail && accessToken) {
            try {
              const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
                headers: { Authorization: `Bearer ${accessToken}` }
              })
              const userData = (await userRes.json()) as { email?: string }
              if (userData.email) {
                realEmail = userData.email
                logger.info(`[WindowManager] Extracted Google email from userinfo API using URL access_token: ${realEmail}`)
              }
            } catch (uErr) {
              logger.warn(`[WindowManager] Error fetching userinfo from URL access_token: ${uErr}`)
            }
          }

          // 5. Se code foi obtido da URL, realiza a troca por tokens com suporte a PKCE e client_secret
          const code = parsedUrl.searchParams.get('code')
          if (!realEmail && code) {
            let codeVerifier: string | null = null
            let customClientId: string | null = null
            let customClientSecret: string | null = null
            try {
              codeVerifier = await mainWindow.webContents.executeJavaScript(
                "localStorage.getItem('momaismarthome_code_verifier') || window.momaismarthome_code_verifier || ''"
              )
              customClientId = await mainWindow.webContents.executeJavaScript(
                "localStorage.getItem('momaismarthome_client_id') || window.momaismarthome_client_id || ''"
              )
              customClientSecret = await mainWindow.webContents.executeJavaScript(
                "localStorage.getItem('momaismarthome_client_secret') || window.momaismarthome_client_secret || ''"
              )
            } catch (cvErr) {
              logger.warn(`[WindowManager] Could not read OAuth credentials from renderer: ${cvErr}`)
            }

            const activeClientId = (customClientId && customClientId.trim()) || '204049970754-gtadrgcj0eragg8u2skl3o9501s1rhc9.apps.googleusercontent.com'
            const activeClientSecret = (customClientSecret && customClientSecret.trim()) || process.env.GOOGLE_CLIENT_SECRET || ''

            const bodyParams: Record<string, string> = {
              code,
              client_id: activeClientId,
              grant_type: 'authorization_code',
              redirect_uri: 'http://127.0.0.1:3333/callback'
            }
            if (codeVerifier) {
              bodyParams.code_verifier = codeVerifier
              logger.info(`[WindowManager] Including PKCE code_verifier in token request`)
            }
            if (activeClientSecret) {
              bodyParams.client_secret = activeClientSecret
              logger.info(`[WindowManager] Including client_secret in token request`)
            }

            logger.info(`[WindowManager] Exchanging Google OAuth code for tokens...`)
            const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: new URLSearchParams(bodyParams)
            })
            const tokenData = (await tokenRes.json()) as { access_token?: string; id_token?: string; error?: string; error_description?: string }
            logger.info(`[WindowManager] Google token response (status ${tokenRes.status}): ${JSON.stringify(tokenData)}`)

            if (tokenData.id_token) {
              try {
                const base64Url = tokenData.id_token.split('.')[1]
                const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/')
                const jsonPayload = Buffer.from(base64, 'base64').toString('utf8')
                const parsedJwt = JSON.parse(jsonPayload)
                if (parsedJwt?.email) {
                  realEmail = parsedJwt.email
                  logger.info(`[WindowManager] Extracted Google email from code id_token: ${realEmail}`)
                }
              } catch (jwtErr) {
                logger.warn(`[WindowManager] Could not parse id_token: ${jwtErr}`)
              }
            }

            if (!realEmail && tokenData.access_token) {
              const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
                headers: { Authorization: `Bearer ${tokenData.access_token}` }
              })
              const userData = (await userRes.json()) as { email?: string }
              if (userData.email) {
                realEmail = userData.email
                logger.info(`[WindowManager] Extracted Google email from userinfo API: ${realEmail}`)
              }
            }

            if (tokenData.access_token) {
              accessToken = tokenData.access_token
            }
            if (tokenData.id_token) {
              idToken = tokenData.id_token
            }
          }
        } catch (err) {
          logger.warn(`[WindowManager] Error getting Google user email: ${err}`)
        }

        if (realEmail && realEmail !== 'usuario@gmail.com') {
          logger.info(`[WindowManager] Google OAuth completed successfully for email: ${realEmail}`)
          mainWindow.webContents.send('google-oauth-success', {
            email: realEmail,
            access_token: accessToken,
            id_token: idToken,
            url
          })
        } else {
          logger.error(`[WindowManager] Google OAuth completion failed: real email could not be resolved.`)
          mainWindow.webContents.send('google-oauth-error', { error: 'Não foi possível autenticar o e-mail real do usuário.' })
        }
      }
    }

    childWindow.webContents.on('will-navigate', handleNavigation)
    childWindow.webContents.on('will-redirect', handleNavigation)
  })

  // Block main window navigation to untrusted origins (Electron security boundary)
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const parsed = (() => {
      try {
        return new URL(url)
      } catch {
        return null
      }
    })()
    if (!parsed) {
      event.preventDefault()
      return
    }
    if (parsed.protocol === 'file:') return
    if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') return
    if (parsed.hostname === 'accounts.google.com') return
    logger.warn(`[WindowManager] Blocked will-navigate to untrusted origin: ${url}`)
    event.preventDefault()
  })

  // Tratamento de CTRL+R: em dev reinicia frontend+backend, em prod bloqueia
  mainWindow.webContents.on('before-input-event', async (event, input) => {
    // Toggle DevTools on F12 in dev mode
    if (input.key === 'F12') {
      if (is.dev) {
        event.preventDefault()
        mainWindow.webContents.toggleDevTools()
        return
      }
    }

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
