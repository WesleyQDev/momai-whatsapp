# Version Compatibility

## Overview

MomAI extensions use two version fields for compatibility:

- **`momai_compat`** (string): Semver range in `manifest.json` that specifies which MomAI app versions this extension is compatible with. Used by the store to filter extensions.
- **`sdkVersion`** (integer, in `manifest.json`): The SDK version the extension was built against. Used by the runtime adapter to route to the correct SDK version.

## `momai_compat` — Store Filtering

```json
{
  "momai_compat": ">=0.5.0 <1.0.0"
}
```

The store parses this field to decide whether to show the extension to a user. Uses semver range syntax:

| Range | Meaning |
|-------|---------|
| `">=1.0.0"` | Compatible with 1.0.0 and above |
| `"<2.0.0"` | Compatible with anything below 2.0.0 |
| `">=0.5.0 <1.0.0"` | Compatible with 0.5.0 through 0.x.x |
| `"*"` | Compatible with any version |
| `"1.0.0"` | Exact version only |
| `"^1.0.0"` | Compatible with 1.x.x |
| `"~1.0.0"` | Compatible with 1.0.x |

If omitted, the extension assumes `">=0.1.0"` (compatible with all known versions).

## `sdkVersion` — Adapter Routing

```json
{
  "sdkVersion": 1
}
```

The runtime uses `sdkVersion` to select the appropriate adapter from the [adapter system](../apps/momai/src/sdk/adapter.ts). The adapter ensures backward compatibility by mapping old SDK calls to the current API surface.

Available SDK versions:

| Version | Status | Notes |
|---------|--------|-------|
| 1 | Active | Initial SDK release |

Adapter logic:

```typescript
function getAdapter(sdkVersion: number): SDKAdapter {
  if (adapters[sdkVersion]) return adapters[sdkVersion]
  // Fall back to latest available version <= requested version
  for (let i = availableVersions.length - 1; i >= 0; i--) {
    if (availableVersions[i] <= sdkVersion) return adapters[availableVersions[i]]
  }
  throw new Error(`SDK v${sdkVersion} is not supported (max: ${maxSDKVersion})`)
}
```

## Breaking Change Policy

| Change Type | Is Breaking? | Version Action |
|-------------|-------------|----------------|
| Adding a new SDK method | No | Patch bump only |
| Adding a new module to SDK | No | Minor bump |
| Changing a method signature (new optional param) | No | Minor bump |
| Changing a method signature (required param) | Yes | New SDK version + adapter |
| Removing an SDK method | Yes | New SDK version + adapter |
| Changing a method's return type | Yes | New SDK version + adapter |
| Changing a manifest field meaning | Yes | New SDK version + adapter |
| Adding a new manifest field | No | Minor bump |
| Removing a manifest field | Yes | New SDK version |
| Adding a new permission | No | Minor bump |
| Changing storage format | Yes | Migration function required |

## SDK Lifecycle

| Phase | Description |
|-------|-------------|
| **Active** | Current version. All extensions use this by default. |
| **Deprecated** | Old version still supported but new extensions should target current version. |
| **Sunset** | Removed from adapter list. Extensions at this version will receive the next available adapter. |

Policy:

1. Each SDK version lives for at least **3 MomAI releases** (app versions, not SDK versions).
2. Deprecation warning is emitted (console) when an extension uses a deprecated SDK version.
3. When an SDK version is sunset, its adapter is removed and extensions fall back to the next available version.
4. Major SDK versions (2, 3, ...) require a new adapter class in `adapter.ts`.

## Testing Compatibility

```bash
pnpm test:contract  # Verifies SDK surface matches tests
pnpm test:extensions  # Installs official extensions and verifies they work
```

Run these after any change to:

- `src/sdk/` (SDK source)
- `scripts/node-core/services/extensions*` (extension platform)
- `scripts/node-core/services/manifest-*` (manifest resolution)
- `scripts/node-core/services/skill-orchestrator.js` (extension payload build)
- `scripts/node-core/api/routes/extensions.routes.js` (API routes)
