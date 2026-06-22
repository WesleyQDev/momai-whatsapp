import { app as _app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, realpathSync, cpSync } from 'fs'
import { cp } from 'fs/promises'
import { logger } from '../../logger'

export function resolveUserDataPath(rawPath: string): string {
  // Em modo de desenvolvimento, não queremos ser redirecionados para a pasta de dados do MSIX instalado.
  // Isso garante que o pnpm run dev use a pasta .dev-data local.
  if (process.env['ELECTRON_RENDERER_URL']) {
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

export function isRunningFromAppImage(): boolean {
  return !!process.env.APPIMAGE || !!process.env.ARGV0
}

export function isRunningFromSnap(): boolean {
  return !!process.env.SNAP_NAME
}

export async function getWritableCorePath(originalCorePath: string): Promise<string> {
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
      cpSync(originalCorePath, tempDir, { recursive: true })
    }
    sendInitProgress('Arquivos prontos.', 9)

    logger.info(`[Bootstrap] Core copied to writable temp: ${tempDir}`)
    return tempDir
  } catch (e) {
    logger.error('[Bootstrap] Failed to copy core to temp:', e)
    return originalCorePath
  }
}

// Import from other modules to avoid circular dependency
import { readdirSync, rmSync } from 'fs'
import { spawnSync } from 'child_process'
import { sendInitProgress } from '../utils/process-helpers'
import { checkWritePermission } from '../utils/fs-helpers'
