// LGPD (Lei Geral de Proteção de Dados) endpoints.
//   GET  /privacy/export     — Bundle all user data into a ZIP and return its path.
//                              The main process reads that path and streams it to
//                              the renderer as a download.
//   POST /privacy/delete-all — Wipe every user-data file (requires explicit
//                              confirmation: { "confirmation": "DELETE_ALL_MY_DATA" }).
//
// Files written into the export ZIP:
//   ├── settings.json
//   ├── reminders.json
//   ├── messages/<thread_id>.json      (one per thread)
//   ├── notes/<note_id>.md             (decrypted if .enc; .md otherwise)
//   ├── notes/index.json
//   ├── extensions/                    (storage used by skills)
//   ├── metrics.json                   (observability stats)
//   └── README.md
//
// Files removed by delete-all:
//   - data/node-core-store.json
//   - data/messages.json (legacy backup, if present)
//   - data/notes/        (entire directory, after a best-effort .enc → .md migration)
//   - data/extensions/<id>/<key>.json  (per-extension storage)
//   - data/extensions/<id>/            (e.g. whatsapp/baileys-auth)
//   - data/semantic/lancedb/           (vector index)
//   - data/observability-metrics.json  (diagnostics)
//   - data/models/*.gguf               (LLM weights — opt-out via ?keepModels=true)
//   - python_env/, uv_cache/, uv_python/
//
// Logs (debug) and installer-side data are NOT removed.

const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { createZipFromFiles } = require('../../utils/zip-writer')
const { collectStoredData } = require('../../services/manifest-storage')

const CONFIRMATION_TOKEN = 'DELETE_ALL_MY_DATA'

function makeFilenameDate(now = new Date()) {
  return now.toISOString().slice(0, 10)
}

function safeReadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return null
  }
}

function listFilesRecursive(root) {
  const out = []
  if (!fs.existsSync(root)) return out
  const stack = [root]
  while (stack.length) {
    const dir = stack.pop()
    let entries
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const e of entries) {
      const full = path.join(dir, e.name)
      if (e.isDirectory()) {
        stack.push(full)
      } else if (e.isFile()) {
        out.push(full)
      }
    }
  }
  return out
}

function relPath(base, full) {
  return path.relative(base, full).replace(/\\/g, '/')
}

function tryReadBuffer(filePath) {
  try {
    return fs.readFileSync(filePath)
  } catch {
    return null
  }
}

function tryReadUtf8(filePath) {
  const buf = tryReadBuffer(filePath)
  if (buf === null) return null
  return buf.toString('utf8')
}

function readAllReminders(ctx) {
  // store.reminders is the primary source; fall back to the file on disk.
  if (Array.isArray(ctx.store?.reminders)) return ctx.store.reminders
  return []
}

function collectThreadMessages(ctx) {
  return ctx.store?.thread_messages && typeof ctx.store.thread_messages === 'object'
    ? ctx.store.thread_messages
    : {}
}

function listInstalledNoteFiles(dataDir) {
  // notes/*.md (plain) and notes/*.enc (encrypted from task 3.2). We treat .enc
  // as opaque bytes (the receiving user can decrypt on their own machine only
  // with the same OS keychain; the export always includes the encrypted bytes
  // for portability).
  const notesDir = path.join(dataDir, 'notes')
  if (!fs.existsSync(notesDir)) return { mdFiles: [], encFiles: [], index: null }
  let entries
  try {
    entries = fs.readdirSync(notesDir)
  } catch {
    return { mdFiles: [], encFiles: [], index: null }
  }
  const mdFiles = entries.filter((n) => n.endsWith('.md')).map((n) => path.join(notesDir, n))
  const encFiles = entries.filter((n) => n.endsWith('.enc')).map((n) => path.join(notesDir, n))
  const indexPath = path.join(notesDir, '.index.json')
  const index = tryReadUtf8(indexPath)
  return { mdFiles, encFiles, index }
}

function readStoreForExport(dataDir) {
  const storePath = path.join(dataDir, 'node-core-store.json')
  if (!fs.existsSync(storePath)) return null
  try {
    return JSON.parse(fs.readFileSync(storePath, 'utf8'))
  } catch {
    return null
  }
}

function buildExportFiles(ctx) {
  const dataDir = ctx.dataDir
  const files = {}

  // settings
  const storeData = readStoreForExport(dataDir)
  const settings = storeData?.settings || ctx.store?.settings || {}
  files['settings.json'] = JSON.stringify(settings, null, 2)

  // reminders
  const reminders = readAllReminders(ctx)
  files['reminders.json'] = JSON.stringify(reminders, null, 2)

  // messages: one file per thread
  const threadMessages = collectThreadMessages(ctx)
  for (const [threadId, messages] of Object.entries(threadMessages)) {
    const safeId = String(threadId).replace(/[^a-zA-Z0-9._-]/g, '_')
    files[`messages/${safeId}.json`] = JSON.stringify(messages, null, 2)
  }

  // notes
  const { mdFiles, encFiles, index } = listInstalledNoteFiles(dataDir)
  for (const md of mdFiles) {
    const rel = relPath(path.join(dataDir, 'notes'), md)
    const content = tryReadBuffer(md)
    if (content !== null) files[`notes/${rel}`] = content
  }
  for (const enc of encFiles) {
    const rel = relPath(path.join(dataDir, 'notes'), enc)
    const content = tryReadBuffer(enc)
    if (content !== null) files[`notes/${rel}`] = content
  }
  if (index !== null) {
    files['notes/index.json'] = index
  }

  // extensions storage: include any file under data/extensions/<id>/
  // (this covers per-extension <key>.json storage as well as whatsapp/baileys-auth
  //  and any other install-specific files).
  const extRoot = path.join(dataDir, 'extensions')
  for (const full of listFilesRecursive(extRoot)) {
    const rel = relPath(dataDir, full)
    const content = tryReadBuffer(full)
    if (content !== null) files[rel] = content
  }

  // metrics (observability) — best effort
  const metricsPath = path.join(dataDir, 'cache', 'observability-metrics.json')
  const metricsBuf = tryReadBuffer(metricsPath)
  if (metricsBuf !== null) {
    files['metrics.json'] = metricsBuf
  } else {
    const legacy = tryReadBuffer(path.join(dataDir, 'observability-metrics.json'))
    if (legacy !== null) files['metrics.json'] = legacy
  }

  // README
  const date = makeFilenameDate()
  files['README.md'] = buildReadme(date)

  return files
}

function buildReadme(date) {
  return [
    `# MomAI data export (${date})`,
    '',
    'This archive contains a snapshot of all data the MomAI desktop app has',
    'stored locally for your account on this device. Generated for the',
    'purposes of data portability (LGPD Art. 18, V).',
    '',
    '## Contents',
    '',
    '- `settings.json` — your preferences (assistant persona, voice, locale, etc.)',
    '- `reminders.json` — active and past reminders',
    '- `messages/<thread>.json` — chat history, one file per thread',
    '- `notes/` — your notes, in Markdown. `.enc` files are encrypted at rest',
    '  with the OS keychain; they can only be decrypted on the same device',
    '  by the same user account.',
    '- `extensions/<id>/` — any files written by installed extensions (one',
    '  subdirectory per extension, e.g. session credentials, contacts cache).',
    '- `metrics.json` — diagnostic counters (token usage, latency).',
    '  Pure operational data — no message contents.',
    '',
    '## How to use',
    '',
    '1. Extract the archive anywhere.',
    '2. Open `settings.json` to review your preferences.',
    '3. Open the `messages/<thread>.json` files to read your chat history.',
    '4. Open `notes/*.md` in any text or Markdown editor.',
    '5. To import back into MomAI, copy the original paths into the app',
    '   data directory (only supported for plain-text files).',
    '',
    '## Deleting your data',
    '',
    'Use the "Reset all my data" button in the MomAI app, or',
    'delete the `data/` directory inside your userData folder.',
    '',
    'Questions? See the privacy policy at https://wesleyydev.mintlify.app'
  ].join('\n')
}

function rmIfExists(target) {
  try {
    if (!fs.existsSync(target)) return false
    fs.rmSync(target, { recursive: true, force: true })
    return true
  } catch (e) {
    console.warn(`[privacy] failed to remove ${target}: ${e.message}`)
    return false
  }
}

function performDeleteAll(dataDir, { keepModels = false } = {}) {
  const removed = []

  // Core store
  if (rmIfExists(path.join(dataDir, 'node-core-store.json'))) {
    removed.push('node-core-store.json')
  }
  // Legacy messages backup
  if (rmIfExists(path.join(dataDir, 'messages.json'))) {
    removed.push('messages.json')
  }
  // Notes
  if (rmIfExists(path.join(dataDir, 'notes'))) {
    removed.push('notes/')
  }
  // Extensions (top-level dirs under data/extensions)
  const extRoot = path.join(dataDir, 'extensions')
  if (fs.existsSync(extRoot)) {
    let dirs
    try {
      dirs = fs.readdirSync(extRoot, { withFileTypes: true })
    } catch {
      dirs = []
    }
    for (const e of dirs) {
      if (e.isDirectory()) {
        if (rmIfExists(path.join(extRoot, e.name))) {
          removed.push(`extensions/${e.name}/`)
        }
      } else if (e.isFile()) {
        if (rmIfExists(path.join(extRoot, e.name))) {
          removed.push(`extensions/${e.name}`)
        }
      }
    }
  }
  // Semantic index (LanceDB)
  if (rmIfExists(path.join(dataDir, 'semantic', 'lancedb'))) {
    removed.push('semantic/lancedb/')
  }
  if (rmIfExists(path.join(dataDir, 'semantic'))) {
    removed.push('semantic/')
  }
  // Metrics (both old path and new path)
  if (rmIfExists(path.join(dataDir, 'observability-metrics.json'))) {
    removed.push('observability-metrics.json')
  }
  if (rmIfExists(path.join(dataDir, 'cache', 'observability-metrics.json'))) {
    removed.push('cache/observability-metrics.json')
  }

  // Models (opt-out)
  if (!keepModels) {
    const modelsDir = path.join(dataDir, 'models')
    if (fs.existsSync(modelsDir)) {
      let modelFiles
      try {
        modelFiles = fs
          .readdirSync(modelsDir, { withFileTypes: true })
          .filter((e) => e.isFile() && e.name.endsWith('.gguf'))
      } catch {
        modelFiles = []
      }
      for (const f of modelFiles) {
        if (rmIfExists(path.join(modelsDir, f.name))) {
          removed.push(`models/${f.name}`)
        }
      }
    }
  }

  // Python sidecar cache
  const dataParent = path.dirname(dataDir) // /userData
  for (const target of ['python_env', 'uv_cache', 'uv_python']) {
    if (rmIfExists(path.join(dataParent, target))) {
      removed.push(`${target}/`)
    }
  }

  return removed
}

function createPrivacyRoutes(context) {
  const { sendJson, readJsonBody, saveStore, dataDir, getTempPath, skillRegistry } = context
  if (!dataDir) {
    throw new Error('createPrivacyRoutes requires context.dataDir')
  }
  const resolveTempPath =
    typeof getTempPath === 'function' ? getTempPath : () => path.join(os.tmpdir(), 'momai-export.zip')

  return async function handlePrivacyRoutes(req, res, pathname, parsedUrl) {
    if (pathname === '/privacy/stored' && req.method === 'GET') {
      const skills = skillRegistry && typeof skillRegistry.getAll === 'function' ? skillRegistry.getAll() : []
      sendJson(res, 200, { items: collectStoredData(skills) })
      return true
    }

    if (pathname === '/privacy/export' && req.method === 'GET') {
      const keepModels = parsedUrl.searchParams?.get('keepModels') === 'true'
      let tempPath
      try {
        const files = buildExportFiles(context)
        tempPath = resolveTempPath()
        await createZipFromFiles(tempPath, files)
      } catch (err) {
        console.error('[privacy] export failed:', err)
        sendJson(res, 500, { ok: false, error: `export failed: ${err.message}` })
        return true
      }
      sendJson(res, 200, { ok: true, path: tempPath, keepModels })
      return true
    }

    if (pathname === '/privacy/delete-all' && req.method === 'POST') {
      const body = (await readJsonBody(req).catch(() => ({}))) || {}
      if (body.confirmation !== CONFIRMATION_TOKEN) {
        sendJson(res, 400, {
          ok: false,
          error: `confirmation required: send { "confirmation": "${CONFIRMATION_TOKEN}" }`
        })
        return true
      }
      const keepModels = body.keepModels === true

      // Stop persistent workers so they don't write back to disk while we wipe.
      try {
        if (context.extensionHostManager?.stopAllPersistent) {
          await context.extensionHostManager.stopAllPersistent()
        }
      } catch (e) {
        console.warn('[privacy] stopAllPersistent failed:', e?.message || e)
      }

      // Persist the in-memory store (so callers can read it from disk if they
      // need to), then flush the store reference so subsequent reads don't
      // repopulate deleted files.
      try {
        if (typeof saveStore === 'function') saveStore()
      } catch (e) {
        console.warn('[privacy] saveStore before delete failed:', e?.message || e)
      }

      const removed = performDeleteAll(dataDir, { keepModels })

      sendJson(res, 200, { ok: true, removed, keepModels })
      return true
    }

    return false
  }
}

module.exports = {
  createPrivacyRoutes,
  performDeleteAll,
  buildExportFiles,
  CONFIRMATION_TOKEN
}
