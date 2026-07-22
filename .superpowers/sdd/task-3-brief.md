### Task 3: Register tray IPC handlers in coreManager.ts

**Files:**
- Modify: `apps/momai/src/main/coreManager.ts`

**Goal:** Add 5 IPC handlers (`tray:action-start`, `tray:action-stop`, `tray:action-restart`, `tray:action-open`, `tray:action-quit`) in coreManager.ts.

**Where to add them:** Inside the `registerIpcHandlers()` function (or rather, the `registerCoreCommands()` function — look for the block that contains existing `ipcMain.handle('interaction:ping', ...)`, `ipcMain.handle('economy:dismiss', ...)`, `ipcMain.handle('llama:start', ...)`). Add the new handlers right after the existing `ipcMain.handle('economy:reinstate-sleep', ...)` block, before the closing `}` of the try block.

**Context:**
- `apiHost` and `apiPort` are already in scope at that point (used by existing handler `llama:start` at line 178)
- `authFetch` is already imported at the top of the file (it's near line 1-30)
- `getMainWindow()` is already imported from `./windowManager` (check the imports at the top)
- `app` is imported from `electron` (it's part of the import block)

**Handlers to add:**

```ts
ipcMain.handle('tray:action-start', async () => {
  try {
    await authFetch(`http://${apiHost}:${apiPort}/llama/start`, { method: 'POST' })
    return true
  } catch {
    return false
  }
})

ipcMain.handle('tray:action-stop', async () => {
  try {
    await authFetch(`http://${apiHost}:${apiPort}/llama/stop`, { method: 'POST' })
    return true
  } catch {
    return false
  }
})

ipcMain.handle('tray:action-restart', async () => {
  try {
    await authFetch(`http://${apiHost}:${apiPort}/llama/stop`, { method: 'POST' })
    await authFetch(`http://${apiHost}:${apiPort}/llama/start`, { method: 'POST' })
    return true
  } catch {
    return false
  }
})

ipcMain.handle('tray:action-open', () => {
  const win = getMainWindow()
  if (win) {
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
    authFetch(`http://${apiHost}:${apiPort}/llama/start`, { method: 'POST' }).catch(() => {})
  }
  return true
})

ipcMain.handle('tray:action-quit', () => {
  app.quit()
  return true
})
```

**No tests needed for this task** — these handlers are thin wrappers around existing functions. Typecheck is sufficient validation.

**Validation:**
- Run `cd apps/momai && pnpm typecheck:node`
- Ensure no type errors

**Commit:** `feat(tray): register IPC handlers for tray action buttons`
