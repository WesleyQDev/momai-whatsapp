# Release SOP — MomAI

## Visão Geral

| Etapa | Onde | Como |
|-------|------|------|
| CI (lint + typecheck) | act local + Docker | `gh act push -j lint-typescript` |
| Build Windows (.exe) | scripts/release.ps1 | Nativo no Windows |
| Build Linux (.AppImage/.deb) | scripts/release.ps1 | Docker Linux container |
| APPX (Microsoft Store) | Local manual | `pnpm build:appx:test` |
| Upload release público | scripts/release.ps1 | `gh release create` → WesleyQDev/MomAI-App |

---

## Setup Inicial

### 1. Instalar act

```powershell
# Como extensão do GitHub CLI
gh extension install https://github.com/nektos/gh-act
```

Ou via winget:

```powershell
winget install nektos.act
```

### 2. Verificar instalação

```powershell
gh act --version
# Deve mostrar: act version 0.2.88
```

### 3. Pré-requisito: Docker Desktop

Para jobs que rodam em Linux (CI/lint, deploy landing page), o act precisa do Docker Desktop rodando com Linux containers.

```powershell
# Iniciar Docker Desktop (se não estiver rodando)
Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"

# Aguardar o daemon ficar pronto
docker ps
# Deve mostrar uma lista (pode estar vazia) sem erro
```

> **Jobs Windows**: não precisam de Docker. A flag `-P windows-latest=-self-hosted` faz o act executar os comandos diretamente no seu shell.

### 4. Escolher imagem do act

Na primeira execução, o act pergunta qual imagem baixar:

- **Large** (~17GB) — réplica completa do GitHub runner, mas ocupa 75GB
- **Medium** (~500MB) — ferramentas essenciais, suficiente para CI — **recomendado**
- **Micro** (<200MB) — só Node.js, não funciona com `actions/setup-node`, `actions/checkout`

Escolha **Medium** para o primeiro uso. O download é único (cache local).

### 5. Token de acesso

Crie um Personal Access Token (classic) em `github.com/settings/tokens` com escopo `repo` (para o release público) e exporte:

```powershell
# Para CI (só precisa do token padrão)
$env:GITHUB_TOKEN = "$(gh auth token)"

# Para release (precisa do MOMAI_APP_RELEASE_TOKEN com acesso ao WesleyQDev/MomAI-App)
$env:MOMAI_APP_RELEASE_TOKEN = "ghp_xxxxxxxxxxxx"
```

### 6. Criar arquivo `.actrc` (opcional)

```ini
# .actrc na raiz do projeto
--container-architecture linux/amd64
--platform ubuntu-latest=catthehacker/ubuntu:act-latest
```

---

## Ciclo de Release Completo

```
Developer                            Local PC
    |                                    |
    |--- git tag vX.Y.Z (no HEAD) ------>|
    |--- .\scripts\release.ps1 --------->|----+--- Windows build (nativo)
    |                                    |    +--- Linux build (Docker)
    |                                    |    +--- gh release create ---> WesleyQDev/MomAI-App
    |                                    |
    |--- pnpm build:appx:test ---------->|---- Microsoft Store (manual)
    |                                    |
    |--- git push origin main --tags --->|---- GitHub (não roda mais nada)
```

### Passo a Passo

#### 1. Bump de versão (semver)

```powershell
# Escolha o tipo:
pnpm version patch   # 1.4.1 → 1.4.2 (bugfix)
pnpm version minor   # 1.4.1 → 1.5.0 (nova feature)
pnpm version major   # 1.4.1 → 2.0.0 (breaking change)

# Sincroniza apps/momai/ e apps/core/:
cd apps/momai
pnpm version $(node -p "require('../../package.json').version") --no-git-tag-version --allow-same-version
cd ../..
# Editar apps/core/pyproject.toml manualmente
```

#### 2. CI local (opcional, só lint)

```powershell
gh act push -j lint-typescript
```

#### 3. Commit e tag

```powershell
git add -A && git commit -m "chore: bump to vX.Y.Z"
git tag vX.Y.Z
```

#### 4. Release local (tudo num comando)

```powershell
pnpm run release                      # auto-detecta do git tag
pnpm run release -- -Version 1.5.0    # versão manual
# OU diretamente:
pwsh -NoProfile -File scripts/release.ps1 -Version 1.5.0
```

O que esse comando faz:

1. **Valida** se há uma tag no HEAD
2. **Verifica** se o Docker Desktop está rodando
3. **Sincroniza** a versão no `apps/momai/package.json`
4. **Build Windows** — `pnpm --filter momai build:win` (nativo, ~10-15 min)
5. **Build Linux** — `docker run ...` container Linux com `pnpm --filter momai build:linux` (~10-15 min)
6. **Upload** — `gh release create` para `WesleyQDev/MomAI-App`

> **Nota**: O build Linux roda dentro de um container Docker usando a imagem `node:20-bookworm` com GTK e outras system deps. O `PNPM_NODE_LINKER=hoisted` evita problemas com hardlinks entre Windows e Docker.

#### 5. Push da tag (só para referência)

```powershell
git push origin main --tags
```

O GitHub **não** roda mais nada automaticamente. O trigger de tag foi removido do `release.yml`. Se quiser rodar algum job no GitHub manualmente, vá em Actions → Release → Run workflow.

#### 6. APPX manual (Store)

```powershell
cd apps/momai
pnpm build:appx:test
```

Gera `dist/MomAI_x.y.z.0_x64__8wekyb3d8bbwe.appx` — upload manual na Microsoft Store.

---

## Arquivos do Pipeline Local

| Arquivo | Função |
|---------|--------|
| `scripts/release.ps1` | Script principal (build win + linux + upload) |
| `scripts/Dockerfile.linux` | Imagem Docker com deps para build Linux |
| `.actrc.local` | Config opcional do act (renomear para `.actrc`) |
| `.github/workflows/release.yml` | Só `workflow_dispatch` (trigger manual no GitHub) |

---

## Semver — MomAI

```
v1.4.0
 ^ ^ ^
 | | └── patch: bugfix, performance, segurança
 | └──── minor: nova feature, sem breaking change
 └────── major: breaking change na API/UX/dados
```

### Exemplos

| Mudança | Tipo | Versão |
|---------|------|--------|
| Correção no WhatsApp extension | patch | 1.4.0 → 1.4.1 |
| Nova skill de calendário | minor | 1.4.0 → 1.5.0 |
| Mudança no formato do banco SQLite | major | 1.4.0 → 2.0.0 |

### Onde versionar

| Arquivo | Versão atual |
|---------|-------------|
| `package.json` (root) | 1.4.0 |
| `apps/momai/package.json` | 1.4.0 |
| `apps/core/pyproject.toml` | 1.4.0 |
| `CHANGELOG.md` | 1.3.0 (última entrada) |

---

## Resumo dos Comandos

```powershell
# Release completo (Windows + Linux + upload)
.\scripts\release.ps1

# APPX (Microsoft Store)
cd apps\momai && pnpm build:appx:test

# CI local (lint + typecheck, opcional)
gh act push -j lint-typescript

# Bump + tag
pnpm version minor
cd apps/momai
pnpm version (node -p "require('../../package.json').version") --no-git-tag-version --allow-same-version
cd ../..
# Editar apps/core/pyproject.toml
git add -A && git commit -m "chore: bump to vX.Y.Z"
git tag v(node -p 'require(\"./package.json\").version')
git push origin main --tags
```
