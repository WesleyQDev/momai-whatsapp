import { vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn((name: string) => {
      const paths: Record<string, string> = {
        userData: '/mock/user-data',
        temp: '/mock/temp',
        exe: '/mock/momai.exe',
        home: '/mock/home'
      }
      return paths[name] || '/mock/default'
    }),
    getVersion: vi.fn(() => '1.0.0'),
    getName: vi.fn(() => 'MomAI'),
    getLocale: vi.fn(() => 'pt-BR'),
    on: vi.fn(),
    quit: vi.fn(),
    whenReady: vi.fn(() => Promise.resolve()),
    isPackaged: false,
    getAppPath: vi.fn(() => '/mock/app-path'),
    setLoginItemSettings: vi.fn(),
    getLoginItemSettings: vi.fn(() => ({ openAtLogin: false }))
  },
  BrowserWindow: vi.fn(() => ({
    loadURL: vi.fn(),
    loadFile: vi.fn(),
    webContents: {
      openDevTools: vi.fn(),
      on: vi.fn(),
      send: vi.fn()
    },
    on: vi.fn(),
    once: vi.fn(),
    close: vi.fn(),
    destroy: vi.fn(),
    minimize: vi.fn(),
    maximize: vi.fn(),
    unmaximize: vi.fn(),
    focus: vi.fn(),
    show: vi.fn(),
    hide: vi.fn(),
    setResizable: vi.fn(),
    isMaximized: vi.fn(() => false),
    isDestroyed: vi.fn(() => false),
    getBounds: vi.fn(() => ({ x: 0, y: 0, width: 800, height: 600 })),
    setBounds: vi.fn(),
    setAlwaysOnTop: vi.fn(),
    setSkipTaskbar: vi.fn(),
    setIcon: vi.fn()
  })),
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn(),
    removeHandler: vi.fn()
  },
  Menu: {
    buildFromTemplate: vi.fn(() => ({ popup: vi.fn() })),
    setApplicationMenu: vi.fn()
  },
  Tray: vi.fn(() => ({
    setToolTip: vi.fn(),
    setContextMenu: vi.fn(),
    on: vi.fn(),
    destroy: vi.fn()
  })),
  Notification: vi.fn(() => ({
    show: vi.fn(),
    on: vi.fn()
  })),
  dialog: {
    showMessageBox: vi.fn(),
    showOpenDialog: vi.fn()
  },
  shell: {
    openPath: vi.fn(),
    openExternal: vi.fn(),
    showItemInFolder: vi.fn()
  },
  nativeImage: {
    createFromPath: vi.fn(() => ({
      resize: vi.fn(() => ({ toDataURL: vi.fn(() => 'data:image/png;base64,test') })),
      toDataURL: vi.fn(() => 'data:image/png;base64,test')
    }))
  },
  screen: {
    getPrimaryDisplay: vi.fn(() => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } })),
    getCursorScreenPoint: vi.fn(() => ({ x: 100, y: 100 }))
  }
}))

vi.mock('electron-log', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    transports: {
      file: { level: 'info', maxSize: 0, resolvePathFn: vi.fn(), format: '' },
      console: { level: false }
    },
    hooks: {
      push: vi.fn()
    },
    variables: {}
  }
}))

vi.mock('electron-updater', () => ({
  autoUpdater: {
    on: vi.fn(),
    checkForUpdates: vi.fn(() => Promise.resolve()),
    downloadUpdate: vi.fn(() => Promise.resolve()),
    quitAndInstall: vi.fn(),
    setFeedURL: vi.fn()
  }
}))
