const http = require('node:http')
const { URL } = require('node:url')
const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')
const crypto = require('node:crypto')
const { spawn } = require('node:child_process')

const HOST = process.env.MOMAI_NODE_CORE_HOST || '127.0.0.1'
const PORT = Number(process.env.MOMAI_NODE_CORE_PORT || 8000)
const DATA_DIR = process.env.MOMAI_NODE_CORE_DATA_DIR || path.join(process.cwd(), 'data')
const STORE_FILE = path.join(DATA_DIR, 'node-core-store.json')
const CORE_PATH = process.env.MOMAI_CORE_PATH || path.resolve(__dirname, '..', '..', 'core')
const TIERS_CONFIG_PATH = path.join(CORE_PATH, 'ai_tiers.json')
const MODELS_DIR = path.join(CORE_PATH, 'models')

const PYTHON_HOST = process.env.MOMAI_PYTHON_SIDECAR_HOST || '127.0.0.1'
const PYTHON_PORT = Number(process.env.MOMAI_PYTHON_SIDECAR_PORT || 8001)
const PYTHON_BASE_URL = `http://${PYTHON_HOST}:${PYTHON_PORT}`

const LLAMA_HOST = '127.0.0.1'
const LLAMA_PORT = Number(process.env.MOMAI_LLAMA_PORT || 8080)
const LLAMA_BASE_URL = `http://${LLAMA_HOST}:${LLAMA_PORT}`

let WebSocketServer = null
try {
  WebSocketServer = require('ws').WebSocketServer
} catch {
  console.warn('[NodeCore] ws module not available, websocket features disabled.')
}

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
}

const DEFAULT_TIERS = {
  lite: {
    file: 'Qwen3.5-0.8B-Q4_K_M.gguf',
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
    enable_vision: false,
    ctx_size: 8192,
    request_ctx_size: 8192,
    gpu_layers: 99,
    temperature: 0.7,
    top_p: 0.8,
    top_k: 20,
    presence_penalty: 0.6,
    repetition_penalty: 1.05,
    max_tokens: 512
  }
}

function loadTierConfig() {
  if (!fs.existsSync(TIERS_CONFIG_PATH)) return DEFAULT_TIERS
  try {
    const parsed = JSON.parse(fs.readFileSync(TIERS_CONFIG_PATH, 'utf8'))
    return { ...DEFAULT_TIERS, ...parsed }
  } catch (error) {
    console.error('[NodeCore] Failed to parse ai_tiers.json:', error)
    return DEFAULT_TIERS
  }
}

const tiersConfig = loadTierConfig()

const store = loadStore()

function applyPerformanceProfile() {
  let changed = false

  if (store.settings.local_backend === 'auto') {
    store.settings.local_backend = 'vulkan'
    changed = true
  }

  if (changed) {
    saveStore()
  }
}

applyPerformanceProfile()

function defaultStore() {
  const now = new Date().toISOString()
  return {
    settings: {
      user_name: 'Senhor',
      assistant_persona:
        'You are MomAI, a professional and efficient local AI assistant created by Wesley Developer Studios.',
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
      ai_tier: 'pro',
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
    graph_data: extras.graph_data || null
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

function pickBackend(preferred) {
  const exeName = process.platform === 'win32' ? 'llama-server.exe' : 'llama-server'
  const available = ['vulkan', 'cuda', 'cpu'].filter((backend) =>
    fs.existsSync(path.join(CORE_PATH, 'bin', backend, exeName))
  )

  if (preferred && preferred !== 'auto' && available.includes(preferred)) return preferred
  if (preferred && preferred !== 'auto' && !available.includes(preferred) && available.length) {
    return available[0]
  }
  if (available.includes('vulkan')) return 'vulkan'
  if (available.includes('cuda')) return 'cuda'
  if (available.includes('cpu')) return 'cpu'
  return null
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

const llamaState = {
  process: null,
  ready: false,
  starting: false,
  startingPromise: null,
  lastError: null,
  backend: null,
  modelPath: null,
  configuredModelFile: null,
  usingFallbackModel: false,
  contextTotalTokens: 8192,
  currentTier: null
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
  const resp = await fetch(`${LLAMA_BASE_URL}/health`, { method: 'GET' })
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

async function ensureLlamaReady(forceRestart = false) {
  if (forceRestart) await stopLlamaServer()

  if (llamaState.ready) return true
  if (llamaState.startingPromise) return llamaState.startingPromise

  const preferred = store.settings.local_backend || 'auto'
  const backend = pickBackend(preferred)
  const tierName = store.settings.ai_tier || 'pro'
  const tierConfig = tiersConfig[tierName] || tiersConfig.pro || DEFAULT_TIERS.pro

  if (!backend) {
    const msg = 'llama-server binary not found (bin/<backend>/llama-server)'
    llamaState.lastError = msg
    setInitStatus('error', 'Local model engine missing', 100, msg)
    return false
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
  const exeName = process.platform === 'win32' ? 'llama-server.exe' : 'llama-server'
  const exePath = path.join(CORE_PATH, 'bin', backend, exeName)
  const exeDir = path.dirname(exePath)

  const parallelSlots = 2
  const requestCtx = Number(tierConfig.request_ctx_size || tierConfig.ctx_size || 8192)
  const ctxBase = Math.max(2048, Math.min(requestCtx, 8192))
  const totalCtx = ctxBase * parallelSlots

  const args = [
    '-m',
    modelPath,
    '--port',
    String(LLAMA_PORT),
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
  llamaState.modelPath = modelPath
  llamaState.configuredModelFile = configuredModelFile
  llamaState.usingFallbackModel = usingFallbackModel
  llamaState.currentTier = tierName

  setInitStatus('loading', `Loading local model (${tierName.toUpperCase()})...`, 80, null)

  llamaState.startingPromise = new Promise((resolve) => {
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
      llamaState.lastError = error?.message || 'Failed to spawn llama-server'
      llamaState.starting = false
      llamaState.startingPromise = null
      setInitStatus('error', 'Failed to initialize local model', 100, llamaState.lastError)
      resolve(false)
      return
    }

    llamaState.process = child

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

    child.on('exit', (code, signal) => {
      const endedWhileStarting = llamaState.starting
      llamaState.ready = false
      llamaState.starting = false
      llamaState.startingPromise = null
      llamaState.process = null

      if (endedWhileStarting) {
        const msg = `llama-server exited during startup (code=${code}, signal=${signal})`
        llamaState.lastError = msg
        setInitStatus('error', 'Failed to initialize local model', 100, msg)
      }
    })

    const startedAt = Date.now()
    const timeoutMs = 70000

    ;(async () => {
      while (Date.now() - startedAt < timeoutMs) {
        if (!llamaState.process || llamaState.process.exitCode !== null) {
          resolve(false)
          return
        }

        try {
          const ok = await checkLlamaHealth()
          if (ok) {
            llamaState.ready = true
            llamaState.starting = false
            llamaState.startingPromise = null
            setInitStatus('ready', 'System ready.', 100, null)
            resolve(true)
            return
          }
        } catch {}

        await new Promise((r) => setTimeout(r, 300))
      }

      llamaState.lastError = 'llama-server healthcheck timeout'
      await stopLlamaServer()
      setInitStatus('error', 'Local model startup timeout', 100, llamaState.lastError)
      resolve(false)
    })().catch(async (error) => {
      llamaState.lastError = error?.message || 'Unexpected llama startup failure'
      await stopLlamaServer()
      setInitStatus('error', 'Local model startup failed', 100, llamaState.lastError)
      resolve(false)
    })
  })

  return llamaState.startingPromise
}

function splitTokens(text) {
  return text.match(/\S+\s*/g) || [text]
}

function generateFallbackReply(content, memoryContext, reason) {
  const trimmed = String(content || '').trim()
  if (!trimmed) return 'Pode me mandar uma pergunta para eu te ajudar.'

  if (/^(oi|ol[aá]|bom dia|boa tarde|boa noite|hello|hi)\b/i.test(trimmed)) {
    return 'Oi! Estou online no novo core Node. Como posso ajudar agora?'
  }

  const summary = trimmed.length > 320 ? `${trimmed.slice(0, 320)}...` : trimmed
  const hasMemory = typeof memoryContext === 'string' && memoryContext.trim().length > 0

  if (reason) {
    return `Modelo local indisponível no momento (${reason}). Resposta de fallback para: "${summary}".`
  }
  if (hasMemory) {
    return `Entendi seu pedido: "${summary}". Considerei também o contexto das suas notas locais para responder.`
  }
  return `Entendi seu pedido: "${summary}". Vou seguir com isso.`
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

let stopGenerationRequested = false
const activeChatControllers = new Set()

async function streamFallbackResponse(req, res, content, threadId, memoryContext, memorySources, reason = null) {
  appendMessage(threadId, 'user', content, { sources: memorySources })
  const reply = generateFallbackReply(content, memoryContext, reason)
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
    const delta = choice?.delta?.content
    const full = choice?.message?.content
    const token = typeof delta === 'string' ? delta : typeof full === 'string' ? full : ''
    if (!token) return { type: 'skip' }
    return { type: 'token', token }
  } catch {
    return { type: 'skip' }
  }
}

async function streamLlamaChat(req, res, payload) {
  const content = String(payload.content || '')
  const threadId = String(payload.thread_id || 'default')
  const memoryContext = payload.memory_context
  const memorySources = Array.isArray(payload.memory_sources) ? payload.memory_sources : undefined

  const ready = await ensureLlamaReady(false)
  if (!ready) {
    await streamFallbackResponse(
      req,
      res,
      content,
      threadId,
      memoryContext,
      memorySources,
      llamaState.lastError || 'llama unavailable'
    )
    return
  }

  appendMessage(threadId, 'user', content, { sources: memorySources })

  sendSseHeaders(res)
  writeSse(res, { status: 'thinking' })

  const history = getThreadMessages(threadId)
    .slice(-8)
    .map((msg) => ({
      role: msg.role === 'assistant' ? 'assistant' : 'user',
      content: String(msg.content || '')
    }))

  const systemMessages = [
    {
      role: 'system',
      content:
        store.settings.assistant_persona ||
        'You are MomAI, a direct and useful local assistant. Respond in the user language.'
    }
  ]

  if (typeof memoryContext === 'string' && memoryContext.trim()) {
    systemMessages.push({ role: 'system', content: memoryContext })
  }

  const tierName = store.settings.ai_tier || 'pro'
  const tier = tiersConfig[tierName] || tiersConfig.pro || DEFAULT_TIERS.pro

  const controller = new AbortController()
  activeChatControllers.add(controller)
  stopGenerationRequested = false

  let closed = false
  req.on('close', () => {
    closed = true
    controller.abort()
  })

  let assembled = ''

  try {
    writeSse(res, { status: 'responding' })

    const llamaResp = await fetch(`${LLAMA_BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: 'gpt-4o',
        stream: true,
        temperature: Number.isFinite(tier.temperature) ? tier.temperature : 0.7,
        top_p: Number.isFinite(tier.top_p) ? tier.top_p : 1,
        max_tokens: Number.isFinite(tier.max_tokens) ? tier.max_tokens : 320,
        messages: [...systemMessages, ...history]
      })
    })

    if (!llamaResp.ok || !llamaResp.body) {
      const txt = await llamaResp.text().catch(() => '')
      throw new Error(`llama HTTP ${llamaResp.status}: ${txt.slice(0, 240)}`)
    }

    const reader = llamaResp.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

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
        if (parsed.type === 'token') {
          assembled += parsed.token
          writeSse(res, { token: parsed.token })
        }
      }
    }

    appendMessage(threadId, 'assistant', assembled.trim() || 'Interrompido.')
    writeSse(res, { done: true })
    res.end()
  } catch (error) {
    const fallbackMsg = generateFallbackReply(content, memoryContext, error?.message || 'llama failure')
    const tail = fallbackMsg.slice(assembled.length)
    if (tail) {
      for (const token of splitTokens(tail)) {
        assembled += token
        writeSse(res, { token })
      }
    }

    appendMessage(threadId, 'assistant', assembled.trim() || fallbackMsg)
    writeSse(res, { done: true })
    res.end()
  } finally {
    activeChatControllers.delete(controller)
  }
}

async function maybeRestartLlamaOnTierChange(prevTier, nextTier, prevBackend, nextBackend) {
  if (prevTier === nextTier && prevBackend === nextBackend) return
  await ensureLlamaReady(true)
}

function getSetupInfo() {
  const exeName = process.platform === 'win32' ? 'llama-server.exe' : 'llama-server'
  const backend = pickBackend(store.settings.local_backend || 'auto')
  const localInstalled = !!backend && fs.existsSync(path.join(CORE_PATH, 'bin', backend, exeName))
  return {
    local_installed: localInstalled,
    installed_version: process.env.npm_package_version || '1.0.0',
    latest_version: process.env.npm_package_version || '1.0.0'
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
      is_loading: llamaState.starting,
      setup: getSetupInfo(),
      ai_tier: store.settings.ai_tier || 'pro',
      auto_start_llm: autoStart,
      llama_runtime: {
        current_tier: llamaState.currentTier,
        configured_model_file: llamaState.configuredModelFile,
        loaded_model_path: llamaState.modelPath,
        loaded_model_file: llamaState.modelPath ? path.basename(llamaState.modelPath) : null,
        using_fallback_model: llamaState.usingFallbackModel
      },
      tiers_config: tiersConfig
    })
    return
  }

  if (pathname === '/init-status' && req.method === 'GET') {
    sendJson(res, 200, store.init_status)
    return
  }

  if (pathname === '/setup/status' && req.method === 'GET') {
    const setup = getSetupInfo()
    sendJson(res, 200, {
      status: 'ok',
      engine_installed: setup.local_installed,
      installed_version: setup.installed_version,
      latest_version: setup.latest_version,
      ai_tier: store.settings.ai_tier || 'pro',
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
    const prevBackend = store.settings.local_backend || 'auto'

    store.mode = 'local'
    store.settings.ai_tier = requestedTier

    if (requestedTier === 'lite') {
      store.settings.tts_enabled = false
      store.settings.wake_word_enabled = false
    } else if (requestedTier !== 'ultra') {
      store.settings.wake_word_enabled = false
    }

    saveStore()
    await maybeRestartLlamaOnTierChange(
      prevTier,
      requestedTier,
      prevBackend,
      store.settings.local_backend || 'auto'
    )

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
    saveStore()

    broadcast({ type: 'model_changed', data: { new_mode: 'local' } })

    await maybeRestartLlamaOnTierChange(prevTier, mode, store.settings.local_backend, store.settings.local_backend)

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
    sendJson(res, 200, { status: 'ok', call_mode: store.call_mode })
    return
  }

  if (pathname === '/mode/call-mode/status' && req.method === 'GET') {
    sendJson(res, 200, { call_mode: Boolean(store.call_mode) })
    return
  }

  if (pathname === '/settings' && req.method === 'GET') {
    sendJson(res, 200, store.settings)
    return
  }

  if (pathname === '/settings' && req.method === 'PATCH') {
    const payload = await readJsonBody(req).catch(() => ({}))
    const prevTier = store.settings.ai_tier || 'pro'
    const prevBackend = store.settings.local_backend || 'auto'

    if (payload.ai_tier && !isValidTier(payload.ai_tier)) {
      sendJson(res, 400, { status: 'error', message: 'Invalid ai_tier. Use lite, pro or ultra.' })
      return
    }

    store.settings = { ...store.settings, ...payload }

    if (store.settings.ai_tier === 'lite') {
      store.settings.tts_enabled = false
      store.settings.wake_word_enabled = false
    } else if (store.settings.ai_tier !== 'ultra') {
      store.settings.wake_word_enabled = false
    }

    if (payload.ai_tier) store.mode = 'local'
    saveStore()

    await maybeRestartLlamaOnTierChange(
      prevTier,
      store.settings.ai_tier || 'pro',
      prevBackend,
      store.settings.local_backend || 'auto'
    )

    sendJson(res, 200, store.settings)
    return
  }

  if (pathname === '/chat/stream' && req.method === 'POST') {
    const payload = await readJsonBody(req).catch(() => ({}))
    await streamLlamaChat(req, res, payload)
    return
  }

  if (pathname === '/chat/stop' && req.method === 'POST') {
    stopGenerationRequested = true
    for (const controller of activeChatControllers) {
      controller.abort()
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
    sendJson(res, 200, store.extensions)
    return
  }

  if (pathname === '/extensions/registry' && req.method === 'GET') {
    sendJson(res, 200, [])
    return
  }

  if (pathname === '/extensions/install' && req.method === 'POST') {
    const payload = await readJsonBody(req).catch(() => ({}))
    const id = String(payload.id || crypto.randomUUID())
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
    sendJson(res, 200, { ok: true })
    return
  }

  if (pathname === '/extensions/toggle' && req.method === 'POST') {
    const payload = await readJsonBody(req).catch(() => ({}))
    const found = store.extensions.find((item) => item.id === payload.id)
    if (found) found.enabled = Boolean(payload.enabled)
    saveStore()
    sendJson(res, 200, { ok: true })
    return
  }

  if (pathname === '/extensions/uninstall' && req.method === 'POST') {
    const payload = await readJsonBody(req).catch(() => ({}))
    store.extensions = store.extensions.filter((item) => item.id !== payload.id)
    saveStore()
    sendJson(res, 200, { ok: true })
    return
  }

  if (pathname.startsWith('/extensions/') && pathname.endsWith('/action') && req.method === 'POST') {
    sendJson(res, 200, { ok: true, result: null })
    return
  }

  if (pathname === '/extensions/hardware-stats' && req.method === 'GET') {
    const mem = process.memoryUsage()
    sendJson(res, 200, {
      cpu_usage: 0,
      ram_usage: Math.round((mem.rss / os.totalmem()) * 100),
      active_processes: llamaState.process ? 2 : 1,
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

server.listen(PORT, HOST, () => {
  const msg = `Node core listening on http://${HOST}:${PORT}`
  console.log(msg)
  if (typeof process.send === 'function') {
    process.send({ type: 'node-core-log', message: msg })
    process.send({ type: 'node-core-ready' })
  }
  if (store.settings.auto_start_llm !== false) {
    ensureLlamaReady(false).catch((error) => {
      console.error('[NodeCore] auto-start llama failed:', error)
    })
  }
})

async function shutdownAll() {
  try {
    for (const controller of activeChatControllers) {
      controller.abort()
    }
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
