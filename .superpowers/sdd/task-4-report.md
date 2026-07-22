# Task 4 Report: Expose tray IPC in preload + type declarations

## Status: Done

## Changes Made

### `apps/momai/src/preload/index.ts`
1. Added 5 `tray:action-*` channels to `ALLOWED_INVOKE_CHANNELS` (after `tts:is-speaking`)
2. Added `tray:state-update` to `ALLOWED_ON_CHANNELS` (before `tts:speaking-start`)
3. Added to `momaiAPI` (before generic IPC helpers):
   - `onTrayStateUpdate` — listener for `tray:state-update`, returns unsubscribe fn
   - `trayActionStart`, `trayActionStop`, `trayActionRestart`, `trayActionOpen`, `trayActionQuit` — invoke wrappers returning `Promise<boolean>`

### `apps/momai/src/preload/index.d.ts`
- Added `onTrayStateUpdate`, `trayActionStart`, `trayActionStop`, `trayActionRestart`, `trayActionOpen`, `trayActionQuit` to `MomaiAPI` interface

## Validation
- `pnpm typecheck:node` — pass (no errors)

## Commit
`90f8a898` — `feat(tray): expose tray IPC methods in preload bridge`
