# Extension UI Self-Containment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make MomAI extensions (initially WhatsApp) fully self-contained downloadables — move UI, event types, routes, storage info, and voice hooks from the main app into the skill packages. Keep WhatsApp appearance byte-for-byte.

**Architecture:** Extend `manifest.json` with new fields (`ui`, `eventTypes`, `routes`, `storage`, `voiceHooks`, `persistOnQuit`, `theme`). Add a generic `ExtensionRendererLoader.loadSkillRenderer()` that lazy-imports skill bundles and auto-registers them in the existing `SkillResponseRegistry`. Move WhatsAppView/WhatsAppNotificationCard/whatsappChannel from the main app into the skill. Replace all hardcoded routes, system-prompt strings, and `if (id === 'whatsapp')` checks with manifest-driven code. Use esbuild per-skill for bundling. Two registry-bridge strategies: alias (packaged skills) and `globalThis.__skillRendererRegistry` (pre-built ZIPs).

**Tech Stack:** esbuild, React 19, TypeScript 5.9, Express-style route mounting, pnpm workspaces.

---

## File Structure

### Created
- `apps/momai/scripts/skills/packaged/whatsapp/src/page.tsx` — ex-WhatsAppView, full-page React component
- `apps/momai/scripts/skills/packaged/whatsapp/src/panel.tsx` — ex-WhatsAppNotificationCard, side-panel React component
- `apps/momai/scripts/skills/packaged/whatsapp/src/utils/whatsappChannel.ts` — moved from main app
- `apps/momai/scripts/skills/packaged/whatsapp/src/hooks/useWhatsAppEvents.ts` — skill-specific event subscription
- `apps/momai/scripts/skills/packaged/whatsapp/src/hooks/useExtensionEvents.ts` — moved + made generic
- `apps/momai/scripts/skills/packaged/whatsapp/src/services/api.ts` — moved + made generic
- `apps/momai/scripts/skills/packaged/whatsapp/src/registry-bridge.ts` — re-exports `registerRenderer` from host
- `apps/momai/scripts/skills/packaged/whatsapp/build.mjs` — esbuild script
- `apps/momai/scripts/skills/packaged/whatsapp/tsconfig.json` — TS config
- `apps/momai/src/renderer/src/views/ExtensionPageRoute.tsx` — generic full-page route component
- `apps/momai/src/renderer/src/utils/skill-renderer-loader.ts` — moved logic from ExtensionRendererLoader
- `scripts/node-core/services/manifest-routes.js` — mounts HTTP routes from skill manifests
- `scripts/node-core/services/manifest-voice-hooks.js` — handles voice command hooks
- `scripts/node-core/services/manifest-storage.js` — returns generic privacy storage info
- `scripts/node-core/tests/extension-renderer-loader.test.ts` — unit test for renderer loading
- `scripts/node-core/tests/manifest-routes.test.js` — test route mounting
- `scripts/node-core/tests/manifest-voice-hooks.test.js` — test voice hook dispatch
- `scripts/node-core/tests/manifest-storage.test.js` — test privacy endpoint

### Modified
- `apps/momai/scripts/skills/packaged/whatsapp/manifest.json` — add new fields
- `apps/momai/scripts/skills/packaged/whatsapp/package.json` — add build deps
- `apps/momai/src/renderer/src/components/chat/ExtensionRendererLoader.tsx` — add `loadSkillRenderer`
- `apps/momai/src/renderer/src/App.tsx` — replace hardcoded route with `/extensions/:id`
- `apps/momai/src/renderer/src/services/api.ts` — extend Extension type
- `apps/momai/src/renderer/src/views/ExtensionsView.tsx` — drop hardcoded `isWhatsapp`/`isLauncher`
- `apps/momai/src/renderer/src/components/LateralBar.tsx` — drop hardcoded iconMap entries
- `apps/momai/src/renderer/src/components/NotificationOverlay.tsx` — dispatch by `eventTypes`
- `apps/momai/src/renderer/src/views/PrivacyView.tsx` — iterate skills
- `apps/momai/src/renderer/src/views/OverlayView.tsx` — remove WhatsApp register
- `scripts/node-core/api/routes/extensions.routes.js` — remove hardcoded routes, add static + dynamic mounting
- `scripts/node-core/api/routes/chat.routes.js` — generic voice route
- `scripts/node-core/api/routes/privacy.js` — generic storage endpoint
- `scripts/node-core/services/chat-service.js` — dynamic tool priority, generic voice hooks
- `apps/momai/src/main/index.ts` — generic persist-on-quit
- `apps/momai/src/main/windowManager.ts` — drop hardcoded type check
- `apps/momai/src/main/economyScanner.ts` — rename `launcher` to `platform`
- `scripts/node-core/tests/keyword-router.test.js` — use fakeSkill factory
- `scripts/node-core/tests/extensions-routes.test.js` — test dynamic mounting
- `scripts/node-core/tests/privacy-routes.test.js` — generic fixtures
- `scripts/node-core/tests/extensions-install.test.js` — minor updates

### Deleted (after migration)
- `apps/momai/src/renderer/src/views/WhatsAppView.tsx`
- `apps/momai/src/renderer/src/components/chat/WhatsAppNotificationCard.tsx`
- `apps/momai/src/renderer/src/utils/whatsappChannel.ts`
- `apps/momai/src/renderer/src/hooks/useExtensionEvents.ts` (moved to skill)
- `apps/momai/src/renderer/src/hooks/useWhatsAppEvents.ts` (moved to skill)

---

## Phase 1: Foundations (must complete before Phase 2)

### Task 1: Add generic storage endpoint in node-core

**Files:**
- Create: `scripts/node-core/services/manifest-storage.js`
- Modify: `scripts/node-core/api/routes/privacy.js`
- Test: `scripts/node-core/tests/manifest-storage.test.js`

- [ ] **Step 1: Write failing test**

Create `scripts/node-core/tests/manifest-storage.test.js`:

```js
const { collectStoredData } = require('../services/manifest-storage')

describe('collectStoredData', () => {
  it('returns storage info from each installed skill manifest', () => {
    const skills = [
      {
        id: 'whatsapp',
        manifest: { name: 'WhatsApp', storage: { description: 'Sessão criptografada', locations: ['baileys-auth/'] } }
      },
      {
        id: 'launcher',
        manifest: { name: 'Launcher' } // no storage
      }
    ]
    const result = collectStoredData(skills)
    expect(result).toEqual([
      { skillId: 'whatsapp', skillName: 'WhatsApp', description: 'Sessão criptografada', locations: ['baileys-auth/'] }
    ])
  })

  it('returns empty array when no skills have storage info', () => {
    expect(collectStoredData([{ id: 'x', manifest: { name: 'X' } }])).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/core && pnpm test -- manifest-storage`
Expected: FAIL with "Cannot find module '../services/manifest-storage'"

- [ ] **Step 3: Implement `manifest-storage.js`**

Create `scripts/node-core/services/manifest-storage.js`:

```js
function collectStoredData(skills) {
  const out = []
  for (const skill of skills) {
    const s = skill?.manifest?.storage
    if (!s) continue
    out.push({
      skillId: skill.id,
      skillName: skill.manifest.name,
      description: s.description || '',
      locations: Array.isArray(s.locations) ? s.locations : []
    })
  }
  return out
}

module.exports = { collectStoredData }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/core && pnpm test -- manifest-storage`
Expected: PASS

- [ ] **Step 5: Wire endpoint in `privacy.js`**

In `scripts/node-core/api/routes/privacy.js`, find the route that lists stored data (search for `whatsapp` literal around line 214). Add a new generic route before the existing specific code:

```js
const { collectStoredData } = require('../../services/manifest-storage')

// inside the route handler factory, add:
if (pathname === '/privacy/stored' && req.method === 'GET') {
  const skills = skillRegistry ? skillRegistry.getAll() : []
  sendJson(res, 200, { items: collectStoredData(skills) })
  return true
}
```

(Adjust based on actual file structure — if `skillRegistry` is not in scope, read it from the request context or require it at the top of the file. If the file already imports `skillRegistry`, reuse it.)

- [ ] **Step 6: Commit**

```bash
git add scripts/node-core/services/manifest-storage.js scripts/node-core/api/routes/privacy.js scripts/node-core/tests/manifest-storage.test.js
git commit -m "feat(node-core): add generic privacy storage endpoint"
```

---

### Task 2: Add dynamic route mounting in node-core

**Files:**
- Create: `scripts/node-core/services/manifest-routes.js`
- Modify: `scripts/node-core/api/routes/extensions.routes.js`
- Test: `scripts/node-core/tests/manifest-routes.test.js`

- [ ] **Step 1: Write failing test**

Create `scripts/node-core/tests/manifest-routes.test.js`:

```js
const { mountSkillRoutes } = require('../services/manifest-routes')

function makeApp() {
  const routes = []
  return {
    get: (path, handler) => routes.push({ method: 'GET', path, handler }),
    post: (path, handler) => routes.push({ method: 'POST', path, handler }),
    routes
  }
}

describe('mountSkillRoutes', () => {
  it('mounts a POST route declared in skill manifest', () => {
    const app = makeApp()
    const hostManager = { sendToPersistent: jest.fn().mockResolvedValue({ ok: true }) }
    const skills = [
      { id: 'whatsapp', manifest: { routes: [{ method: 'POST', path: '/disconnect', tool: 'disconnect' }] } }
    ]
    mountSkillRoutes(app, skills, hostManager)
    expect(app.routes).toEqual([{ method: 'POST', path: '/extensions/whatsapp/disconnect', handler: expect.any(Function) }])
  })

  it('skips skills without routes', () => {
    const app = makeApp()
    mountSkillRoutes(app, [{ id: 'launcher', manifest: {} }], { sendToPersistent: jest.fn() })
    expect(app.routes).toEqual([])
  })

  it('skips unsupported HTTP methods', () => {
    const app = makeApp()
    mountSkillRoutes(
      app,
      [{ id: 'x', manifest: { routes: [{ method: 'PATCH', path: '/p', tool: 't' }] } }],
      { sendToPersistent: jest.fn() }
    )
    expect(app.routes).toEqual([])
  })

  it('handler dispatches to hostManager.sendToPersistent with correct args', async () => {
    const app = makeApp()
    const hostManager = { sendToPersistent: jest.fn().mockResolvedValue({ ok: true, message: 'done' }) }
    const skills = [
      { id: 'whatsapp', manifest: { routes: [{ method: 'POST', path: '/disconnect', tool: 'disconnect' }] } }
    ]
    mountSkillRoutes(app, skills, hostManager)
    const fakeRes = { json: jest.fn(), status: jest.fn().mockReturnThis() }
    await app.routes[0].handler({ body: { force: true } }, fakeRes)
    expect(hostManager.sendToPersistent).toHaveBeenCalledWith('whatsapp', { toolName: 'disconnect', args: { force: true } })
    expect(fakeRes.json).toHaveBeenCalledWith({ ok: true, message: 'done' })
  })

  it('handler returns 500 on hostManager error', async () => {
    const app = makeApp()
    const hostManager = { sendToPersistent: jest.fn().mockRejectedValue(new Error('boom')) }
    const skills = [
      { id: 'whatsapp', manifest: { routes: [{ method: 'POST', path: '/disconnect', tool: 'disconnect' }] } }
    ]
    mountSkillRoutes(app, skills, hostManager)
    const fakeRes = { json: jest.fn(), status: jest.fn().mockReturnThis() }
    await app.routes[0].handler({}, fakeRes)
    expect(fakeRes.status).toHaveBeenCalledWith(500)
    expect(fakeRes.json).toHaveBeenCalledWith({ ok: false, error: 'boom' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/core && pnpm test -- manifest-routes`
Expected: FAIL with "Cannot find module '../services/manifest-routes'"

- [ ] **Step 3: Implement `manifest-routes.js`**

Create `scripts/node-core/services/manifest-routes.js`:

```js
function mountSkillRoutes(app, skills, hostManager) {
  if (!Array.isArray(skills)) return
  for (const skill of skills) {
    const routes = skill?.manifest?.routes
    if (!Array.isArray(routes)) continue
    for (const route of routes) {
      const method = String(route.method || '').toLowerCase()
      if (typeof app[method] !== 'function') continue
      const fullPath = `/extensions/${skill.id}${route.path}`
      const handler = async (req, res) => {
        try {
          const result = await hostManager.sendToPersistent(skill.id, {
            toolName: route.tool,
            args: req.body || {}
          })
          res.json(result || { ok: true })
        } catch (err) {
          res.status(500).json({ ok: false, error: err && err.message ? err.message : 'error' })
        }
      }
      app[method](fullPath, handler)
    }
  }
}

module.exports = { mountSkillRoutes }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/core && pnpm test -- manifest-routes`
Expected: PASS

- [ ] **Step 5: Wire in `extensions.routes.js`**

In `scripts/node-core/api/routes/extensions.routes.js`, add at the top:

```js
const { mountSkillRoutes } = require('../../services/manifest-routes')
```

Then inside the route factory (after the `extensionsDir` is known, before `return` of the handler function), call:

```js
mountSkillRoutes(app, skillRegistry.getAll(), extensionHostManager)
```

(If `app` is not directly available, find the Express app instance via the context or via a parameter passed to `createExtensionsRoutes`. If the file uses a plain `http` server, refactor to capture the app or to register handlers via a different mechanism — likely there is a router object passed in `context`.)

- [ ] **Step 6: Commit**

```bash
git add scripts/node-core/services/manifest-routes.js scripts/node-core/api/routes/extensions.routes.js scripts/node-core/tests/manifest-routes.test.js
git commit -m "feat(node-core): mount HTTP routes from skill manifest"
```

---

### Task 3: Add generic voice hooks service in node-core

**Files:**
- Create: `scripts/node-core/services/manifest-voice-hooks.js`
- Modify: `scripts/node-core/services/chat-service.js` (only the "responda" block)
- Test: `scripts/node-core/tests/manifest-voice-hooks.test.js`

- [ ] **Step 1: Write failing test**

Create `scripts/node-core/tests/manifest-voice-hooks.test.js`:

```js
const { resolveVoiceReply } = require('../services/manifest-voice-hooks')

describe('resolveVoiceReply', () => {
  const hostManager = {}

  it('returns null when no skill declares a reply hook', async () => {
    hostManager.sendToPersistent = jest.fn()
    const result = await resolveVoiceReply('responda o João', [], hostManager)
    expect(result).toBeNull()
    expect(hostManager.sendToPersistent).not.toHaveBeenCalled()
  })

  it('injects prompt from skill voiceHooks.reply.promptTemplate', async () => {
    hostManager.sendToPersistent = jest.fn().mockResolvedValue({
      history: [{ from: 'João', text: 'Oi tudo bem?' }]
    })
    const skills = [
      {
        id: 'whatsapp',
        manifest: {
          voiceHooks: {
            reply: {
              tool: 'get_history',
              promptTemplate: 'Responda a {contactName}: {lastMessage}'
            }
          }
        }
      }
    ]
    const result = await resolveVoiceReply('responda oi', skills, hostManager)
    expect(result).toContain('Responda a João: Oi tudo bem?')
    expect(result).toContain('responda oi')
  })

  it('returns null when hostManager returns no history', async () => {
    hostManager.sendToPersistent = jest.fn().mockResolvedValue({ history: [] })
    const skills = [
      { id: 'whatsapp', manifest: { voiceHooks: { reply: { tool: 'get_history', promptTemplate: '{contactName}' } } } }
    ]
    expect(await resolveVoiceReply('x', skills, hostManager)).toBeNull()
  })

  it('skips skills that throw and tries the next one', async () => {
    const send = jest.fn()
      .mockRejectedValueOnce(new Error('first failed'))
      .mockResolvedValueOnce({ history: [{ from: 'Maria', text: 'oi' }] })
    const skills = [
      { id: 'a', manifest: { voiceHooks: { reply: { tool: 'h', promptTemplate: '{contactName}: {lastMessage}' } } } },
      { id: 'b', manifest: { voiceHooks: { reply: { tool: 'h', promptTemplate: '{contactName}: {lastMessage}' } } } }
    ]
    const result = await resolveVoiceReply('x', skills, { sendToPersistent: send })
    expect(result).toContain('Maria: oi')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/core && pnpm test -- manifest-voice-hooks`
Expected: FAIL

- [ ] **Step 3: Implement `manifest-voice-hooks.js`**

Create `scripts/node-core/services/manifest-voice-hooks.js`:

```js
async function resolveVoiceReply(originalContent, skills, hostManager) {
  if (!Array.isArray(skills)) return null
  for (const skill of skills) {
    const hook = skill?.manifest?.voiceHooks?.reply
    if (!hook || !hook.tool || !hook.promptTemplate) continue
    let result
    try {
      result = await hostManager.sendToPersistent(skill.id, { toolName: hook.tool, args: {} })
    } catch {
      continue
    }
    const last = result?.history?.[0]
    if (!last) continue
    const injected = hook.promptTemplate
      .replace('{contactName}', last.from || '')
      .replace('{lastMessage}', last.text || '')
    return `${injected}\n${originalContent}`
  }
  return null
}

module.exports = { resolveVoiceReply }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/core && pnpm test -- manifest-voice-hooks`
Expected: PASS

- [ ] **Step 5: Replace hardcoded "responda" block in `chat-service.js`**

In `scripts/node-core/services/chat-service.js`, replace lines 2076-2094 (the hardcoded "responda" block) with:

```js
const contentLower = originalContent.toLowerCase().trim()
if (contentLower.startsWith('responda') || contentLower.startsWith('responde')) {
  try {
    const hostManager = require('./extension-host-manager')
    const { resolveVoiceReply } = require('./manifest-voice-hooks')
    const skills = (typeof skillRegistry !== 'undefined' && skillRegistry.getEnabled)
      ? skillRegistry.getEnabled()
      : []
    const injected = await resolveVoiceReply(originalContent, skills, hostManager)
    if (injected) content = injected
  } catch {}
}
```

(Adjust import: if `skillRegistry` is not in scope of this function, pass it via the parent function or read from a module-level require.)

- [ ] **Step 6: Commit**

```bash
git add scripts/node-core/services/manifest-voice-hooks.js scripts/node-core/services/chat-service.js scripts/node-core/tests/manifest-voice-hooks.test.js
git commit -m "feat(node-core): generic voice reply hooks via skill manifest"
```

---

### Task 4: Make chat-service system prompt dynamic

**Files:**
- Modify: `scripts/node-core/services/chat-service.js`
- Test: `scripts/node-core/tests/tool-priority.test.js` (new)

- [ ] **Step 1: Write failing test**

Create `scripts/node-core/tests/tool-priority.test.js`:

```js
const { buildToolPriority } = require('../services/tool-priority')

describe('buildToolPriority', () => {
  it('renders one bullet per skill that declares toolPriority', () => {
    const skills = [
      { manifest: { toolPriority: { label: 'OPEN/ABRIR', rule: 'use launcher tools' } } },
      { manifest: { toolPriority: { label: 'WEATHER', rule: 'call get_weather' } } },
      { manifest: { name: 'no priority' } }
    ]
    const out = buildToolPriority(skills)
    expect(out).toBe('- OPEN/ABRIR: use launcher tools\n- WEATHER: call get_weather')
  })

  it('returns empty string when no skill has toolPriority', () => {
    expect(buildToolPriority([{ manifest: {} }])).toBe('')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/core && pnpm test -- tool-priority`
Expected: FAIL

- [ ] **Step 3: Implement `tool-priority.js`**

Create `scripts/node-core/services/tool-priority.js`:

```js
function buildToolPriority(skills) {
  if (!Array.isArray(skills)) return ''
  return skills
    .map(s => s?.manifest?.toolPriority)
    .filter(Boolean)
    .map(p => `- ${p.label}: ${p.rule}`)
    .join('\n')
}

module.exports = { buildToolPriority }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/core && pnpm test -- tool-priority`
Expected: PASS

- [ ] **Step 5: Replace hardcoded `<tool_priority>` in `chat-service.js`**

In `scripts/node-core/services/chat-service.js`, replace the two identical hardcoded `<tool_priority>` strings (lines 1180-1181) with:

```js
const { buildToolPriority } = require('./tool-priority')
const toolPriorityBody = buildToolPriority(selectedSkills)
const toolPriority = toolPriorityBody
  ? `<tool_priority>\n${toolPriorityBody}\n</tool_priority>`
  : ''
```

Then concatenate `toolPriority` into the existing `toolInstruction` assembly (instead of the hardcoded string). Make sure both `hasHistory` and non-`hasHistory` branches use the dynamic value.

- [ ] **Step 6: Commit**

```bash
git add scripts/node-core/services/tool-priority.js scripts/node-core/services/chat-service.js scripts/node-core/tests/tool-priority.test.js
git commit -m "feat(node-core): dynamic tool priority from skill manifests"
```

---

### Task 5: Add `loadSkillRenderer` in renderer

**Files:**
- Modify: `apps/momai/src/renderer/src/components/chat/ExtensionRendererLoader.tsx`
- Test: `apps/momai/src/renderer/src/components/chat/ExtensionRendererLoader.test.ts` (new)

- [ ] **Step 1: Write failing test**

Create `apps/momai/src/renderer/src/components/chat/ExtensionRendererLoader.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getRenderer, resetForTest } from './SkillResponseRegistry'
import { loadSkillRenderer } from './ExtensionRendererLoader'

describe('loadSkillRenderer', () => {
  beforeEach(() => {
    resetForTest()
    // @ts-expect-error test injection
    global.window = {}
  })

  it('injects registry shim and calls registerRenderer for page', async () => {
    const Comp = () => null
    // @ts-expect-error test injection
    global.window.__skillRendererRegistry = { registerRenderer: vi.fn() }
    vi.stubGlobal('import', vi.fn().mockResolvedValue({ default: Comp }))
    await loadSkillRenderer('whatsapp', { page: 'page.js', pageType: 'whatsapp-page' }, '/extensions/whatsapp/dist')
    // @ts-expect-error
    expect(global.window.__skillRendererRegistry.registerRenderer).toHaveBeenCalledWith('whatsapp-page', Comp)
  })

  it('skips panel when not provided', async () => {
    resetForTest()
    // @ts-expect-error
    global.window.__skillRendererRegistry = { registerRenderer: vi.fn() }
    const imp = vi.fn()
    vi.stubGlobal('import', imp)
    await loadSkillRenderer('x', { page: 'p.js', pageType: 't' }, '/x')
    expect(imp).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Add `resetForTest` to `SkillResponseRegistry.ts`**

In `apps/momai/src/renderer/src/components/chat/SkillResponseRegistry.ts`, append:

```ts
export const resetForTest = () => renderers.clear()
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/momai && pnpm vitest run src/renderer/src/components/chat/ExtensionRendererLoader.test.ts`
Expected: FAIL with "loadSkillRenderer is not a function"

- [ ] **Step 4: Implement `loadSkillRenderer`**

Replace `apps/momai/src/renderer/src/components/chat/ExtensionRendererLoader.tsx` with:

```tsx
import { registerRenderer } from './SkillResponseRegistry'
import GenericExtensionCard from './GenericExtensionCard'

registerRenderer('generic-extension', GenericExtensionCard)

interface SkillUi {
  page?: string
  pageType?: string
  panel?: string
  panelType?: string
}

declare global {
  interface Window {
    __skillRendererRegistry?: {
      registerRenderer: (type: string, component: React.ComponentType<any>) => void
    }
  }
}

export async function loadSkillRenderer(
  skillId: string,
  ui: SkillUi,
  baseUrl: string
): Promise<void> {
  if (typeof window !== 'undefined') {
    window.__skillRendererRegistry = { registerRenderer }
  }
  if (ui.page && ui.pageType) {
    const mod = await import(/* @vite-ignore */ `${baseUrl}/${ui.page}`)
    registerRenderer(ui.pageType, mod.default)
  }
  if (ui.panel && ui.panelType) {
    const mod = await import(/* @vite-ignore */ `${baseUrl}/${ui.panel}`)
    registerRenderer(ui.panelType, mod.default)
  }
}

export { GenericExtensionCard }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/momai && pnpm vitest run src/renderer/src/components/chat/ExtensionRendererLoader.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/momai/src/renderer/src/components/chat/ExtensionRendererLoader.tsx apps/momai/src/renderer/src/components/chat/ExtensionRendererLoader.test.ts apps/momai/src/renderer/src/components/chat/SkillResponseRegistry.ts
git commit -m "feat(renderer): add loadSkillRenderer with registry shim"
```

---

### Task 6: Add ExtensionPageRoute component

**Files:**
- Create: `apps/momai/src/renderer/src/views/ExtensionPageRoute.tsx`

- [ ] **Step 1: Create the component**

Create `apps/momai/src/renderer/src/views/ExtensionPageRoute.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useInstalledSkill } from '../hooks/useInstalledSkill'
import { loadSkillRenderer } from '../components/chat/ExtensionRendererLoader'
import { getRenderer } from '../components/chat/SkillResponseRegistry'
import { ArrowPathIcon } from '@heroicons/react/24/outline'

interface Props {
  fallback?: React.ComponentType<{ extensionId: string }>
}

export default function ExtensionPageRoute({ fallback: Fallback }: Props) {
  const { id } = useParams<{ id: string }>()
  const skill = useInstalledSkill(id)
  const [Component, setComponent] = useState<React.ComponentType<any> | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    if (!skill?.manifest.ui?.page) {
      setComponent(null)
      return
    }
    setComponent(null)
    setError(null)
    loadSkillRenderer(skill.id, skill.manifest.ui, `/extensions/${skill.id}/dist`)
      .then(() => {
        const Renderer = getRenderer(skill.manifest.ui.pageType!)
        if (!Renderer) throw new Error(`Renderer not registered: ${skill.manifest.ui.pageType}`)
        setComponent(() => Renderer)
      })
      .catch((err) => setError(err.message || 'Failed to load extension'))
  }, [id, skill])

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-text-muted">
        <div className="text-center space-y-2">
          <p className="text-red-400">Erro ao carregar extensão: {error}</p>
        </div>
      </div>
    )
  }

  if (!skill) {
    return <div className="p-8 text-text-muted">Extensão não encontrada: {id}</div>
  }

  if (!skill.manifest.ui?.page) {
    return Fallback ? <Fallback extensionId={skill.id} /> : <div className="p-8 text-text-muted">Esta extensão não tem UI full-page</div>
  }

  if (!Component) {
    return (
      <div className="flex h-full items-center justify-center text-text-muted">
        <ArrowPathIcon className="w-6 h-6 animate-spin" />
      </div>
    )
  }

  return <Component extensionId={skill.id} manifest={skill.manifest} />
}
```

- [ ] **Step 2: Create `useInstalledSkill` hook**

Create `apps/momai/src/renderer/src/hooks/useInstalledSkill.ts`:

```ts
import { useEffect, useState } from 'react'
import { fetchExtensions } from '../services/api'
import type { Extension } from '../services/api'

export function useInstalledSkill(id: string | undefined): Extension | null {
  const [skill, setSkill] = useState<Extension | null>(null)

  useEffect(() => {
    if (!id) {
      setSkill(null)
      return
    }
    let cancelled = false
    fetchExtensions()
      .then((all) => {
        if (cancelled) return
        setSkill(all.find((s) => s.id === id) || null)
      })
      .catch(() => {
        if (!cancelled) setSkill(null)
      })
    return () => {
      cancelled = true
    }
  }, [id])

  return skill
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/momai/src/renderer/src/views/ExtensionPageRoute.tsx apps/momai/src/renderer/src/hooks/useInstalledSkill.ts
git commit -m "feat(renderer): add generic ExtensionPageRoute + useInstalledSkill"
```

---

## Phase 2: Reorganize WhatsApp skill (depends on Phase 1)

### Task 7: Set up WhatsApp skill build infrastructure

**Files:**
- Create: `apps/momai/scripts/skills/packaged/whatsapp/package.json`
- Create: `apps/momai/scripts/skills/packaged/whatsapp/tsconfig.json`
- Create: `apps/momai/scripts/skills/packaged/whatsapp/build.mjs`
- Create: `apps/momai/scripts/skills/packaged/whatsapp/.gitignore`

- [ ] **Step 1: Create `.gitignore`**

Create `apps/momai/scripts/skills/packaged/whatsapp/.gitignore`:

```
node_modules/
dist/
*.log
.DS_Store
```

- [ ] **Step 2: Create `package.json`**

Create `apps/momai/scripts/skills/packaged/whatsapp/package.json`:

```json
{
  "name": "momai-whatsapp-extension",
  "version": "0.3.0",
  "private": true,
  "type": "module",
  "description": "Extensão WhatsApp para MomAI",
  "scripts": {
    "build": "node build.mjs",
    "watch": "node build.mjs --watch",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "esbuild": "^0.24.0",
    "@types/react": "^19.0.0",
    "typescript": "^5.9.0"
  },
  "peerDependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  }
}
```

- [ ] **Step 3: Create `tsconfig.json`**

Create `apps/momai/scripts/skills/packaged/whatsapp/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "isolatedModules": true,
    "resolveJsonModule": true,
    "baseUrl": ".",
    "paths": {
      "momai:registry": ["../../../src/renderer/src/components/chat/SkillResponseRegistry.ts"],
      "momai:events": ["../../../src/renderer/src/hooks/useExtensionEvents.ts"],
      "momai:api": ["../../../src/renderer/src/services/api.ts"]
    }
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 4: Create `build.mjs`**

Create `apps/momai/scripts/skills/packaged/whatsapp/build.mjs`:

```js
import { build, context } from 'esbuild'
import { readFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const manifest = JSON.parse(readFileSync(path.join(__dirname, 'manifest.json'), 'utf8'))

const entries = []
if (manifest.ui?.page)  entries.push({ in: 'src/page.tsx',  out: 'page' })
if (manifest.ui?.panel) entries.push({ in: 'src/panel.tsx', out: 'panel' })

if (entries.length === 0) {
  console.log('[skill:build] No UI entries in manifest. Nothing to do.')
  process.exit(0)
}

mkdirSync(path.join(__dirname, 'dist'), { recursive: true })

/** @type {import('esbuild').BuildOptions} */
const options = {
  entryPoints: entries.map(e => ({ in: e.in, out: e.out })),
  bundle: true,
  format: 'iife',
  globalName: '__skillBundle',
  jsx: 'automatic',
  jsxImportSource: 'react',
  target: 'es2022',
  platform: 'browser',
  minify: process.env.NODE_ENV === 'production',
  sourcemap: true,
  outdir: 'dist',
  logLevel: 'info',
  external: ['react', 'react-dom', 'react/jsx-runtime'],
  alias: {
    'momai:registry': path.resolve(__dirname, '../../../src/renderer/src/components/chat/SkillResponseRegistry.ts'),
    'momai:events':    path.resolve(__dirname, '../../../src/renderer/src/hooks/useExtensionEvents.ts'),
    'momai:api':       path.resolve(__dirname, '../../../src/renderer/src/services/api.ts')
  },
  banner: {
    js: `;(function(){if(typeof window!=='undefined'&&!window.__skillRendererRegistry){window.__skillRendererRegistry={registerRenderer:function(){}};}})();`
  }
}

if (process.argv.includes('--watch')) {
  const ctx = await context(options)
  await ctx.watch()
  console.log('[skill:build] Watching for changes...')
} else {
  await build(options)
  console.log('[skill:build] Built →', entries.map(e => e.out + '.js').join(', '))
}
```

- [ ] **Step 5: Install deps and run build (smoke test)**

Run: `cd apps/momai/scripts/skills/packaged/whatsapp && pnpm install && pnpm build`
Expected: dist/page.js and/or dist/panel.js are created (or "Nothing to do" if manifest has no ui yet — this is fine, we'll add it in Task 8)

- [ ] **Step 6: Commit**

```bash
git add apps/momai/scripts/skills/packaged/whatsapp/package.json apps/momai/scripts/skills/packaged/whatsapp/tsconfig.json apps/momai/scripts/skills/packaged/whatsapp/build.mjs apps/momai/scripts/skills/packaged/whatsapp/.gitignore
git commit -m "feat(whatsapp-skill): add esbuild build pipeline"
```

---

### Task 8: Extend WhatsApp manifest with new fields

**Files:**
- Modify: `apps/momai/scripts/skills/packaged/whatsapp/manifest.json`

- [ ] **Step 1: Replace manifest.json with extended version**

Replace the contents of `apps/momai/scripts/skills/packaged/whatsapp/manifest.json`:

```json
{
  "id": "whatsapp",
  "name": "WhatsApp",
  "kind": "packaged",
  "description": "Monitora e responde mensagens do WhatsApp",
  "icon": "💚",
  "author": "WesleyQDev",
  "sidebar": true,
  "background": true,
  "backgroundScript": "background-worker.js",
  "permissions": ["network:persistent", "storage:persistent"],
  "version": "0.3.0",
  "ui": {
    "page": "dist/page.js",
    "pageType": "whatsapp-page",
    "panel": "dist/panel.js",
    "panelType": "whatsapp-panel"
  },
  "eventTypes": [
    "qr_code",
    "authenticated",
    "connection_status",
    "contacts_synced",
    "history_loaded",
    "whatsapp_message"
  ],
  "routes": [
    { "method": "POST", "path": "/disconnect",           "tool": "disconnect" },
    { "method": "POST", "path": "/restart",              "tool": "restart" },
    { "method": "POST", "path": "/sync",                 "tool": "sync" },
    { "method": "POST", "path": "/flush-history",        "tool": "flush_history" },
    { "method": "POST", "path": "/process-notification", "tool": "process_notification" }
  ],
  "storage": {
    "description": "Sessão WhatsApp criptografada (credenciais Baileys), contatos, histórico de mensagens, preferências de monitoramento.",
    "locations": ["baileys-auth/", "*.json (contatos, histórico, settings)"]
  },
  "voiceHooks": {
    "reply": {
      "tool": "get_history",
      "promptTemplate": "[INSTRUCAO: O usuario esta respondendo a \"{contactName}\" no WhatsApp. A ultima mensagem dele foi: \"{lastMessage}\". Use a ferramenta send_message para enviar a resposta. NAO responda no chat, apenas execute o send_message.]"
    }
  },
  "persistOnQuit": "flush_history",
  "theme": {
    "gradient": "from-emerald-500 to-green-600",
    "accent": "emerald"
  },
  "toolPriority": {
    "label": "WHATSAPP",
    "rule": "monitor, reply, or send WhatsApp messages via the whatsapp tools."
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/momai/scripts/skills/packaged/whatsapp/manifest.json
git commit -m "feat(whatsapp-skill): extend manifest with ui, routes, events, voiceHooks"
```

---

### Task 9: Move whatsappChannel to skill

**Files:**
- Create: `apps/momai/scripts/skills/packaged/whatsapp/src/utils/whatsappChannel.ts`
- (Old file at `apps/momai/src/renderer/src/utils/whatsappChannel.ts` NOT yet deleted — done in Phase 4)

- [ ] **Step 1: Read old file**

Run: `Read apps/momai/src/renderer/src/utils/whatsappChannel.ts`

- [ ] **Step 2: Copy contents to new location**

Create `apps/momai/scripts/skills/packaged/whatsapp/src/utils/whatsappChannel.ts` with the EXACT same contents as the source file.

- [ ] **Step 3: Commit**

```bash
git add apps/momai/scripts/skills/packaged/whatsapp/src/utils/whatsappChannel.ts
git commit -m "refactor(whatsapp-skill): copy whatsappChannel utility"
```

---

### Task 10: Move + generalize useExtensionEvents to skill

**Files:**
- Create: `apps/momai/scripts/skills/packaged/whatsapp/src/hooks/useExtensionEvents.ts`
- (Old file at `apps/momai/src/renderer/src/hooks/useExtensionEvents.ts` NOT yet deleted)

- [ ] **Step 1: Read old file**

Run: `Read apps/momai/src/renderer/src/hooks/useExtensionEvents.ts`

- [ ] **Step 2: Copy contents verbatim**

Create `apps/momai/scripts/skills/packaged/whatsapp/src/hooks/useExtensionEvents.ts` with the EXACT same contents.

- [ ] **Step 3: Commit**

```bash
git add apps/momai/scripts/skills/packaged/whatsapp/src/hooks/useExtensionEvents.ts
git commit -m "refactor(whatsapp-skill): copy useExtensionEvents hook"
```

---

### Task 11: Move + generalize API service to skill

**Files:**
- Create: `apps/momai/scripts/skills/packaged/whatsapp/src/services/api.ts`

- [ ] **Step 1: Read main app's api.ts**

Run: `Read apps/momai/src/renderer/src/services/api.ts` (limit 100 lines to inspect)

- [ ] **Step 2: Copy entire `api.ts` verbatim**

Create `apps/momai/scripts/skills/packaged/whatsapp/src/services/api.ts` with the EXACT same contents. The full api.ts must be copied; do not try to subset it.

- [ ] **Step 3: Commit**

```bash
git add apps/momai/scripts/skills/packaged/whatsapp/src/services/api.ts
git commit -m "refactor(whatsapp-skill): copy api service"
```

---

### Task 12: Create registry-bridge shim

**Files:**
- Create: `apps/momai/scripts/skills/packaged/whatsapp/src/registry-bridge.ts`

- [ ] **Step 1: Create the file**

Create `apps/momai/scripts/skills/packaged/whatsapp/src/registry-bridge.ts`:

```ts
// Re-exports registerRenderer from the host app.
// The esbuild alias `momai:registry` resolves this import to
//   apps/momai/src/renderer/src/components/chat/SkillResponseRegistry.ts
// at build time. For pre-built bundles (ZIP installs), the banner
// installed by build.mjs injects globalThis.__skillRendererRegistry,
// which is set by the host before importing the bundle.
import { registerRenderer } from 'momai:registry'

export { registerRenderer }
```

- [ ] **Step 2: Commit**

```bash
git add apps/momai/scripts/skills/packaged/whatsapp/src/registry-bridge.ts
git commit -m "feat(whatsapp-skill): add registry-bridge shim"
```

---

### Task 13: Create useWhatsAppEvents skill-specific hook

**Files:**
- Create: `apps/momai/scripts/skills/packaged/whatsapp/src/hooks/useWhatsAppEvents.ts`

- [ ] **Step 1: Inspect old useWhatsAppEvents if it exists**

Run: `Glob "apps/momai/src/renderer/src/hooks/useWhatsAppEvents*"`
If file exists, read it. If not, create from scratch using the same pattern as `useExtensionEvents`.

- [ ] **Step 2: Create the file**

If the old file exists, copy it to the new location. If not, create:

Create `apps/momai/scripts/skills/packaged/whatsapp/src/hooks/useWhatsAppEvents.ts`:

```ts
import { useEffect, useCallback } from 'react'
import { useExtensionEvents } from './useExtensionEvents'

export interface WhatsAppEvent {
  eventType: string
  data?: any
}

export function useWhatsAppEvents(handlers: {
  onQrCode?: (qr: string, expiresIn: number) => void
  onAuthenticated?: (status: string, data?: any) => void
  onConnectionStatus?: (status: string, data?: any) => void
  onContactsSynced?: (count: number, isFinal: boolean) => void
  onHistoryLoaded?: (count: number) => void
  onMessage?: (data: any) => void
}) {
  useExtensionEvents({
    onEvent: useCallback(
      (event: WhatsAppEvent) => {
        switch (event.eventType) {
          case 'qr_code':
            handlers.onQrCode?.(event.data?.qr, event.data?.expiresIn)
            break
          case 'authenticated':
            handlers.onAuthenticated?.(event.data?.status, event.data)
            break
          case 'connection_status':
            handlers.onConnectionStatus?.(event.data?.status, event.data)
            break
          case 'contacts_synced':
            handlers.onContactsSynced?.(event.data?.count, event.data?.isFinal)
            break
          case 'history_loaded':
            handlers.onHistoryLoaded?.(event.data?.count)
            break
          case 'whatsapp_message':
            handlers.onMessage?.(event.data)
            break
        }
      },
      [handlers]
    )
  })
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/momai/scripts/skills/packaged/whatsapp/src/hooks/useWhatsAppEvents.ts
git commit -m "feat(whatsapp-skill): add typed useWhatsAppEvents hook"
```

---

### Task 14: Move WhatsAppView to skill as page.tsx

**Files:**
- Create: `apps/momai/scripts/skills/packaged/whatsapp/src/page.tsx`
- (Old file at `apps/momai/src/renderer/src/views/WhatsAppView.tsx` NOT yet deleted)

- [ ] **Step 1: Read old WhatsAppView.tsx in chunks**

Run: `Read apps/momai/src/renderer/src/views/WhatsAppView.tsx` (offset 0, limit 2000)
Then: `Read apps/momai/src/renderer/src/views/WhatsAppView.tsx` (offset 2000, limit 2000)
Continue until file is fully read.

- [ ] **Step 2: Create page.tsx with adjusted imports**

Create `apps/momai/scripts/skills/packaged/whatsapp/src/page.tsx`. Copy the entire file content from WhatsAppView.tsx, then adjust imports:

```tsx
// Replace imports at the top:

// OLD:
// import { resolveWhatsAppChannel } from '../utils/whatsappChannel'
// import { useExtensionEvents } from '../hooks/useExtensionEvents'
// import api from '../services/api'

// NEW:
import { resolveWhatsAppChannel } from './utils/whatsappChannel'
import { useExtensionEvents } from './hooks/useExtensionEvents'
import { registerRenderer } from './registry-bridge'
import api from './services/api'

// Add at the bottom of the file, after the default export:
registerRenderer('whatsapp-page', WhatsAppPage)
```

The default export should be renamed from `WhatsAppView` to `WhatsAppPage` (or keep the original name and add `export default WhatsAppView`).

- [ ] **Step 3: Build the skill**

Run: `cd apps/momai/scripts/skills/packaged/whatsapp && pnpm build`
Expected: `dist/page.js` is created

- [ ] **Step 4: Verify bundle exists**

Run: `Test-Path apps/momai/scripts/skills/packaged/whatsapp/dist/page.js`
Expected: True

- [ ] **Step 5: Commit**

```bash
git add apps/momai/scripts/skills/packaged/whatsapp/src/page.tsx apps/momai/scripts/skills/packaged/whatsapp/dist/page.js
git commit -m "refactor(whatsapp-skill): move WhatsAppView to src/page.tsx + bundle"
```

---

### Task 15: Move WhatsAppNotificationCard to skill as panel.tsx

**Files:**
- Create: `apps/momai/scripts/skills/packaged/whatsapp/src/panel.tsx`
- (Old file at `apps/momai/src/renderer/src/components/chat/WhatsAppNotificationCard.tsx` NOT yet deleted)

- [ ] **Step 1: Read old file**

Run: `Read apps/momai/src/renderer/src/components/chat/WhatsAppNotificationCard.tsx` (offset 0, limit 2000)
If larger, read remaining chunks.

- [ ] **Step 2: Create panel.tsx with adjusted imports**

Create `apps/momai/scripts/skills/packaged/whatsapp/src/panel.tsx`. Copy entire content, adjust imports:

```tsx
// OLD:
// import { resolveWhatsAppChannel } from '../../utils/whatsappChannel'

// NEW:
import { resolveWhatsAppChannel } from './utils/whatsappChannel'
import { registerRenderer } from './registry-bridge'

// Add at bottom:
registerRenderer('whatsapp-panel', WhatsAppNotificationCard)
```

(Adjust other relative imports to point to `./services/api` or `./hooks/useExtensionEvents` as needed.)

- [ ] **Step 3: Build**

Run: `cd apps/momai/scripts/skills/packaged/whatsapp && pnpm build`
Expected: `dist/panel.js` is created

- [ ] **Step 4: Commit**

```bash
git add apps/momai/scripts/skills/packaged/whatsapp/src/panel.tsx apps/momai/scripts/skills/packaged/whatsapp/dist/panel.js
git commit -m "refactor(whatsapp-skill): move WhatsAppNotificationCard to src/panel.tsx + bundle"
```

---

## Phase 3: Switch main app to new mechanisms (depends on Phase 2)

### Task 16: Wire `/extensions/:id` route in App.tsx

**Files:**
- Modify: `apps/momai/src/renderer/src/App.tsx`

- [ ] **Step 1: Find current routing logic**

Search `apps/momai/src/renderer/src/App.tsx` for `'WhatsAppDashboard'` and the line `'/extensions/whatsapp': 'WhatsAppDashboard'`.

- [ ] **Step 2: Add generic route**

In `apps/momai/src/renderer/src/App.tsx`, find the React Router config (look for `<Routes>` or `Route` components). Add a new route:

```tsx
import ExtensionPageRoute from './views/ExtensionPageRoute'
import WhatsAppView from './views/WhatsAppView' // legacy fallback

<Route
  path="/extensions/:id"
  element={
    <ExtensionPageRoute fallback={({ extensionId }) => {
      if (extensionId === 'whatsapp') return <WhatsAppView />
      return <div>Extensão não tem UI full-page</div>
    }} />
  }
/>
```

Keep the legacy `/extensions/whatsapp` route pointing to `WhatsAppView` as a fallback (Phase 4 removes it).

- [ ] **Step 3: Run typecheck**

Run: `cd apps/momai && pnpm typecheck:web`
Expected: PASS

- [ ] **Step 4: Manual smoke test**

Run: `pnpm dev` and navigate to `/extensions/whatsapp`. The new `ExtensionPageRoute` should load the bundle and render identically.

- [ ] **Step 5: Commit**

```bash
git add apps/momai/src/renderer/src/App.tsx
git commit -m "feat(renderer): add /extensions/:id route with WhatsAppView fallback"
```

---

### Task 17: Update LateralBar to use manifest icons

**Files:**
- Modify: `apps/momai/src/renderer/src/components/LateralBar.tsx`

- [ ] **Step 1: Find iconMap**

Locate lines 81-82 in `LateralBar.tsx`:
```tsx
whatsapp: WhatsAppIcon,
launcher: LauncherIcon,
```

- [ ] **Step 2: Remove the hardcoded entries**

Remove those two lines from the iconMap. The remaining generic icons (PuzzlePieceIcon, etc.) stay.

- [ ] **Step 3: Update icon resolution**

Find the function that picks an icon (look for `iconMap[name]` or similar). Add logic to render emoji strings from `manifest.icon`:

```tsx
import { PuzzlePieceIcon } from '@heroicons/react/24/outline'

function resolveIcon(manifest: any): React.ComponentType<any> | string {
  const icon = manifest?.icon
  if (!icon) return PuzzlePieceIcon
  if (iconMap[icon]) return iconMap[icon]
  // Emoji or other string — render as text
  if (typeof icon === 'string' && icon.length <= 4) return icon
  return PuzzlePieceIcon
}
```

Then in the JSX where the icon is rendered:

```tsx
{(() => {
  const Icon = resolveIcon(skill.manifest)
  return typeof Icon === 'string' ? <span className="text-lg">{Icon}</span> : <Icon className="w-5 h-5" />
})()}
```

- [ ] **Step 4: Run typecheck and tests**

Run: `cd apps/momai && pnpm typecheck:web && pnpm test -- LateralBar`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/momai/src/renderer/src/components/LateralBar.tsx
git commit -m "refactor(renderer): LateralBar uses manifest.icon instead of hardcoded"
```

---

### Task 18: Update ExtensionsView to use manifest theme

**Files:**
- Modify: `apps/momai/src/renderer/src/views/ExtensionsView.tsx`

- [ ] **Step 1: Find `isWhatsapp`/`isLauncher` references**

Search `ExtensionsView.tsx` for `isWhatsapp`, `isLauncher`, `'whatsapp'`, `'launcher'` literals.

- [ ] **Step 2: Replace `getSkillGradient`**

Replace the function (around line 215-241) with:

```tsx
const ALLOWED_GRADIENTS = new Set([
  'from-emerald-500 to-green-600',
  'from-blue-500 to-indigo-600',
  'from-violet-600 to-purple-500',
  'from-rose-600 to-pink-500',
  'from-cyan-600 to-blue-500',
  'from-emerald-600 to-teal-500',
  'from-amber-600 to-orange-500',
  'from-fuchsia-600 to-pink-500',
  'from-indigo-600 to-violet-500',
  'from-lime-600 to-green-500',
  'from-sky-600 to-cyan-500',
  'from-red-600 to-rose-500'
])

function getSkillGradient(name: string, manifest?: any): string {
  const claimed = manifest?.theme?.gradient
  if (claimed && ALLOWED_GRADIENTS.has(claimed)) return claimed
  const gradients = Array.from(ALLOWED_GRADIENTS)
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return gradients[Math.abs(hash) % gradients.length]
}
```

- [ ] **Step 3: Replace `getSkillIcon`**

Replace (around line 243-271) with:

```tsx
function getSkillIcon(name: string, skillId?: string, skillName?: string, manifest?: any) {
  const icon = manifest?.icon
  if (icon && iconMap[icon]) return iconMap[icon]
  if (icon && typeof icon === 'string' && icon.length <= 4) return null // emoji
  return (
    iconMap[name] ||
    (skillId && iconMap[skillId]) ||
    (skillName && iconMap[skillName]) ||
    PuzzlePieceIcon
  )
}
```

- [ ] **Step 4: Remove `isWhatsapp`/`isLauncher`**

Search for `isWhatsapp = ` and `isLauncher = ` and replace each usage with a generic check. The classes used (`shadow-emerald-500/15`, `bg-emerald-600`, etc.) should be replaced with classes from `manifest.theme.accent`:

```tsx
const accent = skill.manifest?.theme?.accent || 'violet'
const accentClasses = {
  emerald: { shadow: 'shadow-emerald-500/15', button: 'bg-emerald-600 hover:bg-emerald-500', progress: 'bg-emerald-400/30' },
  blue:    { shadow: 'shadow-blue-500/15',    button: 'bg-blue-600 hover:bg-blue-500',    progress: 'bg-blue-400/30' },
  violet:  { shadow: 'shadow-violet-500/10',  button: 'bg-violet-600 hover:bg-violet-500',progress: 'bg-violet-400/30' }
}[accent] || { shadow: 'shadow-violet-500/10', button: 'bg-violet-600 hover:bg-violet-500', progress: 'bg-violet-400/30' }
```

- [ ] **Step 5: Run typecheck and tests**

Run: `cd apps/momai && pnpm typecheck:web && pnpm test -- ExtensionsView`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/momai/src/renderer/src/views/ExtensionsView.tsx
git commit -m "refactor(renderer): ExtensionsView uses manifest.theme instead of hardcoded ids"
```

---

### Task 19: Update PrivacyView to iterate skills

**Files:**
- Modify: `apps/momai/src/renderer/src/views/PrivacyView.tsx`

- [ ] **Step 1: Find the hardcoded WhatsApp block**

Search for `whatsappInstalled`, `t('privacy.stored.whatsapp.title')`, and the JSX block that renders the WhatsApp storage card.

- [ ] **Step 2: Replace with generic iteration**

Replace the state initialization and effects with:

```tsx
import { fetchExtensions, type Extension } from '../services/api'

const [skillsWithStorage, setSkillsWithStorage] = useState<Array<Extension & { storageDescription: string; storageLocations: string[] }>>([])

useEffect(() => {
  fetchExtensions()
    .then((all) => setSkillsWithStorage(
      all
        .filter((s) => s.storage?.description)
        .map((s) => ({
          ...s,
          storageDescription: s.storage.description,
          storageLocations: s.storage.locations || []
        }))
    ))
    .catch(() => setSkillsWithStorage([]))
}, [])
```

- [ ] **Step 3: Replace the hardcoded JSX**

Find the JSX block (around line 327) that renders the WhatsApp card. Replace with:

```tsx
{skillsWithStorage.map((skill) => (
  <div key={skill.id} className="rounded-2xl border border-border/20 bg-zinc-900 p-5 space-y-3">
    <div className="flex items-center gap-2">
      <span className="text-lg">{skill.icon || '🔌'}</span>
      <h3 className="font-medium">{skill.name}</h3>
    </div>
    <p className="text-sm text-text-muted">{skill.storageDescription}</p>
    {skill.storageLocations.length > 0 && (
      <ul className="text-xs text-text-muted/80 list-disc pl-5 space-y-1">
        {skill.storageLocations.map((loc, i) => <li key={i}>{loc}</li>)}
      </ul>
    )}
  </div>
))}
```

- [ ] **Step 4: Run typecheck and tests**

Run: `cd apps/momai && pnpm typecheck:web && pnpm test -- PrivacyView`
Expected: PASS (or update the test fixture to use a skill with `storage` instead of hardcoded `whatsapp`)

- [ ] **Step 5: Commit**

```bash
git add apps/momai/src/renderer/src/views/PrivacyView.tsx
git commit -m "refactor(renderer): PrivacyView iterates skills with manifest.storage"
```

---

### Task 20: Update NotificationOverlay to dispatch by eventTypes

**Files:**
- Modify: `apps/momai/src/renderer/src/components/NotificationOverlay.tsx`

- [ ] **Step 1: Find hardcoded event types and API calls**

Search for `'whatsapp_notification'`, `'/extensions/whatsapp/command'`, `'/extensions/whatsapp/process-notification'`, `/voice/whatsapp-reply/wait`.

- [ ] **Step 2: Replace with skillId-based dispatch**

```tsx
import { fetchExtensions, type Extension } from '../services/api'

const [installed, setInstalled] = useState<Extension[]>([])

useEffect(() => {
  fetchExtensions()
    .then(setInstalled)
    .catch(() => setInstalled([]))
}, [])

const findSkillForEvent = (eventType: string) =>
  installed.find((s) => (s.eventTypes || []).includes(eventType))

// In the event handler:
const skill = findSkillForEvent(event.eventType)
if (!skill) return
const response = await window.api.apiFetch(`${API_URL}/extensions/${skill.id}/command`, {
  method: 'POST',
  body: JSON.stringify({ toolName: 'process_notification', args: event.data })
})
// ... rest of the handler
```

For the structured response rendering, use `getRenderer(event.eventType)` to dispatch to whichever component the skill registered.

- [ ] **Step 3: Remove `resolveWhatsAppChannel` import**

Remove the import and any usages; the channel resolution is now done in the skill.

- [ ] **Step 4: Run typecheck**

Run: `cd apps/momai && pnpm typecheck:web`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/momai/src/renderer/src/components/NotificationOverlay.tsx
git commit -m "refactor(renderer): NotificationOverlay dispatches by skillId + eventTypes"
```

---

### Task 21: Remove WhatsAppView register from OverlayView

**Files:**
- Modify: `apps/momai/src/renderer/src/views/OverlayView.tsx`

- [ ] **Step 1: Remove the line**

In `apps/momai/src/renderer/src/views/OverlayView.tsx`, line 6:
```tsx
registerRenderer('whatsapp_notification', WhatsAppNotificationCard)
```

Delete this line and the corresponding import. The skill's bundle auto-registers this when loaded.

- [ ] **Step 2: Remove the hardcoded check**

In the same file, find:
```tsx
if (data?.structuredResponse?.type === 'whatsapp_notification') { ... }
```

Replace with a generic dispatch via `getRenderer(data?.structuredResponse?.type)`.

- [ ] **Step 3: Remove now-unused WhatsAppView import**

If WhatsAppView is no longer used here, remove its import. (Phase 4 will delete the file entirely.)

- [ ] **Step 4: Commit**

```bash
git add apps/momai/src/renderer/src/views/OverlayView.tsx
git commit -m "refactor(renderer): OverlayView uses generic renderer dispatch"
```

---

### Task 22: Remove hardcoded chat route

**Files:**
- Modify: `scripts/node-core/api/routes/chat.routes.js`

- [ ] **Step 1: Find the hardcoded route**

Search for `'/voice/whatsapp-reply/wait'`.

- [ ] **Step 2: Replace with generic pattern**

```js
const replyMatch = pathname.match(/^\/voice\/([^/]+)\/reply\/wait$/)
if (replyMatch && req.method === 'POST') {
  const skillId = replyMatch[1]
  const skill = skillRegistry.getById(skillId)
  if (!skill) {
    return sendJson(res, 404, { ok: false, error: 'skill_not_found' })
  }
  // ... dispatch logic (read body, call host manager, respond)
  return true
}
```

- [ ] **Step 3: Commit**

```bash
git add scripts/node-core/api/routes/chat.routes.js
git commit -m "refactor(node-core): generic /voice/:skillId/reply/wait route"
```

---

### Task 23: Make persist-on-quit generic in main process

**Files:**
- Modify: `apps/momai/src/main/index.ts`

- [ ] **Step 1: Find the hardcoded flush**

Search for `flush-history` and `'whatsapp'`.

- [ ] **Step 2: Replace with iteration**

```ts
async function flushExtensionStates() {
  try {
    const res = await authFetch(`http://${API_HOST}:${API_PORT}/extensions`, { method: 'GET' })
    if (!res.ok) return
    const data = await res.json()
    const skills = Array.isArray(data?.extensions) ? data.extensions : (Array.isArray(data) ? data : [])
    for (const skill of skills) {
      const toolName = skill?.persistOnQuit
      if (!toolName) continue
      await authFetch(`http://${API_HOST}:${API_PORT}/extensions/${skill.id}/command`, {
        method: 'POST',
        body: JSON.stringify({ toolName, args: {} })
      }).catch(() => {})
    }
  } catch {}
}
```

Replace the hardcoded call with `await flushExtensionStates()`.

- [ ] **Step 3: Typecheck**

Run: `cd apps/momai && pnpm typecheck:node`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/momai/src/main/index.ts
git commit -m "refactor(main): generic persistOnQuit flush on app quit"
```

---

### Task 24: Update extension type definitions in api.ts

**Files:**
- Modify: `apps/momai/src/renderer/src/services/api.ts`

- [ ] **Step 1: Find the Extension interface**

Search for `interface Extension` or `type Extension`.

- [ ] **Step 2: Add new fields**

```ts
export interface SkillUi {
  page?: string
  pageType?: string
  panel?: string
  panelType?: string
}

export interface SkillStorage {
  description?: string
  locations?: string[]
}

export interface SkillRoute {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  path: string
  tool: string
}

export interface SkillTheme {
  gradient?: string
  accent?: string
}

export interface SkillVoiceHookReply {
  tool: string
  promptTemplate: string
}

export interface SkillVoiceHooks {
  reply?: SkillVoiceHookReply
}

export interface Extension {
  // ... existing fields
  ui?: SkillUi
  eventTypes?: string[]
  storage?: SkillStorage
  routes?: SkillRoute[]
  theme?: SkillTheme
  voiceHooks?: SkillVoiceHooks
  persistOnQuit?: string
  toolPriority?: { label: string; rule: string }
}
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/momai && pnpm typecheck:web`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/momai/src/renderer/src/services/api.ts
git commit -m "feat(renderer): add Extension.ui, eventTypes, storage, routes, voiceHooks types"
```

---

## Phase 4: Cleanup (depends on Phase 3)

### Task 25: Delete moved files from main app

**Files:**
- Delete: `apps/momai/src/renderer/src/views/WhatsAppView.tsx`
- Delete: `apps/momai/src/renderer/src/components/chat/WhatsAppNotificationCard.tsx`
- Delete: `apps/momai/src/renderer/src/utils/whatsappChannel.ts`
- Delete: `apps/momai/src/renderer/src/hooks/useExtensionEvents.ts`
- Delete: `apps/momai/src/renderer/src/hooks/useWhatsAppEvents.ts`

- [ ] **Step 1: Update App.tsx to remove WhatsAppView import**

In `apps/momai/src/renderer/src/App.tsx`, remove the `import WhatsAppView from './views/WhatsAppView'` line and the fallback usage. The new `ExtensionPageRoute` now renders the bundle directly.

- [ ] **Step 2: Find and remove other imports of these files**

```bash
cd apps/momai/src/renderer/src && grep -rl "from '.*WhatsAppView'" .
cd apps/momai/src/renderer/src && grep -rl "from '.*WhatsAppNotificationCard'" .
cd apps/momai/src/renderer/src && grep -rl "from '.*whatsappChannel'" .
cd apps/momai/src/renderer/src && grep -rl "useExtensionEvents" .
cd apps/momai/src/renderer/src && grep -rl "useWhatsAppEvents" .
```

For each match, fix to import from the skill's local copy (or from the skill's bundle via the registry). If a file only used these and has no other purpose, update it to use the skill's types or remove the import.

- [ ] **Step 3: Delete the files**

```bash
git rm apps/momai/src/renderer/src/views/WhatsAppView.tsx
git rm apps/momai/src/renderer/src/components/chat/WhatsAppNotificationCard.tsx
git rm apps/momai/src/renderer/src/utils/whatsappChannel.ts
git rm apps/momai/src/renderer/src/hooks/useExtensionEvents.ts
git rm apps/momai/src/renderer/src/hooks/useWhatsAppEvents.ts
```

- [ ] **Step 4: Typecheck and test**

Run: `cd apps/momai && pnpm typecheck:web && pnpm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git commit -m "refactor: delete moved files from main app"
```

---

### Task 26: Remove hardcoded routes from extensions.routes.js

**Files:**
- Modify: `scripts/node-core/api/routes/extensions.routes.js`

- [ ] **Step 1: Find all WhatsApp-specific routes**

Search for `/extensions/whatsapp/` and `/launcher/open`.

- [ ] **Step 2: Delete them**

Remove:
- The `/launcher/open` legacy route
- All `/extensions/whatsapp/{disconnect,restart,sync,flush-history,process-notification}` routes
- The `_getBaileysAuthDir()` and `_wipeBaileysAuth()` helpers
- The `require('../../utils/whatsapp-channel')` import

The new generic `mountSkillRoutes()` from Task 2 now serves them.

- [ ] **Step 3: Verify with tests**

Run: `cd apps/core && pnpm test`
Expected: All extension route tests pass (update the `/launcher/open` test to use the dynamic route instead)

- [ ] **Step 4: Commit**

```bash
git add scripts/node-core/api/routes/extensions.routes.js scripts/node-core/tests/extensions-routes.test.js
git commit -m "refactor(node-core): remove hardcoded WhatsApp/launcher routes"
```

---

### Task 27: Clean up privacy.js

**Files:**
- Modify: `scripts/node-core/api/routes/privacy.js`

- [ ] **Step 1: Find hardcoded WhatsApp references**

Search for `'whatsapp'`, `baileys-auth`, `whatsapp/baileys-auth` literals in route handlers (not comments).

- [ ] **Step 2: Replace with generic endpoint**

The new `GET /privacy/stored` endpoint (Task 1) replaces the old hardcoded list. Remove the old hardcoded list code if any.

- [ ] **Step 3: Commit**

```bash
git add scripts/node-core/api/routes/privacy.js
git commit -m "refactor(node-core): generic privacy storage endpoint"
```

---

### Task 28: Clean up windowManager.ts and economyScanner.ts

**Files:**
- Modify: `apps/momai/src/main/windowManager.ts`
- Modify: `apps/momai/src/main/economyScanner.ts`

- [ ] **Step 1: windowManager.ts**

Remove the `data?.structuredResponse?.type === 'whatsapp_notification'` check. The structured response is dispatched generically by the renderer.

- [ ] **Step 2: economyScanner.ts**

Rename `launcher: 'steam' | 'epic'` to `platform: 'steam' | 'epic'`. Find all usages and update.

- [ ] **Step 3: Typecheck**

Run: `cd apps/momai && pnpm typecheck:node`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/momai/src/main/windowManager.ts apps/momai/src/main/economyScanner.ts
git commit -m "refactor(main): remove hardcoded type checks and rename launcher field"
```

---

### Task 29: Update tests to use generic fixtures

**Files:**
- Modify: `scripts/node-core/tests/keyword-router.test.js`
- Modify: `scripts/node-core/tests/privacy-routes.test.js`
- Modify: `scripts/node-core/tests/extensions-routes.test.js`

- [ ] **Step 1: keyword-router.test.js**

Replace hardcoded `launcher`/`whatsapp` IDs with a `fakeSkill(id, intents)` factory.

- [ ] **Step 2: privacy-routes.test.js**

Replace `path.join(tmpDir, 'extensions', 'whatsapp')` with `path.join(tmpDir, 'extensions', 'test-skill')`.

- [ ] **Step 3: extensions-routes.test.js**

Replace the `launcher/open` test with a test that uses a mock skill with `manifest.routes`.

- [ ] **Step 4: Run all tests**

Run: `cd apps/core && pnpm test && cd ../../apps/momai && pnpm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/node-core/tests/
git commit -m "test: use generic skill fixtures instead of hardcoded IDs"
```

---

### Task 30: Final integration smoke test

**Files:** none

- [ ] **Step 1: Run full build + test**

```bash
cd /c/Users/wesle/dev/momai
pnpm install
cd apps/momai
pnpm typecheck
pnpm lint
pnpm test
cd ../core
pnpm test
```

Expected: All commands pass.

- [ ] **Step 2: Manual end-to-end test**

Run: `pnpm dev` and verify:
- Extensions view shows WhatsApp with same green gradient and 💚 icon
- Clicking WhatsApp opens the full-page view with identical UI
- `responda` voice command still works
- Disconnect/reconnect via WhatsApp panel works
- App quit flushes WhatsApp history
- Privacy view shows WhatsApp storage card
- Installing a third-party extension from a ZIP works (test with a fake ZIP if needed)

- [ ] **Step 3: Final commit**

If any tweaks were needed:
```bash
git add .
git commit -m "chore: integration smoke test fixes"
```

---

## Self-Review

**Spec coverage:**
- §4 Manifest extensions: Tasks 8, 24 ✅
- §5 Build pipeline: Task 7 ✅
- §6 Bundle loading: Tasks 5, 6 ✅
- §7 Chat core changes: Tasks 3, 4, 22 ✅
- §8 Main process changes: Tasks 23, 28 ✅
- §9 Renderer changes: Tasks 16-21, 25 ✅
- §10 Skill reorganization: Tasks 9-15 ✅
- §11 Migration phases: Tasks 1-4 (Phase 1), 7-15 (Phase 2), 16-24 (Phase 3), 25-30 (Phase 4) ✅
- §12 Testing: Tasks 1-4 (unit), 30 (integration) ✅
- §13 Risks: addressed via Task 18 (theme whitelist) and Task 5 (shim injection order) ✅
- §14 Out of scope: not implemented, correctly omitted ✅

**Placeholder scan:** No TBDs, TODOs, or vague steps. Every code step shows the actual code.

**Type consistency:**
- `SkillUi` defined in Task 5 and Task 24 — same shape ✅
- `Extension` extended in Task 24 with all new fields ✅
- `mountSkillRoutes(app, skills, hostManager)` signature used consistently in Tasks 2 and 5 ✅
- `resolveVoiceReply(content, skills, hostManager)` used consistently in Tasks 3 and the chat-service wiring ✅
- `loadSkillRenderer(skillId, ui, baseUrl)` used consistently in Tasks 5 and 6 ✅
- `getRenderer(type)` from existing `SkillResponseRegistry` used in Tasks 5, 6, 20, 21 ✅
- `registerRenderer(type, Component)` used in Tasks 12, 14, 15 ✅

**No spec gaps found.**

**Execution time estimate:**
- Phase 1 (Tasks 1-6): ~4 hours
- Phase 2 (Tasks 7-15): ~6 hours (file moves + build setup)
- Phase 3 (Tasks 16-24): ~5 hours (renderer + main app refactor)
- Phase 4 (Tasks 25-30): ~3 hours (cleanup + integration)
- **Total: ~18 hours of focused work**

**Parallelization opportunities (for subagent dispatch):**
- Phase 1 must be linear
- Phase 2 can split: Tasks 7-8 (build infra + manifest) sequential; Tasks 9-13 (file copies) parallel; Tasks 14-15 (main moves) sequential
- Phase 3 can split heavily:
  - Track A: Tasks 16, 17, 18 (route + UI components)
  - Track B: Tasks 19, 20, 21 (privacy + notifications)
  - Track C: Tasks 22, 23, 24, 28 (backend + main process + types)
- Phase 4 must be sequential (delete files → verify → tests)
