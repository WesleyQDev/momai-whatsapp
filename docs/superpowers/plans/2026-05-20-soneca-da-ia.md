# Soneca da IA (Idle Timeout) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the "Soneca da IA" (AI Nap) idle timeout feature that automatically unloads the LLM when the user is inactive.

**Architecture:** Inject `getSystemIdleTime` and `isWindowMinimized` callbacks into `EconomyService` (same pattern as `httpGet`/`httpPost`). The `poll()` method checks idle time every cycle and activates/deactivates economy with `reason: 'idle'`. Gaming mode takes priority over idle.

**Tech Stack:** Electron `powerMonitor`, Node.js `setTimeout`, Vitest

---

### Task 1: Add idle tracking to EconomyService

**Files:**
- Modify: `apps/momai/src/main/economyService.ts`

- [ ] **Step 1: Add injectable idle/minimized callbacks and idle config fields**

Add after `private gamePreferences` (line 56):

```typescript
  private getSystemIdleTime: () => number = () => 0
  private isWindowMinimized: () => boolean = () => false

  private idleTimeoutAppOpen = 5
  private idleTimeoutMinimized = 1
```

- [ ] **Step 2: Add setters for the new fields**

Add after `setPreferencesPath` (line 120):

```typescript
  setGetSystemIdleTime(fn: () => number): void {
    this.getSystemIdleTime = fn
  }

  setIsWindowMinimized(fn: () => boolean): void {
    this.isWindowMinimized = fn
  }

  setIdleTimeouts(appOpen: number, minimized: number): void {
    this.idleTimeoutAppOpen = appOpen
    this.idleTimeoutMinimized = minimized
  }
```

- [ ] **Step 3: Add `checkForIdle()` method**

Add after `checkForGames()` (after line 239):

```typescript
  async checkForIdle(): Promise<DetectedGame[]> {
    const idleSeconds = this.getSystemIdleTime()
    const minimized = this.isWindowMinimized()

    const timeoutMinutes = minimized ? this.idleTimeoutMinimized : this.idleTimeoutAppOpen
    if (timeoutMinutes <= 0) return []

    const timeoutSeconds = timeoutMinutes * 60
    if (idleSeconds >= timeoutSeconds) {
      return [{ name: minimized ? 'App minimizado' : 'App ocioso', processName: '' }]
    }

    return []
  }
```

- [ ] **Step 4: Integrate idle check into `poll()`**

Replace the `poll()` method (lines 241-266):

```typescript
  async poll(processOverrides?: string[]): Promise<void> {
    try {
      const config = await this.httpGet(`${this.economyHost}/economy/config`)
      this.gamingModeEnabled = !!(config as any).gaming_mode_enabled
      this.setIdleTimeouts(
        (config as any).idle_timeout_app_open ?? 5,
        (config as any).idle_timeout_minimized ?? 1
      )
    } catch {
      // Will retry on next interval
    }

    if (this.gamingModeEnabled) {
      const detected = await this.checkForGames(processOverrides)
      const hasGames = detected.length > 0

      if (hasGames && !this.currentState.active) {
        this.dismissed = false
        await this.activateEconomy('gaming', detected)
        return
      }

      if (!hasGames && this.currentState.active && this.currentState.reason === 'gaming') {
        await this.deactivateEconomy()
      }

      // When dismissed: check if games truly stopped before clearing the flag
      if (this.dismissed) {
        const stillRunning = await this.checkForGames(processOverrides, true)
        if (stillRunning.length === 0) this.dismissed = false
        return
      }
    }

    // Soneca da IA: idle timeout check
    const idleDetected = await this.checkForIdle()
    const isIdle = idleDetected.length > 0

    if (isIdle && !this.currentState.active) {
      await this.activateEconomy('idle', idleDetected)
    } else if (!isIdle && this.currentState.active && this.currentState.reason === 'idle') {
      await this.deactivateEconomy()
    }
  }
```

- [ ] **Step 5: Stop idle wake on gaming activation**

In `activateEconomy` (line 293), the method already handles both `'gaming'` and `'idle'` reasons since it just uses the reason parameter. No change needed.

---

### Task 2: Wire up real powerMonitor in coreManager

**Files:**
- Modify: `apps/momai/src/main/coreManager.ts`

- [ ] **Step 1: Add imports**

Add after existing imports (line 1):

```typescript
import { app, ipcMain, powerMonitor, BrowserWindow } from 'electron'
```

Remove `import { app, ipcMain } from 'electron'` (line 1) since we're merging.

- [ ] **Step 2: Wire idle/minimized callbacks in startEconomyService**

In `startEconomyService()`, add after `economyService.setEconomyHost(...)` (line 71):

```typescript
    economyService.setGetSystemIdleTime(() => powerMonitor.getSystemIdleTime())

    economyService.setIsWindowMinimized(() => {
      const win = getMainWindow()
      return win ? win.isMinimized() : false
    })
```

---

### Task 3: Update tests

**Files:**
- Modify: `apps/momai/src/main/economyService.test.ts`

- [ ] **Step 1: Add test for idle activation when app is open**

Add after the `parseProcessList` test (after line 125):

```typescript
  it('activates economy when idle timeout reached (app open)', async () => {
    const economyHost = 'http://localhost:12345'
    service.setEconomyHost(economyHost)
    service.setGamingModeEnabled(false)
    service.setGetSystemIdleTime(() => 301) // 5min + 1s
    service.setIsWindowMinimized(() => false)
    service.setIdleTimeouts(5, 1)

    await service.poll(['chrome.exe'])

    expect(service.httpPost).toHaveBeenCalledWith(`${economyHost}/llama/stop`)
    expect(service.getState().active).toBe(true)
    expect(service.getState().reason).toBe('idle')
  })

  it('activates economy faster when window is minimized', async () => {
    const economyHost = 'http://localhost:12345'
    service.setEconomyHost(economyHost)
    service.setGamingModeEnabled(false)
    service.setGetSystemIdleTime(() => 90) // 1min30s
    service.setIsWindowMinimized(() => true)
    service.setIdleTimeouts(10, 1)

    await service.poll(['chrome.exe'])

    expect(service.httpPost).toHaveBeenCalledWith(`${economyHost}/llama/stop`)
    expect(service.getState().active).toBe(true)
    expect(service.getState().reason).toBe('idle')
  })

  it('deactivates economy when user becomes active again', async () => {
    const economyHost = 'http://localhost:12345'
    service.setEconomyHost(economyHost)
    service.setGamingModeEnabled(false)
    service.setGetSystemIdleTime(() => 310)
    service.setIsWindowMinimized(() => false)
    service.setIdleTimeouts(5, 1)

    await service.poll(['chrome.exe'])
    expect(service.getState().active).toBe(true)

    service.setGetSystemIdleTime(() => 1) // user just interacted
    await service.poll(['chrome.exe'])
    expect(service.getState().active).toBe(false)
    expect(service.httpPost).toHaveBeenLastCalledWith(`${economyHost}/llama/start`)
  })

  it('does not activate when idle timeout is set to 0 (disabled)', async () => {
    service.setGamingModeEnabled(false)
    service.setGetSystemIdleTime(() => 9999)
    service.setIsWindowMinimized(() => false)
    service.setIdleTimeouts(0, 0)

    await service.poll(['chrome.exe'])

    expect(service.getState().active).toBe(false)
  })

  it('gaming mode takes priority over idle', async () => {
    const economyHost = 'http://localhost:12345'
    service.setEconomyHost(economyHost)
    service.setGamingModeEnabled(true)
    service.setGamingApps([
      { id: 1, name: 'Fortnite', executable: 'FortniteClient-Win64-Shipping.exe' },
    ])
    // Idle conditions are met, but gaming should win
    service.setGetSystemIdleTime(() => 9999)
    service.setIsWindowMinimized(() => false)
    service.setIdleTimeouts(1, 1)

    await service.poll(['chrome.exe', 'FortniteClient-Win64-Shipping.exe'])

    expect(service.getState().active).toBe(true)
    expect(service.getState().reason).toBe('gaming')
    expect(service.getState().detectedGames[0].name).toBe('Fortnite')
  })
```

- [ ] **Step 2: Run tests to verify everything passes**

Run: `cd apps/momai && pnpm vitest run src/main/economyService.test.ts`
Expected: All tests PASS
