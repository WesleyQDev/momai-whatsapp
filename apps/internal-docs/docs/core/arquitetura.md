---
sidebar_position: 1
---

# Arquitetura do Core

## Visão geral

O `apps/core` é o backend local da MomAI, com FastAPI, orquestração de IA e serviços de sistema.

Pilares:

- API HTTP + WebSocket para o app Electron
- pipeline de IA local com LLM e ferramentas
- persistência local (SQLite + LanceDB)
- serviços em background (lembretes, voz, monitoramento)

## Pontos de entrada

### main.py

- configura logging e filtros de ruído de acesso
- aplica patch de segurança para race de thread start
- cria app FastAPI com CORS
- registra rotas via `api/router.py`
- sobe Uvicorn

### runtime.py

Infra de runtime:

- `configure_logging()`
- `install_uvicorn_access_filter()`
- `patch_thread_start()`

### startup.py

Lifespan e inicialização progressiva do sistema:

- inicializa stack de IA
- aplica settings persistidos
- carrega extensões/skills
- inicia reminder manager
- configura checkpoint de conversa
- inicia wake word quando permitido por tier e config

## Camadas principais

## API (`api/`)

- `router.py`: importa e acopla os routers de cada domínio
- `schemas.py`: contratos de request/response
- `routes/*.py`: endpoints por contexto (chat, voice, settings, reminders, etc.)

## IA (`ai/`)

- `orchestrator.py`: coordenação da conversa, histórico e ferramentas
- `tool_selector.py`: seleção de tool/skill
- `providers/local_llama.py`: integração com servidor local LLM
- `graph/`: prompts e fluxo de decisão
- `stream/`: streaming de respostas

## Persistência (`database/`)

- `models.py`: modelos SQLAlchemy
- `vector_db.py`: operações de base vetorial (LanceDB)

## Serviços (`services/`)

- `voice/`: wake word, transcrição e TTS
- `reminders/`: agenda de lembretes
- `extensions/`: instalação/gerência de extensões
- `memory/`: memória externa/notas
- `system/`: monitoramento de recursos e briefing

## Extensibilidade

- `skills/`: skills internas empacotadas
- `skills_extensions/`: plugins externos e extensões de skill
- `tools/`: ferramentas do sistema para execução de ações

## Fluxo simplificado de requisição de chat

1. Electron envia mensagem para `/chat/stream`.
2. Rota valida estado do sistema (`require_ai_loaded`).
3. Orchestrator processa contexto + ferramentas.
4. Resposta é enviada por streaming SSE para o renderer.
5. Histórico e metadados persistem localmente.
