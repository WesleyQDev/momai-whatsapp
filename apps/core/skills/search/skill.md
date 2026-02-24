---
name: websearch
description: Use para buscar preços, cotações, notícias e qualquer fato atual ou desconhecido na internet.
intents:
  - "Busque na internet sobre {query}"
  - "Pesquise no google o preço de {item}"
  - "O que a internet diz sobre {tema}"
  - "Qual o valor atual de {coisa}"
  - "Notícias sobre {assunto}"
allowed-tools: web_search, news_search
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
- Sempre forneça fontes das informações encontradas
