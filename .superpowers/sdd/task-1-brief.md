### Task 1: TrayMenuWindow class (main process)

**Files:**
- Create: `apps/momai/src/main/services/tray-menu-window.ts`
- Test: `apps/momai/src/main/services/tray-menu-window.test.ts`

**Interfaces:**
- Consumes: `BrowserWindow` from `electron`, `screen` from `electron`, `Tray` instance, `TrayState` snapshot builder
- Produces: `TrayMenuWindow` class with `show(tray: Tray)`, `close()`, `isVisible()`, `sendState(state)`, `hide()` methods

**TrayState interface (exported from tray-menu-window.ts):**
```ts
export interface TrayState {
  llama: { running: boolean; loading: boolean; ready: boolean }
  economy: {
    active: boolean
    reason: 'idle' | 'game' | null
    secondsUntilSoneca: number  // -1=disabled, 0=activating, >0=seconds
  }
  variantName: string
}
```

**Constants:**
- MENU_WIDTH = 240
- MENU_HEIGHT = 280

**TrayMenuWindow class behavior:**
1. First `show()`: create BrowserWindow lazily (borderless, frame:false, skipTaskbar:true, alwaysOnTop:true, hasShadow:true, background:#141414). Preload at `join(__dirname, '../preload/index.js')`. Pass `--momai-is-dev=${is.dev}` only (no API URL needed — the view only uses IPC).
2. Positioning: tray.center.x - 120, display.workArea.bottom - 280 - tray.height - 4. Clamp to workArea bounds.
3. Reuses same window on subsequent `show()` calls (unless destroyed).
4. `sendState(state)`: calls `win.webContents.send('tray:state-update', state)` only if window is visible.
5. Blur → hide the window (not close, since we reuse it).
6. Escape key → close the window (sets this.win = null, destroyed).
7. `close()` → close and nullify.
8. Dev: loadURL with `ELECTRON_RENDERER_URL#/tray-menu`. Prod: loadFile `../renderer/index.html` with hash `/tray-menu`.
9. `hide()` → hide if visible.
10. `isVisible()` → boolean.
11. Load route `/tray-menu` in the renderer.

**Test behavior:**
- Create mock BrowserWindow (with loadURL, show, hide, close, isDestroyed, on, webContents.send, setSize, setPosition, focus)
- Mock `electron` with BrowserWindow and screen modules
- Test: lazy creation on first show
- Test: reuse window on second show
- Test: positioning uses tray.getBounds and screen.getDisplayNearestPoint
- Test: sendState sends tray:state-update IPC
- Test: blur event hides window
- Test: Escape key closes window
