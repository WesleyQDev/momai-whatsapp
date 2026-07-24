const fs = require('node:fs')
const path = require('node:path')

const ALLOWED_FILENAMES = ['usuario', 'persona', 'conhecimento']
const MAX_FILE_CHARS = 2200
const MAX_ENTRY_CHARS = 1375
const SEPARATOR = '\n§\n'

function defaultFor(name, userName) {
  if (name === 'usuario') {
    const profileName = String(userName || '').trim() || 'User'
    return `## User Profile
- Name: ${profileName}

## Preferences
- 

## Facts
- `
  }
  if (name === 'persona') {
    return `You are MomAI, a warm and helpful assistant created by Wesley Developer Studios.
When someone tells you something about themselves, save it with the memory function — do not ask, just save.
You use your skills naturally: search, weather, reminders, apps.
Be concise, be warm, be useful.`
  }
  return `## Facts & Knowledge
-`
}

function createMemoryFS({ memoriesDir, userName }) {
  function filePathFor(name) {
    if (!ALLOWED_FILENAMES.includes(name)) {
      throw new Error(`Invalid filename: ${name}. Allowed: ${ALLOWED_FILENAMES.join(', ')}`)
    }
    return path.join(memoriesDir, `${name}.md`)
  }

  function parseContent(content) {
    const entries = content
      .split(SEPARATOR)
      .map((e) => e.trim())
      .filter(Boolean)
    return { entries }
  }

  function ensureDir() {
    if (!fs.existsSync(memoriesDir)) {
      fs.mkdirSync(memoriesDir, { recursive: true })
    }
  }

  function seedIfMissing(fp, name) {
    if (fs.existsSync(fp)) return false
    const def = defaultFor(name, userName)
    if (!def) return false
    const tmp = fp + '.tmp'
    fs.writeFileSync(tmp, def, 'utf8')
    fs.renameSync(tmp, fp)
    return true
  }

  function readMemoryFile(name) {
    const fp = filePathFor(name)
    ensureDir()
    seedIfMissing(fp, name)
    if (!fs.existsSync(fp)) {
      return { name, content: '', entries: [] }
    }
    const content = fs.readFileSync(fp, 'utf8')
    const { entries } = parseContent(content)
    return { name, content, entries }
  }

  function writeMemoryFile(name, content) {
    const clean = String(content || '').replace(/\0/g, '').trim()
    if (clean.length > MAX_FILE_CHARS) {
      throw new Error(`Content exceeds ${MAX_FILE_CHARS} characters`)
    }
    const fp = filePathFor(name)
    ensureDir()
    const tmp = fp + '.tmp'
    fs.writeFileSync(tmp, clean, 'utf8')
    fs.renameSync(tmp, fp)
    const { entries } = parseContent(clean)
    return { name, content: clean, entries }
  }

  function addMemoryEntry(name, content) {
    if (name === 'persona') {
      throw new Error('persona is read-only for the AI')
    }
    const clean = String(content || '').replace(/\0/g, '').trim()
    if (clean.length > MAX_ENTRY_CHARS) {
      throw new Error(`Entry exceeds ${MAX_ENTRY_CHARS} characters`)
    }
    const current = readMemoryFile(name)
    if (!current.content) return writeMemoryFile(name, clean)

    // Try to insert into the appropriate section (## Preferences or ## Facts)
    const sections = ['## Preferences', '## Facts']
    let inserted = false
    let newContent = current.content

    for (const section of sections) {
      if (newContent.includes(section)) {
        const afterSection = newContent.split(section)
        if (afterSection.length >= 2) {
          const sectionBody = afterSection[1].split('\n## ')[0] // content until next section
          const hasEmptyBullet = sectionBody.includes('\n- \n') || sectionBody.endsWith('\n- ')
          if (hasEmptyBullet) {
            // Replace first empty bullet with the new fact
            newContent = newContent.replace('- \n', `- ${clean}\n`)
            inserted = true
            break
          }
        }
      }
    }

    if (!inserted) {
      // Fallback: add under first matching section or just append
      newContent = current.content.replace(/\n- \n/, `\n- ${clean}\n`)
      if (newContent === current.content) {
        newContent = current.content + SEPARATOR + clean
      }
    }

    return writeMemoryFile(name, newContent)
  }

  function deleteMemoryEntry(name, content) {
    if (name === 'persona') {
      throw new Error('persona is read-only for the AI')
    }
    const current = readMemoryFile(name)
    const remaining = current.entries.filter(
      (e) => !e.toLowerCase().includes(String(content || '').toLowerCase())
    )
    return writeMemoryFile(name, remaining.join(SEPARATOR))
  }

  function listMemoryFiles() {
    return ALLOWED_FILENAMES.map((name) => readMemoryFile(name))
  }

  return {
    readMemoryFile,
    writeMemoryFile,
    addMemoryEntry,
    deleteMemoryEntry,
    updateMemoryFile: writeMemoryFile,
    listMemoryFiles
  }
}

module.exports = { createMemoryFS, ALLOWED_FILENAMES }
