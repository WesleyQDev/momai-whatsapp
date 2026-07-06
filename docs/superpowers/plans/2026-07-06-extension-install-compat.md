# Extension Install & Compatibility — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate hardcoded download_url, make install respect `momai_compat` per-release, add multi-stage progress, and replace Electron native dialogs with proper React components.

**Architecture:** Backend resolves recommended_version dynamically from GitHub releases + `momai_compat` declared per-release (body front-matter, fallback to main manifest). Install flow emits multi-stage NDJSON. Frontend reads stages to render inline progress card, removes `alert()`/`window.confirm()`, adds compat badges.

**Tech Stack:** Node.js (backend), React/TypeScript/Tailwind (frontend), NDJSON streaming (install progress), semver-compat.js (already exists)

---

## File Structure

| Path | Change | Responsibility |
|------|--------|---------------|
| `scripts/node-core/services/community-registry.js` | Modify | Add `parseReleaseCompat()`, `enrichReleasesWithCompat()`; modify `fetchReleases()` |
| `scripts/node-core/api/routes/extensions.routes.js` | Modify | Resolve version in install, multi-stage NDJSON, 409 errors |
| `scripts/node-core/services/skill-orchestrator.js` | Modify | Add `compat_status` field to extension payload |
| `scripts/node-core/tests/registry-compat.test.js` | Create | Test `parseReleaseCompat` + `enrichReleasesWithCompat` |
| `src/renderer/src/services/api.ts` | Modify | New `installExtension` signature, add `InstallProgress` type |
| `src/renderer/src/components/extensions/ExtensionInstallCard.tsx` | Create | Inline install progress card |
| `src/renderer/src/components/extensions/ExtensionUninstallModal.tsx` | Create | Modal for uninstall confirmation |
| `src/renderer/src/views/ExtensionsView.tsx` | Modify | Use new api/component, add compat badge, remove alert/confirm |
| `src/renderer/src/locales/pt-BR.json` | Modify | Add i18n strings |
| `src/renderer/src/locales/en-US.json` | Modify | Add i18n strings |

---

### Task 1: Add parseReleaseCompat + enrichReleasesWithCompat

**Files:**
- Modify: `scripts/node-core/services/community-registry.js:1-205`
- Create: `scripts/node-core/tests/registry-compat.test.js`

- [ ] **Step 1: Write the failing test**

```js
// scripts/node-core/tests/registry-compat.test.js
const { enrichReleasesWithCompat } = require('../services/community-registry')

describe('enrichReleasesWithCompat', () => {
  it('extracts momai_compat from YAML front-matter in release body', () => {
    const raw = [
      { tag_name: 'v0.3.30', body: '---\nmomai_compat: ">=1.4.0 <2.0.0"\n---\nChangelog', assets: [{ name: 'ext.zip', browser_download_url: 'https://ex.com/ext.zip' }], draft: false }
    ]
    const result = enrichReleasesWithCompat(raw, null)
    expect(result[0].momai_compat).toBe('>=1.4.0 <2.0.0')
    expect(result[0].version).toBe('0.3.30')
  })

  it('falls back to manifestCompat when body has no momai_compat', () => {
    const raw = [
      { tag_name: 'v0.4.0', body: 'Changelog only', assets: [{ name: 'ext.zip', browser_download_url: 'https://ex.com/ext2.zip' }], draft: false }
    ]
    const result = enrichReleasesWithCompat(raw, '>=1.5.0 <3.0.0')
    expect(result[0].momai_compat).toBe('>=1.5.0 <3.0.0')
    expect(result[0].version).toBe('0.4.0')
  })

  it('returns null momai_compat when no compat info anywhere', () => {
    const raw = [
      { tag_name: 'v0.1.0', body: '', assets: [{ name: 'ext.zip', browser_download_url: 'https://ex.com/ext3.zip' }], draft: false }
    ]
    const result = enrichReleasesWithCompat(raw, null)
    expect(result[0].momai_compat).toBeNull()
  })

  it('filters out releases without zip asset', () => {
    const raw = [
      { tag_name: 'v0.1.0', body: '', assets: [], draft: false }
    ]
    const result = enrichReleasesWithCompat(raw, null)
    expect(result).toHaveLength(0)
  })

  it('filters out draft releases', () => {
    const raw = [
      { tag_name: 'v0.1.0', body: '', assets: [{ name: 'ext.zip', browser_download_url: 'https://ex.com/ext.zip' }], draft: true }
    ]
    const result = enrichReleasesWithCompat(raw, null)
    expect(result).toHaveLength(0)
  })

  it('sets version stripping leading v', () => {
    const raw = [
      { tag_name: 'v1.2.3', body: '', assets: [{ name: 'ext.zip', browser_download_url: 'https://ex.com/ext.zip' }], draft: false }
    ]
    const result = enrichReleasesWithCompat(raw, null)
    expect(result[0].version).toBe('1.2.3')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/momai; pnpm exec vitest run --project scripts tests/registry-compat.test.js`
Expected: FAIL with "enrichReleasesWithCompat is not a function"

- [ ] **Step 3: Add enrichReleasesWithCompat and parseReleaseCompat to community-registry.js**

In `scripts/node-core/services/community-registry.js`, add BEFORE the class definition:

```js
function parseReleaseCompat(release) {
  if (!release?.body) return null
  const FRONTMATTER_RE = /^\s*-{3,}\s*\n[^]*?momai_compat\s*:\s*["']?([^"'\n]+)["']?/m
  const fm = release.body.match(FRONTMATTER_RE)
  if (fm) return fm[1].trim()
  const NOTE_RE = /momai_compat\s*:\s*["']?([^"'\n]+)["']?/
  const note = release.body.match(NOTE_RE)
  if (note) return note[1].trim()
  return null
}

function enrichReleasesWithCompat(rawReleases, manifestCompat) {
  return rawReleases
    .filter((r) => !r.draft)
    .map((r) => {
      const version = (r.tag_name || '').replace(/^v/i, '').trim()
      const zipAsset = (r.assets || []).find((a) => a.name && a.name.endsWith('.zip'))
      const download_url = zipAsset ? zipAsset.browser_download_url : r.zipball_url || null
      const compatFromBody = parseReleaseCompat(r)
      const momai_compat = compatFromBody || manifestCompat || null
      return {
        version,
        tag: r.tag_name,
        download_url,
        changelog: r.body || '',
        date: r.published_at || r.created_at || null,
        prerelease: r.prerelease || false,
        momai_compat
      }
    })
    .filter((r) => r.version && r.download_url)
}
```

Then replace the `.map(...).filter(...)` block inside `fetchReleases` (lines 159-177) with a call to `enrichReleasesWithCompat`:

```js
// Old code to replace (approximately lines 159-177):
      const releases = ghReleases
        .filter((r) => !r.draft)
        .map((r) => {
          const version = (r.tag_name || '').replace(/^v/i, '').trim()
          const zipAsset = (r.assets || []).find((a) => a.name && a.name.endsWith('.zip'))
          const download_url = zipAsset
            ? zipAsset.browser_download_url
            : r.zipball_url || null

          return {
            version,
            tag: r.tag_name,
            download_url,
            changelog: r.body || '',
            date: r.published_at || r.created_at || null,
            prerelease: r.prerelease || false
          }
        })
        .filter((r) => r.version && r.download_url)

// New code:
      const manifestCompat = null  // caller can set via fetchReleases signature later
      const releases = enrichReleasesWithCompat(ghReleases, manifestCompat)
```

Finally, add the named export after `module.exports = new CommunityRegistryService()`:

```js
module.exports = new CommunityRegistryService()
module.exports.enrichReleasesWithCompat = enrichReleasesWithCompat
module.exports.parseReleaseCompat = parseReleaseCompat
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/momai; pnpm exec vitest run --project scripts tests/registry-compat.test.js`
Expected: 6/6 PASS

- [ ] **Step 5: Run existing tests to ensure no regression**

Run: `cd apps/momai; pnpm exec vitest run --project scripts`
Expected: 192+ pass (no regression)

- [ ] **Step 6: Commit**

```bash
git add scripts/node-core/services/community-registry.js scripts/node-core/tests/registry-compat.test.js
git commit -m "feat(extensions): parse momai_compat from GitHub release body, enrich fetchReleases"
```

---

### Task 2: POST /extensions/install resolves version dynamically

**Files:**
- Modify: `scripts/node-core/api/routes/extensions.routes.js`
- Extend: `scripts/node-core/tests/extensions-install.test.js`

This is the largest backend task. The install flow changes from `{ id, download_url }` to `{ id } | { id, version } | { id, download_url }`. The backend resolves recommended_version, validates compat, and emits multi-stage NDJSON.

- [ ] **Step 1: Write failing test for install flow changes**

In `tests/extensions-install.test.js`, add:

```js
describe('POST /extensions/install with version resolution', () => {
  it('resolves recommended_version when only id is sent', async () => {
    const sendToPersistent = vi.fn().mockResolvedValue({ ok: true })
    const { ctx } = makeCtx({
      skillRegistry: makeRegistryWithSkill({ id: 'fake-skill', manifest: { name: 'Fake' } }),
      extensionHostManager: { sendToPersistent },
      store: { extensions: [] }
    })
    ctx.buildExtensionsPayload = async () => ({ installed: [], registry: [] })

    const handler = createExtensionsRoutes(ctx)
    const res = makeMockRes()
    const handled = await handler(
      { method: 'POST' },
      res,
      '/extensions/install',
      { searchParams: new URLSearchParams() }
    )
    // Should be handled (even if it errors for "no installable release" because no mock registry)
    expect(handled).toBe(true)
  })

  it('handles explicit download_url (backward compat)', async () => {
    const { ctx } = makeCtx({
      skillRegistry: { ...makeRegistryWithSkill({ id: 'test-ext', manifest: {} }),
        refresh: async () => {},
        getAll: () => [],
        getById: () => null,
        loadExtensions: async () => {}
      },
      store: { extensions: [] }
    })
    ctx.buildExtensionsPayload = async () => ({ installed: [], registry: [] })
    const handler = createExtensionsRoutes(ctx)
    const res = makeMockRes()
    const handled = await handler(
      { method: 'POST' },
      res,
      '/extensions/install',
      { searchParams: new URLSearchParams() }
    )
    expect(handled).toBe(true)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails** (extensions-install.test.js already exists, the new tests should fail as behavior not implemented yet)

Run: `cd apps/momai; pnpm exec vitest run --project scripts tests/extensions-install.test.js`
Expected: current tests pass, new test either fails or doesn't test what we need yet.

Now I need to think about this more carefully. The install route currently (line 553+) reads `payload.download_url` and only that. I need to:

1. Add manifest fetching (for `manifestCompat` fallback) inside the install route.
2. After `sendStatus('Baixando...', 0, '0 KB/s')`, replace the entire download/validate block with the new logic.
3. Add multi-stage NDJSON.

This is a big change. Let me break it further.

Actually, let me reconsider the task breakdown. The `extensions-install.test.js` test file mocks HTTP and registry, making it hard to test the new resolution. I'll write a separate helper function for version resolution that's testable without HTTP, then integrate it.

Let me simplify: add a pure function `resolveInstallVersion` helper in `extensions.routes.js` (or a new file), test that, then integrate.

```js
// In extensions.routes.js, add before createExtensionsRoutes:
async function resolveInstallVersion({ id, version, downloadUrl, communityRegistry, skillRegistry, appVersion }) {
  // 1. Get repo from registry
  // 2. Fetch releases
  // 3. If downloadUrl provided: validate + find matching release  
  // 4. If version provided: find release by tag
  // 5. Default: findBestCompatibleRelease
  // 6. Return { release, error: null } or { release: null, error: { status, body } }
}
```

Yes, that's cleaner. Testable without mocking HTTP because we can mock `communityRegistry.fetchReleases`.

- [ ] **Step 3: Implement resolveInstallVersion and wire into install route**

I'll describe the implementation in the plan but it's getting very long. Let me write it out as a readable document.

OK I think I need to simplify the plan because the full code for all tasks would be enormous. Let me write a higher-level but still actionable plan, with clear enough specs that an engineer (or subagent) can implement each task.

Let me rewrite the plan at a more practical granularity — still TDD, still code in each step, but not trying to write every line of every file.<｜end▁of▁thinking｜>Acho que o plano vai ficar muito longo e verboso se eu escrever cada passo em código completo atômico. Vou reescrever com granularidade prática — cada step é implementável, mas sem copiar o spec inteiro em cada task.

<｜｜DSML｜｜tool_calls>
<｜｜DSML｜｜invoke name="write">
<｜｜DSML｜｜parameter name="content" string="true"># Extension Install & Compatibility — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Eliminate hardcoded download_url install, make install respect `momai_compat` per-release, add multi-stage progress, replace Electron native dialogs.

**Architecture:** Backend resolves recommended_version dynamically from GitHub releases. Install flow emits multi-stage NDJSON. Frontend reads stages, renders inline progress card, compat badges, removes `alert()`/`window.confirm()`.

**Tech Stack:** Node.js (backend), React/TypeScript/Tailwind (frontend), NDJSON streaming.

---

## File Map

| File | Change |
|------|--------|
| `scripts/node-core/services/community-registry.js` | Add `parseReleaseCompat()`, `enrichReleasesWithCompat()`; refactor `fetchReleases` to use them |
| `scripts/node-core/api/routes/extensions.routes.js` | Add `resolveInstallVersion()` helper; modify POST /extensions/install for multi-stage NDJSON; add `sendInstallStage` |
| `scripts/node-core/services/skill-orchestrator.js` | Add `compat_status` field to extension payload (lines 118 area) |
| `scripts/node-core/tests/registry-compat.test.js` | 6 tests for enrichReleasesWithCompat |
| `scripts/node-core/tests/extensions-install.test.js` | Extend with install resolution tests using mock |
| `src/renderer/src/services/api.ts` | New `installExtension` signature + `InstallProgress` type |
| `src/renderer/src/components/extensions/ExtensionInstallCard.tsx` | Inline install progress card |
| `src/renderer/src/components/extensions/ExtensionUninstallModal.tsx` | Modal for uninstall confirm |
| `src/renderer/src/views/ExtensionsView.tsx` | Use new api/component, compat badge, rm alert/confirm |
| `src/renderer/src/locales/{pt-BR,en-US}.json` | Add i18n strings |

---

### Task 1: enrichReleasesWithCompat + parseReleaseCompat

**Files:** `community-registry.js`, `tests/registry-compat.test.js`

- Add `parseReleaseCompat(release)` — returns `string|null` from body front-matter YAML or NOTE block.
- Add `enrichReleasesWithCompat(rawReleases, manifestCompat)` — takes raw GitHub API releases array + fallback `momai_compat` string from manifest. Returns the current `fetchReleases` shape + `momai_compat` per item. Does NOT do HTTP.
- Refactor `fetchReleases` to delegate its map/filter logic to `enrichReleasesWithCompat`.
- Export both named functions alongside default class instance.

**Tests (6):**
1. YAML front-matter extracts correctly
2. Falls back to manifestCompat when body has no compat
3. Returns null momai_compat when no compat info anywhere
4. Filters releases without zip asset
5. Filters draft releases
6. Version field strips leading "v"

Run: `cd apps/momai; pnpm exec vitest run --project scripts tests/registry-compat.test.js` → 6/6 pass. Existing scripts tests: 192+ pass, no regression.

---

### Task 2: resolveInstallVersion helper

**Files:** `extensions.routes.js` (add before `createExtensionsRoutes`), `tests/extensions-install.test.js` (extend)

Add a pure async function:

```js
async function resolveInstallVersion({ id, payload, communityRegistry, skillRegistry, appVersion }) {
  // 1. Get repo from communityRegistry.fetchRegistry() or skillRegistry
  // 2. Fetch manifestCompat from communityRegistry.fetchManifest(repo)
  // 3. Fetch releases with enrichReleasesWithCompat(ghReleases, manifestCompat)
  // 4. Select version based on payload:
  //    - payload.downloadUrl → find by browser_download_url match
  //    - payload.version → find by version field
  //    - default → findBestCompatibleRelease(releases, appVersion)
  // 5. If no release found → { ok: false, status: 409, error: 'no_installable_release', ... }
  // 6. If release fails satisfiesRange → { ok: false, status: 409, error: 'incompatible_version', ... }
  // 7. If HEAD on download_url returns <200 or >=300 → { ok: false, status: 409, error: 'release_asset_missing', ... }
  // 8. Returns { ok: true, release: { version, download_url, ... } }
}
```

**Test (mock communityRegistry):**
- `resolveInstallVersion` with no payload.version picks recommended_version from mock releases.
- `resolveInstallVersion` with incompatible versions returns 409 error object.
- `resolveInstallVersion` with explicit version returns that exact version.

Run: `cd apps/momai; pnpm exec vitest run --project scripts tests/extensions-install.test.js` → existing 5 + new 3 pass.

---

### Task 3: Wire resolveInstallVersion into POST /extensions/install

**Files:** `extensions.routes.js` (modify install handler), `tests/extensions-install.test.js`

Replace the current install handler logic:

1. Read payload: `{ id, version?, downloadUrl? }` (note: `downloadUrl` maps to `download_url` in the JSON payload for back-compat).
2. Call `resolveInstallVersion(...)`. If `!result.ok`, return error.
3. Proceed with download using `result.release.download_url`.
4. After download, emit `sendStatus` for each stage instead of only during download.

Add `sendInstallStage(res, stage, { percent, globalPercent, bytesTotal?, bytesDone?, speedBps?, etaSeconds? })` helper that writes NDJSON chunks. Replace `sendStatus` calls with stage-aware version.

Stage mapping during install:
- `sendInstallStage(res, 'downloading', { percent, globalPercent, bytesTotal, bytesDone, speedBps, etaSeconds })`
- Before checksum: `sendInstallStage(res, 'verifying')`
- Before extract: `sendInstallStage(res, 'extracting')`
- Before dependency install: `sendInstallStage(res, 'linking_deps')`
- Before loadExtensions + syncSkillAndToolIndexes: `sendInstallStage(res, 'indexing')`
- Before startPersistent: `sendInstallStage(res, 'starting_worker')`
- On success before res.end: `sendInstallStage(res, 'done')`

**Test**: mock an extensions-install.test.js sentinel that checks NDJSON chunks contain multiple stages (not just `downloading`).

---

### Task 4: Add compat_status to extension payload

**Files:** `skill-orchestrator.js` (modify `buildExtensionsPayload` mapping around line 117)

After line 117 (`momai_compat: manifest.momai_compat || null`), add:

```js
compat_status: (() => {
  if (!manifest.momai_compat) return 'unknown'
  const appVersion = getAppVersion()
  return satisfiesRange(appVersion, manifest.momai_compat) ? 'compatible' : 'incompatible'
})(),
```

This is tested implicitly by existing `skill-orchestrator` usage — no new test needed if existing integration confirms. But add a unit test in `skill-orchestrator.test.js` (or create if none exists) that checks `compat_status` is present for a mocked skill.

---

### Task 5: Frontend Install API + types

**Files:** `src/renderer/src/services/api.ts` (modify)

Add types:

```ts
export type InstallStage =
  | 'downloading' | 'verifying' | 'extracting' | 'linking_deps'
  | 'indexing' | 'starting_worker' | 'done'

export interface InstallProgress {
  stage: InstallStage
  status: string
  percent: number
  global_percent: number
  bytes_total?: number
  bytes_done?: number
  speed_bps?: number
  eta_seconds?: number
}
```

Change `installExtension` signature:

```ts
export async function installExtension(
  id: string,
  opts?: {
    version?: string
    downloadUrl?: string  // deprecated, back-compat only
    onProgress?: (p: InstallProgress) => void
  }
): Promise<void>
```

Body now sends `{ id, version?, download_url? }` instead of always `{ id, download_url }`.

**No explicit test needed** — tested by integration in Task 6.

---

### Task 6: ExtensionInstallCard component

**Files:** Create `src/renderer/src/components/extensions/ExtensionInstallCard.tsx`

A card that displays inline (replaces detached progress bar). It has TWO visual variants in ONE component:

```tsx
interface Props {
  progress?: InstallProgress        // present during in-flight install
  error?: InstallError              // present after onError fires (mutually exclusive with progress)
  extName: string
  onDismiss?: () => void
}
```

Renders progress variant (when `progress` provided):
- Extension name header
- Progress bar (Tailwind `bg-amber-500` with width as `global_percent`%)
- Stage label translated via i18n (`t('extensions.stages.' + progress.stage)`)
- Sub-line: `bytes_done / bytes_total · speed_bps formatted · eta_seconds` (or "Isso pode levar alguns instantes" if `eta_seconds > 30`)
- Dismiss button is hidden during install (or only shown if user wants to cancel — out of scope, omit)

Renders error variant (when `error` provided, `progress` undefined):
- Red/rose background
- Title: `t('extensions.install.error.title')`
- Error body: human-readable string derived from `error.error` code (e.g., `incompatible_version` → "Versão {{release_version}} requer MomAI {{required_range}}")
- Dismiss button

**Note:** Task 5's `InstallStage` union does NOT include `'error'` — errors come through the separate `onError` channel / `InstallError` type. The card should NOT look for `stage === 'error'`.

**Test**: Snapshot test with mock progress for each stage + an error variant.

---

### Task 7: ExtensionUninstallModal component

**Files:** Create `src/renderer/src/components/extensions/ExtensionUninstallModal.tsx`

```tsx
interface Props {
  ext: { id: string; name: string }
  onConfirm: () => void
  onCancel: () => void
}
```

Renders a centered overlay modal with:
- Title: `t('extensions.install.confirmUninstall.title', { name })`
- Body: `t('extensions.install.confirmUninstall.body')`
- Two buttons: Confirm (`t('extensions.install.confirmUninstall.confirm')`) — red/rose — and Cancel.

Does NOT use `window.confirm()`.

**Test**: Snapshot test, unit test that `onConfirm` fires when confirm clicked.

---

### Task 8: Integrate into ExtensionsView

**Files:** `src/renderer/src/views/ExtensionsView.tsx`, `locales/pt-BR.json`, `locales/en-US.json`

Changes:

1. **State**: Replace `installProgress` shape from `{ percent, speed, status }` to `InstallProgress | null`.

2. **handleInstall**: Replace call:
   ```ts
   await installExtension(ext.id, downloadUrl || ext.download_url || '', (progress) => {
     setInstallProgress(progress)
   })
   ```
   with:
   ```ts
   await installExtension(ext.id, {
     onProgress: (p) => setInstallProgress(p)
   })
   ```

3. **Error handling**: replace `alert(t('extensions.errors.install', { error: ... }))` with setting an `error` state that renders an `ExtensionInstallCard` with `stage='error'`.

4. **handleUninstall**: Replace `window.confirm(...)` with showing `ExtensionUninstallModal` state.

5. **Compat badge**: In the installed card loop, read `skill.compat_status`:
   - If `'incompatible'` → add a small red badge "Incompatível" + "Atualizar" button.
   - On "Atualizar" click → `installExtension(skill.id)`.

6. **Loja card**: For extensions in store, fetch `GET /extensions/<id>/releases` when card opens. Cache result in `recommendedVersionByExtId: Map`. If `recommended_version === null`, disable "Instalar" button.

**i18n strings to add** (`pt-BR.json` and `en-US.json`):

```json
"extensions": {
  "stages": {
    "downloading": "Baixando...",
    "verifying": "Verificando integridade...",
    "extracting": "Extraindo arquivos...",
    "linking_deps": "Copiando dependências...",
    "indexing": "Indexando extensão...",
    "starting_worker": "Iniciando worker...",
    "done": "Concluído"
  },
  "install": {
    "eta_seconds": "{{seconds}}s restantes",
    "eta_large": "Isso pode levar alguns instantes",
    "incompatible": "Incompatível com MomAI {{version}}",
    "no_compatible": "Nenhuma versão compatível para MomAI {{version}}",
    "confirmUninstall": {
      "title": "Desinstalar {{name}}?",
      "body": "Os dados salvos da extensão serão mantidos.",
      "confirm": "Desinstalar",
      "cancel": "Cancelar"
    },
    "error": {
      "title": "Erro ao instalar"
    }
  }
}
```

**Test**: Snapshot tests for rendered card states.

---

### Task 9: Resolve what happens in store_test mode with no .dev/

**Files:** Already addressed in prior branch work (registry.js .dev isolation). Nothing new needed here unless tests fail.

The `.dev/` isolation and `store_test` mode changes were already implemented and committed in the branch before this plan. This plan assumes they are already in place. If tests related to `.dev/` fail after implementing this plan, fix as bug — not as a planned task.

---

## Dependency Order

```
Task 1 (parseCompat) → Task 2 (resolve helper) → Task 3 (wire install)
Task 4 (compat_status) → independent of 1-3
Task 5 (frontend API) → depends on Task 3 (NDJSON shape)
Task 6 (card component) → depends on Task 5 (InstallProgress type)
Task 7 (modal component) → independent
Task 8 (integrate) → depends on Task 4, 5, 6, 7
```

Suggested execution order: 1, 4, 2, 3, 5, 6, 7, 8.

---

## Self-Review Checklist

Before declaring done:
- [ ] All 6 registry-compat tests pass
- [ ] Extensions-install tests pass (new 3 + existing 5)
- [ ] `pnpm exec vitest run --project scripts` passes
- [ ] `pnpm typecheck:node` passes
- [ ] `pnpm typecheck:web` passes
- [ ] `pnpm lint` has no new errors
- [ ] No `.git` directory in extension install target (`.dev/` isolation working)
- [ ] `alert()` and `window.confirm()` removed from ExtensionsView.tsx
- [ ] Install progress shows multi-stage on both loja and installed tabs
- [ ] Incompatible extension shows badge + "Atualizar" button
- [ ] No compat info → no badge (unknown treated as compatible)
- [ ] No compatible version found → "Instalar" button disabled with tooltip
