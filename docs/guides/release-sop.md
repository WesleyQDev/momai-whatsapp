# Release SOP — MomAI

## Visão Geral

| Etapa | Onde | Por que |
|-------|------|---------|
| CI (lint + typecheck) | act local + Docker | Evita consumir minutos do GitHub |
| Build Windows (.exe) | act local (-self-hosted) | Build nativo no Windows |
| Build Linux (.AppImage/.deb) | GitHub Actions | act não roda Linux com GPU/aceleração de build |
| APPX (Microsoft Store) | Local manual (já faz) | Precisa de certificado + sign |
| Upload release público | GitHub Actions | Só upload de arquivos — minutos mínimos |
| Landing page deploy | act local + Docker | Evita minutos extras |

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

# Para release (precisa do RELEASE_TOKEN com acesso ao WesleyQDev/MomAI-App)
$env:RELEASE_TOKEN = "ghp_xxxxxxxxxxxx"
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
Developer                        Local (act)                         GitHub
    |                                |                                  |
    |--- 1. Bump versão ------------>|                                  |
    |--- 2. Roda CI local ---------->| act push (lint + typecheck)      |
    |                                |                                  |
    |--- 3. Commit + tag vX.Y.Z --->|                                  |
    |                                |                                  |--- 4. CI automático (só minutos reais)
    |--- 5. Build local ------------>| act -j build-win                 |
    |                                | act -j build-linux (GitHub)      |
    |                                |                                  |
    |--- 6. APPX manual ------------>| pnpm build:appx:test             |
    |                                |                                  |
    |--- 7. Cria tag + push ------->|                                  |--- 8. release.yml sobe assets
    |                                |                                  |     no WesleyQDev/MomAI-App
```

### Passo a Passo

#### 1. Bump de versão (semver)

```powershell
# Escolha o tipo:
pnpm version patch   # 1.4.0 → 1.4.1 (bugfix)
pnpm version minor   # 1.4.0 → 1.5.0 (nova feature)
pnpm version major   # 1.4.0 → 2.0.0 (breaking change)

# Isso já altera o root package.json
# Depois sincroniza apps/momai/package.json:
cd apps/momai
pnpm version $(node -p "require('../../package.json').version") --no-git-tag-version --allow-same-version
cd ../..

# Sincroniza apps/core/pyproject.toml (se necessário)
```

**Importante**: `apps/core/pyproject.toml` e `apps/momai/package.json` devem ter a mesma versão do root.

#### 2. CI local (lint + typecheck)

```powershell
act push -j lint-typescript -s GITHUB_TOKEN="$(gh auth token)"
```

Leva ~2-3 minutos. Garante que o código não está quebrado antes de commitar.

#### 3. Commit e tag

```powershell
git add -A
git commit -m "chore: bump to v$(node -p 'require(\"./package.json\").version')"
git tag "v$(node -p 'require(\"./package.json\").version')"
```

#### 4. CI automático no GitHub

Quando der push, o GitHub roda o CI e o release.yml automaticamente. Mas para economizar minutos, fazemos o build local e só deixamos o upload pro GitHub.

> **Pull request**: Se quiser testar antes de dar push na tag, crie um PR e o CI roda só lint (leve). O release.yml só executa com tag.

#### 5A. Build Windows (.exe) via act local

```powershell
act workflow_dispatch -j build-win `
  -P windows-latest=-self-hosted `
  -s GITHUB_TOKEN="$(gh auth token)" `
  -e @- @"
{
  "ref": "refs/tags/v$(node -p 'require(\"./package.json\").version')"
}
"@
```

**O que o `-P windows-latest=-self-hosted` faz**: diz ao act para não usar Docker e rodar o job diretamente no Windows da sua máquina. Sem essa flag, act tentaria baixar uma imagem Docker para Windows (que não existe publicamente).

**Duração**: ~10-15 minutos. Gera `dist/MomAI-Installer.exe`, `dist/latest.yml`, `dist/*.blockmap`.

> **Nota**: act com `-self-hosted` executa os passos `run:` diretamente no seu shell atual. `uses: actions/checkout@v4` é substituído por uma simulação (não faz checkout real porque já está no repo). `uses: actions/upload-artifact@v4` salva localmente em `./act/artifacts/`.

#### 5B. Build Linux via GitHub Actions (deixar rodar)

O build Linux precisa de `libgtk-3-dev`, `libnotify-dev` e outras system deps. act no Windows não consegue simular Linux. Deixe esse rodar no GitHub.

Para testar o build Linux localmente (se tiver WSL2 com Docker):

```bash
# Dentro do WSL2
act workflow_dispatch -j build-linux \
  -s GITHUB_TOKEN="$(gh auth token)"
```

#### 6. APPX manual (já faz)

```powershell
cd apps/momai
pnpm build:appx:test
```

Gera `dist/MomAI_x.y.z.0_x64__8wekyb3d8bbwe.appx`. Esse você faz upload manual na Microsoft Store.

#### 7. Push da tag

```powershell
git push origin main --tags
```

#### 8. Release automático no GitHub

Quando o push da tag bate no `release.yml`, o GitHub roda **só o job `release`** (builds estão nos artifacts locais mas o CI do GitHub vai rebuildar). Para evitar isso:

**Opcional**: Modificar `release.yml` para aceitar `workflow_dispatch` com inputs que permitam pular builds:

```yaml
on:
  workflow_dispatch:
    inputs:
      skip-builds:
        description: "Skip win/linux builds (use pre-uploaded artifacts)"
        type: boolean
        default: false

jobs:
  build-win:
    if: ${{ !inputs.skip-builds }}
    ...
```

Ou então aceitar que o GitHub rebuilda — são 2 builds por release (~40 minutos totais), o que é bem menos que o limite mensal se você não fizer releases todo dia.

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
# CI (lint + typecheck)
act push -j lint-typescript -s GITHUB_TOKEN="$(gh auth token)"

# Build Windows local
$ver = node -p 'require("./package.json").version'
$payload = @"
{ "ref": "refs/tags/v$ver" }
"@ | ConvertTo-Json -Compress
$payload | act workflow_dispatch -j build-win -P windows-latest=-self-hosted -s GITHUB_TOKEN="$(gh auth token)"

# APPX
cd apps/momai && pnpm build:appx:test

# Deploy landing page local
act push -j deploy -s GITHUB_TOKEN="$(gh auth token)"

# Bump + tag
pnpm version minor
cd apps/momai && pnpm version (node -p "require('../../package.json').version") --no-git-tag-version --allow-same-version
git add -A && git commit -m "chore: bump version" && git tag v(node -p 'require(\"./package.json\").version')
git push origin main --tags
```
