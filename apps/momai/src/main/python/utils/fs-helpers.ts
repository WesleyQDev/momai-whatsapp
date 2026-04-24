import { join } from 'path'
import { existsSync, writeFileSync, unlinkSync, readdirSync, lstatSync, rmSync, statSync } from 'fs'
import { execSync } from 'child_process'

export function checkWritePermission(dir: string): boolean {
  try {
    const testFile = join(dir, '.write_test')
    writeFileSync(testFile, 'test')
    unlinkSync(testFile)
    return true
  } catch {
    return false
  }
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function killAllLlamaServers(): void {
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

export function findVCLibsDirs(): string[] {
  if (process.platform !== 'win32') return []
  try {
    const { programFiles } = process.env
    const programFilesPath = programFiles || 'C:\\Program Files'
    const waDir = join(programFilesPath, 'WindowsApps')
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

export function buildEnv(venvPath: string, dataDir: string, uvExe: string) {
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

export { rmSync, statSync, lstatSync, readdirSync }
