# Guia de Desenvolvimento

## Pré-requisitos

- **Node.js** 20+ (obrigatório)
- **pnpm** 9+ (obrigatório — bloqueado via script `preinstall`)
- **Python** 3.12+ (gerenciado automaticamente via `uv`)
- **Git**
- **Sistema Operacional**: Windows 10+, Linux (Ubuntu 22.04+), ou macOS

## Setup Inicial

```bash
# Clonar repositório
git clone https://github.com/WesleyQDev/MomAI.git
cd MomAI

# Instalar dependências do monorepo
pnpm install

# Iniciar desenvolvimento (desktop + backend simultâneos)
pnpm dev:all
```

Na primeira execução, o script `ensure-dev-binaries.js` baixará automaticamente os binários necessários (llama-server, Python bundlado, uv) para o diretório `apps/momai/bin/`.

### Lockfile

O `pnpm-lock.yaml` na raiz faz parte da especificação do projeto. O CI valida sua consistência com `pnpm install --frozen-lockfile`. Se o lockfile estiver desatualizado em relação ao `package.json`, o CI falha com:

```
ERR_PNPM_OUTDATED_LOCKFILE
```

Para evitar esse erro, git hooks são fornecidos em `.githooks/`:

| Hook | Disparo | Ação |
|------|---------|------|
| `post-merge` | Após `git pull` ou `git merge` | Detecta lockfile stale e orienta correção |
| `post-rewrite` | Após `git rebase` | Detecta lockfile stale e orienta correção |

Para ativar os hooks:

```bash
git config core.hooksPath .githooks
```

Ou automaticamente via `pnpm install` (que configura hooksPath como efeito colateral do `postinstall`).

**Nota:** hooks são uma melhoria de DX, não substituem a validação do CI. Se o hook não detectar o stale (ex: fast-forward), o CI ainda falhará — o que é o comportamento esperado.

## Comandos

### Raiz do Monorepo

| Comando | Descrição |
|---------|-----------|
| `pnpm dev` | Inicia apenas o desktop app |
| `pnpm dev:core` | Inicia apenas o backend Python (uvicorn --reload) |
| `pnpm dev:all` | Desktop + Core simultaneamente (via concurrently) |
| `pnpm build` | Build da app desktop via Turborepo |
| `pnpm build:win` | Build Windows .exe (NSIS) |
| `pnpm build:linux` | Build Linux AppImage |
| `pnpm build:mac` | Build macOS .dmg |
| `pnpm build:appx` | Build Windows AppX (Microsoft Store) |
| `pnpm build:unpack` | Build unpacked para debug |
| `pnpm lint` | Lint de todas as apps via Turbo |
| `pnpm typecheck` | TypeScript check de todas as apps |
| `pnpm format` | Prettier format |
| `pnpm test` | Testes via Turbo |
| `pnpm docs:internal` | Inicia documentação interna (Docusaurus) |

### Desktop (`apps/momai/`)

```bash
cd apps/momai

# Desenvolvimento
pnpm dev                    # Electron + hot reload
pnpm test                   # Vitest (renderer + main)
pnpm test:watch             # Vitest watch mode
pnpm test:coverage          # Vitest com cobertura
pnpm test:main              # Testes do main process
pnpm test:renderer          # Testes do renderer

# Build
pnpm build                  # Full build (typecheck + hydrate-bin + electron-vite build)
pnpm build:win              # Windows .exe (NSIS)
pnpm build:linux            # Linux AppImage
pnpm build:mac              # macOS .dmg

# Linting & Typecheck
pnpm lint                   # ESLint (caches em .eslintcache)
pnpm typecheck              # TypeScript (node + web)
pnpm typecheck:node         # TypeScript (Node/preload)
pnpm typecheck:web          # TypeScript (React/web)

# Limpeza
pnpm clean                  # Remove dist, out, data, models, .turbo
```

### Core (`apps/core/`)

```bash
cd apps/core
pnpm dev                    # uv run uvicorn main:app --reload --port 8000
pnpm test                   # uv run pytest
pnpm test:watch             # uv run pytest --watch
```

## Convenções de Código

### TypeScript / React (Desktop)

- **Componentes**: PascalCase (`SettingsPanel.tsx`)
- **Hooks**: camelCase com prefixo `use` (`useAudioRecorder.ts`)
- **Utilitários**: camelCase (`formatTime.ts`)
- **Constantes**: UPPER_SNAKE_CASE
- **Arquivos**: kebab-case para utils (`safe-tools.ts`)
- **Testes**: arquivo `.test.ts`/`.test.tsx` ao lado do arquivo testado
- **Estilos**: TailwindCSS utility classes (CSS modules não são usados)

### Python (Core)

- **Versão**: 3.12+
- **Gerenciamento**: `uv` (lock file: `uv.lock`)
- **Estilo**: PEP 8, type hints obrigatórios em funções públicas
- **Async**: async/await para I/O (FastAI, HTTP, subprocess)
- **Funções**: snake_case
- **Classes**: PascalCase
- **Constantes**: UPPER_SNAKE_CASE
- **FastAPI**: Uso de `Depends()` para injeção de dependência, schemas Pydantic para validação
- **Rotas**: Organizadas em `api/routes/*.py`

## Estrutura do Projeto

```
momai/
├── apps/
│   ├── core/               # Python sidecar (FastAPI, STT, TTS, Wake Word)
│   ├── fortscript/         # Python lib (gaming mode process manager)
│   ├── landing-page/       # Vite + React (site institucional)
│   ├── momai/              # Electron + React (desktop app principal)
│   └── momai-promo-video/  # Remotion (vídeo promocional)
├── docs/                   # Documentação técnica
├── scripts/                # Scripts raiz (sync blog, deploy, etc.)
└── .github/workflows/      # CI/CD (CI, Release, Deploy Landing)
```

### Estrutura do Electron App

```
apps/momai/
├── src/
│   ├── main/               # Processo principal Electron
│   │   ├── index.ts        # Entry point
│   │   ├── windowManager.ts
│   │   ├── coreManager.ts  # Gerencia Node Core subprocess
│   │   ├── pythonManager.ts
│   │   ├── python/         # Bootstrap Python modular
│   │   │   ├── bootstrap/  # Env, uv, venv, VC redist
│   │   │   └── utils/
│   │   ├── ttsService.ts
│   │   ├── ttsIpcHandlers.ts
│   │   ├── notesService.ts
│   │   ├── updater.ts
│   │   ├── logger.ts
│   │   └── state.ts
│   ├── preload/            # Bridge segura (contextBridge)
│   └── renderer/           # React SPA
│       └── src/
│           ├── components/  # Componentes compartilhados
│           │   ├── chat/    # 25 arquivos (MessageItem, ChatInput, WeatherCard, etc.)
│           │   ├── notes/
│           │   ├── reminders/
│           │   ├── floating/ (Settings, Onboarding, Update, etc.)
│           │   └── ...
│           ├── features/    # Módulos refatorados por feature
│           │   ├── chat/message/  # MessageItem decomposto em 11 arquivos
│           │   └── notes/         # NotesView decomposto em 14 arquivos
│           ├── hooks/       # 27 custom hooks
│           ├── services/    # api.ts (SSE), ttsService.ts
│           ├── views/       # 5 views (About, Extensions, Notes, Reminders, Overlay)
│           ├── i18n/        # pt-BR, en-US
│           └── utils/
├── scripts/
│   ├── node-core.js        # Entry point do Node Core
│   ├── node-core/          # Módulos do Node Core
│   │   ├── api/routes/     # Rotas (reminders, etc.)
│   │   ├── config/         # Constantes, tiers
│   │   ├── infrastructure/ # Logger, store, process manager
│   │   └── services/       # Chat, LLM, skills, embeddings, TTS
│   ├── skills/             # Plataforma de skills
│   │   ├── core/           # Skills built-in (weather, search, memory, scheduler)
│   │   ├── packaged/       # Skills empacotadas (dev, launcher)
│   │   └── registry.js     # Registro de skills (621 linhas)
│   ├── hydrate-bin.ps1     # Download de binários (Windows)
│   ├── hydrate-bin.sh      # Download de binários (Linux)
│   └── ensure-dev-binaries.js
├── bin/                    # Binários (Python, uv, llama-server, wheels)
├── electron-builder.yml    # Configuração de build
├── electron.vite.config.ts # Configuração Vite
└── package.json
```

### Estrutura do Core Python

```
apps/core/
├── api/
│   ├── router.py           # APIRouter principal
│   ├── deps.py             # Dependências FastAPI
│   └── routes/
│       ├── voice.py        # Wake word, call mode, quick transcribe (254 linhas)
│       └── chat_voice.py   # TTS speak, stop voice
├── database/
│   └── models.py           # SQLAlchemy models + migrações automáticas
├── services/voice/
│   ├── tts.py              # Kokoro TTS engine
│   ├── detector.py          # Wake word detector (OpenWakeWord)
│   ├── quick_transcriber.py # Whisper quick transcribe
│   └── models/             # Modelos de voz
├── main.py                 # Entry point FastAPI
├── startup.py              # Lifespan, init, prewarm TTS
├── app_state.py            # Estado global (WebSockets, TTS runtime)
├── runtime.py              # Logging, patching, UTF-8 config
└── ai_tiers.json           # Configuração dos tiers (Qwen3.5 0.8B/2B/4B)
```

## Notas Importantes

1. **Sempre use `pnpm`** — npm/yarn são bloqueados pelo script `preinstall`
2. **Node Core** roda como subprocesso do Electron, comunicação via HTTP localhost:8000
3. **Python Sidecar** roda como subprocesso do Electron, comunicação via HTTP localhost:8001
4. **Portas**: Node Core = 8000, Python Sidecar = 8001, llama-server = 8080, Embeddings = 8081
5. **Skills** são carregadas dinamicamente de `scripts/skills/core/` e `data/extensions/`
6. **Graphify**: Knowledge graph em `graphify-out/` — consulte antes de refatorar
7. **Commits**: Use conventional commits (`feat:`, `fix:`, `docs:`, `refactor:`)
8. **Auto-update**: Releases são publicados no repositório público `WesleyQDev/MomAI-App`
9. **Todas as dependências Python** são pré-compiladas como wheels durante o build CI
10. **O Electron app** inclui Python bundlado + uv + llama-server no instalador
