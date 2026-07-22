### Task 2: Modify TrayService to use TrayMenuWindow

**Files:**
- Modify: `apps/momai/src/main/services/tray-service.ts`
- Modify: `apps/momai/src/main/services/tray-service.test.ts`

**Interfaces:**
- Consumes: `TrayMenuWindow` from `./tray-menu-window` (already exists from Task 1)
- Produces: Updated `TrayService` — right-click opens popup, no more `setContextMenu()`, tooltip 1s continues, state timer 1s for popup

**TrayMenuWindow API (already built):**
```ts
class TrayMenuWindow {
  show(tray: { getBounds: () => Electron.Rectangle }, state?: TrayState): void
  close(): void
  hide(): void
  isVisible(): boolean
  sendState(state: TrayState): void
}
```

**Changes to TrayService:**

1. Remove `Menu` from electron imports (no longer needed)
2. Import `TrayMenuWindow` from `./tray-menu-window` and `TrayState` type
3. Remove `buildContextMenu()` method entirely
4. Remove `formatCountdown()` method entirely
5. Add private field: `private menuWindow = new TrayMenuWindow()`
6. Replace `menuUpdateTimer` (5s timer that called `setContextMenu`) with `stateTimer` (1s timer that calls `llama.getStatus()` then `menuWindow.sendState(buildState())`)
7. In `start()`: call `createTrayIcon()`, start `tooltipTimer` (1s), start `stateTimer` (1s)
8. Remove the `this.deps.llama.getStatus()` promise at start() line 33 (already handled by stateTimer)
9. In `createTrayIcon()`: add `tray.on('right-click', () => this.onTrayRightClick())` — NO `setContextMenu()` call
10. Add `onTrayRightClick()`: fetch llama status, update `this.llamaStatus`, call `this.menuWindow.show(this.tray!, this.buildState())`
11. In `onTrayClick()`: hide the menuWindow before toggling main window
12. In `stop()`: clean up `stateTimer`, close `menuWindow`
13. Add `buildState()` private method that returns `TrayState` from current status + economy
14. Add `updateState()` private method: fetches llama status and calls `menuWindow.sendState()`

**Key change in onTrayClick:** The old behavior hid window + stopped llama. Keep that. But also call `this.menuWindow.hide()` first.

**Test changes:**
1. Mock `./tray-menu-window` module
2. In mock factory, capture the instance so tests can assert on it
3. Remove all tests that check `Menu.buildFromTemplate` / `setContextMenu` / `buildContextMenu` internals
4. Remove tests that check menu item labels ('Abrir', 'Sair', 'Iniciar LLM', etc.)
5. Keep tests: tooltip, close handler, click handler, tray creation/destruction
6. Add test: right-click calls `TrayMenuWindow.show()`
7. Add test: state timer sends state to menu window periodically
8. Adapt test that checked "Abrir menu item" — now that "Abrir" is in the popup, test the IPC handler behavior elsewhere (not here)

**What tests to keep (adapted):**
- `creates a Tray and registers click handler on start()` — also check right-click
- `destroys the tray on stop()` — also check menuWindow.close()
- `sets tooltip containing the variant appName`
- `installs a close handler on the window on start()`
- `on close with keepInTray=true: hides window and stops llama`
- `on close with keepInTray=false: destroys tray and calls app.quit()`
- `on close when isQuitting=true: returns early`
- `on tray click when window is visible: hides and stops llama`
- `on tray click when window is hidden: shows, focuses, and starts llama`
- `updates tooltip periodically via timer` (was: updates context menu)
- `right-click calls TrayMenuWindow.show()` (NEW)
- `tooltip shows soneca countdown` (adapt from menu to tooltip check)
- `tooltip shows sleeping indicator when soneca is active` (adapt)

**Note on trayInstance mock:** Keep the existing mock, it already has `setToolTip`, `setContextMenu`, `on`, `destroy`. The `setContextMenu` mock will still exist but should not be called after the change.
