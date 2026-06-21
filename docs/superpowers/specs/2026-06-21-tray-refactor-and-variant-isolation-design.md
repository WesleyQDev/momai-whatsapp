# Tray Refactor & Variant Isolation - Design Spec

## Summary

Refactor the tray logic into a dedicated `TrayService` module and isolate the four distribution variants (dev, NSIS .exe, Microsoft Store APPX, APPX test) so they can run simultaneously without port, data, or single-instance conflicts.

The Microsoft Store variant must keep its existing `appId` (`com.wesleyqdev.momai`) to avoid breaking Windows Update and user data.

The "keep in tray on close" toggle and X-to-tray behavior already exist (`docs/superpowers/specs/2026-05-30-keep-in-tray-on-close-design.md`) and remain unchanged. This refactor only restructures the code and adds variant isolation.

## Goals

- Eliminate the conflict between `pnpm dev` and an installed `.exe` / Store / APPX-test running on the same machine.
- Give each variant a unique appId, userData path, and port range.
- Extract the tray and close-interception logic from `windowManager.ts` into a dedicated, testable `TrayService`.
- Preserve the Store variant's identity (appId and update path) — no changes there.
- Keep the existing `keep_in_tray` setting and toggle in GeneralTab untouched.

## Non-Goals

- Redesigning the tray icon, menu, or visual behavior.
- Changing how llama.cpp is started, stopped, or supervised.
- Adding multi-window support (each variant still has exactly one main window).
- Migrating existing `.exe` user data automatically (v1.5.0 ships with clean separation; migration script is a follow-up).
- Touching macOS or Linux build paths in this iteration (Windows-only).

## Variant Table

| Variant   | appId                              | appName                  | corePort | pythonPort | userDataSubdir |
|-----------|------------------------------------|--------------------------|----------|------------|----------------|
| dev       | `com.wesleyqdev.momai.dev`         | `MomAI (Dev)`            | 8050     | 8051       | `MomAI-Dev`    |
| nsis      | `com.wesleyqdev.momai.nsis`        | `MomAI`                  | 8100     | 8101       | `MomAI`        |
| appx-store| `com.wesleyqdev.momai` ⭐ unchanged | `MomAI - Assistente`     | 8200     | 8201       | (Microsoft-managed) |
| appx-test | `com.wesleyqdev.momai.test`        | `MomAI - Teste`          | 8300     | 8301       | `MomAI-Teste`  |

**Key constraint**: `appx-store` keeps `appId = com.wesleyqdev.momai` so the Microsoft Store update flow and user data are preserved. Only its port changes (8000 → 8200); the change is transparent to end users on the next app launch.

**Why dev uses 8050 (not 8000)**: a user who already has the old Store version installed (still on port 8000) would still conflict with `pnpm dev` if dev used 8000. Bumping dev to 8050 keeps it out of the way of all production variants AND the legacy install during the transition window. After updating Store, dev (8050) and Store (8200) coexist cleanly.

## Architecture

```
┌─────────────────────────────────────────────────┐
│  variants.ts  (single source of truth)          │
│  Record<Variant, VariantConfig>                 │
│  + CURRENT_VARIANT resolved from process.env    │
└─────────────────────────────────────────────────┘
                       │
        ┌──────────────┴──────────────┐
        ▼                             ▼
┌──────────────────┐         ┌─────────────────────┐
│  index.ts        │         │  electron-builder   │
│  (boot)          │         │  scripts inject     │
│                  │         │  MOMAI_VARIANT env  │
│  - app.setName   │         └─────────────────────┘
│  - setAppUser... │
│  - setPath user..│
│  - PORT=...      │
│  - pythonPort=...│
└──────────────────┘
        │
        ▼
┌──────────────────────────────────────────────────┐
│  TrayService  (new, src/main/services/)          │
│                                                  │
│  ┌────────────────┐  ┌────────────────────┐     │
│  │ createTrayIcon │  │ installCloseHandler│     │
│  └────────────────┘  └────────────────────┘     │
│                                                  │
│  Dependencies (injected):                        │
│  - BrowserWindow                                 │
│  - LlamaControl (interface)                      │
│  - KeepInTrayReader (interface)                  │
│  - VariantConfig                                 │
└──────────────────────────────────────────────────┘
        │                       │
        ▼                       ▼
┌───────────────────┐   ┌─────────────────────────┐
│ HttpLlamaControl  │   │ FileKeepInTrayReader    │
│ (impl)            │   │ (impl)                  │
│ fetch /llama/*    │   │ reads node-core-store   │
└───────────────────┘   └─────────────────────────┘
```

## Components

### 1. `apps/momai/src/main/variants.ts` (new)

Defines the `Variant` union type, `VariantConfig` interface, the static `TABLE`, and the `CURRENT_VARIANT` resolved at module load from `process.env.MOMAI_VARIANT`. Defaults to `'dev'` when the env var is unset (so `pnpm dev` works out of the box).

```typescript
export type Variant = 'dev' | 'nsis' | 'appx-store' | 'appx-test'

export interface VariantConfig {
  variant: Variant
  appId: string
  appName: string
  userDataSubdir: string
  corePort: number
  pythonPort: number
  displayLabel: string
}

const TABLE: Record<Variant, VariantConfig> = { /* see Variant Table */ }

export const CURRENT_VARIANT: VariantConfig =
  TABLE[(process.env.MOMAI_VARIANT as Variant) || 'dev']
```

Exports a helper `isValidVariant(s: string): s is Variant` for build scripts.

### 2. `apps/momai/src/main/services/tray-service.ts` (new)

Single class owning the tray icon, context menu, tray click handler, and window close interception. Public API is `start()` / `stop()`; called once from `index.ts` after the main window is created.

Constructor receives `TrayServiceDeps`:
- `window: BrowserWindow` — the main window to control
- `llama: LlamaControl` — interface for `start()` / `stop()` (mocked in tests)
- `keepInTray: KeepInTrayReader` — interface for `isEnabled()` (mocked in tests)
- `variant: VariantConfig` — used for the tray tooltip and menu title (so the user knows which variant they're running)
- `isQuitting: () => boolean` — returns the current quitting state. In production, this reads `state.isQuitting` from `state.ts`; in tests, returns a togglable boolean. The close handler returns early when this is `true`, matching the current behavior in `windowManager.ts:418`.

Internal methods:
- `createTrayIcon()` — creates `Tray` with icon, builds context menu, registers `click` handler
- `buildContextMenu()` — returns a `Menu` with `Abrir` and `Sair` items; titles include `variant.appName`
- `installCloseHandler()` — calls `window.on('close', this.handleClose)` once
- `handleClose(event)` — intercepts close: prevents default, then either hides the window + stops llama, or destroys the tray + calls `app.quit()`

### 3. `apps/momai/src/main/services/llama-control.ts` (new)

`HttpLlamaControl` implements the `LlamaControl` interface. Wraps `fetch` calls to `POST /llama/stop` and `POST /llama/start` at `API_BASE_URL`. Swallows errors (fire-and-forget, matching current behavior in `windowManager.ts:427,517,539,612`).

```typescript
export interface LlamaControl {
  start(): Promise<void>
  stop(): Promise<void>
}

export class HttpLlamaControl implements LlamaControl {
  start() { return fetch(`${API_BASE_URL}/llama/start`, { method: 'POST' }).then(() => {}, () => {}) }
  stop()  { return fetch(`${API_BASE_URL}/llama/stop`,  { method: 'POST' }).then(() => {}, () => {}) }
}
```

### 4. `apps/momai/src/main/services/keep-in-tray-reader.ts` (new)

`FileKeepInTrayReader` implements the `KeepInTrayReader` interface. Reads `node-core-store.json` from `app.getPath('userData')/data/` and returns `data.settings?.keep_in_tray !== false` (matches current `readKeepInTraySetting()` in `windowManager.ts:41-50`). Returns `true` on any error.

```typescript
export interface KeepInTrayReader {
  isEnabled(): boolean
}

export class FileKeepInTrayReader implements KeepInTrayReader {
  isEnabled(): boolean { /* move logic from windowManager.ts:41-50 */ }
}
```

### 5. `apps/momai/src/main/index.ts` (modified)

After the main window is created, instantiate and start `TrayService`:

```typescript
import { TrayService } from './services/tray-service'
import { HttpLlamaControl } from './services/llama-control'
import { FileKeepInTrayReader } from './services/keep-in-tray-reader'
import { CURRENT_VARIANT } from './variants'

// At the very top of index.ts (before app.whenReady):
app.setName(CURRENT_VARIANT.appName)
app.setAppUserModelId(CURRENT_VARIANT.appId)
app.setPath('userData', join(app.getPath('appData'), CURRENT_VARIANT.userDataSubdir))
process.env.PORT = String(CURRENT_VARIANT.corePort)
process.env.MOMAI_PYTHON_SIDECAR_PORT = String(CURRENT_VARIANT.pythonPort)

// After createWindow():
const trayService = new TrayService({
  window: mainWindow,
  llama: new HttpLlamaControl(),
  keepInTray: new FileKeepInTrayReader(),
  variant: CURRENT_VARIANT
})
trayService.start()
```

**Note on Store variant**: `app.setPath('userData', ...)` is called with our `userDataSubdir`, but Windows Store imposes its own userData path. The `appId` determines the actual location on disk — keeping `com.wesleyqdev.momai` for Store means user data stays exactly where the Store puts it. The `userDataSubdir` value for `appx-store` is therefore documentation-only and may be ignored by the OS; we still set it for consistency in case it ever applies.

**Note on dev variant**: the existing `env.ts` logic that sets `userData` to `../../.dev-data` is replaced by the new path resolution in `index.ts`. The `app.name = 'MomAI-dev'` line is also removed (replaced by `app.setName(CURRENT_VARIANT.appName)`). File `env.ts` may be deleted if no other logic remains.

### 6. `apps/momai/src/main/windowManager.ts` (modified)

- Delete `setupTray()` (lines 503-544).
- Delete the `mainWindow.on('close', ...)` handler (lines 417-438).
- Delete `readKeepInTraySetting()` (lines 41-50) — moved to `keep-in-tray-reader.ts`.
- Delete the four `fetch(/llama/stop|start)` calls — moved to `llama-control.ts`.
- Keep window creation, show/hide, state management, and other window-related code as-is.

### 7. `apps/momai/src/main/env.ts` (modified or deleted)

If after the refactor `env.ts` only contained the dev userData path logic, delete the file and inline the deletion. If any logic remains, keep the file.

### 8. `apps/momai/package.json` (modified)

Update build scripts to inject `MOMAI_VARIANT`:

```json
"build:win":          "cross-env MOMAI_VARIANT=nsis       electron-builder --win nsis",
"build:appx:store":   "cross-env MOMAI_VARIANT=appx-store electron-builder --win appx",
"build:appx:test":    "cross-env MOMAI_VARIANT=appx-test  electron-builder --win appx"
```

`pnpm dev` requires no change (defaults to `'dev'` when `MOMAI_VARIANT` is unset).

Add `cross-env` as a devDependency (it's likely already present via turbo/pnpm; verify in `pnpm-lock.yaml`).

### 9. `apps/momai/electron-builder.yml` (modified)

Add `appx.displayName` and `appx.artifactName` overrides per build target via env var or per-build flag — or, more simply, leave the YAML as is and accept that `appx-store` and `appx-test` builds already use different `displayName` values (current behavior: `MomAI - Assistente local` and `MomAI - Teste` respectively, set in `package.json` script overrides).

The `appx.identityName` and `appx.applicationId` stay as currently configured (Store keeps `WesleyDeveloperStudios.MomAI-Assistentelocal`; test keeps `WesleyQDev.MomAI-Teste`). These are NOT changed.

## Behavior

### Closing the window (X button) with `keep_in_tray = true` (default)

1. `TrayService.handleClose(event)` is invoked.
2. `event.preventDefault()` cancels the default close.
3. `window.hide()` hides the main window.
4. `llama.stop()` calls `POST /llama/stop` to free GPU/RAM. Fire-and-forget; errors swallowed.
5. The tray icon remains visible. The app process stays alive. Node-core, Python sidecar, and other services continue running.

### Closing the window (X button) with `keep_in_tray = false`

1. `TrayService.handleClose(event)` is invoked.
2. `event.preventDefault()` cancels the default close.
3. `trayService.stop()` destroys the tray icon.
4. `app.quit()` is called, triggering the existing `before-quit` handler in `index.ts:246-274`, which:
   - Sets `isQuitting = true`
   - Calls `shutdownCoreBackend()` (kills node-core, python, llama)
   - Calls `forceKillAllSync()` (last-resort cleanup)
   - `app.exit(0)`

### Clicking the tray icon (no menu open)

- If window is visible: hide + llama.stop().
- If window is hidden: show + focus + llama.start().

### Clicking "Abrir" in tray menu

Same as above (show + focus + llama.start()).

### Clicking "Sair" in tray menu

- Set `isQuitting = true`, call `app.quit()`. Same cleanup path as `keep_in_tray = false` close.

## Testing

### `apps/momai/src/main/variants.test.ts` (new)

- ✓ exports all 4 variants with the expected values from the table
- ✓ `CURRENT_VARIANT` defaults to `'dev'` when `MOMAI_VARIANT` is unset
- ✓ `CURRENT_VARIANT` picks the right entry for each valid env var value
- ✓ no two variants share the same appId
- ✓ no two variants share the same (corePort, pythonPort) pair
- ✓ `isValidVariant` returns true for valid values, false otherwise

### `apps/momai/src/main/services/__tests__/tray-service.test.ts` (new)

Use a fake `BrowserWindow`, `LlamaControl` spy, and `KeepInTrayReader` toggle.

- ✓ creates a `Tray` instance on `start()`
- ✓ destroys the `Tray` instance on `stop()`
- ✓ on `close` event with `keepInTray=true`: calls `event.preventDefault()`, `window.hide()`, `llama.stop()`; does NOT call `app.quit()`
- ✓ on `close` event with `keepInTray=false`: calls `event.preventDefault()`, `trayService.stop()` (or destroys tray), then `app.quit()`
- ✓ on tray click when window is visible: `window.hide()` + `llama.stop()`
- ✓ on tray click when window is hidden: `window.show()` + `window.focus()` + `llama.start()`
- ✓ tray context menu has "Abrir" and "Sair" items
- ✓ "Sair" menu item calls `app.quit()`
- ✓ close event on macOS is ignored (returns early)
- ✓ close event when `isQuitting` is true is ignored (returns early)
- ✓ tray tooltip includes `variant.appName`

### `apps/momai/src/main/services/__tests__/llama-control.test.ts` (new)

Mock `fetch`.

- ✓ `start()` POSTs to `${API_BASE_URL}/llama/start`
- ✓ `stop()` POSTs to `${API_BASE_URL}/llama/stop`
- ✓ `start()` and `stop()` both swallow network errors (resolve, not reject)

### `apps/momai/src/main/services/__tests__/keep-in-tray-reader.test.ts` (new)

Mock `fs` or use a temp file.

- ✓ returns `true` when `node-core-store.json` is missing
- ✓ returns `true` when `node-core-store.json` is corrupted (invalid JSON)
- ✓ returns `true` when `keep_in_tray` field is absent
- ✓ returns `true` when `keep_in_tray = true` in store
- ✓ returns `false` when `keep_in_tray = false` in store

### Existing tests (no changes expected)

- `apps/momai/src/main/economyService.test.ts` — should still pass; service is unrelated
- `apps/momai/src/renderer/src/components/floating/settings/tabs/GeneralTab.test.tsx` — should still pass; the toggle is unchanged
- `apps/momai/src/main/windowManager.test.ts` (if exists) — should be removed or refactored; tray logic no longer lives here

## Migration & Rollout

1. Land changes behind a feature flag is not needed — old code path is removed in the same PR.
2. Manual test matrix (developer machine) before each release:

| Test | Expected |
|------|----------|
| `pnpm dev` only, no other build | Works. Tray shows "MomAI (Dev)". Port 8000. |
| `pnpm dev` + installed `.exe` | Both run. Tray shows both "MomAI (Dev)" and "MomAI". |
| Install `.exe` from `pnpm build:win` | Works. Port 8100. |
| Build and install `appx-test` from `pnpm build:appx:test` | Works. Port 8300. Display name "MomAI - Teste". |
| `pnpm build:appx:store` (cannot install in dev) | Builds successfully. Manifest keeps `WesleyDeveloperStudios.MomAI-Assistentelocal`. |
| Update from old Store version to new | Works. User data preserved. Port changes to 8200 transparently. |

3. Backward compatibility:
   - Store users: transparent update. Data preserved. Port changes from 8000 to 8200 internally.
   - `.exe` users: clean separation from this version onward. Existing data in `~/AppData/Roaming/MomAI/` is left in place but not read by the new `.exe` (which uses a new appId). v1.5.0 ships without migration script. A future release can add a migration helper that copies `MomAI/` → `MomAI-NSIS/` on first boot of the new `.exe`.

4. Rollback plan: revert the PR. Old builds in user hands continue working as before. New builds in Store would need a hotfix.

## Risks

1. **🟡 Port collision with unrelated apps on user machine** (someone else using 8200):
   - Mitigation: in `HttpLlamaControl`, the underlying `node-core` fails to start if the port is taken. Add a fallback in `coreManager.ts` to try `corePort + 1` up to 5 times before giving up. Log a warning.

2. **🟡 MOMAI_VARIANT not injected on macOS / Linux**:
   - Mitigation: macOS/Linux default to `'dev'` if env var is unset. This is acceptable for v1.5.0 (Windows-first). Document in release notes that macOS/Linux dev experience is unchanged.

3. **🟢 Store update on first install of new version may briefly hold port 8000**:
   - Old Store process (port 8000) must close before new (port 8200) starts. Windows Store handles this; the new process will fail to start if the old port is held, but Store stops the old one first. Logged for awareness.

4. **🟢 `cross-env` may not be a devDependency yet**:
   - Mitigation: add to `devDependencies` in `apps/momai/package.json` if missing.

5. **🟢 Tray icon path**:
   - The tray icon (`ICON_PATH` in `windowManager.ts:42`) must be accessible from the new `TrayService` location. Pass it via `TrayServiceDeps` or import directly from a shared `constants.ts`.

## Out of Scope (Follow-up Specs)

- Migration script for existing `.exe` user data.
- Multi-window support.
- Cross-platform (macOS / Linux) variant injection.
- Auto-update channel differentiation per variant.
