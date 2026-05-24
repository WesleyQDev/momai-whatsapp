import { contextBridge } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  minimize: (): void => electronAPI.ipcRenderer.send('window-minimize'),
  focus: (): void => electronAPI.ipcRenderer.send('window-focus'),
  maximize: (): void => electronAPI.ipcRenderer.send('window-maximize'),
  close: (): void => electronAPI.ipcRenderer.send('window-close'),
  getLogsPath: (): Promise<string> => electronAPI.ipcRenderer.invoke('get-logs-path'),
  openLogsFolder: (): Promise<void> => electronAPI.ipcRenderer.invoke('open-logs-folder'),
  readLogs: (lines?: number): Promise<any> => electronAPI.ipcRenderer.invoke('read-logs', lines),
  getAppVersion: (): Promise<string> => electronAPI.ipcRenderer.invoke('get-app-version'),
  isFirstLaunch: (): Promise<boolean> => electronAPI.ipcRenderer.invoke('is-first-launch'),
  getAutoStart: (): Promise<boolean> => electronAPI.ipcRenderer.invoke('get-auto-start'),
  setAutoStart: (enabled: boolean): Promise<boolean> =>
    electronAPI.ipcRenderer.invoke('set-auto-start', enabled),
  onBootstrapError: (
    callback: (error: { type: string; message: string; details?: string }) => void
  ) => {
    const handler = (_: any, error: { type: string; message: string; details?: string }) =>
      callback(error)
    electronAPI.ipcRenderer.on('bootstrap-error', handler)
    return () => electronAPI.ipcRenderer.removeListener('bootstrap-error', handler)
  },
  onInitProgress: (callback: (data: { message: string; progress: number }) => void) => {
    const handler = (_: any, data: { message: string; progress: number }) => callback(data)
    electronAPI.ipcRenderer.on('init-progress', handler)
    return () => electronAPI.ipcRenderer.removeListener('init-progress', handler)
  },
  onBackendOnline: (callback: () => void) => {
    const handler = () => callback()
    electronAPI.ipcRenderer.on('backend-online', handler)
    return () => electronAPI.ipcRenderer.removeListener('backend-online', handler)
  },
  onBackendRetry: (callback: () => void) => {
    const handler = () => callback()
    electronAPI.ipcRenderer.on('backend-retry', handler)
    return () => electronAPI.ipcRenderer.removeListener('backend-retry', handler)
  },
  checkForUpdates: (): Promise<any> => electronAPI.ipcRenderer.invoke('check-for-updates'),
  downloadUpdate: (): Promise<any> => electronAPI.ipcRenderer.invoke('download-update'),
  quitAndInstallUpdate: (): Promise<void> =>
    electronAPI.ipcRenderer.invoke('quit-and-install-update'),
  onUpdateAvailable: (callback: (info: any) => void) => {
    const handler = (_: any, info: any) => callback(info)
    electronAPI.ipcRenderer.on('update-available', handler)
    return () => electronAPI.ipcRenderer.removeListener('update-available', handler)
  },
  onUpdateProgress: (callback: (progress: any) => void) => {
    const handler = (_: any, progress: any) => callback(progress)
    electronAPI.ipcRenderer.on('update-progress', handler)
    return () => electronAPI.ipcRenderer.removeListener('update-progress', handler)
  },
  onUpdateDownloaded: (callback: (info: any) => void) => {
    const handler = (_: any, info: any) => callback(info)
    electronAPI.ipcRenderer.on('update-downloaded', handler)
    return () => electronAPI.ipcRenderer.removeListener('update-downloaded', handler)
  },
  onUpdateError: (callback: (error: string) => void) => {
    const handler = (_: any, error: string) => callback(error)
    electronAPI.ipcRenderer.on('update-error', handler)
    return () => electronAPI.ipcRenderer.removeListener('update-error', handler)
  },
  markFirstLaunchFinished: (settings: any): void =>
    electronAPI.ipcRenderer.send('mark-first-launch-finished', settings),
  setResizable: (resizable: boolean): void =>
    electronAPI.ipcRenderer.send('window-set-resizable', resizable),
  restartBackend: (): Promise<{ success: boolean; error?: string }> =>
    electronAPI.ipcRenderer.invoke('restart-backend'),
  restartApp: (): void => electronAPI.ipcRenderer.send('restart-app'),
  resetWindowSize: (): void => electronAPI.ipcRenderer.send('window-reset-size'),
  isWindowMaximized: (): Promise<boolean> => electronAPI.ipcRenderer.invoke('is-window-maximized'),
  getEconomyState: (): Promise<any> => electronAPI.ipcRenderer.invoke('economy:get-state'),
  getEconomyCatalog: (): Promise<any[]> => electronAPI.ipcRenderer.invoke('economy:get-catalog'),
  scanEconomyLibraries: (): Promise<any[]> =>
    electronAPI.ipcRenderer.invoke('economy:scan-libraries'),
  dismissEconomy: (): Promise<boolean> => electronAPI.ipcRenderer.invoke('economy:dismiss'),
  getEconomyPreferences: (): Promise<Record<string, boolean>> =>
    electronAPI.ipcRenderer.invoke('economy:get-preferences'),
  setEconomyGamePreference: (gameName: string, enabled: boolean): Promise<boolean> =>
    electronAPI.ipcRenderer.invoke('economy:set-game-preference', gameName, enabled),
  onEconomyStateChange: (
    callback: (state: {
      active: boolean
      reason: string | null
      detectedGames: { name: string; processName: string }[]
    }) => void
  ) => {
    const handler = (_: any, state: any) => callback(state)
    electronAPI.ipcRenderer.on('economy:state-change', handler)
    return () => electronAPI.ipcRenderer.removeListener('economy:state-change', handler)
  },
  openOverlay: (data: any): void => electronAPI.ipcRenderer.send('open-overlay', data),
  closeOverlay: (): void => electronAPI.ipcRenderer.send('close-overlay'),
  onOverlayAction: (callback: (action: any) => void) => {
    const handler = (_: any, action: any) => callback(action)
    electronAPI.ipcRenderer.on('overlay-action', handler)
    return () => electronAPI.ipcRenderer.removeListener('overlay-action', handler)
  },
  onWindowStateChanged: (callback: (state: { maximized: boolean }) => void) => {
    const handler = (_: any, state: { maximized: boolean }) => callback(state)
    electronAPI.ipcRenderer.on('window-state-changed', handler)
    return () => electronAPI.ipcRenderer.removeListener('window-state-changed', handler)
  },
  notes: {
    list: (): Promise<any[]> => electronAPI.ipcRenderer.invoke('notes:list'),
    get: (noteId: string): Promise<any | null> =>
      electronAPI.ipcRenderer.invoke('notes:get', noteId),
    create: (payload: { title: string; content: string; path?: string }): Promise<any> =>
      electronAPI.ipcRenderer.invoke('notes:create', payload),
    update: (
      noteId: string,
      payload: { title?: string; content?: string; path?: string }
    ): Promise<any | null> => electronAPI.ipcRenderer.invoke('notes:update', noteId, payload),
    delete: (noteId: string): Promise<boolean> =>
      electronAPI.ipcRenderer.invoke('notes:delete', noteId),
    import: (files: { name: string; content: string }[]): Promise<void> =>
      electronAPI.ipcRenderer.invoke('notes:import', files),
    listFolders: (): Promise<string[]> => electronAPI.ipcRenderer.invoke('notes:folders:list'),
    createFolder: (path: string): Promise<void> =>
      electronAPI.ipcRenderer.invoke('notes:folders:create', path),
    renameFolder: (oldPath: string, newPath: string): Promise<boolean> =>
      electronAPI.ipcRenderer.invoke('notes:folders:rename', oldPath, newPath),
    deleteFolder: (path: string): Promise<boolean> =>
      electronAPI.ipcRenderer.invoke('notes:folders:delete', path),
    openFolder: (noteId: string): Promise<boolean> =>
      electronAPI.ipcRenderer.invoke('notes:open-folder', noteId),
    search: (query: string, limit = 6): Promise<any[]> =>
      electronAPI.ipcRenderer.invoke('notes:search', query, limit)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
