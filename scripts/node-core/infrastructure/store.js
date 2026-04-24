const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { log, error } = require('./logger')
const { PROMPTS_DIR } = require('../config/constants')

// These will be set by the main index.js
let store
let skillRegistry
let promptRegistry

function setStore(s) {
  store = s
}

function setSkillRegistry(sr) {
  skillRegistry = sr
}

function setPromptRegistry(pr) {
  promptRegistry = pr
}

function defaultStore() {
  const now = new Date().toISOString()
  const promptDefaults = promptRegistry ? promptRegistry.getDefaults() : {}
  return {
    settings: {
      user_name: 'Senhor',
      assistant_persona: promptDefaults.assistant_persona || '',
      ai_provider: 'local',
      ai_model: 'Qwen 3.5',
      local_backend: 'auto',
      auto_start_llm: true,
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
      skip_intro: false
    },
    mode: 'local',
    call_mode: false,
    reminders: [],
    next_reminder_id: 1,
    extensions: [],
    gaming_apps: [],
    next_gaming_app_id: 1,
    thread_messages: {},
    session_titles: {},
    next_message_id: 1,
    init_status: {
      stage: 'ready',
      message: 'System ready.',
      progress: 100,
      error: null,
      updated_at: now
    }
  }
}

function loadStore() {
  const STORE_FILE = path.join(__dirname, '..', '..', 'data', 'node-core-store.json')
  if (!fs.existsSync(STORE_FILE)) return defaultStore()
  try {
    const raw = fs.readFileSync(STORE_FILE, 'utf8')
    const parsed = JSON.parse(raw)
    return {
      ...defaultStore(),
      ...parsed,
      settings: { ...defaultStore().settings, ...(parsed.settings || {}) }
    }
  } catch (err) {
    error('[NodeCore] Failed to load store:', err)
    return defaultStore()
  }
}

function saveStore() {
  const STORE_FILE = path.join(__dirname, '..', '..', 'data', 'node-core-store.json')
  try {
    fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2), 'utf8')
  } catch (err) {
    error('[NodeCore] Failed to save store:', err)
  }
}

function getThreadMessages(threadId) {
  if (!store.thread_messages[threadId]) {
    store.thread_messages[threadId] = []
  }
  return store.thread_messages[threadId]
}

function isoNow() {
  return new Date().toISOString()
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
    structured_response: extras.structured_response ? JSON.stringify(extras.structured_response) : null
  }
  messages.push(item)
  saveStore()
  return item
}

function listSessions() {
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

module.exports = {
  store,
  setStore,
  setSkillRegistry,
  setPromptRegistry,
  defaultStore,
  loadStore,
  saveStore,
  getThreadMessages,
  isoNow,
  appendMessage,
  listSessions
}
