# Docker Hybrid Backend Roadmap

This roadmap is saved temporarily for later.

## Goal

Run Node Core and llama in Docker while keeping Electron and Python voice local on Windows.

## Why Later

- Python audio is host-bound today.
- Node Core assumes local process ownership.
- Token, lifecycle, and URL contracts need a separate runtime provider.
- Extensions with Windows capabilities cannot simply move into Linux containers.

## Required Work

- Add an explicit Docker backend mode.
- Add secure token injection for the container.
- Make Node Core connect to a host Python service without kill/restart logic.
- Add a runtime-provider abstraction in Electron.
- Add a supported container health and readiness contract.
- Make model use volume-based and verified.
- Define which extensions are server-safe.

## Not Yet Included

- Multi-user auth.
- Internet exposure.
- Kubernetes.
- GPU support.
- Browser voice capture.
