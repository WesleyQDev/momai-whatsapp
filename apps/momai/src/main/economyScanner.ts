import { readFileSync, existsSync, readdirSync } from 'fs'
import { join } from 'path'
import { execSync } from 'child_process'
import { logger } from './logger'

export interface ScannedGame {
  name: string
  appId: number
  platform: 'steam' | 'epic'
  coverUrl: string
  catalogItemId?: string
  sandboxId?: string
}

function findSteamPath(): string | null {
  const candidates: string[] = [
    'C:\\Program Files (x86)\\Steam',
    'C:\\Program Files\\Steam',
    'D:\\Steam',
    'D:\\Program Files (x86)\\Steam',
    'D:\\Program Files\\Steam'
  ]
  try {
    const reg = execSync('reg query "HKCU\\Software\\Valve\\Steam" /v SteamPath 2>nul', {
      encoding: 'utf-8',
      timeout: 3000,
      stdio: ['pipe', 'pipe', 'ignore']
    })
    const match = reg.match(/SteamPath\s+REG_\w+\s+(.+)/)
    if (match) {
      const p = match[1].trim().replace(/\\\\/g, '\\')
      if (existsSync(p)) candidates.unshift(p)
    }
  } catch (err) {
    logger.debug('[EconomyScanner] Steam registry query failed (non-Steam or restricted):', err)
  }
  for (const p of candidates) {
    if (existsSync(join(p, 'steam.exe')) || existsSync(join(p, 'config', 'libraryfolders.vdf'))) {
      return p
    }
  }
  return null
}

function readLibraryPaths(steamPath: string): string[] {
  const paths: string[] = [steamPath]
  const vdfPath = join(steamPath, 'config', 'libraryfolders.vdf')
  if (!existsSync(vdfPath)) return paths
  try {
    const content = readFileSync(vdfPath, 'utf-8')
    let idx = 0
    while (true) {
      const keyQuote = content.indexOf('"path"', idx)
      if (keyQuote === -1) break
      const valQuote = content.indexOf('"', keyQuote + 6)
      if (valQuote === -1) break
      const endQuote = content.indexOf('"', valQuote + 1)
      if (endQuote === -1) break
      const p = content.slice(valQuote + 1, endQuote).replace(/\\\\/g, '\\')
      if (!paths.includes(p) && existsSync(join(p, 'steamapps'))) paths.push(p)
      idx = endQuote + 1
    }
  } catch (err) {
    logger.warn('[EconomyScanner] Failed to parse Steam libraryfolders.vdf:', err)
  }
  return paths
}

function scanSteamFolder(appsDir: string, seen: Set<string>): ScannedGame[] {
  const games: ScannedGame[] = []
  if (!existsSync(appsDir)) return games
  let files: string[]
  try {
    files = readdirSync(appsDir)
  } catch {
    return games
  }
  for (const file of files) {
    if (!file.startsWith('appmanifest_') || !file.endsWith('.acf')) continue
    try {
      const content = readFileSync(join(appsDir, file), 'utf-8')
      const appId = content.match(/"appid"\s+"(\d+)"/)?.[1]
      const name = content.match(/"name"\s+"([^"]+)"/)?.[1]
      if (!appId || !name) continue
      const key = name.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      games.push({
        name,
        appId: parseInt(appId, 10),
        platform: 'steam',
        coverUrl: `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appId}/header.jpg`
      })
    } catch (err) {
      logger.debug(`[EconomyScanner] Failed to read Steam appmanifest ${file}:`, err)
    }
  }
  return games
}

function scanEpicDatFallback(seen: Set<string>): ScannedGame[] {
  const games: ScannedGame[] = []
  const datPaths = [
    join(
      process.env.PROGRAMDATA || 'C:\\ProgramData',
      'Epic',
      'UnrealEngineLauncher',
      'LauncherInstalled.dat'
    ),
    join(process.env.LOCALAPPDATA || '', 'Epic', 'UnrealEngineLauncher', 'LauncherInstalled.dat')
  ]
  for (const datPath of datPaths) {
    if (!existsSync(datPath)) continue
    try {
      const data = JSON.parse(readFileSync(datPath, 'utf-8'))
      const apps: any[] = data?.InstallationList || []
      for (const a of apps) {
        if (!a.AppName || !a.DisplayName) continue
        const key = a.DisplayName.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        games.push({ name: a.DisplayName, appId: 0, platform: 'epic', coverUrl: '' })
      }
    } catch (err) {
      logger.debug(`[EconomyScanner] Failed to read Epic LauncherInstalled.dat at ${datPath}:`, err)
    }
  }
  return games
}

function scanEpicManifests(seen: Set<string>): ScannedGame[] {
  const games: ScannedGame[] = []
  const manifestsPath = join(
    process.env.PROGRAMDATA || 'C:\\ProgramData',
    'Epic',
    'EpicGamesLauncher',
    'Data',
    'Manifests'
  )
  if (!existsSync(manifestsPath)) return games
  let files: string[]
  try {
    files = readdirSync(manifestsPath)
  } catch {
    return games
  }
  for (const f of files) {
    if (!f.endsWith('.item')) continue
    try {
      const item = JSON.parse(readFileSync(join(manifestsPath, f), 'utf-8'))
      const name = item.DisplayName || item.AppName || item.CatalogItemId
      if (!name) continue
      const key = name.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      games.push({
        name,
        appId: 0,
        platform: 'epic',
        coverUrl: item.VaultThumbnailUrl || '',
        catalogItemId: item.CatalogItemId,
        sandboxId: item.SandboxId || item.CatalogNamespace
      })
    } catch {}
  }
  return games
}

function scanEpicGames(seen: Set<string>): ScannedGame[] {
  // .item files are richer (contain VaultThumbnailUrl), scan them first
  const games = scanEpicManifests(seen)
  // fallback to LauncherInstalled.dat for games not in .item files
  games.push(...scanEpicDatFallback(seen))
  return games
}

export function scanInstalledGames(): ScannedGame[] {
  const games: ScannedGame[] = []
  const seen = new Set<string>()

  try {
    const steamPath = findSteamPath()
    if (steamPath) {
      logger.debug(`[EconomyScanner] Steam found at: ${steamPath}`)
      const libraries = readLibraryPaths(steamPath)
      logger.debug(`[EconomyScanner] Steam libraries: ${libraries.join(', ')}`)
      for (const lib of libraries) {
        const folder = join(lib, 'steamapps')
        if (existsSync(folder)) {
          const found = scanSteamFolder(folder, seen)
          logger.debug(`[EconomyScanner] Found ${found.length} games in ${folder}`)
          games.push(...found)
        }
      }
    } else {
      logger.info('[EconomyScanner] Steam not found')
    }
  } catch (err) {
    logger.error('[EconomyScanner] Steam scan error:', err)
  }

  try {
    const epicGames = scanEpicGames(seen)
    logger.info(`[EconomyScanner] Found ${epicGames.length} Epic games`)
    games.push(...epicGames)
  } catch (err) {
    logger.error('[EconomyScanner] Epic scan error:', err)
  }

  return games
}
