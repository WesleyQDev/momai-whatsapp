### Task 4: Expose tray IPC in preload + type declarations

**Files:**
- Modify: `apps/momai/src/preload/index.ts`
- Modify: `apps/momai/src/preload/index.d.ts`

**Goal:** Add tray IPC channels to allowlists, expose `onTrayStateUpdate` + `trayAction*` methods in the preload bridge, and update the TypeScript type declarations.

**Changes to `preload/index.ts`:**

1. **Add to `ALLOWED_INVOKE_CHANNELS`** (the Set around line 27, add in alphabetical order):
```
'tray:action-start',
'tray:action-stop',
'tray:action-restart',
'tray:action-open',
'tray:action-quit',
```

2. **Add to `ALLOWED_ON_CHANNELS`** (the Set around line 97, add in alphabetical order):
```
'tray:state-update',
```

3. **Add methods to `momaiAPI` object** (before the generic helpers section, around line 345, after the existing methods like `onOverlayClosed`):
```ts
onTrayStateUpdate: (callback: (state: {
  llama: { running: boolean; loading: boolean; ready: boolean }
  economy: { active: boolean; reason: string | null; secondsUntilSoneca: number }
  variantName: string
}) => void) => {
  const handler = (_: any, state: any) => callback(state)
  ipcRenderer.on('tray:state-update', handler)
  return () => ipcRenderer.removeListener('tray:state-update', handler)
},
trayActionStart: (): Promise<boolean> => ipcRenderer.invoke('tray:action-start'),
trayActionStop: (): Promise<boolean> => ipcRenderer.invoke('tray:action-stop'),
trayActionRestart: (): Promise<boolean> => ipcRenderer.invoke('tray:action-restart'),
trayActionOpen: (): Promise<boolean> => ipcRenderer.invoke('tray:action-open'),
trayActionQuit: (): Promise<boolean> => ipcRenderer.invoke('tray:action-quit'),
```

**Changes to `preload/index.d.ts`:**

Add the following to the `MomaiAPI` interface (before the closing `}`):
```ts
onTrayStateUpdate: (callback: (state: {
  llama: { running: boolean; loading: boolean; ready: boolean }
  economy: { active: boolean; reason: 'idle' | 'game' | null; secondsUntilSoneca: number }
  variantName: string
}) => void) => () => void
trayActionStart: () => Promise<boolean>
trayActionStop: () => Promise<boolean>
trayActionRestart: () => Promise<boolean>
trayActionOpen: () => Promise<boolean>
trayActionQuit: () => Promise<boolean>
```

**Validation:**
- Run `cd apps/momai && pnpm typecheck:node`

**Commit:** `feat(tray): expose tray IPC methods in preload bridge`
