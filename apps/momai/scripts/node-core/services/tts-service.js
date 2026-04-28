const shared = require('./shared-state')
const store = shared.store
const { debug, info, warn } = require('../infrastructure/logger')
const { PYTHON_BASE_URL } = require('../config/constants')

// Broadcast uses dynamically injected function from websocket module
function broadcast(payload) {
  if (shared.broadcast && typeof shared.broadcast === 'function') {
    shared.broadcast(payload)
  }
}

// Stop flags are read from chat-service at runtime to avoid circular deps

// ensurePython (exact code from node-core.js lines ~2618-2650)
const ensurePythonPending = new Map()
let ensurePythonMsgId = 0

// ttsSpeak pending (for non-kokoro engines via main process)
const ttsSpeakPending = new Map()
let ttsSpeakMsgId = 0

if (typeof process.send === 'function') {
  process.on('message', (msg) => {
    if (!msg || typeof msg !== 'object') return

    if (msg.type === 'ensure-python-result') {
      const pending = ensurePythonPending.get(msg.requestId)
      if (!pending) return

      ensurePythonPending.delete(msg.requestId)
      if (msg.ok) pending.resolve(msg.baseUrl || PYTHON_BASE_URL)
      else pending.reject(new Error(msg.error || 'Python sidecar unavailable'))
      return
    }

    if (msg.type === 'tts-speak-result') {
      const pending = ttsSpeakPending.get(msg.requestId)
      if (!pending) return

      ttsSpeakPending.delete(msg.requestId)
      if (msg.ok) pending.resolve()
      else pending.reject(new Error(msg.error || 'TTS speak failed'))
    }
  })
}

async function ensurePython() {
  if (typeof process.send !== 'function') return PYTHON_BASE_URL

  const tier = store.settings.ai_tier || 'pro'
  if (tier === 'lite') {
    throw new Error('Python sidecar is disabled in Lite mode.')
  }

  ensurePythonMsgId += 1
  const requestId = `ensure-python-${ensurePythonMsgId}-${Date.now()}`
  const promise = new Promise((resolve, reject) => {
    ensurePythonPending.set(requestId, { resolve, reject })
  })
  process.send({ type: 'ensure-python', requestId })
  return promise
}

async function triggerAutoTts(text) {
  const { stopGenerationRequested, stopVoiceRequested } = require('./chat-service')
  if (stopGenerationRequested || stopVoiceRequested) {
    debug('[NodeCore][Voice] Auto TTS cancelled: stop flag is true')
    return
  }

  const aiTier = store.settings.ai_tier || 'pro'
  const ttsEnabled = Boolean(store.settings.tts_enabled)
  const cleaned = String(text || '').trim().replace(/\p{Extended_Pictographic}/gu, '')

  if (aiTier === 'lite') {
    debug('[NodeCore][Voice] Auto TTS skipped: ai_tier=lite')
    return
  }
  if (!ttsEnabled) {
    debug('[NodeCore][Voice] Auto TTS skipped: settings.tts_enabled=false')
    return
  }
  if (cleaned.length < 2) {
    debug('[NodeCore][Voice] Auto TTS skipped: empty/short text')
    return
  }

  // Use main process TTSService for non-kokoro engines (edge-tts, say)
  const ttsEngine = store.settings.tts_engine || 'kokoro'
  console.log(`[NodeCore][Voice] triggerAutoTts engine=${ttsEngine} text="${cleaned.slice(0,40)}"`)
  if (ttsEngine !== 'kokoro') {
    if (typeof process.send !== 'function') {
      warn('[NodeCore][Voice] Auto TTS skipped: no IPC available for engine', ttsEngine)
      return
    }
    ttsSpeakMsgId += 1
    const requestId = `tts-speak-${ttsSpeakMsgId}-${Date.now()}`
    const promise = new Promise((resolve, reject) => {
      ttsSpeakPending.set(requestId, { resolve, reject })
    })
    console.log(`[NodeCore][Voice] Sending IPC tts-speak engine=${ttsEngine}`)
    process.send({
      type: 'tts-speak',
      requestId,
      text: cleaned,
      voice: store.settings.tts_voice,
      engine: ttsEngine
    })
    const timeout = setTimeout(() => {
      const p = ttsSpeakPending.get(requestId)
      if (p) {
        ttsSpeakPending.delete(requestId)
        p.reject(new Error('TTS speak timeout'))
      }
    }, 30000)
    try {
      await promise
      console.log(`[NodeCore][Voice] Auto TTS via ${ttsEngine} completed`)
    } catch (err) {
      warn(`[NodeCore][Voice] Auto TTS via ${ttsEngine} failed:`, err?.message || err)
    } finally {
      clearTimeout(timeout)
    }
    return
  }

  const maxAttempts = 10
  let lastError = null
  let announcedLoading = false

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const pythonBase = await ensurePython()
      const response = await fetch(`${pythonBase}/chat/speak`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: cleaned,
          voice: store.settings.tts_voice
        })
      })

      if (response.ok) {
        if (announcedLoading) {
          broadcast({
            type: 'voice_engine_loading',
            data: {
              loading: false,
              pending_auto_tts: false,
              message: 'Motor de voz pronto. Reproduzindo resposta.'
            }
          })
        }
        if (attempt > 1) {
          debug(`[NodeCore][Voice] Auto TTS requested (retry ${attempt}/${maxAttempts})`)
        } else {
          debug('[NodeCore][Voice] Auto TTS requested')
        }
        return
      }

      const detail = await response.text().catch(() => '')
      lastError = `HTTP ${response.status} ${detail.slice(0, 200)}`
    } catch (error) {
      lastError = error?.message || String(error)
    }

    if (!announcedLoading) {
      announcedLoading = true
      broadcast({
        type: 'voice_engine_loading',
        data: {
          loading: true,
          pending_auto_tts: true,
          message:
            'Motor de voz (Python/TTS) carregando. Vou reproduzir automaticamente quando estiver pronto.'
        }
      })
    }

    if (attempt < maxAttempts) {
      const waitMs = 300 * attempt
      await new Promise((resolve) => setTimeout(resolve, waitMs))
    }
  }

  if (announcedLoading) {
    broadcast({
      type: 'voice_engine_loading',
      data: {
        loading: false,
        pending_auto_tts: false,
        message: 'Não foi possível iniciar a voz automática agora.'
      }
    })
  }
  warn(`[NodeCore][Voice] Auto TTS failed after retries: ${lastError || 'unknown error'}`)
}

async function syncWakeWordState(reason = 'unknown') {
  const tier = store.settings.ai_tier || 'pro'
  const shouldEnable =
    tier === 'ultra' && (Boolean(store.settings.wake_word_enabled) || Boolean(store.call_mode))

  if (tier === 'lite') {
    try {
      const pythonBase = await ensurePython()
      await fetch(`${pythonBase}/voice/wake-word`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: false })
      })
      info(`[NodeCore][Voice] Wake-word force-disabled for lite tier (${reason})`)
    } catch {
      // Python sidecar may not be available in lite — that's fine
    }
    return
  }

  const maxAttempts = 8
  let lastError = null

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const pythonBase = await ensurePython()
      const response = await fetch(`${pythonBase}/voice/wake-word`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: shouldEnable })
      })

      if (response.ok) {
        info(
          `[NodeCore][Voice] Wake-word synced (${reason}): ${shouldEnable ? 'enabled' : 'disabled'}${attempt > 1 ? ` (retry ${attempt}/${maxAttempts})` : ''}`
        )
        return
      }

      const detail = await response.text().catch(() => '')
      lastError = `HTTP ${response.status} ${detail.slice(0, 200)}`
    } catch (error) {
      lastError = error?.message || String(error)
    }

    if (attempt < maxAttempts) {
      const waitMs = 250 * attempt
      await new Promise((resolve) => setTimeout(resolve, waitMs))
    }
  }

  warn(
    `[NodeCore][Voice] Wake-word sync failed (${reason}) after retries: ${lastError || 'unknown error'}`
  )
}

async function syncPythonCallModeState(reason = 'unknown') {
  const tier = store.settings.ai_tier || 'pro'
  const enabled = tier === 'ultra' && Boolean(store.call_mode)

  if (tier === 'lite') {
    return
  }

  const maxAttempts = 8
  let lastError = null

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const pythonBase = await ensurePython()
      const response = await fetch(`${pythonBase}/voice/call-mode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled })
      })

      if (response.ok) {
        info(
          `[NodeCore][Voice] Call-mode synced (${reason}): ${enabled ? 'enabled' : 'disabled'}${attempt > 1 ? ` (retry ${attempt}/${maxAttempts})` : ''}`
        )
        return
      }

      const detail = await response.text().catch(() => '')
      lastError = `HTTP ${response.status} ${detail.slice(0, 200)}`
    } catch (error) {
      lastError = error?.message || String(error)
    }

    if (attempt < maxAttempts) {
      const waitMs = 250 * attempt
      await new Promise((resolve) => setTimeout(resolve, waitMs))
    }
  }

  warn(
    `[NodeCore][Voice] Call-mode sync failed (${reason}) after retries: ${lastError || 'unknown error'}`
  )
}

module.exports = {
  triggerAutoTts,
  syncWakeWordState,
  syncPythonCallModeState,
  ensurePython,
  broadcast
}
