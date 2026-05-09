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
  const absPath = path.join(DATA_DIR, relPath)
  fs.writeFileSync(absPath, String(content || '').trim() || 'Nota vazia.', 'utf8')

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
