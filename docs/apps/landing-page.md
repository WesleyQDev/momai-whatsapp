# Landing Page

Site institucional da MomAI, construído com Vite + React + TypeScript.

## Stack

- **Vite 7** (bundler)
- **React 19** + **TypeScript 5.9**
- **TailwindCSS 3**
- **React Router DOM 7**
- **marked** + **DOMPurify** (renderização de blog)

## Estrutura

```
apps/landing-page/
├── src/
│   ├── pages/          # Páginas (Home, Blog, etc.)
│   ├── components/     # Componentes compartilhados
│   ├── content/        # Conteúdo (blog posts em markdown)
│   ├── hooks/          # Custom hooks
│   ├── data/           # Dados estáticos
│   ├── lib/            # Utilitários
│   └── types/          # TypeScript types
├── public/             # Assets estáticos
└── dist/               # Build output
```

## Desenvolvimento

```bash
cd apps/landing-page
pnpm dev     # Vite dev server
pnpm build   # Build para produção
pnpm preview # Preview do build
```

## Deploy

O site é publicado via GitHub Pages. O build gera arquivos estáticos em `dist/`.
