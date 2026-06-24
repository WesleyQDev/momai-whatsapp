# Design: Extension UI Self-Containment

**Date:** 2026-06-24
**Status:** Approved (pending user review)
**Scope:** Make MomAI extensions (specifically WhatsApp) fully self-contained downloadables — move UI, event types, routes, storage info, and voice hooks from the main app into the skill packages. Keep WhatsApp appearance identical.

---

## 1. Problem

MomAI extensions are advertised as "downloadable" via `community-extensions.json` + ZIP install, but the codebase has extensive hardcoding that prevents any third-party extension from working as a first-class citizen:

- **Backend**: 6+ routes hardcoded to `/extensions/whatsapp/*` in `extensions.routes.js`
- **Chat core**: System prompt hardcodes "use launcher tools"; `responda` voice command hardcodes `whatsapp` skill ID
- **Main process**: App-quit flush hardcoded to WhatsApp
- **Renderer**: 1.1k-line `WhatsAppView.tsx` and 16k-line `WhatsAppNotificationCard.tsx` live in the main app, not in the extension
- **UI plumbing**: `ExtensionsView`, `LateralBar`, `PrivacyView`, `OverlayView` all have `if (id === 'whatsapp' || id === 'launcher')` checks
- **Tests**: Keyword router, extensions routes, privacy routes all reference real skill IDs

The infrastructure for generic extensions already exists (`SkillResponseRegistry`, `ExtensionRendererLoader`, `ExtensionPanel`, `ExtensionHostManager`). What's missing is the bridge that lets a skill package its own React UI, declare its own events, and own its own HTTP routes.

---

## 2. Goals & Non-Goals

### Goals
- Skills are ZIP files that work without any change to the main app
- WhatsApp keeps its current full-page appearance byte-for-byte
- All extension-specific code (UI, events, routes, voice hooks, storage info) lives inside the skill
- App main process, renderer, and node-core contain zero `whatsapp` / `launcher` literals (other than canonical integration tests)
- Existing extension infra (`SkillResponseRegistry`, `ExtensionHostManager`, `ExtensionPanel`) is reused, not replaced

### Non-Goals
- Build a marketplace or payment system
- Change the on-disk storage layout (`data/extensions/<id>/`)
- Refactor launcher skill (it is already generic enough)
- Change the install/uninstall flow
- Migrate core skills (search, weather, memory, scheduler) to the new pattern — only packaged+extension skills benefit

---

## 3. Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                    App Principal (genérico)                    │
│                                                                │
│  ┌─────────────────┐  ┌──────────────────┐  ┌───────────────┐  │
│  │ ExtensionHost   │  │ ExtensionRouter  │  │ ExtensionPanel│  │
│  │ Manager         │  │ /ext/:id/page    │  │ (side panel)  │  │
│  │ (processos Node)│  │ (full-page)      │  │               │  │
│  └────────┬────────┘  └─────────┬────────┘  └───────┬───────┘  │
│           │                      │                   │         │
│           └──────────┬───────────┴───────────────────┘         │
│                      │                                         │
│  ┌───────────────────▼──────────────────────────────────────┐  │
│  │  ExtensionRendererLoader (lazy-import de dist/*.js)     │  │
│  │  Injeta globalThis.__skillRendererRegistry antes do impt│  │
│  └───────────────────┬──────────────────────────────────────┘  │
│                      │                                         │
│  ┌───────────────────▼──────────────────────────────────────┐  │
│  │  SkillResponseRegistry (type → Component)               │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                │
│  Mounted dynamically:                                          │
│  • /extensions/:id/command  (generic)                          │
│  • /extensions/:id/panel    (generic)                          │
│  • /extensions/:id/<route>  (mounted from manifest.routes)     │
│  • /extensions/:id/dist/*   (static file server)               │
│  • /voice/:skillId/reply/wait (generic)                        │
└────────────────────────────┬───────────────────────────────────┘
                             │ import dinâmico
        ┌────────────────────┴────────────────────┐
        │                                         │
┌───────▼──────────────────────────┐    ┌────────▼─────────────┐
│  Skill: WhatsApp                 │    │  Skill: Launcher     │
│                                  │    │                      │
│  manifest.json (declarations)    │    │  manifest.json       │
│  runtime.js (Node)               │    │  runtime.js (Node)   │
│  background-worker.js (Node)     │    │  src/page.tsx        │
│  src/page.tsx  (React full-page) │    │  dist/page.js        │
│  src/panel.tsx (React side-panel)│    │                      │
│  src/hooks/                      │    │                      │
│  src/utils/whatsappChannel.ts    │    │                      │
│  build.mjs (esbuild)             │    │                      │
│  tsconfig.json                   │    │                      │
│  package.json (devDeps)          │    │                      │
│  dist/page.js  (built IIFE)      │    │                      │
│  dist/panel.js (built IIFE)      │    │                      │
└──────────────────────────────────┘    └──────────────────────┘
```

---

## 4. Manifest Extensions

Add fields to `manifest.json`:

```jsonc
{
  // (existing fields: id, name, version, kind, description, icon, author, ...)

  // UI bundles generated by esbuild
  "ui": {
    "page":      "dist/page.js",      // optional
    "pageType":  "whatsapp-page",     // optional, must match registerRenderer type
    "panel":     "dist/panel.js",     // optional
    "panelType": "whatsapp-panel"     // optional
  },

  // Events this skill emits to the renderer
  "eventTypes": [
    "qr_code", "authenticated", "connection_status",
    "contacts_synced", "history_loaded", "whatsapp_message"
  ],

  // HTTP routes this skill exposes (mounted at /extensions/<id><path>)
  "routes": [
    { "method": "POST", "path": "/disconnect",          "tool": "disconnect" },
    { "method": "POST", "path": "/restart",             "tool": "restart" },
    { "method": "POST", "path": "/sync",                "tool": "sync" },
    { "method": "POST", "path": "/flush-history",       "tool": "flush_history" },
    { "method": "POST", "path": "/process-notification","tool": "process_notification" }
  ],

  // Storage info for Privacy view
  "storage": {
    "description": "Sessão WhatsApp criptografada (credenciais Baileys), contatos, histórico de mensagens, preferências de monitoramento.",
    "locations": ["baileys-auth/", "*.json (contatos, histórico, settings)"]
  },

  // Voice command hooks
  "voiceHooks": {
    "reply": {
      "tool": "get_history",
      "promptTemplate": "[INSTRUCAO: O usuario esta respondendo a \"{contactName}\" no WhatsApp. A ultima mensagem dele foi: \"{lastMessage}\". Use a ferramenta send_message para enviar a resposta. NAO responda no chat, apenas execute o send_message.]"
    }
  },

  // Hook called on app quit
  "persistOnQuit": "flush_history",

  // Optional theme override for the skill card
  "theme": {
    "gradient": "from-emerald-500 to-green-600",
    "accent":   "emerald"
  }
}
```

---

## 5. Build Pipeline (esbuild)

Each skill with UI gets a `build.mjs`. Pure-Node skills (launcher) don't.

### `package.json` (template for skills with UI)
```json
{
  "name": "momai-whatsapp-extension",
  "version": "0.3.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "node build.mjs",
    "watch": "node build.mjs --watch"
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

### `build.mjs`
- Reads `manifest.json` to discover entry points (`ui.page`, `ui.panel`)
- Bundles with esbuild: `format: 'iife'`, `bundle: true`, `jsx: 'automatic'`, `target: 'es2022'`, `platform: 'browser'`
- Externals: `react`, `react-dom`, `react/jsx-runtime` (provided by host app)
- Output to `dist/`
- Injects banner shim that uses `globalThis.__skillRendererRegistry` for pre-built extensions

### `tsconfig.json` (template)
Standard React 19 + TS 5.9, extends parent if present, includes `src/**/*`.

### Build flow
- **Monorepo (dev)**: `pnpm --filter momai-whatsapp-extension build` before `pnpm dev`
- **Install from ZIP**: `extensions.routes.js` checks for `package.json` + `build.mjs`; if present and `dist/` is missing, runs `npm install && npm run build` (or skips with warning if node/npm unavailable)
- **CI/release**: existing `release.yml` workflow in `WesleyQDev/momai-whatsapp-extension` runs build before zipping

---

## 6. Bundle Loading

### App side: `ExtensionRendererLoader.tsx`
```ts
import { registerRenderer } from './SkillResponseRegistry'
import GenericExtensionCard from './GenericExtensionCard'

registerRenderer('generic-extension', GenericExtensionCard)

export async function loadSkillRenderer(
  skillId: string,
  ui: { page?: string; pageType?: string; panel?: string; panelType?: string },
  baseUrl: string
) {
  // Inject registry shim so pre-built bundles can call registerRenderer
  ;(window as any).__skillRendererRegistry = { registerRenderer }
  if (ui.page && ui.pageType) {
    await import(/* @vite-ignore */ `${baseUrl}/${ui.page}`)
  }
  if (ui.panel && ui.panelType) {
    await import(/* @vite-ignore */ `${baseUrl}/${ui.panel}`)
  }
}
```

### Static file serving (node-core)
Add generic static route to `extensions.routes.js`:
```js
// /extensions/:id/dist/* → serves <skillPath>/dist/<file>
const path = require('path')
app.get(/^\/extensions\/([^/]+)\/dist\/(.+)$/, (req, res) => {
  const [, id, file] = req.params
  const skill = skillRegistry.getById(id)
  if (!skill?.dir) return res.status(404).end()
  res.sendFile(path.join(skill.dir, 'dist', file))
})
```

### Dynamic route mounting (node-core)
```js
for (const skill of skillRegistry.getAll()) {
  for (const route of skill.manifest?.routes || []) {
    const method = route.method.toLowerCase()
    if (!app[method]) continue
    const fullPath = `/extensions/${skill.id}${route.path}`
    app[method](fullPath, async (req, res) => {
      try {
        const result = await extensionHostManager.sendToPersistent(skill.id, {
          toolName: route.tool,
          args: req.body
        })
        res.json(result || { ok: true })
      } catch (err) {
        res.status(500).json({ ok: false, error: err.message })
      }
    })
  }
}
```

### App-side full-page route
```tsx
// In App.tsx, replace the WhatsApp-specific entry with:
<Route path="/extensions/:id" element={<ExtensionPageRoute />} />

// ExtensionPageRoute.tsx
function ExtensionPageRoute() {
  const { id } = useParams()
  const skill = useInstalledSkill(id)
  const [Component, setComponent] = useState<React.ComponentType | null>(null)

  useEffect(() => {
    if (!skill?.manifest.ui?.page) return
    loadSkillRenderer(skill.id, skill.manifest.ui, `/extensions/${skill.id}/dist`)
      .then(() => setComponent(() => getRenderer(skill.manifest.ui.pageType)))
  }, [skill])

  if (!Component) return <LoadingExtensionView />
  return <Component extensionId={id} manifest={skill.manifest} />
}
```

---

## 7. Chat Core Changes

### `chat-service.js` — dynamic tool priority
Replace hardcoded `<tool_priority>` block with iteration over enabled skills:
```js
const toolPriority = enabledSkills
  .filter(s => s.manifest.toolPriority)
  .map(s => `- ${s.manifest.toolPriority.label}: ${s.manifest.toolPriority.rule}`)
  .join('\n')
```

### `chat-service.js` — generic "responda" handling
Replace hardcoded `hostManager.sendToPersistent('whatsapp', ...)` with:
```js
for (const skill of enabledSkills) {
  const replyHook = skill.manifest.voiceHooks?.reply
  if (!replyHook) continue
  const result = await hostManager.sendToPersistent(skill.id, {
    toolName: replyHook.tool, args: {}
  })
  if (result?.history?.length) {
    const last = result.history[0]
    content = replyHook.promptTemplate
      .replace('{contactName}', last.from)
      .replace('{lastMessage}', last.text) + '\n' + content
    break
  }
}
```

### `chat.routes.js` — generic voice route
```js
// /voice/:skillId/reply/wait
const match = pathname.match(/^\/voice\/([^/]+)\/reply\/wait$/)
```

---

## 8. Main Process Changes

### `src/main/index.ts` — generic persist-on-quit
```ts
// Replace hardcoded flush-history with iteration:
for (const skill of getInstalledSkills()) {
  if (skill.manifest.persistOnQuit) {
    await authFetch(`http://${API_HOST}:${API_PORT}/extensions/${skill.id}/command`, {
      method: 'POST',
      body: JSON.stringify({ toolName: skill.manifest.persistOnQuit, args: {} })
    }).catch(() => {})
  }
}
```

### `src/main/windowManager.ts`
Drop the `data?.structuredResponse?.type === 'whatsapp_notification'` special case.

### `src/main/economyScanner.ts`
Rename `launcher: 'steam' | 'epic'` to `platform: 'steam' | 'epic'` to avoid name collision with the launcher skill.

---

## 9. Renderer Changes

### Files moved from main app → skill
| From | To |
|------|-----|
| `apps/momai/src/renderer/src/views/WhatsAppView.tsx` | `apps/momai/scripts/skills/packaged/whatsapp/src/page.tsx` |
| `apps/momai/src/renderer/src/components/chat/WhatsAppNotificationCard.tsx` | `apps/momai/scripts/skills/packaged/whatsapp/src/panel.tsx` |
| `apps/momai/src/renderer/src/utils/whatsappChannel.ts` | `apps/momai/scripts/skills/packaged/whatsapp/src/utils/whatsappChannel.ts` |

### Files modified
| File | Change |
|------|--------|
| `src/renderer/src/views/ExtensionsView.tsx` | Drop `isWhatsapp`/`isLauncher` checks; read `manifest.theme.gradient` instead |
| `src/renderer/src/components/LateralBar.tsx` | Drop `whatsapp`/`launcher` from iconMap; render icon from `manifest.icon` |
| `src/renderer/src/App.tsx` | Replace `/extensions/whatsapp` route with `/extensions/:id` dynamic route |
| `src/renderer/src/components/NotificationOverlay.tsx` | Iterate `eventTypes` from installed skills; dispatch via `getRenderer(type)` |
| `src/renderer/src/views/PrivacyView.tsx` | Iterate installed skills; render storage card from `manifest.storage` |
| `src/renderer/src/views/OverlayView.tsx` | Remove `registerRenderer('whatsapp_notification', ...)` (moved to skill) |
| `src/renderer/src/services/api.ts` | Add `SkillUi` type; extend `Extension` with `ui?`, `eventTypes?`, `storage?`, `routes?`, `theme?`, `voiceHooks?` |
| `src/renderer/src/components/chat/ExtensionRendererLoader.tsx` | Add `loadSkillRenderer(skillId, ui, baseUrl)` |

### Files deleted (after migration)
- `src/renderer/src/views/WhatsAppView.tsx`
- `src/renderer/src/components/chat/WhatsAppNotificationCard.tsx`
- `src/renderer/src/utils/whatsappChannel.ts`
- `src/renderer/src/hooks/useWhatsAppEvents.ts` (moves to skill, becomes generic for all skills)
- `src/renderer/src/hooks/useExtensionEvents.ts` (moves to skill, becomes generic)

---

## 10. Skill Reorganization (WhatsApp)

### Final layout
```
apps/momai/scripts/skills/packaged/whatsapp/
├── SKILL.md                         (unchanged)
├── README.md                        (unchanged)
├── README.en-US.md                  (unchanged)
├── LICENSE                          (unchanged)
├── icon.svg                         (unchanged)
├── manifest.json                    (extended with ui, eventTypes, routes, storage, voiceHooks, persistOnQuit, theme)
├── package.json                     (NEW: build deps)
├── tsconfig.json                    (NEW)
├── build.mjs                        (NEW: esbuild)
├── runtime.js                       (unchanged)
├── background-worker.js             (unchanged)
├── baileys-cred-migration.js        (unchanged)
├── fs-permissions.js                (unchanged)
├── secure-storage-bridge.js         (unchanged)
├── locales/pt-BR.json               (unchanged)
├── src/                             (NEW)
│   ├── page.tsx                     (ex-WhatsAppView.tsx)
│   ├── panel.tsx                    (ex-WhatsAppNotificationCard.tsx)
│   ├── hooks/useExtensionEvents.ts  (moved from main app, made generic)
│   ├── hooks/useWhatsAppEvents.ts   (skill-specific event hook)
│   ├── services/api.ts              (moved from main app, made generic)
│   ├── utils/whatsappChannel.ts     (moved from main app)
│   └── registry-bridge.ts           (tiny shim re-exporting registerRenderer)
└── dist/                            (generated, gitignored)
    ├── page.js
    └── panel.js
```

### Registry bridge
The skill needs to call `registerRenderer` but can't import from the host app. Two paths:

**Path A — packaged skills (in monorepo)**: esbuild alias resolves `momai:registry` to the host's `SkillResponseRegistry.ts`.

**Path B — pre-built ZIPs**: bundle includes banner that uses `globalThis.__skillRendererRegistry`. App injects this before importing bundle.

```ts
// src/registry-bridge.ts (in skill)
import { registerRenderer } from 'momai:registry'  // resolved at build time
export { registerRenderer }
```

---

## 11. Migration Phases (Compatibility-Preserving)

1. **Phase 1 — Foundations**: Add new manifest fields, `loadSkillRenderer`, dynamic route mounting, generic privacy endpoint. No removals.
2. **Phase 2 — Move WhatsApp UI**: Copy `WhatsAppView` → `whatsapp/src/page.tsx` (with imports adjusted), `WhatsAppNotificationCard` → `whatsapp/src/panel.tsx`, `whatsappChannel` → `whatsapp/src/utils/`. Build the bundles. Add `ui`/`eventTypes`/`routes`/`storage`/`voiceHooks`/`persistOnQuit`/`theme` to `manifest.json`. Add `/extensions/:id` route in App.tsx. Make `ExtensionPageRoute` render the new bundle when present, fall back to old `WhatsAppView` otherwise.
3. **Phase 3 — Switch to new mechanisms**: Point `LateralBar` to `/extensions/:id`; `NotificationOverlay` to dispatch by `eventTypes`; `PrivacyView` to iterate. Switch dynamic routes on (WhatsApp routes now served by generic router).
4. **Phase 4 — Cleanup**: Delete `WhatsAppView.tsx`, `WhatsAppNotificationCard.tsx`, `whatsappChannel.ts`, `useWhatsAppEvents.ts`, `useExtensionEvents.ts` from main app. Remove all `whatsapp`/`launcher` hardcodes. Update `extensions.routes.js` to remove old specific routes. Update tests to use generic fixtures.

Each phase is independently shippable. Phases 1-3 preserve all existing behavior. Phase 4 is mechanical cleanup.

---

## 12. Testing

### Existing tests to update
- `keyword-router.test.js` — use `fakeSkill` factory
- `extensions-routes.test.js` — test dynamic route mounting with mock skill
- `privacy-routes.test.js` — create `extensions/<id>/` dynamically

### New tests
- `extension-renderer-loader.test.ts` — verify `loadSkillRenderer` calls `registerRenderer` correctly
- `extensions-routes-mount.test.js` — verify routes from manifest get mounted
- `extensions-voice-hooks.test.js` — verify "responda" iterates voiceHooks
- `extensions-quit-flush.test.js` — verify `persistOnQuit` is called for each skill

### Visual regression
Manual QA: open WhatsApp panel, verify identical appearance. Snapshot tests for `ExtensionsView` skill cards (no regression in generic card view).

### Integration
- Install WhatsApp skill from local ZIP via `/extensions/install` — verify UI loads
- Install from monorepo packaged copy — verify UI loads
- Disable WhatsApp skill — verify panel disappears, system prompt no longer mentions it
- Uninstall WhatsApp skill — verify cleanup

---

## 13. Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| esbuild bundle path resolution breaks for downloaded ZIPs | Test both packaged and ZIP-installed paths; document build step in skill README |
| `registerRenderer` shim is racy (race between bundle import and shim injection) | Inject shim in `ExtensionRendererLoader.loadSkillRenderer` BEFORE the `import()` call |
| `theme.gradient` hardcoded in user-visible fields becomes a security issue if exploited | Validate `theme.gradient` against a whitelist of Tailwind class fragments before applying |
| Removing `useExtensionEvents` hook breaks other code | Grep for usages; only delete after all consumers are migrated |
| Dynamic route mounting runs at wrong lifecycle (after routes are already used) | Mount in `app.start()` before `app.listen()`; document ordering |
| Skill declares events but no listener registered in renderer | `NotificationOverlay` iterates only `eventTypes` from installed skills — natural containment |

---

## 14. Out of Scope (Future Work)

- Migrating core skills (search, weather, memory, scheduler) to the new pattern
- Hot-reload of skill bundles during dev
- Versioning of the manifest schema (currently implicit)
- Permissions UI for skills (already exists via `permissions` field, but UX needs work)
- A formal registry spec (we already have `community-extensions.json` + `registry.json`; no need to change)
