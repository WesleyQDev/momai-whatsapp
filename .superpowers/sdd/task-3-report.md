# Task 3 Report: Register tray IPC handlers in coreManager.ts

## Status: Complete

## Changes
- Modified: `apps/momai/src/main/coreManager.ts`
- Added 5 `ipcMain.handle()` calls after the existing `economy:reinstate-sleep` handler, inside `startEconomyService()`:
  - `tray:action-start` — POST `/llama/start`, returns boolean
  - `tray:action-stop` — POST `/llama/stop`, returns boolean
  - `tray:action-restart` — POST `/llama/stop` then `/llama/start`, returns boolean
  - `tray:action-open` — shows/focuses the main window, fire-and-forget `/llama/start`
  - `tray:action-quit` — calls `app.quit()`

## Validation
- `pnpm typecheck:node` — passed with zero errors

## Commit
`e835cbda` — `feat(tray): register IPC handlers for tray action buttons`
