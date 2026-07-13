---
description: "Cria nova versão: atualiza changelog, commit e tag"
---

Crie uma nova versão seguindo estes passos:

## 1. Descobrir versão atual

Pegue a tag mais recente: `git tag --sort=-v:refname | head -1`

Se o usuário especificou uma versão (ex: `/new-version 1.6.0`), use essa. Caso contrário, pergunte qual incremento: `patch` (1.5.3 → 1.5.4), `minor` (1.5.3 → 1.6.0), ou `major` (1.5.3 → 2.0.0).

## 2. Gerar changelog

Compare `git diff v{ULTIMA_TAG}..HEAD` e examine os arquivos modificados. Escreva um resumo em linguagem de usuário final com seções:
- `## ✨ Novas Funcionalidades`
- `## ⚙️ Melhorias`
- `## 🐛 Correções`
- `## 🗑️ Remoções`

## 3. Atualizar CHANGELOG.md

Adicione a nova entry no topo de `CHANGELOG.md` no formato `## X.Y.Z - YYYY-MM-DD`, mantendo ordem cronológica reversa.

Siga as mesmas regras do comando `/changelog`:
- NUNCA mencione landing page, monorepo, GitHub Actions, build scripts ou turbo
- Prefira linguagem de usuário final sobre jargão técnico

## 4. Commit e tag

```bash
git add CHANGELOG.md
git commit -m "chore: bump to v{NOVA_VERSAO}"
git tag v{NOVA_VERSAO}
git push origin $(git branch --show-current) --tags
```

## 5. Release

Pergunte ao usuário se quer buildar e publicar a release agora. Se sim, execute `/release` ou aponte que os passos de build estão lá.

O fluxo completo é: `/new-version` → (opcional) `/release`
