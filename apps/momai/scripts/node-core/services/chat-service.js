const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const shared = require('./shared-state')
const store = shared.store
const llamaState = shared.llamaState
const semanticState = shared.semanticState

function getSkillRegistry() {
  return shared.skillRegistry
}

function getPromptRegistry() {
  return shared.promptRegistry
}
const { debug, info, warn } = require('../infrastructure/logger')
const { sendSseHeaders, writeSse } = require('../infrastructure/http-helpers')
const { splitTokens, sanitizePromptText } = require('../utils/text')
const { isoNow } = require('../utils/time')
const { ensureLlamaReady, getLlamaBaseUrl, saveStore } = require('./llama-manager')
const { runSemanticMemoryRetrieval, getTop5SkillsSemantic } = require('./semantic-engine')
const { isSkillEnabledByStore, getEnabledSkills } = require('./skill-orchestrator')
const { triggerAutoTts, ensurePython, broadcast } = require('./tts-service')
const { DEFAULT_TIERS, loadTierConfig } = require('../config/tiers')
const { DATA_DIR, NOTES_DIR, NOTES_INDEX_FILE } = require('../config/constants')

const tiersConfig = loadTierConfig()

let stopGenerationRequested = false
let stopVoiceRequested = false
const activeChatControllers = new Set()

function estimateTokenCount(text) {
  const safe = String(text || '')
  if (!safe) return 0
  return Math.max(1, Math.ceil(safe.length / 4))
}

function getThreadMessages(threadId) {
  if (!store.thread_messages[threadId]) {
    store.thread_messages[threadId] = []
  }
  return store.thread_messages[threadId]
}

function appendMessage(threadId, role, content, extras = {}) {
  const messages = getThreadMessages(threadId)
  const item = {
    id: store.next_message_id++,
    role,
    content,
    created_at: isoNow(),
    sources: extras.sources ? JSON.stringify(extras.sources) : null,
    snippets: extras.snippets ? JSON.stringify(extras.snippets) : null,
    cards: extras.cards ? JSON.stringify(extras.cards) : null,
    graph_data: extras.graph_data || null,
    structured_response: extras.structured_response
      ? JSON.stringify(extras.structured_response)
      : null
  }
  messages.push(item)
  saveStore()
  return item
}

function ensureNotesIndexExists() {
  if (!fs.existsSync(NOTES_DIR)) {
    fs.mkdirSync(NOTES_DIR, { recursive: true })
  }
  if (!fs.existsSync(NOTES_INDEX_FILE)) {
    fs.writeFileSync(NOTES_INDEX_FILE, JSON.stringify([], null, 2), 'utf8')
  }
}

function saveMemoryNoteFromContent(content) {
  ensureNotesIndexExists()
  const titleLine =
    String(content || '')
      .trim()
      .split('\n')[0] || 'Nota'
  const title = titleLine.replace(/^#+\s*/, '').slice(0, 80) || 'Nota'
  const id = crypto.randomUUID()
  const relPath = `notes/${id}.md`
  const absPath = path.join(DATA_DIR, relPath)
  fs.writeFileSync(absPath, String(content || '').trim() || 'Nota vazia.', 'utf8')

  const index = JSON.parse(fs.readFileSync(NOTES_INDEX_FILE, 'utf8'))
  index.push({
    id,
    title,
    path: relPath,
    source: 'local',
    created_at: isoNow(),
    updated_at: isoNow(),
    preview: String(content || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 220)
  })
  fs.writeFileSync(NOTES_INDEX_FILE, JSON.stringify(index, null, 2), 'utf8')
  return { id, title, path: relPath }
}

async function searchWeb(query, limit = 4) {
  const q = encodeURIComponent(String(query || '').trim())
  if (!q) return []
  try {
    const response = await fetch(`https://duckduckgo.com/html/?q=${q}`, {
      method: 'GET',
      headers: {
        'User-Agent': 'MomAI-NodeCore/1.0'
      }
    })
    if (!response.ok) return []
    const html = await response.text()
    const results = []
    const regex = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi
    let match
    while ((match = regex.exec(html)) && results.length < limit) {
      const rawUrl = String(match[1] || '')
      const title = String(match[2] || '')
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim()
      if (!title || !rawUrl) continue
      results.push({ title, url: rawUrl })
    }
    return results
  } catch {
    return []
  }
}

const LATIN_LANGUAGE_HINTS = {
  'pt-BR': [
    'oi',
    'ola',
    'olá',
    'você',
    'voce',
    'pra',
    'não',
    'nao',
    'como',
    'obrigado',
    'obrigada',
    'tudo bem',
    'quero'
  ],
  en: [
    'hello',
    'hi',
    'please',
    'thanks',
    'thank you',
    'can you',
    'could you',
    'what',
    'why',
    'how',
    'the',
    'and'
  ],
  es: [
    'hola',
    'gracias',
    'por favor',
    'puedes',
    'puede',
    'como',
    'cómo',
    'necesito',
    'quiero',
    'que',
    'qué'
  ],
  fr: [
    'bonjour',
    'merci',
    "s'il vous plait",
    "s'il te plait",
    'comment',
    'pourquoi',
    'je',
    'vous',
    'avec',
    'aide'
  ],
  de: ['hallo', 'danke', 'bitte', 'ich', 'du', 'sie', 'wie', 'warum', 'kannst', 'hilfe'],
  it: ['ciao', 'grazie', 'per favore', 'come', 'perché', 'puoi', 'voglio', 'aiuto']
}

function normalizeLanguageTag(tag) {
  const raw = String(tag || '').trim()
  if (!raw) return 'pt-BR'
  const short = raw.toLowerCase().split('-')[0]

  if (short === 'pt') return 'pt-BR'
  if (short === 'en') return 'en'
  if (short === 'es') return 'es'
  if (short === 'fr') return 'fr'
  if (short === 'de') return 'de'
  if (short === 'it') return 'it'
  if (short === 'ja') return 'ja'
  if (short === 'ko') return 'ko'
  if (short === 'zh') return 'zh-CN'
  if (short === 'ru') return 'ru'
  if (short === 'ar') return 'ar'
  if (short === 'hi') return 'hi'

  return 'pt-BR'
}

function detectLanguageTag(text) {
  const value = String(text || '').trim()
  if (!value) return 'und'

  if (/[\u3040-\u30ff]/.test(value)) return 'ja'
  if (/[\uac00-\ud7af]/.test(value)) return 'ko'
  if (/[\u4e00-\u9fff]/.test(value)) return 'zh-CN'
  if (/[\u0400-\u04ff]/.test(value)) return 'ru'
  if (/[\u0600-\u06ff]/.test(value)) return 'ar'
  if (/[\u0900-\u097f]/.test(value)) return 'hi'

  const normalized = value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

  const scores = {}
  for (const [lang, hints] of Object.entries(LATIN_LANGUAGE_HINTS)) {
    let score = 0
    for (const hint of hints) {
      const safe = hint.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const regex = new RegExp(`(^|\\s)${safe}(\\s|$)`, 'i')
      if (regex.test(normalized)) score += 1
    }
    scores[lang] = score
  }

  if (/[ãõç]/i.test(value)) scores['pt-BR'] += 1
  if (/[ñ]/i.test(value)) scores.es += 1
  if (/[ß]/i.test(value)) scores.de += 1

  let bestLang = 'und'
  let bestScore = 0
  for (const [lang, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score
      bestLang = lang
    }
  }

  return bestScore > 0 ? bestLang : 'und'
}

function resolveResponseLanguage(content, threadId) {
  const fromContent = detectLanguageTag(content)
  if (fromContent !== 'und') return normalizeLanguageTag(fromContent)

  const messages = getThreadMessages(threadId)
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i]
    if (!msg || msg.role !== 'user') continue
    const detected = detectLanguageTag(msg.content)
    if (detected !== 'und') return normalizeLanguageTag(detected)
  }

  return normalizeLanguageTag(store.settings.locale || 'pt-BR')
}

function buildLocalizedFallbackReply({ key, summary, reason, language }) {
  const lang = normalizeLanguageTag(language)
  const safeSummary = String(summary || '').trim()
  const safeReason = String(reason || '').trim() || 'unknown reason'

  if (lang === 'pt-BR') {
    if (key === 'empty') return 'Me envie uma pergunta e eu te ajudo.'
    if (key === 'greeting') return 'Oi! Estou online. Como posso te ajudar agora?'
    if (key === 'reason')
      return `O modelo local ficou indisponível no momento (${safeReason}). Posso tentar novamente em seguida.`
    if (key === 'with_memory')
      return `Entendi seu pedido: "${safeSummary}". Também considerei o contexto das suas notas locais.`
    return `Entendi seu pedido: "${safeSummary}". Vou seguir com isso.`
  }

  if (lang === 'en') {
    if (key === 'empty') return 'Send me a question and I will help you.'
    if (key === 'greeting') return 'Hi! I am online. How can I help you now?'
    if (key === 'reason')
      return `Local model unavailable right now (${safeReason}). Fallback reply for: "${safeSummary}".`
    if (key === 'with_memory')
      return `Got it: "${safeSummary}". I also considered your local notes context.`
    return `Got it: "${safeSummary}". I will proceed with that.`
  }

  if (lang === 'es') {
    if (key === 'empty') return 'Enviame una pregunta y te ayudare.'
    if (key === 'greeting') return 'Hola! Estoy en linea. Como puedo ayudarte ahora?'
    if (key === 'reason')
      return `Modelo local no disponible en este momento (${safeReason}). Respuesta de respaldo para: "${safeSummary}".`
    if (key === 'with_memory')
      return `Entendi tu pedido: "${safeSummary}". Tambien considere el contexto de tus notas locales.`
    return `Entendi tu pedido: "${safeSummary}". Voy a continuar con eso.`
  }

  const promptRegistry = getPromptRegistry()
  if (!promptRegistry || typeof promptRegistry.buildFallbackReply !== 'function') {
    return safeSummary
  }
  return promptRegistry.buildFallbackReply({ key, summary: safeSummary, reason: safeReason })
}

function humanizeFallbackReason(reason, language = 'pt-BR') {
  const raw = String(reason || '').toLowerCase()
  const lang = normalizeLanguageTag(language)
  const isPt = lang === 'pt-BR'

  if (raw.includes('exceeds the available context size') || raw.includes('exceed_context_size')) {
    return isPt
      ? 'o contexto da conversa ficou maior que o limite atual'
      : 'the conversation context is larger than the current limit'
  }
  if (raw.includes('healthcheck timeout')) {
    return isPt ? 'o modelo local demorou para iniciar' : 'the local model took too long to start'
  }
  if (raw.includes('llama unavailable')) {
    return isPt ? 'o modelo local não ficou disponível' : 'the local model is unavailable'
  }
  return isPt ? 'falha temporária no modelo local' : 'temporary local model failure'
}

function trimMessageForContext(text, maxChars = 900) {
  const clean = sanitizePromptText(String(text || '').trim())
  if (clean.length <= maxChars) return clean
  return `${clean.slice(0, maxChars)}...`
}

function buildCompactedMessages(systemMessage, currentMessages, userContent = '') {
  const compactSystem = {
    ...systemMessage,
    content: trimMessageForContext(systemMessage.content, 1200)
  }
  const compactHistory = currentMessages
    .filter((m) => m.role !== 'system')
    .slice(-2)
    .map((m) => ({ ...m, content: trimMessageForContext(m.content, 700) }))
  const hasUser = compactHistory.some((m) => m.role === 'user')
  if (!hasUser) {
    compactHistory.push({
      role: 'user',
      content: trimMessageForContext(userContent, 700)
    })
  }
  return [compactSystem, ...compactHistory]
}

function buildHistoryWithinBudget(messages, tokenBudget) {
  const safeBudget = Math.max(200, Number(tokenBudget || 0))
  const normalized = (Array.isArray(messages) ? messages : [])
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant'))
    .map((m) => {
      const maxChars = m.role === 'assistant' ? 520 : 820
      return {
        role: m.role,
        content: trimMessageForContext(m.content, maxChars)
      }
    })

  const picked = []
  let consumed = 0
  let hasUser = false

  for (let i = normalized.length - 1; i >= 0; i -= 1) {
    const msg = normalized[i]
    const cost = estimateTokenCount(msg.content)
    if (picked.length > 0 && consumed + cost > safeBudget) continue
    picked.unshift(msg)
    consumed += cost
    if (msg.role === 'user') hasUser = true
    if (consumed >= safeBudget) break
  }

  if (!hasUser) {
    const lastUser = [...normalized].reverse().find((m) => m.role === 'user')
    if (lastUser) picked.push(lastUser)
  }

  return picked
}

function shouldPreferSilentForCodeRequest(userText) {
  const text = String(userText || '').toLowerCase()
  if (!text) return false
  return /(c[óo]digo|code|html|css|javascript|typescript|react|vue|angular|sql|python|java|c\+\+|snippet)/i.test(
    text
  )
}

function containsCodeLikeContent(text) {
  const value = String(text || '')
  if (!value) return false
  if (/```[\s\S]*?```/.test(value)) return true
  if (/```/.test(value)) return true
  if (/<html[\s>]/i.test(value) || /<!doctype html>/i.test(value)) return true
  if (/<(div|span|section|header|main|script|style)[\s>]/i.test(value)) return true
  return false
}

function computeDynamicMaxTokens(tierMaxTokens, estimatedPromptTokens, contextTotalTokens) {
  const total = Math.max(512, Number(contextTotalTokens || 2048))
  const prompt = Math.max(0, Number(estimatedPromptTokens || 0))
  const reserve = Math.max(96, Math.floor(total * 0.06))
  const available = Math.max(64, total - prompt - reserve)
  const hardCap = Math.max(256, Math.min(3072, Math.floor(total * 0.35)))
  const desired =
    total >= 12000 ? Math.max(Number(tierMaxTokens || 0), 1200)
      : total >= 8000 ? Math.max(Number(tierMaxTokens || 0), 900)
      : Math.max(Number(tierMaxTokens || 0), 600)

  const candidate = Math.min(available, hardCap)
  if (candidate >= desired) return desired
  if (candidate >= 160) return candidate
  return Math.max(64, candidate)
}

function isLikelyIncompleteResponse(text, finishReason) {
  const value = String(text || '').trim()
  if (!value) return false
  if (String(finishReason || '').toLowerCase() === 'length') return true

  const fenceMatches = value.match(/```/g)
  const fenceCount = fenceMatches ? fenceMatches.length : 0
  if (fenceCount % 2 !== 0) return true

  if (/<html[\s>]/i.test(value) && !/<\/html>/i.test(value)) return true
  if (/<body[\s>]/i.test(value) && !/<\/body>/i.test(value)) return true

  if (/[{[(]$/.test(value)) return true
  if (/[,:;]$/.test(value) && value.length > 120) return true

  return false
}

function generateFallbackReply(content, memoryContext, reason, responseLanguage) {
  const trimmed = String(content || '').trim()
  if (!trimmed) {
    return buildLocalizedFallbackReply({ key: 'empty', language: responseLanguage })
  }

  if (/^(oi|ol[aá]|bom dia|boa tarde|boa noite|hello|hi|hola|buenas)\b/i.test(trimmed)) {
    return buildLocalizedFallbackReply({ key: 'greeting', language: responseLanguage })
  }

  const summary = trimmed.length > 320 ? `${trimmed.slice(0, 320)}...` : trimmed
  const hasMemory = typeof memoryContext === 'string' && memoryContext.trim().length > 0

  if (reason) {
    return buildLocalizedFallbackReply({
      key: 'reason',
      summary,
      reason,
      language: responseLanguage
    })
  }
  if (hasMemory) {
    return buildLocalizedFallbackReply({ key: 'with_memory', summary, language: responseLanguage })
  }
  return buildLocalizedFallbackReply({ key: 'default', summary, language: responseLanguage })
}

async function streamFallbackResponse(
  req,
  res,
  content,
  threadId,
  memoryContext,
  memorySources,
  reason = null,
  responseLanguage = 'pt-BR'
) {
  appendMessage(threadId, 'user', content, { sources: memorySources })
  const reply = generateFallbackReply(content, memoryContext, reason, responseLanguage)
  const tokens = splitTokens(reply)
  const fallbackUsed = estimateTokenCount(content) + estimateTokenCount(memoryContext) + estimateTokenCount(reply)
  llamaState.contextUsedTokens = Math.min(
    Number(llamaState.contextTotalTokens || 8192),
    Math.max(0, fallbackUsed)
  )

  stopGenerationRequested = false
  sendSseHeaders(res)
  writeSse(res, { status: 'thinking' })
  writeSse(res, { status: 'responding' })

  let assembled = ''
  let closed = false
  req.on('close', () => {
    closed = true
  })

  for (const token of tokens) {
    if (closed || stopGenerationRequested) break
    assembled += token
    writeSse(res, { token })
    await new Promise((r) => setTimeout(r, 15))
  }

  appendMessage(threadId, 'assistant', assembled.trim() || 'Interrompido.')
  writeSse(res, { done: true })
  res.end()
}

function parseLlamaDataLine(line) {
  const payload = line.replace(/^data:\s*/, '').trim()
  if (!payload) return { type: 'skip' }
  if (payload === '[DONE]') return { type: 'done' }

  try {
    const json = JSON.parse(payload)
    if (json.error?.message) return { type: 'error', error: json.error.message }

    const choice = json.choices?.[0]
    const finishReason = choice?.finish_reason

    const delta = choice?.delta?.content
    const full = choice?.message?.content
    const token = typeof delta === 'string' ? delta : typeof full === 'string' ? full : ''

    const toolCalls = choice?.delta?.tool_calls
    if (Array.isArray(toolCalls) && toolCalls.length > 0) {
      return { type: 'tool_calls', tool_calls: toolCalls, finish_reason: finishReason }
    }

    if (finishReason === 'tool_calls' && choice?.message?.tool_calls) {
      return {
        type: 'tool_calls',
        tool_calls: choice.message.tool_calls,
        finish_reason: finishReason
      }
    }

    if (!token) return { type: 'skip', finish_reason: finishReason }
    return { type: 'token', token, finish_reason: finishReason }
  } catch {
    return { type: 'skip' }
  }
}

async function streamLlamaChat(req, res, payload) {
  const content = String(payload.content || '')
  const threadId = String(payload.thread_id || 'default')
  const responseLanguage = resolveResponseLanguage(content, threadId)
  const fallbackLanguage = normalizeLanguageTag(store.settings.locale || 'pt-BR')
  const speakResponse = payload.speak_response !== false
  const silentForCodeIntent = shouldPreferSilentForCodeRequest(content)
  const tierName = store.settings.ai_tier || 'pro'
  const isUltra = tierName === 'ultra'
  let memoryContext = typeof payload.memory_context === 'string' ? payload.memory_context : null
  let memorySources = Array.isArray(payload.memory_sources) ? [...payload.memory_sources] : []
  let toolSteps = []
  let activeSkill = null

  debug(
    `[chat] streamLlamaChat called: tier=${tierName}, content="${content.slice(0, 60)}", thread=${threadId}`
  )
  debug(
    `[chat] llamaState BEFORE ensureLlamaReady: ready=${llamaState.ready}, starting=${llamaState.starting}, lastError=${llamaState.lastError}, process=${!!llamaState.process}, port=${llamaState.port}`
  )
  const ready = await ensureLlamaReady()
  debug(
    `[chat] ensureLlamaReady returned: ${ready}, llamaState.ready=${llamaState.ready}, lastError=${llamaState.lastError}`
  )
  if (!ready) {
    warn(`[chat] FALLBACK triggered! reason=${llamaState.lastError || 'llama unavailable'}`)
    await streamFallbackResponse(
      req,
      res,
      content,
      threadId,
      memoryContext,
      memorySources.length ? memorySources : undefined,
      humanizeFallbackReason(llamaState.lastError || 'llama unavailable', fallbackLanguage),
      fallbackLanguage
    )
    return
  }

  if (isUltra) {
    const { syncSkillAndToolIndexes, syncNoteIndex } = require('./semantic-engine')
    syncSkillAndToolIndexes(false).catch(() => {})
    syncNoteIndex(false).catch(() => {})

    const semantic = await runSemanticMemoryRetrieval(content, 6)
    if (semantic.memoryContext) {
      memoryContext = memoryContext
        ? `${memoryContext}\n\n${semantic.memoryContext}`
        : semantic.memoryContext
    }

    if (Array.isArray(semantic.memorySources) && semantic.memorySources.length) {
      const byUrl = new Map()
      for (const source of [...memorySources, ...semantic.memorySources]) {
        if (!source || !source.url) continue
        byUrl.set(source.url, source)
      }
      memorySources = [...byUrl.values()].slice(0, 10)
    }
  }

  appendMessage(threadId, 'user', content, {
    sources: memorySources.length ? memorySources : undefined,
    graph_data: null
  })

  sendSseHeaders(res)
  writeSse(res, { status: 'thinking' })
  if (memorySources.length) {
    writeSse(res, { sources: memorySources })
    writeSse(res, { memory_sources: memorySources })
  }

  const baseCtx = Number(llamaState.contextTotalTokens || 2048)
  const dynamicHistoryBudget = Math.max(450, Math.floor(baseCtx * 0.62))
  const history = buildHistoryWithinBudget(getThreadMessages(threadId), dynamicHistoryBudget).map(
    (msg) => ({
      role: msg.role === 'assistant' ? 'assistant' : 'user',
      content: sanitizePromptText(String(msg.content || ''))
    })
  )

  const responseStyle = tierName === 'ultra' ? 'concise' : 'balanced'
  const promptRegistry = getPromptRegistry()

  const tier = tiersConfig[tierName] || tiersConfig.pro || DEFAULT_TIERS.pro

  const controller = new AbortController()
  activeChatControllers.add(controller)
  stopGenerationRequested = false
  stopVoiceRequested = false

  // Stop any ongoing TTS when starting a new message
  try {
    const pythonBase = await ensurePython()
    await fetch(`${pythonBase}/chat/stop-voice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (error) {
    // TTS might not be available, ignore
  }

  let closed = false
  req.on('close', () => {
    closed = true
    controller.abort()
  })

  let assembled = ''
  let bufferedStructuredResponse = null
  let ttsCursor = 0
  let ttsChain = Promise.resolve()
  const prebufferChars = Math.max(40, Number(store.settings.prebuffer_chars || 90))

  const enqueueAutoTts = (chunk) => {
    const cleaned = String(chunk || '').trim()
    if (cleaned.length < 2) return
    ttsChain = ttsChain.then(() => triggerAutoTts(cleaned)).catch(() => {})
  }

  const flushTtsChunks = (final = false) => {
    if (!speakResponse || silentForCodeIntent || stopGenerationRequested || closed) return
    if (containsCodeLikeContent(assembled)) return
    const pending = assembled.slice(ttsCursor)
    if (!pending) return
    if (!final && pending.length < prebufferChars) return

    let cut = -1
    for (let i = pending.length - 1; i >= 0; i -= 1) {
      const ch = pending[i]
      if (ch === '.' || ch === '!' || ch === '?' || ch === '\n' || ch === ';' || ch === ':') {
        cut = i + 1
        break
      }
    }

    if (!final && cut <= 0) return
    if (final && cut <= 0) cut = pending.length

    const chunk = pending.slice(0, cut).trim()
    ttsCursor += cut
    enqueueAutoTts(chunk)
  }

  let messages = [...history]
  let maxToolRounds = 3
  let round = 0
  let estimatedPromptTokens = estimateTokenCount(content) + estimateTokenCount(memoryContext)
  let lastSystemMessage = null
  let lastCurrentMessages = []
  let lastFinishReason = null
  const activeHookSessions = []

  try {
    const skillRegistry = getSkillRegistry()
    const beforeHookSkills = skillRegistry?.getSkillsWithHook?.('beforeModel') || []
    let disableToolsForTurn = false
    let extraSystemInstructions = []

    for (const skill of beforeHookSkills) {
      try {
        const hookResult = await skillRegistry.executeHook(skill.id, 'beforeModel', {
          content,
          args: { query: content, path: payload.path },
          context: {
            threadId,
            responseLanguage,
            memoryContext,
            searchWeb
          }
        })
        if (!hookResult?.active) continue
        activeHookSessions.push({ skillId: skill.id, beforeModel: hookResult })
        if (hookResult.contextInstruction) {
          memoryContext = memoryContext
            ? `${memoryContext}\n\n${hookResult.contextInstruction}`
            : hookResult.contextInstruction
        }
        if (hookResult.systemInstruction) {
          extraSystemInstructions.push(String(hookResult.systemInstruction))
        }
        if (hookResult.disableTools) {
          disableToolsForTurn = true
        }
        if (hookResult.step) {
          toolSteps.push({
            skill_id: skill.id,
            skill_name: skill.manifest.name,
            tool: hookResult.step.tool || 'hook',
            name: hookResult.step.name || 'beforeModel',
            description: String(hookResult.step.description || ''),
            status: 'success',
            started_at: isoNow()
          })
          activeSkill = activeSkill || skill.id
        }
        if (hookResult.shortCircuit) {
          if (activeSkill) {
            writeSse(res, { active_skill: activeSkill })
          }
          if (toolSteps.length > 0) {
            writeSse(res, { tool_steps: toolSteps })
          }
          const shortText = String(hookResult.replaceText || '').trim()
          if (shortText) {
            assembled = shortText
            for (const token of splitTokens(shortText)) {
              writeSse(res, { token })
            }
          }
          if (hookResult.structuredResponse) {
            bufferedStructuredResponse = hookResult.structuredResponse
          }
          llamaState.contextUsedTokens = Math.min(
            Number(llamaState.contextTotalTokens || 8192),
            Math.max(
              0,
              estimateTokenCount(content) +
                estimateTokenCount(memoryContext) +
                extraSystemInstructions.reduce((acc, item) => acc + estimateTokenCount(item), 0)
            )
          )
          appendMessage(threadId, 'assistant', assembled.trim(), {
            sources: memorySources.length ? memorySources : undefined,
            graph_data:
              activeSkill || toolSteps.length
                ? { active_skill: activeSkill, tool_steps: toolSteps }
                : null,
            structured_response: bufferedStructuredResponse || undefined
          })
          if (bufferedStructuredResponse) {
            writeSse(res, { structured_response: bufferedStructuredResponse })
          }
          writeSse(res, { done: true })
          res.end()
          return
        }
      } catch (err) {
        debug(`[chat] beforeModel hook failed for ${skill.id}: ${err.message}`)
      }
    }

    let directSkillResult = null

    while (round < maxToolRounds) {
      round++

      let toolsPayload = []
      {
        let top5SkillIds = []

        if (isUltra) {
          top5SkillIds = await getTop5SkillsSemantic(content)
        }

        /* Fallback: if semantic search returned no skills (embedding not ready or non-ultra),
           use lexical discovery from the skill registry */
        if (top5SkillIds.length === 0 && skillRegistry && typeof skillRegistry.discover === 'function') {
          const discovered = skillRegistry.discover(content)
          if (discovered) {
            debug(`[chat] Lexical discovery found "${discovered.id}" (confidence=${discovered.confidence})`)
            top5SkillIds.push(discovered.id)

            /* High-confidence direct execution: if confidence is very high,
               execute the skill immediately without waiting for LLM tool calling.
               This is more reliable with small models that struggle with function calling. */
            if (discovered.confidence >= 0.8 && skillRegistry.execute) {
              try {
                const skillInput = content
                const runtimeContext = {
                  listActiveReminders(limit = 8) {
                    return store.reminders
                      .filter((r) => r.is_active)
                      .sort(
                        (a, b) =>
                          new Date(a.scheduled_time).getTime() - new Date(b.scheduled_time).getTime()
                      )
                      .slice(0, limit)
                  },
                  createReminderFromText(text) {
                    const {
                      parseRelativeReminder,
                      extractReminderTitle,
                      normalizeReminder
                    } = require('./reminder-service')
                    const rawText = String(text || '').trim()
                    const scheduled =
                      parseRelativeReminder(rawText) ||
                      new Date(Date.now() + 60 * 60 * 1000).toISOString()
                    const title = extractReminderTitle(rawText)
                    const reminder = normalizeReminder({
                      id: store.next_reminder_id++,
                      title: title || 'Lembrete',
                      content: rawText,
                      scheduled_time: scheduled,
                      is_active: true,
                      created_at: isoNow()
                    })
                    store.reminders.push(reminder)
                    saveStore()
                    broadcast({ type: 'reminders_updated' })
                    return reminder
                  },
                  deleteRemindersByIds(ids) {
                    const idSet = new Set(Array.isArray(ids) ? ids : [ids])
                    const initialCount = store.reminders.length
                    store.reminders = store.reminders.filter((r) => !idSet.has(r.id))
                    const changed = store.reminders.length !== initialCount
                    if (changed) {
                      saveStore()
                      broadcast({ type: 'reminders_updated' })
                    }
                    return { success: changed, count: initialCount - store.reminders.length }
                  },
                  searchWeb
                }
                directSkillResult = await skillRegistry.execute(
                  discovered.id,
                  skillInput,
                  runtimeContext,
                  { query: content },
                  null
                )
                debug(`[chat] Direct skill execution result: hasStructured=${!!directSkillResult?.structuredResponse}`)
                if (directSkillResult?.structuredResponse) {
                  bufferedStructuredResponse = directSkillResult.structuredResponse
                }
                const discoveredSkill = getSkillRegistry()?.getById?.(discovered.id)
                const directStep = {
                  skill_id: discovered.id,
                  skill_name: discoveredSkill?.manifest?.name || discovered.id,
                  tool: 'skill_execute',
                  name: `skill:${discovered.id}`,
                  description: String(
                    discoveredSkill?.manifest?.description ||
                      'Execução direta de skill por detecção lexical.'
                  ),
                  status: directSkillResult ? 'success' : 'error',
                  started_at: isoNow()
                }
                toolSteps.push(directStep)
                activeSkill = discovered.id
                writeSse(res, { active_skill: activeSkill })
                writeSse(res, { tool_steps: toolSteps })
              } catch (execErr) {
                debug(`[chat] Direct skill execution failed: ${execErr.message}`)
              }
            }
          }
        }

        if (skillRegistry && typeof skillRegistry.toOpenAITools === 'function') {
          toolsPayload = disableToolsForTurn ? [] : skillRegistry.toOpenAITools(top5SkillIds)
        }
      }

      /* Build tool instruction for the system prompt */
      let toolInstruction = null
      if (toolsPayload.length > 0) {
        const toolDescs = toolsPayload
          .map((t) => {
            const name = t.function?.name || t.name
            const desc = t.function?.description || t.description
            return desc ? `- ${name}: ${desc}` : `- ${name}`
          })
          .filter(Boolean)
        toolInstruction = [
          '# AVAILABLE TOOLS',
          'You have access to the following tools. Prefer calling a relevant tool when it materially improves correctness, safety, or execution of the task.',
          '',
          ...toolDescs,
          '',
          '# EXAMPLES',
          'User: "Abrir pasta dev"',
          'Your response (tool_calls):',
          '<tool_call>{"name":"search_programs","arguments":{"query":"dev"}}</tool_call>',
          '',
          'User: "Mostrar pastas com dev"',
          'Your response (tool_calls):',
          '<tool_call>{"name":"search_programs","arguments":{"query":"dev"}}</tool_call>',
          '',
          '# RULES',
          '- Use tools when they add clear value (actions, retrieval, structured operations).',
          '- If the user request is primarily generative and does not require an external action, you may answer directly in text.',
          '- Use the exact format: <tool_call>{"name":"TOOL_NAME","arguments":{...}}</tool_call>'
        ].join('\n')
      }

      /* If direct skill execution already produced a structured response,
         we can skip the LLM round for tool calling and just ask the LLM
         to generate a brief confirmation text. */
      if (directSkillResult?.structuredResponse && !bufferedStructuredResponse) {
        bufferedStructuredResponse = directSkillResult.structuredResponse
      }

      /* Rebuild system message with tool instructions */
      let promptText = ''
      if (promptRegistry && typeof promptRegistry.buildSystemPrompt === 'function') {
        promptText = promptRegistry.buildSystemPrompt({
          tier: tierName,
          persona: store.settings.assistant_persona || (promptRegistry.getDefaults ? promptRegistry.getDefaults().assistant_persona : 'MomAI'),
          memoryContext,
          toolInstruction,
          responseStyle,
          responseLanguage
        })
      }
      if (extraSystemInstructions.length > 0) {
        promptText += `\n\n${extraSystemInstructions.join('\n\n')}`
      }
      const systemMessage = {
        role: 'system',
        content: sanitizePromptText(promptText)
      }

      /* Inject direct skill result into conversation context so LLM sees it */
      const currentMessages = [...messages]
      if (directSkillResult?.instruction) {
        currentMessages.push({
          role: 'system',
          content: `[TOOL RESULT] ${directSkillResult.instruction}`
        })
      }

      const requestBody = {
        model: 'gpt-4o',
        stream: true,
        temperature: Number.isFinite(tier.temperature) ? tier.temperature : 0.7,
        top_p: Number.isFinite(tier.top_p) ? tier.top_p : 1,
        max_tokens: computeDynamicMaxTokens(
          Number.isFinite(tier.max_tokens) ? tier.max_tokens : 320,
          estimatedPromptTokens,
          llamaState.contextTotalTokens
        ),
        messages: [systemMessage, ...currentMessages.filter((m) => m.role !== 'system')]
      }
      estimatedPromptTokens =
        estimateTokenCount(systemMessage.content) +
        requestBody.messages.reduce((acc, msg) => acc + estimateTokenCount(msg.content), 0)
      requestBody.max_tokens = computeDynamicMaxTokens(
        requestBody.max_tokens,
        estimatedPromptTokens,
        llamaState.contextTotalTokens
      )
      lastSystemMessage = systemMessage
      lastCurrentMessages = currentMessages
      llamaState.contextUsedTokens = Math.min(
        Number(llamaState.contextTotalTokens || 8192),
        Math.max(0, estimatedPromptTokens)
      )
      if (toolsPayload.length > 0 && !directSkillResult?.structuredResponse) {
        requestBody.tools = toolsPayload
      }

      debug(`[chat] Request: tools=${toolsPayload.length}, sys_prompt_len=${systemMessage.content.length}, msg_count=${requestBody.messages.length}`)
      debug(`[chat] Tools: ${toolsPayload.map((t) => t.function?.name || t.name).join(', ')}`)

      writeSse(res, { status: 'responding' })
      let llamaResp = await fetch(`${getLlamaBaseUrl()}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify(requestBody)
      })

      if (!llamaResp.ok || !llamaResp.body) {
        const txt = await llamaResp.text().catch(() => '')
        const isContextExceeded =
          llamaResp.status === 400 &&
          /exceeds the available context size|exceed_context_size/i.test(txt)
        const isToolArgsParseError =
          /failed to parse tool call arguments as json|parse_error\.101|missing closing quote/i.test(
            txt
          )

        if (isContextExceeded) {
          const retryCandidates = []
          const totalCtx = Number(llamaState.contextTotalTokens || 8192)
          const retryMax1 = Math.max(192, Math.min(640, Math.floor(totalCtx * 0.16)))
          const retryMax2 = Math.max(160, Math.min(480, Math.floor(totalCtx * 0.12)))

          retryCandidates.push({
            ...requestBody,
            max_tokens: Math.min(Number(requestBody.max_tokens || 320), retryMax1),
            tools: undefined,
            messages: buildCompactedMessages(systemMessage, currentMessages, content)
          })

          retryCandidates.push({
            ...requestBody,
            max_tokens: Math.min(Number(requestBody.max_tokens || 320), retryMax2),
            tools: undefined,
            messages: [
              { ...systemMessage, content: trimMessageForContext(systemMessage.content, 700) },
              { role: 'user', content: trimMessageForContext(content, 520) }
            ]
          })

          let recovered = false
          for (let i = 0; i < retryCandidates.length; i += 1) {
            const retryBody = retryCandidates[i]
            estimatedPromptTokens = retryBody.messages.reduce(
              (acc, msg) => acc + estimateTokenCount(msg.content),
              0
            )
            llamaState.contextUsedTokens = Math.min(
              Number(llamaState.contextTotalTokens || 8192),
              Math.max(0, estimatedPromptTokens)
            )
            debug(`[chat] Context overflow detected. Retrying with compacted payload (level ${i + 1}).`)

            llamaResp = await fetch(`${getLlamaBaseUrl()}/v1/chat/completions`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              signal: controller.signal,
              body: JSON.stringify(retryBody)
            })
            if (llamaResp.ok && llamaResp.body) {
              recovered = true
              break
            }
          }

          if (!recovered) {
            const retryTxt = await llamaResp.text().catch(() => '')
            throw new Error(`llama HTTP ${llamaResp.status}: ${retryTxt.slice(0, 240)}`)
          }
        } else if (isToolArgsParseError) {
          // Some local models can emit malformed tool_call JSON when payloads get large (e.g. HTML).
          // Recover by retrying without tools AND without tool-focused instruction in system prompt.
          let fallbackSystemContent = systemMessage.content
          if (promptRegistry && typeof promptRegistry.buildSystemPrompt === 'function') {
            fallbackSystemContent = sanitizePromptText(
              promptRegistry.buildSystemPrompt({
                tier: tierName,
                persona:
                  store.settings.assistant_persona ||
                  (promptRegistry.getDefaults
                    ? promptRegistry.getDefaults().assistant_persona
                    : 'MomAI'),
                memoryContext,
                toolInstruction: null,
                responseStyle,
                responseLanguage
              })
            )
          }
          const fallbackBody = {
            ...requestBody,
            messages: [
              { role: 'system', content: fallbackSystemContent },
              ...currentMessages.filter((m) => m.role !== 'system')
            ],
            tools: undefined,
            max_tokens: Math.min(
              Number(requestBody.max_tokens || 320),
              Math.max(320, Math.floor(Number(llamaState.contextTotalTokens || 8192) * 0.18))
            )
          }
          debug('[chat] Tool-call JSON parse error from llama server. Retrying without tools.')
          llamaResp = await fetch(`${getLlamaBaseUrl()}/v1/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify(fallbackBody)
          })
          if (!llamaResp.ok || !llamaResp.body) {
            const retryTxt = await llamaResp.text().catch(() => '')
            throw new Error(`llama HTTP ${llamaResp.status}: ${retryTxt.slice(0, 240)}`)
          }
        } else {
          throw new Error(`llama HTTP ${llamaResp.status}: ${txt.slice(0, 240)}`)
        }
      }

      const reader = llamaResp.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let roundText = ''
      let generatedTokensEstimate = 0
      let toolCallsAccum = []
      let roundFinishReason = null

      while (true) {
        if (stopGenerationRequested || closed) {
          controller.abort()
          break
        }

        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const rawLine of lines) {
          const line = rawLine.trim()
          if (!line.startsWith('data:')) continue
          const parsed = parseLlamaDataLine(line)
          if (parsed.finish_reason) roundFinishReason = parsed.finish_reason
          if (parsed.type === 'done') break
          if (parsed.type === 'error') {
            writeSse(res, { error: parsed.error })
            continue
          }
          if (parsed.type === 'tool_calls') {
            for (const tc of parsed.tool_calls) {
              const idx = tc.index ?? 0
              if (!toolCallsAccum[idx]) {
                toolCallsAccum[idx] = {
                  id: '',
                  type: 'function',
                  function: { name: '', arguments: '' }
                }
              }
              if (tc.id) toolCallsAccum[idx].id = tc.id
              if (tc.type) toolCallsAccum[idx].type = tc.type
              if (tc.function?.name) toolCallsAccum[idx].function.name += tc.function.name
              if (tc.function?.arguments)
                toolCallsAccum[idx].function.arguments += tc.function.arguments
            }
            continue
          }
          if (parsed.type === 'token') {
            roundText += parsed.token
            assembled += parsed.token
            generatedTokensEstimate += estimateTokenCount(parsed.token)
            llamaState.contextUsedTokens = Math.min(
              Number(llamaState.contextTotalTokens || 8192),
              Math.max(0, estimatedPromptTokens + generatedTokensEstimate)
            )
            writeSse(res, { token: parsed.token })
            flushTtsChunks(false)
          }
        }
      }

      debug(`[chat] Round ${round} result: text_len=${roundText.length}, tool_calls=${toolCallsAccum.length}`)
      lastFinishReason = roundFinishReason || lastFinishReason
      if (roundText.length > 0) {
        debug(`[chat] Round ${round} text preview: "${roundText.slice(0, 120)}"`)
      }

      if (toolCallsAccum.length > 0 && toolCallsAccum[0]?.function?.name) {
        const executedTools = []
        for (const tc of toolCallsAccum) {
          if (!tc?.function?.name) continue

          const toolName = tc.function.name
          const rawArgs = tc.function.arguments || '{}'
          let args
          try {
            args = JSON.parse(rawArgs)
          } catch {
            args = { content: rawArgs }
          }

          let skillId = toolName
          const skillRegistry = getSkillRegistry()
          let skillObj = null
          if (skillRegistry && typeof skillRegistry.getById === 'function') {
            skillObj = skillRegistry.getById(skillId)
          }

          if (!skillObj) {
            for (const skill of getEnabledSkills()) {
              const match = (skill.manifest.tools || []).find((t) => t.name === toolName)
              if (match) {
                skillId = skill.id
                skillObj = skill
                break
              }
            }
          }

          if (skillObj && isSkillEnabledByStore(skillObj)) {
            const runtimeContext = {
              listActiveReminders(limit = 8) {
                return store.reminders
                  .filter((r) => r.is_active)
                  .sort(
                    (a, b) =>
                      new Date(a.scheduled_time).getTime() - new Date(b.scheduled_time).getTime()
                  )
                  .slice(0, limit)
              },
              createReminderFromText(text) {
                const {
                  parseRelativeReminder,
                  extractReminderTitle,
                  normalizeReminder
                } = require('./reminder-service')
                const rawText = String(text || '').trim()
                const scheduled =
                  parseRelativeReminder(rawText) ||
                  new Date(Date.now() + 60 * 60 * 1000).toISOString()
                const title = extractReminderTitle(rawText)
                const reminder = normalizeReminder({
                  id: store.next_reminder_id++,
                  title: title || 'Lembrete',
                  content: rawText,
                  scheduled_time: scheduled,
                  is_active: true
                })
                store.reminders.push(reminder)
                saveStore()
                broadcast({ type: 'reminders_updated' })
                return reminder
              },
              createReminder({ title, scheduled_time, content }) {
                const { normalizeReminder } = require('./reminder-service')
                const reminder = normalizeReminder({
                  id: store.next_reminder_id++,
                  title: title || 'Lembrete',
                  content: content || title || '',
                  scheduled_time: scheduled_time,
                  is_active: true
                })
                store.reminders.push(reminder)
                saveStore()
                broadcast({ type: 'reminders_updated' })
                return reminder
              },
              saveMemoryNote(text) {
                const note = saveMemoryNoteFromContent(text)
                semanticState.lastNotesSyncAt = 0
                return note
              },
              async searchMemory(text, limit = 4) {
                const result = await runSemanticMemoryRetrieval(text, limit)
                return result.hits || []
              },
              removeReminder(id) {
                const initialCount = store.reminders.length
                store.reminders = store.reminders.filter((r) => r.id !== Number(id))
                const changed = store.reminders.length !== initialCount
                if (changed) {
                  saveStore()
                  broadcast({ type: 'reminders_updated' })
                }
                return changed
              },
              removeAllReminders() {
                const changed = store.reminders.length > 0
                if (changed) {
                  store.reminders = []
                  saveStore()
                  broadcast({ type: 'reminders_updated' })
                }
                return changed
              },
              removeRemindersByFilter({ title, date }) {
                const initialCount = store.reminders.length
                store.reminders = store.reminders.filter((r) => {
                  let match = true
                  if (title) {
                    const t = String(title).toLowerCase()
                    if (
                      !r.title.toLowerCase().includes(t) &&
                      !r.content.toLowerCase().includes(t)
                    ) {
                      match = false
                    }
                  }
                  if (date && match) {
                    if (!r.scheduled_time.startsWith(date)) {
                      match = false
                    }
                  }
                  return !match
                })

                const changed = store.reminders.length !== initialCount
                if (changed) {
                  saveStore()
                  broadcast({ type: 'reminders_updated' })
                }
                return { success: changed, count: initialCount - store.reminders.length }
              },
              searchWeb
            }

            try {
              const skillRegistry = getSkillRegistry()
              if (!skillRegistry || typeof skillRegistry.execute !== 'function') {
                throw new Error('Skill registry not available')
              }
              const result = await skillRegistry.execute(
                skillId,
                args.content || content,
                runtimeContext,
                args,
                toolName
              )
              const toolResultText = result?.instruction || JSON.stringify(result || {})
              if (result?.structuredResponse) {
                bufferedStructuredResponse = result.structuredResponse
              } else if (result?.directResponse) {
                assembled += `\n${result.directResponse}`
                for (const token of splitTokens(result.directResponse)) {
                  writeSse(res, { token })
                }
              }

              const toolStep = {
                skill_id: skillId,
                skill_name: skillObj.manifest.name,
                tool: toolName,
                name: toolName,
                description: String(
                  (skillObj.manifest.tools || []).find((t) => t.name === toolName)?.description ||
                    ''
                ),
                status: result ? 'success' : 'error',
                started_at: isoNow()
              }
              toolSteps.push(toolStep)
              activeSkill = skillId
              writeSse(res, { active_skill: activeSkill })
              writeSse(res, { tool_steps: toolSteps })

              if (Array.isArray(result?.webSources) && result.webSources.length) {
                memorySources = [...memorySources, ...result.webSources].slice(0, 12)
              }

              messages.push({
                role: 'assistant',
                tool_calls: [
                  {
                    id: tc.id || `call_${toolName}`,
                    type: 'function',
                    function: { name: toolName, arguments: rawArgs }
                  }
                ]
              })
              messages.push({
                role: 'tool',
                tool_call_id: tc.id || `call_${toolName}`,
                content: toolResultText
              })
              executedTools.push({ name: toolName, result: toolResultText })
            } catch (execError) {
              messages.push({
                role: 'tool',
                tool_call_id: tc.id || `call_${toolName}`,
                content: `Error: ${execError?.message || 'tool execution failed'}`
              })
            }
          } else {
            messages.push({
              role: 'tool',
              tool_call_id: tc.id || `call_${toolName}`,
              content: `Error: unknown tool "${toolName}"`
            })
          }
        }

        if (executedTools.length > 0) {
          continue
        }
      }

      break
    }

    if (
      !stopGenerationRequested &&
      !closed &&
      !bufferedStructuredResponse &&
      isLikelyIncompleteResponse(assembled, lastFinishReason)
    ) {
      const continuationPrompt =
        'Continue exatamente de onde parou, sem repetir conteúdo já enviado. Feche blocos de código e tags pendentes quando necessário.'
      const tailAssistant = trimMessageForContext(assembled, 2200)
      const continuationMessages = [
        ...(lastCurrentMessages || []).filter((m) => m.role !== 'system'),
        { role: 'assistant', content: tailAssistant },
        { role: 'user', content: continuationPrompt }
      ]
      const estimatedContinuationPromptTokens =
        estimateTokenCount(lastSystemMessage?.content || '') +
        continuationMessages.reduce((acc, msg) => acc + estimateTokenCount(msg.content), 0)
      const continuationBody = {
        model: 'gpt-4o',
        stream: true,
        temperature: Number.isFinite(tier.temperature) ? Math.min(0.7, tier.temperature) : 0.5,
        top_p: Number.isFinite(tier.top_p) ? tier.top_p : 1,
        max_tokens: computeDynamicMaxTokens(
          Math.max(Number(tier.max_tokens || 320), 700),
          estimatedContinuationPromptTokens,
          llamaState.contextTotalTokens
        ),
        messages: [
          {
            role: 'system',
            content: sanitizePromptText(String(lastSystemMessage?.content || ''))
          },
          ...continuationMessages
        ]
      }

      debug('[chat] Detected incomplete answer. Running automatic continuation.')
      const continuationResp = await fetch(`${getLlamaBaseUrl()}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify(continuationBody)
      })

      if (continuationResp.ok && continuationResp.body) {
        const reader = continuationResp.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        while (true) {
          if (stopGenerationRequested || closed) {
            controller.abort()
            break
          }
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''
          for (const rawLine of lines) {
            const line = rawLine.trim()
            if (!line.startsWith('data:')) continue
            const parsed = parseLlamaDataLine(line)
            if (parsed.type === 'done') break
            if (parsed.type === 'token') {
              assembled += parsed.token
              writeSse(res, { token: parsed.token })
              flushTtsChunks(false)
            }
          }
        }
      }
    }

    /* ── Retry: if LLM returned nothing usable (empty or only <think> tags),
       generate a contextual fallback so the user never sees a blank message ── */
    const visibleText = assembled.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
    if (!visibleText && !bufferedStructuredResponse) {
      debug('[chat] LLM returned empty/think-only response, generating fallback')
      const fallbackMsg = generateFallbackReply(content, memoryContext, null, fallbackLanguage)
      for (const token of splitTokens(fallbackMsg)) {
        if (closed || stopGenerationRequested) break
        assembled += token
        writeSse(res, { token })
        flushTtsChunks(false)
      }
      flushTtsChunks(true)
    }

    if (!bufferedStructuredResponse && activeHookSessions.length > 0) {
      for (const session of activeHookSessions) {
        try {
          const hookResult = await skillRegistry?.executeHook?.(session.skillId, 'afterModel', {
            content,
            args: { query: content, path: payload.path },
            context: {
              threadId,
              responseLanguage,
              memoryContext,
              searchWeb,
              beforeModel: session.beforeModel || null
            },
            responseText: assembled
          })
          if (!hookResult?.handled) continue

          if (hookResult.structuredResponse) {
            bufferedStructuredResponse = hookResult.structuredResponse
          }
          if (typeof hookResult.replaceText === 'string' && hookResult.replaceText.trim()) {
            assembled = hookResult.replaceText.trim()
          }
          if (hookResult.step) {
            toolSteps.push({
              skill_id: session.skillId,
              skill_name: getSkillRegistry()?.getById?.(session.skillId)?.manifest?.name || session.skillId,
              tool: hookResult.step.tool || 'hook',
              name: hookResult.step.name || 'afterModel',
              description: String(hookResult.step.description || ''),
              status: 'success',
              started_at: isoNow()
            })
            activeSkill = activeSkill || session.skillId
          }
          break
        } catch (err) {
          debug(`[chat] afterModel hook failed for ${session.skillId}: ${err.message}`)
        }
      }
    }

    appendMessage(threadId, 'assistant', assembled.trim() || 'Interrompido.', {
      sources: memorySources.length ? memorySources : undefined,
      graph_data:
        activeSkill || toolSteps.length
          ? { active_skill: activeSkill, tool_steps: toolSteps }
          : null,
      structured_response: bufferedStructuredResponse || undefined
    })
    llamaState.contextUsedTokens = Math.min(
      Number(llamaState.contextTotalTokens || 8192),
      Math.max(0, estimatedPromptTokens + estimateTokenCount(assembled))
    )
    flushTtsChunks(true)
    if (bufferedStructuredResponse) {
      writeSse(res, { structured_response: bufferedStructuredResponse })
    }
    writeSse(res, { done: true })
    res.end()
  } catch (error) {
    const fallbackMsg = generateFallbackReply(
      content,
      memoryContext,
      humanizeFallbackReason(error?.message || 'llama failure', fallbackLanguage),
      fallbackLanguage
    )
    const tail = fallbackMsg.slice(assembled.length)
    if (tail) {
      for (const token of splitTokens(tail)) {
        assembled += token
        writeSse(res, { token })
      }
    }

    appendMessage(threadId, 'assistant', assembled.trim() || fallbackMsg, {
      sources: memorySources.length ? memorySources : undefined,
      graph_data:
        activeSkill || toolSteps.length
          ? { active_skill: activeSkill, tool_steps: toolSteps }
          : null
    })
    flushTtsChunks(true)
    writeSse(res, { done: true })
    res.end()
  } finally {
    activeChatControllers.delete(controller)
  }
}

async function runVoiceCommand(payload = {}) {
  const content = String(payload.content || '').trim()
  if (!content) return
  const threadId = String(payload.thread_id || 'default')
  const speakResponse = payload.speak_response !== false
  debug(`[voice-cmd] runVoiceCommand called: content="${content.slice(0, 80)}", thread=${threadId}`)

  broadcast({ type: 'user', content })
  broadcast({ type: 'assistant', data: { status: 'Pensando...' } })

  let closed = false
  const reqMock = {
    on: (event, cb) => {
      if (event === 'close') {
        reqMock._onClose = cb
      }
    },
    _onClose: null
  }

  let sseBuffer = ''
  const resMock = {
    writeHead: () => {},
    write: (chunk) => {
      sseBuffer += String(chunk || '')
      let sepIdx = sseBuffer.indexOf('\n\n')
      while (sepIdx !== -1) {
        const block = sseBuffer.slice(0, sepIdx)
        sseBuffer = sseBuffer.slice(sepIdx + 2)
        const lines = block.split('\n')
        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed.startsWith('data:')) continue
          const payloadStr = trimmed.replace(/^data:\s*/, '').trim()
          if (!payloadStr) continue
          try {
            const data = JSON.parse(payloadStr)
            broadcast({ type: 'assistant', data })
          } catch {
            // ignore invalid chunk
          }
        }
        sepIdx = sseBuffer.indexOf('\n\n')
      }
      return true
    },
    end: () => {
      closed = true
    }
  }

  await streamLlamaChat(reqMock, resMock, {
    content,
    thread_id: threadId,
    speak_response: speakResponse
  })

  if (!closed && typeof reqMock._onClose === 'function') {
    reqMock._onClose()
  }
}

module.exports = {
  streamLlamaChat,
  streamFallbackResponse,
  parseLlamaDataLine,
  runVoiceCommand,
  stopGenerationRequested,
  stopVoiceRequested,
  activeChatControllers
}
