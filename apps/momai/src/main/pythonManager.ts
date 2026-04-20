import { app } from 'electron'
import { spawn, spawnSync, execSync } from 'child_process'
import { join, resolve } from 'path'
import { createConnection } from 'net'
import {
  existsSync,
  mkdirSync,
  realpathSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  statSync,
  lstatSync,
  unlinkSync,
  rmSync
} from 'fs'
import { cp } from 'fs/promises'
import {
  state,
  setPythonProcess,
  setPythonStartTime,
  setIsQuitting,
  getMainWindow,
  BootstrapError,
  BootstrapErrorType
} from './state'
import { API_HOST, API_PORT } from './constants'
import { is } from '@electron-toolkit/utils'
import { logger } from './logger'

function resolveUserDataPath(rawPath: string): string {
  // Em modo de desenvolvimento, não queremos ser redirecionados para a pasta de dados do MSIX instalado.
  // Isso garante que o pnpm run dev use a pasta .dev-data local.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    return rawPath
  }

  try {
    const localAppData = process.env.LOCALAPPDATA
    const packageFamilyNameEnv = process.env.PACKAGE_FAMILY_NAME

    if (process.platform === 'win32' && localAppData) {
      const buildMsixRoamingPath = (family: string): string =>
        join(localAppData, 'Packages', family, 'LocalCache', 'Roaming', 'MomAI')

      const ensureAndUsePath = (candidate: string): string => {
        if (!existsSync(candidate)) {
          mkdirSync(candidate, { recursive: true })
        }
        logger.info(`[Bootstrap] Using MSIX LocalCache roaming path: ${candidate}`)
        return candidate
      }

      if (packageFamilyNameEnv) {
        return ensureAndUsePath(buildMsixRoamingPath(packageFamilyNameEnv))
      }

      const windowsAppsMatch = process.execPath.match(/WindowsApps\\([^\\]+)\\/i)
      if (windowsAppsMatch?.[1]) {
        // Example full name: Publisher.AppName_0.8.1.0_x64__publisherid
        const fullName = windowsAppsMatch[1]
        const familyMatch = fullName.match(/^(.+?)_[^_]+_[^_]+__(.+)$/)
        if (familyMatch?.[1] && familyMatch?.[2]) {
          const derivedFamily = `${familyMatch[1]}_${familyMatch[2]}`
          return ensureAndUsePath(buildMsixRoamingPath(derivedFamily))
        }
      }

      // Last fallback: find a package folder that looks like MomAI.
      const packagesDir = join(localAppData, 'Packages')
      if (existsSync(packagesDir)) {
        const candidates = readdirSync(packagesDir)
          .filter((name) => /momai/i.test(name))
          .map((name) => buildMsixRoamingPath(name))
          .filter((p) => existsSync(p))

        if (candidates.length > 0) {
          return ensureAndUsePath(candidates[0])
        }
      }
    }

    if (!existsSync(rawPath)) {
      mkdirSync(rawPath, { recursive: true })
    }
    const resolved = realpathSync(rawPath)
    if (resolved !== rawPath) {
      logger.info(`[Bootstrap] userData redirected to: ${resolved}`)
    }
    return resolved
  } catch (e) {
    logger.warn('[Bootstrap] Could not resolve real userData path, using raw path:', e)
    return rawPath
  }
}

const userDataPath = resolveUserDataPath(app.getPath('userData'))
const SYNC_LOCK_FILE = join(userDataPath, '.sync.lock')
const UV_CACHE_PATH = join(userDataPath, 'uv_cache')
const UV_PYTHON_INSTALL_PATH = join(userDataPath, 'uv_python')

export type AITier = 'lite' | 'pro' | 'ultra'

function getCurrentTier(): AITier {
  const storePath = join(userDataPath, 'data', 'node-core-store.json')
  try {
    if (existsSync(storePath)) {
      const data = JSON.parse(readFileSync(storePath, 'utf-8'))
      const tier = data.settings?.ai_tier
      if (tier === 'lite' || tier === 'pro' || tier === 'ultra') return tier
      return 'pro' // Default safe for existing users
    }
  } catch (e) {
    logger.warn('[PythonManager] Error reading tier from store:', e)
  }
  return 'pro'
}

function getPlatformResourceKey(): 'win32' | 'linux' | 'darwin' {
  if (process.platform === 'win32') return 'win32'
  if (process.platform === 'darwin') return 'darwin'
  return 'linux'
}

function findBundledPythonDir(): string | null {
  const isDev = is.dev && process.env['ELECTRON_RENDERER_URL']
  const pythonRoot = isDev
    ? join(app.getAppPath(), 'bin', 'python')
    : join(process.resourcesPath, 'bin', 'python')
  const pythonBin = process.platform === 'win32' ? 'python.exe' : 'python3'

  // Prefer platform-scoped layout to avoid cross-platform artifact clobbering.
  const platformScoped = join(pythonRoot, getPlatformResourceKey())
  if (existsSync(join(platformScoped, pythonBin))) {
    logger.info(`[Bootstrap] Found bundled Python at: ${platformScoped}`)
    return platformScoped
  }

  // Backward compatibility with legacy flat layout (bin/python/*).
  if (existsSync(join(pythonRoot, pythonBin))) {
    logger.info(`[Bootstrap] Found bundled Python at: ${pythonRoot}`)
    return pythonRoot
  }
  return null
}

const ONBOARDING_FILE = join(userDataPath, 'onboarding_completed.json')
const INIT_PROGRESS_REGEX = /\[Init (\d+)%\]\s+[^:]+:\s+(.+)/

interface BootstrapResult {
  pythonExe: string
  corePath: string
  uvExe: string
  venvPath: string
}

interface SyncResult {
  success: boolean
  needsSync: boolean
  lastChecked?: number
}

export function isOnboardingCompleted(): boolean {
  try {
    if (existsSync(ONBOARDING_FILE)) {
      const data = JSON.parse(readFileSync(ONBOARDING_FILE, 'utf8'))
      return data.completed === true
    }
  } catch (err) {
    logger.error('[Bootstrap] Error reading onboarding status:', err)
  }
  return false
}

export function saveOnboardingCompleted(completed: boolean): void {
  try {
    const dataDir = join(userDataPath, 'data')
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true })
    }
    writeFileSync(ONBOARDING_FILE, JSON.stringify({ completed }), 'utf8')
    logger.info(`[Electron] Onboarding status saved: ${completed}`)
  } catch (err) {
    logger.error('[Bootstrap] Error saving onboarding status:', err)
  }
}

function sendErrorToRenderer(error: BootstrapError): void {
  logger.error(`[Bootstrap] Error: ${error.type} - ${error.message}`, error.details || '')

  const mainWindow = getMainWindow()
  if (mainWindow && !mainWindow.isDestroyed()) {
    logger.info('[Bootstrap] Sending error to renderer...')
    mainWindow.webContents.send('bootstrap-error', error)
  } else {
    logger.warn('[Bootstrap] Main window not available, storing error for later...')
    state.lastBootstrapError = error
  }
}

function sendInitProgress(message: string, progress: number): void {
  const mainWindow = getMainWindow()
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('init-progress', { message, progress })
  }
}

function waitForPort(port: number, host: string, timeout = 60000): Promise<void> {
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

function getSyncLock(corePath: string): SyncResult | null {
  try {
    if (!existsSync(SYNC_LOCK_FILE)) return null
    const data = JSON.parse(readFileSync(SYNC_LOCK_FILE, 'utf-8'))

    // A validação por versão do app foi removida para manter a sincronização de dependências
    // atrelada exclusivamente às modificações no arquivo pyproject.toml.

    // Check if pyproject.toml was modified since last successful check
    const pyprojectPath = join(corePath, 'pyproject.toml')
    if (existsSync(pyprojectPath)) {
      const stats = statSync(pyprojectPath)
      if (stats.mtimeMs <= data.lastChecked) {
        return { success: true, needsSync: false, lastChecked: data.lastChecked }
      }
    }

    return null
  } catch {
    return null
  }
}

function setSyncLock(success: boolean): void {
  try {
    writeFileSync(
      SYNC_LOCK_FILE,
      JSON.stringify({
        lastChecked: Date.now(),
        success
      })
    )
  } catch {}
}

function killAllLlamaServers(): void {
  try {
    if (process.platform === 'win32') {
      execSync('taskkill /f /im llama-server.exe', { stdio: 'ignore' })
    } else {
      // macOS/Linux: -f matches full process name, default signal is SIGTERM (safer)
      execSync('pkill -f llama-server', { stdio: 'ignore' })
    }
  } catch {
    // Silently ignore errors if process doesn't exist
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForPythonExit(timeoutMs: number): Promise<boolean> {
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

function checkWritePermission(dir: string): boolean {
  try {
    const testFile = join(dir, '.write_test')
    writeFileSync(testFile, 'test')
    unlinkSync(testFile)
    return true
  } catch {
    return false
  }
}

function isRunningFromAppImage(): boolean {
  return !!process.env.APPIMAGE || !!process.env.ARGV0
}

function isRunningFromSnap(): boolean {
  return !!process.env.SNAP_NAME
}

async function getWritableCorePath(originalCorePath: string): Promise<string> {
  // MSIX: the main process can write via VFS virtualization, but spawned
  // subprocesses (uv, setuptools) do NOT inherit the MSIX package identity
  // and will get PermissionError when accessing WindowsApps paths.
  const isMsixPath = process.platform === 'win32' && /WindowsApps/i.test(originalCorePath)

  if (!isMsixPath && checkWritePermission(originalCorePath)) {
    return originalCorePath
  }

  logger.info('[Bootstrap] Core path is read-only, copying to temp directory...')

  const tempDir = join(process.env.TEMP || '/tmp', 'momai-core-temp')

  try {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true })
    }

    sendInitProgress('Preparando arquivos do sistema...', 7)
    if (isMsixPath) {
      // MSIX VFS: subprocesses can't access WindowsApps paths.
      // Use Node.js async cp() which runs in-process with MSIX package identity
      // and doesn't block the main thread (allows window to render).
      await cp(originalCorePath, tempDir, { recursive: true })
    } else if (process.platform === 'win32') {
      const result = spawnSync(
        'robocopy',
        [originalCorePath, tempDir, '/E', '/NP', '/NFL', '/NDL', '/NJH', '/NJS'],
        { stdio: 'pipe', timeout: 60000, encoding: 'utf8', windowsVerbatimArguments: true }
      )
      if ((result.status ?? 16) >= 8) {
        throw new Error(`robocopy failed with exit code ${result.status}: ${result.stderr || ''}`)
      }
    } else {
      execSync(`cp -r "${originalCorePath}" "${tempDir}"`, { stdio: 'ignore' })
    }
    sendInitProgress('Arquivos prontos.', 9)

    logger.info(`[Bootstrap] Core copied to writable temp: ${tempDir}`)
    return tempDir
  } catch (e) {
    logger.error('[Bootstrap] Failed to copy core to temp:', e)
    return originalCorePath
  }
}

function repairPyvenvCfg(venvPath: string): boolean {
  const pyvenvCfg = join(venvPath, 'pyvenv.cfg')
  if (existsSync(pyvenvCfg)) return true

  logger.warn('[Bootstrap] pyvenv.cfg missing after venv creation, attempting recovery...')

  const pythonDir = findBundledPythonDir() || findManagedPythonDir()
  if (!pythonDir) {
    logger.error('[Bootstrap] No Python found for pyvenv.cfg recovery')
    return false
  }

  try {
    const pythonBin = process.platform === 'win32' ? 'python.exe' : 'python3'
    if (!existsSync(join(pythonDir, pythonBin))) {
      logger.error('[Bootstrap] Could not find Python binary for pyvenv.cfg recovery')
      return false
    }

    writeFileSync(pyvenvCfg, `home = ${pythonDir}\ninclude-system-site-packages = false\n`, 'utf8')
    logger.info(`[Bootstrap] pyvenv.cfg recovered with home = ${pythonDir}`)
    return true
  } catch (e) {
    logger.error('[Bootstrap] Failed to recover pyvenv.cfg:', e)
    return false
  }
}

function findManagedPythonDir(): string | null {
  if (!existsSync(UV_PYTHON_INSTALL_PATH)) return null
  try {
    const entries = readdirSync(UV_PYTHON_INSTALL_PATH)
    const pythonBin = process.platform === 'win32' ? 'python.exe' : 'python3'
    // Filter to real cpython-3.12.x directories (skip symlinks/junctions like cpython-3.12-...)
    const cpythonDirs = entries
      .filter((e) => /^cpython-3\.12\.\d+/.test(e))
      .filter((e) => {
        try {
          const st = lstatSync(join(UV_PYTHON_INSTALL_PATH, e))
          return st.isDirectory() && !st.isSymbolicLink()
        } catch {
          return false
        }
      })
      .sort()
      .reverse() // Highest version first

    for (const dir of cpythonDirs) {
      const basePath = join(UV_PYTHON_INSTALL_PATH, dir)
      const candidates = [basePath, join(basePath, 'install'), join(basePath, 'python')]
      const found = candidates.find((p) => existsSync(join(p, pythonBin)))
      if (found) return found
    }
    return null
  } catch {
    return null
  }
}

function removePthFiles(pythonDir: string): void {
  try {
    const entries = readdirSync(pythonDir)
    for (const entry of entries) {
      if (entry.endsWith('._pth')) {
        const pthPath = join(pythonDir, entry)
        unlinkSync(pthPath)
        logger.info(`[Bootstrap] Removed restrictive ._pth file: ${entry}`)
      }
    }
  } catch (e) {
    logger.warn('[Bootstrap] Could not clean ._pth files:', e)
  }
}

function verifyManagedPython(pythonDir: string): boolean {
  const pythonBin = process.platform === 'win32' ? 'python.exe' : 'python3'
  const pythonExePath = join(pythonDir, pythonBin)
  if (!existsSync(pythonExePath)) return false
  try {
    execSync(`"${pythonExePath}" -c "import sys; print(sys.version)"`, {
      stdio: 'pipe',
      timeout: 10000,
      env: {
        ...process.env,
        PYTHONHOME: undefined,
        PYTHONPATH: undefined,
        VIRTUAL_ENV: undefined
      } as NodeJS.ProcessEnv
    })
    logger.info('[Bootstrap] Managed Python verification passed')
    return true
  } catch (e) {
    logger.warn('[Bootstrap] Managed Python verification failed:', e)
    return false
  }
}

async function createVenvWithPython(pythonExePath: string, venvPath: string): Promise<void> {
  logger.info(`[Bootstrap] Fallback: creating venv via python -m venv at ${venvPath}`)
  await new Promise<void>((resolve, reject) => {
    const child = spawn(pythonExePath, ['-m', 'venv', venvPath], {
      env: {
        ...process.env,
        VIRTUAL_ENV: undefined,
        PYTHONHOME: undefined,
        PYTHONPATH: undefined
      },
      shell: false,
      stdio: 'pipe',
      windowsVerbatimArguments: false
    })
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (data) => {
      const line = data.toString().trim()
      stdout += line
      logger.info(`[python -m venv] ${line}`)
    })
    child.stderr?.on('data', (data) => {
      const line = data.toString().trim()
      stderr += line
      logger.info(`[python -m venv stderr] ${line}`)
    })
    child.on('close', (code) => {
      if (code === 0) {
        logger.info('[Bootstrap] Fallback venv created successfully via python -m venv')
        resolve()
      } else {
        reject(new Error(stderr || stdout || `python -m venv failed with code ${code}`))
      }
    })
    child.on('error', reject)
  })
}

async function checkVenvHealth(pythonExe: string, corePath: string): Promise<boolean> {
  if (!existsSync(pythonExe)) return false

  // 1) Interpreter sanity check
  const interpreterCheck = spawnSync(pythonExe, ['-c', 'import sys; print(sys.version)'], {
    timeout: 5000,
    encoding: 'utf8',
    shell: false,
    env: {
      ...process.env,
      PYTHONHOME: undefined,
      PYTHONPATH: undefined,
      VIRTUAL_ENV: undefined
    }
  })

  if (interpreterCheck.status !== 0) {
    const stderr = (interpreterCheck.stderr || '').toString().trim()
    logger.warn(
      `[Bootstrap] Venv interpreter check failed (code: ${interpreterCheck.status ?? 'unknown'}): ${stderr || 'no stderr output'}`
    )
    return false
  }

  // 2) Required deps check (first run can legitimately miss these before uv pip install)
  const depsProbeScript = [
    'import os, re, sys, tomllib',
    'md = __import__("importlib.metadata", fromlist=["version"])',
    `required_default = ["python-dotenv", "fastapi", "uvicorn", "sqlalchemy", "${getCurrentTier() === 'ultra' ? 'faster-whisper' : ''}", "kokoro-onnx"]`,
    'required_default = [d for d in required_default if d]',
    'dist_names = []',
    'try:',
    '    pyproject = os.path.join(sys.argv[1], "pyproject.toml")',
    '    with open(pyproject, "rb") as f:',
    '        data = tomllib.load(f)',
    '    deps = data.get("project", {}).get("dependencies", []) or []',
    '    for dep in deps:',
    '        if not isinstance(dep, str):',
    '            continue',
    '        name = dep.split(";", 1)[0].strip()',
    '        name = name.split("[", 1)[0].strip()',
    '        name = re.split(r"[<>=!~ ]", name, 1)[0].strip()',
    '        if name:',
    '            dist_names.append(name)',
    'except Exception:',
    '    dist_names = []',
    'critical = [d for d in required_default if not dist_names or d in dist_names]',
    'if not critical:',
    '    critical = required_default',
    'missing = []',
    'for dist in critical:',
    '    try:',
    '        md.version(dist)',
    '    except Exception:',
    '        missing.append(dist)',
    'print(",".join(missing))'
  ].join('\n')

  const depsCheck = spawnSync(pythonExe, ['-c', depsProbeScript, corePath], {
    timeout: 5000,
    encoding: 'utf8',
    shell: false,
    env: {
      ...process.env,
      PYTHONHOME: undefined,
      PYTHONPATH: undefined,
      VIRTUAL_ENV: undefined
    }
  })

  if (depsCheck.status !== 0) {
    const stderr = (depsCheck.stderr || '').toString().trim()
    logger.warn(
      `[Bootstrap] Venv dependency probe failed (code: ${depsCheck.status ?? 'unknown'}): ${stderr || 'no stderr output'}`
    )
    return false
  }

  const missingDeps = (depsCheck.stdout || '').toString().trim()
  if (missingDeps) {
    logger.info(`[Bootstrap] Venv missing dependencies (expected before sync): ${missingDeps}`)
    return false
  }

  return true
}

function isVCRedistInstalled(): boolean {
  if (process.platform !== 'win32') return true

  const regKeys = [
    'HKLM\\SOFTWARE\\Microsoft\\VisualStudio\\14.0\\VC\\Runtimes\\x64',
    'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\VisualStudio\\14.0\\VC\\Runtimes\\x64',
    'HKCU\\SOFTWARE\\Microsoft\\VisualStudio\\14.0\\VC\\Runtimes\\x64',
    'HKCU\\SOFTWARE\\WOW6432Node\\Microsoft\\VisualStudio\\14.0\\VC\\Runtimes\\x64'
  ]

  for (const key of regKeys) {
    try {
      const result = spawnSync('reg', ['query', key, '/v', 'Installed'], {
        encoding: 'utf8',
        timeout: 5000,
        shell: false
      })
      if (result.status === 0 && result.stdout.includes('0x1')) {
        logger.info(`[VCRedist] Found installed at registry key: ${key}`)
        return true
      }
    } catch {
      // key not found, continue
    }
  }

  return false
}

async function runVCRedistInstaller(installerPath: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const installer = spawn(installerPath, ['/install', '/quiet', '/norestart'], {
      shell: false,
      stdio: 'pipe'
    })

    installer.on('close', (code) => {
      if (code === 0 || code === 3010) {
        logger.info(`[VCRedist] Installation succeeded (exit code ${code})`)
        resolve()
      } else {
        reject(new Error(`vc_redist.x64.exe exited with code ${code}`))
      }
    })
    installer.on('error', reject)
  })
}

async function ensureVCRedist(): Promise<void> {
  if (process.platform !== 'win32') return

  if (isVCRedistInstalled()) {
    logger.info('[VCRedist] Visual C++ Redistributable already installed, skipping.')
    return
  }

  logger.info('[VCRedist] Visual C++ Redistributable not found. Installing...')
  sendInitProgress('Instalando Visual C++ Redistributable...', 3)

  // Primary: use the bundled vc_redist.x64.exe from resources/bin (same as NSIS installer)
  const bundledInstaller = join(process.resourcesPath, 'bin', 'vc_redist.x64.exe')

  if (existsSync(bundledInstaller)) {
    logger.info(`[VCRedist] Using bundled installer: ${bundledInstaller}`)
    try {
      await runVCRedistInstaller(bundledInstaller)
      return
    } catch (err: any) {
      logger.warn('[VCRedist] Bundled installer failed, will try download fallback:', err?.message)
    }
  } else {
    logger.warn('[VCRedist] Bundled vc_redist.x64.exe not found, falling back to download...')
  }

  // Fallback: download from Microsoft (dev mode or missing bundle)
  const VC_REDIST_URL = 'https://aka.ms/vs/17/release/vc_redist.x64.exe'
  const tempDir = process.env.TEMP || app.getPath('temp')
  const downloadedInstaller = join(tempDir, 'vc_redist.x64.exe')

  try {
    await new Promise<void>((resolve, reject) => {
      const ps = spawn(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          `Invoke-WebRequest -Uri '${VC_REDIST_URL}' -OutFile '${downloadedInstaller}' -UseBasicParsing`
        ],
        { shell: false, stdio: 'pipe' }
      )
      ps.on('close', (code) => {
        if (code === 0) resolve()
        else reject(new Error(`PowerShell download exited with code ${code}`))
      })
      ps.on('error', reject)
    })

    logger.info(`[VCRedist] Downloaded to ${downloadedInstaller}`)
    sendInitProgress('Instalando Visual C++ Redistributable...', 4)

    await runVCRedistInstaller(downloadedInstaller)
  } catch (err: any) {
    logger.error('[VCRedist] Failed to install Visual C++ Redistributable:', err?.message || err)
    // Non-fatal: continue bootstrap anyway.
  } finally {
    try {
      unlinkSync(downloadedInstaller)
    } catch {
      // cleanup is best-effort
    }
  }
}

async function bootstrapPython(targetTier?: AITier): Promise<BootstrapResult | BootstrapError> {
  const tier = targetTier || getCurrentTier()
  logger.info(`[Bootstrap] Iniciando bootstrap para o tier: ${tier.toUpperCase()}`)

  if (tier === 'lite') {
    logger.info('[Bootstrap] Modo Lite detectado. Pulando instalação do Python.')
    return {
      status: 'ok',
      pythonExe: '',
      venvPath: '',
      isNew: false
    }
  }

  const isDev = is.dev && process.env['ELECTRON_RENDERER_URL']

  const corePath = isDev
    ? resolve(app.getAppPath(), '..', 'core')
    : join(process.resourcesPath, 'core')

  const venvPath = join(userDataPath, 'python_env')
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
      execSync(`chmod +x "${uvExe}"`, { stdio: 'ignore' })
      logger.info(`[Bootstrap] chmod +x applied to ${uvExe}`)

      const bundledPython = join(process.resourcesPath, 'bin', 'python', 'bin', 'python3')
      if (existsSync(bundledPython)) {
        execSync(`chmod +x "${bundledPython}"`, { stdio: 'ignore' })
        logger.info(`[Bootstrap] chmod +x applied to bundled python`)
      }
    } catch (e) {
      logger.warn(`[Bootstrap] Could not chmod +x binaries: ${e}`)
    }
  }

  if (!checkWritePermission(userDataPath)) {
    const isAppImage = isRunningFromAppImage()
    const isSnap = isRunningFromSnap()

    let errorDetails = `Path: ${userDataPath}. Check antivirus or run as administrator.`
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

    if (!existsSync(userDataPath)) mkdirSync(userDataPath, { recursive: true })
    if (!existsSync(UV_CACHE_PATH)) mkdirSync(UV_CACHE_PATH, { recursive: true })
    if (!existsSync(UV_PYTHON_INSTALL_PATH)) mkdirSync(UV_PYTHON_INSTALL_PATH, { recursive: true })

    // Migrate old TEMP-based Python installation to userData
    const oldTempPythonPath = join(process.env.TEMP || app.getPath('temp'), 'momai-uv-python')
    if (existsSync(oldTempPythonPath) && oldTempPythonPath !== UV_PYTHON_INSTALL_PATH) {
      try {
        rmSync(oldTempPythonPath, { recursive: true, force: true })
        logger.info('[Bootstrap] Cleaned up old TEMP-based Python installation')
      } catch (e) {
        logger.warn('[Bootstrap] Could not clean old Python path:', e)
      }
    }

    const uvBaseEnv: Record<string, string | undefined> = {
      ...process.env,
      UV_PYTHON_INSTALL_DIR: UV_PYTHON_INSTALL_PATH,
      UV_CACHE_DIR: UV_CACHE_PATH,
      VIRTUAL_ENV: undefined,
      PYTHONHOME: undefined
    }

    // Step 1: Resolve the Python interpreter to use for venv creation
    // Priority: bundled CPython (bin/python/) > managed (uv_python/) > download via uv
    // Bundled Python works in both dev (apps/momai/bin/python/) and production (resources/bin/python/)
    const bundledPythonDir = findBundledPythonDir()
    let resolvedPythonDir: string | null = null

    if (bundledPythonDir) {
      logger.info(`[Bootstrap] Using bundled Python: ${bundledPythonDir}`)
      sendInitProgress('Preparando interpretador Python...', 12)

      const isMsixPath = bundledPythonDir.includes('WindowsApps')

      if (isMsixPath) {
        // MSIX: Python in WindowsApps is read-only and blocked from execSync/uv.
        // Copy it to a writable location (userData) so uv venv can use it.
        const writablePythonDir = join(UV_PYTHON_INSTALL_PATH, 'bundled-python')
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
          if (
            existsSync(join(writablePythonDir, pythonBin)) &&
            !isCopyComplete(writablePythonDir)
          ) {
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
        logger.info(`[Bootstrap] Pre-installing Python 3.12 to ${UV_PYTHON_INSTALL_PATH}`)
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

    // Step 3: Create venv using explicit python path when available (avoids MSIX query issues)
    try {
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
              if (existsSync(SYNC_LOCK_FILE)) {
                unlinkSync(SYNC_LOCK_FILE)
                logger.info(
                  '[Bootstrap] Sync lock invalidado para forçar reinstall das dependências.'
                )
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
          await createVenvWithPython(explicitPython, venvPath)
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

    try {
      if (!existsSync(UV_CACHE_PATH)) mkdirSync(UV_CACHE_PATH, { recursive: true })

      const installArgs = ['pip', 'install', '--no-progress', '--cache-dir', UV_CACHE_PATH]
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
        const fortscriptPath = join(app.getAppPath(), '..', 'fortscript')
        if (existsSync(fortscriptPath)) {
          installArgs.push(fortscriptPath)
        }
      } else {
        installArgs.push(writableCorePath)
      }

      // Tier-based package selection
      // Ultra uses the same base as Pro (Phase 1), then adds STT packages in Phase 2
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
        UV_CACHE_DIR: UV_CACHE_PATH,
        UV_PYTHON_INSTALL_DIR: UV_PYTHON_INSTALL_PATH,
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

/**
 * Find VC++ Runtime (VCLibs) framework package directories for MSIX.
 * Child processes spawned outside the MSIX VFS need these paths in PATH.
 */
function findVCLibsDirs(): string[] {
  if (process.platform !== 'win32') return []
  try {
    const programFiles = process.env.ProgramFiles || 'C:\\Program Files'
    const waDir = join(programFiles, 'WindowsApps')
    if (!existsSync(waDir)) return []
    const entries = readdirSync(waDir, { withFileTypes: true })
    return entries
      .filter(
        (e) =>
          e.isDirectory() &&
          e.name.startsWith('Microsoft.VCLibs.140.00') &&
          e.name.includes('Desktop')
      )
      .map((e) => join(waDir, e.name))
      .filter((d) => existsSync(join(d, 'vcruntime140.dll')))
  } catch {
    return []
  }
}

function buildEnv(venvPath: string, dataDir: string, uvExe: string) {
  const isWin = process.platform === 'win32'
  const systemLocale = process.env.LC_ALL || process.env.LANG || 'C.UTF-8'

  let envPath = process.env.PATH || ''
  if (isWin) {
    const sysRoot = process.env.SystemRoot || 'C:\\Windows'
    const system32 = join(sysRoot, 'System32')
    const sitePackages = join(venvPath, 'Lib', 'site-packages')
    const pkgDirs: string[] = []
    for (const pkg of ['onnxruntime', 'ctranslate2']) {
      for (const sub of ['', 'capi', 'libs']) {
        pkgDirs.push(join(sitePackages, pkg, ...(sub ? [sub] : [])))
      }
      pkgDirs.push(join(sitePackages, `${pkg}.libs`))
    }
    // Find VCLibs framework package dir for MSIX child processes
    const vcLibsDirs = findVCLibsDirs()
    const dllDirs = [...pkgDirs, ...vcLibsDirs, system32, sysRoot].filter((d) => {
      try {
        return existsSync(d)
      } catch {
        return false
      }
    })
    envPath = [...dllDirs, envPath].join(';')
  }

  const base: Record<string, string | undefined> = {
    PATH: envPath,
    TEMP: process.env.TEMP,
    TMP: process.env.TMP,
    VIRTUAL_ENV: venvPath,
    MOMAI_DATA_DIR: dataDir,
    MOMAI_UV_BIN: uvExe,
    PYTHONIOENCODING: 'utf-8',
    PYTHONUTF8: '1',
    PYTHONUNBUFFERED: '1',
    PYTHONOPTIMIZE: '1',
    PYTHONDONTWRITEBYTECODE: '0',
    FORCE_COLOR: '1',
    LC_ALL: systemLocale
  }

  if (isWin) {
    // Windows-specific environment variables
    base.SystemRoot = process.env.SystemRoot
    base.WINDIR = process.env.WINDIR || process.env.SystemRoot
    base.SystemDrive = process.env.SystemDrive
    base.COMSPEC = process.env.COMSPEC
    base.PATHEXT = process.env.PATHEXT
    base.USERPROFILE = process.env.USERPROFILE
    base.APPDATA = process.env.APPDATA
    base.LOCALAPPDATA = process.env.LOCALAPPDATA
  } else {
    // Linux/macOS-specific environment variables
    base.HOME = process.env.HOME
    base.USER = process.env.USER
    base.SHELL = process.env.SHELL
    base.XDG_CONFIG_HOME = process.env.XDG_CONFIG_HOME
    base.XDG_DATA_HOME = process.env.XDG_DATA_HOME
    base.XDG_CACHE_HOME = process.env.XDG_CACHE_HOME
    base.DBUS_SESSION_BUS_ADDRESS = process.env.DBUS_SESSION_BUS_ADDRESS
    base.DISPLAY = process.env.DISPLAY
  }

  return base
}

let restartAttempts = 0
let pythonStartPromise: Promise<void> | null = null

export interface PythonBackendStartOptions {
  host?: string
  port?: number
  announceOnline?: boolean
  reportBootstrapErrors?: boolean
}

export async function startPythonBackend(options: PythonBackendStartOptions = {}): Promise<void> {
  const desiredHost = options.host || API_HOST
  const desiredPort = options.port ?? API_PORT
  if (isPythonRunning()) return
  if (await isPortReachable(desiredPort, desiredHost, 300)) {
    logger.info(
      `[Electron] Python backend already reachable on ${desiredHost}:${desiredPort}, skipping spawn.`
    )
    return
  }

  if (pythonStartPromise) {
    await pythonStartPromise
    return
  }

  pythonStartPromise = (async () => {
    try {
      const checkVenvPath = join(userDataPath, 'python_env')
      const pythonExeCheck =
        process.platform === 'win32'
          ? join(checkVenvPath, 'Scripts', 'python.exe')
          : join(checkVenvPath, 'bin', 'python')

      const onboardingCompleted = isOnboardingCompleted()
      state.isFirstLaunch = !existsSync(pythonExeCheck) || !onboardingCompleted

      await ensureVCRedist()

      const result = await bootstrapPython()

      if ('type' in result) {
        sendErrorToRenderer(result)
        return
      }

      const { pythonExe, corePath, venvPath } = result
      const dataDir = join(userDataPath, 'data')
      if (!existsSync(dataDir)) {
        mkdirSync(dataDir, { recursive: true })
      }

      logger.info(`[Electron] Iniciando backend Python em: ${corePath}`)
      logger.info(`[Electron] Python executable: ${pythonExe}`)

      const { uvExe } = result
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

          // Backend considered "stable" enough to reset retry counter after it's online
          restartAttempts = 0

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
              `[Python] Backend encerrou após ficar online (Código: ${code}, Sinal: ${signal ?? 'none'}). Ignorando retry de boot para evitar loop de loading.`
            )
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

async function killPythonBackend(): Promise<void> {
  if (!state.pythonProcess || !state.pythonProcess.pid) {
    logger.info('[Electron] Python process não está rodando.')
    return
  }

  const pid = state.pythonProcess.pid
  logger.info(`[Electron] Encerrando Python (PID ${pid})...`)

  try {
    state.pythonProcess.kill('SIGTERM')
    if (await waitForPythonExit(2000)) {
      logger.info('[Electron] Python encerrado graciosamente.')
      return
    }

    if (process.platform === 'win32') {
      await new Promise<void>((resolve) => {
        const child = spawn('taskkill', ['/pid', String(pid), '/f', '/t'], { shell: true })
        child.on('close', () => resolve())
        child.on('error', () => resolve())
      })
    } else {
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
  }
}

export async function shutdownPython(): Promise<void> {
  setIsQuitting(true)
  await killPythonBackend()
  await delay(1000)
  killAllLlamaServers()
}

export function isPythonRunning(): boolean {
  return (
    state.pythonProcess !== null &&
    !state.pythonProcess.killed &&
    state.pythonProcess.exitCode === null
  )
}
