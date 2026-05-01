import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'
import { spawn, spawnSync, execSync } from 'child_process'
import { app as _app } from 'electron'
import { is } from '@electron-toolkit/utils'
import { logger } from '../logger'
import { state, setPythonProcess, setPythonStartTime, setIsQuitting, getMainWindow } from '../state'
import { API_HOST, API_PORT } from '../constants'
import type { BootstrapError, BootstrapErrorType } from '../state'
import type { PythonBackendStartOptions, BootstrapResult } from './types'
import { getCurrentTier } from './bootstrap/tier-detector'
import {
  isOnboardingCompleted,
  bootstrapPython,
  waitForPort,
  isPortReachable,
  waitForPythonExit,
  getUserDataPath
} from './bootstrap'
import { ensureVCRedist } from './bootstrap/vc-redist'
import { killAllLlamaServers } from './utils/fs-helpers'
import {
  sendErrorToRenderer,
  sendInitProgress,
  broadcastPythonStatus
} from './utils/process-helpers'
import { buildEnv } from './utils/fs-helpers'

// Module-level state for Python backend
let restartAttempts = 0
let pythonStartPromise: Promise<void> | null = null
let pythonHealthCheckTimer: ReturnType<typeof setInterval> | null = null
const PYTHON_RUNTIME_RESTART_MAX = 3
let runtimeRestartCount = 0
let lastPythonBackendOptions: PythonBackendStartOptions | null = null

export function stopPythonHealthCheck(): void {
  if (pythonHealthCheckTimer) {
    clearInterval(pythonHealthCheckTimer)
    pythonHealthCheckTimer = null
  }
}

export function startPythonHealthCheck(host: string, port: number): void {
  stopPythonHealthCheck()
  pythonHealthCheckTimer = setInterval(async () => {
    if (state.isQuitting) return
    if (!isPythonRunning()) {
      logger.warn('[Python][HealthCheck] Process not running. Stopping health checks.')
      stopPythonHealthCheck()
      broadcastPythonStatus(false, 'Processo Python encerrado')
      return
    }
    const reachable = await isPortReachable(port, host, 800)
    if (!reachable) {
      logger.warn('[Python][HealthCheck] Port not reachable. Sidecar may be frozen.')
      broadcastPythonStatus(false, 'Python sidecar não responde')
    }
  }, 8000)
}

export async function restartPythonBackend(reason: string): Promise<void> {
  if (state.isQuitting) return
  if (!lastPythonBackendOptions) {
    logger.warn(`[Python] Cannot restart: no previous options stored. Reason: ${reason}`)
    return
  }
  if (runtimeRestartCount >= PYTHON_RUNTIME_RESTART_MAX) {
    logger.error(
      `[Python] Max runtime restarts (${PYTHON_RUNTIME_RESTART_MAX}) reached. Giving up.`
    )
    broadcastPythonStatus(false, 'Máximo de tentativas de reinício atingido')
    return
  }

  runtimeRestartCount++
  logger.warn(
    `[Python] Runtime restart triggered: ${reason} (attempt ${runtimeRestartCount}/${PYTHON_RUNTIME_RESTART_MAX})`
  )
  broadcastPythonStatus(
    false,
    `Reiniciando motor de voz (${runtimeRestartCount}/${PYTHON_RUNTIME_RESTART_MAX})...`
  )

  // Kill any lingering process and wait for port release
  await killPythonBackend()
  await new Promise((resolve) => setTimeout(resolve, 1500))

  try {
    await startPythonBackend(lastPythonBackendOptions)
    logger.info('[Python] Runtime restart succeeded.')
    broadcastPythonStatus(true)
  } catch (err: any) {
    logger.error('[Python] Runtime restart failed:', err)
    broadcastPythonStatus(false, err?.message || 'Falha ao reiniciar motor de voz')
  }
}

export async function startPythonBackend(options: PythonBackendStartOptions = {}): Promise<void> {
  lastPythonBackendOptions = { ...options }
  const desiredHost = options.host || API_HOST
  const desiredPort = options.port ?? API_PORT
  if (isPythonRunning()) return

  // Early exit: tiers that don't use Python avoid the heavy bootstrap cycle
  const tier = getCurrentTier()
  if (!tier) {
    logger.info('[Bootstrap] Backend startup skipped: No tier selected yet.')
    return
  }
  if (tier === 'lite') {
    logger.info('[Bootstrap] Backend startup skipped: Lite mode does not use Python.')
    return
  }

  if (await isPortReachable(desiredPort, desiredHost, 350)) {
    logger.warn(
      `[Electron] Port ${desiredPort} is occupied but no managed Python process is running. Cleaning up...`
    )
    await killProcessOnPort(desiredPort)
    // Small delay to allow the OS to fully release the port
    await new Promise((resolve) => setTimeout(resolve, 800))
  }

  if (pythonStartPromise) {
    await pythonStartPromise
    return
  }

  pythonStartPromise = (async () => {
    try {
      const checkVenvPath = join(getUserDataPath(), 'python_env')
      const pythonExeCheck =
        process.platform === 'win32'
          ? join(checkVenvPath, 'Scripts', 'python.exe')
          : join(checkVenvPath, 'bin', 'python')

      const onboardingCompleted = isOnboardingCompleted()
      state.isFirstLaunch = !existsSync(pythonExeCheck) || !onboardingCompleted

      await ensureVCRedist()

      const result = await bootstrapPython()

      if ('type' in result) {
        sendErrorToRenderer(result as BootstrapError)
        return
      }

      if (!(result as BootstrapResult).pythonExe) {
        logger.info('[Bootstrap] Backend startup bypassed: No Python executable defined.')
        return
      }

      const { pythonExe, corePath, venvPath } = result as BootstrapResult
      const dataDir = join(getUserDataPath(), 'data')
      if (!existsSync(dataDir)) {
        mkdirSync(dataDir, { recursive: true })
      }

      logger.info(`[Electron] Iniciando backend Python em: ${corePath}`)
      logger.info(`[Electron] Python executable: ${pythonExe}`)

      const { uvExe } = result as BootstrapResult
      const env = buildEnv(venvPath, dataDir, uvExe)
      const host = desiredHost
      const port = desiredPort
      const announceOnline = options.announceOnline ?? true
      const reportBootstrapErrors = options.reportBootstrapErrors ?? true
      const isPrimaryBackend = announceOnline || reportBootstrapErrors
      let reachedOnline = false
      env.HOST = host
      env.PORT = String(port)
      env.MOMAI_CORE_PATH = corePath

      let stderrBuffer = ''
      let stdoutLineBuffer = ''

      setPythonStartTime(Date.now())
      const pythonProcess = spawn(pythonExe, ['main.py'], {
        cwd: corePath,
        shell: false,
        stdio: 'pipe',
        env
      })

      setPythonProcess(pythonProcess)
      pythonProcess.stdout?.on('data', (data) => {
        const rawStr = data.toString()

        // Directly output to terminal preserving ANSI, \r, and TUI codes!
        if (is.dev) {
          process.stdout.write(rawStr)
        } else {
          // Fallback for production log files
          const cleanLine = rawStr.trim()
          if (cleanLine) logger.info(`[Python] ${cleanLine}`)
        }

        // Line-buffered processing: accumulate partial lines across data events
        // so that [AUDIO_CHUNK] base64 payloads are never split mid-line.
        stdoutLineBuffer += rawStr
        const parts = stdoutLineBuffer.split(/\r?\n/)
        // Keep the last (potentially incomplete) element in the buffer
        stdoutLineBuffer = parts.pop() || ''

        for (const line of parts) {
          const tLine = line.trim()
          if (!tLine) continue

          // Intercept audio chunks for frontend playback fallback
          if (tLine.startsWith('[AUDIO_CHUNK]')) {
            const audioB64 = tLine.replace('[AUDIO_CHUNK]', '').trim()
            const mainWindow = getMainWindow()
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('play-audio-chunk', audioB64)
            }
            continue
          }

          // Parse init progress
          const INIT_PROGRESS_REGEX = /\[Init (\d+)%\]\s+[^:]+:\s+(.+)/
          const initMatch = tLine.match(INIT_PROGRESS_REGEX)
          if (initMatch) {
            const progress = parseInt(initMatch[1], 10)
            const message = initMatch[2]
            sendInitProgress(message, progress)
          }
        }
      })

      // Wait for the server to be up before notifying renderer to start HTTP requests
      const portTimeout = state.isFirstLaunch ? 120000 : 90000

      waitForPort(port, host, portTimeout)
        .then(() => {
          logger.info(`[Electron] Backend HTTP server is online on ${host}:${port}`)
          reachedOnline = true
          runtimeRestartCount = 0

          // Backend considered "stable" enough to reset retry counter after it's online
          restartAttempts = 0

          broadcastPythonStatus(true)
          startPythonHealthCheck(host, port)

          const window = getMainWindow()
          if (announceOnline && window && !window.isDestroyed()) {
            window.webContents.send('backend-online')
          }
        })
        .catch((err) => {
          logger.error(`[Electron] Failed to detect backend port: ${err.message}`)

          // Send error to renderer when port detection fails
          const window = getMainWindow()
          if (reportBootstrapErrors && window && !window.isDestroyed()) {
            window.webContents.send('bootstrap-error', {
              type: 'startup_failed',
              message: 'Backend failed to start',
              details: `Could not connect to port ${port}. ${err.message}`
            } as BootstrapError)
          }
        })

      pythonProcess.stderr?.setEncoding('utf8')
      pythonProcess.stderr?.on('data', (data: string) => {
        // Limita o buffer para evitar estouro de memória (mantém os últimos 100kb de erros)
        stderrBuffer = (stderrBuffer + data).slice(-100000)
        const lines = data
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter((l) => l.length > 0)
        for (const line of lines) {
          const lower = line.toLowerCase()
          // Classify by Python standard log format: "timestamp - logger - LEVEL - message"
          const isInfo =
            lower.startsWith('info:') ||
            lower.includes(' - info - ') ||
            lower.includes(' info ') ||
            lower.startsWith('successfully') ||
            lower.includes('using loop:') ||
            lower.includes('awaiting initialization') ||
            lower.includes("couldn't access the hub") ||
            lower.includes('connection closed') ||
            lower.includes('connection made') ||
            lower.includes('started server process')

          const isWarning = lower.includes('warning') || lower.includes(' - warning - ')

          const isDebug = lower.includes(' - debug - ') || lower.startsWith('debug:')

          if (isInfo || isDebug) {
            logger.info(`[Python] ${line}`)
          } else if (isWarning) {
            logger.warn(`[Python] ${line}`)
          } else {
            logger.error(`[Python] ${line}`)
          }
        }
      })

      pythonProcess.on('close', (code, signal) => {
        const runDuration = Date.now() - (state.pythonStartTime || 0)
        logger.info(
          `[Python] Processo encerrado com código ${code} e sinal ${signal ?? 'none'} (Duração: ${runDuration}ms)`
        )
        setPythonProcess(null)
        stopPythonHealthCheck()

        void (async () => {
          const backendStillAlive = await isPortReachable(port, host, 500)
          if (backendStillAlive) {
            logger.warn(
              `[Python] Processo pai encerrou, mas backend segue ativo em ${host}:${port}. Ignorando restart.`
            )
            restartAttempts = 0
            return
          }

          const exitedBeforeOnline = !reachedOnline
          const hasNonZeroCode = typeof code === 'number' && code !== 0
          const hasUnexpectedSignal = typeof signal === 'string' && signal !== 'SIGTERM'
          const isAbnormalExit = hasNonZeroCode || hasUnexpectedSignal

          if (!state.isQuitting && isAbnormalExit && exitedBeforeOnline) {
            // Auto-retry once if it crashed during the initial setup/boot phase
            if (restartAttempts < 1) {
              restartAttempts++
              logger.warn(
                `[Python] Crash detectado durante boot (Código: ${code}, Sinal: ${signal ?? 'none'}). Tentando reiniciar (Tentativa ${restartAttempts})...`
              )

              // Notify renderer about retry
              const window = getMainWindow()
              if (isPrimaryBackend && window && !window.isDestroyed()) {
                window.webContents.send('backend-retry')
              }

              setTimeout(() => startPythonBackend(options), 2000)
              return
            }

            logger.warn('[Python] Processo morreu de forma inesperada. Limpando llama-server...')
            killAllLlamaServers()

            let errorType: BootstrapErrorType = 'startup_failed'
            let errorMessage = `Python backend crashed with code ${code}`
            let errorDetails = 'Check logs for more details'

            if (
              stderrBuffer.includes('Microsoft Visual C++ Redistributable') ||
              stderrBuffer.includes('c10.dll') ||
              stderrBuffer.includes('Uma rotina de inicialização') ||
              stderrBuffer.includes('DLL initialization routine failed') ||
              stderrBuffer.includes('Importing the numpy C-extensions failed')
            ) {
              errorType = 'missing_vc_redist'
              errorMessage = 'Microsoft Visual C++ Redistributable is missing'
              errorDetails =
                'This application requires the Visual C++ Redistributable to run AI models. Please install it from: https://aka.ms/vs/17/release/vc_redist.x64.exe'
            }

            const error: BootstrapError = {
              type: errorType,
              message: errorMessage,
              details: errorDetails
            }

            // Reset counter before sending error so manual retries from UI can work
            restartAttempts = 0
            if (reportBootstrapErrors) {
              sendErrorToRenderer(error)
            }
          } else if (!state.isQuitting && isAbnormalExit && !exitedBeforeOnline) {
            logger.warn(
              `[Python] Backend encerrou após ficar online (Código: ${code}, Sinal: ${signal ?? 'none'}). Tentando restart automático...`
            )
            setTimeout(() => restartPythonBackend('Runtime crash after online'), 2000)
          }
        })().catch((err) => {
          logger.error('[Python] Erro ao processar encerramento do backend:', err)
        })
      })

      pythonProcess.on('error', (err) => {
        logger.error('[Python] Erro no processo:', err)
        setPythonProcess(null)
        const error: BootstrapError = {
          type: 'startup_failed',
          message: 'Failed to start Python backend',
          details: err.message
        }
        if (reportBootstrapErrors) {
          sendErrorToRenderer(error)
        }
      })
    } catch (err: any) {
      logger.error('[Electron] Falha ao iniciar backend:', err)
      const error: BootstrapError = {
        type: 'unknown',
        message: 'Unexpected error during startup',
        details: err.message || String(err)
      }
      if (options.reportBootstrapErrors ?? true) {
        sendErrorToRenderer(error)
      }
    } finally {
      pythonStartPromise = null
    }
  })()

  await pythonStartPromise
}

export async function killPythonBackend(): Promise<void> {
  if (!state.pythonProcess || !state.pythonProcess.pid) {
    logger.info('[Electron] Python process não está rodando.')
    return
  }

  const pid = state.pythonProcess.pid
  logger.info(`[Electron] Encerrando Python (PID ${pid})...`)

  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /pid ${pid} /t /f`, { stdio: 'ignore' })
    } else {
      state.pythonProcess.kill('SIGTERM')
      if (await waitForPythonExit(2000)) {
        logger.info('[Electron] Python encerrado graciosamente.')
        return
      }
      state.pythonProcess.kill('SIGKILL')
    }

    if (await waitForPythonExit(1000)) {
      logger.info('[Electron] Python encerrado.')
      return
    }
  } catch (err) {
    logger.error('[Electron] Erro durante shutdown de Python:', err)
  } finally {
    setPythonProcess(null)
    await killProcessOnPort(Number(process.env.MOMAI_PYTHON_SIDECAR_PORT || 8001))
  }
}

export async function killProcessOnPort(port: number): Promise<void> {
  try {
    if (process.platform === 'win32') {
      const { stdout } = spawnSync('cmd', ['/c', `netstat -ano | findstr :${port}`], {
        encoding: 'utf8'
      })
      if (!stdout) return

      const lines = stdout
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.includes('LISTENING'))
      for (const line of lines) {
        const parts = line.split(/\s+/)
        const pid = parts[parts.length - 1]
        if (pid && !isNaN(Number(pid)) && Number(pid) > 0) {
          logger.info(`[Electron] Found orphan on port ${port} (PID ${pid}). Killing...`)
          spawnSync('taskkill', ['/pid', pid, '/f', '/t'], { shell: true })
        }
      }
    } else {
      // Linux/macOS
      spawnSync('sh', ['-c', `lsof -t -i:${port} | xargs kill -9`], { stdio: 'ignore' })
    }
  } catch (err) {
    logger.warn(`[Electron] Failed to kill process on port ${port}:`, err)
  }
}

export async function shutdownPython(): Promise<void> {
  setIsQuitting(true)
  stopPythonHealthCheck()
  await killPythonBackend()
  killAllLlamaServers()
}

export function isPythonRunning(): boolean {
  return (
    state.pythonProcess !== null &&
    !state.pythonProcess.killed &&
    state.pythonProcess.exitCode === null
  )
}


