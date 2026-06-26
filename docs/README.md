# Documentação Técnica MomAIOS

Bem-vindo à documentação técnica do **MomAIOS** — o monorepo da **MomAI**, uma assistente virtual **local-first** e focada em privacidade que combina LLMs com ações reais no computador.

**Versão:** 1.4.1  
**Licença:** Proprietária  
**Autor:** [WesleyQDev](https://github.com/WesleyQDev)

## Stack Principal

| Camada | Tecnologia |
|--------|------------|
| Desktop | Electron 42, React 19, TypeScript 6, TailwindCSS 3 |
| Build | electron-vite 5, electron-builder 26, pnpm 10, Turborepo 2 |
| AI Orchestration | Node.js, LangGraph, LangChain |
| Semantic Search | LanceDB 0.27 |
| Backend Voz | Python 3.12+, FastAPI, faster-whisper, Kokoro ONNX |
| TTS | edge-tts-universal (cloud), say.js (local fallback) |
| Landing Page | Vite 7, React 19, TailwindCSS 3, i18next |
| Gaming Mode | FortScript (Python 3.10+, psutil, pydantic) |
| Promo Video | Remotion 4, TailwindCSS 4 |
| CI/CD | GitHub Actions |
| Testing | Vitest 4 (desktop), pytest (core + fortscript) |

## Estrutura da Documentação

### Visão Geral

| Documento | Descrição |
|-----------|-----------|
| [Arquitetura](architecture.md) | Arquitetura do sistema, componentes, fluxos de dados, decisões técnicas |
| [Desenvolvimento](development.md) | Setup, comandos, convenções de código, estrutura de diretórios |
| [Extensões/Skills](extensions.md) | Plataforma de extensões, skills, runtime, respostas estruturadas |

### Aplicações

| Documento | Descrição |
|-----------|-----------|
| [Desktop (Electron)](apps/desktop.md) | GUI Electron + React, processos, views, build |
| [Core (Python)](apps/core.md) | Sidecar Python de voz, APIs, TTS, STT, wake word |
| [FortScript](apps/fortscript.md) | Gerenciador de processos para gaming mode |
| [Landing Page](apps/landing-page.md) | Site institucional Vite + React + TailwindCSS |

### Guias

| Documento | Descrição |
|-----------|-----------|
| [CI/CD](guides/ci-cd.md) | GitHub Actions, builds, releases |
| [Graphify](guides/graphify.md) | Knowledge graph do projeto |

## Funcionalidades Principais

- **Roteamento Semântico (LanceDB):** Identifica intenções em milissegundos com busca vetorial local, economizando tokens
- **Tool RAG:** Carrega dinamicamente apenas as ferramentas necessárias para cada tarefa
- **Motor de IA Local:** Llama.cpp via `llama-server.exe` com modelos Qwen GGUF (0.8B a 4B)
- **Streaming TTS Real-time:** Kokoro-82m com latência mínima e pre-warm
- **Wake Word Local:** "Sistema" (offline, OpenWakeWord)
- **Modo Overlay:** Janela transparente sempre no topo
- **Modo Gaming:** Pausa automática de processos de IA quando jogos são detectados (via FortScript)
- **Sistema de Extensões:** Skills ZIP auto-contidas com UI React, manifest.json e isolamento
- **Auto-Update:** Atualizações automáticas via GitHub Releases
- **Multiplataforma:** Windows, Linux, macOS

## Extensões Oficiais

| Extensão | Descrição |
|----------|-----------|
| WhatsApp | Monitoramento e resposta de mensagens WhatsApp |
| Launcher | Abertura de aplicativos e arquivos do sistema |
| System Info | Dashboard de monitoramento de recursos do sistema |

## Comandos Essenciais

```bash
# Desenvolvimento
pnpm dev              # App desktop em dev
pnpm dev:core         # Backend Python (porta 8000)
pnpm dev:all          # Ambos concorrentemente

# Build
pnpm build            # Build completo
pnpm build:win        # Windows .exe
pnpm build:linux      # Linux AppImage

# Qualidade
pnpm lint             # Lint (Turbo)
pnpm typecheck        # Type check (Turbo)
pnpm test             # Testes (Turbo)
pnpm format           # Formatação (Turbo)
```

## Repositório

Este é um repositório **privado**. O código é disponibilizado para consulta e colaboração interna, mas a reprodução, distribuição e modificação são restritas conforme a [licença proprietária](../LICENSE).
