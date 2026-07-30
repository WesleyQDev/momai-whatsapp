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
const { debug, info, warn, error } = require('../infrastructure/logger')
const {
  sendSseHeaders,
  writeSse,
  endSse,
  sidecarHeaders
} = require('../infrastructure/http-helpers')
const { pruneThread } = require('../infrastructure/store')
const { splitTokens, sanitizePromptText } = require('../utils/text')
const { isoNow } = require('../utils/time')
const llamaManager = require('./llama-manager')
const { getLlamaBaseUrl, saveStore } = llamaManager
const { runSemanticMemoryRetrieval, getTop5SkillsSemantic } = require('./semantic-engine')
const { isSkillEnabledByStore, getEnabledSkills } = require('./skill-orchestrator')
const { routeByKeyword } = require('./keyword-router')
const { buildToolPriority } = require('./tool-priority')
const { triggerAutoTts, ensurePython, broadcast } = require('./tts-service')
const { recordMetric } = require('./observability-service')
const { DEFAULT_TIERS, loadTierConfig } = require('../config/tiers')
const { DATA_DIR, NOTES_DIR, NOTES_INDEX_FILE } = require('../config/constants')
const { saveMemoryNoteFromContent, ensureNotesIndexExists } = require('../domain/note-manager')
const { createMemoryFS } = require('../infrastructure/memory-fs')
const { MEMORIES_DIR } = require('../config/constants')
const memoriesDir = MEMORIES_DIR

// Extracted pure modules (chat/)
const {
  estimateTokenCount,
  trimMessageForContext,
  buildCompactedMessages,
  buildHistoryWithinBudget,
  computeDynamicMaxTokens
} = require('./chat/context')
const {
  normalizeLanguageTag,
  normalizeForMatch,
  detectLanguageTag,
  humanizeFallbackReason,
  isLikelyIncompleteResponse
} = require('./chat/language')
const {
  shouldExposeSkillTools,
  normalizeDiscoveryText,
  buildToolResultPreview,
  estimateToolTokens,
  pickToolSkillIds
} = require('./chat/skills')
const { searchYouTube, searchWeb } = require('./chat/search')
const { shouldPreferSilentForCodeRequest, containsCodeLikeContent } = require('./chat/intent')
const { parseLlamaDataLine } = require('./chat/parser')

const tiersConfig = loadTierConfig()

const DEFAULT_SYSTEM_PROMPT =
  "You are MomAI, a helpful local-first AI assistant. Be concise, accurate, and friendly. Respond in the user's language."

let stopGenerationRequested = false
let stopVoiceRequested = false
let generationId = 0
const activeChatControllers = new Set()
const activeGenerationThreads = new Set()

function stopAllGenerationAndTts() {
  debug('[chat] stopAllGenerationAndTts called: stopping LLM and TTS')
  stopGenerationRequested = true
  stopVoiceRequested = true
  generationId += 1
  for (const controller of activeChatControllers) {
    try {
      controller.abort()
    } catch {}
  }
  activeChatControllers.clear()
  activeGenerationThreads.clear()
  try {
    const { stopAutoTts } = require('./tts-service')
    stopAutoTts()
  } catch {}
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
  const structuredResp = extras.structured_responses || extras.structured_response
  const item = {
    id: store.next_message_id++,
    role,
    content,
    created_at: isoNow(),
    sources: extras.sources ? JSON.stringify(extras.sources) : null,
    snippets: extras.snippets ? JSON.stringify(extras.snippets) : null,
    cards: extras.cards ? JSON.stringify(extras.cards) : null,
    graph_data: extras.graph_data || null,
    structured_response: structuredResp ? JSON.stringify(structuredResp) : null,
    is_interrupted: extras.is_interrupted ? true : undefined
  }
  messages.push(item)
  saveStore()
  pruneThread(threadId)
  return item
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

function buildLocalizedFallbackReply({ key, summary, reason, language, userName }) {
  const lang = normalizeLanguageTag(language)
  const safeSummary = String(summary || '').trim()
  const safeReason = String(reason || '').trim() || 'unknown reason'

  if (lang === 'pt-BR') {
    if (key === 'empty') return 'Me envie uma pergunta e eu te ajudo.'
    if (key === 'greeting') {
      const name = userName ? `, ${userName}` : ''
      return `Oi${name}! Estou online. Como posso te ajudar agora?`
    }
    if (key === 'reason')
      return 'Não foi possível conectar ao modelo local no momento. Por favor, tente novamente em instantes.'
    if (key === 'with_memory')
      return `Entendi seu pedido: "${safeSummary}". Também considerei o contexto das suas notas locais.`
    return `Entendi seu pedido: "${safeSummary}". Vou seguir com isso.`
  }

  if (lang === 'en') {
    if (key === 'empty') return 'Send me a question and I will help you.'
    if (key === 'greeting') {
      const name = userName ? `, ${userName}` : ''
      return `Hi${name}! I am online. How can I help you now?`
    }
    if (key === 'reason')
      return 'Unable to connect to the local model right now. Please try again in a moment.'
    if (key === 'with_memory')
      return `Got it: "${safeSummary}". I also considered your local notes context.`
    return `Got it: "${safeSummary}". I will proceed with that.`
  }

  if (lang === 'es') {
    if (key === 'empty') return 'Enviame una pergunta y te ayudare.'
    if (key === 'greeting') {
      const name = userName ? `, ${userName}` : ''
      return `Hola${name}! Estou en linea. Como posso te ajudar agora?`
    }
    if (key === 'reason')
      return 'No se pudo conectar al modelo local en este momento. Por favor, inténtalo de nuevo en unos momentos.'
    if (key === 'with_memory')
      return `Entendi tu pedido: "${safeSummary}". Tambien considere el contexto de tus notas locales.`
    return `Entendi tu pedido: "${safeSummary}". Voy a continuar con eso.`
  }

  const promptRegistry = getPromptRegistry()
  if (!promptRegistry || typeof promptRegistry.buildFallbackReply !== 'function') {
    return safeSummary
  }
  return promptRegistry.buildFallbackReply({
    key,
    summary: safeSummary,
    reason: safeReason,
    userName
  })
}

function generateFallbackReply(content, memoryContext, reason, responseLanguage, userName) {
  const trimmed = String(content || '').trim()
  if (!trimmed) {
    return buildLocalizedFallbackReply({ key: 'empty', language: responseLanguage, userName })
  }

  if (/^(oi|ol[aá]|bom dia|boa tarde|boa noite|hello|hi|hola|buenas)\b/i.test(trimmed)) {
    return buildLocalizedFallbackReply({ key: 'greeting', language: responseLanguage, userName })
  }

  const summary = trimmed.length > 320 ? `${trimmed.slice(0, 320)}...` : trimmed
  const hasMemory = typeof memoryContext === 'string' && memoryContext.trim().length > 0

  if (reason) {
    return buildLocalizedFallbackReply({
      key: 'reason',
      summary,
      reason,
      language: responseLanguage,
      userName
    })
  }
  if (hasMemory) {
    return buildLocalizedFallbackReply({
      key: 'with_memory',
      summary,
      language: responseLanguage,
      userName
    })
  }
  return buildLocalizedFallbackReply({
    key: 'default',
    summary,
    language: responseLanguage,
    userName
  })
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
  const userName = store.settings.user_name || 'Usuário'
  const reply = generateFallbackReply(content, memoryContext, reason, responseLanguage, userName)
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
    await writeSse(res, { status: 'thinking' })
  }
  {
    await writeSse(res, { status: 'responding' })
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
      if (!await writeSse(res, { token })) break
    }
    await new Promise((r) => setTimeout(r, 15))
  }

  appendMessage(threadId, 'assistant', assembled.trim() || 'Interrupted.')
  {
    await writeSse(res, { done: true })
  }
  endSse(res)
}

/* Memoria: avalia conversa anterior em background e consolida */
let _lastThreadForMemory = null
async function consolidateMemoryFromThread(threadId, storeRef) {
  try {
    const msgs = (storeRef.thread_messages || {})[threadId]
    if (!msgs || msgs.length < 1) return
    const recent = msgs.slice(-8).map((m) => `${m.role}: ${m.content}`).join('\n')
    const memFS = createMemoryFS({ memoriesDir, userName: storeRef.settings?.user_name })
    const currentMemory = memFS.readMemoryFile('usuario').content
    const currentKnowledge = memFS.readMemoryFile('conhecimento').content
    const prompt = `Based on this recent conversation, update the user memory files with any new information about the user.

Recent conversation:
${recent}

Current user profile memory:
${currentMemory || '(empty)'}

Current knowledge:
${currentKnowledge || '(empty)'}

If there is new information about the user (preferences, facts, personal details), output ONLY the updated "usuario" content (markdown format). If no new info, output "NO_CHANGE".`
    const resp = await fetch(`${getLlamaBaseUrl()}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-4o', messages: [{ role: 'user', content: prompt }], max_tokens: 512, stream: false })
    })
    if (!resp.ok) return
    const data = await resp.json()
    const text = (data.choices?.[0]?.message?.content || '').trim()
    if (text && text !== 'NO_CHANGE') {
      memFS.writeMemoryFile('usuario', text)
      debug(`[memory] Background consolidation updated usuario.md from thread ${threadId}`)
    }
  } catch (e) {
    debug(`[memory] Background consolidation failed: ${e.message}`)
  }
}

async function streamLlamaChat(req, res, payload) {
  const content = String(payload.content || '')
  const discoveryContent = normalizeDiscoveryText(payload.discovery_content || content)
  const rawThreadId = String(payload.thread_id || '').trim()
  const { setActiveThreadId, getActiveThreadId } = require('./shared-state')
  let threadId = rawThreadId
  if (!threadId || threadId === 'default') {
    threadId = getActiveThreadId()
  } else {
    setActiveThreadId(threadId)
  }

  /* Evita geracoes concorrentes para a mesma thread */
  if (activeGenerationThreads.has(threadId)) {
    debug(`[chat] Duplicate generation prevented for thread=${threadId}`)
    return
  }
  activeGenerationThreads.add(threadId)

  /* Dispara consolidação de memoria em background quando muda de sessão */
  if (_lastThreadForMemory && _lastThreadForMemory !== threadId) {
    consolidateMemoryFromThread(_lastThreadForMemory, store)
  }
  _lastThreadForMemory = threadId

  const responseLanguage = resolveResponseLanguage(content, threadId)
  const fallbackLanguage = normalizeLanguageTag(store.settings.locale || 'pt-BR')
  const speakResponse = payload.speak_response !== false
  const isCallMode = Boolean(payload.is_call_mode || store.call_mode)
  const isVoiceCommand = Boolean(payload.is_voice_command)
  const silentForCodeIntent = shouldPreferSilentForCodeRequest(content)
  const tierName = store.settings.ai_tier || 'pro'
  const isUltra = tierName === 'ultra'
  let memoryContext = typeof payload.memory_context === 'string' ? payload.memory_context : null
  let memorySources = Array.isArray(payload.memory_sources) ? [...payload.memory_sources] : []
  let toolSteps = []
  const activeSkillIds = new Set()
  const META_TOOL_DEFS = [
    {
      type: 'function',
      function: {
        name: 'memory',
        description: 'Call this when someone tells you something about themselves. Required: action="add", target="usuario", content="what they said". Example: memory(add, usuario, "prefers dark mode"). This is how you remember things between conversations.',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['add', 'list', 'update'], description: '"add" to save a new fact' },
            target: { type: 'string', enum: ['usuario', 'conhecimento'], description: '"usuario" for user info, "conhecimento" for facts' },
            content: { type: 'string', description: 'The fact to save, in your own words' }
          },
          required: ['action', 'target', 'content']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'list_skills',
        description: 'Search available skills by query. Returns skill names and descriptions.',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'What you need help with' }
          },
          required: ['query']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'request_skill',
        description: 'Load tools from a specific skill so you can use it. Skill must be installed.',
        parameters: {
          type: 'object',
          properties: {
            skill_name: { type: 'string', description: 'Skill name as returned by list_skills' }
          },
          required: ['skill_name']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'search_history',
        description: 'Search conversations. Use message_number to get a message by position (0 = first). By default searches the current session; add all_sessions=true for all sessions. Use query for keyword search across all sessions.',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Keywords to search for in messages' },
            message_number: { type: 'integer', description: 'Get message at this position (0 = first in current session)' },
            all_sessions: { type: 'boolean', description: 'If true, message_number counts across all sessions chronologically' }
          }
        }
      }
    }
  ]
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
  let ready = await llamaManager.ensureLlamaReady()
  debug(
    `[chat] ensureLlamaReady returned: ${ready}, llamaState.ready=${llamaState.ready}, lastError=${llamaState.lastError}`
  )
  if (!ready) {
    warn(`[chat] Initial ensureLlamaReady failed (${llamaState.lastError || 'unavailable'}). Retrying without force...`)
    await new Promise((r) => setTimeout(r, 800))
    ready = await llamaManager.ensureLlamaReady()
  }
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
  const isExplicitMemorySearch = /\b(pesquisar|buscar|pesquise|procure|minhas?\s+notas|lembrete|mem[óo]ria)\b/i.test(content)
  if (isUltra && (!isCallMode || isExplicitMemorySearch)) {
    semanticPromise = runSemanticMemoryRetrieval(content, 6)
  }

  appendMessage(threadId, 'user', content, {
    sources: memorySources.length ? memorySources : undefined,
    graph_data: null
  })

  sendSseHeaders(res)
  {
    await writeSse(res, { status: 'Analisando...' })
  }
  if (memorySources.length) {
    await writeSse(res, { sources: memorySources })
  }

  const isExplicitSkillRequest = /\b(abrir|abram|executar|rodar|pesquisar\s+no|youtube|skill|ferramenta|criar|agendar)\b/i.test(content)
  const isVoiceResponse = isCallMode || isVoiceCommand || speakResponse

  const baseCtx = Number(llamaState.contextTotalTokens || 8192)
  const dynamicHistoryBudget = Math.max(450, Math.floor(baseCtx * 0.62))
  const threadMsgs = getThreadMessages(threadId)
  const rawHistory = buildHistoryWithinBudget(threadMsgs, dynamicHistoryBudget)
  const history = rawHistory.map((msg) => ({
    role: msg.role === 'assistant' ? 'assistant' : 'user',
    content: sanitizePromptText(String(msg.content || ''))
  }))

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
      error('[ChatService] Semantic memory failed, continuing without it:', e)
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
        headers: sidecarHeaders()
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
  let bufferedStructuredResponses = []
  let ttsCursor = 0
  // Ultra-low prebuffer threshold for voice responses for sub-second voice startup
  const prebufferChars = isVoiceResponse ? 20 : Math.max(15, Number(store.settings.prebuffer_chars || 25))
  let ttsProcessing = false
  const ttsQueue = []

  const enqueueAutoTts = (chunk) => {
    const cleaned = String(chunk || '').trim()
    if (cleaned.length < 2) {
      debug(`[TTS-DEBUG] enqueueAutoTts SKIPPED: cleaned.length=${cleaned.length}`)
      return
    }
    debug(`[TTS-DEBUG] enqueueAutoTts CALLING triggerAutoTts: cleaned="${cleaned.slice(0, 60)}"`)
    ttsQueue.push(cleaned)
    processTtsQueue()
  }

  async function processTtsQueue() {
    if (ttsProcessing || currentGen !== generationId || stopGenerationRequested) return
    ttsProcessing = true
    while (ttsQueue.length > 0) {
      if (currentGen !== generationId || stopGenerationRequested) {
        ttsQueue.length = 0
        break
      }
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
      debug(
        `[TTS-DEBUG] flushTtsChunks(${final}) guard blocked: speakResponse=${speakResponse} silent=${silentForCodeIntent} stopGen=${stopGenerationRequested} genMatch=${currentGen === generationId} closed=${closed}`
      )
      return
    }
    if (containsCodeLikeContent(assembled)) {
      debug(
        `[TTS-DEBUG] flushTtsChunks(${final}) blocked: containsCodeLikeContent=true assembled.length=${assembled.length}`
      )
      return
    }
    const pending = assembled.slice(ttsCursor)
    if (!pending) {
      debug(`[TTS-DEBUG] flushTtsChunks(${final}) blocked: pending empty, ttsCursor=${ttsCursor}`)
      return
    }

    let cut = -1
    for (let i = 0; i < pending.length; i += 1) {
      const ch = pending[i]
      if (ch === '.' || ch === '!' || ch === '?' || ch === '\n') {
        cut = i + 1
        break
      }
      // Only cut at commas/semicolons if phrase is long enough (> 50 chars)
      if ((ch === ',' || ch === ';' || ch === ':') && i >= 50) {
        cut = i + 1
        break
      }
    }

    // Flush TTS chunks on natural sentence boundaries (punctuation) to keep phrases complete and intact

    if (!final && cut <= 0) return
    if (final && cut <= 0) cut = pending.length

    const chunk = pending.slice(0, cut).trim()
    ttsCursor += cut
    debug(
      `[TTS-DEBUG] flushTtsChunks(${final}) ENQUEUING: cut=${cut} cursor=${ttsCursor} chunkLen=${chunk.length} chunk="${chunk.slice(0, 60)}"`
    )
    enqueueAutoTts(chunk)
  }

  // Limit history messages to stay within local LLM context limits efficiently
  let messages = history.length > 20 ? history.slice(-20) : [...history]
  const hasHistory = messages.length > 0
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
            searchWeb,
            searchYouTube
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
              await writeSse(res, { active_skill: activeSkill })
            }
          }
          if (toolSteps.length > 0) {
            {
              await writeSse(res, { tool_steps: toolSteps })
            }
          }
          const shortText = String(hookResult.replaceText || '').trim()
          if (shortText) {
            assembled = shortText
            for (const token of splitTokens(shortText)) {
              {
                if (!await writeSse(res, { token })) break
              }
            }
          }
          if (hookResult.structuredResponse) {
            bufferedStructuredResponses.push(hookResult.structuredResponse)
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
            structured_responses: bufferedStructuredResponses.length > 0 ? bufferedStructuredResponses : undefined
          })
          if (bufferedStructuredResponses.length > 0) {
            {
              await writeSse(res, { structured_responses: bufferedStructuredResponses })
            }
          }
          {
            await writeSse(res, { done: true })
          }
          endSse(res)
          return
        }
      } catch (err) {
        debug(`[chat] beforeModel hook failed for ${skill.id}: ${err.message}`)
      }
    }

    /* Descobre as top 5 skills */
    let discoveredSkillIds = []
    let topScores = {}
    let toolsPayload = []

    const discoveryLimit = 5

    const topN = await (async () => {
      if (isUltra) {
        const [semanticResults, lexicalResults] = await Promise.all([
          getTop5SkillsSemantic(discoveryContent),
          skillRegistry?.discoverTopN?.(discoveryContent, discoveryLimit) || Promise.resolve([])
        ])
        const topSemanticScore = semanticResults[0]?.score || 0

        // If semantic confidence is weak, rely on lexical ranking
        if (semanticResults.length > 0 && topSemanticScore >= 0.35) {
          const blended = new Map()
          for (const r of semanticResults) {
            blended.set(r.id, { id: r.id, score: (r.score || 0) * 0.7 })
          }
          for (const r of lexicalResults) {
            const prev = blended.get(r.id)
            const add = (r.confidence || 0) * 0.3
            blended.set(r.id, { id: r.id, score: (prev?.score || 0) + add })
          }
          const ranked = [...blended.values()]
            .sort((a, b) => b.score - a.score)
            .slice(0, discoveryLimit)
          ranked.forEach((r) => {
            topScores[r.id] = r.score
          })
          return ranked.map((r) => r.id)
        }

        if (lexicalResults.length > 0) {
          lexicalResults.forEach((x) => {
            topScores[x.id] = x.confidence
          })
          return lexicalResults.map((x) => x.id)
        }
        return semanticResults.slice(0, discoveryLimit).map((r) => r.id)
      }
      if (skillRegistry && typeof skillRegistry.discoverTopN === 'function') {
        const d = skillRegistry.discoverTopN(discoveryContent, discoveryLimit)
        if (d.length > 0) {
          d.forEach((x) => {
            topScores[x.id] = x.confidence
          })
          return d.map((x) => x.id)
        }
      }
      return []
    })()
    discoveredSkillIds = topN

    let toolInstruction = null
    let directSkillResult = null

    /* Converte as top 5 skills em tools nativas pro LLM */
    // If keyword routing found a strong match, ensure that skill is selectable even when
    // semantic/lexical top-N did not rank it in this turn.
    let routedSkillId = null
    try {
      const kwMatch = routeByKeyword(discoveryContent, skillRegistry)
      if (kwMatch?.skillId && !discoveredSkillIds.includes(kwMatch.skillId)) {
        const kwSkill = skillRegistry?.getById?.(kwMatch.skillId)
        if (kwSkill?.enabled && isSkillEnabledByStore(kwSkill)) {
          discoveredSkillIds = [kwMatch.skillId, ...discoveredSkillIds].slice(0, discoveryLimit)
          topScores[kwMatch.skillId] = Math.max(Number(topScores[kwMatch.skillId] || 0), 1)
          routedSkillId = kwMatch.skillId
        }
      } else if (kwMatch?.skillId) {
        routedSkillId = kwMatch.skillId
      }
    } catch {}

    const selectedSkills = discoveredSkillIds
      .map((id) => skillRegistry?.getById?.(id))
      .filter(Boolean)
    const shouldSendTools = shouldExposeSkillTools(discoveryContent, selectedSkills, skillRegistry)
    if (!shouldSendTools && selectedSkills.length > 0) {
      debug(
        `[chat] Tools withheld for context economy. Selected skills: ${selectedSkills
          .map((s) => s.id)
          .join(', ')}`
      )
    }

    /* Converte skills em tools flat */
    let toolToSkillMap = new Map()
    if (
      shouldSendTools &&
      selectedSkills.length > 0 &&
      skillRegistry &&
      typeof skillRegistry.toOpenAITools === 'function'
    ) {
      const skillIdsForTools = pickToolSkillIds({
        discoveredSkillIds,
        routedSkillId,
        topScores,
        activeSkillIds: [...activeSkillIds]
      })
      const result = skillRegistry.toOpenAITools(skillIdsForTools)
      toolsPayload = result.tools || []
      toolToSkillMap = result.toolToSkillMap || new Map()

      const contextTotal = Number(llamaState.contextTotalTokens || 8192)
      const budgetTokens = Math.max(450, Math.floor(contextTotal * 0.20))
      const estimatedTokens = toolsPayload.reduce((s, t) => s + estimateToolTokens(t), 0)
      if (estimatedTokens > budgetTokens && skillIdsForTools.length > 1) {
        const sorted = [...skillIdsForTools].sort((a, b) => {
          const aActive = activeSkillIds.has(a)
          const bActive = activeSkillIds.has(b)
          if (aActive !== bActive) return aActive ? -1 : 1
          return (topScores?.[b] || 0) - (topScores?.[a] || 0)
        })
        const trimmed = []
        let used = 0
        for (const id of sorted) {
          const skillTools = toolsPayload.filter((t) => toolToSkillMap.get(t.function?.name) === id)
          const cost = skillTools.reduce((s, t) => s + estimateToolTokens(t), 0)
          if (used + cost <= budgetTokens || activeSkillIds.has(id)) {
            trimmed.push(...skillTools)
            used += cost
          } else {
            debug(`[chat] Budget trim: dropped ${id} (${cost} tokens, budget=${budgetTokens}, used=${used})`)
          }
        }
        toolsPayload = trimmed
      }
    }

    /* Skills disponiveis e regras de prioridade para o LLM */
    if (selectedSkills.length > 0) {
      const skillsBlock = selectedSkills
        .map((s) => `- ${s.manifest.name}: ${s.manifest.description}`)
        .join('\n')
      const toolPriorityBody = buildToolPriority(selectedSkills)
      const toolPriorityBlock = toolPriorityBody ? `Prioridade:\n${toolPriorityBody}` : ''
      const toolAvailabilityNote = shouldSendTools
        ? 'Tool schemas for these skills are available in this turn.'
        : 'Only skill summaries are available in this turn. Request a specific skill by name if you need its tools.'
      const activeSkillsLine = activeSkillIds.size > 0
        ? `Active skills this turn: ${[...activeSkillIds].join(', ')}.`
        : ''
      const metaToolsNote = 'If you need another skill, use list_skills to search or request_skill to load.'
      const skillDesc = [
        `Skills ativas:\n${skillsBlock}`,
        toolAvailabilityNote,
        toolPriorityBlock,
        activeSkillsLine,
        metaToolsNote
      ].filter(Boolean).join('\n\n')
      toolInstruction = skillDesc
    }

    /* Rebuild system message with tool instructions */
    let promptText = ''
    if (promptRegistry && typeof promptRegistry.buildSystemPrompt === 'function') {
      promptText = promptRegistry.buildSystemPrompt({
        threadId,
        tier: tierName,
        userName: store.settings.user_name || 'Usuário',
        persona:
          store.settings.assistant_persona ||
          (promptRegistry.getDefaults ? promptRegistry.getDefaults().assistant_persona : 'MomAI'),
        memoryContext,
        toolInstruction,
        responseStyle,
        responseLanguage,
        locale: store.settings.locale || 'pt-BR',
        modelName: store.settings.ai_model || 'local',
        hasHistory,
        memoriesDir
      })
    }
    if (extraSystemInstructions.length > 0) {
      promptText += `\n\n${extraSystemInstructions.join('\n\n')}`
    }
    let finalPrompt = promptText
    if (isVoiceResponse) {
      const userLocale = store.settings.locale || 'pt-BR'
      finalPrompt = `${promptText}\n\nVOICE MODE INSTRUCTION:\nRespond in the user's language (${userLocale}) naturally, warmly, directly, and concisely (1 to 3 short sentences for spoken playback). Do not use markdown formatting like bold, lists, code blocks, or headers unless requested.`
    }
    const systemMessage = {
      role: 'system',
      content: sanitizePromptText(finalPrompt)
    }

    /* Prepend meta-tools to tools payload */
    toolsPayload = [...META_TOOL_DEFS, ...toolsPayload]

    /* Round loop: LLM ve tools, decide se chama alguma, resultado volta */
    let round = 0
    const maxToolRounds = isUltra ? 4 : 3

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
        top_p: Number.isFinite(tier.top_p) ? tier.top_p : 0.9,
        top_k: Number.isFinite(tier.top_k) ? tier.top_k : 40,
        presence_penalty: Number.isFinite(tier.presence_penalty) ? tier.presence_penalty : 0,
        repeat_penalty: Number.isFinite(tier.repetition_penalty) ? tier.repetition_penalty : 1,
        max_tokens: computeDynamicMaxTokens(
          Number.isFinite(tier.max_tokens) ? tier.max_tokens : 320,
          estimatedPromptTokens,
          llamaState.contextTotalTokens
        ),
        messages: allMessages
      }
      if (toolsPayload.length > 0) {
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

      if (round === 1 && selectedSkills.length > 0) {
        const name = routedSkillId
          ? skillRegistry?.getById?.(routedSkillId)?.manifest?.name || routedSkillId
          : null
        const status = name ? `Usando ${name}...` : 'Analisando...'
        await writeSse(res, { status })
      } else if (round === 1) {
        await writeSse(res, { status: 'Analisando...' })
      }

      tokenizePromise
        .then((realTokens) => {
          if (Number.isFinite(realTokens) && realTokens > 0) {
            estimatedPromptTokens = realTokens
          }
        })
        .catch((err) => debug('[background] tokenizePrompt failed:', err?.message || err))

async function fetchLlamaWithRetry(url, options, maxAttempts = 3) {
  let lastErr = null
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const resp = await fetch(url, options)
      if (resp.ok || resp.status === 400) {
        return resp
      }
      const text = await resp.text().catch(() => '')
      lastErr = new Error(`HTTP ${resp.status}: ${text.slice(0, 240)}`)
      warn(`[chat] LLM attempt ${attempt}/${maxAttempts} returned status ${resp.status}`)
    } catch (err) {
      if (options.signal?.aborted) {
        throw err
      }
      lastErr = err
      warn(`[chat] LLM attempt ${attempt}/${maxAttempts} failed: ${err.message}`)

      if (attempt < maxAttempts) {
        try {
          debug(`[chat] Attempting llamaManager.ensureLlamaReady() to recover server before retry ${attempt + 1}...`)
          await llamaManager.ensureLlamaReady()
        } catch (recErr) {
          debug(`[chat] Server auto-recovery attempt failed: ${recErr.message}`)
        }
      }
    }

    if (attempt < maxAttempts) {
      const delay = Math.min(1500, 500 * Math.pow(2, attempt - 1))
      debug(`[chat] Retrying local LLM completion in ${delay}ms (attempt ${attempt + 1}/${maxAttempts})...`)
      await new Promise((r) => setTimeout(r, delay))
    }
  }
  throw lastErr
}

      {
        await writeSse(res, { status: 'responding' })
      }
      const tPreFetch = Date.now()
      lastTPreFetch = tPreFetch
      let tFirstToken = 0
      info(
        `[timing] pre-llama overhead: ${tPreFetch - t0}ms (tier=${tierName}, tools=${toolsPayload.length}, sysPromptLen=${systemMessage.content.length}, historyLen=${currentMessages.length})`
      )
      let llamaResp = await fetchLlamaWithRetry(`${getLlamaBaseUrl()}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify(requestBody)
      }, 3)
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

            llamaResp = await fetchLlamaWithRetry(`${getLlamaBaseUrl()}/v1/chat/completions`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              signal: controller.signal,
              body: JSON.stringify(retryBody)
            }, 3)
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
                userName: store.settings.user_name || 'Usuário',
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
              if (!await writeSse(res, { error: parsed.error })) break
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
              if (!await writeSse(res, { token: parsed.token })) break
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
        let skipLlmRound = false
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

          /* Check if tool is a meta-tool */
          const isMetaTool = ['memory', 'list_skills', 'request_skill', 'search_history'].includes(toolName)
          if (isMetaTool) {
            const metaStartedAt = Date.now()
            const metaStep = {
              skill_id: 'momai',
              skill_name: 'MomAI',
              tool: toolName,
              name: toolName,
              description: toolName === 'memory' ? 'Salvar informação na memória' :
                toolName === 'list_skills' ? 'Buscar skills disponíveis' :
                'Carregar ferramentas de uma skill',
              status: 'running',
              started_at: isoNow(),
              args: args?.query || args?.skill_name || (args?.action ? `${args.action} ${args.target || ''}`.trim() : null)
            }
            toolSteps.push(metaStep)
            { await writeSse(res, { tool_steps: toolSteps }) }

            let result
            if (toolName === 'memory') {
              const memFS = createMemoryFS({ memoriesDir })
              try {
                const action = String(args.action || '').trim()
                const target = String(args.target || '').trim()
                if (action === 'add') {
                  memFS.addMemoryEntry(target, args.content || '')
                  result = ''
                } else if (action === 'update') {
                  if (!String(args.content || '').trim()) {
                    result = 'Error: update requires content. Use add for simple saves.'
                  } else {
                    memFS.writeMemoryFile(target, args.content)
                    result = ''
                  }
                } else {
                  const r = memFS.readMemoryFile(target)
                  result = r.content || `[${target} memory is empty]`
                }
              } catch (e) {
                result = `Error: ${e.message}`
              }
            } else if (toolName === 'list_skills') {
              result = skillRegistry.executeMetaTool('list_skills', args)
            } else if (toolName === 'request_skill') {
              const skillName = String(args.skill_name || '').trim()
              const skill = skillRegistry.getById(skillName)
              if (skill && skill.enabled) {
                activeSkillIds.add(skillName)
              }
              result = skillRegistry.executeMetaTool('request_skill', args)
            } else if (toolName === 'search_history') {
              const msgNum = args.message_number
              if (msgNum !== undefined && msgNum !== null) {
                const allMsgs = []
                const source = args.all_sessions
                  ? Object.values({ ...(store.thread_messages || {}) })
                  : [(store.thread_messages || {})[threadId] || []]
                for (const messages of source) {
                  for (const m of messages) allMsgs.push(m)
                }
                allMsgs.sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0))
                const idx = Number(msgNum)
                if (idx >= 0 && idx < allMsgs.length) {
                  const m = allMsgs[idx]
                  result = `[#${idx}][${m.role}] ${String(m.content || '').slice(0, 1000)}`
                } else {
                  const scopeStr = args.all_sessions ? 'across all sessions' : 'in current session'
                  result = `Message #${idx} not found. There are ${allMsgs.length} messages ${scopeStr}.`
                }
              } else {
                const q = String(args.query || '').trim().toLowerCase()
                if (!q) { result = 'Provide a query or message_number.'; return }
                const results = []
                const MAX_RESULTS = 5
                const sourceThreads = args.all_sessions
                  ? Object.values({ ...(store.thread_messages || {}) })
                  : [(store.thread_messages || {})[threadId] || []]
                for (const messages of sourceThreads) {
                  if (results.length >= MAX_RESULTS) break
                  for (const msg of messages) {
                    if (results.length >= MAX_RESULTS) break
                    const text = String(msg.content || '').toLowerCase()
                    if (text.includes(q)) {
                      results.push(`[${msg.role}] ${String(msg.content || '').slice(0, 300)}`)
                    }
                  }
                }
                const scopeLabel = args.all_sessions ? 'any session' : 'current session'
                result = results.length > 0
                  ? `Messages matching "${args.query}":\n${results.join('\n---\n')}`
                  : `No messages found matching "${args.query}" in ${scopeLabel}.`
              }
            }

            metaStep.status = result ? 'success' : 'error'
            metaStep.duration_ms = Date.now() - metaStartedAt
            metaStep.finished_at = isoNow()
            if (result) metaStep.result_preview = String(result).slice(0, 220)
            { await writeSse(res, { tool_steps: toolSteps }) }

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
              content: result
            })
            executedTools.push({ name: toolName, result })
            continue
          }

          /* Determine skillId from toolToSkillMap for non-meta tools */
          const executingSkillId = toolToSkillMap.get(toolName)
          if (executingSkillId) {
            activeSkillIds.add(executingSkillId)
          }

          /* Converte tools normais para execucao */
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
                // R003 (privacy plan): run purge before clearing so the
                // saved list always respects the retention window.
                const { purgeExpiredReminders } = require('./reminder-service')
                store.reminders = purgeExpiredReminders(store.reminders)
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
              searchWeb,
              searchYouTube
            }

            try {
              const skillRegistry = getSkillRegistry()
              if (!skillRegistry || typeof skillRegistry.execute !== 'function') {
                throw new Error('Skill registry not available')
              }

              const toolStartedAt = Date.now()
              const runningStep = {
                skill_id: skillId,
                skill_name: skillObj.manifest.name,
                tool: toolName,
                name: toolName,
                description: String(
                  (skillObj.manifest.tools || []).find((t) => t.name === toolName)?.description ||
                    ''
                ),
                status: 'running',
                started_at: isoNow(),
                args: args?.query || args?.content || null
              }
              toolSteps.push(runningStep)
              activeSkill = skillId
              {
                await writeSse(res, { active_skill: activeSkill })
              }
              {
                await writeSse(res, { tool_steps: toolSteps })
              }

              const result = await skillRegistry.execute(
                skillId,
                args.content || content,
                runtimeContext,
                args,
                toolName
              )
              if (result?.directResponse) skipLlmRound = true
              const toolResultText = skipLlmRound
                ? ''
                : result?.instruction || JSON.stringify(result || {})
              if (result?.structuredResponse) {
                bufferedStructuredResponses.push(result.structuredResponse)
                { await writeSse(res, { structured_responses: bufferedStructuredResponses }) }
              } else if (result?.directResponse) {
                assembled += `\n${result.directResponse}`
                for (const token of splitTokens(result.directResponse)) {
                  {
                    if (!await writeSse(res, { token })) break
                  }
                }
              }

              runningStep.status = result ? 'success' : 'error'
              runningStep.duration_ms = Date.now() - toolStartedAt
              runningStep.finished_at = isoNow()
              const preview = buildToolResultPreview(result)
              if (preview) runningStep.result_preview = preview
              {
                await writeSse(res, { tool_steps: toolSteps })
              }

              if (Array.isArray(result?.webSources) && result.webSources.length) {
                memorySources = [...memorySources, ...result.webSources].slice(0, 12)
                {
                  await writeSse(res, { sources: memorySources })
                }
                {
                  await writeSse(res, { webSources: result.webSources })
                }
              }

              if (!skipLlmRound) {
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
              }
              executedTools.push({
                name: toolName,
                result: toolResultText || result?.directResponse || 'ok'
              })
            } catch (execError) {
              if (toolSteps.length > 0) {
                const last = toolSteps[toolSteps.length - 1]
                if (last && last.name === toolName && last.status === 'running') {
                  last.status = 'error'
                  last.finished_at = isoNow()
                  {
                    await writeSse(res, { tool_steps: toolSteps })
                  }
                }
              }
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
        if (skipLlmRound) break
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
      !bufferedStructuredResponses.length &&
      isLikelyIncompleteResponse(assembled, lastFinishReason)
    ) {
      const continuationPrompt =
        'Continue exactly from where you left off without repeating content already sent. Close any open code blocks and pending tags.'
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
        presence_penalty: Number.isFinite(tier.presence_penalty) ? tier.presence_penalty : 0,
        repetition_penalty: Number.isFinite(tier.repetition_penalty) ? tier.repetition_penalty : 1,
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
                if (!await writeSse(res, { token: parsed.token })) break
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
    if (!visibleText && bufferedStructuredResponses.length && directSkillResult?.instruction) {
      const skillText = directSkillResult.instruction
      assembled = skillText
      for (const token of splitTokens(skillText)) {
        if (closed || stopGenerationRequested || res.destroyed) break
        {
          if (!await writeSse(res, { token })) break
        }
      }
      flushTtsChunks(true)
    } else if (!visibleText && !bufferedStructuredResponses.length) {
      debug('[chat] LLM returned empty/think-only response, generating fallback')
      const userName = store.settings.user_name || 'Usuário'
      const fallbackMsg = generateFallbackReply(
        content,
        memoryContext,
        null,
        fallbackLanguage,
        userName
      )
      for (const token of splitTokens(fallbackMsg)) {
        if (closed || stopGenerationRequested || res.destroyed) break
        assembled += token
        {
          if (!await writeSse(res, { token })) break
        }
        const now = Date.now()
        if (now - lastTtsFlushTime >= TTS_FLUSH_INTERVAL) {
          flushTtsChunks(false)
          lastTtsFlushTime = now
        }
      }
      flushTtsChunks(true)
    }

    if (bufferedStructuredResponses.length === 0 && activeHookSessions.length > 0) {
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
              searchYouTube,
              beforeModel: session.beforeModel || null
            },
            responseText: assembled
          })
          if (!hookResult?.handled) continue

          if (hookResult.structuredResponse) {
            bufferedStructuredResponses.push(hookResult.structuredResponse)
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

    appendMessage(threadId, 'assistant', assembled.trim() || 'Interrupted.', {
      sources: memorySources.length ? memorySources : undefined,
      graph_data:
        activeSkill || toolSteps.length
          ? { active_skill: activeSkill, tool_steps: toolSteps }
          : null,
      structured_responses: bufferedStructuredResponses.length > 0 ? bufferedStructuredResponses : undefined
    })
    llamaState.contextUsedTokens = Math.min(
      Number(llamaState.contextTotalTokens || 8192),
      Math.max(0, estimatedPromptTokens + estimateTokenCount(assembled))
    )
    // Record observability trace (before anything that could fail: tts, sse done)
    try {
      const duration = Date.now() - t0
      const genTokens = estimateTokenCount(assembled || '')
      const genDuration = lastTFirstToken > 0 ? duration - (lastTFirstToken - t0) : duration
      const trace = {
        id: `${threadId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        timestamp: Date.now(),
        type: toolSteps?.length ? 'llm_call' : activeSkill ? 'skill' : 'llm_call',
        total_duration: duration,
        pre_llm_duration: lastTPreFetch > 0 ? lastTPreFetch - t0 : 0,
        first_token_duration: lastTFirstToken > 0 ? lastTFirstToken - t0 : 0,
        generation_duration: genDuration,
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
          genDuration > 0 && genTokens > 0 ? Math.round((genTokens / genDuration) * 1000 * 10) / 10 : 0,
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
      shared.observabilityBuffer.push(trace)
      if (shared.observabilityBuffer.length > 50) shared.observabilityBuffer.splice(0, shared.observabilityBuffer.length - 50)
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
    if (bufferedStructuredResponses.length > 0) {
      {
        await writeSse(res, { structured_responses: bufferedStructuredResponses })
      }
    }
    {
      await writeSse(res, { done: true })
    }
    endSse(res)

    if (isUltra) {
      setTimeout(() => {
        try {
          const { syncSkillAndToolIndexes, syncNoteIndex } = require('./semantic-engine')
          syncSkillAndToolIndexes(false).catch(() => {})
          syncNoteIndex(false).catch(() => {})
        } catch {}
      }, 5000)
    }
  } catch (error) {
    const isAbortedByUser =
      stopGenerationRequested ||
      controller.signal?.aborted ||
      closed ||
      error?.name === 'AbortError' ||
      /aborted/i.test(error?.message || '')

    if (isAbortedByUser) {
      debug('[chat] Request interrupted by user')
      appendMessage(threadId, 'assistant', assembled.trim() || 'Interrupted.', {
        sources: memorySources.length ? memorySources : undefined,
        graph_data:
          activeSkill || toolSteps.length
            ? { active_skill: activeSkill, tool_steps: toolSteps }
            : null,
        is_interrupted: true
      })
      stopVoiceRequested = false
      flushTtsChunks(true)
      {
        await writeSse(res, { done: true, is_interrupted: true })
      }
      endSse(res)
      return
    }

    const userName = store.settings.user_name || 'Usuário'
    const fallbackMsg = generateFallbackReply(
      content,
      memoryContext,
      humanizeFallbackReason(error?.message || 'llama failure', fallbackLanguage),
      fallbackLanguage,
      userName
    )
    const tail = fallbackMsg.slice(assembled.length)
    if (tail) {
      for (const token of splitTokens(tail)) {
        assembled += token
        {
          if (!await writeSse(res, { token })) break
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
      await writeSse(res, { done: true })
    }
    endSse(res)
  } finally {
    activeChatControllers.delete(controller)
    activeGenerationThreads.delete(threadId)
  }
}

async function runVoiceCommand(payload = {}) {
  debug('[VOICE-CMD] runVoiceCommand called with content:', payload.content)
  let content = String(payload.content || '').trim()
  if (!content) return
  const originalContent = content
  const rawThreadId = String(payload.thread_id || '').trim()
  const { getActiveThreadId, setActiveThreadId } = require('./shared-state')
  let threadId = rawThreadId
  if (!threadId || threadId === 'default') {
    threadId = getActiveThreadId()
  } else {
    setActiveThreadId(threadId)
  }
  const speakResponse = payload.speak_response !== false
  debug(`[voice-cmd] runVoiceCommand called: content="${content.slice(0, 80)}", thread=${threadId}`)

  // Stop any ongoing generation and TTS before starting a new voice command.
  // This prevents the previous LLM from mixing with the new command.
  stopAllGenerationAndTts()
  stopGenerationRequested = false
  stopVoiceRequested = false

  broadcast({ type: 'user', content: originalContent })

  let keywordWebSources = null

  debug('[VOICE-CMD] Checking responda in:', originalContent)
  const contentLower = originalContent.toLowerCase().trim()
  if (contentLower.startsWith('responda') || contentLower.startsWith('responde')) {
    debug('[VOICE-CMD] responda detected, resolving via voice hook')
    try {
      const hostManager = require('./extension-host-manager')
      const { resolveVoiceReply } = require('./manifest-voice-hooks')
      const injected = await resolveVoiceReply(originalContent, getEnabledSkills(), hostManager)
      if (injected) content = injected
    } catch {}
    debug('[VOICE-CMD] responda handled, falling through to LLM')
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
    discovery_content: originalContent,
    thread_id: threadId,
    speak_response: speakResponse,
    is_voice_command: true,
    memory_sources: keywordWebSources?.length ? keywordWebSources : undefined
  })

  if (!closed && typeof reqMock._onClose === 'function') {
    reqMock._onClose()
  }
}

// Test exports (used by TST-03 tests)
const _testExports = {
  estimateTokenCount,
  tokenizePrompt,
  detectLanguageTag,
  normalizeLanguageTag,
  normalizeForMatch,
  resolveResponseLanguage,
  buildLocalizedFallbackReply,
  humanizeFallbackReason,
  generateFallbackReply,
  isLikelyIncompleteResponse,
  shouldExposeSkillTools,
  normalizeDiscoveryText,
  buildToolResultPreview,
  estimateToolTokens,
  pickToolSkillIds,
  shouldPreferSilentForCodeRequest,
  containsCodeLikeContent,
  buildCompactedMessages,
  buildHistoryWithinBudget,
  computeDynamicMaxTokens,
  trimMessageForContext,
  getThreadMessages,
  appendMessage,
  searchYouTube,
  searchWeb
}

module.exports = {
  streamLlamaChat,
  streamFallbackResponse,
  parseLlamaDataLine,
  runVoiceCommand,
  buildObservabilityTrace,
  stopAllGenerationAndTts,
  stopGenerationRequested,
  stopVoiceRequested,
  activeChatControllers,
  _testExports
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
