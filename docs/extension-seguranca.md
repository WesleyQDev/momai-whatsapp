# Extension Security Guide

## Permission System

Extensions declare permissions in `manifest.json` under the `permissions` array. The host checks these before granting access.

### Permission Reference

| Permission | Risk Level | Description | SDK Methods |
|------------|-----------|-------------|-------------|
| `network` | High | Full network access | `sdk.api.*` |
| `filesystem:read` | Medium | Read files | `sdk.storage.*` (read) |
| `filesystem:write` | High | Write files | `sdk.storage.*` (write) |
| `ui:sidebar` | Low | Add sidebar panels | UI registration |
| `ui:commands` | Low | Register commands | UI registration |
| `ui:theme` | Low | Modify theme colors | `sdk.theme.*` |
| `chat:messages` | Medium | Read chat messages | Event subscription |
| `system:info` | Low | View system info | `sdk.system.*` |
| `process` | Critical | Access system processes | `sdk.process.*` |
| `shell` | Critical | Execute shell commands | N/A (requires explicit config) |
| `scheduler` | Medium | Run scheduled tasks | `sdk.scheduler.*` |
| `oauth` | Medium | OAuth authentication | `sdk.oauth.*` |

### Permission Check

```javascript
const { checkPermission } = require('extension-permissions')

// Returns { allowed: boolean, error: string|null, risk: string|null }
checkPermission(declaredPermissions, 'network')
```

### Risk Levels

| Level | Behavior |
|-------|----------|
| `low` | Auto-granted without user prompt |
| `medium` | Prompted on first use |
| `high` | Prompted on install and first use |
| `critical` | Requires explicit user confirmation in settings |

## Path Traversal Protection

The extension host manager validates paths to prevent directory traversal attacks.

### On `backgroundScript`

```javascript
const resolvedBase = path.resolve(skillPath)
const resolvedScript = path.resolve(skillPath, bgScript)
if (!resolvedScript.startsWith(resolvedBase + path.sep) && resolvedScript !== resolvedBase) {
  throw new Error('backgroundScript path escapes extension directory')
}
```

### On Storage Keys

```javascript
const SAFE_KEY = /^[a-zA-Z0-9_-]+$/
if (typeof key !== 'string' || !SAFE_KEY.test(key)) {
  throw new Error('Invalid storage key')
}
```

Storage keys are restricted to alphanumeric characters, underscores, and hyphens. This prevents path traversal via keys like `../../etc/passwd`.

### On File System Access

The host worker's storage is scoped to `data/extensions/<extId>/`. All reads and writes are confined to this directory. The host does not provide general file system access — only the scoped storage API.

## Safe Mode

Safe mode disables all non-essential extensions. It's designed for:

- Troubleshooting app issues caused by extensions.
- Starting the app when an extension crashes on launch.
- Security incidents (suspected malicious extension).

### Behavior

| Feature | Safe Mode |
|---------|-----------|
| Core built-in skills | Enabled |
| Packaged extensions | Disabled |
| User-installed extensions | Disabled |
| Extension workers | Not started |
| Extension storage | Preserved (not deleted) |
| Extension UI routes | Not mounted |

### API

```javascript
const { isSafeMode, setSafeMode, toggleSafeMode } = require('extension-safe-mode')

isSafeMode()    // boolean
setSafeMode(true)  // enable
toggleSafeMode()   // toggle
```

### How Safe Mode Works

1. On app startup, the host checks the safe mode flag.
2. If enabled, the registry skips loading all user-installed and packaged extensions.
3. Only core built-in skills are loaded.
4. The user can disable safe mode in settings.
5. When disabled, all extensions are loaded normally.

## CSS Scope Isolation

To prevent extension CSS from leaking into the host UI, all extension styles are scoped:

```javascript
function scopeCSS(css, extId) {
  const prefix = `.ext-${extId}`
  return css.replace(/([.#][a-zA-Z0-9_-]+)\s*\{/g, `${prefix} $1 {`)
}
```

Extension UI bundles are loaded inside a container with class `ext-<id>`, ensuring style isolation.

## Gradient Whitelist

`manifest.theme.gradient` must be one of these values (validated at render time to prevent arbitrary Tailwind class injection):

```
from-emerald-500 to-green-600
from-blue-500 to-indigo-600
from-violet-600 to-purple-500
from-rose-600 to-pink-500
from-cyan-600 to-blue-500
from-emerald-600 to-teal-500
from-amber-600 to-orange-500
from-fuchsia-600 to-pink-500
from-indigo-600 to-violet-500
from-lime-600 to-green-500
from-sky-600 to-cyan-500
from-red-600 to-rose-500
```

`accent` must be one of: `emerald`, `blue`, `violet` (default `violet`).

## Download URL Validation

Extension install requests validate download URLs against:

1. **HTTPS requirement**: Only HTTPS URLs are allowed for download.
2. **Private IP protection**: URLs pointing to private IP ranges (10.x.x.x, 172.16-31.x.x, 192.168.x.x, 127.x.x.x) are rejected.
3. **Dev allowlist**: In development, the URL must match an entry in `dev-extensions.json`.
4. **Checksum verification**: When a SHA-256 hash is provided, the downloaded ZIP is verified against it.

## Best Practices

### For Extension Developers

1. **Declare minimum permissions** — request only what you need. Users can reject extensions with excessive permissions.
2. **Validate all input** — sanitize data received from the LLM or external sources before using it in storage keys or paths.
3. **Use safe storage keys** — only `[a-zA-Z0-9_-]` characters.
4. **Don't rely on obfuscation** — extension bundles can be inspected. Don't embed secrets in your code.
5. **Keep sensitive data in config** — use `sdk.config.*` (host-managed) for API keys and tokens, not `sdk.storage.*`.
6. **Handle the `persistOnQuit` hook** — flush buffers and encrypt sensitive data when the app quits.
7. **Test in safe mode** — verify your extension degrades gracefully when disabled.

### For Users

1. **Review permissions** before installing an extension.
2. **Enable safe mode** if the app behaves unexpectedly after installing an extension.
3. **Only install from trusted sources** — extensions from the community catalog are reviewed but not audited.
4. **Check storage declarations** in the Privacy view to see what data extensions store.
