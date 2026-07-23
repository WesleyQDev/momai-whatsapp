# Docker Development Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill. This file is a planning snapshot only.

---

**Design**: `.specs/features/docker-development/design.md`
**Status**: Draft

---

## Execution Plan

### Phase 1: Contract

T1 -> T2 -> T3 -> T4

### Phase 2: Images

T5 -> T6 -> T7 -> T8

### Phase 3: DX Commands

T9 -> T10 -> T11 -> T12

### Phase 4: CI

T13 -> T14 -> T15 -> T16 -> T17

---

## Task Breakdown

### T1: Define Docker development contract

**What**: Write the canonical dev-only environment contract for paths, volumes, UID, ports, and cache locations.
**Where**: `.specs/features/docker-development/spec.md`, `.specs/features/docker-development/context.md`
**Depends on**: None
**Tests**: none
**Gate**: build

### T2: Expand Docker ignore rules

**What**: Add Docker-specific exclusions for data, models, caches, and generated artifacts.
**Where**: `.dockerignore`
**Depends on**: T1
**Tests**: none
**Gate**: build

### T3: Align uv version contract

**What**: Record the single uv version used by CI, scripts, and Docker images.
**Where**: docs/plans and Docker notes
**Depends on**: T1
**Tests**: none
**Gate**: build

### T4: Document dev/runtime split

**What**: Record that Electron, Python audio, and Node runtime remain native in Stage A.
**Where**: `.specs/features/docker-development/design.md`
**Depends on**: T1
**Tests**: none
**Gate**: build

### T5: Create Node quality image

**What**: Build a Linux image for lint, typecheck, and tests.
**Where**: `docker/development/Dockerfile.node`
**Depends on**: T1, T2, T3
**Tests**: integration
**Gate**: full

### T6: Create Python quality image

**What**: Build a Linux image for `uv sync --frozen` and pytest.
**Where**: `docker/development/Dockerfile.python`
**Depends on**: T1, T2, T3
**Tests**: integration
**Gate**: full

### T7: Add Docker Compose harness

**What**: Add Compose configuration for local dev jobs and shell access.
**Where**: `docker/development/compose.yaml`
**Depends on**: T5, T6
**Tests**: integration
**Gate**: full

### T8: Add non-root runtime behavior

**What**: Ensure the development containers run as an unprivileged user.
**Where**: Dockerfiles
**Depends on**: T5, T6
**Tests**: integration
**Gate**: full

### T9: Add Docker task scripts

**What**: Add root package scripts for Docker lint/typecheck/test entry points.
**Where**: `package.json`
**Depends on**: T7
**Tests**: none
**Gate**: build

### T10: Add smoke test script

**What**: Add a script that exercises the container entry points and reports clear failures.
**Where**: `docker/development/smoke-test.ps1`
**Depends on**: T7
**Tests**: integration
**Gate**: full

### T11: Document the workflow

**What**: Write a short README for the Docker development flow.
**Where**: `docker/development/README.md`
**Depends on**: T9, T10
**Tests**: none
**Gate**: build

### T12: Validate clean checkout flow

**What**: Verify the Docker commands run from a clean checkout without touching host runtime state.
**Where**: CI/local smoke
**Depends on**: T9, T10, T11
**Tests**: integration
**Gate**: full

### T13: Add container CI workflow

**What**: Create a separate workflow for Docker image validation.
**Where**: `.github/workflows/container-ci.yml`
**Depends on**: T12
**Tests**: integration
**Gate**: full

### T14: Add Dockerfile linting

**What**: Run Hadolint against the new Dockerfiles.
**Where**: container CI
**Depends on**: T13
**Tests**: integration
**Gate**: full

### T15: Add image scan

**What**: Scan the built images for OS and language vulnerabilities.
**Where**: container CI
**Depends on**: T13
**Tests**: integration
**Gate**: full

### T16: Add size and cache reporting

**What**: Report image size, build time, and cache effectiveness.
**Where**: container CI
**Depends on**: T13
**Tests**: none
**Gate**: build

### T17: Add parity check

**What**: Confirm local Docker and CI use the same commands and frozen inputs.
**Where**: container CI docs and workflow
**Depends on**: T14, T15, T16
**Tests**: integration
**Gate**: full
