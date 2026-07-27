# Documentação MomAIOS

Bem-vindo à documentação técnica do **MomAIOS** — o monorepo da **MomAI**, uma assistente virtual local-first focada em privacidade.

## Para Contribuidores

Se você quer contribuir com código, docs ou ideias:

| Documento | Descrição |
|-----------|-----------|
| [Guia de Desenvolvimento](development.md) | Setup, comandos, convenções de código |
| [Arquitetura](architecture.md) | Visão geral do sistema, componentes, fluxos |
| [Extensões/Skills](extensions.md) | Plataforma de extensões, runtime, UI (visão geral) |
| [SDK Referência](extension-sdk.md) | API completa do SDK `momai-sdk` |
| [Guia de Build](extension-build.md) | Como criar o bundle da extensão (esbuild) |
| [Manifest](extension-manifest.md) | Schema completo do manifest.json |
| [Compatibilidade](extension-compatibilidade.md) | Versionamento (sdkVersion, momai_compat) |
| [Segurança](extension-seguranca.md) | Permissões, path traversal, safe mode |
| [Worker](extension-worker.md) | Health check, crash recovery, rollback |
| [Dados](extension-dados.md) | Storage, migração, config/keychain |
| [Funcionalidades Avançadas](extension-avancado.md) | OAuth, scheduler, notificações |
| [Modos de Desenvolvimento](extension-modos.md) | Symlink, store_test, store, extensions-dev/ |
| [Migration Guide](extension-migration.md) | Como migrar extensões existentes para a SDK |
| [Guia de Publicação](extension-publishing-guide.md) | Como publicar no catálogo comunitário |
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
