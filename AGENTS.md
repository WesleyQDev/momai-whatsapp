# AGENTS.md - MomAIOS Agent Operating Manual

This file is the operational manual for AI coding agents and contributors working in this repository. It should help an agent decide what to inspect, what rules matter, what to validate, and which files are sources of truth during a development session.

It is not meant to replace the full documentation in `docs/`, `CONTRIBUTING.md`, or `.opencode/rules/`. When a detail belongs elsewhere, this file keeps the decision-critical summary and points to the authoritative source.

---

## 1. Source Of Truth Precedence

When documentation conflicts, use this order:

1. Executed code and configuration: `package.json`, `pyproject.toml`, `turbo.json`, workflows, Electron/Vite/Tailwind/TS configs.
2. Schemas, types, manifests, and registries: TypeScript interfaces, Pydantic models, `manifest.json`, `registry.json`.
3. Tests: unit/integration tests define intended behavior and regression expectations.
4. GitHub workflows: `.github/workflows/*` define what CI/release currently runs automatically.
5. `AGENTS.md`: operational rules for agents and contributors.
6. Project docs: `README.md`, `docs/**`, app READMEs, historical plans/specs.
7. Inline comments and historical notes: useful evidence, but not final authority.

Rules:

- Never trust a version number in prose when a package/config file exists.
- Treat docs as stale until confirmed against code when making implementation decisions.
- If code and docs disagree, follow the code for the current change and update docs when appropriate.
- If tests and code disagree, inspect both; do not blindly change either without understanding the intended behavior.

---

## 2. Project Overview

MomAIOS is the monorepo for MomAI, a local-first, privacy-focused virtual assistant that combines LLMs with real computer actions. It uses pnpm workspaces and Turborepo.

Apps and major packages:

- `apps/momai/` - Main desktop app: Electron, React, TypeScript, Node Core, skills runtime.
- `apps/core/` - Python/FastAPI sidecar for voice, STT/TTS, local settings/data, and inference helpers.
- `apps/fortscript/` - Python utility library for pausing scripts/processes during gaming or heavy apps.
- `apps/landing-page/` - Vite + React + TailwindCSS landing page.
- `apps/momai-promo-video/` - Remotion promotional video.
- `docs/` - Technical docs, guides, architecture, maintainer notes, and historical plans/specs.
- `registry.json` - Official extension install allowlist.

Important architecture surfaces:

- Electron main process: `apps/momai/src/main/`
- Electron preload bridge: `apps/momai/src/preload/`
- React renderer: `apps/momai/src/renderer/src/`
- Node Core: `apps/momai/scripts/node-core/`
- Skills platform: `apps/momai/scripts/skills/`
- Installed extension data during dev/runtime: `apps/momai/data/extensions/`
- Core Python API: `apps/core/api/`
- Core Python services: `apps/core/services/`

---

## 3. Operational Workflow For Agents

Before changing code:

- Identify the scope: renderer UI, Electron main/preload, Node Core, Python Core, packaged skill, landing page, docs, CI/release, or governance.
- Read nearby files and tests before inventing a new pattern.
- Search for an existing implementation of the same shape before adding helpers, abstractions, routes, or state.
- Check whether the change touches persisted data, manifests, public APIs, IPC/preload contracts, extension routes, or build/release behavior.
- If touching `apps/momai/scripts/skills/packaged/<id>/`, read the skill's `manifest.json`, `runtime.js` or background worker, and the mirror-repo rule in this file.
- If touching app-level extension handling, read `.opencode/rules/extension-ui-no-leak.md` first.
- If touching dependencies, inspect the relevant `package.json`, `pyproject.toml`, and lockfile.
- If preparing an issue/PR, check existing issues, PRs, and remote branches for duplicates when GitHub access is available.

Branch/session workflow:

- On an existing feature branch with pending work, continue there unless the task would mix unrelated scope.
- On `main` with a clean working tree, sync with `origin/main` and create a descriptive branch automatically.
- On `main` with uncommitted changes, ask once whether to move them to a branch, continue on `main`, or discard them.
- Before creating a PR, check for an existing related issue/PR. Link the PR to an issue when applicable.
- When the user signals shipping is desired, create the PR with the template filled and report validation performed.
- Never merge a PR unless the user explicitly asks and the checks/review state allow it.

During changes:

- Prefer the smallest correct change.
- Do not mix broad refactors with bug fixes or features unless the refactor is required to implement the change safely.
- Keep behavior changes explicit and testable.
- Preserve existing public contracts unless there is a concrete migration plan.
- Do not hide errors with silent fallbacks in critical paths; log or propagate enough information to debug.
- Do not alter user data, local stores, or extension storage formats without compatibility/migration reasoning.

After changes:

- Run the narrowest relevant tests first.
- Run lint/typecheck/tests appropriate to the touched area before declaring work complete.
- Self-review the diff for unrelated changes, secrets, lockfile noise, and accidental generated files.
- Update docs when commands, contracts, manifests, APIs, permissions, extension behavior, or workflows change.
- For packaged skill changes, verify whether the external mirror repo and `registry.json` must be updated.

---

## 4. Critical Rules

These rules stay in this file because violations can cause bugs, vulnerabilities, architectural regressions, broken releases, or inconsistent extension behavior.

### Package Managers And Dependencies

- Use `pnpm` for Node dependencies. Do not use npm/yarn to install packages in this repo.
- Use `uv` for Python environments and dependency operations in `apps/core/` and Python-side workflows that already use uv.
- Do not modify lockfiles unless dependencies actually changed.
- Do not add dependencies without checking whether an existing dependency or local utility already solves the problem.
- If dependencies change, update the correct lockfile and declare the dependency impact in the PR.

#### Lockfile Sync

O `pnpm-lock.yaml` deve estar sempre sincronizado com `package.json`. CI usa `--frozen-lockfile` para validar.

Git hooks em `.githooks/` detectam lockfile stale após `git pull`, `git merge` e `git rebase`:

```bash
git config core.hooksPath .githooks
```

Se o CI falhar com `ERR_PNPM_OUTDATED_LOCKFILE`, corrigir com:

```bash
pnpm install && git add pnpm-lock.yaml && git commit -m "chore(deps): sync lockfile"
```

Os hooks são DX complementar — não substituem a validação do CI.

### Secrets And Environment

- Never commit `.env` or `.env.*` files. `.env.example` is allowed.
- Do not commit secrets, tokens, credentials, local machine paths, or private environment details.
- Security vulnerabilities must follow `SECURITY.md`; do not open public issues for sensitive vulnerabilities.

### Validation

- Before a PR, run the relevant validation locally. At minimum, for app code, use `pnpm lint`, `pnpm typecheck`, and relevant tests.
- The current CI workflow is not the complete quality bar. CI currently blocks committed `.env` files and runs MomAI lint/typecheck; agents should still run tests when behavior changes.
- Do not weaken, delete, or skip tests just to make a change pass.
- Tests should assert user- or contract-visible behavior, not mirror implementation details.

### Architecture And Compatibility

- Preserve Electron security boundaries: renderer must not gain direct Node/system access; use preload/main/backend contracts.
- Preserve API, IPC, manifest, route, and persisted-data compatibility unless the task explicitly includes a migration.
- Do not hardcode ports/hosts when variant/config helpers already provide them.
- Do not duplicate business logic across renderer, Node Core, Python Core, and skills when a shared contract already exists.
- Do not introduce app-main knowledge of a specific skill. See the extension rules below.

---

## 5. Commands

Use `package.json` files as the final source of truth. These are the operational commands confirmed from current configs.

### Root Commands

```bash
pnpm dev              # Start the desktop app via the momai workspace
pnpm dev:momai        # Run electron-vite dev inside apps/momai
pnpm dev:desktop      # Alias for dev:momai
pnpm dev:core         # Start apps/core with uvicorn on 127.0.0.1:8000
pnpm dev:all          # Run core and desktop concurrently
pnpm build            # Build the momai desktop app and open apps/momai/dist
pnpm build:exe        # Build Windows installer/package for momai
pnpm build:linux      # Build Linux package for momai
pnpm build:unpack     # Build unpacked desktop app
pnpm build:appx       # Build Windows AppX variants
pnpm lint             # Turbo lint across configured workspaces
pnpm typecheck        # Turbo typecheck across configured workspaces
pnpm format           # Turbo format across configured workspaces
pnpm test             # Turbo tests across configured workspaces
pnpm docs:internal    # Start internal Docusaurus docs
```

Note: `pnpm build` currently targets the `momai` workspace, not every app in the monorepo.

### Desktop App (`apps/momai/`)

```bash
pnpm dev              # Copy registry, ensure dev binaries, run electron-vite dev
pnpm test             # Vitest
pnpm test:watch       # Vitest watch mode
pnpm test:coverage    # Vitest with coverage
pnpm test:main        # Main-process tests
pnpm test:renderer    # Renderer tests
pnpm lint             # ESLint with cache
pnpm typecheck        # Node/preload + web TypeScript checks
pnpm typecheck:node   # Node/preload TypeScript check
pnpm typecheck:web    # Renderer/web TypeScript check
pnpm build            # Prebuild + typecheck + electron-vite build
pnpm build:exe        # Windows NSIS build
pnpm build:linux      # Linux build
pnpm clean            # Remove build/data/model caches listed in script
```

### Core Backend (`apps/core/`)

```bash
pnpm dev              # uv run uvicorn main:app --reload --host 127.0.0.1 --port 8000
pnpm test             # uv run pytest
pnpm test:watch       # uv run pytest --watch
```

### Validation By Change Type

| Change type | Minimum useful validation |
|-------------|---------------------------|
| Renderer UI | `pnpm --filter momai typecheck:web`, relevant renderer tests, manual UI check when visual behavior changes |
| Electron main/preload | `pnpm --filter momai typecheck:node`, relevant main/preload tests |
| Node Core | Relevant Node Core tests plus `pnpm --filter momai typecheck:node` when TS boundary is touched |
| Python Core | `cd apps/core && pnpm test` or targeted `uv run pytest ...` |
| Packaged skill | Skill build/test if present, host integration checks, manifest validation, mirror repo assessment |
| Landing page | `pnpm --filter landing-page lint`, `pnpm --filter landing-page typecheck`, build if route/content changes |
| Docs only | Read rendered Markdown mentally, verify links/paths, run format only if docs tooling requires it |
| CI/release | Validate workflow syntax mentally and compare with `package.json` scripts; avoid claiming CI runs steps it does not run |

---

## 6. Tech Stack And Version Policy

Do not hardcode dependency versions in this file unless the version itself changes agent behavior. Use package/config files as source of truth.

Current confirmed sources:

- Root package manager: `package.json` `packageManager` field.
- Desktop stack: `apps/momai/package.json`, `apps/momai/electron.vite.config.ts`, `apps/momai/tailwind.config.js`, TS configs.
- Landing page stack: `apps/landing-page/package.json`.
- Promo video stack: `apps/momai-promo-video/package.json`.
- Core Python version and dependencies: `apps/core/pyproject.toml` and `apps/core/uv.lock`.
- FortScript Python version and dependencies: `apps/fortscript/pyproject.toml` and `apps/fortscript/uv.lock`.
- Turbo behavior: `turbo.json`.
- CI/release behavior: `.github/workflows/`.

Operational facts that affect decisions:

- Node CI uses Node.js 20 in GitHub Actions.
- `apps/core` requires Python `>=3.12`.
- `apps/fortscript` supports Python `>=3.10`.
- The desktop app uses build variants with different ports; see `apps/momai/src/main/variants.ts`.
- Renderer API URLs are injected by preload and fall back to legacy `127.0.0.1:8000`; see `apps/momai/src/renderer/src/constants.ts`.

---

## 7. Code Style And Patterns

### TypeScript / React / Electron

- Components: PascalCase (`SettingsPanel.tsx`).
- Hooks: camelCase with `use` prefix (`useAudioRecorder.ts`).
- Utilities: camelCase (`formatTime.ts`).
- Constants: UPPER_SNAKE_CASE.
- Utility files commonly use kebab-case (`safe-tools.ts`).
- Prefer existing design-system/theme patterns and support both dark and light themes when adding UI.
- Keep renderer, preload, and main responsibilities separate.
- Avoid direct system access in renderer code.
- Avoid hardcoded skill-specific behavior in app code.

### React Guidance

- Follow existing React patterns in nearby files before introducing new state abstractions.
- Do not add `useMemo` or `useCallback` by default; use them only when there is a measured or clear referential-stability reason and the surrounding code uses that style.
- For user-facing UI changes, check loading, empty, error, success, desktop, and mobile/responsive states where applicable.

### Python / FastAPI

- Core Python requires 3.12+.
- Follow PEP 8 and use type hints for public functions.
- Use async/await for I/O.
- Prefer dataclasses or Pydantic models for structured data.
- Functions: snake_case.
- Classes: PascalCase.
- Constants: UPPER_SNAKE_CASE.
- FastAPI dependencies belong in `api/deps.py` or route-local dependency helpers.
- Routes belong under `api/routes/` and are composed through the app/router entrypoints.
- Use `HTTPException` for HTTP errors and log failures with useful context.

---

## 8. Extension And Skill Rules

Extensions are a core architecture boundary. Preserve these rules even if existing code has legacy violations.

### Self-Contained Skill Rule

Skills are self-contained ZIP-style artifacts. The main app must not know a packaged/downloaded skill by specific ID, route, event type, tool name, icon, color, or source path.

Forbidden in main app code (`apps/momai/src/**`, `apps/momai/scripts/node-core/**`):

- `if (id === 'whatsapp')`, `if (id === 'launcher')`, or equivalent skill-ID branches.
- Hardcoded routes like `/extensions/whatsapp/disconnect` outside tests/fixtures or migration code.
- Hardcoded structured response checks for a specific extension type.
- Imports from `apps/momai/scripts/skills/packaged/<id>/src/`.
- System prompts or voice routing that name a specific skill tool instead of using manifest-driven helpers.
- Hardcoded extension icons, gradients, colors, labels, or storage paths in host app code.

Use manifest-driven generic mechanisms instead:

- UI: `manifest.ui` with `page`, `pageType`, `panel`, `panelType`.
- Events: `manifest.eventTypes`.
- HTTP routes: `manifest.routes` mounted by `manifest-routes.js`.
- Storage disclosure: `manifest.storage` collected by `manifest-storage.js`.
- Voice hooks: `manifest.voiceHooks` resolved by `manifest-voice-hooks.js`.
- Quit cleanup: `manifest.persistOnQuit`.
- Theme: `manifest.theme.gradient` and `manifest.theme.accent`.
- Tool priority: `manifest.toolPriority` and `tool-priority.js`.
- Renderer loading: `ExtensionPageRoute`, `ExtensionRendererLoader`, `SkillResponseRegistry`.

Detailed rule and migration checklist: `.opencode/rules/extension-ui-no-leak.md`.

### Packaged Skill Layout

Packaged skills live under:

```text
apps/momai/scripts/skills/packaged/<id>/
```

Common files for a skill with UI:

```text
manifest.json
runtime.js or background-worker.js
package.json
build.mjs
src/page.tsx
src/panel.tsx
src/registry-bridge.ts
dist/page.js
dist/panel.js
```

`dist/` files are generated by the skill build and loaded by the host through `/extensions/<id>/dist/<file>`.

### Structured Responses

Skills may return structured UI responses:

```js
return {
  tool: 'my_tool',
  structuredResponse: {
    type: 'my_type',
    data: { /* JSON-serializable payload */ }
  },
  instruction: JSON.stringify(result)
}
```

Operational contract:

- `structuredResponse.type` must match a registered renderer type.
- `structuredResponse.data` must be JSON-serializable.
- Host dispatch uses `SkillResponseRegistry` and `StructuredResponseRenderer`.
- Extension UI bundles register renderers dynamically through `ExtensionRendererLoader`.
- Prefer structured responses for rich cards, tables, previews, confirmations, or extension panels.

Key files:

- `apps/momai/src/renderer/src/components/chat/SkillResponseRegistry.ts`
- `apps/momai/src/renderer/src/components/chat/StructuredResponseRenderer.tsx`
- `apps/momai/src/renderer/src/components/chat/ExtensionRendererLoader.tsx`
- `apps/momai/src/renderer/src/views/ExtensionPageRoute.tsx`
- `apps/momai/src/renderer/src/services/api.ts`
- `apps/momai/scripts/node-core/services/skill-orchestrator.js`
- `apps/momai/scripts/node-core/api/routes/extensions.routes.js`

More tutorial-style detail belongs in `docs/extensions.md` and skill-specific READMEs.

### Install Registry And Community Catalog

MomAI uses two extension registries:

- `registry.json` at the repo root: local/official install allowlist used to validate install IDs and download URLs.
- Remote community catalog: fetched from `https://raw.githubusercontent.com/WesleyQDev/MomAI-App/main/community-extensions.json` by `community-registry.js`.

Security implications:

- Install requests must match the allowlist entry in `registry.json` when using the local install registry.
- Download URLs are validated for HTTPS and private-IP protection in `extensions.routes.js`.
- Do not bypass registry validation for convenience.
- If adding checksum support or changing install trust behavior, update tests and docs.

### Packaged Skills Have External Mirror Repositories

Packaged skills under `apps/momai/scripts/skills/packaged/<id>/` may have external GitHub mirror repositories. When the monorepo copy changes, the external repo and registry/release may need to change too.

Current mapping source of truth: `registry.json` download URLs and skill manifests.

Known packaged skills:

- `apps/momai/scripts/skills/packaged/whatsapp/` - mirrored by `WesleyQDev/momai-whatsapp-extension` per `registry.json`.
- `apps/momai/scripts/skills/packaged/launcher/` - verify current external repo before assuming a mirror name.

Before considering packaged-skill work complete:

- Check whether changed files are part of the external distributable.
- Update `manifest.json` version when behavior changes and release flow requires it.
- Sync changed runtime/UI/locales/package files to the mirror repo when applicable.
- Create matching tag/release in the external repo when the install URL changes.
- Update root `registry.json` if version or release URL changes.
- Verify the skill builds if it ships UI.

Do not sync app infrastructure files to external skill repos:

- `apps/momai/scripts/node-core/**`
- `apps/momai/src/renderer/**`
- `apps/momai/src/main/**`

---

## 9. Architecture Notes That Affect Coding

### Desktop Runtime

- Electron main process starts/manages Node Core and Python sidecar subprocesses.
- Renderer talks to backend APIs through URLs exposed by preload.
- Variant-specific ports are defined in `apps/momai/src/main/variants.ts`.
- Avoid introducing new hardcoded localhost ports in renderer or app code.

### Node Core

- Node Core lives in `apps/momai/scripts/node-core/`.
- It handles chat streaming, LLM orchestration, skills, extensions, semantic search, reminders, TTS bridge, and API routes.
- Structured responses are streamed as `structured_response` over SSE and persisted through the store layer.
- Extension install routes include SSRF/private-IP protections and checksum handling; do not weaken them.

### Python Core

- Python sidecar lives in `apps/core/`.
- It is FastAPI-based and handles voice-related operations such as wake word, quick transcription, call mode, and TTS endpoints.
- SQLite is used for local settings/data where applicable.
- Keep Node Core and Python sidecar contracts explicit when changing routes or environment variables.

### Voice Pipeline

MomAI supports hands-free operation:

```text
Wake word / microphone -> STT -> Node Core / LLM -> TTS -> renderer/audio output
```

Operational details:

- Core voice dependencies are defined in `apps/core/pyproject.toml`.
- Node Core proxies some voice/TTS operations to the Python sidecar.
- TTS may use Kokoro/ONNX through core and renderer-side engines such as Edge TTS or local fallbacks depending on settings.
- Do not assume a single TTS engine path without checking the current call site.

### Local Data And Persistence

- User data and app runtime state may live outside the repo at runtime.
- Dev data can appear under `apps/momai/data/`.
- Extension storage must be declared by manifests when user-visible privacy/storage surfaces depend on it.
- Any migration or cleanup of persistent data needs explicit compatibility reasoning.

---

## 10. CI, Release, And Governance

### Current CI Behavior

Current `.github/workflows/ci.yml`:

- Runs on push and pull request to `main` and `develop`.
- Blocks committed `.env` and `.env.*` files, except `.env.example`.
- Installs dependencies with `pnpm install --frozen-lockfile`.
- Runs `pnpm --filter momai lint`.
- Runs `pnpm --filter momai typecheck`.

Important: tests are still expected for behavior changes even if the current CI workflow does not run the full test suite.

### Release Workflow

Use `.github/workflows/release.yml` as the source of truth. The current workflow is manual (`workflow_dispatch`) and builds Windows and Linux artifacts, then creates/updates a public release in `WesleyQDev/MomAI-App`.

Do not claim release triggers or tag behavior without checking the workflow. Some docs may describe historical tag-trigger behavior.

### Contribution Rules

This project has a proprietary license. Contributions must follow:

- `CONTRIBUTING.md`
- `CLA.md`
- `SECURITY.md`
- `CODE_OF_CONDUCT.md`
- `.github/PULL_REQUEST_TEMPLATE.md`

Operational requirements for agents:

- Keep scope focused on one logical change.
- Use Conventional Commits for commit messages when committing.
- Update docs when behavior, commands, APIs, manifests, workflows, or user-visible behavior changes.
- Add or update tests when behavior changes or a regression is fixed.
- Identify dependency changes and update lockfiles only when required.
- Do not open PRs without a corresponding issue unless maintainers explicitly allow it.
- Respect maintainer decisions and review requests.

### Issues

Issue templates live in `.github/ISSUE_TEMPLATE/`:

- `bug_report.md` - expected vs observed behavior, reproduction steps, environment, logs/screenshots.
- `feature_request.md` - related problem, proposed solution, alternatives, context.

Agent rules for issues:

- Search open and closed issues before creating a new one when GitHub access is available.
- Use the matching template.
- Fill required sections with concrete information.
- Do not disclose security vulnerabilities in public issues; follow `SECURITY.md`.

### Pull Requests

The PR template requires:

- Description and type of change.
- Checklist acknowledging `CONTRIBUTING.md`, `AGENTS.md`, CLA, proprietary license, and rejection possibility.
- Technical verification.
- Testing declaration.
- Dependency declaration.

Agent rules for PRs:

- Check for duplicate PRs/branches when possible.
- Link to an issue when applicable.
- Report exactly what was tested.
- Do not skip checklist items.
- Do not include unrelated file churn.
- Do not include `.env`, secrets, generated local caches, or accidental artifacts.

---

## 11. Anti-Patterns To Avoid

Never do these unless the user or maintainer explicitly asks and the tradeoff is documented:

- Mix unrelated refactors with a bug fix or feature.
- Add abstractions before checking existing patterns.
- Duplicate extension-specific logic in the host app.
- Hardcode skill IDs, routes, event types, tool names, icons, colors, or storage paths in main app code.
- Add dependencies without justification.
- Modify lockfiles without dependency changes.
- Change public contracts without tests and docs.
- Introduce renderer-side Node/system access.
- Bypass extension install URL validation, permission checks, or manifest-driven routing.
- Swallow critical errors silently.
- Assume docs are current when package/config/code says otherwise.
- Update release or CI docs without checking `.github/workflows/`.
- Touch packaged skills without considering mirror repo synchronization.

---

## 12. Reference Documents

Use these when the task needs more detail:

- `README.md` - product overview, stack summary, documentation index.
- `docs/development.md` - setup, commands, conventions, project structure.
- `docs/architecture.md` - architecture, data flow, components, ADR-style decisions.
- `docs/extensions.md` - extension and skill platform details. Verify against current code before using old manifest examples.
- `docs/guides/ci-cd.md` - CI/CD explanation. Verify against `.github/workflows/` before relying on triggers or steps.
- `docs/maintainers/release-process.md` - maintainer release process.
- `docs/maintainers/dependencies.md` - dependency management.
- `.github/copilot-instructions.md` - supplementary AI coding instructions.
- `.opencode/rules/momai-context.md` - OpenCode project context.
- `.opencode/rules/extension-ui-no-leak.md` - detailed extension anti-leak rule.

---

## 13. Final Checklist For Agents

Before final response or PR handoff:

- Did you verify the relevant source of truth instead of trusting stale prose?
- Did you keep rules critical to safety, architecture, and release behavior intact?
- Did you avoid unrelated refactors?
- Did you preserve extension self-containment?
- Did you update tests/docs when contracts changed?
- Did you run the most relevant validation available?
- Did you check for secrets, `.env` files, lockfile noise, and generated artifacts?
- Did you clearly state what was changed and what was not verified?
