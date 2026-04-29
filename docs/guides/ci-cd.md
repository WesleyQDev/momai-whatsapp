# CI/CD

## GitHub Actions

### CI (`ci.yml`)

Executado em **push** e **pull request** para `main` e `develop`.

**Jobs:**
- `lint-typescript`: Lint + Typecheck da app MomAI

**Passos:**
1. Checkout
2. Setup pnpm
3. Setup Node.js 20
4. `pnpm install --frozen-lockfile`
5. `pnpm --filter momai lint`
6. `pnpm --filter momai typecheck`

### Release (`release.yml`)

Executado em **push de tags** (`v*.*`) ou manualmente via `workflow_dispatch`.

**Jobs:**
- `build-win`: Build Windows (.exe NSIS + AppX)

**Passos:**
1. Checkout
2. Setup pnpm
3. Setup Node.js 20
4. Sync version do tag para `apps/momai/package.json`
5. `pnpm install`
6. Setup uv (Python)
7. Download dependency wheels (compila requirements com uv)
8. Build + package
9. Upload artifacts
10. Cria GitHub Release

## Scripts de Build

| Script | Localização | Função |
|--------|-------------|--------|
| `hydrate-bin.ps1` | `apps/momai/scripts/` | Baixa binários (llama-server, Python, uv) |
| `validate-llama-package.js` | `apps/momai/scripts/` | Valida binários no pacote |
| `ensure-dev-binaries.js` | `apps/momai/scripts/` | Garante binários em dev mode |
| `ensure-cert.js` | `apps/momai/scripts/` | Garante certificado para AppX |
| `sign-appx.js` | `apps/momai/scripts/` | Assina pacote AppX |
| `stamp-exe.js` | `apps/momai/scripts/` | Stampa metadados no executável |
| `open-build-dir.js` | `scripts/` | Abre diretório de build |
| `sync_blog.py` | `scripts/` | Sincroniza blog posts |
