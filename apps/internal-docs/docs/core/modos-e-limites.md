---
sidebar_position: 2
---

# Modos e Limites

## Visão geral

A MomAI opera com três modos de IA:

- Lite
- Pro
- Ultra

As configurações base ficam em `apps/core/ai_tiers.json`.

## Parâmetros por modo

### Lite

- foco em menor custo computacional
- contexto menor
- modelo base para dispositivos mais limitados

### Pro

- equilíbrio entre qualidade e desempenho
- contexto intermediário
- indicado para uso diário geral

### Ultra

- maior contexto e capacidade de raciocínio local
- maior custo de CPU/GPU e memória
- habilita recursos avançados de voz em cenários específicos

## Restrições funcionais conhecidas

- Wake word é inicializado apenas quando `ai_tier == "ultra"`.
- Em tiers menores, recursos avançados de voz podem permanecer desativados por design.
- Escolha de tier impacta latência, uso de memória e qualidade de resposta.

## Diretrizes para novos recursos

Ao adicionar feature no Core, definir explicitamente:

1. comportamento em Lite
2. comportamento em Pro
3. comportamento em Ultra
4. fallback quando recurso não estiver disponível no tier atual

Evitar comportamento implícito. Todo gate por tier deve ser documentado no endpoint/serviço correspondente.
