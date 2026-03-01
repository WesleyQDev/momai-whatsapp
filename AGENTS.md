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
