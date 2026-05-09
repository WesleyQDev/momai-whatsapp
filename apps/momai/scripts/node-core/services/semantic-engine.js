const fs = require('node:fs')
const path = require('node:path')
const shared = require('./shared-state')
const semanticState = shared.semanticState
const store = shared.store

function getSkillRegistry() {
  return shared.skillRegistry
}

function getPromptRegistry() {
  return shared.promptRegistry
}
const {
  SEMANTIC_DB_DIR,
  SEMANTIC_SYNC_INTERVAL_MS,
  NOTES_DIR,
  NOTES_INDEX_FILE,
  DATA_DIR
} = require('../config/constants')
const { sha1, promiseAllStep } = require('../utils/text')
const { isoNow } = require('../utils/time')
const { debug, info, warn } = require('../infrastructure/logger')
const MAX_LATENCY_HISTORY = 1000
const { embedText } = require('./embedding-manager')
const { getSkillCatalogRows, getToolCatalogRows } = require('./skill-orchestrator')
const { runLexicalNoteSearch: runLexicalNoteSearchShared } = require('./lexical-search')

// Initialize shared semanticState by mutating the exported object
Object.assign(semanticState, {
  enabled: false,
  ready: false,
  degraded: false,
  lastFallbackReason: null,
  fallbackCount: 0,
  queryCount: 0,
  lastNotesSyncAt: 0,
  lastSkillSyncAt: 0,
  notesSnapshotHash: null,
  skillsSnapshotHash: null,
  toolsSnapshotHash: null,
  lanceModule: null,
  syncingNotes: false,
  syncingSkills: false,
  db: null,
  tableNotes: null,
  tableSkills: null,
  tableTools: null,
  embedding: {
    process: null,
    starting: false,
    startingPromise: null,
    ready: false,
    backend: null,
    modelPath: null,
    lastError: null,
    cache: new Map()
  },
  latency: {
    embeddingMs: [],
    retrievalMs: [],
    toolExecMs: []
  }
})

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true })
}

function readSafeJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback
    const raw = fs.readFileSync(filePath, 'utf8')
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

function splitNoteChunks(text, chunkSize = 800, overlap = 120) {
  const src = String(text || '').replace(/\r/g, '')
  if (!src.trim()) return []
  const chunks = []
  let i = 0
  while (i < src.length) {
    const end = Math.min(src.length, i + chunkSize)
    const piece = src.slice(i, end).trim()
    if (piece) chunks.push(piece)
    if (end >= src.length) break
    i = Math.max(i + 1, end - overlap)
  }
  return chunks
}

function listNoteRecords() {
  const index = readSafeJson(NOTES_INDEX_FILE, [])
  if (!Array.isArray(index)) return []
  return index
    .filter((item) => item && typeof item.id === 'string' && typeof item.path === 'string')
    .map((item) => {
      const absPath = path.join(DATA_DIR, item.path)
      return {
        id: item.id,
        title: String(item.title || 'Nota'),
        path: String(item.path),
        absPath
      }
    })
}

async function loadLanceModule() {
  if (semanticState.lanceModule) return semanticState.lanceModule
  semanticState.lanceModule = await import('@lancedb/lancedb')
  return semanticState.lanceModule
}

async function ensureVectorDb() {
  if (semanticState.db) return semanticState.db
  ensureDir(SEMANTIC_DB_DIR)
  try {
    const lance = await loadLanceModule()
    semanticState.db = await lance.connect(SEMANTIC_DB_DIR)
    return semanticState.db
  } catch (error) {
    semanticState.degraded = true
    semanticState.lastFallbackReason = error?.message || 'lancedb connection failure'
    return null
  }
}

async function createOrOverwriteTable(tableName, rows) {
  const db = await ensureVectorDb()
  if (!db) return null
  try {
    const table = await db.createTable(
      tableName,
      rows.length ? rows : [{ id: '__empty__', text: '__empty__', vector: [0.0, 0.0, 0.0, 0.0] }],
      { mode: 'overwrite' }
    )
    if (!rows.length) {
      await table.delete("id = '__empty__'")
    }
    return table
  } catch (error) {
    semanticState.degraded = true
    semanticState.lastFallbackReason =
      error?.message || `lancedb create table failure: ${tableName}`
    return null
  }
}

async function syncSkillAndToolIndexes(force = false) {
  if ((store.settings.ai_tier || 'pro') !== 'ultra') return
  if (semanticState.syncingSkills) return
  const now = Date.now()
  if (!force && now - semanticState.lastSkillSyncAt < SEMANTIC_SYNC_INTERVAL_MS) return

  const skillRegistry = getSkillRegistry()
  if (skillRegistry && typeof skillRegistry.loadExtensions === 'function') {
    await skillRegistry.loadExtensions()
  }
  const skills = getSkillCatalogRows()
  const tools = getToolCatalogRows()

  const skillsDigest = sha1(JSON.stringify(skills.map((s) => s.id)))
  const toolsDigest = sha1(JSON.stringify(tools.map((t) => t.id)))

  if (
    !force &&
    semanticState.skillsSnapshotHash === skillsDigest &&
    semanticState.toolsSnapshotHash === toolsDigest &&
    semanticState.tableSkills &&
    semanticState.tableTools
  ) {
    semanticState.lastSkillSyncAt = now
    return
  }

  debug('[semantic] Syncing skills and tools catalog...')
  const allItems = [...skills, ...tools]

  // Parallel embedding with concurrency limit of 5
  const vectors = await promiseAllStep(5, allItems, (item) => embedText(item.text))

  if (vectors.some((v) => v === null)) {
    warn('[semantic] Skill sync partially failed due to embedding errors')
    semanticState.lastSkillSyncAt = now + 300000
    return
  }

  try {
    semanticState.syncingSkills = true
    const skillRows = skills.map((item, idx) => ({ ...item, vector: vectors[idx] }))
    const toolRows = tools.map((item, idx) => ({ ...item, vector: vectors[skills.length + idx] }))

    const tSkills = await createOrOverwriteTable('skills', skillRows)
    const tTools = await createOrOverwriteTable('tools', toolRows)

    if (tSkills) {
      semanticState.tableSkills = tSkills
      semanticState.skillsSnapshotHash = skillsDigest
    }
    if (tTools) {
      semanticState.tableTools = tTools
      semanticState.toolsSnapshotHash = toolsDigest
    }

    semanticState.lastSkillSyncAt = now
  } catch (err) {
    warn(`[semantic] Skill sync error: ${err.message}`)
    semanticState.lastSkillSyncAt = now + 300000
  } finally {
    semanticState.syncingSkills = false
  }
}

async function syncNoteIndex(force = false) {
  if ((store.settings.ai_tier || 'pro') !== 'ultra') return
  if (semanticState.syncingNotes) return
  const now = Date.now()
  if (!force && now - semanticState.lastNotesSyncAt < SEMANTIC_SYNC_INTERVAL_MS) return

  ensureDir(NOTES_DIR)
  const records = listNoteRecords()
  const digest = sha1(JSON.stringify(records.map((r) => [r.id, r.path])))

  if (!force && semanticState.notesSnapshotHash === digest && semanticState.tableNotes) {
    semanticState.lastNotesSyncAt = now
    return
  }

  debug('[semantic] Syncing notes index...')
  const allChunksToEmbed = []

  for (const note of records) {
    let content = ''
    try {
      content = fs.readFileSync(note.absPath, 'utf8')
    } catch {
      continue
    }
    const chunks = splitNoteChunks(content)
    chunks.forEach((chunkText, i) => {
      allChunksToEmbed.push({
        id: `${note.id}:${i}`,
        note_id: note.id,
        title: note.title,
        path: note.path,
        chunk_index: i,
        text: chunkText
      })
    })
  }

  // Parallel embedding with concurrency limit of 5
  const rows = await promiseAllStep(5, allChunksToEmbed, async (item) => {
    const vec = await embedText(item.text)
    if (!vec) return null
    return {
      ...item,
      hash: sha1(item.text),
      vector: vec
    }
  })

  try {
    semanticState.syncingNotes = true
    const validRows = rows.filter(Boolean)
    if (validRows.length === 0 && allChunksToEmbed.length > 0) {
      warn('[semantic] Note sync failed: no vectors generated')
      semanticState.lastNotesSyncAt = now + 300000
      return
    }

    const table = await createOrOverwriteTable('notes', validRows)
    if (table) {
      semanticState.tableNotes = table
      semanticState.notesSnapshotHash = digest
      semanticState.lastNotesSyncAt = now
    }
  } catch (err) {
    warn(`[semantic] Note sync error: ${err.message}`)
    semanticState.lastNotesSyncAt = now + 300000
  } finally {
    semanticState.syncingNotes = false
  }
}

async function runVectorNoteSearch(query, limit = 6) {
  if (!semanticState.tableNotes) return []
  const qVec = await embedText(query)
  if (!Array.isArray(qVec)) return []
  try {
    const rows = await semanticState.tableNotes.search(qVec).limit(limit).toArray()
    return rows.map((row) => ({
      note_id: row.note_id,
      chunk_id: row.id,
      title: row.title,
      path: row.path,
      text: row.text,
      score: Number.isFinite(row._distance) ? Math.max(0, 1 - row._distance) : 0,
      vector_score: Number.isFinite(row._distance) ? Math.max(0, 1 - row._distance) : 0,
      keyword_score: 0
    }))
  } catch (error) {
    semanticState.fallbackCount += 1
    semanticState.degraded = true
    semanticState.lastFallbackReason = error?.message || 'vector note search failed'
    return []
  }
}

function runLexicalNoteSearch(query, limit = 6) {
  return runLexicalNoteSearchShared(query, limit, DATA_DIR, NOTES_INDEX_FILE)
}

function mergeMemoryHits(vectorHits, lexicalHits, limit = 6) {
  const merged = new Map()

  for (const hit of vectorHits || []) {
    const key = hit.note_id
    const prev = merged.get(key)
    const score = (hit.vector_score || 0) * 0.7
    if (!prev || score > prev._score) {
      merged.set(key, { ...hit, _score: score, retrieval_type: 'vector' })
    }
  }

  for (const hit of lexicalHits || []) {
    const key = hit.note_id
    const prev = merged.get(key)
    const score = (hit.keyword_score || 0) * 0.3
    if (!prev) {
      merged.set(key, { ...hit, _score: score, retrieval_type: 'lexical' })
      continue
    }
    prev._score += score
    if (prev.retrieval_type === 'vector') prev.retrieval_type = 'hybrid'
    prev.keyword_score = Math.max(prev.keyword_score || 0, hit.keyword_score || 0)
  }

  return [...merged.values()]
    .sort((a, b) => (b._score || 0) - (a._score || 0))
    .slice(0, Math.max(1, limit))
    .map(({ _score, ...rest }) => rest)
}

function buildMemoryContextAndSources(hits) {
  if (!Array.isArray(hits) || !hits.length) return { memoryContext: null, memorySources: [] }
  const sections = []
  const memorySources = []
  for (const hit of hits.slice(0, 4)) {
    const txt = String(hit.text || '').trim()
    if (!txt) continue
    sections.push(
      `--- [TITULO DA NOTA: ${String(hit.title || 'Nota').toUpperCase()}] ---\n${txt}\n`
    )
    memorySources.push({
      url: `momai://note/${hit.note_id}`,
      title: `Nota: ${hit.title || 'Sem título'}`,
      snippet: txt.slice(0, 220),
      retrieval_type: hit.retrieval_type || 'lexical'
    })
  }
  const promptRegistry = getPromptRegistry()
  return {
    memoryContext:
      sections.length && promptRegistry && typeof promptRegistry.formatMemoryContext === 'function'
        ? promptRegistry.formatMemoryContext(sections.join('\n'))
        : sections.join('\n\n'),
    memorySources
  }
}

async function runSemanticMemoryRetrieval(query, limit = 6) {
  const startedAt = Date.now()
  semanticState.queryCount += 1

  const shouldEnable = (store.settings.ai_tier || 'pro') === 'ultra'
  semanticState.enabled = shouldEnable
  if (!shouldEnable) {
    return { hits: [], memoryContext: null, memorySources: [] }
  }

  syncSkillAndToolIndexes(false).catch((err) => debug('[background]', err?.message || err))
  syncNoteIndex(false).catch((err) => debug('[background]', err?.message || err))

  const [vectorHits, lexicalHits] = await Promise.all([
    runVectorNoteSearch(query, limit),
    Promise.resolve(runLexicalNoteSearch(query, limit))
  ])
  const mergedHits = mergeMemoryHits(vectorHits, lexicalHits, limit)
  const { memoryContext, memorySources } = buildMemoryContextAndSources(mergedHits)
  const { rollingPush } = require('./embedding-manager')
  rollingPush(semanticState.latency.retrievalMs, Date.now() - startedAt)
  for (const arr of [
    semanticState.latency.embeddingMs,
    semanticState.latency.retrievalMs,
    semanticState.latency.toolExecMs
  ]) {
    while (arr.length > MAX_LATENCY_HISTORY) arr.shift()
  }
  return {
    hits: mergedHits,
    memoryContext,
    memorySources
  }
}

async function getTop5SkillsSemantic(query) {
  const text = String(query || '').trim()
  const { getEnabledSkills } = require('./skill-orchestrator')
  const enabledSkills = getEnabledSkills()
  if (enabledSkills.length === 0) return []

  if (!text || !semanticState.ready || enabledSkills.length <= 5) {
    return enabledSkills.slice(0, 5).map((s) => ({ id: s.id, score: 0.5 }))
  }

  if (semanticState.tableSkills) {
    try {
      const qVec = await embedText(text)
      if (Array.isArray(qVec)) {
        const rows = await semanticState.tableSkills.search(qVec).limit(5).toArray()
        if (rows.length) {
          const results = []
          for (const row of rows) {
            const skillRegistry = getSkillRegistry()
            const candidate =
              skillRegistry && typeof skillRegistry.getById === 'function'
                ? skillRegistry.getById(row.id)
                : null
            const score = Number.isFinite(row._distance) ? Math.max(0, 1 - row._distance) : 0
            if (candidate && require('./skill-orchestrator').isSkillEnabledByStore(candidate)) {
              results.push({ id: candidate.id, score })
            }
          }
          if (results.length > 0) return results
        }
      }
    } catch (e) {
      debug('[semantic] getTop5SkillsSemantic error:', e?.message || e)
    }
  }

  return enabledSkills.slice(0, 5).map((s) => ({ id: s.id, score: 0 }))
}

module.exports = {
  semanticState,
  loadLanceModule,
  ensureVectorDb,
  createOrOverwriteTable,
  syncSkillAndToolIndexes,
  syncNoteIndex,
  runVectorNoteSearch,
  runLexicalNoteSearch,
  mergeMemoryHits,
  buildMemoryContextAndSources,
  splitNoteChunks,
  listNoteRecords,
  runSemanticMemoryRetrieval,
  getTop5SkillsSemantic
}
