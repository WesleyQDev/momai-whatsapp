# Vite 8 + @vitejs/plugin-react 6 Upgrade

## Summary

Upgrade the MomAI desktop app build toolchain:
- Vite `7.3.5` → `8.1.4`
- `@vitejs/plugin-react` `5.2.0` → `6.0.3`
- `electron-vite` `5.0.0` → `6.0.0-beta.1`

Closes #199.

## Why

Dependabot PR #175 attempted this upgrade but was blocked because:
1. `electron-vite@5` peer-deps only allow Vite `^5 || ^6 || ^7`
2. `@vitejs/plugin-react@6` removes Babel and requires Vite 8's Oxc-based React Refresh

## Changes

### Dependencies (apps/momai/package.json)
| Package | Before | After |
|---------|--------|-------|
| vite | `^7.3.5` | `^8.1.4` |
| @vitejs/plugin-react | `^5.2.0` | `^6.0.3` |
| electron-vite | `^5.0.0` | `^6.0.0-beta.1` |

### Config changes
None required. The app's `electron.vite.config.ts` uses `react()` with default options — no Babel plugins or custom transforms affected by the v6 removal.

## Vite 8 Breaking Changes

Per upstream:
1. Removed `import.meta.hot.accept` resolution fallback — not used in this project
2. Updated default browser target — compatible
3. Rolldown merge (replaces Rollup/esbuild) — compatibility layer auto-converts existing config

## Validation

- `pnpm --filter momai typecheck:node` — pass
- `pnpm --filter momai typecheck:web` — pass
- `pnpm --filter momai lint` — 0 errors
- `pnpm --filter momai test:renderer` — 31 files, 346 tests pass
- `pnpm --filter momai test:main` — 27 files, 219 tests pass
