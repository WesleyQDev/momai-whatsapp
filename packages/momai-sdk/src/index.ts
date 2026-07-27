import type {
  SDKResponse, SDKErrorCode, CronHandle, ThemeColors, CurrentTheme,
  OAuthResult, SpawnResult, LLMCompleteOpts, NotificationOpts,
  OAuthAuthorizeOpts, SpawnOpts, StorageGetOpts
} from './types'

export type { SDKResponse, SDKErrorCode, CronHandle, ThemeColors, CurrentTheme,
  OAuthResult, SpawnResult, LLMCompleteOpts, NotificationOpts,
  OAuthAuthorizeOpts, SpawnOpts, StorageGetOpts }

export interface MomAISDK {
  api: {
    get<T = any>(path: string, params?: Record<string, any>): Promise<SDKResponse<T>>
    post<T = any>(path: string, body?: any): Promise<SDKResponse<T>>
    put<T = any>(path: string, body?: any): Promise<SDKResponse<T>>
    delete<T = any>(path: string): Promise<SDKResponse<T>>
  }
  storage: {
    get<T = any>(key: string, opts?: StorageGetOpts): Promise<T | null>
    set(key: string, value: any): Promise<void>
    getMany<T = any>(keys: string[]): Promise<Record<string, T | null>>
    setMany(entries: Record<string, any>): Promise<void>
    delete(key: string): Promise<void>
    migrate(fromVersion: string, toVersion: string, fn: (old: any) => any): Promise<void>
    listKeys(): Promise<string[]>
  }
  events: {
    subscribe<T = any>(type: string, handler: (data: T) => void): () => void
    unsubscribe(type: string, handler: Function): void
    once<T = any>(type: string, handler: (data: T) => void): void
  }
  llm: {
    complete(opts: LLMCompleteOpts): Promise<{ text: string }>
  }
  registry: {
    registerRenderer(type: string, component: any): void
    getRenderer(type: string): any
    hasRenderer(type: string): boolean
    listRendererTypes(): string[]
  }
  notifications: {
    send(opts: NotificationOpts): Promise<void>
  }
  theme: {
    setColors(colors: ThemeColors): Promise<void>
    setFont(kind: 'sans' | 'mono', fontFamily: string): Promise<void>
    getCurrentTheme(): Promise<CurrentTheme>
  }
  scheduler: {
    cron(schedule: string, handler: () => void): CronHandle
  }
  oauth: {
    authorize(provider: string, opts: OAuthAuthorizeOpts): Promise<OAuthResult>
  }
  config: {
    get(key: string): Promise<string | null>
    set(key: string, value: string): Promise<void>
    delete(key: string): Promise<void>
  }
  process: {
    spawn(command: string, args?: string[], opts?: SpawnOpts): Promise<SpawnResult>
  }
  system: {
    mouse: { click(x: number, y: number): Promise<void>; move(x: number, y: number): Promise<void> }
    keyboard: { type(text: string): Promise<void>; press(key: string): Promise<void> }
    screen: { capture(): Promise<Buffer> }
  }
  browser: {
    open(url: string): Promise<void>
    evaluate(js: string): Promise<any>
    screenshot(): Promise<Buffer>
  }
  has(method: string): boolean
  dev: {
    reload(): void
    log(...args: any[]): void
  }
}
