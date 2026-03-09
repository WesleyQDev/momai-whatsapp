---
sidebar_position: 3
---

# Rotas Principais

## Objetivo

Resumo das rotas mais usadas pelo app desktop. Rotas são registradas em `api/router.py`.

## Chat

- `POST /chat/stream`: resposta por streaming (SSE)
- `POST /chat/stop`: cancela geração atual
- `POST /chat/stop-voice`: interrompe TTS
- `GET /chat/history`: histórico por thread
- `DELETE /chat/history`: limpa histórico da thread
- `GET /chat/sessions`: lista sessões recentes
- `POST /chat/title`: gera título curto para sessão

## Voz

- rotas de controle de wake word e recursos de voz em `api/routes/voice.py`

## Sistema e status

- `GET /status`: estado geral
- `GET /init-status`: progresso de bootstrap
- diagnóstico e hardware em `diagnostic` e `hardware`

## Configuração e recursos

- `settings`: leitura e atualização de preferências
- `reminders`: CRUD de lembretes
- `memory`: notas e memória local
- `extensions`: catálogo e gestão de extensões
- `mode`: modos operacionais (incluindo call mode)

## WebSocket

- `ws`: canal de eventos em tempo real (voz, estado, notificações de sistema)

## Boas práticas

1. manter contratos de schema em `api/schemas.py`
2. validar dependências com `Depends` em `api/deps.py`
3. evitar side effects fora da camada de serviços
