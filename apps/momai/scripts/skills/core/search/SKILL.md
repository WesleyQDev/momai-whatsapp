---
name: search
description: Busca informacoes na web em tempo real. Use quando o usuario pedir para pesquisar ou buscar na internet.
intents:
  - pesquise
  - pesquisar
  - buscar
  - busque
  - search
  - internet
  - web
  - noticias
  - news
  - ultimas noticias
  - o que esta acontecendo
  - Preço
  - Price
  - Dolar
  - Cotação
allowed-tools: web_search
compatibility: MomAI Node Core Ultra
---

# Search Skill

Executa busca web e retorna resultados com fontes.

## Quando usar

- Usuario pedir noticias recentes.
- Usuario pedir busca aberta na internet.
- Usuario quiser saber o que esta acontecendo no mundo.

## Comportamento

- Execute `web_search` e sintetize com base nas fontes retornadas.
