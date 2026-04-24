const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')
const shared = require('./shared-state')
const { store } = shared
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

function saveStore() {
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
  saveStore()
  emitInitProgress()
}

let llamaStartGeneration = 0

function getLlamaBaseUrl() {
  const port = Number(llamaState?.port || LLAMA_PORT)
  return `http://${LLAMA_HOST}:${port}`
}

async function checkLlamaHealth() {
  const resp = await fetch(`${getLlamaBaseUrl()}/health`, { method: 'GET' })
  return resp.ok
}

async function stopLlamaServer() {
  llamaStartGeneration += 1

  // Kill ALL main llama processes that we are tracking
  await killOrphanLlamaServers('main')

  // Clean up state
  llamaState.process = null
  llamaState.ready = false
  llamaState.starting = false
  llamaState.startingPromise = null
}

async function ensureLlamaReady(forceRestart = false, allowModelDownload = true) {
  if (forceRestart) {
    llamaStartGeneration += 1
    llamaState.startingPromise = null
  }

  if (llamaState.ready && !forceRestart) return true
  if (llamaState.startingPromise) return llamaState.startingPromise

  const myGeneration = llamaStartGeneration
  const preferred = normalizeBackendMode(store.settings.local_backend || 'auto')
  const backendAttempts = pickBackendAttempts(preferred)
  const tierName = store.settings.ai_tier || 'pro'
  const tierConfig = tiersConfig[tierName] || tiersConfig.pro || DEFAULT_TIERS.pro

  llamaState.startingPromise = (async () => {
    try {
      if (forceRestart) {
        await stopLlamaServer()
      }
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
      const parallelSlots = 2
      const requestCtx = Number(tierConfig.request_ctx_size || tierConfig.ctx_size || 8192)
      const ctxBase = Math.max(2048, Math.min(requestCtx, 8192))
      const totalCtx = ctxBase * parallelSlots

      // Log detailed model loading information
      const modelLoadStart = Date.now()
      if (typeof process.send === 'function') {
        process.send({
          type: 'node-core-log',
          message: `[llama] Loading model: ${actualModelFile} (tier=${tierName}, backend=${preferred}, ctx=${totalCtx})`
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
            llamaState.currentModelName = tierConfig.name || null
            llamaState.port = selectedPort

            setInitStatus('loading', `Loading local model (${tierName.toUpperCase()})...`, 80, null)

            let child = null
            await acquireSpawnLock()
            try {
              // Kill ANY existing main llama server (managed or orphan) before spawning a new one
              await killOrphanLlamaServers('main')

              child = spawn(exePath, args, {
                cwd: exeDir,
                env: {
                  ...process.env,
                  PATH: `${exeDir}${path.delimiter}${process.env.PATH || ''}`
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
                        message: `[llama] Model loaded in ${loadTime}s (backend=${backend.toUpperCase()}, ctx=${ctxBase})`
                      })
                    }

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
  llamaBackendExePath,
  resolveBackendBinaryInfo,
  hasBackendBinary,
  listAvailableBackends,
  listIncompatibleBackends,
  pickBackend,
  pickBackendAttempts,
  normalizeBackendMode,
  backendReason,
  resolveModelPath,
  resolveMmprojPath,
  getLlamaBaseUrl,
  saveStore,
  broadcast,
  emitInitProgress,
  wss,
  wsClients,
  tiersConfig
}

// Require model-downloader after exports to safely handle circular dependency
const { ensureTierModelAvailable } = require('./model-downloader')
