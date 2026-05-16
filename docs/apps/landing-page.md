# Landing Page

## Visão Geral

Site institucional da MomAI, construído como uma SPA (Single Page Application) moderna com Vite 7 + React 19 + TypeScript 5.9. O site inclui blog com posts em markdown e é publicado via GitHub Pages.

## Stack Tecnológica

| Tecnologia | Versão | Propósito |
|------------|--------|-----------|
| Vite | 7.x | Bundler e dev server |
| React | 19.x | UI |
| TypeScript | 5.9.x | Type safety |
| TailwindCSS | 3.4.x | Estilização |
| React Router DOM | 7.x | Roteamento SPA |
| i18next | 26.x | Internacionalização |
| react-i18next | 17.x | Integração React + i18next |
| marked | 18.x | Renderização de markdown |
| DOMPurify | 3.x | Sanitização de HTML |

## Estrutura

```
apps/landing-page/
├── src/
│   ├── pages/           # Páginas (Home, Blog, Features, etc.)
│   ├── components/       # Componentes compartilhados
│   ├── content/          # Conteúdo (blog posts em markdown)
│   ├── hooks/            # Custom hooks
│   ├── data/             # Dados estáticos
│   ├── lib/              # Utilitários
│   ├── types/            # TypeScript types
│   ├── locales/          # Traduções (pt-BR, en-US)
│   ├── assets/           # Assets
│   ├── App.tsx           # Componente raiz
│   └── main.tsx          # Entry point
├── public/               # Assets estáticos
├── dist/                 # Build output
├── index.html            # HTML template
├── vite.config.ts        # Config Vite
├── tailwind.config.js    # Config Tailwind
└── package.json
```

## Funcionalidades

- **Home**: Apresentação do produto com hero section, features e CTA
- **Blog**: Posts em markdown com categorias e tags
- **Multilingual**: pt-BR e en-US via i18next
- **Responsivo**: Layout adaptável para mobile e desktop
- **GitHub Pages**: Deploy automático via GitHub Actions

## Desenvolvimento

```bash
cd apps/landing-page
pnpm dev        # Dev server (hot reload)
pnpm build      # Build produção → dist/
pnpm preview    # Preview do build
pnpm lint       # ESLint
pnpm typecheck  # TypeScript
pnpm format     # Prettier
```

## Deploy

O deploy é automático via GitHub Actions (`.github/workflows/deploy-landing.yml`):

1. Trigger: push na branch `main` com mudanças em `apps/landing-page/**`
2. Build: `pnpm build`
3. Prepare: copia `dist/`, `v1/`, `saude/`, `CNAME`, `.nojekyll`, `politicas-privacidade.html`
4. Deploy: GitHub Pages via `peaceiris/actions-gh-pages`

Também pode ser disparado manualmente via `workflow_dispatch`.
