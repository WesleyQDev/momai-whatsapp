import { readFileSync, existsSync, readdirSync } from 'fs'
import { join } from 'path'
import { execSync } from 'child_process'

export interface ScannedGame {
  name: string
  appId: number
  launcher: 'steam' | 'epic'
  coverUrl: string
}

function findSteamPath(): string | null {
  const candidates: string[] = [
    'C:\\Program Files (x86)\\Steam',
    'C:\\Program Files\\Steam',
    'D:\\Steam',
    'D:\\Program Files (x86)\\Steam',
    'D:\\Program Files\\Steam',
  ]
  try {
    const reg = execSync(
      'reg query "HKCU\\Software\\Valve\\Steam" /v SteamPath 2>nul',
      { encoding: 'utf-8', timeout: 3000, stdio: ['pipe', 'pipe', 'ignore'] }
    )
    const match = reg.match(/SteamPath\s+REG_\w+\s+(.+)/)
    if (match) {
      const p = match[1].trim().replace(/\\\\/g, '\\')
      if (existsSync(p)) candidates.unshift(p)
    }
  } catch {}
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
  } catch {}
  return paths
}

function scanSteamFolder(appsDir: string, seen: Set<string>): ScannedGame[] {
  const games: ScannedGame[] = []
  if (!existsSync(appsDir)) return games
  let files: string[]
  try { files = readdirSync(appsDir) } catch { return games }
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
        launcher: 'steam',
        coverUrl: `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appId}/header.jpg`,
      })
    } catch {}
  }
  return games
}

function scanEpicGames(seen: Set<string>): ScannedGame[] {
  const games: ScannedGame[] = []
  const dataPaths = [
    join(process.env.PROGRAMDATA || 'C:\\ProgramData', 'Epic', 'UnrealEngineLauncher', 'LauncherInstalled.dat'),
    join(process.env.LOCALAPPDATA || '', 'Epic', 'UnrealEngineLauncher', 'LauncherInstalled.dat'),
    join(process.env.PROGRAMDATA || 'C:\\ProgramData', 'Epic', 'EpicGamesLauncher', 'Data', 'Manifests'),
  ]
  for (const dataPath of dataPaths) {
    if (dataPath.endsWith('.dat')) {
      if (!existsSync(dataPath)) continue
      try {
        const data = JSON.parse(readFileSync(dataPath, 'utf-8'))
        const apps: any[] = data?.InstallationList || []
        for (const a of apps) {
          if (!a.AppName || !a.DisplayName) continue
          const key = a.DisplayName.toLowerCase()
          if (seen.has(key)) continue
          seen.add(key)
          games.push({ name: a.DisplayName, appId: 0, launcher: 'epic', coverUrl: '' })
        }
      } catch {}
    } else {
      if (!existsSync(dataPath)) continue
      try {
        const files = readdirSync(dataPath)
        for (const f of files) {
          if (!f.endsWith('.item')) continue
          try {
            const item = JSON.parse(readFileSync(join(dataPath, f), 'utf-8'))
            const name = item.DisplayName || item.AppName || item.CatalogItemId
            if (!name) continue
            const key = name.toLowerCase()
            if (seen.has(key)) continue
            seen.add(key)
            games.push({ name, appId: 0, launcher: 'epic', coverUrl: '' })
          } catch {}
        }
      } catch {}
    }
  }
  return games
}

export function scanInstalledGames(): ScannedGame[] {
  const games: ScannedGame[] = []
  const seen = new Set<string>()

  try {
    const steamPath = findSteamPath()
    if (steamPath) {
      console.log(`[EconomyScanner] Steam found at: ${steamPath}`)
      const libraries = readLibraryPaths(steamPath)
      console.log(`[EconomyScanner] Steam libraries: ${libraries.join(', ')}`)
      for (const lib of libraries) {
        const folder = join(lib, 'steamapps')
        if (existsSync(folder)) {
          const found = scanSteamFolder(folder, seen)
          console.log(`[EconomyScanner] Found ${found.length} games in ${folder}`)
          games.push(...found)
        }
      }
    } else {
      console.log('[EconomyScanner] Steam not found')
    }
  } catch (err) {
    console.log('[EconomyScanner] Steam scan error:', err)
  }

  try {
    const epicGames = scanEpicGames(seen)
    console.log(`[EconomyScanner] Found ${epicGames.length} Epic games`)
    games.push(...epicGames)
  } catch (err) {
    console.log('[EconomyScanner] Epic scan error:', err)
  }

  return games
}
