# MomAI Root Docs (Spec-Driven)

Status: Active  
Owner: MomAI Team  
Ultima revisao: 2026-04-17  
Relacionados: [README.md](../README.md), [apps/internal-docs](../apps/internal-docs)

## Objetivo

Esta pasta e a fonte de verdade tecnica do monorepo para arquitetura, requisitos, operacao e decisoes de engenharia.

Base adotada:

- Arc42 para estrutura arquitetural
- C4 para visoes em niveis de abstracao
- ADR para decisoes arquiteturais
- Spec-Driven Design para evolucao de features

## Estrutura oficial

- [VISION.md](./VISION.md)
- [REQUIREMENTS.md](./REQUIREMENTS.md)
- [SYSTEM_CONTEXT.md](./SYSTEM_CONTEXT.md)
- [CONTAINER_ARCHITECTURE.md](./CONTAINER_ARCHITECTURE.md)
- [COMPONENT_ARCHITECTURE.md](./COMPONENT_ARCHITECTURE.md)
- [RUNTIME_BEHAVIOR.md](./RUNTIME_BEHAVIOR.md)
- [DATA_MODEL.md](./DATA_MODEL.md)
- [SECURITY_PRIVACY.md](./SECURITY_PRIVACY.md)
- [OPERATIONS_RUNBOOK.md](./OPERATIONS_RUNBOOK.md)
- [TEST_STRATEGY.md](./TEST_STRATEGY.md)
- [DECISIONS](./DECISIONS)
- [SPECS](./SPECS)
- [TEMPLATES](./TEMPLATES)

## Workflow documental

1. Toda feature relevante comeca em `docs/SPECS/` usando `TEMPLATES/SPEC_TEMPLATE.md`.
2. Tradeoffs arquiteturais e decisoes permanentes viram ADR em `docs/DECISIONS/`.
3. Mudancas com impacto arquitetural exigem atualizacao de:
- C4 (`SYSTEM_CONTEXT`, `CONTAINER_ARCHITECTURE`, `COMPONENT_ARCHITECTURE`)
- `OPERATIONS_RUNBOOK.md` quando houver impacto operacional
- `TEST_STRATEGY.md` quando houver impacto de validacao
4. Requisitos em `REQUIREMENTS.md` devem manter rastreabilidade para specs e ADRs.

## Fronteira de escopo

Documentar:

- Codigo-fonte e comportamento real em runtime de `apps/momai`, `apps/core` e integracoes.
- Fluxos, contratos, operacao e riscos.

Nao documentar como fonte principal:

- Artefatos gerados (`dist`, binarios empacotados, saidas de build)
- Ambientes embutidos ou dependencias vendorizadas
- Caches locais

## Governanca e revisao

- Revisao quinzenal: validar se docs refletem o comportamento atual do sistema.
- PR com mudanca arquitetural sem atualizacao documental deve ser bloqueado em code review.
- Checklist minimo de qualidade por documento:
- Objetivo claro
- Limites de escopo
- Dependencias
- Riscos
- Criterios de aceite (quando aplicavel)

