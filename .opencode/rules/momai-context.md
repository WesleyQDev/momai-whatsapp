---
description: Contexto do Projeto MomAIOS
globs:
alwaysApply: true
---

# Contexto do Projeto MomAIOS

MomAI é um assistente virtual local-first focado em privacidade, combinando LLMs com ações reais no computador. Monorepo gerenciado por pnpm workspaces + Turbo.

## Apps

- `apps/momai/` - GUI desktop (Electron + React + TypeScript)
- `apps/core/` - Runtime Python (STT/TTS/banco local/inferência ONNX)
- `scripts/node-core/` - Motor de orquestração de agentes (Node.js)
- `apps/fortscript/` - Biblioteca Python utilitária
- `apps/landing-page/` - Landing page (Vite + TailwindCSS) Github pages
- `apps/momai-promo-video/` - Vídeo promocional (Remotion)
- `docs/` - Documentação interna em markdown

## Padrões Importantes

- **UI Registrada**: `src/renderer/src/components/chat/SkillResponseRegistry.ts` (mapeia tipo → componente)
- **Extensões**: `community-extensions.json` (registro), `src/renderer/src/views/ExtensionsView.tsx` (loja)
- **Skills core**: `scripts/skills/core/*/`
- **Custom commands**: `.opencode/commands/*.md`
- **Pipeline voz**: WakeWordDetector → STT → LLM → TTS
- **Streaming SSE**: `scripts/node-core.js`

## Convenções

- **TS/React:** PascalCase componentes, camelCase hooks/utils, kebab-case arquivos
- **Python:** snake_case funções, PascalCase classes, PEP 8, type hints
- **FastAPI:** Schemas Pydantic, rotas em `api/routes/*.py`, exception handlers em `main.py`

## Ambiente

`.env` em `apps/momai/` e `apps/core/`.

## Comandos Raiz

`package.json` raiz. Principais: `pnpm dev`, `pnpm dev:core`, `pnpm dev:all`, `pnpm build`, `pnpm build:win`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm format`.
