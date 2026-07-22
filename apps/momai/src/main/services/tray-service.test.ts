import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TrayService, type TrayServiceDeps } from './tray-service'
import type { VariantConfig } from '../variants'
import * as electronMock from 'electron'
import type { EconomyService } from '../economyService'

const trayInstance = vi.hoisted(() => ({
  setToolTip: vi.fn(),
  setContextMenu: vi.fn(),
  on: vi.fn(),
  destroy: vi.fn()
}))

const menuWindowInstance = vi.hoisted(() => ({
  show: vi.fn(),
  close: vi.fn(),
  hide: vi.fn(),
  isVisible: vi.fn(() => false),
  sendState: vi.fn()
}))

vi.mock('electron', () => ({
  Tray: vi.fn(function () {
    return trayInstance
  }),
  Menu: { buildFromTemplate: vi.fn(() => ({})) },
  nativeImage: { createFromPath: vi.fn(() => ({})) },
  app: { quit: vi.fn() }
}))

vi.mock('./tray-menu-window', () => ({
  TrayMenuWindow: vi.fn(function () {
    return menuWindowInstance
  })
}))

vi.mock('../constants', () => ({
  ICON_PATH: '/fake/path/icon.png'
}))

vi.mock('../economyService', () => ({
  EconomyService: class {}
}))

const baseVariant: VariantConfig = {
  variant: 'dev',
  appId: 'com.wesleyqdev.momai.dev',
  appName: 'MomAI (Dev)',
  userDataSubdir: 'MomAI-Dev',
  corePort: 8050,
  pythonPort: 8051,
  llamaPort: 8052,
  embeddingPort: 8053,
  displayLabel: 'Dev'
}

function makeDeps(overrides: Partial<TrayServiceDeps> = {}): TrayServiceDeps {
  return {
    window: {
      isMinimized: vi.fn(() => false),
      isVisible: vi.fn(() => true),
      show: vi.fn(),
      hide: vi.fn(),
      focus: vi.fn(),
      on: vi.fn()
    } as any,
    llama: {
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
      getStatus: vi.fn().mockResolvedValue({ running: false, ready: false, loading: false })
    },
    keepInTray: { isEnabled: vi.fn(() => true) },
    isQuitting: vi.fn(() => false),
    variant: baseVariant,
    getEconomy: undefined,
    ...overrides
  }
}

describe('TrayService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates a Tray and registers click and right-click handlers on start()', () => {
    const deps = makeDeps()
    const svc = new TrayService(deps)
    svc.start()
    expect(electronMock.Tray).toHaveBeenCalledTimes(1)
    expect(trayInstance.on).toHaveBeenCalledWith('click', expect.any(Function))
    expect(trayInstance.on).toHaveBeenCalledWith('right-click', expect.any(Function))
    svc.stop()
  })

  it('destroys the tray and closes menu window on stop()', () => {
    const deps = makeDeps()
    const svc = new TrayService(deps)
    svc.start()
    svc.stop()
    expect(trayInstance.destroy).toHaveBeenCalled()
    expect(menuWindowInstance.close).toHaveBeenCalled()
  })

  it('sets tooltip containing the variant appName', () => {
    const deps = makeDeps()
    const svc = new TrayService(deps)
    svc.start()
    expect(trayInstance.setToolTip).toHaveBeenCalledWith(expect.stringContaining('MomAI (Dev)'))
    svc.stop()
  })

  it('installs a close handler on the window on start()', () => {
    const deps = makeDeps()
    const svc = new TrayService(deps)
    svc.start()
    expect(deps.window.on).toHaveBeenCalledWith('close', expect.any(Function))
    svc.stop()
  })

  it('on close with keepInTray=true: hides window and stops llama', () => {
    const deps = makeDeps()
    const svc = new TrayService(deps)
    svc.start()
    const closeHandler = (deps.window.on as any).mock.calls.find((c: any) => c[0] === 'close')[1]
    const event = { preventDefault: vi.fn() }
    closeHandler(event)
    expect(event.preventDefault).toHaveBeenCalled()
    expect(deps.window.hide).toHaveBeenCalled()
    expect(deps.llama.stop).toHaveBeenCalled()
    expect(electronMock.app.quit).not.toHaveBeenCalled()
    svc.stop()
  })

  it('on close with keepInTray=false: destroys tray and calls app.quit()', () => {
    const deps = makeDeps({ keepInTray: { isEnabled: vi.fn(() => false) } })
    const svc = new TrayService(deps)
    svc.start()
    const closeHandler = (deps.window.on as any).mock.calls.find((c: any) => c[0] === 'close')[1]
    const event = { preventDefault: vi.fn() }
    closeHandler(event)
    expect(event.preventDefault).toHaveBeenCalled()
    expect(trayInstance.destroy).toHaveBeenCalled()
    expect(electronMock.app.quit).toHaveBeenCalled()
    expect(deps.llama.stop).not.toHaveBeenCalled()
    svc.stop()
  })

  it('on close when isQuitting=true: returns early', () => {
    const deps = makeDeps({ isQuitting: vi.fn(() => true) })
    const svc = new TrayService(deps)
    svc.start()
    const closeHandler = (deps.window.on as any).mock.calls.find((c: any) => c[0] === 'close')[1]
    const event = { preventDefault: vi.fn() }
    closeHandler(event)
    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(deps.window.hide).not.toHaveBeenCalled()
    expect(deps.llama.stop).not.toHaveBeenCalled()
    expect(electronMock.app.quit).not.toHaveBeenCalled()
    svc.stop()
  })

  it('on tray click when window is visible: hides menuWindow, hides window, and stops llama', () => {
    const deps = makeDeps({
      window: { ...makeDeps().window, isVisible: vi.fn(() => true) } as any
    })
    const svc = new TrayService(deps)
    svc.start()
    const clickHandler = trayInstance.on.mock.calls.find((c: any) => c[0] === 'click')![1]
    clickHandler()
    expect(menuWindowInstance.hide).toHaveBeenCalled()
    expect(deps.window.hide).toHaveBeenCalled()
    expect(deps.llama.stop).toHaveBeenCalled()
    svc.stop()
  })

  it('on tray click when window is hidden: hides menuWindow, shows, focuses, and starts llama', () => {
    const deps = makeDeps({
      window: { ...makeDeps().window, isVisible: vi.fn(() => false) } as any
    })
    const svc = new TrayService(deps)
    svc.start()
    const clickHandler = trayInstance.on.mock.calls.find((c: any) => c[0] === 'click')![1]
    clickHandler()
    expect(menuWindowInstance.hide).toHaveBeenCalled()
    expect(deps.window.show).toHaveBeenCalled()
    expect(deps.window.focus).toHaveBeenCalled()
    expect(deps.llama.start).toHaveBeenCalled()
    svc.stop()
  })

  it('right-click calls TrayMenuWindow.show() with state and does not call sendState separately', async () => {
    const deps = makeDeps()
    const svc = new TrayService(deps)
    svc.start()
    const rightClickHandler = trayInstance.on.mock.calls.find(
      (c: any) => c[0] === 'right-click'
    )![1]
    rightClickHandler()
    await new Promise((resolve) => setTimeout(resolve))
    expect(menuWindowInstance.show).toHaveBeenCalledWith(
      trayInstance,
      expect.objectContaining({ variantName: 'MomAI (Dev)' })
    )
    expect(menuWindowInstance.sendState).not.toHaveBeenCalled()
    svc.stop()
  })

  it('updates tooltip periodically via timer', () => {
    vi.useFakeTimers()
    const deps = makeDeps()
    const svc = new TrayService(deps)
    svc.start()
    const callsBefore = trayInstance.setToolTip.mock.calls.length
    vi.advanceTimersByTime(3000)
    expect(trayInstance.setToolTip.mock.calls.length).toBeGreaterThan(callsBefore)
    svc.stop()
    vi.useRealTimers()
  })

  it('state timer sends state to menu window periodically', async () => {
    vi.useFakeTimers()
    const deps = makeDeps()
    const svc = new TrayService(deps)
    svc.start()
    await vi.advanceTimersByTimeAsync(1000)
    expect(menuWindowInstance.sendState).toHaveBeenCalledWith(
      expect.objectContaining({ variantName: 'MomAI (Dev)' })
    )
    const callsBefore = menuWindowInstance.sendState.mock.calls.length
    await vi.advanceTimersByTimeAsync(2000)
    expect(menuWindowInstance.sendState.mock.calls.length).toBeGreaterThan(callsBefore)
    svc.stop()
    vi.useRealTimers()
  })

  it('tooltip shows soneca countdown when economy is available', () => {
    vi.useFakeTimers()
    const mockEconomy = {
      getTimeUntilNextSoneca: vi.fn(() => 120),
      getState: vi.fn(() => ({ active: false, reason: null, detectedGames: [] }))
    } as unknown as EconomyService
    const deps = makeDeps({ getEconomy: () => mockEconomy })
    const svc = new TrayService(deps)
    svc.start()
    vi.advanceTimersByTime(1000)
    expect(trayInstance.setToolTip).toHaveBeenCalledWith(expect.stringContaining('soneca em'))
    svc.stop()
    vi.useRealTimers()
  })

  it('tooltip shows sleeping indicator when soneca is active', () => {
    vi.useFakeTimers()
    const mockEconomy = {
      getTimeUntilNextSoneca: vi.fn(() => 0),
      getState: vi.fn(() => ({ active: true, reason: 'idle', detectedGames: [] }))
    } as unknown as EconomyService
    const deps = makeDeps({ getEconomy: () => mockEconomy })
    const svc = new TrayService(deps)
    svc.start()
    vi.advanceTimersByTime(1000)
    expect(trayInstance.setToolTip).toHaveBeenCalledWith(expect.stringContaining('soneca ativa'))
    svc.stop()
    vi.useRealTimers()
  })
})
