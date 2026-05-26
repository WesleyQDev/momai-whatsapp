---
name: weather
description: Previsao do tempo e informacoes meteorologicas. Use quando o usuario perguntar sobre clima, temperatura ou previsao do tempo.
icon: Sun
tags:
  - utilidade
  - clima
  - previsão
author: MomAI Team
version: 1.0.0
intents:
  - clima
  - tempo
  - tempo hoje
  - clima hoje
  - tempo em
  - temperatura
  - temperatura em
  - previsão do tempo
  - previsao do tempo
  - previsão
  - previsao
  - weather
  - forecast
  - chuva
  - chover
  - neve
  - nevando
  - sol
  - nublado
  - calor
  - frio
  - umidade
  - vento
  - tempestade
  - máxima
  - minima
  - mínima
  - sensação térmica
  - sensacao termica
  - vai chover
  - vai fazer sol
  - faz calor
  - faz frio
allowed-tools: get_weather
compatibility: MomAI Node Core Ultra
---

# Weather Skill

Skill de previsao do tempo baseada em API externa.

## Quando usar

- Quando o usuario perguntar sobre o clima atual ou previsao para os proximos dias.

## Comportamento

- Use a ferramenta `get_weather` passando a localizacao se o usuario especificar.
- Se o usuario nao especificar a localizacao, tente obter dos settings ou pergunte ao usuario.
- A ferramenta retorna dados meteorologicos em tempo real e previsao.
