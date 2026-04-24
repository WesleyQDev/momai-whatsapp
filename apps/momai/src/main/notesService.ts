import { app, shell } from 'electron'
import { randomUUID } from 'crypto'
import { dirname, extname, join, relative } from 'path'
import { mkdir, readFile, readdir, rename, rm, stat, unlink, writeFile } from 'fs/promises'
import { existsSync } from 'fs'

const NOTES_DIR_NAME = 'notes'
const INDEX_FILE_NAME = '.index.json'
const MAX_PREVIEW_LENGTH = 220

export interface NoteSummary {
  id: string
  title: string
  path: string
  source: string
  created_at?: string | null
  updated_at?: string | null
  preview?: string
}

export interface NoteDetail extends NoteSummary {
  content: string
}

export interface MemorySearchResult {
  note_id: string
  chunk_id: string
  title: string
  path: string
  text: string
  score: number
  keyword_score?: number
  vector_score?: number
}

type NoteIndexRecord = NoteSummary

const normalizeSlashes = (value: string) => value.replace(/\\+/g, '/')

const nowIso = () => new Date().toISOString()

const getDataDir = () => join(app.getPath('userData'), 'data')

const getNotesDir = () => join(getDataDir(), NOTES_DIR_NAME)

const getIndexPath = () => join(getNotesDir(), INDEX_FILE_NAME)

const sanitizeFolderPath = (value: string | null | undefined): string => {
  const normalized = normalizeSlashes((value || '').trim())
    .replace(/^notes\//i, '')
    .replace(/^\/+|\/+$/g, '')

  if (!normalized) return ''

  const safeSegments = normalized
    .split('/')
    .map((segment) => segment.trim())
    .filter((segment) => segment && segment !== '.' && segment !== '..')

  return safeSegments.join('/')
}

const toNoteRelativePath = (folder: string, fileName: string) =>
  folder ? `notes/${folder}/${fileName}` : `notes/${fileName}`

const extractTitleFromContent = (content: string, fallback: string) => {
  const heading = content.match(/^\s*#\s+(.+)$/m)?.[1]?.trim()
  return heading || fallback
}

const makePreview = (content: string) =>
  content.replace(/\s+/g, ' ').trim().slice(0, MAX_PREVIEW_LENGTH)

async function ensureNotesDir(): Promise<void> {
  await mkdir(getNotesDir(), { recursive: true })
}

async function readIndex(): Promise<NoteIndexRecord[]> {
  await ensureNotesDir()
  const indexPath = getIndexPath()

  if (!existsSync(indexPath)) {
    const rebuilt = await rebuildIndexFromFilesystem()
    await writeIndex(rebuilt)
    return rebuilt
  }

  try {
    const raw = await readFile(indexPath, 'utf8')
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) throw new Error('Invalid index format')
    return parsed
  } catch {
    const rebuilt = await rebuildIndexFromFilesystem()
    await writeIndex(rebuilt)
    return rebuilt
  }
}

async function writeIndex(items: NoteIndexRecord[]): Promise<void> {
  await ensureNotesDir()
  await writeFile(getIndexPath(), JSON.stringify(items, null, 2), 'utf8')
}

async function walkMarkdownFiles(dirPath: string): Promise<string[]> {
  const entries = await readdir(dirPath, { withFileTypes: true })
  const files: string[] = []

  for (const entry of entries) {
    if (entry.name === INDEX_FILE_NAME) continue
    const fullPath = join(dirPath, entry.name)
    if (entry.isDirectory()) {
      const nested = await walkMarkdownFiles(fullPath)
      files.push(...nested)
      continue
    }

    if (entry.isFile() && extname(entry.name).toLowerCase() === '.md') {
      files.push(fullPath)
    }
  }

  return files
}

async function rebuildIndexFromFilesystem(): Promise<NoteIndexRecord[]> {
  await ensureNotesDir()
  const files = await walkMarkdownFiles(getNotesDir())
  const records: NoteIndexRecord[] = []

  for (const absolutePath of files) {
    const fileStat = await stat(absolutePath)
    const fileContent = await readFile(absolutePath, 'utf8')
    const fileName = absolutePath.split(/[\\/]/).pop() || ''
    const id = fileName.replace(/\.md$/i, '')
    const dataRelative = normalizeSlashes(relative(getDataDir(), absolutePath))
    const fallbackTitle = fileName.replace(/\.md$/i, '')

    records.push({
      id,
      title: extractTitleFromContent(fileContent, fallbackTitle),
      path: dataRelative,
      source: 'local',
      created_at: fileStat.birthtime?.toISOString?.() || fileStat.ctime.toISOString(),
      updated_at: fileStat.mtime.toISOString(),
      preview: makePreview(fileContent)
    })
  }

  records.sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''))
  return records
}

const getNoteAbsolutePath = (record: Pick<NoteSummary, 'path'>) => join(getDataDir(), record.path)

export async function listNotes(): Promise<NoteSummary[]> {
  const index = await readIndex()
  return [...index].sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''))
}

export async function getNote(noteId: string): Promise<NoteDetail | null> {
  const index = await readIndex()
  const found = index.find((item) => item.id === noteId)
  if (!found) return null

  const content = await readFile(getNoteAbsolutePath(found), 'utf8')
  return { ...found, content }
}

export async function createNote(
  title: string,
  content: string,
  path?: string
): Promise<NoteDetail> {
  const folder = sanitizeFolderPath(path)
  const noteId = randomUUID()
  const fileName = `${noteId}.md`
  const relativePath = toNoteRelativePath(folder, fileName)
  const absolutePath = join(getDataDir(), relativePath)

  await mkdir(dirname(absolutePath), { recursive: true })
  await writeFile(absolutePath, content || '', 'utf8')

  const createdAt = nowIso()
  const record: NoteIndexRecord = {
    id: noteId,
    title: (title || '').trim() || 'New note',
    path: normalizeSlashes(relativePath),
    source: 'local',
    created_at: createdAt,
    updated_at: createdAt,
    preview: makePreview(content || '')
  }

  const index = await readIndex()
  index.push(record)
  await writeIndex(index)

  return { ...record, content: content || '' }
}

export async function updateNote(
  noteId: string,
  payload: { title?: string; content?: string; path?: string }
): Promise<NoteDetail | null> {
  const index = await readIndex()
  const noteIdx = index.findIndex((item) => item.id === noteId)
  if (noteIdx === -1) return null

  const current = index[noteIdx]
  const currentAbs = getNoteAbsolutePath(current)
  const currentContent = await readFile(currentAbs, 'utf8')

  let nextPath = current.path
  if (payload.path !== undefined) {
    const folder = sanitizeFolderPath(payload.path)
    const targetRel = toNoteRelativePath(folder, `${noteId}.md`)
    if (normalizeSlashes(targetRel) !== normalizeSlashes(current.path)) {
      const targetAbs = join(getDataDir(), targetRel)
      await mkdir(dirname(targetAbs), { recursive: true })
      await rename(currentAbs, targetAbs)
      nextPath = normalizeSlashes(targetRel)
    }
  }

  const nextAbs = join(getDataDir(), nextPath)
  const nextContent = payload.content !== undefined ? payload.content : currentContent

  if (payload.content !== undefined) {
    await writeFile(nextAbs, nextContent, 'utf8')
  }

  const updatedAt = nowIso()
  const updated: NoteIndexRecord = {
    ...current,
    title: payload.title !== undefined ? payload.title.trim() || current.title : current.title,
    path: nextPath,
    updated_at: updatedAt,
    preview: makePreview(nextContent)
  }

  index[noteIdx] = updated
  await writeIndex(index)

  return { ...updated, content: nextContent }
}

export async function deleteNote(noteId: string): Promise<boolean> {
  const index = await readIndex()
  const found = index.find((item) => item.id === noteId)
  if (!found) return false

  try {
    await unlink(getNoteAbsolutePath(found))
  } catch {
    // Best effort: keep going to clean index
  }

  const next = index.filter((item) => item.id !== noteId)
  await writeIndex(next)
  return true
}

export async function listFolders(): Promise<string[]> {
  await ensureNotesDir()
  const folders = new Set<string>()

  const walk = async (dirPath: string, relPrefix: string) => {
    const entries = await readdir(dirPath, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const nextRel = relPrefix ? `${relPrefix}/${entry.name}` : entry.name
      folders.add(nextRel)
      await walk(join(dirPath, entry.name), nextRel)
    }
  }

  await walk(getNotesDir(), '')
  return Array.from(folders).sort()
}

export async function createFolder(pathValue: string): Promise<void> {
  const folder = sanitizeFolderPath(pathValue)
  if (!folder) return
  await mkdir(join(getNotesDir(), folder), { recursive: true })
}

export async function renameFolder(oldPath: string, newPath: string): Promise<boolean> {
  const oldFolder = sanitizeFolderPath(oldPath)
  const newFolder = sanitizeFolderPath(newPath)
  if (!oldFolder || !newFolder) return false

  const oldAbs = join(getNotesDir(), oldFolder)
  const newAbs = join(getNotesDir(), newFolder)

  if (!existsSync(oldAbs)) return false
  await mkdir(dirname(newAbs), { recursive: true })
  await rename(oldAbs, newAbs)

  const index = await readIndex()
  const oldPrefix = `notes/${oldFolder}/`
  const nextPrefix = `notes/${newFolder}/`
  const updated = index.map((item) => {
    if (!item.path.startsWith(oldPrefix)) return item
    return {
      ...item,
      path: `${nextPrefix}${item.path.slice(oldPrefix.length)}`,
      updated_at: nowIso()
    }
  })

  await writeIndex(updated)
  return true
}

export async function deleteFolder(pathValue: string): Promise<boolean> {
  const folder = sanitizeFolderPath(pathValue)
  if (!folder) return false

  const abs = join(getNotesDir(), folder)
  if (!existsSync(abs)) return false

  await rm(abs, { recursive: true, force: true })

  const prefix = `notes/${folder}/`
  const index = await readIndex()
  const updated = index.filter((item) => !item.path.startsWith(prefix))
  await writeIndex(updated)
  return true
}

export async function importNotes(files: { name: string; content: string }[]): Promise<void> {
  for (const file of files) {
    const rawName = (file.name || '').trim() || 'Imported note'
    const baseName = rawName.replace(/\.md$/i, '').trim()
    const title = extractTitleFromContent(file.content || '', baseName || 'Imported note')
    await createNote(title, file.content || '')
  }
}

export async function openNoteFolder(noteId: string): Promise<boolean> {
  const index = await readIndex()
  const found = index.find((item) => item.id === noteId)
  if (!found) return false
  const result = await shell.openPath(dirname(getNoteAbsolutePath(found)))
  return !result
}

const scoreText = (source: string, needle: string): number => {
  if (!needle) return 0
  const lower = source.toLowerCase()
  const term = needle.toLowerCase()
  let idx = 0
  let count = 0
  while (idx >= 0) {
    idx = lower.indexOf(term, idx)
    if (idx >= 0) {
      count += 1
      idx += term.length
    }
  }
  return count
}

const buildSnippet = (content: string, query: string): string => {
  const compact = content.replace(/\s+/g, ' ').trim()
  if (!compact) return ''
  const q = query.toLowerCase()
  const foundIdx = compact.toLowerCase().indexOf(q)
  if (foundIdx < 0) return compact.slice(0, 240)
  const start = Math.max(0, foundIdx - 80)
  const end = Math.min(compact.length, foundIdx + Math.max(80, query.length + 60))
  return compact.slice(start, end)
}

export async function searchNotes(query: string, limit = 6): Promise<MemorySearchResult[]> {
  const term = (query || '').trim()
  if (!term) return []

  const index = await readIndex()
  const results: MemorySearchResult[] = []

  for (const note of index) {
    const abs = getNoteAbsolutePath(note)
    let content = ''
    try {
      content = await readFile(abs, 'utf8')
    } catch {
      continue
    }

    const titleScore = scoreText(note.title, term)
    const contentScore = scoreText(content, term)
    const score = titleScore * 3 + contentScore
    if (score <= 0) continue

    results.push({
      note_id: note.id,
      chunk_id: `${note.id}:0`,
      title: note.title,
      path: note.path,
      text: buildSnippet(content, term),
      score,
      keyword_score: score,
      vector_score: 0
    })
  }

  return results.sort((a, b) => b.score - a.score).slice(0, Math.max(1, limit))
}
