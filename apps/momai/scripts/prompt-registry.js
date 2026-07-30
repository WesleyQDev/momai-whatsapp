const fs = require('node:fs')
const path = require('node:path')
const { createMemoryFS, ALLOWED_FILENAMES } = require('./node-core/infrastructure/memory-fs')

function sanitize(text) {
  return String(text || '')
    .replace(/\{\{/g, '(')
    .replace(/\}\}/g, ')')
    .replace(/[{}]/g, '')
}

function replaceAll(template, vars) {
  let out = String(template || '')
  for (const [key, value] of Object.entries(vars)) {
    out = out.split(`{{${key}}}`).join(String(value ?? ''))
  }
  return out
}

function buildRuntimeClockContext() {
  const now = new Date()
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'local'
  const offsetMinutes = -now.getTimezoneOffset()
  const sign = offsetMinutes >= 0 ? '+' : '-'
  const abs = Math.abs(offsetMinutes)
  const hh = String(Math.floor(abs / 60)).padStart(2, '0')
  const mm = String(abs % 60).padStart(2, '0')
  const offset = `${sign}${hh}:${mm}`
  return [
    '# RUNTIME CLOCK',
    `Local datetime: ${now.toString()}`,
    `ISO datetime: ${now.toISOString()}`,
    `Timezone: ${timezone} (UTC${offset})`,
    'When the user asks current date/time, ALWAYS use this runtime clock context.'
  ].join('\n')
}

function formatResponseLanguageInstruction(languageTag) {
  const tag = String(languageTag || '').trim() || 'pt-BR'
  return [
    '# RESPONSE LANGUAGE POLICY',
    `Respond in the same language as the user's latest message (${tag}).`,
    'If the user switches language in a later message, switch your response language immediately.',
    'Do not explain this policy unless asked.'
  ].join('\n')
}

function createPromptRegistry({ promptsDir }) {
  const promptsFile = path.join(promptsDir, 'prompts.json')
  const runtime = {
    version: null,
    loadedFromFile: false,
    fallbackUsed: false,
    lastError: null,
    lastTier: null,
    lastFile: 'prompts.json'
  }

  let _promptsCache = null
  let _promptsMtime = 0

  function loadPrompts() {
    try {
      const stat = fs.existsSync(promptsFile) ? fs.statSync(promptsFile) : null
      if (_promptsCache && stat && stat.mtimeMs <= _promptsMtime) {
        return _promptsCache
      }
      const fallback = {
        version: 'fallback',
        default_persona: '',
        default_style: 'balanced',
        system_template:
          '{{stable_tier}}\n\n{{context_tier}}\n\n{{volatile_tier}}',
        tiers: {
          lite: { response_style: 'balanced', tier_instructions: '' },
          pro: { response_style: 'balanced', tier_instructions: '' },
          ultra: { response_style: 'concise', tier_instructions: '' }
        },
        fallback_replies: {
          empty: 'Por favor, envie uma mensagem para eu te ajudar.',
          greeting: 'Olá! Sou seu assistente MomAI. Como posso ajudar hoje?',
          reason: 'Fallback: {{summary}} ({{reason}}).',
          with_memory: 'Fallback com memoria: {{summary}}.',
          default: 'Fallback: {{summary}}.'
        }
      }
      if (!stat) {
        runtime.version = fallback.version
        runtime.loadedFromFile = false
        runtime.fallbackUsed = true
        _promptsCache = fallback
        return fallback
      }
      const parsed = JSON.parse(fs.readFileSync(promptsFile, 'utf8'))
      _promptsMtime = stat.mtimeMs
      runtime.version = parsed.version || 'unknown'
      runtime.loadedFromFile = true
      runtime.fallbackUsed = false
      _promptsCache = { ...fallback, ...parsed, tiers: { ...fallback.tiers, ...(parsed.tiers || {}) } }
      return _promptsCache
    } catch (error) {
      runtime.version = 'fallback'
      runtime.loadedFromFile = false
      runtime.fallbackUsed = true
      runtime.lastError = error?.message || 'failed to load prompts.json'
      return fallback
    }
  }

  let _systemPromptCache = null

  function getMemoriesMtime(memoriesDir) {
    if (!memoriesDir) return 0
    let maxMtime = 0
    for (const name of ALLOWED_FILENAMES) {
      const fp = path.join(memoriesDir, `${name}.md`)
      try {
        const stat = fs.statSync(fp)
        if (stat.mtimeMs > maxMtime) maxMtime = stat.mtimeMs
      } catch {}
    }
    return maxMtime
  }

  function buildStableTier(input) {
    const prompts = loadPrompts()
    const tier = ['lite', 'pro', 'ultra'].includes(input.tier) ? input.tier : 'pro'
    const tierCfg = (prompts.tiers && prompts.tiers[tier]) || prompts.tiers.pro || prompts.tiers.lite || {}

    let personaContent = ''
    if (input.memoriesDir && fs.existsSync(input.memoriesDir)) {
      try {
        const memFS = createMemoryFS({ memoriesDir: input.memoriesDir, userName: input.userName })
        const file = memFS.readMemoryFile('persona')
        if (file && file.content && file.content.trim()) {
          personaContent = file.content.trim()
        }
      } catch {}
    }

    if (!personaContent) {
      personaContent = (input.persona && input.persona !== 'MomAI' ? input.persona : '') || prompts.default_persona || ''
    }

    const lines = [
      `You are MomAI, ${sanitize(input.userName || 'Usuário')}'s assistant.`,
      personaContent ? sanitize(personaContent) : '',
      '- Be warm, natural, and helpful.',
      '- Use skills listed when relevant.',
      '- When using a tool, execute the tool call directly without outputting preliminary intro text or chatter beforehand.',
      tierCfg.tier_instructions ? sanitize(String(tierCfg.tier_instructions)) : ''
    ]
    const uniqueLines = [...new Set(lines.filter(Boolean))]
    return uniqueLines.join('\n')
  }

  function buildContextTier(input) {
    const memoriesDir = input.memoriesDir || path.join(process.cwd(), 'data', 'memories')
    if (!fs.existsSync(memoriesDir)) return ''
    let memFS
    try {
      memFS = createMemoryFS({ memoriesDir })
    } catch {
      return ''
    }
    const sections = []
    for (const name of ALLOWED_FILENAMES) {
      if (name === 'persona') continue // Skip persona.md as persona is already in stable tier
      const file = memFS.readMemoryFile(name)
      if (!file.content.trim()) continue
      const label = name === 'usuario' ? '-- User Profile --' : '-- Known Facts --'
      const lines = file.content
        .split('\n')
        .map((l) => l.replace(/^#+\s*.*$/, '').trim())
        .filter((l) => l && l !== '-' && l !== '§')
      if (lines.length === 0) continue
      const formatted = lines.map((l) => (l.startsWith('-') ? l : `- ${l}`)).join('\n')
      sections.push(`${label}\n${formatted}`)
    }
    if (sections.length === 0) return ''
    return ['', sections.join('\n\n'), ''].join('\n')
  }

  function buildVolatileTier(input) {
    return input.hasHistory ? '' : 'This is a new conversation — greet naturally.'
  }

  function buildSystemPrompt(input) {
    // Phase 1: check non-memory cache fields (no I/O)
    const cacheKey = `${input.threadId || 'default'}:${input.userName || ''}:${input.persona || ''}:${input.locale || ''}:${input.tier || 'pro'}`

    // Volatile is ALWAYS rebuilt every call (greeting policy, timestamp, model info)
    const volatileTier = buildVolatileTier({
      threadId: input.threadId || 'default',
      modelName: input.modelName || 'local',
      tier: input.tier || 'pro',
      locale: input.locale || 'pt-BR',
      hasHistory: !!input.hasHistory
    })

    let stable, context
    if (_systemPromptCache && _systemPromptCache.cacheKey === cacheKey) {
      const memoriesMtime = getMemoriesMtime(input.memoriesDir)
      if (_systemPromptCache.memoriesMtime === memoriesMtime) {
        stable = _systemPromptCache.stable
        context = _systemPromptCache.context
      } else {
        stable = buildStableTier({
          userName: input.userName,
          persona: input.persona,
          responseStyle: input.responseStyle,
          tier: input.tier,
          memoriesDir: input.memoriesDir
        })
        context = buildContextTier({ memoriesDir: input.memoriesDir })
        _systemPromptCache = { cacheKey, memoriesMtime, stable, context }
      }
    } else {
      const memoriesMtime = getMemoriesMtime(input.memoriesDir)
      stable = buildStableTier({
        userName: input.userName,
        persona: input.persona,
        responseStyle: input.responseStyle,
        tier: input.tier,
        memoriesDir: input.memoriesDir
      })
      context = buildContextTier({ memoriesDir: input.memoriesDir })
      _systemPromptCache = { cacheKey, memoriesMtime, stable, context }
    }

    const base = [stable, context, volatileTier].filter(Boolean).join('\n\n')
    const languagePolicy = formatResponseLanguageInstruction(input.responseLanguage || 'pt-BR')
    const clock = buildRuntimeClockContext()
    return [base, languagePolicy, clock].join('\n\n')
  }

  function buildFallbackReply(input) {
    const prompts = loadPrompts()
    const templates = prompts.fallback_replies || {}
    const key = String(input?.key || 'default')
    const template = String(templates[key] || templates.default || 'Fallback: {{summary}}.')
    return replaceAll(template, {
      summary: sanitize(input?.summary || ''),
      reason: sanitize(input?.reason || ''),
      user_name: sanitize(input?.userName || 'Usuário')
    })
  }

  function getDefaults() {
    const prompts = loadPrompts()
    return {
      assistant_persona: String(prompts.default_persona || '')
    }
  }

  function getRuntimeStatus() {
    return {
      prompt_version: runtime.version,
      loaded_from_file: runtime.loadedFromFile,
      fallback_used: runtime.fallbackUsed,
      last_error: runtime.lastError,
      last_tier: runtime.lastTier,
      last_file: runtime.lastFile
    }
  }

  function formatMemoryContext(sectionsText) {
    return String(sectionsText || '').trim()
  }

  return {
    buildSystemPrompt,
    buildFallbackReply,
    getDefaults,
    getRuntimeStatus,
    formatMemoryContext,
    buildStableTier,
    buildContextTier,
    buildVolatileTier
  }
}

module.exports = { createPromptRegistry }
