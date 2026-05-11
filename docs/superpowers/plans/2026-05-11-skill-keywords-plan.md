# Skill Keywords Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. MUST follow TDD (test-driven-development): write failing test first, watch it fail, then implement minimal code.

**Goal:** Allow users to define custom voice trigger keywords per skill, enabling direct skill execution without the "Luna" wake word.

**Architecture:** KeywordRouter service in Node Core checks transcribed text against per-skill keywords before falling through to normal LLM processing. Keywords stored in `store.skillKeywords`, seeded from SKILL.md intents on install, auto-cleaned on uninstall. Frontend settings UI shares the same `GET /extensions` payload.

**Tech Stack:** Node.js (Node Core), React/TypeScript (renderer), Vitest

---

### Task 0: Add vitest project for node-core script tests

**Files:**
- Modify: `vitest.config.ts`

Add a new vitest project for scripts/node-core tests:

```typescript
{
  test: {
    name: 'scripts',
    root: resolve(__dirname, 'scripts/node-core'),
    environment: 'node',
    include: ['**/*.test.js'],
    coverage: {
      include: ['scripts/node-core/**/*.js'],
      exclude: ['scripts/node-core/**/*.test.js']
    }
  }
}
```

Insert this as the first project entry (before `main`).

Commit:
```bash
git add apps/momai/vitest.config.ts
git commit -m "chore: add vitest project for node-core scripts"
```

---

### Task 1: Add `skillKeywords` to store default

**Files:**
- Modify: `scripts/node-core/infrastructure/store.js`

TDD: Write a test that verifies `skillKeywords` exists in the default store as `{}`, then add the field.

- **RED**: Write test in `tests/store.test.js`:
```javascript
const { defaultStore } = require('../../infrastructure/store')

test('defaultStore includes empty skillKeywords', () => {
  const store = defaultStore()
  expect(store.skillKeywords).toEqual({})
})
```

Run: `npx vitest run --project scripts tests/store.test.js` — expect FAIL

- **GREEN**: In `defaultStore()`, add after `next_gaming_app_id`:
```javascript
skillKeywords: {},
```

Run: `npx vitest run --project scripts tests/store.test.js` — expect PASS

Commit:
```bash
git add apps/momai/scripts/node-core/tests/store.test.js apps/momai/scripts/node-core/infrastructure/store.js
git commit -m "feat: add skillKeywords to default store schema"
```

---

### Task 2: Create KeywordRouter service with tests

**Files:**
- Create: `scripts/node-core/services/keyword-router.js`
- Create: `tests/keyword-router.test.js`

Build the pure matching logic with TDD. Write tests for `tokenize`, `matchKeyword`, and `routeByKeyword`.

**RED — Test 1: tokenize**:
```javascript
const { routeByKeyword, tokenize, matchKeyword } = require('../services/keyword-router')

describe('tokenize', () => {
  test('lowercases and splits on whitespace', () => {
    expect(tokenize('Abre Pasta X')).toEqual(['abre', 'pasta', 'x'])
  })
  test('trims and removes empty tokens', () => {
    expect(tokenize('  abre   pasta  ')).toEqual(['abre', 'pasta'])
  })
  test('returns empty array for empty string', () => {
    expect(tokenize('')).toEqual([])
  })
})
```

Run: `npx vitest run --project scripts tests/keyword-router.test.js` — expect FAIL

**GREEN**: Implement `tokenize`:
```javascript
function tokenize(text) {
  return text.toLowerCase().trim().split(/\s+/).filter(Boolean)
}
```

**RED — Test 2: matchKeyword**:
```javascript
describe('matchKeyword', () => {
  test('matches exact prefix tokens', () => {
    expect(matchKeyword(['abre', 'pasta'], ['abre'])).toBe(true)
  })
  test('matches with skipped words between keyword tokens', () => {
    expect(matchKeyword(['manda', 'uma', 'mensagem'], ['manda', 'mensagem'])).toBe(true)
  })
  test('does not match when keyword not at start subsequence', () => {
    expect(matchKeyword(['por', 'favor', 'abre'], ['abre'])).toBe(true)
  })
  test('returns false when keyword tokens not found', () => {
    expect(matchKeyword(['abre', 'pasta'], ['fecha'])).toBe(false)
  })
  test('returns false for empty input', () => {
    expect(matchKeyword([], ['abre'])).toBe(false)
  })
  test('handles multi-token keywords', () => {
    expect(matchKeyword(['manda', 'mensagem', 'hoje'], ['manda', 'mensagem'])).toBe(true)
  })
})
```

**GREEN**: Implement `matchKeyword`:
```javascript
function matchKeyword(inputTokens, keywordTokens) {
  let inputIdx = 0
  for (const kt of keywordTokens) {
    while (inputIdx < inputTokens.length && inputTokens[inputIdx] !== kt) {
      inputIdx++
    }
    if (inputIdx >= inputTokens.length) return false
    inputIdx++
  }
  return true
}
```

**RED — Test 3: routeByKeyword (with mock skillRegistry)**:
```javascript
describe('routeByKeyword', () => {
  const mockRegistry = {
    getById: (id) => {
      const skills = {
        launcher: { id: 'launcher', enabled: true },
        whatsapp: { id: 'whatsapp', enabled: true },
        disabledSkill: { id: 'disabledSkill', enabled: false }
      }
      return skills[id] || null
    }
  }

  beforeEach(() => {
    // Clear shared store
    const shared = require('../services/shared-state')
    shared.store.skillKeywords = {}
  })

  test('returns match for keyword prefix', () => {
    const shared = require('../services/shared-state')
    shared.store.skillKeywords = { launcher: ['abre', 'abra'] }

    const result = routeByKeyword('abre pasta x', mockRegistry)
    expect(result).toEqual({ skillId: 'launcher', keyword: 'abre' })
  })

  test('returns null when no keyword matches', () => {
    const shared = require('../services/shared-state')
    shared.store.skillKeywords = { launcher: ['abre'] }

    const result = routeByKeyword('fecha pasta x', mockRegistry)
    expect(result).toBeNull()
  })

  test('returns null for disabled skill', () => {
    const shared = require('../services/shared-state')
    shared.store.skillKeywords = { disabledSkill: ['teste'] }

    const result = routeByKeyword('teste qualquer', mockRegistry)
    expect(result).toBeNull()
  })

  test('returns null for empty input', () => {
    const result = routeByKeyword('', mockRegistry)
    expect(result).toBeNull()
  })

  test('handles multi-token keyword with skipped words', () => {
    const shared = require('../services/shared-state')
    shared.store.skillKeywords = { whatsapp: ['manda mensagem'] }

    const result = routeByKeyword('manda uma mensagem para o pai', mockRegistry)
    expect(result).toEqual({ skillId: 'whatsapp', keyword: 'manda mensagem' })
  })
})
```

**GREEN**: Implement `routeByKeyword`:
```javascript
const shared = require('./shared-state')

function getKeywords() {
  return shared.store.skillKeywords || {}
}

function tokenize(text) {
  return text.toLowerCase().trim().split(/\s+/).filter(Boolean)
}

function matchKeyword(inputTokens, keywordTokens) {
  let inputIdx = 0
  for (const kt of keywordTokens) {
    while (inputIdx < inputTokens.length && inputTokens[inputIdx] !== kt) {
      inputIdx++
    }
    if (inputIdx >= inputTokens.length) return false
    inputIdx++
  }
  return true
}

function routeByKeyword(text, skillRegistry) {
  const normalized = text.toLowerCase().trim()
  if (!normalized) return null

  const inputTokens = tokenize(normalized)
  const keywords = getKeywords()

  for (const [skillId, words] of Object.entries(keywords)) {
    const skill = skillRegistry.getById(skillId)
    if (!skill || !skill.enabled) continue

    for (const kw of words) {
      const kwTokens = tokenize(kw)
      if (matchKeyword(inputTokens, kwTokens)) {
        return { skillId, keyword: kw }
      }
    }
  }

  return null
}

module.exports = { routeByKeyword, tokenize, matchKeyword }
```

Run all tests: PASS

Commit:
```bash
git add apps/momai/scripts/node-core/tests/keyword-router.test.js apps/momai/scripts/node-core/services/keyword-router.js
git commit -m "feat: create KeywordRouter service for skill trigger matching"
```

---

### Task 3: Integrate KeywordRouter into voice command flow

**Files:**
- Modify: `scripts/node-core/services/chat-service.js`

Add keyword routing check in `runVoiceCommand` before the LLM call.

Add at top: `const { routeByKeyword } = require('./keyword-router')`

Add in `runVoiceCommand` after the `debug(...)` line:

```javascript
const skillRegistry = shared.skillRegistry
if (skillRegistry) {
  const match = routeByKeyword(content, skillRegistry)
  if (match) {
    debug(`[voice-cmd] Keyword "${match.keyword}" matched "${match.skillId}", routing directly`)
    broadcast({ type: 'assistant', data: { status: `Executando skill...` } })
    try {
      const result = await skillRegistry.execute(match.skillId, { content })
      broadcast({ type: 'assistant', data: { content: result?.directResponse || 'Feito.' } })
    } catch (err) {
      broadcast({ type: 'assistant', data: { error: `Skill error: ${err.message}` } })
    }
    return
  }
}
```

Commit:
```bash
git add apps/momai/scripts/node-core/services/chat-service.js
git commit -m "feat: integrate KeywordRouter into voice command flow"
```

---

### Task 4: Seed keywords from SKILL.md on install, cleanup on uninstall

**Files:**
- Modify: `scripts/node-core/api/routes/extensions.routes.js`

**After install** (after `skillRegistry.loadExtensions()`): seed keywords from intents:

```javascript
const installedSkill = skillRegistry.getById(id)
if (installedSkill && installedSkill.manifest?.intents?.length) {
  if (!store.skillKeywords) store.skillKeywords = {}
  if (!store.skillKeywords[id] || store.skillKeywords[id].length === 0) {
    store.skillKeywords[id] = installedSkill.manifest.intents
    saveStore()
  }
}
```

**Before uninstall** (before `store.extensions.filter`): clean up keywords:

```javascript
if (store.skillKeywords) {
  delete store.skillKeywords[extId]
}
```

Commit:
```bash
git add apps/momai/scripts/node-core/api/routes/extensions.routes.js
git commit -m "feat: auto-seed keywords on install, cleanup on uninstall"
```

---

### Task 5: Include keywords in extensions payload

**Files:**
- Modify: `scripts/node-core/services/skill-orchestrator.js`

In `buildExtensionsPayload`, inside the map callback return object (around line 74-99), add after `features:`:

```javascript
keywords: store.skillKeywords?.[manifest.id || skill.id] || [],
```

`store` is already imported via `const store = shared.store`.

Commit:
```bash
git add apps/momai/scripts/node-core/services/skill-orchestrator.js
git commit -m "feat: include keywords in extensions API payload"
```

---

### Task 6: Create Skills keywords API routes

**Files:**
- Create: `scripts/node-core/api/routes/skills.routes.js`
- Modify: `scripts/node-core/index.js`

Create routes:

```javascript
function createSkillsRoutes(context) {
  const { sendJson, readJsonBody, store, saveStore } = context

  return async function handleSkillsRoutes(req, res, pathname) {
    if (pathname === '/skills/keywords' && req.method === 'GET') {
      sendJson(res, 200, store.skillKeywords || {})
      return true
    }

    const match = pathname.match(/^\/skills\/keywords\/([^/]+)$/)
    if (match && req.method === 'PUT') {
      const skillId = match[1]
      const body = await readJsonBody(req).catch(() => ({}))
      const keywords = Array.isArray(body.keywords) ? body.keywords : []
      const normalized = keywords.map((k) => String(k).trim()).filter(Boolean)

      if (!store.skillKeywords) store.skillKeywords = {}
      store.skillKeywords[skillId] = normalized
      saveStore()
      sendJson(res, 200, { ok: true, keywords: normalized })
      return true
    }

    return false
  }
}

module.exports = { createSkillsRoutes }
```

Register in `index.js`:

```javascript
const { createSkillsRoutes } = require('./api/routes/skills.routes')

// In router array:
createSkillsRoutes(context)
```

Commit:
```bash
git add apps/momai/scripts/node-core/api/routes/skills.routes.js apps/momai/scripts/node-core/index.js
git commit -m "feat: add skills keywords API routes"
```

---

### Task 7: Add i18n strings and Tab type for skills settings

**Files:**
- Modify: `src/renderer/src/i18n/locales/en-US.json`
- Modify: `src/renderer/src/i18n/locales/pt-BR.json`
- Modify: `src/renderer/src/hooks/useSettingsCard.ts`

Add to `en-US.json`:
```json
  "settings.tabs.skills": "Skills",
  "settings.skills.title": "Skills",
  "settings.skills.subtitle": "Configure custom voice triggers for each skill",
  "settings.skills.noKeywords": "No custom keywords",
  "settings.skills.addKeyword": "Add word",
  "settings.skills.save": "Save",
  "settings.skills.cancel": "Cancel",
  "settings.skills.edit": "Edit",
  "settings.skills.keywordsInUse": "This word is already in use by:",
```

Add to `pt-BR.json`:
```json
  "settings.tabs.skills": "Skills",
  "settings.skills.title": "Skills",
  "settings.skills.subtitle": "Configure gatilhos de voz personalizados para cada skill",
  "settings.skills.noKeywords": "Nenhuma palavra-chave",
  "settings.skills.addKeyword": "Adicionar palavra",
  "settings.skills.save": "Salvar",
  "settings.skills.cancel": "Cancelar",
  "settings.skills.edit": "Editar",
  "settings.skills.keywordsInUse": "Essa palavra já está em uso por:",
```

Update Tab type:
```typescript
export type Tab = 'general' | 'brain' | 'updates' | 'economy' | 'voice' | 'logs' | 'developer' | 'skills'
```

Commit:
```bash
git add apps/momai/src/renderer/src/i18n/locales/en-US.json apps/momai/src/renderer/src/i18n/locales/pt-BR.json apps/momai/src/renderer/src/hooks/useSettingsCard.ts
git commit -m "feat: add i18n strings and Tab type for skills settings"
```

---

### Task 8: Add frontend API methods for keywords

**Files:**
- Modify: `src/renderer/src/services/api.ts`

After the extensions block (line 461), add:

```typescript
export async function fetchSkillKeywords(): Promise<Record<string, string[]>> {
  const response = await fetch(`${API_URL}/skills/keywords`)
  if (!response.ok) throw new Error('Erro ao buscar palavras-chave')
  return response.json()
}

export async function updateSkillKeywords(
  skillId: string,
  keywords: string[]
): Promise<void> {
  const response = await fetch(`${API_URL}/skills/keywords/${skillId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keywords })
  })
  if (!response.ok) throw new Error('Erro ao salvar palavras-chave')
}
```

Commit:
```bash
git add apps/momai/src/renderer/src/services/api.ts
git commit -m "feat: add frontend API methods for skill keywords"
```

---

### Task 9: Create SkillsTab settings component

**Files:**
- Create: `src/renderer/src/components/floating/settings/tabs/SkillsTab.tsx`

TDD: Write render test first.

**RED** — Create `src/renderer/src/components/floating/settings/tabs/SkillsTab.test.tsx`:
```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SkillsTab } from './SkillsTab'

vi.mock('../../../../services/api', () => ({
  api: {
    fetchExtensions: vi.fn().mockResolvedValue([
      { id: 'launcher', name: 'Launcher', category: 'core', enabled: true },
      { id: 'whatsapp', name: 'WhatsApp', category: 'extension', enabled: false }
    ]),
    fetchSkillKeywords: vi.fn().mockResolvedValue({
      launcher: ['abre', 'abrir'],
      whatsapp: ['mensagem']
    }),
    updateSkillKeywords: vi.fn()
  }
}))

vi.mock('../../../../i18n', () => ({
  useI18n: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        'settings.skills.title': 'Skills',
        'settings.skills.subtitle': 'Configure custom voice triggers',
        'settings.skills.noKeywords': 'No custom keywords',
        'settings.skills.edit': 'Edit',
        'settings.skills.addKeyword': 'Add word',
        'settings.skills.save': 'Save',
        'settings.skills.cancel': 'Cancel',
        'settings.skills.keywordsInUse': 'This word is already in use by:',
        'settings.tabs.skills': 'Skills'
      }
      return map[key] || key
    }
  })
}))

describe('SkillsTab', () => {
  it('renders skills with their keywords', async () => {
    render(<SkillsTab />)
    expect(await screen.findByText('Launcher')).toBeTruthy()
    expect(await screen.findByText('abre')).toBeTruthy()
    expect(await screen.findByText('abrir')).toBeTruthy()
    expect(await screen.findByText('WhatsApp')).toBeTruthy()
    expect(await screen.findByText('mensagem')).toBeTruthy()
    expect(await screen.findByText('off')).toBeTruthy()
  })
})
```

Run: `npx vitest run --project renderer SkillsTab.test.tsx` — expect FAIL

**GREEN**: Create SkillsTab.tsx:

```typescript
import React, { useEffect, useState } from 'react'
import { api } from '../../../../services/api'
import { useI18n } from '../../../../i18n'

interface SkillEntry {
  id: string
  name: string
  description: string
  category: string
  enabled: boolean
  icon?: string
  keywords?: string[]
}

export function SkillsTab() {
  const { t } = useI18n()
  const [skills, setSkills] = useState<SkillEntry[]>([])
  const [keywordsMap, setKeywordsMap] = useState<Record<string, string[]>>({})
  const [editing, setEditing] = useState<string | null>(null)
  const [editBuffer, setEditBuffer] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  async function loadData() {
    try {
      const [extensions, keywords] = await Promise.all([
        api.fetchExtensions(),
        api.fetchSkillKeywords()
      ])
      setSkills(extensions.filter((s: any) => s.category !== 'community'))
      setKeywordsMap(keywords)
    } catch (err) {
      console.error('Failed to load skills:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [])

  async function handleSave(skillId: string) {
    const normalized = editBuffer.map((k) => k.trim()).filter((k) => k.length > 0)

    const conflictMap: Record<string, string[]> = {}
    for (const kw of normalized) {
      for (const [sid, words] of Object.entries(keywordsMap)) {
        if (sid !== skillId && words.includes(kw)) {
          if (!conflictMap[kw]) conflictMap[kw] = []
          conflictMap[kw].push(sid)
        }
      }
    }
    if (Object.keys(conflictMap).length > 0) {
      const conflicts = Object.entries(conflictMap)
        .map(([kw, ids]) => `${kw} → ${ids.join(', ')}`)
        .join('; ')
      alert(`${t('settings.skills.keywordsInUse')} ${conflicts}`)
      return
    }

    await api.updateSkillKeywords(skillId, normalized)
    setKeywordsMap((prev) => ({ ...prev, [skillId]: normalized }))
    setEditing(null)
  }

  function startEdit(skillId: string) {
    setEditBuffer([...(keywordsMap[skillId] || [])])
    setEditing(skillId)
  }

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 bg-white/5 rounded-xl" />
        ))}
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-lg font-bold text-text">{t('settings.skills.title')}</h2>
        <p className="text-sm text-text-muted mt-1">{t('settings.skills.subtitle')}</p>
      </div>

      <div className="space-y-2">
        {skills.map((skill) => (
          <div key={skill.id} className="flex items-center justify-between p-4 rounded-xl bg-white/[0.03] border border-border/20">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-text text-sm">{skill.name}</span>
                {!skill.enabled && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-text-muted/10 text-text-muted uppercase tracking-wider">
                    off
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {(keywordsMap[skill.id] || []).length > 0 ? (
                  (keywordsMap[skill.id] || []).map((kw) => (
                    <span key={kw} className="text-xs px-2 py-0.5 rounded-full bg-accent/10 text-accent">{kw}</span>
                  ))
                ) : (
                  <span className="text-xs text-text-muted/60 italic">{t('settings.skills.noKeywords')}</span>
                )}
              </div>
            </div>
            <button
              onClick={() => startEdit(skill.id)}
              className="ml-3 px-3 py-1.5 text-xs font-semibold rounded-lg bg-accent/10 text-accent hover:bg-accent/20 transition-colors shrink-0"
            >
              {t('settings.skills.edit')}
            </button>
          </div>
        ))}
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-zinc-900 border border-border/20 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-sm font-bold text-text mb-4">
              {t('settings.tabs.skills')}: {skills.find((s) => s.id === editing)?.name}
            </h3>
            <div className="flex flex-wrap gap-2 mb-4">
              {editBuffer.map((kw, i) => (
                <span key={i} className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-accent/10 text-accent">
                  {kw}
                  <button onClick={() => setEditBuffer(editBuffer.filter((_, j) => j !== i))} className="ml-0.5 hover:text-red-400 transition-colors">×</button>
                </span>
              ))}
            </div>
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                className="flex-1 px-3 py-1.5 text-sm rounded-lg bg-white/5 border border-border/40 text-text placeholder:text-text-muted/40 outline-none focus:border-accent/50 transition-colors"
                placeholder={t('settings.skills.addKeyword')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const val = (e.target as HTMLInputElement).value.trim()
                    if (val && !editBuffer.includes(val)) {
                      setEditBuffer([...editBuffer, val])
                    }
                    ;(e.target as HTMLInputElement).value = ''
                  }
                }}
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setEditing(null)}
                className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-white/5 text-text-muted hover:bg-white/10 transition-colors"
              >
                {t('settings.skills.cancel')}
              </button>
              <button
                onClick={() => handleSave(editing)}
                className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-accent text-white hover:bg-accent/90 transition-colors"
              >
                {t('settings.skills.save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
```

Run test: PASS

Commit:
```bash
git add apps/momai/src/renderer/src/components/floating/settings/tabs/SkillsTab.tsx apps/momai/src/renderer/src/components/floating/settings/tabs/SkillsTab.test.tsx
git commit -m "feat: create SkillsTab component for keyword configuration"
```

---

### Task 10: Add skills tab to Settings sidebar and card

**Files:**
- Modify: `src/renderer/src/components/floating/settings/Sidebar.tsx`
- Modify: `src/renderer/src/components/floating/SettingsCard.tsx`

In `Sidebar.tsx`, add icon in the `icons` object:
```typescript
    skills: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
      </svg>
    ),
```

Add tab entry in `tabs` array:
```typescript
    { id: 'skills', label: t('settings.tabs.skills'), icon: icons.skills },
```

In `SettingsCard.tsx`, add import:
```typescript
import { SkillsTab } from './settings/tabs/SkillsTab'
```

Add render:
```typescript
      {activeTab === 'skills' && <SkillsTab />}
```

Commit:
```bash
git add apps/momai/src/renderer/src/components/floating/settings/Sidebar.tsx apps/momai/src/renderer/src/components/floating/SettingsCard.tsx
git commit -m "feat: add skills tab to settings sidebar and card"
```

---

### Task 11: Final verification

- [ ] Run: `npx vitest run --project scripts` — all PASS
- [ ] Run: `npx vitest run --project renderer` — all PASS
- [ ] Spec coverage: all requirements implemented
