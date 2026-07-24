const { corsHeaders, sidecarHeaders } = require('../../infrastructure/http-helpers')

function createChatRoutes(context) {
  const {
    ensurePython,
    store,
    sendVoiceSidecarFallback,
    sendJson,
    stopVoiceRequested,
    proxyToPython,
    streamLlamaChat,
    runVoiceCommand,
    stopGenerationRequested,
    activeChatControllers,
    llamaState,
    getThreadMessages,
    saveStore,
    listSessions,
    extensionHostManager,
    skillRegistry
  } = context

  return async function handleChatRoutes(req, res, pathname, parsedUrl) {
    const replyMatch = pathname.match(/^\/voice\/([^/]+)\/reply\/wait$/)
    if (replyMatch && req.method === 'POST') {
      const skillId = replyMatch[1]
      const skill =
        skillRegistry && typeof skillRegistry.getById === 'function'
          ? skillRegistry.getById(skillId)
          : null
      if (!skill) {
        sendJson(res, 404, { ok: false, error: 'skill_not_found' })
        return true
      }
      const replyHook = skill.manifest?.voiceHooks?.reply
      if (!replyHook || !replyHook.tool) {
        sendJson(res, 400, { ok: false, error: 'no_voice_reply_hook' })
        return true
      }
      const body = await context.readJsonBody(req).catch(() => ({}))
      try {
        const result = await extensionHostManager.sendToPersistent(skillId, {
          toolName: replyHook.tool,
          args: body || {}
        })
        sendJson(res, 200, result || { ok: true })
      } catch (err) {
        sendJson(res, 500, { ok: false, error: 'voice_reply_error' })
      }
      return true
    }

    if (pathname === '/chat/speak') {
      try {
        const payload = await context.readJsonBody(req).catch(() => ({}))
        const pythonBase = await ensurePython()
        const response = await fetch(`${pythonBase}/chat/speak`, {
          method: 'POST',
          headers: sidecarHeaders(),
          body: JSON.stringify({
            ...payload,
            voice: payload.voice || store.settings.tts_voice
          })
        })
        const text = await response.text()
        res.writeHead(response.status, {
          'Content-Type': response.headers.get('content-type') || 'application/json',
          ...corsHeaders(res.req)
        })
        res.end(text)
      } catch (error) {
        sendVoiceSidecarFallback(res, pathname, error)
      }
      return true
    }

    if (pathname === '/chat/stop-voice') {
      context.stopVoiceRequested = true
      try {
        await proxyToPython(req, res, pathname)
      } catch (error) {
        sendVoiceSidecarFallback(res, pathname, error)
      }
      return true
    }

    if (pathname === '/voice/tts-status' && req.method === 'POST') {
      try {
        await proxyToPython(req, res, pathname)
      } catch (error) {
        // TTS status is best-effort; don't fail loudly
        sendJson(res, 200, { success: true, degraded: true })
      }
      return true
    }

    if (pathname === '/chat/stream' && req.method === 'POST') {
      const payload = await context.readJsonBody(req).catch(() => ({}))
      try {
        await streamLlamaChat(req, res, payload)
      } catch (err) {
        context.error('[OBS] streamLlamaChat threw: ' + (err?.message || String(err)))
      }
      return true
    }

    if (pathname === '/chat/voice-command' && req.method === 'POST') {
      const payload = await context.readJsonBody(req).catch(() => ({}))
      await runVoiceCommand(payload)
      sendJson(res, 200, { status: 'ok' })
      return true
    }

    if (pathname === '/chat/stop' && req.method === 'POST') {
      try {
        const chatService = require('../../services/chat-service')
        if (typeof chatService.stopAllGenerationAndTts === 'function') {
          chatService.stopAllGenerationAndTts()
        }
      } catch (err) {}
      try {
        const pythonBase = await ensurePython()
        await fetch(`${pythonBase}/chat/stop-voice`, {
          method: 'POST',
          headers: sidecarHeaders()
        })
      } catch (error) {
        // TTS might not be available, ignore
      }
      sendJson(res, 200, { status: 'ok' })
      return true
    }

    if (pathname === '/chat/context/reset' && req.method === 'POST') {
      llamaState.contextUsedTokens = 0
      sendJson(res, 200, { status: 'ok', context_used_tokens: 0 })
      return true
    }

    if (pathname === '/chat/history' && req.method === 'GET') {
      const threadId = parsedUrl.searchParams.get('thread_id') || 'default'
      sendJson(res, 200, getThreadMessages(threadId))
      return true
    }

    if (pathname === '/chat/history' && req.method === 'DELETE') {
      const threadId = parsedUrl.searchParams.get('thread_id') || 'default'
      store.thread_messages[threadId] = []
      delete store.session_titles[threadId]
      saveStore()
      sendJson(res, 200, { status: 'ok' })
      return true
    }

    if (pathname.startsWith('/chat/message/') && req.method === 'DELETE') {
      const id = Number(pathname.split('/').pop())
      if (!Number.isFinite(id)) {
        sendJson(res, 400, { detail: 'Invalid message id' })
        return true
      }
      for (const threadId of Object.keys(store.thread_messages)) {
        const prevLength = store.thread_messages[threadId].length
        store.thread_messages[threadId] = store.thread_messages[threadId].filter((m) => m.id !== id)
        if (store.thread_messages[threadId].length !== prevLength) {
          saveStore()
          break
        }
      }
      sendJson(res, 200, { status: 'ok' })
      return true
    }

    if (pathname === '/chat/sessions' && req.method === 'GET') {
      sendJson(res, 200, { sessions: listSessions().slice(0, 5) })
      return true
    }

    if (pathname === '/chat/title' && req.method === 'POST') {
      const payload = await context.readJsonBody(req).catch(() => ({}))
      const threadId = String(payload.thread_id || 'default')
      const userMessage = String(payload.user_message || '')
      const title = (userMessage.trim().slice(0, 12) || 'Nova conversa').replace(/["'!?.,]/g, '')
      store.session_titles[threadId] = title
      saveStore()
      sendJson(res, 200, { status: 'ok', title })
      return true
    }

    return false
  }
}

module.exports = { createChatRoutes }
