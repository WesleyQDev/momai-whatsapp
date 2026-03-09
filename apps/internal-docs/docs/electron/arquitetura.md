---
sidebar_position: 1
---

# Arquitetura

## Visão geral

O app desktop MomAI é dividido em três camadas:

- `main`: processo principal do Electron (janelas, ciclo de vida, bootstrap do backend)
- `preload`: bridge segura entre renderer e APIs IPC
- `renderer`: interface React (chat, views, onboarding e configurações)

## /src/main

### index.ts

Responsável pelo ciclo de vida do Electron:

- garante single instance lock
- registra atalhos globais (`Alt+Space` para alternar visibilidade)
- registra handlers IPC globais (logs, versão, auto start)
- cria janela principal
- inicia backend Python
- coordena shutdown ordenado (`will-quit` -> encerra Python -> fecha app)

### env.ts

Configura ambiente de execução da app:

- em dev, usa nome `MomAI-dev`
- redireciona `userData` para pasta local de desenvolvimento
- em produção, define nome `MomAI`

### state.ts

Estado compartilhado do processo main:

- referências de `mainWindow`, `overlayWindow`, `tray` e `pythonProcess`
- flags de ciclo de vida (`isQuitting`, `ipcHandlersRegistered`, `isFirstLaunch`)
- controle de erro de bootstrap (`lastBootstrapError`)

Também define tipos de erro de bootstrap como:

- `python_not_found`
- `uv_not_found`
- `venv_failed`
- `sync_failed`
- `missing_vc_redist`

### pythonManager.ts

Orquestra o backend local:

- resolve caminho de `userData` (incluindo cenários MSIX no Windows)
- gerencia lock de sincronização de dependências
- prepara ambiente Python com `uv`
- inicia `main.py` e aguarda porta HTTP ficar disponivel
- envia progresso de inicialização para o renderer (`init-progress`)
- persiste estado de onboarding

### windowManager.ts

Responsável por janelas e eventos UI:

- cria e controla `mainWindow`
- cria `overlayWindow` para modo sobreposto
- registra IPC para minimizar/maximizar/foco/tamanho
- integra notificações nativas
- disponibiliza restart do backend via IPC
- pausa e retoma recursos de voz conforme estado da janela

### updater.ts

Integra atualização automática do app desktop:

- checagem de nova versão
- download de update
- instalação após reinício

### logger.ts

Centraliza logs do processo principal e utilitários de caminho de logs.

### constants.ts

Define constantes de comunicação com o Core (host, porta e URL base da API).

## /src/preload

### index.ts

Expõe API segura no `window.api` usando `contextBridge`:

- comandos de janela (`minimize`, `maximize`, `close`, `focus`)
- onboarding (`isFirstLaunch`, `markFirstLaunchFinished`)
- backend (`restartBackend`)
- logs (`getLogsPath`, `openLogsFolder`)
- atualizações (`checkForUpdates`, `downloadUpdate`, eventos)
- progresso/erros de bootstrap (`onBootstrapError`, `onInitProgress`)

### index.d.ts

Contrato tipado de todas as funções expostas no preload para consumo no renderer.

## /src/renderer

### index.html

Shell SPA do frontend React.

### src/main.tsx

Bootstrap React:

- `HashRouter`
- rota principal (`/*`) para a UI
- rota `/overlay` para janela overlay
- `I18nProvider` global

### src/App.tsx

Orquestrador da UI principal:

- composição de views e painéis
- onboarding e tela de boas-vindas
- tratamento de erro de bootstrap
- integração de status da inicialização
- ponte de eventos do overlay

## Fluxo de inicialização (resumo)

1. `main/index.ts` inicializa o Electron e registra IPC.
2. `windowManager.createWindow()` cria a janela principal.
3. `pythonManager.startPythonBackend()` prepara ambiente e sobe FastAPI.
4. progresso de init é enviado para a UI via evento IPC.
5. renderer atualiza telas de loading/onboarding até o estado pronto.