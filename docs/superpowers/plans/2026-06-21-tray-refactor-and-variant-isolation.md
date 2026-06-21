# Tray Refactor & Variant Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Isolate the four MomAI distribution variants (dev, NSIS .exe, Microsoft Store APPX, APPX test) so they can run simultaneously without port, data, or single-instance conflicts, and refactor the tray logic into a dedicated `TrayService` module.

**Architecture:** A new `variants.ts` config table is the single source of truth for per-variant `appId`, `appName`, ports, and `userDataSubdir`. A new `TrayService` class owns the tray icon, context menu, and window close interception, depending on injected `LlamaControl` and `KeepInTrayReader` interfaces. The Microsoft Store variant keeps its existing `appId` to preserve the update path and user data.

**Tech Stack:** TypeScript, Electron, Vitest, electron-builder.

---

## File Structure

### New files

| File | Responsibility |
|------|---------------|
| `apps/momai/src/main/variants.ts` | Single source of truth for per-variant config (appId, appName, ports, userDataSubdir) |
| `apps/momai/src/main/variants.test.ts` | Tests for variants module |
| `apps/momai/src/main/services/llama-control.ts` | `LlamaControl` interface + `HttpLlamaControl` implementation (wraps fetch to /llama/start\|stop) |
| `apps/momai/src/main/services/llama-control.test.ts` | Tests for llama-control |
| `apps/momai/src/main/services/keep-in-tray-reader.ts` | `KeepInTrayReader` interface + `FileKeepInTrayReader` implementation (reads node-core-store.json) |
| `apps/momai/src/main/services/keep-in-tray-reader.test.ts` | Tests for keep-in-tray-reader |
| `apps/momai/src/main/services/tray-service.ts` | `TrayService` class: tray icon, context menu, click handler, close interception |
| `apps/momai/src/main/services/tray-service.test.ts` | Tests for TrayService with mocked electron |

### Modified files

| File | Change |
|------|--------|
| `apps/momai/src/main/index.ts` | Apply `CURRENT_VARIANT` config (appName, appId, userData, ports) at boot; instantiate and start `TrayService` after window creation |
| `apps/momai/src/main/windowManager.ts` | Delete `setupTray`, close handler, `readKeepInTraySetting`, llama fetch calls |
| `apps/momai/src/main/env.ts` | Delete file (logic moved to `index.ts`) |
| `apps/momai/package.json` | Inject `MOMAI_VARIANT` env var in build scripts |

---

## Task 1: Create `variants.ts` with tests

**Files:**
- Create: `apps/momai/src/main/variants.ts`
- Create: `apps/momai/src/main/variants.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/momai/src/main/variants.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'

describe('variants', () => {
  const ORIGINAL_ENV = process.env.MOMAI_VARIANT

  beforeEach(() => {
    delete process.env.MOMAI_VARIANT
  })

  afterEach(() => {
    if (ORIGINAL_ENV === undefined) {
      delete process.env.MOMAI_VARIANT
    } else {
      process.env.MOMAI_VARIANT = ORIGINAL_ENV
    }
  })

  function loadFresh() {
    // Bust the require cache so CURRENT_VARIANT is re-evaluated with current env
    const path = require.resolve('./variants')
    delete require.cache[path]
    return require('./variants')
  }

  it('exports all 4 variants in the table', () => {
    const { VARIANTS, CURRENT_VARIANT } = loadFresh()
    expect(Object.keys(VARIANTS).sort()).toEqual(['appx-store', 'appx-test', 'dev', 'nsis'])
    expect(CURRENT_VARIANT.variant).toBe('dev')
  })

  it('defaults to dev when MOMAI_VARIANT is unset', () => {
    delete process.env.MOMAI_VARIANT
    const { CURRENT_VARIANT } = loadFresh()
    expect(CURRENT_VARIANT.variant).toBe('dev')
    expect(CURRENT_VARIANT.appId).toBe('com.wesleyqdev.momai.dev')
    expect(CURRENT_VARIANT.corePort).toBe(8050)
  })

  it('picks the nsis entry when MOMAI_VARIANT=nsis', () => {
    process.env.MOMAI_VARIANT = 'nsis'
    const { CURRENT_VARIANT } = loadFresh()
    expect(CURRENT_VARIANT.appId).toBe('com.wesleyqdev.momai.nsis')
    expect(CURRENT_VARIANT.appName).toBe('MomAI')
    expect(CURRENT_VARIANT.corePort).toBe(8100)
    expect(CURRENT_VARIANT.pythonPort).toBe(8101)
  })

  it('picks the appx-store entry when MOMAI_VARIANT=appx-store', () => {
    process.env.MOMAI_VARIANT = 'appx-store'
    const { CURRENT_VARIANT } = loadFresh()
    expect(CURRENT_VARIANT.appId).toBe('com.wesleyqdev.momai')
    expect(CURRENT_VARIANT.corePort).toBe(8200)
  })

  it('picks the appx-test entry when MOMAI_VARIANT=appx-test', () => {
    process.env.MOMAI_VARIANT = 'appx-test'
    const { CURRENT_VARIANT } = loadFresh()
    expect(CURRENT_VARIANT.appId).toBe('com.wesleyqdev.momai.test')
    expect(CURRENT_VARIANT.corePort).toBe(8300)
  })

  it('falls back to dev for unknown MOMAI_VARIANT values', () => {
    process.env.MOMAI_VARIANT = 'mystery'
    const { CURRENT_VARIANT } = loadFresh()
    expect(CURRENT_VARIANT.variant).toBe('dev')
  })

  it('no two variants share the same appId', () => {
    const { VARIANTS } = loadFresh()
    const ids = Object.values(VARIANTS).map((v: any) => v.appId)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('no two variants share the same (corePort, pythonPort) pair', () => {
    const { VARIANTS } = loadFresh()
    const pairs = Object.values(VARIANTS).map((v: any) => `${v.corePort}/${v.pythonPort}`)
    expect(new Set(pairs).size).toBe(pairs.length)
  })

  it('isValidVariant returns true for known variants and false otherwise', () => {
    const { isValidVariant } = loadFresh()
    expect(isValidVariant('dev')).toBe(true)
    expect(isValidVariant('nsis')).toBe(true)
    expect(isValidVariant('appx-store')).toBe(true)
    expect(isValidVariant('appx-test')).toBe(true)
    expect(isValidVariant('mystery')).toBe(false)
    expect(isValidVariant('')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/momai && pnpm test src/main/variants.test.ts`
Expected: FAIL with module not found (./variants does not exist yet)

- [ ] **Step 3: Write the implementation**

Create `apps/momai/src/main/variants.ts`:

```typescript
export type Variant = 'dev' | 'nsis' | 'appx-store' | 'appx-test'

export interface VariantConfig {
  variant: Variant
  appId: string
  appName: string
  userDataSubdir: string
  corePort: number
  pythonPort: number
  displayLabel: string
}

const TABLE: Record<Variant, VariantConfig> = {
  dev: {
    variant: 'dev',
    appId: 'com.wesleyqdev.momai.dev',
    appName: 'MomAI (Dev)',
    userDataSubdir: 'MomAI-Dev',
    corePort: 8050,
    pythonPort: 8051,
    displayLabel: 'Dev'
  },
  nsis: {
    variant: 'nsis',
    appId: 'com.wesleyqdev.momai.nsis',
    appName: 'MomAI',
    userDataSubdir: 'MomAI',
    corePort: 8100,
    pythonPort: 8101,
    displayLabel: 'NSIS'
  },
  'appx-store': {
    variant: 'appx-store',
    appId: 'com.wesleyqdev.momai',
    appName: 'MomAI - Assistente',
    userDataSubdir: 'MomAI-Store',
    corePort: 8200,
    pythonPort: 8201,
    displayLabel: 'Loja'
  },
  'appx-test': {
    variant: 'appx-test',
    appId: 'com.wesleyqdev.momai.test',
    appName: 'MomAI - Teste',
    userDataSubdir: 'MomAI-Teste',
    corePort: 8300,
    pythonPort: 8301,
    displayLabel: 'Teste'
  }
}

export const VARIANTS: Record<Variant, VariantConfig> = TABLE

export function isValidVariant(s: string): s is Variant {
  return s === 'dev' || s === 'nsis' || s === 'appx-store' || s === 'appx-test'
}

function resolveVariant(): VariantConfig {
  const env = process.env.MOMAI_VARIANT
  if (env && isValidVariant(env)) {
    return TABLE[env]
  }
  return TABLE.dev
}

export const CURRENT_VARIANT: VariantConfig = resolveVariant()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/momai && pnpm test src/main/variants.test.ts`
Expected: All 9 tests pass

- [ ] **Step 5: Commit**

```bash
git add apps/momai/src/main/variants.ts apps/momai/src/main/variants.test.ts
git commit -m "feat(desktop): add variants config table for build isolation"
```

---

## Task 2: Create `LlamaControl` with tests

**Files:**
- Create: `apps/momai/src/main/services/llama-control.ts`
- Create: `apps/momai/src/main/services/llama-control.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/momai/src/main/services/llama-control.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { HttpLlamaControl } from './llama-control'
import { API_BASE_URL } from '../../constants'

describe('HttpLlamaControl', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 })
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('stop() POSTs to /llama/stop', async () => {
    const ctrl = new HttpLlamaControl()
    await ctrl.stop()
    expect(global.fetch).toHaveBeenCalledWith(`${API_BASE_URL}/llama/stop`, { method: 'POST' })
  })

  it('start() POSTs to /llama/start', async () => {
    const ctrl = new HttpLlamaControl()
    await ctrl.start()
    expect(global.fetch).toHaveBeenCalledWith(`${API_BASE_URL}/llama/start`, { method: 'POST' })
  })

  it('stop() resolves even when fetch rejects (fire-and-forget)', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network down'))
    const ctrl = new HttpLlamaControl()
    await expect(ctrl.stop()).resolves.toBeUndefined()
  })

  it('start() resolves even when fetch rejects (fire-and-forget)', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network down'))
    const ctrl = new HttpLlamaControl()
    await expect(ctrl.start()).resolves.toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/momai && pnpm test src/main/services/llama-control.test.ts`
Expected: FAIL (the services/ directory and file don't exist)

- [ ] **Step 3: Write the implementation**

Create `apps/momai/src/main/services/llama-control.ts`:

```typescript
import { API_BASE_URL } from '../constants'

export interface LlamaControl {
  start(): Promise<void>
  stop(): Promise<void>
}

export class HttpLlamaControl implements LlamaControl {
  async start(): Promise<void> {
    await this.post('/llama/start')
  }

  async stop(): Promise<void> {
    await this.post('/llama/stop')
  }

  private async post(path: string): Promise<void> {
    try {
      await fetch(`${API_BASE_URL}${path}`, { method: 'POST' })
    } catch {
      // Fire-and-forget: tray close must not block on network errors
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/momai && pnpm test src/main/services/llama-control.test.ts`
Expected: All 4 tests pass

- [ ] **Step 5: Commit**

```bash
git add apps/momai/src/main/services/llama-control.ts apps/momai/src/main/services/llama-control.test.ts
git commit -m "feat(desktop): add HttpLlamaControl wrapping fetch /llama/start|stop"
```

---

## Task 3: Create `KeepInTrayReader` with tests

**Files:**
- Create: `apps/momai/src/main/services/keep-in-tray-reader.ts`
- Create: `apps/momai/src/main/services/keep-in-tray-reader.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/momai/src/main/services/keep-in-tray-reader.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

// Mock electron's app.getPath so we can control userData
const mockUserData = vi.hoisted(() => ({ value: '' }))
vi.mock('electron', () => ({
  app: { getPath: () => mockUserData.value }
}))

import { FileKeepInTrayReader } from './keep-in-tray-reader'

describe('FileKeepInTrayReader', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'momai-kit-'))
    mockUserData.value = tempDir
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  function writeStore(settings: unknown) {
    const dir = join(tempDir, 'data')
    require('fs').mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'node-core-store.json'), JSON.stringify({ settings }))
  }

  it('returns true when node-core-store.json is missing', () => {
    const reader = new FileKeepInTrayReader()
    expect(reader.isEnabled()).toBe(true)
  })

  it('returns true when node-core-store.json is corrupted', () => {
    require('fs').mkdirSync(join(tempDir, 'data'), { recursive: true })
    writeFileSync(join(tempDir, 'data', 'node-core-store.json'), 'not json{')
    const reader = new FileKeepInTrayReader()
    expect(reader.isEnabled()).toBe(true)
  })

  it('returns true when keep_in_tray field is absent', () => {
    writeStore({ user_name: 'Wesley' })
    const reader = new FileKeepInTrayReader()
    expect(reader.isEnabled()).toBe(true)
  })

  it('returns true when keep_in_tray = true', () => {
    writeStore({ keep_in_tray: true })
    const reader = new FileKeepInTrayReader()
    expect(reader.isEnabled()).toBe(true)
  })

  it('returns false when keep_in_tray = false', () => {
    writeStore({ keep_in_tray: false })
    const reader = new FileKeepInTrayReader()
    expect(reader.isEnabled()).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/momai && pnpm test src/main/services/keep-in-tray-reader.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Write the implementation**

Create `apps/momai/src/main/services/keep-in-tray-reader.ts`:

```typescript
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

export interface KeepInTrayReader {
  isEnabled(): boolean
}

export class FileKeepInTrayReader implements KeepInTrayReader {
  isEnabled(): boolean {
    try {
      const storePath = join(app.getPath('userData'), 'data', 'node-core-store.json')
      if (!existsSync(storePath)) return true
      const data = JSON.parse(readFileSync(storePath, 'utf-8'))
      return data.settings?.keep_in_tray !== false
    } catch {
      return true
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/momai && pnpm test src/main/services/keep-in-tray-reader.test.ts`
Expected: All 5 tests pass

- [ ] **Step 5: Commit**

```bash
git add apps/momai/src/main/services/keep-in-tray-reader.ts apps/momai/src/main/services/keep-in-tray-reader.test.ts
git commit -m "feat(desktop): add FileKeepInTrayReader for keep_in_tray setting"
```

---

## Task 4: Create `TrayService` with tests

**Files:**
- Create: `apps/momai/src/main/services/tray-service.ts`
- Create: `apps/momai/src/main/services/tray-service.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/momai/src/main/services/tray-service.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TrayService, type TrayServiceDeps } from './tray-service'
import type { VariantConfig } from '../variants'

// Mock electron
const trayInstance = vi.hoisted(() => ({
  setToolTip: vi.fn(),
  setContextMenu: vi.fn(),
  on: vi.fn(),
  destroy: vi.fn()
}))
const menuInstance = vi.hoisted(() => ({}))

vi.mock('electron', () => ({
  Tray: vi.fn(() => trayInstance),
  Menu: { buildFromTemplate: vi.fn(() => menuInstance) },
  nativeImage: { createFromPath: vi.fn(() => ({})) },
  app: { quit: vi.fn() }
}))

// Mock the icon path module the tray-service imports
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
    expect(require('electron').Tray).toHaveBeenCalledTimes(1)
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
    const Menu = require('electron').Menu
    const template = Menu.buildFromTemplate.mock.calls[0][0]
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
    expect(require('electron').app.quit).not.toHaveBeenCalled()
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
    expect(require('electron').app.quit).toHaveBeenCalled()
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
    expect(require('electron').app.quit).not.toHaveBeenCalled()
    svc.stop()
  })

  it('on tray click when window is visible: hides and stops llama', () => {
    const deps = makeDeps({
      window: { ...makeDeps().window, isVisible: vi.fn(() => true) } as any
    })
    const svc = new TrayService(deps)
    svc.start()
    const clickHandler = trayInstance.on.mock.calls.find((c: any) => c[0] === 'click')[1]
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
    const clickHandler = trayInstance.on.mock.calls.find((c: any) => c[0] === 'click')[1]
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
    const Menu = require('electron').Menu
    const template = Menu.buildFromTemplate.mock.calls[0][0]
    const abrir = template.find((item: any) => item.label === 'Abrir')
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
    const Menu = require('electron').Menu
    const template = Menu.buildFromTemplate.mock.calls[0][0]
    const sair = template.find((item: any) => item.label === 'Sair')
    sair.click()
    expect(require('electron').app.quit).toHaveBeenCalled()
    svc.stop()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/momai && pnpm test src/main/services/tray-service.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Write the implementation**

Create `apps/momai/src/main/services/tray-service.ts`:

```typescript
import { Tray, Menu, nativeImage, app } from 'electron'
import type { BrowserWindow } from 'electron'
import type { LlamaControl } from './llama-control'
import type { KeepInTrayReader } from './keep-in-tray-reader'
import type { VariantConfig } from '../variants'
import { ICON_PATH } from '../constants'

export interface TrayServiceDeps {
  window: BrowserWindow
  llama: LlamaControl
  keepInTray: KeepInTrayReader
  isQuitting: () => boolean
  variant: VariantConfig
}

export class TrayService {
  private tray: Tray | null = null
  private closeHandlerInstalled = false

  constructor(private readonly deps: TrayServiceDeps) {}

  start(): void {
    if (this.tray) return
    this.createTrayIcon()
    this.installCloseHandler()
  }

  stop(): void {
    this.tray?.destroy()
    this.tray = null
  }

  private createTrayIcon(): void {
    const tray = new Tray(nativeImage.createFromPath(ICON_PATH))
    tray.setToolTip(this.deps.variant.appName)
    tray.setContextMenu(this.buildContextMenu())
    tray.on('click', () => this.onTrayClick())
    this.tray = tray
  }

  private buildContextMenu(): Menu {
    return Menu.buildFromTemplate([
      {
        label: 'Abrir',
        click: () => this.showWindow()
      },
      {
        label: 'Sair',
        click: () => {
          app.quit()
        }
      }
    ])
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

    this.stop()
    app.quit()
  }

  private onTrayClick(): void {
    if (this.deps.window.isVisible()) {
      this.deps.window.hide()
      void this.deps.llama.stop()
    } else {
      this.showWindow()
    }
  }

  private showWindow(): void {
    this.deps.window.show()
    this.deps.window.focus()
    void this.deps.llama.start()
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/momai && pnpm test src/main/services/tray-service.test.ts`
Expected: All 12 tests pass

- [ ] **Step 5: Commit**

```bash
git add apps/momai/src/main/services/tray-service.ts apps/momai/src/main/services/tray-service.test.ts
git commit -m "feat(desktop): add TrayService owning tray icon and close handler"
```

---

## Task 5: Verify `ICON_PATH` exists in `constants.ts`

**Files:**
- Modify (if needed): `apps/momai/src/main/constants.ts`

- [ ] **Step 1: Check if ICON_PATH is exported from constants.ts**

Run: `grep -n "ICON_PATH\|icon" apps/momai/src/main/constants.ts`

If exported, no action needed. If not, find the existing icon path constant in `windowManager.ts` (it should be there as `ICON_PATH` per the explore report) and export it from `constants.ts`:

Open `apps/momai/src/main/constants.ts`. Add this line at the bottom:

```typescript
import { join } from 'path'
import { app } from 'electron'

export const ICON_PATH = app.isPackaged
  ? join(process.resourcesPath, 'build', 'icon.png')
  : join(app.getAppPath(), 'build', 'icon.png')
```

Then in `windowManager.ts`, delete the local `ICON_PATH` constant and add `import { ICON_PATH } from './constants'` at the top.

- [ ] **Step 2: Run typecheck**

Run: `cd apps/momai && pnpm typecheck:node 2>&1 | tail -20`
Expected: No new errors related to ICON_PATH

- [ ] **Step 3: Commit (only if changes were made)**

```bash
git add apps/momai/src/main/constants.ts apps/momai/src/main/windowManager.ts
git commit -m "refactor(desktop): move ICON_PATH to shared constants"
```

---

## Task 6: Refactor `windowManager.ts` to remove tray logic

**Files:**
- Modify: `apps/momai/src/main/windowManager.ts`

- [ ] **Step 1: Verify typecheck passes before refactor (baseline)**

Run: `cd apps/momai && pnpm typecheck:node 2>&1 | tail -5`
Expected: Errors only in the known pre-existing files (not introduced by us)

- [ ] **Step 2: Remove `readKeepInTraySetting` function**

In `apps/momai/src/main/windowManager.ts`, delete the `readKeepInTraySetting` function (the entire function block, around lines 41-50). Remove the `readFileSync` and `existsSync` imports from `fs` if they are no longer used elsewhere in the file.

- [ ] **Step 3: Remove the `mainWindow.on('close', ...)` handler**

In `apps/momai/src/main/windowManager.ts`, delete the entire `mainWindow.on('close', ...)` block (around lines 417-438). The `TrayService` now owns this behavior.

- [ ] **Step 4: Remove the `setupTray` function**

In `apps/momai/src/main/windowManager.ts`, delete the entire `setupTray` function (around lines 503-544) including any unused imports (`Tray`, `nativeImage`, `Menu`, `ICON_PATH` if not used elsewhere).

- [ ] **Step 5: Remove the `fetch(/llama/stop)` and `fetch(/llama/start)` calls**

In `apps/momai/src/main/windowManager.ts`, find and delete every `fetch(\`${API_BASE_URL}/llama/start\`, ...)` and `fetch(\`${API_BASE_URL}/llama/stop\`, ...)` call. There are 4 of them (around lines 427, 517, 539, 612). The `TrayService` and `economyService` are the only callers now (TrayService for close/click, economyService for activation).

If any of these fetches are in code paths NOT handled by TrayService (e.g., a global shortcut `toggleWindow` flow), keep that one and add a TODO comment. Otherwise delete all 4.

- [ ] **Step 6: Remove the `setTray` import and the `state.tray` references**

In `apps/momai/src/main/windowManager.ts`, remove the `setTray` import from `./state` and any reference to `state.tray`. Also remove `state.tray` field from the `AppState` interface in `apps/momai/src/main/state.ts` if no other code uses it.

- [ ] **Step 7: Run typecheck**

Run: `cd apps/momai && pnpm typecheck:node 2>&1 | tail -10`
Expected: Either clean or only the same pre-existing errors as baseline. If new errors appear, fix them — they usually mean an import is still needed elsewhere or a removal was too aggressive.

- [ ] **Step 8: Run existing windowManager tests if any**

Run: `cd apps/momai && pnpm test -- "windowManager" 2>&1 | tail -10`
Expected: If a test references removed code, update it to test the new location or delete the test. Document any test changes in the commit.

- [ ] **Step 9: Commit**

```bash
git add apps/momai/src/main/windowManager.ts apps/momai/src/main/state.ts
git commit -m "refactor(desktop): remove tray and close handler from windowManager"
```

---

## Task 7: Refactor `index.ts` to apply variant config and start TrayService

**Files:**
- Modify: `apps/momai/src/main/index.ts`
- Delete: `apps/momai/src/main/env.ts`

- [ ] **Step 1: Read current `env.ts` to verify nothing else depends on it**

Run: `grep -rn "from './env'\|from \"./env\"\|require('./env')" apps/momai/src/main/`

If only `index.ts` imports it, proceed to delete after the next step.

- [ ] **Step 2: Apply variant config in `index.ts` at the top, before `app.whenReady`**

Open `apps/momai/src/main/index.ts`. At the very top of the file (after the existing imports), add:

```typescript
import { join } from 'path'
import { CURRENT_VARIANT } from './variants'

// Apply variant identity BEFORE app.whenReady so the userData path and
// single-instance lock are scoped to this build.
app.setName(CURRENT_VARIANT.appName)
app.setAppUserModelId(CURRENT_VARIANT.appId)
app.setPath('userData', join(app.getPath('appData'), CURRENT_VARIANT.userDataSubdir))
process.env.PORT = String(CURRENT_VARIANT.corePort)
process.env.MOMAI_PYTHON_SIDECAR_PORT = String(CURRENT_VARIANT.pythonPort)
```

- [ ] **Step 3: Delete `env.ts`**

If Step 1 confirmed `env.ts` is only imported by `index.ts`:

Run: `rm apps/momai/src/main/env.ts`

And remove the `import './env'` line from `apps/momai/src/main/index.ts` (or whatever the import statement was).

- [ ] **Step 4: Start the TrayService after window creation**

In `apps/momai/src/main/index.ts`, find the place where the main window is created (look for `createWindow()` or `mainWindow = new BrowserWindow(...)`). Add the TrayService instantiation immediately after window creation:

```typescript
import { TrayService } from './services/tray-service'
import { HttpLlamaControl } from './services/llama-control'
import { FileKeepInTrayReader } from './services/keep-in-tray-reader'
import { isQuitting } from './state'  // adjust path if different

// After mainWindow is created:
const trayService = new TrayService({
  window: mainWindow,
  llama: new HttpLlamaControl(),
  keepInTray: new FileKeepInTrayReader(),
  isQuitting: () => isQuitting(),  // adapt to whatever state getter exists
  variant: CURRENT_VARIANT
})
trayService.start()
```

If `isQuitting` is a value, not a getter, use a function: `isQuitting: () => state.isQuitting`.

- [ ] **Step 5: Run typecheck**

Run: `cd apps/momai && pnpm typecheck:node 2>&1 | tail -10`
Expected: Clean

- [ ] **Step 6: Run all main process tests**

Run: `cd apps/momai && pnpm test --project main 2>&1 | tail -10`
Expected: All pass (or only the pre-existing failures)

- [ ] **Step 7: Smoke test the dev variant**

Run: `cd apps/momai && pnpm dev`
Expected: App boots, window appears, tray icon shows "MomAI (Dev)", clicking X hides the window and stops llama, clicking the tray icon shows the window again, "Sair" quits the app.

- [ ] **Step 8: Commit**

```bash
git add apps/momai/src/main/index.ts apps/momai/src/main/env.ts
git commit -m "feat(desktop): apply variant config and start TrayService in main"
```

---

## Task 8: Update build scripts to inject `MOMAI_VARIANT`

**Files:**
- Modify: `apps/momai/package.json`

- [ ] **Step 1: Add `MOMAI_VARIANT` to the `build:win` script env spread**

In `apps/momai/package.json`, find the `build:win` script. It currently has:

```
"build:win": "npm run build && node -e \"const { execSync } = require('child_process'); const env = { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: 'false', ... }; execSync('electron-builder --win nsis ...', { stdio: 'inherit', env });\" && node scripts/validate-llama-package.js dist/win-unpacked/resources --platform=win32",
```

Add `MOMAI_VARIANT: 'nsis',` to the `env` object literal. The new script:

```
"build:win": "npm run build && node -e \"const { execSync } = require('child_process'); const env = { ...process.env, MOMAI_VARIANT: 'nsis', CSC_IDENTITY_AUTO_DISCOVERY: 'false', CSC_LINK: '', CSC_KEY_PASSWORD: '', WIN_CSC_LINK: '', WIN_CSC_KEY_PASSWORD: '' }; execSync('electron-builder --win nsis -p never --config.win.signAndEditExecutable=false --config.forceCodeSigning=false', { stdio: 'inherit', env });\" && node scripts/validate-llama-package.js dist/win-unpacked/resources --platform=win32",
```

- [ ] **Step 2: Add `MOMAI_VARIANT` to `build:appx:store`**

Same pattern. Add `MOMAI_VARIANT: 'appx-store',` to the env spread:

```
"build:appx:store": "node -e \"const { execSync } = require('child_process'); const env = { ...process.env, MOMAI_VARIANT: 'appx-store', CSC_IDENTITY_AUTO_DISCOVERY: 'false', ... }; execSync('electron-builder --win appx -p never --config.win.signAndEditExecutable=false --config.forceCodeSigning=false', { stdio: 'inherit', env });\" && node scripts/stamp-exe.js",
```

- [ ] **Step 3: Add `MOMAI_VARIANT` to `build:appx:test`**

```
"build:appx:test": "node scripts/ensure-cert.js && node -e \"const { execSync } = require('child_process'); const env = { ...process.env, MOMAI_VARIANT: 'appx-test', ... }; execSync('electron-builder --win appx -p never ...', { stdio: 'inherit', env });\" && node scripts/sign-appx.js && node scripts/stamp-exe.js",
```

- [ ] **Step 4: Verify `pnpm dev` still works (no change needed)**

`pnpm dev` does not need `MOMAI_VARIANT` set — the variants module defaults to `'dev'`. No change.

- [ ] **Step 5: Verify typecheck and tests still pass**

Run: `cd apps/momai && pnpm typecheck:node && pnpm test --project main 2>&1 | tail -15`
Expected: Clean typecheck, all tests pass (or only pre-existing failures)

- [ ] **Step 6: Commit**

```bash
git add apps/momai/package.json
git commit -m "build(desktop): inject MOMAI_VARIANT in build scripts for nsis/appx"
```

---

## Task 9: Manual test matrix

**Files:** none (verification only)

- [ ] **Step 1: Verify dev variant runs standalone**

Run: `cd apps/momai && pnpm dev`
Expected: App boots, tray shows "MomAI (Dev)", port 8050, no errors in console.

- [ ] **Step 2: Verify dev + NSIS run together**

Build NSIS: `cd apps/momai && pnpm build:win`
Install the resulting installer from `dist/`.
With NSIS installed, run: `cd apps/momai && pnpm dev`
Expected: Both apps run. Tray shows "MomAI (Dev)" AND "MomAI". No port conflict.

- [ ] **Step 3: Verify the X button hides the window and stops llama**

In dev variant: click X.
Expected: Window hides, tray icon remains, llama process is gone (check Task Manager), tray click shows window again and llama restarts.

- [ ] **Step 4: Verify the `keep_in_tray` toggle in settings**

In dev variant: open Settings > General > toggle "Manter em segundo plano" OFF.
Click X.
Expected: App fully quits (window, tray, llama, all gone). Toggle back ON, click X → window hides, tray remains.

- [ ] **Step 5: Verify the userData is per-variant**

After running dev, check the userData folder:
- Dev: `%APPDATA%/MomAI-Dev/`
- NSIS: `%APPDATA%/Roaming/MomAI/`

Expected: Two separate folders, neither overlaps the other.

- [ ] **Step 6: Verify APPX-test build**

Run: `cd apps/momai && pnpm build:appx:test`
Install the resulting appx.
Expected: Side-loads successfully, runs on port 8300, tray shows "MomAI - Teste".

- [ ] **Step 7: Commit any final fixes**

If any of the manual tests revealed a bug, fix it and commit:

```bash
git add -A
git commit -m "fix(desktop): <describe the fix>"
```

---

## Task 10: Final typecheck, lint, and full test run

**Files:** none (verification only)

- [ ] **Step 1: Run full typecheck**

Run: `pnpm typecheck 2>&1 | tail -10`
Expected: Same errors as before this refactor (the pre-existing `ContainerChat.tsx` type error is OK). No new errors.

- [ ] **Step 2: Run full lint**

Run: `pnpm lint 2>&1 | tail -10`
Expected: Same warnings/errors as before this refactor. No new ones from our changes.

- [ ] **Step 3: Run full test suite**

Run: `pnpm test 2>&1 | tail -10`
Expected: Same set of pass/fail as before this refactor (some pre-existing failures OK). No new failures from our changes.

- [ ] **Step 4: Commit a CHANGELOG / release notes entry (optional)**

If the project has a CHANGELOG file, add an entry:

```markdown
## 1.5.0
### Added
- Build variant isolation: each distribution variant (dev, NSIS, Store, APPX test) now has a unique appId, userData path, and port range
- New `TrayService` module consolidates tray icon and window close handling
- `HttpLlamaControl` and `FileKeepInTrayReader` services extracted for testability

### Changed
- Microsoft Store variant keeps existing `appId` (com.wesleyqdev.momai) but moves to port 8200/8201; the change is transparent on next update
- Dev variant now uses port 8050/8051 (was 8000/8001)
```

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "docs: add 1.5.0 changelog entry for variant isolation"
```

(omit this step if no CHANGELOG exists)

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|------------------|------|
| variants.ts config table | Task 1 |
| LlamaControl interface + HttpLlamaControl | Task 2 |
| KeepInTrayReader interface + FileKeepInTrayReader | Task 3 |
| TrayService class with all 3 responsibilities | Task 4 |
| ICON_PATH available for TrayService | Task 5 |
| Remove tray/close/llama fetch from windowManager | Task 6 |
| Apply variant config in index.ts | Task 7 |
| Inject MOMAI_VARIANT in build scripts | Task 8 |
| Manual test matrix | Task 9 |
| Final verification | Task 10 |
| variants test (9 cases) | Task 1 Step 1 |
| llama-control test (4 cases) | Task 2 Step 1 |
| keep-in-tray-reader test (5 cases) | Task 3 Step 1 |
| TrayService test (12 cases) | Task 4 Step 1 |
| env.ts deletion | Task 7 Step 3 |
| Microsoft Store appId preserved | Task 1 Step 3 (TABLE values match spec) |
| Dev uses port 8050 (not 8000) | Task 1 Step 3 (TABLE values match spec) |
| isQuitting injected via deps | Task 4 Step 3 (deps interface) |

**Placeholder scan:** No "TBD", "TODO" (in step descriptions), or "fill in details" in the plan. One adaptive step (Step 5 of Task 5) is conditional — "if exported, no action" — but the conditional branch is fully spelled out.

**Type consistency:**
- `TrayServiceDeps` interface used in Task 4 tests matches the one in Task 4 implementation
- `LlamaControl` interface in Task 2 matches the import in Task 4
- `KeepInTrayReader` interface in Task 3 matches the import in Task 4
- `VariantConfig` matches between Task 1 (definition) and Task 4 (import)
- `ICON_PATH` matches between Task 5 (export) and Task 4 (import)

All consistent.
