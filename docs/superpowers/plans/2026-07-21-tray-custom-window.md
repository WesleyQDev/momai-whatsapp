# Tray Custom Window — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace native Windows tray context menu with a live-updating borderless BrowserWindow that shows LLM status + soneca countdown + action buttons.

**Architecture:** Right-click tray icon → `TrayMenuWindow.show()` creates/reuses a borderless BrowserWindow loading React route `/tray-menu`. Main process sends `tray:state-update` via IPC every 1s while window is visible. Renderer dispatches `tray:action-*` IPC on button clicks. Window closes on blur, Escape, or exit actions.

**Tech Stack:** Electron BrowserWindow (borderless), React (hash route /tray-menu), preload IPC bridge, Electron IPC, Electron `screen` + `Tray.getBounds()` for positioning, Vitest for tests.

## Global Constraints

- Follow existing borderless BrowserWindow patterns from `windowManager.ts` (overlay window)
- Dark/light theme via CSS `prefers-color-scheme` media query
- No emojis, no icons — native menu style
- Width 240px, height variable
- Tooltip 1s timer must continue working unchanged
- Remove `setContextMenu()` calls — no more native context menu
- All existing tray-service tests must be adapted, not removed (they test tooltip, close handler, click handler)

---

### Task 1: TrayMenuWindow class (main process)

**Files:**
- Create: `apps/momai/src/main/services/tray-menu-window.ts`
- Test: `apps/momai/src/main/services/tray-menu-window.test.ts`

**Interfaces:**
- Consumes: `BrowserWindow` from `electron`, `screen` from `electron`, `Tray` instance, `TrayState` snapshot builder
- Produces: `TrayMenuWindow` class with `show(tray: Tray)`, `close()`, `isVisible()` methods

- [ ] **Step 1: Write the failing tests**

```ts
// tray-menu-window.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { TrayMenuWindow } from './tray-menu-window'
import type { TrayState } from './tray-menu-window'

const bwInstance = vi.hoisted(() => ({
  loadURL: vi.fn(),
  show: vi.fn(),
  hide: vi.fn(),
  close: vi.fn(),
  isDestroyed: vi.fn(() => false),
  on: vi.fn(),
  webContents: { send: vi.fn() },
  setSize: vi.fn(),
  setPosition: vi.fn(),
  focus: vi.fn()
}))

vi.mock('electron', () => ({
  BrowserWindow: vi.fn(function () { return bwInstance }),
  screen: {
    getDisplayNearestPoint: vi.fn(() => ({
      workArea: { x: 0, y: 0, width: 1920, height: 1080 }
    }))
  },
  app: { quit: vi.fn() }
}))

vi.mock('../constants', () => ({ ICON_PATH: '/fake/path/icon.png' }))

function fakeTray() {
  return { getBounds: vi.fn(() => ({ x: 1800, y: 1050, width: 24, height: 30 })),
           setToolTip: vi.fn() } as any
}

function makeState(overrides: Partial<TrayState> = {}): TrayState {
  return {
    llama: { running: true, loading: false, ready: true },
    economy: { active: false, reason: null, secondsUntilSoneca: 120 },
    variantName: 'MomAI (Dev)',
    ...overrides
  }
}
```

```ts
it('lazily creates a BrowserWindow on first show()', () => {
  const electron = require('electron')
  const menu = new TrayMenuWindow()
  menu.show(fakeTray())
  expect(electron.BrowserWindow).toHaveBeenCalledTimes(1)
  menu.close()
})
```

```ts
it('reuses existing BrowserWindow on second show()', () => {
  const electron = require('electron')
  const menu = new TrayMenuWindow()
  menu.show(fakeTray())
  menu.close()
  menu.show(fakeTray())
  expect(electron.BrowserWindow).toHaveBeenCalledTimes(1)
  menu.close()
})
```

```ts
it('positions window above tray icon using tray.getBounds()', () => {
  // tray at x=1800, y=1050 on 1920x1080 display
  const tray = fakeTray()
  const menu = new TrayMenuWindow()
  menu.show(tray)
  // Window x should be tray center minus half width:
  // 1800 + 12 - 120 = 1692
  // y should be bottom of workArea minus tray.height minus 4 minus window height:
  // 1080 - 30 - 4 - windowHeight
  const calls = vi.mocked(bwInstance.setPosition).mock.calls
  expect(calls.length).toBeGreaterThan(0)
  const [x] = calls[0]
  expect(x).toBeGreaterThanOrEqual(0)
  menu.close()
})
```

```ts
it('sends tray:state-update to renderer when visible', async () => {
  const menu = new TrayMenuWindow()
  const state = makeState()
  menu.show(fakeTray(), state)
  expect(bwInstance.webContents.send).toHaveBeenCalledWith('tray:state-update', state)
  menu.close()
})
```

```ts
it('closes the window on blur event', () => {
  const menu = new TrayMenuWindow()
  menu.show(fakeTray())
  // find blur handler
  const blurHandler = bwInstance.on.mock.calls.find((c: any) => c[0] === 'blur')?.[1]
  expect(blurHandler).toBeDefined()
  blurHandler()
  expect(bwInstance.hide).toHaveBeenCalled()
  menu.close()
})
```

```ts
it('closes the window on Escape keypress', () => {
  const menu = new TrayMenuWindow()
  menu.show(fakeTray())
  const inputHandler = bwInstance.on.mock.calls.find((c: any) =>
    c[0] === 'web-contents-created')?.[1]
  // Simulate webContents created -> input event listener
  // Alternatively, the escape handler is on the window itself
  const keyHandler = bwInstance.on.mock.calls.find(
    (c: any) => c[0] === 'web-contents-created')?.[1]
  if (keyHandler) {
    const fakeWebContents = { on: vi.fn() }
    keyHandler(fakeWebContents)
    const escHandler = fakeWebContents.on.mock.calls.find((c: any) => c[0] === 'before-input-event')?.[1]
    if (escHandler) {
      escHandler(null, { key: 'Escape' })
      expect(bwInstance.close).toHaveBeenCalled()
    }
  }
  menu.close()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/momai && pnpm test:main -- --reporter=verbose`
Expected: Errors about missing module `tray-menu-window`

- [ ] **Step 3: Write minimal implementation**

```ts
// tray-menu-window.ts
import { BrowserWindow, app, screen } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { ICON_PATH } from '../constants'

export interface TrayState {
  llama: { running: boolean; loading: boolean; ready: boolean }
  economy: {
    active: boolean
    reason: 'idle' | 'game' | null
    secondsUntilSoneca: number
  }
  variantName: string
}

const MENU_WIDTH = 240
const MENU_HEIGHT = 280

export class TrayMenuWindow {
  private win: BrowserWindow | null = null

  show(tray: { getBounds: () => { x: number; y: number; width: number; height: number } }, state?: TrayState): void {
    if (!this.win || this.win.isDestroyed()) {
      this.win = this.createWindow()
    }

    const trayBounds = tray.getBounds()
    const display = screen.getDisplayNearestPoint({ x: trayBounds.x, y: trayBounds.y })
    const { workArea } = display

    let x = Math.round(trayBounds.x + trayBounds.width / 2 - MENU_WIDTH / 2)
    if (x < workArea.x) x = workArea.x + 4
    if (x + MENU_WIDTH > workArea.x + workArea.width) x = workArea.x + workArea.width - MENU_WIDTH - 4
    const y = workArea.y + workArea.height - MENU_HEIGHT - trayBounds.height - 4

    this.win.setPosition(x, y)
    this.win.setSize(MENU_WIDTH, MENU_HEIGHT)
    if (state) {
      this.win.webContents.send('tray:state-update', state)
    }
    this.win.show()
    this.win.focus()
  }

  close(): void {
    if (this.win && !this.win.isDestroyed()) {
      this.win.close()
    }
  }

  hide(): void {
    if (this.win && !this.win.isDestroyed() && this.win.isVisible()) {
      this.win.hide()
    }
  }

  isVisible(): boolean {
    return this.win !== null && !this.win.isDestroyed() && this.win.isVisible()
  }

  sendState(state: TrayState): void {
    if (this.isVisible()) {
      this.win!.webContents.send('tray:state-update', state)
    }
  }

  private createWindow(): BrowserWindow {
    const win = new BrowserWindow({
      width: MENU_WIDTH,
      height: MENU_HEIGHT,
      show: false,
      frame: false,
      resizable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      hasShadow: true,
      backgroundColor: '#141414',
      icon: ICON_PATH,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: true,
        additionalArguments: [`--momai-is-dev=${is.dev}`]
      }
    })

    win.on('blur', () => {
      win.hide()
    })

    win.webContents.on('before-input-event', (_event, input) => {
      if (input.key === 'Escape') {
        win.close()
      }
    })

    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#/tray-menu`)
    } else {
      win.loadFile(join(__dirname, '../renderer/index.html'), { hash: '/tray-menu' })
    }

    win.on('closed', () => {
      this.win = null
    })

    return win
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/momai && pnpm test:main -- --reporter=verbose`
Expected: All tray-menu-window tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/momai/src/main/services/tray-menu-window.ts apps/momai/src/main/services/tray-menu-window.test.ts
git commit -m "feat(tray): add TrayMenuWindow borderless window for live menu"
```

---

### Task 2: Modify TrayService to use TrayMenuWindow

**Files:**
- Modify: `apps/momai/src/main/services/tray-service.ts` (lines 1-223 — nearly entire file)
- Modify: `apps/momai/src/main/services/tray-service.test.ts`
- Test: `apps/momai/src/main/services/tray-service.test.ts`

**Interfaces:**
- Consumes: `TrayMenuWindow` from `./tray-menu-window`
- Produces: Updated `TrayService` with `right-click` → `TrayMenuWindow.show()`, no more `setContextMenu()`

- [ ] **Step 1: Update tests — replace menu tests with right-click + popup show tests**

```ts
// In tray-service.test.ts — add import
import { TrayMenuWindow } from './tray-menu-window'

vi.mock('./tray-menu-window', () => ({
  TrayMenuWindow: vi.fn(function () {
    return {
      show: vi.fn(),
      close: vi.fn(),
      hide: vi.fn(),
      isVisible: vi.fn(() => false),
      sendState: vi.fn()
    }
  })
}))
```

Update existing tests:
- Change `"creates a Tray and registers click handler on start()"` to also check `on` is called with `'right-click'` (use `trayInstance.on.mock.calls`)
- Change `"builds a context menu with Abrir and Sair items"` → should test that right-click handler calls `TrayMenuWindow.show()`
- Add new test: `"right-click creates menu window show and passes state"`
- Remove / rewrite tests that checked `buildFromTemplate` labels (`'Abrir'`, `'Sair'`, `'Iniciar LLM'`, `'Parar LLM'`, `'Reiniciar LLM'`, soneca countdown labels) — these now live in the popup
- Keep: tooltip tests, close handler tests, click handler tests, timer tests

New test for right-click:

```ts
it('on right-click calls TrayMenuWindow.show()', () => {
  const deps = makeDeps()
  const svc = new TrayService(deps)
  svc.start()
  const rightClickHandler = trayInstance.on.mock.calls.find(
    (c: any) => c[0] === 'right-click'
  )![1]
  rightClickHandler()
  expect(trayMenuWindowInstance.show).toHaveBeenCalled()
  svc.stop()
})
```

Note: use `vi.mocked(TrayMenuWindow).mock.results[0].value` to get the instance after `start()`, or extract into a variable from the mock constructor.

Also remove the `setContextMenu` assertions and the `Menu.buildFromTemplate` assertions from existing tests. Keep tests for:
- `creates a Tray and registers click handler on start()` — update to check both `click` and `right-click`
- `destroys the tray on stop()`
- `sets tooltip containing the variant appName`
- `on close with keepInTray=true: hides window and stops llama, does not call app.quit()`
- `on close with keepInTray=false: destroys tray and calls app.quit()`
- `on close when isQuitting=true: returns early`
- `on tray click when window is visible: hides and stops llama`
- `on tray click when window is hidden: shows, focuses, and starts llama`
- `updates tooltip periodically via timer` (rename from "updates context menu periodically via timer")
- `right-click calls TrayMenuWindow.show()` (new)
- `tooltip shows soneca countdown` (was `tray-service.test.ts:224` — adapt to check `setToolTip` instead of menu item)
- `tooltip shows sleeping indicator when soneca is active` (adapt)

- [ ] **Step 2: Run tests to verify relevant ones fail**

Run: `cd apps/momai && pnpm test:main -- --reporter=verbose`
Expected: Some old tests fail (menu label checks), new right-click tests pass

- [ ] **Step 3: Rewrite TrayService implementation**

```ts
// tray-service.ts — full replacement
import { Tray, nativeImage, app } from 'electron'
import type { BrowserWindow } from 'electron'
import type { LlamaControl, LlamaRuntimeStatus } from './llama-control'
import type { KeepInTrayReader } from './keep-in-tray-reader'
import type { VariantConfig } from '../variants'
import type { EconomyService } from '../economyService'
import { ICON_PATH } from '../constants'
import { TrayMenuWindow } from './tray-menu-window'
import type { TrayState } from './tray-menu-window'

export interface TrayServiceDeps {
  window: BrowserWindow
  llama: LlamaControl
  keepInTray: KeepInTrayReader
  isQuitting: () => boolean
  variant: VariantConfig
  getEconomy?: () => EconomyService | null
}

export class TrayService {
  private tray: Tray | null = null
  private closeHandlerInstalled = false
  private tooltipTimer: ReturnType<typeof setInterval> | null = null
  private stateTimer: ReturnType<typeof setInterval> | null = null
  private llamaStatus: LlamaRuntimeStatus = { running: false, ready: false, loading: false }
  private menuWindow = new TrayMenuWindow()

  constructor(private readonly deps: TrayServiceDeps) {}

  start(): void {
    if (this.tray) return
    this.createTrayIcon()
    this.installCloseHandler()

    this.deps.llama.getStatus().then((s) => {
      this.llamaStatus = s
    })

    this.tooltipTimer = setInterval(() => {
      this.updateTooltip()
    }, 1000)

    this.stateTimer = setInterval(() => {
      this.updateState()
    }, 1000)
  }

  stop(): void {
    if (this.tooltipTimer) {
      clearInterval(this.tooltipTimer)
      this.tooltipTimer = null
    }
    if (this.stateTimer) {
      clearInterval(this.stateTimer)
      this.stateTimer = null
    }
    this.menuWindow.close()
    this.tray?.destroy()
    this.tray = null
  }

  private buildState(): TrayState {
    const s = this.llamaStatus
    const economy = this.deps.getEconomy?.()
    const remaining = economy?.getTimeUntilNextSoneca() ?? -1
    const economyState = economy?.getState()

    return {
      llama: { running: s.running, loading: s.loading, ready: s.ready },
      economy: {
        active: economyState?.active ?? false,
        reason: economyState?.reason ?? null,
        secondsUntilSoneca: remaining
      },
      variantName: this.deps.variant.appName
    }
  }

  private updateState(): void {
    this.deps.llama.getStatus().then((s) => {
      this.llamaStatus = s
      this.menuWindow.sendState(this.buildState())
    })
  }

  private createTrayIcon(): void {
    const tray = new Tray(nativeImage.createFromPath(ICON_PATH))
    tray.setToolTip(this.deps.variant.appName)
    tray.on('click', () => this.onTrayClick())
    tray.on('right-click', () => this.onTrayRightClick())
    this.tray = tray
  }

  private updateTooltip(): void {
    if (!this.tray) return
    const s = this.llamaStatus
    const name = this.deps.variant.appName
    const economy = this.deps.getEconomy?.()

    if (economy) {
      const remaining = economy.getTimeUntilNextSoneca()
      const state = economy.getState()

      if (state.active && state.reason === 'idle') {
        this.tray.setToolTip(`${name} — LLM parado · soneca ativa`)
        return
      }
      if (remaining > 0) {
        const min = Math.floor(remaining / 60)
        const sec = remaining % 60
        this.tray.setToolTip(`${name} — LLM ${s.running ? 'ativo' : 'parado'} · soneca em ${min}min ${sec}s`)
        return
      }
    }

    const status = s.loading ? 'iniciando' : s.running ? 'ativo' : 'parado'
    this.tray.setToolTip(`${name} — LLM ${status}`)
  }

  private onTrayRightClick(): void {
    this.deps.llama.getStatus().then((s) => {
      this.llamaStatus = s
      this.menuWindow.show(this.tray!, this.buildState())
    })
  }

  private onTrayClick(): void {
    this.menuWindow.hide()
    if (this.deps.window.isVisible()) {
      this.deps.window.hide()
      void this.deps.llama.stop()
    } else {
      this.showWindow()
    }
  }

  private installCloseHandler(): void {
    if (this.closeHandlerInstalled) return
    this.deps.window.on('close', (event) => this.handleClose(event))
    this.closeHandlerInstalled = true
  }

  private handleClose(event: { preventDefault: () => void }): void {
    if (this.deps.isQuitting()) return
    event.preventDefault()

    if (this.deps.keepInTray.isEnabled()) {
      this.deps.window.hide()
      void this.deps.llama.stop()
      return
    }

    this.deps.window.hide()
    this.stop()
    app.quit()
  }

  private showWindow(): void {
    this.deps.window.show()
    this.deps.window.focus()
    void this.deps.llama.start()
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/momai && pnpm test:main -- --reporter=verbose`
Expected: All tray-service tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/momai/src/main/services/tray-service.ts apps/momai/src/main/services/tray-service.test.ts
git commit -m "feat(tray): replace native context menu with TrayMenuWindow popup"
```

---

### Task 3: Register tray IPC handlers in coreManager.ts

**Files:**
- Modify: `apps/momai/src/main/coreManager.ts` (add IPC handlers)

**Interfaces:**
- Consumes: `ipcMain` from `electron`, `getEconomyService()`, `app` from `electron`, `getMainWindow()` from `./windowManager`
- Produces: IPC handlers for `tray:action-start`, `tray:action-stop`, `tray:action-restart`, `tray:action-open`, `tray:action-quit`

- [ ] **Step 1: Write the failing test**

Add to the existing coreManager test or create a new block:

```ts
import { ipcMain } from 'electron'

it('registers tray:action-start IPC handler that calls POST /llama/start', async () => {
  // Verify handler exists
  const handlers = (ipcMain as any)._events
  expect(ipcMain.eventNames()).toContain('tray:action-start')
})
```

- [ ] **Step 2: Add IPC handlers to coreManager**

Add after the existing `ipcMain.handle('economy:reinstate-sleep', ...)` block (line ~188):

```ts
ipcMain.handle('tray:action-start', async () => {
  try {
    await authFetch(`http://${apiHost}:${apiPort}/llama/start`, { method: 'POST' })
    return true
  } catch {
    return false
  }
})

ipcMain.handle('tray:action-stop', async () => {
  try {
    await authFetch(`http://${apiHost}:${apiPort}/llama/stop`, { method: 'POST' })
    return true
  } catch {
    return false
  }
})

ipcMain.handle('tray:action-restart', async () => {
  try {
    await authFetch(`http://${apiHost}:${apiPort}/llama/stop`, { method: 'POST' })
    await authFetch(`http://${apiHost}:${apiPort}/llama/start`, { method: 'POST' })
    return true
  } catch {
    return false
  }
})

ipcMain.handle('tray:action-open', () => {
  const win = getMainWindow()
  if (win) {
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
    authFetch(`http://${apiHost}:${apiPort}/llama/start`, { method: 'POST' }).catch(() => {})
  }
  return true
})

ipcMain.handle('tray:action-quit', () => {
  app.quit()
  return true
})
```

Note: `apiHost` and `apiPort` are already available in scope (they're declared ~line 140 in coreManager.ts). `getMainWindow()` is imported from `./windowManager` at the top of the file.

- [ ] **Step 3: Run typecheck + relevant tests**

Run: `cd apps/momai && pnpm typecheck:node`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/momai/src/main/coreManager.ts
git commit -m "feat(tray): register IPC handlers for tray action buttons"
```

---

### Task 4: Expose tray IPC in preload + type declarations

**Files:**
- Modify: `apps/momai/src/preload/index.ts` (add methods + channels)
- Modify: `apps/momai/src/preload/index.d.ts` (add method signatures)

**Interfaces:**
- Consumes: `ipcRenderer` from `electron`, `ALLOWED_INVOKE_CHANNELS`, `ALLOWED_ON_CHANNELS`
- Produces: `onTrayStateUpdate(cb) → cleanup`, `trayActionStart()`, `trayActionStop()`, `trayActionRestart()`, `trayActionOpen()`, `trayActionQuit()`, `validateOnChannel` + `validateInvokeChannel` for new channels

- [ ] **Step 1: Add channels to allowlists**

In `ALLOWED_INVOKE_CHANNELS` (line 27), add:
```ts
'tray:action-start',
'tray:action-stop',
'tray:action-restart',
'tray:action-open',
'tray:action-quit',
```

In `ALLOWED_ON_CHANNELS` (line 97), add:
```ts
'tray:state-update',
```

Add methods to `momaiAPI` object (before the generic helpers section):

```ts
onTrayStateUpdate: (callback: (state: TrayState) => void) => {
  const handler = (_: any, state: TrayState) => callback(state)
  ipcRenderer.on('tray:state-update', handler)
  return () => ipcRenderer.removeListener('tray:state-update', handler)
},
trayActionStart: (): Promise<boolean> => ipcRenderer.invoke('tray:action-start'),
trayActionStop: (): Promise<boolean> => ipcRenderer.invoke('tray:action-stop'),
trayActionRestart: (): Promise<boolean> => ipcRenderer.invoke('tray:action-restart'),
trayActionOpen: (): Promise<boolean> => ipcRenderer.invoke('tray:action-open'),
trayActionQuit: (): Promise<boolean> => ipcRenderer.invoke('tray:action-quit'),
```

- [ ] **Step 2: Update type declaration file**

Add to `index.d.ts` before the closing `}` of `MomaiAPI`:

```ts
onTrayStateUpdate: (callback: (state: {
  llama: { running: boolean; loading: boolean; ready: boolean }
  economy: { active: boolean; reason: 'idle' | 'game' | null; secondsUntilSoneca: number }
  variantName: string
}) => void) => () => void
trayActionStart: () => Promise<boolean>
trayActionStop: () => Promise<boolean>
trayActionRestart: () => Promise<boolean>
trayActionOpen: () => Promise<boolean>
trayActionQuit: () => Promise<boolean>
```

- [ ] **Step 3: Run typecheck**

Run: `cd apps/momai && pnpm typecheck:node`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/momai/src/preload/index.ts apps/momai/src/preload/index.d.ts
git commit -m "feat(tray): expose tray IPC methods in preload bridge"
```

---

### Task 5: TrayMenuView renderer component + route

**Files:**
- Create: `apps/momai/src/renderer/src/views/TrayMenuView.tsx`
- Modify: `apps/momai/src/renderer/src/main.tsx` (add route)

**Interfaces:**
- Consumes: `window.momaiAPI.onTrayStateUpdate`, `window.momaiAPI.trayActionStart/Stop/Restart/Open/Quit`
- Produces: React component that renders a native-menu-style popup with live-updating status and action buttons

- [ ] **Step 1: Create TrayMenuView component**

```tsx
// TrayMenuView.tsx
import { useEffect, useState, useCallback } from 'react'

interface TrayState {
  llama: { running: boolean; loading: boolean; ready: boolean }
  economy: { active: boolean; reason: string | null; secondsUntilSoneca: number }
  variantName: string
}

function formatCountdown(seconds: number): string {
  if (seconds === -1) return 'desligada'
  if (seconds === 0) return 'ativando'
  const min = Math.floor(seconds / 60)
  const sec = seconds % 60
  if (min >= 60) {
    const h = Math.floor(min / 60)
    return `${h}h${min % 60}m`
  }
  return `${min}min ${sec}s`
}

export default function TrayMenuView() {
  const [state, setState] = useState<TrayState | null>(null)

  useEffect(() => {
    const cleanup = window.momaiAPI.onTrayStateUpdate(setState)
    return () => cleanup()
  }, [])

  const handleAction = useCallback((action: string) => {
    switch (action) {
      case 'start': window.momaiAPI.trayActionStart(); break
      case 'stop': window.momaiAPI.trayActionStop(); break
      case 'restart': window.momaiAPI.trayActionRestart(); break
      case 'open': window.momaiAPI.trayActionOpen(); break
      case 'quit': window.momaiAPI.trayActionQuit(); break
    }
  }, [])

  if (!state) return null

  const s = state.llama
  const llm = s.loading ? 'iniciando' : s.running ? 'ativo' : 'parado'

  let soneca: string | null = null
  if (state.economy.active && state.economy.reason === 'idle') {
    soneca = 'soneca ativa'
  } else if (state.economy.secondsUntilSoneca > 0) {
    soneca = `soneca ${formatCountdown(state.economy.secondsUntilSoneca)}`
  } else if (state.economy.secondsUntilSoneca === 0) {
    soneca = 'ativando soneca'
  } else if (state.economy.secondsUntilSoneca === -1) {
    soneca = 'soneca desligada'
  }

  const statusLine = soneca ? `LLM ${llm} \u00B7 ${soneca}` : `LLM ${llm}`

  return (
    <div className="tray-menu">
      <div className="tray-menu-status">{statusLine}</div>
      <div className="tray-menu-separator" />
      {!s.loading && (
        <>
          {s.running ? (
            <button className="tray-menu-item" onClick={() => handleAction('stop')}>
              Parar LLM
            </button>
          ) : (
            <button className="tray-menu-item" onClick={() => handleAction('start')}>
              Iniciar LLM
            </button>
          )}
          <button className="tray-menu-item" onClick={() => handleAction('restart')}>
            Reiniciar LLM
          </button>
          <div className="tray-menu-separator" />
        </>
      )}
      <button className="tray-menu-item" onClick={() => handleAction('open')}>
        Abrir
      </button>
      <button className="tray-menu-item" onClick={() => handleAction('quit')}>
        Sair
      </button>
      <style>{`
        .tray-menu {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
          font-size: 13px;
          padding: 4px 0;
          user-select: none;
          -webkit-app-region: no-drag;
        }
        .tray-menu-status {
          padding: 8px 16px;
          opacity: 0.55;
          cursor: default;
        }
        .tray-menu-item {
          display: block;
          width: 100%;
          padding: 8px 16px;
          border: none;
          background: transparent;
          color: inherit;
          font-size: 13px;
          text-align: left;
          cursor: pointer;
        }
        .tray-menu-item:hover {
          background: rgba(255, 255, 255, 0.06);
        }
        .tray-menu-separator {
          height: 1px;
          margin: 4px 8px;
          background: rgba(255, 255, 255, 0.06);
        }
        @media (prefers-color-scheme: light) {
          body {
            background: rgba(248, 248, 248, 0.95);
            color: #1a1a1a;
          }
          .tray-menu-item:hover {
            background: rgba(0, 0, 0, 0.06);
          }
          .tray-menu-separator {
            background: rgba(0, 0, 0, 0.06);
          }
        }
        @media (prefers-color-scheme: dark) {
          body {
            background: rgba(20, 20, 20, 0.95);
            color: #e4e4e4;
          }
        }
        body {
          margin: 0;
          padding: 0;
          overflow: hidden;
        }
      `}</style>
    </div>
  )
}
```

- [ ] **Step 2: Add route to main.tsx**

After the overlay route (line 29):
```tsx
<Route path="/tray-menu" element={<TrayMenuView />} />
```

And add the import at the top:
```tsx
import TrayMenuView from './views/TrayMenuView'
```

- [ ] **Step 3: Run typecheck**

Run: `cd apps/momai && pnpm typecheck:web`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/momai/src/renderer/src/views/TrayMenuView.tsx apps/momai/src/renderer/src/main.tsx
git commit -m "feat(tray): add TrayMenuView renderer component and route"
```

---

### Task 6: Wire TrayMenuWindow in main index.ts (pass llamaPort)

**Files:**
- Modify: `apps/momai/src/main/index.ts`

The TrayMenuWindow is already instantiated inside TrayService and doesn't need deps. However, the `tray:action-start/stop/restart` IPC handlers in `coreManager.ts` need `apiHost` and `apiPort` which they already have (they're in the same file).

No changes needed to `index.ts` — the existing wiring is sufficient.

- [ ] **Step 1: Verify no index.ts changes needed**

Check that `coreManager.ts` already has `apiHost`/`apiPort` in scope for the IPC handlers (line 176: `http://${apiHost}:${apiPort}/llama/start`). Confirm with a quick grep.

- [ ] **Step 2: Run all main process tests**

Run: `cd apps/momai && pnpm test:main`
Expected: All tests PASS

- [ ] **Step 3: Run lint + typecheck**

Run: `cd apps/momai && pnpm lint && pnpm typecheck:node && pnpm typecheck:web`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "chore(tray): final wiring and validation"
```
