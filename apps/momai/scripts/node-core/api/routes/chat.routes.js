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
    listSessions
  } = context

  return async function handleChatRoutes(req, res, pathname, parsedUrl) {
    if (pathname === '/voice/whatsapp-reply/wait' && req.method === 'POST') {
      try {
        await proxyToPython(req, res, pathname)
      } catch (error) {
        sendVoiceSidecarFallback(res, pathname, error)
      }
      return true
    }

    if (pathname === '/chat/speak') {
      try {
        const payload = await context.readJsonBody(req).catch(() => ({}))
        const pythonBase = await ensurePython()
        const response = await fetch(`${pythonBase}/chat/speak`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...payload,
            voice: payload.voice || store.settings.tts_voice
          })
        })
        const text = await response.text()
        res.writeHead(response.status, {
          'Content-Type': response.headers.get('content-type') || 'application/json',
          'Access-Control-Allow-Origin': '*'
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
      context.stopGenerationRequested = true
      for (const controller of activeChatControllers) {
        controller.abort()
      }
      try {
        const pythonBase = await ensurePython()
        await fetch(`${pythonBase}/chat/stop-voice`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
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
