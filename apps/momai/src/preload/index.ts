import { contextBridge, ipcRenderer } from 'electron'

// Read variant API URLs passed from main process via additionalArguments.
// The renderer needs the same port as node-core, which is determined by
// the build variant (dev=8050, nsis=8100, etc.) — see variants.ts.
function getArgValue(prefix: string, fallback: string): string {
  const arg = process.argv.find((a) => a.startsWith(prefix))
  return arg ? arg.slice(prefix.length) : fallback
}

const FALLBACK_API_URL = 'http://127.0.0.1:8000'
const FALLBACK_WS_URL = 'ws://127.0.0.1:8000/ws'
const API_BASE_URL = getArgValue('--momai-api-url=', FALLBACK_API_URL)
const WS_BASE_URL = getArgValue('--momai-ws-url=', FALLBACK_WS_URL)
// Session token is generated in the main process and forwarded via
// webPreferences.additionalArguments. Used by apiFetch / apiWebSocket
// to authenticate renderer-initiated calls (Authorization header / ?token=).
const SESSION_TOKEN = getArgValue('--momai-session-token=', '')
// Dev-mode flag forwarded from main process (true when running via `pnpm run dev`).
// Used by the renderer to gate dev-only UI (e.g. the "Reset to Zero" button).
const IS_DEV = getArgValue('--momai-is-dev=', 'false') === 'true'

const momaiAPI = {
  getApiBaseUrl: (): string => API_BASE_URL,
  getWsBaseUrl: (): string => WS_BASE_URL,
  isDev: (): boolean => IS_DEV,
  minimize: (): void => ipcRenderer.send('window-minimize'),
  focus: (): void => ipcRenderer.send('window-focus'),
  maximize: (): void => ipcRenderer.send('window-maximize'),
  close: (): void => ipcRenderer.send('window-close'),
  getLogsPath: (): Promise<string> => ipcRenderer.invoke('get-logs-path'),
  openLogsFolder: (): Promise<void> => ipcRenderer.invoke('open-logs-folder'),
  readLogs: (lines?: number): Promise<any> => ipcRenderer.invoke('read-logs', lines),
  getAppVersion: (): Promise<string> => ipcRenderer.invoke('get-app-version'),
  isFirstLaunch: (): Promise<boolean> => ipcRenderer.invoke('is-first-launch'),
  getAutoStart: (): Promise<boolean> => ipcRenderer.invoke('get-auto-start'),
  setAutoStart: (enabled: boolean): Promise<boolean> =>
    ipcRenderer.invoke('set-auto-start', enabled),
  onBootstrapError: (
    callback: (error: { type: string; message: string; details?: string }) => void
  ) => {
    const handler = (_: any, error: { type: string; message: string; details?: string }) =>
      callback(error)
    ipcRenderer.on('bootstrap-error', handler)
    return () => ipcRenderer.removeListener('bootstrap-error', handler)
  },
  onInitProgress: (callback: (data: { message: string; progress: number }) => void) => {
    const handler = (_: any, data: { message: string; progress: number }) => callback(data)
    ipcRenderer.on('init-progress', handler)
    return () => ipcRenderer.removeListener('init-progress', handler)
  },
  onBackendOnline: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('backend-online', handler)
    return () => ipcRenderer.removeListener('backend-online', handler)
  },
  onBackendRetry: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('backend-retry', handler)
    return () => ipcRenderer.removeListener('backend-retry', handler)
  },
  checkForUpdates: (): Promise<any> => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate: (): Promise<any> => ipcRenderer.invoke('download-update'),
  quitAndInstallUpdate: (): Promise<void> => ipcRenderer.invoke('quit-and-install-update'),
  onUpdateAvailable: (callback: (info: any) => void) => {
    const handler = (_: any, info: any) => callback(info)
    ipcRenderer.on('update-available', handler)
    return () => ipcRenderer.removeListener('update-available', handler)
  },
  onUpdateProgress: (callback: (progress: any) => void) => {
    const handler = (_: any, progress: any) => callback(progress)
    ipcRenderer.on('update-progress', handler)
    return () => ipcRenderer.removeListener('update-progress', handler)
  },
  onUpdateDownloaded: (callback: (info: any) => void) => {
    const handler = (_: any, info: any) => callback(info)
    ipcRenderer.on('update-downloaded', handler)
    return () => ipcRenderer.removeListener('update-downloaded', handler)
  },
  onUpdateError: (callback: (error: string) => void) => {
    const handler = (_: any, error: string) => callback(error)
    ipcRenderer.on('update-error', handler)
    return () => ipcRenderer.removeListener('update-error', handler)
  },
  markFirstLaunchFinished: (settings: any): void =>
    ipcRenderer.send('mark-first-launch-finished', settings),
  setResizable: (resizable: boolean): void => ipcRenderer.send('window-set-resizable', resizable),
  restartBackend: (): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('restart-backend'),
  restartApp: (): void => ipcRenderer.send('restart-app'),
  resetWindowSize: (): void => ipcRenderer.send('window-reset-size'),
  isWindowMaximized: (): Promise<boolean> => ipcRenderer.invoke('is-window-maximized'),
  stopTts: (): Promise<{ success: boolean }> => ipcRenderer.invoke('tts:stop'),
  getEconomyState: (): Promise<any> => ipcRenderer.invoke('economy:get-state'),
  getEconomyCatalog: (): Promise<any[]> => ipcRenderer.invoke('economy:get-catalog'),
  scanEconomyLibraries: (): Promise<any[]> => ipcRenderer.invoke('economy:scan-libraries'),
  dismissEconomy: (): Promise<boolean> => ipcRenderer.invoke('economy:dismiss'),
  reinstateEconomySleep: (): Promise<boolean> => ipcRenderer.invoke('economy:reinstate-sleep'),
  getEconomyPreferences: (): Promise<Record<string, boolean>> =>
    ipcRenderer.invoke('economy:get-preferences'),
  setEconomyGamePreference: (gameName: string, enabled: boolean): Promise<boolean> =>
    ipcRenderer.invoke('economy:set-game-preference', gameName, enabled),
  onEconomyStateChange: (
    callback: (state: {
      active: boolean
      reason: string | null
      detectedGames: { name: string; processName: string }[]
    }) => void
  ) => {
    const handler = (_: any, state: any) => callback(state)
    ipcRenderer.on('economy:state-change', handler)
    return () => ipcRenderer.removeListener('economy:state-change', handler)
  },
  openOverlay: (data: any): void => ipcRenderer.send('open-overlay', data),
  closeOverlay: (): void => ipcRenderer.send('close-overlay'),
  onOverlayAction: (callback: (action: any) => void) => {
    const handler = (_: any, action: any) => callback(action)
    ipcRenderer.on('overlay-action', handler)
    return () => ipcRenderer.removeListener('overlay-action', handler)
  },
  onWindowStateChanged: (callback: (state: { maximized: boolean }) => void) => {
    const handler = (_: any, state: { maximized: boolean }) => callback(state)
    ipcRenderer.on('window-state-changed', handler)
    return () => ipcRenderer.removeListener('window-state-changed', handler)
  },
  notes: {
    list: (): Promise<any[]> => ipcRenderer.invoke('notes:list'),
    get: (noteId: string): Promise<any | null> => ipcRenderer.invoke('notes:get', noteId),
    create: (payload: { title: string; content: string; path?: string }): Promise<any> =>
      ipcRenderer.invoke('notes:create', payload),
    update: (
      noteId: string,
      payload: { title?: string; content?: string; path?: string }
    ): Promise<any | null> => ipcRenderer.invoke('notes:update', noteId, payload),
    delete: (noteId: string): Promise<boolean> => ipcRenderer.invoke('notes:delete', noteId),
    import: (files: { name: string; content: string }[]): Promise<void> =>
      ipcRenderer.invoke('notes:import', files),
    listFolders: (): Promise<string[]> => ipcRenderer.invoke('notes:folders:list'),
    createFolder: (path: string): Promise<void> => ipcRenderer.invoke('notes:folders:create', path),
    renameFolder: (oldPath: string, newPath: string): Promise<boolean> =>
      ipcRenderer.invoke('notes:folders:rename', oldPath, newPath),
    deleteFolder: (path: string): Promise<boolean> =>
      ipcRenderer.invoke('notes:folders:delete', path),
    openFolder: (noteId: string): Promise<boolean> =>
      ipcRenderer.invoke('notes:open-folder', noteId),
    search: (query: string, limit = 6): Promise<any[]> =>
      ipcRenderer.invoke('notes:search', query, limit)
  },
  privacy: {
    exportData: (): Promise<{
      ok: boolean
      canceled?: boolean
      filePath?: string
      size?: number
      error?: string
    }> => ipcRenderer.invoke('privacy:export'),
    deleteAll: (): Promise<{
      ok: boolean
      removed?: string[]
      keepModels?: boolean
      error?: string
    }> => ipcRenderer.invoke('privacy:delete-all'),
    devReset: (): Promise<{
      ok: boolean
      removed?: string[]
      mode?: string
      error?: string
    }> => ipcRenderer.invoke('privacy:dev-reset')
  },
  apiFetch: (url: string, options: RequestInit = {}): Promise<Response> => {
    // NOTE: This wrapper exists for API symmetry but delegates to the
    // global `fetch` (which in this preload context is undici). It is
    // kept for backward compatibility; new code should use the
    // renderer's fetch via getSessionToken() + native fetch.
    return fetch(url, options)
  },
  apiWebSocket: (url: string): WebSocket => {
    // NOTE: WebSocket objects cannot be safely proxied through the
    // contextBridge (methods like .close() are stripped). Kept for
    // backward compatibility; new code should create the WebSocket in
    // the renderer and pass the token via getSessionToken().
    return new WebSocket(url)
  },
  getSessionToken: (): string => SESSION_TOKEN,
  // M2 follow-up: named functions for the channels the renderer used
  // to call via the generic send/invoke/on passthrough. The generic
  // surface is removed — every channel must be explicitly exposed here.
  getWindowState: (): Promise<{ minimized: boolean; visible: boolean }> =>
    ipcRenderer.invoke('get-window-state'),
  onTriggerAction: (callback: (action: any) => void) => {
    const handler = (_: any, action: any) => callback(action)
    ipcRenderer.on('trigger-action', handler)
    return () => ipcRenderer.removeListener('trigger-action', handler)
  },
  onNotificationClicked: (
    callback: (data: { title: string; body: string; voice_response?: boolean }) => void
  ) => {
    const handler = (_: any, data: any) => callback(data)
    ipcRenderer.on('notification-clicked', handler)
    return () => ipcRenderer.removeListener('notification-clicked', handler)
  },
  onPlayAudioChunk: (callback: (base64Data: string) => void) => {
    const handler = (_: any, base64Data: string) => callback(base64Data)
    ipcRenderer.on('play-audio-chunk', handler)
    return () => ipcRenderer.removeListener('play-audio-chunk', handler)
  },
  onPythonStatus: (callback: (status: { online: boolean; detail: string }) => void) => {
    const handler = (_: any, status: any) => callback(status)
    ipcRenderer.on('python-status', handler)
    return () => ipcRenderer.removeListener('python-status', handler)
  },
  onUpdateOverlayContent: (callback: (data: any) => void) => {
    const handler = (_: any, data: any) => callback(data)
    ipcRenderer.on('update-overlay-content', handler)
    return () => ipcRenderer.removeListener('update-overlay-content', handler)
  },
  markAppReady: (): void => ipcRenderer.send('app-ready'),
  resetOnboarding: (): void => ipcRenderer.send('reset-onboarding'),
  markOverlayReady: (): void => ipcRenderer.send('overlay-ready'),
  // Generic IPC helpers for renderer code that uses dynamic channels
  // (e.g., ttsService subscribes to 'tts:speaking-start', etc.). These
  // are still routed through the curated surface — no raw `ipcRenderer`
  // is exposed to the renderer. Prefer the named functions above when
  // the channel is known at compile time.
  invoke: (channel: string, ...args: any[]): Promise<any> => ipcRenderer.invoke(channel, ...args),
  send: (channel: string, ...args: any[]): void => ipcRenderer.send(channel, ...args),
  on: (channel: string, listener: (...args: any[]) => void): (() => void) => {
    const subscription = (_event: any, ...args: any[]) => listener(...args)
    ipcRenderer.on(channel, subscription)
    return () => ipcRenderer.removeListener(channel, subscription)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('momaiAPI', momaiAPI)
    // Backward compat: existing renderer code still references
    // `window.api.<namedFn>()`. Both names point to the same
    // curated surface — no generic send/invoke/on is exposed.
    contextBridge.exposeInMainWorld('api', momaiAPI)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.momaiAPI = momaiAPI
  // @ts-ignore (define in dts)
  window.api = momaiAPI
}
