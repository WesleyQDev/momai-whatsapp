# Extension Development Modes

MomAI supports three development modes for extensions, controlled by the `dev_mode` setting.

## Mode Comparison

| Mode | Name | Data Source | Use Case |
|------|------|-------------|----------|
| `symlink` | Dev (Symlinks) | `data/extensions/.dev/<id>` | Internal development with symlinks to external repos |
| `store_test` | Testar Loja | `data/extensions/<id>` | Testing the store install flow locally |
| `store` | Store (Production) | `data/extensions/<id>` | Production — downloaded from remote catalog |

The mode switcher ("Dev" vs "Testar Loja" in the UI) controls which root directory the host scans. The two development modes do not share extensions.

## Symlink Mode (`dev_mode = "symlink"`)

Used for local development of extensions whose code lives outside the monorepo.

### How It Works

1. You clone the extension repo to any directory on your machine.
2. Create a symlink (or junction on Windows) from `data/extensions/.dev/<id>/` to your extension directory.
3. The host scans `data/extensions/.dev/` for extensions.
4. Changes to your extension's files are picked up in real time.

### Creating the Symlink

**Windows (PowerShell)** — use Junction (no admin required):

```powershell
# Runtime data directory
$dataDir = "$env:APPDATA\MomAI-Dev\data"
New-Item -ItemType Directory -Path "$dataDir\extensions\.dev" -Force
New-Item -ItemType Junction -Path "$dataDir\extensions\.dev\my-ext" `
  -Value "C:\path\to\my-extension"
```

**Linux / macOS:**

```bash
DATA_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/MomAI-Dev/data"
mkdir -p "$DATA_DIR/extensions/.dev"
ln -s /path/to/my-extension "$DATA_DIR/extensions/.dev/my-ext"
```

### Hot Reload

In symlink mode, the `ExtensionDevWatcher` monitors `.dev/` for changes:

- Changes to `manifest.json`, `main.js`, or `styles.css` trigger a hot-reload.
- New folders or removed folders trigger a full registry reload.
- The UI refreshes via Vite's dev server when bundles change.

## Store Test Mode (`dev_mode = "store_test"`)

Used to test the full store install flow (download, extract, validate) during development.

### How It Works

1. The extension must have an entry in `dev-extensions.json` at the repo root.
2. The "Testar Loja" mode scans `data/extensions/<id>` (same path as production).
3. Use the store UI to install extensions — the download URL is resolved from `dev-extensions.json`.
4. This validates URL parsing, download, extraction, and manifest validation.

### Entry Format in `dev-extensions.json`

```json
{
  "id": "my-ext",
  "name": "My Extension",
  "description": "Description",
  "author": "YourName",
  "version": "1.0.0",
  "download_url": "https://github.com/YourName/my-ext/releases/download/v1.0.0/my-ext.zip",
  "sha256": "expected_sha256_hash",
  "is_official": false
}
```

## Store Mode (Production)

The default mode in packaged builds (NSIS, portable).

### How It Works

1. `dev_mode` is ignored.
2. The store fetches the community catalog from the remote URL.
3. Extensions are downloaded and installed to `data/extensions/<id>`.
4. `dev-extensions.json` and `.dev/` symlinks are not used.
5. The mode switcher UI is hidden.

## Cross-Mode Notes

### Uninstall

`uninstallExtension` removes from both roots:

```
data/extensions/<id>/   # store and store_test
data/extensions/.dev/<id>/  # symlink mode
```

This prevents orphaned data when switching modes.

### Limitations

| Aspect | Limitation |
|--------|------------|
| Symlink + Watch | Must run `esbuild --watch` manually in the extension dir |
| Store test | Requires a valid `dev-extensions.json` entry |
| Mode switch | Does not copy files between roots |
| Production | All dev features disabled; no mode switcher in UI |

## Extensions-Dev Directory

The `extensions-dev/` directory provides an alternative workflow for SDK-based extension development (outside the monorepo).

### Workflow

1. The SDK CLI (`npx momai-sdk create my-ext`) scaffolds an extension.
2. During development, the `extensions-dev/` watcher monitors the directory.
3. The CLI can copy built bundles to the correct location using a `momai-dev` command.
4. This is similar to symlink mode but designed for SDK-first development.

### Directory Location

```
{dataDir}/extensions-dev/<id>/
```

The watcher monitors this directory for changes and triggers reloads just like the symlink mode.

## Switching Modes

In development (`pnpm dev`):

1. Open the MomAI settings.
2. Under "Extensions", use the "Environment" dropdown.
3. Choose "Dev (Symlinks)" or "Testar Loja".
4. The app switches the scan root immediately.

In production, the environment is always "Store" and cannot be changed.
