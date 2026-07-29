---
description: "Pipeline de release em 2 partes: prep (bump + tag + build AppX) e build (EXE + Linux + changelog + blog)"
---

# Comando: /release <versão>

Pipeline completa de release. Executa em **2 partes**, com você no controle entre elas.

---

## PARTE 1: PREP (bump + tag + build AppX)

### 1. Validar versão

Se o usuário não passou versão, pergunte. Formato: `v1.x.x`.

### 2. Bump versão e tag

```bash
git checkout main
git pull origin main
```

Atualize a versão em `apps/momai/package.json`:
```bash
cd apps/momai && pnpm version X.X.X --no-git-tag-version --allow-same-version && cd ../..
```

Commit e tag:
```bash
git add apps/momai/package.json
git commit -m "chore: bump to vX.X.X"
git tag vX.X.X
git push origin main --tags
```

### 3. Avisar usuário sobre build AppX

Diga:

> "Versão bumpada para vX.X.X e tag criada. Agora você precisa buildar o AppX.
> 
> Comando:
> ```
> pnpm build:appx
> ```
> 
> Depois de buildar e publicar na Microsoft Store, me avise **'pode continuar a release'** que eu sigo com a Parte 2: build EXE + Linux + changelog + blog."

**IMPORTANTE:** Você NÃO roda o build AppX. O usuário roda manualmente.

**PARE AQUI E AGUARDE O USUÁRIO.**

---

## PARTE 2: BUILD + CHANGELOG + BLOG (após usuário autorizar)

### 4. Build EXE e publicar

```bash
pnpm build:exe
```

Crie a GitHub Release no repositório público:
```bash
gh release create vX.X.X apps/momai/dist/MomAI-Installer.exe apps/momai/dist/latest.yml --repo WesleyQDev/MomAI-App --title "MomAI vX.X.X" --notes "Release vX.X.X"
```

### 5. Build Linux e publicar

Rode o build Linux:
```bash
pnpm build:linux
```

Upload dos artefatos Linux para a mesma release:
```bash
gh release upload vX.X.X apps/momai/dist/MomAI-X.X.X.AppImage apps/momai/dist/momai_X.X.X_amd64.deb apps/momai/dist/latest-linux.yml --repo WesleyQDev/MomAI-App --clobber
```

### 6. Changelog PR

Execute o comando `/changelog` para gerar/atualizar o CHANGELOG.md.

Crie um PR com o changelog:
```bash
git checkout -b release/vX.X.X-changelog
```

Após adicionar o changelog:
```bash
git add CHANGELOG.md
git commit -m "docs: changelog for vX.X.X"
git push origin release/vX.X.X-changelog
```

Crie o PR usando o template. Escreva o body do PR em um arquivo temporário para evitar problemas com PowerShell:

```bash
$body = @"
## Description
Changelog atualizado para a versão vX.X.X.

## Type of change
- [ ] Bug fix
- [ ] New feature
- [x] Documentation update
- [ ] Refactor
- [ ] Dependency update
- [ ] Release

## Checklist
- [x] I have read the CONTRIBUTING.md, AGENTS.md, and CLA.md
- [x] My code follows the project's coding standards
- [x] My changes generate no new warnings or errors
- [ ] I have added tests that prove my fix is effective or feature works
- [ ] New and existing tests pass locally
- [ ] Dependencies have been updated and lockfile is synced
- [ ] Docs have been updated where necessary
- [ ] I understand that this project has a proprietary license and contributions must respect it
- [ ] I understand that my contribution may be rejected if it does not align with the project's goals

## Testing
Changelog review

## Dependencies
None
"@
$body | Out-File -FilePath "$env:TEMP\pr-body.md" -Encoding utf8
```

```bash
gh pr create --repo WesleyQDev/MomAI --base main --head release/vX.X.X-changelog --title "docs: changelog for vX.X.X" --body-file "$env:TEMP\pr-body.md"
```

Avise o usuário:
> "PR de changelog criado: <url>. Me avise quando aprovar que sigo pro blog."

**PARE AQUI E AGUARDE O USUÁRIO APROVAR O PR.**

### 7. Blog Post

Após o PR de changelog ser aprovado:

Sugira 2-3 tópicos pra post de blog baseado no que mudou na versão. Pergunte qual o usuário quer.

Quando ele escolher:

Escreva o post seguindo as instruções do comando `/blog`.

Após escrever, peça:
> "O post está pronto. Me mande o **caminho da imagem** que vai no post (pode ser um path local) que eu coloco e já subo o PR."

Quando o usuário passar o path:
- Copie a imagem para o diretório correto da landing page
- Finalize o post com a imagem
- Crie PR com o post

```bash
$body = @"
## Description
Blog post para a versão vX.X.X.

## Type of change
- [ ] Bug fix
- [ ] New feature
- [x] Documentation update
- [ ] Refactor
- [ ] Dependency update
- [ ] Release

## Checklist
- [x] I have read the CONTRIBUTING.md, AGENTS.md, and CLA.md
- [x] My code follows the project's coding standards
- [x] My changes generate no new warnings or errors
- [ ] I have added tests that prove my fix is effective or feature works
- [ ] New and existing tests pass locally
- [ ] Dependencies have been updated and lockfile is synced
- [ ] Docs have been updated where necessary
- [ ] I understand that this project has a proprietary license and contributions must respect it
- [ ] I understand that my contribution may be rejected if it does not align with the project's goals

## Testing
Blog post review

## Dependencies
None
"@
$body | Out-File -FilePath "$env:TEMP\pr-body.md" -Encoding utf8
```

Crie o PR:
```bash
git checkout -b release/vX.X.X-blog
git add apps/landing-page/src/content/blog/
git commit -m "docs: blog post for vX.X.X"
git push origin release/vX.X.X-blog
gh pr create --repo WesleyQDev/MomAI --base main --head release/vX.X.X-blog --title "docs: blog post for vX.X.X" --body-file "$env:TEMP\pr-body.md"
```

Avise:
> "PR do blog criado: <url>. Me avise quando aprovar que a pipeline está completa!"

Quando o usuário avisar que aprovou:

> "Pipeline de release vX.X.X concluída 🎉"
