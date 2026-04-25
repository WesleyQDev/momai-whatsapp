const fs = require('node:fs')
const path = require('node:path')
const { exec } = require('node:child_process')

/* ──────────────────────────────────────────────
   Scan Cache
   ────────────────────────────────────────────── */

const SCAN_CACHE = { items: null, vocab: null, timestamp: 0 }
const CACHE_TTL_MS = 60_000

function getEnv(key) {
  return String(process.env[key] || '').trim()
}

/* ──────────────────────────────────────────────
   Accent Normalization
   ────────────────────────────────────────────── */

function normalizeAccents(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

/* ──────────────────────────────────────────────
   Windows Indexing (PowerToys/Raycast style)
   ────────────────────────────────────────────── */

function scanWindowsStartMenu() {
  const dirs = [
    path.join(getEnv('APPDATA'), 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
    path.join(getEnv('PROGRAMDATA'), 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
  ]
  const items = []
  const seen = new Set()

  for (const base of dirs) {
    if (!fs.existsSync(base)) continue
    try {
      walkDir(base, items, seen, 'Programa', 2)
    } catch {
      /* skip inaccessible */
    }
  }
  return items
}

function scanDesktop() {
  const items = []
  const seen = new Set()
  const dirs = [
    path.join(getEnv('USERPROFILE'), 'Desktop'),
    path.join(getEnv('PUBLIC'), 'Desktop'),
  ].filter(Boolean)

  for (const desktop of dirs) {
    if (!fs.existsSync(desktop)) continue
    try {
      walkDir(desktop, items, seen, 'Atalho', 2)
    } catch {
      /* skip */
    }
  }
  return items
}

function scanProgramFiles() {
  const dirs = [
    getEnv('LOCALAPPDATA') ? path.join(getEnv('LOCALAPPDATA'), 'Programs') : null,
    getEnv('PROGRAMFILES'),
    getEnv('PROGRAMFILES(X86)'),
  ].filter(Boolean)

  const items = []
  const seen = new Set()

  for (const base of dirs) {
    if (!fs.existsSync(base)) continue
    try {
      const entries = fs.readdirSync(base, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        const dirPath = path.join(base, entry.name)
        try {
          const subEntries = fs.readdirSync(dirPath, { withFileTypes: true })
          for (const sub of subEntries) {
            if (sub.name.endsWith('.exe') || sub.name.endsWith('.lnk')) {
              const fullPath = path.join(dirPath, sub.name)
              if (seen.has(fullPath)) continue
              seen.add(fullPath)
              const displayName = sub.name.replace(/\.(exe|lnk)$/i, '')
              items.push({
                name: displayName,
                path: fullPath,
                type: sub.name.endsWith('.lnk') ? 'Atalho' : 'Programa',
                category: inferCategory(displayName, dirPath),
              })
            }
          }
        } catch {
          /* skip inaccessible subdir */
        }
      }
    } catch {
      /* skip */
    }
  }
  return items
}

function scanAppDataPrograms() {
  const localAppData = getEnv('LOCALAPPDATA')
  if (!localAppData) return []

  const items = []
  const seen = new Set()
  const base = path.join(localAppData)

  try {
    const entries = fs.readdirSync(base, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      if (entry.name.startsWith('.')) continue
      const dirPath = path.join(base, entry.name)
      try {
        const subEntries = fs.readdirSync(dirPath, { withFileTypes: true })
        for (const sub of subEntries) {
          if (!sub.isDirectory()) continue
          const exePath = path.join(dirPath, sub.name, `${sub.name}.exe`)
          if (seen.has(exePath)) continue
          if (fs.existsSync(exePath)) {
            seen.add(exePath)
            items.push({
              name: sub.name,
              path: exePath,
              type: 'Programa',
              category: inferCategory(sub.name, dirPath),
            })
          }
        }
      } catch {
        /* skip */
      }
    }
  } catch {
    /* skip */
  }
  return items
}

function scanPathExecutables() {
  const pathEnv = getEnv('PATH')
  if (!pathEnv) return []

  const items = []
  const seen = new Set()
  const dirs = pathEnv.split(';').filter(Boolean)

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.isFile() && /\.(exe|bat|cmd|ps1)$/i.test(entry.name)) {
          const name = entry.name.replace(/\.(exe|bat|cmd|ps1)$/i, '')
          const key = `path:${name}`
          if (seen.has(key)) continue
          seen.add(key)
          items.push({
            name,
            path: path.join(dir, entry.name),
            type: 'CLI',
            category: inferCategory(name, dir),
          })
        }
      }
    } catch {
      /* skip */
    }
  }
  return items
}

function scanCommonFolders() {
  const userDir = getEnv('USERPROFILE')
  if (!userDir) return []

  const items = []
  const seen = new Set()
  const common = [
    'Desktop', 'Downloads', 'Documents', 'Pictures', 'Music', 'Videos',
    'OneDrive', 'OneDrive - Personal',
  ]

  for (const folder of common) {
    const fullPath = path.join(userDir, folder)
    if (fs.existsSync(fullPath) && !seen.has(fullPath)) {
      seen.add(fullPath)
      items.push({
        name: folder,
        path: fullPath,
        type: 'Pasta',
        category: 'Sistema',
      })
    }
  }
  return items
}

function scanUserSubfolders() {
  const userDir = getEnv('USERPROFILE')
  if (!userDir) return []

  const items = []
  const seen = new Set()

  try {
    const entries = fs.readdirSync(userDir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      if (entry.name.startsWith('.') || entry.name === 'AppData') continue
      const fullPath = path.join(userDir, entry.name)
      if (seen.has(fullPath)) continue
      seen.add(fullPath)
      items.push({
        name: entry.name,
        path: fullPath,
        type: 'Pasta',
        category: inferCategory(entry.name, userDir),
      })
    }
  } catch {
    /* skip */
  }
  return items
}

function scanUserDocuments() {
  const docsDir = path.join(getEnv('USERPROFILE'), 'Documents')
  if (!fs.existsSync(docsDir)) return []

  const items = []
  const seen = new Set()

  try {
    const entries = fs.readdirSync(docsDir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(docsDir, entry.name)
      if (seen.has(fullPath)) continue

      if (entry.isDirectory()) {
        seen.add(fullPath)
        items.push({
          name: entry.name,
          path: fullPath,
          type: 'Pasta',
          category: 'Documentos',
        })
      } else if (entry.isFile() && /\.(docx?|xlsx?|pptx?|pdf|txt|md|csv|json|xml)$/i.test(entry.name)) {
        seen.add(fullPath)
        const displayName = entry.name.replace(/\.[^.]+$/, '')
        items.push({
          name: displayName,
          path: fullPath,
          type: 'Arquivo',
          category: inferCategory(displayName, docsDir),
        })
      }
    }
  } catch {
    /* skip */
  }
  return items
}

function scanUserDownloads() {
  const dlDir = path.join(getEnv('USERPROFILE'), 'Downloads')
  if (!fs.existsSync(dlDir)) return []

  const items = []
  const seen = new Set()

  try {
    const entries = fs.readdirSync(dlDir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dlDir, entry.name)
      if (seen.has(fullPath)) continue

      if (entry.isDirectory()) {
        seen.add(fullPath)
        items.push({
          name: entry.name,
          path: fullPath,
          type: 'Pasta',
          category: 'Downloads',
        })
      } else if (entry.isFile() && /\.(zip|rar|7z|exe|msi|dmg|pkg|iso|img|pdf|docx?|xlsx?|jpg|jpeg|png|gif|mp4|mkv|mp3|wav)$/i.test(entry.name)) {
        seen.add(fullPath)
        const displayName = entry.name.replace(/\.[^.]+$/, '')
        items.push({
          name: displayName,
          path: fullPath,
          type: 'Arquivo',
          category: inferCategory(displayName, dlDir),
        })
      }
    }
  } catch {
    /* skip */
  }
  return items
}

function scanUserDesktopFiles() {
  const deskDir = path.join(getEnv('USERPROFILE'), 'Desktop')
  if (!fs.existsSync(deskDir)) return []

  const items = []
  const seen = new Set()

  try {
    const entries = fs.readdirSync(deskDir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(deskDir, entry.name)
      if (seen.has(fullPath)) continue

      if (entry.isDirectory()) {
        seen.add(fullPath)
        items.push({
          name: entry.name,
          path: fullPath,
          type: 'Pasta',
          category: 'Desktop',
        })
      } else if (entry.isFile() && /\.(docx?|xlsx?|pptx?|pdf|txt|md|csv|jpg|jpeg|png|gif|mp4|zip|rar)$/i.test(entry.name)) {
        seen.add(fullPath)
        const displayName = entry.name.replace(/\.[^.]+$/, '')
        items.push({
          name: displayName,
          path: fullPath,
          type: 'Arquivo',
          category: 'Desktop',
        })
      }
    }
  } catch {
    /* skip */
  }
  return items
}

function walkDir(dirPath, items, seen, defaultType, maxDepth) {
  if (maxDepth <= 0) return

  let entries
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true })
  } catch {
    return
  }

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name)
    if (seen.has(fullPath)) continue

    if (entry.isDirectory()) {
      seen.add(fullPath)
      if (!entry.name.startsWith('.')) {
        walkDir(fullPath, items, seen, defaultType, maxDepth - 1)
      }
      continue
    }

    if (entry.name.endsWith('.exe') || entry.name.endsWith('.lnk') || entry.name.endsWith('.bat') || entry.name.endsWith('.cmd')) {
      seen.add(fullPath)
      const displayName = entry.name.replace(/\.(exe|lnk|bat|cmd)$/i, '')
      items.push({
        name: displayName,
        path: fullPath,
        type: entry.name.endsWith('.lnk') ? 'Atalho' : 'Programa',
        category: inferCategory(displayName, dirPath),
      })
    }
  }
}

/* ──────────────────────────────────────────────
   Category Inference
   ────────────────────────────────────────────── */

function inferCategory(name, dirPath) {
  const lower = String(name || '').toLowerCase()
  const dirLower = String(dirPath || '').toLowerCase()

  if (lower.includes('chrome') || lower.includes('firefox') || lower.includes('edge') || lower.includes('brave') || lower.includes('opera') || lower.includes('browser')) return 'Navegador'
  if (lower.includes('code') || lower.includes('studio') || lower.includes('ide') || lower.includes('vscode') || lower.includes('visual studio') || lower.includes('notepad') || lower.includes('sublime') || lower.includes('webstorm') || lower.includes('cursor')) return 'Desenvolvimento'
  if (lower.includes('word') || lower.includes('excel') || lower.includes('powerpoint') || lower.includes('outlook') || lower.includes('office') || lower.includes('onenote') || lower.includes('access')) return 'Escritorio'
  if (lower.includes('spotify') || lower.includes('music') || lower.includes('media') || lower.includes('vlc') || lower.includes('player') || lower.includes('video')) return 'Midia'
  if (lower.includes('discord') || lower.includes('slack') || lower.includes('teams') || lower.includes('zoom') || lower.includes('whatsapp') || lower.includes('telegram') || lower.includes('signal')) return 'Comunicacao'
  if (dirLower.includes('accessories') || dirLower.includes('acessórios') || dirLower.includes('ferramentas')) return 'Ferramentas'
  if (dirLower.includes('games') || dirLower.includes('jogos') || dirLower.includes('game') || lower.includes('steam') || lower.includes('epic') || lower.includes('unity') || lower.includes('unreal')) return 'Jogos'
  if (dirLower.includes('adobe') || lower.includes('photoshop') || lower.includes('illustrator') || lower.includes('premiere') || lower.includes('after effects') || lower.includes('design') || lower.includes('figma')) return 'Design'
  if (dirLower.includes('system32') || dirLower.includes('system') || dirLower.includes('windows') || lower.includes('calc') || lower.includes('cmd') || lower.includes('powershell') || lower.includes('terminal') || lower.includes('control')) return 'Sistema'
  if (lower.includes('explorer') || lower.includes('file manager') || lower.includes('files')) return 'Arquivos'
  if (dirLower.includes('documents') || dirLower.includes('documentos')) return 'Documentos'
  if (dirLower.includes('downloads')) return 'Downloads'
  if (dirLower.includes('desktop')) return 'Desktop'

  return 'Outros'
}

/* ──────────────────────────────────────────────
   Build Full Index
   ────────────────────────────────────────────── */

function buildFullIndex() {
  const startMenu = scanWindowsStartMenu()
  const desktop = scanDesktop()
  const programFiles = scanProgramFiles()
  const appData = scanAppDataPrograms()
  const pathExes = scanPathExecutables()
  const commonFolders = scanCommonFolders()
  const userSubfolders = scanUserSubfolders()
  const userDocs = scanUserDocuments()
  const userDownloads = scanUserDownloads()
  const userDesktopFiles = scanUserDesktopFiles()

  const all = [
    ...userSubfolders,
    ...commonFolders,
    ...userDocs,
    ...userDownloads,
    ...userDesktopFiles,
    ...startMenu,
    ...desktop,
    ...programFiles,
    ...appData,
    ...pathExes,
  ]

  const seen = new Set()
  return all.filter((item) => {
    const key = `${item.name}|${item.path}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function buildVocabulary(items) {
  const vocab = new Set()
  for (const item of items) {
    const words = normalizeAccents(item.name).split(/[\s_-]+/).filter((w) => w.length >= 2)
    for (const w of words) vocab.add(w)
  }
  return vocab
}

function filterQueryWords(qWords, vocab) {
  return qWords.filter((w) => {
    if (w.length < 2) return false
    if (vocab.has(w)) return true
    // Allow prefixes: if query word "chrom" matches vocabulary word "chrome"
    for (const v of vocab) {
      if (v.startsWith(w) || w.startsWith(v)) return true
    }
    return false
  })
}

function getOrRefreshIndex() {
  const now = Date.now()
  if (SCAN_CACHE.items && now - SCAN_CACHE.timestamp < CACHE_TTL_MS) {
    return SCAN_CACHE.items
  }
  SCAN_CACHE.items = buildFullIndex()
  SCAN_CACHE.vocab = buildVocabulary(SCAN_CACHE.items)
  SCAN_CACHE.timestamp = now
  return SCAN_CACHE.items
}

function getVocabulary() {
  getOrRefreshIndex()
  return SCAN_CACHE.vocab || new Set()
}

/* ──────────────────────────────────────────────
   Scoring Algorithm (semantic fuzzy search)
   ────────────────────────────────────────────── */

function isFolderQuery(query) {
  const q = normalizeAccents(query)
  return /pasta|folder|diret[oó]rio|diret|dir\b|abrir pasta|abrir folder/i.test(q)
}

function isFileQuery(query) {
  const q = normalizeAccents(query)
  return /arquivo|file|documento|doc|pdf|planilha|imagem|foto|photo|video/i.test(q)
}

function isExplicitOpenQuery(query) {
  const q = String(query || '').toLowerCase().trim()
  return /^(abra|abrir|executar|iniciar|run|launch|open|start)\b/i.test(q)
}

function scoreItem(item, query) {
  const q = normalizeAccents(query).trim()
  if (!q) return 0

  const vocab = getVocabulary()
  const nameNorm = normalizeAccents(item.name)
  const catNorm = normalizeAccents(item.category || '')
  const pathNorm = normalizeAccents(item.path || '')
  const isFolder = item.type === 'Pasta'
  const isFile = item.type === 'Arquivo'
  const folderQuery = isFolderQuery(query)
  const fileQuery = isFileQuery(query)

  let score = 0

  /* ── Folder queries: heavily prioritize folders ── */
  if (folderQuery) {
    if (isFolder) {
      score = scoreNameMatch(nameNorm, q, vocab)
      score = Math.min(score + 0.15, 1.0)
    } else {
      score = scoreNameMatch(nameNorm, q, vocab) * 0.2
    }
  }
  /* ── File queries: prioritize files ── */
  else if (fileQuery) {
    if (isFile) {
      score = scoreNameMatch(nameNorm, q, vocab)
      score = Math.min(score + 0.15, 1.0)
    } else {
      score = scoreNameMatch(nameNorm, q, vocab) * 0.3
    }
  }
  /* ── Normal query ── */
  else {
    score = scoreNameMatch(nameNorm, q, vocab)

    /* Category bonus */
    if (catNorm.includes(q)) score += 0.1

    /* Path bonus */
    if (pathNorm.includes(q)) score += 0.05
  }

  return Math.min(score, 1.0)
}

function scoreNameMatch(nameNorm, q, vocab) {
  /* Build clean query by removing words not found in the index vocabulary */
  const rawQWords = q.split(/\s+/).filter(Boolean)
  const qWords = vocab && vocab.size > 0 ? filterQueryWords(rawQWords, vocab) : rawQWords
  const effectiveQWords = qWords.length > 0 ? qWords : rawQWords
  const cleanQ = effectiveQWords.join(' ')

  /* Exact match (clean or raw) */
  if (nameNorm === q || nameNorm === cleanQ) return 1.0

  /* Prefix match (clean first, then raw) */
  if (nameNorm.startsWith(cleanQ)) return 0.9 + (cleanQ.length / nameNorm.length) * 0.05
  if (nameNorm.startsWith(q)) return 0.9 + (q.length / nameNorm.length) * 0.05

  /* Contains match (clean first, then raw) */
  if (nameNorm.includes(cleanQ)) return 0.7 + (cleanQ.length / nameNorm.length) * 0.15
  if (nameNorm.includes(q)) return 0.7 + (q.length / nameNorm.length) * 0.15

  /* Word-by-word fuzzy */
  const nameWords = nameNorm.split(/[\s_-]+/)
  let matchCount = 0
  for (const qw of effectiveQWords) {
    if (nameWords.some((nw) => nw.startsWith(qw) || nw.includes(qw))) {
      matchCount++
    }
  }
  if (matchCount > 0) {
    return 0.3 + (matchCount / Math.max(effectiveQWords.length, 1)) * 0.4
  }

  /* Character-level fuzzy for short queries */
  const testQ = cleanQ || q
  if (testQ.length >= 2 && testQ.length <= 10) {
    let charMatches = 0
    for (const ch of testQ) {
      if (nameNorm.includes(ch)) charMatches++
    }
    if (charMatches >= testQ.length * 0.6) {
      return 0.15 + (charMatches / testQ.length) * 0.25
    }
  }

  return 0
}

/* ──────────────────────────────────────────────
   Open Item
   ────────────────────────────────────────────── */

const openedInSession = new Set()

function openItem(itemPath) {
  return new Promise((resolve) => {
    const normalized = path.resolve(String(itemPath || '').trim())
    if (!normalized) return resolve({ ok: false, error: 'Caminho vazio' })
    if (!fs.existsSync(normalized)) return resolve({ ok: false, error: 'Caminho nao encontrado no disco' })

    const cmd = process.platform === 'win32'
      ? `start "" "${normalized}"`
      : `open "${normalized}"`

    exec(cmd, (err) => {
      if (err) return resolve({ ok: false, error: err.message })
      openedInSession.add(normalized)
      return resolve({ ok: true, path: normalized })
    })
  })
}

/* ──────────────────────────────────────────────
   Build GenericExtensionCard Payload
   ────────────────────────────────────────────── */

function buildCardPayload(query, scored) {
  const typeOrder = ['Pasta', 'Arquivo', 'Programa', 'Atalho', 'CLI']
  const groups = {}

  for (const item of scored) {
    const type = item.type || 'Outros'
    if (!groups[type]) groups[type] = []
    groups[type].push(item)
  }

  const sections = []
  for (const typeName of typeOrder) {
    if (!groups[typeName] || groups[typeName].length === 0) continue
    const items = groups[typeName]
    const typeLabels = {
      Pasta: 'Pastas',
      Arquivo: 'Arquivos',
      Programa: 'Programas',
      Atalho: 'Atalhos',
      CLI: 'Ferramentas CLI',
    }
    sections.push({
      title: typeLabels[typeName] || typeName,
      items: items.map((item) => ({
        id: item.path,
        type: item.type,
        label: item.name,
        description: item.path,
        badge: {
          text: `${Math.round(item.score * 100)}%`,
          variant: item.score >= 0.9 ? 'success' : item.score >= 0.5 ? 'info' : 'default',
        },
        primaryAction: {
          type: 'primary',
          label: 'Abrir',
          endpoint: '/launcher/open',
          payload: { path: item.path },
        },
      })),
    })
  }

  if (sections.length === 0 && scored.length > 0) {
    sections.push({
      title: 'Resultados',
      items: scored.map((item) => ({
        id: item.path,
        type: item.type,
        label: item.name,
        description: item.path,
        badge: {
          text: `${Math.round(item.score * 100)}%`,
          variant: item.score >= 0.9 ? 'success' : item.score >= 0.5 ? 'info' : 'default',
        },
        primaryAction: {
          type: 'primary',
          label: 'Abrir',
          endpoint: '/launcher/open',
          payload: { path: item.path },
        },
      })),
    })
  }

  const folderQuery = isFolderQuery(query)
  const folderCount = scored.filter((i) => i.type === 'Pasta').length
  const fileCount = scored.filter((i) => i.type === 'Arquivo').length

  let subtitle = `${scored.length} ${scored.length === 1 ? 'item encontrado' : 'itens encontrados'}`
  if (folderQuery) subtitle = `${folderCount} pasta${folderCount !== 1 ? 's' : ''} encontrada${folderCount !== 1 ? 's' : ''}`
  else if (fileQuery) subtitle = `${fileCount} arquivo${fileCount !== 1 ? 's' : ''} encontrado${fileCount !== 1 ? 's' : ''}`

  return {
    type: 'generic-extension',
    data: {
      extension: 'launcher',
      layout: { mode: 'list' },
      header: {
        icon: '',
        title: `Resultados para "${query}"`,
        subtitle,
      },
      sections,
      footer: { text: 'MomAI Launcher' },
    },
  }
}

function buildOpenedCardPayload(itemName, itemPath) {
  return {
    type: 'generic-extension',
    data: {
      extension: 'launcher',
      header: {
        icon: '',
        title: `${itemName} aberto`,
        subtitle: itemPath,
      },
      status: { type: 'success', message: `${itemName} foi iniciado` },
      footer: { text: 'MomAI Launcher' },
    },
  }
}

/* ──────────────────────────────────────────────
   Module Exports
   ────────────────────────────────────────────── */

module.exports = {
  tools: [
    {
      name: 'search_programs',
      description: 'Busca programas, aplicativos, pastas e arquivos no computador por nome. Retorna resultados similares com score de confianca.',
    },
    {
      name: 'open_program',
      description: 'Abre um programa, pasta ou arquivo pelo caminho absoluto retornado pelo search_programs.',
      parameters: {
        type: 'object',
        required: ['path'],
        properties: {
          path: { type: 'string', description: 'Caminho absoluto do item' },
          name: { type: 'string', description: 'Nome do item para confirmacao' },
        },
      },
    },
  ],

  async execute({ content, args, toolName }) {
    const text = String(content || '').trim()

    /* ── open_program ── */
    if (toolName === 'open_program') {
      const targetPath = String(args?.path || '').trim()
      const targetName = String(args?.name || path.basename(targetPath)).trim()

      if (!targetPath) {
        return {
          tool: 'open_program',
          instruction: 'Caminho do item nao fornecido.',
        }
      }

      const result = await openItem(targetPath)
      if (result.ok) {
        return {
          tool: 'open_program',
          structuredResponse: buildOpenedCardPayload(targetName, targetPath),
          instruction: JSON.stringify({ ok: true, message: `"${targetName}" aberto com sucesso.`, path: targetPath }),
        }
      }
      return {
        tool: 'open_program',
        instruction: `Nao foi possivel abrir: ${result.error}`,
      }
    }

    /* ── search_programs ── */
    const query = toolName === 'search_programs' ? (String(args?.query || content || '')).trim() : text
    const allItems = getOrRefreshIndex()

    const scored = allItems
      .map((item) => ({ ...item, score: scoreItem(item, query) }))
      .filter((item) => item.score > 0.1)
      .sort((a, b) => b.score - a.score)
      .slice(0, 20)

    if (scored.length === 0) {
      return {
        tool: 'search_programs',
        instruction: `Nenhum resultado encontrado para "${query}".`,
      }
    }

    /* Auto-open ONLY when:
       1. User explicitly says "abra X" / "abrir X" (isExplicitOpenQuery)
       2. AND there is a PERFECT match (score === 1.0)
       Otherwise, show results and ask the user which one to open. */
    if (isExplicitOpenQuery(query)) {
      const perfectMatch = scored.find((item) => item.score >= 1.0)
      if (perfectMatch) {
        const result = await openItem(perfectMatch.path)
        if (result.ok) {
          return {
            tool: 'search_programs',
            structuredResponse: buildOpenedCardPayload(perfectMatch.name, perfectMatch.path),
            instruction: JSON.stringify({ ok: true, message: `"${perfectMatch.name}" encontrado e aberto automaticamente.`, path: perfectMatch.path }),
          }
        }
      }
    }

    return {
      tool: 'search_programs',
      structuredResponse: buildCardPayload(query, scored),
      instruction: JSON.stringify({
        results: scored.map((item) => ({ name: item.name, path: item.path, type: item.type, category: item.category, score: Math.round(item.score * 100) / 100 })),
        total: scored.length,
        message: scored.length === 1
          ? `Encontrado 1 resultado para "${query}". Deseja que eu abra?`
          : `Encontrados ${scored.length} resultados para "${query}". Qual deles deseja abrir?`,
      }),
    }
  },
}
