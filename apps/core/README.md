# MomAI Core

Sidecar Python da MomAI, dedicado exclusivamente a voz (STT/TTS).

## Arquitetura

A MomAI Core funciona como um servico FastAPI enxuto para voz:

- **API Layer (FastAPI):** Endpoints de voz e bridge de TTS.
- **Voice Layer:** Wake word, transcricao rapida (Whisper) e sintese de voz (Kokoro).
- **Data Layer:** SQLite para configuracoes de voz.

## Funcionalidades

- **Quick STT:** Captura de audio e transcricao curta para input de voz.
- **Wake Word:** Controle e deteccao de palavra-chave.
- **TTS:** Sintese local com streaming/fallback para o frontend.

## Estrutura

```text
apps/core/
|- api/             # Endpoints FastAPI
|- database/        # SQLite
`- services/voice/  # STT/TTS e wake word
```

## Configuracao

Crie um arquivo `.env` com as variaveis necessarias:

```bash
# Configuracoes do servidor
HOST=127.0.0.1
PORT=8000
MOMAI_DEBUG=false
```

## Executando

```bash
# Com uv
cd apps/core
uv run python main.py

# ou via pnpm (monorepo)
pnpm run dev:core
```

## Requisitos

- Python 3.12+
- Dependencias de audio do sistema operacional (microfone/saida)
