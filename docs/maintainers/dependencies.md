# Gerenciamento de Dependências

Como gerenciar dependências no MomAIOS (pnpm, uv, Dependabot).

## Ecossistema

| Gerenciador | Domínio | Lockfile |
|-------------|---------|----------|
| pnpm | Node.js (monorepo) | `pnpm-lock.yaml` |
| uv | Python (apps/core) | `uv.lock` |

## pnpm (Node.js)

### Instalação

```bash
pnpm install                # Instala dependências
pnpm install --frozen-lockfile  # CI (não modifica lockfile)
```

### Atualização

```bash
pnpm update                 # Atualiza todas (respeitando ranges)
pnpm update <pkg>           # Atualiza um pacote específico
pnpm add <pkg>              # Adiciona nova dependência
pnpm add -D <pkg>           # Dev dependency
```

### Boas Práticas

- **Nunca** commitar `node_modules/`
- Usar `--frozen-lockfile` em CI
- Atualizar lockfile só quando deps realmente mudam
- Dependências de build (`electron-vite`, `electron-builder`) ficam em `devDependencies`

## uv (Python)

### Instalação

```bash
cd apps/core
uv sync                     # Instala deps do pyproject.toml
```

### Atualização

```bash
cd apps/core
uv lock                     # Atualiza uv.lock
uv add <pkg>                # Adiciona dependência
uv remove <pkg>             # Remove dependência
```

### Boas Práticas

- `uv.lock` deve ser commitado
- Dependências Python são pré-compiladas como wheels durante o build CI
- O Electron app inclui Python bundlado + uv no instalador

## Dependabot

Configurado em `.github/dependabot.yml` para:

| Ecossistema | Frequência | Labels |
|-------------|-----------|--------|
| npm | Semanal | `dependencies` |
| pip | Semanal | `dependencies` |
| github-actions | Semanal | `dependencies` |

### Fluxo

1. Dependabot cria PR automaticamente
2. CI roda (lint + typecheck)
3. Mantenedor revisa e merge (ou ajusta)

### Limitações

- **pip + uv.lock**: Dependabot atualiza `pyproject.toml`, mas **não** atualiza `uv.lock`. Após merge de PR do Dependabot para pip, rodar manualmente:
  ```bash
  cd apps/core && uv lock
  ```
- **pnpm**: Dependabot atualiza `package.json` e `pnpm-lock.yaml` normalmente

## Security Audits

### pnpm audit

```bash
pnpm audit                  # Lista vulnerabilidades
pnpm audit --production     # Só production deps
```

### uv audit (experimental)

```bash
cd apps/core
uv audit                    # Experimental — pode ter falsos positivos
```

### CI Security Audit

Workflow em `.github/workflows/security-audit.yml`:
- Roda `pnpm audit --production` e `uv audit`
- `continue-on-error: true` (47+ vulnerabilidades de deps transitivas de build)
- Reporta como artefato no run do Actions
