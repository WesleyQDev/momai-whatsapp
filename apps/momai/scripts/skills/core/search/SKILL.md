---
name: search
description: Busca informacoes na web em tempo real. Use quando o usuario pedir para pesquisar ou buscar na internet.
icon: MagnifyingGlass
tags:
  - produtividade
  - web
  - pesquisa
author: MomAI Team
version: 1.0.0
intents:
  - pesquise
  - pesquisar
  - buscar
  - busque
  - procurar na internet
  - pesquisa na web
  - buscar na internet
  - procure
  - search
  - internet
  - web
  - noticias
  - news
  - manchetes
  - novidades
  - atualizar
  - ultimas noticias
  - últimas notícias
  - o que esta acontecendo
  - o que está acontecendo
  - preço
  - cotacao
  - cotação
  - valor do
  - quanto está
  - price
  - dolar
  - dólar
  - câmbio
  - cambio
  - taxa
  - llm news
  - notícias llm
  - novidades llm
allowed-tools: web_search
compatibility: MomAI Node Core Ultra
---

# Search Skill

Skill de busca na internet usando a API do Tavily.

## Quando usar

- Quando o usuario pedir informacoes que exigem busca na web (noticias, precos, fatos recentes).
- Quando o usuario perguntar sobre algo que o LLM nao tem conhecimento previo (conhecimento estatico ate 2023/2024).

## Comportamento

- SEMPRE use a ferramenta `web_search` para obter informacoes atualizadas.
- O retorno contem snippets de sites e a URL da fonte.
- SEMPRE cite a fonte da informacao no final da resposta ou inline.
