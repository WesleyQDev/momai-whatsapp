# Node-Core & Scripts Performance Fixes

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate all Node-Core performance issues (12 High, 18 Medium, 7 Low) to make the AI pipeline extremely responsive.

**Architecture:** Fixes target `apps/momai/scripts/` — SSE streaming, chat service, TTS, store persistence, skill loading, and filesystem scanning.

**Tech Stack:** Node.js, Express, WebSocket, child_process IPC

---

## Phase 1: Critical Responsiveness (P1)

### Task P1.1: Add SSE backpressure handling

**Files:**
- Modify: `apps/momai/scripts/node-core/infrastructure/http-helpers.js:25-35`

**Problem:** `res.write()` in hot loop with no drain check — risk of OOM under load when consumer is slower than producer.

- [ ] **Step 1: Add backpressure-aware writeSse**

```javascript
// apps/momai/scripts/node-core/infrastructure/http-helpers.js
function writeSse(res, data) {
  if (res.destroyed || res.writableEnded) return false
  const chunk = `data: ${JSON.stringify(data)}\n\n`
  const canContinue = res.write(chunk)
  if (!canContinue) {
    return new Promise((resolve) => {
      res.once('drain', () => resolve(true))
    })
  }
  return true
}

function endSse(res) {
  if (!res.destroyed && !res.writableEnded) {
    res.end()
  }
}

module.exports = { readJsonBody, writeSse, endSse }
```

- [ ] **Step 2: Update chat-service.js writes to use backpressure**

In every write loop, `await` the result of `writeSse` when it returns a Promise:

```javascript
// In streaming loops, replace:
// writeSse(res, { type: 'token', data: token })
// with:
const result = writeSse(res, { type: 'token', data: token })
if (result instanceof Promise) await result
```

- [ ] **Step 3: Commit**

```bash
git add apps/momai/scripts/node-core/infrastructure/http-helpers.js apps/momai/scripts/node-core/services/chat-service.js
git commit -m "perf(node-core): add SSE backpressure with drain handling"
```

### Task P1.2: Add stream destroyed guard in SSE write loop

**Files:**
- Modify: `apps/momai/scripts/node-core/services/chat-service.js`

- [ ] **Step 1: Add destroyed guard**

```javascript
// In writeSse:
function writeSse(res, data) {
  if (res.destroyed || res.writableEnded) return false
  // ...
}

// In chat-service.js streaming loop:
while (!closed && !res.destroyed) {
  // ... loop logic
  const result = writeSse(res, chunk)
  if (result === false) break  // stream destroyed
  if (result instanceof Promise) await result
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/momai/scripts/node-core/infrastructure/http-helpers.js apps/momai/scripts/node-core/services/chat-service.js
git commit -m "fix(node-core): guard SSE writes against destroyed streams"
```

### Task P1.3: Reduce TTS retry count and fix promise chain

**Files:**
- Modify: `apps/momai/scripts/node-core/services/tts-service.js:165-223`

**Problem:** TTS retries up to 45x with ~47s cumulative delay. Chain blocks token streaming.

- [ ] **Step 1: Reduce max retries and add timeout**

```javascript
// tts-service.js - kokoro retry
const MAX_KOKORO_RETRIES = 8  // was 45
const MAX_TTS_RETRIES = 5     // was 20
const TTS_RETRY_BASE_DELAY = 500
const TTS_TIMEOUT = 10000     // 10s per attempt

async function triggerAutoTts(...) {
  const maxRetries = engine === 'kokoro' ? MAX_KOKORO_RETRIES : MAX_TTS_RETRIES

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const result = await Promise.race([
        doTtsCall(...),
        new Promise((_, reject) => setTimeout(() => reject(new Error('TTS timeout')), TTS_TIMEOUT))
      ])
      return result
    } catch (err) {
      if (attempt === maxRetries - 1) throw err
      await new Promise(r => setTimeout(r, TTS_RETRY_BASE_DELAY + attempt * 100))
    }
  }
}
```

- [ ] **Step 2: Fix ttsChain to use bounded queue**

```javascript
// chat-service.js - replace:
// ttsChain = ttsChain.then(() => triggerAutoTts(...)).catch(() => {})
// with a bounded queue:
const TTS_QUEUE_MAX = 3
const ttsQueue = []

function enqueueTtsChunk(text) {
  ttsQueue.push(text)
  if (ttsQueue.length > TTS_QUEUE_MAX) {
    ttsQueue.shift()  // drop oldest if queue is full
  }
  processTtsQueue()
}

async function processTtsQueue() {
  if (ttsQueue.processing) return
  ttsQueue.processing = true
  while (ttsQueue.length > 0) {
    const chunk = ttsQueue.shift()
    await triggerAutoTts(chunk).catch(err => logger.warn('[TTS]', err.message))
  }
  ttsQueue.processing = false
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/momai/scripts/node-core/services/tts-service.js apps/momai/scripts/node-core/services/chat-service.js
git commit -m "perf(node-core): reduce TTS retries and fix unbounded chain"
```

### Task P1.4: Throttle flushTtsChunks calls

**Files:**
- Modify: `apps/momai/scripts/node-core/services/chat-service.js`

- [ ] **Step 1: Add throttling**

```javascript
// At module level:
let lastTtsFlush = 0
const TTS_FLUSH_INTERVAL = 200  // ms

// In streaming loop, replace:
// flushTtsChunks(false)
// with:
const now = Date.now()
if (now - lastTtsFlush >= TTS_FLUSH_INTERVAL) {
  flushTtsChunks(false)
  lastTtsFlush = now
}
// Always flush at sentence boundaries regardless
// (flushTtsChunks already handles this internally)
```

- [ ] **Step 2: Commit**

```bash
git add apps/momai/scripts/node-core/services/chat-service.js
git commit -m "perf(node-core): throttle flushTtsChunks to every 200ms"
```

---

## Phase 2: Stability & Memory (P2)

### Task P2.1: Implement thread message pruning

**Files:**
- Modify: `apps/momai/scripts/node-core/infrastructure/store.js`
- Modify: `apps/momai/scripts/node-core/services/chat-service.js`

- [ ] **Step 1: Add message limit to store**

```javascript
// store.js - add after appendMessage:
const MAX_MESSAGES_PER_THREAD = 500

function pruneThread(threadId) {
  const msgs = store.thread_messages[threadId]
  if (msgs && msgs.length > MAX_MESSAGES_PER_THREAD) {
    const excess = msgs.length - MAX_MESSAGES_PER_THREAD
    store.thread_messages[threadId] = msgs.slice(excess)
  }
}
```

- [ ] **Step 2: Call prune after appendMessage**

```javascript
// chat-service.js - after appendMessage:
store.pruneThread(threadId)
```

- [ ] **Step 3: Commit**

```bash
git add apps/momai/scripts/node-core/infrastructure/store.js apps/momai/scripts/node-core/services/chat-service.js
git commit -m "perf(node-core): add thread message pruning at 500 messages"
```

### Task P2.2: Incremental store persistence (messages only)

**Files:**
- Modify: `apps/momai/scripts/node-core/infrastructure/store.js`

- [ ] **Step 1: Separate message persistence**

```javascript
// Instead of serializing entire store on every appendMessage:
// Keep messages in a separate append-only log

const MESSAGES_DIR = path.join(storePath, 'messages')
// ... init on loadStore

function appendMessageLog(threadId, message) {
  const logFile = path.join(MESSAGES_DIR, `${threadId}.jsonl`)
  fs.appendFileSync(logFile, JSON.stringify(message) + '\n')
}

// Full store serialization only for settings/reminders/extensions
// (called less frequently)
```

- [ ] **Step 2: Commit**

```bash
git add apps/momai/scripts/node-core/infrastructure/store.js
git commit -m "perf(node-core): incremental message persistence with append-log"
```

### Task P2.3: Async filesystem for launcher skill

**Files:**
- Modify: `apps/momai/scripts/skills/packaged/launcher/runtime.js`

- [ ] **Step 1: Convert sync fs to async**

```javascript
const fs = require('fs/promises')

async function buildFullIndex() {
  // Replace fs.readdirSync with fs.readdir
  // Yield to event loop periodically
  let count = 0
  for (const dir of searchDirs) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true })
      for (const entry of entries) {
        count++
        if (count % 50 === 0) {
          await new Promise(r => setImmediate(r))  // yield
        }
        // ... process entry
      }
    } catch { /* skip inaccessible dirs */ }
  }
}
```

- [ ] **Step 2: Increase cache TTL to 5 minutes**

```javascript
const INDEX_TTL = 5 * 60 * 1000  // was 60s
```

- [ ] **Step 3: Add periodic yield in collectFiles (dev skill)**

```javascript
// apps/momai/scripts/skills/packaged/dev/runtime.js:117-141
// Add yield every 100 files:
if (fileCount % 100 === 0) {
  await new Promise(r => setImmediate(r))
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/momai/scripts/skills/packaged/launcher/runtime.js apps/momai/scripts/skills/packaged/dev/runtime.js
git commit -m "perf(node-core): async filesystem in launcher and dev skills"
```

### Task P2.4: Cache toOpenAITools output

**Files:**
- Modify: `apps/momai/scripts/node-core/skills/registry.js:495-544`

- [ ] **Step 1: Add cache with invalidation**

```javascript
let _toolsCache = null
let _toolsCacheGeneration = 0

function toOpenAITools(toolSkillIds) {
  // Invalidate when skills change (increment generation in loadSkills)
  if (_toolsCache && _toolsCacheGeneration === _currentGeneration) {
    return _toolsCache
  }

  const result = buildToolsArray(toolSkillIds)
  _toolsCache = result
  return result
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/momai/scripts/node-core/skills/registry.js
git commit -m "perf(node-core): cache toOpenAITools output"
```

### Task P2.5: Fix LogDedupCache memory leak

**Files:**
- Modify: `apps/momai/src/main/coreManager.ts:73-105`

- [ ] **Step 1: Add proper eviction**

```typescript
function logDedupCachePrune() {
  const now = Date.now()
  for (const [key, ts] of logDedupCache) {
    if (now - ts > LOG_DEDUP_WINDOW_MS * 3) {
      logDedupCache.delete(key)
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/momai/src/main/coreManager.ts
git commit -m "perf(main): fix LogDedupCache unbounded growth"
```

### Task P2.6: Parallelize GitHub star fetching

**Files:**
- Modify: `apps/momai/scripts/node-core/services/skill-orchestrator.js:38-92`

- [ ] **Step 1: Use Promise.all with concurrency**

```javascript
async function buildExtensionsPayload() {
  const skills = getAllSkills()
  const concurrency = 5

  // Process in batches
  for (let i = 0; i < skills.length; i += concurrency) {
    const batch = skills.slice(i, i + concurrency)
    await Promise.all(batch.map(async (skill) => {
      if (skill.repo) {
        skill.stars = await communityRegistry.getGitHubStars(skill.repo)
      }
    }))
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/momai/scripts/node-core/services/skill-orchestrator.js
git commit -m "perf(node-core): parallelize GitHub star fetching"
```

---

## Phase 3: Hardening (P3)

### Task P3.1: Add logging to empty catch handlers

**Files:** All `.catch(() => {})` patterns throughout scripts/

- [ ] **Step 1: Audit and fix**

Find all .catch(() => {}) patterns and add logging:

```javascript
// Before:
somePromise.catch(() => {})

// After:
somePromise.catch(err => logger.warn('[background]', err.message))
```

Key locations:
- `apps/momai/scripts/node-core/index.js:244-251`
- `apps/momai/scripts/node-core/index.js:494-500`
- `apps/momai/scripts/node-core/services/chat-service.js:574-575`
- `apps/momai/scripts/node-core/services/chat-service.js:641-644`
- `apps/momai/scripts/node-core/services/semantic-engine.js:383-384`

- [ ] **Step 2: Commit**

```bash
git add apps/momai/scripts/node-core/index.js apps/momai/scripts/node-core/services/chat-service.js apps/momai/scripts/node-core/services/semantic-engine.js
git commit -m "refactor(node-core): add logging to empty catch handlers"
```

### Task P3.2: Fix duplicate readdir in normalizeSkillRecord

**Files:**
- Modify: `apps/momai/scripts/node-core/skills/registry.js:112-141`

- [ ] **Step 1: Read directory once**

```javascript
function normalizeSkillRecord(dir) {
  let entries
  try {
    entries = fs.readdirSync(dir)
  } catch {
    return null
  }

  const entrySet = new Set(entries)

  // Check README:
  const readme = ['README.md', 'README.txt', ...]
    .find(name => entrySet.has(name))

  // Check locales:
  const locales = entries
    .filter(e => e.endsWith('.json') && entrySet.has(e))
    .filter(e => ...)
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/momai/scripts/node-core/skills/registry.js
git commit -m "perf(node-core): eliminate duplicate readdir in normalizeSkillRecord"
```

### Task P3.3: Latency histogram circular buffer

**Files:**
- Modify: `apps/momai/scripts/node-core/services/semantic-engine.js:58-63`

- [ ] **Step 1: Replace unbounded arrays**

```javascript
// Replace arrays with fixed-size buffers:
const MAX_HISTORY = 1000

function addLatencyMetric(arr, value) {
  arr.push(value)
  if (arr.length > MAX_HISTORY) arr.shift()
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/momai/scripts/node-core/services/semantic-engine.js
git commit -m "perf(node-core): cap latency histogram at 1000 entries"
```

### Task P3.4: Fix memorySources unbounded growth

**Files:**
- Modify: `apps/momai/scripts/node-core/services/chat-service.js:1404-1406`

- [ ] **Step 1: Enforce hard cap**

```javascript
// After appending:
const MAX_SOURCES = 20
if (memorySources.length > MAX_SOURCES) {
  memorySources = memorySources.slice(-MAX_SOURCES)
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/momai/scripts/node-core/services/chat-service.js
git commit -m "perf(node-core): cap memorySources at 20 entries"
```

### Task P3.5: Exponential backoff for Python WS reconnect

**Files:**
- Modify: `apps/momai/scripts/node-core/api/websocket.js:114-118`

- [ ] **Step 1: Add backoff**

```javascript
let reconnectDelay = 5000
const MAX_RECONNECT_DELAY = 60000

function scheduleReconnect() {
  setTimeout(() => {
    connectPythonSidecar()
    reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY)
  }, reconnectDelay)
}

// Reset on successful connect:
function onConnected() {
  reconnectDelay = 5000
  // ...
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/momai/scripts/node-core/api/websocket.js
git commit -m "perf(node-core): exponential backoff for Python WS reconnect"
```

### Task P3.6: readJsonBody use Buffer.concat

**Files:**
- Modify: `apps/momai/scripts/node-core/infrastructure/http-helpers.js:33-53`

- [ ] **Step 1: Switch to Buffer.concat**

```javascript
function readJsonBody(req, maxSize = 3 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let total = 0
    req.on('data', (chunk) => {
      total += chunk.length
      if (total > maxSize) {
        reject(new Error('Request body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8')
      try {
        resolve(JSON.parse(body))
      } catch (e) {
        reject(new Error('Invalid JSON'))
      }
    })
    req.on('error', reject)
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/momai/scripts/node-core/infrastructure/http-helpers.js
git commit -m "perf(node-core): use Buffer.concat in readJsonBody"
```
