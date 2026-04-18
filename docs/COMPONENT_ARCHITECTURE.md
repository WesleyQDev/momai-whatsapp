# Component Architecture (C4 - Nivel 3)

Status: Draft  
Owner: MomAI Team  
Ultima revisao: 2026-04-17  
Relacionados: [CONTAINER_ARCHITECTURE.md](./CONTAINER_ARCHITECTURE.md), [RUNTIME_BEHAVIOR.md](./RUNTIME_BEHAVIOR.md)

## Objetivo

Detalhar componentes criticos em Desktop e Core.

## Core Node (`apps/momai`)

- `scripts/node-core.js`: backend local primario (HTTP + WS) e orquestracao runtime.
- Runtime semantico local no `node-core` (Ultra-first):
  - servidor de embeddings (`llama-server --embedding`) sob demanda;
  - indice vetorial local (LanceDB) para notas/skills/tools;
  - execucao automatica de skills criticas (`scheduler`, `memory`, `search`) no hot path do chat Ultra.
- `src/main/coreManager.ts`: lifecycle do backend Node e retry/backoff de processo.
- Integracao com `llama.cpp` (`apps/core/bin/*/llama-server`) para inferencia local.
- Persistencia local de runtime (sessoes, settings, reminders e metadados de chat).

## Python Sidecar (`apps/core`)

- `main.py`: runtime FastAPI usado como sidecar especializado.
- `startup.py`: bootstrap enxuto (DB + registry de plugins), sem stack LLM principal.
- `services/voice/*`: wake word, transcricao e TTS.
- Endpoints mantidos no sidecar:
  - `/voice/*` (transcricao e controle de wake word)
  - `/chat/speak` e `/chat/stop-voice` (ponte TTS)
  - `/plugins/*` (listagem e execucao de tools)

## Desktop (`apps/momai`)

- `src/main/index.ts`: lifecycle, IPC global e bootstrap.
- `src/main/coreManager.ts`: start/stop do Core Node local.
- `src/main/pythonManager.ts`: sidecar Python pre-start no boot (background) e reutilizacao sob demanda.
- `src/main/windowManager.ts`: janelas, overlay, eventos de UI.
- `src/preload/index.ts`: surface segura `window.api`.
- `src/renderer/src/App.tsx`: orquestracao de views e onboarding.

## Pontos de acoplamento criticos

- Endpoints de chat/estado e eventos de bootstrap.
- Eventos IPC do preload para comandos de janela e controle de backend.
- Contrato HTTP/WS estavel em `127.0.0.1:8000` para evitar refactor imediato de UI.

## Riscos arquiteturais observados

- Divergencia de contrato quando API Node e UI evoluem em ritmos diferentes.
- Regressao de voz caso sidecar Python nao mantenha paridade funcional.
- Complexidade crescente em extensoes sem governanca de contratos.
