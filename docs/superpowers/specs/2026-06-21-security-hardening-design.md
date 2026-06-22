# Security Hardening - Design Spec

## Summary

Fix all security vulnerabilities identified in `auditorias/auditoria-seguranca-2026-06-21.md`, delivered in 4 sequential PRs (one per phase). The work is structured from most critical (remote code execution via websites) to lowest priority (hardening polish).

The single most critical issue is a combination of three failures: (1) the local Node Core and Python servers have no authentication, (2) they advertise permissive CORS (`*`) to the browser, and (3) several endpoints accept user input that flows into shell commands without sanitization. Together these allow **any website the user visits to silently execute arbitrary code on their machine** through a simple `fetch('http://127.0.0.1:8050/...')` call. Phase 1 fixes this combination.

The user explicitly excluded the code-signing PFX certificate issue (item #5 in the audit) because the repo is private and the cert is a self-signed test cert.

## Goals

- Eliminate the "any website → RCE" attack chain by adding a session token to all internal HTTP/WebSocket traffic.
- Lock down CORS to an explicit allowlist of legitimate origins (defense-in-depth).
- Replace all `exec()`-with-string-interpolation calls with safe alternatives (`spawn()` with arg arrays, or Electron `shell.openPath`).
- Validate extension install URLs against the community registry allowlist.
- Make extension permissions deny-by-default and strip inherited environment variables.
- Update vulnerable dependencies (the critical `shell-quote` advisory, plus the Python and high-severity npm packages).
- Enable Electron renderer sandbox, block DevTools in production, move API keys out of plaintext SQLite.
- Add rate limiting, error sanitization, and auth to chat history endpoints.

## Non-Goals

- No changes to the variant isolation work from the previous spec (already merged).
- No changes to the soneca idle bug fix (already merged).
- No rewrite of the extension API surface — only the security boundary around it.
- No full migration to `worker_threads` for extensions (deferred; minimal validation is sufficient for now).
- No full OS-level sandbox for extensions (deferred).
- The PFX certificate / hardcoded signing password is **out of scope** per user request (private repo, self-signed test cert).

## Architecture

### Session token flow

```
┌─────────────────────────────────────────────────────────────┐
│  Electron renderer                                          │
│  - Preload reads token from process.argv (passed by main)   │
│  - contextBridge exposes apiFetch() / apiWebSocket()        │
│    wrappers that auto-attach "Authorization: Bearer <tok>"  │
│  - Renderer never sees the raw token                       │
└─────────────────────────────────────────────────────────────┘
              │ Authorization: Bearer <token>
              ▼
┌─────────────────────────────────────────────────────────────┐
│  Electron main process                                      │
│  - Generates 32-byte random token on app start (in memory)  │
│  - Sets process.env.MOMAI_SESSION_TOKEN                     │
│  - Spawns Node Core and Python with the env var inherited   │
│  - Passes --momai-session-token=<token> to BrowserWindow    │
│    via webPreferences.additionalArguments                  │
└─────────────────────────────────────────────────────────────┘
              │ MOMAI_SESSION_TOKEN env var
              ▼
┌─────────────────────────────────────────────────────────────┐
│  Node Core (port 8050 dev) + Python (port 8051 dev)         │
│  - Auth middleware validates Authorization header on every  │
│    HTTP route (except /health)                              │
│  - WebSocket upgrade handler validates token in query string│
│  - Rejects with 401 if missing or invalid                   │
└─────────────────────────────────────────────────────────────┘
```

### CORS allowlist

| Environment | Allowed origins |
|-------------|-----------------|
| Dev (Vite)  | `http://localhost:5173`, `http://127.0.0.1:5173` |
| Prod (packaged) | `file://` |

The allowlist is per-variant: dev variants use the Vite dev server origin, packaged variants use `file://`. Configured in `apps/momai/scripts/node-core/config/cors.js` and `apps/core/main.py`.

### Extension install validation

```
POST /extensions/install { id, download_url }
        │
        ▼
1. Load community-extensions.json (immutable registry)
2. Look up id in registry
        │ not found → 403
        ▼
3. Compare request download_url with registry download_url
        │ mismatch → 403
        ▼
4. Parse URL, require scheme = https
        │ other scheme → 403
        ▼
5. Resolve hostname, block private/loopback/link-local IPs
        │ private IP → 403
        ▼
6. Download ZIP, extract, load runtime.js
```

## The 4 Phases

### Phase 1 — CRITICAL (1 PR)

**Fixes audit items:** C1 (no auth), C2 (CORS *), C4 (/launcher/open command injection), C5 (launcher skill command injection), partial C3 (URL validation for extensions).

| # | Change | File(s) |
|---|--------|---------|
| 1.1 | Generate/persist session token | `apps/momai/src/main/security/session-token.ts` (new) |
| 1.2 | Inject token into Node Core and Python spawn env | `apps/momai/src/main/index.ts` |
| 1.3 | Auth middleware in Node Core (all routes) | `apps/momai/scripts/node-core/middleware/auth.js` (new), `apps/momai/scripts/node-core/api/router.js` |
| 1.4 | Auth dependency in Python (all routes) | `apps/core/api/middleware/auth.py` (new), `apps/core/api/router.py` |
| 1.5 | CORS allowlist in Node Core | `apps/momai/scripts/node-core/config/cors.js` (new), `apps/momai/scripts/node-core/infrastructure/http-helpers.js` |
| 1.6 | CORS allowlist in Python (remove broad regex) | `apps/core/main.py` |
| 1.7 | /launcher/open: `exec` → `spawn` with arg array | `apps/momai/scripts/node-core/api/routes/extensions.routes.js` |
| 1.8 | Skill launcher: `exec` → `spawn` with arg array | `apps/momai/scripts/skills/packaged/launcher/runtime.js` |
| 1.9 | /extensions/install: URL validation against community-extensions.json | `apps/momai/scripts/node-core/api/routes/extensions.routes.js`, `apps/momai/scripts/skills/registry.js` |
| 1.10 | Preload `apiFetch()` / `apiWebSocket()` wrappers | `apps/momai/src/preload/index.ts` |
| 1.11 | Renderer: replace all `fetch()` / `new WebSocket()` with wrappers | ~15 files in `apps/momai/src/renderer/src/` |

**Tests:** ~20 new tests (token, middleware, CORS, launcher, extensions-install, apiFetch).

### Phase 2 — HIGH (1 PR)

**Fixes audit items:** H1, H2 (WebSocket auth), H3 (settings overwrite), H4 (/internal/shutdown), H6 (shell.openExternal), H7/H8 (extension permissions + env), H9 (dependencies), plus the npm CRITICAL `shell-quote 1.8.3`.

| # | Change | File(s) |
|---|--------|---------|
| 2.1 | WebSocket auth in Node Core (validate token in upgrade) | `apps/momai/scripts/node-core/api/websocket.js` |
| 2.2 | WebSocket auth in Python | `apps/core/api/routes/voice.py` |
| 2.3 | Settings allowlist for `PATCH /settings` | `apps/momai/scripts/node-core/api/routes/settings.routes.js` |
| 2.4 | `/internal/shutdown`: require auth | `apps/momai/scripts/node-core/api/routes/status.routes.js` |
| 2.5 | `shell.openExternal` URL protocol allowlist | `apps/momai/src/main/windowManager.ts` |
| 2.6 | Extension `require` interceptor (deny-by-default) | `apps/momai/scripts/node-core/services/extension-host-worker.js` |
| 2.7 | Extension worker: minimal env (no `process.env` spread) | `apps/momai/scripts/node-core/services/extension-host-manager.js` |
| 2.8 | Bump `concurrently` (resolves shell-quote CRITICAL) | root `package.json` |
| 2.9 | Bump `vite` to >=7.3.5 (resolves vite/rollup H advisories) | `apps/momai/package.json`, `apps/landing-page/package.json` |
| 2.10 | `pnpm overrides` for axios >=1.16.0, ws >=8.21, form-data >=4.0.6 | `package.json` |
| 2.11 | `uv lock --upgrade` in `apps/core` (resolves 20 Python CVEs) | `apps/core/uv.lock` |

**Tests:** ~15 new tests (WebSocket auth, settings allowlist, extension require block, shutdown auth, openExternal validation).

### Phase 3 — MEDIUM (1 PR)

**Fixes audit items:** M1, M2 (sandbox), M3 (preload IPC), M4 (DevTools), M5 (API key storage), M6 (rate limiting), M7 (error sanitization), M8, M9 (chat history / voice-command auth), part of C3 (signature verification).

| # | Change | File(s) |
|---|--------|---------|
| 3.1 | `sandbox: true` on main + overlay windows | `apps/momai/src/main/windowManager.ts` |
| 3.2 | Preload: replace `@electron-toolkit/preload` `electronAPI` with curated surface | `apps/momai/src/preload/index.ts` |
| 3.3 | Block F12 in production + `Menu.setApplicationMenu(null)` | `apps/momai/src/main/index.ts` |
| 3.4 | API keys: store via `safeStorage` (Electron, uses OS keychain) | `apps/core/database/models.py`, `apps/momai/src/main/security/keychain.ts` (new) |
| 3.5 | Rate limiting (slowapi in Python, token bucket in Node Core) | `apps/core/main.py`, `apps/momai/scripts/node-core/middleware/rate-limit.js` (new) |
| 3.6 | Error sanitization (generic messages, full error logged server-side) | all `apps/core/api/routes/*.py`, `apps/momai/scripts/node-core/api/routes/*.js` |
| 3.7 | Auth on `/chat/history`, `/chat/sessions`, `/chat/voice-command` | `apps/momai/scripts/node-core/api/routes/chat.routes.js` |
| 3.8 | `/extensions/install`: signature/checksum verification | `apps/momai/scripts/node-core/api/routes/extensions.routes.js` |

**Tests:** ~15 new tests (sandbox compat, safeStorage, rate limit, error sanitization, chat history auth, signature verify).

### Phase 4 — LOW (1 PR)

**Fixes audit items:** L3, L4, L5, L6, L7, L8, L9, L10, L11 from the audit. Also adds `.pfx`/`.p12` to `.gitignore` as defense-in-depth even though the PFX issue is out of scope.

| # | Change | File(s) |
|---|--------|---------|
| 4.1 | CSP: remove `unsafe-inline` from `style-src` | `apps/momai/src/renderer/index.html` |
| 4.2 | CSP: add `object-src 'none'`, `base-uri 'self'` | `apps/momai/src/renderer/index.html` |
| 4.3 | `will-attach-webview` handler (defense-in-depth) | `apps/momai/src/main/index.ts` |
| 4.4 | `Menu.setApplicationMenu(null)` in production | `apps/momai/src/main/index.ts` |
| 4.5 | `execSync` → `fs.chmodSync` / `fs.cpSync` in bootstrap | `apps/momai/src/main/python/bootstrap/index.ts`, `env-resolver.ts` |
| 4.6 | macOS: drop unnecessary entitlements | `apps/momai/build/entitlements.mac.plist` |
| 4.7 | macOS: enable notarization (when cert is available) | `apps/momai/electron-builder.yml` |
| 4.8 | Iframe CSP in `HtmlPreviewCard` / `DevHtmlRenderCard` | `apps/momai/src/renderer/src/components/chat/HtmlPreviewCard.tsx`, `DevHtmlRenderCard.tsx` |
| 4.9 | `setWindowOpenHandler` on overlay window | `apps/momai/src/main/windowManager.ts` |
| 4.10 | `.gitignore`: add `*.pfx`, `*.p12` | `.gitignore` |

**Tests:** ~10 new tests (CSP parse, will-attach-webview, execSync removal, iframe CSP).

## Phase 1 detailed design

### 1.1 Session token (`apps/momai/src/main/security/session-token.ts`)

```ts
import { randomBytes } from 'node:crypto'

export function generateSessionToken(): string {
  return randomBytes(32).toString('hex')
}
```

Called from `app.whenReady()` in `index.ts` before spawning Node Core / Python. The token is:
1. Assigned to `process.env.MOMAI_SESSION_TOKEN` (inherited by Node Core and Python)
2. Passed to `BrowserWindow` via `webPreferences.additionalArguments: ['--momai-session-token=' + token]`

The token is kept in memory only. It is never written to disk. When the app restarts, a new token is generated. This means the auth window is per-session (matches the security model).

### 1.3 Node Core auth middleware (`apps/momai/scripts/node-core/middleware/auth.js`)

```js
function authMiddleware(req, res, next) {
  const expected = `Bearer ${process.env.MOMAI_SESSION_TOKEN}`
  if (!process.env.MOMAI_SESSION_TOKEN) {
    return sendJson(res, 500, { ok: false, error: 'server misconfigured' })
  }
  if (req.headers['authorization'] !== expected) {
    return sendJson(res, 401, { ok: false, error: 'unauthorized' })
  }
  next()
}
```

Applied in `api/router.js`:
```js
const PUBLIC_PATHS = new Set(['/health'])
app.use((req, res, next) => {
  if (PUBLIC_PATHS.has(req.url.split('?')[0])) return next()
  return authMiddleware(req, res, next)
})
```

### 1.4 Python auth dependency (`apps/core/api/middleware/auth.py`)

```python
import os
from typing import Optional
from fastapi import Header, HTTPException

def verify_token(authorization: Optional[str] = Header(None)) -> None:
    expected = f"Bearer {os.getenv('MOMAI_SESSION_TOKEN', '')}"
    if not expected or authorization != expected:
        raise HTTPException(status_code=401, detail="unauthorized")
```

Applied in `api/router.py`:
```python
def include_routes(app: FastAPI) -> None:
    app.include_router(chat_voice.router, dependencies=[Depends(verify_token)])
    app.include_router(voice.router, dependencies=[Depends(verify_token)])
    # ... all other routers
```

### 1.5 Node Core CORS (`apps/momai/scripts/node-core/config/cors.js`)

```js
const path = require('node:path')

function getAllowedOrigins() {
  if (process.env.NODE_ENV === 'production') {
    return ['file://']
  }
  return ['http://localhost:5173', 'http://127.0.0.1:5173']
}

module.exports = { getAllowedOrigins }
```

`http-helpers.js` `sendJson` updated to use this instead of `*`:
```js
function sendJson(res, status, body) {
  const origin = res.req.headers['origin']
  const allowed = getAllowedOrigins()
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : 'null',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  })
  res.end(JSON.stringify(body))
}
```

### 1.7 /launcher/open fix

```js
// Before
exec(`start "" "${targetPath}"`)
// After
const { spawn } = require('node:child_process')
if (process.platform === 'win32') {
  spawn('cmd', ['/c', 'start', '""', targetPath], { detached: true, stdio: 'ignore' }).unref()
} else if (process.platform === 'darwin') {
  spawn('open', [targetPath], { detached: true, stdio: 'ignore' }).unref()
} else {
  spawn('xdg-open', [targetPath], { detached: true, stdio: 'ignore' }).unref()
}
```

### 1.9 /extensions/install validation

```js
const registry = require('../../community-extensions.json')
const { URL } = require('node:url')
const { lookup } = require('node:dns/promises')
const { isPrivate } = require('../utils/ip-check')

async function validateInstallUrl(id, downloadUrl) {
  const ext = registry.extensions.find(e => e.id === id)
  if (!ext) throw { status: 403, message: 'extension not in registry' }
  if (ext.download_url !== downloadUrl) {
    throw { status: 403, message: 'download_url does not match registry' }
  }
  const url = new URL(downloadUrl)
  if (url.protocol !== 'https:') {
    throw { status: 403, message: 'only https URLs allowed' }
  }
  const { address } = await lookup(url.hostname)
  if (isPrivate(address)) {
    throw { status: 403, message: 'private IPs not allowed' }
  }
}
```

`isPrivate()` checks against 127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.0.0/16, ::1/128, fc00::/7, fe80::/10.

### 1.10 Preload wrappers (`apps/momai/src/preload/index.ts`)

```ts
import { contextBridge } from 'electron'

const tokenArg = process.argv.find(a => a.startsWith('--momai-session-token='))
const token = tokenArg ? tokenArg.split('=')[1] : null

contextBridge.exposeInMainWorld('api', {
  apiFetch: (url: string, options: RequestInit = {}) => {
    const headers = new Headers(options.headers)
    if (token) headers.set('Authorization', `Bearer ${token}`)
    return fetch(url, { ...options, headers })
  },
  apiWebSocket: (url: string) => {
    const sep = url.includes('?') ? '&' : '?'
    return new WebSocket(`${url}${sep}token=${encodeURIComponent(token ?? '')}`)
  },
})
```

Token arrives via `process.argv` (the same mechanism used for `--momai-api-url` and `--momai-ws-url` from the previous variant refactor). The preload parses it once at startup and never exposes the raw value — only uses it inside the `apiFetch` / `apiWebSocket` wrappers.

Renderer migrates `fetch(url)` → `window.api.apiFetch(url)` and `new WebSocket(url)` → `window.api.apiWebSocket(url)`. The raw token is never exposed.

## Testing Strategy

### Frameworks
- **Electron main / preload / renderer:** vitest (already in use)
- **Node Core:** vitest
- **Python:** pytest (already in use)

### TDD discipline
For each change in each phase: red test → minimal implementation → green → refactor.

### Test categories per phase
- Unit tests for each new function (token generation, middleware, validators)
- Integration tests for the auth flow (token in env → middleware accepts; no token → 401)
- Mock-based tests for the preload wrappers (verify Authorization header is attached)
- Smoke test: `pnpm dev` end-to-end after each phase

### Manual verification per phase
- **Phase 1:** `curl http://127.0.0.1:8050/settings` → 401 without token, 200 with
- **Phase 1:** `curl -H "Origin: https://evil.com" http://127.0.0.1:8050/...` → CORS rejected
- **Phase 1:** Attempt extension install with URL outside registry → 403
- **Phase 2-4:** Manual check of each fixed behavior

## Migration

### Renderer fetch migration (pre-Phase 1 commit)

Before starting Phase 1, a separate commit migrates all `fetch()` and `new WebSocket()` calls in the renderer to use the new `apiFetch` / `apiWebSocket` wrappers. This keeps the Phase 1 PR focused on the security changes themselves.

Estimated: ~30-50 call sites across ~15 files.

### Backward compatibility

Community extensions that call the Node Core API directly (without using the renderer wrappers) will break when Phase 1 lands. The release notes for that version should call this out. Long-term, extensions should be migrated to use a helper that fetches the token from a well-known path.

## Verification

After each phase:

1. `pnpm typecheck` and `pnpm test` (all apps)
2. `pnpm dev` smoke test — app loads, model loads, chat works
3. Phase-specific security test (curl-based, as listed above)
4. Regression: install a legitimate community extension and confirm it still works

## Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Community extensions calling API directly break | Medium | Document in release notes; provide migration helper |
| Performance impact of token validation per request | Low | Constant-time string compare; ~0.1ms overhead, negligible |
| Token reset on app restart invalidates open WebSockets | Low | Reconnect logic in renderer (already exists for app restarts) |
| CORS allowlist missing a legitimate origin | Low | Test all 4 variants (dev, NSIS, Store, APPX-test) manually |
| `safeStorage` unavailable on some Linux setups | Low | Phase 3: fall back to encrypted file with key derived from machine ID |
| Extension require interceptor breaks legitimate extension | Medium | Phase 2: maintain allowlist of safe modules; test with existing extensions |

## Rollback

Each phase is a separate PR. If a phase breaks something:
- `git revert <merge-commit>` on main
- Or close the PR and ship a hotfix

The token is regenerated on each app start, so reverting the auth middleware does not leave the system in a bad state.

## Out of Scope (explicit)

- Code-signing PFX certificate rotation and `.gitignore` PFX rule (user request — private repo, self-signed test cert). The `.pfx`/`.p12` `.gitignore` addition IS in Phase 4 as defense-in-depth.
- Full `worker_threads` migration for extensions.
- OS-level sandbox for extensions (separate OS user, etc.).
- macOS notarization setup (depends on Apple Developer ID availability).
- Changing the extension API surface itself.
- Multi-user support.
