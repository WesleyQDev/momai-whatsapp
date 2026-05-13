import psList from 'ps-list'

export interface DetectedGame {
  name: string
  processName: string
  steamGridId?: number | null
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
}

export interface KnownGame {
  name: string
  processNames: string[]
  steamGridId?: number | null
}

export class EconomyService {
  private running = false
  private gamingApps: GamingApp[] = []
  private knownGames: KnownGame[] = []
  private economyHost = 'http://localhost:8080'
  private gamingModeEnabled = false
  private pollTimer: ReturnType<typeof setInterval> | null = null
  private appOpenTimer: ReturnType<typeof setTimeout> | null = null
  private appMinimizedTimer: ReturnType<typeof setTimeout> | null = null

  private currentState: EconomyState = {
    active: false,
    reason: null,
    detectedGames: [],
  }

  private broadcastCallback: ((state: EconomyState) => void) | null = null

  // Allow tests to inject a mock HTTP client
  httpGet: (url: string) => Promise<any> = async (url: string) => {
    const res = await fetch(url)
    return res.json()
  }

  httpPost: (url: string) => Promise<any> = async (url: string) => {
    const res = await fetch(url, { method: 'POST' })
    return { ok: res.ok, status: res.status }
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

  private matchProcess(processName: string, target: string): boolean {
    const a = processName.toLowerCase()
    const b = target.toLowerCase()
    return a === b || a === b + '.exe' || a.replace(/\.exe$/, '') === b
  }

  async checkForGames(): Promise<DetectedGame[]> {
    if (!this.gamingModeEnabled) return []

    let processes: any[] = []
    try {
      processes = await psList()
    } catch (err) {
      console.log('[Economy] ps-list error:', (err as Error).message)
      return []
    }

    const detected: DetectedGame[] = []
    const checked = new Set<string>()

    for (const app of this.gamingApps) {
      const match = processes.find((p) =>
        p.name ? this.matchProcess(p.name, app.executable) : false
      )
      if (match && !checked.has(app.name)) {
        checked.add(app.name)
        detected.push({ name: app.name, processName: app.executable, steamGridId: null })
      }
    }

    for (const game of this.knownGames) {
      if (checked.has(game.name)) continue
      const match = processes.find((p) =>
        p.name
          ? game.processNames.some((pn) => this.matchProcess(p.name!, pn))
          : false
      )
      if (match) {
        checked.add(game.name)
        detected.push({ name: game.name, processName: match.name || '', steamGridId: game.steamGridId })
        console.log(`[Economy] DETECTED: ${game.name}`)
      }
    }

    return detected
  }

  async poll(): Promise<void> {
    try {
      const config = await this.httpGet(`${this.economyHost}/economy/config`)
      this.gamingModeEnabled = !!(config as any).gaming_mode_enabled
    } catch {
      // Will retry on next interval
    }

    if (this.gamingModeEnabled) {
      const detected = await this.checkForGames()
      const hasGames = detected.length > 0

      if (hasGames && !this.currentState.active) {
        await this.activateEconomy('gaming', detected)
      } else if (!hasGames && this.currentState.active && this.currentState.reason === 'gaming') {
        await this.deactivateEconomy()
      }
    }
  }

  private async activateEconomy(reason: EconomyState['reason'], detected: DetectedGame[]): Promise<void> {
    this.currentState = { active: true, reason, detectedGames: detected }
    await this.httpPost(`${this.economyHost}/llama/stop`)
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
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null }
    if (this.appOpenTimer) { clearTimeout(this.appOpenTimer); this.appOpenTimer = null }
    if (this.appMinimizedTimer) { clearTimeout(this.appMinimizedTimer); this.appMinimizedTimer = null }
  }
}
