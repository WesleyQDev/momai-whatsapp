// MomAI Node Core - Modular Composer
// This file composes all modules together to provide the same API as the original monolithic node-core.js

require('dotenv').config({ path: require('path').resolve(__dirname, '..', '..', '.env') })

const http = require('node:http')
const path = require('node:path')
const { execSync } = require('node:child_process')

// Force UTF-8 encoding for Windows console
if (process.platform === 'win32') {
  try {
    execSync('chcp 65001', { stdio: 'ignore' })
  } catch {}
  if (process.stdout) process.stdout.setDefaultEncoding('utf8')
  if (process.stderr) process.stderr.setDefaultEncoding('utf8')
}

// ============================================
// Foundation modules
// ============================================
const constants = require('./config/constants')
const { loadTierConfig } = require('./config/tiers')
const { log, debug, info, warn, error } = require('./infrastructure/logger')
const {
  sendJson,
  sendNoContent,
  sendSseHeaders,
  writeSse,
  readJsonBody
} = require('./infrastructure/http-helpers')
const {
  managedLlamaPids,
  portReservations,
  acquireSpawnLock,
  releaseSpawnLock,
  registerManagedLlama,
  killOrphanLlamaServers
} = require('./infrastructure/process-manager')
const {
  store,
  saveStore,
  saveStoreNow,
  appendMessage,
  getThreadMessages,
  listSessions
} = require('./infrastructure/store')

// Initialize registries (actual loading happens in initializeRegistries)
const { DATA_DIR, PROMPTS_DIR } = constants
const builtinSkillsDir = path.resolve(__dirname, '..', 'skills', 'core')
let skillRegistry = null
let promptRegistry = null

async function initializeRegistries() {
  try {
    const { createSkillRegistry } = require('../skills/registry')
    skillRegistry = createSkillRegistry({ dataDir: DATA_DIR, builtinSkillsDir })
    await skillRegistry.initialize()
  } catch (e) {
    info('[core] Skill registry not available or failed to initialize:', e.message)
  }

  try {
    const { createPromptRegistry } = require('../prompt-registry')
    promptRegistry = createPromptRegistry({ promptsDir: PROMPTS_DIR })
  } catch (e) {
    info('[core] Prompt registry not available:', e.message)
  }
}

// ============================================
// Domain modules
// ============================================
const {
  detectLanguageTag,
  normalizeLanguageTag,
  resolveResponseLanguage,
  LATIN_LANGUAGE_HINTS
} = require('./domain/language-detector')
const { buildLocalizedFallbackReply, generateFallbackReply } = require('./domain/prompt-builder')
const { saveMemoryNoteFromContent, ensureNotesIndexExists } = require('./domain/note-manager')

// ============================================
// Service modules
// ============================================
const shared = require('./services/shared-state')
const llamaManager = require('./services/llama-manager')
const embeddingManager = require('./services/embedding-manager')
const semanticEngine = require('./services/semantic-engine')
const modelDownloader = require('./services/model-downloader')
const reminderService = require('./services/reminder-service')
const skillOrchestrator = require('./services/skill-orchestrator')
const ttsService = require('./services/tts-service')
const chatService = require('./services/chat-service')

// ============================================
// API modules
// ============================================
const { createRouter } = require('./api/router')
const websocket = require('./api/websocket')

// ============================================
// Re-export everything for backward compatibility
// ============================================
module.exports = {
  // Foundation
  ...constants,
  log,
  debug,
  info,
  warn,
  error,
  sendJson,
  sendNoContent,
  sendSseHeaders,
  writeSse,
  readJsonBody,
  managedLlamaPids,
  portReservations,
  acquireSpawnLock,
  releaseSpawnLock,
  registerManagedLlama,
  killOrphanLlamaServers,

  // Domain
  detectLanguageTag,
  normalizeLanguageTag,
  resolveResponseLanguage,
  LATIN_LANGUAGE_HINTS,
  buildLocalizedFallbackReply,
  generateFallbackReply,
  saveMemoryNoteFromContent,
  ensureNotesIndexExists,

  // Services
  ...shared,
  ...llamaManager,
  ...embeddingManager,
  ...semanticEngine,
  ...modelDownloader,
  ...reminderService,
  ...skillOrchestrator,
  ...ttsService,
  ...chatService,

  // API
  createRouter,
  ...websocket
}

// ============================================
// Helper functions for route handlers
// ============================================
const os = require('node:os')

function isValidTier(tier) {
  return tier === 'lite' || tier === 'pro' || tier === 'ultra'
}

function buildSemanticRuntimeStatus() {
  const { semanticState } = require('./services/shared-state')
  const { percentile } = require('./utils/stats')
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

function getSetupInfo() {
  const {
    hasBackendBinary,
    normalizeBackendMode,
    pickBackend
  } = require('./services/llama-manager')
  const { llamaState } = require('./services/shared-state')
  const { store } = require('./infrastructure/store')
  const installedBackends = ['cuda', 'vulkan', 'cpu'].filter((backend) => hasBackendBinary(backend))
  const localInstalled =
    hasBackendBinary('cuda') || hasBackendBinary('vulkan') || hasBackendBinary('cpu')
  const cpuName = os.cpus?.()?.[0]?.model || 'Unknown CPU'
  const totalRamGb = Math.round((os.totalmem() / 1024 / 1024 / 1024) * 10) / 10
  const totalVramGb =
    llamaState.vramTotalMb && llamaState.vramTotalMb > 0
      ? Math.round((Number(llamaState.vramTotalMb) / 1024) * 10) / 10
      : 0
  const recommendedBuild = installedBackends.includes('cuda')
    ? 'cuda'
    : installedBackends.includes('vulkan')
      ? 'vulkan'
      : 'cpu'
  const detectedHardware = installedBackends.includes('cuda')
    ? 'GPU NVIDIA detectada (CUDA)'
    : installedBackends.includes('vulkan')
      ? 'GPU com suporte a Vulkan detectada'
      : 'GPU dedicada não detectada (modo CPU)'
  const preferred = normalizeBackendMode(store.settings.local_backend || 'auto')
  const currentLocalBackend = llamaState.backend || pickBackend(preferred) || 'cpu'
  store.settings.hardware_total_ram_gb = totalRamGb
  store.settings.hardware_total_vram_gb = totalVramGb
  return {
    local_installed: localInstalled,
    installed_version: process.env.npm_package_version || '1.0.0',
    latest_version: process.env.npm_package_version || '1.0.0',
    cpu_name: cpuName,
    detected_hardware: detectedHardware,
    recommended_build: recommendedBuild,
    installed_backends: installedBackends,
    current_local_backend: currentLocalBackend,
    os_name: `${os.platform()} ${os.release()}`,
    total_ram_gb: totalRamGb,
    total_vram_gb: totalVramGb
  }
}

async function maybeRestartLlamaOnTierChange(prevTier, nextTier, prevBackend, nextBackend) {
  const { ensureTierModelAvailable } = require('./services/model-downloader')
  const { stopEmbeddingServer, ensureEmbeddingReady } = require('./services/embedding-manager')
  const { syncSkillAndToolIndexes } = require('./services/semantic-engine')
  const { ensureLlamaReady } = require('./services/llama-manager')
  const { llamaState, semanticState } = require('./services/shared-state')
  const { DEFAULT_TIERS } = require('./config/tiers')
  const tiersConfig = require('./services/llama-manager').tiersConfig

  if (prevTier === nextTier && prevBackend === nextBackend) {
    const tierConfig = tiersConfig[nextTier] || tiersConfig.pro || DEFAULT_TIERS.pro
    const modelReady = await ensureTierModelAvailable(nextTier, tierConfig)
    if (!modelReady.ok) {
      llamaState.lastError = modelReady.reason || `Failed to prepare model for tier ${nextTier}`
      return false
    }
    if (!llamaState.ready && !llamaState.starting) {
      return ensureLlamaReady(false)
    }
    return true
  }
  await stopEmbeddingServer()
  if (nextTier !== 'ultra') {
    semanticState.enabled = false
    semanticState.ready = false
  }
  const llamaReady = await ensureLlamaReady(true)
  if (nextTier === 'ultra') {
    ensureEmbeddingReady()
      .then((ok) => {
        if (ok) {
          setTimeout(() => {
            syncSkillAndToolIndexes(false).catch((err) =>
              debug('[background]', err?.message || err)
            )
          }, 3000)
        }
      })
      .catch((err) => debug('[background]', err?.message || err))
  }
  return llamaReady
}

async function proxyToPython(req, res, pathname) {
  const { ensurePython } = require('./services/tts-service')
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

// ============================================
// Start server function (called by node-core.js wrapper)
// ============================================
async function startServer() {
  const { HOST, PORT, DATA_DIR } = constants

  // Ensure data directory exists
  const fs = require('node:fs')
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true })
  }

  // Initialize registries
  await initializeRegistries()

  // Initialize shared state
  const _skillRegistry = skillRegistry || shared.skillRegistry
  const _promptRegistry = promptRegistry || shared.promptRegistry
  shared.skillRegistry = _skillRegistry || {
    listSkills: () => [],
    getSkill: () => null,
    getAll: () => [],
    refresh: () => {},
    loadExtensions: () => {},
    extensionsDir: path.join(DATA_DIR, 'extensions')
  }
  shared.promptRegistry = _promptRegistry || {
    getRuntimeStatus: () => ({}),
    getDefaults: () => ({})
  }

  // Create router context with all dependencies
  const context = {
    HOST,
    PORT,
    store,
    llamaState: llamaManager.llamaState || {},
    semanticState: embeddingManager.semanticState || {},
    modelDownloadState: modelDownloader.modelDownloadState || {},
    skillRegistry: _skillRegistry || {
      listSkills: () => [],
      getSkill: () => null,
      getAll: () => [],
      refresh: () => {},
      loadExtensions: () => {},
      extensionsDir: path.join(DATA_DIR, 'extensions')
    },
    promptRegistry: _promptRegistry || { getRuntimeStatus: () => ({}), getDefaults: () => ({}) },
    tiersConfig: llamaManager.tiersConfig,
    sendJson,
    sendNoContent,
    readJsonBody,
    broadcast: () => {},
    sendResourceUsage: () => {},
    emitInitProgress: () => {},
    cleanupEmbeddingCache: embeddingManager.cleanupEmbeddingCache || (() => {}),
    syncSkillAndToolIndexes: semanticEngine.syncSkillAndToolIndexes || (() => {}),
    syncNoteIndex: semanticEngine.syncNoteIndex || (() => {}),
    parseTime: reminderService.parseTime || ((v) => new Date(v).getTime()),
    advanceReminder: reminderService.advanceReminder || (() => {}),
    normalizeReminder: reminderService.normalizeReminder || ((r) => r),
    saveStore: () => saveStore(store),
    saveStoreNow: () => saveStoreNow(store),
    ensureDir: (dirPath) => {
      const fs = require('node:fs')
      if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true })
    },
    getThreadMessages: (threadId) => getThreadMessages(store, threadId),
    listSessions: () => listSessions(store),
    runVoiceCommand: chatService.runVoiceCommand || (() => {}),
    triggerAutoTts: ttsService.triggerAutoTts || (() => {}),
    get stopVoiceRequested() {
      return chatService.stopVoiceRequested
    },
    set stopVoiceRequested(v) {
      chatService.stopVoiceRequested = v
    },
    get stopGenerationRequested() {
      return chatService.stopGenerationRequested
    },
    set stopGenerationRequested(v) {
      chatService.stopGenerationRequested = v
    },
    activeChatControllers: chatService.activeChatControllers || new Set(),
    setInitStatus: llamaManager.setInitStatus || (() => {}),
    ensureLlamaReady: llamaManager.ensureLlamaReady || (() => Promise.resolve(false)),
    stopLlamaServer: llamaManager.stopLlamaServer || (() => Promise.resolve()),
    syncWakeWordState: ttsService.syncWakeWordState || (() => Promise.resolve()),
    ensureEmbeddingReady: embeddingManager.ensureEmbeddingReady || (() => Promise.resolve(false)),
    stopEmbeddingServer: embeddingManager.stopEmbeddingServer || (() => Promise.resolve()),
    ensurePython: ttsService.ensurePython || (() => Promise.resolve('')),
    syncPythonCallModeState: ttsService.syncPythonCallModeState || (() => Promise.resolve()),
    buildExtensionsPayload: skillOrchestrator.buildExtensionsPayload || (() => []),
    streamLlamaChat: chatService.streamLlamaChat || (() => Promise.resolve()),
    isValidTier,
    normalizeBackendMode: llamaManager.normalizeBackendMode || ((v) => v),
    normalizeContextWindowMode: llamaManager.normalizeContextWindowMode || ((v) => v),
    clampContextTokens: llamaManager.clampContextTokens || ((v) => v),
    maybeRestartLlamaOnTierChange,
    getSetupInfo,
    buildSemanticRuntimeStatus,
    proxyToPython,
    sendVoiceSidecarFallback,
    connectPythonSidecar: () => {},
    info,
    log,
    error
  }

  // Import route handlers
  const { createChatRoutes } = require('./api/routes/chat.routes')
  const { createSettingsRoutes } = require('./api/routes/settings.routes')
  const { createExtensionsRoutes } = require('./api/routes/extensions.routes')
  const { createRemindersRoutes } = require('./api/routes/reminders.routes')
  const { createStatusRoutes } = require('./api/routes/status.routes')
  const { createSystemRoutes } = require('./api/routes/system.routes')
  const { createSkillsRoutes } = require('./api/routes/skills.routes')

  // Inline observability route
  async function handleObservabilityRoute(req, res, pathname) {
    if (pathname === '/observability/traces' && req.method === 'GET') {
      const shared = require('./services/shared-state')
      const buffer = shared.observabilityBuffer || []
      info(`[OBS] GET /observability/traces returning ${buffer.length} traces`)
      context.sendJson(res, 200, { traces: buffer })
      return true
    }
    return false
  }

  // Compose router
  const { handleRequest, server, shutdownAll } = createRouter(context, [
    handleObservabilityRoute,
    createChatRoutes(context),
    createSettingsRoutes(context),
    createExtensionsRoutes(context),
    createRemindersRoutes(context),
    createStatusRoutes(context),
    createSystemRoutes(context),
    createSkillsRoutes(context)
  ])

  // Setup WebSocket and update context with real functions
  if (websocket.setupWebSocket) {
    const wsResult = websocket.setupWebSocket({
      server,
      store,
      llamaState: llamaManager.llamaState || {},
      info,
      HOST,
      PORT
    })
    if (wsResult) {
      context.broadcast = wsResult.broadcast
      context.sendResourceUsage = wsResult.sendResourceUsage
      context.emitInitProgress = wsResult.emitInitProgress
      context.connectPythonSidecar = wsResult.connectPythonSidecar
      // Inject broadcast into shared-state so tts-service and chat-service can use it
      shared.broadcast = wsResult.broadcast
    }
  }

  // Start server
  server.listen(PORT, HOST, () => {
    if (global._nodeCoreListeningLogged) return
    global._nodeCoreListeningLogged = true

    const msg = `Node core (modular) listening on http://${HOST}:${PORT}`
    log(msg)
    info('[core] Modular node-core initialized successfully')

    llamaManager.setInitStatus('loading', 'Starting local services...', 35, null)

    const autoStartLlm = store.settings.auto_start_llm !== false
    const announceReady = async () => {
      if (autoStartLlm) {
        const tierName = store.settings.ai_tier
        if (!tierName) {
          info('[NodeCore] Skipping auto-start LLM: AI Tier not selected yet (onboarding).')
          llamaManager.setInitStatus('ready', 'Aguardando seleção do modo...', 40, null)
        } else {
          llamaManager.setInitStatus(
            'loading',
            `Loading local model (${tierName.toUpperCase()})...`,
            75,
            null
          )
          try {
            await llamaManager.ensureLlamaReady(false, true)
          } catch (err) {
            error('[NodeCore] auto-start llama failed:', err)
          }
        }
      } else {
        llamaManager.setInitStatus('ready', 'System ready.', 100, null)
      }

      if (typeof process.send === 'function') {
        process.send({
          type: 'node-core-ready',
          brainReady: autoStartLlm ? llamaManager.llamaState.ready : true,
          isLoading:
            llamaManager.llamaState.starting || modelDownloader.modelDownloadState.in_progress
        })
      }
    }

    if (typeof process.send === 'function') {
      process.send({ type: 'node-core-log', message: msg })
    }
    void announceReady()

    const startupTier = store.settings.ai_tier || 'pro'
    if (startupTier === 'ultra') {
      void ttsService.syncWakeWordState('startup')
      embeddingManager
        .ensureEmbeddingReady()
        .then((ok) => {
          if (ok) {
            setTimeout(() => {
              semanticEngine
                .syncSkillAndToolIndexes(true)
                .catch((err) => debug('[background]', err?.message || err))
              semanticEngine
                .syncNoteIndex(true)
                .catch((err) => debug('[background]', err?.message || err))
            }, 3000)
          }
        })
        .catch((err) => debug('[background]', err?.message || err))
    }

    if (typeof context.connectPythonSidecar === 'function') {
      context.connectPythonSidecar()
    }
  })

  // Global error handlers — evitam crash do processo durante instalação de extensões etc.
  process.on('uncaughtException', (err) => {
    error('[NodeCore] Uncaught exception:', err)
  })
  process.on('unhandledRejection', (err) => {
    error('[NodeCore] Unhandled rejection:', err)
  })

  // Graceful shutdown
  process.on('SIGTERM', () => {
    shutdownAll().catch(() => process.exit(0))
  })
  process.on('SIGINT', () => {
    shutdownAll().catch(() => process.exit(0))
  })
}

module.exports.startServer = startServer

// Also auto-start if this file is required directly as main
if (require.main === module) {
  startServer()
}
