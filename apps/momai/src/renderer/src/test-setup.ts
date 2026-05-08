import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Mock the preload bridge (window.api)
const mockApi = {
  minimize: vi.fn(),
  focus: vi.fn(),
  maximize: vi.fn(),
  close: vi.fn(),
  setResizable: vi.fn(),
  resetWindowSize: vi.fn(),
  isWindowMaximized: vi.fn(() => Promise.resolve(false)),
  onWindowStateChanged: vi.fn(),
  getLogsPath: vi.fn(() => Promise.resolve('/mock/logs')),
  openLogsFolder: vi.fn(),
  readLogs: vi.fn(() => Promise.resolve('mock logs')),
  getAppVersion: vi.fn(() => Promise.resolve('1.0.0')),
  isFirstLaunch: vi.fn(() => Promise.resolve(false)),
  getAutoStart: vi.fn(() => Promise.resolve(false)),
  setAutoStart: vi.fn(),
  onBootstrapError: vi.fn(),
  onInitProgress: vi.fn(),
  onBackendOnline: vi.fn(),
  onBackendRetry: vi.fn(),
  restartBackend: vi.fn(),
  restartApp: vi.fn(),
  checkForUpdates: vi.fn(),
  downloadUpdate: vi.fn(),
  quitAndInstallUpdate: vi.fn(),
  onUpdateAvailable: vi.fn(),
  onUpdateProgress: vi.fn(),
  onUpdateDownloaded: vi.fn(),
  onUpdateError: vi.fn(),
  markFirstLaunchFinished: vi.fn(),
  notes: {
    list: vi.fn(() => Promise.resolve([])),
    get: vi.fn(),
    create: vi.fn(() => Promise.resolve({ id: '1', title: 'Note' })),
    update: vi.fn(),
    delete: vi.fn(),
    import: vi.fn(),
    listFolders: vi.fn(() => Promise.resolve([])),
    createFolder: vi.fn(),
    renameFolder: vi.fn(),
    deleteFolder: vi.fn(),
    openFolder: vi.fn(),
    search: vi.fn(() => Promise.resolve([]))
  }
}

// Use Object.defineProperty since jsdom is already initialized
Object.defineProperty(window, 'api', {
  value: mockApi,
  writable: true,
  configurable: true
})

Object.defineProperty(window, 'electron', {
  value: {},
  writable: true,
  configurable: true
})

// Mock WebSocket
class MockWebSocket {
  onopen: (() => void) | null = null
  onclose: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onerror: ((event: any) => void) | null = null
  readyState: number = 0
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3

  constructor(_url: string) {
    setTimeout(() => {
      this.readyState = 1
      this.onopen?.()
    }, 0)
  }

  send = vi.fn()
  close = vi.fn()
}

vi.stubGlobal('WebSocket', MockWebSocket)

// Mock AudioContext
class MockAudioContext {
  currentTime = 0
  destination = {}
  createBufferSource = vi.fn(() => ({
    buffer: null,
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    onended: null
  }))
  decodeAudioData = vi.fn(() => Promise.resolve({}))
  resume = vi.fn(() => Promise.resolve())
  close = vi.fn()
}

vi.stubGlobal('AudioContext', MockAudioContext)

// Mock HTMLAudioElement
class MockHTMLAudioElement {
  play = vi.fn(() => Promise.resolve())
  pause = vi.fn()
  load = vi.fn()
  addEventListener = vi.fn()
  removeEventListener = vi.fn()
}

vi.stubGlobal('HTMLAudioElement', MockHTMLAudioElement)

// Mock ResizeObserver
vi.stubGlobal('ResizeObserver', vi.fn(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn()
})))

// Mock IntersectionObserver
vi.stubGlobal('IntersectionObserver', vi.fn(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
  root: null,
  rootMargin: '',
  thresholds: []
})))
