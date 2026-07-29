import { Tray, nativeImage, app } from 'electron'
import type { BrowserWindow } from 'electron'
import type { LlamaControl, LlamaRuntimeStatus } from './llama-control'
import type { KeepInTrayReader } from './keep-in-tray-reader'
import type { VariantConfig } from '../variants'
import type { EconomyService } from '../economyService'
import { ICON_PATH } from '../constants'
import { TrayMenuWindow } from './tray-menu-window'
import type { TrayState } from './tray-menu-window'

export interface TrayServiceDeps {
  window: BrowserWindow
  llama: LlamaControl
  keepInTray: KeepInTrayReader
  isQuitting: () => boolean
  variant: VariantConfig
  getEconomy?: () => EconomyService | null
}

export class TrayService {
  private tray: Tray | null = null
  private closeHandlerInstalled = false
  private stateTimer: ReturnType<typeof setInterval> | null = null
  private tooltipTimer: ReturnType<typeof setInterval> | null = null
  private llamaStatus: LlamaRuntimeStatus = { running: false, ready: false, loading: false }
  private menuWindow = new TrayMenuWindow()

  constructor(private readonly deps: TrayServiceDeps) {}

  start(): void {
    if (this.tray) return
    this.createTrayIcon()
    this.installCloseHandler()

    this.tooltipTimer = setInterval(() => {
      this.updateTooltip()
    }, 1000)

    this.stateTimer = setInterval(() => {
      this.updateState()
    }, 1000)
  }

  stop(): void {
    if (this.stateTimer) {
      clearInterval(this.stateTimer)
      this.stateTimer = null
    }
    if (this.tooltipTimer) {
      clearInterval(this.tooltipTimer)
      this.tooltipTimer = null
    }
    this.menuWindow.close()
    this.tray?.destroy()
    this.tray = null
  }

  private createTrayIcon(): void {
    const tray = new Tray(nativeImage.createFromPath(ICON_PATH))
    tray.setToolTip(this.deps.variant.appName)
    tray.on('click', () => this.onTrayClick())
    tray.on('right-click', () => this.onTrayRightClick())
    this.tray = tray
  }

  private onTrayRightClick(): void {
    void this.deps.llama.getStatus().then((s) => {
      this.llamaStatus = s
      this.menuWindow.show(this.tray!, this.buildState())
    })
  }

  private buildState(): TrayState {
    const economy = this.deps.getEconomy?.()
    let secondsUntilSoneca = -1
    let economyActive = false
    let economyReason: 'idle' | 'game' | null = null
    if (economy) {
      secondsUntilSoneca = economy.getTimeUntilNextSoneca()
      const state = economy.getState()
      economyActive = state.active
      if (state.reason === 'idle') {
        economyReason = 'idle'
      } else if (state.reason === 'gaming') {
        economyReason = 'game'
      }
    }
    return {
      llama: this.llamaStatus,
      economy: { active: economyActive, reason: economyReason, secondsUntilSoneca },
      variantName: this.deps.variant.appName
    }
  }

  private updateState(): void {
    void this.deps.llama.getStatus().then((s) => {
      this.llamaStatus = s
      this.menuWindow.sendState(this.buildState())
    })
  }

  private updateTooltip(): void {
    if (!this.tray) return

    const s = this.llamaStatus
    const name = this.deps.variant.appName

    const economy = this.deps.getEconomy?.()
    if (economy) {
      const remaining = economy.getTimeUntilNextSoneca()
      const state = economy.getState()

      if (state.active && state.reason === 'idle') {
        this.tray.setToolTip(`${name} — LLM parado · soneca ativa`)
        return
      }
      if (remaining > 0) {
        const min = Math.floor(remaining / 60)
        const sec = remaining % 60
        this.tray.setToolTip(
          `${name} — LLM ${s.running ? 'ativo' : 'parado'} · soneca em ${min}min ${sec}s`
        )
        return
      }
    }

    const status = s.loading ? 'iniciando' : s.running ? 'ativo' : 'parado'
    this.tray.setToolTip(`${name} — LLM ${status}`)
  }

  private installCloseHandler(): void {
    if (this.closeHandlerInstalled) return
    this.deps.window.on('close', (event) => this.handleClose(event))
    this.closeHandlerInstalled = true
  }

  private handleClose(event: { preventDefault: () => void }): void {
    if (this.deps.isQuitting()) return
    event.preventDefault()

    if (this.deps.keepInTray.isEnabled()) {
      this.deps.window.hide()
      // Ativa soneca imediatamente — para o LLM via Economy (libera VRAM/RAM)
      // e registra o estado 'idle' para que ao reabrir o resume seja suave
      void this.deps.llama.stop()
      this.activateSoneca()
      return
    }

    this.deps.window.hide()
    this.stop()
    app.quit()
  }

  private onTrayClick(): void {
    this.menuWindow.hide()
    if (this.deps.window.isVisible()) {
      this.deps.window.hide()
      void this.deps.llama.stop()
      this.activateSoneca()
    } else {
      this.showWindow()
    }
  }

  private showWindow(): void {
    this.deps.window.show()
    this.deps.window.focus()
    void this.deps.llama.start()
    this.dismissSoneca()
  }

  /** Ativa modo soneca imediatamente via Economy, liberando GPU/RAM. */
  private activateSoneca(): void {
    const economy = this.deps.getEconomy?.()
    if (!economy) return
    const state = economy.getState()
    if (state.active) return // já está em soneca
    economy
      .immediateSoneca()
      .catch(() => {})
  }

  /** Acorda da soneca — o Economy reinicia o LLM na próxima poll. */
  private dismissSoneca(): void {
    const economy = this.deps.getEconomy?.()
    if (!economy) return
    const state = economy.getState()
    if (!state.active) return // não está em soneca
    economy
      .dismiss()
      .catch(() => {})
  }
}
