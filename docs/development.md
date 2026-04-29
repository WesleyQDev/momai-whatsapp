# Desenvolvimento

## Pré-requisitos

- **Node.js** 20+
- **pnpm** 9+ (obrigatório — bloqueado via `preinstall`)
- **Python** 3.12+ (gerenciado automaticamente via `uv`)
- **Git**

## Setup Inicial

```bash
# Clonar repositório
git clone https://github.com/WesleyQDev/MomAI.git
cd MomAI

# Instalar dependências do monorepo
pnpm install

# Iniciar desenvolvimento
pnpm dev:all   # Desktop + backend Python
```

## Comandos

### Root (monorepo)

| Comando | Descrição |
|---------|-----------|
| `pnpm dev` | Inicia desktop app |
| `pnpm dev:core` | Inicia apenas o backend Python |
| `pnpm dev:all` | Desktop + Core simultaneamente |
| `pnpm build` | Build de todas as apps via Turbo |
| `pnpm lint` | Lint de todas as apps |
| `pnpm typecheck` | TypeScript check de todas as apps |
| `pnpm format` | Prettier format |
| `pnpm test` | Testes (Turborepo) |

### Desktop (`apps/momai/`)

| Comando | Descrição |
|---------|-----------|
| `pnpm dev` | Electron em modo dev |
| `pnpm build` | Build completo (typecheck + hydrate-bin) |
| `pnpm build:win` | Build Windows .exe (NSIS) |
| `pnpm build:linux` | Build Linux AppImage |
| `pnpm build:mac` | Build macOS .dmg |
| `pnpm build:appx` | Build Windows AppX (Microsoft Store) |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | TypeScript check (node + web) |
| `pnpm typecheck:node` | TypeScript check (Node/preload) |
| `pnpm typecheck:web` | TypeScript check (React/web) |
| `pnpm format` | Prettier |

### Core (`apps/core/`)

| Comando | Descrição |
|---------|-----------|
| `uv run python main.py` | Inicia servidor FastAPI |
| `pnpm dev:core` | Atalho via monorepo |

## Convenções de Código

### TypeScript / React

- **Componentes:** PascalCase (`SettingsPanel.tsx`)
- **Hooks:** camelCase com prefixo `use` (`useAudioRecorder.ts`)
- **Utilitários:** camelCase (`formatTime.ts`)
- **Constantes:** UPPER_SNAKE_CASE
- **Arquivos:** kebab-case para utils

### Python

- **Versão:** 3.12+
- **Estilo:** PEP 8, type hints obrigatórios
- **Async:** async/await para I/O
- **Funções:** snake_case
- **Classes:** PascalCase
- **Constantes:** UPPER_SNAKE_CASE
- **FastAPI:** `Depends()` para DI, Pydantic schemas, rotas em `api/routes/*.py`

## Estrutura do Electron

```
apps/momai/
├── src/
│   ├── main/              # Processo principal
│   │   ├── index.ts       # Entry point
│   │   ├── windowManager.ts
│   │   ├── coreManager.ts # Gerencia subprocesso node-core
│   │   ├── pythonManager.ts # Gerencia Python sidecar
│   │   └── python/        # Bootstrap Python (modular)
│   │       ├── bootstrap/ # Env, venv, uv, VC redist
│   │       └── utils/
│   ├── preload/           # Bridge segura
│   └── renderer/          # React SPA
│       └── src/
│           ├── components/  # Shared components
│           ├── features/    # Módulos por feature
│           ├── hooks/       # Custom hooks
│           ├── services/    # API clients
│           ├── views/       # Page views
│           └── i18n/        # Internacionalização (pt-BR, en-US)
├── scripts/
│   ├── node-core/          # Backend Node.js modular
│   │   ├── api/routes/     # chat, extensions, reminders, etc.
│   │   ├── config/         # Constantes, tiers
│   │   ├── domain/         # Language detector, note manager, prompt builder
│   │   ├── infrastructure/ # Logger, store, process manager
│   │   ├── services/       # Chat, LLM, skills, embeddings, TTS
│   │   └── utils/          # Text, time, network
│   └── skills/             # Skills runtime
│       ├── core/           # Skills built-in (weather, search, etc.)
│       ├── packaged/       # Skills empacotadas
│       └── registry.js
```

## Node Core (Backend Node.js)

O Node Core é o cérebro da MomAI. Foi refatorado de um monolito de 4.432 linhas (`scripts/node-core.js`) para módulos em `scripts/node-core/`.

### Serviços

| Serviço | Arquivo | Função |
|---------|---------|--------|
| Chat | `services/chat-service.js` | Stream de respostas, gerenciamento de sessões |
| LLM | `services/llama-manager.js` | Subprocesso llama-server, seleção de modelo |
| Embeddings | `services/embedding-manager.js` | Geração de embeddings via llama.cpp |
| Semântico | `services/semantic-engine.js` | LanceDB, busca vetorial, RAG |
| Skills | `services/skill-orchestrator.js` | Descoberta e execução por intenção |
| Extensões | `services/extension-platform.js` | Runtime de extensões v1 |
| Lembretes | `services/reminder-service.js` | Lembretes agendados |
| TTS | `services/tts-service.js` | Bridge para Python TTS |

## Python Sidecar

Sidecar FastAPI enxuto para operações de voz. Foi refatorado de `pythonManager.ts` (1.891 linhas) para `src/main/python/` (12 arquivos).

### Rotas da API

| Rota | Método | Função |
|------|--------|--------|
| `/voice/ws` | WebSocket | Conexão real-time de voz |
| `/voice/quick-transcribe` | POST | Grava áudio e transcreve (Whisper) |
| `/voice/stop-quick-transcribe` | POST | Interrompe gravação manualmente |
| `/voice/wake-word` | POST | Ativa/desativa wake word |
| `/voice/call-mode` | POST | Alterna modo chamada |
| `/chat/stop-voice` | POST | Para TTS |
| `/chat/speak` | POST | Sintetiza fala (Kokoro) |

## Dados Locais

| Diretório | Conteúdo |
|-----------|----------|
| `%APPDATA%/MomAI/data/node-core-store.json` | Store principal (config, sessões, extensões) |
| `%APPDATA%/MomAI/data/notes/` | Notas do usuário |
| `%APPDATA%/MomAI/data/models/` | Modelos GGUF baixados |
| `%APPDATA%/MomAI/data/semantic/` | LanceDB (memória vetorial) |
| `%APPDATA%/MomAI/python_env/` | Virtualenv Python |
| `apps/core/momai.db` | SQLite de settings (dev) |

## Notas para Desenvolvedores

1. **Sempre use `pnpm`** — `npm`/`yarn` são bloqueados
2. **Node Core** roda como subprocesso do Electron; comunicação via IPC + HTTP
3. **Python sidecar** roda como subprocesso; comunicação via HTTP + WebSocket
4. **Skills** são carregadas dinamicamente de `scripts/skills/core/` e `data/extensions/`
5. **Graphify** knowledge graph está em `graphify-out/`; consulte antes de refatorar
6. **Commits:** Use conventional commits (`feat:`, `fix:`, `docs:`)
