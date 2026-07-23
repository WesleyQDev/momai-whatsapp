# Docker Development Context

**Gathered:** 2026-07-21
**Spec:** `.specs/features/docker-development/spec.md`
**Status:** Ready for design

---

## Feature Boundary

This feature saves the first Docker milestone as a reproducible development toolchain. It is intentionally not the runtime containerization of MomAI.

---

## Implementation Decisions

### Development First

- Docker is used to reproduce toolchain behavior, not to replace the desktop runtime.
- The first deliverable is lint, typecheck, and test execution in containers.

### Host Runtime Stays Native

- Electron stays on Windows.
- Python voice/audio stays local for now.
- Node Core runtime containerization is deferred to a later stage.

### Model Strategy

- Development uses verified volumes for models, not model layers.
- The initial Docker images remain small and model-free.

### Future Direction

- The later stages are explicitly named: hybrid backend, then single-user appliance.
- The appliance roadmap is the future target, not the current implementation.

### Agent's Discretion

- Exact filenames and folder layout for Docker files.
- The precise shape of the Docker Compose dev commands.

### Declined / Undiscussed Gray Areas -> Assumptions

- Multi-user service design is not part of the current plan.
- GPU support is not part of the first Docker milestone.
- Kubernetes is out of scope for this savepoint.

---

## Specific References

- PR `#247` was treated as the security baseline for planning.
- The existing `scripts/Dockerfile.linux` is only a desktop Linux build image, not a runtime image.
- `apps/core` remains the local Python sidecar for audio in the first stage.

---

## Deferred Ideas

- Node Core runtime containerization.
- Hybrid backend mode for Windows Docker Desktop.
- Appliance server mode.
- Multi-user scaling.
- CUDA/Vulkan images.
