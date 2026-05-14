# FortScript Refactor: Native Economy Service

## Summary

Remove the external `fortscript` Python library dependency and implement its functionality natively in the MomAI Desktop Electron app. The new **Economy Service** runs in the Electron main process, detects heavy processes (games) via `ps-list`, and controls the LLM engine (unload/reload) via new Node Core REST endpoints.

## Architecture

```
ELECTRON MAIN PROCESS                NODE CORE (child process)
┌─────────────────────────┐         ┌──────────────────────────┐
│ EconomyService          │         │                          │
│  ├─ ps-list polling     │  REST   │  gaming_apps CRUD (exist)│
│  ├─ idle timers        │◄───────►│  economy config CRUD     │
│  ├─ gaming mode logic  │         │  POST /llama/stop        │
│  └─ SteamGridDB covers │         │  POST /llama/start       │
│                         │         │                          │
│  State via IPC ────────►│         └──────────────────────────┘
│  to renderer (UI)      │
└─────────────────────────┘
         │
         ▼
RENDERER (React)
┌─────────────────────────┐
│ EconomyTab (settings)   │
│ EconomyToast (floating) │
│ useSettingsCard (hook)  │
└─────────────────────────┘
```

## Components

### 1. EconomyService (`src/main/economyService.ts`)

New class in the Electron main process. Lifecycle tied to Node Core readiness.

**State:**
```typescript
interface EconomyState {
  active: boolean
  reason: 'gaming' | 'idle' | 'manual' | null
  detectedGames: DetectedGame[]
  gamingModeEnabled: boolean
  idleTimeoutAppOpen: number
  idleTimeoutMinimized: number
}
```

**Loop:**
1. Every 5 seconds, call `ps-list` to get running processes
2. Cross-reference with `gamingApps` list (fetched from Node Core store)
3. If match found → `activateEconomy()` → `POST /llama/stop`
4. If no match and was active → `deactivateEconomy()` → `POST /llama/start`
5. Broadcast state via IPC channel `economy:state-change`

**Idle timers (inactivity detection):**
- `appOpenTimer`: resets on any user activity (chat message sent, voice command received, UI interaction). Fires after N minutes of inactivity.
- `appMinimizedTimer`: starts when window is minimized. Fires after N minutes (no user activity check needed — minimized means no user).
- When timer fires, calls `activateEconomy('idle')`.
- On any user activity, calls `deactivateEconomy()` and resets timers.

**Gaming mode:**
- When enabled, overrides idle timers (game detection takes priority).
- Auto-detects known games from the known-games list (migrated from FortScript's games.py).

### 2. Node Core Endpoints

#### New llama control endpoints:

```
POST /llama/stop
  → llamaManager.stopLlamaServer()
  → { stopped: true }

POST /llama/start
  → llamaManager.ensureLlamaReady(false)
  → { ready: bool, is_loading: bool }
```

#### New economy config endpoints:

```
GET /economy/config
  → { gaming_mode_enabled, idle_timeout_app_open, idle_timeout_minimized, auto_detect_known_games, gaming_apps }

PATCH /economy/config
  → updates config in store
  → { ok: true }

GET /economy/status
  → { active, reason, detected_games }
```

#### Store additions (`infrastructure/store.js`):

```javascript
economy: {
  gaming_mode_enabled: false,
  idle_timeout_app_open: 5,
  idle_timeout_minimized: 1,
  auto_detect_known_games: true,
  last_activity_at: null,
}
```

### 3. IPC

New channel from main process to renderer:

```
'economy:state-change'
  → { active: boolean, reason: string | null, detectedGames: DetectedGame[] }
```

Registered in `preload/index.ts` and `windowManager.ts`.

### 4. UI Changes

#### EconomyTab (`src/renderer/src/components/floating/settings/tabs/EconomyTab.tsx`)

Expand existing tab with:
- LLM timeout section: dropdowns for app open (0/1/5/10/30 min) and minimized (0/1/5/10 min)
- Gaming mode toggle
- Auto-detected games list with toggle per game
- Custom game path input
- Game covers from SteamGridDB

#### EconomyToast (rename from FortScriptToast.tsx)

Mount in `App.tsx` (currently orphaned). Shows floating toast when economy activates/deactivates, with detected game name and cover.

#### i18n

Rename key `settings.tabs.economy` from "FortScript" → "Economia" (pt-BR) / "Economy" (en-US).
Remove outdated FortScript references from splash tips and suggestions.

### 5. Known Games List

Migrate ~150 entries from `apps/fortscript/src/fortscript/games.py` to:

`src/main/data/known-games.json`

```json
[
  {
    "name": "Fortnite",
    "processNames": ["FortniteClient-Win64-Shipping.exe", "FortniteLauncher.exe"],
    "steamGridId": null,
    "categories": ["battle-royale", "shooter"]
  }
]
```

Covers fetched on-demand from SteamGridDB public API (no key required, rate-limited).

## File Changes Summary

### New files:
- `src/main/economyService.ts` — Core monitoring service
- `src/main/data/known-games.json` — ~150 known game entries

### Modified files:
- `src/main/coreManager.ts` — Start/stop EconomyService with Node Core lifecycle
- `src/main/windowManager.ts` — Register `economy:state-change` IPC handler
- `src/preload/index.ts` — Expose economy state listener
- `scripts/node-core/api/router.js` — Register llama.stop/start + economy CRUD routes
- `scripts/node-core/services/llama-manager.js` — No changes needed (stopLlamaServer exists)
- `scripts/node-core/infrastructure/store.js` — Add economy config defaults
- `scripts/node-core/api/routes/llama.routes.js` — (or new file) POST /llama/stop and /llama/start
- `scripts/node-core/api/routes/economy.routes.js` — (new) GET/PATCH /economy/config, GET /economy/status
- `src/renderer/src/App.tsx` — Mount EconomyToast
- `src/renderer/src/components/floating/settings/tabs/EconomyTab.tsx` — Expand with timeouts, gaming mode, covers
- `src/renderer/src/components/floating/FortScriptToast.tsx` → `EconomyToast.tsx` — Rename and improve
- `src/renderer/src/components/floating/FortScriptToast.tsx` — Delete old file
- `src/renderer/src/hooks/useChatHandlers.ts` — Update fortscript_event references
- `src/renderer/src/hooks/useSettingsCard.ts` — Add economy config state
- `src/renderer/src/services/api.ts` — Add economy API functions
- `src/renderer/src/i18n/locales/*.json` — Update economy-related translations
- `src/main/python/bootstrap/uv-runner.ts` — Remove fortscript editable install

### Deleted references:
- `apps/fortscript/` — Entire Python package (can be removed after migration)

## Testing Strategy (TDD)

All new code will follow Test-Driven Development:

1. **EconomyService**: Unit tests with mocked `ps-list` and HTTP. Test state transitions: idle→gaming→idle, timer activation/cancellation.
2. **Node Core endpoints**: Integration tests for `/llama/stop` and `/llama/start` (mock llama-manager).
3. **EconomyTab**: Component tests for rendering config, toggling gaming mode, adding custom games.
4. **EconomyToast**: Test mount/unmount, active/inactive states, auto-hide timer.
5. **IPC**: Test that `economy:state-change` events are properly emitted and received.

## Out of Scope (Phase 2)

- Reading Steam/Epic library files for auto-detection
- Bundled game cover images
- Game-specific power profiles (e.g., different GPU settings per game)
- Scheduler (e.g., "always save energy between 10pm-6am")
