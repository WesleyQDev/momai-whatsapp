# Docker Appliance Roadmap

This roadmap captures the future single-user server direction.

## Goal

Turn MomAI into a single-user appliance with a browser or thin client, one Node Core writer, verified data volumes, and explicit TLS/auth.

## Required Changes

- Replace the Electron session token with persistent owner auth.
- Separate browser auth from internal service auth.
- Move notes/privacy/exports behind server APIs.
- Make Node Core the sole writer of its data store.
- Replace local-only audio assumptions with client-captured audio or browser playback.
- Add extension capability scoping for server-safe execution.
- Add backup/restore and verified model volumes.

## Not Yet Included

- Multi-user tenancy.
- Distributed persistence.
- Service mesh.
- GPU autoscaling.
