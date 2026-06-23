const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const {
  ensureDir,
  readSafeJson,
  isoNow,
  DATA_DIR,
  NOTES_DIR,
  NOTES_INDEX_FILE
} = require('../config/constants')

// U002 (privacy plan): the sidecar has no access to the OS keychain
// (Electron's safeStorage), so it cannot encrypt notes directly. Instead
// it writes plain .md files to a staging subdirectory under the notes
// folder. The main process picks them up on next startup, encrypts them
// via safeStorage, and replaces the index entry with the .md.enc path.
const PENDING_SUBDIR = '.pending'

function ensureNotesIndexExists() {
  ensureDir(NOTES_DIR)
  if (!fs.existsSync(NOTES_INDEX_FILE)) {
    fs.writeFileSync(NOTES_INDEX_FILE, JSON.stringify([], null, 2), 'utf8')
  }
}

function saveMemoryNoteFromContent(content) {
  ensureNotesIndexExists()
  const titleLine =
    String(content || '')
      .trim()
      .split('\n')[0] || 'Nota'
  const title = titleLine.replace(/^#+\s*/, '').slice(0, 80) || 'Nota'
  const id = crypto.randomUUID()
  const relPath = `notes/${id}.md`
  const pendingAbs = path.join(NOTES_DIR, PENDING_SUBDIR, `${id}.md`)
  ensureDir(path.dirname(pendingAbs))
  fs.writeFileSync(pendingAbs, String(content || '').trim() || 'Nota vazia.', 'utf8')

  const index = readSafeJson(NOTES_INDEX_FILE, [])
  index.push({
    id,
    title,
    path: relPath,
    source: 'local',
    created_at: isoNow(),
    updated_at: isoNow(),
    preview: String(content || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 220)
  })
  fs.writeFileSync(NOTES_INDEX_FILE, JSON.stringify(index, null, 2), 'utf8')
  return { id, title, path: relPath }
}

function setupNoteManager() {
  return {
    ensureNotesIndexExists,
    saveMemoryNoteFromContent
  }
}

module.exports = {
  setupNoteManager,
  ensureNotesIndexExists,
  saveMemoryNoteFromContent
}
