# Test Strategy

Status: Draft  
Owner: MomAI Team  
Ultima revisao: 2026-04-17  
Relacionados: [REQUIREMENTS.md](./REQUIREMENTS.md), [OPERATIONS_RUNBOOK.md](./OPERATIONS_RUNBOOK.md)

## Objetivo

Definir estrategia de testes e criterios de aceite para garantir evolucao segura.

## Piramide de testes (baseline)

- Testes unitarios:
- Core: regras de dominio, servicos e utilitarios.
- Desktop: hooks, helpers e estados de UI.
- Testes de integracao:
- Contratos API (`api/schemas.py`), rotas e servicos principais.
- Fluxos Electron main/preload/renderer para bootstrap e IPC critico.
- Testes end-to-end:
- Fluxo principal de inicializacao e chat streaming.

## Criterios de aceite

- Mudanca funcional deve ter cobertura no nivel adequado.
- Mudanca arquitetural deve atualizar SPEC/ADR e docs de arquitetura.
- Regressao em bootstrap, chat ou voz deve bloquear merge.

## Qualidade documental (DoD de docs)

- Documento com objetivo, escopo, dependencias e riscos claros.
- Requisitos rastreaveis para SPECs e ADRs.
- Revisao quinzenal registrada para manter aderencia ao sistema real.

