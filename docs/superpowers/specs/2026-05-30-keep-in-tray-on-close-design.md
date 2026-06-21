# Keep in Tray on Close - Design Spec

## Summary

When closing MomAI via the title bar X button, by default minimize to system tray (killing only the llama.cpp server to save resources) instead of fully quitting. Add a toggle in General settings to control this behavior.

## Architecture

```
Settings UI (GeneralTab)
  │ toggle keep_in_tray
  ▼
Node-Core Store (JSON file)
  │
  ├── Python DB (models.py) — keep_in_tray: Boolean, default True
  │
  ▼
IPC: window.api.close()
  │
  ▼
Main Process (windowManager.ts)
  │ read keep_in_tray from store cache
  ├── true  → hide window, kill llama server, keep tray
  └── false → destroy tray, app.quit() (current behavior)
```

## Components

### 1. Data Layer

| Layer | File | Change |
|-------|------|--------|
| Python DB | `apps/core/database/models.py` | Add `keep_in_tray = Column(Boolean, default=True)` |
| Node-Core Store | `apps/momai/scripts/node-core/infrastructure/store.js` | Add `keep_in_tray: true` to defaults |
| TS Interface | `apps/momai/src/renderer/src/hooks/useSettingsCard.ts` | Add `keep_in_tray?: boolean` to Settings interface, default `true` |

### 2. Settings UI (GeneralTab)

- Add toggle row below "Skip intro" section
- Label: "Keep in background" (en-US) / "Manter em segundo plano" (pt-BR)
- Description: "When closing, minimizes to tray instead of quitting" / "Ao fechar, minimiza para a bandeja ao invés de encerrar"
- Default: ON (true)

### 3. Main Process Close Handler (windowManager.ts)

Modify `mainWindow.on('close', ...)`:

```
close event
  ├─ macOS? return
  ├─ isQuitting? return
  ├─ preventDefault()
  ├─ keep_in_tray === true
  │    ├─ hide window
  │    ├─ killLlamaServer() (stop llama.cpp only)
  │    └─ DO NOT quit app
  └─ keep_in_tray === false
       ├─ destroy tray
       ├─ app.quit() (current behavior)
```

### 4. Llama Server Control (coreManager.ts)

Add `killLlamaServer()` function that:
- Finds llama.cpp server process
- Sends SIGTERM (or taskkill on Windows)
- Does NOT kill Node Core or Python backend

On window restore (tray click / Alt+Space), existing `auto_start_llm` logic handles restart.

### 5. IPC Sync

- On app startup: read `keep_in_tray` from Node-Core store JSON file, cache in main process
- On setting change: renderer notifies main via new IPC channel `setting-keep-in-tray-changed` with boolean value
- On close: use cached value

### 6. i18n Keys

Add to all locale files (en-US, pt-BR, es, fr, de, it):

```json
{
  "settings.general.keepInTrayLabel": "...",
  "settings.general.keepInTrayDesc": "..."
}
```

## Error Handling

- If store file is unreadable at startup, default to `true` (keep in tray)
- If llama server kill fails, log warning but continue (don't block hide)
- If window hide fails, fall back to full quit

## Testing

- Toggle ON → close window → tray icon remains, window hides, llama stops
- Toggle OFF → close window → app fully quits, no tray
- Restore from tray → window shows, llama restarts automatically
- Tray right-click "Sair" → always fully quits regardless of toggle
