// TDD: LGPD endpoints at /privacy/export and /privacy/delete-all.
// - GET  /privacy/export     → ZIP bundle of all user data
// - POST /privacy/delete-all → wipe userData (requires confirmation)

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const yauzl = require('yauzl')

function readZipEntries(zipPath) {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
      if (err) return reject(err)
      const entries = []
      zipfile.on('entry', (entry) => {
        entries.push(entry.fileName)
        zipfile.readEntry()
      })
      zipfile.on('end', () => resolve(entries))
      zipfile.on('error', reject)
      zipfile.readEntry()
    })
  })
}

function readZipEntry(zipPath, fileName) {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
      if (err) return reject(err)
      zipfile.on('entry', (entry) => {
        if (entry.fileName === fileName) {
          zipfile.openReadStream(entry, (err2, stream) => {
            if (err2) return reject(err2)
            const chunks = []
            stream.on('data', (c) => chunks.push(c))
            stream.on('end', () => resolve(Buffer.concat(chunks)))
            stream.on('error', reject)
          })
        } else {
          zipfile.readEntry()
        }
      })
      zipfile.on('end', () => reject(new Error('not found')))
      zipfile.on('error', reject)
      zipfile.readEntry()
    })
  })
}

function makeCtx(overrides = {}) {
  const calls = { status: null, data: null, headers: null, bodyWritten: false, ended: false }
  const ctx = {
    store: {
      settings: { user_name: 'Jane', locale: 'pt-BR' },
      reminders: [{ id: 1, title: 'Test', content: 'ping', scheduled_time: '2026-01-01' }],
      thread_messages: {
        'thread-1': [{ id: 1, role: 'user', content: 'hi' }]
      },
      session_titles: { 'thread-1': 'Greetings' },
      extensions: []
    },
    saveStore: () => {},
    readJsonBody: async () => ({}),
    ensureDir: () => {},
    corsHeaders: () => ({})
  }
  Object.assign(ctx, overrides)
  ctx.sendJson = (res, status, data) => {
    calls.status = status
    calls.data = data
    calls.bodyWritten = true
    calls.ended = true
  }
  return { ctx, calls }
}

describe('privacy route', () => {
  let tmpDir

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'momai-privacy-'))
  })

  afterEach(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  test('GET /privacy/export returns a 200 JSON response with ok:true and a file path', async () => {
    // Configure the route to use tmpDir as DATA_DIR by stubbing the module's constants
    const { createPrivacyRoutes } = require('../api/routes/privacy')
    const { ctx, calls } = makeCtx({
      dataDir: tmpDir,
      getTempPath: () => path.join(tmpDir, 'export.zip')
    })
    // Seed minimal data sources
    fs.writeFileSync(path.join(tmpDir, 'node-core-store.json'), JSON.stringify(ctx.store, null, 2))
    fs.mkdirSync(path.join(tmpDir, 'notes'), { recursive: true })
    fs.writeFileSync(path.join(tmpDir, 'notes', 'note-1.md'), '# Note 1\nbody')
    fs.writeFileSync(path.join(tmpDir, 'notes', '.index.json'), '[]')

    const handler = createPrivacyRoutes(ctx)
    const handled = await handler({ method: 'GET' }, {}, '/privacy/export', {
      searchParams: new URLSearchParams()
    })

    expect(handled).toBe(true)
    expect(calls.status).toBe(200)
    expect(calls.data.ok).toBe(true)
    expect(typeof calls.data.path).toBe('string')
    expect(fs.existsSync(calls.data.path)).toBe(true)
  })

  test('export ZIP contains expected files (settings, reminders, messages, notes, README)', async () => {
    const { createPrivacyRoutes } = require('../api/routes/privacy')
    const exportPath = path.join(tmpDir, 'export.zip')
    const { ctx, calls } = makeCtx({
      dataDir: tmpDir,
      getTempPath: () => exportPath
    })
    fs.writeFileSync(path.join(tmpDir, 'node-core-store.json'), JSON.stringify(ctx.store, null, 2))
    fs.mkdirSync(path.join(tmpDir, 'notes'), { recursive: true })
    fs.writeFileSync(path.join(tmpDir, 'notes', 'note-1.md'), '# Note 1\nbody')
    fs.writeFileSync(path.join(tmpDir, 'notes', '.index.json'), '[]')

    const handler = createPrivacyRoutes(ctx)
    await handler({ method: 'GET' }, {}, '/privacy/export', { searchParams: new URLSearchParams() })

    const entries = await readZipEntries(exportPath)
    expect(entries).toContain('settings.json')
    expect(entries).toContain('reminders.json')
    expect(entries).toContain('README.md')
    expect(entries).toContain('messages/thread-1.json')
    expect(entries).toContain('notes/note-1.md')
    expect(entries).toContain('notes/index.json')

    const settings = JSON.parse((await readZipEntry(exportPath, 'settings.json')).toString('utf8'))
    expect(settings.user_name).toBe('Jane')
    const msg = JSON.parse(
      (await readZipEntry(exportPath, 'messages/thread-1.json')).toString('utf8')
    )
    expect(msg).toHaveLength(1)
    expect(msg[0].content).toBe('hi')
  })

  test('POST /privacy/delete-all rejects requests without proper confirmation', async () => {
    const { createPrivacyRoutes } = require('../api/routes/privacy')
    const { ctx, calls } = makeCtx({
      dataDir: tmpDir,
      getTempPath: () => path.join(tmpDir, 'export.zip'),
      readJsonBody: async () => ({}) // empty body
    })
    const handler = createPrivacyRoutes(ctx)
    const handled = await handler({ method: 'POST' }, {}, '/privacy/delete-all', {
      searchParams: new URLSearchParams()
    })
    expect(handled).toBe(true)
    expect(calls.status).toBe(400)
    expect(calls.data.ok).toBe(false)
    expect(calls.data.error).toMatch(/confirmation/i)
  })

  test('POST /privacy/delete-all with correct confirmation removes expected files', async () => {
    const { createPrivacyRoutes } = require('../api/routes/privacy')
    // Seed data to be deleted
    fs.writeFileSync(
      path.join(tmpDir, 'node-core-store.json'),
      JSON.stringify({ settings: {}, reminders: [] }, null, 2)
    )
    fs.writeFileSync(path.join(tmpDir, 'messages.json'), '[]')
    fs.mkdirSync(path.join(tmpDir, 'notes'), { recursive: true })
    fs.writeFileSync(path.join(tmpDir, 'notes', 'note-1.md'), 'x')
    fs.mkdirSync(path.join(tmpDir, 'extensions', 'test-skill'), { recursive: true })
    fs.writeFileSync(path.join(tmpDir, 'extensions', 'test-skill', 'creds.json'), 'x')
    fs.mkdirSync(path.join(tmpDir, 'semantic', 'lancedb'), { recursive: true })
    fs.writeFileSync(path.join(tmpDir, 'semantic', 'lancedb', 'index'), 'x')
    fs.writeFileSync(path.join(tmpDir, 'observability-metrics.json'), '{}')

    const { ctx, calls } = makeCtx({
      dataDir: tmpDir,
      getTempPath: () => path.join(tmpDir, 'export.zip'),
      readJsonBody: async () => ({ confirmation: 'DELETE_ALL_MY_DATA' })
    })
    const handler = createPrivacyRoutes(ctx)
    const handled = await handler({ method: 'POST' }, {}, '/privacy/delete-all', {
      searchParams: new URLSearchParams()
    })
    expect(handled).toBe(true)
    expect(calls.status).toBe(200)
    expect(calls.data.ok).toBe(true)

    // Verify data is gone
    expect(fs.existsSync(path.join(tmpDir, 'node-core-store.json'))).toBe(false)
    expect(fs.existsSync(path.join(tmpDir, 'messages.json'))).toBe(false)
    expect(fs.existsSync(path.join(tmpDir, 'notes'))).toBe(false)
    expect(fs.existsSync(path.join(tmpDir, 'extensions', 'test-skill'))).toBe(false)
    expect(fs.existsSync(path.join(tmpDir, 'semantic', 'lancedb'))).toBe(false)
    expect(fs.existsSync(path.join(tmpDir, 'observability-metrics.json'))).toBe(false)

    // Verify in-memory store is reset to defaults
    expect(ctx.store.thread_messages).toEqual({})
    expect(ctx.store.settings.user_name).toBe('')
  })

  test('After delete-all, export returns a minimal (essentially empty) ZIP', async () => {
    const { createPrivacyRoutes } = require('../api/routes/privacy')
    const exportPath = path.join(tmpDir, 'export2.zip')
    const { ctx, calls } = makeCtx({
      dataDir: tmpDir,
      getTempPath: () => exportPath,
      readJsonBody: async () => ({ confirmation: 'DELETE_ALL_MY_DATA' })
    })
    const handler = createPrivacyRoutes(ctx)

    // 1. Delete all (no data exists, but should still succeed)
    fs.writeFileSync(path.join(tmpDir, 'node-core-store.json'), JSON.stringify(ctx.store, null, 2))
    await handler({ method: 'POST' }, {}, '/privacy/delete-all', {
      searchParams: new URLSearchParams()
    })
    expect(calls.status).toBe(200)

    // 2. Export — should still work and return a valid ZIP
    calls.status = null
    calls.data = null
    await handler({ method: 'GET' }, {}, '/privacy/export', { searchParams: new URLSearchParams() })
    expect(calls.status).toBe(200)
    expect(calls.data.ok).toBe(true)
    expect(fs.existsSync(exportPath)).toBe(true)

    const entries = await readZipEntries(exportPath)
    // At minimum, README.md should be present
    expect(entries).toContain('README.md')
  })

  test('non-matching path returns false (so router can continue to next handler)', async () => {
    const { createPrivacyRoutes } = require('../api/routes/privacy')
    const { ctx } = makeCtx({ dataDir: tmpDir })
    const handler = createPrivacyRoutes(ctx)
    const handled = await handler({ method: 'GET' }, {}, '/some/other/path', {
      searchParams: new URLSearchParams()
    })
    expect(handled).toBe(false)
  })
})
