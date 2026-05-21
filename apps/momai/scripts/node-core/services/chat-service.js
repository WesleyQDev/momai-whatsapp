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
const { sendSseHeaders, writeSse, endSse } = require('../infrastructure/http-helpers')
const { pruneThread } = require('../infrastructure/store')
const { splitTokens, sanitizePromptText } = require('../utils/text')
const { isoNow } = require('../utils/time')
const { ensureLlamaReady, getLlamaBaseUrl, saveStore } = require('./llama-manager')
const { runSemanticMemoryRetrieval, getTop5SkillsSemantic } = require('./semantic-engine')
const { isSkillEnabledByStore, getEnabledSkills } = require('./skill-orchestrator')
const { triggerAutoTts, ensurePython, broadcast } = require('./tts-service')
const { recordMetric } = require('./observability-service')
const { DEFAULT_TIERS, loadTierConfig } = require('../config/tiers')
const { DATA_DIR, NOTES_DIR, NOTES_INDEX_FILE } = require('../config/constants')
const { saveMemoryNoteFromContent, ensureNotesIndexExists } = require('../domain/note-manager')

const tiersConfig = loadTierConfig()

let stopGenerationRequested = false
let stopVoiceRequested = false
let generationId = 0
const activeChatControllers = new Set()

function estimateTokenCount(text) {
  const safe = String(text || '')
  if (!safe) return 0
  return Math.max(1, Math.ceil(safe.length / 3))
}

async function tokenizePrompt(messages) {
  try {
    const text = messages.map((m) => `${m.role}: ${m.content}`).join('\n')
    const resp = await fetch(`${getLlamaBaseUrl()}/v1/tokenize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: text })
    })
    if (!resp.ok) return null
    const data = await resp.json()
    if (Array.isArray(data.tokens)) return data.tokens.length
    return null
  } catch {
    return null
  }
}

function buildObservabilityTrace({
  traceId,
  threadId,
  traceType,
  totalDuration,
  preLlamaDuration,
  firstTokenDuration,
  genDuration,
  systemPrompt,
  chatMessages,
  response,
  tps,
  promptTokens,
  genTokens,
  modelName,
  tier,
  toolCount,
  toolStepsList,
  activeSkillId,
  status,
  errorMsg,
  content,
  fallbackMsg,
  assembledText
}) {
  return {
    id: traceId,
    timestamp: Date.now(),
    type: traceType,
    total_duration: totalDuration,
    pre_llm_duration: preLlamaDuration,
    first_token_duration: firstTokenDuration,
    generation_duration: genDuration,
    system_prompt: systemPrompt || '',
    messages: (chatMessages || [])
      .filter((m) => m.role !== 'system')
      .slice(-10)
      .map((m) => ({
        role: m.role,
        content: (m.content || '').slice(0, 1000)
      })),
    response: (response || '').slice(0, 5000),
    tokens_per_second: tps,
    total_tokens: promptTokens + genTokens,
    estimated_prompt_tokens: promptTokens,
    generated_tokens: genTokens,
    model: modelName || 'unknown',
    tier: tier || 'unknown',
    tools_count: toolCount || 0,
    tool_calls: (toolStepsList || []).length
      ? toolStepsList.map((ts) => ({
          tool_name: ts.name || ts.tool_name || 'unknown',
          args: ts.args || ts.input || {},
          result: ts.result ? String(ts.result).slice(0, 500) : undefined,
          duration_ms: ts.duration_ms || 0
        }))
      : undefined,
    active_skill: activeSkillId || undefined,
    thread_id: threadId || 'default',
    status,
    ...(errorMsg ? { error: errorMsg } : {})
  }
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
  pruneThread(threadId)
  return item
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
    total >= 12000
      ? Math.max(Number(tierMaxTokens || 0), 1200)
      : total >= 8000
        ? Math.max(Number(tierMaxTokens || 0), 900)
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
  const fallbackUsed =
    estimateTokenCount(content) + estimateTokenCount(memoryContext) + estimateTokenCount(reply)
  llamaState.contextUsedTokens = Math.min(
    Number(llamaState.contextTotalTokens || 8192),
    Math.max(0, fallbackUsed)
  )

  stopGenerationRequested = false
  sendSseHeaders(res)
  {
    const _sse = writeSse(res, { status: 'thinking' })
    if (_sse instanceof Promise) await _sse
  }
  {
    const _sse = writeSse(res, { status: 'responding' })
    if (_sse instanceof Promise) await _sse
  }

  let assembled = ''
  let closed = false
  req.on('close', () => {
    closed = true
  })

  for (const token of tokens) {
    if (closed || stopGenerationRequested || res.destroyed) break
    assembled += token
    {
      const _sse = writeSse(res, { token })
      if (_sse instanceof Promise) await _sse
      else if (_sse === false) break
    }
    await new Promise((r) => setTimeout(r, 15))
  }

  appendMessage(threadId, 'assistant', assembled.trim() || 'Interrompido.')
  {
    const _sse = writeSse(res, { done: true })
    if (_sse instanceof Promise) await _sse
  }
  endSse(res)
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
  const t0 = Date.now()
  let lastTtsFlushTime = 0
  const TTS_FLUSH_INTERVAL = 200

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

  let semanticPromise = null
  if (isUltra) {
    const { syncSkillAndToolIndexes, syncNoteIndex } = require('./semantic-engine')
    syncSkillAndToolIndexes(false).catch((err) => debug('[background]', err?.message || err))
    syncNoteIndex(false).catch((err) => debug('[background]', err?.message || err))
    semanticPromise = runSemanticMemoryRetrieval(content, 6)
  }

  appendMessage(threadId, 'user', content, {
    sources: memorySources.length ? memorySources : undefined,
    graph_data: null
  })

  sendSseHeaders(res)
  {
    const _sse = writeSse(res, { status: 'thinking' })
    if (_sse instanceof Promise) await _sse
  }
  if (memorySources.length) {
    {
      const _sse = writeSse(res, { sources: memorySources })
      if (_sse instanceof Promise) await _sse
    }
    {
      const _sse = writeSse(res, { memory_sources: memorySources })
      if (_sse instanceof Promise) await _sse
    }
  }

  const baseCtx = Number(llamaState.contextTotalTokens || 2048)
  const dynamicHistoryBudget = Math.max(450, Math.floor(baseCtx * 0.62))
  const history = buildHistoryWithinBudget(getThreadMessages(threadId), dynamicHistoryBudget).map(
    (msg) => ({
      role: msg.role === 'assistant' ? 'assistant' : 'user',
      content: sanitizePromptText(String(msg.content || ''))
    })
  )

  if (semanticPromise) {
    try {
      const semantic = await semanticPromise
      if (semantic?.memoryContext) {
        memoryContext = memoryContext
          ? `${memoryContext}\n\n${semantic.memoryContext}`
          : semantic.memoryContext
      }
      if (Array.isArray(semantic?.memorySources) && semantic.memorySources.length) {
        const byUrl = new Map()
        for (const source of [...memorySources, ...semantic.memorySources]) {
          if (!source || !source.url) continue
          byUrl.set(source.url, source)
        }
        memorySources = [...byUrl.values()].slice(0, 20)
      }
      const MAX_SOURCES = 20
      if (memorySources.length > MAX_SOURCES) {
        memorySources = memorySources.slice(-MAX_SOURCES)
      }
    } catch (e) {
      console.error('[ChatService] Semantic memory failed, continuing without it:', e)
    }
  }

  const responseStyle = tierName === 'ultra' ? 'concise' : 'balanced'
  const promptRegistry = getPromptRegistry()

  const tier = tiersConfig[tierName] || tiersConfig.pro || DEFAULT_TIERS.pro

  const controller = new AbortController()
  activeChatControllers.add(controller)
  stopGenerationRequested = false
  stopVoiceRequested = false
  generationId += 1
  const currentGen = generationId

  // Stop any ongoing TTS when starting a new message (only if TTS is enabled)
  const ttsEnabled = Boolean(store.settings.tts_enabled)
  if (ttsEnabled && speakResponse) {
    try {
      const pythonBase = await ensurePython()
      await fetch(`${pythonBase}/chat/stop-voice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
    } catch (error) {
      // TTS might not be available, ignore
    }
  }

  let closed = false
  req.on('close', () => {
    closed = true
    controller.abort()
  })

  let assembled = ''
  let bufferedStructuredResponse = null
  let ttsCursor = 0
  const prebufferChars = Math.max(40, Number(store.settings.prebuffer_chars || 90))
  const TTS_QUEUE_MAX = 3
  let ttsProcessing = false
  const ttsQueue = []

  const enqueueAutoTts = (chunk) => {
    const cleaned = String(chunk || '').trim()
    if (cleaned.length < 2) {
      console.log(`[TTS-DEBUG] enqueueAutoTts SKIPPED: cleaned.length=${cleaned.length}`)
      return
    }
    console.log(
      `[TTS-DEBUG] enqueueAutoTts CALLING triggerAutoTts: cleaned="${cleaned.slice(0, 60)}"`
    )
    ttsQueue.push(cleaned)
    if (ttsQueue.length > TTS_QUEUE_MAX) {
      ttsQueue.shift()
    }
    processTtsQueue()
  }

  async function processTtsQueue() {
    if (ttsProcessing) return
    ttsProcessing = true
    while (ttsQueue.length > 0) {
      const chunk = ttsQueue.shift()
      try {
        await triggerAutoTts(chunk, currentGen)
      } catch (err) {
        warn('[TTS] Chunk failed:', err.message)
      }
    }
    ttsProcessing = false
  }

  const flushTtsChunks = (final = false) => {
    if (
      !speakResponse ||
      silentForCodeIntent ||
      stopGenerationRequested ||
      currentGen !== generationId ||
      closed
    ) {
      console.log(
        `[TTS-DEBUG] flushTtsChunks(${final}) guard blocked: speakResponse=${speakResponse} silent=${silentForCodeIntent} stopGen=${stopGenerationRequested} genMatch=${currentGen === generationId} closed=${closed}`
      )
      return
    }
    if (containsCodeLikeContent(assembled)) {
      console.log(
        `[TTS-DEBUG] flushTtsChunks(${final}) blocked: containsCodeLikeContent=true assembled.length=${assembled.length}`
      )
      return
    }
    const pending = assembled.slice(ttsCursor)
    if (!pending) {
      console.log(
        `[TTS-DEBUG] flushTtsChunks(${final}) blocked: pending empty, ttsCursor=${ttsCursor}`
      )
      return
    }
    if (!final && pending.length < prebufferChars) {
      console.log(
        `[TTS-DEBUG] flushTtsChunks(${final}) blocked: pending.length=${pending.length} < prebufferChars=${prebufferChars}`
      )
      return
    }

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
    console.log(
      `[TTS-DEBUG] flushTtsChunks(${final}) ENQUEUING: cut=${cut} cursor=${ttsCursor} chunkLen=${chunk.length} chunk="${chunk.slice(0, 60)}"`
    )
    enqueueAutoTts(chunk)
  }

  let messages = [...history]
  const maxToolRounds = isUltra ? 3 : 1
  let round = 0
  let estimatedPromptTokens = estimateTokenCount(content) + estimateTokenCount(memoryContext)
  let lastSystemMessage = null
  let lastCurrentMessages = []
  let lastToolsPayload = []
  let lastTPreFetch = 0
  let lastTFirstToken = 0
  let lastFinishReason = null
  const activeHookSessions = []

  try {
    const skillRegistry = getSkillRegistry()
    const allHookSkills = skillRegistry?.getSkillsWithHook?.('beforeModel') || []
    const beforeHookSkills = allHookSkills.filter((skill) => {
      const intents = skill.manifest?.intents
      if (!intents || !intents.length) return true
      const lower = content.toLowerCase()
      return intents.some((intent) => lower.includes(intent.toLowerCase()))
    })
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
            {
              const _sse = writeSse(res, { active_skill: activeSkill })
              if (_sse instanceof Promise) await _sse
            }
          }
          if (toolSteps.length > 0) {
            {
              const _sse = writeSse(res, { tool_steps: toolSteps })
              if (_sse instanceof Promise) await _sse
            }
          }
          const shortText = String(hookResult.replaceText || '').trim()
          if (shortText) {
            assembled = shortText
            for (const token of splitTokens(shortText)) {
              {
                const _sse = writeSse(res, { token })
                if (_sse instanceof Promise) await _sse
                else if (_sse === false) break
              }
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
            {
              const _sse = writeSse(res, { structured_response: bufferedStructuredResponse })
              if (_sse instanceof Promise) await _sse
            }
          }
          {
            const _sse = writeSse(res, { done: true })
            if (_sse instanceof Promise) await _sse
          }
          endSse(res)
          return
        }
      } catch (err) {
        debug(`[chat] beforeModel hook failed for ${skill.id}: ${err.message}`)
      }
    }

    /* Descobre as top 5 skills (sempre, sem threshold) */
    let discoveredSkillIds = []
    let topScores = {}
    let toolsPayload = []
    let toolSteps = []
    let activeSkill = null

    {
      const top5 = await (async () => {
        if (isUltra) {
          const semanticResults = await getTop5SkillsSemantic(content)
          if (semanticResults.length > 0) {
            semanticResults.forEach((r) => {
              topScores[r.id] = r.score
            })
            return semanticResults.map((r) => r.id)
          }
          debug('[chat] Semantic empty, falling back to lexical')
        }
        if (skillRegistry && typeof skillRegistry.discoverTopN === 'function') {
          const d = skillRegistry.discoverTopN(content, 5)
          if (d.length > 0) {
            d.forEach((x) => {
              topScores[x.id] = x.confidence
            })
            return d.map((x) => x.id)
          }
        }
        return []
      })()
      discoveredSkillIds = top5
    }

    let toolInstruction = null
    let directSkillResult = null

    /* Converte as top 5 skills em tools nativas pro LLM */
    const allSelectedSkills = discoveredSkillIds
      .map((id) => skillRegistry?.getById?.(id))
      .filter(Boolean)
    if (
      allSelectedSkills.length > 0 &&
      skillRegistry &&
      typeof skillRegistry.toOpenAITools === 'function'
    ) {
      toolsPayload = skillRegistry.toOpenAITools(discoveredSkillIds)
    }

    /* Pre-executa a melhor skill (fallback caso LLM nao chame a tool) */
    const scoreEntries = Object.entries(topScores)
    if (scoreEntries.length > 0) {
      const bestScore = Math.max(...scoreEntries.map(([, v]) => v))
      const bestEntry = scoreEntries.find(([, v]) => v === bestScore)
      /* Se mensagem atual for curta, combina com mensagem anterior para contexto */
      let execContent = content
      if (execContent.length < 60) {
        const userMsgs = messages.filter((m) => m.role === 'user')
        if (userMsgs.length > 1) {
          execContent = `${userMsgs[userMsgs.length - 2].content} ${execContent}`
        }
      }
      if (
        bestEntry &&
        bestScore >= 0.25 &&
        skillRegistry &&
        typeof skillRegistry.execute === 'function'
      ) {
        const [bestId] = bestEntry
        const skillObj = skillRegistry.getById(bestId)
        if (skillObj && isSkillEnabledByStore(skillObj)) {
          try {
            directSkillResult = await skillRegistry.execute(
              bestId,
              execContent,
              { searchWeb },
              { query: execContent },
              null
            )
            if (directSkillResult?.structuredResponse) {
              bufferedStructuredResponse = directSkillResult.structuredResponse
            }
            if (directSkillResult?.instruction) {
              extraSystemInstructions.push(`[DADOS REAIS]\n${directSkillResult.instruction}`)
            }
            const toolName =
              skillObj.manifest.tools && skillObj.manifest.tools.length > 0
                ? skillObj.manifest.tools[0].name
                : bestId
            toolSteps.push({
              skill_id: bestId,
              skill_name: skillObj.manifest.name,
              tool: 'skill_execute',
              name: toolName,
              description: String(skillObj.manifest.description || ''),
              status: directSkillResult ? 'success' : 'error',
              started_at: isoNow()
            })
            activeSkill = bestId
            {
              const _sse = writeSse(res, { active_skill: activeSkill })
              if (_sse instanceof Promise) await _sse
            }
            {
              const _sse = writeSse(res, { tool_steps: toolSteps })
              if (_sse instanceof Promise) await _sse
            }
          } catch (e) {
            debug(`[chat] Pre-exec failed: ${e.message}`)
          }
        }
      }
    }

    /* Se ja tem dados reais, nao expoe tools (evita confusao) */
    if (directSkillResult?.instruction) {
      toolsPayload = []
      if (bufferedStructuredResponse) {
        toolInstruction = `A skill foi executada e retornou dados reais. Use os dados abaixo para responder ao usuario:\n${directSkillResult.instruction}`
      } else {
        toolInstruction = `Skill executada mas retornou: "${directSkillResult.instruction}". Informe isso ao usuario educadamente.`
      }
    } else {
      const skillDesc = allSelectedSkills.length
        ? `# SKILLS DISPONIVEIS\n${allSelectedSkills.map((s) => `- ${s.manifest.name}: ${s.manifest.description}`).join('\n')}\n\nIMPORTANTE: Use as ferramentas acima para obter dados reais. NAO invente.`
        : null
      toolInstruction = skillDesc
    }

    /* Rebuild system message with tool instructions */
    if (promptRegistry && typeof promptRegistry.buildSystemPrompt === 'function') {
      promptText = promptRegistry.buildSystemPrompt({
        tier: tierName,
        persona:
          store.settings.assistant_persona ||
          (promptRegistry.getDefaults ? promptRegistry.getDefaults().assistant_persona : 'MomAI'),
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

    /* Round loop: LLM ve tools, decide se chama alguma, resultado volta */
    let round = 0
    const maxToolRounds = 3

    while (round < maxToolRounds) {
      round++

      const currentMessages = [...messages]
      const allMessages = [systemMessage, ...currentMessages.filter((m) => m.role !== 'system')]
      estimatedPromptTokens =
        estimateTokenCount(systemMessage.content) +
        allMessages.reduce((acc, msg) => acc + estimateTokenCount(msg.content), 0)
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
        messages: allMessages
      }
      if (toolsPayload.length > 0 && round === 1) {
        requestBody.tools = toolsPayload
      }
      const tokenizePromise = tokenizePrompt(allMessages)
      lastSystemMessage = systemMessage
      lastCurrentMessages = currentMessages
      llamaState.contextUsedTokens = Math.min(
        Number(llamaState.contextTotalTokens || 8192),
        Math.max(0, estimatedPromptTokens)
      )
      debug(
        `[chat] Round ${round}: tools=${toolsPayload.length}, sysLen=${systemMessage.content.length}, msgs=${requestBody.messages.length}`
      )
      lastToolsPayload = toolsPayload

      tokenizePromise
        .then((realTokens) => {
          if (Number.isFinite(realTokens) && realTokens > 0) {
            estimatedPromptTokens = realTokens
          }
        })
        .catch((err) => debug('[background] tokenizePrompt failed:', err?.message || err))

      {
        const _sse = writeSse(res, { status: 'responding' })
        if (_sse instanceof Promise) await _sse
      }
      const tPreFetch = Date.now()
      lastTPreFetch = tPreFetch
      let tFirstToken = 0
      info(
        `[timing] pre-llama overhead: ${tPreFetch - t0}ms (tier=${tierName}, tools=${toolsPayload.length}, sysPromptLen=${systemMessage.content.length}, historyLen=${currentMessages.length})`
      )
      let llamaResp = await fetch(`${getLlamaBaseUrl()}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify(requestBody)
      })
      info(`[timing] llama first response: ${Date.now() - tPreFetch}ms (after pre-llama overhead)`)

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
            debug(
              `[chat] Context overflow detected. Retrying with compacted payload (level ${i + 1}).`
            )

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
        if (stopGenerationRequested || closed || res.destroyed) {
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
            {
              const _sse = writeSse(res, { error: parsed.error })
              if (_sse instanceof Promise) await _sse
              else if (_sse === false) break
            }
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
            if (!roundText) {
              tFirstToken = Date.now()
              lastTFirstToken = tFirstToken
              info(
                `[timing] first token received: ${Date.now() - t0}ms total (llama prefill+first=${Date.now() - tPreFetch}ms)`
              )
            }
            roundText += parsed.token
            generatedTokensEstimate += estimateTokenCount(parsed.token)
            llamaState.contextUsedTokens = Math.min(
              Number(llamaState.contextTotalTokens || 8192),
              Math.max(0, estimatedPromptTokens + generatedTokensEstimate)
            )
            assembled += parsed.token
            {
              const _sse = writeSse(res, { token: parsed.token })
              if (_sse instanceof Promise) await _sse
              else if (_sse === false) break
            }
            const now = Date.now()
            if (now - lastTtsFlushTime >= TTS_FLUSH_INTERVAL) {
              flushTtsChunks(false)
              lastTtsFlushTime = now
            }
          }
        }
      }

      debug(
        `[chat] Round result: text_len=${roundText.length}, tool_calls=${toolCallsAccum.length}`
      )
      lastFinishReason = roundFinishReason || lastFinishReason

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
          const skillRegistryRef = getSkillRegistry()
          let skillObj = null
          if (skillRegistryRef && typeof skillRegistryRef.getById === 'function') {
            skillObj = skillRegistryRef.getById(skillId)
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
                  {
                    const _sse = writeSse(res, { token })
                    if (_sse instanceof Promise) await _sse
                    else if (_sse === false) break
                  }
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
              {
                const _sse = writeSse(res, { active_skill: activeSkill })
                if (_sse instanceof Promise) await _sse
              }
              {
                const _sse = writeSse(res, { tool_steps: toolSteps })
                if (_sse instanceof Promise) await _sse
              }

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
          info(
            `[chat] Tools executed: ${executedTools.map((e) => e.name).join(', ')}. Continuing round.`
          )
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
          if (stopGenerationRequested || closed || res.destroyed) {
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
              {
                const _sse = writeSse(res, { token: parsed.token })
                if (_sse instanceof Promise) await _sse
                else if (_sse === false) break
              }
              const now = Date.now()
              if (now - lastTtsFlushTime >= TTS_FLUSH_INTERVAL) {
                flushTtsChunks(false)
                lastTtsFlushTime = now
              }
            }
          }
        }
      }
    }

    /* ── Retry: if LLM returned nothing usable (empty or only <think> tags),
       generate a contextual fallback so the user never sees a blank message ── */
    const visibleText = assembled.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
    if (!visibleText && bufferedStructuredResponse && directSkillResult?.instruction) {
      const skillText = directSkillResult.instruction
      assembled = skillText
      for (const token of splitTokens(skillText)) {
        if (closed || stopGenerationRequested || res.destroyed) break
        {
          const _sse = writeSse(res, { token })
          if (_sse instanceof Promise) await _sse
          else if (_sse === false) break
        }
      }
      flushTtsChunks(true)
    } else if (!visibleText && !bufferedStructuredResponse) {
      debug('[chat] LLM returned empty/think-only response, generating fallback')
      const fallbackMsg = generateFallbackReply(content, memoryContext, null, fallbackLanguage)
      for (const token of splitTokens(fallbackMsg)) {
        if (closed || stopGenerationRequested || res.destroyed) break
        assembled += token
        {
          const _sse = writeSse(res, { token })
          if (_sse instanceof Promise) await _sse
          else if (_sse === false) break
        }
        const now = Date.now()
        if (now - lastTtsFlushTime >= TTS_FLUSH_INTERVAL) {
          flushTtsChunks(false)
          lastTtsFlushTime = now
        }
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
              skill_name:
                getSkillRegistry()?.getById?.(session.skillId)?.manifest?.name || session.skillId,
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
    // Record observability trace (before anything that could fail: tts, sse done)
    try {
      const duration = Date.now() - t0
      const genTokens = estimateTokenCount(assembled || '')
      const trace = {
        id: `${threadId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        timestamp: Date.now(),
        type: toolSteps?.length ? 'llm_call' : activeSkill ? 'skill' : 'llm_call',
        total_duration: duration,
        pre_llm_duration: lastTPreFetch > 0 ? lastTPreFetch - t0 : 0,
        first_token_duration: lastTFirstToken > 0 ? lastTFirstToken - t0 : 0,
        generation_duration: lastTFirstToken > 0 ? duration - (lastTFirstToken - t0) : duration,
        system_prompt: lastSystemMessage?.content?.slice(0, 3000),
        messages: (lastCurrentMessages || [])
          .filter((m) => m.role !== 'system')
          .slice(-5)
          .map((m) => ({
            role: m.role || 'user',
            content: String(m.content || '').slice(0, 1000)
          })),
        response: (assembled || '').slice(0, 10000),
        tokens_per_second:
          duration > 0 && genTokens > 0 ? Math.round((genTokens / duration) * 1000 * 10) / 10 : 0,
        total_tokens: estimatedPromptTokens + genTokens,
        estimated_prompt_tokens: estimatedPromptTokens,
        generated_tokens: genTokens,
        model: tierName || 'unknown',
        tier: tierName || 'unknown',
        tools_count: lastToolsPayload?.length || 0,
        tool_calls: toolSteps?.length
          ? toolSteps.slice(0, 10).map((ts) => ({
              tool_name: ts.name || ts.tool_name || 'unknown',
              args: ts.args || ts.input || {},
              result: ts.result ? String(ts.result).slice(0, 500) : undefined,
              duration_ms: ts.duration_ms || 0
            }))
          : undefined,
        active_skill: activeSkill || undefined,
        thread_id: threadId || 'default',
        status: 'success'
      }
      shared.observabilityBuffer = shared.observabilityBuffer || []
      shared.observabilityBuffer.unshift(trace)
      if (shared.observabilityBuffer.length > 50) shared.observabilityBuffer.length = 50
      broadcast({ type: 'observability_trace', data: trace })
      info(
        '[OBS] Trace recorded id=' +
          trace.id +
          ' tps=' +
          trace.tokens_per_second +
          ' tokens=' +
          trace.total_tokens
      )
      recordMetric(trace)
    } catch (_) {
      warn('[OBS] Failed to record trace: ' + (_?.message || String(_)))
    }
    stopVoiceRequested = false
    flushTtsChunks(true)
    if (bufferedStructuredResponse) {
      {
        const _sse = writeSse(res, { structured_response: bufferedStructuredResponse })
        if (_sse instanceof Promise) await _sse
      }
    }
    {
      const _sse = writeSse(res, { done: true })
      if (_sse instanceof Promise) await _sse
    }
    endSse(res)
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
        {
          const _sse = writeSse(res, { token })
          if (_sse instanceof Promise) await _sse
          else if (_sse === false) break
        }
      }
    }

    appendMessage(threadId, 'assistant', assembled.trim() || fallbackMsg, {
      sources: memorySources.length ? memorySources : undefined,
      graph_data:
        activeSkill || toolSteps.length
          ? { active_skill: activeSkill, tool_steps: toolSteps }
          : null
    })
    const respondedOk = true
    stopVoiceRequested = false
    flushTtsChunks(true)
    {
      const _sse = writeSse(res, { done: true })
      if (_sse instanceof Promise) await _sse
    }
    endSse(res)
  } finally {
    activeChatControllers.delete(controller)
  }
}

async function runVoiceCommand(payload = {}) {
  let content = String(payload.content || '').trim()
  if (!content) return
  const threadId = String(payload.thread_id || 'default')
  const speakResponse = payload.speak_response !== false
  const originalContent = content
  debug(`[voice-cmd] runVoiceCommand called: content="${content.slice(0, 80)}", thread=${threadId}`)

  broadcast({ type: 'user', content: originalContent })

  // Handle "responda" voice command BEFORE keyword routing
  // This adds context about the last WhatsApp message and lets the LLM handle it
  const contentLower = content.toLowerCase()
  if (contentLower.includes('responda') || contentLower.includes('responde')) {
    try {
      const hostManager = require('./extension-host-manager')
      const histResult = await hostManager.sendToPersistent('whatsapp', { toolName: 'get_history', args: {} })
      if (histResult?.history?.length) {
        const last = histResult.history[0]
        content = `[Contexto: ultima mensagem no WhatsApp foi de "${last.from}" dizendo: "${last.text}"]\n${content}`
      }
    } catch {}
    // Skip keyword routing, fall through to LLM with context
  } else {
    // Normal keyword routing for non-responda commands
    const { routeByKeyword } = require('./keyword-router')
    const skillRegistry = shared.skillRegistry
    let keywordWebSources = null

    if (skillRegistry) {
      const match = routeByKeyword(content, skillRegistry)
      if (match) {
        broadcast({ type: 'assistant', data: { status: 'Executando skill...' } })
        try {
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Skill execution timed out')), 10000)
          )
          const result = await Promise.race([
            skillRegistry.execute(match.skillId, content, { searchWeb }),
            timeoutPromise
          ])

          if (result?.directResponse) {
            broadcast({ type: 'assistant', data: { status: 'responding' } })
            for (const token of splitTokens(result.directResponse)) {
              broadcast({ type: 'assistant', data: { token } })
            }
            if (result?.webSources) {
              broadcast({ type: 'assistant', data: { webSources: result.webSources } })
            }
            broadcast({ type: 'assistant', data: { done: true } })
            return
          }

          if (result?.instruction) {
            content = `${content}\n\n[Resultado de skill já executada]\n${result.instruction}`
          }
          keywordWebSources = result?.webSources || null
        } catch (err) {
          debug(`[voice-cmd] Skill execution error: ${err.message}`)
        }
      }
    }
  }

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
    speak_response: speakResponse,
    memory_sources: keywordWebSources?.length ? keywordWebSources : undefined
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
  buildObservabilityTrace,
  stopGenerationRequested,
  stopVoiceRequested,
  activeChatControllers
}

// Live getters/setters so all consumers read the current value,
// not a CommonJS value-copy made at module-load time.
Object.defineProperties(module.exports, {
  stopGenerationRequested: {
    get: () => stopGenerationRequested,
    set: (v) => {
      stopGenerationRequested = v
    },
    enumerable: true,
    configurable: true
  },
  stopVoiceRequested: {
    get: () => stopVoiceRequested,
    set: (v) => {
      stopVoiceRequested = v
    },
    enumerable: true,
    configurable: true
  },
  generationId: {
    get: () => generationId,
    set: (v) => {
      generationId = v
    },
    enumerable: true,
    configurable: true
  }
})
