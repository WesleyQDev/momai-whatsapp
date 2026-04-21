const http = require('node:http')
const net = require('node:net')
const { URL } = require('node:url')
const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')
const crypto = require('node:crypto')
const https = require('node:https')
const { spawn } = require('node:child_process')
const { createSkillRegistry } = require('./skills/registry')
const { createPromptRegistry } = require('./prompt-registry')

const HOST = process.env.MOMAI_NODE_CORE_HOST || '127.0.0.1'
const PORT = Number(process.env.MOMAI_NODE_CORE_PORT || 8000)
const DATA_DIR = process.env.MOMAI_NODE_CORE_DATA_DIR || path.join(process.cwd(), 'data')
const STORE_FILE = path.join(DATA_DIR, 'node-core-store.json')
const CORE_PATH = process.env.MOMAI_CORE_PATH || path.resolve(__dirname, '..', '..', 'core')
const MODELS_DIR = resolveModelsDir()
const LLAMA_BIN_CANDIDATES = [
  process.env.MOMAI_LLAMA_BIN_PATH,
  path.resolve(__dirname, '..', 'bin', 'llama'),
  process.resourcesPath ? path.join(process.resourcesPath, 'bin', 'llama') : null,
  process.resourcesPath
    ? path.join(process.resourcesPath, 'app.asar.unpacked', 'bin', 'llama')
    : null
].filter(Boolean)
const TIERS_CONFIG_PATH = path.join(CORE_PATH, 'ai_tiers.json')
const MODEL_DOWNLOAD_TIMEOUT_MS = Number(
  process.env.MOMAI_MODEL_DOWNLOAD_TIMEOUT_MS || 15 * 60 * 1000
)

const PYTHON_HOST = process.env.MOMAI_PYTHON_SIDECAR_HOST || '127.0.0.1'
const PYTHON_PORT = Number(process.env.MOMAI_PYTHON_SIDECAR_PORT || 8001)
const PYTHON_BASE_URL = `http://${PYTHON_HOST}:${PYTHON_PORT}`

const LLAMA_HOST = '127.0.0.1'
const LLAMA_PORT = Number(process.env.MOMAI_LLAMA_PORT || 8080)
const EMBEDDING_PORT = Number(process.env.MOMAI_EMBEDDING_PORT || 8081)
const EMBEDDING_BASE_URL = `http://${LLAMA_HOST}:${EMBEDDING_PORT}`

function getLlamaBaseUrl() {
  const port = Number(llamaState?.port || LLAMA_PORT)
  return `http://${LLAMA_HOST}:${port}`
}

function checkPortAvailable(port, host = LLAMA_HOST) {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.unref()
    server.once('error', () => {
      resolve(false)
    })
    server.listen({ port, host }, () => {
      server.close(() => resolve(true))
    })
  })
}

async function pickAvailablePort(preferredPort, maxAttempts = 20) {
  const base = Number(preferredPort || LLAMA_PORT)
  for (let i = 0; i < maxAttempts; i += 1) {
    const candidate = base + i
    // eslint-disable-next-line no-await-in-loop
    const available = await checkPortAvailable(candidate)
    if (available) return candidate
  }
  return base
}

const NOTES_DIR = path.join(DATA_DIR, 'notes')
const NOTES_INDEX_FILE = path.join(NOTES_DIR, '.index.json')
const SEMANTIC_DIR = path.join(DATA_DIR, 'semantic')
const SEMANTIC_DB_DIR = path.join(SEMANTIC_DIR, 'lancedb')
const PROMPTS_DIR = path.resolve(__dirname, '..', 'prompts')

const MAX_EMBEDDING_CACHE_SIZE = 512
const EMBEDDING_CACHE_TTL_MS = 10 * 60 * 1000
const EMBEDDING_TIMEOUT_MS = 450
const SEMANTIC_SYNC_INTERVAL_MS = 30 * 1000

function resolveModelsDir() {
  const envPath = String(process.env.MOMAI_MODELS_DIR || '').trim()
  if (envPath) return envPath
  if (process.resourcesPath) {
    const packagedCorePath = path.join(process.resourcesPath, 'core')
    if (CORE_PATH === packagedCorePath || CORE_PATH.startsWith(packagedCorePath + path.sep)) {
      return path.join(DATA_DIR, 'models')
    }
  }
  return path.join(CORE_PATH, 'models')
}

let WebSocketServer = null
try {
  WebSocketServer = require('ws').WebSocketServer
} catch {
  console.warn('[NodeCore] ws module not available, websocket features disabled.')
}

function log(message) {
  if (typeof process.send === 'function') {
    process.send({ type: 'node-core-log', message })
  } else {
    console.log(message)
  }
}

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
}

const builtinSkillsDir = path.resolve(__dirname, 'skills', 'core')
const skillRegistry = createSkillRegistry({
  dataDir: DATA_DIR,
  builtinSkillsDir
})
log(`[core] Skill registry initialized from: ${builtinSkillsDir}`)
const promptRegistry = createPromptRegistry({
  promptsDir: PROMPTS_DIR
})

const DEFAULT_TIERS = {
  lite: {
    file: 'Qwen3.5-0.8B-Q4_K_M.gguf',
    repo: 'Qwen/Qwen3.5-0.8B-GGUF',
    enable_vision: false,
    ctx_size: 8192,
    request_ctx_size: 4096,
    gpu_layers: 99,
    temperature: 0.7,
    top_p: 0.8,
    top_k: 20,
    presence_penalty: 0.6,
    repetition_penalty: 1.05,
    max_tokens: 192
  },
  pro: {
    file: 'Qwen3.5-2B-Q4_K_M.gguf',
    repo: 'Qwen/Qwen3.5-2B-GGUF',
    enable_vision: false,
    ctx_size: 8192,
    request_ctx_size: 6144,
    gpu_layers: 99,
    temperature: 0.7,
    top_p: 0.8,
    top_k: 20,
    presence_penalty: 0.6,
    repetition_penalty: 1.05,
    max_tokens: 320
  },
  ultra: {
    file: 'Qwen3.5-4B-Q4_K_M.gguf',
    repo: 'Qwen/Qwen3.5-4B-GGUF',
    enable_vision: false,
    ctx_size: 8192,
    request_ctx_size: 8192,
    gpu_layers: 99,
    temperature: 0.7,
    top_p: 0.8,
    top_k: 20,
    presence_penalty: 0.6,
    repetition_penalty: 1.05,
    max_tokens: 512,
    embedding_file: 'Qwen3-Embedding-0.6B-Q8_0.gguf',
    embedding_repo: 'Qwen/Qwen3-Embedding-0.6B-GGUF'
  }
}

function loadTierConfig() {
  if (!fs.existsSync(TIERS_CONFIG_PATH)) return DEFAULT_TIERS
  try {
    const parsed = JSON.parse(fs.readFileSync(TIERS_CONFIG_PATH, 'utf8'))
    const merged = { ...DEFAULT_TIERS }
    for (const tierName of Object.keys(parsed || {})) {
      const tierValue = parsed[tierName]
      if (tierValue && typeof tierValue === 'object' && !Array.isArray(tierValue)) {
        merged[tierName] = {
          ...(DEFAULT_TIERS[tierName] || {}),
          ...tierValue
        }
      } else {
        merged[tierName] = tierValue
      }
    }
    return merged
  } catch (error) {
    console.error('[NodeCore] Failed to parse ai_tiers.json:', error)
    return DEFAULT_TIERS
  }
}

const tiersConfig = loadTierConfig()

const store = loadStore()

function applyPerformanceProfile() {
  let changed = false

  if (!['auto', 'vulkan', 'cpu'].includes(store.settings.local_backend)) {
    store.settings.local_backend = 'auto'
    changed = true
  }

  if (changed) {
    saveStore()
  }
}

applyPerformanceProfile()

function defaultStore() {
  const now = new Date().toISOString()
  const promptDefaults = promptRegistry.getDefaults()
  return {
    settings: {
      user_name: 'Senhor',
      assistant_persona: promptDefaults.assistant_persona,
      ai_provider: 'local',
      ai_model: 'Qwen 3.5',
      local_backend: 'auto',
      auto_start_llm: true,
      tts_voice: 'pf_dora',
      tts_enabled: true,
      wake_word_enabled: false,
      wake_word_sensitivity: 5,
      locale: 'pt-BR',
      min_interface_chars: 240,
      prebuffer_chars: 0,
      onboarding_completed: false,
      tutorial_completed: false,
      ai_tier: null,
      skip_intro: false
    },
    mode: 'local',
    call_mode: false,
    reminders: [],
    next_reminder_id: 1,
    extensions: [],
    gaming_apps: [],
    next_gaming_app_id: 1,
    thread_messages: {},
    session_titles: {},
    next_message_id: 1,
    init_status: {
      stage: 'ready',
      message: 'System ready.',
      progress: 100,
      error: null,
      updated_at: now
    }
  }
}

function loadStore() {
  if (!fs.existsSync(STORE_FILE)) return defaultStore()
  try {
    const raw = fs.readFileSync(STORE_FILE, 'utf8')
    const parsed = JSON.parse(raw)
    return {
      ...defaultStore(),
      ...parsed,
      settings: { ...defaultStore().settings, ...(parsed.settings || {}) }
    }
  } catch (error) {
    console.error('[NodeCore] Failed to load store:', error)
    return defaultStore()
  }
}

function saveStore() {
  try {
    fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2), 'utf8')
  } catch (error) {
    console.error('[NodeCore] Failed to save store:', error)
  }
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS'
  })
  res.end(JSON.stringify(payload))
}

function sendNoContent(res) {
  res.writeHead(204, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS'
  })
  res.end()
}

function sendSseHeaders(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  })
}

function writeSse(res, payload) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`)
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (chunk) => {
      body += chunk
      if (body.length > 3 * 1024 * 1024) reject(new Error('Payload too large'))
    })
    req.on('end', () => {
      if (!body) {
        resolve({})
        return
      }
      try {
        resolve(JSON.parse(body))
      } catch {
        reject(new Error('Invalid JSON body'))
      }
    })
    req.on('error', reject)
  })
}

function getThreadMessages(threadId) {
  if (!store.thread_messages[threadId]) {
    store.thread_messages[threadId] = []
  }
  return store.thread_messages[threadId]
}

function isoNow() {
  return new Date().toISOString()
}

function appendMessage(threadId, role, content, extras = {}) {
  const messages = getThreadMessages(threadId)
  const item = {
    id: store.next_message_id++,
    role,
    content,
    created_at: isoNow(),
    sources: extras.sources ? JSON.stringify(extras.sources) : null,
    snippets: extras.snippets ? JSON.stringify(extras.snippets) : null,
    cards: extras.cards ? JSON.stringify(extras.cards) : null,
    graph_data: extras.graph_data || null,
    structured_response: extras.structured_response ? JSON.stringify(extras.structured_response) : null
  }
  messages.push(item)
  saveStore()
  return item
}

function listSessions() {
  const out = []
  for (const [threadId, msgs] of Object.entries(store.thread_messages)) {
    const last = msgs[msgs.length - 1]
    const firstUser = msgs.find((m) => m.role === 'user')
    out.push({
      id: threadId,
      lastActivity: last ? last.created_at : null,
      messageCount: msgs.length,
      firstMessage: firstUser ? firstUser.content : null,
      title: store.session_titles[threadId] || null
    })
  }
  out.sort((a, b) => {
    const at = a.lastActivity ? new Date(a.lastActivity).getTime() : 0
    const bt = b.lastActivity ? new Date(b.lastActivity).getTime() : 0
    return bt - at
  })
  return out
}

function parseTime(value) {
  const ts = new Date(value).getTime()
  return Number.isFinite(ts) ? ts : Date.now()
}

function normalizeReminder(input) {
  return {
    id: input.id,
    title: String(input.title || 'Lembrete'),
    content: input.content || '',
    scheduled_time: input.scheduled_time || isoNow(),
    repeat_interval: input.repeat_interval ?? null,
    repeat_value: input.repeat_value ?? null,
    is_active: input.is_active ?? true,
    note_id: input.note_id ?? null,
    action_type: input.action_type || 'reminder',
    voice_response: input.voice_response ?? true
  }
}

function advanceReminder(reminder) {
  const value = reminder.repeat_value || 1
  const current = new Date(reminder.scheduled_time)

  if (!reminder.repeat_interval) {
    reminder.is_active = false
    return
  }

  if (reminder.repeat_interval === 'minutes') current.setMinutes(current.getMinutes() + value)
  else if (reminder.repeat_interval === 'hours') current.setHours(current.getHours() + value)
  else if (reminder.repeat_interval === 'days') current.setDate(current.getDate() + value)
  else if (reminder.repeat_interval === 'weeks') current.setDate(current.getDate() + value * 7)
  else if (reminder.repeat_interval === 'months') current.setMonth(current.getMonth() + value)
  else reminder.is_active = false

  reminder.scheduled_time = current.toISOString()
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true })
}

function sha1(text) {
  return crypto
    .createHash('sha1')
    .update(String(text || ''), 'utf8')
    .digest('hex')
}

function percentile(values, p) {
  if (!Array.isArray(values) || !values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const idx = Math.max(0, Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1))
  return Math.round(sorted[idx] * 100) / 100
}

function rollingPush(list, value, max = 120) {
  if (!Number.isFinite(value)) return
  list.push(value)
  if (list.length > max) list.splice(0, list.length - max)
}

function buildSemanticRuntimeStatus() {
  const totalQueries = semanticState.queryCount
  const fallbackRate = totalQueries > 0 ? semanticState.fallbackCount / totalQueries : 0
  return {
    enabled: semanticState.enabled,
    ready: semanticState.ready,
    degraded: semanticState.degraded,
    last_fallback_reason: semanticState.lastFallbackReason,
    fallback_rate: Math.round(fallbackRate * 1000) / 1000,
    embedding_p50_ms: percentile(semanticState.latency.embeddingMs, 50),
    embedding_p95_ms: percentile(semanticState.latency.embeddingMs, 95),
    retrieval_p50_ms: percentile(semanticState.latency.retrievalMs, 50),
    retrieval_p95_ms: percentile(semanticState.latency.retrievalMs, 95),
    tool_exec_p50_ms: percentile(semanticState.latency.toolExecMs, 50),
    tool_exec_p95_ms: percentile(semanticState.latency.toolExecMs, 95)
  }
}

async function loadLanceModule() {
  if (semanticState.lanceModule) return semanticState.lanceModule
  semanticState.lanceModule = await import('@lancedb/lancedb')
  return semanticState.lanceModule
}

function pickEmbeddingModelPath() {
  if (!fs.existsSync(MODELS_DIR)) return null
  const candidates = fs
    .readdirSync(MODELS_DIR)
    .filter(
      (name) => name.toLowerCase().includes('embedding') && name.toLowerCase().endsWith('.gguf')
    )
    .sort((a, b) => a.localeCompare(b))
  if (!candidates.length) return null
  return path.join(MODELS_DIR, candidates[0])
}

const semanticState = {
  enabled: false,
  ready: false,
  degraded: false,
  lastFallbackReason: null,
  fallbackCount: 0,
  queryCount: 0,
  lastNotesSyncAt: 0,
  lastSkillSyncAt: 0,
  notesSnapshotHash: null,
  lanceModule: null,
  db: null,
  tableNotes: null,
  tableSkills: null,
  tableTools: null,
  embedding: {
    process: null,
    starting: false,
    startingPromise: null,
    ready: false,
    backend: null,
    modelPath: null,
    lastError: null,
    cache: new Map()
  },
  latency: {
    embeddingMs: [],
    retrievalMs: [],
    toolExecMs: []
  }
}

function isSkillEnabledByStore(skill) {
  if (!skill || skill.kind === 'builtin') return true
  const entry = store.extensions.find((e) => e.id === skill.id)
  if (!entry) return true
  return entry.enabled !== false
}

function getEnabledSkills() {
  return skillRegistry.getAll().filter((s) => s.enabled && isSkillEnabledByStore(s))
}

function getEnabledSkillManifests() {
  return getEnabledSkills().map((s) => s.manifest)
}

function buildExtensionsPayload() {
  return skillRegistry.getAll().map((skill) => ({
    id: skill.manifest.id,
    name: skill.manifest.name,
    description: skill.manifest.description,
    category: skill.kind,
    enabled: skill.enabled && isSkillEnabledByStore(skill),
    intents: skill.manifest.intents || [],
    tools: (skill.manifest.tools || []).map((t) => t.name),
    features: {
      sidebar: skill.manifest.sidebar === true,
      agent_name: skill.manifest.id
    }
  }))
}

function getToolCatalogRows() {
  const out = []
  for (const skill of getEnabledSkillManifests()) {
    for (const tool of skill.tools) {
      out.push({
        id: `${skill.id}:${tool.name}`,
        skill_id: skill.id,
        name: tool.name,
        description: tool.description,
        text: `${tool.name}. ${tool.description}. Skill: ${skill.name}.`
      })
    }
  }
  return out
}

function getSkillCatalogRows() {
  return getEnabledSkillManifests().map((skill) => ({
    id: skill.id,
    name: skill.name,
    description: skill.description,
    text: `${skill.name}. ${skill.description}. Intents: ${skill.intents.join(', ')}.`
  }))
}

function cleanupEmbeddingCache() {
  const now = Date.now()
  for (const [key, item] of semanticState.embedding.cache.entries()) {
    if (!item || now - item.ts > EMBEDDING_CACHE_TTL_MS) {
      semanticState.embedding.cache.delete(key)
    }
  }
  if (semanticState.embedding.cache.size <= MAX_EMBEDDING_CACHE_SIZE) return
  const entries = [...semanticState.embedding.cache.entries()].sort((a, b) => a[1].ts - b[1].ts)
  const toDelete = entries.slice(0, entries.length - MAX_EMBEDDING_CACHE_SIZE)
  for (const [key] of toDelete) semanticState.embedding.cache.delete(key)
}

function withTimeout(promise, timeoutMs, timeoutReason) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(timeoutReason)), timeoutMs)
    promise
      .then((value) => {
        clearTimeout(timer)
        resolve(value)
      })
      .catch((err) => {
        clearTimeout(timer)
        reject(err)
      })
  })
}

async function checkEmbeddingHealth() {
  const resp = await fetch(`${EMBEDDING_BASE_URL}/health`, { method: 'GET' })
  return resp.ok
}

async function stopEmbeddingServer() {
  const proc = semanticState.embedding.process
  semanticState.embedding.ready = false
  semanticState.embedding.starting = false
  semanticState.embedding.startingPromise = null
  if (!proc || proc.killed || proc.exitCode !== null) {
    semanticState.embedding.process = null
    return
  }

  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      try {
        proc.kill('SIGKILL')
      } catch {}
    }, 2000)
    proc.once('exit', () => {
      clearTimeout(timer)
      resolve()
    })
    try {
      proc.kill('SIGTERM')
    } catch {
      clearTimeout(timer)
      resolve()
    }
  })
  semanticState.embedding.process = null
}

async function ensureEmbeddingReady() {
  const tier = store.settings.ai_tier || 'pro'
  if (tier !== 'ultra') return false

  if (semanticState.embedding.ready) return true
  if (semanticState.embedding.startingPromise) return semanticState.embedding.startingPromise

  log(`[embedding] Checking embedding server...`)

  log(`[embedding] Searching for model in: ${MODELS_DIR}`)
  let modelPath = pickEmbeddingModelPath()
  if (!modelPath) {
    const tierConfig = tiersConfig.ultra || DEFAULT_TIERS.ultra
    log(`[embedding] Model missing. Attempting auto-download: ${tierConfig.embedding_file}`)

    const downloadResult = await ensureTierModelAvailable('ultra-embedding', {
      file: tierConfig.embedding_file,
      repo: tierConfig.embedding_repo
    })
    if (downloadResult.ok) {
      log(`[embedding] Model downloaded successfully to: ${downloadResult.path}`)
      modelPath = downloadResult.path
    } else {
      log(`[embedding] Download failed: ${downloadResult.reason}`)
      semanticState.lastFallbackReason = 'embedding model not found'
      return false
    }
  }

  log(`[embedding] Selected model: ${modelPath}`)
  semanticState.embedding.startingPromise = new Promise((resolve) => {
    ;(async () => {
      try {
        semanticState.embedding.starting = true
        const backend = pickBackend(store.settings.local_backend || 'auto') || 'cpu'
        const exePath = llamaBackendExePath(backend)
        log(`[embedding] Starting server on port ${EMBEDDING_PORT} (backend: ${backend})`)

        if (!fs.existsSync(exePath)) {
          throw new Error(`llama-server binary missing for ${backend}`)
        }

        const proc = spawn(
          exePath,
          [
            '-m', modelPath,
            '--port', String(EMBEDDING_PORT),
            '--embedding',
            '--parallel', '4',
            '--ctx-size', '2048',
            '--threads', '4',
            '-ngl', backend === 'vulkan' ? '99' : '0'
          ],
          {
            cwd: path.dirname(exePath),
            env: { ...process.env, GGML_VULKAN_DEVICE: '0' },
            stdio: ['ignore', 'pipe', 'pipe']
          }
        )

        semanticState.embedding.process = proc
        log(`[embedding] Process spawned (PID: ${proc.pid})`)

        proc.stdout.on('data', (d) => {
          const line = String(d || '').trim()
          if (line) log(`[embedding][stdout] ${line}`)
        })
        proc.stderr.on('data', (d) => {
          const line = String(d || '').trim()
          if (line) log(`[embedding][stderr] ${line}`)
        })

        proc.on('exit', (code, signal) => {
          const wasStarting = semanticState.embedding.starting
          log(`[embedding] Process exited (code=${code}, signal=${signal})`)
          semanticState.embedding.process = null
          semanticState.embedding.ready = false
          semanticState.embedding.starting = false
          semanticState.embedding.startingPromise = null
          if (wasStarting) {
            semanticState.degraded = true
            semanticState.lastFallbackReason = `embedding exited (${code}/${signal})`
            resolve(false)
          }
        })

        proc.on('error', (error) => {
          log(`[embedding] Process error: ${error?.message}`)
          semanticState.embedding.lastError = error?.message
          semanticState.embedding.ready = false
          semanticState.embedding.starting = false
          semanticState.embedding.startingPromise = null
          semanticState.embedding.process = null
          semanticState.degraded = true
          semanticState.lastFallbackReason = error?.message
          resolve(false)
        })

        const startedAt = Date.now()
        const timeoutMs = 25000
        while (Date.now() - startedAt < timeoutMs) {
          if (!semanticState.embedding.process) return // Already handled by exit/error
          try {
            const ok = await checkEmbeddingHealth()
            if (ok) {
              log(`[embedding] Server is healthy and ready!`)
              semanticState.embedding.ready = true
              semanticState.embedding.starting = false
              semanticState.embedding.startingPromise = null
              semanticState.enabled = true
              semanticState.ready = true
              semanticState.degraded = false
              semanticState.lastFallbackReason = null
              resolve(true)
              return
            }
          } catch {}
          await new Promise((r) => setTimeout(r, 500))
        }

        log(`[embedding] Startup timed out after ${timeoutMs}ms`)
        semanticState.degraded = true
        semanticState.lastFallbackReason = 'embedding startup timeout'
        await stopEmbeddingServer()
        resolve(false)
      } catch (error) {
        log(`[embedding] Panic in startup task: ${error?.message}`)
        semanticState.degraded = true
        semanticState.lastFallbackReason = error?.message || 'embedding startup failure'
        await stopEmbeddingServer()
        resolve(false)
      }
    })()
  })

  return semanticState.embedding.startingPromise
}

function parseEmbeddingResponse(data) {
  let vector = null
  if (data && Array.isArray(data.data) && data.data[0] && Array.isArray(data.data[0].embedding)) {
    vector = data.data[0].embedding
  } else if (data && Array.isArray(data.embedding)) {
    vector = data.embedding
  } else if (Array.isArray(data) && data[0] && Array.isArray(data[0].embedding)) {
    vector = data[0].embedding
  } else if (Array.isArray(data) && Array.isArray(data[0])) {
    vector = data[0]
  }

  while (Array.isArray(vector) && vector.length && Array.isArray(vector[0])) {
    vector = vector[0]
  }
  return vector
}

async function embedText(text) {
  const normalized = String(text || '')
    .trim()
    .toLowerCase()
  if (!normalized) return null
  cleanupEmbeddingCache()
  const cacheKey = sha1(normalized)
  const cached = semanticState.embedding.cache.get(cacheKey)
  if (cached && Date.now() - cached.ts <= EMBEDDING_CACHE_TTL_MS) {
    return cached.vector
  }

  const ready = await ensureEmbeddingReady()
  if (!ready) {
    semanticState.fallbackCount += 1
    semanticState.lastFallbackReason = semanticState.lastFallbackReason || 'embedding not ready'
    return null
  }

  const startedAt = Date.now()
  try {
    const resp = await withTimeout(
      fetch(`${EMBEDDING_BASE_URL}/embedding`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: normalized })
      }),
      EMBEDDING_TIMEOUT_MS,
      'embedding timeout'
    )
    if (!resp.ok) throw new Error(`embedding HTTP ${resp.status}`)
    const data = await resp.json()
    const vector = parseEmbeddingResponse(data)
    if (!Array.isArray(vector) || vector.length < 8) throw new Error('invalid embedding vector')

    const elapsed = Date.now() - startedAt
    rollingPush(semanticState.latency.embeddingMs, elapsed)
    semanticState.embedding.cache.set(cacheKey, { vector, ts: Date.now() })
    return vector
  } catch (error) {
    semanticState.fallbackCount += 1
    semanticState.degraded = true
    semanticState.lastFallbackReason = error?.message || 'embedding request failed'
    return null
  }
}

function splitNoteChunks(text, chunkSize = 800, overlap = 120) {
  const src = String(text || '').replace(/\r/g, '')
  if (!src.trim()) return []
  const chunks = []
  let i = 0
  while (i < src.length) {
    const end = Math.min(src.length, i + chunkSize)
    const piece = src.slice(i, end).trim()
    if (piece) chunks.push(piece)
    if (end >= src.length) break
    i = Math.max(i + 1, end - overlap)
  }
  return chunks
}

function readSafeJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback
    const raw = fs.readFileSync(filePath, 'utf8')
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

function listNoteRecords() {
  const index = readSafeJson(NOTES_INDEX_FILE, [])
  if (!Array.isArray(index)) return []
  return index
    .filter((item) => item && typeof item.id === 'string' && typeof item.path === 'string')
    .map((item) => {
      const absPath = path.join(DATA_DIR, item.path)
      return {
        id: item.id,
        title: String(item.title || 'Nota'),
        path: String(item.path),
        absPath
      }
    })
}

function lexicalScore(source, query) {
  const src = String(source || '').toLowerCase()
  const q = String(query || '')
    .toLowerCase()
    .trim()
  if (!src || !q) return 0
  let idx = 0
  let count = 0
  while (idx >= 0) {
    idx = src.indexOf(q, idx)
    if (idx >= 0) {
      count += 1
      idx += Math.max(1, q.length)
    }
  }
  return count
}

async function ensureVectorDb() {
  if (semanticState.db) return semanticState.db
  ensureDir(SEMANTIC_DB_DIR)
  try {
    const lance = await loadLanceModule()
    semanticState.db = await lance.connect(SEMANTIC_DB_DIR)
    return semanticState.db
  } catch (error) {
    semanticState.degraded = true
    semanticState.lastFallbackReason = error?.message || 'lancedb connection failure'
    return null
  }
}

async function createOrOverwriteTable(tableName, rows) {
  const db = await ensureVectorDb()
  if (!db) return null
  try {
    const table = await db.createTable(
      tableName,
      rows.length ? rows : [{ id: '__empty__', text: '__empty__', vector: [0.0, 0.0, 0.0, 0.0] }],
      { mode: 'overwrite' }
    )
    if (!rows.length) {
      await table.delete("id = '__empty__'")
    }
    return table
  } catch (error) {
    semanticState.degraded = true
    semanticState.lastFallbackReason =
      error?.message || `lancedb create table failure: ${tableName}`
    return null
  }
}

async function syncSkillAndToolIndexes(force = false) {
  if ((store.settings.ai_tier || 'pro') !== 'ultra') return
  const now = Date.now()
  if (!force && now - semanticState.lastSkillSyncAt < SEMANTIC_SYNC_INTERVAL_MS) return

  skillRegistry.loadExtensions()
  const skills = getSkillCatalogRows()
  const tools = getToolCatalogRows()
  const allTexts = [...skills.map((s) => s.text), ...tools.map((t) => t.text)]
  const vectors = []
  for (const text of allTexts) {
    const vec = await embedText(text)
    if (!Array.isArray(vec)) return
    vectors.push(vec)
  }

  const skillRows = skills.map((item, idx) => ({ ...item, vector: vectors[idx] }))
  const toolRows = tools.map((item, idx) => ({ ...item, vector: vectors[skills.length + idx] }))

  const tSkills = await createOrOverwriteTable('skills', skillRows)
  const tTools = await createOrOverwriteTable('tools', toolRows)
  if (tSkills) semanticState.tableSkills = tSkills
  if (tTools) semanticState.tableTools = tTools
  semanticState.lastSkillSyncAt = now
}

async function syncNoteIndex(force = false) {
  if ((store.settings.ai_tier || 'pro') !== 'ultra') return
  const now = Date.now()
  if (!force && now - semanticState.lastNotesSyncAt < SEMANTIC_SYNC_INTERVAL_MS) return

  ensureDir(NOTES_DIR)
  const records = listNoteRecords()
  const digest = sha1(JSON.stringify(records.map((r) => [r.id, r.path])))
  if (!force && semanticState.notesSnapshotHash === digest && semanticState.tableNotes) {
    semanticState.lastNotesSyncAt = now
    return
  }

  const rows = []
  for (const note of records) {
    let content = ''
    try {
      content = fs.readFileSync(note.absPath, 'utf8')
    } catch {
      continue
    }
    const chunks = splitNoteChunks(content)
    for (let i = 0; i < chunks.length; i += 1) {
      const chunkText = chunks[i]
      const vec = await embedText(chunkText)
      if (!Array.isArray(vec)) continue
      rows.push({
        id: `${note.id}:${i}`,
        note_id: note.id,
        title: note.title,
        path: note.path,
        chunk_index: i,
        text: chunkText,
        hash: sha1(chunkText),
        vector: vec
      })
    }
  }

  const table = await createOrOverwriteTable('notes', rows)
  if (table) {
    semanticState.tableNotes = table
    semanticState.notesSnapshotHash = digest
    semanticState.lastNotesSyncAt = now
  }
}

async function runVectorNoteSearch(query, limit = 6) {
  if (!semanticState.tableNotes) return []
  const qVec = await embedText(query)
  if (!Array.isArray(qVec)) return []
  try {
    const rows = await semanticState.tableNotes.search(qVec).limit(limit).toArray()
    return rows.map((row) => ({
      note_id: row.note_id,
      chunk_id: row.id,
      title: row.title,
      path: row.path,
      text: row.text,
      score: Number.isFinite(row._distance) ? Math.max(0, 1 - row._distance) : 0,
      vector_score: Number.isFinite(row._distance) ? Math.max(0, 1 - row._distance) : 0,
      keyword_score: 0
    }))
  } catch (error) {
    semanticState.fallbackCount += 1
    semanticState.degraded = true
    semanticState.lastFallbackReason = error?.message || 'vector note search failed'
    return []
  }
}

function runLexicalNoteSearch(query, limit = 6) {
  const term = String(query || '').trim()
  if (!term) return []
  const out = []
  for (const note of listNoteRecords()) {
    let content = ''
    try {
      content = fs.readFileSync(note.absPath, 'utf8')
    } catch {
      continue
    }
    const titleScore = lexicalScore(note.title, term)
    const bodyScore = lexicalScore(content, term)
    const score = titleScore * 3 + bodyScore
    if (score <= 0) continue
    const snippet = content.replace(/\s+/g, ' ').trim().slice(0, 280)
    out.push({
      note_id: note.id,
      chunk_id: `${note.id}:lexical`,
      title: note.title,
      path: note.path,
      text: snippet,
      score,
      keyword_score: score,
      vector_score: 0
    })
  }
  return out.sort((a, b) => b.score - a.score).slice(0, Math.max(1, limit))
}

function mergeMemoryHits(vectorHits, lexicalHits, limit = 6) {
  const merged = new Map()

  for (const hit of vectorHits || []) {
    const key = hit.note_id
    const prev = merged.get(key)
    const score = (hit.vector_score || 0) * 0.7
    if (!prev || score > prev._score) {
      merged.set(key, { ...hit, _score: score, retrieval_type: 'vector' })
    }
  }

  for (const hit of lexicalHits || []) {
    const key = hit.note_id
    const prev = merged.get(key)
    const score = (hit.keyword_score || 0) * 0.3
    if (!prev) {
      merged.set(key, { ...hit, _score: score, retrieval_type: 'lexical' })
      continue
    }
    prev._score += score
    if (prev.retrieval_type === 'vector') prev.retrieval_type = 'hybrid'
    prev.keyword_score = Math.max(prev.keyword_score || 0, hit.keyword_score || 0)
  }

  return [...merged.values()]
    .sort((a, b) => (b._score || 0) - (a._score || 0))
    .slice(0, Math.max(1, limit))
    .map(({ _score, ...rest }) => rest)
}

function buildMemoryContextAndSources(hits) {
  if (!Array.isArray(hits) || !hits.length) return { memoryContext: null, memorySources: [] }
  const sections = []
  const memorySources = []
  for (const hit of hits.slice(0, 4)) {
    const txt = String(hit.text || '').trim()
    if (!txt) continue
    sections.push(
      `--- [TITULO DA NOTA: ${String(hit.title || 'Nota').toUpperCase()}] ---\n${txt}\n`
    )
    memorySources.push({
      url: `momai://note/${hit.note_id}`,
      title: `Nota: ${hit.title || 'Sem título'}`,
      snippet: txt.slice(0, 220),
      retrieval_type: hit.retrieval_type || 'lexical'
    })
  }
  return {
    memoryContext: sections.length ? promptRegistry.formatMemoryContext(sections.join('\n')) : null,
    memorySources
  }
}

async function searchWeb(query, limit = 4) {
  const q = encodeURIComponent(String(query || '').trim())
  if (!q) return []
  try {
    const response = await fetch(`https://duckduckgo.com/html/?q=${q}`, {
      method: 'GET',
      headers: {
        'User-Agent': 'MomAI-NodeCore/1.0'
      }
    })
    if (!response.ok) return []
    const html = await response.text()
    const results = []
    const regex = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi
    let match
    while ((match = regex.exec(html)) && results.length < limit) {
      const rawUrl = String(match[1] || '')
      const title = String(match[2] || '')
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim()
      if (!title || !rawUrl) continue
      results.push({ title, url: rawUrl })
    }
    return results
  } catch {
    return []
  }
}

function parseRelativeReminder(content) {
  const text = String(content || '').toLowerCase()
  let at = new Date()

  const relativePatterns = [
    { regex: /\bhoje\b/i, adjust: () => {} },
    { regex: /\bamanha\b|\bamanhã\b/i, adjust: () => at.setDate(at.getDate() + 1) },
    { regex: /\bem\s+(\d+)\s*(minuto|minutos)\b/i, adjust: () => {} },
    { regex: /\bem\s+(\d+)\s*(hora|horas)\b/i, adjust: () => {} },
    { regex: /\bem\s+(\d+)\s*(dia|dias)\b/i, adjust: () => {} },
    { regex: /\bdaqui\s+a?\s+(\d+)\s*(minuto|minutos|hora|horas|dia|dias)\b/i, adjust: () => {} }
  ]

  for (const p of relativePatterns) {
    const m = text.match(p.regex)
    if (m && m[1] && /em\s+(\d+)/.test(p.regex.source)) {
      const qty = Number(m[1])
      if (Number.isFinite(qty) && qty > 0) {
        if (/minuto/i.test(p.regex.source)) at.setMinutes(at.getMinutes() + qty)
        else if (/hora/i.test(p.regex.source)) at.setHours(at.getHours() + qty)
        else at.setDate(at.getDate() + qty)
        return validDateCheck(at)
      }
    } else {
      p.adjust.call(at)
      return validDateCheck(at)
    }
  }

  const timePatterns = [
    { regex: /\b[a\u00e1]s?\s+(\d{1,2})h\b/i, parse: (h) => { at.setHours(Number(h), 0, 0, 0) } },
    { regex: /\b[a\u00e1]s?\s+(\d{1,2}):(\d{2})\b/i, parse: (h, m) => { at.setHours(Number(h), Number(m), 0, 0) } },
    { regex: /\b(\d{1,2})h\b/i, parse: (h) => { at.setHours(Number(h), 0, 0, 0) } },
    { regex: /\b(\d{1,2}):(\d{2})\b/i, parse: (h, m) => { at.setHours(Number(h), Number(m), 0, 0) } }
  ]

  const dayRef = /\bamanha\b|\bamanh\u00e3\b/i.test(text) ? 1 : /\bhoje\b/i.test(text) ? 0 : 0

  for (const p of timePatterns) {
    const m = text.match(p.regex)
    if (m && m[1]) {
      if (dayRef > 0) at.setDate(at.getDate() + dayRef)
      if (m[2]) p.parse(at, m[1], m[2])
      else p.parse(at, m[1])
      return validDateCheck(at)
    }
  }

  return validDateCheck(at)
}

function validDateCheck(date) {
  const d = new Date(date)
  if (!Number.isFinite(d.getTime()) || d.getTime() < Date.now() + 60000) {
    d.setTime(Date.now() + 60 * 60 * 1000)
  }
  return d.toISOString()
}

function extractReminderTitle(text) {
  const raw = String(text || '').trim()
  if (!raw) return 'Lembrete'

  let cleaned = raw
    .replace(/^me\s+lembre\s+(de\s+)?/i, '')
    .replace(/^lembre(?:-me)?\s+(?:de\s+)?/i, '')
    .replace(/^agenda[rr]?\s+(?:para\s+)?/i, '')
    .replace(/^preciso\s+lembrar\s+(?:de\s+)?/i, '')
    .replace(/\bhoje\b|\bamanha\b|\bamanhã\b|\bás?\s+\d+|às?\s+\d+/gi, '')
    .replace(/\bdaqui\s+a?\s+\d+\s*(minuto|hora|dia)s?\b/gi, '')
    .replace(/\bem\s+\d+\s*(minuto|hora|dia)s?\b/gi, '')
    .replace(/\bno\s+(dia|horário|horas)\b/gi, '')
    .replace(/\bpara\s+(hoje|amanhã)\b/gi, '')
    .replace(/\bás?\s+\d{1,2}(h|:)\d{0,2}\b/gi, '')
    .replace(/\b\d{1,2}(h|:)\d{2}\b/gi, '')
    .replace(/\d{2}[\/\-]\d{2}[\/\-]\d{2,4}/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (!cleaned) return 'Lembrete'
  if (cleaned.length > 60) cleaned = cleaned.slice(0, 60) + '...'

  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
}

function ensureNotesIndexExists() {
  ensureDir(NOTES_DIR)
  if (!fs.existsSync(NOTES_INDEX_FILE)) {
    fs.writeFileSync(NOTES_INDEX_FILE, JSON.stringify([], null, 2), 'utf8')
  }
}

function saveMemoryNoteFromContent(content) {
  ensureNotesIndexExists()
  const titleLine =
    String(content || '')
      .trim()
      .split('\n')[0] || 'Nota'
  const title = titleLine.replace(/^#+\s*/, '').slice(0, 80) || 'Nota'
  const id = crypto.randomUUID()
  const relPath = `notes/${id}.md`
  const absPath = path.join(DATA_DIR, relPath)
  fs.writeFileSync(absPath, String(content || '').trim() || 'Nota vazia.', 'utf8')

  const index = readSafeJson(NOTES_INDEX_FILE, [])
  index.push({
    id,
    title,
    path: relPath,
    source: 'local',
    created_at: isoNow(),
    updated_at: isoNow(),
    preview: String(content || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 220)
  })
  fs.writeFileSync(NOTES_INDEX_FILE, JSON.stringify(index, null, 2), 'utf8')
  return { id, title, path: relPath }
}

async function getTop5SkillsSemantic(query) {
  const text = String(query || '').trim()
  const enabledSkills = getEnabledSkills()
  if (enabledSkills.length === 0) return []

  // Fallback if semantic search is not ready or no query
  if (!text || !semanticState.ready || enabledSkills.length <= 5) {
    return enabledSkills.slice(0, 5).map((s) => s.id)
  }

  if (semanticState.tableSkills) {
    try {
      const qVec = await embedText(text)
      if (Array.isArray(qVec)) {
        const rows = await semanticState.tableSkills.search(qVec).limit(5).toArray()
        if (rows.length) {
          const ids = []
          for (const row of rows) {
            const candidate = skillRegistry.getById(row.id)
            if (candidate && isSkillEnabledByStore(candidate)) {
              ids.push(candidate.id)
            }
          }
          if (ids.length > 0) return ids
        }
      }
    } catch {}
  }

  return enabledSkills.slice(0, 5).map((s) => s.id)
}

async function runSemanticMemoryRetrieval(query, limit = 6) {
  const startedAt = Date.now()
  semanticState.queryCount += 1

  const shouldEnable = (store.settings.ai_tier || 'pro') === 'ultra'
  semanticState.enabled = shouldEnable
  if (!shouldEnable) {
    return { hits: [], memoryContext: null, memorySources: [] }
  }

  await syncSkillAndToolIndexes(false)
  await syncNoteIndex(false)

  const [vectorHits, lexicalHits] = await Promise.all([
    runVectorNoteSearch(query, limit),
    Promise.resolve(runLexicalNoteSearch(query, limit))
  ])
  const mergedHits = mergeMemoryHits(vectorHits, lexicalHits, limit)
  const { memoryContext, memorySources } = buildMemoryContextAndSources(mergedHits)
  rollingPush(semanticState.latency.retrievalMs, Date.now() - startedAt)
  return {
    hits: mergedHits,
    memoryContext,
    memorySources
  }
}

function llamaBackendExePath(backend) {
  const exeName = process.platform === 'win32' ? 'llama-server.exe' : 'llama-server'
  for (const basePath of LLAMA_BIN_CANDIDATES) {
    if (basePath.includes('app.asar') && !basePath.includes('app.asar.unpacked')) continue
    const candidate = path.join(basePath, backend, exeName)
    if (fs.existsSync(candidate)) return candidate
  }
  return path.join(
    LLAMA_BIN_CANDIDATES[0] || path.resolve(__dirname, '..', 'bin', 'llama'),
    backend,
    exeName
  )
}

function llamaBackendNativeExeName() {
  return process.platform === 'win32' ? 'llama-server.exe' : 'llama-server'
}

function llamaBackendAltExeName() {
  return process.platform === 'win32' ? 'llama-server' : 'llama-server.exe'
}

function resolveBackendBinaryInfo(backend) {
  const nativeName = llamaBackendNativeExeName()
  const altName = llamaBackendAltExeName()

  for (const basePath of LLAMA_BIN_CANDIDATES) {
    if (basePath.includes('app.asar') && !basePath.includes('app.asar.unpacked')) continue

    const nativePath = path.join(basePath, backend, nativeName)
    if (fs.existsSync(nativePath)) {
      return { path: nativePath, compatible: true }
    }

    const altPath = path.join(basePath, backend, altName)
    if (fs.existsSync(altPath)) {
      return { path: altPath, compatible: false }
    }
  }

  return {
    path: path.join(
      LLAMA_BIN_CANDIDATES[0] || path.resolve(__dirname, '..', 'bin', 'llama'),
      backend,
      nativeName
    ),
    compatible: false
  }
}

function hasBackendBinary(backend) {
  const info = resolveBackendBinaryInfo(backend)
  return info.compatible && fs.existsSync(info.path)
}

function listAvailableBackends() {
  return ['vulkan', 'cpu'].filter((backend) => hasBackendBinary(backend))
}

function listIncompatibleBackends() {
  return ['vulkan', 'cpu'].filter((backend) => {
    const info = resolveBackendBinaryInfo(backend)
    return !info.compatible && fs.existsSync(info.path)
  })
}

function normalizeBackendMode(value) {
  return value === 'cpu' || value === 'vulkan' || value === 'auto' ? value : 'auto'
}

function pickBackend(preferred) {
  const normalized = normalizeBackendMode(preferred)
  const available = listAvailableBackends()
  if (normalized === 'cpu' || normalized === 'vulkan') {
    return available.includes(normalized) ? normalized : null
  }
  if (available.includes('vulkan')) return 'vulkan'
  if (available.includes('cpu')) return 'cpu'
  return null
}

function pickBackendAttempts(preferred) {
  const normalized = normalizeBackendMode(preferred)
  const available = listAvailableBackends()
  if (normalized === 'cpu') return available.includes('cpu') ? ['cpu'] : []
  if (normalized === 'vulkan') return available.includes('vulkan') ? ['vulkan'] : []
  const attempts = []
  if (available.includes('vulkan')) attempts.push('vulkan')
  if (available.includes('cpu')) attempts.push('cpu')
  return attempts
}

function backendReason(mode, backend, context = {}) {
  if (mode === 'cpu') return 'manual_cpu'
  if (mode === 'vulkan') return 'manual_vulkan'
  if (backend === 'vulkan') return 'gpu_probe_ok'
  if (backend === 'cpu' && context.vulkanAttempted) return 'gpu_probe_failed'
  if (backend === 'cpu') return 'cpu_only_available'
  return 'backend_unavailable'
}

function resolveModelPath(tierConfig) {
  const configured = path.join(MODELS_DIR, tierConfig.file || '')
  if (tierConfig.file && fs.existsSync(configured)) return configured

  if (!fs.existsSync(MODELS_DIR)) return null

  // Ignore non-chat artifacts when falling back.
  const isChatCandidate = (name) => {
    const lower = name.toLowerCase()
    if (!lower.endsWith('.gguf')) return false
    if (lower.includes('mmproj')) return false
    if (lower.includes('embedding')) return false
    return true
  }

  const ggufs = fs
    .readdirSync(MODELS_DIR)
    .filter((name) => isChatCandidate(name))
    .sort((a, b) => a.localeCompare(b))

  if (!ggufs.length) return null
  return path.join(MODELS_DIR, ggufs[0])
}

function resolveMmprojPath() {
  if (!fs.existsSync(MODELS_DIR)) return null
  const mmproj = fs
    .readdirSync(MODELS_DIR)
    .find((name) => name.toLowerCase().includes('mmproj') && name.toLowerCase().endsWith('.gguf'))
  return mmproj ? path.join(MODELS_DIR, mmproj) : null
}

const modelDownloadState = {
  in_progress: false,
  tier: null,
  file: null,
  downloaded_bytes: 0,
  total_bytes: null,
  progress: 0,
  status: 'idle',
  message: null,
  error: null,
  updated_at: isoNow()
}

let modelDownloadPromise = null

function setModelDownloadState(partial) {
  Object.assign(modelDownloadState, partial, { updated_at: isoNow() })
}

function resolveTierModelUrl(tierName, tierConfig) {
  const modelFile = String(tierConfig?.file || '').trim()
  if (!modelFile) return null

  const explicitUrl = String(tierConfig?.download_url || '').trim()
  if (explicitUrl) return explicitUrl

  const explicitBase = String(tierConfig?.download_base_url || '').trim()
  if (explicitBase) {
    const sep = explicitBase.includes('?') ? '&' : '?'
    return `${explicitBase.replace(/\/+$/, '')}/${encodeURIComponent(modelFile)}${sep}download=1`
  }

  const repo = String(tierConfig?.repo || '').trim()
  if (!repo) return null
  return `https://huggingface.co/${repo}/resolve/main/${encodeURIComponent(modelFile)}?download=1`
}

function downloadToFile(url, targetPath, onProgress) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now()
    const request = https.get(url, (response) => {
      const status = Number(response.statusCode || 0)
      if ([301, 302, 303, 307, 308].includes(status)) {
        const location = response.headers.location
        response.resume()
        if (!location) {
          reject(new Error(`Redirect without location for ${url}`))
          return
        }
        resolve(downloadToFile(location, targetPath, onProgress))
        return
      }

      if (status < 200 || status >= 300) {
        response.resume()
        reject(new Error(`Model download failed with HTTP ${status}`))
        return
      }

      const totalBytesRaw = Number(response.headers['content-length'] || 0)
      const totalBytes = Number.isFinite(totalBytesRaw) && totalBytesRaw > 0 ? totalBytesRaw : null
      let received = 0
      const tmpPath = `${targetPath}.partial`
      const output = fs.createWriteStream(tmpPath)

      const fail = (error) => {
        try {
          output.close()
        } catch {}
        try {
          if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath)
        } catch {}
        reject(error)
      }

      output.on('error', fail)
      response.on('error', fail)
      response.on('data', (chunk) => {
        received += chunk.length
        onProgress({ received, total: totalBytes, elapsedMs: Date.now() - startedAt })
      })
      response.pipe(output)
      output.on('finish', () => {
        output.close(() => {
          try {
            if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath)
            fs.renameSync(tmpPath, targetPath)
            resolve(true)
          } catch (error) {
            fail(error)
          }
        })
      })
    })

    request.setTimeout(MODEL_DOWNLOAD_TIMEOUT_MS, () => {
      request.destroy(new Error(`Model download timeout after ${MODEL_DOWNLOAD_TIMEOUT_MS}ms`))
    })
    request.on('error', reject)
  })
}

async function ensureTierModelAvailable(tierName, tierConfig) {
  const configuredFile = String(tierConfig?.file || '').trim()
  if (!configuredFile) {
    return { ok: false, reason: `Tier "${tierName}" has no configured model file.` }
  }

  ensureDir(MODELS_DIR)
  const targetPath = path.join(MODELS_DIR, configuredFile)
  if (fs.existsSync(targetPath)) {
    return { ok: true, path: targetPath, downloaded: false }
  }

  if (modelDownloadPromise) {
    return modelDownloadPromise
  }

  modelDownloadPromise = (async () => {
    const url = resolveTierModelUrl(tierName, tierConfig)
    if (!url) {
      return {
        ok: false,
        reason: `No download URL for tier "${tierName}". Configure "repo" or "download_url" in tier config.`
      }
    }

    setModelDownloadState({
      in_progress: true,
      tier: tierName,
      file: configuredFile,
      downloaded_bytes: 0,
      total_bytes: null,
      progress: 1,
      status: 'downloading',
      message: `Downloading model (${tierName.toUpperCase()})...`,
      error: null
    })
    setInitStatus('loading', `Downloading model (${tierName.toUpperCase()})... 0%`, 35, null)

    if (typeof process.send === 'function') {
      process.send({
        type: 'node-core-log',
        message: `[model] Downloading ${configuredFile} from ${url}`
      })
    }

    let lastProgressUpdate = 0
    try {
      await downloadToFile(url, targetPath, ({ received, total }) => {
        const now = Date.now()
        const percent = total
          ? Math.max(1, Math.min(99, Math.round((received / total) * 100)))
          : null
        setModelDownloadState({
          downloaded_bytes: received,
          total_bytes: total,
          progress: percent || modelDownloadState.progress,
          message: percent
            ? `Downloading model (${tierName.toUpperCase()})... ${percent}%`
            : `Downloading model (${tierName.toUpperCase()})...`
        })
        if (now - lastProgressUpdate >= 300) {
          const initProgress = percent ? 35 + Math.min(44, Math.round(percent * 0.44)) : 40
          setInitStatus(
            'loading',
            percent
              ? `Downloading model (${tierName.toUpperCase()})... ${percent}%`
              : `Downloading model (${tierName.toUpperCase()})...`,
            initProgress,
            null
          )
          lastProgressUpdate = now
        }
      })

      setModelDownloadState({
        in_progress: false,
        status: 'ready',
        progress: 100,
        message: `Model ready (${tierName.toUpperCase()})`,
        error: null
      })
      setInitStatus('loading', `Model downloaded (${tierName.toUpperCase()}).`, 80, null)
      return { ok: true, path: targetPath, downloaded: true }
    } catch (error) {
      const message = error?.message || 'Model download failed'
      setModelDownloadState({
        in_progress: false,
        status: 'error',
        error: message,
        message: 'Model download failed'
      })
      return { ok: false, reason: message }
    }
  })()

  try {
    return await modelDownloadPromise
  } finally {
    modelDownloadPromise = null
  }
}

const llamaState = {
  process: null,
  ready: false,
  starting: false,
  startingPromise: null,
  lastError: null,
  backend: null,
  backendReason: null,
  backendMode: 'auto',
  modelPath: null,
  configuredModelFile: null,
  usingFallbackModel: false,
  contextTotalTokens: 8192,
  currentTier: null,
  port: LLAMA_PORT
}

function setInitStatus(stage, message, progress, error = null) {
  store.init_status = {
    stage,
    message,
    progress,
    error,
    updated_at: isoNow()
  }
  saveStore()
  emitInitProgress()
}

async function checkLlamaHealth() {
  const resp = await fetch(`${getLlamaBaseUrl()}/health`, { method: 'GET' })
  return resp.ok
}

function stopLlamaServer() {
  return new Promise((resolve) => {
    const proc = llamaState.process
    if (!proc || proc.killed || proc.exitCode !== null) {
      llamaState.process = null
      llamaState.ready = false
      llamaState.starting = false
      llamaState.startingPromise = null
      resolve()
      return
    }

    const timer = setTimeout(() => {
      try {
        proc.kill('SIGKILL')
      } catch {}
    }, 2500)

    proc.once('exit', () => {
      clearTimeout(timer)
      llamaState.process = null
      llamaState.ready = false
      llamaState.starting = false
      llamaState.startingPromise = null
      resolve()
    })

    try {
      proc.kill('SIGTERM')
    } catch {
      clearTimeout(timer)
      resolve()
    }
  })
}

async function ensureLlamaReady(forceRestart = false, allowModelDownload = true) {
  if (forceRestart) await stopLlamaServer()

  if (llamaState.ready) return true
  if (llamaState.startingPromise) return llamaState.startingPromise

  const preferred = normalizeBackendMode(store.settings.local_backend || 'auto')
  const backendAttempts = pickBackendAttempts(preferred)
  const tierName = store.settings.ai_tier || 'pro'
  const tierConfig = tiersConfig[tierName] || tiersConfig.pro || DEFAULT_TIERS.pro

  if (!backendAttempts.length) {
    const incompatibleBackends = listIncompatibleBackends()
    let msg = 'llama-server binary not found (bin/llama/<backend>/llama-server)'

    if (incompatibleBackends.length) {
      const backendList = incompatibleBackends.join(', ')
      if (process.platform === 'win32') {
        msg = `Only non-Windows llama binaries found for backend(s): ${backendList}. Run \"pnpm --filter momai prebuild\" to hydrate native binaries.`
      } else {
        msg = `Only Windows llama binaries found for backend(s): ${backendList}. Run \"pnpm --filter momai prebuild\" on this Linux/macOS machine to hydrate native binaries.`
      }
    }

    llamaState.lastError = msg
    llamaState.backend = null
    llamaState.backendReason = 'backend_unavailable'
    llamaState.backendMode = preferred
    setInitStatus('error', 'Local model engine missing', 100, msg)
    return false
  }

  const existingModelPath = resolveModelPath(tierConfig)
  if (!existingModelPath) {
    if (!allowModelDownload) {
      const msg = `Model for tier ${tierName.toUpperCase()} not present yet.`
      llamaState.lastError = msg
      setInitStatus('loading', `Waiting model download (${tierName.toUpperCase()})...`, 100, null)
      return false
    }
    const modelReady = await ensureTierModelAvailable(tierName, tierConfig)
    if (!modelReady.ok) {
      const msg = modelReady.reason || `Failed to prepare model for tier ${tierName}`
      llamaState.lastError = msg
      setInitStatus('error', 'Local model download failed', 100, msg)
      return false
    }
  }

  const modelPath = resolveModelPath(tierConfig)
  if (!modelPath) {
    const msg = `No GGUF model found in ${MODELS_DIR}`
    llamaState.lastError = msg
    setInitStatus('error', 'Local model file missing', 100, msg)
    return false
  }
  const configuredModelFile = typeof tierConfig.file === 'string' ? tierConfig.file : null
  const actualModelFile = path.basename(modelPath)
  const usingFallbackModel =
    Boolean(configuredModelFile) &&
    configuredModelFile.toLowerCase() !== actualModelFile.toLowerCase()

  if (usingFallbackModel && typeof process.send === 'function') {
    process.send({
      type: 'node-core-log',
      message: `[llama] Tier ${tierName.toUpperCase()} requested "${configuredModelFile}" but loaded fallback "${actualModelFile}".`
    })
  }

  const visionEnabled = tierConfig.enable_vision === true
  const mmprojPath = visionEnabled ? resolveMmprojPath() : null
  const parallelSlots = 2
  const requestCtx = Number(tierConfig.request_ctx_size || tierConfig.ctx_size || 8192)
  const ctxBase = Math.max(2048, Math.min(requestCtx, 8192))
  const totalCtx = ctxBase * parallelSlots

  const startAttempt = (backend, isFallbackAttempt) =>
    new Promise((resolve) => {
      const exePath = llamaBackendExePath(backend)
      const exeDir = path.dirname(exePath)
      ;(async () => {
        const selectedPort = await pickAvailablePort(llamaState.port || LLAMA_PORT)
        const args = [
          '-m',
          modelPath,
          '--port',
          String(selectedPort),
          '-c',
          String(totalCtx),
          '--parallel',
          String(parallelSlots),
          '-ngl',
          String(Number.isFinite(tierConfig.gpu_layers) ? tierConfig.gpu_layers : 99),
          '--flash-attn',
          'auto',
          '--reasoning',
          'off',
          '--cache-prompt',
          '-b',
          '2048',
          '-ub',
          '512',
          '--top-p',
          String(Number.isFinite(tierConfig.top_p) ? tierConfig.top_p : 1),
          '--top-k',
          String(Number.isFinite(tierConfig.top_k) ? tierConfig.top_k : 20),
          '--presence-penalty',
          String(Number.isFinite(tierConfig.presence_penalty) ? tierConfig.presence_penalty : 0),
          '--repeat-penalty',
          String(Number.isFinite(tierConfig.repetition_penalty) ? tierConfig.repetition_penalty : 1)
        ]

        if (backend === 'cpu') args.push('--no-mmap')
        else args.push('--mmap')

        if (mmprojPath) args.push('--mmproj', mmprojPath)

        llamaState.starting = true
        llamaState.ready = false
        llamaState.lastError = null
        llamaState.contextTotalTokens = ctxBase
        llamaState.backend = backend
        llamaState.backendMode = preferred
        llamaState.backendReason = backendReason(preferred, backend, {
          vulkanAttempted: isFallbackAttempt
        })
        llamaState.modelPath = modelPath
        llamaState.configuredModelFile = configuredModelFile
        llamaState.usingFallbackModel = usingFallbackModel
        llamaState.currentTier = tierName
        llamaState.port = selectedPort

        setInitStatus('loading', `Loading local model (${tierName.toUpperCase()})...`, 80, null)

        let child = null
        try {
          child = spawn(exePath, args, {
            cwd: exeDir,
            env: {
              ...process.env,
              PATH: `${exeDir}${path.delimiter}${process.env.PATH || ''}`
            },
            shell: false,
            stdio: ['ignore', 'pipe', 'pipe']
          })
        } catch (error) {
          const errMsg = error?.message || 'Failed to spawn llama-server'
          resolve({ ok: false, reason: errMsg })
          return
        }

        llamaState.process = child
        let exitedDuringStartup = false

        child.stdout?.on('data', (data) => {
          const line = String(data).trim()
          if (line && typeof process.send === 'function') {
            process.send({ type: 'node-core-log', message: `[llama] ${line}` })
          }
        })

        child.stderr?.on('data', (data) => {
          const line = String(data).trim()
          if (line && typeof process.send === 'function') {
            process.send({ type: 'node-core-log', message: `[llama] ${line}` })
          }
        })

        child.on('exit', () => {
          const endedWhileStarting = llamaState.starting
          llamaState.ready = false
          llamaState.starting = false
          llamaState.process = null
          if (endedWhileStarting) exitedDuringStartup = true
        })

        child.on('error', (error) => {
          exitedDuringStartup = true
          llamaState.lastError = error?.message || 'llama-server spawn error'
        })

        const startedAt = Date.now()
        const timeoutMs = 25000
        ;(async () => {
          while (Date.now() - startedAt < timeoutMs) {
            if (
              exitedDuringStartup ||
              !llamaState.process ||
              llamaState.process.exitCode !== null
            ) {
              resolve({ ok: false, reason: 'llama-server exited during startup' })
              return
            }
            try {
              const ok = await checkLlamaHealth()
              if (ok) {
                llamaState.ready = true
                llamaState.starting = false
                setInitStatus('ready', 'System ready.', 100, null)
                resolve({ ok: true, reason: null })
                return
              }
            } catch {}
            await new Promise((r) => setTimeout(r, 300))
          }
          await stopLlamaServer()
          resolve({ ok: false, reason: 'llama-server healthcheck timeout' })
        })().catch(async (error) => {
          await stopLlamaServer()
          resolve({ ok: false, reason: error?.message || 'Unexpected llama startup failure' })
        })
      })().catch((error) => {
        resolve({ ok: false, reason: error?.message || 'Failed to select llama port' })
      })
    })

  llamaState.startingPromise = (async () => {
    for (let i = 0; i < backendAttempts.length; i += 1) {
      const backend = backendAttempts[i]
      const result = await startAttempt(backend, i > 0)
      if (result.ok) return true
      llamaState.lastError = result.reason
      if (preferred !== 'auto') {
        setInitStatus('error', 'Failed to initialize local model', 100, result.reason)
        return false
      }
      if (i === 0 && backend === 'vulkan' && backendAttempts[i + 1] === 'cpu') {
        if (typeof process.send === 'function') {
          process.send({
            type: 'node-core-log',
            message: `[llama] Vulkan probe failed (${result.reason}). Falling back to CPU.`
          })
        }
      }
    }

    setInitStatus('error', 'Failed to initialize local model', 100, llamaState.lastError)
    return false
  })()

  try {
    return await llamaState.startingPromise
  } finally {
    llamaState.startingPromise = null
    if (!llamaState.ready) llamaState.starting = false
  }
}

function splitTokens(text) {
  return text.match(/\S+\s*/g) || [text]
}

function sanitizePromptText(text) {
  return String(text || '')
    .replace(/\{\{/g, '(')
    .replace(/\}\}/g, ')')
    .replace(/[{}]/g, '')
}

const LATIN_LANGUAGE_HINTS = {
  'pt-BR': [
    'oi',
    'ola',
    'olá',
    'você',
    'voce',
    'pra',
    'não',
    'nao',
    'como',
    'obrigado',
    'obrigada',
    'tudo bem',
    'quero'
  ],
  en: [
    'hello',
    'hi',
    'please',
    'thanks',
    'thank you',
    'can you',
    'could you',
    'what',
    'why',
    'how',
    'the',
    'and'
  ],
  es: [
    'hola',
    'gracias',
    'por favor',
    'puedes',
    'puede',
    'como',
    'cómo',
    'necesito',
    'quiero',
    'que',
    'qué'
  ],
  fr: [
    'bonjour',
    'merci',
    "s'il vous plait",
    "s'il te plait",
    'comment',
    'pourquoi',
    'je',
    'vous',
    'avec',
    'aide'
  ],
  de: ['hallo', 'danke', 'bitte', 'ich', 'du', 'sie', 'wie', 'warum', 'kannst', 'hilfe'],
  it: ['ciao', 'grazie', 'per favore', 'come', 'perché', 'puoi', 'voglio', 'aiuto']
}

function normalizeLanguageTag(tag) {
  const raw = String(tag || '').trim()
  if (!raw) return 'pt-BR'
  const short = raw.toLowerCase().split('-')[0]

  if (short === 'pt') return 'pt-BR'
  if (short === 'en') return 'en'
  if (short === 'es') return 'es'
  if (short === 'fr') return 'fr'
  if (short === 'de') return 'de'
  if (short === 'it') return 'it'
  if (short === 'ja') return 'ja'
  if (short === 'ko') return 'ko'
  if (short === 'zh') return 'zh-CN'
  if (short === 'ru') return 'ru'
  if (short === 'ar') return 'ar'
  if (short === 'hi') return 'hi'

  return 'pt-BR'
}

function detectLanguageTag(text) {
  const value = String(text || '').trim()
  if (!value) return 'und'

  if (/[\u3040-\u30ff]/.test(value)) return 'ja'
  if (/[\uac00-\ud7af]/.test(value)) return 'ko'
  if (/[\u4e00-\u9fff]/.test(value)) return 'zh-CN'
  if (/[\u0400-\u04ff]/.test(value)) return 'ru'
  if (/[\u0600-\u06ff]/.test(value)) return 'ar'
  if (/[\u0900-\u097f]/.test(value)) return 'hi'

  const normalized = value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

  const scores = {}
  for (const [lang, hints] of Object.entries(LATIN_LANGUAGE_HINTS)) {
    let score = 0
    for (const hint of hints) {
      const safe = hint.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const regex = new RegExp(`(^|\\s)${safe}(\\s|$)`, 'i')
      if (regex.test(normalized)) score += 1
    }
    scores[lang] = score
  }

  if (/[ãõç]/i.test(value)) scores['pt-BR'] += 1
  if (/[ñ]/i.test(value)) scores.es += 1
  if (/[ß]/i.test(value)) scores.de += 1

  let bestLang = 'und'
  let bestScore = 0
  for (const [lang, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score
      bestLang = lang
    }
  }

  return bestScore > 0 ? bestLang : 'und'
}

function resolveResponseLanguage(content, threadId) {
  const fromContent = detectLanguageTag(content)
  if (fromContent !== 'und') return normalizeLanguageTag(fromContent)

  const messages = getThreadMessages(threadId)
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i]
    if (!msg || msg.role !== 'user') continue
    const detected = detectLanguageTag(msg.content)
    if (detected !== 'und') return normalizeLanguageTag(detected)
  }

  return normalizeLanguageTag(store.settings.locale || 'pt-BR')
}

function buildLocalizedFallbackReply({ key, summary, reason, language }) {
  const lang = normalizeLanguageTag(language)
  const safeSummary = String(summary || '').trim()
  const safeReason = String(reason || '').trim() || 'unknown reason'

  if (lang === 'en') {
    if (key === 'empty') return 'Send me a question and I will help you.'
    if (key === 'greeting') return 'Hi! I am online. How can I help you now?'
    if (key === 'reason')
      return `Local model unavailable right now (${safeReason}). Fallback reply for: "${safeSummary}".`
    if (key === 'with_memory')
      return `Got it: "${safeSummary}". I also considered your local notes context.`
    return `Got it: "${safeSummary}". I will proceed with that.`
  }

  if (lang === 'es') {
    if (key === 'empty') return 'Enviame una pregunta y te ayudare.'
    if (key === 'greeting') return 'Hola! Estoy en linea. Como puedo ayudarte ahora?'
    if (key === 'reason')
      return `Modelo local no disponible en este momento (${safeReason}). Respuesta de respaldo para: "${safeSummary}".`
    if (key === 'with_memory')
      return `Entendi tu pedido: "${safeSummary}". Tambien considere el contexto de tus notas locales.`
    return `Entendi tu pedido: "${safeSummary}". Voy a continuar con eso.`
  }

  return promptRegistry.buildFallbackReply({ key, summary: safeSummary, reason: safeReason })
}

function generateFallbackReply(content, memoryContext, reason, responseLanguage) {
  const trimmed = String(content || '').trim()
  if (!trimmed) {
    return buildLocalizedFallbackReply({ key: 'empty', language: responseLanguage })
  }

  if (/^(oi|ol[aá]|bom dia|boa tarde|boa noite|hello|hi|hola|buenas)\b/i.test(trimmed)) {
    return buildLocalizedFallbackReply({ key: 'greeting', language: responseLanguage })
  }

  const summary = trimmed.length > 320 ? `${trimmed.slice(0, 320)}...` : trimmed
  const hasMemory = typeof memoryContext === 'string' && memoryContext.trim().length > 0

  if (reason) {
    return buildLocalizedFallbackReply({
      key: 'reason',
      summary,
      reason,
      language: responseLanguage
    })
  }
  if (hasMemory) {
    return buildLocalizedFallbackReply({ key: 'with_memory', summary, language: responseLanguage })
  }
  return buildLocalizedFallbackReply({ key: 'default', summary, language: responseLanguage })
}

let wss = null
const wsClients = new Set()

function broadcast(payload) {
  if (!wss) return
  const data = JSON.stringify(payload)
  for (const client of wsClients) {
    if (client.readyState === 1) client.send(data)
  }
}

function emitInitProgress() {
  broadcast({
    type: 'init_progress',
    data: {
      message: store.init_status.message,
      progress: store.init_status.progress
    }
  })
}

function sendResourceUsage() {
  const mem = process.memoryUsage()
  const ramMb = Math.round(mem.rss / 1024 / 1024)

  broadcast({
    type: 'resource_usage',
    data: {
      ram_mb: ramMb,
      vram_used_mb: 0,
      vram_total_mb: 0,
      context_used_tokens: 0,
      context_total_tokens: llamaState.contextTotalTokens || 8192
    }
  })
}

const ensurePythonPending = new Map()
let ensurePythonMsgId = 0

if (typeof process.send === 'function') {
  process.on('message', (msg) => {
    if (!msg || typeof msg !== 'object') return
    if (msg.type !== 'ensure-python-result') return

    const pending = ensurePythonPending.get(msg.requestId)
    if (!pending) return

    ensurePythonPending.delete(msg.requestId)
    if (msg.ok) pending.resolve(msg.baseUrl || PYTHON_BASE_URL)
    else pending.reject(new Error(msg.error || 'Python sidecar unavailable'))
  })
}

async function ensurePython() {
  if (typeof process.send !== 'function') return PYTHON_BASE_URL

  const tier = store.settings.ai_tier || 'pro'
  if (tier === 'lite') {
    throw new Error('Python sidecar is disabled in Lite mode.')
  }

  ensurePythonMsgId += 1
  const requestId = `ensure-python-${ensurePythonMsgId}-${Date.now()}`
  const promise = new Promise((resolve, reject) => {
    ensurePythonPending.set(requestId, { resolve, reject })
  })
  process.send({ type: 'ensure-python', requestId })
  return promise
}

async function proxyToPython(req, res, pathname) {
  try {
    const pythonBase = await ensurePython()
    const url = `${pythonBase}${pathname}`
    const bodyAllowed = req.method !== 'GET' && req.method !== 'HEAD'

    let body
    if (bodyAllowed) {
      const chunks = []
      for await (const chunk of req) chunks.push(chunk)
      body = chunks.length ? Buffer.concat(chunks) : undefined
    }

    const response = await fetch(url, {
      method: req.method,
      headers: { 'Content-Type': req.headers['content-type'] || 'application/json' },
      body
    })

    const text = await response.text()
    res.writeHead(response.status, {
      'Content-Type': response.headers.get('content-type') || 'application/json',
      'Access-Control-Allow-Origin': '*'
    })
    res.end(text)
  } catch (error) {
    throw error
  }
}

function sendVoiceSidecarFallback(res, pathname, error) {
  const detail = error?.message || 'Python sidecar unavailable'

  if (pathname === '/chat/stop-voice') {
    sendJson(res, 200, {
      status: 'ok',
      degraded: true,
      message: 'Voice sidecar unavailable; stop-voice executed as no-op.',
      detail
    })
    return
  }

  if (pathname === '/chat/speak') {
    sendJson(res, 503, {
      status: 'error',
      degraded: true,
      message: 'Voice sidecar unavailable; unable to synthesize speech.',
      detail
    })
    return
  }

  if (pathname === '/voice/quick-transcribe') {
    sendJson(res, 503, {
      success: false,
      text: '',
      degraded: true,
      message: 'Voice sidecar unavailable; transcription unavailable.',
      detail
    })
    return
  }

  if (pathname === '/voice/wake-word') {
    sendJson(res, 503, {
      success: false,
      degraded: true,
      message: 'Voice sidecar unavailable; wake-word control unavailable.',
      detail
    })
    return
  }

  sendJson(res, 503, { detail })
}

async function syncWakeWordState(reason = 'unknown') {
  const tier = store.settings.ai_tier || 'pro'
  const shouldEnable =
    tier === 'ultra' && (Boolean(store.settings.wake_word_enabled) || Boolean(store.call_mode))

  if (tier === 'lite') {
    // Still attempt to disable wake word on sidecar if it's running
    try {
      const pythonBase = await ensurePython()
      await fetch(`${pythonBase}/voice/wake-word`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: false })
      })
      console.info(`[NodeCore][Voice] Wake-word force-disabled for lite tier (${reason})`)
    } catch {
      // Python sidecar may not be available in lite — that's fine
    }
    return
  }

  const maxAttempts = 8
  let lastError = null

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const pythonBase = await ensurePython()
      const response = await fetch(`${pythonBase}/voice/wake-word`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: shouldEnable })
      })

      if (response.ok) {
        console.info(
          `[NodeCore][Voice] Wake-word synced (${reason}): ${shouldEnable ? 'enabled' : 'disabled'}${attempt > 1 ? ` (retry ${attempt}/${maxAttempts})` : ''}`
        )
        return
      }

      const detail = await response.text().catch(() => '')
      lastError = `HTTP ${response.status} ${detail.slice(0, 200)}`
    } catch (error) {
      lastError = error?.message || String(error)
    }

    if (attempt < maxAttempts) {
      const waitMs = 250 * attempt
      await new Promise((resolve) => setTimeout(resolve, waitMs))
    }
  }

  console.warn(
    `[NodeCore][Voice] Wake-word sync failed (${reason}) after retries: ${lastError || 'unknown error'}`
  )
}

async function syncPythonCallModeState(reason = 'unknown') {
  const tier = store.settings.ai_tier || 'pro'
  const enabled = tier === 'ultra' && Boolean(store.call_mode)

  if (tier === 'lite') {
    return
  }

  const maxAttempts = 8
  let lastError = null

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const pythonBase = await ensurePython()
      const response = await fetch(`${pythonBase}/voice/call-mode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled })
      })

      if (response.ok) {
        console.info(
          `[NodeCore][Voice] Call-mode synced (${reason}): ${enabled ? 'enabled' : 'disabled'}${attempt > 1 ? ` (retry ${attempt}/${maxAttempts})` : ''}`
        )
        return
      }

      const detail = await response.text().catch(() => '')
      lastError = `HTTP ${response.status} ${detail.slice(0, 200)}`
    } catch (error) {
      lastError = error?.message || String(error)
    }

    if (attempt < maxAttempts) {
      const waitMs = 250 * attempt
      await new Promise((resolve) => setTimeout(resolve, waitMs))
    }
  }

  console.warn(
    `[NodeCore][Voice] Call-mode sync failed (${reason}) after retries: ${lastError || 'unknown error'}`
  )
}

async function triggerAutoTts(text) {
  const aiTier = store.settings.ai_tier || 'pro'
  const ttsEnabled = Boolean(store.settings.tts_enabled)
  const cleaned = String(text || '').trim()

  if (aiTier === 'lite') {
    console.info('[NodeCore][Voice] Auto TTS skipped: ai_tier=lite')
    return
  }
  if (!ttsEnabled) {
    console.info('[NodeCore][Voice] Auto TTS skipped: settings.tts_enabled=false')
    return
  }
  if (cleaned.length < 2) {
    console.info('[NodeCore][Voice] Auto TTS skipped: empty/short text')
    return
  }

  const maxAttempts = 10
  let lastError = null
  let announcedLoading = false

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const pythonBase = await ensurePython()
      const response = await fetch(`${pythonBase}/chat/speak`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: cleaned })
      })

      if (response.ok) {
        if (announcedLoading) {
          broadcast({
            type: 'voice_engine_loading',
            data: {
              loading: false,
              pending_auto_tts: false,
              message: 'Motor de voz pronto. Reproduzindo resposta.'
            }
          })
        }
        if (attempt > 1) {
          console.info(`[NodeCore][Voice] Auto TTS requested (retry ${attempt}/${maxAttempts})`)
        } else {
          console.info('[NodeCore][Voice] Auto TTS requested')
        }
        return
      }

      const detail = await response.text().catch(() => '')
      lastError = `HTTP ${response.status} ${detail.slice(0, 200)}`
    } catch (error) {
      lastError = error?.message || String(error)
    }

    if (!announcedLoading) {
      announcedLoading = true
      broadcast({
        type: 'voice_engine_loading',
        data: {
          loading: true,
          pending_auto_tts: true,
          message:
            'Motor de voz (Python/TTS) carregando. Vou reproduzir automaticamente quando estiver pronto.'
        }
      })
    }

    if (attempt < maxAttempts) {
      const waitMs = 300 * attempt
      await new Promise((resolve) => setTimeout(resolve, waitMs))
    }
  }

  if (announcedLoading) {
    broadcast({
      type: 'voice_engine_loading',
      data: {
        loading: false,
        pending_auto_tts: false,
        message: 'Não foi possível iniciar a voz automática agora.'
      }
    })
  }
  console.warn(`[NodeCore][Voice] Auto TTS failed after retries: ${lastError || 'unknown error'}`)
}

let stopGenerationRequested = false
const activeChatControllers = new Set()

async function streamFallbackResponse(
  req,
  res,
  content,
  threadId,
  memoryContext,
  memorySources,
  reason = null,
  responseLanguage = 'pt-BR'
) {
  appendMessage(threadId, 'user', content, { sources: memorySources })
  const reply = generateFallbackReply(content, memoryContext, reason, responseLanguage)
  const tokens = splitTokens(reply)

  stopGenerationRequested = false
  sendSseHeaders(res)
  writeSse(res, { status: 'thinking' })
  writeSse(res, { status: 'responding' })

  let assembled = ''
  let closed = false
  req.on('close', () => {
    closed = true
  })

  for (const token of tokens) {
    if (closed || stopGenerationRequested) break
    assembled += token
    writeSse(res, { token })
    await new Promise((r) => setTimeout(r, 15))
  }

  appendMessage(threadId, 'assistant', assembled.trim() || 'Interrompido.')
  writeSse(res, { done: true })
  res.end()
}

function parseLlamaDataLine(line) {
  const payload = line.replace(/^data:\s*/, '').trim()
  if (!payload) return { type: 'skip' }
  if (payload === '[DONE]') return { type: 'done' }

  try {
    const json = JSON.parse(payload)
    if (json.error?.message) return { type: 'error', error: json.error.message }

    const choice = json.choices?.[0]
    const finishReason = choice?.finish_reason

    const delta = choice?.delta?.content
    const full = choice?.message?.content
    const token = typeof delta === 'string' ? delta : typeof full === 'string' ? full : ''

    const toolCalls = choice?.delta?.tool_calls
    if (Array.isArray(toolCalls) && toolCalls.length > 0) {
      return { type: 'tool_calls', tool_calls: toolCalls, finish_reason: finishReason }
    }

    if (finishReason === 'tool_calls' && choice?.message?.tool_calls) {
      return {
        type: 'tool_calls',
        tool_calls: choice.message.tool_calls,
        finish_reason: finishReason
      }
    }

    if (!token) return { type: 'skip', finish_reason: finishReason }
    return { type: 'token', token, finish_reason: finishReason }
  } catch {
    return { type: 'skip' }
  }
}

async function streamLlamaChat(req, res, payload) {
  const content = String(payload.content || '')
  const threadId = String(payload.thread_id || 'default')
  const responseLanguage = resolveResponseLanguage(content, threadId)
  const speakResponse = payload.speak_response !== false
  const tierName = store.settings.ai_tier || 'pro'
  const isUltra = tierName === 'ultra'
  let memoryContext = typeof payload.memory_context === 'string' ? payload.memory_context : null
  let memorySources = Array.isArray(payload.memory_sources) ? [...payload.memory_sources] : []
  let toolSteps = []
  let activeSkill = null

  log(`[chat] streamLlamaChat called: tier=${tierName}, content="${content.slice(0, 60)}", thread=${threadId}`)
  log(`[chat] llamaState BEFORE ensureLlamaReady: ready=${llamaState.ready}, starting=${llamaState.starting}, lastError=${llamaState.lastError}, process=${!!llamaState.process}, port=${llamaState.port}`)

  const ready = await ensureLlamaReady(false)

  log(`[chat] ensureLlamaReady returned: ${ready}, llamaState.ready=${llamaState.ready}, lastError=${llamaState.lastError}`)

  if (!ready) {
    log(`[chat] FALLBACK triggered! reason=${llamaState.lastError || 'llama unavailable'}`)
    await streamFallbackResponse(
      req,
      res,
      content,
      threadId,
      memoryContext,
      memorySources.length ? memorySources : undefined,
      llamaState.lastError || 'llama unavailable',
      responseLanguage
    )
    return
  }

  if (isUltra) {
    const semantic = await runSemanticMemoryRetrieval(content, 6)
    if (semantic.memoryContext) {
      memoryContext = memoryContext
        ? `${memoryContext}\n\n${semantic.memoryContext}`
        : semantic.memoryContext
    }

    if (Array.isArray(semantic.memorySources) && semantic.memorySources.length) {
      const byUrl = new Map()
      for (const source of [...memorySources, ...semantic.memorySources]) {
        if (!source || !source.url) continue
        byUrl.set(source.url, source)
      }
      memorySources = [...byUrl.values()].slice(0, 10)
    }
  }

  appendMessage(threadId, 'user', content, {
    sources: memorySources.length ? memorySources : undefined,
    graph_data: null
  })

  sendSseHeaders(res)
  writeSse(res, { status: 'thinking' })
  if (memorySources.length) {
    writeSse(res, { sources: memorySources })
    writeSse(res, { memory_sources: memorySources })
  }

  const history = getThreadMessages(threadId)
    .slice(-8)
    .map((msg) => ({
      role: msg.role === 'assistant' ? 'assistant' : 'user',
      content: sanitizePromptText(String(msg.content || ''))
    }))

  const responseStyle = tierName === 'ultra' ? 'concise' : 'balanced'
  const promptText = promptRegistry.buildSystemPrompt({
    tier: tierName,
    persona: store.settings.assistant_persona || promptRegistry.getDefaults().assistant_persona,
    memoryContext,
    toolInstruction: null,
    responseStyle,
    responseLanguage
  })
  const systemMessage = {
    role: 'system',
    content: sanitizePromptText(promptText)
  }

  const tier = tiersConfig[tierName] || tiersConfig.pro || DEFAULT_TIERS.pro

  const controller = new AbortController()
  activeChatControllers.add(controller)
  stopGenerationRequested = false

  // Stop any ongoing TTS when starting a new message
  try {
    const pythonBase = await ensurePython()
    await fetch(`${pythonBase}/chat/stop-voice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (error) {
    // TTS might not be available, ignore
  }

  let closed = false
  req.on('close', () => {
    closed = true
    controller.abort()
  })

  let assembled = ''
  let bufferedStructuredResponse = null
  let ttsCursor = 0
  let ttsChain = Promise.resolve()
  const prebufferChars = Math.max(40, Number(store.settings.prebuffer_chars || 90))

  const enqueueAutoTts = (chunk) => {
    const cleaned = String(chunk || '').trim()
    if (cleaned.length < 2) return
    ttsChain = ttsChain.then(() => triggerAutoTts(cleaned)).catch(() => {})
  }

  const flushTtsChunks = (final = false) => {
    if (!speakResponse || stopGenerationRequested || closed) return
    const pending = assembled.slice(ttsCursor)
    if (!pending) return
    if (!final && pending.length < prebufferChars) return

    let cut = -1
    for (let i = pending.length - 1; i >= 0; i -= 1) {
      const ch = pending[i]
      if (ch === '.' || ch === '!' || ch === '?' || ch === '\n' || ch === ';' || ch === ':') {
        cut = i + 1
        break
      }
    }

    if (!final && cut <= 0) return
    if (final && cut <= 0) cut = pending.length

    const chunk = pending.slice(0, cut).trim()
    ttsCursor += cut
    enqueueAutoTts(chunk)
  }

  const messages = [systemMessage, ...history]
  let maxToolRounds = 3
  let round = 0

  try {
    while (round < maxToolRounds) {
      round++

      let toolsPayload = []
      if (isUltra) {
        const top5SkillIds = await getTop5SkillsSemantic(content)
        toolsPayload = skillRegistry.toOpenAITools(top5SkillIds)
      }

      const requestBody = {
        model: 'gpt-4o',
        stream: true,
        temperature: Number.isFinite(tier.temperature) ? tier.temperature : 0.7,
        top_p: Number.isFinite(tier.top_p) ? tier.top_p : 1,
        max_tokens: Number.isFinite(tier.max_tokens) ? tier.max_tokens : 320,
        messages
      }
      if (toolsPayload.length > 0) {
        requestBody.tools = toolsPayload
      }

      writeSse(res, { status: 'responding' })

      const llamaResp = await fetch(`${getLlamaBaseUrl()}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify(requestBody)
      })

      if (!llamaResp.ok || !llamaResp.body) {
        const txt = await llamaResp.text().catch(() => '')
        throw new Error(`llama HTTP ${llamaResp.status}: ${txt.slice(0, 240)}`)
      }

      const reader = llamaResp.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let roundText = ''
      let toolCallsAccum = []

      while (true) {
        if (stopGenerationRequested || closed) {
          controller.abort()
          break
        }

        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const rawLine of lines) {
          const line = rawLine.trim()
          if (!line.startsWith('data:')) continue
          const parsed = parseLlamaDataLine(line)
          if (parsed.type === 'done') break
          if (parsed.type === 'error') {
            writeSse(res, { error: parsed.error })
            continue
          }
          if (parsed.type === 'tool_calls') {
            for (const tc of parsed.tool_calls) {
              const idx = tc.index ?? 0
              if (!toolCallsAccum[idx]) {
                toolCallsAccum[idx] = {
                  id: '',
                  type: 'function',
                  function: { name: '', arguments: '' }
                }
              }
              if (tc.id) toolCallsAccum[idx].id = tc.id
              if (tc.type) toolCallsAccum[idx].type = tc.type
              if (tc.function?.name) toolCallsAccum[idx].function.name += tc.function.name
              if (tc.function?.arguments)
                toolCallsAccum[idx].function.arguments += tc.function.arguments
            }
            continue
          }
          if (parsed.type === 'token') {
            roundText += parsed.token
            assembled += parsed.token
            writeSse(res, { token: parsed.token })
            flushTtsChunks(false)
          }
        }
      }

      if (toolCallsAccum.length > 0 && toolCallsAccum[0]?.function?.name) {
        const executedTools = []
        for (const tc of toolCallsAccum) {
          if (!tc?.function?.name) continue

          const toolName = tc.function.name
          const rawArgs = tc.function.arguments || '{}'
          let args
          try {
            args = JSON.parse(rawArgs)
          } catch {
            args = { content: rawArgs }
          }

          let skillId = toolName
          let skillObj = skillRegistry.getById(skillId)

          if (!skillObj) {
            for (const skill of getEnabledSkills()) {
              const match = (skill.manifest.tools || []).find((t) => t.name === toolName)
              if (match) {
                skillId = skill.id
                skillObj = skill
                break
              }
            }
          }

          if (skillObj && isSkillEnabledByStore(skillObj)) {
            const runtimeContext = {
              listActiveReminders(limit = 8) {
                return store.reminders
                  .filter((r) => r.is_active)
                  .sort((a, b) => parseTime(a.scheduled_time) - parseTime(b.scheduled_time))
                  .slice(0, limit)
              },
              createReminderFromText(text) {
                const rawText = String(text || '').trim()
                const scheduled = parseRelativeReminder(rawText) || new Date(Date.now() + 60 * 60 * 1000).toISOString()
                const title = extractReminderTitle(rawText)
                const reminder = normalizeReminder({
                  id: store.next_reminder_id++,
                  title: title || 'Lembrete',
                  content: rawText,
                  scheduled_time: scheduled,
                  is_active: true
                })
                store.reminders.push(reminder)
                saveStore()
                broadcast({ type: 'reminders_updated' })
                return reminder
              },
              createReminder({ title, scheduled_time, content }) {
                const reminder = normalizeReminder({
                  id: store.next_reminder_id++,
                  title: title || 'Lembrete',
                  content: content || title || '',
                  scheduled_time: scheduled_time,
                  is_active: true
                })
                store.reminders.push(reminder)
                saveStore()
                broadcast({ type: 'reminders_updated' })
                return reminder
              },
              saveMemoryNote(text) {
                const note = saveMemoryNoteFromContent(text)
                semanticState.lastNotesSyncAt = 0
                return note
              },
                async searchMemory(text, limit = 4) {
                  const result = await runSemanticMemoryRetrieval(text, limit)
                  return result.hits || []
                },
                removeReminder(id) {
                  const initialCount = store.reminders.length
                  store.reminders = store.reminders.filter((r) => r.id !== Number(id))
                  const changed = store.reminders.length !== initialCount
                  if (changed) {
                    saveStore()
                    broadcast({ type: 'reminders_updated' })
                  }
                  return changed
                },
                removeAllReminders() {
                  const changed = store.reminders.length > 0
                  if (changed) {
                    store.reminders = []
                    saveStore()
                    broadcast({ type: 'reminders_updated' })
                  }
                  return changed
                },
                removeRemindersByFilter({ title, date }) {
                  const initialCount = store.reminders.length
                  store.reminders = store.reminders.filter((r) => {
                    let match = true
                    if (title) {
                      const t = String(title).toLowerCase()
                      if (!r.title.toLowerCase().includes(t) && !r.content.toLowerCase().includes(t)) {
                        match = false
                      }
                    }
                    if (date && match) {
                      // Simplistic date match (YYYY-MM-DD)
                      if (!r.scheduled_time.startsWith(date)) {
                        match = false
                      }
                    }
                    return !match
                  })
                  
                  const changed = store.reminders.length !== initialCount
                  if (changed) {
                    saveStore()
                    broadcast({ type: 'reminders_updated' })
                  }
                  return { success: changed, count: initialCount - store.reminders.length }
                },
                searchWeb
              }

            try {
              const result = await skillRegistry.execute(
                skillId,
                args.content || content,
                runtimeContext,
                args,
                toolName
              )
              const toolResultText = result?.instruction || JSON.stringify(result || {})
              if (result?.structuredResponse) {
                bufferedStructuredResponse = result.structuredResponse
              } else if (result?.directResponse) {
                assembled += `\n${result.directResponse}`
                for (const token of splitTokens(result.directResponse)) {
                  writeSse(res, { token })
                }
              }

              const toolStep = {
                skill_id: skillId,
                skill_name: skillObj.manifest.name,
                tool: toolName,
                status: result ? 'success' : 'error',
                started_at: isoNow()
              }
              toolSteps.push(toolStep)
              activeSkill = skillId
              writeSse(res, { active_skill: activeSkill })
              writeSse(res, { tool_steps: toolSteps })

              if (Array.isArray(result?.webSources) && result.webSources.length) {
                memorySources = [...memorySources, ...result.webSources].slice(0, 12)
              }

              messages.push({
                role: 'assistant',
                tool_calls: [
                  {
                    id: tc.id || `call_${toolName}`,
                    type: 'function',
                    function: { name: toolName, arguments: rawArgs }
                  }
                ]
              })
              messages.push({
                role: 'tool',
                tool_call_id: tc.id || `call_${toolName}`,
                content: toolResultText
              })
              executedTools.push({ name: toolName, result: toolResultText })
            } catch (execError) {
              messages.push({
                role: 'tool',
                tool_call_id: tc.id || `call_${toolName}`,
                content: `Error: ${execError?.message || 'tool execution failed'}`
              })
            }
          } else {
            messages.push({
              role: 'tool',
              tool_call_id: tc.id || `call_${toolName}`,
              content: `Error: unknown tool "${toolName}"`
            })
          }
        }

        if (executedTools.length > 0) {
          continue
        }
      }

      break
    }

    appendMessage(threadId, 'assistant', assembled.trim() || 'Interrompido.', {
      sources: memorySources.length ? memorySources : undefined,
      graph_data:
        activeSkill || toolSteps.length
          ? { active_skill: activeSkill, tool_steps: toolSteps }
          : null,
      structured_response: bufferedStructuredResponse || undefined
    })
    flushTtsChunks(true)
    if (bufferedStructuredResponse) {
      writeSse(res, { structured_response: bufferedStructuredResponse })
    }
    writeSse(res, { done: true })
    res.end()
  } catch (error) {
    const fallbackMsg = generateFallbackReply(
      content,
      memoryContext,
      error?.message || 'llama failure',
      responseLanguage
    )
    const tail = fallbackMsg.slice(assembled.length)
    if (tail) {
      for (const token of splitTokens(tail)) {
        assembled += token
        writeSse(res, { token })
      }
    }

    appendMessage(threadId, 'assistant', assembled.trim() || fallbackMsg, {
      sources: memorySources.length ? memorySources : undefined,
      graph_data:
        activeSkill || toolSteps.length
          ? { active_skill: activeSkill, tool_steps: toolSteps }
          : null
    })
    flushTtsChunks(true)
    writeSse(res, { done: true })
    res.end()
  } finally {
    activeChatControllers.delete(controller)
  }
}

async function runVoiceCommand(payload = {}) {
  const content = String(payload.content || '').trim()
  if (!content) return
  const threadId = String(payload.thread_id || 'default')
  const speakResponse = payload.speak_response !== false
  log(`[voice-cmd] runVoiceCommand called: content="${content.slice(0, 80)}", thread=${threadId}`)

  broadcast({ type: 'user', content })
  broadcast({ type: 'assistant', data: { status: 'Pensando...' } })

  let closed = false
  const reqMock = {
    on: (event, cb) => {
      if (event === 'close') {
        reqMock._onClose = cb
      }
    },
    _onClose: null
  }

  let sseBuffer = ''
  const resMock = {
    writeHead: () => {},
    write: (chunk) => {
      sseBuffer += String(chunk || '')
      let sepIdx = sseBuffer.indexOf('\n\n')
      while (sepIdx !== -1) {
        const block = sseBuffer.slice(0, sepIdx)
        sseBuffer = sseBuffer.slice(sepIdx + 2)
        const lines = block.split('\n')
        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed.startsWith('data:')) continue
          const payloadStr = trimmed.replace(/^data:\s*/, '').trim()
          if (!payloadStr) continue
          try {
            const data = JSON.parse(payloadStr)
            broadcast({ type: 'assistant', data })
          } catch {
            // ignore invalid chunk
          }
        }
        sepIdx = sseBuffer.indexOf('\n\n')
      }
      return true
    },
    end: () => {
      closed = true
    }
  }

  await streamLlamaChat(reqMock, resMock, {
    content,
    thread_id: threadId,
    speak_response: speakResponse
  })

  if (!closed && typeof reqMock._onClose === 'function') {
    reqMock._onClose()
  }
}

async function maybeRestartLlamaOnTierChange(prevTier, nextTier, prevBackend, nextBackend) {
  if (prevTier === nextTier && prevBackend === nextBackend) {
    const tierConfig = tiersConfig[nextTier] || tiersConfig.pro || DEFAULT_TIERS.pro
    const modelReady = await ensureTierModelAvailable(nextTier, tierConfig)
    if (!modelReady.ok) {
      llamaState.lastError = modelReady.reason || `Failed to prepare model for tier ${nextTier}`
      return false
    }
    return true
  }
  if (nextTier !== 'ultra') {
    await stopEmbeddingServer()
    semanticState.enabled = false
    semanticState.ready = false
  }
  const llamaReady = await ensureLlamaReady(true)
  if (nextTier === 'ultra') {
    await ensureEmbeddingReady()
    await syncSkillAndToolIndexes(false)
  }
  return llamaReady
}

function getSetupInfo() {
  const installedBackends = ['vulkan', 'cpu'].filter((backend) => hasBackendBinary(backend))
  const localInstalled = hasBackendBinary('vulkan') || hasBackendBinary('cpu')
  const cpuName = os.cpus?.()?.[0]?.model || 'Unknown CPU'
  const recommendedBuild = installedBackends.includes('vulkan') ? 'vulkan' : 'cpu'
  const detectedHardware = installedBackends.includes('vulkan')
    ? 'GPU com suporte a Vulkan detectada'
    : 'GPU dedicada não detectada (modo CPU)'
  const preferred = normalizeBackendMode(store.settings.local_backend || 'auto')
  const currentLocalBackend = llamaState.backend || pickBackend(preferred) || 'cpu'
  return {
    local_installed: localInstalled,
    installed_version: process.env.npm_package_version || '1.0.0',
    latest_version: process.env.npm_package_version || '1.0.0',
    cpu_name: cpuName,
    detected_hardware: detectedHardware,
    recommended_build: recommendedBuild,
    installed_backends: installedBackends,
    current_local_backend: currentLocalBackend,
    os_name: `${os.platform()} ${os.release()}`
  }
}

function isValidTier(tier) {
  return tier === 'lite' || tier === 'pro' || tier === 'ultra'
}

async function handleRequest(req, res) {
  if (!req.url) {
    sendJson(res, 400, { detail: 'Missing URL' })
    return
  }

  if (req.method === 'OPTIONS') {
    sendNoContent(res)
    return
  }

  const parsedUrl = new URL(req.url, `http://${HOST}:${PORT}`)
  const pathname = parsedUrl.pathname

  if (pathname.startsWith('/voice/')) {
    try {
      await proxyToPython(req, res, pathname)
    } catch (error) {
      sendVoiceSidecarFallback(res, pathname, error)
    }
    return
  }

  if (pathname === '/chat/speak' || pathname === '/chat/stop-voice') {
    try {
      await proxyToPython(req, res, pathname)
    } catch (error) {
      sendVoiceSidecarFallback(res, pathname, error)
    }
    return
  }

  if (pathname === '/status' && req.method === 'GET') {
    const autoStart = store.settings.auto_start_llm !== false
    sendJson(res, 200, {
      status: 'ok',
      mode: store.mode,
      brain_ready: autoStart ? llamaState.ready : true,
      is_loading: llamaState.starting || modelDownloadState.in_progress,
      setup: getSetupInfo(),
      ai_tier: store.settings.ai_tier || 'pro',
      auto_start_llm: autoStart,
      llama_runtime: {
        current_tier: llamaState.currentTier,
        backend_active: llamaState.backend,
        backend_reason: llamaState.backendReason,
        backend_mode:
          llamaState.backendMode || normalizeBackendMode(store.settings.local_backend || 'auto'),
        configured_model_file: llamaState.configuredModelFile,
        loaded_model_path: llamaState.modelPath,
        loaded_model_file: llamaState.modelPath ? path.basename(llamaState.modelPath) : null,
        using_fallback_model: llamaState.usingFallbackModel
      },
      model_download: modelDownloadState,
      semantic_runtime: buildSemanticRuntimeStatus(),
      prompt_runtime: promptRegistry.getRuntimeStatus(),
      tiers_config: tiersConfig
    })
    return
  }

  if (pathname === '/init-status' && req.method === 'GET') {
    sendJson(res, 200, store.init_status)
    return
  }

  if (pathname === '/internal/shutdown' && req.method === 'POST') {
    sendJson(res, 200, { status: 'ok', message: 'Shutting down node core.' })
    setTimeout(() => {
      shutdownAll().catch(() => process.exit(0))
    }, 20)
    return
  }

  if (pathname === '/llama/ensure' && req.method === 'POST') {
    const autoStart = store.settings.auto_start_llm !== false

    if (!autoStart) {
      sendJson(res, 200, {
        status: 'ok',
        ready: true,
        skipped: true,
        reason: 'auto_start_llm_disabled',
        is_loading: false,
        error: null
      })
      return
    }

    const ready = await ensureLlamaReady(false, false)
    sendJson(res, 200, {
      status: ready ? 'ok' : 'pending',
      ready,
      skipped: false,
      is_loading: llamaState.starting || modelDownloadState.in_progress,
      error: ready ? null : llamaState.lastError || null
    })
    return
  }

  if (pathname === '/setup/status' && req.method === 'GET') {
    const setup = getSetupInfo()
    sendJson(res, 200, {
      status: 'ok',
      engine_installed: setup.local_installed,
      installed_version: setup.installed_version,
      latest_version: setup.latest_version,
      cpu_name: setup.cpu_name,
      detected_hardware: setup.detected_hardware,
      recommended_build: setup.recommended_build,
      installed_backends: setup.installed_backends,
      current_local_backend: setup.current_local_backend,
      os_name: setup.os_name,
      ai_tier: store.settings.ai_tier || 'pro',
      llama_runtime: {
        backend_active: llamaState.backend,
        backend_reason: llamaState.backendReason,
        backend_mode:
          llamaState.backendMode || normalizeBackendMode(store.settings.local_backend || 'auto')
      },
      model_download: modelDownloadState,
      semantic_runtime: buildSemanticRuntimeStatus(),
      prompt_runtime: promptRegistry.getRuntimeStatus(),
      tiers_config: tiersConfig
    })
    return
  }

  if (pathname === '/setup/apply-tier' && req.method === 'POST') {
    const requestedTier = String(parsedUrl.searchParams.get('tier') || '').toLowerCase()
    if (!isValidTier(requestedTier)) {
      sendJson(res, 400, { status: 'error', message: 'Invalid tier. Use lite, pro or ultra.' })
      return
    }

    const prevTier = store.settings.ai_tier || 'pro'
    const prevBackend = normalizeBackendMode(store.settings.local_backend || 'auto')

    store.mode = 'local'
    store.settings.ai_tier = requestedTier

    if (requestedTier === 'lite') {
      store.settings.tts_enabled = false
      store.settings.wake_word_enabled = false
    } else if (requestedTier === 'pro') {
      store.settings.tts_enabled = true
      store.settings.wake_word_enabled = false
    } else if (requestedTier === 'ultra') {
      store.settings.tts_enabled = true
      store.settings.wake_word_enabled = true
    }

    saveStore()
    const ready = await maybeRestartLlamaOnTierChange(
      prevTier,
      requestedTier,
      prevBackend,
      normalizeBackendMode(store.settings.local_backend || 'auto')
    )
    if (!ready) {
      sendJson(res, 503, {
        status: 'error',
        message: llamaState.lastError || 'Failed to initialize selected model'
      })
      return
    }
    void syncWakeWordState('setup_apply_tier')

    sendJson(res, 200, { status: 'ok', ai_tier: store.settings.ai_tier })
    return
  }

  if (pathname === '/mode' && req.method === 'POST') {
    const payload = await readJsonBody(req).catch(() => ({}))
    const prevTier = store.settings.ai_tier || 'pro'
    const mode = payload.mode || prevTier

    if (!isValidTier(mode)) {
      sendJson(res, 400, { status: 'error', message: 'Invalid tier. Use lite, pro or ultra.' })
      return
    }

    store.mode = 'local'
    store.settings.ai_tier = mode
    if (mode === 'lite') {
      store.settings.tts_enabled = false
      store.settings.wake_word_enabled = false
    } else if (mode === 'pro') {
      store.settings.tts_enabled = true
      store.settings.wake_word_enabled = false
    } else if (mode === 'ultra') {
      store.settings.tts_enabled = true
      store.settings.wake_word_enabled = true
    }
    saveStore()

    broadcast({ type: 'model_changed', data: { new_mode: 'local' } })

    const ready = await maybeRestartLlamaOnTierChange(
      prevTier,
      mode,
      normalizeBackendMode(store.settings.local_backend || 'auto'),
      normalizeBackendMode(store.settings.local_backend || 'auto')
    )
    if (!ready) {
      sendJson(res, 503, {
        status: 'error',
        message: llamaState.lastError || 'Failed to initialize selected model'
      })
      return
    }
    void syncWakeWordState('mode_change')

    sendJson(res, 200, { status: 'ok', mode: 'local' })
    return
  }

  if (pathname === '/mode/call-mode' && req.method === 'POST') {
    const payload = await readJsonBody(req).catch(() => ({}))
    const enabled = Boolean(payload.enabled)

    if (enabled && (store.settings.ai_tier || 'pro') !== 'ultra') {
      sendJson(res, 200, {
        status: 'error',
        message: 'Call mode only available in Ultra tier'
      })
      return
    }

    if (enabled) {
      try {
        await ensurePython()
      } catch (error) {
        sendJson(res, 503, { detail: error?.message || 'Python sidecar unavailable' })
        return
      }
    }

    store.call_mode = enabled
    saveStore()
    void syncPythonCallModeState('call_mode_change')
    void syncWakeWordState('call_mode_change')
    sendJson(res, 200, { status: 'ok', call_mode: store.call_mode })
    return
  }

  if (pathname === '/mode/call-mode/status' && req.method === 'GET') {
    sendJson(res, 200, { call_mode: Boolean(store.call_mode) })
    return
  }

  if (pathname === '/settings' && req.method === 'GET') {
    // Enforce tier floor constraints: prevent returning invalid feature states
    const tier = store.settings.ai_tier || 'pro'
    if (tier === 'lite') {
      store.settings.tts_enabled = false
      store.settings.wake_word_enabled = false
    } else if (tier === 'pro') {
      store.settings.wake_word_enabled = false
    }
    sendJson(res, 200, store.settings)
    return
  }

  if (pathname === '/settings' && req.method === 'PATCH') {
    try {
      const payload = await readJsonBody(req).catch(() => ({}))
      const prevTier = store.settings.ai_tier || 'pro'
      const prevBackend = store.settings.local_backend || 'auto'

      if (payload.ai_tier && !isValidTier(payload.ai_tier)) {
        sendJson(res, 400, { status: 'error', message: 'Invalid ai_tier. Use lite, pro or ultra.' })
        return
      }

      store.settings = { ...store.settings, ...payload }
      store.settings.local_backend = normalizeBackendMode(store.settings.local_backend || 'auto')

      // Only force tier defaults when the tier itself is changing
      // Otherwise, just enforce tier floor constraints to prevent invalid states
      if (payload.ai_tier) {
        if (store.settings.ai_tier === 'lite') {
          store.settings.tts_enabled = false
          store.settings.wake_word_enabled = false
        } else if (store.settings.ai_tier === 'pro') {
          store.settings.tts_enabled = true
          store.settings.wake_word_enabled = false
        } else if (store.settings.ai_tier === 'ultra') {
          store.settings.tts_enabled = true
          store.settings.wake_word_enabled = true
        }
      } else {
        // Enforce tier floor: prevent enabling features not available for the current tier
        const currentTier = store.settings.ai_tier || 'pro'
        if (currentTier === 'lite') {
          store.settings.tts_enabled = false
          store.settings.wake_word_enabled = false
        } else if (currentTier === 'pro') {
          store.settings.wake_word_enabled = false
        }
      }

      if (payload.ai_tier) store.mode = 'local'
      saveStore()

      const ready = await maybeRestartLlamaOnTierChange(
        prevTier,
        store.settings.ai_tier || 'pro',
        prevBackend,
        normalizeBackendMode(store.settings.local_backend || 'auto')
      )
      if (!ready) {
        sendJson(res, 503, {
          status: 'error',
          message: llamaState.lastError || 'Failed to initialize selected model'
        })
        return
      }
      void syncWakeWordState('settings_patch')

      sendJson(res, 200, store.settings)
    } catch (error) {
      console.error('[NodeCore] Error in PATCH /settings:', error)
      sendJson(res, 500, { status: 'error', message: 'Internal server error' })
    }
    return
  }

  if (pathname === '/chat/stream' && req.method === 'POST') {
    const payload = await readJsonBody(req).catch(() => ({}))
    await streamLlamaChat(req, res, payload)
    return
  }

  if (pathname === '/chat/voice-command' && req.method === 'POST') {
    const payload = await readJsonBody(req).catch(() => ({}))
    await runVoiceCommand(payload)
    sendJson(res, 200, { status: 'ok' })
    return
  }

  if (pathname === '/semantic/reindex' && req.method === 'POST') {
    const payload = await readJsonBody(req).catch(() => ({}))
    const force = payload?.force !== false
    if ((store.settings.ai_tier || 'pro') !== 'ultra') {
      sendJson(res, 200, {
        status: 'ok',
        skipped: true,
        reason: 'semantic indexing available only in ultra tier',
        semantic_runtime: buildSemanticRuntimeStatus()
      })
      return
    }
    await syncSkillAndToolIndexes(force)
    await syncNoteIndex(force)
    sendJson(res, 200, {
      status: 'ok',
      semantic_runtime: buildSemanticRuntimeStatus(),
      notes_indexed_at: semanticState.lastNotesSyncAt || null,
      skills_indexed_at: semanticState.lastSkillSyncAt || null
    })
    return
  }

  if (pathname === '/chat/stop' && req.method === 'POST') {
    stopGenerationRequested = true
    for (const controller of activeChatControllers) {
      controller.abort()
    }
    
    // Stop TTS when stopping generation
    try {
      const pythonBase = await ensurePython()
      await fetch(`${pythonBase}/chat/stop-voice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
    } catch (error) {
      // TTS might not be available, ignore
    }
    
    sendJson(res, 200, { status: 'ok' })
    return
  }

  if (pathname === '/chat/history' && req.method === 'GET') {
    const threadId = parsedUrl.searchParams.get('thread_id') || 'default'
    sendJson(res, 200, getThreadMessages(threadId))
    return
  }

  if (pathname === '/chat/history' && req.method === 'DELETE') {
    const threadId = parsedUrl.searchParams.get('thread_id') || 'default'
    store.thread_messages[threadId] = []
    delete store.session_titles[threadId]
    saveStore()
    sendJson(res, 200, { status: 'ok' })
    return
  }

  if (pathname.startsWith('/chat/message/') && req.method === 'DELETE') {
    const id = Number(pathname.split('/').pop())
    if (!Number.isFinite(id)) {
      sendJson(res, 400, { detail: 'Invalid message id' })
      return
    }

    for (const threadId of Object.keys(store.thread_messages)) {
      const prevLength = store.thread_messages[threadId].length
      store.thread_messages[threadId] = store.thread_messages[threadId].filter((m) => m.id !== id)
      if (store.thread_messages[threadId].length !== prevLength) {
        saveStore()
        break
      }
    }

    sendJson(res, 200, { status: 'ok' })
    return
  }

  if (pathname === '/chat/sessions' && req.method === 'GET') {
    sendJson(res, 200, { sessions: listSessions().slice(0, 5) })
    return
  }

  if (pathname === '/chat/title' && req.method === 'POST') {
    const payload = await readJsonBody(req).catch(() => ({}))
    const threadId = String(payload.thread_id || 'default')
    const userMessage = String(payload.user_message || '')
    const title = (userMessage.trim().slice(0, 12) || 'Nova conversa').replace(/["'!?.,]/g, '')

    store.session_titles[threadId] = title
    saveStore()
    sendJson(res, 200, { status: 'ok', title })
    return
  }

  if (pathname === '/extensions' && req.method === 'GET') {
    skillRegistry.refresh()
    sendJson(res, 200, buildExtensionsPayload())
    return
  }

  if (pathname === '/extensions/registry' && req.method === 'GET') {
    skillRegistry.refresh()
    sendJson(res, 200, buildExtensionsPayload())
    return
  }

  if (pathname === '/extensions/install' && req.method === 'POST') {
    const payload = await readJsonBody(req).catch(() => ({}))
    const requested = String(payload.id || crypto.randomUUID()).toLowerCase()
    const id = requested.replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '') || crypto.randomUUID()
    const extDir = path.join(skillRegistry.extensionsDir, id)
    ensureDir(extDir)
    const skillMdPath = path.join(extDir, 'SKILL.md')
    if (!fs.existsSync(skillMdPath)) {
      const description = String(payload.description || 'Extension skill for MomAI.')
      fs.writeFileSync(
        skillMdPath,
        [
          '---',
          `name: ${id}`,
          `description: ${description}`,
          'compatibility: MomAI Node Core',
          '---',
          '',
          '# Extension Skill',
          '',
          'Descreva aqui quando usar esta skill e como executar o fluxo.',
          '',
          '## Quando usar',
          '-',
          '',
          '## Como executar',
          '1.'
        ].join('\n'),
        'utf8'
      )
    }
    if (!store.extensions.find((ext) => ext.id === id)) {
      store.extensions.push({
        id,
        name: id,
        description: 'Extension installed by Node core',
        category: 'builtin',
        enabled: true
      })
      saveStore()
    }
    skillRegistry.loadExtensions()
    sendJson(res, 200, { ok: true })
    return
  }

  if (pathname === '/extensions/toggle' && req.method === 'POST') {
    const payload = await readJsonBody(req).catch(() => ({}))
    const found = store.extensions.find((item) => item.id === payload.id)
    if (found) found.enabled = Boolean(payload.enabled)
    // SKILL.md is source-of-truth; toggle currently affects runtime registry state via local store.
    saveStore()
    skillRegistry.loadExtensions()
    sendJson(res, 200, { ok: true })
    return
  }

  if (pathname === '/extensions/uninstall' && req.method === 'POST') {
    const payload = await readJsonBody(req).catch(() => ({}))
    store.extensions = store.extensions.filter((item) => item.id !== payload.id)
    const extDir = path.join(skillRegistry.extensionsDir, String(payload.id || ''))
    if (fs.existsSync(extDir)) fs.rmSync(extDir, { recursive: true, force: true })
    saveStore()
    skillRegistry.loadExtensions()
    sendJson(res, 200, { ok: true })
    return
  }

  if (
    pathname.startsWith('/extensions/') &&
    pathname.endsWith('/action') &&
    req.method === 'POST'
  ) {
    sendJson(res, 200, { ok: true, result: null })
    return
  }

  if (pathname === '/extensions/hardware-stats' && req.method === 'GET') {
    const mem = process.memoryUsage()
    sendJson(res, 200, {
      cpu_usage: 0,
      ram_usage: Math.round((mem.rss / os.totalmem()) * 100),
      active_processes: (llamaState.process ? 2 : 1) + (semanticState.embedding.process ? 1 : 0),
      vram_usage: 0
    })
    return
  }

  if (pathname === '/system/gaming-apps' && req.method === 'GET') {
    sendJson(res, 200, store.gaming_apps)
    return
  }

  if (pathname === '/system/gaming-apps' && req.method === 'POST') {
    const payload = await readJsonBody(req).catch(() => ({}))
    const appItem = {
      id: store.next_gaming_app_id++,
      name: String(payload.name || 'Game'),
      executable: String(payload.executable || ''),
      is_active: false
    }
    store.gaming_apps.push(appItem)
    saveStore()
    sendJson(res, 200, appItem)
    return
  }

  if (pathname.startsWith('/system/gaming-apps/') && req.method === 'DELETE') {
    const id = Number(pathname.split('/').pop())
    store.gaming_apps = store.gaming_apps.filter((item) => item.id !== id)
    saveStore()
    sendJson(res, 200, { ok: true })
    return
  }

  if (pathname === '/reminders' && req.method === 'GET') {
    sendJson(res, 200, store.reminders)
    return
  }

  if (pathname === '/reminders/active' && req.method === 'GET') {
    const active = store.reminders
      .filter((reminder) => reminder.is_active)
      .sort((a, b) => parseTime(a.scheduled_time) - parseTime(b.scheduled_time))
    sendJson(res, 200, active)
    return
  }

  if (pathname === '/reminders' && req.method === 'POST') {
    const payload = await readJsonBody(req).catch(() => ({}))
    const reminder = normalizeReminder({ ...payload, id: store.next_reminder_id++ })
    store.reminders.push(reminder)
    saveStore()
    broadcast({ type: 'reminders_updated' })
    sendJson(res, 200, reminder)
    return
  }

  if (pathname.startsWith('/reminders/') && req.method === 'PATCH') {
    const id = Number(pathname.split('/').pop())
    const payload = await readJsonBody(req).catch(() => ({}))
    const reminder = store.reminders.find((item) => item.id === id)
    if (!reminder) {
      sendJson(res, 404, { detail: 'Reminder not found' })
      return
    }
    Object.assign(reminder, payload)
    saveStore()
    broadcast({ type: 'reminders_updated' })
    sendJson(res, 200, reminder)
    return
  }

  if (pathname.startsWith('/reminders/') && req.method === 'DELETE') {
    const id = Number(pathname.split('/').pop())
    store.reminders = store.reminders.filter((item) => item.id !== id)
    saveStore()
    broadcast({ type: 'reminders_updated' })
    sendJson(res, 200, { ok: true })
    return
  }

  sendJson(res, 404, { detail: 'Not found' })
}

const server = http.createServer((req, res) => {
  handleRequest(req, res).catch((error) => {
    console.error('[NodeCore] Unexpected request error:', error)
    sendJson(res, 500, { detail: 'Internal server error' })
  })
})

if (WebSocketServer) {
  wss = new WebSocketServer({ noServer: true })

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url || '/', `http://${HOST}:${PORT}`)
    if (url.pathname !== '/ws') {
      socket.destroy()
      return
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req)
    })
  })

  wss.on('connection', (ws) => {
    wsClients.add(ws)
    sendResourceUsage()
    emitInitProgress()

    ws.on('message', (raw) => {
      let parsed
      try {
        parsed = JSON.parse(String(raw))
      } catch {
        return
      }
      if (parsed?.type === 'session_sync') {
        ws.send(JSON.stringify({ type: 'session_sync', ok: true }))
      }
    })

    ws.on('close', () => {
      wsClients.delete(ws)
    })
  })
}

setInterval(sendResourceUsage, 2500)
setInterval(() => {
  cleanupEmbeddingCache()
  const tier = store.settings.ai_tier || 'pro'
  if (tier !== 'ultra') return
  syncSkillAndToolIndexes(false).catch(() => {})
  syncNoteIndex(false).catch(() => {})
}, 30000)

setInterval(() => {
  const now = Date.now()
  let touched = false

  for (const reminder of store.reminders) {
    if (!reminder.is_active) continue
    if (parseTime(reminder.scheduled_time) > now) continue

    broadcast({
      type: 'reminder_trigger',
      data: {
        id: reminder.id,
        title: reminder.title,
        content: reminder.content
      }
    })

    advanceReminder(reminder)
    touched = true
  }

  if (touched) {
    saveStore()
    broadcast({ type: 'reminders_updated' })
  }
}, 1000)

server.on('error', (error) => {
  const message =
    error && error.code === 'EADDRINUSE'
      ? `Port ${PORT} is already in use (${HOST}:${PORT})`
      : error?.message || 'Unexpected node-core server error'

  console.error(`[NodeCore] ${message}`)
  if (typeof process.send === 'function') {
    process.send({ type: 'node-core-error', error: message })
  }
  process.exit(1)
})

server.listen(PORT, HOST, () => {
  const msg = `Node core listening on http://${HOST}:${PORT}`
  console.log(msg)

  setInitStatus('loading', 'Starting local services...', 60, null)

  const autoStartLlm = store.settings.auto_start_llm !== false
  const announceReady = async () => {
    if (autoStartLlm) {
      const tierName = store.settings.ai_tier
      if (!tierName) {
        console.info('[NodeCore] Skipping auto-start LLM: AI Tier not selected yet (onboarding).')
        setInitStatus('ready', 'Aguardando seleção do modo...', 100, null)
        return
      }

      setInitStatus('loading', `Loading local model (${tierName.toUpperCase()})...`, 75, null)
      try {
        // On startup, allow model download so auto-start can reach ready state.
        await ensureLlamaReady(false, true)
      } catch (error) {
        console.error('[NodeCore] auto-start llama failed:', error)
      }
    } else {
      setInitStatus('ready', 'System ready.', 100, null)
    }

    if (typeof process.send === 'function') {
      process.send({
        type: 'node-core-ready',
        brainReady: autoStartLlm ? llamaState.ready : true,
        isLoading: llamaState.starting || modelDownloadState.in_progress
      })
    }
  }

  if (typeof process.send === 'function') {
    process.send({ type: 'node-core-log', message: msg })
  }
  void announceReady()

  void syncWakeWordState('startup')
  if ((store.settings.ai_tier || 'pro') === 'ultra') {
    ensureEmbeddingReady()
      .then((ok) => {
        if (ok) {
          syncSkillAndToolIndexes(true).catch(() => {})
          syncNoteIndex(true).catch(() => {})
        }
      })
      .catch(() => {})
  }
})

async function shutdownAll() {
  try {
    for (const controller of activeChatControllers) {
      controller.abort()
    }
    await stopEmbeddingServer()
    await stopLlamaServer()
  } finally {
    server.close(() => process.exit(0))
  }
}

process.on('SIGTERM', () => {
  shutdownAll().catch(() => process.exit(0))
})

process.on('SIGINT', () => {
  shutdownAll().catch(() => process.exit(0))
})
