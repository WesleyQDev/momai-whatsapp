# MomAI Extension SDK

## Getting Started

```bash
npm install momai-sdk
npx momai-sdk create my-ext
```

The CLI scaffolds a new extension with `manifest.json`, `runtime.js`, build config, and React UI template.

## SDK Structure

The SDK is organized into modules, each providing a group of related capabilities:

```
momai-sdk/
  types.ts          # TypeScript type definitions
  runtime.ts        # Main entry point — getSDK()
  adapter.ts        # Version adapter system
  modules/
    api.ts          # HTTP client
    storage.ts      # Key-value storage
    events.ts       # Event subscribe/unsubscribe
    llm.ts          # LLM completion calls
    registry.ts     # UI renderer registry
    notifications.ts# Desktop notifications
    config.ts       # Extension config (host-managed)
    oauth.ts        # OAuth flow
    path.ts         # Cross-platform path utilities
    has.ts          # Capability detection
```

## API Reference

### `MomAISDK`

The root object returned by `getSDK()`. All modules are accessed as properties.

```typescript
interface MomAISDK {
  api: ApiModule
  storage: StorageModule
  events: EventsModule
  llm: LlmModule
  registry: RegistryModule
  notifications: NotificationsModule
  theme: ThemeModule
  scheduler: SchedulerModule
  oauth: OAuthModule
  config: ConfigModule
  process: ProcessModule
  system: SystemModule
  browser: BrowserModule
  has(method: string): boolean
  dev: DevModule
}
```

### `sdk.api` — HTTP Client

Makes authenticated HTTP requests to the MomAI backend.

```typescript
api.get<T = any>(path: string, params?: Record<string, any>): Promise<SDKResponse<T>>
api.post<T = any>(path: string, body?: any): Promise<SDKResponse<T>>
api.put<T = any>(path: string, body?: any): Promise<SDKResponse<T>>
api.delete<T = any>(path: string): Promise<SDKResponse<T>>
```

- GET requests are cached for 5 seconds (TTL). Cache is invalidated on POST/PUT/DELETE to the same path prefix.
- Headers include `Content-Type: application/json` and `X-Session-Token` (auto-injected via preload bridge).
- Base URL is determined automatically (`window.api?.getApiBaseUrl()` or fallback to `http://127.0.0.1:8000`).

### `sdk.storage` — Key-Value Storage

Isolated per-extension persistent storage.

```typescript
storage.get<T = any>(key: string, opts?: { version?: string }): Promise<T | null>
storage.set(key: string, value: any): Promise<void>
storage.getMany<T = any>(keys: string[]): Promise<Record<string, T | null>>
storage.setMany(entries: Record<string, any>): Promise<void>
storage.delete(key: string): Promise<void>
storage.listKeys(): Promise<string[]>
storage.migrate(fromVersion: string, toVersion: string, fn: (old: any) => any): Promise<void>
```

- Values are JSON-serialized. No size limit is enforced at the SDK level (host may impose limits).
- The `migrate` method renames keys from `@fromVersion` suffix to `@toVersion` suffix, applying a migration function.
- In development, storage is in-memory. In production (host worker), it's persisted as files under `data/extensions/<id>/`.

### `sdk.events` — Event System

Subscribe to events emitted by the host or other extensions.

```typescript
events.subscribe<T = any>(type: string, handler: (data: T) => void): () => void
events.unsubscribe(type: string, handler: Function): void
events.once<T = any>(type: string, handler: (data: T) => void): void
```

- `subscribe` returns an unsubscribe function for convenience.
- `once` auto-unsubscribes after the first event.
- Events are received via SSE (Server-Sent Events) from the host.

### `sdk.llm` — LLM Completion

Query the local LLM directly from your extension.

```typescript
llm.complete(opts: { system?: string; user: string; maxTokens?: number }): Promise<{ text: string }>
```

- Calls the MomAI LLM pipeline through `/extensions/llm/complete`.
- The LLM is the user's local model (varies by tier: Lite/Pro/Ultra).
- Use for summarization, classification, or generating text within your extension.

### `sdk.registry` — UI Renderer Registry

Register React components that render structured responses from the LLM.

```typescript
registry.registerRenderer(type: string, component: any): void
registry.getRenderer(type: string): any
registry.hasRenderer(type: string): boolean
registry.listRendererTypes(): string[]
```

- Renderers are React components that receive `data` prop matching the structured response payload.
- Register during your extension's `page.tsx` or `panel.tsx` initialization.
- The host dispatches to registered renderers via `StructuredResponseRenderer`.

### `sdk.notifications` — Desktop Notifications

Send OS-level notifications.

```typescript
notifications.send(opts: { title: string; body?: string; action?: string }): Promise<void>
```

- Uses the `Notification` API. Falls back silently if unavailable.
- If `action` is provided, clicking the notification triggers the action in the host.

### `sdk.theme` — Theme Control

Read and modify the MomAI theme.

```typescript
theme.setColors(colors: { primary?: string; accent?: string; bg?: string; text?: string }): Promise<void>
theme.setFont(kind: 'sans' | 'mono', fontFamily: string): Promise<void>
theme.getCurrentTheme(): Promise<{ colors: Record<string, string>; fonts: Record<string, string> }>
```

- Theme extensions must declare `type: "theme"` (inferred from `manifest.theme`).
- Theme-only extensions cannot declare `tools`, `background`, `storage`, `process`, or `shell` in their manifest.

### `sdk.scheduler` — Cron Scheduling

Schedule periodic tasks.

```typescript
scheduler.cron(schedule: string, handler: () => void): { cancel: () => void }
```

- Uses cron expression format: `minute hour dayOfMonth month dayOfWeek` (5 fields, space-separated).
- Example: `"0 9 * * 1-5"` = every weekday at 9:00.
- Checked every 60 seconds.
- Returns `{ cancel }` to stop the schedule.
- Requires the `scheduler` permission.

### `sdk.oauth` — OAuth Authentication

Initiate OAuth flows.

```typescript
oauth.authorize(provider: string, opts: { scope: string[] }): Promise<SDKResponse<{ token: string; expiresAt?: number }>>
```

- Sends the user through the OAuth authorization flow.
- Returns an access token with optional expiration.
- Requires the `oauth` permission.

### `sdk.config` — Extension Configuration

Store and retrieve host-managed configuration values.

```typescript
config.get(key: string): Promise<string | null>
config.set(key: string, value: string): Promise<void>
config.delete(key: string): Promise<void>
```

- Values are stored by the host, not in extension local storage.
- Useful for settings that should survive extension reinstallation.

### `sdk.process` — Process Spawn

Spawn subprocesses (requires `process` permission).

```typescript
process.spawn(command: string, args?: string[], opts?: { cwd?: string }): Promise<{ stdout: string; stderr: string; exitCode: number }>
```

- Runs in sandboxed environment with restricted PATH.
- Output is captured in memory (max buffer limits may apply).

### `sdk.system` — System Control

Control mouse, keyboard, and capture screen.

```typescript
system.mouse.click(x: number, y: number): Promise<void>
system.mouse.move(x: number, y: number): Promise<void>
system.keyboard.type(text: string): Promise<void>
system.keyboard.press(key: string): Promise<void>
system.screen.capture(): Promise<Buffer>
```

### `sdk.browser` — Web Browser

Open URLs and interact with web pages.

```typescript
browser.open(url: string): Promise<void>
browser.evaluate(js: string): Promise<any>
browser.screenshot(): Promise<Buffer>
```

### `sdk.has(method)` — Capability Detection

Check if a method is available in the current SDK version.

```typescript
sdk.has('api.get')        // true
sdk.has('browser.open')   // true
sdk.has('storage.migrate') // true
sdk.has('fake.method')    // false
```

Useful for gracefully degrading when a method doesn't exist in older SDK versions.

### `sdk.dev` — Development Utilities

```typescript
dev.reload(): void                      // Hot-reload the extension
dev.log(...args: any[]): void           // Log with [MomAI:Extension] prefix
```

### Response Type

```typescript
interface SDKResponse<T = any> {
  ok: boolean
  data?: T
  error?: string
  errorCode?: SDKErrorCode
}

type SDKErrorCode =
  | 'method_not_available'
  | 'permission_denied'
  | 'safe_mode'
  | 'not_found'
  | 'timeout'
  | 'internal_error'
```

## SDK in the Extension Worker

In the isolated host worker (`extension-host-worker.js`), extensions receive a `momai` object instead of the full SDK. The `momai` object provides:

```typescript
momai.log(msg: string): void                    // Send log to host
momai.sendEvent(eventType: string, data: any): void  // Emit event to host
momai.sendStructuredResponse(data: any): void    // Send structured response
momai.storage.get(key: string): Promise<any>     // Persistent storage
momai.storage.set(key: string, value: any): Promise<void>  // Persistent storage
```

The full SDK is available in the **renderer** (React code). The worker uses the lightweight `momai` bridge for communication.

## Migration Guide

If you were using the old extension API (pre-SDK), here's what changed:

| Old API | SDK Equivalent |
|---------|---------------|
| `window.momai.api.*` | `sdk.api.*` |
| `window.momai.storage.*` | `sdk.storage.*` |
| `window.momai.events.*` | `sdk.events.*` |
| `registerRenderer(type, component)` | `sdk.registry.registerRenderer(type, component)` |
| Direct `fetch()` calls | `sdk.api.get/post/put/delete` |

To migrate:

1. Replace `window.momai` references with `import { getSDK } from 'momai-sdk'` / `const sdk = getSDK()`
2. Replace `window.momai.api.get('/path')` with `sdk.api.get('/path')`
3. Replace `window.momai.storage.get('key')` with `sdk.storage.get('key')`
4. Update `registerRenderer` calls to `sdk.registry.registerRenderer`
5. Test with `pnpm test:extensions`

## Best Practices

1. **Use `sdk.has()` for feature detection** — always check before calling a method that may not exist in all SDK versions.
2. **Handle `SDKResponse` errors** — check `result.ok` before using `result.data`.
3. **Avoid direct `fetch()` calls** — use `sdk.api.*` for proper caching, authentication, and error handling.
4. **Register renderers early** — call `sdk.registry.registerRenderer` during module initialization so the host can dispatch before user interaction.
5. **Clean up subscriptions** — store the unsubscribe function returned by `sdk.events.subscribe` and call it on unmount.
6. **Use storage migration** — when changing data format, increment your storage version and write a migration function with `sdk.storage.migrate`.
7. **Minimize bundle size** — externalize `react`, `react-dom`, `react/jsx-runtime` in your esbuild config.
