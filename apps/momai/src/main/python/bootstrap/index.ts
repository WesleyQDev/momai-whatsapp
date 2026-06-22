import { join } from 'path'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync, rmSync, chmodSync } from 'fs'
import { createConnection } from 'net'
import { app } from 'electron'
import { is } from '@electron-toolkit/utils'
import { logger } from '../../logger'
import { state } from '../../state'
import type { AITier, BootstrapResult, SyncResult } from '../types'
import { getCurrentTier } from './tier-detector'
import {
  resolveUserDataPath,
  isRunningFromAppImage,
  isRunningFromSnap,
  getWritableCorePath
} from './env-resolver'
import { createVenvWithPython, checkVenvHealth, repairPyvenvCfg } from './venv-manager'
import { ensureUvEnvironment, createVenvWithUv, syncDependencies } from './uv-runner'
import { sendInitProgress } from '../utils/process-helpers'
import { checkWritePermission, delay } from '../utils/fs-helpers'
import type { BootstrapError } from '../../state'

// Lazy initialization to avoid accessing app before it's ready
let _userDataPath: string | null = null
export function getUserDataPath(): string {
  if (!_userDataPath) {
    _userDataPath = resolveUserDataPath(app.getPath('userData'))
  }
  return _userDataPath
}

const getSyncLockFile = () => join(getUserDataPath(), '.sync.lock')
export const UV_CACHE_PATH = () => join(getUserDataPath(), 'uv_cache')
export const UV_PYTHON_INSTALL_PATH = () => join(getUserDataPath(), 'uv_python')

const getOnboardingFile = () => join(getUserDataPath(), 'onboarding_completed.json')

export function isOnboardingCompleted(): boolean {
  try {
    const file = getOnboardingFile()
    if (existsSync(file)) {
      const data = JSON.parse(readFileSync(file, 'utf8'))
      return data.completed === true
    }
  } catch (err) {
    logger.error('[Bootstrap] Error reading onboarding status:', err)
  }
  return false
}

export function saveOnboardingCompleted(completed: boolean): void {
  try {
    const dataDir = join(getUserDataPath(), 'data')
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true })
    }
    writeFileSync(getOnboardingFile(), JSON.stringify({ completed }), 'utf8')
    logger.info(`[Electron] Onboarding status saved: ${completed}`)
  } catch (err) {
    logger.error('[Bootstrap] Error saving onboarding status:', err)
  }
}

export function getSyncLock(corePath: string): SyncResult | null {
  try {
    const file = getSyncLockFile()
    if (!existsSync(file)) return null
    const data = JSON.parse(readFileSync(file, 'utf-8'))

    // Re-sync if either pyproject.toml OR the bootstrap installer
    // (uv-runner.ts) was modified since last successful check. The
    // installer is the source of truth for the hardcoded pip package
    // list — if a new package is added there (e.g. slowapi in M5),
    // we need to re-install even if pyproject.toml is unchanged.
    const pyprojectPath = join(corePath, 'pyproject.toml')
    const installerPath = join(__dirname, 'uv-runner.ts')
    const sources = [pyprojectPath, installerPath].filter((p) => existsSync(p))
    const newestMtime = sources.reduce(
      (max, p) => Math.max(max, statSync(p).mtimeMs),
      0
    )
    if (sources.length > 0 && newestMtime <= data.lastChecked) {
      return { success: true, needsSync: false, lastChecked: data.lastChecked }
    }

    return null
  } catch {
    return null
  }
}

export function setSyncLock(success: boolean): void {
  try {
    writeFileSync(
      getSyncLockFile(),
      JSON.stringify({
        lastChecked: Date.now(),
        success
      })
    )
  } catch {}
}

export function isPortReachable(port: number, host: string, timeoutMs = 400): Promise<boolean> {
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

export function waitForPort(port: number, host: string, timeout = 60000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now()
    const check = () => {
      if (Date.now() - start > timeout) {
        reject(new Error(`Timeout waiting for port ${port}`))
        return
      }

      const sock = createConnection(port, host)
      sock.setTimeout(200) // Fast timeout for connection attempt

      const cleanup = () => {
        sock.removeAllListeners()
        sock.destroy()
      }

      sock.on('connect', () => {
        cleanup()
        resolve()
      })
      sock.on('error', () => {
        cleanup()
        setTimeout(check, 300) // Fast retry
      })
      sock.on('timeout', () => {
        cleanup()
        setTimeout(check, 300) // Fast retry
      })
    }
    check()
  })
}

export async function waitForPythonExit(timeoutMs: number): Promise<boolean> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (
      !state.pythonProcess ||
      state.pythonProcess.killed ||
      state.pythonProcess.exitCode !== null
    ) {
      return true
    }
    await delay(100)
  }
  return false
}

export async function bootstrapPython(
  targetTier?: AITier
): Promise<BootstrapResult | BootstrapError> {
  const tier = targetTier || getCurrentTier()
  if (!tier) {
    logger.info('[Bootstrap] Nenhum tier selecionado ainda. Aguardando onboarding...')
    return {
      status: 'ok',
      pythonExe: '',
      corePath: '',
      uvExe: '',
      venvPath: '',
      isNew: false
    }
  }
  logger.info(`[Bootstrap] Iniciando bootstrap para o tier: ${tier.toUpperCase()}`)

  if (tier === 'lite') {
    logger.info('[Bootstrap] Modo Lite detectado. Pulando instalação do Python.')
    return {
      status: 'ok',
      pythonExe: '',
      corePath: '',
      uvExe: '',
      venvPath: '',
      isNew: false
    }
  }

  const isDev = is.dev && process.env['ELECTRON_RENDERER_URL']

  const corePath = isDev
    ? join(app.getAppPath(), '..', 'core')
    : join(process.resourcesPath, 'core')

  const venvPath = join(getUserDataPath(), 'python_env')
  const pythonExe =
    process.platform === 'win32'
      ? join(venvPath, 'Scripts', 'python.exe')
      : join(venvPath, 'bin', 'python')

  sendInitProgress('Verificando integridade do sistema...', 5)

  const uvExe = isDev
    ? 'uv'
    : join(process.resourcesPath, 'bin', process.platform === 'win32' ? 'uv.exe' : 'uv')

  logger.info(`[Bootstrap] Verificando ambiente em: ${venvPath}`)
  logger.info(`[Bootstrap] Core path: ${corePath}`)
  logger.info(`[Bootstrap] UV path: ${uvExe}`)

  if (!existsSync(corePath)) {
    const error: BootstrapError = {
      type: 'startup_failed',
      message: 'Core directory not found',
      details: `Expected path: ${corePath}`
    }
    return error
  }

  const isUvCommand = !uvExe.includes('/') && !uvExe.includes('\\')

  if (!isUvCommand && !existsSync(uvExe)) {
    const error: BootstrapError = {
      type: 'uv_not_found',
      message: 'uv executable not found',
      details: `Expected at: ${uvExe}. This is a installation error.`
    }
    return error
  }

  // On Linux/macOS, ensure the uv and python binaries are executable
  if (process.platform !== 'win32' && !isUvCommand && existsSync(uvExe)) {
    try {
      chmodSync(uvExe, 0o755)
      logger.info(`[Bootstrap] chmod +x applied to ${uvExe}`)

      const bundledPython = join(process.resourcesPath, 'bin', 'python', 'bin', 'python3')
      if (existsSync(bundledPython)) {
        chmodSync(bundledPython, 0o755)
        logger.info(`[Bootstrap] chmod +x applied to bundled python`)
      }
    } catch (e) {
      logger.warn(`[Bootstrap] Could not chmod +x binaries: ${e}`)
    }
  }

  if (!checkWritePermission(getUserDataPath())) {
    const isAppImage = isRunningFromAppImage()
    const isSnap = isRunningFromSnap()

    let errorDetails = `Path: ${getUserDataPath()}. Check antivirus or run as administrator.`
    if (isAppImage) {
      errorDetails = `Running from AppImage with read-only filesystem. Extract the AppImage to a writable location or use the --appimage-extract option.`
    } else if (isSnap) {
      errorDetails = `Running from Snap with read-only filesystem. Use classic confinement or install via other method.`
    }

    const error: BootstrapError = {
      type: 'permission_denied',
      message: 'Cannot write to user data directory',
      details: errorDetails
    }
    return error
  }

  // PARALLEL: Create venv AND prepare sync in parallel
  const writableCorePath = await getWritableCorePath(corePath)
  let isHealthy = await checkVenvHealth(pythonExe, corePath)
  const needsVenv = !existsSync(pythonExe) || !isHealthy

  if (needsVenv) {
    if (!isHealthy && existsSync(pythonExe)) {
      logger.warn(
        '[Bootstrap] Ambiente detectado como corrompido ou incompleto. Forçando recriação...'
      )
      try {
        if (existsSync(venvPath)) {
          rmSync(venvPath, { recursive: true, force: true })
          logger.info('[Bootstrap] Ambiente antigo removido para recriação.')
        }
      } catch (e) {
        logger.error('[Bootstrap] Erro ao remover ambiente antigo:', e)
      }
    }
    logger.info('[Bootstrap] Ambiente não encontrado. Iniciando setup com uv...')
    sendInitProgress('Criando ambiente isolado...', 10)

    const { managedPythonDir, uvBaseEnv } = await ensureUvEnvironment(corePath, venvPath, uvExe)

    try {
      await createVenvWithUv(uvExe, venvPath, managedPythonDir, uvBaseEnv)
    } catch (err: any) {
      const errText = err?.message || String(err)
      const pythonBin = process.platform === 'win32' ? 'python.exe' : 'python3'
      const explicitPython = managedPythonDir ? join(managedPythonDir, pythonBin) : null
      const canFallbackToStdlibVenv =
        !!explicitPython &&
        existsSync(explicitPython) &&
        /Failed to inspect Python interpreter|Querying Python at .* failed|0xc0000135/i.test(
          errText
        )

      if (canFallbackToStdlibVenv) {
        logger.warn(
          '[Bootstrap] uv venv failed due to interpreter inspection. Falling back to python -m venv (MSIX compatibility).'
        )
        try {
          await createVenvWithPython(explicitPython!, venvPath)
        } catch (fallbackErr: any) {
          const error: BootstrapError = {
            type: 'venv_failed',
            message: 'Failed to create Python virtual environment',
            details: `${errText}\nFallback failed: ${fallbackErr?.message || String(fallbackErr)}`
          }
          return error
        }
      } else {
        const error: BootstrapError = {
          type: 'venv_failed',
          message: 'Failed to create Python virtual environment',
          details: errText
        }
        return error
      }
    }

    if (!repairPyvenvCfg(venvPath)) {
      logger.error('[Bootstrap] pyvenv.cfg could not be verified or repaired')
    }
  }

  // PARALLEL: Sync dependencies while continuing
  const syncLock = getSyncLock(corePath)
  // Re-check health after potential venv recreation
  if (needsVenv) isHealthy = await checkVenvHealth(pythonExe, corePath)

  if (!syncLock || syncLock.needsSync || !isHealthy) {
    if (!isHealthy && existsSync(pythonExe)) {
      logger.warn(
        '[Bootstrap] Ambiente detectado como corrompido ou incompleto. Forçando sincronização...'
      )
    }
    logger.info('[Bootstrap] Sincronizando dependências do core...')

    try {
      await syncDependencies(uvExe, pythonExe, venvPath, corePath, writableCorePath, tier)
      logger.info('[Bootstrap] Dependências sincronizadas com sucesso.')
      setSyncLock(true)
    } catch (err: any) {
      logger.error('[Bootstrap] Erro ao sincronizar dependências:', err.message || err)
      setSyncLock(false)
      const error: BootstrapError = {
        type: 'sync_failed',
        message: 'Failed to install Python dependencies',
        details: err.message || String(err)
      }
      return error
    }
  } else {
    logger.info('[Bootstrap] Sincronização ignorada (verificado recentemente).')
  }

  return { pythonExe, corePath: writableCorePath, uvExe, venvPath }
}
