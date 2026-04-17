# Runtime Behavior

Status: Draft  
Owner: MomAI Team  
Ultima revisao: 2026-04-17  
Relacionados: [COMPONENT_ARCHITECTURE.md](./COMPONENT_ARCHITECTURE.md), [OPERATIONS_RUNBOOK.md](./OPERATIONS_RUNBOOK.md)

## Objetivo

Descrever comportamentos em runtime: inicializacao, chat, voz e falhas.

## Fluxo de inicializacao (Desktop + Core)

1. Electron main inicia e registra handlers IPC.
2. Janela principal e criada.
3. `coreManager` sobe o Core Node em `127.0.0.1:8000`.
4. Core Node inicializa estado local e, quando `auto_start_llm=true`, tenta subir `llama-server`.
5. Eventos de progresso sao enviados ao renderer (`init-progress` + WS).
6. UI libera experiencia completa quando API local esta online.

## Fluxo de chat streaming

1. Renderer envia requisicao para `/chat/stream`.
2. Core Node garante disponibilidade do `llama-server` para o tier ativo (`lite/pro/ultra`).
3. Core Node envia prompts e historico para `/v1/chat/completions` (streaming).
4. Tokens retornam em SSE para UI em tempo real.
5. Estado de conversa e metadados sao persistidos localmente.
6. Em falha de inferencia local, Core Node aplica fallback sem derrubar o app.

## Fluxo de voz

1. Recurso de voz e solicitado via API (`/voice/*`, `/chat/speak` ou `/chat/stop-voice`).
2. Core Node solicita start do Python sidecar sob demanda.
3. Core Node proxia chamadas de voz/ML para o sidecar.
4. Entrada/saida de voz segue para transcricao e TTS conforme configuracao.

## Fluxo de plugins no sidecar

1. Core Node (ou camada interna) chama `/plugins/list` para descoberta.
2. Sidecar garante carga lazy do registry de extensoes.
3. Execucao de tools ocorre via `/plugins/execute`.

## Estados e erro

- Estado de bootstrap: iniciando, pronto, erro recuperavel, erro bloqueante.
- Falhas de `llama-server` nao devem crashar a UI; chat deve degradar com fallback controlado.
- Falhas de sidecar Python devem afetar apenas recursos de voz/ML.
- Falhas de provider cloud nao devem quebrar fluxo local basico quando houver fallback.
