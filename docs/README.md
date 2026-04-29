# MomAI Documentation

Documentação técnica completa do projeto **MomAI** — uma assistente virtual **local-first** e focada em privacidade que combina LLMs com ações reais no computador.

## Índice

### Visão Geral

| Documento | Descrição |
|-----------|-----------|
| [Arquitetura](architecture.md) | Visão geral da arquitetura, stack tecnológica, diagramas C4 |
| [Desenvolvimento](development.md) | Guia de setup, comandos, convenções de código |
| [Extensões / Skills](extensions.md) | Plataforma de extensões v1, skills, runtime |

### Aplicações

| Documento | Descrição |
|-----------|-----------|
| [Desktop (Electron)](apps/desktop.md) | GUI Electron + React + TypeScript |
| [Core (Python)](apps/core.md) | Sidecar Python/FastAPI de voz |
| [FortScript](apps/fortscript.md) | Gerenciador de processos para gaming mode |
| [Landing Page](apps/landing-page.md) | Site institucional Vite + React |

### Guias

| Documento | Descrição |
|-----------|-----------|
| [CI/CD](guides/ci-cd.md) | GitHub Actions, builds, releases |
| [Graphify](guides/graphify.md) | Knowledge graph do projeto |

---

## Repositório

- **Monorepo:** pnpm workspaces + Turborepo
- **Linguagens:** TypeScript (Electron/React), Python (FastAPI)
- **Licença:** MIT
- **Autor:** [WesleyQDev](https://github.com/WesleyQDev)

## Stack Principal

| Camada | Tecnologia |
|--------|------------|
| Desktop | Electron 39, React 19, TypeScript 5.9, TailwindCSS 3 |
| Backend IA (Node) | Node.js, LangGraph, LanceDB |
| Backend Voz (Python) | FastAPI, uvicorn, Whisper, Kokoro |
| Build | pnpm, Turbo, electron-vite, electron-builder |
| CI/CD | GitHub Actions |

## Funcionalidades Principais

- **Roteamento Semântico (LanceDB):** Identifica intenções em ms com busca vetorial local
- **Tool RAG:** Carrega dinamicamente apenas as ferramentas necessárias
- **Motor de IA Local:** Llama.cpp via `llama-server.exe`
- **Streaming TTS:** Kokoro-82m com latência mínima
- **Wake Word Local:** Palavra-chave "Sistema" (processamento offline)
- **Modo Gaming:** Pausa automática de IA via FortScript
- **3 Tiers:** Lite, Pro, Ultra
