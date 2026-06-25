import { BrowserWindow } from 'electron'

export type BootstrapErrorType =
  | 'python_not_found'
  | 'uv_not_found'
  | 'venv_failed'
  | 'sync_failed'
  | 'permission_denied'
  | 'startup_failed'
  | 'missing_vc_redist'
  | 'unknown'

export interface BootstrapError {
  type: BootstrapErrorType
  message: string
  details?: string
}

export interface AppState {
  nodeCoreProcess: ReturnType<typeof import('child_process').spawn> | null
  pythonProcess: ReturnType<typeof import('child_process').spawn> | null
  mainWindow: BrowserWindow | null
  overlayWindow: BrowserWindow | null
  pendingOverlayData: any | null
  isQuitting: boolean
  pythonStartTime: number
  ipcHandlersRegistered: boolean
  lastBootstrapError: BootstrapError | null
  isFirstLaunch: boolean
}

export const state: AppState = {
  nodeCoreProcess: null,
  pythonProcess: null,
  mainWindow: null,
  overlayWindow: null,
  pendingOverlayData: null,
  isQuitting: false,
  pythonStartTime: 0,
  ipcHandlersRegistered: false,
  lastBootstrapError: null,
  isFirstLaunch: false
}

export function getMainWindow(): BrowserWindow | null {
  return state.mainWindow
}

export function getOverlayWindow(): BrowserWindow | null {
  return state.overlayWindow
}

export function setMainWindow(win: BrowserWindow | null): void {
  state.mainWindow = win
}

export function setOverlayWindow(win: BrowserWindow | null): void {
  state.overlayWindow = win
}

export function setPythonProcess(proc: AppState['pythonProcess']): void {
  state.pythonProcess = proc
}

export function setNodeCoreProcess(proc: AppState['nodeCoreProcess']): void {
  state.nodeCoreProcess = proc
}

export function setIsQuitting(value: boolean): void {
  state.isQuitting = value
}

export function setPythonStartTime(time: number): void {
  state.pythonStartTime = time
}

export function setIpcHandlersRegistered(value: boolean): void {
  state.ipcHandlersRegistered = value
}

export function setPendingOverlayData(data: any | null): void {
  state.pendingOverlayData = data
}

export function consumePendingOverlayData(): any | null {
  const data = state.pendingOverlayData
  state.pendingOverlayData = null
  return data
}
