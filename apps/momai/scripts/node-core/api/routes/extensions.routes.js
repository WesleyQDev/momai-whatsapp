const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const os = require('node:os')
const http = require('node:http')
const https = require('node:https')
const dns = require('node:dns').promises
const { extractZip } = require('../../utils/zip-extract')
const { createZipFromDir } = require('../../utils/zip-writer')
const { createSkillLlmHelper } = require('../../services/skill-llm')
const { isPrivateIp } = require('../../utils/ip-check')
const { verifyChecksum } = require('../../utils/extension-checksum')
const { corsHeaders, sendJson, readJsonBody } = require('../../infrastructure/http-helpers')
const {
  loadInstallRegistry,
  usesLocalInstallRegistry,
  getEffectiveDevMode,
  _setInstallRegistryForTests
} = require('../../utils/install-registry')
const communityRegistry = require('../../services/community-registry')
const { satisfiesRange, findBestCompatibleRelease } = require('../../utils/semver-compat')
const shared = require('../../services/shared-state')

/*
 * Test seam: install handler reads `communityRegistry` through this
 * indirection so tests can swap it without going through the network.
 *
 * `_setCommunityRegistryForTests(null)` restores the real singleton.
 * Always resolve through `getCommunityRegistry()` so production code is
 * unaffected by the override.
 */
let _communityRegistryOverride = null
function getCommunityRegistry() {
  return _communityRegistryOverride || communityRegistry
}
function _setCommunityRegistryForTests(registry) {
  _communityRegistryOverride = registry
}

/* ── Community registry allowlist (SSRF defense) ── */

async function validateInstallUrl(id, downloadUrl) {
  const registry = await loadInstallRegistry()
  const ext = (registry.extensions || []).find((e) => e.id === id)
  if (!ext) {
    const err = new Error('extension not in registry')
    err.status = 403
    throw err
  }
  const isMatch =
    ext.download_url === downloadUrl ||
    (ext.repo &&
      (downloadUrl.startsWith(`https://github.com/${ext.repo}/releases/`) ||
        downloadUrl.startsWith(`https://api.github.com/repos/${ext.repo}/`)))
  if (!isMatch) {
    const err = new Error('download_url does not match registry or repository')
    err.status = 403
    throw err
  }
  let url
  try {
    url = new URL(downloadUrl)
  } catch {
    const err = new Error('invalid URL')
    err.status = 403
    throw err
  }
  if (url.protocol !== 'https:') {
    if (url.protocol === 'file:' && usesLocalInstallRegistry()) {
      // Allowed in dev mode for local zip testing
    } else {
      const err = new Error('only https URLs allowed')
      err.status = 403
      throw err
    }
  }
  const isTrustedHost =
    url.protocol === 'file:' ||
    url.hostname === 'github.com' ||
    url.hostname === 'raw.githubusercontent.com' ||
    url.hostname.endsWith('.github.com')

  if (!isTrustedHost && url.protocol !== 'file:') {
    const { address } = await dns.lookup(url.hostname)
    if (isPrivateIp(address)) {
      const err = new Error(`hostname resolves to private IP: ${address}`)
      err.status = 403
      throw err
    }
  }

  return ext
}

const MAX_DOWNLOAD_SIZE = 50 * 1024 * 1024 // 50 MB
const MAX_REDIRECTS = 5

async function validateRedirectUrl(redirectUrl) {
  let url
  try {
    url = new URL(redirectUrl)
  } catch {
    throw new Error('invalid redirect URL')
  }
  if (url.protocol !== 'https:') {
    throw new Error('redirect downgraded from HTTPS to ' + url.protocol.replace(':', ''))
  }
  // DNS-resolve and check for private IP unless it's a trusted host
  const isTrusted =
    url.hostname === 'github.com' ||
    url.hostname === 'raw.githubusercontent.com' ||
    url.hostname.endsWith('.github.com') ||
    url.hostname.endsWith('.githubassets.com')
  if (!isTrusted) {
    const { address } = await dns.lookup(url.hostname)
    if (isPrivateIp(address)) {
      throw new Error(`redirect hostname resolves to private IP: ${address}`)
    }
  }
}

/* ── resolveInstallVersion: pure helper for the install route ── */

/**
 * Select which release to download for an extension install request.
 *
 * Pure async: takes the `communityRegistry` instance (or mock) and `appVersion`
 * as parameters so it can be tested without touching the network, package.json,
 * or singleton state.
 *
 * Payload forms:
 *  - { id }                       -> pick the best compatible release
 *  - { id, version }              -> pick the release whose version matches
 *  - { id, download_url }         -> verify the legacy URL against fetched
 *                                    releases; fall back to a synthetic
 *                                    release if no match
 *
 * @param {object} opts
 * @param {string} opts.id
 * @param {object} opts.payload                 May contain `version` or `download_url`.
 * @param {object} opts.communityRegistry       Registry instance with fetchRegistry /
 *                                               fetchReleases / fetchManifest. Used as a
 *                                               fallback if `loadInstallRegistry` fails.
 * @param {string} opts.appVersion              App semver, used for compat checks.
 * @param {() => Promise<{extensions: any[]}>} opts.loadInstallRegistry
 *        Returns the merged catalog (community + any dev-only overrides). Required
 *        so resolving an install in dev picks up entries declared exclusively in
 *        `dev-extensions.json`. Falls back to `communityRegistry.fetchRegistry`
 *        on error.
 * @param {(url: string) => Promise<number>} [opts.fetchHeadStatus]
 *        Optional seam used only when payload.download_url is explicit. Defaults
 *        to a function returning 200 (assume valid). Returns HTTP status code.
 * @returns {Promise<{ok: true, release: object} | {ok: false, status: number, error: string, ...}>}
 */
async function resolveInstallVersion({
  id,
  payload,
  communityRegistry,
  appVersion,
  loadInstallRegistry: loadInstallRegistryFn,
  fetchHeadStatus
}) {
  const headCheck = typeof fetchHeadStatus === 'function' ? fetchHeadStatus : async () => 200

  // 1. Look up the extension in the merged install registry.
  // We MUST go through `loadInstallRegistry` (not `communityRegistry.fetchRegistry`
  // directly) so dev-only entries from `dev-extensions.json` resolve correctly.
  // `loadInstallRegistry` already caches the community registry and merges any
  // local override entries on top, returning the normalized
  // `{ extensions: [...] }` shape.
  let catalog
  try {
    const merged = await loadInstallRegistryFn()
    catalog = { extensions: (merged && merged.extensions) || [] }
  } catch {
    // Fall back to community registry only if the merged loader fails entirely.
    // In production `communityRegistry.fetchRegistry()` returns an array
    // (the raw community-extensions.json); the install-registry loader
    // normalizes the same array into the `{ extensions: [...] }` shape.
    try {
      const community = await communityRegistry.fetchRegistry()
      catalog = {
        extensions: Array.isArray(community)
          ? community
          : community && Array.isArray(community.extensions)
            ? community.extensions
            : []
      }
    } catch {
      catalog = { extensions: [] }
    }
  }
  const catalogEntry =
    catalog && Array.isArray(catalog.extensions)
      ? catalog.extensions.find((e) => e && e.id === id)
      : null

  if (!catalogEntry) {
    return { ok: false, status: 404, error: 'unknown_extension', id }
  }

  // 2. Determine the repo and try to fetch manifest compat fallback.
  const repo = catalogEntry.repo || null
  let manifestCompat = null
  if (repo) {
    try {
      const manifest = await communityRegistry.fetchManifest(repo)
      if (manifest && typeof manifest.momai_compat === 'string') {
        manifestCompat = manifest.momai_compat
      }
    } catch {
      manifestCompat = null
    }
  }

  // 3. Fetch releases (already enriched with momai_compat by Task 1).
  let releases = []
  if (repo) {
    try {
      releases = await communityRegistry.fetchReleases(repo)
      if (!Array.isArray(releases)) releases = []
    } catch {
      releases = []
    }
  }

  // 4. Select a release candidate based on the payload.
  const payloadVersion =
    payload && typeof payload.version === 'string' ? payload.version.trim() : ''
  const payloadUrl =
    payload && typeof payload.download_url === 'string' ? payload.download_url.trim() : ''

  let release = null
  let headCheckRequired = false

  if (payloadUrl) {
    // 5a. Explicit download_url (backward-compat path).
    release = releases.find((r) => r.download_url === payloadUrl) || null
    if (!release) {
      // No fetched release matches — treat the URL itself as source of truth.
      release = {
        version: null,
        tag: null,
        download_url: payloadUrl,
        changelog: '',
        date: null,
        prerelease: false,
        momai_compat: manifestCompat || null
      }
    }
    headCheckRequired = true
  } else if (payloadVersion) {
    // 5b. Explicit version. Compare case-insensitively after stripping 'v'.
    const wanted = payloadVersion.toLowerCase().replace(/^v/i, '')
    release = releases.find((r) => String(r.version || '').toLowerCase() === wanted) || null
    if (!release) {
      return {
        ok: false,
        status: 409,
        error: 'release_not_found_by_version',
        app_version: appVersion,
        requested_version: payloadVersion
      }
    }
  } else {
    // 5c. Default — best compatible release.
    release = findBestCompatibleRelease(releases, appVersion)

    // Fallback: if GitHub releases fetch failed (rate limit, network, DNS)
    // or no release passed the compat check, use the catalog entry's pin
    // (download_url + version) shipped in `community-extensions.json`. This
    // is the primary install path in packed builds where there is no
    // GITHUB_TOKEN and the GitHub API endpoint may be unavailable.
    if (!release && catalogEntry.download_url) {
      const catalogVersion =
        typeof catalogEntry.version === 'string' && catalogEntry.version.trim()
          ? catalogEntry.version.trim()
          : null
      release = {
        version: catalogVersion,
        tag: catalogVersion ? `v${catalogVersion}` : null,
        download_url: catalogEntry.download_url,
        changelog: '',
        date: null,
        prerelease: false,
        momai_compat: manifestCompat || null
      }
      headCheckRequired = true
      console.log(
        `[resolveInstallVersion] using catalog fallback for ${id}: ` +
          `url=${catalogEntry.download_url} version=${catalogVersion || 'unknown'}`
      )
    }
  }

  // 6. No installable release available.
  if (!release) {
    console.log(
      `[resolveInstallVersion] no_installable_release: id=${id} appVersion=${appVersion} releases=${releases.length} repo=${repo} releases_versions=${releases.map((r) => r.version + '(compat=' + r.momai_compat + ')').join(', ')}`
    )
    return {
      ok: false,
      status: 409,
      error: 'no_installable_release',
      app_version: appVersion
    }
  }

  // 7. Compat check — skip when release.version is null (legacy URL).
  if (
    release.version !== null &&
    typeof release.momai_compat === 'string' &&
    release.momai_compat.trim() &&
    !satisfiesRange(appVersion, release.momai_compat)
  ) {
    return {
      ok: false,
      status: 409,
      error: 'incompatible_version',
      app_version: appVersion,
      required_range: release.momai_compat,
      release_version: release.version
    }
  }

  // 8. HEAD check ONLY when payload.download_url is explicit.
  if (headCheckRequired) {
    let headStatus = 200
    try {
      headStatus = await headCheck(release.download_url)
    } catch {
      headStatus = 0
    }
    if (headStatus !== 200) {
      return {
        ok: false,
        status: 409,
        error: 'release_asset_missing',
        release_version: release.version,
        suggested_action: 'open_releases'
      }
    }
  }

  // 9. Success.
  return { ok: true, release }
}

/* ── Extension dependency installer ── */

function findAllNodeModules() {
  const found = []
  let dir = path.resolve(__dirname)
  for (let i = 0; i < 20; i++) {
    dir = path.dirname(dir)
    const nm = path.join(dir, 'node_modules')
    if (fs.existsSync(nm)) found.push(nm)
    if (path.dirname(dir) === dir) break
  }
  // In Electron ASAR-packaged builds, also check resourcesPath
  try {
    if (process.resourcesPath) {
      const asarNm = path.join(process.resourcesPath, 'app.asar', 'node_modules')
      if (fs.existsSync(asarNm)) found.push(asarNm)
      const unpackedNm = path.join(process.resourcesPath, 'app', 'node_modules')
      if (fs.existsSync(unpackedNm)) found.push(unpackedNm)
    }
  } catch {}
  // Deduplicate (Set preserves insertion order)
  return [...new Set(found.reverse())]
}

function resolveDepPath(name, nmPaths) {
  for (const nm of nmPaths) {
    const p = path.join(nm, name)
    if (fs.existsSync(p)) return p
  }
  // Fallback: try require.resolve (handles ASAR and pnpm resolution)
  try {
    const resolved = require.resolve(name + '/package.json', { paths: [__dirname] })
    return path.dirname(resolved)
  } catch {}
  return null
}

const DEV_SKIP_PREFIXES = [
  '@typescript-eslint',
  'eslint',
  '@eslint',
  'typescript',
  'jest',
  'ts-jest',
  'ts-node',
  'typedoc',
  'release-it',
  'conventional-changelog',
  '@types/'
]

function isDevPackage(name) {
  return DEV_SKIP_PREFIXES.some((p) => name.startsWith(p))
}

/* Recursive copy that works with ASAR paths (fs.cpSync fails inside ASAR) */
function copyDirRecursiveSync(src, dest) {
  const stack = [[src, dest]]
  while (stack.length > 0) {
    const [s, d] = stack.pop()
    fs.mkdirSync(d, { recursive: true })
    const entries = fs.readdirSync(s, { withFileTypes: true })
    for (const entry of entries) {
      const sPath = path.join(s, entry.name)
      const dPath = path.join(d, entry.name)
      if (entry.isDirectory()) {
        stack.push([sPath, dPath])
      } else {
        try {
          fs.writeFileSync(dPath, fs.readFileSync(sPath))
        } catch (e) {
          console.log(`[extensions]   file copy failed: ${entry.name}: ${e.message}`)
        }
      }
    }
  }
}

function copyDependency(name, nmPaths, targetNm, visited) {
  if (visited.has(name)) return
  visited.add(name)

  if (isDevPackage(name)) {
    console.log(`[extensions] Skipping dev-only dep: ${name}`)
    return
  }

  const src = resolveDepPath(name, nmPaths)
  if (!src) {
    console.log(`[extensions] Dep '${name}' not found in any node_modules, skipping`)
    return
  }

  const dest = path.join(targetNm, name)
  if (fs.existsSync(dest)) return

  fs.mkdirSync(path.dirname(dest), { recursive: true })
  console.log(`[extensions] Copying dep: ${name}`)
  try {
    copyDirRecursiveSync(src, dest)
  } catch (cpErr) {
    console.log(`[extensions] Failed to copy ${name}: ${cpErr.message}`)
    return
  }

  const pkgJsonPath = path.join(src, 'package.json')
  if (!fs.existsSync(pkgJsonPath)) return
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'))
    const subDeps = { ...pkg.dependencies, ...pkg.peerDependencies }
    for (const subDep of Object.keys(subDeps || {})) {
      copyDependency(subDep, nmPaths, targetNm, visited)
    }
  } catch {}
}

async function installExtensionDependencies(extDir) {
  const pkgPath = path.join(extDir, 'package.json')
  if (!fs.existsSync(pkgPath)) return

  let pkg
  try {
    pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
  } catch {
    return
  }

  const deps = Object.keys(pkg.dependencies || {})
  if (deps.length === 0) return

  // Strategy 1: Run npm install --production (handles transitive deps correctly)
  const { execFile, execSync } = require('node:child_process')
  const { promisify } = require('node:util')
  const execFileAsync = promisify(execFile)

  // Resolve npm — Electron's PATH may not include system npm
  function findNpm() {
    const nodeDir = path.dirname(process.execPath)
    const candidates =
      process.platform === 'win32'
        ? [path.join(nodeDir, 'npm.cmd'), path.join(nodeDir, 'npm'), 'npm.cmd', 'npm']
        : [path.join(nodeDir, 'npm'), 'npm']
    for (const c of candidates) {
      try {
        if (c !== 'npm' && c !== 'npm.cmd') {
          if (fs.existsSync(c)) return c
        } else {
          const testCmd = process.platform === 'win32' ? `${c} --version` : `which ${c}`
          execSync(testCmd, { stdio: 'ignore' })
          return c
        }
      } catch {}
    }
    return null
  }

  const npmCmd = findNpm()
  if (!npmCmd) {
    console.warn('[extensions] npm not found, skipping install')
  } else {
    try {
      console.log(`[extensions] Running npm install --production in ${extDir}`)
      await execFileAsync(npmCmd, ['install', '--production', '--no-audit', '--no-fund'], {
        cwd: extDir,
        timeout: 120000,
        stdio: 'pipe',
        shell: true
      })
      console.log(`[extensions] npm install completed for ${path.basename(extDir)}`)
      return
    } catch (npmErr) {
      console.warn(`[extensions] npm install failed (falling back to copy): ${npmErr.message}`)
    }
  }

  // Strategy 2: Copy from monorepo node_modules (fallback for dev / no npm)
  const nmPaths = findAllNodeModules()
  console.log(`[extensions] Found ${nmPaths.length} node_modules paths for dep copy fallback`)
  if (nmPaths.length === 0) {
    console.log('[extensions] Could not locate any node_modules for dep install')
    return
  }

  const extNodeModules = path.join(extDir, 'node_modules')
  fs.mkdirSync(extNodeModules, { recursive: true })

  const visited = new Set()
  for (const dep of deps) {
    copyDependency(dep, nmPaths, extNodeModules, visited)
  }
}
const { createPermissionSchema } = require('../../permissions/schema')
const extensionEvents = require('../../services/extension-events')
const { sanitizeError } = require('../../utils/error-sanitizer.js')
const { mountSkillRoutes } = require('../../services/manifest-routes')

let _cachedExtensionsPayload = null
let _lastExtensionsRefresh = 0
let _lastDevMode = null

/**
 * Invalidate the cached `/extensions` payload. MUST be called by any code
 * path that mutates which extensions are visible in the current dev mode
 * WITHOUT going through install/toggle/uninstall (e.g. dev_mode switch,
 * which changes which filesystem root the registry scans).
 */
function invalidateExtensionsPayloadCache() {
  _cachedExtensionsPayload = null
  _lastExtensionsRefresh = 0
  _lastDevMode = null
}

/* ── Helpers for downloading & extracting community extensions ── */

function downloadFile(url, destPath, onProgress, redirectDepth = 0) {
  return new Promise(async (resolve, reject) => {
    const client = url.startsWith('https') ? https : http
    const file = fs.createWriteStream(destPath)
    const request = client.get(url, { headers: { 'User-Agent': 'MomAI-App' } }, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        file.close()
        try {
          fs.unlinkSync(destPath)
        } catch {}
        if (redirectDepth >= MAX_REDIRECTS) {
          return reject(new Error('too many redirects'))
        }
        const nextUrl = new URL(response.headers.location, url).toString()
        validateRedirectUrl(nextUrl)
          .then(() =>
            downloadFile(nextUrl, destPath, onProgress, redirectDepth + 1)
              .then(resolve)
              .catch(reject)
          )
          .catch(reject)
        return
      }
      if (response.statusCode < 200 || response.statusCode >= 300) {
        file.close()
        try {
          fs.unlinkSync(destPath)
        } catch {}
        return reject(new Error(`HTTP ${response.statusCode}`))
      }

      const totalBytes = parseInt(response.headers['content-length'] || '0', 10)
      if (totalBytes > MAX_DOWNLOAD_SIZE) {
        file.close()
        try {
          fs.unlinkSync(destPath)
        } catch {}
        return reject(new Error(`download size ${totalBytes} exceeds max ${MAX_DOWNLOAD_SIZE}`))
      }
      let receivedBytes = 0
      let lastTime = Date.now()
      let lastBytes = 0

      response.on('data', (chunk) => {
        receivedBytes += chunk.length
        if (receivedBytes > MAX_DOWNLOAD_SIZE) {
          request.destroy()
          file.close()
          try {
            fs.unlinkSync(destPath)
          } catch {}
          reject(new Error(`download exceeded max size ${MAX_DOWNLOAD_SIZE}`))
          return
        }
        const now = Date.now()
        if (now - lastTime >= 500) {
          const speedBps = ((receivedBytes - lastBytes) / (now - lastTime)) * 1000
          const percent = totalBytes ? Math.round((receivedBytes / totalBytes) * 100) : 0
          if (onProgress) onProgress(percent, speedBps, receivedBytes, totalBytes)
          lastTime = now
          lastBytes = receivedBytes
        }
      })

      response.pipe(file)
      file.on('finish', () => {
        file.close()
        // Emit final progress so the UI always gets speed/size data,
        // even for fast downloads where the 500ms throttle never fires.
        const startTime = lastTime === 0 ? Date.now() : lastTime  // approximate
        if (onProgress && receivedBytes > 0) {
          const elapsed = Math.max(Date.now() - startTime, 1)
          const avgSpeed = Math.round((receivedBytes / elapsed) * 1000)
          onProgress(totalBytes ? 100 : 0, avgSpeed, receivedBytes, totalBytes || receivedBytes)
        }
        resolve()
      })
    })
    request.on('error', (err) => {
      file.close()
      try {
        fs.unlinkSync(destPath)
      } catch {}
      reject(err)
    })
    request.setTimeout(120000, () => {
      request.destroy()
      file.close()
      try {
        fs.unlinkSync(destPath)
      } catch {}
      reject(new Error('Download timeout'))
    })
  })
}

function flattenExtractedDir(extractDir) {
  const items = fs.readdirSync(extractDir)
  if (items.length === 1) {
    const subDir = path.join(extractDir, items[0])
    try {
      if (fs.statSync(subDir).isDirectory()) {
        const files = fs.readdirSync(subDir)
        for (const file of files) {
          const src = path.join(subDir, file)
          const dst = path.join(extractDir, file)
          fs.renameSync(src, dst)
        }
        fs.rmdirSync(subDir)
      }
    } catch {}
  }
}

function isValidExtensionId(id) {
  return typeof id === 'string' && /^[a-z0-9-]+$/.test(id)
}

function resolveStoragePath(dataDir, extId, filePath) {
  // Block Windows drive letter paths (e.g. C:\Windows) on any platform
  if (/^[a-zA-Z]:[\\/]/.test(filePath)) {
    return null
  }

  const base = path.resolve(dataDir, 'extensions', extId)
  const resolved = path.resolve(base, filePath)

  // Canonical containment — resolved path must start with base
  if (!resolved.startsWith(base + path.sep) && resolved !== base) {
    return null
  }

  // Double-encoded traversal guard — recursively decode and re-check
  let decoded = filePath
  let prev = ''
  let depth = 0
  while (decoded !== prev && depth < 4) {
    prev = decoded
    try {
      decoded = decodeURIComponent(decoded)
    } catch {
      break
    }
    const reResolved = path.resolve(base, decoded)
    if (!reResolved.startsWith(base + path.sep) && reResolved !== base) {
      return null
    }
    depth++
  }

  return resolved
}

function resolveExtensionDir(extensionsDir, extId) {
  const root = path.resolve(extensionsDir)
  const target = path.resolve(root, extId)
  if (target === root || !target.startsWith(root + path.sep)) return null
  return target
}

/**
 * Remove the artifact of the OPPOSITE install mode for this extension.
 *
 * The modes are mutually exclusive on disk:
 *  - store:      real directory at `<extensionsDir>/<extId>` (production
 *                installs from the remote community store)
 *  - store_test: real directory at `<extensionsDir>/<extId>` (dev-only test
 *                installs from a local `dev-extensions.json`)
 *  - symlink:    symlink at `<extensionsDevDir>/<extId>` pointing at the
 *                real directory in `<extensionsDir>/<extId>` (dev local
 *                checkouts)
 *
 * Before installing in one mode, we wipe the other mode's artifact so we
 * never end up with two parallel copies of the same extension fighting for
 * the registry slot.
 *
 * Important: in symlink mode the real files live at `<extensionsDir>/<extId>`;
 * we must NOT delete that directory here because the install flow just
 * extracted the extension into it. We only remove a stale `.dev/<extId>` if
 * it is a real directory (not a symlink) left over from store/store_test mode.
 */
function isLink(lstat, fullPath) {
  if (lstat.isSymbolicLink()) return true
  // Windows: junctions (mklink /J) are NOT symlinks but should be
  // preserved. Check by trying to read the reparse point target.
  if (process.platform === 'win32') {
    try {
      const { execSync } = require('child_process')
      execSync(`fsutil reparsepoint query "${fullPath}"`, { stdio: 'ignore', timeout: 2000 })
      return true  // fsutil succeeded, this is a reparse point (symlink or junction)
    } catch {
      return false  // not a reparse point
    }
  }
  return false
}

function cleanupOppositeModeArtifact(extensionsDir, extensionsDevDir, extId, devMode) {
  const devLink = path.join(extensionsDevDir, extId)
  try {
    const lstat = fs.lstatSync(devLink)
    // NEVER delete symlinks or Windows junctions — they represent
    // intentional local checkouts, not artifacts from the opposite mode.
    if (isLink(lstat, devLink)) return
    // Real directory from the opposite mode — clean up.
    fs.rmSync(devLink, { recursive: true, force: true })
  } catch {
  }
}

/**
 * Ensure `<extensionsDevDir>/<extId>` is a symlink pointing at
 * `<extensionsDir>/<extId>`. Used when installing in symlink mode so the
 * extension is reachable through the dev scan root without any extra glue
 * from the user. A relative symlink is used to stay portable across
 * machines / data-dir layouts.
 */
function ensureDevSymlink(extensionsDir, extensionsDevDir, extId) {
  const realDir = path.join(extensionsDir, extId)
  const devLink = path.join(extensionsDevDir, extId)

  try {
    const lstat = fs.lstatSync(devLink)
    if (lstat.isSymbolicLink()) {
      const target = fs.readlinkSync(devLink)
      if (path.resolve(extensionsDevDir, target) === realDir) {
        return
      }
    }
  } catch {
  }

  if (!fs.existsSync(extensionsDevDir)) {
    fs.mkdirSync(extensionsDevDir, { recursive: true })
  }

  try {
    const lstat = fs.lstatSync(devLink)
    if (lstat.isSymbolicLink()) {
      try { fs.unlinkSync(devLink) } catch { try { fs.rmdirSync(devLink) } catch {} }
    } else {
      fs.rmSync(devLink, { recursive: true, force: true })
    }
  } catch {}

  const relative = path.relative(extensionsDevDir, realDir)

  if (process.platform === 'win32') {
    try {
      const { execSync } = require('child_process')
      execSync(`mklink /J "${devLink}" "${realDir}"`, { stdio: 'ignore' })
      return
    } catch {
    }
  }

  try {
    fs.symlinkSync(relative, devLink, 'dir')
  } catch (err) {
    console.log(`[extensions] Failed to create symlink for ${extId}:`, err.message)
    console.log(`[extensions] On Windows, enable Developer Mode or run as Administrator.`)
  }
}

/**
 * Remove both the real install directory AND any dev symlink for an
 * extension. Idempotent — safe to call when neither path exists.
 */
function removeExtensionArtifacts(extensionsDir, extensionsDevDir, extId, devMode) {
  const dir = devMode === 'symlink' ? extensionsDevDir : extensionsDir
  const target = path.join(dir, extId)
  try {
    const lstat = fs.lstatSync(target)
    if (lstat.isSymbolicLink()) {
      try { fs.unlinkSync(target) } catch { try { fs.rmdirSync(target) } catch {} }
    } else {
      fs.rmSync(target, { recursive: true, force: true })
    }
  } catch {
  }
}

function createExtensionsRoutes(context) {
  const {
    skillRegistry,
    buildExtensionsPayload,
    sendJson,
    readJsonBody,
    store,
    saveStore,
    ensureDir,
    llamaState,
    semanticState,
    extensionHostManager = { sendToPersistent: async () => ({ ok: false, error: 'not_available' }) }
  } = context

  async function readSafe(req, res) {
    try {
      return await readJsonBody(req)
    } catch (err) {
      if (err.code === 'INVALID_JSON') {
        sendJson(res, 400, { ok: false, error: 'invalid_json' })
        return null
      }
      throw err
    }
  }

  async function getExtensionsPayload(lang) {
    const now = Date.now()
    const currentDevMode = getEffectiveDevMode(store?.settings?.dev_mode)
    if (now - _lastExtensionsRefresh < 10000 && currentDevMode === _lastDevMode) {
      const cached = _cachedExtensionsPayload
      if (cached) return cached
    }
    _lastDevMode = currentDevMode
    await skillRegistry.refresh()
    const payload = await buildExtensionsPayload(lang)
    _cachedExtensionsPayload = payload
    _lastExtensionsRefresh = now
    return payload
  }

  const mountedSkillRoutes = []
  const skillRouteApp = {
    get: (path, handler) => mountedSkillRoutes.push({ method: 'GET', path, handler }),
    post: (path, handler) => mountedSkillRoutes.push({ method: 'POST', path, handler })
  }
  const allSkills = typeof skillRegistry.getAll === 'function' ? skillRegistry.getAll() : []
  mountSkillRoutes(skillRouteApp, allSkills, extensionHostManager)

  return async function handleExtensionsRoutes(req, res, pathname, parsedUrl) {
    const lang = parsedUrl.searchParams?.get('lang') || 'pt-BR'

    const distMatch = pathname.match(/^\/extensions\/([^/]+)\/dist\/(.+)$/)
    if (distMatch && req.method === 'GET') {
      const extId = distMatch[1]
      const filePath = distMatch[2]
      if (filePath.includes('..')) {
        sendJson(res, 400, { ok: false, error: 'invalid_path' })
        return true
      }
      const skill =
        typeof skillRegistry.getById === 'function' ? skillRegistry.getById(extId) : null
      if (!skill || !skill.dir) {
        sendJson(res, 404, { ok: false, error: 'skill_not_found' })
        return true
      }
      const fullPath = path.join(skill.dir, 'dist', filePath)
      if (!fs.existsSync(fullPath)) {
        sendJson(res, 404, { ok: false, error: 'file_not_found' })
        return true
      }
      const ext = path.extname(fullPath).toLowerCase()
      const mime =
        ext === '.js'
          ? 'application/javascript'
          : ext === '.map'
            ? 'application/json'
            : ext === '.css'
              ? 'text/css'
              : 'application/octet-stream'
      res.writeHead(200, {
        'Content-Type': mime,
        'Cache-Control': 'no-cache',
        ...corsHeaders(req)
      })
      fs.createReadStream(fullPath).pipe(res)
      return true
    }

    const storageMatch = pathname.match(/^\/extensions\/([^/]+)\/storage\/(.+)$/)
    if (storageMatch && req.method === 'GET') {
      const extId = storageMatch[1]
      const filePath = storageMatch[2]
      if (!isValidExtensionId(extId)) {
        sendJson(res, 400, { ok: false, error: 'invalid_extension_id' })
        return true
      }
      const dataDir =
        process.env.MOMAI_NODE_CORE_DATA_DIR ||
        process.env.MOMAI_DATA_DIR ||
        path.resolve(__dirname, '..', '..', 'data')
      const fullPath = resolveStoragePath(dataDir, extId, filePath)
      if (!fullPath) {
        sendJson(res, 400, { ok: false, error: 'invalid_path' })
        return true
      }
      if (!fs.existsSync(fullPath)) {
        sendJson(res, 404, { ok: false, error: 'file_not_found' })
        return true
      }
      const ext = path.extname(fullPath).toLowerCase()
      let mime = 'application/octet-stream'
      if (ext === '.ogg') mime = 'audio/ogg'
      else if (ext === '.mp3') mime = 'audio/mpeg'
      else if (ext === '.wav') mime = 'audio/wav'
      else if (ext === '.m4a') mime = 'audio/x-m4a'

      res.writeHead(200, {
        'Content-Type': mime,
        'Cache-Control': 'no-cache',
        ...corsHeaders(req)
      })
      fs.createReadStream(fullPath).pipe(res)
      return true
    }

    for (const mounted of mountedSkillRoutes) {
      if (mounted.path === pathname && mounted.method === req.method) {
        const body = await readSafe(req, res)
        if (body === null) return true
        await mounted.handler({ ...req, body }, res)
        return true
      }
    }

    if (pathname === '/extensions' && req.method === 'GET') {
      console.log(`[ExtensionsAPI] GET /extensions (lang: ${lang})`)
      const payload = await getExtensionsPayload(lang)
      sendJson(res, 200, payload)
      return true
    }

    if (pathname === '/extensions/registry' && req.method === 'GET') {
      const payload = await getExtensionsPayload(lang)
      sendJson(res, 200, payload)
      return true
    }

    // Fetch manifest.json from GitHub repo for pre-install detail view
    if (pathname.match(/^\/extensions\/[^/]+\/manifest$/) && req.method === 'GET') {
      const id = pathname.split('/')[2]
      try {
        const community = await communityRegistry.fetchRegistry()
        let item = community.find((e) => e.id === id)

        // If not found in remote community, and we are in dev, check local dev-extensions
        if (!item && usesLocalInstallRegistry()) {
          const localRegistry = await loadInstallRegistry()
          item = (localRegistry.extensions || []).find((e) => e.id === id)
        }

        if (!item) {
          sendJson(res, 404, { error: 'extension not found in community registry' })
          return true
        }

        if (!item.repo) {
          // Construct fallback manifest from registry metadata for local dev testing
          sendJson(res, 200, {
            id: item.id,
            name: item.name,
            description: item.description,
            author: item.author,
            version: item.version,
            permissions: item.permissions || [],
            tags: item.tags || []
          })
          return true
        }

        const manifest = await communityRegistry.fetchManifest(item.repo)
        if (!manifest) {
          sendJson(res, 404, { error: 'manifest not found in repo' })
          return true
        }
        sendJson(res, 200, manifest)
      } catch (err) {
        console.error(`[ExtensionsAPI] Error fetching manifest for ${id}:`, err)
        sendJson(res, 500, { error: 'failed to fetch manifest' })
      }
      return true
    }

    /* ── Releases (version history from GitHub) ── */
    if (pathname.match(/^\/extensions\/[^/]+\/releases$/) && req.method === 'GET') {
      const id = pathname.split('/')[2]
      try {
        const {
          categorizeReleases,
          findBestCompatibleRelease
        } = require('../../utils/semver-compat')

        // Use merged registry for accurate extension metadata (includes dev-extensions.json overrides)
        const mergedRegistry = await loadInstallRegistry()
        const item = (mergedRegistry.extensions || []).find((e) => e.id === id)

        // Also check installed extensions for repo info
        const skillRegistry = shared.skillRegistry
        const installed = skillRegistry
          ? skillRegistry.getAll().find((s) => (s.manifest?.id || s.id) === id)
          : null
        const repo = item?.repo || installed?.manifest?.repo || null

        if (!repo) {
          sendJson(res, 200, {
            releases: [],
            installed_version: installed?.manifest?.version || null,
            recommended_version: null
          })
          return true
        }

        const rawReleases = await communityRegistry.fetchReleases(repo)

        // Use per-release momai_compat (from release body frontmatter) only.
        // Extension-wide momai_compat is NOT applied to releases because older
        // releases predate the SDK compat requirement and should remain installable
        // on older MomAI versions. If a release has no frontmatter, it's compatible
        // with all current MomAI versions.
        const releasesWithCompat = rawReleases

        const pkg = require(path.resolve(__dirname, '..', '..', '..', '..', 'package.json'))
        const appVersion = pkg.version || '0.0.0'
        const { compatible, incompatible } = categorizeReleases(releasesWithCompat, appVersion)
        const best = findBestCompatibleRelease(releasesWithCompat, appVersion)

        sendJson(res, 200, {
          releases: [...compatible, ...incompatible],
          installed_version: installed?.manifest?.version || null,
          recommended_version: best ? best.version : null,
          app_version: appVersion
        })
      } catch (err) {
        console.error(`[ExtensionsAPI] Error fetching releases for ${id}:`, err)
        sendJson(res, 500, { error: 'failed to fetch releases' })
      }
      return true
    }

    if (pathname === '/extensions/install' && req.method === 'POST') {
      const payload = await readSafe(req, res)
      if (payload === null) return true
      const requested = String(payload.id || crypto.randomUUID()).toLowerCase()
      const id =
        requested.replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '') || crypto.randomUUID()
      const extDir = path.join(skillRegistry.extensionsDir, id)

      console.log(`[ExtensionsAPI] POST /extensions/install id=${id}`)

      res.writeHead(200, {
        'Content-Type': 'application/x-ndjson',
        'Transfer-Encoding': 'chunked',
        ...corsHeaders(req)
      })

      // Multi-stage NDJSON progress helper. Emits a richer shape than the
      // legacy `{status, percent, speed}` line: clients can render a
      // segmented progress bar keyed on `stage` and read raw bytes/speed.
      const sendInstallStage = (stage, opts = {}) => {
        res.write(
          JSON.stringify({
            stage,
            status: opts.status || stage,
            percent: opts.percent ?? 0,
            global_percent: opts.globalPercent ?? 0,
            bytes_total: opts.bytesTotal ?? null,
            bytes_done: opts.bytesDone ?? null,
            speed_bps: opts.speedBps ?? null,
            eta_seconds: opts.etaSeconds ?? null
          }) + '\n'
        )
      }

      // Resolve which release to download. Accepts three payload shapes:
      //   {id}                      — picks best compatible release
      //   {id, version}             — picks a specific release tag
      //   {id, download_url}        — legacy explicit URL (backward-compat)
      let appVersion = '0.0.0'
      try {
        const pkg = require(path.resolve(__dirname, '..', '..', '..', '..', 'package.json'))
        appVersion = pkg.version || '0.0.0'
      } catch {
        // ASAR-packed builds may not resolve the `../../../../package.json`
        // path above. Fall back to the sibling production package.json, then
        // to the MOMAI_APP_VERSION env var injected at build time.
        try {
          appVersion = require(path.resolve(__dirname, '..', 'package.json')).version || '0.0.0'
        } catch {
          appVersion = process.env.MOMAI_APP_VERSION || '0.0.0'
        }
      }

      const result = await resolveInstallVersion({
        id,
        payload,
        communityRegistry: getCommunityRegistry(),
        appVersion,
        loadInstallRegistry,
        fetchHeadStatus: async () => 200
      })

      if (!result.ok) {
        res.write(JSON.stringify({ ok: false, ...result }) + '\n')
        res.end()
        return true
      }

      // 50MB size limit check — stop before download if metadata says it's too big
      if (result.release.download_size && result.release.download_size > MAX_DOWNLOAD_SIZE) {
        res.write(JSON.stringify({
          ok: false,
          error: 'extension_too_large',
          message: `Extensão muito grande (${(result.release.download_size / 1024 / 1024).toFixed(0)}MB). Limite: 50MB.`
        }) + '\n')
        res.end()
        return true
      }

      const downloadUrl = String(result.release.download_url || '').trim()

      // SSRF defense in depth — even though resolveInstallVersion picked
      // this URL from the catalog/releases, still validate it against the
      // install registry and private-IP checks.
      try {
        await validateInstallUrl(id, downloadUrl)
      } catch (err) {
        res.write(JSON.stringify({ ok: false, error: err.message }) + '\n')
        res.end()
        return true
      }

      // Stop old worker BEFORE modifying files — prevents worker crash
      // from in-place file replacement during update.
      await extensionHostManager.stopPersistent(id).catch(() => {})

      try {
        const stat = fs.lstatSync(extDir)
        if (stat.isSymbolicLink()) {
          console.log(`[extensions] Removing symlink before clean install: ${extDir}`)
          fs.unlinkSync(extDir)
        }
      } catch (e) {
        // ignore
      }

      ensureDir(extDir)
      console.log(`[ExtensionsAPI] Downloading extension ${id} from ${downloadUrl}...`)
      console.log(`[ExtensionsAPI] download type: ${downloadUrl?.startsWith('file://') ? 'file:// local copy' : 'HTTP download'}`)
      const zipPath = path.join(extDir, 'archive.zip')
      try {
        if (downloadUrl.startsWith('file://')) {
          try {
            const srcPath = require('node:url').fileURLToPath(downloadUrl)
            sendInstallStage('downloading', { percent: 50, globalPercent: 30 })
            fs.copyFileSync(srcPath, zipPath)
            sendInstallStage('downloading', { percent: 100, globalPercent: 55 })
          } catch (copyErr) {
            throw new Error(`Failed to copy local zip: ${copyErr.message}`)
          }
        } else {
          sendInstallStage('downloading', {
            percent: 0,
            globalPercent: 5,
            speedBps: 0,
            bytesDone: 0,
            bytesTotal: 0
          })
          await downloadFile(downloadUrl, zipPath, (percent, speedBps, bytesDone, bytesTotal) => {
            const globalPercent = 5 + Math.round((percent / 100) * 50)
            sendInstallStage('downloading', {
              percent,
              globalPercent,
              speedBps: speedBps || 0,
              bytesDone: bytesDone || null,
              bytesTotal: bytesTotal || null
            })
          })
        }
        let zipBuffer
        try {
          zipBuffer = fs.readFileSync(zipPath)
        } catch (readErr) {
          throw new Error(`Failed to read downloaded zip: ${readErr.message}`)
        }
        sendInstallStage('verifying', { percent: 0, globalPercent: 60 })
        const checksumResult = verifyChecksum(zipBuffer, payload.expected_sha256)
        if (!checksumResult.ok) {
          if (checksumResult.reason === 'mismatch') {
            console.log(`[ExtensionsAPI] Checksum mismatch for ${id} — aborting install`)
            throw new Error('extension checksum mismatch')
          }
          if (checksumResult.reason === 'invalid_format') {
            console.log(
              `[ExtensionsAPI] Invalid expected_sha256 format for ${id} — aborting install`
            )
            throw new Error('invalid expected_sha256 format')
          }
          if (checksumResult.reason === 'missing') {
            console.warn(`[extensions] install without expected_sha256 — backward compat path`)
          }
        }
        sendInstallStage('verifying', { percent: 100, globalPercent: 70 })

        // Stop existing persistent worker before modifying files —
        // the extraction below removes all files, which would crash a
        // running worker that still has them open.
        await extensionHostManager.stopPersistent(id).catch(() => {})

        // Save previous version for rollback
        const previousDir = path.join(skillRegistry.extensionsDir, id, '.previous')
        if (fs.existsSync(extDir)) {
          try {
            const items = fs.readdirSync(extDir)
            const hasFiles = items.some((f) => f !== '.previous' && f !== 'archive.zip')
            if (hasFiles) {
              if (!fs.existsSync(previousDir)) fs.mkdirSync(previousDir, { recursive: true })
              const backupZip = path.join(previousDir, 'extension.zip')
              await createZipFromDir(extDir, backupZip)
              console.log(`[extensions] Backup saved for ${id} at ${backupZip}`)
            }
          } catch (err) {
            console.log(`[extensions] Failed to backup previous version for rollback: ${err.message}`)
          }
        }

        console.log(`[ExtensionsAPI] Extracting ${id}...`)
        sendInstallStage('extracting', { percent: 0, globalPercent: 75 })

        // Preserve declared storage locations before wiping the directory —
        // extensions like WhatsApp store Baileys auth sessions, contact data,
        // and message history inside the extension directory. Wiping them
        // would force the user to re-authenticate after every update.
        const preservedPaths = []
        const manifestPath = path.join(extDir, 'manifest.json')
        if (fs.existsSync(manifestPath)) {
          try {
            const oldManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
            const storageLocations = oldManifest.storage?.locations || []
            for (const loc of storageLocations) {
              const cleanLoc = String(loc).replace(/\s*\(.*?\)\s*$/, '').trim().replace(/\/+$/, '')
              if (!cleanLoc) continue
              if (cleanLoc.startsWith('*.')) {
                const extGlob = cleanLoc.slice(1)
                const items = fs.readdirSync(extDir).filter((f) =>
                  f.endsWith(extGlob) &&
                  f !== 'package.json' &&
                  f !== 'package-lock.json' &&
                  f !== 'manifest.json'
                )
                for (const item of items) {
                  const src = path.join(extDir, item)
                  const dst = path.join(extDir, `.preserve-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`)
                  fs.renameSync(src, dst)
                  preservedPaths.push({ src: dst, dst: path.join(extDir, item) })
                }
              } else {
                const src = path.join(extDir, cleanLoc)
                if (fs.existsSync(src)) {
                  const dst = path.join(extDir, `.preserve-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`)
                  fs.renameSync(src, dst)
                  preservedPaths.push({ src: dst, dst: src })
                }
              }
            }
          } catch (preserveErr) {
            console.warn(`[extensions] Failed to preserve storage for ${id}: ${preserveErr.message}`)
          }
        }

        try {
          const files = fs.readdirSync(extDir)
          for (const file of files) {
            if (file !== 'archive.zip' && !file.startsWith('.preserve-')) {
              fs.rmSync(path.join(extDir, file), { recursive: true, force: true })
            }
          }
        } catch (cleanErr) {
          console.warn(`[extensions] Failed to clean directory before update: ${cleanErr.message}`)
        }
        await extractZip(zipPath, extDir)
        try {
          fs.unlinkSync(zipPath)
        } catch {}
        flattenExtractedDir(extDir)

        // Restore preserved storage locations after extraction
        for (const { src, dst: restoreDst } of preservedPaths) {
          try {
            if (fs.existsSync(restoreDst)) {
              fs.rmSync(restoreDst, { recursive: true, force: true })
            }
            fs.renameSync(src, restoreDst)
          } catch (restoreErr) {
            console.warn(`[extensions] Failed to restore ${path.basename(restoreDst)} for ${id}: ${restoreErr.message}`)
          }
        }
        console.log(`[extensions] Storage preservation for ${id}: preserved ${preservedPaths.length} item(s) from ${fs.existsSync(manifestPath) ? 'manifest' : 'no-manifest'}`)
        sendInstallStage('extracting', { percent: 100, globalPercent: 85 })
        sendInstallStage('linking_deps', { percent: 0, globalPercent: 85 })
        await installExtensionDependencies(extDir).catch((e) =>
          console.warn(`[extensions] Dependency install failed for ${id}:`, e.message)
        )
        sendInstallStage('linking_deps', { percent: 100, globalPercent: 90 })
      } catch (err) {
        try {
          fs.rmSync(extDir, { recursive: true, force: true })
        } catch {}
        res.write(
          JSON.stringify({ ok: false, error: `Extension install failed: ${err.message}` }) + '\n'
        )
        res.end()
        return true
      }

      const devMode = getEffectiveDevMode(store?.settings?.dev_mode)
      const extensionsDevDir =
        (skillRegistry && skillRegistry.extensionsDevDir) ||
        path.join(skillRegistry.extensionsDir, '.dev')

      // Wipe the artifact from the OPPOSITE mode before we install — keeps
      // the two modes from accumulating parallel copies of the same id.
      cleanupOppositeModeArtifact(skillRegistry.extensionsDir, extensionsDevDir, id, devMode)

      // In dev symlink mode the scan only sees .dev/<id>, so we materialise a
      // symlink pointing at the freshly extracted directory. The user can
      // replace this symlink with a local checkout at any time.
      // In production (store mode) and in dev store_test mode the extension
      // is read directly from extensionsDir/<id>, so no symlink is created.
      if (devMode === 'symlink') {
        try {
          ensureDevSymlink(skillRegistry.extensionsDir, extensionsDevDir, id)
        } catch (err) {
          console.log(`[extensions] Failed to create dev symlink for ${id}:`, err.message)
        }
      }

      // Single, mode-stable key. `source` records which mode produced the
      // install so the UI can show a Loja / Dev badge without scanning the
      // filesystem again.
      let found = store.extensions.find((ext) => ext.id === id)
      if (!found) {
        found = {
          id,
          name: id,
          description: 'Extension installed by Node core',
          category: 'extension',
          enabled: true,
          source: devMode
        }
        store.extensions.push(found)
      } else {
        found.enabled = true
        found.source = devMode
      }
      saveStore()

      sendInstallStage('indexing', { percent: 0, globalPercent: 90 })
      await skillRegistry.loadExtensions()

      // Start the persistent worker immediately if the extension runs in the background
      const skill = skillRegistry.getById(id)
      if (skill && skill.manifest?.background) {
        sendInstallStage('starting_worker', { percent: 0, globalPercent: 95 })
        console.log(
          `[extensions] Starting persistent worker for newly installed extension: ${skill.id}`
        )
        extensionHostManager
          .startPersistent(skill.id, skill.dir, skill.manifest)
          .then(() => console.log(`[ext] Started persistent worker after install: ${skill.id}`))
          .catch((err) =>
            console.log(
              `[extensions] Failed to start persistent worker for ${skill.id} after install:`,
              err.message
            )
          )
      }

      // Auto-activation keywords are user-controlled. The router only fires
      // on store.skillKeywords entries that the user has explicitly set via
      // PUT /skills/keywords/:id. We do NOT seed from any manifest field
      // (intents, voice_triggers, etc.) — those are LLM-facing metadata
      // and must not auto-activate skills (false positives in normal
      // conversation).

      await skillRegistry.executeHook(id, 'onInstall', { extId: id, extDir }).catch((err) => {
        console.log(`[extensions] onInstall hook failed for ${id}: ${err.message}`)
      })

      _cachedExtensionsPayload = null
      _lastExtensionsRefresh = 0
      if (context.syncSkillAndToolIndexes) {
        context.syncSkillAndToolIndexes(true).catch(() => {})
      }

      sendInstallStage('done', { percent: 100, globalPercent: 100 })
      res.write(JSON.stringify({ ok: true }) + '\n')
      res.end()
      return true
    }

    /* ── Rollback an extension to its previous version ── */
    const matchRollback = pathname.match(/^\/extensions\/([^/]+)\/rollback$/)
    if (matchRollback && req.method === 'POST') {
      const extId = matchRollback[1]
      const previousDir = path.join(skillRegistry.extensionsDir, extId, '.previous')
      const backupZip = path.join(previousDir, 'extension.zip')

      if (!fs.existsSync(backupZip)) {
        sendJson(res, 404, { ok: false, error: 'Nenhuma versão anterior disponível para rollback' })
        return true
      }

      try {
        // Stop current worker
        await extensionHostManager.stopPersistent(extId).catch(() => {})

        // Remove current directory
        const currentDir = path.join(skillRegistry.extensionsDir, extId)
        fs.rmSync(currentDir, { recursive: true, force: true })

        // Extract backup
        await extractZip(backupZip, currentDir)

        // Remove backup
        fs.rmSync(previousDir, { recursive: true, force: true })

        // Restart worker if background
        const manifest = JSON.parse(fs.readFileSync(path.join(currentDir, 'manifest.json'), 'utf8'))
        if (manifest.background) {
          await extensionHostManager.startPersistent(extId, currentDir, manifest).catch(() => {})
        }

        // Refresh registry
        await skillRegistry.refresh().catch(() => {})

        sendJson(res, 200, { ok: true, message: 'Rollback realizado com sucesso' })
      } catch (err) {
        sendJson(res, 500, { ok: false, error: `Rollback falhou: ${err.message}` })
      }
      return true
    }

    if (pathname === '/extensions/toggle' && req.method === 'POST') {
      const payload = await readJsonBody(req).catch(() => ({}))
      const extId = String(payload.id || '').trim()
      if (!isValidExtensionId(extId)) {
        sendJson(res, 400, { ok: false, error: 'invalid_extension_id' })
        return true
      }
      let found = store.extensions.find((item) => item.id === extId)
      if (!found) {
        // Create a store entry so the toggle state can be persisted.
        // Use the correct category based on the skill kind.
        const existingSkill = skillRegistry.getById(extId)
        const category =
          existingSkill?.kind === 'builtin' || existingSkill?.kind === 'packaged'
            ? 'builtin'
            : 'extension'
        found = {
          id: extId,
          name: extId,
          description: '',
          category,
          enabled: true,
          source: getEffectiveDevMode(store?.settings?.dev_mode)
        }
        store.extensions.push(found)
      }
      found.enabled = Boolean(payload.enabled)
      saveStore()
      await skillRegistry.loadExtensions()

      _cachedExtensionsPayload = null
      _lastExtensionsRefresh = 0
      if (context.syncSkillAndToolIndexes) {
        context.syncSkillAndToolIndexes(true).catch(() => {})
      }

      // Manage persistent worker lifecycle if needed
      const skill = skillRegistry.getById(extId)
      if (skill && skill.manifest?.background) {
        if (found.enabled) {
          console.log(`[extensions] Starting persistent worker for toggled extension: ${skill.id}`)
          extensionHostManager
            .startPersistent(skill.id, skill.dir, skill.manifest)
            .catch((err) =>
              console.log(
                `[extensions] Failed to start persistent worker for ${skill.id}:`,
                err.message
              )
            )
        } else {
          console.log(`[extensions] Stopping persistent worker for toggled extension: ${skill.id}`)
          await extensionHostManager.stopPersistent(skill.id).catch((err) => {
            console.log(
              `[extensions] Failed to stop persistent worker for ${skill.id}:`,
              err.message
            )
          })
        }
      }

      const hookName = found.enabled ? 'onActivate' : 'onDeactivate'
      await skillRegistry.executeHook(extId, hookName, { extId }).catch((err) => {
        console.log(`[extensions] ${hookName} hook failed for ${extId}: ${err.message}`)
      })
      sendJson(res, 200, { ok: true })
      return true
    }

    if (pathname === '/extensions/uninstall' && req.method === 'POST') {
      const payload = await readSafe(req, res)
      if (payload === null) return true
      const extId = String(payload.id || '').trim()
      if (!isValidExtensionId(extId)) {
        sendJson(res, 400, { ok: false, error: 'invalid_extension_id' })
        return true
      }
      const extDir = resolveExtensionDir(skillRegistry.extensionsDir, extId)
      if (!extDir) {
        sendJson(res, 400, { ok: false, error: 'invalid_extension_path' })
        return true
      }
      const extensionsDevDir =
        (skillRegistry && skillRegistry.extensionsDevDir) ||
        path.join(skillRegistry.extensionsDir, '.dev')

      // Stop persistent worker if running
      await extensionHostManager.stopPersistent(extId).catch((err) => {
        console.log(
          `[extensions] Failed to stop persistent worker during uninstall for ${extId}:`,
          err.message
        )
      })

      await skillRegistry.executeHook(extId, 'onUninstall', { extId, extDir }).catch((err) => {
        console.log(`[extensions] onUninstall hook failed for ${extId}: ${err.message}`)
      })
      // Clean up keywords
      if (store.skillKeywords) {
        delete store.skillKeywords[extId]
      }
      // Single, mode-stable key — also drop any legacy `<id>_dev` entry from
      // pre-fix installs so we don't leave orphans behind.
      // Use in-place mutation to keep the reference in sync with shared.store.extensions.
      const filtered = store.extensions.filter(
        (item) => item.id !== extId && item.id !== `${extId}_dev`
      )
      store.extensions.length = 0
      store.extensions.push(...filtered)
      // Wipe only the current mode's artifact so uninstall works
      // without accidentally removing files linked from a separate
      // development checkout.
      const devMode = getEffectiveDevMode(store?.settings?.dev_mode)
      removeExtensionArtifacts(skillRegistry.extensionsDir, extensionsDevDir, extId, devMode)
      saveStore()
      await skillRegistry.loadExtensions()

      _cachedExtensionsPayload = null
      _lastExtensionsRefresh = 0
      if (context.syncSkillAndToolIndexes) {
        context.syncSkillAndToolIndexes(true).catch(() => {})
      }

      sendJson(res, 200, { ok: true })
      return true
    }

    /* ── Generic Extension Action Endpoint ── */
    if (
      pathname.startsWith('/extensions/') &&
      pathname.endsWith('/action') &&
      req.method === 'POST'
    ) {
      const parts = pathname.split('/').filter(Boolean)
      const extId = parts[1]
      const body = await readSafe(req, res)
      if (body === null) return true
      const actionName = String(body.action || 'default')
      const actionPayload = body.payload || {}

      /* Permission enforcement before execution */
      const skill = skillRegistry.getById(extId)
      const permSchema = createPermissionSchema()
      const perms = skill?.manifest?.permissions
      if (skill && perms && permSchema.needsAnyPermission(perms)) {
        if (perms.process?.allowed === false) {
          sendJson(res, 403, {
            ok: false,
            error: 'permission_denied',
            reason: 'process access denied'
          })
          return true
        }
        if (perms.shell?.allowed === false) {
          sendJson(res, 403, {
            ok: false,
            error: 'permission_denied',
            reason: 'shell access denied'
          })
          return true
        }
      }

      /* Try to find the skill and execute */
      if (skill && typeof skill.execute === 'function') {
        try {
          const llm = createSkillLlmHelper({
            llamaState,
            tierName: store?.settings?.ai_tier || 'ultra',
            temperature: 0.35
          })
          const result = await skill.execute({
            content: actionName,
            context: { llm },
            manifest: skill.manifest,
            args: actionPayload,
            toolName: actionName
          })
          sendJson(res, 200, result || { ok: true })
          return true
        } catch (err) {
          console.error('[extensions] Unhandled skill action error:', err)
          const { status, body } = sanitizeError(err, {
            isDev: process.env.NODE_ENV !== 'production'
          })
          sendJson(res, status, body)
          return true
        }
      }

      /* Fallback: return ok for extensions without runtime */
      sendJson(res, 200, { ok: true, result: null })
      return true
    }

    if (pathname === '/extensions/hardware-stats' && req.method === 'GET') {
      const mem = process.memoryUsage()
      sendJson(res, 200, {
        cpu_usage: 0,
        ram_usage: Math.round((mem.rss / os.totalmem()) * 100),
        active_processes: (llamaState.process ? 1 : 0) + (semanticState.embedding.process ? 1 : 0),
        vram_usage: 0
      })
      return true
    }

    /* ── SSE stream for extension push events ── */
    if (pathname === '/extensions/events' && req.method === 'GET') {
      extensionEvents.addClient(res)
      return true
    }

    /* ── Fetch panel data from persistent worker ── */
    const panelMatch = pathname.match(/^\/extensions\/([^/]+)\/panel$/)
    if (panelMatch && req.method === 'GET') {
      const extId = panelMatch[1]
      try {
        const result = await extensionHostManager.sendToPersistent(extId, {
          toolName: 'panel',
          args: {}
        })
        const body = result || { ok: false, error: 'no_data' }
        // Wrap raw responses in structured response for GenericExtensionCard
        if (!body.structuredResponse) {
          body.structuredResponse = {
            type: 'generic-extension',
            data: {
              extension: extId,
              header: { title: extId, subtitle: body.connected ? 'Conectado' : 'Desconectado' },
              connected: body.connected,
              status: body.error
                ? { type: 'error', message: body.error }
                : body.connected
                  ? { type: 'success', message: 'Conectado' }
                  : undefined,
              items: (body.whitelist || []).map(function (w) {
                return { label: w.name || w, meta: w.number || w }
              })
            }
          }
        }
        sendJson(res, 200, body)
      } catch (err) {
        sendJson(res, 200, { ok: false, error: err.message })
      }
      return true
    }

    /* ── Generic LLM completion for extensions ── */
    if (pathname === '/extensions/llm/complete' && req.method === 'POST') {
      const body = await readSafe(req, res)
      if (body === null) return true
      const prompt = String(body.prompt || body.user || '')
      if (!prompt) {
        sendJson(res, 200, { text: '' })
        return true
      }
      try {
        const { createSkillLlmHelper } = require('../../services/skill-llm')
        const llm = createSkillLlmHelper({
          llamaState,
          tierName: store?.settings?.ai_tier || 'pro',
          temperature: 0.4
        })
        const result = await llm.completeText({
          system: String(
            body.system ||
              'Responda de forma direta e natural. Gere APENAS o texto da resposta, sem explicacoes, sem aspas, sem formatacao.'
          ),
          user: prompt
        })
        const text = (result.text || '').trim()
        sendJson(res, 200, { text })
      } catch {
        sendJson(res, 200, { text: '' })
      }
      return true
    }

    /* ── Dev reload endpoint (called by CLI) ── */
    if (pathname === '/extensions/dev-reload' && req.method === 'POST') {
      const body = await readSafe(req, res)
      if (body === null) return true
      const extId = String(body.extId || '').trim()

      console.log(`[ExtensionsAPI] POST /extensions/dev-reload extId=${extId}`)

      try {
        const { ExtensionDevWatcher } = require('../../services/extension-dev-watcher')
        if (context.devWatcher && typeof context.devWatcher.triggerReload === 'function') {
          await context.devWatcher.triggerReload(extId)
        }
        sendJson(res, 200, { ok: true })
      } catch (err) {
        console.error(`[ExtensionsAPI] dev-reload error:`, err.message)
        sendJson(res, 500, { ok: false, error: err.message })
      }
      return true
    }

    /* ── Send command to persistent worker ── */
    const cmdMatch = pathname.match(/^\/extensions\/([^/]+)\/command$/)
    if (cmdMatch && req.method === 'POST') {
      const extId = cmdMatch[1]
      const body = await readSafe(req, res)
      if (body === null) return true
      try {
        const result = await extensionHostManager.sendToPersistent(extId, {
          toolName: body.toolName,
          args: body.args || {}
        })
        sendJson(res, 200, result || { ok: true })
      } catch (err) {
        sendJson(res, 200, { ok: false, error: err.message })
      }
      return true
    }

    /* ── Batch storage operations ── */
    if (pathname === '/extensions/storage/batch-get' && req.method === 'POST') {
      const body = await readSafe(req, res)
      if (body === null) return true
      const { keys } = body
      if (!Array.isArray(keys)) {
        sendJson(res, 400, { ok: false, error: 'keys must be an array' })
        return true
      }
      const result = {}
      for (const key of keys) {
        try {
          const filePath = path.join(skillRegistry.extensionsDir, '.storage', `${key}.json`)
          if (fs.existsSync(filePath)) {
            result[key] = JSON.parse(fs.readFileSync(filePath, 'utf8'))
          }
        } catch {}
      }
      sendJson(res, 200, { ok: true, data: result })
      return true
    }

    if (pathname === '/extensions/storage/batch-set' && req.method === 'POST') {
      const body = await readSafe(req, res)
      if (body === null) return true
      const { entries } = body
      if (!entries || typeof entries !== 'object') {
        sendJson(res, 400, { ok: false, error: 'entries must be an object' })
        return true
      }
      const storageDir = path.join(skillRegistry.extensionsDir, '.storage')
      if (!fs.existsSync(storageDir)) fs.mkdirSync(storageDir, { recursive: true })

      for (const [key, value] of Object.entries(entries)) {
        fs.writeFileSync(path.join(storageDir, `${key}.json`), JSON.stringify(value))
      }
      sendJson(res, 200, { ok: true })
      return true
    }

    return false
  }
}

module.exports = {
  createExtensionsRoutes,
  validateInstallUrl,
  validateRedirectUrl,
  MAX_DOWNLOAD_SIZE,
  MAX_REDIRECTS,
  resolveInstallVersion,
  cleanupOppositeModeArtifact,
  invalidateExtensionsPayloadCache,
  _setRegistry: _setInstallRegistryForTests,
  _setCommunityRegistryForTests
}
