import { join } from 'path'
import { existsSync, readdirSync, lstatSync } from 'fs'
import { is } from '@electron-toolkit/utils'
import { logger } from '../../logger'

export function getPlatformResourceKey(): 'win32' | 'linux' | 'darwin' {
  if (process.platform === 'win32') return 'win32'
  if (process.platform === 'darwin') return 'darwin'
  return 'linux'
}

export function findBundledPythonDir(): string | null {
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

export function findManagedPythonDir(): string | null {
  const uvPythonInstallPath = join(getUserDataPath(), 'uv_python')
  if (!existsSync(uvPythonInstallPath)) return null
  try {
    const entries = readdirSync(uvPythonInstallPath)
    const pythonBin = process.platform === 'win32' ? 'python.exe' : 'python3'
    // Filter to real cpython-3.12.x directories (skip symlinks/junctions like cpython-3.12-...)
    const cpythonDirs = entries
      .filter((e) => /^cpython-3\.12\.\d+/.test(e))
      .filter((e) => {
        try {
          const st = lstatSync(join(uvPythonInstallPath, e))
          return st.isDirectory() && !st.isSymbolicLink()
        } catch {
          return false
        }
      })
      .sort()
      .reverse() // Highest version first

    for (const dir of cpythonDirs) {
      const basePath = join(uvPythonInstallPath, dir)
      const candidates = [basePath, join(basePath, 'install'), join(basePath, 'python')]
      const found = candidates.find((p) => existsSync(join(p, pythonBin)))
      if (found) return found
    }
    return null
  } catch {
    return null
  }
}

export function verifyManagedPython(pythonDir: string): boolean {
  const pythonBin = process.platform === 'win32' ? 'python.exe' : 'python3'
  const pythonExePath = join(pythonDir, pythonBin)
  if (!existsSync(pythonExePath)) return false
  try {
    const result = spawnSync(
      pythonExePath,
      ['-c', 'import sys; print(sys.version)'],
      {
        stdio: 'pipe',
        timeout: 10000,
        env: {
          ...process.env,
          PYTHONHOME: undefined,
          PYTHONPATH: undefined,
          VIRTUAL_ENV: undefined
        } as NodeJS.ProcessEnv
      }
    )
    if (result.status !== 0) {
      throw new Error(
        `python verification failed with status ${result.status}: ${result.stderr || result.error?.message || ''}`
      )
    }
    logger.info('[Bootstrap] Managed Python verification passed')
    return true
  } catch (e) {
    logger.warn('[Bootstrap] Managed Python verification failed:', e)
    return false
  }
}

// Need to import app from electron
import { app } from 'electron'
import { getUserDataPath } from './index'
import { spawnSync } from 'child_process'
