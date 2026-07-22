# Tray Custom Window — Design Spec

**Date:** 2026-07-21
**Author:** opencode agent
**Status:** Approved

## Objective

Replace the native Windows tray context menu (`setContextMenu`) with a dedicated `BrowserWindow` borderless that updates in real time (1Hz) with LLM status + soneca countdown + action buttons.

## Why

The native Windows tray context menu is a static snapshot — it updates only when re-opened. A `BrowserWindow` with CSS can update live, like OneDrive. The codebase already has a pattern for borderless windows (`OverlayView`).

## Scope

UI only. No changes to `EconomyService` (soneca logic) or `LlamaControl` (LLM management). The native `setContextMenu` is removed; all action logic moves to the popup.

---

## Architecture

```
Right-click tray icon → TrayService.onTrayRightClick()
                       ↓
                       TrayMenuWindow.show()
                       creates/reuses BrowserWindow borderless
                       loads route /tray-menu in renderer React
                       positions above tray icon (bottom-right corner)
                       ↓
                       Main: setInterval 1s sends tray:state-update via IPC
                       Renderer: TrayMenuView updates UI in real time
                       ↓
                       User clicks action → IPC tray:action-*
                       Main: executes action, closes popup
                       ↓
                       Closes on blur, Escape, or exit action (open/quit)
```

---

## Files

### New files

| File | Responsibility |
|------|---------------|
| `apps/momai/src/main/services/tray-menu-window.ts` | `TrayMenuWindow` class — creates/manages borderless BrowserWindow, positioning, state broadcast, blur/Esc close |
| `apps/momai/src/renderer/src/views/TrayMenuView.tsx` | React component — receives `tray:state-update`, renders styled menu, dispatches `tray:action-*` |

### Modified files

| File | Change |
|------|--------|
| `apps/momai/src/main/services/tray-service.ts` | Remove `setContextMenu()`, add `right-click` handler → `TrayMenuWindow.show()` |
| `apps/momai/src/main/coreManager.ts` | Register IPC handlers `tray:action-start/stop/restart/open/quit` |
| `apps/momai/src/preload/index.ts` | Expose `onTrayStateUpdate(cb)`, `trayActionStart/Stop/Restart/Open/Quit()`, add channels to allowlist |
| `apps/momai/src/renderer/src/main.tsx` | Add route `/tray-menu` in Routes |

---

## IPC Payload

### Main → Renderer

```ts
interface TrayState {
  llama: {
    running: boolean
    loading: boolean
    ready: boolean
  }
  economy: {
    active: boolean
    reason: 'idle' | 'game' | null
    secondsUntilSoneca: number  // -1=disabled, 0=activating, >0=seconds
  }
  variantName: string
}
```

### Renderer → Main

```ts
'tray:action-start'    // → llama.start()
'tray:action-stop'     // → llama.stop()
'tray:action-restart'  // → llama.stop() + llama.start()
'tray:action-open'     // → window.show() + window.focus()
'tray:action-quit'     // → app.quit()
```

---

## Visual (CSS)

- Background: `rgba(20, 20, 20, 0.95)` dark / `rgba(248, 248, 248, 0.95)` light
- Border: `1px solid rgba(255, 255, 255, 0.08)` + subtle box-shadow
- Items: padding 8px 16px, hover `rgba(255, 255, 255, 0.06)`
- Separators: `1px solid rgba(255, 255, 255, 0.06)`
- Disabled (status): opacity 0.55, no hover
- Width: 240px, height: variable (~8 items ~= 280px)
- No emojis, no icons — native menu style
- Dark/light theme follows system via `prefers-color-scheme`

---

## Positioning

```ts
const trayBounds = tray.getBounds()
const display = screen.getDisplayNearestPoint(trayBounds)
const { workArea } = display

x = trayBounds.x + trayBounds.width / 2 - menuWidth / 2
y = workArea.bottom - menuHeight - trayBounds.height - 4
```

Overflow handling:
- If `x < workArea.left`: clamp to `workArea.left + 4`
- If `x + menuWidth > workArea.right`: clamp to `workArea.right - menuWidth - 4`

---

## Lifecycle

1. **First right-click**: create `BrowserWindow`, load route, wait `did-finish-load`, show.
2. **Subsequent**: reuse window, send state update immediately, show.
3. **1s timer**: if window visible, send `tray:state-update` with current snapshot.
4. **Close triggers**: `blur` event, keydown `Escape`, click exit action (`open`/`quit`), or `app.before-quit`.
5. **Cleanup**: `TrayMenuWindow.close()` destroys the window.

---

## Error Handling

- `getEconomy()` returns null → economy in payload: `{ active: false, reason: null, secondsUntilSoneca: -1 }`
- `getBounds()` fails (Linux?) → fallback to `workArea.right - menuWidth, workArea.bottom - menuHeight`
- BrowserWindow destroyed externally → detect `isDestroyed()` before operations
- Renderer fails to load → `did-fail-load` handler logs error, destroys window

---

## Tests

| Test | File |
|------|------|
| Lazy BrowserWindow creation | `tray-menu-window.test.ts` |
| Positioning (mock screen + tray.getBounds) | `tray-menu-window.test.ts` |
| Blur closes popup | `tray-menu-window.test.ts` |
| Escape closes popup | `tray-menu-window.test.ts` |
| Window reuse on second show | `tray-menu-window.test.ts` |
| State broadcast (1s timer) | `tray-menu-window.test.ts` |
| TrayService triggers show on right-click | `tray-service.test.ts` (modified) |
| Tooltip 1s continues working | `tray-service.test.ts` (existing) |

---

## Out of Scope

- EconomyService (soneca logic) — unchanged
- LlamaControl (LLM management) — unchanged
- Native menu: may be removed in follow-up. Currently `setContextMenu` is removed and all action logic moves to the popup.
