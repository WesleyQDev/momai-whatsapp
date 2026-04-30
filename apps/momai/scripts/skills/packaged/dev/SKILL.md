---
name: dev
description: Skill de desenvolvimento com leitura/grep/edição segura, confirmação humana para ações mutantes e rotas de conhecimento em markdown.
icon: Code
tags:
  - desenvolvimento
  - codigo
  - debug
  - frontend
  - backend
author: WesleyQDev
repo: WesleyQDev/momai-extension-project-assistant
version: 1.0.0
intents:
  - código
  - code
  - html
  - css
  - javascript
  - typescript
  - react
  - backend
  - api
  - debug
  - erro
allowed-tools: dev_list dev_read dev_grep dev_write dev_patch dev_delete authorize_path revoke_path list_authorized_paths confirm_mutation cancel_mutation
compatibility: MomAI Node Core
---

# Dev Skill

Skill focada em tarefas de desenvolvimento local com segurança para LLM pequeno.

## Quando usar

- Ler arquivos de código e configuração.
- Buscar trechos com grep.
- Sugerir/realizar ajustes com confirmação humana.
- Renderizar HTML simples sob demanda no chat.

## Regras principais

- Nunca operar fora das pastas autorizadas pelo usuário.
- `write/patch/delete` sempre exigem confirmação humana.
- Para frontend/backend/debug, consultar primeiro os markdowns de conhecimento internos.
