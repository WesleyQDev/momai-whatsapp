import { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      minimize: () => void
      focus: () => void
      maximize: () => void
      close: () => void
      getLogsPath: () => Promise<string>
      openLogsFolder: () => Promise<void>
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
      onInitProgress: (
        callback: (data: { message: string; progress: number }) => void
      ) => () => void
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
      apiFetch: (url: string, options?: RequestInit) => Promise<Response>
      apiWebSocket: (url: string) => WebSocket
    }
  }
}
