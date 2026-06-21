const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { spawn } = require('node:child_process')
const shared = require('./shared-state')
const { store, semanticState } = shared
let { llamaState } = shared
const { LLAMA_HOST, LLAMA_PORT, MODELS_DIR, LLAMA_BIN_CANDIDATES } = require('../config/constants')
const { debug, info, warn } = require('../infrastructure/logger')
const {
  killOrphanLlamaServers,
  registerManagedLlama,
  acquireSpawnLock,
  releaseSpawnLock,
  portReservations
} = require('../infrastructure/process-manager')
const { pickAvailablePort } = require('../utils/network')
const { isoNow } = require('../utils/time')
const { DEFAULT_TIERS, loadTierConfig } = require('../config/tiers')

const tiersConfig = loadTierConfig()

// Initialize shared llamaState by mutating the exported object
Object.assign(llamaState, {
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
  contextUsedTokens: 0,
  kvCacheUsedTokens: 0,
  kvCacheTotalTokens: 0,
  vramUsedMb: 0,
  vramTotalMb: 0,
  parallelSlots: 2,
  currentTier: null,
  currentModelName: null,
  port: LLAMA_PORT
})

// Broadcast / emitInitProgress stubs (exact code from node-core.js; safe when wss is undefined)
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

let _saveStoreTimer = null

function saveStore() {
  if (_saveStoreTimer) clearTimeout(_saveStoreTimer)
  _saveStoreTimer = setTimeout(() => {
    _saveStoreTimer = null
    try {
      const { STORE_FILE } = require('../config/constants')
      fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2), 'utf8')
    } catch (error) {
      debug('[NodeCore] Failed to save store:', error)
    }
  }, 2000)
}

function saveStoreNow() {
  if (_saveStoreTimer) {
    clearTimeout(_saveStoreTimer)
    _saveStoreTimer = null
  }
  try {
    const { STORE_FILE } = require('../config/constants')
    fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2), 'utf8')
  } catch (error) {
    debug('[NodeCore] Failed to save store:', error)
  }
}

function setInitStatus(stage, message, progress, error = null) {
  const current = store.init_status || {}

  // Don't regress progress if we are in the same stage, unless it's an error
  if (!error && stage === current.stage && progress < current.progress && progress > 0) {
    return
  }

  store.init_status = {
    stage,
    message,
    progress,
    error,
    updated_at: isoNow()
  }
  saveStoreNow()
  emitInitProgress()
}

let llamaStartGeneration = 0
let _modelWarmedUp = false

const WARMUP_SYSTEM_PROMPT =
  'You are MomAI.\n\nPersona: MomAI\nResponse style: balanced\nTarget max sentences: 6'

async function warmUpModel() {
  if (_modelWarmedUp) return
  _modelWarmedUp = true
  try {
    const body = JSON.stringify({
      messages: [
        { role: 'system', content: WARMUP_SYSTEM_PROMPT },
        { role: 'user', content: 'Hi' }
      ],
      max_tokens: 2,
      stream: false,
      temperature: 0
    })
    const resp = await fetch(`${getLlamaBaseUrl()}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: AbortSignal.timeout(10000)
    })
    if (resp.ok && typeof process.send === 'function') {
      process.send({
        type: 'node-core-log',
        message: '[llama] Model warm-up complete (hidden inference)'
      })
    }
  } catch {
    _modelWarmedUp = false
  }
}

function getLlamaBaseUrl() {
  const port = Number(llamaState?.port || LLAMA_PORT)
  return `http://${LLAMA_HOST}:${port}`
}

async function checkLlamaHealth() {
  const resp = await fetch(`${getLlamaBaseUrl()}/health`, { method: 'GET' })
  return resp.ok
}

function asMbFromUnknown(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return 0
  if (n > 1024 * 1024 * 32) return Math.round(n / 1024 / 1024)
  return Math.round(n)
}

function collectNumbersByHints(node, hints, out = []) {
  if (!node || typeof node !== 'object') return out
  for (const [key, value] of Object.entries(node)) {
    const keyLower = String(key).toLowerCase()
    if (value && typeof value === 'object') {
      collectNumbersByHints(value, hints, out)
      continue
    }
    if (!Number.isFinite(Number(value))) continue
    if (hints.some((hint) => keyLower.includes(hint))) {
      out.push(Number(value))
    }
  }
  return out
}

function parseSlotsTelemetry(slotsPayload) {
  const slots = Array.isArray(slotsPayload)
    ? slotsPayload
    : Array.isArray(slotsPayload?.slots)
      ? slotsPayload.slots
      : []
  if (!slots.length) return { usedTokens: 0, totalTokens: 0 }

  let usedTokens = 0
  let totalTokens = 0
  for (const slot of slots) {
    const used = Number(
      slot?.n_past ??
        slot?.n_ctx_used ??
        slot?.n_cache_tokens ??
        slot?.context_used_tokens ??
        slot?.prompt_tokens ??
        0
    )
    const total = Number(slot?.n_ctx ?? slot?.context_total_tokens ?? slot?.ctx_size ?? 0)
    if (Number.isFinite(used)) usedTokens = Math.max(usedTokens, Math.max(0, Math.round(used)))
    if (Number.isFinite(total)) totalTokens = Math.max(totalTokens, Math.max(0, Math.round(total)))
  }
  return { usedTokens, totalTokens }
}

function parseMetricsTelemetry(metricsText) {
  const text = String(metricsText || '')
  if (!text.trim()) return {}

  const readMetric = (patterns) => {
    const lines = text.split('\n')
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const [name, raw] = trimmed.split(/\s+/)
      if (!name || raw === undefined) continue
      const key = name.toLowerCase()
      if (!patterns.some((p) => key.includes(p))) continue
      const n = Number(raw)
      if (Number.isFinite(n)) return n
    }
    return 0
  }

  const vramUsedBytes = readMetric(['vram_used', 'gpu_memory_used'])
  const vramTotalBytes = readMetric(['vram_total', 'gpu_memory_total'])
  const kvUsed = readMetric(['kv_cache_used', 'kv_used_tokens'])
  const kvTotal = readMetric(['kv_cache_total', 'kv_total_tokens'])

  return {
    vramUsedMb: asMbFromUnknown(vramUsedBytes),
    vramTotalMb: asMbFromUnknown(vramTotalBytes),
    kvUsedTokens: Number.isFinite(kvUsed) ? Math.round(kvUsed) : 0,
    kvTotalTokens: Number.isFinite(kvTotal) ? Math.round(kvTotal) : 0
  }
}

let telemetryCache = { ts: 0, data: null, pending: null }

async function fetchLlamaRuntimeTelemetry(force = false) {
  const now = Date.now()
  if (!force && telemetryCache.data && now - telemetryCache.ts < 1500) return telemetryCache.data
  if (telemetryCache.pending) return telemetryCache.pending
  if (!llamaState.ready) {
    return {
      vramUsedMb: llamaState.vramUsedMb || 0,
      vramTotalMb: llamaState.vramTotalMb || 0,
      kvUsedTokens: llamaState.kvCacheUsedTokens || llamaState.contextUsedTokens || 0,
      kvTotalTokens: llamaState.kvCacheTotalTokens || llamaState.contextTotalTokens || 0
    }
  }

  telemetryCache.pending = (async () => {
    const base = getLlamaBaseUrl()
    let slotsParsed = { usedTokens: 0, totalTokens: 0 }
    let metricsParsed = {}
    let propsJson = null

    try {
      const slotsResp = await fetch(`${base}/slots`, { method: 'GET' })
      if (slotsResp.ok) {
        const slotsJson = await slotsResp.json()
        slotsParsed = parseSlotsTelemetry(slotsJson)
      }
    } catch {}

    try {
      const metricsResp = await fetch(`${base}/metrics`, { method: 'GET' })
      if (metricsResp.ok) {
        metricsParsed = parseMetricsTelemetry(await metricsResp.text())
      }
    } catch {}

    try {
      const propsResp = await fetch(`${base}/props`, { method: 'GET' })
      if (propsResp.ok) propsJson = await propsResp.json()
    } catch {}

    const vramUsedCandidates = [
      metricsParsed?.vramUsedMb,
      ...collectNumbersByHints(propsJson, ['vram_used', 'memory_used', 'gpu_memory_used']).map(
        asMbFromUnknown
      )
    ].filter((n) => Number.isFinite(n) && n > 0)

    const vramTotalCandidates = [
      metricsParsed?.vramTotalMb,
      ...collectNumbersByHints(propsJson, ['vram_total', 'memory_total', 'gpu_memory_total']).map(
        asMbFromUnknown
      )
    ].filter((n) => Number.isFinite(n) && n > 0)

    const telemetry = {
      vramUsedMb: vramUsedCandidates.length ? Math.max(...vramUsedCandidates) : 0,
      vramTotalMb: vramTotalCandidates.length ? Math.max(...vramTotalCandidates) : 0,
      kvUsedTokens: Math.max(
        0,
        Number(metricsParsed?.kvUsedTokens || 0) || slotsParsed.usedTokens || 0
      ),
      kvTotalTokens: Math.max(
        0,
        Number(metricsParsed?.kvTotalTokens || 0) ||
          slotsParsed.totalTokens ||
          llamaState.contextTotalTokens ||
          0
      )
    }

    llamaState.vramUsedMb = telemetry.vramUsedMb
    llamaState.vramTotalMb = telemetry.vramTotalMb
    llamaState.kvCacheUsedTokens = telemetry.kvUsedTokens
    llamaState.kvCacheTotalTokens = telemetry.kvTotalTokens
    if (telemetry.kvTotalTokens > 0) {
      llamaState.contextTotalTokens = telemetry.kvTotalTokens
      llamaState.contextUsedTokens = Math.min(
        telemetry.kvTotalTokens,
        Math.max(llamaState.contextUsedTokens || 0, telemetry.kvUsedTokens || 0)
      )
    }

    telemetryCache = { ts: Date.now(), data: telemetry, pending: null }
    return telemetry
  })()

  try {
    return await telemetryCache.pending
  } finally {
    telemetryCache.pending = null
  }
}

async function stopLlamaServer() {
  llamaStartGeneration += 1

  // Clean up state FIRST (synchronous) — before any async yield,
  // so ensureLlamaReady called during the yield sees correct state.
  llamaState.process = null
  llamaState.ready = false
  llamaState.starting = false
  llamaState.startingPromise = null
  llamaState.contextUsedTokens = 0
  llamaState.kvCacheUsedTokens = 0
  llamaState.vramUsedMb = 0
  telemetryCache = { ts: 0, data: null, pending: null }

  // Kill ALL main llama processes that we are tracking
  await killOrphanLlamaServers('main')

  // Also kill embedding llama-server and clean up its state,
  // so soneca frees all GPU resources, not just the main LLM.
  await killOrphanLlamaServers('embedding')
  if (semanticState.embedding) {
    semanticState.embedding.process = null
    semanticState.embedding.ready = false
    semanticState.embedding.starting = false
    semanticState.embedding.startingPromise = null
  }
}

async function ensureLlamaReady(forceRestart = false, allowModelDownload = true) {
  if (forceRestart) {
    llamaStartGeneration += 1
    llamaState.startingPromise = null
  }

  if (llamaState.ready && !forceRestart) {
    return true
  }
  if (llamaState.startingPromise) return llamaState.startingPromise

  const preferred = normalizeBackendMode(store.settings.local_backend || 'auto')
  const backendAttempts = pickBackendAttempts(preferred)
  const tierName = store.settings.ai_tier || 'pro'
  const tierConfig = tiersConfig[tierName] || tiersConfig.pro || DEFAULT_TIERS.pro

  llamaState.startingPromise = (async () => {
    try {
      await stopLlamaServer()
      const myGeneration = llamaStartGeneration
      debug(
        `[llama] ensuring llama ready. tier: ${tierName}, file: ${tierConfig.file}, generation: ${myGeneration}`
      )

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
        setInitStatus('error', 'Local model binary missing', 99, msg)
        return false
      }

      const existingModelPath = resolveModelPath(tierConfig)
      if (!existingModelPath) {
        if (!allowModelDownload) {
          const msg = `Model for tier ${tierName.toUpperCase()} not present yet.`
          llamaState.lastError = msg
          setInitStatus(
            'loading',
            `Waiting model download (${tierName.toUpperCase()})...`,
            25,
            null
          )
          return false
        }
        const { ensureTierModelAvailable } = require('./model-downloader')
        const modelReady = await ensureTierModelAvailable(tierName, tierConfig)
        if (!modelReady.ok) {
          const msg = modelReady.reason || `Failed to prepare model for tier ${tierName}`
          llamaState.lastError = msg
          setInitStatus('error', 'Local model download failed', 99, msg)
          return false
        }
      }

      const modelPath = resolveModelPath(tierConfig)
      if (!modelPath) {
        const msg = `No GGUF model found in ${MODELS_DIR}`
        llamaState.lastError = msg
        setInitStatus('error', 'Local model file missing', 99, msg)
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
      await fetchLlamaRuntimeTelemetry().catch(() => null)
      const parallelSlots = resolveParallelSlots({ backendMode: preferred, tierName })
      const ctxBase = resolveContextWindowTokens({
        settings: store.settings || {},
        tierConfig,
        backendMode: preferred
      })
      const totalCtx = ctxBase * parallelSlots

      // Log detailed model loading information
      const modelLoadStart = Date.now()
      if (typeof process.send === 'function') {
        process.send({
          type: 'node-core-log',
          message: `[llama] Loading model: ${actualModelFile} (tier=${tierName}, backend=${preferred}, ctx=${totalCtx}, parallel=${parallelSlots})`
        })
        if (mmprojPath) {
          process.send({
            type: 'node-core-log',
            message: `[llama] Vision: ${path.basename(mmprojPath)}`
          })
        }
      }

      const startAttempt = (backend, isFallbackAttempt) =>
        new Promise((resolve) => {
          const exePath = llamaBackendExePath(backend)
          const exeDir = path.dirname(exePath)
          ;(async () => {
            if (llamaStartGeneration !== myGeneration) {
              resolve({ ok: false, reason: 'cancelled: newer startup requested' })
              return
            }
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
              String(
                Number.isFinite(tierConfig.presence_penalty) ? tierConfig.presence_penalty : 0
              ),
              '--repeat-penalty',
              String(
                Number.isFinite(tierConfig.repetition_penalty) ? tierConfig.repetition_penalty : 1
              )
            ]

            if (backend === 'cpu') args.push('--no-mmap')
            else args.push('--mmap')

            if (mmprojPath) args.push('--mmproj', mmprojPath)

            _modelWarmedUp = false
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
            const wasRestart = llamaState.currentTier !== null
            llamaState.currentTier = tierName
            llamaState.currentModelName = tierConfig.name || null
            llamaState.port = selectedPort
            llamaState.parallelSlots = parallelSlots

            if (!wasRestart) {
              setInitStatus(
                'loading',
                `Loading local model (${tierName.toUpperCase()})...`,
                80,
                null
              )
            }

            let child = null
            await acquireSpawnLock()
            try {
              // Kill ANY existing main llama server (managed or orphan) before spawning a new one
              await killOrphanLlamaServers('main')

              child = spawn(exePath, args, {
                cwd: exeDir,
                env: {
                  ...process.env,
                  PATH: `${exeDir}${path.delimiter}${process.env.PATH || ''}`,
                  GGML_VULKAN_DEVICE: '0'
                },
                shell: false,
                stdio: ['ignore', 'pipe', 'pipe']
              })
              registerManagedLlama(child, 'main')
            } catch (error) {
              const errMsg = error?.message || 'Failed to spawn llama-server'
              resolve({ ok: false, reason: errMsg })
              return
            } finally {
              releaseSpawnLock()
              portReservations.delete(selectedPort)
            }

            llamaState.process = child
            let exitedDuringStartup = false

            function isLlamaNoise(line) {
              if (!line) return true
              const lower = line.toLowerCase()
              // Keep errors/warnings and main milestones
              if (lower.includes('error') || lower.includes('warn') || lower.includes('fail'))
                return false
              if (lower.startsWith('main:')) return false
              if (lower.startsWith('slot ')) return false
              if (lower.startsWith('srv ')) return false
              // Discard everything else (metadata, tensors, kv dumps, dots, sched, etc.)
              return true
            }

            child.stdout?.on('data', (data) => {
              const line = String(data).trim()
              if (line && !isLlamaNoise(line) && typeof process.send === 'function') {
                process.send({ type: 'node-core-log', message: `[llama] ${line}` })
              }
            })

            child.stderr?.on('data', (data) => {
              const line = String(data).trim()
              if (line && !isLlamaNoise(line) && typeof process.send === 'function') {
                process.send({ type: 'node-core-log', message: `[llama] ${line}` })
              }
            })

            child.on('exit', () => {
              exitedDuringStartup = true
              if (llamaState.process === child) {
                llamaState.ready = false
                llamaState.starting = false
                llamaState.process = null
              }
            })

            child.on('error', (error) => {
              exitedDuringStartup = true
              llamaState.lastError = error?.message || 'llama-server spawn error'
            })

            const startedAt = Date.now()
            const timeoutMs = 25000
            ;(async () => {
              while (Date.now() - startedAt < timeoutMs) {
                if (llamaStartGeneration !== myGeneration) {
                  debug(
                    `[llama] Startup cancelled (generation ${myGeneration} superseded by ${llamaStartGeneration})`
                  )
                  try {
                    if (child && !child.killed) child.kill('SIGTERM')
                  } catch {}
                  resolve({ ok: false, reason: 'cancelled: newer startup requested' })
                  return
                }
                if (exitedDuringStartup || child.killed || child.exitCode !== null) {
                  resolve({ ok: false, reason: 'llama-server exited during startup' })
                  return
                }
                try {
                  const ok = await checkLlamaHealth()
                  if (ok) {
                    llamaState.ready = true
                    llamaState.starting = false

                    // Log successful model loading with timing
                    const loadTime = ((Date.now() - modelLoadStart) / 1000).toFixed(2)
                    if (typeof process.send === 'function') {
                      process.send({
                        type: 'node-core-log',
                        message: `[llama] Model loaded in ${loadTime}s (backend=${backend.toUpperCase()}, ctx=${ctxBase}, parallel=${parallelSlots})`
                      })
                    }

                    warmUpModel()
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

      for (let i = 0; i < backendAttempts.length; i += 1) {
        if (llamaStartGeneration !== myGeneration) {
          debug(
            `[llama] Backend loop cancelled (generation ${myGeneration} superseded by ${llamaStartGeneration})`
          )
          return false
        }
        const backend = backendAttempts[i]
        const result = await startAttempt(backend, i > 0)
        if (result.ok) return true
        llamaState.lastError = result.reason
        if (preferred !== 'auto') {
          setInitStatus('error', 'Failed to initialize local model', 99, result.reason)
          return false
        }
        if (i === 0 && backend === 'vulkan' && backendAttempts[i + 1] === 'cpu') {
          /* Retry Vulkan once after a brief pause — transient port/GPU
             contention (embedding server, stale process) can cause a
             false-negative probe on AMD Windows drivers. */
          await new Promise((r) => setTimeout(r, 2000))
          const retry = await startAttempt(backend, true)
          if (retry.ok) return true
          if (typeof process.send === 'function') {
            process.send({
              type: 'node-core-log',
              message: `[llama] Vulkan probe failed (${result.reason}). Falling back to CPU.`
            })
          }
        }
      }

      setInitStatus('error', 'Failed to initialize local model', 99, llamaState.lastError)
      return false
    } finally {
      if (!llamaState.ready) {
        llamaState.startingPromise = null
      }
    }
  })()

  return llamaState.startingPromise
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
  return ['cuda', 'vulkan', 'cpu'].filter((backend) => hasBackendBinary(backend))
}

function listIncompatibleBackends() {
  return ['cuda', 'vulkan', 'cpu'].filter((backend) => {
    const info = resolveBackendBinaryInfo(backend)
    return !info.compatible && fs.existsSync(info.path)
  })
}

function normalizeBackendMode(value) {
  return value === 'cpu' || value === 'vulkan' || value === 'cuda' || value === 'auto'
    ? value
    : 'auto'
}

function pickBackend(preferred) {
  const normalized = normalizeBackendMode(preferred)
  const available = listAvailableBackends()
  if (normalized === 'cpu' || normalized === 'vulkan' || normalized === 'cuda') {
    return available.includes(normalized) ? normalized : null
  }
  if (available.includes('cuda')) return 'cuda'
  if (available.includes('vulkan')) return 'vulkan'
  if (available.includes('cpu')) return 'cpu'
  return null
}

function pickBackendAttempts(preferred) {
  const normalized = normalizeBackendMode(preferred)
  const available = listAvailableBackends()
  if (normalized === 'cpu') return available.includes('cpu') ? ['cpu'] : []
  if (normalized === 'vulkan') return available.includes('vulkan') ? ['vulkan'] : []
  if (normalized === 'cuda') return available.includes('cuda') ? ['cuda'] : []
  const attempts = []
  if (available.includes('cuda')) attempts.push('cuda')
  if (available.includes('vulkan')) attempts.push('vulkan')
  if (available.includes('cpu')) attempts.push('cpu')
  return attempts
}

function backendReason(mode, backend, context = {}) {
  if (mode === 'cpu') return 'manual_cpu'
  if (mode === 'vulkan') return 'manual_vulkan'
  if (mode === 'cuda') return 'manual_cuda'
  if (backend === 'cuda') return 'cuda_probe_ok'
  if (backend === 'vulkan') return 'gpu_probe_ok'
  if (backend === 'cpu' && context.vulkanAttempted) return 'gpu_probe_failed'
  if (backend === 'cpu') return 'cpu_only_available'
  return 'backend_unavailable'
}

function normalizeContextWindowMode(mode) {
  const normalized = String(mode || '').toLowerCase()
  if (
    normalized === 'min' ||
    normalized === 'medium' ||
    normalized === 'max' ||
    normalized === 'custom'
  ) {
    return normalized
  }
  return 'min'
}

function clampContextTokens(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 2048
  const stepped = Math.round(n / 256) * 256
  return Math.max(1024, Math.min(16384, stepped))
}

function estimateContextTokensByHardware({
  mode,
  backendMode,
  ramGb,
  vramGb,
  freeRamGb,
  vramUsedMb,
  vramTotalMb
}) {
  const gpuActive = backendMode === 'cuda' || backendMode === 'vulkan'
  const factors = { min: 0.35, medium: 0.6, max: 0.9 }
  const factor = factors[mode] || factors.min
  const mbPer1kTokens = gpuActive ? 90 : 115

  const totalRamGb = Number(ramGb || 0)
  const dynamicFreeRamGb = Number(freeRamGb || 0)
  const totalVramGb = Number(vramGb || 0)
  const dynamicVramTotalGb = Number(vramTotalMb || 0) / 1024
  const dynamicVramUsedGb = Number(vramUsedMb || 0) / 1024

  const effectiveTotalVramGb = dynamicVramTotalGb > 0 ? dynamicVramTotalGb : totalVramGb
  const effectiveFreeVramGb =
    dynamicVramTotalGb > 0
      ? Math.max(0, dynamicVramTotalGb - dynamicVramUsedGb)
      : effectiveTotalVramGb

  const baseBudgetGb = gpuActive
    ? Math.max(1, Math.min(effectiveFreeVramGb * 0.65, effectiveTotalVramGb * 0.55 || 10))
    : Math.max(0.75, Math.min(dynamicFreeRamGb * 0.35, totalRamGb * 0.22 || 8))
  const budgetGb = baseBudgetGb * factor
  const tokens = Math.floor((budgetGb * 1024 * 1000) / mbPer1kTokens)
  return clampContextTokens(tokens)
}

function resolveContextWindowTokens({ settings, tierConfig, backendMode }) {
  const mode = normalizeContextWindowMode(settings?.context_window_mode)

  // If user explicitly set context_window_tokens, always respect it (regardless of mode)
  const userTokens = Number(settings?.context_window_tokens)
  if (Number.isFinite(userTokens) && userTokens > 0) {
    return clampContextTokens(userTokens)
  }

  const ramGb = Number(settings?.hardware_total_ram_gb) || os.totalmem() / 1024 / 1024 / 1024
  const vramGb = Number(settings?.hardware_total_vram_gb) || (llamaState.vramTotalMb || 0) / 1024
  const freeRamGb = os.freemem() / 1024 / 1024 / 1024
  const estimated = estimateContextTokensByHardware({
    mode,
    backendMode,
    ramGb,
    vramGb,
    freeRamGb,
    vramUsedMb: llamaState.vramUsedMb || 0,
    vramTotalMb: llamaState.vramTotalMb || 0
  })
  const tierRequest = clampContextTokens(
    tierConfig?.request_ctx_size || tierConfig?.ctx_size || 8192
  )

  if (mode === 'medium') return Math.max(estimated, Math.min(8192, tierRequest))
  if (mode === 'max') return Math.max(estimated, tierRequest)
  return Math.min(estimated, Math.max(2048, tierRequest))
}

function resolveParallelSlots({ backendMode, tierName }) {
  const freeRamGb = os.freemem() / 1024 / 1024 / 1024
  const totalRamGb = os.totalmem() / 1024 / 1024 / 1024
  const gpuActive = backendMode === 'cuda' || backendMode === 'vulkan'
  const freeVramGb = Math.max(
    0,
    (Number(llamaState.vramTotalMb || 0) - Number(llamaState.vramUsedMb || 0)) / 1024
  )

  if (!gpuActive) {
    if (freeRamGb < 6 || totalRamGb < 12 || tierName === 'ultra') return 1
    return 2
  }

  if (freeRamGb < 7) return 1
  if (llamaState.vramTotalMb > 0 && freeVramGb < 3) return 1
  if (tierName === 'ultra' && freeVramGb > 0 && freeVramGb < 4) return 1
  return 2
}

function resolveModelPath(tierConfig) {
  const configuredFile = String(tierConfig?.file || '').trim()
  if (!configuredFile) return null

  const targetPath = path.join(MODELS_DIR, configuredFile)
  if (fs.existsSync(targetPath)) {
    return targetPath
  }

  // Se o arquivo exato não existir, retornamos null para forçar o download.
  // Removemos o fallback alfabético anterior que causava o uso do modelo errado.
  return null
}

function resolveMmprojPath() {
  if (!fs.existsSync(MODELS_DIR)) return null
  const mmproj = fs
    .readdirSync(MODELS_DIR)
    .find((name) => name.toLowerCase().includes('mmproj') && name.toLowerCase().endsWith('.gguf'))
  return mmproj ? path.join(MODELS_DIR, mmproj) : null
}

module.exports = {
  llamaState,
  llamaStartGeneration,
  setInitStatus,
  checkLlamaHealth,
  stopLlamaServer,
  ensureLlamaReady,
  saveStoreNow,
  saveStore,
  llamaBackendExePath,
  resolveBackendBinaryInfo,
  hasBackendBinary,
  listAvailableBackends,
  listIncompatibleBackends,
  pickBackend,
  pickBackendAttempts,
  normalizeBackendMode,
  normalizeContextWindowMode,
  clampContextTokens,
  estimateContextTokensByHardware,
  resolveContextWindowTokens,
  resolveParallelSlots,
  fetchLlamaRuntimeTelemetry,
  backendReason,
  resolveModelPath,
  resolveMmprojPath,
  getLlamaBaseUrl,
  broadcast,
  emitInitProgress,
  wss,
  wsClients,
  tiersConfig
}

// Require model-downloader after exports to safely handle circular dependency
const { ensureTierModelAvailable } = require('./model-downloader')
