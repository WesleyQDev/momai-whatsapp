---
description: MomAIOS Project Context
globs:
alwaysApply: true
---

# MomAIOS Project Context

## Architecture
MomAIOS is a local-first, privacy-focused virtual assistant combining LLMs with real computer actions.

### Apps
- `apps/momai/` - Electron + React + TypeScript (GUI)
- `apps/core/` - Python/FastAPI (backend AI engine)
- `apps/internal-docs/` - Docusaurus documentation site

### Key Technologies
- **Desktop:** Electron 39.x, React 19, TypeScript 5.9, TailwindCSS 3.x, electron-vite
- **Core:** FastAPI, uvicorn, LangGraph, LanceDB, SQLite
- **Build:** pnpm workspaces, Turbo

## Important Patterns

### Structured Skill Responses
Skills can return structured UI components. The flow:
1. Skill `runtime.js` returns `{ structuredResponse: { type, data } }`
2. `node-core.js` streams via SSE
3. Frontend receives via `onStructuredResponse`
4. `StructuredResponseRenderer` dispatches to registered component

### Voice Pipeline
- WakeWordDetector → STT (Whisper) → LLM → TTS (Kokoro)
- Call mode for hands-free operation
- Pre-initialized TTS to reduce latency

### State Management
- Python sidecar for AI operations
- WebSocket for real-time frontend updates
- Graph state for LangGraph orchestration

## Code Style
- **TS/React:** PascalCase components, camelCase hooks/utils, kebab-case files
- **Python:** snake_case functions, PascalCase classes, PEP 8, type hints, async I/O
- **FastAPI:** Depends() injection, Pydantic schemas, routes in `api/routes/*.py`

## Environment
- Desktop: `.env` in `apps/momai/`
- Core: `.env` in `apps/core/`

## Commands
```bash
pnpm dev              # Start desktop app in dev mode
pnpm dev:core         # Start Python backend only
pnpm dev:all          # Run both concurrently
pnpm build            # Build all apps via Turbo
pnpm lint             # Lint all apps
pnpm typecheck        # Type-check all apps
pnpm format           # Format all apps
```
