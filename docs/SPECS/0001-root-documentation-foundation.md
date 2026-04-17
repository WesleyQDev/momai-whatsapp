# SPEC: root-documentation-foundation

Status: Approved  
Owner: MomAI Team  
Ultima revisao: 2026-04-17  
Relacionados: [../README.md](../README.md), [../DECISIONS/ADR-0001-root-documentation-architecture.md](../DECISIONS/ADR-0001-root-documentation-architecture.md), [../REQUIREMENTS.md](../REQUIREMENTS.md)

## Contexto

A documentacao da MomAI estava espalhada entre README, docs internas e conhecimento implicito no codigo. Faltava uma estrutura de engenharia para descrever o sistema com profundidade e evoluir com consistencia.

## Problema

Sem taxonomia e workflow unificados:

- requisitos ficam implícitos;
- decisoes arquiteturais nao ficam historicas;
- mudancas de alto impacto perdem rastreabilidade.

## Objetivos

- Estabelecer `/docs` na raiz como fonte de verdade tecnica.
- Instituir conjunto base Arc42/C4 para descrever o estado atual.
- Definir fluxo Spec-Driven + ADR para evolucao futura.
- Definir fronteira de escopo para evitar documentar artefatos gerados.

## Nao-objetivos

- Migrar todo conteudo do `apps/internal-docs` neste momento.
- Reescrever historico tecnico legado em uma unica entrega.
- Cobrir detalhes de baixo nivel de todos os modulos de uma vez.

## Design

- Criar documentos base:
- `VISION`, `REQUIREMENTS`, `SYSTEM_CONTEXT`, `CONTAINER_ARCHITECTURE`, `COMPONENT_ARCHITECTURE`, `RUNTIME_BEHAVIOR`, `DATA_MODEL`, `SECURITY_PRIVACY`, `OPERATIONS_RUNBOOK`, `TEST_STRATEGY`.
- Criar templates:
- `TEMPLATES/DOC_TEMPLATE.md`, `TEMPLATES/SPEC_TEMPLATE.md`, `TEMPLATES/ADR_TEMPLATE.md`.
- Criar trilhas:
- `DECISIONS/` para ADRs
- `SPECS/` para especificacoes de feature
- Definir workflow e checklist no `docs/README.md`.

## Riscos

- Aderencia parcial do time ao processo documental.
- Conteudo inicial ficar desatualizado se nao houver cadencia de revisao.

## Teste/Aceite

- Estrutura `/docs` criada com todos os arquivos definidos.
- Existe pelo menos um ADR aceito e uma SPEC aprovada.
- README raiz referencia a documentacao raiz.
- Workflow de atualizacao documental descrito explicitamente.

## Rollout

1. Fase 1 (concluida): criar estrutura e baseline as-is.
2. Fase 2: toda feature nova nasce em `docs/SPECS/`.
3. Fase 3: endurecer gate de review para mudancas arquiteturais sem doc.

