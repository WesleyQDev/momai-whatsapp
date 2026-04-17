# System Context (C4 - Nivel 1)

Status: Draft  
Owner: MomAI Team  
Ultima revisao: 2026-04-17  
Relacionados: [CONTAINER_ARCHITECTURE.md](./CONTAINER_ARCHITECTURE.md), [VISION.md](./VISION.md)

## Objetivo

Descrever o sistema MomAI no contexto externo: atores, sistemas vizinhos e fronteiras.

## Atores primarios

- Usuario final: interage por UI e voz.
- Desenvolvedor/contribuidor: evolui funcionalidades e extensoes.

## Sistemas e dependencias externas

- Provedores opcionais de IA (quando habilitados por configuracao).
- Sistema operacional (janelas, notificacoes, audio, processos).
- Hardware local (CPU/GPU, microfone, alto-falante).

## Fronteira do sistema

Dentro da MomAI:

- Desktop app (`apps/momai`) com Electron/React.
- Core backend (`apps/core`) com FastAPI e orquestracao de IA.
- Persistencia local (SQLite + LanceDB).

Fora da MomAI:

- APIs de terceiros opcionais.
- Store/distribuicao e infraestrutura de release.

## Fluxo de alto nivel

1. Usuario envia entrada por texto/voz no Desktop.
2. Desktop encaminha para Core via HTTP/WebSocket.
3. Core processa intencao, seleciona agentes/tools e responde com streaming.
4. Desktop renderiza resposta e apresenta feedback visual/voz.

