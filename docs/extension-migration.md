# Extension Migration Guide — SDK v1

> **Goal:** Migrate existing extensions to use the MomAI SDK (`momai:sdk`) instead of legacy `window.api` and `window.__skillRendererRegistry` APIs.
>
> **SDK Version:** 1 — **MomAI Compat:** `>=1.4.0 <2.0.0`

---

## Table of Contents

1. [Common Migration Pattern](#common-migration-pattern)
2. [WhatsApp Extension](#whatsapp-extension)
3. [Launcher Extension (MomAI Open)](#launcher-extension-momai-open)
4. [System Info Extension](#system-info-extension)
5. [Bundle Verification](#bundle-verification)

---

## Common Migration Pattern

Every extension follows the same three changes:

### 1. `manifest.json` — Add SDK fields

```diff
 {
   "id": "<id>",
   "name": "<name>",
   "version": "<new-version>",
+  "sdkVersion": 1,
+  "momai_compat": ">=1.4.0 <2.0.0",
   ...
 }
```

### 2. `build.mjs` — Externalize `momai:sdk`

```diff
  esbuild.build({
    ...
-   external: ['react', 'react-dom', 'react/jsx-runtime'],
+   external: ['react', 'react-dom', 'react/jsx-runtime', 'momai:sdk'],
    ...
  })
```

### 3. Source code — Replace legacy APIs

| Old API | New SDK API |
|---------|-------------|
| `window.api.apiFetch(path, { method, body })` | `sdk.api.get/post/put/delete(path, body?)` |
| `window.__skillRendererRegistry?.registerRenderer(t, c)` | `sdk.registry.registerRenderer(t, c)` |
| Raw fetch to `/extensions/<id>/storage` | `sdk.storage.get/set/delete/migrate(key, value?)` |

---

## WhatsApp Extension

**Repo:** [`WesleyQDev/momai-whatsapp-extension`](https://github.com/WesleyQDev/momai-whatsapp-extension)
**Current version:** `0.3.40`
**Target version:** `0.4.0`

### Step 1: `manifest.json`

```diff
 {
   "id": "whatsapp",
   "name": "WhatsApp",
   "version": "0.3.40",
+  "version": "0.4.0",
+  "sdkVersion": 1,
+  "momai_compat": ">=1.4.0 <2.0.0",
   "manifest_version": 1,
   ...
 }
```

### Step 2: `build.mjs`

```diff
-  external: ['react', 'react-dom', 'react/jsx-runtime'],
+  external: ['react', 'react-dom', 'react/jsx-runtime', 'momai:sdk'],
```

### Step 3: Replace `window.api.apiFetch` with `sdk.api`

**Before:**
```typescript
// src/page.tsx, src/panel.tsx, src/background-worker.ts
const response = await window.api.apiFetch('/extensions/whatsapp/send', {
  method: 'POST',
  body: JSON.stringify({ to, text })
})
```

**After:**
```typescript
import sdk from 'momai:sdk'

const { ok, data, error } = await sdk.api.post('/extensions/whatsapp/send', { to, text })
if (!ok) { /* handle error */ }
```

#### Endpoint mapping

| Old (`window.api.apiFetch`) | New (`sdk.api.*`) |
|-----------------------------|-------------------|
| `POST /extensions/whatsapp/send` | `sdk.api.post('/extensions/whatsapp/send', body)` |
| `POST /extensions/whatsapp/process-notification` | `sdk.api.post('/extensions/whatsapp/process-notification', body)` |
| `POST /extensions/whatsapp/command` | `sdk.api.post('/extensions/whatsapp/command', body)` |
| `POST /extensions/whatsapp/disconnect` | `sdk.api.post('/extensions/whatsapp/disconnect')` |
| `POST /extensions/whatsapp/restart` | `sdk.api.post('/extensions/whatsapp/restart')` |
| `POST /extensions/whatsapp/sync` | `sdk.api.post('/extensions/whatsapp/sync')` |
| `GET /extensions/whatsapp/history` | `sdk.api.get('/extensions/whatsapp/history')` |
| `GET /extensions/whatsapp/status` | `sdk.api.get('/extensions/whatsapp/status')` |

### Step 4: Replace storage fetches with `sdk.storage`

**Before:**
```typescript
const data = await window.api.apiFetch('/extensions/whatsapp/storage', {
  method: 'POST',
  body: JSON.stringify({ action: 'get', key: 'settings' })
})
```

**After:**
```typescript
const settings = await sdk.storage.get('settings')
await sdk.storage.set('settings', newSettings)
await sdk.storage.delete('temp')
await sdk.storage.migrate('v1', 'v2', (old) => ({ ...old, version: 2 }))
```

### Step 5: Replace `window.__skillRendererRegistry` with `sdk.registry`

**Before:**
```typescript
window.__skillRendererRegistry?.registerRenderer('whatsapp_notification', NotificationCard)
window.__skillRendererRegistry?.registerRenderer('qr_code', QrCodeCard)
window.__skillRendererRegistry?.registerRenderer('connection_status', ConnectionStatus)
```

**After:**
```typescript
import sdk from 'momai:sdk'

sdk.registry.registerRenderer('whatsapp_notification', NotificationCard)
sdk.registry.registerRenderer('qr_code', QrCodeCard)
sdk.registry.registerRenderer('connection_status', ConnectionStatus)
```

### Step 6: Remove all `window.api` usage

- [ ] `grep -rn 'window\.api' src/` — must return 0
- [ ] `grep -rn 'apiFetch' src/` — must return 0
- [ ] `grep -rn '__skillRendererRegistry' src/` — must return 0
- [ ] All storage calls now use `sdk.storage.*`

### Step 7: Update `dev-extensions.json` in monorepo (both root and `apps/momai/`)

```diff
  {
    "id": "whatsapp",
    "name": "WhatsApp",
    "version": "0.3.40",
+   "version": "0.4.0",
+   "momai_compat": ">=1.4.0 <2.0.0",
    "download_url": "https://github.com/WesleyQDev/momai-whatsapp-extension/releases/download/v0.3.40/momai-whatsapp-extension-v0.3.40.zip",
+   "download_url": "https://github.com/WesleyQDev/momai-whatsapp-extension/releases/download/v0.4.0/momai-whatsapp-extension-v0.4.0.zip",
    ...
  }
```

### Verification Checklist

- [ ] `pnpm build` succeeds in the extension repo
- [ ] `dist/page.js` does not contain `window.api`, `apiFetch`, or `__skillRendererRegistry` (check with `grep`)
- [ ] `dist/page.js` does NOT bundle `momai:sdk` — it remains as `import "momai:sdk"`
- [ ] `dist/panel.js` same verification
- [ ] `dist/background-worker.js` same verification (if exists)
- [ ] Symlink test: extension loads in dev mode
- [ ] Store test: extension installs and loads in store_test mode
- [ ] `sdk.has('api.get')` returns `true` inside the extension
- [ ] API calls return `{ ok, data?, error? }` format
- [ ] Release published as `v0.4.0` on GitHub
- [ ] `dev-extensions.json` updated in monorepo
- [ ] `community-extensions.json` updated (if applicable)

---

## Launcher Extension (MomAI Open)

**Repo:** [`WesleyQDev/momai-open`](https://github.com/WesleyQDev/momai-open)
**Current version:** `1.0.0`
**Target version:** `1.1.0`

### Step 1: `manifest.json`

```diff
 {
   "id": "launcher",
   "name": "MomAI Open",
   "version": "1.0.0",
+  "version": "1.1.0",
+  "sdkVersion": 1,
+  "momai_compat": ">=1.4.0 <2.0.0",
   ...
 }
```

### Step 2: `build.mjs`

```diff
-  external: ['react', 'react-dom', 'react/jsx-runtime'],
+  external: ['react', 'react-dom', 'react/jsx-runtime', 'momai:sdk'],
```

### Step 3: Replace `window.api.apiFetch` with `sdk.api`

**Before:**
```typescript
const result = await window.api.apiFetch('/extensions/launcher/open', {
  method: 'POST',
  body: JSON.stringify({ query })
})
```

**After:**
```typescript
import sdk from 'momai:sdk'

const { ok, data } = await sdk.api.post('/extensions/launcher/open', { query })
```

#### Endpoint mapping

| Old (`window.api.apiFetch`) | New (`sdk.api.*`) |
|-----------------------------|-------------------|
| `POST /extensions/launcher/open` | `sdk.api.post('/extensions/launcher/open', body)` |
| `POST /extensions/launcher/search` | `sdk.api.post('/extensions/launcher/search', body)` |
| `POST /extensions/launcher/reindex` | `sdk.api.post('/extensions/launcher/reindex')` |
| `GET /extensions/launcher/status` | `sdk.api.get('/extensions/launcher/status')` |

> **Note:** Launcher endpoints still start with `/extensions/launcher/...` — the SDK only wraps the fetch mechanism. The anti-leak rule (`extension-ui-no-leak.md`) forbids hardcoding launcher routes in the **main app**, not in the extension itself.

### Step 4: Replace storage with `sdk.storage`

- [ ] `sdk.storage.get('shortcuts')` replaces raw storage fetch
- [ ] `sdk.storage.set('shortcuts', ...)`
- [ ] `sdk.storage.get('config')`
- [ ] `sdk.storage.set('config', ...)`

### Step 5: Verify no `window.__` usages

- [ ] `grep -rn 'window\.' src/` — only `window.api` references being replaced; after migration, zero
- [ ] No `window.__skillRendererRegistry` references (Launcher is mostly backend, but verify)

### Step 6: Update `dev-extensions.json` in monorepo

```diff
  {
    "id": "launcher",
    "version": "1.0.0",
+   "version": "1.1.0",
+   "momai_compat": ">=1.4.0 <2.0.0",
    "download_url": "https://github.com/WesleyQDev/momai-open/archive/refs/heads/main.zip",
+   "download_url": "https://github.com/WesleyQDev/momai-open/releases/download/v1.1.0/momai-open-v1.1.0.zip",
    ...
  }
```

### Verification Checklist

- [ ] `pnpm build` succeeds
- [ ] `momai:sdk` externalized (not bundled)
- [ ] No `window.api` or `apiFetch` in bundles
- [ ] Symlink mode works
- [ ] Store install works
- [ ] `sdk.has('api.post')` returns `true` at runtime
- [ ] Release `v1.1.0` published on GitHub
- [ ] `dev-extensions.json` updated
- [ ] `community-extensions.json` updated (if applicable)

---

## System Info Extension

**Repo:** [`WesleyQDev/momai-system-info`](https://github.com/WesleyQDev/momai-system-info)
**Current version:** `0.1.0`
**Target version:** `0.2.0`

### Step 1: `manifest.json`

```diff
 {
   "id": "system_info",
   "name": "Dashboard do Sistema",
   "version": "0.1.0",
+  "version": "0.2.0",
+  "sdkVersion": 1,
+  "momai_compat": ">=1.4.0 <2.0.0",
   ...
 }
```

### Step 2: `build.mjs`

```diff
-  external: ['react', 'react-dom', 'react/jsx-runtime'],
+  external: ['react', 'react-dom', 'react/jsx-runtime', 'momai:sdk'],
```

### Step 3: Replace API calls with `sdk.api`

**Before:**
```typescript
const stats = await window.api.apiFetch('/extensions/system_info/stats')
```

**After:**
```typescript
import sdk from 'momai:sdk'

const { data: stats } = await sdk.api.get('/extensions/system_info/stats')
```

#### Endpoint mapping

| Old (`window.api.apiFetch`) | New (`sdk.api.*`) |
|-----------------------------|-------------------|
| `GET /extensions/system_info/stats` | `sdk.api.get('/extensions/system_info/stats')` |
| `POST /extensions/system_info/refresh` (if applicable) | `sdk.api.post('/extensions/system_info/refresh')` |

### Step 4: Verify no legacy API usage

- [ ] `grep -rn 'window\.api' src/` — must return 0
- [ ] `grep -rn 'apiFetch' src/` — must return 0
- [ ] `grep -rn '__skillRendererRegistry' src/` — must return 0

### Step 5: Update `dev-extensions.json` in monorepo

```diff
  {
    "id": "system_info",
    "version": "0.1.0",
+   "version": "0.2.0",
+   "momai_compat": ">=1.4.0 <2.0.0",
    "download_url": "https://github.com/WesleyQDev/momai-system-info/archive/refs/tags/v0.1.zip",
+   "download_url": "https://github.com/WesleyQDev/momai-system-info/releases/download/v0.2.0/momai-system-info-v0.2.0.zip",
    ...
  }
```

### Verification Checklist

- [ ] `pnpm build` succeeds
- [ ] `momai:sdk` externalized (not bundled in `dist/`)
- [ ] No `window.api` or `apiFetch` in bundles
- [ ] Symlink mode works (dashboard loads and polls stats)
- [ ] Store install works
- [ ] `sdk.has('api.get')` returns `true` at runtime
- [ ] Release `v0.2.0` published on GitHub
- [ ] `dev-extensions.json` updated in monorepo
- [ ] `community-extensions.json` updated (if applicable)

---

## Bundle Verification

After migrating any extension, verify the bundle output:

```bash
# Check for bundled SDK (should NOT be bundled)
grep 'momai:sdk' dist/page.js
# Expected: a dynamic import or bare specifier, NOT inlined code

# Check for legacy API usage (should NOT exist)
grep -n 'window\.api' dist/page.js
# Expected: no matches

grep -n 'apiFetch' dist/page.js
# Expected: no matches

grep -n '__skillRendererRegistry' dist/page.js
# Expected: no matches
```

### File-by-file checklist template

```markdown
## File: src/page.tsx
- [ ] All `window.api.apiFetch` → `sdk.api.get/post/put/delete`
- [ ] All `window.__skillRendererRegistry` → `sdk.registry.registerRenderer`
- [ ] Storage fetches → `sdk.storage.*`
- [ ] Added `import sdk from 'momai:sdk'`

## File: src/panel.tsx
- [ ] Same as above

## File: src/background-worker.ts (if exists)
- [ ] Same as above

## File: build.mjs
- [ ] `'momai:sdk'` added to `external` array
- [ ] Format remains `'esm'`

## File: manifest.json
- [ ] `sdkVersion: 1` added
- [ ] `momai_compat`: `">=1.4.0 <2.0.0"` added
- [ ] `version` bumped
```
