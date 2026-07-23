# MOM-72: Memória .md + prompts + harness 3-tier + skill loading progressivo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement 5 workstreams (A, B, C, E, F) of MOM-72: persistent .md memory files, prompt conflict cleanup, 3-tier harness with cache, and progressive skill loading with dynamic token budget.

**Architecture:** Node Core backend (JS) + Electron renderer (React/TypeScript). Memory files stored in `DATA_DIR/memories/`. Prompt built from 3 tiers (stable/context/volatile) with session cache. Skill tools selected by token budget instead of hardcoded max. 3 meta-tools always available (memory, list_skills, request_skill).

**Tech Stack:** Node.js, Electron 42, React 19, TailwindCSS, TypeScript

## Global Constraints

- max file size 2200 chars per memory file, 1375 chars per entry
- Snapshot frozen per session; memory writes only visible in next session
- Prompts in natural language, no XML tags (system_prompt, identity, tier, available_skills, tool_mandate, tool_priority, no_greeting)
- Stable tier in English, volatile tier carries locale for response language
- No hardcoded skill IDs anywhere; all meta-tools are generic
- max_sentences removed entirely; maxSkills=2 replaced by dynamic token budget
- TTFB must not increase >100ms from baseline
- Persona.md is read-only for the IA but editable by the user

---

### Task 1: MEMORIES_DIR constant + memory-fs.js (atomic .md operations)

**Files:**
- Modify: `apps/momai/scripts/node-core/config/constants.js`
- Create: `apps/momai/scripts/node-core/infrastructure/memory-fs.js`
- Test: `apps/momai/scripts/node-core/tests/memory-fs.test.js`

**Interfaces:**
- Consumes: `DATA_DIR` from constants.js
- Produces: `MEMORIES_DIR` constant; `readMemoryFile(name)`, `writeMemoryFile(name, content)`, `listMemoryEntries(name)`, `addMemoryEntry(name, content)`, `deleteMemoryEntry(name, content)` from memory-fs.js

- [ ] **Step 1: Add MEMORIES_DIR to constants.js**

```js
// After line 48: const CACHE_DIR = ...
const MEMORIES_DIR = path.join(DATA_DIR, 'memories')
```

Add to `module.exports`:
```js
MEMORIES_DIR,
```

- [ ] **Step 2: Write failing tests for memory-fs.js**

```js
// apps/momai/scripts/node-core/tests/memory-fs.test.js
const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')
const { createMemoryFS, ALLOWED_FILENAMES } = require('../infrastructure/memory-fs')

describe('memory-fs', () => {
  let memfs
  let tmpDir

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-fs-test-'))
    fs.mkdirSync(path.join(tmpDir, 'memories'))
    memfs = createMemoryFS({ memoriesDir: path.join(tmpDir, 'memories') })
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  describe('ALLOWED_FILENAMES', () => {
    it('allows usuario, persona, conhecimento', () => {
      expect(ALLOWED_FILENAMES).toEqual(['usuario', 'persona', 'conhecimento'])
    })
  })

  describe('readMemoryFile', () => {
    it('returns empty object for non-existing file', () => {
      const result = memfs.readMemoryFile('usuario')
      expect(result).toEqual({ name: 'usuario', content: '', entries: [] })
    })

    it('returns content for existing file', () => {
      const testPath = path.join(tmpDir, 'memories', 'usuario.md')
      fs.writeFileSync(testPath, 'foo\n§\nbar', 'utf8')
      const result = memfs.readMemoryFile('usuario')
      expect(result.name).toBe('usuario')
      expect(result.content).toBe('foo\n§\nbar')
      expect(result.entries).toEqual(['foo', 'bar'])
    })

    it('rejects invalid filename', () => {
      expect(() => memfs.readMemoryFile('../../etc/passwd')).toThrow('Invalid filename')
    })
  })

  describe('writeMemoryFile', () => {
    it('writes content atomically and returns parsed entries', () => {
      const result = memfs.writeMemoryFile('persona', 'linha 1\n§\nlinha 2')
      expect(result.entries).toEqual(['linha 1', 'linha 2'])
      const fileContent = fs.readFileSync(path.join(tmpDir, 'memories', 'persona.md'), 'utf8')
      expect(fileContent).toBe('linha 1\n§\nlinha 2')
    })

    it('rejects content over 2200 chars', () => {
      const long = 'a'.repeat(2201)
      expect(() => memfs.writeMemoryFile('usuario', long)).toThrow('exceeds 2200')
    })

    it('rejects invalid filename', () => {
      expect(() => memfs.writeMemoryFile('hack', 'content')).toThrow('Invalid filename')
    })
  })

  describe('addMemoryEntry', () => {
    it('appends a new entry separated by §', () => {
      memfs.addMemoryEntry('usuario', 'novo fato')
      const result = memfs.readMemoryFile('usuario')
      expect(result.entries).toEqual(['novo fato'])
    })

    it('rejects entry over 1375 chars', () => {
      const long = 'b'.repeat(1376)
      expect(() => memfs.addMemoryEntry('usuario', long)).toThrow('exceeds 1375')
    })

    it('rejects target persona (read-only for IA)', () => {
      expect(() => memfs.addMemoryEntry('persona', 'edit')).toThrow('read-only')
    })
  })

  describe('deleteMemoryEntry', () => {
    it('removes matching entry by substring', () => {
      memfs.addMemoryEntry('usuario', 'gosta de pizza')
      memfs.addMemoryEntry('usuario', 'gosta de sorvete')
      memfs.deleteMemoryEntry('usuario', 'pizza')
      const result = memfs.readMemoryFile('usuario')
      expect(result.entries).toEqual(['gosta de sorvete'])
    })
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run --reporter=verbose apps/momai/scripts/node-core/tests/memory-fs.test.js`
Expected: FAIL with "Cannot find module '../infrastructure/memory-fs'"

- [ ] **Step 4: Write memory-fs.js implementation**

```js
// apps/momai/scripts/node-core/infrastructure/memory-fs.js
const fs = require('node:fs')
const path = require('node:path')

const ALLOWED_FILENAMES = ['usuario', 'persona', 'conhecimento']
const MAX_FILE_CHARS = 2200
const MAX_ENTRY_CHARS = 1375
const SEPARATOR = '\n§\n'

function createMemoryFS({ memoriesDir }) {
  function filePathFor(name) {
    if (!ALLOWED_FILENAMES.includes(name)) {
      throw new Error(`Invalid filename: ${name}. Allowed: ${ALLOWED_FILENAMES.join(', ')}`)
    }
    return path.join(memoriesDir, `${name}.md`)
  }

  function parseContent(content) {
    const entries = content
      .split(SEPARATOR)
      .map((e) => e.trim())
      .filter(Boolean)
    return { entries }
  }

  function ensureDir() {
    if (!fs.existsSync(memoriesDir)) {
      fs.mkdirSync(memoriesDir, { recursive: true })
    }
  }

  function readMemoryFile(name) {
    const fp = filePathFor(name)
    ensureDir()
    if (!fs.existsSync(fp)) {
      return { name, content: '', entries: [] }
    }
    const content = fs.readFileSync(fp, 'utf8')
    const { entries } = parseContent(content)
    return { name, content, entries }
  }

  function writeMemoryFile(name, content) {
    const clean = String(content || '').replace(/\0/g, '').trim()
    if (clean.length > MAX_FILE_CHARS) {
      throw new Error(`Content exceeds ${MAX_FILE_CHARS} characters`)
    }
    const fp = filePathFor(name)
    ensureDir()
    const tmp = fp + '.tmp'
    fs.writeFileSync(tmp, clean, 'utf8')
    fs.renameSync(tmp, fp)
    const { entries } = parseContent(clean)
    return { name, content: clean, entries }
  }

  function addMemoryEntry(name, content) {
    if (name === 'persona') {
      throw new Error('persona is read-only for the AI')
    }
    const clean = String(content || '').replace(/\0/g, '').trim()
    if (clean.length > MAX_ENTRY_CHARS) {
      throw new Error(`Entry exceeds ${MAX_ENTRY_CHARS} characters`)
    }
    const current = readMemoryFile(name)
    const newContent = current.content
      ? current.content + SEPARATOR + clean
      : clean
    return writeMemoryFile(name, newContent)
  }

  function deleteMemoryEntry(name, content) {
    if (name === 'persona') {
      throw new Error('persona is read-only for the AI')
    }
    const current = readMemoryFile(name)
    const remaining = current.entries.filter(
      (e) => !e.toLowerCase().includes(String(content || '').toLowerCase())
    )
    return writeMemoryFile(name, remaining.join(SEPARATOR))
  }

  function listMemoryFiles() {
    return ALLOWED_FILENAMES.map((name) => readMemoryFile(name))
  }

  return {
    readMemoryFile,
    writeMemoryFile,
    addMemoryEntry,
    deleteMemoryEntry,
    listMemoryFiles
  }
}

module.exports = { createMemoryFS, ALLOWED_FILENAMES }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/momai && npx vitest run --reporter=verbose scripts/node-core/tests/memory-fs.test.js`
Expected: PASS (all tests green)

- [ ] **Step 6: Commit**

```bash
git add apps/momai/scripts/node-core/config/constants.js apps/momai/scripts/node-core/infrastructure/memory-fs.js apps/momai/scripts/node-core/tests/memory-fs.test.js
git commit -m "feat(memory): add MEMORIES_DIR constant and memory-fs.js with atomic .md operations"
```

---

### Task 2: API routes for memory files (GET/PATCH /memories/:filename)

**Files:**
- Modify: `apps/momai/scripts/node-core/api/routes/settings.routes.js`
- Test: `apps/momai/scripts/node-core/tests/settings-routes.test.js` (or add inline)

**Interfaces:**
- Consumes: `createMemoryFS` from Task 1
- Produces: `GET /memories/:filename` returning memory file content; `PATCH /memories/:filename` writing full content

- [ ] **Step 1: Add memory route handler inside createSettingsRoutes**

Inside `handleSettingsRoutes` function, before the final `return false`:

```js
if (pathname === '/memories' && req.method === 'GET') {
  const memFS = createMemoryFS({ memoriesDir: MEMORIES_DIR })
  const files = memFS.listMemoryFiles()
  sendJson(res, 200, files)
  return true
}

const memoriesMatch = pathname.match(/^\/memories\/(usuario|persona|conhecimento)$/)
if (memoriesMatch) {
  const memFS = createMemoryFS({ memoriesDir: MEMORIES_DIR })
  const filename = memoriesMatch[1]

  if (req.method === 'GET') {
    const result = memFS.readMemoryFile(filename)
    sendJson(res, 200, result)
    return true
  }

  if (req.method === 'PATCH') {
    try {
      const payload = await context.readJsonBody(req).catch(() => ({}))
      const content = String(payload.content || '').replace(/\0/g, '').trim()
      const result = memFS.writeMemoryFile(filename, content)
      sendJson(res, 200, result)
      return true
    } catch (error) {
      const status = error.message.includes('exceeds') ? 400 : 500
      sendJson(res, status, { status: 'error', message: error.message })
      return true
    }
  }
}
```

Add `MEMORIES_DIR` to the require from constants at the top of settings.routes.js:

```js
const { MEMORIES_DIR } = require('../../config/constants')
```

Add `createMemoryFS` to the require at the top:

```js
const { createMemoryFS } = require('../../infrastructure/memory-fs')
```

- [ ] **Step 2: Run existing settings tests to verify no regression**

Run: `cd apps/momai && npx vitest run --reporter=verbose scripts/node-core/tests/settings-routes.test.js 2>/dev/null || echo "No dedicated settings-routes test file exists, checking with store test instead"`

Check: `cd apps/momai && npx vitest run --reporter=verbose scripts/node-core/tests/ | Select-String -Pattern "store"`
Expected: Existing store tests pass.

- [ ] **Step 3: Manual verification — start node-core and test endpoints**

```bash
cd apps/momai
curl -s http://localhost:8000/memories/usuario | head -c200
curl -s -X PATCH -H "Content-Type: application/json" -d '{"content":"novo teste"}' http://localhost:8000/memories/usuario | head -c200
```

- [ ] **Step 4: Commit**

```bash
git add apps/momai/scripts/node-core/api/routes/settings.routes.js
git commit -m "feat(memory): add GET/PATCH /memories/:filename API routes"
```

---

### Task 3: backups/prompts.json cleanup (remove XML, greeting, max_sentences)

**Files:**
- Modify: `apps/momai/prompts/prompts.json`

**Interfaces:**
- Consumes: existing prompt-registry.js (refactored in Task 4)
- Produces: Clean prompts.json with no XML, no greeting, no max_sentences, natural language stable tier format

- [ ] **Step 1: Write prompts.json**

```json
{
  "version": "2026-07-23",
  "default_persona": "You are MomAI, an efficient local AI assistant created by Wesley Developer Studios.",
  "default_style": "balanced",
  "system_template": "You are MomAI assisting {{user_name}}.\n\n{{assistant_persona}}\n\nResponse style: {{response_style}}\n\n{{memory_block}}\n\n{{tool_instruction}}",
  "tiers": {
    "lite": {
      "response_style": "balanced",
      "tier_instructions": "Be clear, practical, and polite. Prefer short paragraphs. Ask for clarification only when necessary. When a tool result is available, use it as the source of truth."
    },
    "pro": {
      "response_style": "balanced",
      "tier_instructions": "Be direct and useful. Prioritize concrete next actions. Keep explanations focused and concise. When a tool result is available, start with the factual result before elaborating."
    },
    "ultra": {
      "response_style": "concise",
      "tier_instructions": "Reply with objective, short answers. When a tool was executed, start with the practical result in the first line. Expand only when the user explicitly asks for more detail."
    }
  },
  "fallback_replies": {
    "empty": "Pode me mandar uma pergunta para eu te ajudar.",
    "greeting": "Oi, {{user_name}}! Estou aqui para ajudar. Como posso ser útil hoje? 👋",
    "reason": "Modelo local indisponivel no momento ({{reason}}). Resposta de fallback para: \"{{summary}}\".",
    "with_memory": "Entendi seu pedido: \"{{summary}}\". Considerei tambem o contexto das suas notas locais para responder.",
    "default": "Entendi seu pedido: \"{{summary}}\". Vou seguir com isso."
  }
}
```

Changes from the old file:
- Removed `default_max_sentences` field
- Removed `memory_context_header` field (moved to prompt-registry.js logic)
- Removed all XML tags from `system_template` (`<system_prompt>`, `<identity>`, `<persona>`, `<user_name>`, `<response_style>`, `<max_sentences>`)
- Removed `{{max_sentences}}` placeholder
- Removed `<tier name="...">` and greeting sentences from `tier_instructions` in all tiers
- `system_template` is now plain text with `{{memory_block}}` and `{{tool_instruction}}` placeholders
- Updated version

- [ ] **Step 2: Verify no XML tags remain**

```bash
Select-String -Path "apps/momai/prompts/prompts.json" -Pattern "<.*>|Greet|max_sentences"
```
Expected: No matches (or only false positives from version strings)

- [ ] **Step 3: Commit**

```bash
git add apps/momai/prompts/prompts.json
git commit -m "refactor(prompts): remove XML tags, greeting, max_sentences from prompts.json"
```

---

### Task 4: prompt-registry.js refactor (3 tiers + cache + memory context from .md)

**Files:**
- Modify: `apps/momai/scripts/prompt-registry.js`
- Test: `apps/momai/scripts/node-core/tests/prompt-registry.test.js` (new)

**Interfaces:**
- Consumes: `MEMORIES_DIR` from constants, `createMemoryFS` from memory-fs.js
- Produces: `buildStableTier(input)`, `buildContextTier(input)`, `buildVolatileTier(input)`, `buildSystemPrompt(input)` with cache; `formatMemoryContext(entries)` converts § to bullets

- [ ] **Step 1: Write failing tests for prompt-registry.js**

```js
// apps/momai/scripts/node-core/tests/prompt-registry.test.js
const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')
const { createPromptRegistry } = require('../../prompt-registry')

describe('prompt-registry (refactored)', () => {
  let promptsDir
  let tmpDir

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-registry-test-'))
    promptsDir = path.join(tmpDir, 'prompts')
    fs.mkdirSync(promptsDir, { recursive: true })
    // Write minimal prompts.json
    fs.writeFileSync(path.join(promptsDir, 'prompts.json'), JSON.stringify({
      version: 'test',
      default_persona: 'You are MomAI test.',
      default_style: 'balanced',
      system_template: '{{stable_tier}}\n\n{{context_tier}}\n\n{{volatile_tier}}',
      tiers: {
        pro: {
          response_style: 'balanced',
          tier_instructions: 'Be direct.'
        }
      },
      fallback_replies: {
        default: 'Fallback: {{summary}}.'
      }
    }), 'utf8')
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  describe('buildStableTier', () => {
    it('returns stable prompt with persona and rules', () => {
      const reg = createPromptRegistry({ promptsDir })
      const result = reg.buildStableTier({
        userName: 'TestUser',
        persona: 'You are MomAI custom.',
        responseStyle: 'balanced'
      })
      expect(result).toContain('You are MomAI')
      expect(result).toContain('TestUser')
      expect(result).toContain('Be direct')
      expect(result).not.toContain('<')
      expect(result).not.toContain('max_sentences')
      expect(result).not.toContain('Greet')
    })
  })

  describe('buildContextTier', () => {
    it('returns empty when no memories directory', () => {
      const reg = createPromptRegistry({ promptsDir })
      const result = reg.buildContextTier({ memoriesDir: path.join(tmpDir, 'nonexistent') })
      expect(result.trim()).toBe('')
    })

    it('formats memory files with bullets', () => {
      const memoriesDir = path.join(tmpDir, 'memories')
      fs.mkdirSync(memoriesDir, { recursive: true })
      fs.writeFileSync(path.join(memoriesDir, 'usuario.md'), 'gosta de tecnologia\n§\nprefere resposta curta', 'utf8')
      fs.writeFileSync(path.join(memoriesDir, 'persona.md'), 'MomAI é assistente pessoal', 'utf8')
      fs.writeFileSync(path.join(memoriesDir, 'conhecimento.md'), 'Python é usado para IA', 'utf8')

      const reg = createPromptRegistry({ promptsDir })
      const result = reg.buildContextTier({ memoriesDir })
      expect(result).toContain('-- User Profile --')
      expect(result).toContain('- gosta de tecnologia')
      expect(result).toContain('- prefere resposta curta')
      expect(result).toContain('-- MomAI Identity --')
      expect(result).toContain('MomAI é assistente pessoal')
      expect(result).toContain('-- Known Facts --')
      expect(result).toContain('Python é usado para IA')
      expect(result).not.toContain('§')
    })
  })

  describe('buildVolatileTier', () => {
    it('returns session info and greeting policy', () => {
      const reg = createPromptRegistry({ promptsDir })
      const result = reg.buildVolatileTier({
        threadId: 'test-123',
        modelName: 'Qwen3.5-4B',
        tier: 'pro',
        locale: 'pt-BR',
        hasHistory: false
      })
      expect(result).toContain('test-123')
      expect(result).toContain('Qwen3.5-4B')
      expect(result).toContain('pt-BR')
      expect(result).toContain('greet naturally')
    })

    it('uses different greeting for ongoing conversation', () => {
      const reg = createPromptRegistry({ promptsDir })
      const result = reg.buildVolatileTier({
        threadId: 'test-456',
        modelName: 'Qwen3.5-4B',
        tier: 'pro',
        locale: 'pt-BR',
        hasHistory: true
      })
      expect(result).toContain('continue')
      expect(result).not.toContain('greet')
    })
  })

  describe('buildSystemPrompt cache', () => {
    it('caches stable+context across calls with same sessionKey', () => {
      const reg = createPromptRegistry({ promptsDir })
      const input = {
        tier: 'pro',
        userName: 'User',
        persona: 'You are MomAI.',
        memoryContext: '',
        toolInstruction: '',
        responseStyle: 'balanced',
        responseLanguage: 'pt-BR',
        hasHistory: false
      }
      const r1 = reg.buildSystemPrompt(input)
      const r2 = reg.buildSystemPrompt(input)
      expect(r1).toBe(r2)
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/momai && npx vitest run --reporter=verbose scripts/node-core/tests/prompt-registry.test.js`
Expected: FAIL (methods not yet implemented)

- [ ] **Step 3: Refactor prompt-registry.js**

Full implementation replacing the current file:

```js
// apps/momai/scripts/prompt-registry.js
const fs = require('node:fs')
const path = require('node:path')
const { createMemoryFS, ALLOWED_FILENAMES } = require('./node-core/infrastructure/memory-fs')

function sanitize(text) {
  return String(text || '')
    .replace(/\{\{/g, '(')
    .replace(/\}\}/g, ')')
    .replace(/[{}]/g, '')
}

function replaceAll(template, vars) {
  let out = String(template || '')
  for (const [key, value] of Object.entries(vars)) {
    out = out.split(`{{${key}}}`).join(String(value ?? ''))
  }
  for (const [key, value] of Object.entries(vars)) {
    out = out.split(`{{${key}}}`).join(String(value ?? ''))
  }
  return out
}

function buildRuntimeClockContext() {
  const now = new Date()
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'local'
  const offsetMinutes = -now.getTimezoneOffset()
  const sign = offsetMinutes >= 0 ? '+' : '-'
  const abs = Math.abs(offsetMinutes)
  const hh = String(Math.floor(abs / 60)).padStart(2, '0')
  const mm = String(abs % 60).padStart(2, '0')
  const offset = `${sign}${hh}:${mm}`
  return [
    '# RUNTIME CLOCK',
    `Local datetime: ${now.toString()}`,
    `ISO datetime: ${now.toISOString()}`,
    `Timezone: ${timezone} (UTC${offset})`,
    'When the user asks current date/time, ALWAYS use this runtime clock context.'
  ].join('\n')
}

function formatResponseLanguageInstruction(languageTag) {
  const tag = String(languageTag || '').trim() || 'pt-BR'
  return [
    '# RESPONSE LANGUAGE POLICY',
    `Respond in the same language as the user's latest message (${tag}).`,
    'If the user switches language in a later message, switch your response language immediately.',
    'Do not explain this policy unless asked.'
  ].join('\n')
}

function createPromptRegistry({ promptsDir }) {
  const promptsFile = path.join(promptsDir, 'prompts.json')
  const runtime = {
    version: null,
    loadedFromFile: false,
    fallbackUsed: false,
    lastError: null,
    lastTier: null,
    lastFile: 'prompts.json'
  }

  let _promptsCache = null
  let _promptsMtime = 0

  function loadPrompts() {
    try {
      const stat = fs.existsSync(promptsFile) ? fs.statSync(promptsFile) : null
      if (_promptsCache && stat && stat.mtimeMs <= _promptsMtime) {
        return _promptsCache
      }
      const fallback = {
        version: 'fallback',
        default_persona: '',
        default_style: 'balanced',
        system_template:
          '{{stable_tier}}\n\n{{context_tier}}\n\n{{volatile_tier}}',
        tiers: {
          lite: { response_style: 'balanced', tier_instructions: '' },
          pro: { response_style: 'balanced', tier_instructions: '' },
          ultra: { response_style: 'concise', tier_instructions: '' }
        },
        fallback_replies: {
          empty: 'Por favor, envie uma mensagem para eu te ajudar.',
          greeting: 'Olá! Sou seu assistente MomAI. Como posso ajudar hoje?',
          reason: 'Fallback: {{summary}} ({{reason}}).',
          with_memory: 'Fallback com memoria: {{summary}}.',
          default: 'Fallback: {{summary}}.'
        }
      }
      if (!stat) {
        runtime.version = fallback.version
        runtime.loadedFromFile = false
        runtime.fallbackUsed = true
        _promptsCache = fallback
        return fallback
      }
      const parsed = JSON.parse(fs.readFileSync(promptsFile, 'utf8'))
      _promptsMtime = stat.mtimeMs
      runtime.version = parsed.version || 'unknown'
      runtime.loadedFromFile = true
      runtime.fallbackUsed = false
      _promptsCache = { ...fallback, ...parsed, tiers: { ...fallback.tiers, ...(parsed.tiers || {}) } }
      return _promptsCache
    } catch (error) {
      runtime.version = fallback.version
      runtime.loadedFromFile = false
      runtime.fallbackUsed = true
      runtime.lastError = error?.message || 'failed to load prompts.json'
      return fallback
    }
  }

  // Cache for the combined stable+context prompt
  let _systemPromptCache = null

  function buildStableTier(input) {
    const prompts = loadPrompts()
    const tier = ['lite', 'pro', 'ultra'].includes(input.tier) ? input.tier : 'pro'
    const tierCfg = (prompts.tiers && prompts.tiers[tier]) || prompts.tiers.pro || prompts.tiers.lite || {}
    const persona = input.persona || prompts.default_persona || ''
    const responseStyle = input.responseStyle || tierCfg.response_style || prompts.default_style || 'balanced'

    const lines = [
      `You are MomAI, assisting ${sanitize(input.userName || 'Usuário')}.`,
      '',
      persona ? `${sanitize(persona)}\n` : '',
      '- Be direct but natural.',
      '- Use the skills listed when relevant.',
      '- If unsure, ask for clarification.',
      '',
      tierCfg.tier_instructions ? `${sanitize(String(tierCfg.tier_instructions))}` : ''
    ]
    return lines.filter(Boolean).join('\n')
  }

  function buildContextTier(input) {
    const memoriesDir = input.memoriesDir || path.join(process.cwd(), 'data', 'memories')
    if (!fs.existsSync(memoriesDir)) return ''

    createMemoryFS_impl = createMemoryFS
    let memFS
    try {
      memFS = createMemoryFS({ memoriesDir })
    } catch {
      return ''
    }

    const sections = []
    for (const name of ALLOWED_FILENAMES) {
      const file = memFS.readMemoryFile(name)
      if (!file.content.trim()) continue

      const label =
        name === 'usuario' ? '-- User Profile --' :
        name === 'persona' ? '-- MomAI Identity --' :
        '-- Known Facts --'

      // Convert § separators to bullet points
      const bullets = file.entries.map((e) => `- ${e}`).join('\n')
      sections.push(`${label}\n${bullets}`)
    }

    if (sections.length === 0) return ''
    return ['', sections.join('\n\n'), ''].join('\n')
  }

  function buildVolatileTier(input) {
    const lines = [
      `Conversation: ${input.threadId || 'default'}`,
      `Model: ${input.modelName || 'local'} (${input.tier || 'pro'})`,
      `User language: ${input.locale || 'pt-BR'}`,
      '',
      input.hasHistory
        ? 'Continue the conversation — be direct.'
        : 'This is a new conversation — greet naturally.'
    ]
    return lines.join('\n')
  }

  function buildSystemPrompt(input) {
    const sessionKey = `${input.threadId || 'default'}:${input.persona || ''}:${input.locale || ''}:${input.tier || 'pro'}`

    // Build volatile tier every time (cheap)
    const volatileTier = buildVolatileTier({
      threadId: input.threadId || 'default',
      modelName: input.modelName || 'local',
      tier: input.tier || 'pro',
      locale: input.locale || 'pt-BR',
      hasHistory: !!input.hasHistory
    })

    // Check if stable+context cache is valid
    if (_systemPromptCache && _systemPromptCache.sessionKey === sessionKey) {
      const { stable, context } = _systemPromptCache
      return [stable, context, volatileTier].filter(Boolean).join('\n\n')
    }

    const stable = buildStableTier({
      userName: input.userName,
      persona: input.persona,
      responseStyle: input.responseStyle,
      tier: input.tier
    })

    const context = buildContextTier({
      memoriesDir: input.memoriesDir
    })

    _systemPromptCache = { sessionKey, stable, context }

    const base = [stable, context, volatileTier].filter(Boolean).join('\n\n')

    // Append runtime instructions
    const languagePolicy = formatResponseLanguageInstruction(input.responseLanguage || 'pt-BR')
    const clock = buildRuntimeClockContext()

    return [base, languagePolicy, clock].join('\n\n')
  }

  function buildFallbackReply(input) {
    const prompts = loadPrompts()
    const templates = prompts.fallback_replies || {}
    const key = String(input?.key || 'default')
    const template = String(templates[key] || templates.default || 'Fallback: {{summary}}.')
    return replaceAll(template, {
      summary: sanitize(input?.summary || ''),
      reason: sanitize(input?.reason || ''),
      user_name: sanitize(input?.userName || 'Usuário')
    })
  }

  function getDefaults() {
    const prompts = loadPrompts()
    return {
      assistant_persona: String(prompts.default_persona || '')
    }
  }

  function getRuntimeStatus() {
    return {
      prompt_version: runtime.version,
      loaded_from_file: runtime.loadedFromFile,
      fallback_used: runtime.fallbackUsed,
      last_error: runtime.lastError,
      last_tier: runtime.lastTier,
      last_file: runtime.lastFile
    }
  }

  function formatMemoryContext(sectionsText) {
    return String(sectionsText || '').trim()
  }

  return {
    buildSystemPrompt,
    buildFallbackReply,
    getDefaults,
    getRuntimeStatus,
    formatMemoryContext,
    buildStableTier,
    buildContextTier,
    buildVolatileTier
  }
}

module.exports = { createPromptRegistry }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/momai && npx vitest run --reporter=verbose scripts/node-core/tests/prompt-registry.test.js`
Expected: PASS (all tests green)

- [ ] **Step 5: Commit**

```bash
git add apps/momai/scripts/prompt-registry.js apps/momai/scripts/node-core/tests/prompt-registry.test.js
git commit -m "feat(prompt): refactor prompt-registry to 3 tiers (stable/context/volatile) with session cache"
```

---

### Task 5: registry.js — add list_skills, request_skill handlers + toOpenAITools Map return

**Files:**
- Modify: `apps/momai/scripts/skills/registry.js`
- Test: `apps/momai/scripts/node-core/tests/registry-meta-tools.test.js`

**Interfaces:**
- Consumes: existing `getById`, `getEnabled`, `discoverTopN` from registry
- Produces: `executeMetaTool(toolName, args)` handling memory/list_skills/request_skill; `toOpenAITools(skillIds)` additionally returns `{ tools, toolToSkillMap }`

- [ ] **Step 1: Write failing tests for meta-tools**

```js
// apps/momai/scripts/node-core/tests/registry-meta-tools.test.js
const path = require('node:path')
const os = require('node:os')
const fs = require('node:fs')
const { createSkillRegistry } = require('../../skills/registry')

describe('registry meta-tools', () => {
  let dataDir
  let builtinDir

  beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reg-mt-'))
    builtinDir = path.join(dataDir, 'builtins')
    fs.mkdirSync(builtinDir, { recursive: true })
    // Create a test skill with a tool
    const skillDir = path.join(builtinDir, 'weather')
    fs.mkdirSync(skillDir, { recursive: true })
    fs.writeFileSync(path.join(skillDir, 'manifest.json'), JSON.stringify({
      id: 'weather',
      name: 'Weather',
      description: 'Get weather info',
      version: '1.0.0',
      tools: [{
        name: 'get_weather',
        description: 'Get weather for location',
        parameters: { type: 'object', properties: { location: { type: 'string' } }, required: ['location'] }
      }]
    }), 'utf8')
  })

  afterEach(() => {
    fs.rmSync(dataDir, { recursive: true, force: true })
  })

  describe('executeMetaTool', () => {
    it('handles list_skills by running discoverTopN', () => {
      const registry = createSkillRegistry({ dataDir, builtinSkillsDir: builtinDir })
      const result = registry.executeMetaTool('list_skills', { query: 'weather' })
      expect(result).toContain('weather')
    })

    it('handles request_skill by returning skill tools', () => {
      const registry = createSkillRegistry({ dataDir, builtinSkillsDir: builtinDir })
      const result = registry.executeMetaTool('request_skill', { skill_name: 'weather' })
      expect(result).toContain('get_weather')
    })

    it('returns error for nonexistent skill in request_skill', () => {
      const registry = createSkillRegistry({ dataDir, builtinSkillsDir: builtinDir })
      const result = registry.executeMetaTool('request_skill', { skill_name: 'nonexistent' })
      expect(result).toContain('not found')
    })

    it('rejects unknown meta-tool', () => {
      const registry = createSkillRegistry({ dataDir, builtinSkillsDir: builtinDir })
      expect(() => registry.executeMetaTool('unknown', {})).toThrow('Unknown meta-tool')
    })
  })

  describe('toOpenAITools with map', () => {
    it('returns tools array and toolToSkillMap', () => {
      const registry = createSkillRegistry({ dataDir, builtinSkillsDir: builtinDir })
      const result = registry.toOpenAITools(['weather'])
      expect(Array.isArray(result.tools)).toBe(true)
      expect(result.toolToSkillMap instanceof Map).toBe(true)
      expect(result.toolToSkillMap.get('get_weather')).toBe('weather')
    })

    it('does not add Skill: prefix in tool description', () => {
      const registry = createSkillRegistry({ dataDir, builtinSkillsDir: builtinDir })
      const { tools } = registry.toOpenAITools(['weather'])
      const tool = tools.find((t) => t.function?.name === 'get_weather')
      expect(tool.function.description).not.toMatch(/\n\nSkill: /)
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/momai && npx vitest run --reporter=verbose scripts/node-core/tests/registry-meta-tools.test.js`
Expected: FAIL

- [ ] **Step 3: Implement executeMetaTool and update toOpenAITools in registry.js**

At the end of `createSkillRegistry` function, before the return statement:

```js
const META_TOOLS = ['memory', 'list_skills', 'request_skill']

function executeMetaTool(toolName, args) {
  if (toolName === 'list_skills') {
    const query = String(args?.query || '').trim()
    if (!query) return 'Use a query to search for skills (e.g., "weather", "launcher").'
    const results = discoverTopN(query, 5)
    if (results.length === 0) return `No skills found for "${query}".`
    return results
      .map((r) => `- ${r.id}: ${(r.description || '').slice(0, 100)}`)
      .join('\n')
  }

  if (toolName === 'request_skill') {
    const skillName = String(args?.skill_name || '').trim()
    const skill = getById(skillName)
    if (!skill) {
      return JSON.stringify({
        error: `Skill '${skillName}' not found. Use list_skills to see available skills.`
      })
    }
    const tools = skill.manifest?.tools || []
    if (tools.length === 0) return `Skill '${skillName}' is loaded but has no specific tools.`
    return `Skill '${skillName}' loaded. Available tools: ${tools.map((t) => t.name).join(', ')}.`
  }

  if (toolName === 'memory') {
    // Memory is handled by chat-service directly through memory-fs.js
    // This meta-tool handler returns the interface for the LLM
    const action = String(args?.action || '').trim()
    const target = String(args?.target || '').trim()
    if (action === 'list') return `Use 'memory' tool with action=list to read ${target} memory.`
    if (action === 'add') return `Use 'memory' tool with action=add to save to ${target} memory.`
    return `Memory tool available. Actions: add, delete, list. Targets: user, knowledge.`
  }

  throw new Error(`Unknown meta-tool: ${toolName}`)
}
```

Replace the existing `toOpenAITools` function:

```js
function toOpenAITools(skillIds) {
  if (_toolsCache && _toolsCacheGeneration === _skillsGeneration && skillIds === undefined) {
    return _toolsCache
  }

  const skills = skillIds ? getEnabled().filter((s) => skillIds.includes(s.id)) : getEnabled()
  const functions = []
  const toolToSkillMap = new Map()

  for (const skill of skills) {
    const tools = skill.manifest.tools || []
    if (tools.length === 0) {
      functions.push({
        type: 'function',
        function: {
          name: skill.id,
          description: skill.manifest.description,
          parameters: {
            type: 'object',
            properties: {
              content: {
                type: 'string',
                description: 'The user message content to process with this skill.'
              }
            },
            required: ['content']
          }
        }
      })
      toolToSkillMap.set(skill.id, skill.id)
      continue
    }

    for (const tool of tools) {
      functions.push({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters || {
            type: 'object',
            properties: {
              content: {
                type: 'string',
                description: `Input for ${tool.name}: ${tool.description}`
              }
            },
            required: ['content']
          }
        }
      })
      toolToSkillMap.set(tool.name, skill.id)
    }
  }

  _toolsCache = functions
  _toolsCacheGeneration = _skillsGeneration
  return { tools: functions, toolToSkillMap }
}
```

Update the return statement of `createSkillRegistry` to include `executeMetaTool`.

```js
return {
  loadBuiltins,
  loadExtensions,
  getById,
  getEnabled,
  getAll,
  discoverTopN,
  toOpenAITools,
  executeMetaTool,
  buildUseSkillTool,
  toListPayload,
  getSkillsWithHook,
  getRuntimeStatus
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/momai && npx vitest run --reporter=verbose scripts/node-core/tests/registry-meta-tools.test.js`
Expected: PASS

- [ ] **Step 5: Run existing registry tests to verify no regression**

Run: `cd apps/momai && npx vitest run --reporter=verbose scripts/node-core/tests/skills-registry.test.js`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/momai/scripts/skills/registry.js apps/momai/scripts/node-core/tests/registry-meta-tools.test.js
git commit -m "feat(skills): add executeMetaTool for list_skills/request_skill and toOpenAITools toolToSkillMap"
```

---

### Task 6: chat/skills.js — remove maxSkills, add token budget, activeSkillIds

**Files:**
- Modify: `apps/momai/scripts/node-core/services/chat/skills.js`
- Test: `apps/momai/scripts/node-core/tests/chat-skills-utils.test.js` (update existing)

**Interfaces:**
- Consumes: existing function signatures
- Produces: `pickToolSkillIds` without `maxSkills`, with `tokenBudget`; `estimateToolTokens(toolDef)`

- [ ] **Step 1: Update test file — replace maxSkills tests with tokenBudget tests**

Update `apps/momai/scripts/node-core/tests/chat-skills-utils.test.js`:

Replace the `pickToolSkillIds` describe block:

```js
describe('pickToolSkillIds', () => {
  it('returns discovered skills sorted by score when no routed', () => {
    const result = pickToolSkillIds({
      discoveredSkillIds: ['a', 'b', 'c'],
      routedSkillId: null,
      topScores: { a: 0.5, b: 0.9, c: 0.7 }
    })
    expect(result).toEqual(['b', 'c', 'a'])
  })

  it('puts routed skill first then fills with discoveries', () => {
    const result = pickToolSkillIds({
      discoveredSkillIds: ['a', 'b', 'c'],
      routedSkillId: 'x',
      topScores: { a: 0.5, b: 0.9, c: 0.7 }
    })
    expect(result[0]).toBe('x')
    expect(result.length).toBeGreaterThan(0)
  })

  it('includes activeSkillIds in result', () => {
    const result = pickToolSkillIds({
      discoveredSkillIds: ['a', 'b'],
      routedSkillId: null,
      topScores: { a: 0.5, b: 0.9 },
      activeSkillIds: ['c', 'd']
    })
    expect(result).toContain('c')
    expect(result).toContain('d')
  })

  it('deduplicates', () => {
    const result = pickToolSkillIds({
      discoveredSkillIds: ['a', 'b', 'c', 'a'],
      routedSkillId: null,
      topScores: { a: 0.5, b: 0.9 }
    })
    expect(new Set(result).size).toBe(result.length)
  })
})
```

Also add a test for `estimateToolTokens`:

```js
describe('estimateToolTokens', () => {
  it('estimates tokens for a simple tool definition', () => {
    const result = estimateToolTokens({
      type: 'function',
      function: {
        name: 'test_tool',
        description: 'A test tool',
        parameters: {
          type: 'object',
          properties: {
            input: { type: 'string' }
          },
          required: ['input']
        }
      }
    })
    expect(typeof result).toBe('number')
    expect(result).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Implement the updated skills.js**

```js
function shouldExposeSkillTools(userText, selectedSkills, skillRegistry) {
  return Array.isArray(selectedSkills) && selectedSkills.length > 0
}

function normalizeDiscoveryText(rawText) {
  const text = String(rawText || '').trim()
  if (!text) return ''
  return text.replace(/^\[INSTRUCAO:[^\]]+\]\s*/i, '').trim()
}

function buildToolResultPreview(result) {
  try {
    if (Array.isArray(result?.webSources) && result.webSources.length > 0) {
      return result.webSources
        .slice(0, 3)
        .map((s) => String(s?.title || '').trim())
        .filter(Boolean)
        .join(' | ')
    }
    const instruction = String(result?.instruction || '')
      .replace(/\s+/g, ' ')
      .trim()
    if (instruction) return instruction.slice(0, 220)
  } catch {}
  return ''
}

function estimateToolTokens(toolDef) {
  try {
    const json = JSON.stringify(toolDef)
    return Math.ceil(json.length / 3)
  } catch {
    return 50
  }
}

function pickToolSkillIds({ discoveredSkillIds, routedSkillId, topScores, activeSkillIds }) {
  const allIds = new Set([
    ...(activeSkillIds || []),
    ...discoveredSkillIds
  ])

  const ranked = [...allIds]
    .map((id) => ({ id, score: Number(topScores?.[id] || 0) }))
    .sort((a, b) => b.score - a.score)
    .map((x) => x.id)

  if (!routedSkillId) return ranked

  const out = [routedSkillId]
  for (const id of ranked) {
    if (id === routedSkillId) continue
    out.push(id)
  }
  return out
}

module.exports = {
  shouldExposeSkillTools,
  normalizeDiscoveryText,
  buildToolResultPreview,
  estimateToolTokens,
  pickToolSkillIds
}
```

- [ ] **Step 3: Run tests to verify**

Run: `cd apps/momai && npx vitest run --reporter=verbose scripts/node-core/tests/chat-skills-utils.test.js`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/momai/scripts/node-core/services/chat/skills.js apps/momai/scripts/node-core/tests/chat-skills-utils.test.js
git commit -m "feat(skills): remove maxSkills, add estimateToolTokens and activeSkillIds support"
```

---

### Task 7: chat-service.js — integrate meta-tools, remove XML, dynamic budget, toolToSkillMap

**Files:**
- Modify: `apps/momai/scripts/node-core/services/chat-service.js`

**Interfaces:**
- Consumes: `pickToolSkillIds` (without maxSkills), `executeMetaTool` from registry, `toOpenAITools` (returning `{tools, toolToSkillMap}`), `MEMORIES_DIR` from constants, `createMemoryFS` from memory-fs.js
- Produces: Updated `streamLlamaChat` with activeSkillIds, meta-tools, dynamic budget, no XML

- [ ] **Step 1: Add activeSkillIds state and meta-tools to streamLlamaChat**

In the `streamLlamaChat` function in chat-service.js, after the existing variable declarations (around line 368), add:

```js
const activeSkillIds = new Set()
const META_TOOL_DEFS = [
  {
    type: 'function',
    function: {
      name: 'memory',
      description: 'Save or list information in MomAI personal memory files.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['add', 'delete', 'list'] },
          target: { type: 'string', enum: ['user', 'knowledge'] },
          content: { type: 'string' }
        },
        required: ['action', 'target']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_skills',
      description: 'Search available skills by query. Returns skill names and descriptions.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'What you need help with' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'request_skill',
      description: 'Load tools from a specific skill so you can use it. Skill must be installed.',
      parameters: {
        type: 'object',
        properties: {
          skill_name: { type: 'string', description: 'Skill name as returned by list_skills' }
        },
        required: ['skill_name']
      }
    }
  }
]
```

- [ ] **Step 2: Replace the tool injection block (lines 797-843)**

Replace the section from `/* Converte skills em tools flat */` to just before `/* Skills disponiveis e regras de prioridade */`:

```js
    /* Converte skills em tools flat */
    let toolToSkillMap = new Map()
    if (
      shouldSendTools &&
      selectedSkills.length > 0 &&
      skillRegistry &&
      typeof skillRegistry.toOpenAITools === 'function'
    ) {
      const skillIdsForTools = pickToolSkillIds({
        discoveredSkillIds,
        routedSkillId,
        topScores,
        activeSkillIds: [...activeSkillIds]
      })
      const result = skillRegistry.toOpenAITools(skillIdsForTools)
      toolsPayload = result.tools || []
      toolToSkillMap = result.toolToSkillMap || new Map()
    }
```

- [ ] **Step 3: Replace the skills block (lines 846-865)**

Replace the section from `/* Skills disponiveis */` to `toolInstruction = skillDesc`:

```js
    /* Skills disponiveis e regras de prioridade para o LLM */
    if (selectedSkills.length > 0) {
      const skillsBlock = selectedSkills
        .map((s) => `- ${s.manifest.name}: ${s.manifest.description}`)
        .join('\n')
      const toolPriorityBody = buildToolPriority(selectedSkills)
      const toolPriorityBlock = toolPriorityBody ? `Prioridade:\n${toolPriorityBody}` : ''
      const toolAvailabilityNote = shouldSendTools
        ? 'Tool schemas for these skills are available in this turn.'
        : 'Only skill summaries are available in this turn. Request a specific skill by name if you need its tools.'
      const activeSkillsLine = activeSkillIds.size > 0
        ? `Active skills this turn: ${[...activeSkillIds].join(', ')}.`
        : ''
      const metaToolsNote = 'If you need another skill, use list_skills to search or request_skill to load.'
      const skillDesc = [
        `Skills ativas:\n${skillsBlock}`,
        toolAvailabilityNote,
        toolPriorityBlock,
        activeSkillsLine,
        metaToolsNote
      ].filter(Boolean).join('\n\n')
      toolInstruction = skillDesc
    }
```

- [ ] **Step 4: Add meta-tools to toolsPayload before sending to LLM**

Around line 899 (just before the while loop `while (round < maxToolRounds)`), add:

```js
    /* Prepend meta-tools to tools payload (always available) */
    toolsPayload = [...META_TOOL_DEFS, ...toolsPayload]
```

- [ ] **Step 5: Handle meta-tool execution in the tool execution loop**

In the tool execution section (the part that reads tool results and routes them), add a branch before the existing `skillRegistry.execute` call:

```js
    /* Check if tool is a meta-tool */
    const isMetaTool = ['memory', 'list_skills', 'request_skill'].includes(toolName)
    if (isMetaTool) {
      let result
      if (toolName === 'memory') {
        // Use memory-fs.js directly
        const memFS = createMemoryFS({ memoriesDir })
        try {
          const action = String(toolArgs.action || '').trim()
          const target = String(toolArgs.target || '').trim()
          if (action === 'add') {
            const r = memFS.addMemoryEntry(target, toolArgs.content || '')
            result = `Saved to ${target} memory.`
          } else if (action === 'delete') {
            memFS.deleteMemoryEntry(target, toolArgs.content || '')
            result = `Deleted from ${target} memory.`
          } else {
            const r = memFS.readMemoryFile(target)
            result = r.entries.length > 0 ? r.entries.join('\n') : `No entries in ${target} memory.`
          }
        } catch (e) {
          result = `Error: ${e.message}`
        }
      } else if (toolName === 'list_skills') {
        result = skillRegistry.executeMetaTool('list_skills', toolArgs)
      } else if (toolName === 'request_skill') {
        const skillName = String(toolArgs.skill_name || '').trim()
        const skill = skillRegistry.getById(skillName)
        if (skill && skill.enabled) {
          activeSkillIds.add(skillName)
        }
        result = skillRegistry.executeMetaTool('request_skill', toolArgs)
      }
      // Add result as tool response
      toolResults.push({ tool: toolName, result })
      continue
    }

    /* Determine skillId from toolToSkillMap */
    const executingSkillId = toolToSkillMap.get(toolName)
```

- [ ] **Step 6: Update buildSystemPrompt call site (around line 870)**

Replace the `buildSystemPrompt` call to pass the new parameters:

```js
      promptText = promptRegistry.buildSystemPrompt({
        threadId,
        tier: tierName,
        userName: store.settings.user_name || 'Usuário',
        persona:
          store.settings.assistant_persona ||
          (promptRegistry.getDefaults ? promptRegistry.getDefaults().assistant_persona : 'MomAI'),
        memoryContext,
        toolInstruction,
        responseStyle,
        responseLanguage,
        locale: store.settings.locale || 'pt-BR',
        modelName: store.settings.ai_model || 'local',
        hasHistory,
        memoriesDir
      })
```

- [ ] **Step 7: Add import for memory-fs.js at top of chat-service.js**

At the top of the file, add:

```js
const { createMemoryFS } = require('../infrastructure/memory-fs')
const { MEMORIES_DIR } = require('../config/constants')
const memoriesDir = MEMORIES_DIR
```

- [ ] **Step 8: Update _testExports (lines 1834-1860)**

Add `estimateToolTokens` to the test exports:

```js
const _testExports = {
  // ...existing exports...
  estimateToolTokens,
  // ...rest of existing exports...
}
```

- [ ] **Step 9: Run existing tests to verify no regression**

Run: `cd apps/momai && npx vitest run --reporter=verbose scripts/node-core/tests/`
Expected: Existing tests pass (chat-fallback.test.js, chat-language.test.js, chat-skills-utils.test.js, skills-registry.test.js, etc.)

- [ ] **Step 10: Commit**

```bash
git add apps/momai/scripts/node-core/services/chat-service.js
git commit -m "feat(chat): integrate meta-tools, remove XML, dynamic budget, activeSkillIds support"
```

---

### Task 8: Settings UI — Brain tab memory editor

**Files:**
- Modify: `apps/momai/src/renderer/src/components/floating/settings/tabs/BrainTab.tsx`

**Interfaces:**
- Consumes: `api` from renderer services (GET/PATCH `/memories/:filename`)
- Produces: Memory editor section inside BrainTab with 3 sub-files

- [ ] **Step 1: Add memory editor state and API calls to BrainTab**

At the top of BrainTab.tsx, add imports:

```tsx
import { useState, useEffect } from 'react'
import { api } from '../../../services/api'
```

Inside the BrainTab component, add state:

```tsx
const [memoryFiles, setMemoryFiles] = useState<Record<string, string>>({})
const [savingFile, setSavingFile] = useState<string | null>(null)

const loadMemoryFile = async (name: string) => {
  try {
    const res = await api.get(`/memories/${name}`)
    if (res.data?.content !== undefined) {
      setMemoryFiles((prev) => ({ ...prev, [name]: res.data.content }))
    }
  } catch { /* ignore */ }
}

const saveMemoryFile = async (name: string) => {
  setSavingFile(name)
  try {
    await api.patch(`/memories/${name}`, { content: memoryFiles[name] || '' })
  } catch (e) {
    console.error('Error saving memory file:', e)
  } finally {
    setSavingFile(null)
  }
}

// Load memory files on mount
useEffect(() => {
  loadMemoryFile('usuario')
  loadMemoryFile('persona')
  loadMemoryFile('conhecimento')
}, [])
```

- [ ] **Step 2: Add memory section UI inside the BrainTab JSX**

After the existing `<div className="space-y-4">` closing tag and before the outer `</div>`, add:

```tsx
{/* Memory Section */}
<div className="pt-4 border-t border-border/10">
  <label className="text-[11px] font-semibold text-text-muted uppercase tracking-wide mb-3 block">
    Memória Persistente
  </label>

  {[
    { key: 'usuario', label: 'Usuário', desc: 'Preferências e dados pessoais' },
    { key: 'persona', label: 'Persona', desc: 'Identidade da MomAI (editável pelo usuário)' },
    { key: 'conhecimento', label: 'Conhecimento', desc: 'Fatos aprendidos pela IA' }
  ].map(({ key, label, desc }) => (
    <div key={key} className="mb-3">
      <div className="flex items-center justify-between mb-1">
        <div>
          <span className="text-xs font-semibold text-text">{label}</span>
          <span className="text-[10px] text-text-muted ml-2">{desc}</span>
        </div>
        <button
          onClick={() => saveMemoryFile(key)}
          disabled={savingFile === key}
          className="px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wide bg-accent/10 border border-accent/20 text-accent hover:bg-accent/20 transition-colors disabled:opacity-50"
        >
          {savingFile === key ? 'Salvando...' : 'Salvar'}
        </button>
      </div>
      <textarea
        value={memoryFiles[key] || ''}
        onChange={(e) => setMemoryFiles((prev) => ({ ...prev, [key]: e.target.value }))}
        className="w-full h-20 bg-input border border-border/60 rounded-lg px-3 py-2 text-xs text-text focus:border-accent/40 outline-none resize-none transition-all font-mono leading-relaxed placeholder:text-text-muted/30"
        placeholder={`# ${label}\nFatos sobre o usuário...`}
      />
    </div>
  ))}
</div>
```

- [ ] **Step 3: Verify build**

Run: `cd apps/momai && pnpm typecheck:web`
Expected: PASS (no TypeScript errors)

- [ ] **Step 4: Commit**

```bash
git add apps/momai/src/renderer/src/components/floating/settings/tabs/BrainTab.tsx
git commit -m "feat(settings): add memory editor section inside BrainTab"
```

---

### Task 9: sync toLinear issue status

- [ ] **Step 1: Update MOM-72 to In Progress and create branch**

```bash
git checkout -b wesleyqueirozdeveloper/mom-72-10h-memoria-md-prompts-sqlite-harness-3-tier-skill-loading
```

- [ ] **Step 2: Update Linear issue status via API comment**

Note: Branch created from main (no worktree) as requested.

---

## Final validation

After all tasks complete:

1. `cd apps/momai && pnpm typecheck` — no TS errors
2. `cd apps/momai && pnpm lint` — no lint errors  
3. `cd apps/momai && npx vitest run --reporter=verbose` — all tests pass
4. Manual: verify `data/memories/` directory created on startup
5. Manual: verify `GET /memories/usuario` returns content
6. Manual: verify `PATCH /memories/usuario` updates file
7. Manual: verify no XML tags visible in any prompt output
