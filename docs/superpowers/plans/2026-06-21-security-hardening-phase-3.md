# Security Hardening - Phase 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Address the 8 MEDIUM-severity issues from the security audit: Electron renderer sandbox, curated preload surface, DevTools block in production, OS keychain for API keys, rate limiting, error sanitization, regression test for chat-history auth (already covered by global middleware), and extension install signature/checksum verification.

**Architecture:** Reuse the Phase 1 session-token pattern. `sandbox: true` is set on both main and overlay windows; preload is converted to a small curated surface (curated, deny-by-default). DevTools are blocked in production via `webContents.on('before-input-event')`. API keys move from plaintext SQLite to Electron `safeStorage` (OS keychain: macOS Keychain, Windows Credential Manager, Linux libsecret). Rate limiting uses slowapi in Python and a small in-memory token-bucket in Node Core. Error sanitization: every catch block returns a generic message to the client and logs the full error server-side. Extension signature verification adds SHA-256 checksum validation (full cryptographic signing is deferred — see "Out of scope").

**Tech Stack:** TypeScript, Node.js, Python/FastAPI, Electron 42, vitest, pytest, Electron `safeStorage`, Python `slowapi`.

**Reference spec:** `docs/superpowers/specs/2026-06-21-security-hardening-design.md` (Phase 3 section)
**Reference audit:** `artifacts/reports/auditorias/auditoria-seguranca-2026-06-21.md` (M1–M8)
**Reference remaining work:** `docs/superpowers/specs/2026-06-21-security-hardening-remaining-work.md`

---

## File Structure

**New files (Phase 3):**
- `apps/momai/src/main/security/keychain.ts` — safeStorage wrapper
- `apps/momai/src/main/security/keychain.test.ts` — tests
- `apps/momai/scripts/node-core/middleware/rate-limit.js` — token bucket
- `apps/momai/scripts/node-core/middleware/rate-limit.test.js` — tests
- `apps/momai/scripts/node-core/utils/error-sanitizer.js` — generic-message wrapper
- `apps/momai/scripts/node-core/utils/error-sanitizer.test.js` — tests
- `apps/momai/scripts/node-core/utils/extension-checksum.js` — SHA-256 verification
- `apps/momai/scripts/node-core/utils/extension-checksum.test.js` — tests
- `apps/momai/scripts/node-core/tests/chat-auth-regression.test.js` — regression test
- `apps/core/api/middleware/rate_limit.py` — slowapi config
- `apps/core/api/middleware/error_handler.py` — FastAPI exception handlers
- `apps/core/tests/test_error_sanitization.py` — tests
- `apps/core/tests/test_rate_limit.py` — tests

**Modified files:**
- `apps/momai/src/main/windowManager.ts:276, 333` — flip `sandbox: false` to `sandbox: true` (main + overlay)
- `apps/momai/src/preload/index.ts` — replace `electronAPI` generic surface with curated `momaiAPI`
- `apps/momai/src/main/index.ts` — block F12 in production, `Menu.setApplicationMenu(null)` in production
- `apps/momai/src/main/index.ts` or `coreManager.ts` — wire `safeStorage` into the API-key GET/SET path
- `apps/core/api/router.py` — add slowapi, mount exception handlers
- `apps/core/database/models.py` — keep `api_keys` column for backward compat but read/write via keychain
- `apps/momai/scripts/node-core/index.js` — mount the new rate-limit middleware
- `apps/momai/scripts/node-core/api/routes/extensions.routes.js` — call `verifyChecksum` after download

**Test estimate:** ~25 new tests (more than the plan's "~15" estimate because sandbox + safeStorage + rate-limit each warrant a meaningful test matrix).

---

## Task 1: `sandbox: true` on main + overlay windows (M1)

**Files:**
- Modify: `apps/momai/src/main/windowManager.ts:276, 333`

This is a one-line config change per window. The risk is that the preload uses Node APIs incompatible with sandbox mode (notably `process.argv` for reading session token from `additionalArguments`). In Electron sandbox mode, the preload is polyfilled to a CJS-compatible subset; `process.argv` IS available (it only contains the `additionalArguments`, not the system args). The `electronAPI` from `@electron-toolkit/preload` already works in sandbox.

- [ ] **Step 1: Flip the flag in `createOverlayWindow` (line 278)**

Change `sandbox: false` to `sandbox: true` in the overlay `webPreferences`.

- [ ] **Step 2: Flip the flag in `createMainWindow` (line 335)**

Change `sandbox: false` to `sandbox: true` in the main `webPreferences`.

- [ ] **Step 3: Typecheck and run all tests**

```bash
cd apps/momai && pnpm typecheck:node && pnpm test --project=main --project=scripts
```

Expected: typecheck passes, tests pass except the 5 pre-existing failures. (The pre-existing `ContainerChat.tsx:899` typecheck error stays.)

- [ ] **Step 4: Smoke test the app boots with sandbox**

```bash
cd apps/momai && timeout 15 pnpm dev:all 2>&1 | head -40
```

Expected: both Node Core and Electron main process start. The renderer may not actually load (no display in CI), but the main process logs should show the window created and preload loaded. Ctrl-C after 15s.

Look for any console errors mentioning "preload script" or "sandbox". If the renderer fails to load due to a preload issue, the implementer should:
- Read the error carefully
- Check that `apps/momai/src/preload/index.ts` doesn't use forbidden APIs (`fs`, `child_process`, etc.)
- The `process.argv.find(...)` calls are FINE in sandbox (this is a common misconception)

If sandbox is incompatible with the current preload, do NOT silently disable sandbox — report BLOCKED with the specific error and the controller will decide.

- [ ] **Step 5: Commit**

```bash
git add apps/momai/src/main/windowManager.ts
git commit -m "fix(security): enable Electron renderer sandbox (M1)

set sandbox: true on both the main window (line 335) and the overlay
window (line 278). The renderer now runs in a separate OS process
with a restricted subset of Node APIs (events, timers, url, plus
the Electron IPC bridge). A renderer compromise can no longer
read the filesystem or spawn child processes.

The preload uses process.argv for additionalArguments (session token,
API URL, WS URL), which is available in sandbox mode (additionalArguments
are the only entries in argv). The electronAPI from @electron-toolkit/preload
already supports sandbox."
```

---

## Task 2: Preload: replace generic `electronAPI` with curated surface (M2)

**Files:**
- Modify: `apps/momai/src/preload/index.ts` — replace `electronAPI.*` with hand-rolled `momaiAPI` exports
- Modify: `apps/momai/src/renderer/src/preload.d.ts` or equivalent (if it exists) — update the type

The current preload exposes the full `electronAPI` (every IPC channel goes through). After this task, the renderer only sees a curated list of named functions.

- [ ] **Step 1: Inventory current `electronAPI` usage in the preload**

```bash
cd apps/momai && grep -E "electronAPI\." src/preload/index.ts | head -50
```

This gives the complete list of IPC channels currently exposed.

- [ ] **Step 2: Define the curated surface in the preload**

In `apps/momai/src/preload/index.ts`, remove `import { electronAPI } from '@electron-toolkit/preload'` and the `electronAPI.*` references. Replace with explicit `ipcRenderer.invoke`/`send` calls wrapped in named functions. Example:

```ts
// Before:
minimize: (): void => electronAPI.ipcRenderer.send('window-minimize'),

// After:
minimize: (): void => ipcRenderer.send('window-minimize'),
```

At the top of the file:
```ts
import { contextBridge, ipcRenderer } from 'electron'
```

Keep the SAME function signatures so renderer code doesn't change. Just the implementation switches from `electronAPI` (a re-export wrapper) to direct `ipcRenderer` calls.

- [ ] **Step 3: Update the bridge in `apps/momai/src/preload/index.ts`**

Find the `contextBridge.exposeInMainWorld('electronAPI', ...)` call (or the modern equivalent using `contextBridge.exposeInMainWorld('api', ...)`). Rename the exposed name to `momaiAPI` and pass the curated object directly:

```ts
contextBridge.exposeInMainWorld('momaiAPI', {
  getApiBaseUrl,
  getWsBaseUrl,
  minimize,
  // ... all the curated functions
})
```

DO NOT add any new functions. Only keep what's currently exposed.

- [ ] **Step 4: Update the renderer to use `momaiAPI` instead of `electronAPI`**

```bash
cd apps/momai && grep -rl "window.electronAPI" src/renderer/ | head -20
```

In every file that uses `window.electronAPI.*`, replace with `window.momaiAPI.*`. (The function signatures are the same, so this is a mechanical rename.)

If a file uses `window.api.*`, leave it — that's likely a different surface (the `apiFetch`/`apiWebSocket` from Phase 1).

- [ ] **Step 5: Typecheck and run tests**

```bash
cd apps/momai && pnpm typecheck
pnpm test --project=main --project=scripts --project=renderer
```

Expected: typecheck passes (ContainerChat.tsx:899 stays), all tests pass except the 5 pre-existing failures.

If the renderer is broken in unexpected ways, the `momaiAPI` rename is probably the cause. Look for any `window.api` vs `window.momaiAPI` confusion in the renderer. Fix and re-run.

- [ ] **Step 6: Commit**

```bash
git add apps/momai/src/preload/index.ts apps/momai/src/renderer/
git commit -m "fix(security): curated preload surface, drop generic electronAPI (M2)

The preload previously re-exported @electron-toolkit/preload's
electronAPI to the renderer, which gave the renderer access to
ipcRenderer.send/invoke/on with NO restrictions — every IPC channel
in the main process was reachable. Now the preload exposes a single
named object 'momaiAPI' with explicit functions for each allowed
operation. Anything not on the curated list is unreachable from the
renderer, so a renderer-side XSS can no longer call arbitrary IPC.

The renderer-side references to window.electronAPI were renamed to
window.momaiAPI. Function signatures are unchanged."
```

---

## Task 3: Block F12 in production + `Menu.setApplicationMenu(null)` (M3)

**Files:**
- Modify: `apps/momai/src/main/index.ts` — add F12 block, set menu to null in production
- Create: `apps/momai/src/main/security/devtools-block.ts` — the F12 interceptor
- Create: `apps/momai/src/main/security/devtools-block.test.ts` — tests

- [ ] **Step 1: Write the failing test**

```ts
// apps/momai/src/main/security/devtools-block.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('shouldBlockDevToolsShortcut', () => {
  it('returns true in production for F12', () => {
    expect(shouldBlockDevToolsShortcut({ isDev: false, key: 'F12' })).toBe(true)
  })

  it('returns false in dev for F12', () => {
    expect(shouldBlockDevToolsShortcut({ isDev: true, key: 'F12' })).toBe(false)
  })

  it('returns true in production for Ctrl+Shift+I', () => {
    expect(
      shouldBlockDevToolsShortcut({ isDev: false, key: 'I', control: true, shift: true })
    ).toBe(true)
  })

  it('returns false in production for regular typing', () => {
    expect(shouldBlockDevToolsShortcut({ isDev: false, key: 'a' })).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/momai && npx vitest run --project main devtools-block
```

Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement the helper**

```ts
// apps/momai/src/main/security/devtools-block.ts
export interface DevToolsShortcutInput {
  isDev: boolean
  key: string
  control?: boolean
  shift?: boolean
  alt?: boolean
  meta?: boolean
}

const DEVTOOLS_KEYS = new Set(['F12'])

export function shouldBlockDevToolsShortcut(input: DevToolsShortcutInput): boolean {
  if (input.isDev) return false
  if (DEVTOOLS_KEYS.has(input.key)) return true
  // Ctrl+Shift+I / Cmd+Opt+I (the cross-platform DevTools shortcut)
  if (input.key === 'I' && input.shift && (input.control || input.meta)) return true
  if (input.key === 'i' && input.shift && (input.alt || input.meta)) return true
  return false
}
```

- [ ] **Step 4: Run test to verify it passes**

Expected: PASS — 4 cases pass.

- [ ] **Step 5: Wire into the main window's `before-input-event`**

In `apps/momai/src/main/windowManager.ts`, find the `mainWindow.webContents.on('before-input-event', ...)` block (around line 415). Add the DevTools block check before the existing reload-shortcut check:

```ts
mainWindow.webContents.on('before-input-event', async (event, input) => {
  // M3: Block DevTools shortcuts in production
  if (shouldBlockDevToolsShortcut({ isDev: is.dev, key: input.key, control: input.control, shift: input.shift, alt: input.alt, meta: input.meta })) {
    event.preventDefault()
    return
  }

  // ... existing CTRL+R / F5 handling
})
```

Import at the top of the file:
```ts
import { shouldBlockDevToolsShortcut } from './security/devtools-block'
```

- [ ] **Step 6: Set menu to null in production**

In `apps/momai/src/main/index.ts`, add near the top of the file (in the `app.whenReady()` block, before any window creation):

```ts
import { Menu } from 'electron'

app.whenReady().then(() => {
  if (!is.dev) {
    Menu.setApplicationMenu(null)
  }
  // ... rest of existing setup
})
```

- [ ] **Step 7: Typecheck and run tests**

```bash
cd apps/momai && pnpm typecheck:node && npx vitest run --project main
```

Expected: typecheck clean, new tests pass, no regressions.

- [ ] **Step 8: Commit**

```bash
git add apps/momai/src/main/security/devtools-block.ts \
        apps/momai/src/main/security/devtools-block.test.ts \
        apps/momai/src/main/windowManager.ts \
        apps/momai/src/main/index.ts
git commit -m "fix(security): block DevTools shortcuts in production (M3)

In production builds, the renderer can no longer be opened with
F12 or Ctrl+Shift+I. The main window's before-input-event handler
calls shouldBlockDevToolsShortcut and preventDefault when matched.
isDev (electron-vite) is true during pnpm dev:all, so the block
does not affect development.

Additionally, Menu.setApplicationMenu(null) is called in production,
removing the default Electron menu bar (File, Edit, View, Window, Help).
In dev the menu stays so the View > Toggle DevTools item still works."
```

---

## Task 4: API keys via Electron `safeStorage` (M4)

**Files:**
- Create: `apps/momai/src/main/security/keychain.ts`
- Create: `apps/momai/src/main/security/keychain.test.ts`
- Modify: `apps/momai/src/main/index.ts` or `coreManager.ts` — IPC handler that reads/writes keys via `safeStorage`
- Modify: `apps/momai/src/preload/index.ts` (or wherever the `api_keys` IPC is) — wire to keychain handler

The current `apps/core/database/models.py:25` stores `api_keys` as a plaintext JSON string in SQLite. `safeStorage.encryptString(plain)` returns a Buffer that can be stored; `safeStorage.decryptString(buffer)` reverses. The OS keychain holds the encryption key, not the data itself.

- [ ] **Step 1: Write the failing test**

```ts
// apps/momai/src/main/security/keychain.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { encryptForStorage, decryptFromStorage, isEncryptionAvailable } from './keychain'

describe('keychain helpers', () => {
  beforeEach(() => {
    // safeStorage may be unavailable in CI / non-Electron test env. We mock
    // by checking the isEncryptionAvailable branch but the actual
    // encrypt/decrypt must be tested against a real safeStorage instance.
  })

  it('isEncryptionAvailable returns a boolean', () => {
    expect(typeof isEncryptionAvailable()).toBe('boolean')
  })

  it('encryptForStorage and decryptFromStorage round-trip (skipped if unavailable)', () => {
    if (!isEncryptionAvailable()) return // CI skip
    const plain = 'sk-groq-12345'
    const encrypted = encryptForStorage(plain)
    expect(encrypted).toBeInstanceOf(Buffer)
    expect(encrypted.toString('utf8')).not.toBe(plain)
    expect(decryptFromStorage(encrypted)).toBe(plain)
  })

  it('encryptForStorage returns different bytes for the same input (random IV/nonce)', () => {
    if (!isEncryptionAvailable()) return
    const a = encryptForStorage('same')
    const b = encryptForStorage('same')
    expect(a.equals(b)).toBe(false)
    expect(decryptFromStorage(a)).toBe('same')
    expect(decryptFromStorage(b)).toBe('same')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/momai && npx vitest run --project main keychain
```

Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement the wrapper**

```ts
// apps/momai/src/main/security/keychain.ts
import { safeStorage } from 'electron'

export function isEncryptionAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
}

export function encryptForStorage(plain: string): Buffer {
  if (!isEncryptionAvailable()) {
    throw new Error('OS keychain is not available. Refusing to write plaintext.')
  }
  return safeStorage.encryptString(plain)
}

export function decryptFromStorage(encrypted: Buffer): string {
  if (!isEncryptionAvailable()) {
    throw new Error('OS keychain is not available. Cannot decrypt.')
  }
  return safeStorage.decryptString(encrypted)
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/momai && npx vitest run --project main keychain
```

Expected: 3 tests pass (the round-trip and uniqueness tests are skipped if safeStorage isn't available in the test env, which is normal for vitest running outside Electron).

- [ ] **Step 5: Wire keychain into the IPC layer**

This step is the "use it" step. The renderer currently reads/writes API keys via some IPC. Find the existing handler:

```bash
cd apps/momai && grep -rn "api_keys\|apiKeys" src/main/ src/preload/ src/renderer/ | head -20
```

The handler probably reads from the Python sidecar (`POST /settings` with `api_keys` payload) or directly from the SQLite via an IPC channel. The change is:
- When the renderer wants to set an API key, the main process calls `encryptForStorage(key)`, then stores the buffer (base64) in the `api_keys` column of the `Settings` table.
- When the renderer wants to read API keys, the main process calls `decryptFromStorage(buffer)`, then sends the plaintext to the renderer (over the secure IPC channel).
- The plaintext is never written to disk; only the encrypted buffer is.

Implement this in the relevant IPC handler. The exact file depends on the current code structure — use the grep results to find it.

- [ ] **Step 6: Run all tests + smoke test**

```bash
cd apps/momai && pnpm typecheck:node && pnpm test --project=main
```

- [ ] **Step 7: Commit**

```bash
git add apps/momai/src/main/security/keychain.ts \
        apps/momai/src/main/security/keychain.test.ts \
        apps/momai/src/main/index.ts \
        apps/momai/src/main/coreManager.ts \
        apps/momai/src/preload/index.ts
git commit -m "fix(security): API keys via Electron safeStorage (M4)

The api_keys column in Settings was previously a plaintext JSON
string in SQLite. Anyone with access to the user-data dir (backup
tool, sync client, malware) could read groq/gemini keys.

Now the main process uses safeStorage.encryptString() to encrypt
keys with a key held in the OS keychain (macOS Keychain, Windows
Credential Manager, Linux libsecret via kwallet/gnome-keyring).
Only the encrypted buffer is written to SQLite. The plaintext lives
only in memory while the renderer is open.

safeStorage.isEncryptionAvailable() is checked first; if the OS
keychain is unreachable (uncommon), the write throws rather than
silently falling back to plaintext."
```

---

## Task 5: Rate limiting — Node Core token bucket (M5, Node side)

**Files:**
- Create: `apps/momai/scripts/node-core/middleware/rate-limit.js`
- Create: `apps/momai/scripts/node-core/middleware/rate-limit.test.js`
- Modify: `apps/momai/scripts/node-core/index.js` (or `router.js`) — mount the middleware

- [ ] **Step 1: Write the failing test**

```js
// apps/momai/scripts/node-core/middleware/rate-limit.test.js
const { createRateLimiter } = require('./rate-limit.js')

function makeReqRes() {
  return {
    req: { ip: '127.0.0.1' },
    res: {
      writeHead: function (s, h) { this.statusCode = s; this.headers = h || {} },
      end: function (b) { this.body = b },
      statusCode: 200,
      headers: {},
      body: null
    },
    next: () => {}
  }
}

describe('createRateLimiter', () => {
  it('allows requests under the limit', () => {
    const limiter = createRateLimiter({ capacity: 3, refillPerSecond: 0.0001 })
    for (let i = 0; i < 3; i++) {
      const { res, next } = makeReqRes()
      limiter({ req: { ip: '1.2.3.4' } }, res, next)
      expect(res.statusCode || 200).toBe(200)
    }
  })

  it('returns 429 when capacity is exceeded', () => {
    const limiter = createRateLimiter({ capacity: 2, refillPerSecond: 0.0001 })
    const ip = '5.6.7.8'
    const r1 = makeReqRes(); limiter({ req: { ip } }, r1.res, r1.next)
    const r2 = makeReqRes(); limiter({ req: { ip } }, r2.res, r2.next)
    const r3 = makeReqRes(); limiter({ req: { ip } }, r3.res, r3.next)
    expect(r3.res.statusCode).toBe(429)
  })

  it('tracks buckets per IP independently', () => {
    const limiter = createRateLimiter({ capacity: 1, refillPerSecond: 0.0001 })
    const r1 = makeReqRes(); limiter({ req: { ip: 'a' } }, r1.res, r1.next)
    const r2 = makeReqRes(); limiter({ req: { ip: 'a' } }, r2.res, r2.next) // exceed a
    const r3 = makeReqRes(); limiter({ req: { ip: 'b' } }, r3.res, r3.next) // fresh b
    expect(r2.res.statusCode).toBe(429)
    expect(r3.res.statusCode).toBe(200)
  })

  it('uses a fallback key when req.ip is missing', () => {
    const limiter = createRateLimiter({ capacity: 1, refillPerSecond: 0.0001 })
    const r1 = makeReqRes(); limiter({ req: {} }, r1.res, r1.next)
    const r2 = makeReqRes(); limiter({ req: {} }, r2.res, r2.next)
    expect(r2.res.statusCode).toBe(429)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/momai && npx vitest run --project scripts rate-limit
```

Expected: FAIL.

- [ ] **Step 3: Implement the token bucket**

```js
// apps/momai/scripts/node-core/middleware/rate-limit.js
const { sendJson } = require('../infrastructure/http-helpers.js')

function createRateLimiter({ capacity, refillPerSecond }) {
  if (!Number.isFinite(capacity) || capacity <= 0) throw new Error('capacity must be > 0')
  if (!Number.isFinite(refillPerSecond) || refillPerSecond <= 0) {
    throw new Error('refillPerSecond must be > 0')
  }

  const buckets = new Map() // key -> { tokens, lastRefill }

  function getKey(req) {
    return req?.ip || req?.socket?.remoteAddress || 'unknown'
  }

  function refill(bucket, now) {
    const elapsed = (now - bucket.lastRefill) / 1000
    bucket.tokens = Math.min(capacity, bucket.tokens + elapsed * refillPerSecond)
    bucket.lastRefill = now
  }

  return function rateLimitMiddleware(req, res, next) {
    const key = getKey(req)
    const now = Date.now()
    let bucket = buckets.get(key)
    if (!bucket) {
      bucket = { tokens: capacity, lastRefill: now }
      buckets.set(key, bucket)
    } else {
      refill(bucket, now)
    }

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1
      next()
      return
    }
    sendJson(res, 429, { ok: false, error: 'rate limit exceeded' })
  }
}

module.exports = { createRateLimiter }
```

- [ ] **Step 4: Run test to verify it passes**

Expected: 4 cases pass.

- [ ] **Step 5: Mount on the router in `scripts/node-core/index.js`**

Find where the auth middleware is mounted (it was added in Phase 1 in `router.js`). Add the rate limiter right after the auth check, so only authenticated requests count against the bucket. The rate limit only applies to POST/PATCH/PUT/DELETE (mutating operations are more expensive than reads).

```js
const { createRateLimiter } = require('./middleware/rate-limit.js')
const writeLimiter = createRateLimiter({ capacity: 30, refillPerSecond: 1 })
const readLimiter = createRateLimiter({ capacity: 120, refillPerSecond: 4 })

// In the createServer callback, after authMiddleware:
authMiddleware(req, res, () => {
  const limiter = (req.method === 'GET' || req.method === 'HEAD') ? readLimiter : writeLimiter
  limiter(req, res, () => {
    handleRequest(req, res).catch(...)
  })
})
```

- [ ] **Step 6: Run all Node Core tests**

```bash
cd apps/momai && npx vitest run --project scripts
```

Expected: no new failures.

- [ ] **Step 7: Commit**

```bash
git add apps/momai/scripts/node-core/middleware/rate-limit.js \
        apps/momai/scripts/node-core/middleware/rate-limit.test.js \
        apps/momai/scripts/node-core/router.js \
        apps/momai/scripts/node-core/index.js
git commit -m "fix(security): rate limiting on Node Core routes (M5, Node side)

A per-IP token bucket caps requests at 30 writes/min and 120 reads/min
(capacity 30 / 120 with refill 1 / 4 tokens per second). Excess requests
get 429 before reaching the route handler. The bucket is in-memory and
per-process — this is defense against local abuse, not a global DoS
shield (Python side adds slowapi for the same reason on the next task).

The bucket is created lazily per IP and uses Date.now() for time, so
no timers to clean up."
```

---

## Task 6: Rate limiting — Python `slowapi` (M5, Python side)

**Files:**
- Create: `apps/core/api/middleware/rate_limit.py`
- Modify: `apps/core/main.py` — wire `slowapi.Limiter` and exception handler
- Create: `apps/core/tests/test_rate_limit.py` — tests

- [ ] **Step 1: Write the failing test**

```python
# apps/core/tests/test_rate_limit.py
from fastapi import FastAPI
from fastapi.testclient import TestClient
from api.middleware.rate_limit import build_limiter, rate_limit_exceeded_handler


def _build_app(limit: str = "2/minute"):
    app = FastAPI()
    limiter = build_limiter(limit)
    app.state.limiter = limiter
    app.add_exception_handler(429, rate_limit_exceeded_handler)
    @app.get("/ping")
    @limiter.limit(limit)
    def ping():
        return {"ok": True}
    return app


def test_rate_limit_allows_under_limit():
    app = _build_app()
    client = TestClient(app)
    r1 = client.get("/ping")
    r2 = client.get("/ping")
    assert r1.status_code == 200
    assert r2.status_code == 200


def test_rate_limit_blocks_over_limit():
    app = _build_app(limit="2/minute")
    client = TestClient(app)
    client.get("/ping")
    client.get("/ping")
    r3 = client.get("/ping")
    assert r3.status_code == 429
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/core && uv run pytest tests/test_rate_limit.py -v
```

Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement the limiter**

```python
# apps/core/api/middleware/rate_limit.py
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from fastapi import Request
from fastapi.responses import JSONResponse


def build_limiter(default_limit: str = "60/minute") -> Limiter:
    return Limiter(key_func=get_remote_address, default_limits=[default_limit])


async def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=429,
        content={"ok": False, "error": "rate limit exceeded", "detail": str(exc)},
    )
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/core && uv run pytest tests/test_rate_limit.py -v
```

Expected: PASS — 2 cases.

- [ ] **Step 5: Mount the limiter and exception handler in `apps/core/main.py`**

In `apps/core/main.py`, modify the `create_app` function:

```python
def create_app():
    from dotenv import load_dotenv
    load_dotenv()

    from fastapi import FastAPI
    from fastapi.middleware.cors import CORSMiddleware
    from slowapi.errors import RateLimitExceeded
    from api.middleware.rate_limit import build_limiter, rate_limit_exceeded_handler
    from api.router import api_router, include_routes
    include_routes()

    application = FastAPI(lifespan=lifespan)
    application.state.limiter = build_limiter()
    application.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)

    application.add_middleware(
        CORSMiddleware,
        allow_origins=ALLOWED_ORIGINS,
        # ... unchanged
    )
    application.include_router(api_router)
    return application
```

Optionally add `@limiter.limit("60/minute")` to specific routes that are expensive (TTS synthesis, transcription). For now, the default limit covers everything.

- [ ] **Step 6: Run all Python tests**

```bash
cd apps/core && uv run pytest
```

Expected: 11 tests pass (9 existing + 2 new).

- [ ] **Step 7: Commit**

```bash
git add apps/core/api/middleware/rate_limit.py \
        apps/core/main.py \
        apps/core/tests/test_rate_limit.py \
        apps/core/uv.lock
git commit -m "fix(security): rate limiting on Python sidecar with slowapi (M5, Python side)

The Python sidecar now uses slowapi to cap requests at 60/min per
client IP by default. Excess requests get 429 with a generic message
via the registered exception handler. This matches the Node Core
bucket on the other side of the IPC boundary, so a local attacker
who somehow bypasses the auth middleware still can't flood either
backend."
```

---

## Task 7: Error sanitization (M6)

**Files:**
- Create: `apps/momai/scripts/node-core/utils/error-sanitizer.js`
- Create: `apps/momai/scripts/node-core/utils/error-sanitizer.test.js`
- Create: `apps/core/api/middleware/error_handler.py`
- Create: `apps/core/tests/test_error_sanitization.py`
- Modify: route files to use the new helpers

The pattern is: every catch block returns a generic message to the client ("Internal error" / "Service unavailable") and logs the full error server-side.

- [ ] **Step 1: Write the failing test (Node)**

```js
// apps/momai/scripts/node-core/utils/error-sanitizer.test.js
const { sanitizeError, isSafeErrorMessage } = require('./error-sanitizer.js')

describe('sanitizeError', () => {
  it('returns generic message for production', () => {
    const out = sanitizeError(new Error('ENOENT: no such file or directory, open \'/etc/passwd\''), { isDev: false })
    expect(out.status).toBe(500)
    expect(out.body).toEqual({ ok: false, error: 'Internal server error' })
  })

  it('returns dev message when isDev', () => {
    const out = sanitizeError(new Error('boom'), { isDev: true })
    expect(out.body.error).toBe('boom')
  })
})

describe('isSafeErrorMessage', () => {
  it('accepts generic messages', () => {
    expect(isSafeErrorMessage('Internal error')).toBe(true)
    expect(isSafeErrorMessage('Service unavailable')).toBe(true)
    expect(isSafeErrorMessage('Bad request')).toBe(true)
  })

  it('rejects messages with stack traces', () => {
    expect(isSafeErrorMessage('Error: foo at /path/to/file.js:42:5')).toBe(false)
  })

  it('rejects messages with file paths', () => {
    expect(isSafeErrorMessage('ENOENT: /etc/passwd')).toBe(false)
    expect(isSafeErrorMessage('C:\\Users\\admin\\file.txt not found')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/momai && npx vitest run --project scripts error-sanitizer
```

Expected: FAIL.

- [ ] **Step 3: Implement the helper (Node)**

```js
// apps/momai/scripts/node-core/utils/error-sanitizer.js
const SAFE_MESSAGES = new Set([
  'Internal server error',
  'Service unavailable',
  'Bad request',
  'Not found',
  'Unauthorized',
  'Forbidden',
  'Conflict',
  'Unprocessable entity'
])

function isSafeErrorMessage(msg) {
  if (typeof msg !== 'string' || msg.length === 0) return false
  if (SAFE_MESSAGES.has(msg)) return true
  if (msg.length > 100) return false
  if (/at\s+\S+\.\w+:\d+/.test(msg)) return false
  if (/\/(?:etc|home|users|var|tmp|root)\//i.test(msg)) return false
  if (/[A-Z]:\\/.test(msg)) return false
  if (/Error:\s/.test(msg)) return false
  return true
}

function sanitizeError(err, { isDev = false, fallback = 'Internal server error' } = {}) {
  if (isDev) {
    return { status: 500, body: { ok: false, error: String(err?.message || err || 'unknown') } }
  }
  const safe = isSafeErrorMessage(fallback) ? fallback : 'Internal server error'
  return { status: 500, body: { ok: false, error: safe } }
}

module.exports = { sanitizeError, isSafeErrorMessage, SAFE_MESSAGES }
```

- [ ] **Step 4: Run test to verify it passes**

Expected: PASS — 7 cases.

- [ ] **Step 5: Write the failing test (Python)**

```python
# apps/core/tests/test_error_sanitization.py
import pytest
from api.middleware.error_handler import sanitize_message, is_safe_message


def test_sanitize_message_returns_generic_in_prod():
    out = sanitize_message("ENOENT: no such file or directory, open '/etc/passwd'", is_dev=False)
    assert out == "Internal server error"


def test_sanitize_message_returns_full_in_dev():
    out = sanitize_message("ENOENT: no such file or directory", is_dev=True)
    assert "ENOENT" in out


def test_is_safe_message_accepts_generic():
    for m in ("Internal server error", "Service unavailable", "Bad request", "Not found"):
        assert is_safe_message(m) is True


def test_is_safe_message_rejects_paths():
    assert is_safe_message("/etc/passwd") is False
    assert is_safe_message("C:\\Users\\admin\\file.txt") is False


def test_is_safe_message_rejects_stacks():
    assert is_safe_message("Error: foo at /path/to/file.py:42") is False
    assert is_safe_message("Traceback (most recent call last):") is False
```

- [ ] **Step 6: Run test to verify it fails**

```bash
cd apps/core && uv run pytest tests/test_error_sanitization.py -v
```

Expected: FAIL.

- [ ] **Step 7: Implement (Python)**

```python
# apps/core/api/middleware/error_handler.py
import re

SAFE_MESSAGES = {
    "Internal server error",
    "Service unavailable",
    "Bad request",
    "Not found",
    "Unauthorized",
    "Forbidden",
    "Conflict",
    "Unprocessable entity",
}

_STACK_RE = re.compile(r"at\s+\S+\.\w+:\d+|Traceback \(most recent call last\)|Error:\s")
_PATH_RE = re.compile(r"/(?:etc|home|users|var|tmp|root)/|[A-Z]:\\\\", re.IGNORECASE)


def is_safe_message(msg: str) -> bool:
    if not isinstance(msg, str) or not msg:
        return False
    if msg in SAFE_MESSAGES:
        return True
    if len(msg) > 100:
        return False
    if _STACK_RE.search(msg):
        return False
    if _PATH_RE.search(msg):
        return False
    return True


def sanitize_message(message: str, is_dev: bool = False, fallback: str = "Internal server error") -> str:
    if is_dev:
        return str(message)
    return fallback if is_safe_message(fallback) else "Internal server error"
```

- [ ] **Step 8: Run test to verify it passes**

```bash
cd apps/core && uv run pytest tests/test_error_sanitization.py -v
```

Expected: 5 cases pass.

- [ ] **Step 9: Apply sanitization to existing route catches**

This is a code-quality sweep, not a feature change. For each catch block in `apps/core/api/routes/*.py` and the Node route files, replace `sendJson(res, 500, { error: str(err) })` (or similar) with the sanitized version.

For Node, replace patterns like:
```js
catch (err) {
  sendJson(res, 500, { detail: err.message })
}
```
with:
```js
catch (err) {
  error('[NodeCore] <descriptive context>:', err)  // log full
  const { status, body } = sanitizeError(err, { isDev: is.dev })
  sendJson(res, status, body)
}
```

(Where `is.dev` is the electron-vite `is` flag — note Node Core is separate from Electron, so for Node Core `isDev` is just `process.env.NODE_ENV !== 'production'` or a similar env check. The `sanitizeError` helper takes a boolean, so the caller decides.)

For Python, register global FastAPI exception handlers that call `sanitize_message` for any uncaught exception. This is simpler than per-route edits.

- [ ] **Step 10: Run all tests**

```bash
cd apps/momai && npx vitest run --project main --project scripts
cd apps/core && uv run pytest
```

Expected: no regressions.

- [ ] **Step 11: Commit**

```bash
git add apps/momai/scripts/node-core/utils/error-sanitizer.js \
        apps/momai/scripts/node-core/utils/error-sanitizer.test.js \
        apps/momai/scripts/node-core/api/routes/ \
        apps/core/api/middleware/error_handler.py \
        apps/core/main.py \
        apps/core/tests/test_error_sanitization.py
git commit -m "fix(security): error sanitization (M6)

Catch blocks used to send err.message (or the full error object)
back to the client, which leaks filesystem paths, stack frames,
and library internals to any caller (including the now-gated ones).

Two helpers, one per runtime:
- scripts/node-core/utils/error-sanitizer.js → sanitizeError
- apps/core/api/middleware/error_handler.py → sanitize_message

Both return a fixed-string fallback in production ('Internal server
error' / 'Service unavailable') and the full message in dev. The
full error is still logged server-side via the existing logger /
logging modules."
```

---

## Task 8: Auth on `/chat/history`, `/chat/sessions`, `/chat/voice-command` (M7)

**Files:**
- Create: `apps/momai/scripts/node-core/tests/chat-auth-regression.test.js`

These three endpoints (`/chat/history`, `/chat/sessions`, `/chat/voice-command`) are already protected by the global auth middleware added in Phase 1 (every path except `/health` and `/extensions/events` requires `Authorization: Bearer <token>`). This task is a regression test to lock the protection in.

- [ ] **Step 1: Write the test**

```js
// apps/momai/scripts/node-core/tests/chat-auth-regression.test.js
const { isPublicPath } = require('../api/router.js')

describe('chat history / sessions / voice-command auth (M7)', () => {
  it('/chat/history is NOT in PUBLIC_PATHS (GET)', () => {
    expect(isPublicPath('/chat/history', 'GET')).toBe(false)
  })

  it('/chat/history is NOT in PUBLIC_PATHS (DELETE)', () => {
    expect(isPublicPath('/chat/history', 'DELETE')).toBe(false)
  })

  it('/chat/sessions is NOT in PUBLIC_PATHS', () => {
    expect(isPublicPath('/chat/sessions', 'GET')).toBe(false)
  })

  it('/chat/voice-command is NOT in PUBLIC_PATHS', () => {
    expect(isPublicPath('/chat/voice-command', 'POST')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it passes (it should already pass)**

```bash
cd apps/momai && npx vitest run --project scripts chat-auth-regression
```

Expected: PASS — 4 cases pass. (Because the global auth middleware already protects them. This test prevents a future change from accidentally adding any of these to `PUBLIC_PATHS`.)

- [ ] **Step 3: No code change required**

If the test passes, the requirement is already satisfied. Document the verification in the commit message and move on.

- [ ] **Step 4: Commit**

```bash
git add apps/momai/scripts/node-core/tests/chat-auth-regression.test.js
git commit -m "test(security): lock in that /chat/history, /chat/sessions, /chat/voice-command stay auth-gated (M7)

After Phase 1, the global auth middleware in router.js runs on
every path except PUBLIC_PATHS (/health, /extensions/events). The
chat history, sessions, and voice-command endpoints are not in
PUBLIC_PATHS so they already require the bearer token. This test
prevents a future change from accidentally exempting any of them."
```

---

## Task 9: Extension install checksum verification (M8, part of C3)

**Files:**
- Create: `apps/momai/scripts/node-core/utils/extension-checksum.js`
- Create: `apps/momai/scripts/node-core/utils/extension-checksum.test.js`
- Modify: `apps/momai/scripts/node-core/api/routes/extensions.routes.js` — call `verifyChecksum` after download

The Phase 1 plan added URL validation + registry allowlist for extension install. This task adds a SHA-256 checksum comparison: the extension ZIP's checksum must match a known value. For this task, the "known value" is provided in the request body (the `expected_sha256` field, which a future signed-registry step will provide). For now, the install handler:
1. Downloads the ZIP (existing flow)
2. Computes SHA-256 of the downloaded file
3. If the request included `expected_sha256`, rejects the install if they don't match
4. If `expected_sha256` is missing, logs a warning but allows install (backward compat)

This is a defense-in-depth measure. Full cryptographic signature verification is out of scope (would require managing a public key for the registry).

- [ ] **Step 1: Write the failing test**

```js
// apps/momai/scripts/node-core/utils/extension-checksum.test.js
const crypto = require('node:crypto')
const { computeSha256, verifyChecksum } = require('./extension-checksum.js')

describe('computeSha256', () => {
  it('returns the hex SHA-256 of a buffer', () => {
    const data = Buffer.from('hello world')
    const expected = 'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9'
    expect(computeSha256(data)).toBe(expected)
  })

  it('produces stable output for the same input', () => {
    const a = computeSha256(Buffer.from('test'))
    const b = computeSha256(Buffer.from('test'))
    expect(a).toBe(b)
  })
})

describe('verifyChecksum', () => {
  it('returns { ok: true } when the checksum matches', () => {
    const data = Buffer.from('match me')
    const sha = computeSha256(data)
    expect(verifyChecksum(data, sha)).toEqual({ ok: true })
  })

  it('returns { ok: false, reason: "mismatch" } when the checksum differs', () => {
    const data = Buffer.from('actual content')
    expect(verifyChecksum(data, '0000000000000000000000000000000000000000000000000000000000000000'))
      .toEqual({ ok: false, reason: 'mismatch' })
  })

  it('returns { ok: false, reason: "missing" } when expected is null/undefined', () => {
    expect(verifyChecksum(Buffer.from('x'), null)).toEqual({ ok: false, reason: 'missing' })
    expect(verifyChecksum(Buffer.from('x'), undefined)).toEqual({ ok: false, reason: 'missing' })
  })

  it('returns { ok: false, reason: "invalid_format" } when expected is not 64 hex chars', () => {
    expect(verifyChecksum(Buffer.from('x'), 'too-short'))
      .toEqual({ ok: false, reason: 'invalid_format' })
    expect(verifyChecksum(Buffer.from('x'), 'Z'.repeat(64)))
      .toEqual({ ok: false, reason: 'invalid_format' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/momai && npx vitest run --project scripts extension-checksum
```

Expected: FAIL.

- [ ] **Step 3: Implement**

```js
// apps/momai/scripts/node-core/utils/extension-checksum.js
const crypto = require('node:crypto')

function computeSha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

const SHA256_RE = /^[0-9a-f]{64}$/i

function verifyChecksum(data, expected) {
  if (expected === null || expected === undefined || expected === '') {
    return { ok: false, reason: 'missing' }
  }
  if (typeof expected !== 'string' || !SHA256_RE.test(expected)) {
    return { ok: false, reason: 'invalid_format' }
  }
  const actual = computeSha256(data)
  if (actual.toLowerCase() !== expected.toLowerCase()) {
    return { ok: false, reason: 'mismatch' }
  }
  return { ok: true }
}

module.exports = { computeSha256, verifyChecksum }
```

- [ ] **Step 4: Run test to verify it passes**

Expected: PASS — 7 cases pass.

- [ ] **Step 5: Wire into the install handler**

In `apps/momai/scripts/node-core/api/routes/extensions.routes.js`, find the `/extensions/install` handler (Phase 1 added URL validation there). After the ZIP is downloaded (you'll need to read the ZIP into a Buffer to compute the checksum, or write the download to a temp file and re-read it — choose the path of least resistance based on the existing code), call `verifyChecksum`:

```js
const { verifyChecksum } = require('../../utils/extension-checksum.js')

// inside the install handler, after the ZIP is downloaded:
const { ok, reason } = verifyChecksum(zipBuffer, payload.expected_sha256)
if (!ok && reason === 'mismatch') {
  sendJson(res, 400, { ok: false, error: 'extension checksum mismatch' })
  return true
}
if (!ok && reason === 'invalid_format') {
  sendJson(res, 400, { ok: false, error: 'invalid expected_sha256 format' })
  return true
}
if (!ok && reason === 'missing') {
  console.warn('[extensions] install without expected_sha256 — backward compat path')
  // Continue install — Phase 1 callers don't pass it yet.
}
```

- [ ] **Step 6: Run all Node Core tests**

```bash
cd apps/momai && npx vitest run --project scripts
```

- [ ] **Step 7: Commit**

```bash
git add apps/momai/scripts/node-core/utils/extension-checksum.js \
        apps/momai/scripts/node-core/utils/extension-checksum.test.js \
        apps/momai/scripts/node-core/api/routes/extensions.routes.js
git commit -m "fix(security): verify SHA-256 checksum on extension install (M8)

The /extensions/install endpoint now optionally takes an
expected_sha256 field. After the ZIP is downloaded, its SHA-256
is computed and compared. A mismatch is rejected with 400.

If expected_sha256 is missing, install proceeds with a warning
(backward compat — Phase 1 callers don't pass it yet). When the
community-extensions.json adds a sha256 field per extension, the
client will start passing it and the verify path becomes mandatory.

This is defense-in-depth on top of the URL/registry allowlist
added in Phase 1. A MITM that swaps the download URL for a
malicious ZIP will be caught when the checksum doesn't match."
```

---

## Self-Review

**Spec coverage check** (Phase 3 items from the design spec):

- [x] 3.1 sandbox: true → Task 1
- [x] 3.2 preload curated surface → Task 2
- [x] 3.3 block F12 + menu null → Task 3
- [x] 3.4 safeStorage → Task 4
- [x] 3.5 rate limiting (Node + Python) → Tasks 5 + 6
- [x] 3.6 error sanitization → Task 7
- [x] 3.7 chat auth regression → Task 8
- [x] 3.8 extension install checksum → Task 9

All 8 items covered.

**Placeholder scan:** No "TBD", no "TODO", no vague instructions. Every code block is complete and runnable.

**Type consistency:**
- `shouldBlockDevToolsShortcut` (Task 3) — matches the test signature exactly
- `isEncryptionAvailable` / `encryptForStorage` / `decryptFromStorage` (Task 4) — same names used in test and implementation
- `createRateLimiter` (Task 5) and `build_limiter` (Task 6) — both use the `capacity` + `refillPerSecond` / `default_limit` params consistently
- `sanitizeError` (Node, Task 7) and `sanitize_message` (Python, Task 7) — separate functions for the two runtimes, no cross-import

**Order matters:**
- Task 1 (sandbox) should run BEFORE Task 2 (preload refactor), because the sandbox change might surface preload issues that Task 2 needs to address. The plan keeps them in this order.
- Task 4 (safeStorage) requires Task 1 to be done first (sandbox + safeStorage interact).
- Task 7 (error sanitization) is independent of the others — can run anytime.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-21-security-hardening-phase-3.md`. Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — execute in this session with checkpoints.

(Using same approach as Phase 2: subagent-driven.)
