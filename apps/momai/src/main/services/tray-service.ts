import { Tray, Menu, nativeImage, app } from 'electron'
import type { BrowserWindow } from 'electron'
import type { LlamaControl } from './llama-control'
import type { KeepInTrayReader } from './keep-in-tray-reader'
import type { VariantConfig } from '../variants'
import { ICON_PATH } from '../constants'

export interface TrayServiceDeps {
  window: BrowserWindow
  llama: LlamaControl
  keepInTray: KeepInTrayReader
  isQuitting: () => boolean
  variant: VariantConfig
}

export class TrayService {
  private tray: Tray | null = null
  private closeHandlerInstalled = false

  constructor(private readonly deps: TrayServiceDeps) {}

  start(): void {
    if (this.tray) return
    this.createTrayIcon()
    this.installCloseHandler()
  }

  stop(): void {
    this.tray?.destroy()
    this.tray = null
  }

  private createTrayIcon(): void {
    const tray = new Tray(nativeImage.createFromPath(ICON_PATH))
    tray.setToolTip(this.deps.variant.appName)
    tray.setContextMenu(this.buildContextMenu())
    tray.on('click', () => this.onTrayClick())
    this.tray = tray
  }

  private buildContextMenu(): Menu {
    return Menu.buildFromTemplate([
      {
        label: 'Abrir',
        click: () => this.showWindow()
      },
      {
        label: 'Sair',
        click: () => {
          app.quit()
        }
      }
    ])
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
      void this.deps.llama.stop()
      return
    }

    this.deps.window.hide()
    this.stop()
    app.quit()
  }

  private onTrayClick(): void {
    if (this.deps.window.isVisible()) {
      this.deps.window.hide()
      void this.deps.llama.stop()
    } else {
      this.showWindow()
    }
  }

  private showWindow(): void {
    this.deps.window.show()
    this.deps.window.focus()
    void this.deps.llama.start()
  }
}
