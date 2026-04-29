# MomAI Core

Sidecar Python dedicado exclusivamente a operações de **voz** (STT/TTS).

## Stack

- **Python 3.12+**
- **FastAPI** + uvicorn (servidor HTTP)
- **faster-whisper** (transcrição, via CTranslate2)
- **Kokoro-82m** (TTS, via ONNX)
- **OpenWakeWord** (detecção de palavra-chave)
- **SQLAlchemy** + SQLite (persistência)

## Arquitetura

```
[Electron Main Process]
    |
    | HTTP + WebSocket
    v
[FastAPI Server] (porta 8001)
    |
    ├── API Layer (voice.py, chat_voice.py)
    ├── Voice Layer (detector, quick_transcriber, tts)
    └── Data Layer (SQLite)
```

## Estrutura

```
apps/core/
├── api/
│   ├── router.py           # APIRouter + include_routes()
│   ├── deps.py             # Dependências FastAPI
│   └── routes/
│       ├── voice.py        # Wake word, call mode, quick transcribe
│       └── chat_voice.py   # TTS speak, stop voice
├── database/
│   └── models.py           # SQLAlchemy models + migrations
├── services/
│   └── voice/
│       ├── tts.py           # Kokoro TTS engine
│       ├── detector.py      # Wake word detector (OpenWakeWord)
│       ├── quick_transcriber.py # Whisper quick transcribe
│       └── models/          # Modelos de voz
├── utils/
│   ├── visual_logger.py    # Logger visual
│   └── tui_logger.py       # Logger TUI
├── main.py                 # Entry point FastAPI
├── startup.py              # Lifespan, init, prewarm
├── app_state.py            # Estado global (WebSockets, TTS runtime)
└── runtime.py              # Logging, patching, UTF-8 config
```

## API Endpoints

| Rota | Método | Descrição |
|------|--------|-----------|
| `/voice/ws` | WebSocket | Conexão real-time para broadcast de estado |
| `/voice/quick-transcribe` | POST | Grava áudio do microfone até silêncio, retorna texto |
| `/voice/stop-quick-transcribe` | POST | Interrompe gravação manual |
| `/voice/wake-word` | POST | Ativa/desativa wake word |
| `/voice/call-mode` | POST | Alterna modo chamada (hands-free) |
| `/chat/speak` | POST | Sintetiza texto em fala via Kokoro |
| `/chat/stop-voice` | POST | Para toda síntese de fala |

## Wake Word

- **Palavra-chave padrão:** "luna" (com variantes "computador")
- **Engine:** OpenWakeWord (offline, processamento local)
- **Tier mínimo:** Ultra
- **Modo chamada:** Mantém detector rodando sem keyword matching

## TTS (Kokoro)

- **Engine:** Kokoro-82m (ONNX)
- **Voz padrão:** `pf_dora`
- **Vozes disponíveis:** Variáveis (definidas em `tts.py`)
- **Pre-warm:** Inicializado em background no startup
- **Fallback:** Quando Kokoro não está disponível, usa edge-tts ou `say` (Windows)

## Configuração

Variáveis de ambiente (arquivo `.env` em `apps/core/`):

```env
HOST=127.0.0.1
PORT=8000
MOMAI_DEBUG=false
LOG_LEVEL=info
TUI_LOGS=false
```

**Nota:** A porta do sidecar Python em produção é 8001 (configurada via `MOMAI_PYTHON_SIDECAR_PORT`); a porta 8000 é do Node Core.
