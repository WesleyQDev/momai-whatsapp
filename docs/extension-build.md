# Extension Build Guide

## esbuild Configuration

Extensions with React UI must bundle their `page.tsx` and/or `panel.tsx` using esbuild as ESM modules.

### Minimal Build Script

```js
// build.mjs
import esbuild from 'esbuild'

await esbuild.build({
  entryPoints: ['src/page.tsx', 'src/panel.tsx'],
  bundle: true,
  format: 'esm',
  outdir: 'dist',
  external: ['react', 'react-dom', 'react/jsx-runtime'],
  sourcemap: true
})
```

### What to Externalize

Always externalize these packages (they are provided by the host):

| Package | Reason |
|---------|--------|
| `react` | Host provides React 19. Including it in the bundle would cause multiple React instances. |
| `react-dom` | Same as above. |
| `react/jsx-runtime` | Required for JSX transform. Host provides it. |

### Build Modes

| Mode | Command | Use Case |
|------|---------|----------|
| Production | `node build.mjs` | Release builds |
| Watch | `node build.mjs --watch` | Development with hot-reload |

### Format Requirements

- **Must be `format: 'esm'`** — never use `iife` (generates `require()` calls that browsers don't support).
- The host uses Vite's import analysis to rewrite bare specifiers (`react` → pre-bundled Vite dep) and handle CJS interop.
- Named imports from `react/jsx-runtime` (`import { Fragment, jsx, jsxs }`) require Vite's CJS interop transform.

## Package.json for Build

```json
{
  "private": true,
  "type": "module",
  "scripts": {
    "build": "node build.mjs",
    "dev": "node build.mjs --watch"
  },
  "devDependencies": {
    "esbuild": "^0.24.0",
    "typescript": "^5.7.0"
  }
}
```

## ZIP Format Requirements

### Release ZIP Structure

```
minha-extensao-v1.0.0.zip
├── manifest.json          # Required
├── SKILL.md               # Required (system prompt for LLM)
├── runtime.js             # Required (Node-side logic)
├── package.json           # Optional (metadata reference)
├── dist/
│   ├── page.js            # Optional (full-page UI bundle)
│   └── panel.js           # Optional (side-panel UI bundle)
└── node_modules/          # Required if runtime.js has dependencies
```

### What to Exclude

| File/Dir | Reason |
|----------|--------|
| `src/` | Source code is not needed at runtime |
| `build.mjs` | Build config not needed at runtime |
| `tsconfig.json` | TypeScript config not needed at runtime |
| `node_modules/.cache/` | Cache artifacts |
| `.git/` | Version control |
| `*.map` files | Source maps (optional, can include for debugging) |

## Bundle Size Best Practices

| Metric | Target | Hard Limit |
|--------|--------|------------|
| `runtime.js` | < 50 KB | 500 KB |
| `dist/page.js` | < 100 KB | 1 MB |
| `dist/panel.js` | < 50 KB | 500 KB |
| Total ZIP | < 5 MB | 50 MB |
| Storage per key | < 100 KB | 1 MB |

### Size Optimization Tips

1. **Externalize everything the host provides** — react, react-dom, react/jsx-runtime are the minimum. Check if the host also provides common utilities.
2. **Avoid large libraries in the bundle** — prefer native APIs over lodash, moment, etc.
3. **Split UI and runtime** — keep `runtime.js` (Node.js worker) lean. Heavy UI code goes in `dist/page.js`.
4. **Tree-shake your imports** — import only what you need from modules.
5. **Compress assets** — if you include images, use modern formats (WebP/AVIF).
6. **Lazy-load heavy components** — use dynamic `import()` for code that isn't needed immediately.

## Build Output

After a successful build, your extension directory should look like:

```
my-extension/
├── dist/
│   ├── page.js      (generated)
│   └── panel.js     (generated)
├── manifest.json
├── runtime.js
├── SKILL.md
├── package.json
├── build.mjs
├── tsconfig.json
└── src/
    ├── page.tsx
    ├── panel.tsx
    └── registry-bridge.ts
```

The `dist/` directory is gitignored and should never be committed. Only the ZIP artifact matters for distribution.

## CI/CD

For automated builds, add to your extension repo:

```yaml
# .github/workflows/build.yml
name: Build Extension
on:
  push:
    tags: ['v*']
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm install
      - run: npm run build
      - run: |
          zip -r my-extension-${{ github.ref_name }}.zip \
            manifest.json SKILL.md runtime.js package.json dist/ node_modules/ \
            -x "node_modules/.cache/*"
      - uses: softprops/action-gh-release@v2
        with:
          files: "*.zip"
```
