import { app } from 'electron'
import { existsSync, mkdirSync } from 'fs'
import { join, resolve } from 'path'
import { spawn } from 'child_process'
import { API_HOST, API_PORT } from './constants'
import { getMainWindow, setNodeCoreProcess, setIsQuitting, state } from './state'
import { logger } from './logger'
import {
  isPythonRunning,
  shutdownPython,
  startPythonBackend,
  type PythonBackendStartOptions
} from './pythonManager'

const PYTHON_SIDECAR_HOST = API_HOST
const PYTHON_SIDECAR_PORT = Number(process.env.MOMAI_PYTHON_SIDECAR_PORT || 8001)
const CORE_BOOT_TIMEOUT_MS = 60000

type EnsurePythonRequest = {
  type: 'ensure-python'
  requestId: string
}

let coreReadyResolve: (() => void) | null = null
let coreReadyReject: ((error: Error) => void) | null = null
let coreReadyPromise: Promise<void> | null = null
let restartAttempts = 0
let isStoppingCore = false

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

async function ensurePythonSidecar(): Promise<{ ok: boolean; error?: string; baseUrl?: string }> {
  try {
    if (!isPythonRunning()) {
      const options: PythonBackendStartOptions = {
        host: PYTHON_SIDECAR_HOST,
        port: PYTHON_SIDECAR_PORT,
        announceOnline: false,
        reportBootstrapErrors: false
      }
      await startPythonBackend(options)
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
      logger.info('[CoreManager] Node core reported ready.')
      emitInitProgress('System ready.', 100)
      const mainWindow = getMainWindow()
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('backend-online')
      }
      if (coreReadyResolve) coreReadyResolve()
      return
    }

    if (msg.type === 'node-core-log' && msg.message) {
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
    MOMAI_PYTHON_SIDECAR_PORT: String(PYTHON_SIDECAR_PORT)
  }

  const child = spawn(process.execPath, [scriptPath], {
    env,
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc']
  })

  child.stdout?.on('data', (data) => {
    const line = data.toString().trim()
    if (line) logger.info(`[NodeCore] ${line}`)
  })

  child.stderr?.on('data', (data) => {
    const line = data.toString().trim()
    if (line) logger.error(`[NodeCore] ${line}`)
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
  if (state.nodeCoreProcess && !state.nodeCoreProcess.killed && state.nodeCoreProcess.exitCode === null) {
    return
  }

  emitInitProgress('Starting local Node core...', 10)
  isStoppingCore = false

  coreReadyPromise = new Promise<void>((resolve, reject) => {
    coreReadyResolve = resolve
    coreReadyReject = reject
  })

  try {
    const child = spawnNodeCore()
    setNodeCoreProcess(child)
    emitInitProgress('Initializing services...', 60)

    // Start Python sidecar proactively at app startup (non-blocking),
    // so voice/TTS is warm before the first user message.
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
  setIsQuitting(true)

  const child = state.nodeCoreProcess
  if (child && child.exitCode === null && !child.killed) {
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        try {
          child.kill('SIGKILL')
        } catch {}
      }, 3000)

      child.once('exit', () => {
        clearTimeout(timer)
        resolve()
      })

      try {
        child.kill('SIGTERM')
      } catch {
        clearTimeout(timer)
        resolve()
      }
    })
  }

  setNodeCoreProcess(null)

  if (isPythonRunning()) {
    await shutdownPython()
  }
}

export async function restartCoreBackend(): Promise<{ success: boolean; error?: string }> {
  try {
    isStoppingCore = true
    const child = state.nodeCoreProcess
    if (child && child.exitCode === null && !child.killed) {
      child.kill('SIGTERM')
      await new Promise((resolve) => setTimeout(resolve, 800))
    }
    isStoppingCore = false
    await startCoreBackend()
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error?.message || 'Failed to restart core' }
  }
}
