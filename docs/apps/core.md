# MomAI Core (Python Sidecar)

## Visão Geral

O MomAI Core é um serviço FastAPI escrito em Python que funciona como um **sidecar** dedicado exclusivamente a operações de voz. Enquanto o Node Core (JavaScript) cuida da lógica de IA e orquestração de agentes, o Python Sidecar gerencia tarefas que dependem de bibliotecas Python especializadas: reconhecimento de fala (STT), síntese de fala (TTS), e detecção de palavra de ativação (wake word).

A separação existe por razões práticas: bibliotecas como `faster-whisper` (STT), `kokoro-onnx` (TTS) e `openwakeword` são bibliotecas Python que não têm equivalentes maduros no ecossistema Node.js. Em vez de tentar executá-las no mesmo processo do Node Core (o que exigiria bridges complexas), o MomAI as executa em um processo Python separado que se comunica via HTTP e WebSocket.

## Stack Tecnológica

| Tecnologia | Versão | Propósito |
|------------|--------|-----------|
| Python | 3.12+ | Runtime principal |
| FastAPI | 0.128+ | Framework web (assíncrono) |
| uvicorn | - | Servidor ASGI |
| faster-whisper | 1.2.x | Transcrição de áudio (STT) via CTranslate2 |
| kokoro-onnx | 0.5+ | Síntese de fala (TTS) via ONNX Runtime |
| onnxruntime | 1.20+ | Runtime ONNX para Kokoro |
| ctranslate2 | 4.4.x | Runtime CTranslate2 para Whisper |
| OpenWakeWord | - | Detecção de palavra de ativação |
| SQLAlchemy | 2.0+ | ORM para SQLite |
| sounddevice | 0.5+ | Captura de áudio do microfone |
| huggingface-hub | 1.3+ | Download de modelos |
| httpx | 0.28+ | Cliente HTTP assíncrono |
| psutil | 7.2+ | Monitoramento de processos |

## Arquitetura

```
[Electron Main Process]
       |
       | HTTP + WebSocket
       v
[Python Sidecar - porta 8001]
       |
       |--- API Layer (voice routes, chat voice routes)
       |--- Voice Layer (detector, transcriber, TTS engine)
       |--- Data Layer (SQLite via SQLAlchemy)
```

## Estrutura de Diretórios

```
apps/core/
├── api/
│   ├── __init__.py
│   ├── router.py              # Configura o APIRouter e registra rotas
│   ├── deps.py                # Dependências injetáveis do FastAPI
│   └── routes/
│       ├── __init__.py
│       ├── voice.py            # Rotas de voz (254 linhas)
│       └── chat_voice.py       # Rotas de TTS para o chat
├── database/
│   ├── __init__.py
│   └── models.py               # Modelos SQLAlchemy + migração automática
├── services/
│   ├── __init__.py
│   └── voice/
│       ├── __init__.py
│       ├── tts.py               # Motor Kokoro TTS
│       ├── detector.py          # Detector de wake word (OpenWakeWord)
│       ├── quick_transcriber.py # Transcrição rápida (faster-whisper)
│       └── models/              # Modelos de voz baixados
├── utils/
│   ├── visual_logger.py
│   └── tui_logger.py
├── main.py                      # Ponto de entrada FastAPI
├── startup.py                   # Lifespan, init, prewarm TTS (111 linhas)
├── app_state.py                 # Estado global (243 linhas)
├── runtime.py                   # Config logging, UTF-8, patches (127 linhas)
├── ai_tiers.json                # Configuração de modelos e tiers
├── pyproject.toml               # Dependências Python
└── package.json                 # Scripts pnpm (dev, test)
```

## API Endpoints

### Voz

| Rota | Método | Descrição |
|------|--------|-----------|
| `/voice/ws` | WebSocket | Conexão real-time para broadcast de estado de inicialização |
| `/voice/quick-transcribe` | POST | Grava áudio do microfone até silêncio, retorna texto |
| `/voice/stop-quick-transcribe` | POST | Interrompe gravação manualmente |
| `/voice/wake-word` | POST | Ativa/desativa wake word |
| `/voice/call-mode` | POST | Alterna modo chamada (hands-free) |

### Chat Voice

| Rota | Método | Descrição |
|------|--------|-----------|
| `/chat/speak` | POST | Sintetiza texto em fala via Kokoro |
| `/chat/stop-voice` | POST | Interrompe toda síntese de fala |

## Wake Word

- **Palavra-chave padrão**: "luna" (com variante "computador")
- **Engine**: OpenWakeWord (100% offline, processamento local)
- **Tier mínimo necessário**: Ultra
- **Modo Chamada**: Mantém o detector rodando mas sem correspondência de keyword — qualquer fala é processada
- **Inicialização Lazy**: O detector só é carregado na primeira vez que é ativado, economizando memória

## TTS (Text-to-Speech)

- **Engine**: Kokoro-82m via ONNX Runtime
- **Voz padrão**: `pf_dora`
- **Qualidade**: Comparable a soluções cloud, mas rodando 100% local
- **Pre-warm**: Inicializado em background durante o startup para reduzir latência do primeiro TTS
- **Fallback chain**:
  1. Kokoro (ONNX, local)
  2. Edge TTS (via edge-tts-universal, cloud)
  3. Say.js (TTS local do sistema, fallback final)
- **Vozes disponíveis**: Várias vozes femininas e masculinas definidas em `tts.py`

## STT (Speech-to-Text)

- **Engine**: faster-whisper (baseado em CTranslate2, mais rápido que whisper.cpp)
- **Modo**: Gravação do microfone até detecção de silêncio, depois transcrição
- **Suporte a múltiplos idiomas**: Detecta automaticamente o idioma falado

## Configuração

### Variáveis de Ambiente

Arquivo `.env` em `apps/core/`:

```env
HOST=127.0.0.1
PORT=8000
MOMAI_DEBUG=false
LOG_LEVEL=info
TUI_LOGS=false
MOMAI_NODE_CORE_HOST=127.0.0.1
MOMAI_NODE_CORE_PORT=8000
```

### Portas

- **8000**: Porta usada em desenvolvimento (uvicorn --reload)
- **8001**: Porta do sidecar em produção (configurada via `MOMAI_PYTHON_SIDECAR_PORT`)
- Nota: porta 8000 é do Node Core em produção; o sidecar Python muda para 8001

## Startup (Lifespan)

Quando o servidor FastAPI inicia, a função `lifespan` em `startup.py` executa uma sequência de inicialização:

1. Conecta e migra o banco SQLite
2. Dispara `init_sidecar_task()` que:
   - Envia eventos de progresso para o frontend via WebSocket
   - Faz prewarm do TTS em background (reduz latência da primeira fala)
3. Inicia thread `monitor_parent()` que monitora o processo pai (Electron) e auto-encerra se ele morrer
4. No shutdown: para wake word detector e TTS

## Bancos de Dados

- **SQLite** via SQLAlchemy (arquivo: `apps/core/momai.db` em dev, `%APPDATA%/MomAI/data/` em produção)
- **Modelo principal**: `Settings` (configurações do usuário)
- **Cache de settings**: TTL de 10 segundos para evitar queries repetidas
