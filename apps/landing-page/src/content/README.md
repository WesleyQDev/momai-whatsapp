# Blog Posts - Guia

## Estrutura

```
src/content/
├── blog/                   # Posts em Markdown
│   ├── seu-post.md         # Crie seus posts aqui
│   ├── posts.json          # Gerado automaticamente (não edite!)
│   └── index.ts            # Types TypeScript
└── images/                 # Imagens de capa dos posts
    └── capa.png
```

## Criando um Post

1. Crie um arquivo `.md` em `src/content/blog/`
2. Use o nome do arquivo como slug (ex: `meu-post.md` → URL: `/blog/post/meu-post`)
3. Adicione o frontmatter no topo:

```markdown
---
title: Meu Post Incrível
date: 26 de Abril, 2026
excerpt: Breve descrição que aparece no card
image: /images/capa.png
featured: true
---

# Conteúdo do post

Escreva em markdown normalmente...
```

## Frontmatter

| Campo      | Tipo    | Obrigatório | Descrição                           |
| ---------- | ------- | ----------- | ----------------------------------- |
| `title`    | string  | Sim         | Título do post                      |
| `date`     | string  | Sim         | Data: `DD de Mês, AAAA`             |
| `excerpt`  | string  | Sim         | Resumo exibido no card              |
| `image`    | string  | Não         | Caminho da imagem (ex: `/images/x`) |
| `featured` | boolean | Não         | `true` para destacar no hero        |

## Imagens

Coloque as imagens em `src/content/images/` e referencie como `/images/nome.png`.

URLs externas também funcionam: `image: https://exemplo.com/img.png`

## Ordenação

Posts são ordenados automaticamente:

1. Featured primeiro (`featured: true`), mais recente primeiro
2. Depois os demais, por data (mais recente primeiro)

O primeiro featured vira o hero "Em Destaque".

## Comandos

```bash
pnpm dev              # Dev com hot-reload automático
pnpm build            # Build de produção
pnpm compile:posts    # Compila posts manualmente
```

## Como Funciona

1. `compile-md.js` lê os `.md` e gera `posts.json`
2. Em dev, o chokidar watcheia mudanças e recompila automaticamente
3. O Vite detecta a mudança no JSON e faz hot-reload
4. `blog.ts` importa `posts.json` e exporta via `loadBlogPosts()`
