# Tray Custom Window — Code Review Fix Report

**Status:** DONE

**Date:** 2026-07-21

## Changes Made

### 1. CRITICAL: `sendState` race on first right-click
**File:** `apps/momai/src/main/services/tray-menu-window.ts`
- `show()` now accepts an optional `TrayState` parameter
- On first show, initial state is deferred via `webContents.once('did-finish-load', ...)` — IPC sent before `did-finish-load` was previously lost
- On reused window (subsequent shows), state is sent immediately via `webContents.send`
- `tray-service.ts` updated to pass state directly to `show()` instead of calling `sendState()` separately

### 2. CRITICAL: Missing `closed` event handler
**File:** `apps/momai/src/main/services/tray-menu-window.ts`
- Added `win.on('closed', () => { this.win = null })` after the `blur` handler — prevents stale reference after window destruction

### 3. IMPORTANT: Missing `resizable: false`
**File:** `apps/momai/src/main/services/tray-menu-window.ts`
- Added `resizable: false` to BrowserWindow constructor options

### 4. IMPORTANT: Missing `did-fail-load` error handler
**File:** `apps/momai/src/main/services/tray-menu-window.ts`
- Added `webContents.on('did-fail-load', ...)` that logs the error and closes the window

### 5. MINOR: Missing border in CSS
**File:** `apps/momai/src/renderer/src/views/TrayMenuView.tsx`
- Added `border: 1px solid rgba(255, 255, 255, 0.08)` to `.tray-menu` class (dark theme)
- Added `border-color: rgba(0, 0, 0, 0.08)` override in light theme media query

### 6. MINOR: Type mismatch in preload bridge
**File:** `apps/momai/src/preload/index.ts`
- Changed `onTrayStateUpdate` callback `reason` type from `string | null` to `'idle' | 'game' | null` to match `index.d.ts`

## Files Modified
- `apps/momai/src/main/services/tray-menu-window.ts`
- `apps/momai/src/main/services/tray-service.ts`
- `apps/momai/src/renderer/src/views/TrayMenuView.tsx`
- `apps/momai/src/preload/index.ts`

## Files Tested
- `apps/momai/src/main/services/tray-menu-window.test.ts`
- `apps/momai/src/main/services/tray-service.test.ts`

## Validation Results

| Command | Result |
|---------|--------|
| `pnpm typecheck:node` | PASS (no errors) |
| `pnpm typecheck:web` | PASS (no errors) |
| `npx vitest run src/main/services/tray-menu-window.test.ts src/main/services/tray-service.test.ts` | **33/33 tests passed** (2 test files, all green) |
