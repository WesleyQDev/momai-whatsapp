const fs = require('node:fs')
const path = require('node:path')

function parseListValue(value) {
  const raw = String(value || '').trim()
  if (!raw) return []
  if (raw.startsWith('[') && raw.endsWith(']')) {
    return raw
      .slice(1, -1)
      .split(',')
      .map((s) => s.trim().replace(/^['\"]|['\"]$/g, ''))
      .filter(Boolean)
  }
  return raw
    .split(/[;,]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function parseSkillMarkdown(filePath) {
  const content = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '')
  if (!content.startsWith('---')) return null

  const closeIdx = content.indexOf('\n---', 3)
  if (closeIdx < 0) return null

  const frontmatterRaw = content.slice(3, closeIdx).trim()
  const body = content.slice(closeIdx + 4).trim()
  const frontmatter = {}

  const lines = frontmatterRaw.split(/\r?\n/)
  let currentKey = null
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const listItem = trimmed.match(/^-\s+(.+)$/)
    if (listItem && currentKey) {
      if (!Array.isArray(frontmatter[currentKey])) frontmatter[currentKey] = []
      frontmatter[currentKey].push(listItem[1].trim().replace(/^['\"]|['\"]$/g, ''))
      continue
    }

    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
    if (!kv) continue
    const key = kv[1]
    const val = kv[2] || ''
    currentKey = key

    if (!val.trim()) {
      frontmatter[key] = frontmatter[key] || []
      continue
    }

    if (key === 'intents' || key === 'allowed-tools') {
      frontmatter[key] = parseListValue(val)
    } else if (key === 'enabled') {
      frontmatter[key] = !/^false$/i.test(val.trim())
    } else {
      frontmatter[key] = val.trim().replace(/^['\"]|['\"]$/g, '')
    }
  }

  const name = String(frontmatter.name || '').trim()
  const description = String(frontmatter.description || '').trim()
  if (!name || !description) return null

  return {
    name,
    description,
    intents: Array.isArray(frontmatter.intents) ? frontmatter.intents : [],
    allowedTools: Array.isArray(frontmatter['allowed-tools']) ? frontmatter['allowed-tools'] : [],
    compatibility: frontmatter.compatibility ? String(frontmatter.compatibility) : null,
    enabled: frontmatter.enabled !== false,
    body,
    frontmatter
  }
}

function normalizeSkillRecord({ id, kind, parsed, runtime }) {
  const tools = Array.isArray(runtime?.tools)
    ? runtime.tools
        .filter((t) => t && t.name)
        .map((t) => ({
          name: String(t.name),
          description: String(t.description || ''),
          parameters: t.parameters
        }))
    : []

  return {
    kind,
    id,
    enabled: parsed.enabled !== false,
    manifest: {
      id,
      name: parsed.name,
      description: parsed.description,
      intents: parsed.intents || [],
      tools,
      allowed_tools: parsed.allowedTools || [],
      compatibility: parsed.compatibility,
      instructions: parsed.body
    },
    execute: typeof runtime?.execute === 'function' ? runtime.execute : null
  }
}

function loadSkillFromDir({ dir, kind }) {
  const log = (msg) => {
    if (typeof process.send === 'function') {
      process.send({ type: 'node-core-log', message: msg })
    }
  }

  const skillMdPath = path.join(dir, 'SKILL.md')
  if (!fs.existsSync(skillMdPath)) {
    log(`[skills] Skip: No SKILL.md in ${dir}`)
    return null
  }

  const parsed = parseSkillMarkdown(skillMdPath)
  if (!parsed) return null

  const runtimePath = path.join(dir, 'runtime.js')
  let runtime = null
  if (fs.existsSync(runtimePath)) {
    try {
      delete require.cache[require.resolve(runtimePath)]
      runtime = require(runtimePath)
    } catch {
      runtime = null
    }
  }

  return normalizeSkillRecord({ id: parsed.name, kind, parsed, runtime })
}

function createSkillRegistry({ dataDir, builtinSkillsDir }) {
  const extensionsDir = path.join(dataDir, 'extensions')
  const state = {
    builtins: new Map(),
    extensions: new Map()
  }

  function loadBuiltins() {
    // Capture count BEFORE clearing
    const previousCount = state.builtins.size
    state.builtins.clear()
    const log = (msg) => {
      if (typeof process.send === 'function') {
        process.send({ type: 'node-core-log', message: msg })
      }
    }

    // Only log on first load or when count changes
    if (previousCount === 0) {
      log(`[skills] Loading builtins from: ${builtinSkillsDir}`)
    }
    if (!fs.existsSync(builtinSkillsDir)) {
      log(`[skills] ERROR: builtinSkillsDir does not exist!`)
      return
    }

    try {
      const items = fs.readdirSync(builtinSkillsDir)
      for (const name of items) {
        const dir = path.join(builtinSkillsDir, name)
        const stat = fs.statSync(dir, { throwIfNoEntry: false })
        if (!stat || !stat.isDirectory()) continue
        const skill = loadSkillFromDir({ dir, kind: 'builtin' })
        if (!skill) continue
        state.builtins.set(skill.id, skill)
      }

      const newCount = state.builtins.size
      if (previousCount === 0 || newCount !== previousCount) {
        log(`[skills] Successfully loaded ${newCount} builtin skills.`)
      }
    } catch (err) {
      log(`[skills] FATAL: Failed to read builtinSkillsDir: ${err.message}`)
    }
  }

  function loadExtensions() {
    if (!fs.existsSync(extensionsDir)) fs.mkdirSync(extensionsDir, { recursive: true })
    state.extensions.clear()

    for (const name of fs.readdirSync(extensionsDir)) {
      const dir = path.join(extensionsDir, name)
      const stat = fs.statSync(dir, { throwIfNoEntry: false })
      if (!stat || !stat.isDirectory()) continue
      const skill = loadSkillFromDir({ dir, kind: 'extension' })
      if (!skill) continue
      state.extensions.set(skill.id, skill)
    }
  }

  function refresh() {
    loadBuiltins()
    loadExtensions()
  }

  function getAll() {
    return [...state.builtins.values(), ...state.extensions.values()]
  }

  function getEnabled() {
    return getAll().filter((s) => s.enabled)
  }

  function getById(skillId) {
    return state.builtins.get(skillId) || state.extensions.get(skillId) || null
  }

  function discover(query) {
    const q = String(query || '')
    const enabled = getEnabled()

    const lower = q.toLowerCase()
    let best = null
    let bestScore = 0
    for (const skill of enabled) {
      const description = String(skill.manifest.description || '').toLowerCase()
      const intents = Array.isArray(skill.manifest.intents) ? skill.manifest.intents : []
      let score = 0

      for (const intent of intents) {
        const intentNorm = String(intent || '')
          .toLowerCase()
          .trim()
        if (!intentNorm) continue
        if (lower.includes(intentNorm)) score += 3
      }

      for (const token of lower.split(/\s+/)) {
        if (token.length < 3) continue
        if (description.includes(token)) score += 1
      }
      if (score > bestScore) {
        best = skill
        bestScore = score
      }
    }

    if (!best || bestScore <= 0) return null
    return {
      id: best.id,
      name: best.manifest.name,
      confidence: Math.min(0.95, bestScore / 3),
      source: 'lexical'
    }
  }

  async function execute(skillId, input, context, args, toolName) {
    const skill = getById(skillId)
    if (!skill || !skill.enabled || typeof skill.execute !== 'function') return null
    return skill.execute({ content: input, context, manifest: skill.manifest, args, toolName })
  }

  function toListPayload() {
    return getEnabled().map((skill) => ({
      id: skill.manifest.id,
      name: skill.manifest.name,
      description: skill.manifest.description,
      category: skill.kind,
      enabled: skill.enabled,
      intents: skill.manifest.intents,
      tools: (skill.manifest.tools || []).map((t) => t.name),
      features: {
        sidebar: true,
        agent_name: skill.manifest.id
      }
    }))
  }

  function toOpenAITools(skillIds) {
    const skills = skillIds ? getEnabled().filter((s) => skillIds.includes(s.id)) : getEnabled()
    const functions = []

    for (const skill of skills) {
      const tools = skill.manifest.tools || []
      if (tools.length === 0) {
        functions.push({
          type: 'function',
          function: {
            name: skill.id,
            description: skill.manifest.description,
            parameters: {
              type: 'object',
              properties: {
                content: {
                  type: 'string',
                  description: 'The user message content to process with this skill.'
                }
              },
              required: ['content']
            }
          }
        })
        continue
      }

      for (const tool of tools) {
        functions.push({
          type: 'function',
          function: {
            name: tool.name,
            description: `${tool.description}\n\nSkill: ${skill.manifest.name}`,
            parameters: tool.parameters || {
              type: 'object',
              properties: {
                content: {
                  type: 'string',
                  description: `Input for ${tool.name}: ${tool.description}`
                }
              },
              required: ['content']
            }
          }
        })
      }
    }

    return functions
  }

  refresh()

  return {
    refresh,
    loadBuiltins,
    loadExtensions,
    getAll,
    getEnabled,
    getById,
    discover,
    execute,
    toListPayload,
    toOpenAITools,
    extensionsDir
  }
}

module.exports = { createSkillRegistry, parseSkillMarkdown }
