# Advanced Extension Topics

## OAuth

Extensions can use OAuth to authenticate with third-party services.

### Flow

1. Extension calls `sdk.oauth.authorize(provider, { scope })`.
2. The host opens the provider's authorization URL in the user's browser.
3. User authorizes the application.
4. Provider redirects to a local callback URL.
5. Host exchanges the authorization code for tokens.
6. Host returns the access token to the extension.

### Implementation

```typescript
import { getSDK } from 'momai-sdk'
const sdk = getSDK()

async function connectToService() {
  const result = await sdk.oauth.authorize('google', {
    scope: ['https://www.googleapis.com/auth/calendar.readonly']
  })

  if (result.ok) {
    console.log('Token:', result.data.token)
    console.log('Expires at:', result.data.expiresAt)
    // Store for later use
    await sdk.config.set('google_token', result.data.token)
  } else {
    console.error('OAuth failed:', result.error)
  }
}
```

### Requirements

- Declare the `oauth` permission in `manifest.json`.
- The provider must be registered in the host's OAuth configuration.
- The extension must handle token expiration and refresh (if applicable).

## Scheduler / Cron

Extensions can run scheduled tasks using cron expressions.

### Implementation

```typescript
import { getSDK } from 'momai-sdk'
const sdk = getSDK()

// Run every day at 9:00 AM
const job = sdk.scheduler.cron('0 9 * * *', () => {
  console.log('Running daily task...')
  sdk.notifications.send({
    title: 'Daily Report',
    body: 'Your scheduled task has run.'
  })
})

// Later, cancel the job
job.cancel()
```

### Cron Format

```
minute hour dayOfMonth month dayOfWeek
```

| Field | Range | Special Values |
|-------|-------|----------------|
| minute | 0-59 | `*` (every) |
| hour | 0-23 | `*` (every) |
| dayOfMonth | 1-31 | `*` (every) |
| month | 1-12 | `*` (every) |
| dayOfWeek | 0-6 (0=Sunday) | `*` (every) |

### Examples

| Expression | Meaning |
|------------|---------|
| `"0 9 * * 1-5"` | Weekdays at 9:00 AM |
| `"*/15 * * * *"` | Every 15 minutes |
| `"0 0 * * *"` | Midnight every day |
| `"0 0 1 * *"` | First day of every month at midnight |
| `"30 18 * * 6"` | Saturdays at 6:30 PM |

### Requirements

- Declare the `scheduler` permission in `manifest.json`.
- The interval is checked every 60 seconds (not real-time cron).
- For background extensions (`background: true`), the scheduler runs in the persistent worker.
- For non-background extensions, the scheduler runs in the host process.

## Notifications

### Desktop Notifications

```typescript
await sdk.notifications.send({
  title: 'New Message',
  body: 'You received a new message from Alice.',
  action: 'open-chat'  // Optional: triggers action on click
})
```

### Action Handling

When a user clicks a notification with an `action` field:

```typescript
sdk.events.subscribe('notification_action', (data) => {
  if (data.action === 'open-chat') {
    // Navigate or open chat view
  }
})
```

### Structured Responses

Extensions can send rich UI responses back to the LLM chat:

```typescript
// In runtime.js (worker)
return {
  tool: 'my_tool',
  structuredResponse: {
    type: 'my_card',
    data: {
      title: 'Hello',
      description: 'This is a rich card'
    }
  },
  instruction: JSON.stringify(result)
}
```

Then in your UI bundle, register a renderer:

```typescript
import { getSDK } from 'momai-sdk'
const sdk = getSDK()

sdk.registry.registerRenderer('my_card', MyCardComponent)

function MyCardComponent({ data }) {
  return (
    <div>
      <h2>{data.title}</h2>
      <p>{data.description}</p>
    </div>
  )
}
```

## Cross-Platform Paths

The SDK provides basic path utilities that work across platforms:

```typescript
import { normalizePath, joinPaths, basename, dirname } from 'momai-sdk/modules/path'

// Normalize backslashes to forward slashes
normalizePath('foo\\bar')  // => 'foo/bar'

// Join path segments
joinPaths('foo', 'bar', 'baz')  // => 'foo/bar/baz'

// Get basename
basename('foo/bar/file.txt')  // => 'file.txt'

// Get dirname
dirname('foo/bar/file.txt')  // => 'foo/bar'
```

## Event Broadcasting

### Receiving Host Events

```typescript
// Subscribe to a host lifecycle event
const unsubscribe = sdk.events.subscribe('app_started', () => {
  console.log('App started! Initializing...')
})

// Subscribe once
sdk.events.once('idle_tick', () => {
  console.log('System is idle')
})

// Unsubscribe when done
unsubscribe()
```

### Emitting Custom Events (Worker)

Background workers can emit custom events to the host:

```javascript
// In runtime.js
momai.sendEvent('my_custom_event', {
  status: 'connected',
  timestamp: Date.now()
})
```

These events are broadcast to all SSE clients and can be received by other extensions or the UI.

### Built-in Host Events

| Event | Trigger |
|-------|---------|
| `app_started` | Application startup completed |
| `idle_tick` | User has been idle (periodic) |
| `extension_installed` | A new extension was installed |
| `extension_removed` | An extension was uninstalled |
| `dev_extension_reload` | Development hot-reload triggered |

## Hot Reload (Development)

During development, the `ExtensionDevWatcher` monitors the `extensions-dev/` directory for changes:

```typescript
// Triggered when main.js, manifest.json, or styles.css change:
sdk.events.subscribe('dev_extension_reload', (data) => {
  console.log('Reloading:', data.extId)
  console.log('Changed file:', data.file)
})
```

Changes trigger:
1. Registry reload (re-reads SKILL.md and runtime.js).
2. SSE broadcast of `dev_extension_reload` event.
3. UI hot-reload via Vite dev server.

## Path Utilities

### Storage Paths

In development:
```
apps/momai/data/extensions/<id>/       # monorepo path
%APPDATA%/MomAI-Dev/data/extensions/<id>/  # runtime path
```

In production:
```
%APPDATA%/MomAI/data/extensions/<id>/
```

### Extension Path Resolution

The SDK doesn't expose the full filesystem path of the extension. For storage, use the `sdk.storage` API (which is scoped automatically). For file operations in the worker, most operations happen relative to the extension's working directory (which is the extension root).

## Performance Considerations

1. **Scheduler tasks** should be lightweight. Heavy processing should be offloaded to the LLM or deferred.
2. **Structured responses** can be large (up to 1 MB), but keep them under 100 KB for good chat performance.
3. **Worker pool** limits to 2 workers per extension. If you need concurrent execution, design your extension to handle it in a single worker.
4. **Storage reads** are file I/O in production. Cache frequently-read values in memory.
5. **Event subscriptions** should be cleaned up. Memory leaks from orphaned subscribers can degrade app performance.
