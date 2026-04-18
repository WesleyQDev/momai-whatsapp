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
2. Core Node garante disponibilidade do `llama-server` para o tier ativo (`lite/pro/ultra`), com execucao texto-only por padrao.
3. Em `ultra`, o Core Node tenta pipeline semantico local (embeddings + indice vetorial) para:
   - recuperar memoria de notas (hibrido vetorial + lexical);
   - descobrir skill/tool (scheduler, memory, search) e executar automaticamente quando confianca alta.
4. Core Node envia prompts, historico e contexto semantico para `/v1/chat/completions` (streaming).
5. Tokens e metadados (`sources`, `memory_sources`, `active_skill`, `tool_steps`) retornam em SSE.
6. Estado de conversa e metadados sao persistidos localmente.
7. Em falha de embeddings/vetor/tools/inferencia, Core Node degrada para fallback sem travar a UI.

## Fluxo de voz

1. Recurso de voz e solicitado via API (`/voice/*`, `/chat/speak` ou `/chat/stop-voice`).
2. Core Node garante sidecar Python pre-iniciado no boot (background), com fallback sob demanda quando necessario.
3. Core Node proxia chamadas de voz/ML para o sidecar.
4. Entrada/saida de voz segue para transcricao e TTS conforme configuracao.

## Fluxo de plugins no sidecar

1. Core Node (ou camada interna) chama `/plugins/list` para descoberta.
2. Sidecar garante carga lazy do registry de extensoes.
3. Execucao de tools ocorre via `/plugins/execute`.

## Escopo atual do sidecar

- O sidecar nao expoe mais rotas legadas de chat/config/reminders.
- Contrato publico do sidecar: `/voice/*`, `/chat/speak`, `/chat/stop-voice`, `/plugins/*`.

## Estados e erro

- Estado de bootstrap: iniciando, pronto, erro recuperavel, erro bloqueante.
- Falhas de `llama-server` nao devem crashar a UI; chat deve degradar com fallback controlado.
- Falhas do runtime semantico em `ultra` (embeddings/vetor/tools) devem acionar fallback lexical e manter streaming.
- Falhas de sidecar Python devem afetar apenas recursos de voz/ML.
- Falhas de provider cloud nao devem quebrar fluxo local basico quando houver fallback.
