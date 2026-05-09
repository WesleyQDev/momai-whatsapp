# Arquitetura do MomAIOS

## Visão Geral

MomAI é um assistente virtual de desktop que prioriza a privacidade do usuário executando LLMs **localmente** no computador. O sistema é construído como um monorepo gerenciado por pnpm workspaces + Turborepo, contendo cinco aplicações principais que se comunicam entre si para oferecer uma experiência completa de assistente inteligente.

Diferente de assistentes como Alexa ou Google Assistant que enviam seus dados para a nuvem, o MomAI foi projetado para que tudo — desde a detecção da palavra de ativação até a geração de texto e fala — aconteça na sua própria máquina.

## Diagrama de Contexto (C4 Nível 1)

```
+-------------+     +-------------------------------------------+
|             |     |              MomAI Desktop                |
|   Usuário   |<--->|  (Electron + React + TypeScript)          |
|             |     |                                           |
+-------------+     |  +--------+  +----------+  +-----------+  |
                    |  | Main   |  | Preload  |  | Renderer  |  |
                    |  | Process|  | (Bridge) |  | (React)   |  |
                    |  +--------+  +----------+  +-----------+  |
                    |         |           |           |         |
                    +---------|-----------|-----------|---------+
                              |           |           |
                     HTTP/WS  |     IPC   |    HTTP/WS|
                              |           |           |
                    +---------|-----------+-----------|---------+
                    |         v                       v         |
                    |  +--------------+     +--------------+     |
                    |  |  Node Core   |     | Python       |     |
                    |  |  (LLM, Chat, |     | Sidecar      |     |
                    |  |   Skills,    |     | (STT, TTS,   |     |
                    |  |   RAG)       |     |  Wake Word)   |     |
                    |  +--------------+     +--------------+     |
                    |        |                                    |
                    |  +-----------                               |
                    |  | llama-server  (subprocesso LLM)           |
                    |  | (Qwen3.5 GGUF models)                     |
                    |  +-----------                               |
                    +-------------------------------------------+
```

## Componentes (C4 Nível 2)

### 1. MomAI Desktop (Electron)

A interface gráfica do assistente roda sobre Electron 39.x e é dividida em três processos, cada um com uma responsabilidade bem definida:

**Main Process** (`apps/momai/src/main/`): É o processo principal do Electron. Ele gerencia o ciclo de vida da aplicação — criação de janelas, atalhos globais, bandeja do sistema (tray), e o mais importante: ele orquestra os subprocessos do Node Core e do Python Sidecar. É aqui que decisões críticas como "iniciar o servidor llama.cpp", "baixar modelos GGUF", e "gerenciar o ambiente Python" acontecem. Arquivos principais:
- `index.ts`: Ponto de entrada, eventos de lifecycle
- `windowManager.ts`: Criação e gerenciamento de janelas
- `coreManager.ts`: Gerencia o subprocesso Node Core (inicia, monitora, reinicia)
- `pythonManager.ts`: Gerencia o Python sidecar
- `updater.ts`: Auto-update via electron-updater
- `python/`: Bootstrap modular do Python (12 arquivos, refatorado de um monolito de 1.891 linhas)

**Preload** (`apps/momai/src/preload/`): Uma camada fina de segurança que usa `contextBridge` do Electron para expor APIs limitadas do Node.js para o renderer. Isso segue as melhores práticas de segurança do Electron — o renderer nunca tem acesso direto ao Node.js.

**Renderer** (`apps/momai/src/renderer/`): Uma SPA React 19 com TypeScript 5.9 e TailwindCSS 3.x. É o que o usuário vê e com o que interage. Contém:
- **Views**: Chat, Notas, Lembretes, Extensões, Sobre, Overlay
- **Componentes**: Barra lateral, cards de resposta estruturada (WeatherCard, RemindersCard, etc.), gráfico de agentes
- **Hooks**: 27 custom hooks que encapsulam lógica de chat, áudio, TTS, status, inicialização
- **Serviços**: Cliente API com SSE streaming, serviço de TTS

### 2. Node Core

O "cérebro" da MomAI. Originalmente um monolito de 4.432 linhas (`scripts/node-core.js`), foi refatorado para uma estrutura modular em `scripts/node-core/`. Ele roda como um subprocesso do Electron e se comunica via HTTP + WebSocket.

**Serviços Principais:**

| Serviço | Arquivo | Função |
|---------|---------|--------|
| Chat | `services/chat-service.js` | Stream de respostas, histórico por sessão |
| LLM | `services/llama-manager.js` | Gerencia subprocesso llama-server, seleção de modelo por tier (963 linhas) |
| Embeddings | `services/embedding-manager.js` | Geração de embeddings via llama.cpp |
| Semântico | `services/semantic-engine.js` | LanceDB, busca vetorial, RAG |
| Skills | `services/skill-orchestrator.js` | Descoberta e execução de skills por intenção |
| Extensões | `services/extension-platform.js` | Runtime de extensões v1 |
| Lembretes | `services/reminder-service.js` | Lembretes agendados |
| TTS | `services/tts-service.js` | Bridge para TTS no Python sidecar |

**Infraestrutura:**

| Módulo | Função |
|--------|--------|
| `config/constants.js` | Constantes de configuração (portas, diretórios, timeouts) |
| `config/tiers.js` | Configuração dos tiers de IA (Lite, Pro, Ultra) |
| `infrastructure/logger.js` | Logging estruturado |
| `infrastructure/store.js` | Persistência JSON (configurações, sessões) |
| `infrastructure/process-manager.js` | Gerenciamento de processos (llama-server) |
| `infrastructure/http-helpers.js` | Helpers HTTP |

### 3. Python Sidecar

Um serviço FastAPI enxuto dedicado exclusivamente a operações de voz. Enquanto o Node Core cuida da lógica de IA e orquestração, o Python Sidecar lida com tarefas que exigem bibliotecas Python especializadas.

**Rotas da API:**

| Rota | Método | Função |
|------|--------|--------|
| `/voice/ws` | WebSocket | Conexão real-time para broadcast de estado |
| `/voice/quick-transcribe` | POST | Grava áudio do microfone até silêncio, retorna texto transcrito |
| `/voice/stop-quick-transcribe` | POST | Interrompe gravação manualmente |
| `/voice/wake-word` | POST | Ativa/desativa wake word |
| `/voice/call-mode` | POST | Alterna modo chamada (hands-free) |
| `/chat/speak` | POST | Sintetiza texto em fala via Kokoro |
| `/chat/stop-voice` | POST | Para toda síntese de fala |

### 4. FortScript (Opcional)

Uma biblioteca Python independente que monitora processos do sistema. Quando detecta que um jogo ou aplicação pesada está rodando, ela pausa automaticamente os processos gerenciados (como treinamento de modelos ou downloads), e os retoma quando a aplicação pesada é fechada. Útil para quem quer evitar que processos de IA consumam recursos durante gameplay.

### 5. Landing Page

Site institucional da MomAI, construído com Vite + React + TypeScript + TailwindCSS. Inclui blog com posts em markdown, páginas de funcionalidades, e deploy via GitHub Pages.

## Fluxo de Dados — Chat

Quando o usuário envia uma mensagem, o caminho que ela percorre é:

```
Usuário digita mensagem no chat
       |
       v
[Renderer] --HTTP POST--> [Node Core]
       |
       v
[Semantic Engine] (classifica intenção em ms via LanceDB)
       |
       v
[Skill Orchestrator] (seleciona ferramentas relevantes via Tool RAG)
       |
       v
[LLM Manager] (envia prompt + contexto + ferramentas para llama-server)
       |
       v
[llama-server] (processa com modelo Qwen3.5 GGUF, gera resposta)
       |
       v
[Node Core] --SSE stream--> [Renderer]
                                  |
                                  v
                         Usuário vê resposta aparecendo token por token
```

Se o TTS estiver ativado, cada token também é enviado para o Python Sidecar sintetizar em áudio.

## Fluxo de Dados — Voz

Para operação mãos-livres:

```
[Microfone]
       |
       v
[Wake Word Detector] (OpenWakeWord, offline, processamento local)
       |
       v  (palavra-chave "Sistema" detectada)
[Quick Transcriber] (faster-whisper via CTranslate2)
       |
       v  (texto transcrito)
[Node Core] --LLM--> [Resposta texto]
       |                      |
       v                      v
[Python Sidecar]       [Renderer mostra texto]
  (Kokoro TTS)
       |
       v
[Resposta áudio nos alto-falantes]
```

## Decisões Arquiteturais (ADRs)

| Decisão | Escolha | Alternativa | Motivo |
|---------|---------|-------------|--------|
| LLM Runtime | llama-server via subprocesso | API externa (OpenAI) | Privacidade total dos dados, latência local |
| Embeddings | LanceDB (local) | PostgreSQL pgvector | Zero-configuração, otimizado para busca vetorial |
| TTS | Kokoro-82m (ONNX) via Python | API Cloud (Google, AWS) | Offline, qualidade alta comparável a soluções cloud |
| Orquestração de Agentes | LangGraph | CrewAI, AutoGen | Controle fino de fluxo, suporte a grafos cíclicos |
| Skill Runtime | Node.js | Python | Mesmo runtime do Electron, evita gargalo de IPC |
| Build System | pnpm + Turborepo | Nx, Lerna | Simplicidade, workspaces nativos do npm |
| Gerenciamento Python | uv | Poetry, pipenv | Velocidade (Rust), compatibilidade com pip |
| Package Manager | pnpm | npm, yarn | Disk space eficiente (hard links), workspaces nativos |

## Tiers de IA

O MomAI oferece três tiers que equilibram performance e qualidade:

| Recurso | Lite | Pro | Ultra |
|---------|------|-----|-------|
| Modelo | Qwen3.5-0.8B (Q4_K_M) | Qwen3.5-2B (Q4_K_M) | Qwen3.5-4B (Q4_K_M) |
| Contexto | 8K tokens | 8K tokens | 8K tokens |
| Max tokens resposta | 192 | 320 | 512 |
| TTS | ❌ | ✅ | ✅ |
| Wake Word | ❌ | ❌ | ✅ |
| Memória Vetorial | ❌ | ❌ | ✅ (LanceDB) |
| Embeddings | ❌ | ❌ | ✅ |

## Modelo de Concorrência

- **Node Core**: Single-threaded (Node.js), processa uma requisição por vez via event loop
- **llama-server**: Multi-slot (2 slots paralelos), permitindo concorrência limitada
- **Python Sidecar**: Async (FastAPI/uvicorn), thread pool para operações bloqueantes (TTS, STT)
- **Electron Main**: Single-threaded, usa workers para bootstrap Python

## Dados Locais

| Diretório | Conteúdo |
|-----------|----------|
| `%APPDATA%/MomAI/data/node-core-store.json` | Store principal (config, sessões, extensões) |
| `%APPDATA%/MomAI/data/notes/` | Notas do usuário |
| `%APPDATA%/MomAI/data/models/` | Modelos GGUF baixados |
| `%APPDATA%/MomAI/data/semantic/` | LanceDB (memória vetorial) |
| `%APPDATA%/MomAI/python_env/` | Virtualenv Python |
| `apps/core/momai.db` | SQLite de settings (desenvolvimento) |
