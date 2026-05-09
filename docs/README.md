# Documentação Técnica MomAIOS

Bem-vindo à documentação técnica do **MomAIOS** — o monorepo da **MomAI**, uma assistente virtual **local-first** e focada em privacidade que combina LLMs com ações reais no computador.

**Versão:** 1.3.0  
**Licença:** MIT  
**Autor:** [WesleyQDev](https://github.com/WesleyQDev)

## Stack Principal

| Camada | Tecnologia |
|--------|------------|
| Desktop | Electron 39, React 19, TypeScript 5.9, TailwindCSS 3 |
| Backend IA | Node.js, LangGraph, LanceDB, llama.cpp |
| Backend Voz | Python 3.12+, FastAPI, Whisper, Kokoro ONNX |
| Build | pnpm 10, Turborepo 2, electron-vite 5, electron-builder 26 |
| CI/CD | GitHub Actions |

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

- **Roteamento Semântico (LanceDB)**: Identifica intenções em milissegundos com busca vetorial local, economizando tokens
- **Tool RAG**: Carrega dinamicamente apenas as ferramentas necessárias para cada tarefa
- **Motor de IA Local**: Llama.cpp via `llama-server.exe` com modelos Qwen3.5 GGUF (0.8B a 4B)
- **Streaming TTS Real-time**: Kokoro-82m com latência mínima e pre-warm
- **Wake Word Local**: "Sistema" (offline, OpenWakeWord)
- **Modo Overlay**: Janela transparente sempre no topo
- **3 Tiers**: Lite, Pro, Ultra — equilibrando performance e qualidade
- **Extensível**: Sistema de extensões com permissões declarativas e isolamento
- **Auto-Update**: Atualizações automáticas via GitHub Releases
- **Multiplataforma**: Windows, Linux, macOS

## Repositórios

- **Código Fonte**: [github.com/WesleyQDev/MomAI](https://github.com/WesleyQDev/MomAI)
- **Releases**: [github.com/WesleyQDev/MomAI-App](https://github.com/WesleyQDev/MomAI-App)
- **Site**: [wesleyqdev.github.io/momai](https://wesleyqdev.github.io/momai)
