# Arquitetura

## Visão Geral (C4 Nível 1 — Contexto)

MomAI é um assistente virtual de desktop que executa LLMs **localmente** no computador do usuário. O usuário interage via interface gráfica (Electron) ou comandos de voz, e o sistema orquestra múltiplos componentes para processar a requisição.

```
[Usuário] <--> [MomAI Desktop (Electron)]
                    |
        +-----------+-----------+
        |                       |
   [Node Core]          [Python Sidecar]
   (LLM, Chat,          (STT, TTS,
    Skills, RAG)         Wake Word)
```

## Componentes (C4 Nível 2 — Containers)

### 1. MomAI Desktop (Electron)

Aplicação desktop que roda o Electron em 3 processos:

- **Main Process:** Gerencia janelas, subprocessos (node-core, Python), IPC, Tray
- **Preload:** Bridge segura entre main e renderer via `contextBridge`
- **Renderer (React):** Interface do usuário (dashboard, chat, notas, configurações)

**Portas:**
- HTTP: 8000 (node-core)
- WebSocket: 8000 (node-core)
- Python sidecar: 8001

### 2. Node Core

Backend Node.js responsável por toda a lógica de IA e orquestração:

- **Chat Service:** Stream de respostas, histórico por sessão
- **LLM Manager:** Gerencia processo `llama-server.exe`, seleção de modelo por tier
- **Semantic Engine:** Busca vetorial via LanceDB, embeddings
- **Skill Orchestrator:** Descoberta e execução de skills por intenção
- **Extension Platform:** Runtime de extensões (tools, hooks, eventos, UI)
- **Reminder Service:** Lembretes agendados
- **TTS Service:** Bridge para TTS no Python sidecar

### 3. Python Sidecar (MomAI Core)

Serviço FastAPI enxuto dedicado a operações de voz:

- **Voice API:** Wake word, call mode, quick transcribe
- **Chat Voice:** TTS bridge (Kokoro), stop voice
- **Database:** SQLite com settings, migrações automáticas

### 4. FortScript (opcional)

Ferramenta Python independente que pausa/retoma processos baseado em detecção de jogos ou uso de RAM.

## Fluxo de Dados — Chat

```
User Input (texto/voz)
    |
    v
[Renderer] --> HTTP/WS --> [Node Core]
    |                            |
    |                     [Semantic Engine]
    |                     (classifica intenção)
    |                            |
    |                     [Skill Orchestrator]
    |                     (seleciona ferramentas)
    |                            |
    |                     [LLM Manager]
    |                     (llama-server + modelo GGUF)
    |                            |
    |<-- SSE stream ------------+
    |
[Renderer] --> HTTP --> [Python Sidecar]
                    (TTS, se ativo)
```

## Fluxo de Dados — Voz

```
[Microfone]
    |
    v
[Wake Word Detector] (offline, OpenWakeWord)
    |
    v (palavra-chave detectada)
[Quick Transcriber] (Whisper via faster-whisper)
    |
    v (texto transcrito)
[Node Core] --> [LLM] --> [TTS (Kokoro)]
    |                            |
    v                            v
[Resposta texto]          [Resposta áudio]
```

## Estrutura do Monorepo

```
momai/
├── apps/
│   ├── core/                 # Python sidecar (FastAPI)
│   │   ├── api/routes/       # voice.py, chat_voice.py
│   │   ├── database/         # SQLite models + migrations
│   │   ├── services/voice/   # STT, TTS, wake word detector
│   │   └── main.py           # Entry point FastAPI
│   ├── momai/                # Electron desktop app
│   │   ├── src/main/         # Electron main process
│   │   ├── src/preload/      # Context bridge
│   │   ├── src/renderer/     # React UI
│   │   ├── scripts/node-core/# Node.js backend modular
│   │   └── scripts/skills/   # Skills runtime
│   ├── fortscript/           # Gaming mode process manager
│   └── landing-page/         # Site institucional
├── data/                     # Dados locais (extensões, notas, store)
├── docs/                     # Documentação
└── scripts/                  # Scripts root (sync_blog, etc.)
```

## Decisões Arquiteturais (ADRs)

| Decisão | Opção Escolhida | Alternativa | Motivo |
|---------|----------------|-------------|--------|
| LLM Runtime | llama-server (subprocess) | API externa | Privacidade, latência local |
| Embeddings | LanceDB local | PostgreSQL pgvector | Zero-config, embedding-first |
| TTS | Kokoro (ONNX) via Python | API cloud | Offline, qualidade alta |
| Build system | pnpm + Turbo | Nx, Lerna | Simplicidade, workspaces nativos |
| Agent orchestration | LangGraph | CrewAI, AutoGen | Controle fino de fluxo |
| Skill runtime | Node.js | Python | Mesmo runtime do Electron |

## Tiers de IA

| Recurso | Lite | Pro | Ultra |
|---------|------|-----|-------|
| Modelo | Qwen3.5-0.8B | Qwen3.5-2B | Qwen3.5-4B |
| Contexto | 8K | 8K | 8K |
| Max tokens | 192 | 320 | 512 |
| TTS | ❌ | ✅ | ✅ |
| Wake Word | ❌ | ❌ | ✅ |
| Memória Vetorial | ❌ | ❌ | ✅ (LanceDB) |
| Embeddings | ❌ | ❌ | ✅ |
