# Internal Docs - MomAI

Documentação interna da MomAI baseada em Docusaurus.

## Requisitos

- Node.js 20+
- pnpm

## Instalar dependências

No monorepo (raiz):

```bash
pnpm install
```

## Desenvolvimento local

Na raiz do monorepo:

```bash
pnpm docs:internal
```

Ou executando apenas o workspace:

```bash
pnpm --filter internal-docs start
```

## Build

```bash
pnpm --filter internal-docs build
```

O build final é gerado em `apps/internal-docs/build`.

## Estrutura principal

- `docs/`: páginas da documentação técnica
- `blog/`: notas internas e anuncios
- `blog/`: notas internas e anúncios
- `docusaurus.config.ts`: configuração do site
- `sidebars.ts`: organização de navegação das docs
