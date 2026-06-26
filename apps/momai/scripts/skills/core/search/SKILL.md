---
name: search
description: Busca informacoes na web e videos no YouTube em tempo real. Use quando o usuario pedir para pesquisar ou buscar na internet.
icon: MagnifyingGlass
tags:
  - produtividade
  - web
  - pesquisa
  - youtube
  - videos
author: MomAI Team
version: 1.1.0
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
  - youtube
  - vídeo
  - video
  - youtube video
  - assista
  - procure video
  - busque video
  - mostrar video
  - mostrar vídeo
  - video aula
  - videoaula
  - tutorial
  - musica
  - música
  - ouvir
  - tocar
allowed-tools: web_search, youtube_search
compatibility: MomAI Node Core Ultra
---

# Search Skill

Skill de busca na internet e videos no YouTube.

## Quando usar

- Quando o usuario pedir informacoes que exigem busca na web (noticias, precos, fatos recentes).
- Quando o usuario perguntar sobre algo que o LLM nao tem conhecimento previo (conhecimento estatico ate 2023/2024).
- Quando o usuario pedir para buscar, pesquisar ou mostrar videos no YouTube.

## Comportamento

- Use `web_search` para buscas gerais na web (noticias, precos, informacoes).
- Use `youtube_search` quando o usuario pedir explicitamente videos, musicas ou conteudo do YouTube.
- O retorno do `web_search` contem snippets de sites e a URL da fonte.
- O retorno do `youtube_search` contem cards com thumbnail, titulo, canal e player embutido.
- SEMPRE cite a fonte da informacao no final da resposta ou inline.
