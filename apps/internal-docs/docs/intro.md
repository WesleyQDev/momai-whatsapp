---
sidebar_position: 1
---

# MomAI Internal Docs

Esta documentação cobre a arquitetura e as decisões técnicas da MomAI no monorepo.

## Escopo

- App desktop: Electron + React (`apps/momai`)
- Core local: FastAPI + orquestração de IA (`apps/core`)
- Documentação interna: Docusaurus (`apps/internal-docs`)

## Como navegar

- Seção Electron: boot, janelas, preload e IPC
- Seção Core: app FastAPI, serviços e rotas
- Modos Lite/Pro/Ultra: limites e comportamento esperado

## Executar docs localmente

Na raiz do monorepo:

```bash
pnpm docs:internal
```

Ou diretamente no workspace:

```bash
pnpm --filter internal-docs start
```

## Objetivo desta docs

Evitar conhecimento implícito e acelerar onboarding técnico do time.
