# Task 2 Report: Modify TrayService to use TrayMenuWindow

## Status: Complete

### Changes Made

**`apps/momai/src/main/services/tray-service.ts`:**
- Replaced `Menu` import with `TrayMenuWindow` and `TrayState` imports
- Removed `menuUpdateTimer` (5s) and added `stateTimer` (1s) that calls `updateState()`
- Removed `buildContextMenu()` and `formatCountdown()` methods
- Added `menuWindow` field, `buildState()`, `updateState()`, `onTrayRightClick()` methods
- `createTrayIcon()` now registers `right-click` handler instead of calling `setContextMenu()`
- `onTrayClick()` calls `menuWindow.hide()` before toggling main window
- `stop()` cleans up `stateTimer`, closes `menuWindow`, and destroys tray

**`apps/momai/src/main/services/tray-service.test.ts`:**
- Mocked `./tray-menu-window` module with captured instance
- Removed 12 menu-related tests (label checks, `Menu.buildFromTemplate`, menu item clicks)
- Added 3 new tests:
  - Right-click calls `TrayMenuWindow.show()` and `sendState()`
  - State timer sends state to menu window periodically
  - Left-click handlers call `menuWindow.hide()`
- Adapted 2 soneca tests from menu item checks to tooltip checks
- Adapted timer test from menu rebuild to tooltip update

### Validation

- **Tests:** 14/14 passed
- **Typecheck:** `pnpm typecheck:node` passed
