# Operations Runbook

Status: Draft  
Owner: MomAI Team  
Ultima revisao: 2026-04-17  
Relacionados: [RUNTIME_BEHAVIOR.md](./RUNTIME_BEHAVIOR.md), [TEST_STRATEGY.md](./TEST_STRATEGY.md)

## Objetivo

Documentar operacao de desenvolvimento, diagnostico e manutencao.

## Comandos de referencia (monorepo)

- `pnpm dev`: sobe app desktop em modo dev
- `pnpm dev:core`: sobe apenas backend
- `pnpm dev:all`: sobe desktop + core
- `pnpm build`: build via Turbo
- `pnpm lint`: lint via Turbo
- `pnpm typecheck`: typecheck via Turbo
- `pnpm test`: testes via Turbo

## Diagnostico inicial

1. Validar se Core Node esta escutando em `127.0.0.1:8000`.
2. Validar logs do Electron main e erro de bootstrap.
3. Validar estado de inicializacao exibido na UI (`/init-status` + eventos IPC).
4. Validar disponibilidade de `llama-server` (quando `auto_start_llm=true`).
5. Em uso de voz, validar start do sidecar Python sob demanda.

## Incidentes comuns

- Core Node nao inicia por script/processo indisponivel.
- `llama-server` nao sobe (binario/modelo ausente ou permissao de spawn).
- Sidecar Python falha ao iniciar recursos de voz.
- Divergencia de contrato entre UI e API.
- Falha em recursos de voz por permissoes/dispositivo.

## Rotina operacional recomendada

- Antes de merge: lint, typecheck e testes relevantes.
- Em mudancas arquiteturais: atualizar docs C4 + ADR.
- Em mudancas de operacao: atualizar este runbook.
