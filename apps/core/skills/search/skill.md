---
name: websearch
description: Use para buscar preços, cotações, notícias e qualquer fato atual ou desconhecido na internet.
intents:
  - "Busque na internet sobre {query}"
  - "Pesquise no google o preço de {item}"
  - "O que a internet diz sobre {tema}"
  - "Qual o valor atual de {coisa}"
  - "Notícias sobre {assunto}"
  - "Busque no Youtube sobre {video}"
allowed-tools: web_search, news_search, youtube_search
metadata:
  author: MomAI Core
  version: 1.0.0
  max_tool_calls: 3
---

# WebSearch Skill

## Visão Geral
Esta skill permite buscar informações atualizadas na internet usando mecanismos de busca.

## Instruções
- Use web_search para buscas gerais
- Use news_search para notícias recentes
- Use youtube_search para buscar vídeos no Youtube
- Sempre forneça fontes das informações encontradas
