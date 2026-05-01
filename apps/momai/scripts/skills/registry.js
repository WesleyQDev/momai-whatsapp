const fs = require('node:fs')
const path = require('node:path')
const { createPermissionSchema } = require('../node-core/permissions/schema')
const extensionHostManager = require('../node-core/services/extension-host-manager')


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

    if (key === 'intents' || key === 'allowed-tools' || key === 'tags') {
      frontmatter[key] = parseListValue(val)
    } else if (key === 'enabled') {
      frontmatter[key] = !/^false$/i.test(val.trim())
    } else {
      frontmatter[key] = val.trim().replace(/^['"]|['"]$/g, '')
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

function normalizeSkillRecord({ id, kind, parsed, runtime, dir }) {
  const tools = Array.isArray(runtime?.tools)
    ? runtime.tools
        .filter((t) => t && t.name)
        .map((t) => ({
          name: String(t.name),
          description: String(t.description || ''),
          parameters: t.parameters
        }))
    : []

  const record = {
    kind,
    id,
    enabled: parsed.enabled !== false,
    manifest: {
      id,
      name: parsed.name,
      description: parsed.description,
      intents: parsed.intents || [],
      tags: parsed.frontmatter.tags || [],
      icon: parsed.frontmatter.icon || null,
      author: parsed.frontmatter.author || null,
      repo: parsed.frontmatter.repo || null,
      version: parsed.frontmatter.version || null,
      tools,
      allowed_tools: parsed.allowedTools || [],
      compatibility: parsed.compatibility,
      instructions: parsed.body || '',
      readme: (() => {
        try {
          const files = fs.readdirSync(dir)
          const readmes = {}
          for (const file of files) {
            if (file === 'README.md') {
              readmes['default'] = fs.readFileSync(path.join(dir, file), 'utf8')
            } else if (file.startsWith('README.') && file.endsWith('.md')) {
              const lang = file.split('.')[1]
              readmes[lang] = fs.readFileSync(path.join(dir, file), 'utf8')
            }
          }
          return readmes
        } catch { return {} }
      })(),
      locales: (() => {
        try {
          const localesDir = path.join(dir, 'locales')
          if (!fs.existsSync(localesDir)) return {}
          const files = fs.readdirSync(localesDir)
          const locales = {}
          for (const file of files) {
            if (file.endsWith('.json')) {
              const lang = file.replace('.json', '')
              locales[lang] = JSON.parse(fs.readFileSync(path.join(localesDir, file), 'utf8'))
            }
          }
          return locales
        } catch { return {} }
      })(),
      permissions: parsed.frontmatter.permissions || [],
      contributions: parsed.frontmatter.contributions || {}
    },
    execute: typeof runtime?.execute === 'function' ? runtime.execute : null,
    hooks: runtime && typeof runtime.hooks === 'object' ? runtime.hooks : {},
    dir: dir || null
  }
  if (record.manifest.repo) {
    console.log(`[skills] Skill ${id} linked to repo: ${record.manifest.repo}`)
  }
  return record
}




async function loadSkillFromDir({ dir, kind, expectedId }) {
  const log = (msg) => {
    if (typeof process.send === 'function') {
      process.send({ type: 'node-core-log', message: msg })
    }
  }

  const skillMdPath = path.join(dir, 'SKILL.md')
  if (!fs.existsSync(skillMdPath)) {
    // Ignore runtime/state-only directories used by packaged skills.
    const stateJsonPath = path.join(dir, 'state.json')
    if (fs.existsSync(stateJsonPath)) {
      return null
    }
    log(`[skills] Skip: No SKILL.md in ${dir}`)
    return null
  }

  const parsed = parseSkillMarkdown(skillMdPath)
  if (!parsed) return null

  const runtimePath = path.join(dir, 'runtime.js')
  let runtime = null
  if (fs.existsSync(runtimePath)) {
    try {
      // Using dynamic import to support both CJS and ESM (including top-level await)
      // We use pathToFileURL to ensure absolute paths work correctly on Windows/Linux
      const { pathToFileURL } = require('node:url')
      const imported = await import(pathToFileURL(runtimePath).href)
      runtime = imported.default || imported
    } catch (err) {
      log(`[skills] Error loading runtime for ${parsed.name}: ${err.message}`)
      runtime = null
    }
  }

  return normalizeSkillRecord({ id: expectedId || parsed.name, kind, parsed, runtime, dir })
}


function createSkillRegistry({ dataDir, builtinSkillsDir }) {
  const extensionsDir = path.join(dataDir, 'extensions')
  const packagedSkillsDir = path.resolve(__dirname, 'packaged')
  const state = {
    builtins: new Map(),
    packaged: new Map(),
    extensions: new Map()
  }

  async function loadBuiltins() {
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
        const skill = await loadSkillFromDir({ dir, kind: 'builtin', expectedId: name })
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

  async function loadPackaged() {
    state.packaged.clear()
    const log = (msg) => {
      if (typeof process.send === 'function') {
        process.send({ type: 'node-core-log', message: msg })
      }
    }

    if (!fs.existsSync(packagedSkillsDir)) {
      log(`[skills] Packaged skills dir not found: ${packagedSkillsDir}`)
      return
    }

    try {
      const items = fs.readdirSync(packagedSkillsDir)
      for (const name of items) {
        const dir = path.join(packagedSkillsDir, name)
        const stat = fs.statSync(dir, { throwIfNoEntry: false })
        if (!stat || !stat.isDirectory()) continue

        const skillMdPath = path.join(dir, 'SKILL.md')
        if (!fs.existsSync(skillMdPath)) continue

        const parsed = parseSkillMarkdown(skillMdPath)
        if (!parsed) continue

        const runtimePath = path.join(dir, 'runtime.js')
        let runtime = null
        if (fs.existsSync(runtimePath)) {
          try {
            const { pathToFileURL } = require('node:url')
            const imported = await import(pathToFileURL(runtimePath).href)
            runtime = imported.default || imported
          } catch (err) {
            log(`[skills] Error loading runtime for packaged ${parsed.name}: ${err.message}`)
            runtime = null
          }
        }

        /* Load manifest.json if present */
        let manifestExtra = null
        const manifestPath = path.join(dir, 'manifest.json')
        if (fs.existsSync(manifestPath)) {
          try {
            manifestExtra = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
          } catch {
            /* ignore */
          }
        }

        const skill = normalizeSkillRecord({ id: name || parsed.name, kind: 'packaged', parsed, runtime, dir })
        const permSchema = createPermissionSchema()
        const mergedPerms = permSchema.mergeManifestPermissions(skill.manifest.permissions, manifestExtra?.permissions)
        const riskLevel = permSchema.calculateRiskLevel(mergedPerms)
        skill.manifest = { 
          ...skill.manifest, 
          ...manifestExtra, 
          permissions: mergedPerms, 
          _permSummary: permSchema.getPermissionSummary(mergedPerms), 
          _riskLevel: riskLevel 
        }
        state.packaged.set(skill.id, skill)

      }
      log(`[skills] Loaded ${state.packaged.size} packaged extension skills.`)
    } catch (err) {
      log(`[skills] Error loading packaged skills: ${err.message}`)
    }
  }

  async function loadExtensions() {
    if (!fs.existsSync(extensionsDir)) fs.mkdirSync(extensionsDir, { recursive: true })
    state.extensions.clear()
    const permSchema = createPermissionSchema()

    for (const name of fs.readdirSync(extensionsDir)) {
      const dir = path.join(extensionsDir, name)
      const stat = fs.statSync(dir, { throwIfNoEntry: false })
      if (!stat || !stat.isDirectory()) continue
      const skill = await loadSkillFromDir({ dir, kind: 'extension', expectedId: name })
      if (!skill) continue

      let manifestExtra = null
      const manifestPath = path.join(dir, 'manifest.json')
      if (fs.existsSync(manifestPath)) {
        try {
          manifestExtra = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
        } catch {}
      }

      const mergedPerms = permSchema.mergeManifestPermissions(skill.manifest.permissions, manifestExtra?.permissions)
      const riskLevel = permSchema.calculateRiskLevel(mergedPerms)
      skill.manifest = { 
        ...skill.manifest, 
        ...manifestExtra, 
        permissions: mergedPerms, 
        _permSummary: permSchema.getPermissionSummary(mergedPerms), 
        _riskLevel: riskLevel 
      }

      state.extensions.set(skill.id, skill)

    }
  }

  async function refresh() {
    await loadBuiltins()
    await loadPackaged()
    await loadExtensions()
  }

  function getAll() {
    return [...state.builtins.values(), ...state.packaged.values(), ...state.extensions.values()]
  }

  function getEnabled() {
    return getAll().filter((s) => s.enabled)
  }

  function getById(skillId) {
    return state.builtins.get(skillId) || state.packaged.get(skillId) || state.extensions.get(skillId) || null
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

    const permSchema = createPermissionSchema()
    const perms = skill.manifest.permissions

    if (perms && permSchema.needsAnyPermission(perms)) {
      if (perms.process?.allowed === false) {
        return { ok: false, error: 'permission_denied', reason: 'process access denied', capability: 'process' }
      }
      if (perms.shell?.allowed === false) {
        return { ok: false, error: 'permission_denied', reason: 'shell access denied', capability: 'shell' }
      }
      if (perms.subprocess?.allowed === false) {
        return { ok: false, error: 'permission_denied', reason: 'subprocess execution denied', capability: 'subprocess' }
      }
      if (perms.network?.allowed === false) {
        return { ok: false, error: 'permission_denied', reason: 'network access denied', capability: 'network' }
      }
      if (perms.filesystem?.allowed === false) {
        return { ok: false, error: 'permission_denied', reason: 'filesystem access denied', capability: 'filesystem' }
      }
      if (perms.system_info?.allowed === false) {
        return { ok: false, error: 'permission_denied', reason: 'system info access denied', capability: 'system_info' }
      }
    }

    // Isolated execution for all non-builtins (extensions and packaged)
    if (skill.kind === 'extension' || skill.kind === 'packaged') {
      console.log(`[registry] Executing ${skillId} in isolated host...`)
      return extensionHostManager.execute(skillId, skill.dir, {
        input,
        context,
        manifest: skill.manifest,
        args,
        toolName
      })
    }

    return skill.execute({ content: input, context, manifest: skill.manifest, args, toolName })
  }




  async function executeHook(skillId, hookName, payload) {
    const skill = getById(skillId)
    const hook = skill?.hooks?.[hookName]
    if (!skill || !skill.enabled || typeof hook !== 'function') return null
    return hook({
      ...(payload || {}),
      manifest: skill.manifest
    })
  }

  function getSkillsWithHook(hookName) {
    return getEnabled().filter((skill) => typeof skill?.hooks?.[hookName] === 'function')
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
      manifest_version: skill.manifest.manifest_version || 1,
      permissions: skill.manifest.permissions || null,
      risk_level: skill.manifest._riskLevel || 'low',
      permission_summary: skill.manifest._permSummary || [],
      instructions: (skill.manifest.readme || skill.manifest.instructions || '').trim(),
      readme: (skill.manifest.readme || skill.manifest.instructions || '').trim(),
      version: skill.manifest.version || '1.0.0',
      author: skill.manifest.author || 'MomAI Team',
      tags: skill.manifest.tags || [],
      icon: skill.manifest.icon || null,
      compatibility: skill.manifest.compatibility || 'MomAI Node Core',
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

  return {
    initialize: refresh,
    refresh,
    loadBuiltins,
    loadExtensions,
    getAll,
    getEnabled,
    getById,
    discover,
    execute,
    executeHook,
    getSkillsWithHook,
    toListPayload,
    toOpenAITools,
    extensionsDir
  }
}

module.exports = { createSkillRegistry, parseSkillMarkdown }
