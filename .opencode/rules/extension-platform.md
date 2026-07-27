---
description: Regras para agentes de IA ao modificar o sistema de extensões ou SDK. Toda alteração no ecossistema de extensões segue esta checklist.
globs:
  - apps/momai/src/sdk/**/*.{ts,tsx}
  - apps/momai/scripts/node-core/services/extension*
  - apps/momai/scripts/node-core/services/manifest-*
  - apps/momai/scripts/node-core/services/skill-orchestrator.js
  - apps/momai/scripts/node-core/api/routes/extensions.routes.js
alwaysApply: true
---

# Extension Platform Rules for AI Agents

## When modifying extensions or the extension system

1. **Extension-internal changes only** (e.g., WhatsApp widget): No alert needed. Proceed.
2. **ADDING a new method to the SDK** (e.g., `sdk.browser.open`): Inform: "This ADDS `sdk.X.Y()` to SDK v{N}. Existing extensions do NOT break."
3. **MODIFYING an existing SDK method/signature**: RED ALERT: "This CHANGES the signature of `sdk.X.Y()`. ALL extensions using this method MAY BREAK. Correct action: create SDK v{N+1} with new method + keep adapter for old one. NEVER modify existing methods — always version."
4. **Host changes that affect the SDK internally**: "This changes {file}, used internally by the SDK. The SDK must be updated, but extensions don't break."
5. **Data format changes**: "This changes the format of {structuredResponse/storage/...}. Check if the SDK normalizes the format. Extensions accessing directly (without SDK) may break."
6. **Always run** `pnpm test:contract` after any change to:
   - `src/sdk/`
   - `scripts/node-core/services/extensions*`
   - `scripts/node-core/services/manifest-*`
   - `scripts/node-core/services/skill-orchestrator.js`
   - `scripts/node-core/api/routes/extensions.routes.js`
7. **NEVER remove or rename** an exported SDK method/type. Always ADD. If you need to change, create a new SDK version with an adapter.
8. **When unsure if a change breaks something:**
   - Run `pnpm test:extensions` (installs official extensions and verifies they work)
   - Run `pnpm test:contract` (verifies SDK surface)
   - If both pass, proceed with merge.
