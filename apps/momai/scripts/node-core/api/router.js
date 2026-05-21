const http = require('node:http')

function createRouter(context, routeHandlers) {
  const {
    sendJson,
    sendNoContent,
    readJsonBody,
    HOST,
    PORT,
    store,
    llamaState,
    semanticState,
    cleanupEmbeddingCache,
    syncSkillAndToolIndexes,
    syncNoteIndex,
    parseTime,
    advanceReminder,
    saveStore,
    broadcast,
    runVoiceCommand,
    triggerAutoTts,
    stopVoiceRequested,
    stopGenerationRequested,
    setInitStatus,
    ensureLlamaReady,
    syncWakeWordState,
    ensureEmbeddingReady,
    connectPythonSidecar,
    info,
    log,
    error
  } = context

  async function handleRequest(req, res) {
    if (!req.url) {
      sendJson(res, 400, { detail: 'Missing URL' })
      return
    }

    if (req.method === 'OPTIONS') {
      sendNoContent(res)
      return
    }

    const qIdx = req.url.indexOf('?')
    const pathname = qIdx === -1 ? req.url : req.url.slice(0, qIdx)
    const qs = qIdx === -1 ? '' : req.url.slice(qIdx + 1)
    const searchParams = new URLSearchParams(qs)
    const parsedUrl = { searchParams }

    for (let i = 0; i < routeHandlers.length; i++) {
      const handler = routeHandlers[i]
      try {
        const handled = await handler(req, res, pathname, parsedUrl)
        if (handled) return
      } catch (err) {
        error(`[NodeCore] Route error for ${pathname} in handler ${i}:`, err)
        sendJson(res, 500, { detail: 'Internal server error' })
        return
      }
    }

    sendJson(res, 404, { detail: 'Not found' })
  }

  const server = http.createServer((req, res) => {
    handleRequest(req, res).catch((err) => {
      error('[NodeCore] Unexpected request error:', err)
      sendJson(res, 500, { detail: 'Internal server error' })
    })
  })

  setInterval(() => {
    if (typeof context.sendResourceUsage === 'function') {
      context.sendResourceUsage()
    }
  }, 2500)

  setInterval(() => {
    cleanupEmbeddingCache()
    const tier = store.settings.ai_tier || 'pro'
    if (tier !== 'ultra') return
    syncSkillAndToolIndexes(false).catch(() => {})
    syncNoteIndex(false).catch(() => {})
  }, 30000)

  setInterval(() => {
    const now = Date.now()
    let touched = false

    for (const reminder of store.reminders) {
      if (!reminder.is_active) continue
      if (parseTime(reminder.scheduled_time) > now) continue

      try {
        const triggerData = {
          id: reminder.id,
          title: reminder.title,
          content: reminder.content,
          action_type: reminder.action_type || 'reminder',
          voice_response: reminder.voice_response ?? true
        }

        if (typeof context.broadcast === 'function') {
          context.broadcast({
            type: 'reminder_trigger',
            data: triggerData
          })
        }

        if (reminder.action_type === 'cron') {
          log(`[NodeCore][Reminders] Triggering cron action: ${reminder.title}`)
          context.stopVoiceRequested = false
          context.stopGenerationRequested = false
          void runVoiceCommand({
            content: reminder.content || reminder.title,
            speak_response: reminder.voice_response !== false
          })
        } else if (reminder.voice_response !== false) {
          log(`[NodeCore][Reminders] Triggering voice response: ${reminder.title}`)
          context.stopVoiceRequested = false
          context.stopGenerationRequested = false
          void triggerAutoTts(`${reminder.title}. ${reminder.content || ''}`)
        }

        advanceReminder(reminder)
        touched = true

        if (reminder.is_active && parseTime(reminder.scheduled_time) <= now) {
          reminder.is_active = false
          error(
            `[NodeCore][Reminders] Safety: deactivated reminder that failed to advance: ${reminder.title}`
          )
        }
      } catch (err) {
        error(
          `[NodeCore][Reminders] Error processing reminder #${reminder.id} "${reminder.title}": ${err?.message || err}`
        )
        reminder.is_active = false
        touched = true
      }
    }

    if (touched) {
      saveStore()
      if (typeof context.broadcast === 'function') {
        context.broadcast({ type: 'reminders_updated' })
      }
    }
  }, 1000)

  server.on('error', (err) => {
    const message =
      err && err.code === 'EADDRINUSE'
        ? `Port ${PORT} is already in use (${HOST}:${PORT})`
        : err?.message || 'Unexpected node-core server error'

    error(`[NodeCore] ${message}`)
    if (typeof process.send === 'function') {
      process.send({ type: 'node-core-error', error: message })
    }
    process.exit(1)
  })

  async function shutdownAll() {
    try {
      for (const controller of context.activeChatControllers) {
        controller.abort()
      }
      await context.stopEmbeddingServer()
      await context.stopLlamaServer()
    } finally {
      server.close(() => process.exit(0))
    }
  }

  process.on('SIGTERM', () => {
    shutdownAll().catch(() => process.exit(0))
  })

  process.on('SIGINT', () => {
    shutdownAll().catch(() => process.exit(0))
  })

  return { handleRequest, server, shutdownAll }
}

module.exports = { createRouter }
