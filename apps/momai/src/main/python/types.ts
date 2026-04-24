import { BootstrapError, BootstrapErrorType } from '../state'

export type AITier = 'lite' | 'pro' | 'ultra'

export interface BootstrapResult {
  pythonExe: string
  corePath: string
  uvExe: string
  venvPath: string
  status?: string
  isNew?: boolean
}

export interface SyncResult {
  success: boolean
  needsSync: boolean
  lastChecked?: number
}

export interface PythonBackendStartOptions {
  host?: string
  port?: number
  announceOnline?: boolean
  reportBootstrapErrors?: boolean
}

export type { BootstrapError, BootstrapErrorType }
