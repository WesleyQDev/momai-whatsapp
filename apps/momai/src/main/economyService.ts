import psList from 'ps-list'

export interface DetectedGame {
  name: string
  processName: string
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

export class EconomyService {
  private running = false
  private gamingApps: GamingApp[] = []
  private economyHost = 'http://localhost:8080'
  private pollTimer: ReturnType<typeof setInterval> | null = null
  private appOpenTimer: ReturnType<typeof setTimeout> | null = null
  private appMinimizedTimer: ReturnType<typeof setTimeout> | null = null

  private currentState: EconomyState = {
    active: false,
    reason: null,
    detectedGames: [],
  }

  private broadcastCallback: ((state: EconomyState) => void) | null = null

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

  setEconomyHost(host: string): void {
    this.economyHost = host
  }

  async start(): Promise<void> {
    this.running = true
    this.pollTimer = setInterval(() => {
      this.poll().catch(() => {})
    }, 5000)
  }

  async stop(): Promise<void> {
    this.running = false
    this.clearTimers()
  }

  async checkForGames(): Promise<DetectedGame[]> {
    const processes = await psList()
    const detected: DetectedGame[] = []

    for (const app of this.gamingApps) {
      const match = processes.find(
        (p) => p.name?.toLowerCase() === app.executable.toLowerCase()
      )
      if (match) {
        detected.push({ name: app.name, processName: app.executable })
      }
    }

    return detected
  }

  async poll(): Promise<void> {
    const detected = await this.checkForGames()
    const hasGames = detected.length > 0

    if (hasGames && !this.currentState.active) {
      await this.activateEconomy('gaming', detected)
    } else if (!hasGames && this.currentState.active && this.currentState.reason === 'gaming') {
      await this.deactivateEconomy()
    }
  }

  private async activateEconomy(reason: EconomyState['reason'], detected: DetectedGame[]): Promise<void> {
    this.currentState = { active: true, reason, detectedGames: detected }
    try {
      await fetch(`${this.economyHost}/llama/stop`, { method: 'POST' })
    } catch {
      // Node Core may not be available
    }
    this.broadcast()
  }

  private async deactivateEconomy(): Promise<void> {
    this.currentState = { active: false, reason: null, detectedGames: [] }
    try {
      await fetch(`${this.economyHost}/llama/start`, { method: 'POST' })
    } catch {
      // Node Core may not be available
    }
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
