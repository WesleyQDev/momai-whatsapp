---
description: Cria ou atualiza posts do blog da MomAI (landing page) com base no diff entre versões git
---

Crie ou atualize posts do blog em `apps/landing-page/src/content/blog/` para divulgar novidades da MomAI.

Siga estes passos nesta ordem:

## 1. Entender o escopo

Se o usuário pediu uma versão específica (ex: "da 1.2 para a 1.6"), identifique as tags git envolvidas. Se pediu "da última publicação", leia o blog existente e descubra qual versão foi coberta.

Liste as tags com `git tag --list 'v*' --sort=-version:refname`.

## 2. Analisar as mudanças

Para cada salto de versão:
1. Faça `git diff v{ANTIGA}..v{NOVA} --stat` para ver o escopo
2. Examine os arquivos modificados — **não confie em títulos de commit ou PR**, prefira ler o diff real
3. Use o `CHANGELOG.md` como referência, mas **não copie** — o blog tem liberdade para agrupar por temas

## 3. Escrever os posts

### Tom
- **Review-style, não marketing**. Sem "superpoderes", "transformação revolucionária", "incrível", "nova era".
- Tom factual, quase de dev falando com dev: "o que mudou, o que funciona, o que ainda tem arestas."
- Se algo não está pronto ou tem limitações, mencione. Credibilidade > hype.
- Use linguagem que um amante de tecnologia entenda, mas não presuma que é programador.
- Pode usar expressões como "massa", "projeto", "coisa" — tom pessoal, não institucional.
- O autor é o Wesley, não a empresa. Soa como alguém mostrando o que construiu.

### Estrutura
- Introdução curta contextualizando o salto de versões
- Seções temáticas (ex: Extensões, Editor de Notas, Voz, Interface, Motor, Segurança)
- Cada seção: o que existia antes, o que mudou, observações críticas quando cabível
- Encerramento com o saldo geral e links de download (blog + Microsoft Store)

### pt-BR
Arquivo: `v{X}-{Y}-{Z}.pt-BR.md` no diretório do blog.

Frontmatter obrigatório:
```yaml
---
title: "..."
date: <dia> de <mês>, <ano>
excerpt: "..."
image: /images/MomAI{X}.{Y}.jpg
featured: true
author: WesleyQDev
---
```

### en
Mesmo conteúdo, arquivo `v{X}-{Y}-{Z}.en.md`. Adapte o tom para o público internacional.

## 4. Instalação e links

No final de cada post, inclua onde baixar:
- Microsoft Store / winget
- Linux (AppImage/DEB)
- Link pro site: `https://momaiassistente.studio/`

## 5. Créditos

Use `git log --format="%an"` para identificar contribuidores e adicione `(@usuario)` nas menções a funcionalidades específicas. Os contribuidores do projeto:
- @WesleyQDev
- @AndersonTavares0

## 6. LinkedIn

Crie um arquivo `linkedin-v{X}-{Y}-{Z}.txt` com uma versão resumida para publicação no LinkedIn. Tom pessoal, como se fosse um post mostrando o projeto que você construiu — não um release note. Inclua links de download (Microsoft Store, site). Ideal para recrutadores verem seu trabalho.

## 7. Verificar

- [ ] Os arquivos seguem o padrão de nomenclatura (`.pt-BR.md`, `.en.md`)
- [ ] O frontmatter está correto (especialmente `date` no formato do locale)
- [ ] Nenhum link quebrado ou placeholder esquecido
- [ ] Tom consistente (review pessoal, não marketing institucional)
- [ ] Versão em inglês traduzida, não tradução automática
- [ ] Links de instalação (Microsoft Store, Linux, site) incluídos
