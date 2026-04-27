const fs = require('node:fs')
const path = require('node:path')

const SKILL_ID = 'dev'
const MAX_READ_CHARS = 24000
const MAX_GREP_MATCHES = 120
const MAX_GREP_FILE_SIZE = 1024 * 1024
const KNOWLEDGE_TOP_K = 5

function getDataDir() {
  const explicit = String(process.env.MOMAI_NODE_CORE_DATA_DIR || '').trim()
  if (explicit) return path.resolve(explicit)
  return path.resolve(process.cwd(), '.dev-data', 'node-core')
}

function getStatePath() {
  return path.join(getDataDir(), 'skill-state', SKILL_ID, 'state.json')
}

function getLegacyStatePath() {
  return path.join(getDataDir(), 'extensions', SKILL_ID, 'state.json')
}

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true })
}

function readState() {
  const statePath = getStatePath()
  const legacyPath = getLegacyStatePath()
  try {
    if (!fs.existsSync(statePath) && fs.existsSync(legacyPath)) {
      ensureDir(path.dirname(statePath))
      fs.copyFileSync(legacyPath, statePath)
    }
    if (!fs.existsSync(statePath)) {
      return { allowed_paths: [], pending_mutations: {} }
    }
    const raw = JSON.parse(fs.readFileSync(statePath, 'utf8'))
    return {
      allowed_paths: Array.isArray(raw.allowed_paths) ? raw.allowed_paths : [],
      pending_mutations:
        raw && typeof raw.pending_mutations === 'object' ? raw.pending_mutations : {}
    }
  } catch {
    return { allowed_paths: [], pending_mutations: {} }
  }
}

function writeState(state) {
  const statePath = getStatePath()
  ensureDir(path.dirname(statePath))
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf8')
}

function normalize(p) {
  return path.resolve(String(p || '').trim())
}

function isWithin(base, target) {
  const b = normalize(base)
  const t = normalize(target)
  const rel = path.relative(b, t)
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

function isAllowedPath(state, targetPath) {
  if (!targetPath) return false
  const allowed = Array.isArray(state.allowed_paths) ? state.allowed_paths : []
  if (!allowed.length) return false
  return allowed.some((base) => isWithin(base, targetPath))
}

function safeFileInfo(targetPath) {
  try {
    const st = fs.statSync(targetPath)
    return { exists: true, isFile: st.isFile(), isDirectory: st.isDirectory(), size: st.size }
  } catch {
    return { exists: false, isFile: false, isDirectory: false, size: 0 }
  }
}

function listDir(dirPath, depth = 2, root = null) {
  const out = []
  const start = root || dirPath
  if (depth < 0) return out
  let entries = []
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true })
  } catch {
    return out
  }

  for (const ent of entries) {
    const full = path.join(dirPath, ent.name)
    const rel = path.relative(start, full) || ent.name
    if (ent.isDirectory()) {
      out.push({ type: 'dir', name: ent.name, path: full, relative: rel })
      if (depth > 0) {
        out.push(...listDir(full, depth - 1, start))
      }
    } else {
      const info = safeFileInfo(full)
      out.push({ type: 'file', name: ent.name, path: full, relative: rel, size: info.size })
    }
    if (out.length >= 600) break
  }

  return out
}

function shouldSkipBinary(filePath) {
  const lower = filePath.toLowerCase()
  return /\.(png|jpg|jpeg|gif|webp|ico|mp4|mp3|wav|zip|rar|7z|exe|dll|bin|pdf|woff2?)$/.test(lower)
}

function collectFiles(base, maxDepth = 4) {
  const files = []
  function walk(cur, depth) {
    if (depth < 0) return
    let entries = []
    try {
      entries = fs.readdirSync(cur, { withFileTypes: true })
    } catch {
      return
    }

    for (const ent of entries) {
      const full = path.join(cur, ent.name)
      if (ent.isDirectory()) {
        if (ent.name.startsWith('.') && ent.name !== '.github') continue
        walk(full, depth - 1)
      } else if (ent.isFile()) {
        files.push(full)
      }
      if (files.length >= 2000) return
    }
  }
  walk(base, maxDepth)
  return files
}

function simpleGrep(basePath, query, glob) {
  const q = String(query || '').trim()
  if (!q) return []
  const needle = q.toLowerCase()
  const files = collectFiles(basePath, 5)
  const results = []

  for (const f of files) {
    if (shouldSkipBinary(f)) continue
    if (glob && !minimatchSimple(path.basename(f), glob)) continue
    const info = safeFileInfo(f)
    if (!info.exists || !info.isFile || info.size > MAX_GREP_FILE_SIZE) continue

    let text = ''
    try {
      text = fs.readFileSync(f, 'utf8')
    } catch {
      continue
    }

    const lines = text.split(/\r?\n/)
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i]
      if (line.toLowerCase().includes(needle)) {
        results.push({ file: f, line: i + 1, text: line.slice(0, 320) })
        if (results.length >= MAX_GREP_MATCHES) return results
      }
    }
  }

  return results
}

function minimatchSimple(filename, pattern) {
  const p = String(pattern || '').trim()
  if (!p || p === '*') return true
  if (!p.includes('*')) return filename === p
  const escaped = p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')
  const rx = new RegExp(`^${escaped}$`, 'i')
  return rx.test(filename)
}

function makeMutationId() {
  return `mut_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function detectRoutes(text) {
  const q = String(text || '').toLowerCase()
  const routes = new Set()
  if (/(frontend|react|css|tailwind|ui|html)/.test(q)) routes.add('frontend')
  if (/(backend|api|node|server|fastapi|python|database|db)/.test(q)) routes.add('backend')
  if (/(debug|erro|bug|stack|exception|crash|falha)/.test(q)) routes.add('debug')
  if (/(arquitetura|architecture|design|estrutura|modul)/.test(q)) routes.add('architecture')
  if (!routes.size) {
    routes.add('frontend')
    routes.add('backend')
    routes.add('debug')
  }
  return [...routes]
}

function splitKnowledgeChunks(text) {
  const chunks = []
  const lines = String(text || '').split(/\r?\n/)
  let bucket = []
  for (const ln of lines) {
    bucket.push(ln)
    if (bucket.join('\n').length >= 480 || /^#{1,3}\s/.test(ln)) {
      const joined = bucket.join('\n').trim()
      if (joined) chunks.push(joined)
      bucket = []
    }
  }
  const tail = bucket.join('\n').trim()
  if (tail) chunks.push(tail)
  return chunks
}

function scoreChunk(chunk, query) {
  const words = String(query || '')
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length >= 3)
  const lower = String(chunk || '').toLowerCase()
  let score = 0
  for (const w of words) {
    if (lower.includes(w)) score += 1
  }
  return score
}

function getKnowledgeHints(query) {
  const routes = detectRoutes(query)
  const root = path.join(__dirname, 'knowledge')
  const all = []

  for (const route of routes) {
    const dir = path.join(root, route)
    if (!fs.existsSync(dir)) continue
    let files = []
    try {
      files = fs.readdirSync(dir).filter((f) => f.endsWith('.md'))
    } catch {
      continue
    }
    for (const file of files) {
      const full = path.join(dir, file)
      let text = ''
      try {
        text = fs.readFileSync(full, 'utf8')
      } catch {
        continue
      }
      const chunks = splitKnowledgeChunks(text)
      for (const chunk of chunks) {
        all.push({ route, file, chunk, score: scoreChunk(chunk, query) })
      }
    }
  }

  const picked = all
    .sort((a, b) => b.score - a.score)
    .slice(0, KNOWLEDGE_TOP_K)
    .map((item) => ({
      route: item.route,
      file: item.file,
      summary: item.chunk.slice(0, 420)
    }))

  return picked
}

function buildKnowledgeText(query) {
  const hints = getKnowledgeHints(query)
  if (!hints.length) return ''
  const lines = ['# DEV KNOWLEDGE CONTEXT']
  for (const h of hints) {
    lines.push(`- [${h.route}/${h.file}] ${h.summary.replace(/\s+/g, ' ').trim()}`)
  }
  return lines.join('\n')
}

function buildDevResultCard(title, subtitle, lines = []) {
  return {
    type: 'dev_result',
    data: {
      title,
      subtitle,
      lines
    }
  }
}

function buildDevConfirmationCard(mutation) {
  return {
    type: 'dev_confirmation',
    data: {
      mutationId: mutation.id,
      action: mutation.action,
      path: mutation.path,
      summary: mutation.summary,
      preview: mutation.preview,
      details: mutation.details || null,
      endpoint: '/extensions/dev/action'
    }
  }
}

function buildDevHtmlRenderCard(html, sourcePath = '') {
  return {
    type: 'dev_html_render',
    data: {
      title: 'Arquivo HTML criado',
      subtitle: sourcePath || 'Arquivo pronto para visualização',
      html: String(html || ''),
      code: String(html || '')
    }
  }
}

function isHtmlGenerationIntent(text) {
  const value = String(text || '').toLowerCase()
  if (!value) return false
  return /(crie|gera|monta|fa[çc]a|create|generate).*(html|landing|site|pagina|página)/.test(value)
}

function extractHtmlDocument(text) {
  const value = String(text || '').trim()
  if (!value) return ''

  const fenced = value.match(/```(?:html)?\s*([\s\S]*?)```/i)
  if (fenced?.[1]) {
    const candidate = fenced[1].trim()
    if (candidate) return candidate
  }

  const docMatch = value.match(/<!doctype html>[\s\S]*<\/html>/i)
  if (docMatch?.[0]) return docMatch[0].trim()

  const htmlMatch = value.match(/<html[\s\S]*<\/html>/i)
  if (htmlMatch?.[0]) return htmlMatch[0].trim()

  if (/<[a-z][\s\S]*>/i.test(value)) {
    return value
  }

  return ''
}

function ensureValidHtmlDocument(html) {
  let raw = String(html || '').trim()
  if (!raw) return ''

  raw = raw
    .replace(/^\s*```(?:html)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .replace(/```/g, '')
    .trim()
  if (!raw) return ''

  function findMatchingHtmlCloseIndex(text, openIdx) {
    const lower = text.toLowerCase()
    const openTagRe = /<html(?:\s|>)/gi
    const closeTagRe = /<\/html>/gi
    let depth = 0
    let cursor = openIdx
    while (cursor < text.length) {
      openTagRe.lastIndex = cursor
      closeTagRe.lastIndex = cursor
      const nextOpen = openTagRe.exec(lower)
      const nextClose = closeTagRe.exec(lower)
      if (!nextClose) return -1
      if (nextOpen && nextOpen.index < nextClose.index) {
        depth += 1
        cursor = nextOpen.index + 5
        continue
      }
      if (depth === 0) return nextClose.index + 7
      depth -= 1
      cursor = nextClose.index + 7
    }
    return -1
  }

  function extractInnermostHtml(text) {
    const lower = text.toLowerCase()
    const starts = []
    let idx = lower.indexOf('<html')
    while (idx >= 0) {
      starts.push(idx)
      idx = lower.indexOf('<html', idx + 5)
    }
    if (!starts.length) return text
    for (let i = starts.length - 1; i >= 0; i -= 1) {
      const start = starts[i]
      const end = findMatchingHtmlCloseIndex(text, start)
      if (end > start) return text.slice(start, end).trim()
    }
    return text.slice(starts[starts.length - 1]).trim()
  }

  const lowerRaw = raw.toLowerCase()
  const lastDoctype = lowerRaw.lastIndexOf('<!doctype html>')
  const lastHtmlTag = lowerRaw.lastIndexOf('<html')
  const docStart = Math.max(lastDoctype, lastHtmlTag)
  if (docStart > 0) {
    raw = raw.slice(docStart).trim()
  }

  raw = extractInnermostHtml(raw)

  const closingIdx = raw.toLowerCase().indexOf('</html>')
  if (closingIdx >= 0) {
    raw = `${raw.slice(0, closingIdx + 7)}`
  }

  const firstDoctypeIdx = raw.toLowerCase().indexOf('<!doctype html>')
  if (firstDoctypeIdx > 0) {
    raw = raw.slice(firstDoctypeIdx).trim()
  }

  const doctypeMatches = raw.match(/<!doctype html>/gi) || []
  if (doctypeMatches.length > 1) {
    const first = raw.toLowerCase().indexOf('<!doctype html>')
    const second = raw.toLowerCase().indexOf('<!doctype html>', first + 1)
    if (second > 0) {
      const secondDoc = raw.slice(second).trim()
      const secondDocClosed = /<\/html>\s*$/i.test(secondDoc)
        ? secondDoc
        : `${secondDoc}\n</html>`
      return secondDocClosed
    }
  }

  const nestedDocMatch = raw.match(/<!doctype html>[\s\S]*<\/html>/i) || raw.match(/<html[\s\S]*<\/html>/i)
  if (nestedDocMatch?.[0]) {
    raw = nestedDocMatch[0].trim()
  }

  const hasHtmlTag = /<html[\s>]/i.test(raw)
  const hasDoctype = /<!doctype html>/i.test(raw)
  const hasHead = /<head[\s>]/i.test(raw)
  const hasBody = /<body[\s>]/i.test(raw)

  if (hasHtmlTag && hasDoctype && hasHead && hasBody) return raw
  if (hasHtmlTag && /<\/html>/i.test(raw)) {
    let wrapped = raw
    if (!hasHead) wrapped = wrapped.replace(/<html([^>]*)>/i, '<html$1><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>')
    if (!hasBody) wrapped = wrapped.replace(/<\/head>/i, '$&<body>').replace(/<\/html>/i, '</body></html>')
    if (!/<\/body>/i.test(wrapped)) wrapped = wrapped.replace(/<\/html>/i, '</body></html>')
    if (!/<!doctype html>/i.test(wrapped)) wrapped = `<!DOCTYPE html>\n${wrapped}`

    const bodyStart = wrapped.search(/<body[^>]*>/i)
    if (bodyStart >= 0) {
      const bodyTail = wrapped.slice(bodyStart)
      const nestedInBodyIdx = bodyTail.toLowerCase().indexOf('<!doctype html>')
      if (nestedInBodyIdx >= 0) {
        const inner = bodyTail.slice(nestedInBodyIdx).trim()
        const innerDoc = /<\/html>\s*$/i.test(inner) ? inner : `${inner}\n</html>`
        return innerDoc
      }
    }

    return wrapped
  }

  return [
    '<!DOCTYPE html>',
    '<html lang="pt-BR">',
    '<head>',
    '  <meta charset="UTF-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1.0">',
    '  <title>Pagina HTML</title>',
    '</head>',
    '<body>',
    raw,
    '</body>',
    '</html>'
  ].join('\n')
}

function sanitizeHtmlBeforeWrite(content) {
  let text = String(content || '').trim()
  if (!text) return ''

  text = text
    .replace(/^\s*```(?:html)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .replace(/```/g, '')
    .trim()

  const starts = []
  let cursor = 0
  const lower = text.toLowerCase()
  while (true) {
    const idx = lower.indexOf('<html', cursor)
    if (idx < 0) break
    starts.push(idx)
    cursor = idx + 5
  }

  if (starts.length >= 2) {
    text = text.slice(starts[starts.length - 1]).trim()
  } else if (starts.length === 1 && starts[0] > 0) {
    text = text.slice(starts[0]).trim()
  }

  const closeIdx = text.toLowerCase().lastIndexOf('</html>')
  if (closeIdx >= 0) {
    text = text.slice(0, closeIdx + 7).trim()
  }

  if (!/<html[\s>]/i.test(text)) {
    text = [
      '<!DOCTYPE html>',
      '<html lang="pt-BR">',
      '<head>',
      '  <meta charset="UTF-8">',
      '  <meta name="viewport" content="width=device-width, initial-scale=1.0">',
      '  <title>Pagina HTML</title>',
      '</head>',
      '<body>',
      text,
      '</body>',
      '</html>'
    ].join('\n')
  }

  if (!/<!doctype html>/i.test(text)) {
    text = `<!DOCTYPE html>\n${text}`
  }

  if (!/<body[\s>]/i.test(text)) {
    text = text.replace(/<\/head>/i, '$&\n<body>')
  }
  if (!/<\/body>/i.test(text)) {
    text = text.replace(/<\/html>/i, '</body>\n</html>')
  }
  if (!/<\/html>/i.test(text)) {
    text = `${text}\n</html>`
  }

  return text.trim()
}

function inspectHtmlStructure(content) {
  const text = stripNonStructuralHtmlContent(String(content || ''))
  return {
    doctype: (text.match(/<!doctype html>/gi) || []).length,
    htmlOpen: (text.match(/<html[\s>]/gi) || []).length,
    htmlClose: (text.match(/<\/html>/gi) || []).length,
    headOpen: (text.match(/<head[\s>]/gi) || []).length,
    headClose: (text.match(/<\/head>/gi) || []).length,
    bodyOpen: (text.match(/<body[\s>]/gi) || []).length,
    bodyClose: (text.match(/<\/body>/gi) || []).length
  }
}

function stripNonStructuralHtmlContent(text) {
  return String(text || '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<template\b[^>]*>[\s\S]*?<\/template>/gi, '')
    .replace(/<pre\b[^>]*>[\s\S]*?<\/pre>/gi, '')
    .replace(/<code\b[^>]*>[\s\S]*?<\/code>/gi, '')
    .replace(/<textarea\b[^>]*>[\s\S]*?<\/textarea>/gi, '')
}

function isStrictValidHtmlDocument(content) {
  const s = inspectHtmlStructure(content)
  return (
    s.htmlOpen === 1 &&
    s.htmlClose === 1 &&
    s.headOpen === 1 &&
    s.headClose === 1 &&
    s.bodyOpen >= 1 &&
    s.bodyClose >= 1
  )
}

function forceRepairHtmlDocument(content, title = 'Pagina HTML') {
  const source = String(content || '').trim()
  if (!source) return ''

  let headContent = ''
  const headMatch = source.match(/<head[^>]*>([\s\S]*?)<\/head>/i)
  if (headMatch?.[1]) {
    headContent = headMatch[1]
      .replace(/<title[\s\S]*?<\/title>/gi, '')
      .replace(/<meta[^>]+charset[^>]*>/gi, '')
      .replace(/<meta[^>]+name=["']viewport["'][^>]*>/gi, '')
      .trim()
  }

  let bodyContent = source
  const bodyMatch = source.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
  if (bodyMatch?.[1]) {
    bodyContent = bodyMatch[1]
  } else {
    const htmlInnerMatch = source.match(/<html[^>]*>([\s\S]*?)<\/html>/i)
    if (htmlInnerMatch?.[1]) bodyContent = htmlInnerMatch[1]
  }

  bodyContent = bodyContent
    .replace(/<!doctype[^>]*>/gi, '')
    .replace(/<\/?html[^>]*>/gi, '')
    .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '')
    .replace(/<head[^>]*>[\s\S]*$/gi, '')
    .replace(/<\/?body[^>]*>/gi, '')
    .trim()

  if (!bodyContent) {
    bodyContent = `<main><h1>${escHtml(title || 'Pagina HTML')}</h1><p>Conteudo reparado automaticamente apos resposta truncada do modelo.</p></main>`
  }

  return [
    '<!DOCTYPE html>',
    '<html lang="pt-BR">',
    '<head>',
    '  <meta charset="UTF-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1.0">',
    `  <title>${escHtml(title || 'Pagina HTML')}</title>`,
    headContent,
    '</head>',
    '<body>',
    bodyContent,
    '</body>',
    '</html>'
  ].join('\n')
}

function inferHtmlFileName(text) {
  const value = String(text || '').toLowerCase()
  const named =
    value.match(/(?:arquivo|file|salvar em|nome)\s+([a-z0-9._-]+\.html?)/i) ||
    value.match(/([a-z0-9._-]+\.html?)/i)
  if (named && named[1]) return named[1]
  if (/landing/.test(value)) return 'landing-page.html'
  return 'index.html'
}

function escHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function readFileContent(targetPath) {
  const info = safeFileInfo(targetPath)
  if (!info.exists || !info.isFile) {
    return { ok: false, error: 'Arquivo não encontrado.' }
  }
  if (info.size > MAX_READ_CHARS * 6) {
    return { ok: false, error: 'Arquivo muito grande para leitura direta.' }
  }
  try {
    const raw = fs.readFileSync(targetPath, 'utf8')
    const content = raw.length > MAX_READ_CHARS ? `${raw.slice(0, MAX_READ_CHARS)}\n\n... [truncado]` : raw
    return { ok: true, content }
  } catch {
    return { ok: false, error: 'Falha ao ler arquivo.' }
  }
}

function createMutation(state, action, targetPath, payload = {}) {
  const id = makeMutationId()
  const mutation = {
    id,
    action,
    path: targetPath,
    payload,
    created_at: new Date().toISOString(),
    summary: payload.summary || `${action} em ${targetPath}`,
    preview: payload.preview || '',
    details: payload.details || null
  }
  state.pending_mutations[id] = mutation
  writeState(state)
  return mutation
}

function getHtmlTopic(prompt) {
  const raw = String(prompt || '').trim()
  const match =
    raw.match(/(?:sobre|de|para)\s+(.+)/i) ||
    raw.match(/(?:site|landing page|pagina|página)\s+(.+)/i)
  return (match?.[1] || raw || 'projeto').trim().slice(0, 80)
}

function summarizeHtmlIntent(query) {
  const topic = getHtmlTopic(query)
  const lower = String(query || '').toLowerCase()
  const kind =
    /landing/.test(lower) ? 'landing page'
    : /site de vendas|loja|e-commerce|ecommerce/.test(lower) ? 'site comercial'
    : /saude|saúde|clinica|clínica|medic/.test(lower) ? 'site institucional de saúde'
    : 'página HTML'

  const hints = getKnowledgeHints(query)
  const routes = [...new Set(hints.map((h) => h.route))]

  return {
    topic,
    kind,
    routes,
    hints: hints.slice(0, 3).map((h) => `[${h.route}] ${h.summary.replace(/\s+/g, ' ').trim()}`)
  }
}

function executeMutation(state, mutation) {
  const targetPath = mutation.path
  if (!isAllowedPath(state, targetPath)) {
    return { ok: false, error: 'Caminho fora das pastas autorizadas.' }
  }

  if (mutation.action === 'dev_write') {
    ensureDir(path.dirname(targetPath))
    const rawContent = String(mutation.payload.content || '')
    const content =
      /\.html?$/i.test(String(targetPath || '')) ? sanitizeHtmlBeforeWrite(rawContent) : rawContent
    fs.writeFileSync(targetPath, content, 'utf8')
    return { ok: true, message: `Arquivo salvo: ${targetPath}` }
  }

  if (mutation.action === 'dev_patch') {
    const read = readFileContent(targetPath)
    if (!read.ok) return { ok: false, error: read.error }
    const find = String(mutation.payload.find || '')
    if (!find) return { ok: false, error: 'Trecho de busca vazio para patch.' }
    if (!read.content.includes(find)) {
      return { ok: false, error: 'Trecho para substituição não encontrado no arquivo.' }
    }
    const next = read.content.replace(find, String(mutation.payload.replace || ''))
    fs.writeFileSync(targetPath, next, 'utf8')
    return { ok: true, message: `Patch aplicado em: ${targetPath}` }
  }

  if (mutation.action === 'dev_delete') {
    const info = safeFileInfo(targetPath)
    if (!info.exists) return { ok: false, error: 'Alvo não encontrado para remover.' }
    if (info.isDirectory) {
      fs.rmSync(targetPath, { recursive: true, force: true })
    } else {
      fs.rmSync(targetPath, { force: true })
    }
    return { ok: true, message: `Removido: ${targetPath}` }
  }

  return { ok: false, error: 'Ação de mutação não suportada.' }
}

module.exports = {
  hooks: {
    async beforeModel({ content, args }) {
      const queryText = String(args?.query || content || '').trim()
      if (!isHtmlGenerationIntent(queryText)) return null

      const state = readState()
      if (!state.allowed_paths.length) return null

      const basePath = normalize(args?.path || state.allowed_paths[0] || '')
      if (!isAllowedPath(state, basePath)) return null

      const fileName = inferHtmlFileName(queryText)
      const target = normalize(path.join(basePath, fileName))
      if (!isAllowedPath(state, target)) return null

      const intent = summarizeHtmlIntent(queryText)
      const mutation = createMutation(state, 'generate_html_write', target, {
        path: target,
        create: true,
        query: queryText,
        summary: `Permissao para criar arquivo no diretorio autorizado`,
        details: {
          objective: queryText,
          kind: intent.kind,
          routes: intent.routes
        }
      })

      return {
        active: true,
        shortCircuit: true,
        structuredResponse: buildDevConfirmationCard(mutation),
        step: {
          tool: 'request_permission',
          name: 'request_permission',
          description: `Solicitou permissão para criar ${fileName} na pasta autorizada.`
        }
      }
    },

    async afterModel({ content, args }) {
      const queryText = String(args?.query || content || '').trim()
      if (!isHtmlGenerationIntent(queryText)) return null
      return null
    }
  },

  tools: [
    {
      name: 'dev_list',
      description: 'Lista arquivos e pastas dentro das pastas autorizadas da Dev Skill.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Pasta alvo para listar.' },
          depth: { type: 'number', description: 'Profundidade de listagem (0-6).' }
        }
      }
    },
    {
      name: 'dev_read',
      description: 'Lê arquivo de texto/código dentro das pastas autorizadas.',
      parameters: {
        type: 'object',
        required: ['path'],
        properties: {
          path: { type: 'string', description: 'Caminho absoluto do arquivo.' }
        }
      }
    },
    {
      name: 'dev_grep',
      description: 'Busca texto (grep) recursivo dentro de pasta autorizada.',
      parameters: {
        type: 'object',
        required: ['path', 'query'],
        properties: {
          path: { type: 'string', description: 'Pasta base da busca.' },
          query: { type: 'string', description: 'Texto a buscar.' },
          glob: { type: 'string', description: 'Filtro simples de arquivo (ex: *.ts).' }
        }
      }
    },
    {
      name: 'dev_write',
      description: 'Escreve arquivo (ação mutante com confirmação humana obrigatória).',
      parameters: {
        type: 'object',
        required: ['path', 'content'],
        properties: {
          path: { type: 'string' },
          content: { type: 'string' },
          create: { type: 'boolean' }
        }
      }
    },
    {
      name: 'dev_patch',
      description: 'Substitui trecho de um arquivo (ação mutante com confirmação humana obrigatória).',
      parameters: {
        type: 'object',
        required: ['path', 'find', 'replace'],
        properties: {
          path: { type: 'string' },
          find: { type: 'string' },
          replace: { type: 'string' }
        }
      }
    },
    {
      name: 'dev_delete',
      description: 'Remove arquivo/pasta (ação mutante com confirmação humana obrigatória).',
      parameters: {
        type: 'object',
        required: ['path'],
        properties: {
          path: { type: 'string' }
        }
      }
    },
    {
      name: 'authorize_path',
      description: 'Autoriza uma pasta para a Dev Skill operar.',
      parameters: {
        type: 'object',
        required: ['path'],
        properties: {
          path: { type: 'string' }
        }
      }
    },
    {
      name: 'revoke_path',
      description: 'Remove uma pasta da lista autorizada da Dev Skill.',
      parameters: {
        type: 'object',
        required: ['path'],
        properties: {
          path: { type: 'string' }
        }
      }
    },
    {
      name: 'list_authorized_paths',
      description: 'Lista pastas autorizadas na Dev Skill.'
    },
    {
      name: 'confirm_mutation',
      description: 'Confirma uma mutação pendente da Dev Skill.',
      parameters: {
        type: 'object',
        required: ['mutationId'],
        properties: { mutationId: { type: 'string' } }
      }
    },
    {
      name: 'cancel_mutation',
      description: 'Cancela uma mutação pendente da Dev Skill.',
      parameters: {
        type: 'object',
        required: ['mutationId'],
        properties: { mutationId: { type: 'string' } }
      }
    }
  ],

  async execute({ content, args, toolName, context }) {
    const state = readState()
    const queryText = String(args?.query || content || '').trim()
    const knowledgeText = buildKnowledgeText(queryText)

    if (toolName === 'authorize_path') {
      const p = normalize(args?.path)
      if (!p || !fs.existsSync(p) || !safeFileInfo(p).isDirectory) {
        return { tool: 'authorize_path', instruction: 'Pasta inválida para autorização.' }
      }
      if (!state.allowed_paths.includes(p)) {
        state.allowed_paths.push(p)
        writeState(state)
      }
      return {
        tool: 'authorize_path',
        structuredResponse: buildDevResultCard('Pasta autorizada', p, [
          'A Dev Skill já pode operar nesta pasta.'
        ]),
        instruction: `Pasta autorizada: ${p}`
      }
    }

    if (toolName === 'revoke_path') {
      const p = normalize(args?.path)
      const before = state.allowed_paths.length
      state.allowed_paths = state.allowed_paths.filter((it) => normalize(it) !== p)
      if (state.allowed_paths.length !== before) writeState(state)
      return {
        tool: 'revoke_path',
        structuredResponse: buildDevResultCard('Pasta removida da autorização', p, []),
        instruction: `Pasta removida da allowlist: ${p}`
      }
    }

    if (toolName === 'list_authorized_paths') {
      const paths = state.allowed_paths.length ? state.allowed_paths : ['Nenhuma pasta autorizada.']
      return {
        tool: 'list_authorized_paths',
        structuredResponse: buildDevResultCard('Pastas autorizadas', '', paths),
        instruction: `Allowed paths:\n${paths.map((p) => `- ${p}`).join('\n')}`
      }
    }

    if (toolName === 'confirm_mutation') {
      const id = String(args?.mutationId || '').trim()
      const mutation = state.pending_mutations[id]
      if (!mutation) {
        return { ok: false, tool: 'confirm_mutation', message: 'Mutação pendente não encontrada.' }
      }

      let result = null
      let successResponse = null

      if (mutation.action === 'generate_html_write') {
        const llm = context?.llm
        if (!llm || typeof llm.completeText !== 'function') {
          return {
            ok: false,
            tool: 'confirm_mutation',
            message: 'LLM indisponível para gerar o HTML após a confirmação.'
          }
        }

        const query = String(mutation.payload?.query || mutation.summary || '').trim()
        const intent = summarizeHtmlIntent(query)
        const knowledgeTextForPrompt = buildKnowledgeText(query)

        const generation = await llm.completeText({
          system: [
            'You are generating a production-ready HTML file for a local desktop assistant workflow.',
            'Return exactly one complete HTML document.',
            'Do not use markdown fences.',
            'Do not explain the code.',
            'Use the provided knowledge context when relevant.',
            'Make the page specific to the request instead of generic.'
          ].join('\n'),
          user: [
            `Pedido do usuário: ${query}`,
            `Tipo de página: ${intent.kind}`,
            `Tema principal: ${intent.topic}`,
            knowledgeTextForPrompt ? `\n${knowledgeTextForPrompt}` : '',
            '',
            'Requisitos:',
            '- Gere um documento HTML completo.',
            '- Inclua CSS inline no próprio arquivo.',
            '- Estruture o layout de forma coerente com o contexto.',
            '- Não responda com comentários fora do HTML.'
          ].join('\n')
        })

        const extractedHtml = extractHtmlDocument(generation?.text || '')
        let html = ensureValidHtmlDocument(extractedHtml)
        if (!html) {
          const rawModelText = String(generation?.text || '').trim()
          if (rawModelText) {
            html = ensureValidHtmlDocument(
              `<main><h1>${escHtml(intent.topic || 'Pagina HTML')}</h1><p>${escHtml(rawModelText.slice(0, 2400))}</p></main>`
            )
          }
        }
        html = sanitizeHtmlBeforeWrite(html)
        if (!html) {
          return {
            ok: false,
            tool: 'confirm_mutation',
            message: 'O modelo não retornou um documento HTML válido.'
          }
        }
        if (!isStrictValidHtmlDocument(html)) {
          html = forceRepairHtmlDocument(html, intent.topic || 'Pagina HTML')
        }
        if (!isStrictValidHtmlDocument(html)) {
          return {
            ok: false,
            tool: 'confirm_mutation',
            message: 'HTML inválido gerado pelo modelo (estrutura duplicada ou incompleta).'
          }
        }

        result = executeMutation(state, {
          ...mutation,
          action: 'dev_write',
          payload: {
            ...mutation.payload,
            content: html
          }
        })

        if (result.ok) {
          successResponse = buildDevHtmlRenderCard(html, mutation.path)
        }
      } else {
        result = executeMutation(state, mutation)
        const htmlWritten =
          mutation.action === 'dev_write' &&
          /\.html?$/i.test(String(mutation.path || '')) &&
          String(mutation.payload?.content || '').trim().length > 0
        successResponse = htmlWritten
          ? buildDevHtmlRenderCard(String(mutation.payload.content || ''), mutation.path)
          : buildDevResultCard('Alteração aplicada', mutation.path, [result.message])
      }

      delete state.pending_mutations[id]
      writeState(state)
      return {
        ok: result.ok,
        tool: 'confirm_mutation',
        message: result.ok ? result.message : result.error,
        structuredResponse: result.ok
          ? successResponse
          : buildDevResultCard('Falha ao aplicar alteração', mutation.path, [result.error || 'Erro'])
      }
    }

    if (toolName === 'cancel_mutation') {
      const id = String(args?.mutationId || '').trim()
      if (state.pending_mutations[id]) {
        delete state.pending_mutations[id]
        writeState(state)
      }
      return {
        ok: true,
        tool: 'cancel_mutation',
        message: 'Mutação cancelada. Nenhuma alteração foi aplicada.',
        structuredResponse: buildDevResultCard('Mutação cancelada', '', [
          'Nenhuma alteração foi aplicada.'
        ])
      }
    }

    if (!state.allowed_paths.length) {
      return {
        tool: toolName || 'dev',
        structuredResponse: buildDevResultCard('Dev Skill sem permissões', '', [
          'Autorize uma pasta primeiro usando authorize_path.'
        ]),
        instruction:
          'Sem pastas autorizadas. Solicite ao usuário uma pasta e use authorize_path antes de qualquer operação.'
      }
    }

    if (toolName === 'dev_list') {
      const requested = String(args?.path || state.allowed_paths[0] || '').trim()
      const target = normalize(requested)
      if (!isAllowedPath(state, target)) {
        return { tool: 'dev_list', instruction: 'Caminho fora do escopo autorizado.' }
      }
      const info = safeFileInfo(target)
      if (!info.exists || !info.isDirectory) {
        return { tool: 'dev_list', instruction: 'Pasta alvo não encontrada.' }
      }
      const depth = Math.max(0, Math.min(6, Number(args?.depth || 2)))
      const items = listDir(target, depth)
      const lines = items.slice(0, 80).map((it) => `${it.type === 'dir' ? '[DIR]' : '[FILE]'} ${it.relative}`)
      return {
        tool: 'dev_list',
        structuredResponse: buildDevResultCard('Listagem de arquivos', target, lines),
        instruction:
          `${knowledgeText}\n\nResultado de dev_list em ${target}:\n${lines.join('\n') || 'Sem itens.'}`.trim()
      }
    }

    if (toolName === 'dev_read') {
      const target = normalize(args?.path)
      if (!isAllowedPath(state, target)) {
        return { tool: 'dev_read', instruction: 'Caminho fora do escopo autorizado.' }
      }
      const read = readFileContent(target)
      if (!read.ok) return { tool: 'dev_read', instruction: read.error }
      const contentText = String(read.content || '')
      const isHtml = /<!doctype html>|<html[\s>]/i.test(contentText)
      if (isHtml) {
        return {
          tool: 'dev_read',
          structuredResponse: buildDevHtmlRenderCard(contentText, target),
          instruction: `${knowledgeText}\n\nArquivo lido (${target}):\n\n${contentText}`.trim()
        }
      }
      return {
        tool: 'dev_read',
        structuredResponse: buildDevResultCard('Arquivo lido', target, [
          `${contentText.slice(0, 1200)}${contentText.length > 1200 ? '...' : ''}`
        ]),
        instruction: `${knowledgeText}\n\nArquivo lido (${target}):\n\n${contentText}`.trim()
      }
    }

    if (toolName === 'dev_grep') {
      const target = normalize(args?.path)
      const q = String(args?.query || '').trim()
      if (!isAllowedPath(state, target)) {
        return { tool: 'dev_grep', instruction: 'Caminho fora do escopo autorizado.' }
      }
      if (!q) return { tool: 'dev_grep', instruction: 'Query de grep vazia.' }
      const info = safeFileInfo(target)
      if (!info.exists || !info.isDirectory) {
        return { tool: 'dev_grep', instruction: 'Pasta base de grep não encontrada.' }
      }
      const matches = simpleGrep(target, q, args?.glob)
      const lines = matches.map((m) => `${m.file}:${m.line} | ${m.text}`)
      return {
        tool: 'dev_grep',
        structuredResponse: buildDevResultCard('Resultado do grep', `${matches.length} ocorrência(s)`, lines.slice(0, 120)),
        instruction:
          `${knowledgeText}\n\nResultado de dev_grep (${q}) em ${target}:\n${lines.join('\n') || 'Sem ocorrências.'}`.trim()
      }
    }

    if (toolName === 'dev_write' || toolName === 'dev_patch' || toolName === 'dev_delete') {
      const target = normalize(args?.path)
      if (!isAllowedPath(state, target)) {
        return { tool: toolName, instruction: 'Caminho fora do escopo autorizado.' }
      }

      let summary = ''
      let preview = ''
      if (toolName === 'dev_write') {
        const next = String(args?.content || '')
        summary = `Escrever ${next.length} caracteres em ${target}`
        preview = next.slice(0, 800)
      } else if (toolName === 'dev_patch') {
        summary = `Aplicar patch em ${target}`
        preview = `FIND:\n${String(args?.find || '').slice(0, 300)}\n\nREPLACE:\n${String(args?.replace || '').slice(0, 300)}`
      } else {
        summary = `Remover ${target}`
        preview = 'Esta ação remove arquivo/pasta de forma permanente.'
      }

      const mutation = createMutation(state, toolName, target, {
        ...args,
        summary,
        preview
      })

      return {
        tool: toolName,
        structuredResponse: buildDevConfirmationCard(mutation),
        instruction:
          `${knowledgeText}\n\nAção mutante pendente de confirmação humana. mutationId=${mutation.id}; action=${toolName}; path=${target}`.trim()
      }
    }

    return {
      tool: 'dev',
      structuredResponse: buildDevResultCard('Dev Skill', 'Ação não reconhecida', [
        `toolName recebido: ${toolName || 'n/a'}`
      ]),
      instruction: 'Ação não reconhecida na Dev Skill.'
    }
  }
}
