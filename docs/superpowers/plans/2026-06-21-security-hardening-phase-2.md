# Security Hardening - Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Address the 9 remaining HIGH-severity issues from the security audit: WebSocket authentication, settings allowlist, `/internal/shutdown` auth check, `shell.openExternal` URL validation, extension host security (require interception + minimal env), and dependency updates (1 CRITICAL `shell-quote` advisory + 1 HIGH `vite` advisory + axios/ws/form-data overrides + 20 Python CVEs).

**Architecture:** Reuse the Phase 1 session-token pattern. WebSocket upgrades validate `?token=<token>` in the URL query string (since browsers cannot send custom headers on `WebSocket()`). `PATCH /settings` becomes a strict allowlist: only known keys can be modified, anything else is silently dropped. `shell.openExternal` validates the protocol (`http:`, `https:`, `mailto:`) before opening. Extension workers run with a minimal env (only `PATH`, `NODE_PATH`, `LANG`, `MOMAI_DATA_DIR`, `MOMAI_EXTENSION_ID`, `MOMAI_SESSION_TOKEN`) and intercept `require()` calls so extensions can only import explicitly allowed modules. Dependency updates are surgical — bump the affected packages, run `pnpm install` / `uv lock --upgrade`, verify nothing breaks.

**Tech Stack:** TypeScript, Node.js, Python/FastAPI, Electron 42, vitest, pytest, pnpm overrides, uv.

**Reference spec:** `docs/superpowers/specs/2026-06-21-security-hardening-design.md` (Phase 2 section)
**Reference audit:** `auditorias/auditoria-seguranca-2026-06-21.md` (H1–H9)
**Reference remaining work:** `docs/superpowers/specs/2026-06-21-security-hardening-remaining-work.md`

---

## File Structure

**New files (Phase 2):**
- `apps/momai/scripts/node-core/middleware/ws-auth.js` — WebSocket token validator (shared logic)
- `apps/momai/scripts/node-core/middleware/ws-auth.test.js` — tests
- `apps/momai/scripts/node-core/config/settings-allowlist.js` — list of editable settings keys
- `apps/momai/scripts/node-core/config/settings-allowlist.test.js` — tests
- `apps/momai/scripts/node-core/config/safe-external-urls.js` — protocol allowlist + URL validator
- `apps/momai/scripts/node-core/config/safe-external-urls.test.js` — tests
- `apps/momai/src/main/security/safe-external-url.ts` — main-process mirror of the same allowlist
- `apps/momai/src/main/security/safe-external-url.test.ts` — tests
- `apps/momai/scripts/node-core/config/extension-allowlist.js` — modules extensions may `require()`
- `apps/momai/scripts/node-core/config/extension-allowlist.test.js` — tests
- `apps/core/tests/test_ws_auth.py` — Python WebSocket auth tests

**Modified files:**
- `apps/momai/scripts/node-core/api/websocket.js` — validate token on upgrade
- `apps/core/api/routes/voice.py` — validate token before accept
- `apps/momai/scripts/node-core/api/routes/settings.routes.js` — apply allowlist on PATCH
- `apps/momai/scripts/node-core/services/extension-host-manager.js` — minimal env on fork
- `apps/momai/scripts/node-core/services/extension-host-worker.js` — `require` interceptor
- `apps/momai/src/main/windowManager.ts` — use safe URL validator before `shell.openExternal`
- `package.json` — bump `concurrently`, `vite`, add `pnpm.overrides` for axios/ws/form-data
- `apps/momai/package.json` — bump `vite`
- `apps/landing-page/package.json` — bump `vite`
- `apps/core/uv.lock` — refreshed by `uv lock --upgrade`

**Test estimate:** ~15 new tests (1 task may have multiple test cases).

---

## Task 1: WebSocket auth in Node Core (H1)

**Files:**
- Create: `apps/momai/scripts/node-core/middleware/ws-auth.js`
- Create: `apps/momai/scripts/node-core/middleware/ws-auth.test.js`
- Modify: `apps/momai/scripts/node-core/api/websocket.js:140-150`

- [ ] **Step 1: Write the failing test**

```js
// apps/momai/scripts/node-core/middleware/ws-auth.test.js
const { extractWsToken, isValidWsUpgrade } = require('./ws-auth.js')

describe('extractWsToken', () => {
  it('returns the token from ?token=... query', () => {
    const url = new URL('/ws?token=abc123', 'http://localhost')
    expect(extractWsToken(url)).toBe('abc123')
  })

  it('returns null when no token is present', () => {
    const url = new URL('/ws', 'http://localhost')
    expect(extractWsToken(url)).toBeNull()
  })

  it('returns null when token is empty', () => {
    const url = new URL('/ws?token=', 'http://localhost')
    expect(extractWsToken(url)).toBeNull()
  })
})

describe('isValidWsUpgrade', () => {
  const originalToken = process.env.MOMAI_SESSION_TOKEN

  beforeEach(() => { process.env.MOMAI_SESSION_TOKEN = 'tok-xyz' })
  afterEach(() => {
    if (originalToken === undefined) delete process.env.MOMAI_SESSION_TOKEN
    else process.env.MOMAI_SESSION_TOKEN = originalToken
  })

  it('returns true when query token matches MOMAI_SESSION_TOKEN', () => {
    const url = new URL('/ws?token=tok-xyz', 'http://localhost')
    expect(isValidWsUpgrade(url)).toBe(true)
  })

  it('returns false when query token is wrong', () => {
    const url = new URL('/ws?token=other', 'http://localhost')
    expect(isValidWsUpgrade(url)).toBe(false)
  })

  it('returns false when token is missing', () => {
    const url = new URL('/ws', 'http://localhost')
    expect(isValidWsUpgrade(url)).toBe(false)
  })

  it('returns false when MOMAI_SESSION_TOKEN is not set (server misconfigured)', () => {
    delete process.env.MOMAI_SESSION_TOKEN
    const url = new URL('/ws?token=anything', 'http://localhost')
    expect(isValidWsUpgrade(url)).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/momai && pnpm test --project=scripts -- --run ws-auth
```

Expected: FAIL — module `./ws-auth.js` does not exist.

- [ ] **Step 3: Implement the module**

```js
// apps/momai/scripts/node-core/middleware/ws-auth.js
function extractWsToken(url) {
  const token = url.searchParams.get('token')
  if (!token || token.length === 0) return null
  return token
}

function isValidWsUpgrade(url) {
  const expected = process.env.MOMAI_SESSION_TOKEN
  if (!expected) return false
  const provided = extractWsToken(url)
  if (!provided) return false
  return provided === expected
}

module.exports = { extractWsToken, isValidWsUpgrade }
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/momai && pnpm test --project=scripts -- --run ws-auth
```

Expected: PASS — 7 cases pass.

- [ ] **Step 5: Wire into the upgrade handler in `api/websocket.js`**

In `apps/momai/scripts/node-core/api/websocket.js` around line 140, change:

```js
server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url || '/', `http://${HOST}:${PORT}`)
  if (url.pathname !== '/ws') {
    socket.destroy()
    return
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req)
  })
})
```

to:

```js
const { isValidWsUpgrade } = require('../middleware/ws-auth.js')

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url || '/', `http://${HOST}:${PORT}`)
  if (url.pathname !== '/ws') {
    socket.destroy()
    return
  }
  if (!isValidWsUpgrade(url)) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
    socket.destroy()
    return
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req)
  })
})
```

- [ ] **Step 6: Run full Node Core test suite**

```bash
cd apps/momai && pnpm test --project=scripts
```

Expected: no new failures (pre-existing keyword-router.test.js failures are OK).

- [ ] **Step 7: Commit**

```bash
git add apps/momai/scripts/node-core/middleware/ws-auth.js \
        apps/momai/scripts/node-core/middleware/ws-auth.test.js \
        apps/momai/scripts/node-core/api/websocket.js
git commit -m "fix(security): validate session token on WebSocket upgrade (H1)

Browsers cannot send custom headers on WebSocket, so the renderer
already passes the token via ?token=<token> in the URL. Node Core
was accepting upgrades without checking it. Now the upgrade handler
calls isValidWsUpgrade() and rejects with 401 if the token is
missing, empty, or does not match MOMAI_SESSION_TOKEN."
```

---

## Task 2: WebSocket auth in Python `/voice/ws` (H2)

**Files:**
- Create: `apps/core/tests/test_ws_auth.py`
- Modify: `apps/core/api/routes/voice.py:11-30`

- [ ] **Step 1: Write the failing test**

```python
# apps/core/tests/test_ws_auth.py
import os
import pytest
from fastapi import WebSocket
from api.middleware.auth import verify_ws_token


def _ws(query_string: str = "") -> WebSocket:
    ws = WebSocket.__new__(WebSocket)
    ws.query_params = {}
    if query_string:
        from urllib.parse import parse_qs
        ws.query_params = {k: v[0] for k, v in parse_qs(query_string).items()}
    return ws


def test_verify_ws_token_returns_true_on_match(monkeypatch):
    monkeypatch.setenv("MOMAI_SESSION_TOKEN", "tok-abc")
    ws = _ws("token=tok-abc")
    assert verify_ws_token(ws) is True


def test_verify_ws_token_returns_false_on_mismatch(monkeypatch):
    monkeypatch.setenv("MOMAI_SESSION_TOKEN", "tok-abc")
    ws = _ws("token=other")
    assert verify_ws_token(ws) is False


def test_verify_ws_token_returns_false_when_missing(monkeypatch):
    monkeypatch.setenv("MOMAI_SESSION_TOKEN", "tok-abc")
    ws = _ws("")
    assert verify_ws_token(ws) is False


def test_verify_ws_token_returns_false_when_env_unset(monkeypatch):
    monkeypatch.delenv("MOMAI_SESSION_TOKEN", raising=False)
    ws = _ws("token=anything")
    assert verify_ws_token(ws) is False
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/core && uv run pytest tests/test_ws_auth.py -v
```

Expected: FAIL — `verify_ws_token` does not exist in `api/middleware/auth.py`.

- [ ] **Step 3: Add `verify_ws_token` to the auth module**

In `apps/core/api/middleware/auth.py`, add (next to `verify_token`):

```python
def verify_ws_token(websocket) -> bool:
    """Validate ?token=<token> query param against MOMAI_SESSION_TOKEN.

    Browsers cannot set custom headers on WebSocket, so the renderer
    passes the token in the URL. The endpoint should call this BEFORE
    websocket.accept() to reject unauthorized upgrades.
    """
    expected = os.environ.get("MOMAI_SESSION_TOKEN")
    if not expected:
        return False
    provided = websocket.query_params.get("token")
    if not provided:
        return False
    return provided == expected
```

(Add `import os` if not already present at the top of the file.)

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/core && uv run pytest tests/test_ws_auth.py -v
```

Expected: PASS — 4 cases pass.

- [ ] **Step 5: Use `verify_ws_token` in `/voice/ws` endpoint**

In `apps/core/api/routes/voice.py` at the top of `websocket_endpoint` (before `await websocket.accept()`):

```python
from api.middleware.auth import verify_ws_token

@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    if not verify_ws_token(websocket):
        await websocket.close(code=1008)  # 1008 = policy violation
        return
    await websocket.accept()
    # ... rest of existing body
```

- [ ] **Step 6: Run all Python tests**

```bash
cd apps/core && uv run pytest
```

Expected: no new failures.

- [ ] **Step 7: Commit**

```bash
git add apps/core/api/middleware/auth.py \
        apps/core/api/routes/voice.py \
        apps/core/tests/test_ws_auth.py
git commit -m "fix(security): validate session token on Python /voice/ws upgrade (H2)

Mirror of H1 for the Python sidecar. The voice WebSocket endpoint
was accepting any connection. Now it calls verify_ws_token() before
websocket.accept() and closes with code 1008 (policy violation) if
the token is missing, empty, or does not match MOMAI_SESSION_TOKEN."
```

---

## Task 3: Settings allowlist for `PATCH /settings` (H3)

**Files:**
- Create: `apps/momai/scripts/node-core/config/settings-allowlist.js`
- Create: `apps/momai/scripts/node-core/config/settings-allowlist.test.js`
- Modify: `apps/momai/scripts/node-core/api/routes/settings.routes.js:36-56`

- [ ] **Step 1: Write the failing test**

```js
// apps/momai/scripts/node-core/config/settings-allowlist.test.js
const { SETTINGS_EDITABLE_KEYS, filterToEditableSettings } = require('./settings-allowlist.js')

describe('SETTINGS_EDITABLE_KEYS', () => {
  it('contains the expected user-tunable keys', () => {
    expect(SETTINGS_EDITABLE_KEYS.has('ai_tier')).toBe(true)
    expect(SETTINGS_EDITABLE_KEYS.has('tts_enabled')).toBe(true)
    expect(SETTINGS_EDITABLE_KEYS.has('wake_word_enabled')).toBe(true)
    expect(SETTINGS_EDITABLE_KEYS.has('local_backend')).toBe(true)
    expect(SETTINGS_EDITABLE_KEYS.has('theme')).toBe(true)
    expect(SETTINGS_EDITABLE_KEYS.has('language')).toBe(true)
  })

  it('does NOT contain sensitive keys', () => {
    expect(SETTINGS_EDITABLE_KEYS.has('modes')).toBe(false)
    expect(SETTINGS_EDITABLE_KEYS.has('internal_token')).toBe(false)
    expect(SETTINGS_EDITABLE_KEYS.has('debug')).toBe(false)
  })
})

describe('filterToEditableSettings', () => {
  it('keeps only allowed keys', () => {
    const input = { ai_tier: 'ultra', theme: 'dark', evil_key: 'rm -rf /' }
    const out = filterToEditableSettings(input)
    expect(out).toEqual({ ai_tier: 'ultra', theme: 'dark' })
  })

  it('returns empty object when input is empty', () => {
    expect(filterToEditableSettings({})).toEqual({})
  })

  it('returns empty object when no keys are allowed', () => {
    expect(filterToEditableSettings({ x: 1, y: 2 })).toEqual({})
  })

  it('does not mutate the input', () => {
    const input = { ai_tier: 'ultra', evil: 'x' }
    const snapshot = { ...input }
    filterToEditableSettings(input)
    expect(input).toEqual(snapshot)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/momai && pnpm test --project=scripts -- --run settings-allowlist
```

Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the allowlist**

```js
// apps/momai/scripts/node-core/config/settings-allowlist.js
const SETTINGS_EDITABLE_KEYS = new Set([
  'ai_tier',
  'tts_enabled',
  'tts_engine',
  'tts_voice',
  'tts_speed',
  'wake_word_enabled',
  'local_backend',
  'local_model',
  'embedding_model',
  'context_window_mode',
  'context_window_tokens',
  'auto_start_llm',
  'theme',
  'language',
  'transcription_language',
  'call_mode_voice_activity_threshold',
  'call_mode_silence_duration_ms',
  'gaming_mode_enabled',
  'idle_timeout_app_open',
  'idle_timeout_minimized',
  'auto_detect_known_games',
  'developer_mode'
])

function filterToEditableSettings(payload) {
  const out = {}
  if (!payload || typeof payload !== 'object') return out
  for (const key of Object.keys(payload)) {
    if (SETTINGS_EDITABLE_KEYS.has(key)) {
      out[key] = payload[key]
    }
  }
  return out
}

module.exports = { SETTINGS_EDITABLE_KEYS, filterToEditableSettings }
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/momai && pnpm test --project=scripts -- --run settings-allowlist
```

Expected: PASS — 6 cases pass.

- [ ] **Step 5: Apply the filter in `PATCH /settings`**

In `apps/momai/scripts/node-core/api/routes/settings.routes.js` at the top of the file (inside `createSettingsRoutes`), add:

```js
const { filterToEditableSettings } = require('../config/settings-allowlist.js')
```

Then in the `PATCH /settings` handler, change `Object.assign(store.settings, payload)` (around line 50) to:

```js
const safePayload = filterToEditableSettings(payload)
Object.assign(store.settings, safePayload)
```

- [ ] **Step 6: Run full Node Core test suite**

```bash
cd apps/momai && pnpm test --project=scripts
```

Expected: no new failures.

- [ ] **Step 7: Commit**

```bash
git add apps/momai/scripts/node-core/config/settings-allowlist.js \
        apps/momai/scripts/node-core/config/settings-allowlist.test.js \
        apps/momai/scripts/node-core/api/routes/settings.routes.js
git commit -m "fix(security): PATCH /settings now only accepts allowlisted keys (H3)

Previously PATCH /settings did Object.assign(store.settings, payload)
which let a caller overwrite ANY key — including internal flags like
'modes' or 'debug'. Now we filter the payload through
filterToEditableSettings() which keeps only known user-tunable keys
(ai_tier, tts_*, theme, language, etc.) and silently drops anything
else."
```

---

## Task 4: `/internal/shutdown` requires auth (H4)

**Files:**
- Create: `apps/momai/scripts/node-core/tests/internal-shutdown-auth.test.js`
- Modify: `apps/momai/scripts/node-core/api/routes/status.routes.js` (no code change, just verify it inherits the global auth)

- [ ] **Step 1: Write the failing test**

The global auth middleware in `apps/momai/scripts/node-core/api/router.js` already runs on every path except those in `PUBLIC_PATHS` (`/health`, `/extensions/events`). So `/internal/shutdown` is already auth-gated. The test is to lock in that behavior so it cannot regress.

```js
// apps/momai/scripts/node-core/tests/internal-shutdown-auth.test.js
const { isPublicPath } = require('../api/router.js')

describe('internal/shutdown auth (H4)', () => {
  it('/internal/shutdown is NOT in PUBLIC_PATHS (so the global auth middleware applies)', () => {
    expect(isPublicPath('/internal/shutdown', 'POST')).toBe(false)
  })

  it('/internal/shutdown requires auth on GET as well (defense in depth)', () => {
    expect(isPublicPath('/internal/shutdown', 'GET')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it passes (it should already pass)**

```bash
cd apps/momai && pnpm test --project=scripts -- --run internal-shutdown-auth
```

Expected: PASS — these are documentation/regression tests. If they fail, it means the public-paths list was changed accidentally and `/internal/shutdown` was added to it (which would be a regression).

- [ ] **Step 3: No code change required**

If the test passes, the requirement is already satisfied. Document the verification in the commit message and move on. If a future change ever adds `/internal/shutdown` to `PUBLIC_PATHS`, this test will catch it.

- [ ] **Step 4: Commit**

```bash
git add apps/momai/scripts/node-core/tests/internal-shutdown-auth.test.js
git commit -m "test(security): lock in that /internal/shutdown stays auth-gated (H4)

After Phase 1, the global auth middleware already runs on every path
except PUBLIC_PATHS (/health, /extensions/events). /internal/shutdown
is not in PUBLIC_PATHS so it already requires the bearer token. This
test prevents a future change from accidentally exempting it and
allowing anyone on localhost to shut down the backend."
```

---

## Task 5: `shell.openExternal` URL protocol allowlist (H6)

**Files:**
- Create: `apps/momai/scripts/node-core/config/safe-external-urls.js`
- Create: `apps/momai/scripts/node-core/config/safe-external-urls.test.js`
- Create: `apps/momai/src/main/security/safe-external-url.ts`
- Create: `apps/momai/src/main/security/safe-external-url.test.ts`
- Modify: `apps/momai/src/main/windowManager.ts:409-412`

- [ ] **Step 1: Write the failing test (Node side)**

```js
// apps/momai/scripts/node-core/config/safe-external-urls.test.js
const { isSafeExternalUrl, ALLOWED_EXTERNAL_PROTOCOLS } = require('./safe-external-urls.js')

describe('ALLOWED_EXTERNAL_PROTOCOLS', () => {
  it('includes only http, https, and mailto', () => {
    expect(ALLOWED_EXTERNAL_PROTOCOLS.has('http:')).toBe(true)
    expect(ALLOWED_EXTERNAL_PROTOCOLS.has('https:')).toBe(true)
    expect(ALLOWED_EXTERNAL_PROTOCOLS.has('mailto:')).toBe(true)
  })

  it('does NOT include dangerous protocols', () => {
    expect(ALLOWED_EXTERNAL_PROTOCOLS.has('file:')).toBe(false)
    expect(ALLOWED_EXTERNAL_PROTOCOLS.has('javascript:')).toBe(false)
    expect(ALLOWED_EXTERNAL_PROTOCOLS.has('data:')).toBe(false)
    expect(ALLOWED_EXTERNAL_PROTOCOLS.has('vbscript:')).toBe(false)
    expect(ALLOWED_EXTERNAL_PROTOCOLS.has('ms-msdt:')).toBe(false)
  })
})

describe('isSafeExternalUrl', () => {
  it('accepts https URLs', () => {
    expect(isSafeExternalUrl('https://example.com/page')).toBe(true)
  })

  it('accepts http URLs', () => {
    expect(isSafeExternalUrl('http://example.com')).toBe(true)
  })

  it('accepts mailto URLs', () => {
    expect(isSafeExternalUrl('mailto:user@example.com')).toBe(true)
  })

  it('rejects javascript: URLs', () => {
    expect(isSafeExternalUrl('javascript:alert(1)')).toBe(false)
  })

  it('rejects file: URLs', () => {
    expect(isSafeExternalUrl('file:///etc/passwd')).toBe(false)
  })

  it('rejects data: URLs', () => {
    expect(isSafeExternalUrl('data:text/html,<script>alert(1)</script>')).toBe(false)
  })

  it('rejects empty string', () => {
    expect(isSafeExternalUrl('')).toBe(false)
  })

  it('rejects invalid URLs', () => {
    expect(isSafeExternalUrl('not a url')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/momai && pnpm test --project=scripts -- --run safe-external-urls
```

Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the Node module**

```js
// apps/momai/scripts/node-core/config/safe-external-urls.js
const ALLOWED_EXTERNAL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:'])

function isSafeExternalUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || rawUrl.length === 0) return false
  let url
  try {
    url = new URL(rawUrl)
  } catch {
    return false
  }
  return ALLOWED_EXTERNAL_PROTOCOLS.has(url.protocol)
}

module.exports = { ALLOWED_EXTERNAL_PROTOCOLS, isSafeExternalUrl }
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/momai && pnpm test --project=scripts -- --run safe-external-urls
```

Expected: PASS — 10 cases pass.

- [ ] **Step 5: Write the failing test (main process side)**

```ts
// apps/momai/src/main/security/safe-external-url.test.ts
import { describe, it, expect } from 'vitest'
import { isSafeExternalUrl, ALLOWED_EXTERNAL_PROTOCOLS } from './safe-external-url'

describe('isSafeExternalUrl (main)', () => {
  it('accepts https', () => expect(isSafeExternalUrl('https://example.com')).toBe(true))
  it('accepts http', () => expect(isSafeExternalUrl('http://example.com')).toBe(true))
  it('accepts mailto', () => expect(isSafeExternalUrl('mailto:user@example.com')).toBe(true))
  it('rejects javascript:', () => expect(isSafeExternalUrl('javascript:alert(1)')).toBe(false))
  it('rejects file:', () => expect(isSafeExternalUrl('file:///etc/passwd')).toBe(false))
  it('rejects empty', () => expect(isSafeExternalUrl('')).toBe(false))
  it('rejects garbage', () => expect(isSafeExternalUrl('nope')).toBe(false))
})

describe('ALLOWED_EXTERNAL_PROTOCOLS (main)', () => {
  it('matches Node side', () => {
    expect(ALLOWED_EXTERNAL_PROTOCOLS.has('https:')).toBe(true)
    expect(ALLOWED_EXTERNAL_PROTOCOLS.has('javascript:')).toBe(false)
  })
})
```

- [ ] **Step 6: Run test to verify it fails**

```bash
cd apps/momai && pnpm test --project=main -- --run safe-external-url
```

Expected: FAIL — module does not exist.

- [ ] **Step 7: Implement the main-process module**

```ts
// apps/momai/src/main/security/safe-external-url.ts
const ALLOWED_EXTERNAL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:'])

export function isSafeExternalUrl(rawUrl: string): boolean {
  if (typeof rawUrl !== 'string' || rawUrl.length === 0) return false
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return false
  }
  return ALLOWED_EXTERNAL_PROTOCOLS.has(url.protocol)
}

export { ALLOWED_EXTERNAL_PROTOCOLS }
```

- [ ] **Step 8: Run test to verify it passes**

```bash
cd apps/momai && pnpm test --project=main -- --run safe-external-url
```

Expected: PASS — 8 cases pass.

- [ ] **Step 9: Use the validator in `windowManager.ts`**

In `apps/momai/src/main/windowManager.ts`, add to the imports (near the existing `security/session-token` import):

```ts
import { isSafeExternalUrl } from './security/safe-external-url'
```

Then change the `setWindowOpenHandler` (around line 409):

```ts
mainWindow.webContents.setWindowOpenHandler((details) => {
  shell.openExternal(details.url)
  return { action: 'deny' }
})
```

to:

```ts
mainWindow.webContents.setWindowOpenHandler((details) => {
  if (isSafeExternalUrl(details.url)) {
    shell.openExternal(details.url)
  } else {
    logger.warn(`[WindowManager] Blocked setWindowOpenHandler URL with unsafe protocol: ${details.url}`)
  }
  return { action: 'deny' }
})
```

- [ ] **Step 10: Run typecheck + main tests**

```bash
cd apps/momai && pnpm typecheck:node && pnpm test --project=main
```

Expected: typecheck clean (ContainerChat.tsx:899 pre-existing error stays), tests pass except the documented pre-existing failures.

- [ ] **Step 11: Commit**

```bash
git add apps/momai/scripts/node-core/config/safe-external-urls.js \
        apps/momai/scripts/node-core/config/safe-external-urls.test.js \
        apps/momai/src/main/security/safe-external-url.ts \
        apps/momai/src/main/security/safe-external-url.test.ts \
        apps/momai/src/main/windowManager.ts
git commit -m "fix(security): validate URL before shell.openExternal (H6)

setWindowOpenHandler was calling shell.openExternal(details.url) for
ANY URL — including javascript:, file:, data:, and protocol handlers
like ms-msdt: that Windows treats specially. Now we validate the
protocol against an allowlist (http, https, mailto) before opening
externally. Anything else is silently dropped and logged.

Two parallel implementations (Node and main process) because each
runs in a different context and we don't want a runtime import
between them."
```

---

## Task 6: Extension `require` interceptor (H7)

**Files:**
- Create: `apps/momai/scripts/node-core/config/extension-allowlist.js`
- Create: `apps/momai/scripts/node-core/config/extension-allowlist.test.js`
- Modify: `apps/momai/scripts/node-core/services/extension-host-worker.js`

- [ ] **Step 1: Write the failing test**

```js
// apps/momai/scripts/node-core/config/extension-allowlist.test.js
const {
  EXTENSION_REQUIRE_ALLOWLIST,
  isRequireAllowed,
  createRequireInterceptor
} = require('./extension-allowlist.js')

describe('EXTENSION_REQUIRE_ALLOWLIST', () => {
  it('includes safe Node built-ins', () => {
    expect(EXTENSION_REQUIRE_ALLOWLIST.has('path')).toBe(true)
    expect(EXTENSION_REQUIRE_ALLOWLIST.has('url')).toBe(true)
    expect(EXTENSION_REQUIRE_ALLOWLIST.has('node:path')).toBe(true)
    expect(EXTENSION_REQUIRE_ALLOWLIST.has('node:url')).toBe(true)
  })

  it('excludes dangerous modules', () => {
    expect(EXTENSION_REQUIRE_ALLOWLIST.has('child_process')).toBe(false)
    expect(EXTENSION_REQUIRE_ALLOWLIST.has('node:child_process')).toBe(false)
    expect(EXTENSION_REQUIRE_ALLOWLIST.has('fs')).toBe(false)
    expect(EXTENSION_REQUIRE_ALLOWLIST.has('worker_threads')).toBe(false)
    expect(EXTENSION_REQUIRE_ALLOWLIST.has('cluster')).toBe(false)
  })
})

describe('isRequireAllowed', () => {
  it('returns true for allowed modules', () => {
    expect(isRequireAllowed('path')).toBe(true)
    expect(isRequireAllowed('node:path')).toBe(true)
  })

  it('returns false for disallowed modules', () => {
    expect(isRequireAllowed('child_process')).toBe(false)
    expect(isRequireAllowed('fs')).toBe(false)
  })

  it('returns false for relative requires (those are handled separately)', () => {
    expect(isRequireAllowed('./utils')).toBe(false)
    expect(isRequireAllowed('../shared')).toBe(false)
  })
})

describe('createRequireInterceptor', () => {
  it('returns a function that allows whitelisted requires and blocks the rest', () => {
    const calls = []
    const original = (id) => {
      calls.push(id)
      return { id }
    }
    const intercepted = createRequireInterceptor(original)
    expect(() => intercepted('path')).not.toThrow()
    expect(() => intercepted('node:path')).not.toThrow()
    expect(() => intercepted('child_process')).toThrow(/not allowed/i)
    expect(() => intercepted('fs')).toThrow(/not allowed/i)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/momai && pnpm test --project=scripts -- --run extension-allowlist
```

Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the allowlist**

```js
// apps/momai/scripts/node-core/config/extension-allowlist.js
const EXTENSION_REQUIRE_ALLOWLIST = new Set([
  // Node built-ins (both `name` and `node:name` forms)
  'path',
  'node:path',
  'url',
  'node:url',
  'querystring',
  'node:querystring',
  'util',
  'node:util',
  'events',
  'node:events',
  'stream',
  'node:stream',
  'buffer',
  'node:buffer',
  'string_decoder',
  'node:string_decoder',
  'punycode',
  'node:punycode',
  // Nothing else for now. fs, child_process, worker_threads, cluster,
  // net, http, https, tls, dgram, dns are all blocked.
])

function isRequireAllowed(id) {
  if (typeof id !== 'string') return false
  // Relative requires (./foo, ../bar, /abs) are handled separately
  // by Node's normal module resolution. The host's `require` reaches
  // our interceptor only for bare specifiers (and built-ins).
  if (id.startsWith('.') || id.startsWith('/')) return false
  return EXTENSION_REQUIRE_ALLOWLIST.has(id)
}

function createRequireInterceptor(originalRequire) {
  return function intercepted(id) {
    if (!isRequireAllowed(id)) {
      throw new Error(
        `Extension tried to require "${id}" which is not in the allowlist. ` +
          `Extensions can only use: ${[...EXTENSION_REQUIRE_ALLOWLIST].join(', ')}`
      )
    }
    return originalRequire(id)
  }
}

module.exports = {
  EXTENSION_REQUIRE_ALLOWLIST,
  isRequireAllowed,
  createRequireInterceptor
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/momai && pnpm test --project=scripts -- --run extension-allowlist
```

Expected: PASS — 9 cases pass.

- [ ] **Step 5: Install the interceptor in `extension-host-worker.js`**

In `apps/momai/scripts/node-core/services/extension-host-worker.js`, add at the top of the file (after the existing requires):

```js
const { createRequireInterceptor } = require('../config/extension-allowlist.js')

// Install the require interceptor BEFORE loading the extension's runtime.js.
// From this point on, any call to `require(...)` inside the extension sees
// our wrapper. Built-ins not in the allowlist throw.
const Module = require('node:module')
const originalRequire = Module.prototype.require
Module.prototype.require = createRequireInterceptor(originalRequire)
```

- [ ] **Step 6: Run full Node Core test suite**

```bash
cd apps/momai && pnpm test --project=scripts
```

Expected: no new failures. (Note: if any existing extension runtime in `scripts/skills/packaged/*/runtime.js` uses a blocked module like `fs`, those extensions will start to throw at load time. Inspect the runtimes and add legitimate modules to the allowlist as needed. The audit lists 4 built-in skills — `search`, `weather`, `memory`, `scheduler` — and these don't typically need `fs` or `child_process`.)

- [ ] **Step 7: Smoke test — load each built-in skill**

```bash
cd apps/momai && node -e "
for (const skill of ['search','weather','memory','scheduler']) {
  try {
    const path = require('path').resolve('scripts/skills/core/' + skill + '/runtime.js')
    require(path)
    console.log(skill + ': OK')
  } catch (e) {
    console.log(skill + ': FAIL - ' + e.message)
  }
}
"
```

Expected: all 4 print `OK`. If any fail, either add the legitimately needed module to `EXTENSION_REQUIRE_ALLOWLIST` or fix the skill to not need it. Document any changes in the commit message.

- [ ] **Step 8: Commit**

```bash
git add apps/momai/scripts/node-core/config/extension-allowlist.js \
        apps/momai/scripts/node-core/config/extension-allowlist.test.js \
        apps/momai/scripts/node-core/services/extension-host-worker.js
git commit -m "fix(security): extension require() deny-by-default (H7)

Extensions were running with full Node.js access, including
child_process, fs, worker_threads, and net. An attacker who managed
to install a malicious extension (or a compromised one) could use
these to escape the extension host and run arbitrary code as the
user.

Now Module.prototype.require is wrapped with createRequireInterceptor
BEFORE the extension's runtime.js is loaded. Any require() for a
module not in the explicit allowlist (path, url, util, events, ...)
throws. fs, child_process, net, http, worker_threads, etc. are
blocked by default."
```

---

## Task 7: Extension worker minimal env (H8)

**Files:**
- Modify: `apps/momai/scripts/node-core/services/extension-host-manager.js:25-29`

- [ ] **Step 1: Replace the env spread in `_spawnHost`**

In `apps/momai/scripts/node-core/services/extension-host-manager.js`, change the `_spawnHost` method:

```js
_spawnHost(skillId, skillPath, extraEnv) {
  const hostPath = path.join(__dirname, 'extension-host-worker.js')
  return fork(hostPath, [skillId, skillPath], {
    stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
    env: { ...process.env, MOMAI_EXTENSION_ID: skillId, ...extraEnv }
  })
}
```

to:

```js
_spawnHost(skillId, skillPath, extraEnv) {
  const hostPath = path.join(__dirname, 'extension-host-worker.js')
  return fork(hostPath, [skillId, skillPath], {
    stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
    env: {
      // Minimal env. Do NOT spread process.env — extensions should not
      // see the user's home directory, API tokens in env, or other
      // extension's secrets. Add only what is genuinely needed.
      PATH: process.env.PATH,
      NODE_PATH: process.env.NODE_PATH,
      LANG: process.env.LANG,
      MOMAI_DATA_DIR: process.env.MOMAI_DATA_DIR,
      MOMAI_EXTENSION_ID: skillId,
      MOMAI_SESSION_TOKEN: process.env.MOMAI_SESSION_TOKEN,
      ...extraEnv
    }
  })
}
```

- [ ] **Step 2: Run full Node Core tests**

```bash
cd apps/momai && pnpm test --project=scripts
```

Expected: no new failures.

- [ ] **Step 3: Smoke test built-in skills again**

```bash
cd apps/momai && node -e "
for (const skill of ['search','weather','memory','scheduler']) {
  try {
    const path = require('path').resolve('scripts/skills/core/' + skill + '/runtime.js')
    require(path)
    console.log(skill + ': OK')
  } catch (e) {
    console.log(skill + ': FAIL - ' + e.message)
  }
}
"
```

Expected: all 4 still `OK`. If any fail because they need an env var we removed (e.g., `HOME`, `USERPROFILE`), add it to the explicit list with a comment.

- [ ] **Step 4: Commit**

```bash
git add apps/momai/scripts/node-core/services/extension-host-manager.js
git commit -m "fix(security): extension workers run with minimal env (H8)

Extension hosts previously inherited the entire process.env of Node
Core, which can include HOME/USERPROFILE, other extensions' secrets
in env vars, and any sensitive tokens. An extension that used
process.env.HOME to read ~/.ssh or process.env.SOME_OTHER_TOKEN
could exfiltrate data.

Now extensions see only PATH, NODE_PATH, LANG, MOMAI_DATA_DIR,
MOMAI_EXTENSION_ID, MOMAI_SESSION_TOKEN, plus any explicit
extraEnv passed by the caller."
```

---

## Task 8: Bump `concurrently` (CRITICAL shell-quote advisory)

**Files:**
- Modify: root `package.json`

- [ ] **Step 1: Check current version and the advisory**

```bash
cd apps/momai && pnpm audit --prod 2>&1 | head -30
```

Look for the `shell-quote` advisory (GHSA-g4rg-993r-mgx7, transitive via `concurrently@^9.2.1`).

- [ ] **Step 2: Update the version**

In root `package.json`, change:

```json
"concurrently": "^9.2.1",
```

to:

```json
"concurrently": "^9.2.4",
```

(or whatever the latest 9.x is at the time of execution — the constraint is "fixed in 9.2.4+").

- [ ] **Step 3: Reinstall**

```bash
cd apps/momai && pnpm install
```

Expected: lockfile updates, no errors.

- [ ] **Step 4: Re-run audit to confirm the fix**

```bash
cd apps/momai && pnpm audit --prod 2>&1 | grep -i "shell-quote" | head -5
```

Expected: no `shell-quote` critical advisory.

- [ ] **Step 5: Run the desktop dev script to verify concurrently still works**

```bash
cd apps/momai && timeout 8 pnpm dev:all 2>&1 | head -30
```

Expected: both core and desktop processes start. Ctrl-C after 8s. If `concurrently` is broken, the processes will fail to start with a clear error.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "fix(deps): bump concurrently to 9.2.4+ (resolves shell-quote CRITICAL)

GHSA-g4rg-993r-mgx7 affects shell-quote <=1.8.3, a transitive
dependency of concurrently <9.2.4. The vulnerability allows
arbitrary command execution through crafted arguments. Bumping
concurrently pulls in a patched shell-quote."
```

---

## Task 9: Bump `vite` to >=7.3.5 (resolves vite/rollup H advisories)

**Files:**
- Modify: `apps/momai/package.json`
- Modify: `apps/landing-page/package.json`

- [ ] **Step 1: Check current version**

```bash
cd apps/momai && grep -E '"vite"' package.json
cd apps/landing-page && grep -E '"vite"' package.json
```

- [ ] **Step 2: Update both package.json files**

In `apps/momai/package.json` and `apps/landing-page/package.json`, change any `"vite": "^<old>"` line to `"vite": "^7.3.5"` (or the current latest 7.x — the constraint is "fixed in 7.3.5+").

- [ ] **Step 3: Reinstall**

```bash
cd apps/momai && pnpm install
```

Expected: lockfile updates, possibly a warning about the vite plugin needing a peer dep bump. If `@vitejs/plugin-react` also needs a bump, bump it to the latest 5.x or 6.x compatible with vite 7. Document any peer dep adjustments in the commit.

- [ ] **Step 4: Re-run audit to confirm the fix**

```bash
cd apps/momai && pnpm audit --prod 2>&1 | grep -E "vite|rollup" | head -10
```

Expected: no HIGH vite/rollup advisories.

- [ ] **Step 5: Verify the dev server still builds**

```bash
cd apps/momai && pnpm typecheck:web 2>&1 | tail -10
```

Expected: typecheck passes (ContainerChat.tsx:899 pre-existing error stays).

- [ ] **Step 6: Commit**

```bash
git add apps/momai/package.json apps/landing-page/package.json pnpm-lock.yaml
git commit -m "fix(deps): bump vite to ^7.3.5 (resolves vite/rollup HIGH advisories)

Multiple HIGH advisories in vite <7.3.5 and transitive rollup.
Bumping both apps/momai and apps/landing-page to the same version
keeps them in sync. Peer deps (@vitejs/plugin-react, etc.) are
bumped to compatible versions as needed."
```

---

## Task 10: `pnpm overrides` for axios, ws, form-data (H9)

**Files:**
- Modify: root `package.json` `pnpm.overrides` block

- [ ] **Step 1: Check current advisories**

```bash
cd apps/momai && pnpm audit --prod 2>&1 | grep -E "axios|ws |form-data" | head -10
```

- [ ] **Step 2: Add the overrides**

In root `package.json`, change the `overrides` block:

```json
"overrides": {
  "@codemirror/state": "^6.6.0",
  "@codemirror/language": "^6.12.3",
  "@codemirror/commands": "^6.10.3"
}
```

to:

```json
"overrides": {
  "@codemirror/state": "^6.6.0",
  "@codemirror/language": "^6.12.3",
  "@codemirror/commands": "^6.10.3",
  "axios": ">=1.16.0",
  "ws": ">=8.21.0",
  "form-data": ">=4.0.6"
}
```

(Use the latest versions available at execution time. The constraints above are the known fix versions per the audit; bump further if newer versions are out.)

- [ ] **Step 3: Reinstall**

```bash
cd apps/momai && pnpm install
```

Expected: lockfile updates, `axios`, `ws`, `form-data` updated throughout the dep tree.

- [ ] **Step 4: Re-run audit to confirm the fix**

```bash
cd apps/momai && pnpm audit --prod 2>&1 | grep -E "axios|ws |form-data" | head -10
```

Expected: no more advisories for these three packages (or only ones above the override version).

- [ ] **Step 5: Run the test suites (Node and main)**

```bash
cd apps/momai && pnpm test
```

Expected: no regressions from the dep updates (pre-existing failures are OK).

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "fix(deps): add pnpm overrides for axios, ws, form-data (H9)

These three packages had HIGH advisories. Adding them to pnpm.overrides
forces every transitive consumer in the monorepo to use the patched
version, even if a direct dep is stale. Constraints are set to the
audit-known fix versions; bump further if newer versions are out."
```

---

## Task 11: Python dependency refresh (`uv lock --upgrade`)

**Files:**
- Modify: `apps/core/uv.lock` (regenerated by uv)

- [ ] **Step 1: Check current Python advisories**

```bash
cd apps/core && uv pip list --format=json 2>&1 | head -5
```

Then look at the audit's "20 Python CVEs" list in `auditorias/auditoria-seguranca-2026-06-21.md` to know which packages to expect to be updated.

- [ ] **Step 2: Refresh the lockfile**

```bash
cd apps/core && uv lock --upgrade
```

Expected: `uv.lock` is rewritten. Many packages will move forward. This may take 10-30 seconds.

- [ ] **Step 3: Re-sync the venv and re-run tests**

```bash
cd apps/core && uv sync && uv run pytest
```

Expected: venv reinstalled, all tests pass except any pre-existing failures. The 20 Python CVEs from the audit should be resolved.

- [ ] **Step 4: Re-run the dev server briefly to confirm it boots**

```bash
cd apps/core && timeout 8 uv run uvicorn main:app --port 8123 2>&1 | head -20
```

Expected: server starts, no import errors. Ctrl-C after 8s.

- [ ] **Step 5: Commit**

```bash
git add apps/core/uv.lock apps/core/pyproject.toml 2>&1
git commit -m "fix(deps): refresh Python dependencies (resolves 20 CVEs)

uv lock --upgrade pulls in patched versions of all packages that had
known vulnerabilities (fastapi, pydantic, uvicorn, httpx, etc.).
uv.sync re-creates the venv to match. All existing tests continue
to pass."
```

---

## Self-Review

**Spec coverage check** (Phase 2 items from the design spec):

- [x] 2.1 WebSocket auth in Node Core → Task 1
- [x] 2.2 WebSocket auth in Python → Task 2
- [x] 2.3 Settings allowlist for PATCH → Task 3
- [x] 2.4 /internal/shutdown requires auth → Task 4 (regression test, already protected by global middleware)
- [x] 2.5 shell.openExternal URL allowlist → Task 5
- [x] 2.6 Extension require interceptor → Task 6
- [x] 2.7 Extension minimal env → Task 7
- [x] 2.8 Bump concurrently → Task 8
- [x] 2.9 Bump vite → Task 9
- [x] 2.10 pnpm overrides for axios/ws/form-data → Task 10
- [x] 2.11 uv lock --upgrade → Task 11

All 11 items from the spec are covered.

**Placeholder scan:** no "TBD", no "TODO", no "similar to Task N" without re-stating the code. Every code change shows the full before/after.

**Type consistency:** `isSafeExternalUrl` is defined in both `apps/momai/scripts/node-core/config/safe-external-urls.js` and `apps/momai/src/main/security/safe-external-url.ts`. They have identical signatures and behavior. The duplication is intentional (two runtimes, no cross-import).

**Order matters:**
- Tasks 1-7 (security code) are independent of each other and can be parallelized.
- Tasks 8-11 (dep updates) are independent of each other and of 1-7.
- However, if 6 (require interceptor) breaks a built-in skill and you need to add a module to the allowlist, that change must come before the smoke test in task 6 step 7.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-21-security-hardening-phase-2.md`. Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints for review.
