# MomAI Desktop

Aplicação desktop Electron que fornece a interface gráfica para o assistente MomAI.

## Stack

- **Electron 39** (main + renderer + preload)
- **React 19** + **TypeScript 5.9**
- **TailwindCSS 3.x**
- **electron-vite** (bundling)
- **electron-builder** (packaging)

## Processos

### 1. Main Process (`src/main/`)

Gerencia o ciclo de vida da aplicação:

| Arquivo | Responsabilidade |
|---------|-----------------|
| `index.ts` | Entry point, lifecycle events |
| `windowManager.ts` | Criação/gerenciamento de janelas, atalhos |
| `coreManager.ts` | Subprocesso Node Core (HTTP + IPC) |
| `pythonManager.ts` | Subprocesso Python sidecar |
| `state.ts` | Estado global do main process |
| `logger.ts` / `logger-tui.ts` | Logging |
| `ttsService.ts` / `ttsIpcHandlers.ts` | TTS bridge |
| `notesService.ts` | Serviço de notas |
| `updater.ts` | Auto-update |
| `python/` | Bootstrap Python modular (env, venv, uv) |

### 2. Preload (`src/preload/`)

Bridge segura entre main e renderer via `contextBridge`. Expõe APIs limitadas para o renderer:

- Gerenciamento de janelas
- TTS
- Atalhos de teclado
- Comunicação IPC

### 3. Renderer (`src/renderer/`)

React SPA com TailwindCSS. Estrutura:

```
src/renderer/src/
├── components/           # Componentes compartilhados
│   ├── chat/             # Chat components (MessageItem, ChatInput, etc.)
│   ├── notes/            # Note components
│   ├── reminders/        # Reminder components
│   └── floating/         # Overlays (Settings, Onboarding, etc.)
├── features/             # Módulos por feature (refatorado)
│   ├── chat/message/     # MessageItem decomposto em 11 arquivos
│   └── notes/            # NotesView decomposto em 14 arquivos
├── hooks/                # Custom hooks (19 hooks)
├── services/             # API clients (api.ts, ttsService.ts)
├── views/                # Page views (About, Extensions, Notes, etc.)
├── i18n/                 # Internacionalização (pt-BR, en-US)
└── utils/                # Utilitários
```

### Views Principais

| View | Rota | Componente |
|------|------|------------|
| Chat | `/` | `ContainerChat.tsx` |
| Notas | `/notes` | `NotesView.tsx` |
| Lembretes | `/reminders` | `RemindersView.tsx` |
| Extensões | `/extensions` | `ExtensionsView.tsx` |
| Sobre | `/about` | `AboutView.tsx` |
| Overlay | overlay | `OverlayView.tsx` |

## Funcionalidades da UI

- **Dashboard dinâmico** com monitoramento de recursos
- **Chat** com streaming SSE, respostas estruturadas (WeatherCard, etc.)
- **Notas** com edição inline e organização
- **Lembretes** com voz e notificações
- **Extensões** com sidebar dinâmica
- **Modo overlay** (janela transparente sempre no topo)
- **Gráfico de agentes** (visualização LangGraph)
- **Tema escuro** padrão
- **Boot com progresso** e tela de boas-vindas

## Build & Distribuição

| Comando | Formato | Plataforma |
|---------|---------|------------|
| `pnpm build:win` | NSIS installer (.exe) | Windows |
| `pnpm build:linux` | AppImage | Linux |
| `pnpm build:mac` | DMG | macOS |
| `pnpm build:appx` | AppX | Windows (Microsoft Store) |
| `pnpm build:unpack` | Diretório unpacked | Dev/teste |

## Bootstrap Python

O processo de bootstrap do Python no main process foi refatorado de `pythonManager.ts` (1.891 linhas) para `src/main/python/` (12 arquivos):

```
src/main/python/
├── index.ts              # Entry point do bootstrap
├── types.ts              # Tipos compartilhados
├── backend-manager.ts    # Gerenciamento de backends
├── bootstrap/            # Módulos de bootstrap
│   ├── env.ts            # Variáveis de ambiente
│   ├── uv.ts            # Gerenciamento do uv
│   ├── venv.ts          # Virtualenv
│   ├── vc-redist.ts     # VC++ Redistributable
│   └── ...
└── utils/               # Helpers
```

## Desenvolvimento

```bash
# Dev mode (com hot reload)
cd apps/momai
pnpm dev

# TypeScript check
pnpm typecheck

# Lint
pnpm lint

# Build para teste
pnpm build:unpack
```

**Nota:** O `dev` script executa `scripts/ensure-dev-binaries.js` para baixar binários necessários (llama-server, Python, uv) antes de iniciar o Electron.
