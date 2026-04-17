# Container Architecture (C4 - Nivel 2)

Status: Draft  
Owner: MomAI Team  
Ultima revisao: 2026-04-17  
Relacionados: [SYSTEM_CONTEXT.md](./SYSTEM_CONTEXT.md), [COMPONENT_ARCHITECTURE.md](./COMPONENT_ARCHITECTURE.md)

## Objetivo

Detalhar containers principais da solucao e suas responsabilidades.

## Containers

- Desktop Container (`apps/momai`)
- Processo Electron main (ciclo de vida, bootstrap do backend, janelas, IPC)
- Preload bridge (API segura para renderer)
- Renderer React (chat, onboarding, configuracoes, estado de inicializacao)

- Core Container (`apps/core`)
- API FastAPI (HTTP + WebSocket)
- Orquestracao de IA (LangGraph, tool selection, providers)
- Servicos (voz, reminders, extensoes, memoria, monitoramento)
- Persistencia (SQLite e LanceDB)

- Docs Container (`apps/internal-docs`)
- Publicacao navegavel da documentacao interna.

## Relacoes entre containers

1. Renderer chama preload -> preload publica IPC para main.
2. Main gerencia backend Python e disponibiliza progresso de init.
3. Desktop consome API do Core em `127.0.0.1:8000`.
4. Core persiste estado localmente e retorna eventos/respostas por streaming.

## Decisoes de desenho vigentes

- Backend local desacoplado do processo Electron para resiliencia.
- Contrato de comunicacao baseado em HTTP/WebSocket.
- Persistencia local para privacidade e operacao offline-first.

