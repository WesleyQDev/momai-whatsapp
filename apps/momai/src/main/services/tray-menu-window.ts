import { BrowserWindow, screen, Tray } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'

export const MENU_WIDTH = 240
export const MENU_HEIGHT = 180

export interface TrayState {
  llama: { running: boolean; loading: boolean; ready: boolean }
  economy: {
    active: boolean
    reason: 'idle' | 'game' | null
    secondsUntilSoneca: number
  }
  variantName: string
}

export class TrayMenuWindow {
  private win: BrowserWindow | null = null

  show(tray: Tray, state?: TrayState): void {
    const isFirstShow = !this.win || this.win.isDestroyed()

    if (!isFirstShow) {
      this.win!.show()
      if (state) {
        this.win!.webContents.send('tray:state-update', state)
      }
      return
    }

    this.win = new BrowserWindow({
      width: MENU_WIDTH,
      height: MENU_HEIGHT,
      frame: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      hasShadow: true,
      resizable: false,
      backgroundColor: '#3a3a3a',
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        additionalArguments: [`--momai-is-dev=${is.dev}`]
      }
    })

    this.positionWindow(tray)

    this.win.on('blur', () => this.hide())

    this.win.on('closed', () => {
      this.win = null
    })

    this.win.webContents.on('before-input-event', (_, input) => {
      if (input.key === 'Escape') {
        this.close()
      }
    })

    this.win.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
      console.error(`[TrayMenuWindow] Failed to load: ${errorDescription} (${errorCode})`)
      this.win?.close()
    })

    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      this.win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#/tray-menu`)
    } else {
      this.win.loadFile(join(__dirname, '../renderer/index.html'), {
        hash: '/tray-menu'
      })
    }

    if (state) {
      this.win.webContents.once('did-finish-load', () => {
        if (this.win && !this.win.isDestroyed() && this.win.isVisible()) {
          this.win.webContents.send('tray:state-update', state)
        }
      })
    }
  }

  private positionWindow(tray: Tray): void {
    const trayBounds = tray.getBounds()
    const display = screen.getDisplayNearestPoint({ x: trayBounds.x, y: trayBounds.y })
    const workArea = display.workArea

    let x = Math.round(trayBounds.x + trayBounds.width / 2 - MENU_WIDTH / 2)
    const bottom = workArea.y + workArea.height
    let y = bottom - MENU_HEIGHT - trayBounds.height - 4

    x = Math.max(workArea.x, Math.min(x, workArea.x + workArea.width - MENU_WIDTH))
    y = Math.max(workArea.y, Math.min(y, workArea.y + workArea.height - MENU_HEIGHT))

    this.win!.setPosition(x, y)
  }

  sendState(state: TrayState): void {
    if (this.win && !this.win.isDestroyed() && this.win.isVisible()) {
      this.win.webContents.send('tray:state-update', state)
    }
  }

  close(): void {
    if (!this.win) return
    this.win.close()
    this.win = null
  }

  hide(): void {
    if (this.win && !this.win.isDestroyed()) {
      this.win.hide()
    }
  }

  isVisible(): boolean {
    return this.win !== null && !this.win.isDestroyed() && this.win.isVisible()
  }
}
