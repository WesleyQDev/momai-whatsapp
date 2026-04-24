# MomAI Desktop

Aplicação desktop Electron para MomAI — assistente virtual local-first com LLMs.

## Stack

- **Electron** (main + renderer + preload)
- **React 19** + **TypeScript**
- **Tailwind CSS**
- **FastAPI** (Python sidecar)
- **llama.cpp** (inferência local via `llama-server`)

## Estrutura

```
apps/momai/
├── scripts/
│   ├── node-core/              # Backend Node.js modular (refatorado)
│   │   ├── config/             # Constantes, tiers, paths
│   │   ├── infrastructure/     # Logger, store, HTTP helpers, process manager
│   │   ├── services/           # Domínio de negócio (LLM, embeddings, chat, etc.)
│   │   ├── domain/             # Language detector, prompt builder, note manager
│   │   ├── api/                # Router, WebSocket, rotas HTTP
│   │   └── utils/              # Text, time, network utilities
│   ├── node-core.js            # Wrapper → node-core/index.js
│   ├── skills/                 # Skills runtime (JS)
│   └── prompts/                # System prompts
├── src/
│   ├── main/                   # Processo principal Electron
│   │   ├── python/             # Bootstrap Python modular (refatorado)
│   │   │   ├── bootstrap/      # Env, venv, uv, VC redist
│   │   │   ├── utils/          # FS helpers, process helpers
│   │   │   └── types.ts
│   │   ├── index.ts            # Entry point Electron
│   │   ├── coreManager.ts      # Gerencia node-core subprocess
│   │   ├── pythonManager.ts    # Wrapper → python/index.ts
│   │   ├── state.ts            # Estado global main process
│   │   └── windowManager.ts    # Janelas e atalhos
│   ├── preload/                # Bridge segura Electron ↔ Renderer
│   └── renderer/
│       ├── src/
│       │   ├── features/       # Módulos por feature (refatorado)
│       │   │   ├── chat/message/   # MessageItem decomposto
│       │   │   └── notes/          # NotesView decomposto
│       │   ├── components/     # Componentes compartilhados
│       │   ├── hooks/          # Hooks compartilhados
│       │   ├── services/       # API clients
│       │   ├── views/          # Views de página (wrappers)
│       │   └── i18n/           # Internacionalização
│       └── index.html
├── bin/                        # Binários nativos (Python, llama, uv)
├── build/                      # Assets de build Electron
└── electron.vite.config.ts
```

## Comandos

### Development

```bash
# Desktop + backend Python
pnpm dev

# Apenas backend Python
pnpm dev:core

# Ambos (concurrently)
pnpm dev:all
```

### Build

```bash
# Windows (.exe)
pnpm build:win

# Linux (AppImage)
pnpm build:linux

# macOS (.dmg)
pnpm build:mac
```

### Qualidade

```bash
# TypeScript (node + web)
pnpm typecheck

# ESLint + Prettier
pnpm lint
pnpm format
```

## Refatoração Modular (2025)

Os seguintes arquivos monolíticos foram decompostos:

| Arquivo Original | Linhas | Novo Local | Módulos |
|------------------|--------|------------|---------|
| `scripts/node-core.js` | 4,432 | `scripts/node-core/` | 29 arquivos |
| `src/main/pythonManager.ts` | 1,891 | `src/main/python/` | 12 arquivos |
| `src/renderer/views/NotesView.tsx` | 1,404 | `src/renderer/src/features/notes/` | 14 arquivos |
| `src/renderer/components/chat/MessageItem.tsx` | 1,196 | `src/renderer/src/features/chat/message/` | 11 arquivos |

Os arquivos originais permanecem como **thin wrappers** para compatibilidade com imports existentes.

## Requisitos

- Node.js 20+
- pnpm 9+
- Python 3.12 (gerenciado automaticamente via `uv`)

## Backends Suportados

- **CPU** (`llama-server` CPU)
- **Vulkan** (`llama-server` GPU via Vulkan)

O backend é selecionado automaticamente na primeira execução (onboarding).

## Tiers de IA

- **Lite**: modelo pequeno, sem voice/TTS, sem memória vetorial
- **Pro**: modelo médio, com TTS
- **Ultra**: modelo grande, com TTS, wake word, memória vetorial (LanceDB), embeddings

## Dados Locais

- Config: `%APPDATA%/MomAI/data/node-core-store.json`
- Notas: `%APPDATA%/MomAI/data/notes/`
- Modelos: `%APPDATA%/MomAI/data/models/`
- Python venv: `%APPDATA%/MomAI/python_env/`

## Notas para Desenvolvedores

- Sempre use `pnpm` (bloqueado via `preinstall` script)
- O `node-core` roda como subprocesso do Electron; comunicação via IPC + HTTP
- O backend Python roda como sidecar; comunicação via HTTP + WebSocket
- Skills são carregadas dinamicamente de `scripts/skills/core/` e `data/extensions/`
- O graphify knowledge graph está em `graphify-out/`; consulte-o antes de fazer refactoring
