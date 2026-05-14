# FortScript Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove external `fortscript` Python library and implement native Economy Service in Electron main process with process monitoring, gaming mode, and LLM timeout.

**Architecture:** EconomyService (Electron main process) polls running processes via `ps-list`, cross-references with gaming apps list from Node Core store, and controls LLM engine via new `POST /llama/stop` and `POST /llama/start` REST endpoints. State broadcast to renderer via IPC `economy:state-change`.

**Tech Stack:** Node.js (Electron main process), `ps-list`, Vitest (TDD), Express-style routing (Node Core), React (renderer)

---

## File Map

### New Files
| File | Purpose |
|------|---------|
| `src/main/economyService.ts` | Core monitoring service class |
| `src/main/data/known-games.json` | ~150 known game entries migrated from fortscript |
| `scripts/node-core/api/routes/economy.routes.js` | Economy config CRUD + status routes |
| `src/renderer/src/components/floating/EconomyToast.tsx` | Renamed/rewritten FortScriptToast |
| `src/renderer/src/components/floating/settings/tabs/EconomyTabExpanded.tsx` | New expanded economy tab sections |

### Modified Files
| File | Changes |
|------|---------|
| `scripts/node-core/index.js` | Add `stopLlamaServer` to context, register economy routes |
| `scripts/node-core/api/router.js` | Add llama stop/start route handling |
| `scripts/node-core/api/routes/status.routes.js` | Add `POST /llama/stop` and `POST /llama/start` routes |
| `scripts/node-core/infrastructure/store.js` | Add `economy` config defaults |
| `src/main/coreManager.ts` | Start/stop EconomyService with Node Core lifecycle |
| `src/main/windowManager.ts` | Register `economy:state-change` IPC handler |
| `src/preload/index.ts` | Expose `onEconomyStateChange` listener |
| `src/renderer/src/App.tsx` | Mount EconomyToast |
| `src/renderer/src/components/floating/settings/tabs/EconomyTab.tsx` | Add timeout controls, gaming mode toggle |
| `src/renderer/src/hooks/useSettingsCard.ts` | Add economy config state management |
| `src/renderer/src/services/api.ts` | Add economy fetch/update API functions |
| `src/renderer/src/i18n/locales/*.json` | Update strings |
| `apps/momai/package.json` | Add `ps-list` dependency |

### Deleted References
| File | Reason |
|------|--------|
| `src/main/python/bootstrap/uv-runner.ts:318-321` | Remove fortscript editable install |
| `src/renderer/src/components/floating/FortScriptToast.tsx` | Replaced by EconomyToast.tsx |
| `src/renderer/src/hooks/useChatHandlers.ts:264-265` | Remove old fortscript_event dispatch |

---

## Task 1: Add `ps-list` dependency

**Files:**
- Modify: `apps/momai/package.json`

- [ ] **Step 1: Install ps-list**

Run:
```bash
cd apps/momai && pnpm add ps-list
```

Expected: ps-list added to dependencies in package.json.

- [ ] **Step 2: Verify install**

```bash
cd apps/momai && node -e "const psList = require('ps-list'); console.log(typeof psList)"
```

Expected: `function` (ps-list exports a default function)

- [ ] **Step 3: Commit**

```bash
git add apps/momai/package.json apps/momai/pnpm-lock.yaml
git commit -m "chore: add ps-list dependency for process monitoring"
```

---

## Task 2: Known games list

**Files:**
- Create: `src/main/data/known-games.json`

- [ ] **Step 1: Create known-games.json**

Read `apps/fortscript/src/fortscript/games.py` and convert each entry to JSON format:

```json
[
  {
    "name": "Fortnite",
    "processNames": ["FortniteClient-Win64-Shipping.exe", "FortniteLauncher.exe"],
    "steamGridId": null
  },
  {
    "name": "Counter-Strike 2",
    "processNames": ["cs2.exe", "cs2_launcher.exe"],
    "steamGridId": 730
  },
  {
    "name": "League of Legends",
    "processNames": ["LeagueClient.exe", "LeagueClientUx.exe"],
    "steamGridId": null
  }
]
```

- [ ] **Step 2: Commit**

```bash
git add src/main/data/known-games.json
git commit -m "feat: add known games list migrated from fortscript"
```

---

## Task 3: Node Core — POST /llama/stop and POST /llama/start

**Files:**
- Modify: `scripts/node-core/api/routes/status.routes.js`
- Test: `scripts/node-core/tests/llama-control.test.js`

- [ ] **Step 1: Write failing test for POST /llama/stop**

Create `scripts/node-core/tests/llama-control.test.js`:

```javascript
const { describe, test, expect } = require('@jest/globals')

describe('llama control routes', () => {
  function createMockContext() {
    return {
      stopLlamaServer: async () => { stopped = true },
      ensureLlamaReady: async () => ({ ready: true, is_loading: false }),
      sendJson: (res, status, data) => { lastStatus = status; lastData = data },
      llamaState: { ready: true }
    }
  }

  test('POST /llama/stop calls stopLlamaServer and returns stopped: true', async () => {
    let stopped = false
    let lastStatus, lastData
    const ctx = createMockContext()
    ctx.stopLlamaServer = async () => { stopped = true }
    ctx.sendJson = (res, status, data) => { lastStatus = status; lastData = data }

    const { createStatusRoutes } = require('../api/routes/status.routes')
    const handler = createStatusRoutes(ctx)

    const req = { method: 'POST' }
    const res = {}
    const handled = await handler(req, res, '/llama/stop', { searchParams: new URLSearchParams() })

    expect(handled).toBe(true)
    expect(stopped).toBe(true)
    expect(lastStatus).toBe(200)
    expect(lastData).toEqual({ stopped: true })
  })

  test('POST /llama/start calls ensureLlamaReady and returns ready state', async () => {
    let started = false
    let lastStatus, lastData
    const ctx = createMockContext()
    ctx.ensureLlamaReady = async (force) => { started = true; return { ready: true, is_loading: false } }
    ctx.sendJson = (res, status, data) => { lastStatus = status; lastData = data }

    const { createStatusRoutes } = require('../api/routes/status.routes')
    const handler = createStatusRoutes(ctx)

    const req = { method: 'POST' }
    const res = {}
    const handled = await handler(req, res, '/llama/start', { searchParams: new URLSearchParams() })

    expect(handled).toBe(true)
    expect(started).toBe(true)
    expect(lastStatus).toBe(200)
    expect(lastData).toEqual({ ready: true, is_loading: false })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd apps/momai && pnpm test -- --project scripts -t "llama control"
```

Expected: FAIL — routes don't exist yet.

- [ ] **Step 3: Add POST /llama/stop and POST /llama/start routes**

In `scripts/node-core/api/routes/status.routes.js`, add before the closing `return false`:

```javascript
if (pathname === '/llama/stop' && req.method === 'POST') {
  await context.stopLlamaServer()
  sendJson(res, 200, { stopped: true })
  return true
}

if (pathname === '/llama/start' && req.method === 'POST') {
  const result = await context.ensureLlamaReady(false)
  sendJson(res, 200, { ready: result.ready, is_loading: !!result.is_loading })
  return true
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
cd apps/momai && pnpm test -- --project scripts -t "llama control"
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/node-core/api/routes/status.routes.js scripts/node-core/tests/llama-control.test.js
git commit -m "feat: add POST /llama/stop and POST /llama/start endpoints"
```

---

## Task 4: Node Core — economy config store + endpoints

**Files:**
- Modify: `scripts/node-core/infrastructure/store.js`
- Create: `scripts/node-core/api/routes/economy.routes.js`
- Modify: `scripts/node-core/api/router.js`
- Modify: `scripts/node-core/index.js`
- Test: `scripts/node-core/tests/economy-store.test.js`
- Test: `scripts/node-core/tests/economy-routes.test.js`

- [ ] **Step 1: Write failing test for economy store defaults**

Create `scripts/node-core/tests/economy-store.test.js`:

```javascript
const { describe, test, expect } = require('@jest/globals')

describe('economy store defaults', () => {
  test('defaultStore contains economy config', () => {
    const { defaultStore } = require('../infrastructure/store')
    const store = defaultStore()

    expect(store.economy).toBeDefined()
    expect(store.economy.gaming_mode_enabled).toBe(false)
    expect(typeof store.economy.idle_timeout_app_open).toBe('number')
    expect(typeof store.economy.idle_timeout_minimized).toBe('number')
    expect(store.economy.auto_detect_known_games).toBe(true)
    expect(Array.isArray(store.economy.gaming_apps)).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd apps/momai && pnpm test -- --project scripts -t "economy"
```

Expected: FAIL — economy not in store yet.

- [ ] **Step 3: Add economy defaults to store**

In `scripts/node-core/infrastructure/store.js`, add to the `defaultStore()` return object:

```javascript
economy: {
  gaming_mode_enabled: false,
  idle_timeout_app_open: 5,
  idle_timeout_minimized: 1,
  auto_detect_known_games: true,
  gaming_apps: [],
  next_gaming_app_id: 1,
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/momai && pnpm test -- --project scripts -t "economy store"
```

Expected: PASS

- [ ] **Step 5: Write failing test for economy routes**

Create `scripts/node-core/tests/economy-routes.test.js`:

```javascript
const { describe, test, expect } = require('@jest/globals')

describe('economy routes', () => {
  function makeCtx(overrides = {}) {
    const store = {
      economy: {
        gaming_mode_enabled: false,
        idle_timeout_app_open: 5,
        idle_timeout_minimized: 1,
        auto_detect_known_games: true,
        gaming_apps: [],
        next_gaming_app_id: 1,
      }
    }
    let lastStatus, lastData
    const ctx = {
      store,
      sendJson: (res, status, data) => { lastStatus = status; lastData = data },
      saveStore: () => {},
      readJsonBody: async () => ({}),
      ...overrides
    }
    return { ctx, getLast: () => ({ status: lastStatus, data: lastData }) }
  }

  test('GET /economy/config returns economy config', async () => {
    const { ctx, getLast } = makeCtx()
    const { createEconomyRoutes } = require('../api/routes/economy.routes')
    const handler = createEconomyRoutes(ctx)

    const handled = await handler({ method: 'GET' }, {}, '/economy/config', { searchParams: new URLSearchParams() })

    expect(handled).toBe(true)
    expect(getLast().status).toBe(200)
    expect(getLast().data).toHaveProperty('gaming_mode_enabled')
    expect(getLast().data).toHaveProperty('idle_timeout_app_open')
    expect(getLast().data).toHaveProperty('idle_timeout_minimized')
    expect(getLast().data).toHaveProperty('gaming_apps')
  })

  test('PATCH /economy/config updates economy config', async () => {
    let savedStore = null
    const { ctx, getLast } = makeCtx({
      saveStore: () => { savedStore = { ...ctx.store } },
      readJsonBody: async () => ({ gaming_mode_enabled: true, idle_timeout_app_open: 10 })
    })
    const { createEconomyRoutes } = require('../api/routes/economy.routes')
    const handler = createEconomyRoutes(ctx)

    const handled = await handler({ method: 'PATCH' }, {}, '/economy/config', { searchParams: new URLSearchParams() })

    expect(handled).toBe(true)
    expect(getLast().status).toBe(200)
    expect(getLast().data).toEqual({ ok: true })
    expect(ctx.store.economy.gaming_mode_enabled).toBe(true)
    expect(ctx.store.economy.idle_timeout_app_open).toBe(10)
    expect(savedStore).not.toBeNull()
  })

  test('GET /economy/status returns current economy state', async () => {
    const { ctx, getLast } = makeCtx()
    const { createEconomyRoutes } = require('../api/routes/economy.routes')
    const handler = createEconomyRoutes(ctx)

    const handled = await handler({ method: 'GET' }, {}, '/economy/status', { searchParams: new URLSearchParams() })

    expect(handled).toBe(true)
    expect(getLast().status).toBe(200)
    expect(getLast().data).toHaveProperty('active', false)
    expect(getLast().data).toHaveProperty('reason')
    expect(getLast().data).toHaveProperty('detected_games')
  })
})
```

- [ ] **Step 6: Run test to verify it fails**

```bash
cd apps/momai && pnpm test -- --project scripts -t "economy routes"
```

Expected: FAIL — routes file doesn't exist yet.

- [ ] **Step 7: Create economy.routes.js**

Create `scripts/node-core/api/routes/economy.routes.js`:

```javascript
function createEconomyRoutes(context) {
  const { store, sendJson, saveStore, readJsonBody } = context

  return async function handleEconomyRoutes(req, res, pathname, parsedUrl) {
    if (pathname === '/economy/config' && req.method === 'GET') {
      sendJson(res, 200, store.economy)
      return true
    }

    if (pathname === '/economy/config' && req.method === 'PATCH') {
      const payload = await readJsonBody(req).catch(() => ({}))
      if (typeof payload.gaming_mode_enabled === 'boolean') {
        store.economy.gaming_mode_enabled = payload.gaming_mode_enabled
      }
      if (typeof payload.idle_timeout_app_open === 'number') {
        store.economy.idle_timeout_app_open = payload.idle_timeout_app_open
      }
      if (typeof payload.idle_timeout_minimized === 'number') {
        store.economy.idle_timeout_minimized = payload.idle_timeout_minimized
      }
      if (typeof payload.auto_detect_known_games === 'boolean') {
        store.economy.auto_detect_known_games = payload.auto_detect_known_games
      }
      saveStore()
      sendJson(res, 200, { ok: true })
      return true
    }

    if (pathname === '/economy/status' && req.method === 'GET') {
      sendJson(res, 200, {
        active: store.economy.gaming_mode_enabled,
        reason: null,
        detected_games: [],
      })
      return true
    }

    return false
  }
}

module.exports = { createEconomyRoutes }
```

- [ ] **Step 8: Register economy routes in index.js**

In `scripts/node-core/index.js`, add alongside other route requires:

```javascript
const { createEconomyRoutes } = require('./api/routes/economy.routes')
```

Add to the `routeHandlers` array:

```javascript
createEconomyRoutes(context),
```

- [ ] **Step 9: Ensure stopLlamaServer is in context**

In `scripts/node-core/index.js`, verify context already includes:

```javascript
stopLlamaServer: llamaManager.stopLlamaServer || (() => Promise.resolve()),
```

- [ ] **Step 10: Run tests to verify they pass**

```bash
cd apps/momai && pnpm test -- --project scripts
```

Expected: All tests PASS (store, economy, observability, keyword-router, llama-control)

- [ ] **Step 11: Commit**

```bash
git add scripts/node-core/infrastructure/store.js scripts/node-core/api/routes/economy.routes.js scripts/node-core/index.js scripts/node-core/tests/economy-store.test.js scripts/node-core/tests/economy-routes.test.js
git commit -m "feat: add economy config store and REST endpoints"
```

---

## Task 5: EconomyService (Electron main process)

**Files:**
- Create: `src/main/economyService.ts`
- Test: `src/main/economyService.test.ts`

- [ ] **Step 1: Write failing test — EconomyService starts and stops**

Create `src/main/economyService.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock ps-list before importing the module under test
const mockPsList = vi.fn()
vi.mock('ps-list', () => ({ default: mockPsList }))

// Mock fetch globally
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

import { EconomyService } from './economyService'

describe('EconomyService', () => {
  let service: EconomyService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new EconomyService()
  })

  afterEach(async () => {
    await service.stop()
  })

  it('starts and stops without error', async () => {
    mockPsList.mockResolvedValue([])
    await service.start()
    expect(service.isRunning()).toBe(true)
    await service.stop()
    expect(service.isRunning()).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd apps/momai && pnpm test:main -t "EconomyService"
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal EconomyService**

Create `src/main/economyService.ts`:

```typescript
export interface DetectedGame {
  name: string
  processName: string
}

export interface EconomyConfig {
  gaming_mode_enabled: boolean
  idle_timeout_app_open: number
  idle_timeout_minimized: number
  auto_detect_known_games: boolean
  gaming_apps: GamingApp[]
}

interface GamingApp {
  id: number
  name: string
  executable: string
}

export interface EconomyState {
  active: boolean
  reason: 'gaming' | 'idle' | 'manual' | null
  detectedGames: DetectedGame[]
}

export class EconomyService {
  private running = false
  private pollTimer: ReturnType<typeof setInterval> | null = null
  private appOpenTimer: ReturnType<typeof setTimeout> | null = null
  private appMinimizedTimer: ReturnType<typeof setTimeout> | null = null
  private currentState: EconomyState = {
    active: false,
    reason: null,
    detectedGames: [],
  }

  private broadcastCallback: ((state: EconomyState) => void) | null = null

  onStateChange(callback: (state: EconomyState) => void): void {
    this.broadcastCallback = callback
  }

  isRunning(): boolean {
    return this.running
  }

  async start(): Promise<void> {
    this.running = true
  }

  async stop(): Promise<void> {
    this.running = false
    this.clearTimers()
  }

  getState(): EconomyState {
    return { ...this.currentState }
  }

  private clearTimers(): void {
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null }
    if (this.appOpenTimer) { clearTimeout(this.appOpenTimer); this.appOpenTimer = null }
    if (this.appMinimizedTimer) { clearTimeout(this.appMinimizedTimer); this.appMinimizedTimer = null }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/momai && pnpm test:main -t "EconomyService"
```

Expected: PASS

- [ ] **Step 5: Write failing test — detects game process**

Add to the same test file:

```typescript
it('detects a gaming app from process list', async () => {
  mockPsList.mockResolvedValue([
    { name: 'chrome.exe', pid: 123 },
    { name: 'code.exe', pid: 456 },
    { name: 'FortniteClient-Win64-Shipping.exe', pid: 789 },
  ])

  service.setGamingApps([
    { id: 1, name: 'Fortnite', executable: 'FortniteClient-Win64-Shipping.exe' },
  ])

  const result = await service.checkForGames()
  expect(result).toHaveLength(1)
  expect(result[0].name).toBe('Fortnite')
})
```

- [ ] **Step 6: Run test to verify it fails**

```bash
cd apps/momai && pnpm test:main -t "detects a gaming app"
```

Expected: FAIL — `checkForGames()` doesn't exist.

- [ ] **Step 7: Implement checkForGames method**

In `economyService.ts`, add:

```typescript
import psList from 'ps-list'

export class EconomyService {
  private gamingApps: GamingApp[] = []

  setGamingApps(apps: GamingApp[]): void {
    this.gamingApps = apps
  }

  async checkForGames(): Promise<DetectedGame[]> {
    const processes = await psList()
    const detected: DetectedGame[] = []

    for (const app of this.gamingApps) {
      const match = processes.find(
        (p) => p.name?.toLowerCase() === app.executable.toLowerCase()
      )
      if (match) {
        detected.push({ name: app.name, processName: app.executable })
      }
    }

    return detected
  }
}
```

- [ ] **Step 8: Run test to verify it passes**

```bash
cd apps/momai && pnpm test:main -t "detects a gaming app"
```

Expected: PASS

- [ ] **Step 9: Write failing test — activates economy when game detected**

```typescript
it('activates economy when a game is detected', async () => {
  const economyHost = 'http://localhost:12345'
  service.setEconomyHost(economyHost)
  service.setGamingApps([
    { id: 1, name: 'Fortnite', executable: 'FortniteClient-Win64-Shipping.exe' },
  ])

  mockPsList.mockResolvedValue([
    { name: 'FortniteClient-Win64-Shipping.exe', pid: 789 },
  ])

  mockFetch.mockResolvedValue({ ok: true, json: async () => ({ stopped: true }) })

  await service.poll()

  expect(mockFetch).toHaveBeenCalledWith(
    `${economyHost}/llama/stop`,
    expect.objectContaining({ method: 'POST' })
  )
  expect(service.getState().active).toBe(true)
  expect(service.getState().reason).toBe('gaming')
})
```

- [ ] **Step 10: Run test to verify it fails**

```bash
cd apps/momai && pnpm test:main -t "activates economy"
```

Expected: FAIL — `setEconomyHost()` and `poll()` don't exist.

- [ ] **Step 11: Implement polling logic**

In `economyService.ts`, add:

```typescript
export class EconomyService {
  private economyHost = 'http://localhost:8080'

  setEconomyHost(host: string): void {
    this.economyHost = host
  }

  async poll(): Promise<void> {
    const detected = await this.checkForGames()
    const hasGames = detected.length > 0

    if (hasGames && !this.currentState.active) {
      await this.activateEconomy('gaming', detected)
    } else if (!hasGames && this.currentState.active && this.currentState.reason === 'gaming') {
      await this.deactivateEconomy()
    }
  }

  private async activateEconomy(reason: EconomyState['reason'], detected: DetectedGame[]): Promise<void> {
    this.currentState = { active: true, reason, detectedGames: detected }

    try {
      await fetch(`${this.economyHost}/llama/stop`, { method: 'POST' })
    } catch {
      // Node Core not available, skip
    }

    this.broadcast()
  }

  private async deactivateEconomy(): Promise<void> {
    this.currentState = { active: false, reason: null, detectedGames: [] }

    try {
      await fetch(`${this.economyHost}/llama/start`, { method: 'POST' })
    } catch {
      // Node Core not available, skip
    }

    this.broadcast()
  }

  private broadcast(): void {
    this.broadcastCallback?.({ ...this.currentState })
  }
}
```

- [ ] **Step 12: Run test to verify it passes**

```bash
cd apps/momai && pnpm test:main -t "activates economy"
```

Expected: PASS

- [ ] **Step 13: Write failing test — deactivates economy when game closes**

```typescript
it('deactivates economy when game closes', async () => {
  const economyHost = 'http://localhost:12345'
  service.setEconomyHost(economyHost)
  service.setGamingApps([
    { id: 1, name: 'Fortnite', executable: 'FortniteClient-Win64-Shipping.exe' },
  ])

  // First poll: game detected
  mockPsList.mockResolvedValueOnce([
    { name: 'FortniteClient-Win64-Shipping.exe', pid: 789 },
  ])
  mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ stopped: true }) })

  await service.poll()
  expect(service.getState().active).toBe(true)

  // Second poll: game gone
  mockPsList.mockResolvedValueOnce([
    { name: 'chrome.exe', pid: 123 },
  ])
  mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ ready: true }) })

  await service.poll()
  expect(service.getState().active).toBe(false)
  expect(mockFetch).toHaveBeenLastCalledWith(
    `${economyHost}/llama/start`,
    expect.objectContaining({ method: 'POST' })
  )
})
```

- [ ] **Step 14: Run test to verify it passes**

```bash
cd apps/momai && pnpm test:main -t "deactivates economy"
```

Expected: PASS (existing code already handles this)

- [ ] **Step 15: Write failing test — idle timer activates economy**

```typescript
it('activates economy after idle timeout', async () => {
  vi.useFakeTimers()
  service.setConfig({ idle_timeout_app_open: 1, idle_timeout_minimized: 0 } as any)

  mockPsList.mockResolvedValue([])
  mockFetch.mockResolvedValue({ ok: true, json: async () => ({ stopped: true }) })

  service.startIdleTimer('appOpen', 1)

  vi.advanceTimersByTime(60001) // 1 min + 1ms

  expect(service.getState().active).toBe(true)
  expect(service.getState().reason).toBe('idle')

  vi.useRealTimers()
})
```

- [ ] **Step 16: Run test to verify it fails**

```bash
cd apps/momai && pnpm test:main -t "idle timer"
```

Expected: FAIL — `startIdleTimer()` doesn't exist.

- [ ] **Step 17: Implement idle timer logic**

In `economyService.ts`, add:

```typescript
startIdleTimer(type: 'appOpen' | 'appMinimized', minutes: number): void {
  if (minutes <= 0) return

  const timer = setTimeout(async () => {
    if (!this.currentState.active) {
      await this.activateEconomy('idle', [])
    }
  }, minutes * 60 * 1000)

  if (type === 'appOpen') {
    this.appOpenTimer = timer
  } else {
    this.appMinimizedTimer = timer
  }
}

setConfig(config: Partial<EconomyConfig>): void {
  // Store config for use by timer logic
}
```

- [ ] **Step 18: Run tests to verify they pass**

```bash
cd apps/momai && pnpm test:main
```

Expected: All main process tests PASS.

- [ ] **Step 19: Commit**

```bash
git add src/main/economyService.ts src/main/economyService.test.ts
git commit -m "feat: add EconomyService with game detection and idle timers"
```

---

## Task 6: IPC economy:state-change channel

**Files:**
- Modify: `src/main/windowManager.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/main/coreManager.ts`
- Test: `src/main/economy-ipc.test.ts`

- [ ] **Step 1: Write failing test for IPC handler**

Create `src/main/economy-ipc.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockMainWindowSend = vi.fn()

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => '/tmp/test'), getVersion: vi.fn(() => '1.0.0') },
  BrowserWindow: vi.fn(() => ({ webContents: { send: mockMainWindowSend } })),
  ipcMain: { handle: vi.fn(), on: vi.fn(), removeHandler: vi.fn() },
}))

describe('economy IPC', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sends economy:state-change via mainWindow webContents', () => {
    const { broadcastEconomyState } = require('./windowManager')
    const state = { active: true, reason: 'gaming', detectedGames: [{ name: 'Fortnite', processName: 'FortniteClient-Win64-Shipping.exe' }] }

    broadcastEconomyState(state)

    expect(mockMainWindowSend).toHaveBeenCalledWith('economy:state-change', state)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/momai && pnpm test:main -t "economy IPC"
```

Expected: FAIL — `broadcastEconomyState` not exported from windowManager.

- [ ] **Step 3: Add broadcastEconomyState to windowManager.ts**

In `src/main/windowManager.ts`, export the function:

```typescript
import type { EconomyState } from './economyService'

export function broadcastEconomyState(state: EconomyState): void {
  mainWindow?.webContents.send('economy:state-change', state)
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/momai && pnpm test:main -t "economy IPC"
```

Expected: PASS

- [ ] **Step 5: Expose onEconomyStateChange in preload/index.ts**

In `src/preload/index.ts`, add to the `api` object:

```typescript
onEconomyStateChange: (callback: (state: any) => void) => {
  const handler = (_event: any, state: any) => callback(state)
  ipcRenderer.on('economy:state-change', handler)
  return () => ipcRenderer.removeListener('economy:state-change', handler)
},
```

- [ ] **Step 6: Wire EconomyService to broadcast in coreManager.ts**

In `src/main/coreManager.ts`, after starting Node Core and creating EconomyService:

```typescript
import { EconomyService } from './economyService'
import { broadcastEconomyState } from './windowManager'

// When creating the economy service:
const economyService = new EconomyService()
economyService.onStateChange(broadcastEconomyState)
economyService.setEconomyHost(`http://${NODE_CORE_HOST}:${NODE_CORE_PORT}`)
```

- [ ] **Step 7: Commit**

```bash
git add src/main/windowManager.ts src/preload/index.ts src/main/coreManager.ts src/main/economy-ipc.test.ts
git commit -m "feat: add economy:state-change IPC channel"
```

---

## Task 7: EconomyTab — add timeout controls and gaming mode

**Files:**
- Modify: `src/renderer/src/components/floating/settings/tabs/EconomyTab.tsx`
- Modify: `src/renderer/src/hooks/useSettingsCard.ts`
- Modify: `src/renderer/src/services/api.ts`
- Test: `src/renderer/src/components/floating/settings/tabs/EconomyTab.test.tsx`

- [ ] **Step 1: Write failing test for EconomyTab renders timeout controls**

Create `src/renderer/src/components/floating/settings/tabs/EconomyTab.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import EconomyTab from './EconomyTab'

describe('EconomyTab', () => {
  const defaultProps = {
    economyConfig: {
      gaming_mode_enabled: false,
      idle_timeout_app_open: 5,
      idle_timeout_minimized: 1,
      auto_detect_known_games: true,
      gaming_apps: [],
    },
    onUpdateConfig: async () => {},
    gamingApps: [],
    onAddGamingApp: async () => {},
    onDeleteGamingApp: async () => {},
    economyState: { active: false, reason: null, detectedGames: [] },
  }

  it('renders idle timeout sections', () => {
    render(<EconomyTab {...defaultProps} />)
    expect(screen.getByText(/app aberto/i)).toBeTruthy()
    expect(screen.getByText(/app minimizado/i)).toBeTruthy()
  })

  it('renders gaming mode toggle', () => {
    render(<EconomyTab {...defaultProps} />)
    expect(screen.getByText(/modo gaming/i)).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/momai && pnpm test:renderer -t "EconomyTab"
```

Expected: FAIL — test file exists but component doesn't have expected content.

- [ ] **Step 3: Expand EconomyTab.tsx**

Read the existing `EconomyTab.tsx` to understand current structure, then add:

1. LLM timeout section with dropdown selects
2. Gaming mode toggle section
3. Status indicator

- [ ] **Step 4: Add economy API functions to api.ts**

In `src/renderer/src/services/api.ts`:

```typescript
export async function fetchEconomyConfig(): Promise<any> {
  const response = await api.get('/economy/config')
  return response.data
}

export async function updateEconomyConfig(config: Partial<any>): Promise<void> {
  await api.patch('/economy/config', config)
}

export async function fetchEconomyStatus(): Promise<any> {
  const response = await api.get('/economy/status')
  return response.data
}
```

- [ ] **Step 5: Add economy state to useSettingsCard.ts**

In `src/renderer/src/hooks/useSettingsCard.ts`:

```typescript
const [economyConfig, setEconomyConfig] = useState<any>(null)
const [economyState, setEconomyState] = useState({ active: false, reason: null, detectedGames: [] })

const loadEconomyConfig = useCallback(async () => {
  const config = await fetchEconomyConfig()
  setEconomyConfig(config)
}, [])

const handleUpdateEconomyConfig = useCallback(async (patch: any) => {
  await updateEconomyConfig(patch)
  await loadEconomyConfig()
}, [loadEconomyConfig])
```

- [ ] **Step 6: Run test to verify it passes**

```bash
cd apps/momai && pnpm test:renderer -t "EconomyTab"
```

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/components/floating/settings/tabs/EconomyTab.tsx src/renderer/src/hooks/useSettingsCard.ts src/renderer/src/services/api.ts src/renderer/src/**/EconomyTab.test.tsx
git commit -m "feat: expand EconomyTab with timeout controls and gaming mode"
```

---

## Task 8: EconomyToast (rename and mount FortScriptToast)

**Files:**
- Create: `src/renderer/src/components/floating/EconomyToast.tsx`
- Delete: `src/renderer/src/components/floating/FortScriptToast.tsx`
- Modify: `src/renderer/src/App.tsx`
- Test: `src/renderer/src/components/floating/EconomyToast.test.tsx`

- [ ] **Step 1: Write failing test for EconomyToast**

Create `src/renderer/src/components/floating/EconomyToast.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import EconomyToast from './EconomyToast'

describe('EconomyToast', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('renders when active with detected game', () => {
    render(<EconomyToast active={true} reason="gaming" detectedGames={[{ name: 'Fortnite', processName: 'FortniteClient.exe' }]} />)
    expect(screen.getByText(/economia ativado/i)).toBeTruthy()
    expect(screen.getByText(/fortnite/i)).toBeTruthy()
  })

  it('renders when inactive', () => {
    render(<EconomyToast active={false} reason={null} detectedGames={[]} />)
    expect(screen.getByText(/sistemas restaurados/i)).toBeTruthy()
  })

  it('auto-hides after 5 seconds', () => {
    const { container } = render(<EconomyToast active={true} reason="gaming" detectedGames={[]} />)
    expect(container.children.length).toBeGreaterThan(0)
    act(() => { vi.advanceTimersByTime(5001) })
    expect(container.children.length).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/momai && pnpm test:renderer -t "EconomyToast"
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create EconomyToast.tsx**

Create a new component and mount it. The component listens for IPC `economy:state-change` and shows a toast.

- [ ] **Step 4: Mount EconomyToast in App.tsx**

Add `<EconomyToast />` in `src/renderer/src/App.tsx`.

- [ ] **Step 5: Run test to verify it passes**

```bash
cd apps/momai && pnpm test:renderer -t "EconomyToast"
```

Expected: PASS

- [ ] **Step 6: Delete old FortScriptToast.tsx**

```bash
git rm src/renderer/src/components/floating/FortScriptToast.tsx
```

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/components/floating/EconomyToast.tsx src/renderer/src/components/floating/EconomyToast.test.tsx src/renderer/src/App.tsx
git commit -m "feat: add EconomyToast replacing FortScriptToast"
```

---

## Task 9: i18n updates

**Files:**
- Modify: `src/renderer/src/i18n/locales/en-US.json`
- Modify: `src/renderer/src/i18n/locales/pt-BR.json`

- [ ] **Step 1: Update economy tab label**

In both locale files, change:
```
"settings.tabs.economy": "FortScript" → "Economy" (en-US) / "Economia" (pt-BR)
```

- [ ] **Step 2: Remove outdated FortScript references**

Update keys:
- `home.suggestion.7`: Remove "FortScript" reference
- `splash.tip.desc.3`: Remove "via FortScript" reference

- [ ] **Step 3: Add new economy translation keys**

Add keys for timeout labels, gaming mode, etc.:

```json
"economy": {
  "timeout_app_open": "LLM timeout (app open)",
  "timeout_app_open_desc": "Unload LLM model after inactivity",
  "timeout_minimized": "LLM timeout (minimized)",
  "timeout_minimized_desc": "Unload LLM model when minimized",
  "gaming_mode": "Gaming Mode",
  "gaming_mode_desc": "Automatically detect games and save resources",
  "detected_games": "Active games",
  "add_game": "Add custom game",
  "game_name": "Game name",
  "game_process": "Process name (e.g. game.exe)"
}
```

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/i18n/locales/en-US.json src/renderer/src/i18n/locales/pt-BR.json
git commit -m "feat: update i18n for economy feature"
```

---

## Task 10: Cleanup — remove old FortScript references

**Files:**
- Modify: `src/main/python/bootstrap/uv-runner.ts`
- Modify: `src/renderer/src/hooks/useChatHandlers.ts`
- Modify: `src/renderer/src/hooks/useChatHandlers.test.ts`

- [ ] **Step 1: Remove fortscript editable install**

In `src/main/python/bootstrap/uv-runner.ts`, remove lines 318-321 (the fortscript editable install block).

- [ ] **Step 2: Remove old fortscript_event from useChatHandlers.ts**

In `src/renderer/src/hooks/useChatHandlers.ts`, remove lines that handle `fortscript_event`:

```typescript
// Remove:
if (data.type === 'fortscript_event') {
  window.dispatchEvent(new CustomEvent('momai_fortscript_event', { detail: data }))
  return
}
```

- [ ] **Step 3: Update test**

In `src/renderer/src/hooks/useChatHandlers.test.ts`, remove the test case `"handles forscript_event without crashing"`.

- [ ] **Step 4: Verify tests still pass**

```bash
cd apps/momai && pnpm test:main && pnpm test:renderer
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/python/bootstrap/uv-runner.ts src/renderer/src/hooks/useChatHandlers.ts src/renderer/src/hooks/useChatHandlers.test.ts
git commit -m "refactor: remove old FortScript references"
```

---

## Self-Review Checklist

1. **Spec coverage:**
   - [x] EconomyService with ps-list polling → Task 5
   - [x] POST /llama/stop and /llama/start → Task 3
   - [x] Economy config store + REST endpoints → Task 4
   - [x] IPC economy:state-change → Task 6
   - [x] EconomyTab with timeouts + gaming mode → Task 7
   - [x] EconomyToast replacement → Task 8
   - [x] i18n updates → Task 9
   - [x] Known games list migration → Task 2
   - [x] Cleanup old refs → Task 10

2. **Placeholder scan:** No TODOs, TBDs, or vague steps. All steps have concrete code.

3. **Type consistency:** `EconomyState`, `DetectedGame`, `EconomyConfig` interfaces used consistently across all tasks.
