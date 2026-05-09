# MomAI Desktop

## Visão Geral

A aplicação desktop MomAI é construída com Electron 39 + React 19 + TypeScript 5.9, com estilos via TailwindCSS 3.x. É a interface principal que o usuário vê e com a qual interage. Ela orquestra dois subprocessos (Node Core para IA, Python Sidecar para voz) e gerencia todo o ciclo de vida da aplicação.

## Stack Tecnológica

| Tecnologia | Versão | Propósito |
|------------|--------|-----------|
| Electron | 39.x | Container desktop multiplataforma |
| React | 19.x | UI (biblioteca de componentes) |
| TypeScript | 5.9.x | Type safety |
| TailwindCSS | 3.4.x | Estilização utility-first |
| electron-vite | 5.x | Bundling (main + preload + renderer) |
| electron-builder | 26.x | Packaging (NSIS, AppImage, DMG, AppX) |
| Vite | 7.x | Dev server e build do renderer |
| Vitest | 4.x | Testes unitários |
| React Router DOM | 7.x | Roteamento SPA |
| CodeMirror | 6.x | Editor de markdown nas notas |
| Heroicons | 2.x | Ícones |
| Lucide React | 1.x | Ícones adicionais |
| Axios | 1.x | Cliente HTTP |
| react-markdown | 10.x | Renderização de markdown |
| LangGraph | 1.2.x | Orquestração de agentes (via Node Core) |
| LanceDB | 0.27.x | Busca vetorial local (via Node Core) |
| Zod | 4.x | Validação de schemas |
| electron-updater | 6.8.x | Auto-update |
| ws | 8.x | WebSocket client |
| edge-tts-universal | 1.4.x | TTS cloud fallback |
| Zud | 0.16.x | TTS local fallback |

## Três Processos do Electron

### 1. Main Process (`src/main/`)

O processo principal gerencia o ciclo de vida completo da aplicação. É o "cérebro" do Electron, executando em um contexto Node.js completo.

**Arquivos principais:**

| Arquivo | Responsabilidade |
|---------|-----------------|
| `index.ts` | Entry point, lifecycle, single instance lock |
| `windowManager.ts` | Criação/gerenciamento de janelas, atalhos globais (Ctrl+Space), toggle |
| `coreManager.ts` | Gerencia subprocesso Node Core: start, stop, restart |
| `pythonManager.ts` | Gerencia subprocesso Python sidecar |
| `state.ts` | Estado global (isQuitting, isFirstLaunch) |
| `logger.ts` / `logger-tui.ts` | Logging estruturado (arquivo + terminal) |
| `ttsService.ts` | Serviço TTS (Edge TTS, Say.js) |
| `ttsIpcHandlers.ts` | Handlers IPC para TTS |
| `notesService.ts` | Serviço de notas (CRUD, busca lexical) |
| `updater.ts` | Auto-update via GitHub Releases |
| `python/` | Bootstrap Python modular (12 arquivos) |
| `constants.ts` | Constantes (diretórios, URLs) |
| `env.ts` | Config de variáveis de ambiente |
| `lexical-search.ts` | Busca lexical em notas |

**Recursos do Main Process:**

- **Single Instance Lock**: Garante que apenas uma instância do MomAI rode por vez
- **Auto-start**: Pode ser configurado para iniciar com o Windows
- **Tray Icon**: Ícone na bandeja do sistema com menu de contexto
- **Atalho Global**: Ctrl+Space para mostrar/esconder a janela
- **Gerenciamento de Subprocessos**: Inicia, monitora e reinicia Node Core e Python sidecar automaticamente
- **Hardware Acceleration**: Desabilitada em Linux para compatibilidade com Hyper-V/VirtualBox

### 2. Preload (`src/preload/`)

Uma camada de segurança que expõe APIs limitadas do Node.js para o renderer via `contextBridge`. Isso segue a arquitetura de segurança do Electron onde o renderer nunca tem acesso direto ao Node.js.

APIs expostas:
- Gerenciamento de janelas (minimizar, maximizar, fechar)
- TTS (falar, parar)
- Atalhos de teclado
- Comunicação IPC (notas, status, etc.)

### 3. Renderer (`src/renderer/`)

SPA React com TypeScript. Estrutura completa:

```
src/renderer/src/
├── App.tsx                   # Componente raiz (265 linhas)
├── main.tsx                  # Entry point React
├── components/               # Componentes compartilhados
│   ├── chat/                 # 25 arquivos de componentes de chat
│   │   ├── MessageItem.tsx   # Mensagem individual
│   │   ├── ChatInput.tsx     # Input de texto
│   │   ├── MessageList.tsx   # Lista de mensagens
│   │   ├── WeatherCard.tsx   # Card de previsão do tempo
│   │   ├── RemindersCard.tsx # Card de lembretes
│   │   ├── DevResultCard.tsx # Card de resultado de código
│   │   ├── DevConfirmationCard.tsx
│   │   ├── DevHtmlRenderCard.tsx
│   │   ├── HtmlPreviewCard.tsx
│   │   ├── GenericExtensionCard.tsx  # Card genérico de extensão
│   │   ├── ExtensionRendererLoader.tsx
│   │   ├── ExtrasRenderer.tsx
│   │   ├── SkillResponseRegistry.ts  # Registry de renderers
│   │   ├── StructuredResponseRenderer.tsx
│   │   ├── TTSEngineLoadingAnimation.tsx
│   │   ├── ChatHistoryPopover.tsx
│   │   ├── ChatContextMenu.tsx
│   │   ├── LoadingAnimation.tsx
│   │   ├── WelcomeTips.tsx
│   │   └── index.ts
│   ├── floating/             # Overlays modais
│   │   ├── SettingsCard.tsx
│   │   ├── OnboardingCard.tsx
│   │   ├── UpdateToast.tsx
│   │   ├── ConfirmationCard.tsx
│   │   └── AutoUpdateCard.tsx
│   ├── GraphInterface.tsx    # Visualização de grafo de agentes
│   ├── InfoPanel.tsx         # Painel de informações do sistema
│   ├── LateralBar.tsx        # Barra lateral principal
│   ├── MainViewRenderer.tsx  # Renderizador de view principal
│   ├── TitleBar.tsx          # Barra de título customizada
│   ├── WelcomeScreen.tsx     # Tela de boas-vindas
│   └── BootstrapError.tsx   # Tela de erro de bootstrap
├── features/                 # Módulos refatorados por feature
│   ├── chat/message/         # 11 arquivos (decomposição do MessageItem)
│   └── notes/                # 14 arquivos (decomposição do NotesView)
├── hooks/                    # 27 custom hooks
│   ├── useChat.ts            # Chat principal
│   ├── useStatus.ts          # Status do sistema
│   ├── useTTS.ts             # TTS
│   ├── useAppInitialization.ts
│   ├── useAppEvents.ts
│   ├── useAppTheme.ts
│   ├── useAudioFallback.ts
│   ├── useInitTtsRenderer.ts
│   ├── useChatActions.ts
│   ├── useChatHandlers.ts
│   ├── useChatState.ts
│   ├── useChatInit.ts
│   ├── useChatWebSocket.ts
│   ├── useActiveReminders.ts
│   ├── useAutocomplete.ts
│   ├── useOverlayBridge.ts
│   ├── usePythonStatus.ts
│   ├── useSettingsCard.ts
│   └── useWindowMaximized.ts
├── services/                 # Serviços
│   ├── api.ts                # Cliente HTTP com SSE streaming (747 linhas)
│   └── ttsService.ts         # Serviço TTS
├── views/                    # Páginas
│   ├── AboutView.tsx         # Sobre
│   ├── ExtensionsView.tsx    # Loja de extensões
│   ├── NotesView.tsx         # Notas
│   ├── OverlayView.tsx       # Modo overlay
│   └── RemindersView.tsx     # Lembretes
├── i18n/                     # Internacionalização
│   ├── pt-BR.json
│   └── en-US.json
├── utils/                    # Utilitários
└── assets/                   # Assets estáticos
```

## Views (Páginas)

| View | Rota | Descrição |
|------|------|-----------|
| Chat | `/` | Interface principal de chat com streaming |
| Notas | `/notes` | Editor de notas com markdown |
| Lembretes | `/reminders` | Gerenciamento de lembretes |
| Extensões | `/extensions` | Loja e gerenciamento de extensões |
| Sobre | `/about` | Informações do sistema e licença |
| Overlay | overlay | Janela transparente sempre no topo (call mode) |

## Funcionalidades da Interface

- **Dashboard dinâmico**: Monitoramento de recursos em tempo real (CPU, RAM, VRAM, status do LLM)
- **Chat com streaming**: Respostas aparecem token por token via SSE
- **Respostas Estruturadas**: Cards visuais para clima, lembretes, resultados de código
- **Editor de Notas**: CodeMirror 6 com syntax highlight para markdown
- **Lembretes**: Com notificações por voz e repetições customizáveis
- **Extensões**: Loja com sidebar dinâmica e configurações próprias
- **Modo Overlay**: Janela transparente sobre outras aplicações (útil para call mode)
- **Grafo de Agentes**: Visualização interativa do LangGraph (via react-force-graph-2d)
- **Tema Escuro**: Design system escuro como padrão
- **Boot com Progresso**: Animação de inicialização com eventos de progresso
- **Onboarding**: Tela de boas-vindas na primeira execução
- **Auto-Update**: Atualizações automáticas via GitHub Releases
- **Internacionalização**: pt-BR e en-US

## Build e Distribuição

| Comando | Formato | Plataforma | Notas |
|---------|---------|------------|-------|
| `pnpm build:win` | NSIS (.exe) | Windows | OneClick installer, inclui Python + llama-server |
| `pnpm build:linux` | AppImage / .deb | Linux | Inclui Python + llama-server |
| `pnpm build:mac` | DMG | macOS | Notarização desabilitada |
| `pnpm build:appx` | AppX | Windows Store | Dois flavors: store + test |
| `pnpm build:unpack` | Diretório | Dev | Para debug sem instalar |

### Extra Resources (incluídos no installer)

- `apps/core/` → Python sidecar (excluindo .venv, __pycache__, models)
- `apps/fortscript/` → FortScript (excluindo .venv, __pycache__)
- `bin/` → Binários (llama-server, Python bundlado, uv, wheels)
- `resources/` → Recursos adicionais
- `build/diagnostic.bat` / `diagnostic.sh` → Scripts de diagnóstico

## Bootstrap Python

O bootstrap do Python é um processo complexo que foi refatorado de um arquivo de 1.891 linhas (`pythonManager.ts`) para 12 arquivos modulares em `src/main/python/`:

```
src/main/python/
├── index.ts              # Entry point do bootstrap
├── types.ts              # Tipos compartilhados
├── backend-manager.ts    # Gerenciamento de backends (uv, venv)
└── bootstrap/
    ├── env.ts            # Config de ambiente
    ├── uv.ts             # Gerenciamento do uv (instalação, sincronização)
    ├── venv.ts           # Criação/config de virtualenv
    ├── vc-redist.ts      # Instalação VC++ Redistributable (Windows)
    └── ...
└── utils/               # Helpers
```

O bootstrap:
1. Verifica se uv está instalado
2. Cria virtualenv se não existir
3. Sincroniza dependências do pyproject.toml
4. Verifica VC++ Redist no Windows
5. Inicia o servidor FastAPI
