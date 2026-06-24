---
description: Regra anti-vazamento de código de extensões no código principal. Aplica-se a TODOS os arquivos do app principal, exceto dentro de `apps/momai/scripts/skills/packaged/*/src/`.
globs:
  - apps/momai/src/renderer/src/**/*.{ts,tsx}
  - apps/momai/src/main/**/*.ts
  - apps/momai/scripts/node-core/**/*.js
  - apps/momai/scripts/node-core/**/*.ts
alwaysApply: true
---

# Regra Anti-Vazamento: Código de Extensões no App Principal

## Princípio Fundamental

> **Skills são artefatos ZIP auto-contidos. O app principal NUNCA deve conhecer uma skill específica pelo nome, ID, rota, evento, tool, ícone, cor ou caminho de arquivo.**

Se você está adicionando `if (id === 'whatsapp')`, uma rota `/extensions/whatsapp/...`, ou hardcoding "WhatsApp" / "launcher" em qualquer string, **PARE** — a feature pertence à skill, não ao app.

---

## Onde código de skill DEVE viver

| Tipo de código | Local correto |
|----------------|---------------|
| UI React (full-page) | `apps/momai/scripts/skills/packaged/<id>/src/page.tsx` |
| UI React (side-panel) | `apps/momai/scripts/skills/packaged/<id>/src/panel.tsx` |
| Ícones SVG específicos da skill | dentro do bundle da skill (não no app) |
| Cores/gradiente da skill | `manifest.theme.gradient` + `manifest.theme.accent` |
| Texto de notificação da skill | dentro do bundle da skill |
| Tool de processamento de evento | runtime.js + `manifest.eventTypes` |
| HTTP routes específicas | `manifest.routes[]` (montadas dinamicamente) |
| Voice command handlers | `manifest.voiceHooks.*` |
| Cleanup on app quit | `manifest.persistOnQuit` |
| Storage info (para Privacy view) | `manifest.storage` |

---

## O que NUNCA hardcodar no app principal

### ❌ Proibido em `apps/momai/src/renderer/src/`

```tsx
// ❌ PROIBIDO — branch por ID
if (skill.id === 'whatsapp' || skill.id === 'launcher') { ... }

// ❌ PROIBIDO — ícone hardcoded
const iconMap = { whatsapp: WhatsAppIcon, launcher: LauncherIcon, '💚': WhatsAppIcon }

// ❌ PROIBIDO — gradiente hardcoded
if (id === 'whatsapp') return 'from-emerald-500 to-green-600'
if (id === 'launcher') return 'from-blue-500 to-indigo-600'

// ❌ PROIBIDO — import de arquivo específico da skill
import WhatsAppView from './views/WhatsAppView'
import WhatsAppNotificationCard from './components/chat/WhatsAppNotificationCard'
import { resolveWhatsAppChannel } from '../utils/whatsappChannel'

// ❌ PROIBIDO — string hardcoded em chamada de API
await api.post('/extensions/whatsapp/disconnect', ...)
await api.post('/extensions/whatsapp/process-notification', ...)
await api.post('/extensions/whatsapp/command', { toolName: 'get_history' })

// ❌ PROIBIDO — branch por eventType hardcoded
if (event.eventType === 'whatsapp_notification') { ... }
if (data?.structuredResponse?.type === 'whatsapp_notification') { ... }

// ❌ PROIBIDO — rota hardcoded no router
<Route path="/extensions/whatsapp" element={<WhatsAppView />} />
```

### ❌ Proibido em `apps/momai/scripts/node-core/api/routes/`

```js
// ❌ PROIBIDO — rota hardcoded
if (pathname === '/extensions/whatsapp/disconnect' && req.method === 'POST') { ... }
if (pathname === '/extensions/whatsapp/restart' && req.method === 'POST') { ... }
if (pathname === '/extensions/whatsapp/sync' && req.method === 'POST') { ... }
if (pathname === '/launcher/open' && req.method === 'POST') { ... }

// ❌ PROIBIDO — helper específico de skill
function _getBaileysAuthDir() {
  return path.join(DATA_DIR, 'extensions', 'whatsapp', 'baileys-auth')
}

// ❌ PROIBIDO — import de util específico de skill
const { resolveWhatsAppChannel } = require('../../utils/whatsapp-channel')
```

### ❌ Proibido em `apps/momai/scripts/node-core/services/`

```js
// ❌ PROIBIDO — system prompt mencionando tools de skill específica
'<tool_priority>\n- WEATHER: ...\n- OPEN/ABRIR: use launcher tools to find and open files/programs.\n</tool_priority>'

// ❌ PROIBIDO — comando de voz hardcoded para uma skill
if (contentLower.startsWith('responda') || contentLower.startsWith('responde')) {
  const result = await hostManager.sendToPersistent('whatsapp', { toolName: 'get_history', args: {} })
  // ...
}

// ❌ PROIBIDO — busca por skill ID hardcoded
const skill = skillRegistry.getAll().find((s) => s.id === 'whatsapp')
```

### ❌ Proibido em `apps/momai/src/main/`

```ts
// ❌ PROIBIDO — flush de uma skill específica no app quit
await authFetch(`http://${API_HOST}:${API_PORT}/extensions/whatsapp/flush-history`, { ... })

// ❌ PROIBIDO — branch por tipo de structured response
if (data?.structuredResponse?.type === 'whatsapp_notification') { ... }

// ❌ PROIBIDO — campo "launcher" em escaneadores genéricos (conflita com a skill launcher)
launcher: 'steam' | 'epic'  // ❌ renomear para `platform: 'steam' | 'epic'`
```

---

## O que USAR no lugar

### ✅ Genérico (sempre)

| Onde | Como |
|------|------|
| Ícone | `manifest.icon` (emoji, SVG inline string, ou nome de HeroIcon) → `resolveSkillIcon(manifest)` |
| Cor/gradiente | `manifest.theme.gradient` (whitelist em `ALLOWED_GRADIENTS`) + `manifest.theme.accent` |
| Rotas HTTP | `manifest.routes[]` → montadas via `mountSkillRoutes()` |
| Eventos | `manifest.eventTypes[]` → `findSkillForEvent(eventType)` |
| Storage info | `manifest.storage` → `collectStoredData(skills)` |
| Voice commands | `manifest.voiceHooks.*` → `resolveVoiceReply(content, skills, hostManager)` |
| Tool priority | `manifest.toolPriority` → `buildToolPriority(skills)` |
| Persist on quit | `manifest.persistOnQuit` → iteração genérica em main process |
| Full-page UI | rota `/extensions/:id` + `ExtensionPageRoute` (lazy-load via `loadSkillRenderer`) |
| Side panel UI | `ExtensionPanel` genérico + `getRenderer(type)` |
| Structured response | `getRenderer(data.structuredResponse.type)` (registry dinâmico) |
| Tool dispatch | `extensionHostManager.sendToPersistent(skill.id, { toolName, args })` |

### ✅ Onde os campos vivem no payload da API

`buildExtensionsPayload` em `apps/momai/scripts/node-core/services/skill-orchestrator.js` promove os novos campos para o **top level** do objeto retornado por `/extensions`. O tipo `Extension` em `apps/momai/src/renderer/src/services/api.ts` declara esses campos no top level. Portanto:

```ts
// ✅ CORRETO — ler do top level
const page = skill.ui?.page
const events = skill.eventTypes
const grad = skill.theme?.gradient
const storage = skill.storage

// ❌ ERRADO — `manifest` é o objeto fallback vazio do useInstalledSkill
//   e o backend não envia `manifest` no top level, então seria sempre {}
const page = skill.manifest?.ui?.page  // ← sempre undefined!
const events = skill.manifest?.eventTypes
```

**Regra:** ler os novos campos sempre do top level (`skill.ui`, `skill.eventTypes`, etc). Se precisar do manifest inteiro, passe `skill` (o objeto inteiro) como prop.

### ✅ Helpers já disponíveis no monorepo

```ts
// Renderer
import { loadSkillRenderer } from 'components/chat/ExtensionRendererLoader'
import { getRenderer, registerRenderer } from 'components/chat/SkillResponseRegistry'
import { useInstalledSkill } from 'hooks/useInstalledSkill'
import { ExtensionPageRoute } from 'views/ExtensionPageRoute'

// Backend (node-core)
const { collectStoredData } = require('../../services/manifest-storage')
const { mountSkillRoutes } = require('../../services/manifest-routes')
const { resolveVoiceReply } = require('../../services/manifest-voice-hooks')
const { buildToolPriority } = require('../../services/tool-priority')
```

---

## Whitelist de Gradientes (Anti-Injection)

`manifest.theme.gradient` DEVE estar nesta lista. Validação em runtime:

```ts
const ALLOWED_GRADIENTS = new Set([
  'from-emerald-500 to-green-600', 'from-blue-500 to-indigo-600',
  'from-violet-600 to-purple-500', 'from-rose-600 to-pink-500',
  'from-cyan-600 to-blue-500', 'from-emerald-600 to-teal-500',
  'from-amber-600 to-orange-500', 'from-fuchsia-600 to-pink-500',
  'from-indigo-600 to-violet-500', 'from-lime-600 to-green-500',
  'from-sky-600 to-cyan-500', 'from-red-600 to-rose-500'
])
```

`manifest.theme.accent` deve ser: `emerald` | `blue` | `violet` (default `violet`).

---

## Padrão de Build por Skill

Skills com UI têm seu próprio `package.json`, `tsconfig.json`, `build.mjs` (esbuild) dentro de `apps/momai/scripts/skills/packaged/<id>/`. Bundles saem em `dist/page.js` + `dist/panel.js` (gitignored). Host serve em `GET /extensions/:id/dist/*`.

Aliases do esbuild (`momai:registry`, `momai:events`, `momai:api`, `momai:constants`, `momai:text`, `momai:tts-service`, `momai:image-viewer`) apontam para arquivos do host app (4 níveis acima do skill).

**Formato do bundle**: sempre `format: 'esm'`. Nunca use `iife` (gera `require()` que o browser não suporta).

**Bundle deve ser ESM** com `external: ['react', 'react-dom', 'react/jsx-runtime']`. Esses pacotes são fornecidos pelo host (Vite em dev, bundle do electron-vite em prod).

### Dev Mode: Serving Skill Bundles via Vite

Em dev (`pnpm dev`), o renderer (Electron) fala com o **Vite dev server** (porta 5173). O node-core (porta 8050) **não** está no path do renderer em dev. Por isso, o middleware em `apps/momai/electron.vite.config.ts` (`skillBundlesPlugin`) serve os bundles da skill diretamente do Vite:

1. **Strip query string** antes do match: `req.url.split('?')[0]` (Vite adiciona `?import` aos dynamic imports)
2. **Rewrite bare specifiers** para `/@id/<pkg>` (Vite's special URL prefix for npm modules):
   ```ts
   const BARE_TO_ABS: Record<string, string> = {
     react: '/@id/react',
     'react-dom': '/@id/react-dom',
     'react-dom/client': '/@id/react-dom/client',
     'react/jsx-runtime': '/@id/react/jsx-runtime',
     'react/jsx-dev-runtime': '/@id/react/jsx-dev-runtime'
   }
   ```

   **Por que `/@id/<pkg>` (sem `/index.js`)?** Vite resolve o pacote via `exports` field do `package.json`. Apontar para `/@id/react/index.js` retorna 500 (`Missing "./index.js" specifier in "react" package`) porque React 19 não exporta `./index.js`. Apontar para `/node_modules/react/index.js` serve o source CJS raw (`module.exports = require(...)`) que o browser não pode usar como ESM. Apenas `/@id/react` (sem subpath) funciona corretamente — Vite retorna um wrapper ESM válido (704 bytes para react).

Se você adicionar uma nova dep externa em `build.mjs` (ex: `external: ['lodash']`), adicione também no `BARE_TO_ABS`.

**Diagnóstico**: se os bundles falham ao carregar, rode `node apps/momai/scripts/test-vite-skill-bundles.mjs` (inicia um Vite standalone na porta 5174 e faz requests para vários paths de teste). Não inicia o Electron.

---

## Code Review Checklist

Antes de aprovar um PR que toca `apps/momai/src/`, `apps/momai/scripts/node-core/`, ou `apps/momai/src/main/`, verificar:

- [ ] `git grep -nE "'whatsapp'|'launcher'"` retorna **apenas** arquivos de teste, fixtures, ou a própria skill
- [ ] Nenhum `if (id === '...')` em código de produção
- [ ] Nenhum path hardcoded `/extensions/<id>/` exceto `/extensions/:id/`, `/extensions/:id/command`, `/extensions/:id/panel`, `/extensions/:id/dist/*`
- [ ] Nenhum `structuredResponse.type === '...'` hardcoded (usar `getRenderer`/`hasRenderer`)
- [ ] Nenhum `<tool_priority>` hardcoded (usar `buildToolPriority`)
- [ ] Nenhum voice command handler hardcoded (usar `manifest.voiceHooks`)
- [ ] Nenhum import de arquivo dentro de `apps/momai/scripts/skills/packaged/<id>/src/`
- [ ] Componentes UI específicos de skill vivem em `apps/momai/scripts/skills/packaged/<id>/src/`
- [ ] `manifest.json` da skill declara todos os campos novos (ui, eventTypes, routes, storage, voiceHooks, persistOnQuit, theme, toolPriority)
- [ ] Se a skill tem UI, ela constrói (`pnpm build`) e o `dist/page.js` + `dist/panel.js` existem

---

## Como migrar código que violou esta regra

1. Identificar o hardcode: `git grep -nE "'whatsapp'|'launcher'|<id>" -- apps/momai/src/ apps/momai/scripts/node-core/ apps/momai/src/main/`
2. Mover o código para `apps/momai/scripts/skills/packaged/<id>/src/` (ajustar imports relativos)
3. Adicionar campo correspondente ao `manifest.json` da skill
4. No app principal, substituir o hardcode pelo helper genérico
5. Rebuild da skill: `cd apps/momai/scripts/skills/packaged/<id> && pnpm build`
6. Sincronizar com o repo externo (ver `.opencode/rules/momai-context.md` §"Regra Crítica")
7. Atualizar `registry.json` na raiz com nova versão
