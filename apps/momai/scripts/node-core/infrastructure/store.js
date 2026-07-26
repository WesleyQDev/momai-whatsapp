const fs = require('node:fs')
const path = require('node:path')
const { info, error, warn } = require('./logger')
const { THREAD_RETENTION_DAYS, REMINDER_RETENTION_DAYS } = require('../config/constants')
const { pruneStaleThreads } = require('./retention')
const { purgeExpiredReminders } = require('../services/reminder-service')

function getDataDir() {
  return process.env.MOMAI_NODE_CORE_DATA_DIR || path.join(process.cwd(), 'data')
}
function getStoreFile() {
  return path.join(getDataDir(), 'node-core-store.json')
}
const PROMPTS_DIR = path.resolve(__dirname, '..', '..', 'prompts')

let promptRegistry = null
try {
  const { createPromptRegistry } = require('../../prompt-registry')
  promptRegistry = createPromptRegistry({ promptsDir: PROMPTS_DIR })
} catch (e) {
  info('[Store] Prompt registry not available, using defaults')
}

function defaultStore() {
  const now = new Date().toISOString()
  const promptDefaults = promptRegistry ? promptRegistry.getDefaults() : {}
  return {
    settings: {
      user_name: '',
      assistant_persona: promptDefaults.assistant_persona || 'MomAI',
      ai_provider: 'local',
      ai_model: 'Qwen 3.5',
      local_backend: 'auto',
      auto_start_llm: true,
      tts_engine: 'edge-tts',
      tts_voice: 'pf_dora',
      tts_enabled: true,
      wake_word_enabled: false,
      wake_word_sensitivity: 5,
      locale: 'pt-BR',
      min_interface_chars: 240,
      prebuffer_chars: 0,
      onboarding_completed: false,
      tutorial_completed: false,
      ai_tier: null,
      skip_intro: false,
      keep_in_tray: true,
      context_window_mode: 'min',
      context_window_tokens: 2048,
      daily_briefing_enabled: false,
      greeting_auto_saudacao: true,
      greeting_resumo: true,
      greeting_acao: '',
      greeting_fixa: '',
      developer_mode: false,
      logs_enabled: false,
      observability_enabled: false,
      show_context_ring: false
    },
    mode: 'local',
    call_mode: false,
    reminders: [],
    next_reminder_id: 1,
    extensions: [],
    gaming_apps: [],
    next_gaming_app_id: 1,
    skillKeywords: {},
    thread_messages: {},
    session_titles: {},
    next_message_id: 1,
    init_status: {
      stage: 'ready',
      message: 'System ready.',
      progress: 100,
      error: null,
      updated_at: now
    },
    economy: {
      gaming_mode_enabled: true,
      idle_timeout_app_open: 5,
      idle_timeout_minimized: 1,
      auto_detect_known_games: true,
      gaming_apps: [],
      next_gaming_app_id: 1
    }
  }
}

function loadStore() {
  const storeFile = getStoreFile()
  if (!fs.existsSync(storeFile)) return defaultStore()
  const raw = fs.readFileSync(storeFile, 'utf8')
  if (!raw || !raw.trim()) return defaultStore()

  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    error('[Store] Failed to parse store JSON, attempting recovery:', err)
    try {
      const fixed = raw.replace(/[\u0000-\u001F]+/g, ' ').replace(/,(\s*[}\]])/g, '$1')
      parsed = JSON.parse(fixed)
      warn('[Store] Recovered store via JSON cleanup')
    } catch (err2) {
      error('[Store] Store recovery failed, using defaults:', err2)
      return defaultStore()
    }
  }

  const loaded = {
    ...defaultStore(),
    ...parsed,
    settings: { ...defaultStore().settings, ...(parsed.settings || {}) }
  }
  loaded.call_mode = false // Transient session state should not persist across restarts
  return loaded
}

let _saveTimer = null

function saveStore(store) {
  if (_saveTimer) clearTimeout(_saveTimer)
  _saveTimer = setTimeout(() => {
    _saveTimer = null
    try {
      const storeFile = getStoreFile()
      const start = Date.now()
      const tmp = storeFile + '.tmp.' + Date.now()
      const data = JSON.stringify(store)
      fs.writeFileSync(tmp, data, 'utf8')
      fs.renameSync(tmp, storeFile)
      // hot path: debounced save on every message append
      if (Date.now() - start > 100) {
        warn(`[Store] saveStore took ${Date.now() - start}ms (${data.length} bytes)`)
      }
    } catch (err) {
      error('[Store] Failed to save store:', err)
    }
  }, 2000)
}

function saveStoreNow(store) {
  if (_saveTimer) {
    clearTimeout(_saveTimer)
    _saveTimer = null
  }
  try {
    fs.mkdirSync(getDataDir(), { recursive: true })
    const storeFile = getStoreFile()
    const start = Date.now()
    const tmp = storeFile + '.tmp.' + Date.now()
    const data = JSON.stringify(store)
    fs.writeFileSync(tmp, data, 'utf8')
    fs.renameSync(tmp, storeFile)
    if (Date.now() - start > 100) {
      warn(`[Store] saveStoreNow took ${Date.now() - start}ms (${data.length} bytes)`)
    }
  } catch (err) {
    error('[Store] Failed to save store:', err)
  }
}

function appendMessage(
  storeOrThreadId,
  threadIdOrRole,
  roleOrContent,
  contentOrExtras = {},
  optionalExtras = {}
) {
  let targetStore = store
  let threadId
  let role
  let content
  let extras

  if (typeof storeOrThreadId === 'string') {
    threadId = storeOrThreadId
    role = threadIdOrRole
    content = roleOrContent
    extras = contentOrExtras || {}
  } else {
    targetStore = storeOrThreadId || store
    threadId = threadIdOrRole
    role = roleOrContent
    content = contentOrExtras
    extras = optionalExtras || {}
  }

  if (!targetStore.thread_messages[threadId]) {
    targetStore.thread_messages[threadId] = []
  }
  const messages = targetStore.thread_messages[threadId]
  const structuredResp = extras.structured_responses || extras.structured_response
  const item = {
    id: targetStore.next_message_id++,
    role,
    content,
    created_at: new Date().toISOString(),
    sources: extras.sources ? JSON.stringify(extras.sources) : null,
    snippets: extras.snippets ? JSON.stringify(extras.snippets) : null,
    cards: extras.cards ? JSON.stringify(extras.cards) : null,
    graph_data: extras.graph_data || null,
    structured_response: structuredResp ? JSON.stringify(structuredResp) : null,
    is_interrupted: extras.is_interrupted ? true : undefined
  }
  messages.push(item)
  targetStore.thread_messages[threadId] = messages
  saveStore(targetStore)
  return item
}

const MAX_MESSAGES_PER_THREAD = 500

function pruneThread(threadId) {
  const msgs = store.thread_messages[threadId]
  if (msgs && msgs.length > MAX_MESSAGES_PER_THREAD) {
    const excess = msgs.length - MAX_MESSAGES_PER_THREAD
    store.thread_messages[threadId] = msgs.slice(excess)
  }
}

function getThreadMessages(store, threadId) {
  if (!store.thread_messages[threadId]) {
    store.thread_messages[threadId] = []
  }
  return store.thread_messages[threadId]
}

function listSessions(store) {
  const out = []
  for (const [threadId, msgs] of Object.entries(store.thread_messages)) {
    if (msgs.length === 0) continue
    const last = msgs[msgs.length - 1]
    const firstUser = msgs.find((m) => m.role === 'user')
    out.push({
      id: threadId,
      lastActivity: last ? last.created_at : null,
      messageCount: msgs.length,
      firstMessage: firstUser ? firstUser.content : null,
      title: store.session_titles[threadId] || null
    })
  }
  out.sort((a, b) => {
    const at = a.lastActivity ? new Date(a.lastActivity).getTime() : 0
    const bt = b.lastActivity ? new Date(b.lastActivity).getTime() : 0
    return bt - at
  })
  return out
}

// Initialize store on module load
const store = loadStore()

// R002 (privacy plan): prune threads older than THREAD_RETENTION_DAYS
// on startup so chat history doesn't accumulate forever.
const _prunedThreadIds = pruneStaleThreads(store)
if (_prunedThreadIds.length > 0) {
  info(
    `[retention] Pruned ${_prunedThreadIds.length} stale threads (>${THREAD_RETENTION_DAYS} days)`
  )
  saveStoreNow(store)
}

// R003 (privacy plan): purge inactive reminders older than
// MOMAI_REMINDER_RETENTION_DAYS on startup. Reminders that have already
// fired accumulate as `is_active: false` entries; without TTL they
// grow unbounded.
const _beforeReminders = store.reminders.length
store.reminders = purgeExpiredReminders(store.reminders)
const _purgedReminders = _beforeReminders - store.reminders.length
if (_purgedReminders > 0) {
  info(
    `[retention] Pruned ${_purgedReminders} expired reminders (>${REMINDER_RETENTION_DAYS} days)`
  )
  saveStoreNow(store)
}

// Sync with shared-state so service modules see the loaded store
try {
  const shared = require('../services/shared-state')
  Object.assign(shared.store, store)
} catch {
  // shared-state may not be available during tests
}

module.exports = {
  store,
  defaultStore,
  loadStore,
  saveStore,
  saveStoreNow,
  appendMessage,
  getThreadMessages,
  listSessions,
  pruneThread
}
