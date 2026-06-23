const { filterToEditableSettings } = require('../../config/settings-allowlist.js')

function createSettingsRoutes(context) {
  const {
    store,
    sendJson,
    isValidTier,
    normalizeBackendMode,
    normalizeContextWindowMode,
    clampContextTokens,
    saveStore,
    saveStoreNow,
    maybeRestartLlamaOnTierChange,
    syncWakeWordState,
    ensurePython,
    syncPythonCallModeState
  } = context

  return async function handleSettingsRoutes(req, res, pathname, parsedUrl) {
    if (pathname === '/settings' && req.method === 'GET') {
      const tier = store.settings.ai_tier || 'pro'
      if (tier === 'lite') {
        store.settings.tts_enabled = true
        store.settings.wake_word_enabled = false
      } else if (tier === 'pro') {
        store.settings.wake_word_enabled = false
      }
      store.settings.context_window_mode = normalizeContextWindowMode(
        store.settings.context_window_mode || 'min'
      )
      store.settings.context_window_tokens = clampContextTokens(
        store.settings.context_window_tokens || 2048
      )
      const response = filterToEditableSettings(store.settings)
      sendJson(res, 200, response)
      return true
    }

    if (pathname === '/settings' && req.method === 'PATCH') {
      try {
        const payload = await context.readJsonBody(req).catch(() => ({}))
        const prevTier = store.settings.ai_tier || '__unset__'
        const prevBackend = store.settings.local_backend || 'auto'

        if (payload.ai_tier && !isValidTier(payload.ai_tier)) {
          sendJson(res, 400, {
            status: 'error',
            message: 'Invalid ai_tier. Use lite, pro or ultra.'
          })
          return true
        }

        const safePayload = filterToEditableSettings(payload)
        Object.assign(store.settings, safePayload)
        if (payload.tts_engine) {
          const tier = store.settings.ai_tier || 'pro'
          if (tier === 'lite') {
            store.settings.tts_engine = 'edge-tts'
          }
        }
        store.settings.local_backend = normalizeBackendMode(store.settings.local_backend || 'auto')
        store.settings.context_window_mode = normalizeContextWindowMode(
          store.settings.context_window_mode || 'min'
        )
        store.settings.context_window_tokens = clampContextTokens(
          store.settings.context_window_tokens || 2048
        )

        if (payload.ai_tier) {
          if (store.settings.ai_tier === 'lite') {
            store.settings.tts_enabled = true
            store.settings.wake_word_enabled = false
            store.settings.tts_engine = 'edge-tts'
          } else if (store.settings.ai_tier === 'pro') {
            store.settings.tts_enabled = true
            store.settings.wake_word_enabled = false
            if (!store.settings.tts_engine) store.settings.tts_engine = 'edge-tts'
          } else if (store.settings.ai_tier === 'ultra') {
            store.settings.tts_enabled = true
            store.settings.wake_word_enabled = true
            if (!store.settings.tts_engine) store.settings.tts_engine = 'edge-tts'
          }
        } else {
          const currentTier = store.settings.ai_tier || 'pro'
          if (currentTier === 'lite') {
            store.settings.tts_enabled = true
            store.settings.wake_word_enabled = false
            store.settings.tts_engine = 'edge-tts'
          } else if (currentTier === 'pro') {
            store.settings.wake_word_enabled = false
          }
        }

        if (payload.ai_tier) {
          store.mode = 'local'
          saveStoreNow()
        } else {
          saveStore()
        }

        const ready = await maybeRestartLlamaOnTierChange(
          prevTier,
          store.settings.ai_tier || 'pro',
          prevBackend,
          normalizeBackendMode(store.settings.local_backend || 'auto')
        )
        if (!ready) {
          sendJson(res, 503, {
            status: 'error',
            message: context.llamaState.lastError || 'Failed to initialize selected model'
          })
          return true
        }
        void syncWakeWordState('settings_patch')
        const response = { ...store.settings }
        sendJson(res, 200, response)
      } catch (error) {
        console.error('[NodeCore] Error in PATCH /settings:', error)
        sendJson(res, 500, { status: 'error', message: 'Internal server error' })
      }
      return true
    }

    if (pathname === '/mode' && req.method === 'POST') {
      const payload = await context.readJsonBody(req).catch(() => ({}))
      const prevTier = store.settings.ai_tier || '__unset__'
      const mode = payload.mode || prevTier

      if (!isValidTier(mode)) {
        sendJson(res, 400, { status: 'error', message: 'Invalid tier. Use lite, pro or ultra.' })
        return true
      }

      store.mode = 'local'
      store.settings.ai_tier = mode
      if (mode === 'lite') {
        store.settings.tts_enabled = true
        store.settings.wake_word_enabled = false
        store.settings.tts_engine = 'edge-tts'
      } else if (mode === 'pro') {
        store.settings.tts_enabled = true
        store.settings.wake_word_enabled = false
      } else if (mode === 'ultra') {
        store.settings.tts_enabled = true
        store.settings.wake_word_enabled = true
      }
      saveStoreNow()

      context.broadcast({ type: 'model_changed', data: { new_mode: 'local' } })

      const ready = await maybeRestartLlamaOnTierChange(
        prevTier,
        mode,
        normalizeBackendMode(store.settings.local_backend || 'auto'),
        normalizeBackendMode(store.settings.local_backend || 'auto')
      )
      if (!ready) {
        sendJson(res, 503, {
          status: 'error',
          message: context.llamaState.lastError || 'Failed to initialize selected model'
        })
        return true
      }
      void syncWakeWordState('mode_change')
      sendJson(res, 200, { status: 'ok', mode: 'local' })
      return true
    }

    if (pathname === '/mode/call-mode' && req.method === 'POST') {
      const payload = await context.readJsonBody(req).catch(() => ({}))
      const enabled = Boolean(payload.enabled)

      if (enabled && (store.settings.ai_tier || 'pro') !== 'ultra') {
        sendJson(res, 200, {
          status: 'error',
          message: 'Call mode only available in Ultra tier'
        })
        return true
      }

      if (enabled) {
        try {
          await ensurePython()
        } catch (error) {
          sendJson(res, 503, { detail: error?.message || 'Python sidecar unavailable' })
          return true
        }
      }

      store.call_mode = enabled
      saveStore()
      try {
        await syncPythonCallModeState('call_mode_change')
      } catch {
        sendJson(res, 503, { detail: 'Failed to sync call mode to Python sidecar' })
        return true
      }
      void syncWakeWordState('call_mode_change')
      sendJson(res, 200, { status: 'ok', call_mode: store.call_mode })
      return true
    }

    if (pathname === '/mode/call-mode/status' && req.method === 'GET') {
      sendJson(res, 200, { call_mode: Boolean(store.call_mode) })
      return true
    }

    return false
  }
}

module.exports = { createSettingsRoutes }
