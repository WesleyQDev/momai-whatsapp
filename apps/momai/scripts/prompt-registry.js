const fs = require('node:fs')
const path = require('node:path')

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

  function loadPrompts() {
    const fallback = {
      version: 'fallback',
      default_persona: '',
      default_style: 'balanced',
      default_max_sentences: 6,
      memory_context_header: '{{sections}}',
      system_template:
        'Persona: {{assistant_persona}}\nStyle: {{response_style}}\nMax sentences: {{max_sentences}}\n{{memory_block}}\n{{tool_instruction}}',
      tiers: {
        lite: { response_style: 'balanced', max_sentences: 6, tier_instructions: '' },
        pro: { response_style: 'balanced', max_sentences: 6, tier_instructions: '' },
        ultra: { response_style: 'concise', max_sentences: 3, tier_instructions: '' }
      },
      fallback_replies: {
        empty: 'Por favor, envie uma mensagem para eu te ajudar.',
        greeting: 'Olá! Sou seu assistente MomAI. Como posso ajudar hoje?',
        reason: 'Fallback: {{summary}} ({{reason}}).',
        with_memory: 'Fallback com memoria: {{summary}}.',
        default: 'Fallback: {{summary}}.'
      }
    }

    try {
      if (!fs.existsSync(promptsFile)) {
        runtime.version = fallback.version
        runtime.loadedFromFile = false
        runtime.fallbackUsed = true
        return fallback
      }
      const parsed = JSON.parse(fs.readFileSync(promptsFile, 'utf8'))
      runtime.version = parsed.version || 'unknown'
      runtime.loadedFromFile = true
      runtime.fallbackUsed = false
      return { ...fallback, ...parsed, tiers: { ...fallback.tiers, ...(parsed.tiers || {}) } }
    } catch (error) {
      runtime.version = fallback.version
      runtime.loadedFromFile = false
      runtime.fallbackUsed = true
      runtime.lastError = error?.message || 'failed to load prompts.json'
      return fallback
    }
  }

  function buildSystemPrompt(input) {
    const prompts = loadPrompts()
    const tier = ['lite', 'pro', 'ultra'].includes(input.tier) ? input.tier : 'pro'
    const tierCfg =
      (prompts.tiers && prompts.tiers[tier]) || prompts.tiers.pro || prompts.tiers.lite || {}

    /* Se ha historico, substitui a saudacao de inicio por instrucao de NAO saudar */
    let rawInstructions = String(tierCfg.tier_instructions || '')
    if (input.hasHistory) {
      rawInstructions = rawInstructions
        .replace(
          /Greet( the user)? with a friendly sentence of at least 3 words and an emoji( only)? when starting( a conversation)?\./gi,
          'The conversation is already in progress. NEVER greet or introduce yourself - respond directly.'
        )
    }

    const vars = {
      assistant_persona: sanitize(input.persona || prompts.default_persona || ''),
      response_style: sanitize(
        input.responseStyle || tierCfg.response_style || prompts.default_style || 'balanced'
      ),
      max_sentences: Number.isFinite(Number(tierCfg.max_sentences))
        ? Number(tierCfg.max_sentences)
        : Number(prompts.default_max_sentences || 6),
      tier_instructions: sanitize(rawInstructions),
      response_language_block: sanitize(formatResponseLanguageInstruction(input.responseLanguage)),
      runtime_clock: sanitize(buildRuntimeClockContext()),
      memory_block: input.memoryContext ? `MEMORY CONTEXT:\n${sanitize(input.memoryContext)}` : '',
      tool_instruction: input.toolInstruction || ''
    }

    runtime.lastTier = tier
    runtime.lastFile = 'prompts.json'

    try {
      const template = String(tierCfg.system_template || prompts.system_template || '')
      runtime.lastError = null
      const rendered = replaceAll(template, vars)
      const withLanguagePolicy = rendered.includes('RESPONSE LANGUAGE POLICY')
        ? rendered
        : `${rendered}\n\n${vars.response_language_block}`

      if (withLanguagePolicy.includes('RUNTIME CLOCK')) return withLanguagePolicy
      return `${withLanguagePolicy}\n\n${vars.runtime_clock}`
    } catch (error) {
      runtime.fallbackUsed = true
      runtime.lastError = error?.message || 'prompt parse failed'
      return [
        `Persona: ${vars.assistant_persona || 'N/A'}`,
        `Response style: ${vars.response_style || 'balanced'}`,
        `Target max sentences: ${vars.max_sentences || 6}`,
        vars.response_language_block,
        vars.runtime_clock,
        vars.memory_block
      ]
        .filter(Boolean)
        .join('\\n\\n')
    }
  }

  function buildFallbackReply(input) {
    const prompts = loadPrompts()
    const templates = prompts.fallback_replies || {}
    const key = String(input?.key || 'default')
    const template = String(templates[key] || templates.default || 'Fallback: {{summary}}.')
    return replaceAll(template, {
      summary: sanitize(input?.summary || ''),
      reason: sanitize(input?.reason || '')
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
    const prompts = loadPrompts()
    const template = String(prompts.memory_context_header || '{{sections}}')
    return replaceAll(template, { sections: sanitize(String(sectionsText || '')) })
  }

  return {
    buildSystemPrompt,
    buildFallbackReply,
    getDefaults,
    getRuntimeStatus,
    formatMemoryContext
  }
}

module.exports = { createPromptRegistry }
