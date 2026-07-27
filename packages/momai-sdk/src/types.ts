export interface SDKResponse<T = any> {
  ok: boolean
  data?: T
  error?: string
  errorCode?: SDKErrorCode
}

export type SDKErrorCode =
  | 'method_not_available'
  | 'permission_denied'
  | 'safe_mode'
  | 'not_found'
  | 'timeout'
  | 'internal_error'

export interface CronHandle {
  cancel: () => void
}

export interface ThemeColors {
  primary?: string
  accent?: string
  bg?: string
  text?: string
}

export interface CurrentTheme {
  colors: Record<string, string>
  fonts: Record<string, string>
}

export interface OAuthResult {
  token: string
  expiresAt?: number
}

export interface SpawnResult {
  stdout: string
  stderr: string
  exitCode: number
}

export interface LLMCompleteOpts {
  system?: string
  user: string
  maxTokens?: number
}

export interface NotificationOpts {
  title: string
  body?: string
  action?: string
}

export interface OAuthAuthorizeOpts {
  scope: string[]
}

export interface SpawnOpts {
  cwd?: string
}

export interface StorageGetOpts {
  version?: string
}

export interface BrowserScreenshot {
  type: 'png' | 'jpeg'
  data: Buffer
}
