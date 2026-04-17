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

1. Validar se Core esta escutando em `127.0.0.1:8000`.
2. Validar logs do Electron main e erro de bootstrap.
3. Validar disponibilidade de runtime Python/uv no ambiente.
4. Validar estado de inicializacao exibido na UI.

## Incidentes comuns

- Core nao inicia por dependencia local ausente.
- Divergencia de contrato entre UI e API.
- Falha em recursos de voz por permissoes/dispositivo.

## Rotina operacional recomendada

- Antes de merge: lint, typecheck e testes relevantes.
- Em mudancas arquiteturais: atualizar docs C4 + ADR.
- Em mudancas de operacao: atualizar este runbook.

