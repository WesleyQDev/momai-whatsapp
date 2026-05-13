import { readFileSync, existsSync, readdirSync } from 'fs'
import { join } from 'path'
import { execSync } from 'child_process'

export interface ScannedGame {
  name: string
  appId: number
  launcher: 'steam' | 'epic'
  coverUrl: string
}

function getSteamPath(): string | null {
  try {
    const reg = execSync(
      'reg query "HKCU\\Software\\Valve\\Steam" /v SteamPath 2>nul',
      { encoding: 'utf-8', timeout: 3000, stdio: ['pipe', 'pipe', 'ignore'] }
    )
    const match = reg.match(/SteamPath\s+REG_SZ\s+(.+)/)
    if (match) return match[1].trim().replace(/\\\\/g, '\\')
  } catch {}
  const defaultPath = 'C:\\Program Files (x86)\\Steam'
  return existsSync(defaultPath) ? defaultPath : null
}

function readLibraryFolders(steamPath: string): string[] {
  const vdfPath = join(steamPath, 'config', 'libraryfolders.vdf')
  if (!existsSync(vdfPath)) return [steamPath]
  try {
    const content = readFileSync(vdfPath, 'utf-8')
    const paths: string[] = [steamPath]
    const regex = /"path"\s+"([^"]+)"/
    let match: RegExpExecArray | null
    const re = new RegExp(regex.source, 'g')
    while ((match = re.exec(content)) !== null) {
      const p = match[1].replace(/\\\\/g, '\\')
      if (!paths.includes(p)) paths.push(p)
    }
    return paths
  } catch {
    return [steamPath]
  }
}

function parseAcfValue(content: string, key: string): string | null {
  const re = new RegExp(`"${key}"\\s+"([^"]+)"`)
  const match = re.exec(content)
  return match ? match[1] : null
}

function scanSteamGames(libraryPaths: string[]): ScannedGame[] {
  const games: ScannedGame[] = []
  const seen = new Set<string>()

  for (const libPath of libraryPaths) {
    const appsDir = join(libPath, 'steamapps')
    if (!existsSync(appsDir)) continue

    let files: string[]
    try {
      files = readdirSync(appsDir)
    } catch { continue }

    for (const file of files) {
      if (!file.startsWith('appmanifest_') || !file.endsWith('.acf')) continue
      try {
        const content = readFileSync(join(appsDir, file), 'utf-8')
        const appId = parseAcfValue(content, 'appid')
        const name = parseAcfValue(content, 'name')
        if (!appId || !name) continue
        const key = name.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        games.push({
          name,
          appId: parseInt(appId, 10),
          launcher: 'steam',
          coverUrl: `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appId}/header.jpg`,
        })
      } catch {}
    }
  }

  return games
}

function scanEpicGames(): ScannedGame[] {
  try {
    const dataPath = join(
      process.env.PROGRAMDATA || 'C:\\ProgramData',
      'Epic',
      'UnrealEngineLauncher',
      'LauncherInstalled.dat'
    )
    if (!existsSync(dataPath)) return []
    const data = JSON.parse(readFileSync(dataPath, 'utf-8'))
    const apps: any[] = data?.InstallationList || []
    return apps
      .filter((a: any) => a.AppName && a.DisplayName)
      .map((a: any) => ({
        name: a.DisplayName,
        appId: 0,
        launcher: 'epic' as const,
        coverUrl: '',
      }))
  } catch {
    return []
  }
}

export function scanInstalledGames(): ScannedGame[] {
  const games: ScannedGame[] = []
  const seen = new Set<string>()

  try {
    const steamPath = getSteamPath()
    if (steamPath) {
      const libraries = readLibraryFolders(steamPath)
      const steamGames = scanSteamGames(libraries)
      for (const g of steamGames) {
        const key = g.name.toLowerCase()
        if (!seen.has(key)) {
          seen.add(key)
          games.push(g)
        }
      }
    }
  } catch {}

  try {
    const epicGames = scanEpicGames()
    for (const g of epicGames) {
      const key = g.name.toLowerCase()
      if (!seen.has(key)) {
        seen.add(key)
        games.push(g)
      }
    }
  } catch {}

  return games
}
