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
      title: 'HTML detectado',
      subtitle: sourcePath || 'Render sob demanda',
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
    fs.writeFileSync(targetPath, String(mutation.payload.content || ''), 'utf8')
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

  async execute({ content, args, toolName }) {
    const state = readState()
    const queryText = String(args?.query || content || '').trim()
    const knowledgeText = buildKnowledgeText(queryText)

    if (toolName === 'knowledge_routes') {
      const intent = summarizeHtmlIntent(queryText)
      return {
        ok: true,
        tool: 'knowledge_routes',
        instruction: knowledgeText,
        meta: intent
      }
    }

    if (toolName === 'prepare_html_write') {
      const basePath = normalize(args?.path || state.allowed_paths[0] || '')
      if (!isAllowedPath(state, basePath)) {
        return {
          tool: 'prepare_html_write',
          instruction: 'Sem pasta autorizada para preparar escrita de HTML.'
        }
      }
      const fileName = inferHtmlFileName(content)
      const target = normalize(path.join(basePath, fileName))
      if (!isAllowedPath(state, target)) {
        return {
          tool: 'prepare_html_write',
          instruction: 'Caminho final para HTML ficou fora do escopo autorizado.'
        }
      }
      const html = String(args?.content || '').trim()
      if (!html) {
        return { tool: 'prepare_html_write', instruction: 'HTML vazio para preparar escrita.' }
      }
      const intent = summarizeHtmlIntent(queryText)
      const mutation = createMutation(state, 'dev_write', target, {
        path: target,
        content: html,
        create: true,
        summary: `Criar ${intent.kind} sobre ${intent.topic} em ${target}`,
        preview: html.slice(0, 1400),
        details: {
          objective: queryText,
          topic: intent.topic,
          kind: intent.kind,
          routes: intent.routes,
          knowledgeHints: intent.hints,
          estimatedLines: html.split(/\r?\n/).length,
          estimatedChars: html.length
        }
      })
      return {
        tool: 'prepare_html_write',
        structuredResponse: buildDevConfirmationCard(mutation),
        instruction:
          `${knowledgeText}\n\nHTML gerado pelo modelo e preparado para escrita. Arquivo proposto: ${target}. Aguardando confirmação humana (mutationId=${mutation.id}).`.trim()
      }
    }

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
      const result = executeMutation(state, mutation)
      delete state.pending_mutations[id]
      writeState(state)
      const htmlWritten =
        mutation.action === 'dev_write' &&
        /\.html?$/i.test(String(mutation.path || '')) &&
        String(mutation.payload?.content || '').trim().length > 0
      return {
        ok: result.ok,
        tool: 'confirm_mutation',
        message: result.ok ? result.message : result.error,
        structuredResponse: result.ok
          ? htmlWritten
            ? buildDevHtmlRenderCard(String(mutation.payload.content || ''), mutation.path)
            : buildDevResultCard('Alteração aplicada', mutation.path, [result.message])
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
