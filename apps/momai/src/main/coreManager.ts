import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync } from 'fs'
import { join, resolve } from 'path'
import { spawn, execSync } from 'child_process'
import { createConnection } from 'net'
import { API_HOST, API_PORT } from './constants'
import { getMainWindow, setNodeCoreProcess, state } from './state'
import { logger } from './logger'
import {
  isPythonRunning,
  shutdownPython,
  startPythonBackend,
  killPythonBackend,
  killProcessOnPort,
  killAllLlamaServers,
  isOnboardingCompleted,
  type PythonBackendStartOptions
} from './python'
import { getTTSService } from './ttsService'

const PYTHON_SIDECAR_HOST = API_HOST
const PYTHON_SIDECAR_PORT = Number(process.env.MOMAI_PYTHON_SIDECAR_PORT || 8001)
const CORE_BOOT_TIMEOUT_MS = 300000
const REUSE_NODE_CORE = process.env.MOMAI_REUSE_NODE_CORE === '1'

function getCurrentTier(): string | null {
  const storePath = join(app.getPath('userData'), 'data', 'node-core-store.json')
  try {
    if (existsSync(storePath)) {
      const data = JSON.parse(readFileSync(storePath, 'utf-8'))
      const tier = data.settings?.ai_tier
      if (tier === 'lite' || tier === 'pro' || tier === 'ultra') return tier
      return null
    }
  } catch (e) {
    logger.warn('[CoreManager] Error reading tier from store:', e)
  }
  return null
}

type EnsurePythonRequest = {
  type: 'ensure-python'
  requestId: string
}

let coreReadyResolve: (() => void) | null = null
let coreReadyReject: ((error: Error) => void) | null = null
let coreReadyPromise: Promise<void> | null = null
let restartAttempts = 0
let isStoppingCore = false

const LLAMA_LOG_NOISE_PATTERNS = [
  'slot update_slots:',
  'slot launch_slot_:',
  'slot get_availabl:',
  'srv  params_from_:',
  'srv  log_server_r:',
  'slot print_timing:',
  'slot create_check:',
  'srv          init:',
  'srv    load_model:',
  'srv        update:',
  'srv  get_availabl:',
  'slot init_sampler:',
  'slot      release:',
  'main: server is listening',
  'main: starting the main loop',
  'all slots are idle',
  'get /slots',
  'post /v1/chat/completions'
]

const logDedupCache = new Map<string, number>()
const LOG_DEDUP_WINDOW_MS = 1500
const LOG_DEDUP_CACHE_LIMIT = 400

function shouldIgnoreLlamaNoise(line: string): boolean {
  const lower = String(line || '').toLowerCase()
  return LLAMA_LOG_NOISE_PATTERNS.some((pattern) => lower.includes(pattern))
}

function shouldLogNodeCoreLine(rawLine: string): boolean {
  const line = String(rawLine || '').trim()
  if (!line) return false
  if (shouldIgnoreLlamaNoise(line)) return false

  const now = Date.now()
  const key = line
  const lastSeenAt = logDedupCache.get(key)
  if (lastSeenAt && now - lastSeenAt < LOG_DEDUP_WINDOW_MS) {
    return false
  }
  logDedupCache.set(key, now)

  if (logDedupCache.size > LOG_DEDUP_CACHE_LIMIT) {
    for (const [cachedLine, ts] of logDedupCache) {
      if (now - ts > LOG_DEDUP_WINDOW_MS * 2) {
        logDedupCache.delete(cachedLine)
      }
      if (logDedupCache.size <= LOG_DEDUP_CACHE_LIMIT) break
    }
  }

  return true
}

function isPortReachable(port: number, host: string, timeoutMs = 400): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = createConnection(port, host)
    sock.setTimeout(timeoutMs)

    const finish = (result: boolean) => {
      sock.removeAllListeners()
      sock.destroy()
      resolve(result)
    }

    sock.on('connect', () => finish(true))
    sock.on('error', () => finish(false))
    sock.on('timeout', () => finish(false))
  })
}

async function isMomaiNodeCoreReachable(host: string, port: number): Promise<boolean> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 1200)

  try {
    const response = await fetch(`http://${host}:${port}/status`, {
      method: 'GET',
      signal: controller.signal
    })

    if (!response.ok) return false
    const data = await response.json().catch(() => null)
    return Boolean(data && data.status === 'ok' && typeof data.mode === 'string')
  } catch {
    return false
  } finally {
    clearTimeout(timeout)
  }
}

async function ensureNodeCoreLlamaWarmup(host: string, port: number): Promise<void> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 45000)

  try {
    const response = await fetch(`http://${host}:${port}/llama/ensure`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal
    })

    if (!response.ok) {
      logger.warn(
        `[CoreManager] llama warmup endpoint returned HTTP ${response.status} on reused core.`
      )
      return
    }

    const data = await response.json().catch(() => null)
    if (data?.ready) {
      logger.info('[CoreManager] Reused node core llama runtime is ready.')
      return
    }

    if (data?.is_loading) {
      logger.info('[CoreManager] Reused node core is loading llama runtime.')
      return
    }

    logger.warn(
      `[CoreManager] Reused node core llama warmup pending: ${data?.error || data?.reason || 'unknown reason'}`
    )
  } catch (error: any) {
    logger.warn(
      `[CoreManager] Failed to trigger llama warmup on reused core: ${error?.message || error}`
    )
  } finally {
    clearTimeout(timeout)
  }
}

async function requestNodeCoreShutdown(host: string, port: number): Promise<boolean> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 4000)

  try {
    const response = await fetch(`http://${host}:${port}/internal/shutdown`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal
    })
    return response.ok
  } catch {
    return false
  } finally {
    clearTimeout(timeout)
  }
}

async function waitForPortToClose(host: string, port: number, timeoutMs = 8000): Promise<boolean> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    // eslint-disable-next-line no-await-in-loop
    const open = await isPortReachable(port, host, 250)
    if (!open) return true
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  return false
}

function getNodeCoreScriptPath(): string {
  return join(app.getAppPath(), 'scripts', 'node-core.js')
}

function getCorePath(): string {
  const devCorePath = resolve(app.getAppPath(), '..', 'core')
  if (existsSync(devCorePath)) {
    return devCorePath
  }
  return join(process.resourcesPath, 'core')
}

function getLlamaBinPath(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'bin', 'llama')
  }

  const devLlamaPath = resolve(app.getAppPath(), 'bin', 'llama')
  if (existsSync(devLlamaPath)) {
    return devLlamaPath
  }
  return join(process.resourcesPath, 'bin', 'llama')
}

function getNodeCoreDataDir(): string {
  const dataDir = join(app.getPath('userData'), 'data')
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true })
  }
  return dataDir
}

function getNodeCoreModelsDir(): string {
  const modelsDir = join(getNodeCoreDataDir(), 'models')
  if (!existsSync(modelsDir)) {
    mkdirSync(modelsDir, { recursive: true })
  }
  return modelsDir
}

function emitInitProgress(message: string, progress: number): void {
  const mainWindow = getMainWindow()
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('init-progress', { message, progress })
  }
}

export async function ensurePythonSidecar(): Promise<{
  ok: boolean
  error?: string
  baseUrl?: string
}> {
  try {
    const tier = getCurrentTier()
    if (tier === 'lite') {
      if (isPythonRunning()) {
        logger.info('[CoreManager] Mode is Lite: shutting down Python sidecar to save resources.')
        await killPythonBackend()
      } else {
        // Even if not "running" according to state, check port for orphans/zombies
        await killProcessOnPort(PYTHON_SIDECAR_PORT)
      }
      return { ok: false, error: 'Python sidecar is disabled in Lite mode' }
    }

    if (!tier) {
      return { ok: false, error: 'AI tier not selected yet (onboarding pending)' }
    }

    if (!isPythonRunning()) {
      const options: PythonBackendStartOptions = {
        host: PYTHON_SIDECAR_HOST,
        port: PYTHON_SIDECAR_PORT,
        announceOnline: false,
        reportBootstrapErrors: false
      }
      await startPythonBackend(options)
    }

    if (!isPythonRunning()) {
      return { ok: false, error: 'Python sidecar failed to start' }
    }

    return {
      ok: true,
      baseUrl: `http://${PYTHON_SIDECAR_HOST}:${PYTHON_SIDECAR_PORT}`
    }
  } catch (error: any) {
    logger.error('[CoreManager] Failed to start Python sidecar:', error)
    return {
      ok: false,
      error: error?.message || 'Failed to start Python sidecar'
    }
  }
}

function attachCoreIpcHandlers(child: ReturnType<typeof spawn>): void {
  child.on('message', async (raw: unknown) => {
    const msg = raw as any
    if (!msg || typeof msg !== 'object') return

    if (msg.type === 'node-core-ready') {
      const brainReady = msg.brainReady !== false
      const isLoading = msg.isLoading === true
      logger.info(
        `[CoreManager] Node core reported ready (brainReady=${brainReady}, isLoading=${isLoading}).`
      )

      if (brainReady && !isLoading) {
        emitInitProgress('System ready.', 100)
      } else {
        emitInitProgress('Node core online. Loading local model...', 65)
      }

      const mainWindow = getMainWindow()
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('backend-online')
      }
      if (coreReadyResolve) coreReadyResolve()
      return
    }

    if (msg.type === 'node-core-log' && msg.message) {
      if (!shouldLogNodeCoreLine(String(msg.message))) return
      logger.info(`[NodeCore] ${msg.message}`)
      return
    }

    if (msg.type === 'node-core-error' && msg.error) {
      logger.error(`[NodeCore] ${msg.error}`)
      return
    }

    if ((msg as EnsurePythonRequest).type === 'ensure-python') {
      const req = msg as EnsurePythonRequest
      const result = await ensurePythonSidecar()
      child.send({
        type: 'ensure-python-result',
        requestId: req.requestId,
        ...result
      })
      return
    }

    if (msg.type === 'tts-speak') {
      if (state.isQuitting || isStoppingCore) {
        if (child.connected) {
          child.send({
            type: 'tts-speak-result',
            requestId: msg.requestId,
            ok: false,
            error: 'app is shutting down'
          })
        }
        return
      }
      const { requestId, text, voice, engine } = msg as any
      logger.info(`[CoreManager] Received tts-speak IPC requestId=${requestId} engine=${engine} text="${text?.slice(0,40)}"`)
      if (!requestId || !text) {
        logger.warn('[CoreManager] tts-speak missing requestId or text')
        return
      }

      try {
        const ttsService = getTTSService()

        if (voice) {
          logger.info(`[CoreManager] Setting voice: ${voice}`)
          ttsService.setVoice(voice)
        }
        if (engine) {
          logger.info(`[CoreManager] Setting engine: ${engine}`)
          ttsService.setEngine(engine)
        }

        logger.info('[CoreManager] Calling ttsService.speak()...')
        await ttsService.speak(text, engine || 'edge-tts')
        logger.info('[CoreManager] ttsService.speak() DONE')

        if (child.connected) {
          child.send({
            type: 'tts-speak-result',
            requestId,
            ok: true
          })
        }
      } catch (error: any) {
        logger.error(`[CoreManager] TTS speak failed: ${error?.message || error}`)
        if (child.connected) {
          child.send({
            type: 'tts-speak-result',
            requestId,
            ok: false,
            error: error?.message || String(error)
          })
        }
      }
    }
  })
}

function spawnNodeCore(): ReturnType<typeof spawn> {
  const scriptPath = getNodeCoreScriptPath()
  if (!existsSync(scriptPath)) {
    throw new Error(`Node core script not found at ${scriptPath}`)
  }

  const env = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
    MOMAI_NODE_CORE_HOST: API_HOST,
    MOMAI_NODE_CORE_PORT: String(API_PORT),
    MOMAI_NODE_CORE_DATA_DIR: getNodeCoreDataDir(),
    MOMAI_MODELS_DIR: getNodeCoreModelsDir(),
    MOMAI_CORE_PATH: getCorePath(),
    MOMAI_LLAMA_BIN_PATH: getLlamaBinPath(),
    MOMAI_PYTHON_SIDECAR_HOST: PYTHON_SIDECAR_HOST,
    MOMAI_PYTHON_SIDECAR_PORT: String(PYTHON_SIDECAR_PORT),
    MOMAI_ONBOARDING_MODE: isOnboardingCompleted() ? '0' : '1',
    MOMAI_AI_TIER: getCurrentTier() || 'lite'
  }

  const child = spawn(process.execPath, [scriptPath], {
    env,
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc']
  })

  child.stdout?.on('data', (data) => {
    const line = data.toString().trim()
    if (!shouldLogNodeCoreLine(line)) return
    logger.info(`[NodeCore] ${line}`)
  })

  child.stderr?.on('data', (data) => {
    const line = data.toString().trim()
    if (!line) return
    if (line.toLowerCase().includes('speculative decoding')) return
    if (!shouldLogNodeCoreLine(line)) return
    logger.error(`[NodeCore] ${line}`)
  })

  attachCoreIpcHandlers(child)

  child.on('exit', (code, signal) => {
    logger.warn(`[CoreManager] Node core exited (code=${code}, signal=${signal})`)
    setNodeCoreProcess(null)
    if (isStoppingCore || state.isQuitting) return

    const mainWindow = getMainWindow()
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('backend-retry')
    }

    const delay = Math.min(1000 * (restartAttempts + 1), 5000)
    restartAttempts += 1
    setTimeout(() => {
      startCoreBackend().catch((error) => {
        logger.error('[CoreManager] Failed to restart node core:', error)
      })
    }, delay)
  })

  return child
}

export async function startCoreBackend(): Promise<void> {
  if (
    state.nodeCoreProcess &&
    !state.nodeCoreProcess.killed &&
    state.nodeCoreProcess.exitCode === null
  ) {
    return
  }

  emitInitProgress('Starting local Node core...', 10)
  isStoppingCore = false

  // If something is already serving this port, default to fresh-starting node-core.
  if (await isPortReachable(API_PORT, API_HOST, 350)) {
    if (await isMomaiNodeCoreReachable(API_HOST, API_PORT)) {
      if (REUSE_NODE_CORE) {
        logger.info(`[CoreManager] Reusing existing Node core on ${API_HOST}:${API_PORT}.`)
        emitInitProgress('Node core online. Loading local model...', 32)
        const mainWindow = getMainWindow()
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('backend-online')
        }

        void ensureNodeCoreLlamaWarmup(API_HOST, API_PORT)
        void ensurePythonSidecar()
        return
      }

      logger.info(
        `[CoreManager] Existing Node core found on ${API_HOST}:${API_PORT}; requesting shutdown for fresh start.`
      )
      emitInitProgress('Stopping previous local core...', 15)
      await requestNodeCoreShutdown(API_HOST, API_PORT)

      const closed = await waitForPortToClose(API_HOST, API_PORT, 8000)
      if (!closed) {
        const message =
          `Failed to stop existing Node core on ${API_HOST}:${API_PORT}. ` +
          'Set MOMAI_REUSE_NODE_CORE=1 to reuse, or close the old process manually.'
        logger.error(`[CoreManager] ${message}`)
        throw new Error(message)
      }

      logger.info('[CoreManager] Previous Node core stopped. Starting a fresh instance.')
    } else {
      const conflictMessage =
        `Port ${API_PORT} is already in use by another process on ${API_HOST}. ` +
        'Close the conflicting process and restart MomAI.'

      logger.error(`[CoreManager] ${conflictMessage}`)
      const mainWindow = getMainWindow()
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('bootstrap-error', {
          type: 'startup_failed',
          message: 'Node core failed to start',
          details: conflictMessage
        })
      }
      throw new Error(conflictMessage)
    }
  }

  coreReadyPromise = new Promise<void>((resolve, reject) => {
    coreReadyResolve = resolve
    coreReadyReject = reject
  })

  try {
    const child = spawnNodeCore()
    setNodeCoreProcess(child)
    emitInitProgress('Initializing services...', 30)

    // Start Python sidecar proactively at app startup (non-blocking),
    // so voice/TTS is warm before the first user message.
    // Skip if Lite mode or if onboarding is not finished yet (tier unknown).
    const tier = getCurrentTier()
    if (tier && tier !== 'lite') {
      void ensurePythonSidecar()
        .then((result) => {
          if (result.ok) {
            logger.info('[CoreManager] Python sidecar prestarted successfully.')
          } else {
            logger.warn('[CoreManager] Python sidecar prestart failed:', result.error)
          }
        })
        .catch((error: any) => {
          logger.warn('[CoreManager] Python sidecar prestart exception:', error?.message || error)
        })
    }
  } catch (error: any) {
    logger.error('[CoreManager] Could not spawn node core:', error)
    const mainWindow = getMainWindow()
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('bootstrap-error', {
        type: 'startup_failed',
        message: 'Node core failed to start',
        details: error?.message || 'Unknown startup error'
      })
    }
    throw error
  }

  const timeout = setTimeout(() => {
    if (coreReadyReject) {
      coreReadyReject(new Error('Timed out waiting for node core startup'))
    }
  }, CORE_BOOT_TIMEOUT_MS)

  try {
    if (coreReadyPromise) await coreReadyPromise
    restartAttempts = 0
  } finally {
    clearTimeout(timeout)
    coreReadyPromise = null
    coreReadyResolve = null
    coreReadyReject = null
  }
}

export async function shutdownCoreBackend(): Promise<void> {
  isStoppingCore = true

  logger.info('[CoreManager] Iniciando shutdown...')

  const child = state.nodeCoreProcess
  if (child && child.exitCode === null && !child.killed) {
    const pid = child.pid
    logger.info(`[CoreManager] Encerrando Node core (PID ${pid})...`)

    if (process.platform === 'win32') {
      try {
        execSync(`taskkill /pid ${pid} /t /f`, { stdio: 'ignore' })
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 500))
    } else {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          try { child.kill('SIGKILL') } catch {}
          resolve()
        }, 3000)

        child.once('exit', () => {
          clearTimeout(timer)
          resolve()
        })

        try { child.kill('SIGTERM') } catch { clearTimeout(timer); resolve() }
      })
    }
  }

  setNodeCoreProcess(null)

  killAllLlamaServers()

  if (isPythonRunning()) {
    await shutdownPython()
  }

  if (process.platform === 'win32') {
    killProcessOnPort(API_PORT)
    killProcessOnPort(Number(process.env.MOMAI_PYTHON_SIDECAR_PORT || 8001))
  }

  logger.info('[CoreManager] Shutdown completo.')
}

export async function restartCoreBackend(): Promise<{ success: boolean; error?: string }> {
  try {
    isStoppingCore = true
    const child = state.nodeCoreProcess
    if (child && child.exitCode === null && !child.killed) {
      child.kill('SIGTERM')
      await new Promise((resolve) => setTimeout(resolve, 800))
    }

    // Also restart Python so it reloads with the new tier/environment settings.
    if (isPythonRunning()) {
      logger.info('[CoreManager] Restarting Python sidecar due to tier/backend change...')
      await killPythonBackend()
    }

    isStoppingCore = false
    await startCoreBackend()
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error?.message || 'Failed to restart core' }
  }
}
