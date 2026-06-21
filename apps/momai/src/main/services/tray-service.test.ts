import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TrayService, type TrayServiceDeps } from './tray-service'
import type { VariantConfig } from '../variants'
import * as electronMock from 'electron'

const trayInstance = vi.hoisted(() => ({
  setToolTip: vi.fn(),
  setContextMenu: vi.fn(),
  on: vi.fn(),
  destroy: vi.fn()
}))
const menuInstance = vi.hoisted(() => ({}))

vi.mock('electron', () => ({
  Tray: vi.fn(function () {
    return trayInstance
  }),
  Menu: { buildFromTemplate: vi.fn(() => menuInstance) },
  nativeImage: { createFromPath: vi.fn(() => ({})) },
  app: { quit: vi.fn() }
}))

vi.mock('../constants', () => ({
  ICON_PATH: '/fake/path/icon.png'
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
    llama: { start: vi.fn().mockResolvedValue(undefined), stop: vi.fn().mockResolvedValue(undefined) },
    keepInTray: { isEnabled: vi.fn(() => true) },
    isQuitting: vi.fn(() => false),
    variant: baseVariant,
    ...overrides
  }
}

describe('TrayService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates a Tray and registers click handler on start()', () => {
    const deps = makeDeps()
    const svc = new TrayService(deps)
    svc.start()
    expect(electronMock.Tray).toHaveBeenCalledTimes(1)
    expect(trayInstance.on).toHaveBeenCalledWith('click', expect.any(Function))
    svc.stop()
  })

  it('destroys the tray on stop()', () => {
    const deps = makeDeps()
    const svc = new TrayService(deps)
    svc.start()
    svc.stop()
    expect(trayInstance.destroy).toHaveBeenCalled()
  })

  it('sets tooltip containing the variant appName', () => {
    const deps = makeDeps()
    const svc = new TrayService(deps)
    svc.start()
    expect(trayInstance.setToolTip).toHaveBeenCalledWith(expect.stringContaining('MomAI (Dev)'))
    svc.stop()
  })

  it('builds a context menu with Abrir and Sair items', () => {
    const deps = makeDeps()
    const svc = new TrayService(deps)
    svc.start()
    const template = vi.mocked(electronMock.Menu.buildFromTemplate).mock.calls[0][0]
    const labels = template.map((item: any) => item.label)
    expect(labels).toContain('Abrir')
    expect(labels).toContain('Sair')
    svc.stop()
  })

  it('installs a close handler on the window on start()', () => {
    const deps = makeDeps()
    const svc = new TrayService(deps)
    svc.start()
    expect(deps.window.on).toHaveBeenCalledWith('close', expect.any(Function))
    svc.stop()
  })

  it('on close with keepInTray=true: hides window and stops llama, does not call app.quit()', () => {
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

  it('on close when isQuitting=true: returns early, no preventDefault, no actions', () => {
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

  it('on tray click when window is visible: hides and stops llama', () => {
    const deps = makeDeps({
      window: { ...makeDeps().window, isVisible: vi.fn(() => true) } as any
    })
    const svc = new TrayService(deps)
    svc.start()
    const clickHandler = trayInstance.on.mock.calls.find((c: any) => c[0] === 'click')![1]
    clickHandler()
    expect(deps.window.hide).toHaveBeenCalled()
    expect(deps.llama.stop).toHaveBeenCalled()
    svc.stop()
  })

  it('on tray click when window is hidden: shows, focuses, and starts llama', () => {
    const deps = makeDeps({
      window: { ...makeDeps().window, isVisible: vi.fn(() => false) } as any
    })
    const svc = new TrayService(deps)
    svc.start()
    const clickHandler = trayInstance.on.mock.calls.find((c: any) => c[0] === 'click')![1]
    clickHandler()
    expect(deps.window.show).toHaveBeenCalled()
    expect(deps.window.focus).toHaveBeenCalled()
    expect(deps.llama.start).toHaveBeenCalled()
    svc.stop()
  })

  it('"Abrir" menu item: shows, focuses, starts llama', () => {
    const deps = makeDeps()
    const svc = new TrayService(deps)
    svc.start()
    const template = vi.mocked(electronMock.Menu.buildFromTemplate).mock.calls[0][0]
    const abrir = template.find((item: any) => item.label === 'Abrir') as any
    abrir.click()
    expect(deps.window.show).toHaveBeenCalled()
    expect(deps.window.focus).toHaveBeenCalled()
    expect(deps.llama.start).toHaveBeenCalled()
    svc.stop()
  })

  it('"Sair" menu item: calls app.quit()', () => {
    const deps = makeDeps()
    const svc = new TrayService(deps)
    svc.start()
    const template = vi.mocked(electronMock.Menu.buildFromTemplate).mock.calls[0][0]
    const sair = template.find((item: any) => item.label === 'Sair') as any
    sair.click()
    expect(electronMock.app.quit).toHaveBeenCalled()
    svc.stop()
  })
})
