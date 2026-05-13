const fs = require('node:fs')
const path = require('node:path')
const { info, error, warn } = require('./logger')

const DATA_DIR = process.env.MOMAI_NODE_CORE_DATA_DIR || path.join(process.cwd(), 'data')
const STORE_FILE = path.join(DATA_DIR, 'node-core-store.json')
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
      tts_engine: 'kokoro',
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
      context_window_mode: 'min',
      context_window_tokens: 2048
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
      gaming_mode_enabled: false,
      idle_timeout_app_open: 5,
      idle_timeout_minimized: 1,
      auto_detect_known_games: true,
      gaming_apps: [],
      next_gaming_app_id: 1,
    },
  }
}

function loadStore() {
  if (!fs.existsSync(STORE_FILE)) return defaultStore()
  const raw = fs.readFileSync(STORE_FILE, 'utf8')
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

  return {
    ...defaultStore(),
    ...parsed,
    settings: { ...defaultStore().settings, ...(parsed.settings || {}) }
  }
}

let _saveTimer = null

function saveStore(store) {
  if (_saveTimer) clearTimeout(_saveTimer)
  _saveTimer = setTimeout(() => {
    _saveTimer = null
    try {
      const start = Date.now()
      const tmp = STORE_FILE + '.tmp.' + Date.now()
      const data = JSON.stringify(store)
      fs.writeFileSync(tmp, data, 'utf8')
      fs.renameSync(tmp, STORE_FILE)
      // hot path: debounced save on every message append
      if (Date.now() - start > 100) {
        warn(`[Store] saveStore took ${Date.now() - start}ms (${data.length} bytes)`)
      }
      saveMessages()
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
    const start = Date.now()
    const tmp = STORE_FILE + '.tmp.' + Date.now()
    const data = JSON.stringify(store)
    fs.writeFileSync(tmp, data, 'utf8')
    fs.renameSync(tmp, STORE_FILE)
    if (Date.now() - start > 100) {
      warn(`[Store] saveStoreNow took ${Date.now() - start}ms (${data.length} bytes)`)
    }
    saveMessages()
  } catch (err) {
    error('[Store] Failed to save store:', err)
  }
}

function appendMessage(store, threadId, role, content, extras = {}) {
  const messages = store.thread_messages[threadId] || []
  const item = {
    id: store.next_message_id++,
    role,
    content,
    created_at: new Date().toISOString(),
    sources: extras.sources ? JSON.stringify(extras.sources) : null,
    snippets: extras.snippets ? JSON.stringify(extras.snippets) : null,
    cards: extras.cards ? JSON.stringify(extras.cards) : null,
    graph_data: extras.graph_data || null,
    structured_response: extras.structured_response
      ? JSON.stringify(extras.structured_response)
      : null
  }
  messages.push(item)
  store.thread_messages[threadId] = messages
  saveStore(store)
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

function saveMessages() {
  const msgData = {}
  for (const threadId of Object.keys(store.thread_messages || {})) {
    msgData[threadId] = store.thread_messages[threadId]
  }
  fs.writeFileSync(path.join(DATA_DIR, 'messages.json'), JSON.stringify(msgData))
}

function loadMessages() {
  const msgPath = path.join(DATA_DIR, 'messages.json')
  if (fs.existsSync(msgPath)) {
    try {
      store.thread_messages = JSON.parse(fs.readFileSync(msgPath, 'utf8'))
    } catch {
      /* ignore */
    }
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
loadMessages()

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
  pruneThread,
  saveMessages,
  loadMessages
}
