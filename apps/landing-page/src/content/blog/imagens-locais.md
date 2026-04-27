---
title: Como adicionar imagens locais nos posts
date: 26 de Abril, 2026
excerpt: Guia rápido sobre como usar imagens armazenadas localmente na pasta de posts.
image: /images/exemplo.png
featured: true
---

## Usando Imagens Locais

Para usar imagens locais nos seus posts do blog, siga estes passos:

### 1. Adicione a imagem na pasta correta

Coloque suas imagens em:
```
apps/landing-page/public/posts/images/
```

### 2. Referencie no frontmatter

No seu arquivo `.md`, use o caminho relativo:

```yaml
---
title: Meu Post
image: images/minha-imagem.png
---
```

### 3. Formatos suportados

- PNG (.png)
- JPEG (.jpg, .jpeg)
- GIF (.gif)
- WebP (.webp)

### 4. Exemplo completo

```markdown
---
title: Tutorial de Instalação
date: 26 de Abril, 2026
excerpt: Aprenda a instalar a MomAI no seu computador.
image: images/tutorial.png
featured: false
---

# Conteúdo do post aqui...
```

### 5. Imagens externas também funcionam

Se preferir, ainda pode usar URLs externas:

```yaml
image: https://exemplo.com/imagem.png
```

O sistema detecta automaticamente se é um caminho local ou URL externa!
