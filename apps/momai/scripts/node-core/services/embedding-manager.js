const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { semanticState, store } = require('./shared-state')
const {
  EMBEDDING_PORT,
  EMBEDDING_BASE_URL,
  MODELS_DIR,
  MAX_EMBEDDING_CACHE_SIZE,
  EMBEDDING_CACHE_TTL_MS,
  EMBEDDING_TIMEOUT_MS
} = require('../config/constants')
const { debug, info, warn, error } = require('../infrastructure/logger')
const {
  killOrphanLlamaServers,
  registerManagedLlama,
  acquireSpawnLock,
  releaseSpawnLock,
  portReservations
} = require('../infrastructure/process-manager')
const { withTimeout } = require('../utils/network')
const { sha1 } = require('../utils/text')
const { isoNow } = require('../utils/time')

// Ensure shared semanticState has embedding structure (full init is in semantic-engine.js)
if (!semanticState.embedding) {
  semanticState.embedding = {
    process: null,
    starting: false,
    startingPromise: null,
    ready: false,
    backend: null,
    modelPath: null,
    lastError: null,
    cache: new Map()
  }
}
if (!semanticState.latency) {
  semanticState.latency = {
    embeddingMs: [],
    retrievalMs: [],
    toolExecMs: []
  }
}

let embeddingStartGeneration = 0

function pickEmbeddingModelPath() {
  if (!fs.existsSync(MODELS_DIR)) return null

  const { DEFAULT_TIERS } = require('../config/tiers')
  const tierConfig = DEFAULT_TIERS.ultra
  const configuredFile = String(tierConfig.embedding_file || '').trim()
  if (configuredFile) {
    const configuredPath = path.join(MODELS_DIR, configuredFile)
    if (fs.existsSync(configuredPath)) return configuredPath
  }

  const candidates = fs
    .readdirSync(MODELS_DIR)
    .filter(
      (name) => name.toLowerCase().includes('embedding') && name.toLowerCase().endsWith('.gguf')
    )
    .sort((a, b) => a.localeCompare(b))
  if (!candidates.length) return null
  return path.join(MODELS_DIR, candidates[0])
}

function rollingPush(list, value, max = 120) {
  if (!Number.isFinite(value)) return
  list.push(value)
  if (list.length > max) list.splice(0, list.length - max)
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

async function checkEmbeddingHealth() {
  const resp = await fetch(`${EMBEDDING_BASE_URL}/health`, { method: 'GET' })
  return resp.ok
}

async function stopEmbeddingServer() {
  embeddingStartGeneration += 1

  // Kill ALL embedding llama processes that we are tracking
  await killOrphanLlamaServers('embedding')

  // Clean up state
  semanticState.embedding.process = null
  semanticState.embedding.ready = false
  semanticState.embedding.starting = false
  semanticState.embedding.startingPromise = null
}

async function ensureEmbeddingReady() {
  const tier = store.settings.ai_tier || 'pro'
  if (tier !== 'ultra') return false

  if (semanticState.embedding.ready) return true
  if (semanticState.embedding.startingPromise) return semanticState.embedding.startingPromise

  const myGeneration = embeddingStartGeneration

  semanticState.embedding.startingPromise = (async () => {
    try {
      // Stop any stale embedding process from a previous cancelled startup
      if (semanticState.embedding.process && !semanticState.embedding.ready) {
        debug(`[embedding] Cleaning up stale embedding process before new startup`)
        await stopEmbeddingServer()
      }

      debug(`[embedding] Checking embedding server...`)

      debug(`[embedding] Searching for model in: ${MODELS_DIR}`)
      let modelPath = pickEmbeddingModelPath()
      if (!modelPath) {
        const { DEFAULT_TIERS } = require('../config/tiers')
        const tierConfig = DEFAULT_TIERS.ultra
        info(`[embedding] Model missing. Attempting auto-download: ${tierConfig.embedding_file}`)

        const { ensureTierModelAvailable } = require('./model-downloader')
        const downloadResult = await ensureTierModelAvailable(
          'ultra-embedding',
          {
            file: tierConfig.embedding_file,
            repo: tierConfig.embedding_repo
          },
          false
        )
        if (downloadResult.ok) {
          info(`[embedding] Model downloaded successfully to: ${downloadResult.path}`)
          modelPath = downloadResult.path
        } else {
          warn(`[embedding] Download failed: ${downloadResult.reason}`)
          semanticState.lastFallbackReason = 'embedding model not found'
          return false
        }
      }

      debug(`[embedding] Selected model: ${modelPath}`)

      semanticState.embedding.starting = true
      const llamaManager = require('./llama-manager')
      const preferred = llamaManager.normalizeBackendMode(store.settings.local_backend || 'auto')
      const availableBackends = llamaManager.listAvailableBackends()
      const backend =
        preferred === 'auto' ? 'cpu' : availableBackends.includes(preferred) ? preferred : 'cpu'
      const exePath = llamaManager.llamaBackendExePath(backend)

      info(
        `[embedding] Loading model: ${path.basename(modelPath)} (backend=${backend}, port=${EMBEDDING_PORT})`
      )

      if (!fs.existsSync(exePath)) {
        throw new Error(`llama-server binary missing for ${backend}`)
      }

      await acquireSpawnLock()
      let proc = null
      try {
        portReservations.add(EMBEDDING_PORT)
        // Kill ANY existing embedding llama server (managed or orphan) before spawning a new one
        await killOrphanLlamaServers('embedding')

        proc = spawn(
          exePath,
          [
            '-m',
            modelPath,
            '--port',
            String(EMBEDDING_PORT),
            '--embedding',
            '--pooling',
            'last',
            '--parallel',
            '2',
            '--ctx-size',
            '2048',
            '--threads',
            '2',
            '-ngl',
            backend !== 'cpu' ? '99' : '0'
          ],
          {
            cwd: path.dirname(exePath),
            env: { ...process.env, GGML_VULKAN_DEVICE: '0' },
            stdio: ['ignore', 'pipe', 'pipe']
          }
        )
        registerManagedLlama(proc, 'embedding')
      } finally {
        releaseSpawnLock()
        portReservations.delete(EMBEDDING_PORT)
      }

      semanticState.embedding.process = proc
      info(`[embedding] Process spawned (PID: ${proc.pid}, generation: ${myGeneration})`)

      proc.stdout.on('data', (d) => {
        const line = String(d || '').trim()
        if (line) debug(`[embedding][stdout] ${line}`)
      })
      proc.stderr.on('data', (d) => {
        const line = String(d || '').trim()
        if (line) debug(`[embedding][stderr] ${line}`)
      })

      proc.on('exit', (code, signal) => {
        const wasStarting = semanticState.embedding.starting
        warn(`[embedding] Process exited (code=${code}, signal=${signal})`)
        if (semanticState.embedding.process === proc) {
          semanticState.embedding.process = null
          semanticState.embedding.ready = false
          semanticState.embedding.starting = false
          semanticState.embedding.startingPromise = null
        }
        if (wasStarting) {
          semanticState.degraded = true
          semanticState.lastFallbackReason = `embedding exited (${code}/${signal})`
        }
      })

      proc.on('error', (error) => {
        error(`[embedding] Process error: ${error?.message}`)
        if (semanticState.embedding.process === proc) {
          semanticState.embedding.lastError = error?.message
          semanticState.embedding.ready = false
          semanticState.embedding.starting = false
          semanticState.embedding.startingPromise = null
          semanticState.embedding.process = null
        }
        semanticState.degraded = true
        semanticState.lastFallbackReason = error?.message
      })

      const startedAt = Date.now()
      const timeoutMs = 25000
      while (Date.now() - startedAt < timeoutMs) {
        if (embeddingStartGeneration !== myGeneration) {
          debug(
            `[embedding] Startup cancelled (generation ${myGeneration} superseded by ${embeddingStartGeneration})`
          )
          try {
            if (proc && !proc.killed) proc.kill('SIGTERM')
          } catch {}
          return false
        }
        if (proc.killed || proc.exitCode !== null) return false
        try {
          const ok = await checkEmbeddingHealth()
          if (ok) {
            info(`[embedding] Server is healthy and ready!`)
            semanticState.embedding.ready = true
            semanticState.embedding.modelPath = modelPath
            semanticState.embedding.starting = false
            semanticState.embedding.startingPromise = null
            semanticState.enabled = true
            semanticState.ready = true
            semanticState.degraded = false
            semanticState.lastFallbackReason = null
            // Pre-warm: fire a dummy embedding so first real call doesn't pay cold-start
            embedText('warmup').catch(() => {})
            return true
          }
        } catch {}
        await new Promise((r) => setTimeout(r, 500))
      }

      warn(`[embedding] Startup timed out after ${timeoutMs}ms`)
      semanticState.degraded = true
      semanticState.lastFallbackReason = 'embedding startup timeout'
      await stopEmbeddingServer()
      return false
    } catch (error) {
      error(`[embedding] Panic in startup task: ${error?.message}`)
      semanticState.degraded = true
      semanticState.lastFallbackReason = error?.message || 'embedding startup failure'
      await stopEmbeddingServer()
      return false
    } finally {
      if (!semanticState.embedding.ready) {
        semanticState.embedding.startingPromise = null
      }
    }
  })()

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

module.exports = {
  embeddingStartGeneration,
  semanticState,
  ensureEmbeddingReady,
  stopEmbeddingServer,
  checkEmbeddingHealth,
  embedText,
  parseEmbeddingResponse,
  pickEmbeddingModelPath,
  cleanupEmbeddingCache,
  rollingPush
}
