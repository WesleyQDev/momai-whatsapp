# MomAI Docker Development Roadmap

## Context

This document saves the current Docker planning snapshot so it can be resumed later.

Baseline assumption: PR `#247` is treated as already merged for planning purposes.

## What the first Docker step is

The first useful Docker outcome is a reproducible development toolchain, not a runtime product.

## Current decision set

- Windows + Docker Desktop is the initial target.
- Electron and Python audio stay native in the first stage.
- Models stay out of the image and live in verified volumes.
- CPU is the only official backend for the first stage.
- The long-term direction is a single-user appliance, not a multi-user service.

## Roadmap summary

### Stage A: Toolchain

- Build Linux images for Node and Python development.
- Run lint, typecheck, tests, and smoke checks in Docker.
- Keep the Windows workspace clean.

### Stage B: Headless validation

- Add container smoke tests for Node Core and Python without audio.
- Use temporary stores and mock model behavior.

### Stage C: Hybrid backend

- Put Node Core and llama in Docker.
- Keep Python voice local initially.
- Introduce a runtime provider and token injection.

### Stage D: Appliance

- Move toward a single-user server with verified persistence, TLS, auth, and client-side audio.

## Reusable baseline from PR #247

- SHA-pinned binary hydration.
- Stronger extension isolation.
- Dependency audits in CI and release.
- Extension route and path hardening.

## Current gaps before runtime Docker

- Dedicated dev Dockerfiles.
- Container CI workflow.
- Frozen toolchain installation in containers.
- Volume strategy for Linux dependencies.
- A separate runtime-provider abstraction.
- Verified model volume flow.
- Clear hybrid/appliance contracts.

## Resume point

When continuing, start with `.specs/features/docker-development/spec.md` and implement the Stage A toolchain only.
