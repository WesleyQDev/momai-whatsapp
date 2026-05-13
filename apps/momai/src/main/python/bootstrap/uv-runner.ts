import { join } from 'path'
import { existsSync, mkdirSync, rmSync, unlinkSync } from 'fs'
import { spawn } from 'child_process'
import { app } from 'electron'
import { is } from '@electron-toolkit/utils'
import { logger } from '../../logger'
import { getUserDataPath } from './index'
import {
  findBundledPythonDir,
  findManagedPythonDir,
  verifyManagedPython,
  getPlatformResourceKey
} from './python-resolver'
import { removePthFiles } from './venv-manager'
import { sendInitProgress } from '../utils/process-helpers'
import { cp } from 'fs/promises'

export const UV_CACHE_PATH = () => join(getUserDataPath(), 'uv_cache')
export const UV_PYTHON_INSTALL_PATH = () => join(getUserDataPath(), 'uv_python')

export async function ensureUvEnvironment(
  _corePath: string,
  _venvPath: string,
  uvExe: string
): Promise<{ managedPythonDir: string | null; uvBaseEnv: Record<string, string | undefined> }> {
  const userDataPath = getUserDataPath()
  if (!existsSync(userDataPath)) mkdirSync(userDataPath, { recursive: true })
  if (!existsSync(UV_CACHE_PATH())) mkdirSync(UV_CACHE_PATH(), { recursive: true })
  if (!existsSync(UV_PYTHON_INSTALL_PATH()))
    mkdirSync(UV_PYTHON_INSTALL_PATH(), { recursive: true })

  // Migrate old TEMP-based Python installation to userData
  const oldTempPythonPath = join(process.env.TEMP || '', 'momai-uv-python')
  if (existsSync(oldTempPythonPath) && oldTempPythonPath !== UV_PYTHON_INSTALL_PATH()) {
    try {
      rmSync(oldTempPythonPath, { recursive: true, force: true })
      logger.info('[Bootstrap] Cleaned up old TEMP-based Python installation')
    } catch (e) {
      logger.warn('[Bootstrap] Could not clean old Python path:', e)
    }
  }

  const uvBaseEnv: Record<string, string | undefined> = {
    ...process.env,
    UV_PYTHON_INSTALL_DIR: UV_PYTHON_INSTALL_PATH(),
    UV_CACHE_DIR: UV_CACHE_PATH(),
    VIRTUAL_ENV: undefined,
    PYTHONHOME: undefined
  }

  // Step 1: Resolve the Python interpreter to use for venv creation
  const bundledPythonDir = findBundledPythonDir()
  let resolvedPythonDir: string | null = null

  if (bundledPythonDir) {
    logger.info(`[Bootstrap] Using bundled Python: ${bundledPythonDir}`)
    sendInitProgress('Preparando interpretador Python...', 12)

    const isMsixPath = bundledPythonDir.includes('WindowsApps')

    if (isMsixPath) {
      // MSIX: Python in WindowsApps is read-only and blocked from execSync/uv.
      // Copy it to a writable location (userData) so uv venv can use it.
      const writablePythonDir = join(UV_PYTHON_INSTALL_PATH(), 'bundled-python')
      const pythonBin = process.platform === 'win32' ? 'python.exe' : 'python3'

      const isCopyComplete = (dir: string): boolean => {
        // Verify python.exe AND critical stdlib modules exist
        const checks = [
          join(dir, pythonBin),
          join(dir, 'Lib', 'urllib'),
          join(dir, 'Lib', 'importlib'),
          join(dir, 'Lib', 'pathlib.py')
        ]
        return checks.every((p) => existsSync(p))
      }

      const needsCopy =
        !existsSync(join(writablePythonDir, pythonBin)) || !isCopyComplete(writablePythonDir)

      if (needsCopy) {
        if (existsSync(join(writablePythonDir, pythonBin)) && !isCopyComplete(writablePythonDir)) {
          logger.warn(
            '[Bootstrap] MSIX: Existing Python copy is incomplete (missing stdlib). Re-copying...'
          )
        }
        logger.info(`[Bootstrap] MSIX: Copying bundled Python to writable location...`)
        sendInitProgress('Copiando interpretador Python...', 12)
        let copySuccess = false
        try {
          if (existsSync(writablePythonDir)) {
            rmSync(writablePythonDir, { recursive: true, force: true })
          }
          mkdirSync(writablePythonDir, { recursive: true })

          // MSIX VFS: subprocesses can't access WindowsApps paths.
          // Use Node.js async cp() which runs in-process with MSIX package identity.
          await cp(bundledPythonDir, writablePythonDir, { recursive: true })
          logger.info(`[Bootstrap] MSIX: Bundled Python copied to ${writablePythonDir}`)
          copySuccess = true
        } catch (e) {
          logger.error('[Bootstrap] MSIX: Failed to copy bundled Python:', e)
        }

        if (!copySuccess || !isCopyComplete(writablePythonDir)) {
          logger.error(
            '[Bootstrap] MSIX: Python copy is incomplete or failed. Cleaning up partial copy...'
          )
          try {
            if (existsSync(writablePythonDir)) {
              rmSync(writablePythonDir, { recursive: true, force: true })
            }
          } catch {
            // best-effort cleanup
          }
        }
      } else {
        logger.info(`[Bootstrap] MSIX: Writable Python already exists at ${writablePythonDir}`)
      }

      if (isCopyComplete(writablePythonDir)) {
        removePthFiles(writablePythonDir)
        resolvedPythonDir = writablePythonDir
      } else {
        logger.warn('[Bootstrap] MSIX: Writable Python not found after copy, falling back')
      }
    } else {
      // Non-MSIX: use bundled Python directly
      removePthFiles(bundledPythonDir)
      if (verifyManagedPython(bundledPythonDir)) {
        resolvedPythonDir = bundledPythonDir
      } else {
        logger.warn('[Bootstrap] Bundled Python failed verification, falling back to uv download')
      }
    }
  }

  if (!resolvedPythonDir) {
    resolvedPythonDir = findManagedPythonDir()

    if (!resolvedPythonDir) {
      sendInitProgress('Baixando interpretador Python...', 12)
      logger.info(`[Bootstrap] Pre-installing Python 3.12 to ${UV_PYTHON_INSTALL_PATH()}`)
      try {
        await new Promise<void>((resolve) => {
          const child = spawn(uvExe, ['python', 'install', '3.12'], {
            env: uvBaseEnv,
            shell: false,
            stdio: 'pipe'
          })
          let stderr = ''
          child.stdout?.on('data', (data) => {
            const line = data.toString().trim()
            logger.info(`[uv python install] ${line}`)
            if (line.includes('Downloading')) {
              sendInitProgress('Baixando interpretador Python...', 12)
            }
          })
          child.stderr?.on('data', (data) => {
            const line = data.toString().trim()
            stderr += line
            logger.info(`[uv python install stderr] ${line}`)
            if (line.includes('Downloading')) {
              sendInitProgress('Baixando interpretador Python...', 12)
            }
          })
          child.on('close', (code) => {
            if (code === 0) {
              logger.info('[Bootstrap] Python 3.12 pre-installed successfully.')
              resolve()
            } else {
              logger.warn(`[Bootstrap] uv python install exited with code ${code}: ${stderr}`)
              resolve()
            }
          })
          child.on('error', (err) => {
            logger.warn('[Bootstrap] uv python install spawn error:', err)
            resolve()
          })
        })
      } catch {
        logger.warn('[Bootstrap] uv python install failed, will retry in uv venv')
      }

      resolvedPythonDir = findManagedPythonDir()
    }
  }

  // Step 2: Prepare resolved Python for MSIX compatibility
  const managedPythonDir = resolvedPythonDir
  if (managedPythonDir) {
    removePthFiles(managedPythonDir)

    logger.info(`[Bootstrap] Adding Python to PATH: ${managedPythonDir}`)
    uvBaseEnv.PATH = `${managedPythonDir};${join(managedPythonDir, 'DLLs')};${process.env.PATH || ''}`

    if (!managedPythonDir.includes('bundled-python') && !verifyManagedPython(managedPythonDir)) {
      logger.warn('[Bootstrap] Python failed verification')
    }
  }

  return { managedPythonDir, uvBaseEnv }
}

export async function createVenvWithUv(
  uvExe: string,
  venvPath: string,
  managedPythonDir: string | null,
  uvBaseEnv: Record<string, string | undefined>
): Promise<void> {
  const pythonBin = process.platform === 'win32' ? 'python.exe' : 'python3'
  const explicitPython = managedPythonDir ? join(managedPythonDir, pythonBin) : null
  const venvArgs =
    explicitPython && existsSync(explicitPython)
      ? ['venv', venvPath, '--python', explicitPython]
      : ['venv', venvPath, '--python', '3.12']
  logger.info(`[Bootstrap] Running: "${uvExe}" ${venvArgs.join(' ')}`)
  await new Promise<void>((resolve, reject) => {
    const child = spawn(uvExe, venvArgs, {
      env: uvBaseEnv,
      shell: false,
      stdio: 'pipe',
      windowsVerbatimArguments: false
    })
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (data) => {
      const line = data.toString().trim()
      stdout += line
      logger.info(`[uv venv] ${line}`)
      if (line.includes('Downloading')) {
        sendInitProgress('Baixando interpretador Python...', 12)
      } else if (line.includes('Creating virtualenv')) {
        sendInitProgress('Criando ambiente virtual...', 15)
      }
    })
    child.stderr?.on('data', (data) => {
      const line = data.toString().trim()
      stderr += line
      logger.info(`[uv venv stderr] ${line}`)
      if (line.includes('Downloading')) {
        sendInitProgress('Baixando interpretador Python...', 12)
      } else if (line.includes('Creating virtualenv')) {
        sendInitProgress('Criando ambiente virtual...', 15)
      }
    })
    child.on('close', (code) => {
      if (code === 0) {
        logger.info('[Bootstrap] Venv criado com sucesso.')
        try {
          const SYNC_LOCK_FILE = join(getUserDataPath(), '.sync.lock')
          if (existsSync(SYNC_LOCK_FILE)) {
            unlinkSync(SYNC_LOCK_FILE)
            logger.info('[Bootstrap] Sync lock invalidado para forçar reinstall das dependências.')
          }
        } catch (e) {
          logger.warn('[Bootstrap] Não foi possível invalidar sync lock:', e)
        }
        resolve()
      } else {
        logger.error(`[Bootstrap] uv venv failed with code ${code}`)
        logger.error(`[Bootstrap] stderr: ${stderr}`)
        logger.error(`[Bootstrap] stdout: ${stdout}`)
        reject(new Error(stderr || `uv venv failed with code ${code}`))
      }
    })
    child.on('error', (err) => {
      logger.error('[Bootstrap] uv venv spawn error:', err)
      reject(err)
    })
  })
}

export async function syncDependencies(
  uvExe: string,
  _pythonExe: string,
  venvPath: string,
  _corePath: string,
  writableCorePath: string,
  tier: string
): Promise<void> {
  const isDev = is.dev && process.env['ELECTRON_RENDERER_URL']

  // Resolve local wheel cache for offline installation
  const wheelsRoot = isDev
    ? join(app.getAppPath(), 'bin', 'wheels')
    : join(process.resourcesPath, 'wheels')
  const platformWheelsDir = join(wheelsRoot, getPlatformResourceKey())
  const wheelsDir = existsSync(platformWheelsDir) ? platformWheelsDir : wheelsRoot
  const hasLocalWheels = existsSync(wheelsDir)
  const offlineReadyMarker = join(wheelsDir, 'offline-ready.marker')
  const canInstallFullyOffline = hasLocalWheels && existsSync(offlineReadyMarker)

  if (hasLocalWheels) {
    logger.info(`[Bootstrap] Using local wheel cache: ${wheelsDir}`)
    sendInitProgress('Instalando dependências offline...', 25)
  } else {
    logger.info('[Bootstrap] No local wheel cache found, will download from internet')
    sendInitProgress('Instalando dependências...', 25)
  }

  if (!existsSync(UV_CACHE_PATH())) mkdirSync(UV_CACHE_PATH(), { recursive: true })

  const installArgs = ['pip', 'install', '--no-progress', '--cache-dir', UV_CACHE_PATH()]
  if (hasLocalWheels) {
    installArgs.push('--find-links', wheelsDir)
    if (!isDev && canInstallFullyOffline) {
      installArgs.push('--no-index')
      logger.info('[Bootstrap] Offline wheel cache is complete. Using --no-index.')
    } else if (!isDev && hasLocalWheels) {
      logger.warn(
        '[Bootstrap] Offline wheel cache is incomplete. Allowing index fallback for missing packages.'
      )
    }
  }
  if (isDev) {
    installArgs.push('-e', writableCorePath)
  } else {
    installArgs.push(writableCorePath)
  }

  // Tier-based package selection
  if (tier === 'pro' || tier === 'ultra') {
    const isUltra = tier === 'ultra'
    logger.info(
      `[Bootstrap] Modo ${tier.toUpperCase()}: Instalando dependências de Voz (TTS${isUltra ? ' + STT' : ''}).`
    )
    // Remove core package install and use individual packages instead
    const coreIdx = installArgs.indexOf(writableCorePath)
    if (coreIdx !== -1) installArgs.splice(coreIdx, 1)
    // Also remove editable install if present
    const editIdx = installArgs.indexOf('-e')
    if (editIdx !== -1 && installArgs[editIdx + 1] === writableCorePath) {
      installArgs.splice(editIdx, 2)
    }
    installArgs.push(
      'fastapi[standard]',
      'huggingface-hub',
      'httpx',
      'numpy',
      'psutil',
      'sounddevice',
      'kokoro-onnx',
      'sqlalchemy',
      'python-dotenv',
      'onnxruntime'
    )

    if (isUltra) {
      installArgs.push('faster-whisper', 'ctranslate2')
    }
  }

  const pipPythonDir = findBundledPythonDir() || findManagedPythonDir()
  const pipEnv: Record<string, string | undefined> = {
    ...process.env,
    VIRTUAL_ENV: venvPath,
    UV_CACHE_DIR: UV_CACHE_PATH(),
    UV_PYTHON_INSTALL_DIR: UV_PYTHON_INSTALL_PATH(),
    PYTHONHOME: undefined,
    PYTHONPATH: undefined,
    ...(pipPythonDir
      ? {
          PATH: `${pipPythonDir};${join(pipPythonDir, 'DLLs')};${process.env.PATH || ''}`
        }
      : {})
  }

  logger.info(`[Bootstrap] Running: "${uvExe}" ${installArgs.join(' ')}`)
  await new Promise<void>((resolve, reject) => {
    const child = spawn(uvExe, installArgs, {
      env: pipEnv,
      shell: false,
      stdio: 'pipe',
      windowsVerbatimArguments: false
    })
    let stderr = ''
    let stdout = ''
    child.stdout?.on('data', (data) => {
      const line = data.toString().trim()
      stdout += line
      logger.info(`[uv pip] ${line}`)
      if (line.includes('Downloading')) {
        const match = line.match(/Downloading\s+([^\s]+)/)
        if (match) {
          sendInitProgress(`Baixando: ${match[1]}...`, 26)
        }
      } else if (line.includes('Installing')) {
        sendInitProgress('Instalando bibliotecas de IA...', 28)
      }
    })
    child.stderr?.on('data', (data) => {
      const line = data.toString().trim()
      stderr += line
      logger.info(`[uv pip stderr] ${line}`)

      if (line.includes('Downloading')) {
        const match = line.match(/Downloading\s+([^\s]+)/)
        if (match) {
          sendInitProgress(`Baixando: ${match[1]}...`, 26)
        }
      } else if (line.includes('Installing')) {
        sendInitProgress('Instalando bibliotecas de IA...', 28)
      }
    })
    child.on('close', (code) => {
      if (code === 0) {
        logger.info('[Bootstrap] Dependências instaladas com sucesso.')
        resolve()
      } else {
        logger.error(`[Bootstrap] uv pip failed with code ${code}`)
        logger.error(`[Bootstrap] stderr: ${stderr}`)
        logger.error(`[Bootstrap] stdout: ${stdout}`)
        reject(new Error(stderr || `sync failed with code ${code}`))
      }
    })
    child.on('error', reject)
  })
}
