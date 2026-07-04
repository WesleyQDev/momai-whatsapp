# CI/CD

## Visão Geral

O MomAI usa GitHub Actions para automação de CI/CD. Três workflows principais gerenciam lint/typecheck, builds de release e deploy da landing page.

## CI (ci.yml)

Executado em push e pull request para `main` e `develop`.

```yaml
on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]
```

**Jobs:**
- `lint-typescript`: Lint + Typecheck da app MomAI

**Passos:**
1. Checkout do repositório
2. Setup pnpm + Node.js 20 (com cache)
3. `pnpm install --frozen-lockfile`
4. `pnpm --filter momai lint` (ESLint)
5. `pnpm --filter momai typecheck` (TypeScript)

**Concorrência**: Agrupa por workflow + ref, cancela execuções em progresso.

## Release (release.yml)

Executado em push de tags com formato `v*.*` ou manualmente via `workflow_dispatch`.

```yaml
on:
  push:
    tags:
      - "v[0-9]+.*"
  workflow_dispatch:
```

**Jobs:**

### build-win
- Roda em `windows-latest`
- Steps:
  1. Checkout
  2. Setup pnpm + Node.js 20
  3. Extrai versão do tag e sincroniza com `apps/momai/package.json`
  4. `pnpm install --no-frozen-lockfile`
  5. Setup uv (astral-sh/setup-uv)
  6. Compila requirements com `uv pip compile` para Windows (3.12, win_amd64)
  7. Baixa wheels com `pip download -d wheels/ -r requirements-win.lock`
  8. `pnpm build:exe` (electron-builder NSIS)
  9. Upload artifacts (.exe, .yml, .blockmap)

### build-linux
- Roda em `ubuntu-latest`
- Steps similares ao Windows mas:
  - Instala dependências do sistema (libgtk-3, libnss3, libxtst6, etc.)
  - Tenta download de wheels para múltiplas plataformas manylinux
  - `pnpm build:linux` (AppImage + .deb)
  - Upload artifacts (.AppImage, .deb, .yml, .blockmap)

### release (Create GitHub Release)
- Depende de build-win e build-linux
- Roda em `ubuntu-latest`
- Steps:
  1. Download artifacts de ambos os builds
  2. Se o repositório público (`WesleyQDev/MomAI-App`) estiver vazio, inicializa com README
  3. Cria ou atualiza release no repositório público com todos os artifacts

## Deploy Landing Page (deploy-landing.yml)

```yaml
on:
  push:
    branches: [main]
    paths:
      - 'apps/landing-page/**'
  workflow_dispatch:
```

**Steps:**
1. Checkout
2. Setup pnpm + Node.js 20
3. `pnpm install --frozen-lockfile`
4. Build: `pnpm build` em `apps/landing-page/`
5. Prepara pasta `_site/` com dist + v1 + saude + CNAME + .nojekyll
6. Deploy para GitHub Pages via `peaceiris/actions-gh-pages`

## Scripts de Build

| Script | Localização | Função |
|--------|-------------|--------|
| `hydrate-bin.ps1` | `apps/momai/scripts/` | Download de binários (llama-server, Python, uv) no Windows |
| `hydrate-bin.sh` | `apps/momai/scripts/` | Download de binários no Linux |
| `validate-llama-package.js` | `apps/momai/scripts/` | Valida binários do llama-server no pacote |
| `ensure-dev-binaries.js` | `apps/momai/scripts/` | Garante binários para dev mode |
| `ensure-cert.js` | `apps/momai/scripts/` | Garante certificado para build AppX |
| `sign-appx.js` | `apps/momai/scripts/` | Assina pacote AppX |
| `sign-appx.ps1` | `apps/momai/scripts/` | Script PowerShell para assinatura AppX |
| `stamp-exe.js` | `apps/momai/scripts/` | Adiciona metadados ao executável |
| `after-pack.js` | `apps/momai/scripts/` | Hook pós-empacotamento do electron-builder |
| `open-build-dir.js` | `scripts/` | Abre diretório de build no explorador |
| `sync_blog.py` | `scripts/` | Sincroniza posts do blog |
| `sync-gh-pages.js` | `scripts/` | Sincroniza GitHub Pages |
| `build-linux-wsl.ps1` | `apps/momai/scripts/` | Build Linux a partir do WSL |

## Notas

- A versão é extraída da git tag (formato `v1.2.3`) e sincronizada com `apps/momai/package.json`
- As wheels Python são pré-compiladas durante o CI para evitar compilação na máquina do usuário
- O release é publicado no repositório público `WesleyQDev/MomAI-App` (separado do repositório de código fonte)
- O token de release (`MOMAI_APP_RELEASE_TOKEN`) tem permissões de escrita no repositório público
- Debug artifacts (`builder-debug.yml`) são removidos antes do upload do release
