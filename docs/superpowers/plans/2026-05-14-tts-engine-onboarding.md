# TTS Engine Selection Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add TTS engine selection to onboarding Step 2, allowing users to choose between kokoro (Pro/Ultra only) and edge-tts (all tiers) instead of always defaulting to kokoro.

**Architecture:** Reorganize onboarding Step 2 into "Voice Settings" (engine + voice) + "Personality". Backend validates `tts_engine` per tier in PATCH/settings and apply-tier. CoreManager skips Python prewarm when Pro user chooses edge-tts. Lite tier always uses edge-tts (no Python).

**Tech Stack:** React/TypeScript (frontend), Node.js (node-core), Electron (main process)

---

### Task 1: Add i18n strings for TTS engine onboarding

**Files:**
- Modify: `apps/momai/src/renderer/src/i18n/locales/en-US.json`
- Modify: `apps/momai/src/renderer/src/i18n/locales/pt-BR.json`

- [ ] **Step 1: Add English strings**

Add after `"onboarding.voiceLabel"` line:

```json
"onboarding.ttsEngineLabel": "TTS Engine",
"onboarding.ttsEngine.kokoro": "Kokoro (Local)",
"onboarding.ttsEngine.kokoro.desc": "High quality, requires more resources",
"onboarding.ttsEngine.edge-tts": "Edge TTS (Cloud)",
"onboarding.ttsEngine.edge-tts.desc": "High quality, requires internet",
"onboarding.ttsEngine.internetHint": "Requires internet connection",
"onboarding.voiceSection": "Voice Settings",
"onboarding.personalitySection": "Personality"
```

- [ ] **Step 2: Add Portuguese strings**

Add after `"onboarding.voiceLabel"` line:

```json
"onboarding.ttsEngineLabel": "Motor de TTS",
"onboarding.ttsEngine.kokoro": "Kokoro (Local)",
"onboarding.ttsEngine.kokoro.desc": "Alta qualidade, requer mais recursos",
"onboarding.ttsEngine.edge-tts": "Edge TTS (Nuvem)",
"onboarding.ttsEngine.edge-tts.desc": "Alta qualidade, requer internet",
"onboarding.ttsEngine.internetHint": "Requer conexão com a internet",
"onboarding.voiceSection": "Configuração de Voz",
"onboarding.personalitySection": "Personalidade"
```

- [ ] **Step 3: Commit**

```bash
git add apps/momai/src/renderer/src/i18n/locales/en-US.json apps/momai/src/renderer/src/i18n/locales/pt-BR.json
git commit -m "feat: add i18n strings for TTS engine onboarding"
```

---

### Task 2: Restructure onboarding Step 2 with TTS engine selector

**Files:**
- Modify: `apps/momai/src/renderer/src/components/floating/OnboardingCard.tsx`

- [ ] **Step 1: Add `ttsEngine` state and VOICE_CATALOG per engine**

Replace the `VOICE_CATALOG` with per-engine catalogs. Add `TTS_ENGINES` constant. Add `selectedEngine` state.

Add after the existing `VOICE_CATALOG` (line 45):

```typescript
const TTS_ENGINES = [
  {
    id: 'kokoro',
    labelKey: 'onboarding.ttsEngine.kokoro',
    descKey: 'onboarding.ttsEngine.kokoro.desc'
  },
  {
    id: 'edge-tts',
    labelKey: 'onboarding.ttsEngine.edge-tts',
    descKey: 'onboarding.ttsEngine.edge-tts.desc'
  }
]

const EDGE_VOICE_CATALOG: LanguageGroup[] = [
  {
    langName: 'Português (Brasil)',
    code: 'p',
    voices: [
      { id: 'pt-BR-FranciscaNeural', name: 'Francisca (Feminina)', trait: 'female' },
      { id: 'pt-BR-AntonioNeural', name: 'Antônio (Masculina)', trait: 'male' }
    ]
  },
  {
    langName: 'English (US)',
    code: 'a',
    voices: [
      { id: 'en-US-AvaMultilingualNeural', name: 'Ava (Female)', trait: 'female' },
      { id: 'en-US-AndrewMultilingualNeural', name: 'Andrew (Male)', trait: 'male' }
    ]
  }
]
```

Add to the state declarations (after `selectedVoice` at line 134):

```typescript
const [selectedEngine, setSelectedEngine] = useState<string>('edge-tts')
```

Add a helper to get available engines per tier:

```typescript
function getAvailableEngines(tier: string | null): typeof TTS_ENGINES {
  if (tier === 'lite') return TTS_ENGINES.filter((e) => e.id === 'edge-tts')
  return TTS_ENGINES
}
```

Add a helper to get the current voice catalog:

```typescript
function getVoiceCatalog(engine: string): LanguageGroup[] {
  return engine === 'edge-tts' ? EDGE_VOICE_CATALOG : VOICE_CATALOG
}
```

- [ ] **Step 2: Update `handleSelectTier` to set default engine based on tier**

Add to `handleSelectTier` (after `setSelectedTier(tier)` at line 199):

```typescript
if (tier === 'lite') {
  setSelectedEngine('edge-tts')
} else {
  setSelectedEngine('kokoro')
}
```

- [ ] **Step 3: Update the payload in `handleFinish` to include `tts_engine`**

Add to the payload object (after `tts_voice: selectedVoice` at line 219):

```typescript
tts_engine: selectedEngine,
```

- [ ] **Step 4: Update loadExistingSettings to restore tts_engine**

Add to the settings loading (after `data.tts_voice` at line 153):

```typescript
if (data.tts_engine) setSelectedEngine(data.tts_engine)
```

- [ ] **Step 5: Replace the Step 2 render with reorganized sections**

**Replace** lines 606-638 (the voice selector block inside Step 2) with:

```tsx
{/* ─── Voice Settings Section ─── */}
<div>
  <div className="flex items-center gap-2 mb-4">
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-accent">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
    <span className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em]">
      {t('onboarding.voiceSection')}
    </span>
  </div>

  {/* TTS Engine Selector */}
  <div className="space-y-2 mb-4">
    <label className="text-[8px] font-black text-text-muted uppercase tracking-[0.2em] ml-1">
      {t('onboarding.ttsEngineLabel')}
    </label>
    <div className="grid grid-cols-2 gap-2">
      {getAvailableEngines(selectedTier).map((engine) => (
        <button
          key={engine.id}
          onClick={() => setSelectedEngine(engine.id)}
          className={`no-drag p-3 rounded-xl border text-left transition-all ${
            selectedEngine === engine.id
              ? 'bg-accent text-white border-accent shadow-lg shadow-accent/20'
              : 'bg-input border-border/20 text-text-muted hover:bg-white/[0.05]'
          }`}
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <div className="text-[11px] font-bold">{t(engine.labelKey)}</div>
          <div className={`text-[9px] mt-0.5 ${selectedEngine === engine.id ? 'text-white/70' : 'opacity-50'}`}>
            {t(engine.descKey)}
          </div>
          {engine.id === 'edge-tts' && selectedEngine === 'edge-tts' && (
            <div className="flex items-center gap-1 mt-1.5 text-[8px] font-semibold text-yellow-300">
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              {t('onboarding.ttsEngine.internetHint')}
            </div>
          )}
        </button>
      ))}
    </div>
  </div>

  {/* Voice Selector */}
  <div className="space-y-2">
    <label className="text-[8px] font-black text-text-muted uppercase tracking-[0.2em] ml-1">
      {t('onboarding.voiceLabel')}
    </label>
    <div className="relative group">
      <select
        value={selectedVoice}
        onChange={(e) => setSelectedVoice(e.target.value)}
        className="no-drag w-full bg-input border border-border/20 rounded-lg px-4 py-3 text-xs font-bold text-text outline-none focus:border-accent/40 appearance-none cursor-pointer"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        {getVoiceCatalog(selectedEngine)
          .find((g) => g.code === selectedLang)
          ?.voices.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
      </select>
      <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none opacity-20">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </div>
    </div>
  </div>
</div>

{/* ─── Divider ─── */}
<div className="border-t border-white/5 my-2" />

{/* ─── Personality Section ─── */}
<div>
  <div className="flex items-center gap-2 mb-4">
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-accent">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
    <span className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em]">
      {t('onboarding.personalitySection')}
    </span>
  </div>
```

- [ ] **Step 6: Remove the old conditional voice selector and old sections**

Remove lines 606-638 (the entire `{(selectedTier === 'pro' || selectedTier === 'ultra') && ( ... )}` block) and also remove the sections that were replaced by the new code above (name, theme, language selectors already exist above the new voice section — keep those as part of Personality).

Wait — the current Step 2 renders: Back button, title, then Name Input, then grid with Theme + Language, then Voice selector (conditional). We want: Back button, title, then Voice Settings section, then divider, then Personality section (Name, Theme, Language).

So we need to:
1. Remove the old name/theme/language/voice block (lines 518-638)
2. Insert new voice section + divider + personality section

Actually, looking more carefully at the current structure:

Lines 518-638 contain:
- Name input (519-533)
- Grid with Theme + Language (535-604)  
- Voice selector (606-638) — conditional on Pro/Ultra

We want:
- Voice Settings section (engine selector + voice selector)
- Divider
- Personality section (Name, Theme, Language)

The name/theme/language should move under "Personality". So essentially we rearrange what's already there.

Let me re-examine more carefully. The full Step 2 render:

```
<div className="w-full max-w-sm mx-auto space-y-8 animate-fade-in">
  <div className="space-y-1">
    <!-- Back button + Title -->
  </div>

  <div className="space-y-6">
    <!-- Name Input (lines 519-533) -->
    <!-- Grid: Theme + Language (lines 535-604) -->
    <!-- Voice selector conditional (lines 606-638) -->
  </div>

  <!-- Finish button (lines 641-657) -->
</div>
```

The change:
1. Replace `<div className="space-y-6">` with new structure
2. Name, Theme, Language move under "Personality" heading
3. New engine selector + voice under "Voice Settings" heading
4. Both sections in the same `<div className="space-y-6">`

Actually this is getting complex for the plan. Let me simplify - replace the entire `<div className="space-y-6">` block (lines 518-639) with the new reorganized version.

- [ ] **Step 7: Implement the final code change**

Replace everything from the `space-y-6` div in Step 2 (lines 518-639) with:

```tsx
<div className="space-y-6">
  {/* ─── Voice Settings Section ─── */}
  <div>
    <div className="flex items-center gap-2 mb-4">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-accent">
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
        <line x1="12" y1="19" x2="12" y2="23" />
        <line x1="8" y1="23" x2="16" y2="23" />
      </svg>
      <span className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em]">
        {t('onboarding.voiceSection')}
      </span>
    </div>

    {/* TTS Engine Selector */}
    <div className="space-y-2 mb-4">
      <label className="text-[8px] font-black text-text-muted uppercase tracking-[0.2em] ml-1">
        {t('onboarding.ttsEngineLabel')}
      </label>
      <div className="grid grid-cols-2 gap-2">
        {getAvailableEngines(selectedTier).map((engine) => (
          <button
            key={engine.id}
            onClick={() => setSelectedEngine(engine.id)}
            className={`no-drag p-3 rounded-xl border text-left transition-all ${
              selectedEngine === engine.id
                ? 'bg-accent text-white border-accent shadow-lg shadow-accent/20'
                : 'bg-input border-border/20 text-text-muted hover:bg-white/[0.05]'
            }`}
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            <div className="text-[11px] font-bold">{t(engine.labelKey)}</div>
            <div className={`text-[9px] mt-0.5 ${selectedEngine === engine.id ? 'text-white/70' : 'opacity-50'}`}>
              {t(engine.descKey)}
            </div>
            {engine.id === 'edge-tts' && selectedEngine === 'edge-tts' && (
              <div className="flex items-center gap-1 mt-1.5 text-[8px] font-semibold text-yellow-300">
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                {t('onboarding.ttsEngine.internetHint')}
              </div>
            )}
          </button>
        ))}
      </div>
    </div>

    {/* Voice Selector */}
    <div className="space-y-2">
      <label className="text-[8px] font-black text-text-muted uppercase tracking-[0.2em] ml-1">
        {t('onboarding.voiceLabel')}
      </label>
      <div className="relative group">
        <select
          value={selectedVoice}
          onChange={(e) => setSelectedVoice(e.target.value)}
          className="no-drag w-full bg-input border border-border/20 rounded-lg px-4 py-3 text-xs font-bold text-text outline-none focus:border-accent/40 appearance-none cursor-pointer"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          {getVoiceCatalog(selectedEngine)
            .find((g) => g.code === selectedLang)
            ?.voices.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
        </select>
        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none opacity-20">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>
      </div>
    </div>
  </div>

  {/* ─── Divider ─── */}
  <div className="border-t border-white/5" />

  {/* ─── Personality Section ─── */}
  <div>
    <div className="flex items-center gap-2 mb-4">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-accent">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
      <span className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em]">
        {t('onboarding.personalitySection')}
      </span>
    </div>

    {/* Name Input */}
    <div className="space-y-2 mb-4">
      <label className="text-[8px] font-black text-text-muted uppercase tracking-[0.2em] ml-1">
        {t('onboarding.nameLabel')}
      </label>
      <input
        type="text"
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="no-drag w-full bg-input border border-border/20 rounded-lg px-3.5 py-3 text-sm font-bold text-text focus:border-accent/40 outline-none transition-all placeholder:opacity-10 shadow-inner select-text"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        placeholder={t('onboarding.namePlaceholder')}
      />
    </div>

    {/* Theme + Language Grid */}
    <div className="grid grid-cols-2 gap-4">
      <div className="space-y-2">
        <label className="text-[8px] font-black text-text-muted uppercase tracking-[0.2em] ml-1">
          {t('onboarding.themeLabel')}
        </label>
        <div className="relative group">
          <select
            value={theme}
            onChange={(e) => changeTheme(e.target.value as Theme)}
            className="no-drag w-full bg-input border border-border/20 rounded-lg px-3 py-2 text-[10px] font-bold text-text outline-none focus:border-accent/40 appearance-none cursor-pointer"
          >
            <option value="dark">{t('onboarding.theme.dark')}</option>
            <option value="light">{t('onboarding.theme.light')}</option>
          </select>
          <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none opacity-20">
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-[8px] font-black text-text-muted uppercase tracking-[0.2em] ml-1">
          Language
        </label>
        <div className="relative group">
          <select
            value={selectedLang}
            onChange={(e) => {
              const newLang = e.target.value
              setSelectedLang(newLang)
              const group = getVoiceCatalog(selectedEngine).find((g) => g.code === newLang)
              if (group) {
                setSelectedVoice(group.voices[0].id)
                setLocale(newLang === 'p' ? 'pt-BR' : ('en-US' as any))
              }
            }}
            className="no-drag w-full bg-input border border-border/20 rounded-lg px-3 py-2 text-[10px] font-bold text-text outline-none focus:border-accent/40 appearance-none cursor-pointer"
          >
            {getVoiceCatalog(selectedEngine).map((g) => (
              <option key={g.code} value={g.code}>
                {g.langName}
              </option>
            ))}
          </select>
          <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none opacity-20">
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
```

- [ ] **Step 6: Commit**

```bash
git add apps/momai/src/renderer/src/components/floating/OnboardingCard.tsx
git commit -m "feat: add TTS engine selector to onboarding Step 2"
```

---

### Task 3: Backend validation — enforce tts_engine per tier

**Files:**
- Modify: `apps/momai/scripts/node-core/api/routes/settings.routes.js`
- Modify: `apps/momai/scripts/node-core/api/routes/status.routes.js`
- Modify: `apps/momai/scripts/node-core/infrastructure/store.js`

- [ ] **Step 1: Add `tts_engine` default to store**

In `store.js` `defaultStore()` settings, add after `tts_voice` (line 35):

```js
tts_engine: 'kokoro',
```

- [ ] **Step 2: Add validation helper to settings.routes.js**

After the imports/preamble, add a helper function:

```js
function enforceTtsEnginePerTier(tier, currentEngine) {
  if (tier === 'lite') {
    return 'edge-tts' // Lite cannot use kokoro
  }
  return currentEngine || 'kokoro'
}
```

- [ ] **Step 3: Update PATCH /settings in settings.routes.js**

After line 50 (`Object.assign(store.settings, payload)`), add:

```js
if (payload.tts_engine) {
  store.settings.tts_engine = enforceTtsEnginePerTier(
    store.settings.ai_tier || 'pro',
    payload.tts_engine
  )
}
```

In the tier-enforcement section (lines 59-78), after each tier branch, also enforce tts_engine:

For `'lite'` (line 61), add:
```js
store.settings.tts_engine = 'edge-tts'
```

For `'pro'` (line 63), if payload doesn't include tts_engine, keep current. No change needed — the code above already enforces when `payload.tts_engine` is set.

Wait, the apply-tier case (PATCH with ai_tier but no tts_engine) needs the default. Let me think...

Actually, looking more carefully: when the tier changes (e.g., from Lite to Pro), and no `tts_engine` was in the payload, the existing `tts_engine` could be `'edge-tts'` from Lite. That's fine — they can keep edge-tts on Pro. The validation only needs to enforce Lite.

For `'lite'` in both branches (lines 61 and 72-73), add:
```js
store.settings.tts_engine = 'edge-tts'
```

This ensures Lite always uses edge-tts.

- [ ] **Step 4: Update apply-tier in status.routes.js**

After line 139 (`store.settings.tts_enabled = false`), add:
```js
store.settings.tts_engine = 'edge-tts'
```

- [ ] **Step 5: Update POST /mode in settings.routes.js**

For the `'lite'` branch (line 121-123), add:
```js
store.settings.tts_engine = 'edge-tts'
```

- [ ] **Step 6: Commit**

```bash
git add apps/momai/scripts/node-core/api/routes/settings.routes.js apps/momai/scripts/node-core/api/routes/status.routes.js apps/momai/scripts/node-core/infrastructure/store.js
git commit -m "feat: enforce tts_engine per tier in backend routes"
```

---

### Task 4: Update handleTierChange in frontend settings hook

**Files:**
- Modify: `apps/momai/src/renderer/src/hooks/useSettingsCard.ts`

- [ ] **Step 1: Add `tts_engine` to handleTierChange payload**

In `handleTierChange` function, after the `POST /setup/apply-tier` call, the `PATCH /settings` payload should include `tts_engine`. Find the payload construction around line 240:

```ts
const tierPayload: Record<string, any> = {
  ai_tier: _tier,
  tts_enabled: TIER_DEFAULTS[_tier].tts_enabled,
  wake_word_enabled: TIER_DEFAULTS[_tier].wake_word_enabled
}
```

Add:
```ts
if (_tier === 'lite') {
  tierPayload.tts_engine = 'edge-tts'
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/momai/src/renderer/src/hooks/useSettingsCard.ts
git commit -m "feat: include tts_engine in handleTierChange for Lite"
```

---

### Task 5: Conditional Python prewarm based on engine

**Files:**
- Modify: `apps/momai/src/main/coreManager.ts`

- [ ] **Step 1: Read tts_engine from store during startup prewarm decision**

Replace lines 623-636:

```ts
const tier = getCurrentTier()
if (tier && tier !== 'lite') {
  void ensurePythonSidecar()
```

With:

```ts
const tier = getCurrentTier()
const ttsEngine = getCurrentTtsEngine()
// Skip Python prewarm if Pro user chose edge-tts (no Python needed for TTS).
// Ultra always needs Python for whisper/STT regardless of TTS engine.
if (tier === 'ultra' || (tier === 'pro' && ttsEngine === 'kokoro')) {
  void ensurePythonSidecar()
```

Add the `getCurrentTtsEngine()` helper near `getCurrentTier()` (after line 41):

```ts
function getCurrentTtsEngine(): string | null {
  const storePath = join(app.getPath('userData'), 'data', 'node-core-store.json')
  try {
    if (existsSync(storePath)) {
      const data = JSON.parse(readFileSync(storePath, 'utf-8'))
      return data.settings?.tts_engine || null
    }
  } catch (e) {
    logger.warn('[CoreManager] Error reading tts_engine from store:', e)
  }
  return null
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/momai/src/main/coreManager.ts
git commit -m "feat: conditional Python prewarm based on tts_engine"
```

---

### Task 6: Build, lint, and verify

**Files:** All modified files above.

- [ ] **Step 1: Run typecheck**

Run: `cd apps/momai && pnpm typecheck`
Expected: No type errors. If there are, fix them.

- [ ] **Step 2: Run lint**

Run: `cd apps/momai && pnpm lint`
Expected: No lint errors. Fix any issues.

- [ ] **Step 3: Verify build**

Run: `cd apps/momai && pnpm build` (or the specific build command that compiles the renderer)

Expected: Build succeeds.
