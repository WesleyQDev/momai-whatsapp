# AGENTS.md - MomAIOS Development Guide

This file provides guidelines for agentic coding agents working on the MomAIOS codebase.

## Project Overview

MomAIOS is the monorepo for MomAI, a local-first, privacy-focused virtual assistant combining LLMs with real computer actions. It uses pnpm workspaces and Turbo.

### Apps Structure

- `apps/momai/` - Electron + React + TypeScript (GUI)
- `apps/core/` - Python/FastAPI (backend AI engine)
- `apps/internal-docs/` - Docusaurus documentation site

---

## Build / Lint / Test Commands

### Root Commands (from repository root)

```bash
pnpm dev              # Start desktop app in dev mode
pnpm dev:core         # Start Python backend only
pnpm dev:all          # Run both core and desktop concurrently
pnpm build            # Build all apps via Turbo
pnpm lint             # Lint all apps via Turbo
pnpm typecheck        # Type-check all apps via Turbo
pnpm format           # Format all apps via Turbo
pnpm docs:internal    # Start internal Docusaurus docs
```

### Desktop App (apps/momai/)

```bash
cd apps/momai

# Development
pnpm dev              # Start Electron app in dev mode

# Building
pnpm build            # Full build (includes typecheck + hydrate-bin)
pnpm build:win        # Build Windows .exe
pnpm build:linux      # Build Linux AppImage

# Linting & Typecheck
pnpm lint             # ESLint (caches to .eslintcache)
pnpm typecheck        # Full TypeScript check (node + web)
pnpm typecheck:node   # Typecheck Node/preload only
pnpm typecheck:web    # Typecheck React/web only
pnpm format           # Prettier write
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

### Files

| File | Purpose |
|------|---------|
| `src/renderer/src/components/chat/SkillResponseRegistry.ts` | Registry for type → component mapping |
| `src/renderer/src/components/chat/StructuredResponseRenderer.tsx` | Dispatches to the correct renderer |
| `src/renderer/src/components/chat/WeatherCard.tsx` | Example: weather forecast card |
| `scripts/skills/core/search/runtime.js` | Example: returns `{ type: 'weather', data: {...} }` |
| `scripts/node-core.js` (line ~2814) | SSE streaming of `structured_response` |
| `src/renderer/src/services/api.ts` | SSE parsing + `StructuredResponse` interface |
| `src/renderer/src/hooks/useChatHandlers.ts` | State update for `structuredResponse` |

---
