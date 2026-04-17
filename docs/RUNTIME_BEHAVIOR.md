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
3. `pythonManager` prepara ambiente local e sobe Core.
4. Core inicia stack de IA, skills, reminders e servicos de voz (quando habilitados).
5. Eventos de progresso sao enviados ao renderer.
6. UI libera experiencia completa quando sistema esta pronto.

## Fluxo de chat streaming

1. Renderer envia requisicao para `/chat/stream`.
2. Core valida dependencias de IA e contexto.
3. Orchestrator processa intencao e executa ferramentas quando necessario.
4. Resposta retorna em streaming para UI.
5. Estado de conversa e metadados sao persistidos localmente.

## Fluxo de voz

1. Wake word detecta ativacao local (quando habilitada).
2. Entrada de voz e transcrita e tratada como comando/chat.
3. Saida textual pode ser convertida para TTS streaming.

## Estados e erro

- Estado de bootstrap: iniciando, pronto, erro recuperavel, erro bloqueante.
- Falhas de dependencia (python/uv/runtime) devem emitir diagnostico claro na UI.
- Falhas de provider cloud nao devem quebrar fluxo local basico quando houver fallback.

