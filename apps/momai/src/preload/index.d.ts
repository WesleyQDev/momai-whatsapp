declare global {
  interface Window {
    momaiAPI: MomaiAPI
    api: MomaiAPI
  }
}

interface MomaiAPI {
  getApiBaseUrl: () => string
  getWsBaseUrl: () => string
  isDev: () => boolean
  minimize: () => void
  focus: () => void
  maximize: () => void
  close: () => void
  getLogsPath: () => Promise<string>
  openLogsFolder: () => Promise<void>
  openDataFolder: () => Promise<void>
  getDataPath: () => Promise<string>
  openInstallPath: () => Promise<void>
  getInstallPath: () => Promise<string>
  openLogFile: () => Promise<void>
  openModelsFolder: () => Promise<void>
  getModelsPath: () => Promise<string>
  openLlamaFolder: () => Promise<void>
  getLlamaPath: () => Promise<string>
  checkModelFile: (fileName: string) => Promise<{ exists: boolean }>
  startLogStream: () => Promise<void>
  stopLogStream: () => Promise<void>
  onLogLine: (callback: (line: any) => void) => () => void
  readLogs: (lines?: number) => Promise<{
    success: boolean
    entries?: Array<{
      timestamp: string
      level: string
      component: string
      message: string
      raw: string
    }>
    error?: string
  }>
  getAppVersion: () => Promise<string>
  isFirstLaunch: () => Promise<boolean>
  getAutoStart: () => Promise<boolean>
  setAutoStart: (enabled: boolean) => Promise<boolean>
  onBootstrapError: (
    callback: (error: { type: string; message: string; details?: string }) => void
  ) => () => void
  onInitProgress: (callback: (data: { message: string; progress: number }) => void) => () => void
  onBackendOnline: (callback: () => void) => () => void
  onBackendRetry: (callback: () => void) => () => void
  checkForUpdates: () => Promise<any>
  downloadUpdate: () => Promise<any>
  quitAndInstallUpdate: () => Promise<void>
  onUpdateAvailable: (callback: (info: any) => void) => () => void
  onUpdateProgress: (callback: (progress: any) => void) => () => void
  onUpdateDownloaded: (callback: (info: any) => void) => () => void
  onUpdateError: (callback: (error: string) => void) => () => void
  markFirstLaunchFinished: (settings: any) => void
  restartBackend: () => Promise<{ success: boolean; error?: string }>
  restartApp: () => void
  resetWindowSize: () => void
  isWindowMaximized: () => Promise<boolean>
  onWindowStateChanged: (callback: (state: { maximized: boolean }) => void) => () => void
  setResizable?: (resizable: boolean) => void
  stopTts: () => Promise<{ success: boolean }>
  openOverlay: (data: any) => void
  closeOverlay: () => void
  onOverlayAction: (callback: (action: any) => void) => () => void
  notes: {
    list: () => Promise<any[]>
    get: (noteId: string) => Promise<any | null>
    create: (payload: { title: string; content: string; path?: string }) => Promise<any>
    update: (
      noteId: string,
      payload: { title?: string; content?: string; path?: string }
    ) => Promise<any | null>
    delete: (noteId: string) => Promise<boolean>
    import: (files: { name: string; content: string }[]) => Promise<void>
    listFolders: () => Promise<string[]>
    createFolder: (path: string) => Promise<void>
    renameFolder: (oldPath: string, newPath: string) => Promise<boolean>
    deleteFolder: (path: string) => Promise<boolean>
    openFolder: (noteId: string) => Promise<boolean>
    search: (query: string, limit?: number) => Promise<any[]>
  }
  privacy: {
    exportData: () => Promise<{
      ok: boolean
      canceled?: boolean
      filePath?: string
      size?: number
      error?: string
    }>
    deleteAll: () => Promise<{
      ok: boolean
      removed?: string[]
      keepModels?: boolean
      error?: string
    }>
    devReset: () => Promise<{
      ok: boolean
      removed?: string[]
      mode?: string
      error?: string
    }>
  }
  apiFetch: (url: string, options?: RequestInit) => Promise<Response>
  apiWebSocket: (url: string) => WebSocket
  getSessionToken: () => string
  getWindowState: () => Promise<{ minimized: boolean; visible: boolean }>
  onTriggerAction: (callback: (action: any) => void) => () => void
  onNotificationClicked: (
    callback: (data: { title: string; body: string; voice_response?: boolean }) => void
  ) => () => void
  onPlayAudioChunk: (callback: (base64Data: string) => void) => () => void
  onPythonStatus: (callback: (status: { online: boolean; detail: string }) => void) => () => void
  onUpdateOverlayContent: (callback: (data: any) => void) => () => void
  markAppReady: () => void
  resetOnboarding: () => void
  markOverlayReady: () => void
  onTrayStateUpdate: (
    callback: (state: {
      llama: { running: boolean; loading: boolean; ready: boolean }
      economy: { active: boolean; reason: 'idle' | 'game' | null; secondsUntilSoneca: number }
      variantName: string
    }) => void
  ) => () => void
  trayActionStart: () => Promise<boolean>
  trayActionStop: () => Promise<boolean>
  trayActionRestart: () => Promise<boolean>
  trayActionOpen: () => Promise<boolean>
  trayActionQuit: () => Promise<boolean>
  invoke: (channel: string, ...args: any[]) => Promise<any>
  send: (channel: string, ...args: any[]) => void
  on: (channel: string, listener: (...args: any[]) => void) => () => void
}

export {}
