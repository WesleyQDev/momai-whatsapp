import { execSync as execSyncNode } from 'child_process'

export function parseProcessList(out: string): string[] {
  const names: string[] = []
  for (const rawLine of out.split('\n')) {
    const line = rawLine.trim()
    if (!line.includes('.exe')) continue
    const match = /"([^"]+\.exe)"/.exec(line)
    if (match) names.push(match[1])
  }
  return names
}

export interface DetectedGame {
  name: string
  processName: string
  steamGridId?: number | null
  coverUrl?: string | null
}

export interface GamingApp {
  id: number
  name: string
  executable: string
}

export interface EconomyConfig {
  gaming_mode_enabled: boolean
  idle_timeout_app_open: number
  idle_timeout_minimized: number
  auto_detect_known_games: boolean
  gaming_apps: GamingApp[]
}

export interface EconomyState {
  active: boolean
  reason: 'gaming' | 'idle' | 'manual' | null
  detectedGames: DetectedGame[]
  freedMemoryMb?: number
  freedVramMb?: number
}

export interface KnownGame {
  name: string
  processNames: string[]
  steamGridId?: number | null
  coverUrl?: string | null
}

export class EconomyService {
  private running = false
  private gamingApps: GamingApp[] = []
  private knownGames: KnownGame[] = []
  private economyHost = 'http://localhost:8080'
  private gamingModeEnabled = false
  private gamePreferences: Record<string, boolean> = {}
  private getSystemIdleTime: () => number = () => 0
  private isWindowMinimized: () => boolean = () => false
  private getWindowMinimizedSeconds: () => number = () => 0
  private getAppFocusIdleSeconds: () => number = () => 0

  private idleTimeoutAppOpen = 5
  private idleTimeoutMinimized = 1

  private pollTimer: ReturnType<typeof setInterval> | null = null
  private appOpenTimer: ReturnType<typeof setTimeout> | null = null
  private appMinimizedTimer: ReturnType<typeof setTimeout> | null = null

  private preferencesPath: string | null = null
  private dismissed = false

  private currentState: EconomyState = {
    active: false,
    reason: null,
    detectedGames: []
  }

  private broadcastCallback: ((state: EconomyState) => void) | null = null

  httpGet: (url: string) => Promise<any> = async (url: string) => {
    const res = await fetch(url)
    return res.json()
  }

  httpPost: (url: string) => Promise<any> = async (url: string) => {
    const res = await fetch(url, { method: 'POST' })
    return { ok: res.ok, status: res.status }
  }

  execCmd(cmd: string): string {
    return execSyncNode(cmd, {
      encoding: 'utf-8',
      timeout: 3000,
      stdio: ['pipe', 'pipe', 'ignore']
    })
  }

  onStateChange(callback: (state: EconomyState) => void): void {
    this.broadcastCallback = callback
  }

  isRunning(): boolean {
    return this.running
  }

  getState(): EconomyState {
    return { ...this.currentState }
  }

  setGamingApps(apps: GamingApp[]): void {
    this.gamingApps = apps
  }

  setKnownGames(games: KnownGame[]): void {
    this.knownGames = games
  }

  setGamingModeEnabled(enabled: boolean): void {
    this.gamingModeEnabled = enabled
  }

  setGamePreferences(prefs: Record<string, boolean>): void {
    this.gamePreferences = prefs
  }

  setPreferencesPath(path: string): void {
    this.preferencesPath = path
  }

  setGetSystemIdleTime(fn: () => number): void {
    this.getSystemIdleTime = fn
  }

  setIsWindowMinimized(fn: () => boolean): void {
    this.isWindowMinimized = fn
  }

  setWindowMinimizedSeconds(fn: () => number): void {
    this.getWindowMinimizedSeconds = fn
  }

  setAppFocusIdleSeconds(fn: () => number): void {
    this.getAppFocusIdleSeconds = fn
  }

  setIdleTimeouts(appOpen: number, minimized: number): void {
    this.idleTimeoutAppOpen = appOpen
    this.idleTimeoutMinimized = minimized
  }

  async dismiss(): Promise<void> {
    this.dismissed = true
    await this.deactivateEconomy()
  }

  reinstateSleep(): void {
    if (this.currentState.active && this.currentState.reason === 'idle') {
      console.log('[Economy] Reinstate sleep — re-stopping llama-server for idle mode')
      this.httpPost(`${this.economyHost}/llama/stop`).catch(() => {})
    }
  }

  reloadPreferences(): void {
    if (!this.preferencesPath) return
    try {
      const { readFileSync, existsSync } = require('fs')
      if (existsSync(this.preferencesPath)) {
        this.gamePreferences = JSON.parse(readFileSync(this.preferencesPath, 'utf-8'))
      }
    } catch {}
  }

  private isEconomyEnabledFor(gameName: string): boolean {
    return this.gamePreferences[gameName.toLowerCase()] !== false
  }

  setEconomyHost(host: string): void {
    this.economyHost = host
  }

  async start(): Promise<void> {
    this.running = true
    console.log('[Economy] Service started')
    this.poll().catch(() => {})
    this.pollTimer = setInterval(() => {
      this.poll().catch(() => {})
    }, 5000)
  }

  async stop(): Promise<void> {
    this.running = false
    this.clearTimers()
  }

  private getProcessList(): string[] {
    try {
      const cmd =
        process.platform === 'win32'
          ? 'tasklist /FO CSV /NH'
          : 'ps -eo comm --no-headers 2>/dev/null || ps -Ao comm= 2>/dev/null'
      const out = this.execCmd(cmd)
      return parseProcessList(out)
    } catch {
      return []
    }
  }

  private matchProcess(processName: string, target: string): boolean {
    const a = processName.toLowerCase()
    const b = target.toLowerCase()
    return a === b || a === b + '.exe' || a.replace(/\.exe$/, '') === b
  }

  private getFreeRamMb(): number {
    try {
      const cmd =
        process.platform === 'win32'
          ? 'powershell -NoProfile -Command "(Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory" 2>nul'
          : "free -m | awk '/Mem:/ {print $7}'"
      const out = this.execCmd(cmd)
      const kb = parseInt(out?.trim(), 10)
      if (!isNaN(kb) && kb > 0) return Math.round(kb / 1024)
      return 0
    } catch {
      return 0
    }
  }

  private resolveCoverUrl(game: KnownGame): string | null {
    if (game.coverUrl) return game.coverUrl
    if (game.steamGridId)
      return `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${game.steamGridId}/header.jpg`
    return null
  }

  async checkForGames(
    processOverrides?: string[],
    ignoreDismissed = false
  ): Promise<DetectedGame[]> {
    if (!this.gamingModeEnabled) return []
    if (!ignoreDismissed && this.dismissed) return []
    this.reloadPreferences()

    const processes = processOverrides ?? this.getProcessList()
    if (processes.length === 0) {
      return []
    }

    const detected: DetectedGame[] = []
    const checked = new Set<string>()

    for (const app of this.gamingApps) {
      const match = app.executable
        ? processes.some((p) => this.matchProcess(p, app.executable))
        : false
      if (match && !checked.has(app.name) && this.isEconomyEnabledFor(app.name)) {
        checked.add(app.name)
        detected.push({ name: app.name, processName: app.executable, steamGridId: null })
      }
    }

    for (const game of this.knownGames) {
      if (checked.has(game.name)) continue
      if (!this.isEconomyEnabledFor(game.name)) {
        console.log(`[Economy] SKIPPED: ${game.name} (economy disabled)`)
        checked.add(game.name)
        continue
      }
      const match = processes.find((p) => game.processNames.some((pn) => this.matchProcess(p, pn)))
      if (match) {
        checked.add(game.name)
        const coverUrl = this.resolveCoverUrl(game)
        detected.push({
          name: game.name,
          processName: match,
          steamGridId: game.steamGridId,
          coverUrl
        })
        console.log(`[Economy] DETECTED: ${game.name} (cover: ${coverUrl})`)
      }
    }

    return detected
  }

  async checkForIdle(): Promise<boolean> {
    const minimized = this.isWindowMinimized()

    const timeoutMinutes = minimized ? this.idleTimeoutMinimized : this.idleTimeoutAppOpen
    if (timeoutMinutes <= 0) return false

    const elapsedSeconds = minimized
      ? this.getWindowMinimizedSeconds()
      : this.getAppFocusIdleSeconds()

    return elapsedSeconds >= timeoutMinutes * 60
  }

  async poll(processOverrides?: string[]): Promise<void> {
    try {
      const config = await this.httpGet(`${this.economyHost}/economy/config`)
      this.gamingModeEnabled = !!(config as any).gaming_mode_enabled
      this.setIdleTimeouts(
        (config as any).idle_timeout_app_open ?? 5,
        (config as any).idle_timeout_minimized ?? 1
      )
    } catch {
      // Will retry on next interval
    }

    // Refresh gaming apps list so newly added games are detected
    try {
      const apps = await this.httpGet(`${this.economyHost}/system/gaming-apps`)
      if (Array.isArray(apps)) this.setGamingApps(apps)
    } catch {
      // Will retry on next interval
    }

    if (this.gamingModeEnabled) {
      const detected = await this.checkForGames(processOverrides)
      const hasGames = detected.length > 0

      if (hasGames && !this.currentState.active) {
        this.dismissed = false
        await this.activateEconomy('gaming', detected)
        return
      }

      if (!hasGames && this.currentState.active && this.currentState.reason === 'gaming') {
        await this.deactivateEconomy()
      }

      // When dismissed: check if games truly stopped before clearing the flag
      if (this.dismissed) {
        const stillRunning = await this.checkForGames(processOverrides, true)
        if (stillRunning.length === 0) this.dismissed = false
        return
      }
    }

    // Soneca da IA: idle timeout check
    const isIdle = await this.checkForIdle()

    if (isIdle && !this.currentState.active) {
      await this.activateEconomy('idle', [])
    } else if (!isIdle && this.currentState.active && this.currentState.reason === 'idle') {
      await this.deactivateEconomy()
    }
  }

  private getVramUsage(): number {
    if (process.platform !== 'win32') return 0
    // Try NVIDIA
    try {
      const out = this.execCmd(
        'nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits 2>nul'
      )
      const mb = parseInt(out?.trim(), 10)
      if (!isNaN(mb) && mb > 0) return mb
    } catch {}
    // Try AMD
    try {
      const out = this.execCmd('rocm-smi --showmeminfo vram 2>nul')
      const match =
        out.match(/VRAM\s*:\s*(\d+)\s*MB/i) || out.match(/Used\s*\(VRAM\)\s*:\s*(\d+)\s*MB/i)
      if (match) {
        const mb = parseInt(match[1], 10)
        if (!isNaN(mb) && mb > 0) return mb
      }
    } catch {}
    // Fallback: Windows management query for GPU memory
    try {
      const out = this.execCmd(
        `powershell -NoProfile -Command "& { try { $c = Get-Counter '\\GPU Process Memory(*)\\Dedicated Usage' -ErrorAction Stop; ($c.CounterSamples | Where-Object { $_.InstanceName -eq 'total' }).CookedValue } catch { 0 } }" 2>nul`
      )
      const bytes = parseInt(out?.trim(), 10)
      if (!isNaN(bytes) && bytes > 0) return Math.round(bytes / (1024 * 1024))
    } catch {}
    return 0
  }

  private async activateEconomy(
    reason: EconomyState['reason'],
    detected: DetectedGame[]
  ): Promise<void> {
    const beforeRam = this.getFreeRamMb()
    const beforeVram = this.getVramUsage()
    await this.httpPost(`${this.economyHost}/llama/stop`)
    const freedMemoryMb = beforeRam > 0 ? Math.max(0, this.getFreeRamMb() - beforeRam) : undefined
    const freedVramMb = beforeVram > 0 ? Math.max(0, this.getVramUsage() - beforeVram) : undefined
    this.currentState = {
      active: true,
      reason,
      detectedGames: detected,
      freedMemoryMb,
      freedVramMb
    }
    this.broadcast()
  }

  private async deactivateEconomy(): Promise<void> {
    this.currentState = { active: false, reason: null, detectedGames: [] }
    await this.httpPost(`${this.economyHost}/llama/start`)
    this.broadcast()
  }

  private broadcast(): void {
    this.broadcastCallback?.({ ...this.currentState })
  }

  private clearTimers(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }
    if (this.appOpenTimer) {
      clearTimeout(this.appOpenTimer)
      this.appOpenTimer = null
    }
    if (this.appMinimizedTimer) {
      clearTimeout(this.appMinimizedTimer)
      this.appMinimizedTimer = null
    }
  }
}
