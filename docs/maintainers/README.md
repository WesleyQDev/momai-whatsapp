# Para Mantenedores

Guia de responsabilidades e processos para mantenedores do MomAIOS.

## Responsabilidades

- Revisar e merges de PRs (seguir critérios em `CONTRIBUTING.md`)
- Gerenciar releases (semver, builds, publish)
- Manter dependências atualizadas (Dependabot, security audits)
- Monitorar CI (lint, typecheck, test)
- Responder issues e discussions

## Checklist de Release

Antes de fazer release:

- [ ] Todas as issues/PRs planejadas foram merged
- [ ] CI passando (lint + typecheck)
- [ ] Testes passando localmente
- [ ] Versão bumpada em `package.json`, `apps/momai/package.json`, `apps/core/pyproject.toml`
- [ ] Tag criada (`git tag vX.Y.Z`)
- [ ] Build local testado (`pnpm build:win` ou `pnpm build:linux`)
- [ ] Release script executado (`scripts/release.ps1`)
- [ ] Release publicado em `WesleyQDev/MomAI-App`
- [ ] APPX build para Microsoft Store (se aplicável)

## Fluxo de Release

Ver [Processo de Release](release-process.md) para o passo a passo completo.

## Gerenciamento de Deps

Ver [Gerenciamento de Deps](dependencies.md) para detalhes sobre pnpm, uv e Dependabot.

## Links Úteis

- [CI/CD](../guides/ci-cd.md) — workflows e automação
- [Release SOP](../guides/release-sop.md) — referência detalhada do release
- [CONTRIBUTING.md](../../CONTRIBUTING.md) — critérios de merge e PRs
- [SECURITY.md](../../SECURITY.md) — política de segurança
