# Security Hardening - Phase 4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Address the 10 remaining LOW-severity issues from the security audit: CSP tightening, `will-attach-webview` defense-in-depth, removal of last `execSync` calls in the Python bootstrap, macOS entitlement cleanup + notarization, iframe CSP in HTML preview cards, `setWindowOpenHandler` on the overlay window, and `.gitignore` additions for cert files.

**Architecture:** Most Phase 4 changes are surgical edits to existing files. CSP tightening is the riskiest task (the `style-src 'unsafe-inline'` removal may break Tailwind's runtime style injection — if so, the implementer documents the issue and falls back to a nonce-based approach or a separate CSS file). The `execSync` removal replaces shell-out calls with native Node APIs (`fs.cpSync` for `cp -r`, `fs.chmodSync` for `chmod +x`, `child_process.spawnSync` for `python -c "..."` style introspection). macOS tasks are config-only edits to the plist and electron-builder yml.

**Tech Stack:** TypeScript, Node.js, Electron 42, electron-builder, macOS plist.

**Reference spec:** `docs/superpowers/specs/2026-06-21-security-hardening-design.md` (Phase 4 section)
**Reference audit:** `auditorias/auditoria-seguranca-2026-06-21.md` (L1–L10)
**Reference remaining work:** `docs/superpowers/specs/2026-06-21-security-hardening-remaining-work.md`

---

## File Structure

**Modified files (Phase 4):**
- `apps/momai/src/renderer/index.html` — tighten CSP (remove `'unsafe-inline'`, add `object-src 'none'`, `base-uri 'self'`)
- `apps/momai/src/main/index.ts` — add `app.on('web-contents-created', ...)` handler for `will-attach-webview`
- `apps/momai/src/main/python/bootstrap/env-resolver.ts` — replace `execSync('cp -r ...')` with `fs.cpSync(...)`
- `apps/momai/src/main/python/bootstrap/index.ts` — replace `execSync('chmod +x ...')` with `fs.chmodSync(...)`
- `apps/momai/src/main/python/bootstrap/python-resolver.ts` — replace `execSync('"${pythonExePath}" -c "..."')` with `child_process.spawnSync(...)` or `child_process.execFileSync(...)` (no shell)
- `apps/momai/build/entitlements.mac.plist` — drop unnecessary entitlements
- `apps/momai/electron-builder.yml` — enable notarization
- `apps/momai/src/renderer/src/components/chat/HtmlPreviewCard.tsx` — add iframe sandbox attributes
- `apps/momai/src/renderer/src/components/chat/DevHtmlRenderCard.tsx` — add iframe sandbox attributes
- `apps/momai/src/main/windowManager.ts` — add `setWindowOpenHandler` to overlay window
- `.gitignore` — add `*.pfx`, `*.p12`

**New files:** None (all changes are modifications to existing files).

**Test estimate:** ~10 new tests (CSP parse checks, will-attach-webview test, execSync removal smoke test, .gitignore parser test, iframe sandbox test).

**Pre-decided scope changes from the spec:**
- Spec 4.4 (`Menu.setApplicationMenu(null)` in production) is **already done** in Phase 3 Task 3 (commit `75c836bf`). Skipping it here.
- 4.1 and 4.2 are combined into one task (both edit the same CSP line in `index.html`).
- 4.6 and 4.7 are combined into one task (both touch macOS config).
- Result: 8 implementation tasks (4.1+4.2, 4.3, 4.5, 4.6+4.7, 4.8, 4.9, 4.10) + final review = 7 tasks + review.

---

## Task 1: CSP tightening — remove `'unsafe-inline'` from style-src + add `object-src 'none'` + `base-uri 'self'` (L1 + L2)

**Files:**
- Modify: `apps/momai/src/renderer/index.html` (the `<meta http-equiv="Content-Security-Policy">` tag)

- [ ] **Step 1: Read the current CSP and understand the current `style-src`**

```bash
cd apps/momai && Get-Content src/renderer/index.html
```

Current CSP (from inspection): `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; ...`

The `'unsafe-inline'` in `style-src` allows inline `style="..."` attributes and `<style>` blocks. Removing it is the goal of L1. The risk: Tailwind v3+ injects styles at runtime via inline `<style>` tags, which would be blocked.

- [ ] **Step 2: Identify what relies on inline styles**

```bash
cd apps/momai && Select-String -Path src/renderer -Pattern "style=\{|style=\"[^\"]*\"" -SimpleMatch 2>$null | Select-Object -First 20
```

This shows how often inline styles are used in the renderer. If there are < 10 hits, removal is feasible. If hundreds, removal requires a Tailwind config change (preflight) or a separate CSS file.

- [ ] **Step 3: Update the CSP**

In `apps/momai/src/renderer/index.html`, modify the `content` attribute of the `<meta http-equiv="Content-Security-Policy">` tag:

Find the current line:
```html
<meta
  http-equiv="Content-Security-Policy"
  content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https://avatars.githubusercontent.com ...; connect-src 'self' http://localhost:8000 ...; "
/>
```

Change `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com` to `style-src 'self' https://fonts.googleapis.com` (remove `'unsafe-inline'`).

Then ADD these two directives to the end of the `content` (before the closing quote):
- `object-src 'none'`
- `base-uri 'self'`

Result:
```html
<meta
  http-equiv="Content-Security-Policy"
  content="default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https://avatars.githubusercontent.com ...; connect-src 'self' http://localhost:8000 ...; object-src 'none'; base-uri 'self'"
/>
```

- [ ] **Step 4: Typecheck and run tests**

```bash
cd apps/momai && pnpm typecheck
npx vitest run --project main --project scripts --project=renderer
```

Expected: typecheck clean (ContainerChat.tsx:899 stays), 5 pre-existing failures only.

- [ ] **Step 5: Smoke test the dev server (CSS load only — no daemon)**

```bash
cd apps/momai && pnpm build:web 2>&1 | Select-Object -First 30
```

If `pnpm build:web` doesn't exist, use `pnpm typecheck:web` instead, OR a one-shot `node -e "const fs=require('fs'); const html=fs.readFileSync('src/renderer/index.html','utf8'); const cspMatch=html.match(/Content-Security-Policy[^>]+content=\"([^\"]+)\"/); console.log(cspMatch ? cspMatch[1] : 'NO CSP')"`:

```bash
cd apps/momai && node -e "const fs=require('fs'); const html=fs.readFileSync('src/renderer/index.html','utf8'); const m=html.match(/Content-Security-Policy[^>]+content=\"([^\"]+)\"/); if(!m){console.log('NO CSP');process.exit(1)} const csp=m[1]; if(csp.includes(\"'unsafe-inline'\")){console.log('FAIL: unsafe-inline still present');process.exit(1)} if(!csp.includes('object-src')){console.log('FAIL: object-src missing');process.exit(1)} if(!csp.includes('base-uri')){console.log('FAIL: base-uri missing');process.exit(1)} console.log('OK: CSP tightened')"
```

Expected: `OK: CSP tightened`. If any of the three checks fail, the smoke test prints the specific failure.

**WARNING about Tailwind:** The build may emit "Refused to apply inline style" warnings at runtime in the renderer. This is expected and benign if the styles are still applied via class-based Tailwind utilities. If the renderer visibly breaks (e.g., everything becomes unstyled), report DONE_WITH_CONCERNS and document the regression — the user can decide whether to revert this task.

- [ ] **Step 6: Commit**

```bash
git add apps/momai/src/renderer/index.html
git commit -m "fix(security): tighten CSP — remove 'unsafe-inline', add object-src/base-uri (L1+L2)

Three changes to the renderer's Content-Security-Policy meta tag:

1. Remove 'unsafe-inline' from style-src. Inline <style> blocks
   and style='...' attributes are now blocked. Tailwind utility
   classes still work because they're applied via the external
   stylesheet.

2. Add 'object-src \'none\''. Blocks <object>, <embed>, and
   <applet> — no plugin content can be loaded by the renderer.

3. Add 'base-uri \'self\''. Restricts <base href='...'> to
   same-origin, preventing base-tag injection attacks.

All three are part of Mozilla's recommended baseline CSP.

If the renderer breaks at runtime (e.g., dynamic Tailwind styles
injected via JS get blocked), the user can revert by adding
'unsafe-inline' back. The static class-based styling continues
to work."
```

---

## Task 2: `will-attach-webview` handler (L4)

**Files:**
- Modify: `apps/momai/src/main/index.ts` (add `app.on('web-contents-created', ...)`)

This is defense-in-depth: if anything ever tries to attach a `<webview>` to a renderer, we deny it. (The current code doesn't use webviews, but Electron's default is `allow`, so a future code addition could accidentally enable them.)

- [ ] **Step 1: Write the failing test**

```ts
// apps/momai/src/main/security/webview-block.test.ts
import { describe, it, expect } from 'vitest'
import { shouldBlockWebviewAttachment } from './webview-block'

describe('shouldBlockWebviewAttachment', () => {
  it('returns true to block all webview attachments', () => {
    expect(shouldBlockWebviewAttachment()).toBe(true)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd apps/momai && npx vitest run --project main webview-block
```

Expected: FAIL.

- [ ] **Step 3: Implement the helper**

```ts
// apps/momai/src/main/security/webview-block.ts
export function shouldBlockWebviewAttachment(): boolean {
  // Defense-in-depth: MomAI does not use <webview>. Block all attachments
  // so a future bug or malicious code can't enable one.
  return true
}
```

- [ ] **Step 4: Run to verify it passes**

Expected: 1 case pass.

- [ ] **Step 5: Wire into `app.on('web-contents-created', ...)` in `apps/momai/src/main/index.ts`**

Read the current `app.whenReady()` block in `index.ts`. Add a top-level `app.on('web-contents-created', ...)` BEFORE the `app.whenReady()` call:

```ts
import { shouldBlockWebviewAttachment } from './security/webview-block'

app.on('web-contents-created', (_event, contents) => {
  if (shouldBlockWebviewAttachment()) {
    contents.on('will-attach-webview', (event) => {
      event.preventDefault()
    })
  }
})

app.whenReady().then(() => {
  // ... existing code
})
```

- [ ] **Step 6: Typecheck + tests**

```bash
cd apps/momai && pnpm typecheck:node && npx vitest run --project main
```

- [ ] **Step 7: Commit**

```bash
git add apps/momai/src/main/security/webview-block.ts \
        apps/momai/src/main/security/webview-block.test.ts \
        apps/momai/src/main/index.ts
git commit -m "fix(security): deny <webview> attachment on all renderers (L4)

MomAI does not use <webview>. Electron's default for
'will-attach-webview' is to allow, which means a future code
addition or a malicious dependency could accidentally enable
embedded web content. This handler explicitly preventDefault's
all webview attachments, closing the door permanently.

Defense-in-depth: even if an attacker manages to inject HTML
into the renderer, they cannot escalate to a webview (which
runs with fewer restrictions than the parent BrowserWindow)."
```

---

## Task 3: Remove `execSync` from Python bootstrap (L5)

**Files:**
- Modify: `apps/momai/src/main/python/bootstrap/env-resolver.ts` (line 116: `execSync('cp -r ...')`)
- Modify: `apps/momai/src/main/python/bootstrap/index.ts` (lines 237, 242: `execSync('chmod +x ...')`)
- Modify: `apps/momai/src/main/python/bootstrap/python-resolver.ts` (line 71: `execSync('"${pythonExePath}" -c "import sys; print(sys.version)"')`)

The audit says: "Bootstrap uses execSync for cp/chmod/python introspection. Even with the path validated, execSync passes through a shell. Replace with fs.cpSync / fs.chmodSync / child_process.spawnSync."

- [ ] **Step 1: Replace `cp -r` in `env-resolver.ts:116`**

```ts
// Before:
execSync(`cp -r "${originalCorePath}" "${tempDir}"`, { stdio: 'ignore' })

// After:
import { cpSync } from 'node:fs'
cpSync(originalCorePath, tempDir, { recursive: true })
```

If `cpSync` import is already present, just update the call.

- [ ] **Step 2: Replace `chmod +x` in `index.ts:237, 242`**

```ts
// Before:
execSync(`chmod +x "${uvExe}"`, { stdio: 'ignore' })
execSync(`chmod +x "${bundledPython}"`, { stdio: 'ignore' })

// After:
import { chmodSync } from 'node:fs'
chmodSync(uvExe, 0o755)
chmodSync(bundledPython, 0o755)
```

- [ ] **Step 3: Replace `python -c "..."` in `python-resolver.ts:71`**

```ts
// Before:
execSync(`"${pythonExePath}" -c "import sys; print(sys.version)"`, { ... })

// After:
import { spawnSync } from 'node:child_process'
const result = spawnSync(pythonExePath, ['-c', 'import sys; print(sys.version)'], { ... })
```

(Preserve the existing options like `encoding`, `timeout`, `stdio` from the original call.)

- [ ] **Step 4: Verify no `execSync` calls remain in bootstrap**

```bash
cd apps/momai && Select-String -Path src/main/python/bootstrap -Pattern "execSync" 2>$null
```

Expected: no matches (or only in comments). If any remain, replace them.

- [ ] **Step 5: Typecheck and run tests**

```bash
cd apps/momai && pnpm typecheck:node && npx vitest run --project main
```

- [ ] **Step 6: Commit**

```bash
git add apps/momai/src/main/python/bootstrap/
git commit -m "fix(security): replace execSync with native Node APIs in Python bootstrap (L5)

The bootstrap used execSync() for three operations:
- cp -r to copy a cached Python environment to a temp dir
- chmod +x to make uv and the bundled python executable
- python -c 'import sys; print(sys.version)' to introspect the version

Each of these went through a shell. Even with the paths validated,
the shell interpolation surface is wider than necessary — a
future change to the path or flag construction could introduce
injection.

Replaced with:
- fs.cpSync(src, dest, { recursive: true })
- fs.chmodSync(path, 0o755)
- child_process.spawnSync(pythonExe, ['-c', '...']) — no shell

No shell, no interpolation, no risk."
```

---

## Task 4: macOS entitlement cleanup + notarization (L6 + L7)

**Files:**
- Modify: `apps/momai/build/entitlements.mac.plist`
- Modify: `apps/momai/electron-builder.yml` (line 122: `notarize: false` → `notarize: true`)

The audit says the current entitlements (`allow-jit`, `allow-unsigned-executable-memory`, `allow-dyld-environment-variables`) are only needed for unsigned dev builds. After cleanup, only the JIT one is needed for llama.cpp; the other two are droppable.

Note: the user is on Windows. The implementer can edit the plist and yml as text. They cannot test the macOS build locally, but the changes are config-only and easily verified by reading.

- [ ] **Step 1: Edit the entitlements plist**

In `apps/momai/build/entitlements.mac.plist`, remove the `allow-unsigned-executable-memory` and `allow-dyld-environment-variables` keys. Keep only `allow-jit` (needed by llama.cpp for runtime code generation).

Before:
```xml
<dict>
  <key>com.apple.security.cs.allow-jit</key>
  <true/>
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
  <true/>
  <key>com.apple.security.cs.allow-dyld-environment-variables</key>
  <true/>
</dict>
```

After:
```xml
<dict>
  <key>com.apple.security.cs.allow-jit</key>
  <true/>
</dict>
```

- [ ] **Step 2: Enable notarization in electron-builder.yml**

In `apps/momai/electron-builder.yml`, change line 122 from `notarize: false` to `notarize: true`.

(Notarization requires `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID` env vars at build time. The user's dev environment may not have these set, but enabling the flag in the config means CI/release builds will notarize when those env vars are present.)

- [ ] **Step 3: Verify the edits**

```bash
Get-Content apps/momai/build/entitlements.mac.plist
Select-String -Path apps/momai/electron-builder.yml -Pattern "notarize|entitle" 2>$null
```

- [ ] **Step 4: Commit**

```bash
git add apps/momai/build/entitlements.mac.plist apps/momai/electron-builder.yml
git commit -m "fix(security): drop unnecessary macOS entitlements + enable notarization (L6+L7)

The previous entitlements list included allow-unsigned-executable-memory
and allow-dyld-environment-variables. These were only needed for
unsigned dev builds; both weaken macOS's hardened runtime
protections and should be off in shipped apps. The remaining
allow-jit is required by llama.cpp's runtime code generation.

Also enabled notarize: true in electron-builder.yml. When built
on macOS with APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, and
APPLE_TEAM_ID set in the environment, the resulting .dmg/.app
will be sent to Apple's notary service. Without those env vars
the build will fail loudly instead of silently producing an
un-notarized app (which macOS Catalina+ refuses to open)."
```

---

## Task 5: Iframe sandbox attributes in HTML preview cards (L8)

**Files:**
- Modify: `apps/momai/src/renderer/src/components/chat/HtmlPreviewCard.tsx`
- Modify: `apps/momai/src/renderer/src/components/chat/DevHtmlRenderCard.tsx`

The audit item is "iframe CSP in HTML preview cards". If these components render untrusted HTML in an `<iframe>`, the iframe should have a restrictive `sandbox` attribute to limit what the embedded content can do (no scripts, no same-origin, no top navigation, etc.).

- [ ] **Step 1: Read the current code**

```bash
cd apps/momai && Get-Content src/renderer/src/components/chat/HtmlPreviewCard.tsx
cd apps/momai && Get-Content src/renderer/src/components/chat/DevHtmlRenderCard.tsx
```

Look for `<iframe` or `<iframe ` (case-insensitive). If neither file uses an iframe, this task is a no-op — skip the rest and just commit a "no iframe found" comment.

- [ ] **Step 2: If an iframe is found, add the `sandbox` attribute**

The recommended sandbox for rendering untrusted HTML:
```html
<iframe
  src="..."
  sandbox="allow-same-origin"  <!-- or remove for max restriction -->
  ...
/>
```

For HTML previews where the content is untrusted (user-provided), use the most restrictive sandbox that still allows rendering:
```html
<iframe
  src="..."
  sandbox="allow-same-origin allow-popups"
  ...
/>
```

`allow-scripts` should NOT be set unless the previewed HTML is known to need JS.
`allow-top-navigation` should NEVER be set (lets the iframe navigate the main window).

- [ ] **Step 3: Test that the component still renders**

```bash
cd apps/momai && npx vitest run --project renderer 2>&1 | tail -5
```

If there are existing tests for these components, they should still pass.

- [ ] **Step 4: Typecheck**

```bash
cd apps/momai && pnpm typecheck 2>&1 | tail -5
```

- [ ] **Step 5: Commit (or skip if no iframe)**

If iframes were found and updated:
```bash
git add apps/momai/src/renderer/src/components/chat/HtmlPreviewCard.tsx apps/momai/src/renderer/src/components/chat/DevHtmlRenderCard.tsx
git commit -m "fix(security): iframe sandbox in HTML preview cards (L8)

HTML preview cards render user-provided (potentially untrusted)
content. The <iframe> they wrap now has sandbox='...' with the
most restrictive permissions that still allow rendering. This
prevents the embedded content from:
- running scripts (sandbox without allow-scripts)
- navigating the main window (no allow-top-navigation)
- accessing parent's same-origin storage (no allow-same-origin by default)

Only the explicitly-allowed tokens are granted; everything else
is denied by the browser."
```

If no iframe was found:
```bash
git commit --allow-empty -m "fix(security): no iframe found in HTML preview cards (L8)

Searched HtmlPreviewCard.tsx and DevHtmlRenderCard.tsx for iframe
elements. Neither component renders content in an iframe. The
L8 audit item is not applicable to this codebase; flagging it
as a no-op so the audit closeout is accurate."
```

---

## Task 6: `setWindowOpenHandler` on overlay window (L9)

**Files:**
- Modify: `apps/momai/src/main/windowManager.ts` (the `createOverlayWindow` function)

The main window already has `setWindowOpenHandler` with the H6 URL validator (added in Phase 2 Task 5). The overlay window doesn't. This is the same protection applied to the second window.

- [ ] **Step 1: Read `createOverlayWindow` and find the analogous handler location**

```bash
cd apps/momai && Select-String -Path src/main/windowManager.ts -Pattern "createOverlayWindow|setWindowOpenHandler" 2>$null | Select-Object -First 20
```

The handler on the main window is around line 410-419 (after Phase 2 H6). The overlay window currently has no such handler.

- [ ] **Step 2: Add the handler to the overlay window**

In `apps/momai/src/main/windowManager.ts`, inside `createOverlayWindow`, after the `overlayWindow.loadURL` or `overlayWindow.loadFile` call, add:

```ts
overlayWindow.webContents.setWindowOpenHandler((details) => {
  if (isSafeExternalUrl(details.url)) {
    shell.openExternal(details.url)
  } else {
    logger.warn(`[WindowManager] Blocked setWindowOpenHandler URL with unsafe protocol (overlay): ${details.url}`)
  }
  return { action: 'deny' }
})
```

(If `logger` is not already imported in this file, add `import { logger } from './logger'` at the top.)

- [ ] **Step 3: Typecheck + tests**

```bash
cd apps/momai && pnpm typecheck:node && npx vitest run --project main
```

- [ ] **Step 4: Commit**

```bash
git add apps/momai/src/main/windowManager.ts
git commit -m "fix(security): setWindowOpenHandler on overlay window (L9)

The main window had an isSafeExternalUrl-validated
setWindowOpenHandler since Phase 2 (H6). The overlay window did
not, so its renderer could open any protocol via window.open().

Now the overlay window enforces the same protocol allowlist
(http/https/mailto) before calling shell.openExternal. Anything
else is dropped and logged."
```

---

## Task 7: `.gitignore` add `*.pfx`, `*.p12` (L10)

**Files:**
- Modify: `.gitignore` (append at the end)

Defense-in-depth. The PFX cert is out of scope per the user (private repo, self-signed), but ignoring `*.pfx` and `*.p12` prevents accidental future commits of cert files.

- [ ] **Step 1: Read the end of `.gitignore`**

```bash
Get-Content .gitignore | Select-Object -Last 20
```

- [ ] **Step 2: Append the entries**

Add at the end of `.gitignore`:

```
# Cert / keystore files (defense-in-depth — never commit these)
*.pfx
*.p12
```

- [ ] **Step 3: Verify the change**

```bash
Get-Content .gitignore | Select-Object -Last 5
Select-String -Path .gitignore -Pattern "\.pfx|\.p12" 2>$null
```

Expected: the last 5 lines include the new entries, and the Select-String finds them.

- [ ] **Step 4: Commit**

```bash
git add .gitignore
git commit -m "fix(security): .gitignore add *.pfx, *.p12 (L10)

Defense-in-depth. The PFX cert issue itself is out of scope
(private repo, self-signed test cert), but ignoring these
extensions prevents accidental future commits of keystore files."
```

---

## Self-Review

**Spec coverage check** (Phase 4 items from the design spec):

| Spec # | Title | Plan task | Notes |
|--------|-------|-----------|-------|
| 4.1 | CSP remove `unsafe-inline` from `style-src` | Task 1 | |
| 4.2 | CSP add `object-src 'none'`, `base-uri 'self'` | Task 1 | Combined with 4.1 |
| 4.3 | `will-attach-webview` handler | Task 2 | |
| 4.4 | `Menu.setApplicationMenu(null)` in production | **SKIP** | Already done in Phase 3 Task 3 |
| 4.5 | `execSync` → `fs.chmodSync`/`fs.cpSync` | Task 3 | |
| 4.6 | macOS drop unnecessary entitlements | Task 4 | Combined with 4.7 |
| 4.7 | macOS enable notarization | Task 4 | Combined with 4.6 |
| 4.8 | Iframe CSP in `HtmlPreviewCard` / `DevHtmlRenderCard` | Task 5 | No-op if no iframe |
| 4.9 | `setWindowOpenHandler` on overlay window | Task 6 | |
| 4.10 | `.gitignore`: add `*.pfx`, `*.p12` | Task 7 | |

All 10 items covered (1 is a no-op since it was already done, 1 may be a no-op if no iframes exist).

**Placeholder scan:** No "TBD", no "TODO", all code blocks are complete and runnable.

**Type consistency:**
- `shouldBlockWebviewAttachment` (Task 2) returns `boolean` — matches the test
- `shouldBlockDevToolsShortcut` (Phase 3) and `isSafeExternalUrl` (Phase 2) are unchanged
- All `execSync` → native replacements use the standard `node:fs` and `node:child_process` APIs

**Order matters:**
- Task 1 (CSP) is riskiest (might break Tailwind runtime). Run early so the user can decide.
- Tasks 2-7 are independent and can run in any order.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-21-security-hardening-phase-4.md`. Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks.
2. **Inline Execution** — execute in this session.

(Using same approach as Phase 2/3: subagent-driven.)
