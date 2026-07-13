# Documentação MomAIOS

Bem-vindo à documentação técnica do **MomAIOS** — o monorepo da **MomAI**, uma assistente virtual local-first focada em privacidade.

## Para Contribuidores

Se você quer contribuir com código, docs ou ideias:

| Documento | Descrição |
|-----------|-----------|
| [Guia de Desenvolvimento](development.md) | Setup, comandos, convenções de código |
| [Arquitetura](architecture.md) | Visão geral do sistema, componentes, fluxos |
| [Extensões/Skills](extensions.md) | Plataforma de extensões, runtime, UI |
| [Labels](labels.md) | Convenções de labels para issues e PRs |

### Aplicações

| Documento | Descrição |
|-----------|-----------|
| [Desktop (Electron)](apps/desktop.md) | GUI Electron + React, processos, build |
| [Core (Python)](apps/core.md) | Sidecar Python de voz, APIs, TTS, STT |
| [Landing Page](apps/landing-page.md) | Site institucional Vite + React |

### Guias

| Documento | Descrição |
|-----------|-----------|
| [CI/CD](guides/ci-cd.md) | GitHub Actions, workflows, builds |
| [Graphify](guides/graphify.md) | Knowledge graph do projeto |

## Para Mantenedores

Documentação específica para quem mantém o projeto:

| Documento | Descrição |
|-----------|-----------|
| [Visão do Mantenedor](maintainers/README.md) | Responsabilidades, checklist de release |
| [Processo de Release](maintainers/release-process.md) | Fluxo completo de release (build, tag, publish) |
| [Gerenciamento de Deps](maintainers/dependencies.md) | pnpm, uv, lockfiles, Dependabot |

## Comandos Essenciais

```bash
pnpm dev              # App desktop em dev
pnpm dev:core         # Backend Python (porta 8000)
pnpm dev:all          # Ambos concorrentemente
pnpm build            # Build completo
pnpm lint             # Lint (Turbo)
pnpm typecheck        # Type check (Turbo)
pnpm test             # Testes (Turbo)
```

## Repositório

Este é um repositório **privado**. O código é disponibilizado para consulta e colaboração interna, mas a reprodução, distribuição e modificação são restritas conforme a [licença proprietária](../LICENSE).
