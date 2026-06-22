# Security Hardening - Phase 2-4 Remaining Work

**Date:** 2026-06-21
**Status:** Phase 1 complete (13 commits). Phases 2-4 pending.
**Reference spec:** `docs/superpowers/specs/2026-06-21-security-hardening-design.md`
**Reference plan:** `docs/superpowers/plans/2026-06-21-security-hardening-phase-1.md`

---

## What was done in Phase 1

| # | Audit ID | Fix | Commit |
|---|----------|-----|--------|
| 1 | Pre-req | Migrate renderer to `apiFetch`/`apiWebSocket` stubs | `b94cf201` |
| 2 | C1 (part) | Session token generation module | `c62a3db7` |
| 3 | C1 (part) | Wire token main → preload → renderer | `39e6faca` |
| 4 | C1 (part) | Fix Python env inheritance | `ccf56ce8` |
| 5 | C1 (Node) | Node Core auth middleware (all routes) | `e49d1e24` |
| 6 | C2 | Node Core CORS allowlist | `b5330545` |
| 7 | C1 (Python) | Python `verify_token` dependency | `8193bcae` |
| 8 | H5 | Python CORS allowlist | `cccf468f` |
| 9 | C4 | `/launcher/open`: `exec` → `spawn` (no shell) | `e97e1b56` |
| 10 | C5 | Skill launcher: `exec` → `spawn` | `6827af68` |
| 11 | C3 (part) | `/extensions/install` URL validation + registry allowlist | `c2d4cf9f` |
| 12 | Pre-req | Route auth through renderer fetch (undici bug fix) | `41523b36` |
| 13 | Tests | Update preload + useChatWebSocket tests | `44a180bd` |

**Result:** The "any website → RCE" attack chain is closed. Auth token required on all internal HTTP traffic. CORS restricted to known origins. Command injection in launcher endpoints eliminated. URL validation prevents SSRF in extension install.

---

## Phase 2 — HIGH priority (1 PR)

| # | Audit ID | What to do | File(s) |
|---|----------|------------|---------|
| 2.1 | H1 | WebSocket auth in Node Core (validate token in upgrade) | `scripts/node-core/api/websocket.js` |
| 2.2 | H2 | WebSocket auth in Python (`/voice/ws`) | `apps/core/api/routes/voice.py` |
| 2.3 | H3 | `PATCH /settings` allowlist of editable keys | `scripts/node-core/api/routes/settings.routes.js` |
| 2.4 | H4 | `/internal/shutdown` requires auth | `scripts/node-core/api/routes/status.routes.js` |
| 2.5 | H6 | `shell.openExternal` URL protocol allowlist | `apps/momai/src/main/windowManager.ts` |
| 2.6 | H7 | Extension permissions deny-by-default + intercept `require` | `scripts/node-core/services/extension-host-worker.js` |
| 2.7 | H8 | Extension worker: minimal env (no `process.env` spread) | `scripts/node-core/services/extension-host-manager.js` |
| 2.8 | H9 (npm) | Bump `concurrently` (resolves shell-quote CRITICAL) | `package.json` |
| 2.9 | H9 (npm) | Bump `vite` to >=7.3.5 | `apps/momai/package.json`, `apps/landing-page/package.json` |
| 2.10 | H9 (npm) | `pnpm overrides` for axios, ws, form-data | `package.json` |
| 2.11 | H9 (pip) | `uv lock --upgrade` in `apps/core` | `apps/core/uv.lock` |

**Test estimate:** ~15 new tests

---

## Phase 3 — MEDIUM priority (1 PR)

| # | Audit ID | What to do | File(s) |
|---|----------|------------|---------|
| 3.1 | M1 | `sandbox: true` on main + overlay windows | `apps/momai/src/main/windowManager.ts` |
| 3.2 | M2 | Preload: replace generic `electronAPI` with curated surface | `apps/momai/src/preload/index.ts` |
| 3.3 | M3 | Block F12 in production + `Menu.setApplicationMenu(null)` | `apps/momai/src/main/index.ts` |
| 3.4 | M4 | API keys via Electron `safeStorage` (OS keychain) | `apps/core/database/models.py`, new `apps/momai/src/main/security/keychain.ts` |
| 3.5 | M5 | Rate limiting (slowapi in Python, token bucket in Node) | `apps/core/main.py`, new `scripts/node-core/middleware/rate-limit.js` |
| 3.6 | M6 | Error sanitization (generic messages, full error logged server-side) | all route files |
| 3.7 | M7 | Auth on `/chat/history`, `/chat/sessions`, `/chat/voice-command` | `scripts/node-core/api/routes/chat.routes.js` |
| 3.8 | C3 (cont) | `/extensions/install` signature/checksum verification | `scripts/node-core/api/routes/extensions.routes.js` |

**Test estimate:** ~15 new tests

---

## Phase 4 — LOW priority (1 PR)

| # | Audit ID | What to do | File(s) |
|---|----------|------------|---------|
| 4.1 | L1 | CSP: remove `unsafe-inline` from `style-src` | `apps/momai/src/renderer/index.html` |
| 4.2 | L2 | CSP: add `object-src 'none'`, `base-uri 'self'` | `apps/momai/src/renderer/index.html` |
| 4.3 | L3 | `extractZip`: `exec` → `fs.cpSync` + native zip lib | `scripts/node-core/api/routes/extensions.routes.js` |
| 4.4 | L4 | `will-attach-webview` handler (defense-in-depth) | `apps/momai/src/main/index.ts` |
| 4.5 | L5 | `execSync` → `fs.chmodSync`/`fs.cpSync` in bootstrap | `apps/momai/src/main/python/bootstrap/*.ts` |
| 4.6 | L6 | macOS: remove unnecessary entitlements | `apps/momai/build/entitlements.mac.plist` |
| 4.7 | L7 | macOS: enable notarization (needs Apple Developer ID) | `apps/momai/electron-builder.yml` |
| 4.8 | L8 | Iframe CSP in HTML preview cards | `HtmlPreviewCard.tsx`, `DevHtmlRenderCard.tsx` |
| 4.9 | L9 | `setWindowOpenHandler` on overlay window | `apps/momai/src/main/windowManager.ts` |
| 4.10 | L10 | `.gitignore`: add `*.pfx`, `*.p12` (defense-in-depth) | `.gitignore` |

**Test estimate:** ~10 new tests

---

## Known bugs introduced by Phase 1 — stabilization fix (all resolved)

These were found during Phase 1 implementation but not in the original plan. All four were investigated and three were fixed in commits `f960f7b2`, `e5d8d3ab`, and `7b4ab568`.

| Bug | Status | Description | File | Fix commit |
|-----|--------|-------------|------|------------|
| B1 | **Fixed** | Main process `fetch` calls to Node Core don't include Authorization header (e.g., `coreManager.ts:99-100` calls `/system/gaming-apps` and `/economy/config`). These fail silently in main process but should be authenticated. | `apps/momai/src/main/security/authenticated-fetch.ts` (new), 5 call-site files | `f960f7b2` |
| B2 | **Fixed** | Node Core reuse logic: if an existing Node Core is on the port, it's reused (possibly from a prior session with a different token). Now detected via 401 on `/status` and the stale process is killed before restart. | `apps/momai/src/main/node-core-startup-decision.ts` (new), `coreManager.ts` | `e5d8d3ab` |
| B3 | **Fixed** | `/extensions/events` (SSE) can't send Authorization header (EventSource limitation). Exempted from auth: it is GET-only and server-to-client, so an unauthenticated subscriber can only listen to events, not send commands. | `apps/momai/scripts/node-core/api/router.js`, `tests/router-public-paths.test.js` (new) | `7b4ab568` |
| B4 | **False positive** | Re-investigated: the "4x in 1 second" observation is normal parallel mounts of `LateralBar`, `ExtensionsView`, and `useAppInitialization`, not an infinite loop. `loadExtensions` in `LateralBar.tsx:162-195` is bounded (initial mount + `momai_backend_ready` event + 3s timeout fallback). No fix needed. | n/a | n/a |

---

## Pre-existing test failures (unrelated to security)

These were failing before Phase 1 and are still failing. Not in scope of security work but should be fixed eventually.

| Test | File | Notes |
|------|------|-------|
| `routeByKeyword > returns match for keyword prefix` | `scripts/tests/keyword-router.test.js` | Pre-existing |
| `routeByKeyword > handles multi-token keyword with skipped words` | `scripts/tests/keyword-router.test.js` | Pre-existing |
| `useChatActions > sendMessage > injects memory context...` | `src/renderer/src/hooks/useChatActions.test.ts` | Pre-existing |
| `EconomyService > reactivates idle soneca...` | `src/main/economyService.test.ts` | Flaky/timing |
| `humanizeToolName` (1 test) | `src/renderer/src/features/chat/message/utils.test.ts` | Pre-existing |
| `ContainerChat.tsx:892` (typecheck) | `src/renderer/src/components/ContainerChat.tsx` | Pre-existing |

---

## Out of scope (explicit)

- **PFX certificate rotation** (`momai_certificado.pfx` + hardcoded password): user declined (private repo, self-signed test cert)
- **Full `worker_threads` migration** for extensions: deferred; minimal validation is sufficient
- **OS-level sandbox** for extensions: deferred
- **macOS notarization** setup: depends on Apple Developer ID availability
- **Extension API surface redesign**: only the security boundary, not the API itself

---

## Estimated effort

- Phase 2: ~3-4 hours (mostly TDD with clear spec)
- Phase 3: ~4-5 hours (more architectural changes)
- Phase 4: ~2-3 hours (mostly config/polish)

**Total remaining: ~10-12 hours of work across 3 PRs.**

---

## How to resume

1. Create a new worktree from main: `git worktree add ../momai-phase2 main`
2. Create a Phase 2 plan (similar to `2026-06-21-security-hardening-phase-1.md`)
3. Use TDD: test first, implement, commit, review
4. Use the spec/plan/specification pattern for each phase

Each phase should be a single PR following the same review pattern (spec compliance + code quality).
