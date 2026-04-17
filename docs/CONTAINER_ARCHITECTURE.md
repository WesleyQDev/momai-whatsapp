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

- Core Node Container (`apps/momai/scripts/node-core.js`)
- API local HTTP + WebSocket (`127.0.0.1:8000`)
- Orquestracao de chat e estado local (streaming, sessoes, settings, reminders, extensoes)
- Integracao com `llama.cpp` (`llama-server`) para inferencia local

- Python Sidecar Container (`apps/core`)
- Servicos especializados sob demanda (voz: wake word, transcricao, TTS)
- API interna de voz/ML proxied pelo Core Node (porta auxiliar)

- Docs Container (`apps/internal-docs`)
- Publicacao navegavel da documentacao interna.

## Relacoes entre containers

1. Renderer chama preload -> preload publica IPC para main.
2. Main sobe o Core Node (`coreManager`) e publica progresso de init para UI.
3. Desktop consome API do Core Node em `127.0.0.1:8000`.
4. Core Node inicia `llama-server` para chat local e persiste estado local.
5. Core Node sobe Python sidecar apenas quando recursos de voz/ML sao requisitados.

## Decisoes de desenho vigentes

- Backend local desacoplado do processo Electron para resiliencia.
- Contrato de comunicacao baseado em HTTP/WebSocket.
- Core Node como backend primario para reduzir acoplamento ao bootstrap Python.
- Python mantido como sidecar especializado para voz/ML sob demanda.
- Persistencia local para privacidade e operacao offline-first.
