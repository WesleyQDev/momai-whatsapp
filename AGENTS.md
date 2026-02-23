# AGENTS.md - MomAI Development Guide

This file provides guidelines for agentic coding agents working on the MomAI codebase.

## Project Overview

MomAI is a local-first, privacy-focused virtual assistant combining LLMs with real computer actions. It's a **monorepo** using pnpm workspaces and Turbo.

### Apps Structure

- `apps/desktop/` - Electron + React + TypeScript (GUI)
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

### Desktop App (apps/desktop/)

```bash
cd apps/desktop

# Development
pnpm dev              # Start Electron app in dev mode

# Building
pnpm build            # Full build (includes typecheck + hydrate-bin)
pnpm build:win        # Build Windows .exe
pnpm build:mac        # Build macOS .app
pnpm build:linux      # Build Linux AppImage

# Linting & Typecheck
pnpm lint             # ESLint (caches to .eslintcache)
pnpm typecheck        # Full TypeScript check (node + web)
pnpm typecheck:node   # Typecheck Node/preload only
pnpm typecheck:web    # Typecheck React/web only
pnpm format           # Prettier write
```

### Core App (apps/core/)

```bash
cd apps/core

# Development (uses uv for Python environment)
uv run uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

**Note:** No formal test commands exist yet. Core uses Python 3.12+ with `uv` for dependency management.

---

## Code Style Guidelines

### Desktop (TypeScript / React / Electron)

**Prettier Configuration** (`.prettierrc.yaml`):
```yaml
singleQuote: true
semi: false
printWidth: 100
trailingComma: none
```

**ESLint Rules** (`eslint.config.mjs`):
- Uses `@electron-toolkit/eslint-config-ts`
- React 19 with JSX runtime
- React Hooks rules enabled
- Disabled rules: `explicit-function-return-type`, `no-explicit-any`, `ban-ts-comment`, `exhaustive-dels`

**TypeScript Guidelines**:
- Strict mode via electron-toolkit tsconfig
- Component files: `*.tsx` for components, `*.ts` for utilities
- Avoid `any` when possible; use `unknown` for generic fallbacks

**React Patterns**:
- Use functional components with hooks
- Avoid prop-types (TypeScript handles this)
- Use `react-router-dom` for routing

**Imports**:
```typescript
// Grouped order: external → internal → relative
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { SomeIcon } from '@heroicons/react'
import { api } from '@/services/api'
import { useAppStore } from '@/store/app'
import './Component.css'
```

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
- Desktop: Uses `.env` files in `apps/desktop/`
- Core: Uses `.env` file in `apps/core/`

---

## Important Notes

1. **Git workflow**: Use conventional commits (`feat:`, `fix:`, `docs:`)
2. **Dependencies**: Must use pnpm (enforced via `preinstall` script)
3. **Release process**: Uses GitHub Actions (`.github/workflows/release.yml`)

---