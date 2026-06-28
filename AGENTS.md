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

## Feature Workflow

Every new feature or fix follows this workflow. The agent has **2 interaction points** (start and finish) — no interruptions in between.

### Start of Work

```
1. Check current branch + git status
   │
   ├─ On feature branch with pending work?
   │   └─ YES → Continue working. DO NOT ask anything.
   │
   ├─ On main with pending changes (uncommitted)?
   │   └─ YES → Ask ONCE: "I found X modified files. Want me to:
   │            (a) Create a branch and move them there
   │            (b) Continue on main
   │            (c) Discard changes"
   │
   └─ On main, clean working tree?
       └─ YES → Sync with origin/main, create branch automatically.
                DO NOT ask. Just start working.
```

### Before Creating a Branch

```
2. Check for existing issues/PRs related to this task
   │
   ├─ Issue exists? → Link PR to it later
   │
   └─ No issue? → Create one using the template
       - Bug: .github/ISSUE_TEMPLATE/bug_report.md
       - Feature: .github/ISSUE_TEMPLATE/feature_request.md
       - Fill all required fields automatically
```

### During Work

```
3. Work without interruptions
   - Run pnpm lint, pnpm typecheck, pnpm test before finishing
   - Use conventional commits (feat:, fix:, docs:, refactor:)
```

### End of Work

```
4. WHEN USER SIGNALS DONE ("pronto", "acabou", "pode subir"):
   │
   ├─ Create PR (link the issue using "Closes #XX")
   │   - Fill PR template automatically
   │   - Run lint + typecheck + test
   │
   ├─ Ask: "Want me to merge?"
   │   ├─ YES → Merge, then close the issue automatically
   │   └─ NO → Leave it, user decides later
```

### What the Agent Does AUTOMATICALLY (no asking)

- Sync with main before starting (if on clean main)
- Create branch with descriptive name
- Run lint/typecheck/test before PR
- Fill PR template automatically
- Close issue after merge

### What the Agent NEVER Does (to avoid being annoying)

- ❌ Ask "want to create a branch?" every time
- ❌ Ask "want to push?" after every commit
- ❌ Ask "want to merge?" without user signaling completion
- ❌ Ask "is everything OK?" after every change

---

## Important Notes

1. **Git workflow**: Use conventional commits (`feat:`, `fix:`, `docs:`)
2. **Branch naming**: Create branches from `main`. Prefer `type/scope` (e.g. `feat/whatsapp-icon`, `fix/auth-headers`)
3. **Tag naming**: Releases use `v{semver}` format (e.g. `v1.4.1`)
4. **CI requirements**: Before opening a PR, ensure `pnpm lint`, `pnpm typecheck`, and `pnpm test` pass
5. **Dependencies**: Must use pnpm (enforced via `preinstall` script)
6. **Lockfile integrity**: Always use `pnpm install --frozen-lockfile` in CI
7. **Release process**: Triggered by git tags matching `v[0-9]+.*`. See [Release Process](docs/maintainers/release-process.md)
8. **Core Python**: Uses `uv` as package manager (uv.lock, pyproject.toml)
9. **OpenCode rules**: See `.opencode/rules/` for project-specific agent rules
10. **Governance files**: See `CODE_OF_CONDUCT.md`, `docs/labels.md`, `.github/ISSUE_TEMPLATE/`, `CONTRIBUTING.md`

---

## Contributing

This project has a **proprietary license** — see [LICENSE](LICENSE) for terms. Contributions are welcome but must follow the established process.

**Before contributing**, read:
- [CONTRIBUTING.md](CONTRIBUTING.md) — contribution rules, process, and AI contribution policy
- [CLA.md](CLA.md) — Contributor License Agreement (mandatory for all PRs)
- [SECURITY.md](SECURITY.md) — vulnerability reporting
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) — code of conduct

**Process**: Open an issue → Wait for feedback → Create branch → Implement → Open PR → Merge

---

## Issues

Use templates in `.github/ISSUE_TEMPLATE/`:
- `bug_report.md` — report bugs (label `bug`)
- `feature_request.md` — suggest features (label `enhancement`)

**Agent rules for issues**:
- Search existing issues before creating new ones
- Link PRs to existing issues when applicable
- Fill all required template fields automatically
- Never open duplicate issues

---

## Pull Requests

The PR template (`.github/PULL_REQUEST_TEMPLATE.md`) is **mandatory**.

**Agent rules for PRs**:
- Verify CI passes before opening
- Fill PR template automatically
- Keep scope focused on a single change
- Use Conventional Commits
- Update lockfiles when dependencies change
- Never modify `.env` files (blocked by CI)
- Link issue using "Closes #XX" in PR description

---

## Extensions & Skills

> **When working with extensions or skills, always check the detailed docs:**
>
> - **Extension architecture & manifest**: See [docs/extensions.md](docs/extensions.md)
> - **Extension UI rules (no hardcode)**: See `.opencode/rules/extension-ui-no-leak.md`
> - **Extension context & dual repos**: See `.opencode/rules/momai-context.md`
> - **Community extensions & registry**: See [docs/extensions.md](docs/extensions.md) § Community Extensions
> - **Structured skill responses**: See [docs/extensions.md](docs/extensions.md) § Structured Responses
> - **Self-contained extension UI**: See [docs/extensions.md](docs/extensions.md) § Self-Contained UI

### Critical Rules (Summary)

Skills are self-contained ZIP artifacts. The main app **NEVER** knows a specific skill by name, ID, route, event, tool, icon, color, or file path.

- ❌ Never hardcode: `if (id === 'whatsapp')`, `/extensions/whatsapp/*`, `'whatsapp_notification'`
- ✅ Always use: `manifest.*` fields + generic helpers (`mountSkillRoutes`, `collectStoredData`, `resolveVoiceReply`, `buildToolPriority`)
- ✅ Each skill with UI has its own `build.mjs` (esbuild) in `scripts/skills/packaged/<id>/`
- ✅ Skills have dual repos: monorepo + external GitHub repo (sync required)
