# ADR-0001: Adotar Arc42 + C4 + ADR + Spec-Driven na raiz

Status: Accepted  
Data: 2026-04-17  
Owner: MomAI Team  
Relacionados: [../README.md](../README.md), [../SPECS/0001-root-documentation-foundation.md](../SPECS/0001-root-documentation-foundation.md)

## Contexto

O projeto cresceu com documentacao dispersa e sem um fluxo unico para requisitos, arquitetura e decisoes. Isso aumenta risco de divergencia entre implementacao e entendimento tecnico.

## Decisao

Adotar na raiz do monorepo:

- Arc42 para estrutura arquitetural.
- C4 para modelagem de contexto, containers e componentes.
- ADR para registrar decisoes arquiteturais.
- Spec-Driven Design para planejar e validar mudancas por feature.

## Consequencias

- Positivas:
- Melhor rastreabilidade entre requisito, design e implementacao.
- Menor ambiguidade em PRs de alto impacto.
- Fonte de verdade tecnica independente do portal de docs.

- Custos:
- Necessidade de disciplina de atualizacao documental.
- Revisoes de PR passam a incluir checklist de docs.

## Alternativas consideradas

- Apenas manter docs em `apps/internal-docs`: rejeitada por nao garantir fluxo de engenharia no dia a dia do codigo.
- Usar somente ADR: rejeitada por cobrir decisoes, mas nao requisitos e especificacao funcional.
- Usar somente C4: rejeitada por nao cobrir governanca de decisao e ciclo de feature.

