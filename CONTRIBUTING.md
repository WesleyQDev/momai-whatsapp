# Contribuindo com o MomAI

Obrigado pelo interesse em contribuir com o MomAI!

## Status do Projeto

- **Licença:** Proprietária — todos os direitos reservados. Veja [LICENSE](LICENSE).
- **Não é open source:** Este projeto não é open source. O código é disponibilizado para visualização, mas a licença proprietária se aplica.

## Como Contribuir

### Reportar Bugs

Abra uma [issue](https://github.com/WesleyQDev/MomAI/issues) descrevendo:

- O comportamento esperado vs. observado
- Passos para reproduzir
- Ambiente (sistema operacional, versão do MomAI)

### Propor Melhorias

Abra uma [issue](https://github.com/WesleyQDev/MomAI/issues) com a label `enhancement` descrevendo a melhoria proposta.

### Pull Requests

1. Abra uma issue para discutir a mudança antes de implementar
2. Aguarde o retorno do mantenedor
3. Crie uma branch a partir de `main`
4. Implemente seguindo os padrões do projeto
5. Abra um Pull Request para `main`

## Critérios de Merge

Um Pull Request pode ser mergeado quando atende **todos** os critérios abaixo:

- [ ] CI passa (lint + typecheck + testes)
- [ ] Mantenedor aprovou a mudança
- [ ] Checklist do PR template está completo
- [ ] Código gerado por IA foi revisado por humano
- [ ] Lockfiles atualizados se dependências mudaram
- [ ] Nenhum arquivo `.env` ou `.env.*` incluído

## Regras para Pull Requests

- Siga os padrões de código existentes (veja [AGENTS.md](AGENTS.md) e `.github/copilot-instructions.md`)
- Mantenha o escopo focado em uma única mudança
- Atualize a documentação quando necessário
- Adicione testes quando aplicável
- Use [Conventional Commits](https://www.conventionalcommits.org/) nas mensagens de commit
- Contribuições relacionadas a extensões devem ser feitas em seus respectivos repositórios independentes (veja o [Guia de Desenvolvimento de Extensões](docs/extension-development-guide.md)) e registradas no `community-extensions.json` do repositório público. Para testar localmente em desenvolvimento, adicione a extensão em `dev-extensions.json` na raiz deste monorepo.

## Contributor License Agreement (CLA)

Ao enviar um Pull Request, você automaticamente concorda com os termos do [CLA.md](CLA.md).

Toda contribuição aceita terá os direitos cedidos ao mantenedor conforme descrito no CLA.

Contribuições sem concordância com o CLA não serão aceitas.

## Segurança

Vulnerabilidades de segurança devem seguir as orientações descritas em [SECURITY.md](SECURITY.md).

Caso o canal oficial ainda não esteja definido, entre em contato com o mantenedor antes de divulgar informações sensíveis publicamente.

## Contribuições com IA

Contribuições geradas ou assistidas por ferramentas de IA (incluindo agentes autônomos como Claude Code, Copilot, etc.) são aceitas desde que:

- O contribuidor humano revise o conteúdo antes de submeter
- O contribuidor assume responsabilidade pelo código gerado
- A origem da contribuição (humana vs. assistida) seja claramente identificada no PR quando relevante

## Código de Conduta

Seja respeitoso. Contribuições com comportamento inadequado não serão aceitas.

## Scripts de Build e Release

O projeto possui scripts para build e release local. Todos ficam em `scripts/`.

### Comandos Disponíveis

| Comando | Descrição |
|---------|-----------|
| `pnpm dev` | Inicia o app em modo desenvolvimento |
| `pnpm build` | Build completo (typecheck + electron-vite build) |
| `pnpm build:exe` | Build Windows (.exe) nativo |
| `pnpm build:linux` | Build Linux (.AppImage, .deb) nativo |
| `pnpm build:all` | Build todas as plataformas (Windows + Linux via act) |
| `pnpm build:appx` | Build Microsoft Store (appx store + test) |
| `pnpm build:all` | Build todas as plataformas (Windows + Linux via act) |
| `pnpm release` | Release via `scripts/release.ps1` |

### Scripts de Release

#### `scripts/release.ps1` — Release rápido

Builda Windows (.exe + appx) + Linux (Docker) e faz upload para GitHub.

```powershell
# PowerShell direto:
.\scripts\release.ps1 -Version 1.5.2
.\scripts\release.ps1 -Version 1.5.2 -MakeLatest

# Via pnpm:
pnpm release -- -Version 1.5.2
pnpm release -- -Version 1.5.2 -MakeLatest
```

#### `scripts/build-all.ps1` — Build completo com act

Builda Windows (.exe + appx) + Linux (via `act` — GitHub Actions local) e opcionalmente faz upload.

```powershell
# PowerShell direto:
.\scripts\build-all.ps1
.\scripts\build-all.ps1 -Upload -MakeLatest
.\scripts\build-all.ps1 -SkipWindows
.\scripts\build-all.ps1 -SkipLinux

# Via pnpm:
pnpm build:all
pnpm build:all -- -Upload -MakeLatest
pnpm build:all -- -SkipWindows
pnpm build:all -- -Version 1.5.2
```

> **Nota:** Com `pnpm`, os parâmetros passam depois de `--`.

**Pré-requisitos para `build-all.ps1`:**
- [act](https://github.com/nektos/act) instalado (`winget install nektos.act`)
- Docker Desktop rodando
- `gh` CLI autenticado (para upload)

### Fluxo de Release

1. Criar tag: `git tag v1.5.2`
2. Buildar: `.\scripts\build-all.ps1 -Upload -MakeLatest`
3. Verificar no GitHub: https://github.com/WesleyQDev/MomAI-App/releases

### Regra: `-MakeLatest`

A flag `-MakeLatest` só deve ser usada para versões **estáveis** e **testadas**. Nunca para pre-releases (versões com `-` no nome, ex: `1.6.0-beta.1`). O script bloqueia automaticamente.
