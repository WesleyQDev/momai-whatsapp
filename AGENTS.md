# AGENTS.md - MomAIOS Development Guide

This file provides guidelines for agentic coding agents working on the MomAIOS codebase.

## Project Overview

MomAIOS is the monorepo for MomAI, a local-first, privacy-focused virtual assistant combining LLMs with real computer actions. It uses pnpm workspaces and Turbo.

### Apps Structure

- `apps/momai/` - Electron + React + TypeScript (GUI)
- `apps/core/` - Python/FastAPI (backend AI engine)
- `apps/fortscript/` - Python library for FortScript language
- `apps/landing-page/` - Vite + TailwindCSS landing page
- `apps/momai-promo-video/` - Remotion promotional video

---

## Build / Lint / Test Commands

### Root Commands (from repository root)

```bash
pnpm dev              # Start desktop app in dev mode
pnpm dev:core         # Start Python backend only
pnpm dev:all          # Run both core and desktop concurrently
pnpm build            # Build all apps via Turbo
pnpm build:win        # Build Windows .exe
pnpm build:linux      # Build Linux AppImage
pnpm build:mac        # Build macOS app
pnpm build:unpack     # Build unpacked dir (debug)
pnpm build:appx       # Build Windows AppX packages (store + test)
pnpm lint             # Lint all apps via Turbo
pnpm typecheck        # Type-check all apps via Turbo
pnpm format           # Format all apps via Turbo
pnpm test             # Run tests
pnpm docs:internal    # Start internal Docusaurus docs
```

### Desktop App (apps/momai/)

```bash
cd apps/momai

# Development
pnpm dev              # Start Electron app in dev mode

# Building
pnpm build            # Full build (typecheck + hydrate-bin + electron-vite build)
pnpm build:win        # Build Windows .exe (NSIS)
pnpm build:linux      # Build Linux AppImage

# Linting & Typecheck
pnpm lint             # ESLint (caches to .eslintcache)
pnpm typecheck        # Full TypeScript check (node + web)
pnpm typecheck:node   # Typecheck Node/preload only
pnpm typecheck:web    # Typecheck React/web only
pnpm format           # Prettier write
```

### Core Backend (apps/core/)

```bash
cd apps/core
pnpm dev              # uv run uvicorn main:app --reload --port 8000
pnpm test             # uv run pytest
```

---

## Code Style Guidelines

### Desktop (TypeScript / React / Electron)

**Naming Conventions**:

- Components: PascalCase (`SettingsPanel.tsx`)
- Hooks: camelCase with `use` prefix (`useAudioRecorder.ts`)
- Utilities: camelCase (`formatTime.ts`)
- Constants: UPPER_SNAKE_CASE
- Files: kebab-case for utils (`safe-tools.ts`)

### Core (Python / FastAPI)

**Python Version**: 3.12+

**Style**:

- Follow PEP 8
- Use type hints (`def process(item: str) -> list[str]:`)
- Use async/await for I/O operations
- Prefer dataclasses or Pydantic models for data structures

**Naming**:

- Functions: snake_case (`def process_audio`)
- Classes: PascalCase (`class AudioProcessor`)
- Constants: UPPER_SNAKE_CASE

**FastAPI Patterns**:

- Use dependency injection via `Depends()`
- Define schemas in `api/schemas.py`
- Routes in `api/routes/*.py`
- Use Pydantic models for request/response validation

**Error Handling**:

- Use `HTTPException` for HTTP errors
- Implement global exception handlers in `main.py`
- Log errors with appropriate severity

---

## Environment & Configuration

### Desktop

- Electron 39.x with electron-vite
- React 19 + TypeScript 5.9
- TailwindCSS 3.x for styling

### Core

- FastAPI with uvicorn
- LangGraph for agent orchestration
- LanceDB for semantic search
- SQLite for persistence

### Environment Variables

- Desktop: Uses `.env` files in `apps/momai/`
- Core: Uses `.env` file in `apps/core/`

---

## Important Notes

1. **Git workflow**: Use conventional commits (`feat:`, `fix:`, `docs:`)
2. **Dependencies**: Must use pnpm (enforced via `preinstall` script)
3. **Release process**: Uses GitHub Actions (`.github/workflows/release.yml`)
4. **Core Python**: Uses `uv` as package manager (uv.lock, pyproject.toml)

---

## Community Extensions

MomAI supports a community extension system with two registries:

- **Installation registry** (`registry.json` in the project root) — allowlist of official extensions used by the node-core to validate install URLs.
- **Community catalog** (remote `community-extensions.json` in the `WesleyQDev/MomAI-App` repo) — public catalog of community extensions rendered in the extension store UI.

### Installation Registry

Official extensions are registered in [`registry.json`](registry.json) at the project root:

```json
{
  "extensions": [
    {
      "id": "whatsapp",
      "name": "WhatsApp",
      "description": "Monitore e responda mensagens do WhatsApp",
      "author": "WesleyQDev",
      "version": "0.3.20",
      "download_url": "https://github.com/WesleyQDev/momai-whatsapp-extension/releases/download/v0.3.20/momai-whatsapp-extension-v0.3.20.zip",
      "is_official": true
    }
  ]
}
```

Used by `scripts/node-core/api/routes/extensions.routes.js` to validate that install requests match a known extension ID and download URL.

### Community Catalog (remote)

Community extensions available in the store are fetched at runtime from:
`https://raw.githubusercontent.com/WesleyQDev/MomAI-App/main/community-extensions.json`

```json
[
  {
    "id": "launcher",
    "name": "Launcher",
    "description": "Opens programs, apps, folders, files and URLs on your computer via voice or text commands.",
    "category": "utility",
    "icon": "RocketLaunch",
    "author": "WesleyQDev",
    "repo": "WesleyQDev/momai-extension-launcher",
    "download_url": "https://github.com/WesleyQDev/momai-extension-launcher/archive/refs/heads/main.zip",
    "version": "1.0.0",
    "locales": {
      "pt-BR": {
        "name": "Lançador",
        "description": "Abre programas, aplicativos, pastas, arquivos e URLs no computador através de comandos de voz ou texto."
      }
    }
  }
]
```

The catalog is cached locally and refreshed hourly. Used by:
- `scripts/node-core/services/community-registry.js` — fetches and caches the catalog, enriches extensions with GitHub star counts
- `scripts/node-core/services/skill-orchestrator.js` — builds the combined extensions payload for the API
- Landing page `ExtensionsPage.tsx` — renders the extension store

### Extension Store UI

- `src/renderer/src/views/ExtensionsView.tsx` - Extension store and management
- `data/extensions/` - Installed extensions data
- `scripts/skills/packaged/` - Packaged skill runtimes
- `scripts/skills/registry.js` - Skill registry

### Built-in Core Skills

Located in `scripts/skills/core/`:
- `search/` - Web search skill
- `weather/` - Weather forecast skill
- `memory/` - Memory management skill
- `scheduler/` - Task scheduling skill

---

## Structured Skill Responses

Skills can return rich, structured UI components instead of plain markdown text. This is the preferred approach for complex data like weather, charts, tables, etc.

### How It Works

```
Skill runtime.js
    |
    v
return { structuredResponse: { type: 'weather', data: {...} } }
    |
    v
node-core.js streams { structured_response: {...} } via SSE
    |
    v
Frontend receives via onStructuredResponse callback
    |
    v
StructuredResponseRenderer dispatches to registered component
    |
    v
WeatherCard (or other renderer) displays the UI
```

### Backend: Returning Structured Responses

In a skill's `runtime.js`, return `structuredResponse` instead of `directResponse`:

```javascript
module.exports = {
  tools: [{ name: 'my_tool', description: 'Does something' }],

  async execute({ content, context }) {
    // ... your logic ...

    return {
      tool: 'my_tool',
      structuredResponse: {
        type: 'my_type',        // Must match a registered frontend renderer
        data: {                 // Any JSON-serializable data
          location: 'Sao Paulo',
          items: [...]
        }
      },
      instruction: JSON.stringify(result),  // For LLM context
      webSources: [...]
    }
  }
}
```

### Frontend: Creating a New Renderer

**Step 1**: Create the component in `src/renderer/src/components/chat/`:

```tsx
// MyCard.tsx
import React from 'react'

const MyCard = ({ data }) => {
  return (
    <div className="my-3 rounded-2xl border border-border/20 bg-zinc-900 text-white p-5">
      <h4>{data.title}</h4>
      {/* Your UI here */}
    </div>
  )
}

export default MyCard
```

**Step 2**: Register it in `MessageItem.tsx`:

```tsx
import { registerRenderer } from './SkillResponseRegistry'
import MyCard from './MyCard'

registerRenderer('my_type', MyCard)
```

The type string (`'my_type'`) must match the `type` field returned by the skill's `structuredResponse`.

### Available Renderers

| Component | Type | Purpose |
|-----------|------|---------|
| `WeatherCard.tsx` | `weather` | Weather forecast display |
| `RemindersCard.tsx` | `reminders` | Reminder list display |
| `DevResultCard.tsx` | `dev_result` | Code execution results |
| `DevConfirmationCard.tsx` | `dev_confirmation` | Code action confirmation |
| `DevHtmlRenderCard.tsx` | `dev_html` | Rendered HTML preview |
| `HtmlPreviewCard.tsx` | `html_preview` | Generic HTML preview |
| `GenericExtensionCard.tsx` | `extension` | Generic extension output |
| `ExtensionRendererLoader.tsx` | dynamic | Lazy-loads extension renderers |
| `ExtrasRenderer.tsx` | extras | Extra tools output |

### Files

| File | Purpose |
|------|---------|
| `src/renderer/src/components/chat/SkillResponseRegistry.ts` | Registry for type → component mapping |
| `src/renderer/src/components/chat/StructuredResponseRenderer.tsx` | Dispatches to the correct renderer |
| `src/renderer/src/components/chat/ExtensionRendererLoader.tsx` | Lazy-loads extension UI renderers; exports `loadSkillRenderer()` for dynamic import of skill bundles |
| `src/renderer/src/components/chat/GenericExtensionCard.tsx` | Generic extension output card |
| `src/renderer/src/components/chat/WeatherCard.tsx` | Example: weather forecast display |
| `scripts/skills/core/search/runtime.js` | Example: returns `{ type: 'weather', data: {...} }` |
| `scripts/node-core.js` | SSE streaming of `structured_response` |
| `src/renderer/src/services/api.ts` | SSE parsing + `StructuredResponse` interface |
| `src/renderer/src/services/ttsService.ts` | TTS service |
| `src/renderer/src/hooks/` | React hooks (chat handlers, etc.) |

---

## Self-Contained Extension UI

Extensions (packaged and downloaded) can ship their own React UI bundles instead of hardcoding pages in the main app. The host app provides generic infrastructure; skills provide their own look-and-feel.

### How a skill ships its UI

A skill with a React UI lives in `scripts/skills/packaged/<id>/` and has:

```
my-skill/
├── manifest.json       # declares ui, eventTypes, routes, storage, voiceHooks, persistOnQuit, theme
├── package.json        # devDeps: esbuild; peerDeps: react@19
├── build.mjs           # esbuild config (provided by template)
├── tsconfig.json       # TS config with path aliases
├── runtime.js          # Node-side runtime (existing)
├── src/
│   ├── page.tsx        # full-page React component (ex-WhatsAppView)
│   ├── panel.tsx       # side-panel React component (ex-WhatsAppNotificationCard)
│   ├── registry-bridge.ts  # re-exports registerRenderer from 'momai:registry' alias
│   ├── hooks/
│   ├── utils/
│   └── services/
└── dist/               # generated by `pnpm build`; gitignored
    ├── page.js
    └── panel.js
```

### Manifest UI fields

```json
{
  "ui": {
    "page":      "dist/page.js",
    "pageType":  "my-skill-page",
    "panel":     "dist/panel.js",
    "panelType": "my-skill-panel"
  },
  "eventTypes": ["qr_code", "authenticated", "connection_status"],
  "routes": [
    { "method": "POST", "path": "/disconnect", "tool": "disconnect" }
  ],
  "storage": {
    "description": "What this skill stores on disk",
    "locations": ["auth/", "*.json"]
  },
  "voiceHooks": {
    "reply": {
      "tool": "get_history",
      "promptTemplate": "[INSTRUCAO: User is replying to {contactName}: {lastMessage}]"
    }
  },
  "persistOnQuit": "flush_history",
  "theme": {
    "gradient": "from-blue-500 to-indigo-600",
    "accent":   "blue"
  },
  "toolPriority": {
    "label": "MY-SKILL",
    "rule":  "do X, Y, Z"
  }
}
```

### Build and load flow

1. `pnpm install && pnpm build` inside the skill dir produces `dist/page.js` and `dist/panel.js`
2. Host serves them statically at `GET /extensions/<id>/dist/<file>` (node-core)
3. When a user navigates to `/extensions/<id>`, `ExtensionPageRoute.tsx` calls `loadSkillRenderer(skillId, ui, baseUrl)` from `ExtensionRendererLoader.tsx`
4. `loadSkillRenderer` injects `globalThis.__skillRendererRegistry = { registerRenderer }`, then `import()`s the bundle
5. The bundle calls `registerRenderer('my-skill-page', MyPage)` and the host dispatches to it

### Theme whitelist

`manifest.theme.gradient` must be in this list (validated at render time to prevent arbitrary Tailwind class injection):

```
from-emerald-500 to-green-600, from-blue-500 to-indigo-600,
from-violet-600 to-purple-500, from-rose-600 to-pink-500,
from-cyan-600 to-blue-500, from-emerald-600 to-teal-500,
from-amber-600 to-orange-500, from-fuchsia-600 to-pink-500,
from-indigo-600 to-violet-500, from-lime-600 to-green-500,
from-sky-600 to-cyan-500, from-red-600 to-rose-500
```

`accent` must be one of: `emerald`, `blue`, `violet` (default `violet`).

### Key files

- `scripts/skills/packaged/<id>/build.mjs` — esbuild config (template in plan)
- `scripts/skills/packaged/<id>/src/registry-bridge.ts` — re-exports `registerRenderer` from `momai:registry`
- `apps/momai/src/renderer/src/views/ExtensionPageRoute.tsx` — generic full-page route
- `apps/momai/src/renderer/src/components/chat/ExtensionRendererLoader.tsx` — `loadSkillRenderer()` with `globalThis` shim
- `apps/momai/scripts/node-core/services/manifest-routes.js` — mounts HTTP routes from `manifest.routes`
- `apps/momai/scripts/node-core/services/manifest-voice-hooks.js` — resolves voice command hooks
- `apps/momai/scripts/node-core/services/manifest-storage.js` — collects storage info for Privacy view
- `apps/momai/scripts/node-core/services/tool-priority.js` — builds dynamic system-prompt tool priority

---

## Voice Pipeline

MomAI has a voice pipeline for hands-free operation:

- **WakeWordDetector** → STT (Whisper) → LLM → TTS
- **Call mode**: Hands-free mode with real-time canvas visualization and animated text streaming (`call mode` UI)
- **Pre-initialized TTS**: First-token latency reduction via prewarm
- **Edge TTS**: Uses `edge-tts-universal` for cloud TTS
- **Say.js**: Fallback local TTS

---

## State Management

- Python sidecar for AI operations (`apps/core/`)
- WebSocket for real-time frontend updates
- Graph state for LangGraph orchestration
- **Prewarm**: Node Core pre-initialization for faster first response
