<div align="center">

# MomAI

**Assistente virtual local-first focada em privacidade**

[![License: Proprietary](https://img.shields.io/badge/License-Proprietary-red.svg?style=flat-square)](LICENSE)
[![Version](https://img.shields.io/badge/Version-1.4.1-blue.svg?style=flat-square)](package.json)

</div>

## O que é MomAI?

MomAI é uma assistente virtual **local-first** e focada em privacidade. Ela combina a inteligência dos LLMs modernos com a capacidade de executar ações reais no seu computador.

### Destaques

- **Roteamento Semântico (LanceDB)** — Identifica intenções do usuário em milissegundos usando busca vetorial local, economizando tokens e tempo.
- **Tool RAG** — Carrega dinamicamente apenas as ferramentas necessárias para cada tarefa, permitindo um ecossistema de centenas de extensões sem perda de performance.
- **Motor de IA Local** — Roda modelos Llama/Qwen via `llama-server.exe` em processo dedicado, garantindo performance máxima.
- **Streaming TTS Real-time** — Fala com você enquanto ainda está pensando, com latência mínima usando Kokoro-82m.
- **Wake Word Local** — Diga "Sistema" para ativar a assistente sem precisar tocar no teclado (processamento offline).
- **Modo Overlay** — Janela transparente sempre no topo para uso contínuo.
- **Modo Gaming** — Pausa automaticamente processos de IA quando jogos são detectados (via FortScript).
- **Sistema de Extensões** — Skills ZIP auto-contidas com UI React, manifest.json e isolamento total.

### Por que usar MomAI?

- **Privacidade** — Seus dados ficam no seu computador.
- **Extensível** — Adicione apenas as funcionalidades que você precisa.
- **Gratuito** — Uso pessoal sem custos.
- **Multiplataforma** — Windows e Linux.

## Stack

| Camada | Tecnologia |
|--------|------------|
| Desktop | Electron 42, React 19, TypeScript 6, TailwindCSS 3 |
| Build | electron-vite 5, electron-builder 26, pnpm 10, Turborepo 2 |
| AI Orchestration | Node.js, LangGraph, LangChain |
| Semantic Search | LanceDB 0.27 |
| Backend Voz | Python 3.12+, FastAPI, faster-whisper, Kokoro ONNX |
| TTS | edge-tts-universal (cloud), say.js (local fallback) |
| Gaming Mode | FortScript (Python 3.10+) |
| CI/CD | GitHub Actions |
| Testing | Vitest 4 (desktop), pytest (core + fortscript) |

## Estrutura do Monorepo

```
momai/
├── apps/
│   ├── momai/          # Desktop (Electron + React + TypeScript)
│   ├── core/           # Backend Python (FastAPI, STT/TTS, inferência)
│   ├── fortscript/     # Gerenciador de processos para gaming mode
│   ├── landing-page/   # Site institucional (Vite + React + TailwindCSS)
│   └── momai-promo-video/  # Vídeo promocional (Remotion)
├── docs/               # Documentação técnica interna
├── scripts/            # Scripts de build, release e utilitários
├── registry.json       # Registro de extensões oficiais
└── package.json        # Configuração do monorepo
```

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

## Documentação

Documentação técnica interna disponível em [`docs/`](docs/README.md).

## Licença

Uso pessoal gratuito sob licença proprietária. Veja o arquivo [LICENSE](LICENSE) para os termos completos.

## Contribuições

Consulte os documentos abaixo para contribuir com o projeto:

- [CONTRIBUTING.md](CONTRIBUTING.md) — guia de contribuição e regras
- [CLA.md](CLA.md) — termos de cessão de direitos
- [SECURITY.md](SECURITY.md) — política de segurança e divulgação de vulnerabilidades

---

<div align="center">

**Feito com ❤️ WesleyQDev**

</div>
