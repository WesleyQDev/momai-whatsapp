# Publishing Guide

This guide describes how to publish an extension to the MomAI community catalog.

## Repository Setup

Extensions must be open source and hosted on GitHub. The recommended structure:

```
your-extension/
├── .github/workflows/build.yml   # CI to create release ZIP
├── manifest.json                  # Extension manifest
├── SKILL.md                       # System prompt for the LLM
├── runtime.js                     # Node.js runtime logic
├── package.json                   # Dependencies
├── build.mjs                      # esbuild config
├── src/
│   ├── page.tsx                   # UI page (optional)
│   ├── panel.tsx                  # UI panel (optional)
│   └── registry-bridge.ts         # Renderer registration
├── dist/                          # Built bundles (gitignored)
├── README.md                      # Documentation
├── LICENSE                        # Open source license
└── icon.svg                       # Extension icon (optional)
```

## Build and Package

### Step 1: Build the UI

```bash
npm install
npm run build   # runs esbuild, outputs dist/page.js and/or dist/panel.js
```

### Step 2: Create Release ZIP

Create a ZIP with only the necessary files:

```bash
zip -r your-extension-v1.0.0.zip \
  manifest.json \
  SKILL.md \
  runtime.js \
  package.json \
  dist/ \
  node_modules/ \
  -x "node_modules/.cache/*"
```

### Step 3: Create a GitHub Release

1. Tag the release: `git tag v1.0.0 && git push --tags`
2. Create a Release on GitHub from the tag.
3. Upload the ZIP as a release asset.
4. Set the release title to the version number.

## Community Catalog Entry

The community catalog is maintained at:
`https://github.com/WesleyQDev/MomAI-App/blob/main/community-extensions.json`

### Entry Format

Add your extension to the `extensions` array:

```json
{
  "id": "your-extension",
  "name": "Your Extension",
  "description": "What your extension does.",
  "author": "YourName",
  "version": "1.0.0",
  "download_url": "https://github.com/YourName/your-extension/releases/download/v1.0.0/your-extension-v1.0.0.zip",
  "repo": "YourName/your-extension",
  "is_official": false,
  "icon_url": "https://raw.githubusercontent.com/YourName/your-extension/main/icon.svg",
  "icon_bg": "#0066CC",
  "locales": {
    "pt-BR": {
      "name": "Sua Extensão",
      "description": "O que sua extensão faz."
    }
  }
}
```

### Fields

| Field | Required | Description |
|-------|----------|-------------|
| `id` | ✅ | Unique identifier. Must match the extension's `manifest.json` `id`. |
| `name` | ✅ | Display name. |
| `description` | ✅ | Short description. |
| `author` | ✅ | Author GitHub handle or name. |
| `version` | ✅ | Latest version. Must match the GitHub release tag. |
| `download_url` | ✅ | Direct download URL for the ZIP. Must be HTTPS. |
| `repo` | ❌ | GitHub repo in `Owner/Repo` format. |
| `is_official` | ❌ | `true` if maintained by MomAI team. |
| `icon_url` | ❌ | URL to an SVG icon for the store listing. |
| `icon_bg` | ❌ | Background color for the icon (hex). |
| `locales` | ❌ | Translations for name/description in other languages. |

### Submission Process

1. **Fork** the `WesleyQDev/MomAI-App` repository.
2. **Clone** your fork locally.
3. **Edit** `community-extensions.json` to add your entry.
4. **Commit** with message: `"feat: add YourExtension to community catalog"`
5. **Push** to your fork.
6. **Create a Pull Request** against `WesleyQDev/MomAI-App/main`.
7. In the PR description, include:
   - Link to your extension's GitHub repo.
   - Link to the release ZIP.
   - Confirmation that the ZIP has been tested with MomAI.
   - Any special permissions or requirements.

### Review Criteria

PRs to the community catalog are reviewed against:

| Criterion | Requirement |
|-----------|-------------|
| Manifest validation | `manifest.json` must be valid per the schema. |
| Security | No obvious malicious patterns. Permissions must match declared capabilities. |
| Functionality | Extension must load without errors. |
| Documentation | README must explain usage and permissions. |
| License | Must have an open source license file. |

## Version Updates

To update your extension:

1. Make changes in your repo.
2. Bump the `version` in `manifest.json` and `package.json`.
3. Build and create a new GitHub Release.
4. Update the `version` and `download_url` in `community-extensions.json`.
5. Submit a PR to update the catalog entry.

## Deprecation

To remove an extension from the store:

1. Remove the entry from `community-extensions.json`.
2. Or keep the entry but set `"status": "deprecated"`.
3. Submit a PR explaining the reason for removal.
