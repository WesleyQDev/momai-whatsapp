# Documentação Completa do MomAIOS

## 1. Visão Geral do Projeto

### O que é o MomAIOS

MomAIOS é o monorepo que abriga o **MomAI**, um assistente virtual de desktop que combina a inteligência de Modelos de Linguagem de Grande Escala (LLMs) com a capacidade de executar ações reais no computador do usuário. Diferente de assistentes como Alexa, Google Assistant ou Siri, o MomAI foi projetado desde o início com um princípio fundamental: **privacidade em primeiro lugar**. Todo o processamento — desde a detecção da palavra de ativação até a geração de respostas em texto e fala — acontece localmente na máquina do usuário.

O projeto é mantido por **WesleyQDev** e está licenciado sob uma **licença proprietária**. A reprodução, distribuição e modificação são restritas conforme os termos da licença.

### Público-Alvo

O MomAI é direcionado a:
- **Usuários preocupados com privacidade**: Que não querem que seus dados de voz e conversas sejam enviados para servidores cloud
- **Desenvolvedores**: Que podem estender o assistente com novas capacidades através do sistema de extensões
- **Entusiastas de IA**: Que querem executar modelos de linguagem localmente em seus próprios computadores
- **Usuários de PC em geral**: Que buscam uma assistente virtual que vai além do básico, com integração a notas, lembretes, pesquisa web e ações no sistema

### Filosofia de Design

O MomAI foi construído sobre três pilares:

1. **Local-first**: Tudo roda localmente. Nenhum dado sai da máquina do usuário sem permissão explícita (como pesquisa web).
2. **Extensível**: O sistema de extensões permite que qualquer pessoa adicione novas capacidades — desde ferramentas simples para o LLM até interfaces completas na barra lateral.
3. **Modular**: A arquitetura de microsserviços (com Node Core e Python Sidecar separados) permite que cada componente evolua independentemente.

### Arquitetura Geral

O MomAIOS é organizado como um **monorepo** gerenciado por **pnpm workspaces** e **Turborepo**. Isso significa que múltiplos aplicativos e bibliotecas vivem no mesmo repositório, compartilhando configurações de build, lint e teste, mas cada um com seu próprio ciclo de vida e dependências.

```
+------------------------------------------------------------------+
|                     MomAIOS Monorepo                              |
|                                                                   |
|  +------------------+  +------------------+  +-----------------+  |
|  |   MomAI Desktop  |  |  Node Core (JS)  |  | Python Sidecar  |  |
|  |  (Electron+React)|  |  (LLM, Skills,   |  |  (STT, TTS,     |  |
|  |   Interface GUI) |  |   RAG, Chat)     |  |   Wake Word)    |  |
|  +--------+---------+  +--------+---------+  +--------+--------+  |
|           |                     |                       |          |
|           |                     |                       |          |
|  +--------+---------+  +--------+---------+             |          |
|  |   FortScript      |  |  Landing Page   |             |          |
|  |  (Gaming Mode)    |  |  (Site Instit.) |             |          |
|  +------------------+  +------------------+             |          |
|                                                         |          |
|  +------------------------------------------------------+          |
|  |           llama-server (subprocesso LLM)                       |
|  |           Modelos Qwen3.5 GGUF (0.8B, 2B, 4B)                |
|  +----------------------------------------------------------------+
```

A comunicação entre os componentes acontece da seguinte forma:

- **Electron Main Process** inicia e gerencia tanto o Node Core quanto o Python Sidecar como subprocessos
- **Node Core** (porta 8000) é o cérebro da IA: gerencia o LLM, skills, RAG semântico e chat
- **Python Sidecar** (porta 8001) lida exclusivamente com áudio: transcrição (STT), síntese de fala (TTS) e detecção de palavra de ativação
- **llama-server** (porta 8080) é o processo que realmente carrega o modelo GGUF e executa as inferências
- O **Renderer** (React) se comunica com o Node Core via HTTP e SSE streaming para respostas em tempo real
- O **Renderer** se comunica com o Python Sidecar via HTTP e WebSocket para operações de voz

## 2. Tecnologias e Stack

### Tabela Completa de Tecnologias

| Tecnologia | Versão | App | Propósito |
|------------|--------|-----|-----------|
| Electron | 39.x | Desktop | Container desktop multiplataforma |
| React | 19.x | Desktop, Landing | Biblioteca de interface do usuário |
| TypeScript | 5.9.x | Desktop, Landing | Type safety para JavaScript |
| TailwindCSS | 3.4.x | Desktop, Landing | Estilização utility-first |
| Vite | 7.x | Desktop, Landing | Bundler e dev server |
| electron-vite | 5.x | Desktop | Bundling específico para Electron |
| electron-builder | 26.x | Desktop | Packaging (NSIS, AppImage, DMG, AppX) |
| Vitest | 4.x | Desktop | Testes unitários |
| React Router DOM | 7.x | Desktop, Landing | Roteamento SPA |
| CodeMirror | 6.x | Desktop | Editor de markdown nas notas |
| Heroicons | 2.x | Desktop | Ícones |
| Lucide React | 1.x | Desktop | Ícones adicionais |
| Axios | 1.x | Desktop | Cliente HTTP |
| react-markdown | 10.x | Desktop | Renderização de markdown |
| react-force-graph-2d | 1.x | Desktop | Visualização de grafos interativa |
| LangGraph | 1.2.x | Node Core | Orquestração de agentes (grafos de estados) |
| LangChain Core | 1.1.x | Node Core | Framework de LLM |
| LanceDB | 0.27.x | Node Core | Banco de dados vetorial local (embedded) |
| Zod | 4.x | Node Core | Validação de schemas |
| edge-tts-universal | 1.4.x | Desktop | TTS via Edge cloud (fallback) |
| say.js | 0.16.x | Desktop | TTS local do sistema (fallback) |
| electron-updater | 6.8.x | Desktop | Auto-update via GitHub Releases |
| electron-log | 5.x | Desktop | Logging estruturado |
| ws | 8.x | Desktop, Node Core | WebSocket |
| Python | 3.12+ | Core | Runtime do sidecar de voz |
| FastAPI | 0.128+ | Core | Framework web assíncrono |
| uvicorn | - | Core | Servidor ASGI |
| faster-whisper | 1.2.x | Core | Transcrição de áudio (STT) via CTranslate2 |
| kokoro-onnx | 0.5+ | Core | Síntese de fala (TTS) via ONNX |
| onnxruntime | 1.20+ | Core | Runtime ONNX |
| ctranslate2 | 4.4.x | Core | Runtime CTranslate2 para Whisper |
| SQLAlchemy | 2.0+ | Core | ORM para SQLite |
| sounddevice | 0.5+ | Core | Captura de áudio |
| huggingface-hub | 1.3+ | Core | Download de modelos |
| httpx | 0.28+ | Core | Cliente HTTP assíncrono |
| psutil | 7.2+ | Core, FortScript | Monitoramento de processos |
| python-dotenv | 1.0+ | Core | Config de ambiente |
| numpy | 2.3+ | Core | Computação numérica |
| rapidfuzz | 3.14+ | Core | Fuzzy string matching |
| pnpm | 10.28 | Root | Gerenciador de pacotes |
| Turborepo | 2.7 | Root | Build system (monorepo) |
| concurrently | 9.x | Root | Execução paralela de comandos |

### Por que Cada Tecnologia Foi Escolhida

**Electron** foi escolhido como container desktop porque permite que uma base de código React/TypeScript rode em Windows, Linux e macOS sem modificações. Sua maturidade (mais de uma década de existência) garante estabilidade e uma vasta ecossistema de ferramentas como electron-builder e electron-updater.

**pnpm + Turborepo** formam a espinha dorsal do monorepo. pnpm foi escolhido sobre npm e yarn por seu uso eficiente de disk space (hard links) e workspaces nativos. Turborepo adiciona cache inteligente de build, paralelismo e dependências entre tarefas.

**LanceDB** é o banco vetorial escolhido para memória semântica. Diferente de soluções como Pinecone (cloud) ou pgvector (requer PostgreSQL), o LanceDB roda embedded (dentro do processo Node.js), não requer configuração de servidor, e é otimizado especificamente para busca vetorial. Isso é ideal para um aplicativo local-first onde o usuário não quer gerenciar bancos de dados.

**LangGraph** (da LangChain) foi escolhido para orquestração de agentes porque oferece controle fino sobre fluxos de conversação. Diferente de abordagens mais simples como cadeias lineares (chains), o LangGraph permite grafos cíclicos, estados compartilhados entre passos, e branchings condicionais — essencial para um assistente que precisa decidir entre múltiplas skills, ferramentas e modos de operação.

**Kokoro-82m** como engine TTS roda via ONNX Runtime, o que significa que pode ser executado em CPU sem necessidade de GPU. Sua qualidade de voz é comparável a soluções cloud como Google Cloud TTS ou AWS Polly, mas roda 100% local.

**faster-whisper** (baseado em CTranslate2) foi escolhido sobre whisper.cpp para STT porque oferece melhor performance em CPU graças à otimização CTranslate2, que é significativamente mais rápido que a implementação original do Whisper.

**uv** como gerenciador Python foi escolhido sobre Poetry, pipenv ou conda por sua velocidade (escrito em Rust), compatibilidade com pip (pode ler pyproject.toml e requirements.txt), e instalação simplificada.

## 3. Decisões Técnicas Importantes

### Decisão 1: LLM Local vs Cloud

**Problema**: Como fornecer inteligência de LLM sem comprometer a privacidade do usuário?

**Alternativas consideradas**:
- API OpenAI/Anthropic (cloud, fácil, mas dados vão para servidores externos)
- llama.cpp via subprocesso (local, complexo, mas privado)
- ONNX Runtime com modelos convertidos (local, mas perda de compatibilidade)

**Escolha**: llama.cpp via subprocesso (`llama-server.exe`)

**Motivo**: O llama-server é um executável maduro que implementa a API compatível com OpenAI, o que significa que o Node Core pode usar a mesma interface que usaria para chamar a API da OpenAI, mas apontando para `localhost:8080`. Isso permite que o código trate LLM local e cloud de forma intercambiável. Além disso, o llama.cpp suporta uma vasta gama de modelos GGUF e aceleração GPU via CUDA, Vulkan e Metal.

**Trade-offs**: Requer download de modelos (1-4 GB cada), consome RAM/VRAM significativa, e a qualidade dos modelos menores (0.8B-4B) é inferior a modelos cloud como GPT-4. No entanto, para um assistente local-first, é a escolha que melhor equilibra privacidade, performance e qualidade.

### Decisão 2: Node.js vs Python para Orquestração

**Problema**: O Node Core (orquestração de agentes) poderia ser em Python, já que a maioria dos frameworks de IA são Python.

**Alternativas**: 
- Python + LangChain (ecossistema de IA mais rico)
- Node.js + LangChain (mesmo runtime do Electron)
- Rust (performance, mas complexidade alta)

**Escolha**: Node.js

**Motivo**: Como o Node Core roda como subprocesso do Electron, usar Node.js elimina a necessidade de bridges IPC complexas entre runtimes diferentes. O LangChain tem suporte completo a Node.js, e bibliotecas como LanceDB também têm bindings nativos. A comunicação entre o renderer e o Node Core é direta via HTTP (mesma porta), sem necessidade de serialização entre runtimes.

**Trade-offs**: O ecossistema de IA em Node.js é menos maduro que em Python. Algumas bibliotecas (como Kokoro TTS, faster-whisper) não têm equivalentes Node.js, daí a necessidade do Python Sidecar como componente separado.

### Decisão 3: Sidecar Python para Voz

**Problema**: STT e TTS exigem bibliotecas Python especializadas sem equivalentes Node.js maduros.

**Alternativas**: 
- Executar Python inline no Node.js (via python-shell ou similar)
- Sidecar separado com comunicação HTTP
- Usar APIs cloud de STT/TTS

**Escolha**: Sidecar Python separado com FastAPI

**Motivo**: Executar Python inline no Node.js é frágil e difícil de debugar. Um sidecar separado com FastAPI oferece isolamento de processo, pode ser reiniciado independentemente, e permite comunicação padronizada via HTTP/WebSocket. Além disso, o Python Sidecar é enxuto (apenas ~900 linhas de código) e tem responsabilidade única: operações de voz.

**Trade-offs**: Complexidade adicional de gerenciar dois subprocessos, latência de comunicação HTTP entre processos, e maior consumo de memória. No entanto, a separação clara de responsabilidades e a facilidade de manutenção compensam esses custos.

### Decisão 4: Sistema de Tiers (Lite, Pro, Ultra)

**Problema**: Modelos maiores oferecem melhor qualidade mas consomem mais recursos. Como oferecer flexibilidade?

**Alternativas**:
- Modelo único (simples, mas não atende a todos os hardware)
- Tiers progressivos (mais complexo, mas adaptável)
- Download automático baseado em hardware detectado

**Escolha**: Tiers progressivos com configuração explícita

**Motivo**: Os tiers permitem que o usuário escolha entre performance (Lite: 0.8B, 192 tokens, sem TTS) e qualidade (Ultra: 4B, 512 tokens, TTS + wake word + memória vetorial). Isso é essencial porque um laptop com 8GB de RAM não consegue rodar o mesmo modelo que um desktop com 32GB. A configuração em `ai_tiers.json` torna fácil adicionar novos tiers ou modelos no futuro.

**Trade-offs**: Usuários podem não entender a diferença entre tiers. A configuração padrão (Pro) é um bom meio-termo, mas alguns usuários podem querer mais controle granular.

### Decisão 5: pnpm + Turborepo

**Problema**: Como gerenciar múltiplos apps (Electron, Python, Landing Page) com dependências compartilhadas?

**Alternativas**: Nx, Lerna, Bazel, ou repos separados

**Escolha**: pnpm workspaces + Turborepo

**Motivo**: pnpm oferece workspaces nativos sem plugins adicionais, e seu sistema de hard links economiza disk space significativamente (todas as apps compartilham o mesmo `node_modules` no nível do monorepo). Turborepo adiciona cache de build, paralelismo, e dependências entre tarefas sem a complexidade do Nx.

**Trade-offs**: Menos flexível que Nx para configurações complexas de build. A configuração de Turborepo é mais simples, o que é uma vantagem para um projeto deste porte.

## 4. Estrutura de Diretórios

### Árvore Comentada

```
momai/
|
+-- apps/                              # Aplicações do monorepo
|   +-- core/                          # Python Sidecar (STT, TTS, Wake Word)
|   |   +-- api/routes/                # Rotas FastAPI (voice.py, chat_voice.py)
|   |   +-- database/                  # SQLite + SQLAlchemy (settings)
|   |   +-- services/voice/            # tts.py, detector.py, quick_transcriber.py
|   |   +-- main.py                    # Entry point FastAPI
|   |   +-- startup.py                 # Lifespan, init, prewarm
|   |   +-- app_state.py               # Estado global (WebSockets, TTS)
|   |   +-- runtime.py                 # Logging, patches, UTF-8
|   |   +-- ai_tiers.json              # Config tiers (Qwen3.5 modelos)
|   |   +-- pyproject.toml             # Dependências Python
|   |   +-- uv.lock                    # Lock file uv
|   |
|   +-- fortscript/                    # Gaming mode process manager
|   |   +-- src/fortscript/            # Código fonte Python
|   |   +-- pyproject.toml             # Dependências (psutil, pydantic, rich)
|   |   +-- README.md                  # Documentação da lib
|   |
|   +-- landing-page/                  # Site institucional
|   |   +-- src/pages/                 # Páginas (Home, Blog, Features)
|   |   +-- src/content/               # Blog posts em markdown
|   |   +-- src/components/            # Componentes React
|   |   +-- src/locales/               # pt-BR, en-US
|   |   +-- vite.config.ts             # Config Vite
|   |   +-- tailwind.config.js         # Config Tailwind
|   |
|   +-- momai/                         # Desktop App (Electron + React)
|   |   +-- src/
|   |   |   +-- main/                  # Electron Main Process
|   |   |   |   +-- index.ts           # Entry point
|   |   |   |   +-- windowManager.ts   # Janelas, atalhos
|   |   |   |   +-- coreManager.ts     # Gerencia Node Core subprocesso
|   |   |   |   +-- pythonManager.ts   # Gerencia Python sidecar
|   |   |   |   +-- python/            # Bootstrap Python (12 arquivos)
|   |   |   |   +-- ttsService.ts      # TTS bridge
|   |   |   |   +-- notesService.ts    # Serviço de notas
|   |   |   |   +-- updater.ts         # Auto-update
|   |   |   |   +-- state.ts           # Estado global
|   |   |   |   +-- logger.ts          # Logging
|   |   |   +-- preload/               # Bridge segura (contextBridge)
|   |   |   +-- renderer/src/          # React SPA
|   |   |       +-- components/chat/   # 25 componentes de chat
|   |   |       +-- features/          # Módulos refatorados
|   |   |       +-- hooks/             # 27 custom hooks
|   |   |       +-- services/          # api.ts (SSE), ttsService.ts
|   |   |       +-- views/             # 5 views (About, Extensions, etc.)
|   |   |       +-- i18n/              # pt-BR, en-US
|   |   +-- scripts/
|   |   |   +-- node-core.js           # Entry point Node Core
|   |   |   +-- node-core/             # Módulos Node Core
|   |   |   |   +-- api/routes/        # Rotas HTTP
|   |   |   |   +-- config/            # Constantes, tiers
|   |   |   |   +-- infrastructure/    # Logger, store, process manager
|   |   |   |   +-- services/          # Chat, LLM, skills, embeddings, TTS
|   |   |   +-- skills/                # Plataforma de skills
|   |   |   |   +-- core/              # Skills built-in (weather, search, memory, scheduler)
|   |   |   |   +-- packaged/          # Skills empacotadas (dev, launcher)
|   |   |   |   +-- registry.js        # Skill Registry (621 linhas)
|   |   |   +-- hydrate-bin.ps1/sh     # Download binários
|   |   +-- electron-builder.yml        # Config packaging
|   |   +-- electron.vite.config.ts     # Config Vite + Electron
|   |   +-- package.json                # Dependências
|   |
|   +-- momai-promo-video/             # Vídeo promocional (Remotion)
|       +-- src/                        # Componentes Remotion
|       +-- package.json                # Remotion 4.0
|
+-- scripts/                           # Scripts raiz do monorepo
|   +-- sync_blog.py                    # Sincroniza posts do blog
|   +-- sync-gh-pages.js               # Sincroniza GitHub Pages
|   +-- open-build-dir.js               # Abre diretório de build
|
+-- docs/                              # Documentação técnica
|   +-- architecture.md                 # Arquitetura e ADRs
|   +-- development.md                  # Guia de desenvolvimento
|   +-- extensions.md                   # Plataforma de extensões
|   +-- apps/                           # Docs por app
|   +-- guides/                         # Guias (CI/CD, Graphify)
|
+-- .github/workflows/                  # GitHub Actions
|   +-- ci.yml                          # Lint + Typecheck
|   +-- release.yml                     # Build + Release (Win/Linux)
|   +-- deploy-landing.yml              # Deploy landing page
|
+-- package.json                        # Root package.json (pnpm workspace)
+-- pnpm-workspace.yaml                 # Config workspaces
+-- turbo.json                          # Config Turborepo
+-- pyproject.toml                      # Root Python config
```

## 5. Principais Funcionalidades e Fluxos

### Pipeline de Voz (Wake Word → STT → LLM → TTS)

O pipeline de voz é uma das funcionalidades mais complexas do MomAI, envolvendo todos os componentes do sistema:

```
[Microfone captura áudio continuamente]
        |
        v
[OpenWakeWord Detector] (roda no Python Sidecar, 100% offline)
   Detecta a palavra-chave "Sistema" (ou "Luna", "Computador")
        |
        v (evento de wake word detectado)
[Python Sidecar] inicia gravação do microfone
        |
        v (usuário fala o comando)
[quick_transcriber.py] (faster-whisper via CTranslate2)
   - Grava até detectar silêncio
   - Transcreve áudio para texto
        |
        v (texto transcrito)
[app_state.py] process_voice_command()
   - Envia texto para Node Core via HTTP POST /chat/voice-command
        |
        v
[Node Core] processa o comando de voz
   - Roteia para o LLM (llama-server)
   - Gera resposta
        |
        +----> [Renderer] exibe texto na tela (streaming SSE)
        |
        v (se TTS ativado e tier >= Pro)
[Node Core] envia resposta para Python Sidecar /chat/speak
        |
        v
[Kokoro TTS] (ONNX Runtime)
   - Sintetiza fala a partir do texto
   - Toca nos alto-falantes
        |
        v
[Usuário ouve resposta]
```

**Detalhes importantes do pipeline**:

- A wake word é detectada em **menos de 100ms** e consome ~200MB de RAM
- A transcrição (STT) usa **faster-whisper** que é ~4x mais rápido que whisper.cpp em CPU
- O TTS tem **pre-warm** (inicializado em background no startup) para reduzir latência da primeira resposta
- O **call mode** mantém o microfone ativo sem necessidade de wake word, permitindo conversação contínua
- Há uma **cadeia de fallback** para TTS: Kokoro → Edge TTS → Say.js

### Fluxo de Respostas Estruturadas (Structured Skill Responses)

Este sistema permite que skills retornem componentes de interface ricos em vez de texto plano:

```
[Skill runtime.js (ex: weather)]
        |
        v
return {
  tool: 'get_weather',
  structuredResponse: {
    type: 'weather',
    data: {
      location: 'São Paulo',
      current: { condition: 'Ensolarado', temp: '28°C' },
      forecast: [ ... 7 dias ... ]
    }
  }
}
        |
        v
[Node Core] serializa como JSON e envia via SSE
   Evento: { type: 'structured_response', data: { type: 'weather', ... } }
        |
        v
[Renderer] api.ts processa o evento SSE
   Chama callback onStructuredResponse
        |
        v
[StructuredResponseRenderer.tsx]
   Busca o renderizador registrado para o tipo 'weather'
   no SkillResponseRegistry
        |
        v
[WeatherCard.tsx] renderiza o card visual
   - Mostra localização, temperatura atual, condição (com emoji)
   - Previsão para 7 dias em scroll horizontal
   - Design escuro consistente com o tema do app
```

**Vantagens**:
- Experiência muito mais rica que texto markdown
- Componentes podem ter interatividade (botões, scroll, gráficos)
- Fácil de estender: qualquer skill pode criar um novo tipo de resposta
- O registro é centralizado em `SkillResponseRegistry.ts` e pode ser estendido com `registerRenderer()`

### Sistema de Extensões

O MomAI suporta três tipos de extensões, cada um com seu próprio caso de uso:

**1. Skills Built-in (Core)**
São skills nativas incluídas no instalador, localizadas em `scripts/skills/core/`. Elas rodam no mesmo processo do Node Core (sem overhead de isolamento) e são carregadas automaticamente.

**2. Skills Packaged**
Skills empacotadas em `scripts/skills/packaged/`, pré-instaladas mas executadas em host isolado. Atualmente inclui Dev (execução de código) e Launcher.

**3. Extensions (Usuário)**
Instaladas pelo usuário via loja de extensões (`ExtensionsView.tsx`), registradas em `data/extensions/`. Executadas em host isolado com sistema de permissões.

**Fluxo de instalação de uma extensão**:
1. Usuário encontra extensão na loja (dados de `community-extensions.json`)
2. Clica em "Instalar"
3. Sistema baixa o zip do GitHub
4. Extrai para `data/extensions/<id>/`
5. Verifica permissões declaradas no `manifest.json`
6. Calcula nível de risco (low, medium, high)
7. Exibe permissões para o usuário confirmar
8. Executa hook `onInstall` se existir
9. Adiciona entrada na sidebar (se configurado)
10. Skill fica disponível para o LLM via Tool RAG

### Modo Chamada (Call Mode)

O call mode é um modo mãos-livres onde o usuário pode conversar com o MomAI sem precisar digitar ou ativar por wake word a cada interação:

1. Usuário ativa call mode (atalho de teclado ou UI)
2. Wake word detector continua rodando mas sem filtro de keyword — qualquer fala é processada
3. Microfone fica continuamente ativo
4. A cada detecção de fala → STT → LLM → TTS (loop contínuo)
5. Uma janela overlay transparente mostra o texto em tempo real
6. Call mode é desativado quando o usuário diz "tchau" ou desativa manualmente

## 6. Guia de Desenvolvimento

### Setup do Ambiente

```bash
# Pré-requisitos
# - Node.js 20+
# - pnpm 9+ (npm install -g pnpm)
# - Python 3.12+
# - Git

# Clone
git clone https://github.com/WesleyQDev/MomAI.git
cd MomAI

# Instalar dependências
pnpm install

# Iniciar desenvolvimento completo
pnpm dev:all
```

O script `ensure-dev-binaries.js` baixará automaticamente:
- `llama-server.exe` (ou binário Linux/macOS)
- Python bundlado (para Windows) ou sistema Python
- `uv` (gerenciador Python)

### Comandos Essenciais

| Comando | Descrição |
|---------|-----------|
| `pnpm dev:all` | Desktop + Core simultâneos |
| `pnpm dev:core` | Apenas o Python backend |
| `pnpm --filter momai dev` | Apenas o desktop app |
| `pnpm build` | Build completo |
| `pnpm build:win` | Build Windows .exe |
| `pnpm lint` | Lint de todas as apps |
| `pnpm typecheck` | TypeScript check |
| `pnpm test` | Testes |
| `pnpm format` | Prettier |

### Convenções de Código

**TypeScript/React**:
- Componentes: PascalCase (`WeatherCard.tsx`)
- Hooks: use + camelCase (`useAudioRecorder.ts`)
- Utilitários: camelCase (`formatTime.ts`)
- Constantes: UPPER_SNAKE_CASE
- Arquivos: kebab-case para utils
- Testes: `.test.ts` ao lado do arquivo

**Python**:
- PEP 8, type hints obrigatórios
- async/await para I/O
- snake_case para funções
- PascalCase para classes
- FastAPI: schemas Pydantic, Depends() para DI

### Testes

```bash
# Desktop
cd apps/momai
pnpm test              # Vitest (todos)
pnpm test:renderer     # Testes React
pnpm test:main         # Testes Node/preload

# Core
cd apps/core
pnpm test              # pytest
```

### Build e Release

O processo de release é semi-automatizado via GitHub Actions:
1. Crie uma tag `v1.2.3` no git
2. O CI detecta a tag e dispara o workflow de release
3. Build para Windows e Linux em paralelo
4. Wheels Python são pré-compiladas durante o build
5. Release é publicado no repositório público `WesleyQDev/MomAI-App`

## 7. Dependências e Bibliotecas

### Dependências Críticas do Desktop (apps/momai/package.json)

| Biblioteca | Versão | Propósito | Crítica? |
|------------|--------|-----------|----------|
| electron | 39.x | Container desktop | ✅ Essencial |
| react | 19.x | Interface do usuário | ✅ Essencial |
| @lancedb/lancedb | 0.27.x | Banco vetorial local | ✅ Essencial |
| @langchain/core | 1.1.x | Framework LLM | ✅ Essencial |
| @langchain/langgraph | 1.2.x | Orquestração de agentes | ✅ Essencial |
| @langchain/openai | 1.4.x | Interface compatível OpenAI | ✅ Essencial |
| axios | 1.x | Cliente HTTP | ✅ Essencial |
| react-router-dom | 7.x | Roteamento | ✅ Essencial |
| electron-updater | 6.8.x | Auto-update | ✅ Essencial |
| ws | 8.x | WebSocket | ✅ Essencial |
| edge-tts-universal | 1.4.x | TTS fallback | ⚠️ Importante |
| say.js | 0.16.x | TTS local fallback | ⚠️ Importante |
| zod | 4.x | Validação de schemas | 🔧 Utilitário |
| react-markdown | 10.x | Renderização markdown | 🔧 Utilitário |
| @codemirror/view | 6.x | Editor de notas | 🔧 Utilitário |
| @uiw/react-codemirror | 4.x | Editor de notas (React) | 🔧 Utilitário |
| @heroicons/react | 2.x | Ícones | 🎨 UI |
| lucide-react | 1.x | Ícones | 🎨 UI |
| react-force-graph-2d | 1.x | Visualização de grafos | 🔧 Utilitário |

### Dependências Críticas do Core (apps/core/pyproject.toml)

| Biblioteca | Versão | Propósito | Crítica? |
|------------|--------|-----------|----------|
| fastapi | 0.128+ | Framework web | ✅ Essencial |
| faster-whisper | 1.2.x | STT (transcrição) | ✅ Essencial |
| kokoro-onnx | 0.5+ | TTS (síntese de fala) | ✅ Essencial |
| onnxruntime | 1.20+ | Runtime ONNX | ✅ Essencial |
| ctranslate2 | 4.4.x | Runtime Whisper | ✅ Essencial |
| sounddevice | 0.5+ | Captura de áudio | ✅ Essencial |
| sqlalchemy | 2.0+ | ORM | ✅ Essencial |
| huggingface-hub | 1.3+ | Download de modelos | ✅ Essencial |
| httpx | 0.28+ | Cliente HTTP async | ⚠️ Importante |
| numpy | 2.3+ | Computação numérica | ⚠️ Importante |
| psutil | 7.2+ | Monitoramento | ⚠️ Importante |
| python-dotenv | 1.0+ | Config de ambiente | 🔧 Utilitário |
| rapidfuzz | 3.14+ | Fuzzy matching | 🔧 Utilitário |

## 8. Configuração e Ambiente

### Variáveis de Ambiente

**Desktop (apps/momai/.env)**:

| Variável | Default | Descrição |
|----------|---------|-----------|
| `API_URL` | `http://127.0.0.1:8000` | URL do Node Core |
| `MOMAI_NODE_CORE_HOST` | `127.0.0.1` | Host do Node Core |
| `MOMAI_NODE_CORE_PORT` | `8000` | Porta do Node Core |
| `MOMAI_PYTHON_SIDECAR_HOST` | `127.0.0.1` | Host do Python Sidecar |
| `MOMAI_PYTHON_SIDECAR_PORT` | `8001` | Porta do Python Sidecar |
| `MOMAI_LLAMA_PORT` | `8080` | Porta do llama-server |
| `MOMAI_EMBEDDING_PORT` | `8081` | Porta do servidor de embeddings |
| `MOMAI_MODELS_DIR` | `apps/core/models/` | Diretório de modelos GGUF |
| `MOMAI_CORE_PATH` | `apps/core/` | Caminho do Core Python |
| `MOMAI_DEBUG` | `false` | Modo debug |
| `MOMAI_LLAMA_BIN_PATH` | - | Caminho customizado do llama-server |
| `MOMAI_NODE_CORE_DATA_DIR` | `data/` | Diretório de dados do Node Core |
| `MOMAI_MODEL_DOWNLOAD_TIMEOUT_MS` | `900000` | Timeout download de modelos (15min) |

**Core (apps/core/.env)**:

| Variável | Default | Descrição |
|----------|---------|-----------|
| `HOST` | `127.0.0.1` | Host do servidor |
| `PORT` | `8000` | Porta do servidor |
| `MOMAI_DEBUG` | `false` | Modo debug (uvicorn --reload) |
| `LOG_LEVEL` | `info` | Nível de logging |
| `TUI_LOGS` | `false` | Interface TUI para logs |
| `MOMAI_NODE_CORE_HOST` | `127.0.0.1` | Host do Node Core para voice commands |
| `MOMAI_NODE_CORE_PORT` | `8000` | Porta do Node Core |

### Arquivos de Configuração

| Arquivo | Propósito |
|---------|-----------|
| `apps/momai/electron-builder.yml` | Configuração de packaging (NSIS, AppX, DMG) |
| `apps/momai/electron.vite.config.ts` | Configuração Vite para Electron |
| `apps/momai/tailwind.config.js` | Tema TailwindCSS |
| `apps/momai/postcss.config.cjs` | Config PostCSS |
| `apps/momai/tsconfig.json` | TypeScript config raiz |
| `apps/momai/vitest.config.ts` | Config Vitest |
| `apps/momai/eslint.config.mjs` | Config ESLint |
| `apps/momai/.prettierrc.yaml` | Config Prettier |
| `turbo.json` | Config Turborepo (raiz) |
| `pnpm-workspace.yaml` | Workspaces pnpm (raiz) |
| `apps/core/ai_tiers.json` | Config de modelos e tiers de IA |
| `apps/core/pyproject.toml` | Dependências Python |
| `apps/core/.env` | Variáveis de ambiente do Core |

### CI/CD Pipeline (GitHub Actions)

O projeto tem três workflows configurados:

**CI (ci.yml)**:
- Trigger: push/PR para main/develop
- Ações: lint + typecheck do desktop app
- Ambiente: ubuntu-latest

**Release (release.yml)**:
- Trigger: tags v*.* ou workflow_dispatch
- Jobs paralelos: build-win + build-linux
- Após ambos: cria/atualiza GitHub Release no repositório público WesleyQDev/MomAI-App
- Inclui: .exe (NSIS), .AppImage, .deb, arquivos de atualização (.yml, .blockmap)

**Deploy Landing Page (deploy-landing.yml)**:
- Trigger: push em main com mudanças em apps/landing-page/**
- Ações: build + deploy para GitHub Pages

## Glossário

| Termo | Significado |
|-------|-------------|
| LLM | Large Language Model (Modelo de Linguagem de Grande Porte) |
| STT | Speech-to-Text (Fala para Texto) |
| TTS | Text-to-Speech (Texto para Fala) |
| RAG | Retrieval-Augmented Generation (Geração Aumentada por Recuperação) |
| SSE | Server-Sent Events (Eventos Enviados pelo Servidor) |
| WS | WebSocket |
| GGUF | Formato de arquivo de modelo para llama.cpp |
| ONNX | Open Neural Network Exchange (formato de modelo aberto) |
| Tier | Nível de serviço (Lite, Pro, Ultra) |
| Sidecar | Processo auxiliar que roda junto com o principal |
| Wake Word | Palavra de ativação (ex: "Sistema") |
| Embedding | Representação vetorial de texto para busca semântica |
| LangGraph | Framework para orquestração de agentes em grafo |
| Monorepo | Repositório único contendo múltiplos projetos |
