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
- **Extensões**: `registry.json` (raiz, lista ZIPs externos), `src/renderer/src/views/ExtensionsView.tsx` (loja)
- **Skills core**: `scripts/skills/core/*/`
- **Custom commands**: `.opencode/commands/*.md`
- **Pipeline voz**: WakeWordDetector → STT → LLM → TTS
- **Streaming SSE**: `scripts/node-core.js`

## ⚠️ Regra: Skills Auto-Contidas (LEIA ANTES DE TOCAR NO APP PRINCIPAL)

Skills são artefatos ZIP auto-contidos. O app principal (`apps/momai/src/`, `apps/momai/scripts/node-core/`, `apps/momai/src/main/`) NUNCA deve conhecer uma skill específica pelo nome, ID, rota, evento, tool, ícone, cor ou caminho.

**Regras detalhadas:** ver `.opencode/rules/extension-ui-no-leak.md`.

**Resumo rápido:**
- ❌ Proibido: `if (id === 'whatsapp' || id === 'launcher')`, `/extensions/whatsapp/*`, `'whatsapp_notification'`, system prompt com tools de skill, import de `src/page.tsx` da skill
- ✅ Usar: `manifest.ui`, `manifest.eventTypes`, `manifest.routes`, `manifest.storage`, `manifest.voiceHooks`, `manifest.persistOnQuit`, `manifest.theme`, `manifest.toolPriority` + helpers genéricos (`mountSkillRoutes`, `collectStoredData`, `resolveVoiceReply`, `buildToolPriority`)
- ✅ Build: cada skill com UI tem `build.mjs` (esbuild) próprio em `apps/momai/scripts/skills/packaged/<id>/`

## Convenções

- **TS/React:** PascalCase componentes, camelCase hooks/utils, kebab-case arquivos
- **Python:** snake_case funções, PascalCase classes, PEP 8, type hints
- **FastAPI:** Schemas Pydantic, rotas em `api/routes/*.py`, exception handlers em `main.py`

## Ambiente

`.env` em `apps/momai/` e `apps/core/`.

## Comandos Raiz

`package.json` raiz. Principais: `pnpm dev`, `pnpm dev:core`, `pnpm dev:all`, `pnpm build`, `pnpm build:win`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm format`.

## ⚠️ Regra: Skills Têm Dois Repositórios (REGRA CRÍTICA)

**TODA skill empacotada em `apps/momai/scripts/skills/packaged/<id>/` tem um repositório externo espelho no GitHub.** Quando o código de uma skill mudar no monorepo, o repo externo PRECISA ser atualizado junto (não é opcional, não é "depois" — é parte do mesmo trabalho).

### Mapeamento

| Skill no monorepo | Repo externo |
|-------------------|--------------|
| `apps/momai/scripts/skills/packaged/whatsapp/` | `WesleyQDev/momai-whatsapp-extension` |
| `apps/momai/scripts/skills/packaged/launcher/` | (verificar se existe; convenção `WesleyQDev/momai-launcher-extension`) |

A fonte da verdade do mapeamento é `registry.json` na raiz do monorepo (campo `download_url` aponta para o ZIP do repo externo).

### Workflow com `gh` CLI

Quando modificar uma skill em `apps/momai/scripts/skills/packaged/<id>/`:

```bash
# 1. Identificar o repo externo (registry.json -> download_url)
gh repo clone WesleyQDev/momai-<id>--extension /tmp/momai-<id>-extension

# 2. Sincronizar os arquivos alterados
#    - background-worker.js / runtime.js (código)
#    - SKILL.md / manifest.json (versão + comportamento)
#    - locales/*.json (se traduções mudaram)
#    - package.json (se deps mudaram)
cp apps/momai/scripts/skills/packaged/<id>/<arquivo> /tmp/momai-<id>-extension/

# 3. Commit + tag + release no repo externo
cd /tmp/momai-<id>-extension
git add .
git commit -m "<mesmo título do commit do monorepo>"
git tag v<versão>
git push origin main --tags

# 4. Criar release ZIP (a URL do release entra no registry.json)
gh release create v<versão> --generate-notes

# 5. Atualizar registry.json no monorepo com a nova versão/URL

# 6. Commit no monorepo
cd <momai-monorepo>
git add registry.json
git commit -m "chore(registry): bump <id> to v<versão>"
git push origin main
```

### O que NÃO vai pro repo externo
- Mudanças em `node-core/` (infra do app, não da extensão)
- Mudanças em `src/renderer/` (UI do app, não da extensão)
- Mudanças em `main/` (Electron main process, não da extensão)

### Verificação

Antes de considerar trabalho de skill completo, checar:
- [ ] Commit no monorepo (código da skill)
- [ ] Commit no repo externo (mesmo código + versão)
- [ ] Tag/release criada no repo externo
- [ ] `registry.json` do monorepo aponta para a nova versão
