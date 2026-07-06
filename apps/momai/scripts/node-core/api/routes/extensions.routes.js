const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const os = require('node:os')
const http = require('node:http')
const https = require('node:https')
const dns = require('node:dns').promises
const { extractZip } = require('../../utils/zip-extract')
const { createSkillLlmHelper } = require('../../services/skill-llm')
const { isPrivateIp } = require('../../utils/ip-check')
const { verifyChecksum } = require('../../utils/extension-checksum')
const { corsHeaders } = require('../../infrastructure/http-helpers')
const { loadInstallRegistry, usesLocalInstallRegistry, _setInstallRegistryForTests } = require('../../utils/install-registry')
const communityRegistry = require('../../services/community-registry')
const shared = require('../../services/shared-state')

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
    (ext.repo && (
      downloadUrl.startsWith(`https://github.com/${ext.repo}/releases/`) ||
      downloadUrl.startsWith(`https://api.github.com/repos/${ext.repo}/`)
    ))
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

  const nmPaths = findAllNodeModules()
  console.log(`[extensions] Found ${nmPaths.length} node_modules paths for dep install`)
  nmPaths.forEach((p) => console.log(`[extensions]   candidate: ${p}`))
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

/* ── Helpers for downloading & extracting community extensions ── */

function downloadFile(url, destPath, onProgress) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http
    const file = fs.createWriteStream(destPath)
    const request = client.get(url, { headers: { 'User-Agent': 'MomAI-App' } }, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        file.close()
        try {
          fs.unlinkSync(destPath)
        } catch {}
        return downloadFile(response.headers.location, destPath, onProgress)
          .then(resolve)
          .catch(reject)
      }
      if (response.statusCode < 200 || response.statusCode >= 300) {
        file.close()
        try {
          fs.unlinkSync(destPath)
        } catch {}
        return reject(new Error(`HTTP ${response.statusCode}`))
      }

      const totalBytes = parseInt(response.headers['content-length'] || '0', 10)
      let receivedBytes = 0
      let lastTime = Date.now()
      let lastBytes = 0

      response.on('data', (chunk) => {
        receivedBytes += chunk.length
        const now = Date.now()
        if (now - lastTime >= 500) {
          const speedBps = ((receivedBytes - lastBytes) / (now - lastTime)) * 1000
          const speedStr =
            speedBps > 1048576
              ? (speedBps / 1048576).toFixed(1) + ' MB/s'
              : (speedBps / 1024).toFixed(1) + ' KB/s'
          const percent = totalBytes ? Math.round((receivedBytes / totalBytes) * 100) : 0
          if (onProgress) onProgress(percent, speedStr)
          lastTime = now
          lastBytes = receivedBytes
        }
      })

      response.pipe(file)
      file.on('finish', () => {
        file.close()
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

function resolveExtensionDir(extensionsDir, extId) {
  const root = path.resolve(extensionsDir)
  const target = path.resolve(root, extId)
  if (target === root || !target.startsWith(root + path.sep)) return null
  return target
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

  async function getExtensionsPayload(lang) {
    const now = Date.now()
    const currentDevMode = store?.settings?.dev_mode || 'symlink'
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
      if (filePath.includes('..')) {
        sendJson(res, 400, { ok: false, error: 'invalid_path' })
        return true
      }
      const dataDir = process.env.MOMAI_NODE_CORE_DATA_DIR || process.env.MOMAI_DATA_DIR || path.resolve(__dirname, '..', '..', 'data')
      const fullPath = path.join(dataDir, 'extensions', extId, filePath)
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
        const body = await readJsonBody(req).catch(() => ({}))
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
        const { categorizeReleases, findBestCompatibleRelease } = require('../../utils/semver-compat')

        const community = await communityRegistry.fetchRegistry()
        let item = community.find((e) => e.id === id)

        if (!item && usesLocalInstallRegistry()) {
          const localRegistry = await loadInstallRegistry()
          item = (localRegistry.extensions || []).find((e) => e.id === id)
        }

        // Also check installed extensions for repo info
        const skillRegistry = shared.skillRegistry
        const installed = skillRegistry ? skillRegistry.getAll().find((s) => (s.manifest?.id || s.id) === id) : null
        const repo = item?.repo || installed?.manifest?.repo || null

        if (!repo) {
          sendJson(res, 200, { releases: [], installed_version: installed?.manifest?.version || null, recommended_version: null })
          return true
        }

        const rawReleases = await communityRegistry.fetchReleases(repo)

        // Read momai_compat from installed manifest or from remote manifest
        let momaiCompat = installed?.manifest?.momai_compat || null
        if (!momaiCompat && item?.momai_compat) {
          momaiCompat = item.momai_compat
        }

        // Assign momai_compat to each release (from the extension's declared range)
        const releasesWithCompat = rawReleases.map((r) => ({
          ...r,
          momai_compat: momaiCompat
        }))

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
      const payload = await readJsonBody(req).catch(() => ({}))
      const requested = String(payload.id || crypto.randomUUID()).toLowerCase()
      const id =
        requested.replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '') || crypto.randomUUID()
      const extDir = path.join(skillRegistry.extensionsDir, id)

      res.writeHead(200, {
        'Content-Type': 'application/x-ndjson',
        'Transfer-Encoding': 'chunked',
        ...corsHeaders(req)
      })

      const sendStatus = (status, percent, speed) => {
        res.write(JSON.stringify({ status, percent, speed }) + '\n')
      }

      const downloadUrl = String(payload.download_url || '').trim()
      if (downloadUrl) {
        try {
          await validateInstallUrl(id, downloadUrl)
        } catch (err) {
          res.write(JSON.stringify({ ok: false, error: err.message }) + '\n')
          res.end()
          return true
        }
        ensureDir(extDir)
        console.log(`[ExtensionsAPI] Downloading extension ${id} from ${downloadUrl}...`)
        const zipPath = path.join(extDir, 'archive.zip')
        try {
          if (downloadUrl.startsWith('file://')) {
            try {
              const srcPath = require('node:url').fileURLToPath(downloadUrl)
              sendStatus('Baixando...', 50, '-')
              fs.copyFileSync(srcPath, zipPath)
              sendStatus('Baixando...', 100, '-')
            } catch (copyErr) {
              throw new Error(`Failed to copy local zip: ${copyErr.message}`)
            }
          } else {
            sendStatus('Baixando...', 0, '0 KB/s')
            await downloadFile(downloadUrl, zipPath, (percent, speed) =>
              sendStatus('Baixando...', percent, speed)
            )
          }
          let zipBuffer
          try {
            zipBuffer = fs.readFileSync(zipPath)
          } catch (readErr) {
            throw new Error(`Failed to read downloaded zip: ${readErr.message}`)
          }
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
          console.log(`[ExtensionsAPI] Extracting ${id}...`)
          sendStatus('Extraindo...', 100, '-')
          await extractZip(zipPath, extDir)
          try {
            fs.unlinkSync(zipPath)
          } catch {}
          flattenExtractedDir(extDir)
          try {
            await installExtensionDependencies(extDir)
          } catch (depErr) {
            console.log(`[extensions] Dep install failed (non-fatal): ${depErr.message}`)
          }
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
      } else {
        ensureDir(extDir)
        const skillMdPath = path.join(extDir, 'SKILL.md')
        if (!fs.existsSync(skillMdPath)) {
          const description = String(payload.description || 'Extension skill for MomAI.')
          fs.writeFileSync(
            skillMdPath,
            [
              '---',
              `name: ${id}`,
              `description: ${description}`,
              'compatibility: MomAI Node Core',
              '---',
              '',
              '# Extension Skill',
              '',
              'Descreva aqui quando usar esta skill e como executar o fluxo.',
              '',
              '## Quando usar',
              '-',
              '',
              '## Como executar',
              '1.'
            ].join('\n'),
            'utf8'
          )
        }
      }

      let found = store.extensions.find((ext) => ext.id === id)
      if (!found) {
        found = {
          id,
          name: id,
          description: 'Extension installed by Node core',
          category: 'builtin',
          enabled: true
        }
        store.extensions.push(found)
      } else {
        found.enabled = true
      }
      saveStore()
      await skillRegistry.loadExtensions()

      // Start the persistent worker immediately if the extension runs in the background
      const skill = skillRegistry.getById(id)
      if (skill && skill.manifest?.background) {
        console.log(`[extensions] Starting persistent worker for newly installed extension: ${skill.id}`)
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

      sendStatus('Concluído', 100, '-')
      res.write(JSON.stringify({ ok: true }) + '\n')
      res.end()
      return true
    }

    if (pathname === '/extensions/toggle' && req.method === 'POST') {
      const payload = await readJsonBody(req).catch(() => ({}))
      let found = store.extensions.find((item) => item.id === payload.id)
      if (!found) {
        // Allow toggling builtins/packaged by creating a store entry
        found = {
          id: payload.id,
          name: payload.id,
          description: '',
          category: 'builtin',
          enabled: true
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
      const skill = skillRegistry.getById(payload.id)
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
      await skillRegistry.executeHook(payload.id, hookName, { extId: payload.id }).catch((err) => {
        console.log(`[extensions] ${hookName} hook failed for ${payload.id}: ${err.message}`)
      })
      sendJson(res, 200, { ok: true })
      return true
    }

    if (pathname === '/extensions/uninstall' && req.method === 'POST') {
      const payload = await readJsonBody(req).catch(() => ({}))
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
      store.extensions = store.extensions.filter((item) => item.id !== extId)
      if (fs.existsSync(extDir)) fs.rmSync(extDir, { recursive: true, force: true })
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
      const body = await readJsonBody(req).catch(() => ({}))
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
      const body = await readJsonBody(req).catch(() => ({}))
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

    /* ── Send command to persistent worker ── */
    const cmdMatch = pathname.match(/^\/extensions\/([^/]+)\/command$/)
    if (cmdMatch && req.method === 'POST') {
      const extId = cmdMatch[1]
      const body = await readJsonBody(req).catch(() => ({}))
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

    return false
  }
}

module.exports = {
  createExtensionsRoutes,
  validateInstallUrl,
  _setRegistry: _setInstallRegistryForTests
}
