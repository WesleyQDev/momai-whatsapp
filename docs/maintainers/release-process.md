# Processo de Release

Fluxo completo para fazer release do MomAI.

## Visão Geral

| Etapa | Comando | Onde |
|-------|---------|------|
| Bump versão | `pnpm version patch/minor/major` | Raiz + apps |
| CI local (opcional) | `gh act push -j lint-typescript` | Local + Docker |
| Commit + tag | `git tag vX.Y.Z` | Local |
| Build + Upload | `scripts/release.ps1` | Local (Win + Docker) |
| APPX (Store) | `pnpm build:appx:test` | Local manual |

## Passo a Passo

### 1. Bump de Versão (Semver)

```powershell
# Escolha o tipo:
pnpm version patch   # 1.4.1 → 1.4.2 (bugfix)
pnpm version minor   # 1.4.1 → 1.5.0 (nova feature)
pnpm version major   # 1.4.1 → 2.0.0 (breaking change)

# Sincronizar apps/momai/:
cd apps/momai
pnpm version $(node -p "require('../../package.json').version") --no-git-tag-version --allow-same-version
cd ../..

# Editar apps/core/pyproject.toml manualmente (versão no campo [project])
```

### 2. CI Local (Opcional)

```powershell
# Rodar lint + typecheck localmente via act
gh act push -j lint-typescript
```

Requer Docker Desktop rodando. Ver [CI/CD](../guides/ci-cd.md) para setup do act.

### 3. Commit e Tag

```powershell
git add -A && git commit -m "chore: bump to vX.Y.Z"
git tag vX.Y.Z
```

### 4. Release (Build + Upload)

```powershell
# Auto-detecta versão do git tag
pnpm run release

# Ou especificar versão manualmente
pnpm run release -- -Version 1.5.0

# Ou diretamente:
pwsh -NoProfile -File scripts/release.ps1 -Version 1.5.0
```

O script faz:
1. Valida se há tag no HEAD
2. Verifica Docker Desktop
3. Build Windows (~10-15 min, nativo)
4. Build Linux (~10-15 min, via Docker)
5. Upload para `WesleyQDev/MomAI-App` via `gh release create`

### 5. Push da Tag

```powershell
git push origin main --tags
```

O GitHub **não** roda mais nada automaticamente (trigger de tag foi removido do `release.yml`).

### 6. APPX (Microsoft Store) — Manual

```powershell
cd apps/momai
pnpm build:appx:test
```

Gera `dist/MomAI_x.y.z.0_x64__8wekyb3d8bbwe.appx` — upload manual na Microsoft Store.

## Arquivos do Pipeline

| Arquivo | Função |
|---------|--------|
| `scripts/release.ps1` | Script principal (build win + linux + upload) |
| `scripts/Dockerfile.linux` | Imagem Docker para build Linux |
| `.actrc.local` | Config do act (renomear para `.actrc`) |
| `.github/workflows/release.yml` | Só `workflow_dispatch` (trigger manual) |

## Semver

```
v1.4.0
 ^ ^ ^
 | | └── patch: bugfix, performance, segurança
 | └──── minor: nova feature, sem breaking change
 └────── major: breaking change na API/UX/dados
```

### Onde Versionar

| Arquivo | Atualizar? |
|---------|-----------|
| `package.json` (root) | Sim |
| `apps/momai/package.json` | Sim |
| `apps/core/pyproject.toml` | Sim (campo `[project]`) |
| `CHANGELOG.md` | Sim (adicionar entrada) |
