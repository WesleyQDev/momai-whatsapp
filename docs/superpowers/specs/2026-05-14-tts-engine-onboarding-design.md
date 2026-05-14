# TTS Engine Selection During Onboarding

## Problem

Currently, Pro and Ultra tiers always initialize the Python sidecar with kokoro-ONNX for TTS. Users have no choice of TTS engine during onboarding, even though edge-tts (cloud) and say.js (system) are available and much lighter on resources.

## Design

### Onboarding Flow (OnboardingCard.tsx)

**Step 1** — Tier selection (Lite / Pro / Ultra). No changes.

**Step 2** — Reorganized into two sub-sections:

1. **Configuração de Voz** (Voice Settings)
   - TTS engine selector (radio buttons):
     - `kokoro` — only for Pro/Ultra (local, Python-heavy)
     - `edge-tts` — all tiers (cloud, lightweight, needs internet)
     - `say` — excluded from onboarding, only in Settings
   - When `edge-tts` is selected, show an internet-required hint
   - Voice dropdown that updates depending on selected engine (different engines have different voice sets)
2. **Personalidade** (Personality)
   - Name, theme, language — unchanged

### Per-Tier Behavior

| Tier | TTS Engine Options | Default | Python Prewarm |
|------|-------------------|---------|----------------|
| Lite | edge-tts only | edge-tts | Never |
| Pro  | kokoro, edge-tts | kokoro | Only if kokoro selected |
| Ultra| kokoro, edge-tts | kokoro | Always (whisper/STT) |

### Voice Selection Per Engine

- **kokoro**: Existing voices (`pf_dora`, `af_heart`, `am_mich`, etc.)
- **edge-tts**: Microsoft Neural voices (already mapped in `src/main/ttsService.ts`)
- Engine switch updates the voice dropdown; if current voice doesn't exist in new engine, select first available

### Backend Changes

**Store (`store.js`)**: Default `tts_engine: 'kokoro'` (unchanged, overridden during onboarding).

**Settings routes (`settings.routes.js`)**:
- Accept `tts_engine` in `PATCH /settings`
- Validate per tier: reject `kokoro` for Lite
- On mode switch to Lite: coerce `tts_engine` to `edge-tts`

**Apply-tier (`status.routes.js` POST `/setup/apply-tier`)**:
- Lite: save `tts_engine: 'edge-tts'`
- Pro/Ultra: keep existing or default `kokoro`

**Node-core TTS (`tts-service.js`)**: `triggerAutoTts()` already branches by engine — just read `store.settings.tts_engine`.

**Core Manager (`coreManager.ts`)**: Adjust prewarm logic:
```
if tier == 'pro' && settings.tts_engine == 'edge-tts':
    skip Python prewarm
if tier == 'ultra':
    always prewarm
```
Persist chosen engine locally so it's available at next startup.

### Settings UI

The existing Settings page gains a TTS engine dropdown showing all three options (`kokoro`, `edge-tts`, `say`), since `say` is available there but hidden from onboarding.

### Files Changed

| File | Change |
|------|--------|
| `apps/momai/src/renderer/src/components/floating/OnboardingCard.tsx` | Add engine selector, restructure Step 2, conditional voice dropdown, internet hint |
| `apps/momai/src/renderer/src/main/ttsService.ts` | No changes needed (already supports all engines) |
| `apps/momai/scripts/node-core/infrastructure/store.js` | Default tts_engine |
| `apps/momai/scripts/node-core/api/routes/settings.routes.js` | Validate + persist tts_engine per tier |
| `apps/momai/scripts/node-core/api/routes/status.routes.js` | Set tts_engine in apply-tier |
| `apps/momai/scripts/node-core/services/tts-service.js` | Read tts_engine from settings |
| `apps/momai/src/main/coreManager.ts` | Conditional Python prewarm based on engine |
| `apps/momai/src/renderer/src/i18n/locales/en-US.json` | Translate new strings |
| `apps/momai/src/renderer/src/i18n/locales/pt-BR.json` | Translate new strings |
