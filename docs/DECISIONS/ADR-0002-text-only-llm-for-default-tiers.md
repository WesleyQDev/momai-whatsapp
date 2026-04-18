# ADR-0002: Executar tiers locais em modo texto-only por padrao

Status: Accepted  
Data: 2026-04-17  
Owner: MomAI Team  
Relacionados: [../RUNTIME_BEHAVIOR.md](../RUNTIME_BEHAVIOR.md), [../../apps/core/ai_tiers.json](../../apps/core/ai_tiers.json)

## Contexto

Os modelos locais atuais (`lite`, `pro`, `ultra`) usam GGUF com suporte multimodal. Quando o encoder de visao e carregado sem necessidade, ha maior consumo de memoria, menor folga de KV cache e maior risco de degradacao de latencia.

## Decisao

Desativar visao por padrao nos tiers locais `lite`, `pro` e `ultra`, operando em modo texto-only:

- `enable_vision: false` em `apps/core/ai_tiers.json`.
- O `node-core` so adiciona `--mmproj` ao `llama-server` quando `enable_vision=true` no tier ativo.

## Consequencias

- Positivas:
- Menor uso de memoria na inferencia local.
- Mais espaco para KV cache e melhor estabilidade de throughput em chat textual.
- Menor chance de falhas de bootstrap por artefatos multimodais ausentes.

- Custos:
- Entradas de imagem/video ficam desabilitadas nesses tiers por padrao.
- Para voltar multimodal em um tier, e necessario ativar `enable_vision=true` e garantir arquivo `mmproj`.

## Alternativas consideradas

- Manter visao sempre ativa: rejeitada por custo de memoria sem beneficio para uso majoritariamente textual.
- Criar um quarto tier dedicado multimodal: adiada ate existir demanda de produto e benchmark local consistente.
