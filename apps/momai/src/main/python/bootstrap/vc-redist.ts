import { join } from 'path'
import { existsSync, unlinkSync } from 'fs'
import { spawn, spawnSync } from 'child_process'
import { app } from 'electron'
import { logger } from '../../logger'
import { sendInitProgress } from '../utils/process-helpers'

export function isVCRedistInstalled(): boolean {
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

export async function runVCRedistInstaller(installerPath: string): Promise<void> {
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

export async function ensureVCRedist(): Promise<void> {
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
