import { getMainWindow } from '../../state'
import { logger } from '../../logger'
import type { BootstrapError } from '../../state'

export function sendErrorToRenderer(error: BootstrapError): void {
  logger.error(`[Bootstrap] Error: ${error.type} - ${error.message}`, error.details || '')

  const mainWindow = getMainWindow()
  if (mainWindow && !mainWindow.isDestroyed()) {
    logger.info('[Bootstrap] Sending error to renderer...')
    mainWindow.webContents.send('bootstrap-error', error)
  } else {
    logger.warn('[Bootstrap] Main window not available, storing error for later...')
    state.lastBootstrapError = error
  }
}

export function sendInitProgress(message: string, progress: number): void {
  const mainWindow = getMainWindow()
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('init-progress', { message, progress })
  }
}

export function broadcastPythonStatus(online: boolean, detail?: string): void {
  const window = getMainWindow()
  if (window && !window.isDestroyed()) {
    window.webContents.send('python-status', { online, detail: detail || '' })
  }
}

// Need to import state for sendErrorToRenderer
import { state } from '../../state'
