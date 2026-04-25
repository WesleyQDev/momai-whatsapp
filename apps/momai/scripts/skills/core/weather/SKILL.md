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
  - tempo em
  - temperatura
  - temperatura em
  - previsão do tempo
  - previsao do tempo
  - weather
  - forecast
allowed-tools: get_weather
compatibility: MomAI Node Core Ultra
---

# Weather Skill

Retorna previsao do tempo para qualquer localidade usando a API Open-Meteo.

## Quando usar

- Usuario perguntar sobre o clima ou temperatura
- Usuario pedir previsao do tempo para uma cidade
- Usuario mencionar "previsao", "clima", "tempo"

## Comportamento

- Execute `get_weather` com a localidade extraida da mensagem
- A resposta sera exibida como um card visual com a previsao de 7 dias
- Se a localidade nao for especificada, use a localidade padrao do usuario
