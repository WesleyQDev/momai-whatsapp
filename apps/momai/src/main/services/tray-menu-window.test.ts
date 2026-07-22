import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TrayMenuWindow, type TrayState } from './tray-menu-window'
import * as electronMock from 'electron'

const mockWin = vi.hoisted(() => ({
  loadURL: vi.fn(),
  loadFile: vi.fn(),
  show: vi.fn(),
  hide: vi.fn(),
  close: vi.fn(),
  isDestroyed: vi.fn(() => false),
  isVisible: vi.fn(() => true),
  setPosition: vi.fn(),
  focus: vi.fn(),
  on: vi.fn(),
  webContents: {
    send: vi.fn(),
    on: vi.fn(),
    once: vi.fn()
  }
}))

const mockTray = vi.hoisted(() => ({
  getBounds: vi.fn(() => ({ x: 100, y: 900, width: 32, height: 32 }))
}))

vi.mock('electron', () => ({
  BrowserWindow: vi.fn(function () {
    return mockWin
  }),
  screen: {
    getDisplayNearestPoint: vi.fn(() => ({
      workArea: { x: 0, y: 0, width: 1920, height: 1080, bottom: 1080 }
    }))
  }
}))

vi.mock('@electron-toolkit/utils', () => ({
  is: { dev: false }
}))

describe('TrayMenuWindow', () => {
  let trayMenu: TrayMenuWindow
  const sampleState: TrayState = {
    llama: { running: true, loading: false, ready: true },
    economy: { active: false, reason: null, secondsUntilSoneca: -1 },
    variantName: 'MomAI (Dev)'
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockWin.isDestroyed.mockReturnValue(false)
    mockWin.isVisible.mockReturnValue(true)
    mockTray.getBounds.mockReturnValue({ x: 100, y: 900, width: 32, height: 32 })
    trayMenu = new TrayMenuWindow()
  })

  it('creates window lazily on first show()', () => {
    expect(electronMock.BrowserWindow).not.toHaveBeenCalled()

    trayMenu.show(mockTray as any)

    expect(electronMock.BrowserWindow).toHaveBeenCalledTimes(1)
    expect(electronMock.BrowserWindow).toHaveBeenCalledWith({
      width: 240,
      height: 180,
      frame: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      hasShadow: true,
      resizable: false,
      backgroundColor: '#3a3a3a',
      webPreferences: {
        preload: expect.stringMatching(/preload[/\\]index\.js$/),
        additionalArguments: ['--momai-is-dev=false']
      }
    })
  })

  it('reuses window on second show()', () => {
    trayMenu.show(mockTray as any)
    trayMenu.show(mockTray as any)

    expect(electronMock.BrowserWindow).toHaveBeenCalledTimes(1)
    expect(mockWin.show).toHaveBeenCalledTimes(1)
  })

  it('positions window near tray icon using getBounds and getDisplayNearestPoint', () => {
    trayMenu.show(mockTray as any)

    expect(mockTray.getBounds).toHaveBeenCalled()
    expect(electronMock.screen.getDisplayNearestPoint).toHaveBeenCalledWith({ x: 100, y: 900 })
    expect(mockWin.setPosition).toHaveBeenCalledWith(0, 864)
  })

  it('sendState sends tray:state-update IPC when visible', () => {
    trayMenu.show(mockTray as any)
    mockWin.isVisible.mockReturnValue(true)

    trayMenu.sendState(sampleState)

    expect(mockWin.webContents.send).toHaveBeenCalledWith('tray:state-update', sampleState)
  })

  it('sendState does not send IPC when window is hidden', () => {
    trayMenu.show(mockTray as any)
    mockWin.isVisible.mockReturnValue(false)

    trayMenu.sendState(sampleState)

    expect(mockWin.webContents.send).not.toHaveBeenCalled()
  })

  it('show() with state defers send via did-finish-load on first show', () => {
    trayMenu.show(mockTray as any, sampleState)

    const loadHandler = mockWin.webContents.once.mock.calls.find(
      (c) => c[0] === 'did-finish-load'
    )?.[1]
    expect(loadHandler).toBeDefined()

    loadHandler()
    expect(mockWin.webContents.send).toHaveBeenCalledWith('tray:state-update', sampleState)
  })

  it('show() without state on first show does not register did-finish-load', () => {
    trayMenu.show(mockTray as any)

    expect(mockWin.webContents.once).not.toHaveBeenCalledWith(
      'did-finish-load',
      expect.any(Function)
    )
  })

  it('show() on reused window sends state immediately without did-finish-load deferral', () => {
    trayMenu.show(mockTray as any)
    vi.clearAllMocks()

    trayMenu.show(mockTray as any, sampleState)

    expect(mockWin.webContents.send).toHaveBeenCalledWith('tray:state-update', sampleState)
    expect(mockWin.webContents.once).not.toHaveBeenCalled()
  })

  it('blur event hides the window', () => {
    trayMenu.show(mockTray as any)

    const blurHandler = mockWin.on.mock.calls.find((c) => c[0] === 'blur')?.[1]
    expect(blurHandler).toBeDefined()

    blurHandler()

    expect(mockWin.hide).toHaveBeenCalled()
  })

  it('Escape key closes the window', () => {
    trayMenu.show(mockTray as any)

    const escapeHandler = mockWin.webContents.on.mock.calls.find(
      (c) => c[0] === 'before-input-event'
    )?.[1]
    expect(escapeHandler).toBeDefined()

    escapeHandler(null, { key: 'Escape' })

    expect(mockWin.close).toHaveBeenCalled()
    expect(trayMenu.isVisible()).toBe(false)
  })

  it('non-Escape key does not close the window', () => {
    trayMenu.show(mockTray as any)

    const escapeHandler = mockWin.webContents.on.mock.calls.find(
      (c) => c[0] === 'before-input-event'
    )?.[1]

    escapeHandler(null, { key: 'Enter' })

    expect(mockWin.close).not.toHaveBeenCalled()
  })

  it('closed event sets win to null', () => {
    trayMenu.show(mockTray as any)

    const closedHandler = mockWin.on.mock.calls.find((c) => c[0] === 'closed')?.[1]
    expect(closedHandler).toBeDefined()

    closedHandler()
    expect(trayMenu.isVisible()).toBe(false)
  })

  it('did-fail-load logs error and closes window', () => {
    trayMenu.show(mockTray as any)

    const failHandler = mockWin.webContents.on.mock.calls.find(
      (c) => c[0] === 'did-fail-load'
    )?.[1]
    expect(failHandler).toBeDefined()

    failHandler(null, -3, 'ERR_FILE_NOT_FOUND')
    expect(mockWin.close).toHaveBeenCalled()
  })

  it('hide() hides the window', () => {
    trayMenu.show(mockTray as any)
    trayMenu.hide()
    expect(mockWin.hide).toHaveBeenCalled()
  })

  it('hide() does nothing when window is destroyed', () => {
    trayMenu.show(mockTray as any)
    mockWin.isDestroyed.mockReturnValue(true)

    trayMenu.hide()

    expect(mockWin.hide).not.toHaveBeenCalled()
  })

  it('close() closes and nullifies the window', () => {
    trayMenu.show(mockTray as any)
    trayMenu.close()
    expect(mockWin.close).toHaveBeenCalled()
    expect(trayMenu.isVisible()).toBe(false)
  })

  it('isVisible() returns true when window is visible', () => {
    trayMenu.show(mockTray as any)
    mockWin.isVisible.mockReturnValue(true)
    expect(trayMenu.isVisible()).toBe(true)
  })

  it('isVisible() returns false when window is hidden', () => {
    trayMenu.show(mockTray as any)
    mockWin.isVisible.mockReturnValue(false)
    expect(trayMenu.isVisible()).toBe(false)
  })

  it('sendState does nothing when window is closed', () => {
    trayMenu.show(mockTray as any)
    trayMenu.close()

    trayMenu.sendState(sampleState)

    expect(mockWin.webContents.send).not.toHaveBeenCalled()
  })
})
