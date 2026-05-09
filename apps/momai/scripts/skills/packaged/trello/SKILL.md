---
name: Trello
description: Use quando o usuario precisar gerenciar cartoes, listas e comentarios no board MomAI Desktop do Trello.
icon: ClipboardDocumentList
tags:
  - produtividade
  - gerenciamento
  - trello
  - kanban
  - momai
author: MomAI Team
version: 1.0.0
intents:
  - trello
  - board
  - quadro
  - cartao
  - card
  - lista
  - list
  - kanban
  - gerenciar tarefas
  - momai desktop
allowed-tools: get_board_info list_lists list_cards get_card create_card update_card move_card add_comment
compatibility: MomAI Node Core
---

# Trello Skill

Integracao com o board **MomAI Desktop** no Trello.

## Comportamento

- Esta skill opera APENAS no board **MomAI Desktop**.
- Use `get_board_info` para ver as listas disponiveis.
- Use `list_cards` para ver cartoes de uma lista.
- Use `get_card` para detalhes de um cartao.
- Use `create_card` para adicionar cartoes as listas.
- Use `update_card` para alterar dados de cartoes.
- Use `move_card` para mover cartoes entre listas.
- Use `add_comment` para comentar em cartoes.

## Regras

- IDs de lista e cartao sao obtidos via `get_board_info` ou `list_lists`.
- Respeite os limites de rate limit da API.

## Configuracao

Credenciais no arquivo `.env` da pasta `apps/momai/`:
- `TRELLO_API_KEY`
- `TRELLO_TOKEN`
- `TRELLO_DEFAULT_BOARD_ID`
