# Component Architecture (C4 - Nivel 3)

Status: Draft  
Owner: MomAI Team  
Ultima revisao: 2026-04-17  
Relacionados: [CONTAINER_ARCHITECTURE.md](./CONTAINER_ARCHITECTURE.md), [RUNTIME_BEHAVIOR.md](./RUNTIME_BEHAVIOR.md)

## Objetivo

Detalhar componentes criticos em Desktop e Core.

## Core (`apps/core`)

- `main.py`: entrada da aplicacao FastAPI.
- `startup.py`: inicializacao progressiva de IA, skills e servicos.
- `api/router.py` + `api/routes/*`: composicao de endpoints.
- `ai/orchestrator.py`: coordenacao de conversa, contexto e ferramentas.
- `ai/tool_selector.py`: selecao de tools/skills por intencao.
- `services/voice/*`: wake word, transcricao e TTS.
- `services/reminders/*`: agendamento e execucao de lembretes.
- `database/models.py` + `database/vector_db.py`: persistencia relacional e vetorial.

## Desktop (`apps/momai`)

- `src/main/index.ts`: lifecycle, IPC global e bootstrap.
- `src/main/pythonManager.ts`: preparo e start do backend local.
- `src/main/windowManager.ts`: janelas, overlay, eventos de UI.
- `src/preload/index.ts`: surface segura `window.api`.
- `src/renderer/src/App.tsx`: orquestracao de views e onboarding.

## Pontos de acoplamento criticos

- Endpoints de chat/estado e eventos de bootstrap.
- Eventos IPC do preload para comandos de janela e backend.
- Contratos de schema API em `apps/core/api/schemas.py`.

## Riscos arquiteturais observados

- Crescimento de acoplamento entre bootstrap do Electron e estado do Core.
- Divergencia de contrato quando UI e Core evoluem em ritmos diferentes.
- Complexidade crescente em extensoes sem governanca de contratos.

