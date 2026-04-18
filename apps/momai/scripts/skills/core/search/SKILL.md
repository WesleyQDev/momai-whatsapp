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
  - tempo em
  - Temperatura em
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

## Comportamento
- Execute `web_search` e sintetize com base nas fontes retornadas.
