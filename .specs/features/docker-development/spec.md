# Docker Development Toolchain Specification

## Problem Statement

MomAI needs a reproducible Docker-based development environment that works on Windows Docker Desktop without changing the product runtime. Today the repo depends on host-specific tooling, native binaries, and mixed Node/Python setup flows that are hard to reproduce on another machine.

This feature saves the first Docker milestone as a development toolchain only. It does not move the desktop product into Docker yet.

## Goals

- Reproduce lint, typecheck, and tests in Docker with frozen dependencies.
- Keep Windows desktop runtime behavior unchanged in the first stage.
- Isolate Linux dependencies and caches from the Windows workspace.
- Make the Docker setup usable for the team before any runtime/container migration.

## Out of Scope

| Feature | Reason |
| --- | --- |
| Full Node Core runtime in Docker | That is a later stage, after the toolchain is stable |
| Python voice runtime in Docker | Audio and device access remain local for the first stage |
| Models baked into images | Development uses verified model volumes, not model layers |
| Multi-user appliance | Separate roadmap |
| Kubernetes | Too early for the current scope |

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| PR #247 is treated as the security baseline | Yes | It hardens the current codebase and reduces container risk | Yes |
| First target is Windows + Docker Desktop | Yes | Matches the user's intended local developer workflow | Yes |
| The first Docker result is a reproducible toolchain | Yes | Lowest-risk entry point and best DX return | Yes |
| Models are kept outside the image for now | Yes | Keeps the first image small and avoids multi-gigabyte pulls | Yes |
| Future scale target is a single-user appliance | Yes | Keeps the long-term direction explicit without overbuilding now | Yes |

**Open questions:** none for the first stage; later stages remain separate roadmaps.

## User Stories

### P1: Reproducible Dev Toolchain MVP

**User Story**: As a developer, I want the MomAI toolchain to run in Docker so that I can lint, typecheck, and test without installing all host dependencies manually.

**Why P1**: This is the first useful and low-risk Docker outcome.

**Acceptance Criteria**:

1. WHEN a clean checkout runs the Docker toolchain THEN the same lint, typecheck, and test commands SHALL pass using frozen dependencies.
2. WHEN Docker runs the toolchain THEN Windows source files and host-native runtime data SHALL remain untouched.
3. WHEN a developer uses the Docker setup THEN the result SHALL be documented and repeatable.

**Independent Test**: A fresh machine can run the documented Docker commands and get the same outputs as CI.

### P2: Isolated Linux Dev Environment

**User Story**: As a developer, I want Linux-specific dependencies and caches isolated from my Windows workspace so that Docker does not pollute local state.

**Why P2**: Prevents cross-platform dependency noise and keeps the host clean.

**Acceptance Criteria**:

1. WHEN the Docker toolchain installs dependencies THEN it SHALL use Linux-only volumes for pnpm and uv caches.
2. WHEN the container exits THEN host `node_modules` and `.venv` SHALL remain unchanged.

**Independent Test**: Running the Docker toolchain twice does not modify the Windows checkout beyond the intended artifacts.

### P3: Future-Ready Contracts

**User Story**: As a maintainer, I want the development Docker contracts to point toward later hybrid and appliance modes so that the next stages do not require a redesign.

**Why P3**: It avoids dead-end Docker choices while staying in scope.

**Acceptance Criteria**:

1. WHEN the development plan is saved THEN it SHALL explicitly reference the hybrid backend and appliance roadmaps.

## Edge Cases

- WHEN a dependency is missing in the container image THEN the toolchain SHALL fail fast with a clear error.
- WHEN a model download is attempted during dev tests THEN the test SHALL use a mock or volume fixture instead.
- WHEN the host does not support Docker Desktop features required by the plan THEN the docs SHALL say so clearly.

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| DDEV-01 | P1 | Design | Pending |
| DDEV-02 | P1 | Design | Pending |
| DDEV-03 | P2 | Design | Pending |
| DDEV-04 | P1 | Design | Pending |
| DDEV-05 | P1 | Design | Pending |
| DDEV-06 | P2 | Design | Pending |
| DDEV-07 | P1 | Design | Pending |
| DDEV-08 | P2 | Design | Pending |
| DDEV-09 | P1 | Design | Pending |
| DDEV-10 | P1 | Design | Pending |

**Coverage:** 10 total, 0 mapped to tasks, 10 unmapped ⚠

## Success Criteria

- [ ] A clean checkout can run the documented Docker lint/typecheck/test commands.
- [ ] The Docker setup uses frozen dependencies.
- [ ] The Windows workspace remains clean after Docker runs.
- [ ] The plan is saved in GitHub and can be resumed later.
