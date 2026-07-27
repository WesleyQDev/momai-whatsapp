# Extension Manifest Reference

## Overview

Every extension must have a `manifest.json` file at its root. This file declares metadata, capabilities, permissions, UI, event handlers, routes, and theme information.

## Full Schema

```json
{
  "id": "my-extension",
  "name": "My Extension",
  "version": "1.0.0",
  "description": "A useful extension for MomAI.",
  "author": "Your Name",
  "icon": "Puzzle",
  "momai_compat": ">=0.5.0",
  "sdkVersion": 1,
  "background": true,
  "backgroundScript": "runtime.js",
  "persistOnQuit": "flush_history",
  "permissions": ["network", "filesystem:read"],
  "tools": [
    {
      "name": "my_tool",
      "description": "Does something useful",
      "parameters": {
        "type": "object",
        "properties": {
          "param1": {
            "type": "string",
            "description": "A parameter"
          }
        },
        "required": ["param1"]
      }
    }
  ],
  "events": ["app_started", "idle_tick"],
  "ui": {
    "page": "dist/page.js",
    "pageType": "my-extension-page",
    "panel": "dist/panel.js",
    "panelType": "my-extension-panel"
  },
  "eventTypes": ["qr_code", "authenticated", "connection_status"],
  "routes": [
    {
      "method": "POST",
      "path": "/disconnect",
      "tool": "disconnect"
    }
  ],
  "storage": {
    "description": "Stores authentication credentials and message history.",
    "locations": ["auth/", "messages/*.json"]
  },
  "voiceHooks": {
    "reply": {
      "tool": "get_history",
      "promptTemplate": "[INSTRUCTION: User is replying to {contactName}: {lastMessage}]"
    }
  },
  "theme": {
    "gradient": "from-blue-500 to-indigo-600",
    "accent": "blue"
  },
  "toolPriority": {
    "label": "MY-EXT",
    "rule": "use my_tool when user asks about X, Y, Z"
  }
}
```

## Field Reference

### Metadata Fields

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `id` | ✅ | `string` | Unique identifier (lowercase, hyphens allowed). Used in routes, storage paths, and API calls. |
| `name` | ✅ | `string` | Display name shown in UI. |
| `version` | ✅ | `string` | Semver version of this extension. |
| `description` | ✅ | `string` | Short description shown in the store and UI. |
| `author` | ❌ | `string` | Author name or handle. |
| `icon` | ❌ | `string` | Icon identifier (HeroIcon name, emoji, or SVG inline string). |

### Compatibility Fields

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `momai_compat` | ❌ | `string` | Semver range for store filtering, e.g. `">=0.5.0 <1.0.0"`. Defaults to `">=0.1.0"`. |
| `sdkVersion` | ❌ | `integer` | SDK version this extension targets. Defaults to `1`. |

### Runtime Fields

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `background` | ❌ | `boolean` | If `true`, the extension runs as a persistent background worker (long-lived process). |
| `backgroundScript` | ❌ | `string` | Entry point for the background worker. Defaults to `"runtime.js"`. Must not escape the extension directory (path traversal check enforced). |
| `persistOnQuit` | ❌ | `string` | Tool name to call when the app is quitting, for cleanup (e.g. flush buffers, encrypt secrets). |

### Permissions

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `permissions` | ❌ | `string[]` | Array of permission identifiers. See [Security Guide](extension-seguranca.md). |

### Tools (LLM Function Calling)

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `tools` | ❌ | `Tool[]` | Array of tool definitions in OpenAI function calling format. Each tool has `name`, `description`, and `parameters` (JSON Schema). |

Tool format:

```json
{
  "name": "get_weather",
  "description": "Get weather for a location",
  "parameters": {
    "type": "object",
    "properties": {
      "location": { "type": "string" }
    },
    "required": ["location"]
  }
}
```

### Events (Host Lifecycle)

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `events` | ❌ | `string[]` | Host lifecycle events the extension listens to. Built-in types: `app_started`, `idle_tick`. |

### UI Fields

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `ui.page` | ❌ | `string` | Path to the full-page UI bundle (relative to extension root). |
| `ui.pageType` | ❌ | `string` | Unique type identifier for the page renderer. Used in `registerRenderer`. |
| `ui.panel` | ❌ | `string` | Path to the side-panel UI bundle (relative to extension root). |
| `ui.panelType` | ❌ | `string` | Unique type identifier for the panel renderer. |

At least one of `ui.page` or `ui.panel` must be present for UI-type extensions.

### Event Types (Custom Events)

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `eventTypes` | ❌ | `string[]` | Custom event types that the extension emits. Used by the host to dispatch structured responses and notifications. |

### Routes (HTTP API)

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `routes` | ❌ | `Route[]` | Custom HTTP routes mounted at `/extensions/<id>/<path>`. |

Route format:

```json
{
  "method": "POST",
  "path": "/disconnect",
  "tool": "disconnect"
}
```

- `method`: HTTP method (`GET`, `POST`, `PUT`, `DELETE`).
- `path`: Relative path (appended to `/extensions/<id>/`).
- `tool`: The tool name in the extension's `runtime.js` to invoke.

### Storage Declaration

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `storage.description` | ❌ | `string` | Human-readable description of what data is stored. Shown in Privacy view. |
| `storage.locations` | ❌ | `string[]` | Glob patterns describing storage locations. Shown in Privacy view. |

### Voice Hooks

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `voiceHooks.reply.tool` | ❌ | `string` | Tool to call when user is replying via voice. |
| `voiceHooks.reply.promptTemplate` | ❌ | `string` | Template string with `{contactName}` and `{lastMessage}` placeholders for injecting context into the LLM prompt. |

### Theme

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `theme.gradient` | ❌ | `string` | Tailwind gradient class. Must be in the allowed gradient whitelist. |
| `theme.accent` | ❌ | `string` | Accent color: `emerald`, `blue`, or `violet` (default `violet`). |

### Tool Priority

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `toolPriority.label` | ❌ | `string` | Short label for the system prompt tool priority section. |
| `toolPriority.rule` | ❌ | `string` | Natural language rule telling the LLM when to use this extension's tools. |

## Inferred Extension Types

The host infers the extension type from manifest fields:

| Type | Inference Rule | Restrictions |
|------|---------------|--------------|
| `skill` | Has `tools[]` with at least one tool | None |
| `ui` | Has `ui.page` or `ui.panel` | None |
| `background` | `background: true` | None |
| `theme` | Has `theme.colors` or `theme.fonts` | Cannot declare `tools`, `background`, `storage`, `process`, `shell` |

If no type is inferred (e.g. a manifest with only metadata), the extension defaults to `skill`.

## Validation Rules

| Rule | Error |
|------|-------|
| `id` must be lowercase with only letters, numbers, hyphens | Invalid format error |
| `version` must be valid semver | Invalid version error |
| `ui.page` path must exist and be a `.js` file | Missing file error |
| `ui.panel` path must exist and be a `.js` file | Missing file error |
| Theme extensions cannot declare tools, background, storage, process, or shell | Validation error |
| `backgroundScript` path must not escape extension directory | Security error |
| `theme.gradient` must be in the allowed gradient whitelist | Validation error |
| `permissions` entries must be valid permission identifiers | Unknown permission warning |

## Example: Minimal Extension (No UI)

```json
{
  "id": "hello-world",
  "name": "Hello World",
  "version": "1.0.0",
  "description": "A simple skill extension.",
  "tools": [
    {
      "name": "hello",
      "description": "Say hello",
      "parameters": {
        "type": "object",
        "properties": {
          "name": { "type": "string" }
        },
        "required": ["name"]
      }
    }
  ]
}
```

## Example: UI Extension with Full Page

```json
{
  "id": "dashboard",
  "name": "System Dashboard",
  "version": "0.1.0",
  "description": "Real-time system resource monitor.",
  "permissions": ["system:info", "scheduler"],
  "background": true,
  "ui": {
    "page": "dist/page.js",
    "pageType": "dashboard-page"
  },
  "theme": {
    "gradient": "from-emerald-500 to-green-600",
    "accent": "emerald"
  }
}
```
