import { app, shell } from 'electron'
import { randomUUID } from 'crypto'
import { dirname, extname, join, relative } from 'path'
import { mkdir, readFile, readdir, rename, rm, stat, unlink, writeFile } from 'fs/promises'
import { existsSync, mkdirSync, writeFileSync } from 'fs'

import { runLexicalNoteSearch as runLexicalNoteSearchShared } from './lexical-search'

const NOTES_DIR_NAME = 'notes'
const INDEX_FILE_NAME = '.index.json'
const MAX_PREVIEW_LENGTH = 220
const INDEX_DEBOUNCE_MS = 1500

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

function ensureNotesDirSync(): void {
  if (!existsSync(getNotesDir())) {
    mkdirSync(getNotesDir(), { recursive: true })
  }
}

let indexCache: NoteIndexRecord[] | null = null
let indexLoadPromise: Promise<NoteIndexRecord[]> | null = null
let indexWriteTimer: ReturnType<typeof setTimeout> | null = null
let indexWritePending: NoteIndexRecord[] | null = null

async function readIndexFromDisk(): Promise<NoteIndexRecord[]> {
  await ensureNotesDir()
  const indexPath = getIndexPath()

  if (!existsSync(indexPath)) {
    const rebuilt = await rebuildIndexFromFilesystem()
    await writeIndexToDisk(rebuilt)
    return rebuilt
  }

  try {
    const raw = await readFile(indexPath, 'utf8')
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) throw new Error('Invalid index format')
    return parsed
  } catch {
    const rebuilt = await rebuildIndexFromFilesystem()
    await writeIndexToDisk(rebuilt)
    return rebuilt
  }
}

async function writeIndexToDisk(items: NoteIndexRecord[]): Promise<void> {
  await ensureNotesDir()
  await writeFile(getIndexPath(), JSON.stringify(items, null, 2), 'utf8')
}

function writeIndexToDiskSync(items: NoteIndexRecord[]): void {
  ensureNotesDirSync()
  writeFileSync(getIndexPath(), JSON.stringify(items, null, 2), 'utf8')
}

/**
 * Load the notes index into the in-memory cache. Call this at app startup
 * (optional — operations will lazy-load on first access if not pre-loaded).
 */
export async function loadIndexCache(): Promise<void> {
  if (indexCache !== null) return
  if (!indexLoadPromise) {
    indexLoadPromise = readIndexFromDisk().then((items) => {
      indexCache = items
      return items
    })
  }
  await indexLoadPromise
}

async function getIndex(): Promise<NoteIndexRecord[]> {
  if (indexCache === null) {
    await loadIndexCache()
  }
  return JSON.parse(JSON.stringify(indexCache)) as NoteIndexRecord[]
}

function scheduleIndexWrite(items: NoteIndexRecord[]): void {
  indexCache = items
  indexWritePending = items
  if (indexWriteTimer) {
    clearTimeout(indexWriteTimer)
  }
  indexWriteTimer = setTimeout(() => {
    indexWriteTimer = null
    const pending = indexWritePending
    indexWritePending = null
    if (pending) {
      void writeIndexToDisk(pending).catch(() => {
        // Best-effort: if the debounced write fails, the in-memory cache
        // still holds the latest value so subsequent operations work.
      })
    }
  }, INDEX_DEBOUNCE_MS)
}

/**
 * Flush any pending debounced index write to disk. Call this on app
 * shutdown to make sure the latest state is persisted.
 */
export async function flushIndexCache(): Promise<void> {
  if (indexWriteTimer) {
    clearTimeout(indexWriteTimer)
    indexWriteTimer = null
  }
  if (indexWritePending !== null) {
    const pending = indexWritePending
    indexWritePending = null
    await writeIndexToDisk(pending)
  }
}

function flushIndexCacheSync(): void {
  if (indexWriteTimer) {
    clearTimeout(indexWriteTimer)
    indexWriteTimer = null
  }
  if (indexWritePending !== null) {
    try {
      writeIndexToDiskSync(indexWritePending)
      indexWritePending = null
    } catch {
      // Best-effort sync flush during process exit.
    }
  }
}

process.on('exit', flushIndexCacheSync)

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
  const index = await getIndex()
  return [...index].sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''))
}

export async function getNote(noteId: string): Promise<NoteDetail | null> {
  const index = await getIndex()
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

  const index = await getIndex()
  index.push(record)
  scheduleIndexWrite(index)

  return { ...record, content: content || '' }
}

export async function updateNote(
  noteId: string,
  payload: { title?: string; content?: string; path?: string }
): Promise<NoteDetail | null> {
  const index = await getIndex()
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
  scheduleIndexWrite(index)

  return { ...updated, content: nextContent }
}

export async function deleteNote(noteId: string): Promise<boolean> {
  const index = await getIndex()
  const found = index.find((item) => item.id === noteId)
  if (!found) return false

  try {
    await unlink(getNoteAbsolutePath(found))
  } catch {
    // Best effort: keep going to clean index
  }

  const next = index.filter((item) => item.id !== noteId)
  scheduleIndexWrite(next)
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

  const index = await getIndex()
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

  scheduleIndexWrite(updated)
  return true
}

export async function deleteFolder(pathValue: string): Promise<boolean> {
  const folder = sanitizeFolderPath(pathValue)
  if (!folder) return false

  const abs = join(getNotesDir(), folder)
  if (!existsSync(abs)) return false

  await rm(abs, { recursive: true, force: true })

  const prefix = `notes/${folder}/`
  const index = await getIndex()
  const updated = index.filter((item) => !item.path.startsWith(prefix))
  scheduleIndexWrite(updated)
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
  const index = await getIndex()
  const found = index.find((item) => item.id === noteId)
  if (!found) return false
  const result = await shell.openPath(dirname(getNoteAbsolutePath(found)))
  return !result
}

export async function searchNotes(query: string, limit = 6): Promise<MemorySearchResult[]> {
  const term = (query || '').trim()
  if (!term) return []

  const dataDir = getDataDir()
  const notesIndexFile = getIndexPath()

  // Use shared lexical search module
  return runLexicalNoteSearchShared(term, limit, dataDir, notesIndexFile)
}

export { sanitizeFolderPath, extractTitleFromContent, makePreview, normalizeSlashes }
