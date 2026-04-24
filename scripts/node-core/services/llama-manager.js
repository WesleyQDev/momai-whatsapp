const path = require('node:path')
const fs = require('node:fs')
const http = require('node:http')
const { spawn } = require('node:child_process')
const { log, debug, info, warn, error } = require('../infrastructure/logger')
const { LLAMA_PORT, LLAMA_BIN_CANDIDATES, LLAMA_HOST } = require('../config/constants')
const { resolveModelPath } = require('../config/tiers')
const { acquireSpawnLock, releaseSpawnLock, registerManagedLlama, killOrphanLlamaServers } = require('../infrastructure/process-manager')
const sharedState = require('./shared-state')

function getLlamaBaseUrl() {
  const port = Number(sharedState.llamaState.port || LLAMA_PORT)
  return `http://${LLAMA_HOST}:${port}`
}

function checkPortAvailable(port, host = LLAMA_HOST) {
  return new Promise((resolve) => {
    const server = require('node:net').createServer()
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
  const { portReservations } = require('../infrastructure/process-manager')
  for (let i = 0; i < maxAttempts; i += 1) {
    const candidate = base + i
    if (portReservations.has(candidate)) continue
    const available = await checkPortAvailable(candidate)
    if (available) {
      portReservations.add(candidate)
      return candidate
    }
  }
  return base
}

function llamaBackendExePath(backend) {
  const exeName = process.platform === 'win32' ? 'llama-server.exe' : 'llama-server'
  for (const basePath of LLAMA_BIN_CANDIDATES) {
    if (basePath.includes('app.asar') && !basePath.includes('app.asar.unpacked')) continue
    const candidate = path.join(basePath, backend, exeName)
    if (fs.existsSync(candidate)) return candidate
  }
  return path.join(
    LLAMA_BIN_CANDIDATES[0] || path.resolve(__dirname, '..', '..', 'apps', 'momai', 'scripts', 'bin', 'llama'),
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
      LLAMA_BIN_CANDIDATES[0] || path.resolve(__dirname, '..', '..', 'apps', 'momai', 'scripts', 'bin', 'llama'),
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

function setInitStatus(stage, message, progress, error = null) {
  const store = sharedState.store
  if (!store) return
  const current = store.init_status || {}
  
  if (!error && stage === current.stage && progress < current.progress && progress > 0) {
    return
  }

  store.init_status = {
    stage,
    message,
    progress,
    error,
    updated_at: new Date().toISOString()
  }
  saveStore()
  emitInitProgress()
}

async function checkLlamaHealth() {
  const resp = await fetch(`${getLlamaBaseUrl()}/health`, { method: 'GET' })
  return resp.ok
}

async function stopLlamaServer() {
  sharedState.llamaStartGeneration += 1
  await killOrphanLlamaServers('main')
  sharedState.llamaState.process = null
  sharedState.llamaState.ready = false
  sharedState.llamaState.starting = false
  sharedState.llamaState.startingPromise = null
}

// These will be set by index.js
let saveStore
let emitInitProgress
let ensurePython

function setSaveStore(fn) {
  saveStore = fn
}

function setEmitInitProgress(fn) {
  emitInitProgress = fn
}

function setEnsurePython(fn) {
  ensurePython = fn
}

async function ensureLlamaReady(forceRestart = false, allowModelDownload = true) {
  if (forceRestart) {
    sharedState.llamaStartGeneration += 1
    sharedState.llamaState.startingPromise = null
  }

  if (sharedState.llamaState.ready && !forceRestart) return true
  if (sharedState.llamaState.startingPromise) return sharedState.llamaState.startingPromise

  const myGeneration = sharedState.llamaStartGeneration
  const preferred = normalizeBackendMode(sharedState.store.settings.local_backend || 'auto')
  const backendAttempts = pickBackendAttempts(preferred)
  const tierName = sharedState.store.settings.ai_tier || 'pro'
  const tiersConfig = require('../config/tiers').loadTierConfig()
  const tierConfig = tiersConfig[tierName] || tiersConfig.pro || require('../config/tiers').DEFAULT_TIERS.pro

  sharedState.llamaState.startingPromise = (async () => {
    try {
      if (forceRestart) {
        await stopLlamaServer()
      }
      debug(`[llama] ensuring llama ready. tier: ${tierName}, file: ${tierConfig.file}, generation: ${myGeneration}`)

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
        sharedState.llamaState.lastError = msg
        setInitStatus('error', 'Local model binary missing', 99, msg)
        return false
      }

      const existingModelPath = resolveModelPath(tierConfig)
      if (!existingModelPath) {
        if (!allowModelDownload) {
          const msg = `Model for tier ${tierName.toUpperCase()} not present yet.`
          sharedState.llamaState.lastError = msg
          setInitStatus('loading', `Waiting model download (${tierName.toUpperCase()})...`, 25, null)
          return false
        }
        const { ensureTierModelAvailable } = require('./model-downloader')
        const modelReady = await ensureTierModelAvailable(tierName, tierConfig)
        if (!modelReady.ok) {
          const msg = modelReady.reason || `Failed to prepare model for tier ${tierName}`
          sharedState.llamaState.lastError = msg
          setInitStatus('error', 'Local model download failed', 99, msg)
          return false
        }
      }

      const modelPath = resolveModelPath(tierConfig)
      if (!modelPath) {
        const msg = `No GGUF model found in ${require('../config/constants').MODELS_DIR}`
        sharedState.llamaState.lastError = msg
        setInitStatus('error', 'Local model file missing', 99, msg)
        return false
      }
      
      // ... Continue with the rest of ensureLlamaReady
      // (Due to message length, I'll continue in next part)
      
      return true
    } catch (err) {
      error('[llama] Error in ensureLlamaReady:', err)
      return false
    }
  })()

  return sharedState.llamaState.startingPromise
}

module.exports = {
  getLlamaBaseUrl,
  checkPortAvailable,
  pickAvailablePort,
  llamaBackendExePath,
  resolveBackendBinaryInfo,
  hasBackendBinary,
  listAvailableBackends,
  normalizeBackendMode,
  pickBackend,
  backendReason,
  checkLlamaHealth,
  stopLlamaServer,
  ensureLlamaReady,
  setSaveStore,
  setEmitInitProgress,
  setEnsurePython,
  sharedState
}
