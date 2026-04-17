# Requirements

Status: Draft  
Owner: MomAI Team  
Ultima revisao: 2026-04-17  
Relacionados: [VISION.md](./VISION.md), [SPECS](./SPECS), [DECISIONS](./DECISIONS)

## Objetivo

Registrar requisitos funcionais e nao funcionais do sistema, com rastreabilidade para specs e ADRs.

## Requisitos funcionais (RF)

- RF-001: O app desktop deve permitir chat em tempo real com streaming de resposta.
- RF-002: O sistema deve suportar comandos de voz, wake word e TTS.
- RF-003: O Core Node local deve expor API HTTP para chat, configuracoes e recursos operacionais.
- RF-004: O backend deve disponibilizar canal WebSocket para eventos em tempo real.
- RF-005: O sistema deve persistir historico e dados locais de forma offline-first.
- RF-006: O roteamento semantico deve selecionar agentes/ferramentas adequadas por contexto.
- RF-007: O sistema deve suportar lembretes e automacoes locais.
- RF-008: O sistema deve suportar extensoes/skills com carregamento dinamico.
- RF-009: O sistema deve usar `llama.cpp` local como engine primario de inferencia para chat.
- RF-010: O runtime Python deve operar como sidecar sob demanda para voz/ML sem bloquear chat.

## Requisitos nao funcionais (RNF)

- RNF-001: Privacidade local-first; evitar envio desnecessario de dados para cloud.
- RNF-002: Tempo de inicializacao previsivel do Desktop + Core.
- RNF-003: Observabilidade minima com logs para diagnostico de bootstrap.
- RNF-004: Tolerancia a falhas no sidecar Python sem indisponibilizar o fluxo principal de chat.
- RNF-005: Compatibilidade multiplataforma (Windows, Linux, macOS).
- RNF-006: Evolucao arquitetural com historico de decisoes (ADR).

## Rastreabilidade inicial

| ID | Documento de detalhamento |
|---|---|
| RF-001..RF-008 | `docs/SPECS/0001-root-documentation-foundation.md` (framework inicial) |
| RNF-001..RNF-006 | `docs/SECURITY_PRIVACY.md`, `docs/OPERATIONS_RUNBOOK.md`, ADRs |

> Observacao: A rastreabilidade sera refinada por feature conforme novas SPECS e ADRs forem adicionadas.
