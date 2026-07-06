# Fix Extension Info Consistency (Before vs After Download)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make extension detail view show consistent information before and after download by fetching `manifest.json` from the GitHub repo before install (Obsidian pattern).

**Architecture:** Add a backend endpoint `GET /extensions/:id/manifest` that fetches `manifest.json` from the extension's GitHub repo. The renderer calls this when opening the detail view for a community (not-installed) extension, merging the manifest data into the extension object before display. Also fix hardcoded icon/icon_bg values by adding `icon_bg` to the packaged extension manifests and removing hardcoded fallbacks.

**Tech Stack:** Node.js (backend endpoint), TypeScript/React (renderer), existing `community-registry.js` service.

---

## Problem Analysis

| Field | Before Download (community catalog) | After Download (manifest.json) |
|-------|--------------------------------------|-------------------------------|
| `icon` | `"RocketLaunch"` or `"WhatsApp"` (string name) | Inline SVG or `"launcher"` (from manifest) |
| `icon_bg` | `null` | `null` (neither manifest defines it) |
| `theme` | `null` | `{ gradient, accent }` (from manifest) |
| `readme` | Short description only | Full README.md content |
| `riskLevel` | Not present | `'low'`/`'medium'`/`'high'` |
| `permissionSummary` | Not present | Array from manifest |
| `stars` | `0` | Fetched from GitHub API |
| `tags` | From catalog (often empty) | From SKILL.md frontmatter |

Additionally, `getIconBgStyle()` in `ExtensionsView.tsx` has hardcoded WhatsApp/Launcher fallbacks that violate the extension anti-leak rule.

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `apps/momai/scripts/node-core/api/routes/extensions.routes.js` | Modify | Add `GET /extensions/:id/manifest` endpoint |
| `apps/momai/scripts/node-core/services/community-registry.js` | Modify | Add `fetchManifest(repo)` method |
| `apps/momai/src/renderer/src/services/api.ts` | Modify | Add `fetchExtensionManifest(id)` function |
| `apps/momai/src/renderer/src/views/ExtensionsView.tsx` | Modify | Fetch manifest on detail open, remove hardcoded icon_bg |
| `apps/momai/scripts/skills/packaged/whatsapp/manifest.json` | Modify | Add `icon_bg` field |
| `apps/momai/scripts/skills/packaged/launcher/manifest.json` | Modify | Add `icon_bg` and `theme` fields |

---

### Task 1: Add `fetchManifest(repo)` to community-registry.js

**Files:**
- Modify: `apps/momai/scripts/node-core/services/community-registry.js:24-142`

- [ ] **Step 1: Add the fetchManifest method**

Add after the `_fetchStarsInBackground` method (around line 125):

```javascript
async fetchManifest(repo) {
  const url = `https://raw.githubusercontent.com/${repo}/main/manifest.json`
  try {
    console.log(`[CommunityRegistry] Fetching manifest for ${repo}...`)
    const data = await this._httpGet(url)
    return JSON.parse(data)
  } catch (e) {
    console.warn(`[CommunityRegistry] Failed to fetch manifest for ${repo}:`, e.message)
    return null
  }
}
```

- [ ] **Step 2: Verify no syntax errors**

Run: `node -c apps/momai/scripts/node-core/services/community-registry.js`
Expected: No output (success)

- [ ] **Step 3: Commit**

```bash
git add apps/momai/scripts/node-core/services/community-registry.js
git commit -m "feat(registry): add fetchManifest method for pre-install detail view"
```

---

### Task 2: Add `GET /extensions/:id/manifest` endpoint

**Files:**
- Modify: `apps/momai/scripts/node-core/api/routes/extensions.routes.js` (add route before the `POST /extensions/install` handler, around line 435)

- [ ] **Step 1: Add the manifest endpoint**

Insert before the `POST /extensions/install` handler:

```javascript
// Fetch manifest.json from GitHub repo for pre-install detail view
if (pathname.match(/^\/extensions\/[^/]+\/manifest$/) && req.method === 'GET') {
  const id = pathname.split('/')[2]
  try {
    const community = await communityRegistry.fetchRegistry()
    const item = community.find((e) => e.id === id)
    if (!item || !item.repo) {
      sendJson(res, 404, { error: 'extension not found in community registry' })
      return true
    }
    const manifest = await communityRegistry.fetchManifest(item.repo)
    if (!manifest) {
      sendJson(res, 404, { error: 'manifest not found in repo' })
      return true
    }
    sendJson(res, 200, manifest)
  } catch (err) {
    console.error(`[ExtensionsAPI] Error fetching manifest for ${id}:`, err)
    sendJson(res, 500, { error: 'failed to fetch manifest' })
  }
  return true
}
```

Also add the communityRegistry import at the top of the file if not already present:

```javascript
const communityRegistry = require('../../services/community-registry')
```

- [ ] **Step 2: Verify syntax**

Run: `node -c apps/momai/scripts/node-core/api/routes/extensions.routes.js`
Expected: No output (success)

- [ ] **Step 3: Commit**

```bash
git add apps/momai/scripts/node-core/api/routes/extensions.routes.js
git commit -m "feat(extensions): add GET /extensions/:id/manifest endpoint"
```

---

### Task 3: Add `fetchExtensionManifest()` to renderer API

**Files:**
- Modify: `apps/momai/src/renderer/src/services/api.ts` (add after `fetchExtensionRegistry` function, around line 490)

- [ ] **Step 1: Add the fetch function**

```typescript
export async function fetchExtensionManifest(id: string): Promise<Record<string, any> | null> {
  try {
    const response = await apiFetch(`${API_URL}/extensions/${id}/manifest`)
    if (!response.ok) return null
    return response.json()
  } catch {
    return null
  }
}
```

- [ ] **Step 2: Add import in ExtensionsView.tsx**

In `apps/momai/src/renderer/src/views/ExtensionsView.tsx`, add `fetchExtensionManifest` to the import from `api.ts` (around line 96):

```typescript
import {
  fetchExtensions,
  installExtension,
  toggleExtension,
  uninstallExtension,
  fetchExtensionManifest,
  Extension
} from '../services/api'
```

- [ ] **Step 3: Commit**

```bash
git add apps/momai/src/renderer/src/services/api.ts apps/momai/src/renderer/src/views/ExtensionsView.tsx
git commit -m "feat(renderer): add fetchExtensionManifest API function"
```

---

### Task 4: Fetch manifest on detail view open for community extensions

**Files:**
- Modify: `apps/momai/src/renderer/src/views/ExtensionsView.tsx` (modify the card click handler and detail view)

- [ ] **Step 1: Add manifest loading state**

In the `ExtensionsView` component, add a new state for the manifest (around line 882, after `selectedSkill`):

```typescript
const [selectedManifest, setSelectedManifest] = useState<Record<string, any> | null>(null)
```

- [ ] **Step 2: Create enriched extension helper**

Add a helper function that merges manifest data into the extension object (before the component, around line 868):

```typescript
function enrichExtensionWithManifest(ext: Extension, manifest: Record<string, any>): Extension {
  if (!manifest) return ext
  return {
    ...ext,
    icon: manifest.icon || ext.icon,
    icon_url: manifest.icon_url || ext.icon_url,
    icon_bg: manifest.icon_bg || ext.icon_bg,
    theme: manifest.theme || ext.theme,
    tags: manifest.tags?.length ? manifest.tags : ext.tags,
    version: manifest.version || ext.version,
    author: manifest.author || ext.author,
    permissionSummary: manifest._permSummary?.length ? manifest._permSummary : ext.permissionSummary,
    riskLevel: manifest._riskLevel || ext.riskLevel,
  }
}
```

- [ ] **Step 3: Fetch manifest when selecting a community extension**

Find the card click handler that calls `setSelectedSkill(ext)`. There should be a handler like `onClick={() => setSelectedSkill(ext)}`. Modify it to also fetch the manifest for non-installed extensions:

```typescript
const handleSelectSkill = async (ext: Extension) => {
  setSelectedSkill(ext)
  setSelectedManifest(null)
  if (!ext.installed && ext.repo) {
    const manifest = await fetchExtensionManifest(ext.id)
    setSelectedManifest(manifest)
  }
}
```

Then replace all `setSelectedSkill(ext)` calls in card click handlers with `handleSelectSkill(ext)`.

- [ ] **Step 4: Use enriched extension in detail view**

Where `selectedSkill` is used in the detail view, create an enriched version:

```typescript
const displaySkill = selectedManifest
  ? enrichExtensionWithManifest(selectedSkill!, selectedManifest)
  : selectedSkill!
```

Replace `selectedSkill` with `displaySkill` in the detail view JSX (the sections showing icon, gradient, readme, permissions, risk level, etc.).

- [ ] **Step 5: Verify no regressions**

Run: `cd apps/momai && pnpm typecheck:web`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add apps/momai/src/renderer/src/views/ExtensionsView.tsx
git commit -m "feat(extensions): fetch manifest before download for consistent detail view"
```

---

### Task 5: Add `icon_bg` to packaged extension manifests

**Files:**
- Modify: `apps/momai/scripts/skills/packaged/whatsapp/manifest.json`
- Modify: `apps/momai/scripts/skills/packaged/launcher/manifest.json`

- [ ] **Step 1: Add icon_bg to WhatsApp manifest**

Add `icon_bg` field to `apps/momai/scripts/skills/packaged/whatsapp/manifest.json`:

```json
{
  "icon_bg": "#25D366",
  "icon": "<svg ...>...</svg>",
  "theme": {
    "gradient": "from-emerald-500 to-green-600",
    "accent": "emerald"
  }
}
```

- [ ] **Step 2: Add icon_bg and theme to Launcher manifest**

Add `icon_bg` and `theme` fields to `apps/momai/scripts/skills/packaged/launcher/manifest.json`:

```json
{
  "icon_bg": "#0066CC",
  "icon": "launcher",
  "theme": {
    "gradient": "from-blue-500 to-indigo-600",
    "accent": "blue"
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/momai/scripts/skills/packaged/whatsapp/manifest.json apps/momai/scripts/skills/packaged/launcher/manifest.json
git commit -m "fix(extensions): add icon_bg to packaged extension manifests"
```

---

### Task 6: Remove hardcoded icon_bg fallbacks from renderer

**Files:**
- Modify: `apps/momai/src/renderer/src/views/ExtensionsView.tsx:224-246`

- [ ] **Step 1: Remove hardcoded WhatsApp/Launcher fallbacks from getIconBgStyle**

Replace the `getIconBgStyle` function:

```typescript
function getIconBgStyle(skill: Extension) {
  const iconBg = skill.icon_bg || skill.manifest?.icon_bg
  if (iconBg) {
    if (iconBg.startsWith('#') || iconBg.startsWith('rgb') || iconBg.includes('gradient')) {
      return { background: iconBg }
    }
  }
  return undefined
}
```

This removes the hardcoded `nameLower.includes('whatsapp')` and `nameLower.includes('launcher')` branches. The `icon_bg` now comes exclusively from the manifest (Task 5 adds it).

- [ ] **Step 2: Verify no regressions in typecheck**

Run: `cd apps/momai && pnpm typecheck:web`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add apps/momai/src/renderer/src/views/ExtensionsView.tsx
git commit -m "fix(extensions): remove hardcoded icon_bg fallbacks from renderer"
```

---

### Task 7: End-to-end verification

- [ ] **Step 1: Run lint**

Run: `cd apps/momai && pnpm lint`
Expected: No new errors

- [ ] **Step 2: Run typecheck**

Run: `cd apps/momai && pnpm typecheck`
Expected: No errors

- [ ] **Step 3: Run tests**

Run: `cd apps/momai && pnpm test`
Expected: All tests pass

- [ ] **Step 4: Manual smoke test**

1. `pnpm dev` in the monorepo root
2. Open the Extensions store
3. Click on a community extension (not installed) -> detail view should show icon, gradient, version, author from manifest.json (fetched from GitHub)
4. Install the extension -> detail view should show the same data (from disk manifest)
5. No visual "jump" between pre-install and post-install states
6. Check that WhatsApp shows green `#25D366` background, Launcher shows blue `#0066CC` background
7. Check that extensions without `icon_bg` fall back to gradient properly

- [ ] **Step 5: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix(extensions): address review feedback"
```
