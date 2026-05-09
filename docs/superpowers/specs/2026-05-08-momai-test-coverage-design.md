# MomAI Desktop Test Coverage Design

**Date:** 2026-05-08
**Status:** Approved
**Apps covered:** `apps/momai/` (Electron + React + TypeScript)

## Objective

Achieve ~90%+ line coverage on `apps/momai/` across all four layers: main process, preload, renderer, and node-core scripts. Tests must be meaningful — not just coverage-seeking — covering business logic, edge cases, error handling, and critical user flows.

## Architecture Overview

```
apps/momai/
├── src/
│   ├── main/          # Electron main process (Node.js)   ~26 files
│   ├── preload/       # Context bridge (Electron)          ~2 files
│   └── renderer/src/  # React UI (browser-like)           ~87 files
└── scripts/
    └── node-core/     # AI backend server (Node.js)       ~25 files
```

Total: ~140 source files across four runtime environments.

## Test Strategy

### Approach: Bottom-up

1. **Pure functions first** — highest ROI, zero mocking needed, validates correctness of core logic
2. **Hooks and business logic** — stateful logic with mocked dependencies
3. **Components** — React Testing Library for UI components
4. **Integration tests** — critical user flows end-to-end across layers

### Framework: Vitest

- **Why Vitest:** Native Vite integration (electron-vite uses Vite), same transform pipeline, fast HMR, built-in coverage via `@vitest/coverage-v8`, compatible with React Testing Library
- **3 environments:**
  - `node` — main process (`src/main/`) and node-core scripts (`scripts/node-core/`)
  - `jsdom` — renderer (`src/renderer/src/`) with React Testing Library
  - `electron` (via custom mock) — preload bridge testing

### Test File Structure

Co-located `*.test.ts` / `*.test.tsx` files next to source:

```
src/main/logger.test.ts
src/renderer/src/utils/chatUtils.test.ts
src/renderer/src/components/chat/ChatInput.test.tsx
scripts/node-core/utils/text.test.js
```

Decision: co-located test files (not `__tests__/` dirs) for simpler discovery and import paths.

## Phase Breakdown

### Phase 0: Infrastructure Setup

**Files to create/modify:**
- `vitest.config.ts` (root of apps/momai/) — 3 project configs (main, renderer, node-core)
- `src/main/test-setup.ts` — mock `electron` module (`app`, `ipcMain`, `BrowserWindow`, etc.)
- `src/renderer/src/test-setup.ts` — jsdom env, mock `window.api`, mock `AudioContext`, mock `HTMLAudioElement`
- `package.json` — add vitest scripts, add devDependencies (`vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, `@vitest/coverage-v8`, `jsdom`)
- `.vscode/settings.json` — Vitest extension integration

**Key decisions:**
- Use `vi.mock('electron', () => ...)` for main process mocking
- Use `vi.stubGlobal('window.api', ...)` for preload bridge mocking in renderer
- Mock `electron-updater`, `electron-log` at module level
- Coverage: exclude `node_modules/`, `dist/`, `*.d.ts`, `*.config.*`, test files themselves

### Phase 1: Pure Functions (~40 functions)

All pure functions by layer:

#### Main Process (`src/main/`)

| File | Functions | Tests |
|------|-----------|-------|
| `logger.ts` | `detectLogComponent()`, `detectComponent()`, `shouldEmitLogLine()` | 8-12 |
| `lexical-search.ts` | `lexicalScore()`, `buildSnippet()` | 10-15 |
| `ttsService.ts` | `sanitizeForTTS()`, `mapKokoroToEdgeVoice()` | 8-12 |
| `notesService.ts` | `sanitizeFolderPath()`, `extractTitleFromContent()`, `makePreview()`, `normalizeSlashes()` | 12-16 |
| `windowManager.ts` | `resolveIconPath()` | 4-6 |
| `coreManager.ts` | `shouldIgnoreLlamaNoise()` | 4-6 |
| `python/bootstrap/tier-detector.ts` | `getCurrentTier()`, `isAITier()` | 4-6 |
| `python/bootstrap/vc-redist.ts` | `isVCRedistInstalled()` | 4-6 |
| `python/bootstrap/index.ts` | `isPortReachable()` | 4-6 |
| `python/utils/fs-helpers.ts` | `buildEnv()`, various helpers | 4-6 |

#### Renderer Utils (`src/renderer/src/`)

| File | Functions | Tests |
|------|-----------|-------|
| `utils/chatUtils.ts` | `isToolTraceMessage()`, `splitToolTraceContent()`, `buildToolTraceContent()`, `parseStructuredToolResult()`, `extractToolQuery()`, `findLastAssistantIndex()`, `toCompactJson()` | 14-20 |
| `utils/text.ts` | `cleanMomaiActions()`, `stripMarkdown()` | 6-10 |
| `utils/reminders.ts` | `getNextOccurrence()`, `getOccurrenceForDate()` | 8-12 |
| `api.ts` | `safeJsonParse()`, `stripEmojisAndMarkdown()` | 6-8 |

#### Message Feature (`src/renderer/src/features/chat/message/`)

| File | Functions | Tests |
|------|-----------|-------|
| `utils.ts` | `cleanUIMetadata()`, `humanizeToolName()`, `minimizeText()`, `humanizeActivity()`, `processThinkTags()`, `createUnifiedSteps()` | 12-18 |

#### Note Helpers (`src/renderer/src/features/notes/`)

| File | Functions | Tests |
|------|-----------|-------|
| `utils/note-helpers.ts` | `sortNotesByTitle()`, `getFolderName()`, `getParentFolderPath()`, `isRetryableNotesLoadError()`, `generateNotePreview()` | 8-12 |

#### Node-Core (`scripts/node-core/`)

| File | Functions | Tests |
|------|-----------|-------|
| `utils/text.js` | `splitTokens()`, `sanitizePromptText()`, `lexicalScore()` | 10-14 |
| `utils/time.js` | `isoNow()`, `parseTime()` | 6-8 |
| `utils/stats.js` | `percentile()` | 6-10 |
| `utils/network.js` | `checkPortAvailable()` | 4-6 |

**Total Phase 1 estimate: ~130-200 tests**

### Phase 2: Hooks & Business Logic (~17 hooks)

| Hook | Complexity | Approach | Tests |
|------|-----------|----------|-------|
| `useChatHandlers.ts` | VERY HIGH — 22 message types | Mock WebSocket, test each handler in isolation | 25-35 |
| `useChatActions.ts` | VERY HIGH — SSE callback chain | Mock api.ts, test sendMessage flow | 20-30 |
| `useChatState.ts` | HIGH — 14 state vars | Test state transitions | 10-15 |
| `useChat.ts` | HIGH — orchestrator | Integration test composing sub-hooks | 8-12 |
| `useChatWebSocket.ts` | MEDIUM — reconnect logic | Mock WebSocket, test retry | 8-12 |
| `useStatus.ts` | HIGH — polling + watchdog | Mock timers, test state transitions | 12-18 |
| `useAutocomplete.ts` | MEDIUM — localStorage scoring | Mock localStorage, test frequency | 8-12 |
| `useAppInitialization.ts` | HIGH — multi-step init | Mock api.ts, test flow states | 10-15 |
| `useTTS.ts` | MEDIUM — speak/stop abstraction | Mock TTSServiceRenderer | 8-12 |
| `useActiveReminders.ts` | MEDIUM — polling | Mock api.ts, test subscriber pattern | 6-10 |
| `useSettingsCard.ts` | HIGH — massive state | Test tier change, settings sync | 10-15 |

**Total Phase 2 estimate: ~130-190 tests**

### Phase 3: Components (~10 key components)

| Component | Complexity | Testing Strategy | Tests |
|-----------|-----------|-----------------|-------|
| `ChatInput.tsx` (642 lines) | VERY HIGH | React Testing Library + user-event. Test autocomplete popup, key navigation, voice button, mode toggle | 15-25 |
| `ContainerChat.tsx` (755 lines) | VERY HIGH | Mock hooks, test loading states, call mode UI, ContextUsageRing, message list rendering | 12-20 |
| `MessageItem.tsx` (439 lines) | HIGH | Render with different message types (text, tool_trace, structured_response), test think toggle, actions | 12-18 |
| `App.tsx` (265 lines) | MEDIUM | Test modal/view routing, event listeners | 8-12 |
| `SettingsCard` + tabs | HIGH | Test each tab renders, form submission | 10-15 |
| `MarkdownRenderer.tsx` | LOW-MEDIUM | Test rendering of various markdown inputs | 8-12 |
| `StructuredResponseRenderer.tsx` | LOW | Test registry dispatch | 4-6 |
| `WeatherCard.tsx` | LOW | Test renders with different data | 4-6 |
| `NotesView.tsx` | MEDIUM | Test note list, search, folder navigation | 8-12 |
| `TitleBar.tsx` | LOW | Test window controls | 4-6 |
| `LateralBar.tsx` | LOW | Test navigation | 4-6 |
| `SkillResponseRegistry.ts` | LOW | Test register/get/has/list | 4-6 |

**Total Phase 3 estimate: ~90-140 tests**

### Phase 4: Integration Tests (~5-8 flows, still unit-level with mocks)

"Integration" here means testing the interaction between 2-3 units within a single process, with all external dependencies (IPC, network, filesystem) mocked. Not E2E tests.

| Flow | Scope | Tests |
|------|-------|-------|
| Chat send message | api.ts → useChatActions → state → MessageItem | 4-6 |
| Notes CRUD | IPC → notesService.ts → filesystem | 4-6 |
| TTS pipeline | useTTS → TTSServiceRenderer → audio playback | 4-6 |
| Settings load/save | api.ts → useSettingsCard → render | 4-6 |
| Python bootstrap flow | bootstrap sequence (unit test mocks) | 4-6 |
| App initialization | useAppInitialization → onboarding → settings sync | 4-6 |

**Total Phase 4 estimate: ~24-36 tests**

## Coverage Targets by Layer

| Layer | Target |
|-------|--------|
| Main process pure functions | 95%+ |
| Main process classes/services | 80%+ |
| Renderer pure functions | 95%+ |
| Renderer hooks | 85%+ |
| Renderer components | 80%+ |
| Node-core pure functions | 90%+ |
| Node-core services | 70%+ |
| **Overall** | **~90%** |

## Mocking Strategy

### Electron Main Process
- `vi.mock('electron')` — provide mock `app`, `ipcMain`, `BrowserWindow`, `Menu`, `Tray`, `dialog`, `shell`, `nativeImage`
- `vi.mock('electron-updater')` — mock `autoUpdater` event emitter
- `vi.mock('electron-log')` — spy on log methods
- `vi.mock('fs')` / `vi.mock('fs/promises')` — mock filesystem operations
- `vi.mock('child_process')` — mock `spawn`, `exec` for subprocess management

### Renderer
- `vi.stubGlobal('window.api', mockApi)` — mock preload bridge
- `vi.stubGlobal('window.electron', mockElectron)` — mock electron APIs
- Mock `AudioContext`, `HTMLAudioElement`, `WebSocket`
- Mock `api.ts` module at import level for hook tests
- Use `@testing-library/react` `render()` with providers (no router needed for most components)

### Node-Core
- Mock `fs`, `child_process`, `net` for service tests
- Mock HTTP requests for API route tests

## Quality Gates

1. **Lint before test:** `pnpm lint` must pass before tests run (already in fortscript pattern)
2. **Test run:** `pnpm test` must pass
3. **Coverage threshold:** 80% minimum per layer, enforced in vitest config
4. **CI integration:** Add test step to `.github/workflows/ci.yml`

## Dependencies to Add

```json
{
  "devDependencies": {
    "vitest": "^3.x",
    "@vitest/coverage-v8": "^3.x",
    "@testing-library/react": "^16.x",
    "@testing-library/jest-dom": "^6.x",
    "@testing-library/user-event": "^14.x",
    "jsdom": "^25.x"
  }
}
```

## Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| Electron APIs hard to mock in vitest | Use `vi.mock` with factory functions; test pure functions first without mocking Electron |
| AudioContext not available in jsdom | Mock globally; test TTS audio scheduling separately |
| SSE streaming complex to test | Extract parser as pure function; test chunks incrementally |
| WebSocket reconnection logic | Mock WebSocket class with controlled states |
| Large components hard to test (ChatInput 642 lines) | Consider extracting sub-components if needed |
