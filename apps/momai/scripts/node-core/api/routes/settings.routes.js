const path = require('node:path')
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
        const prevDevMode = store.settings.dev_mode || 'symlink'

        if (payload.ai_tier && !isValidTier(payload.ai_tier)) {
          sendJson(res, 400, {
            status: 'error',
            message: 'Invalid ai_tier. Use lite, pro or ultra.'
          })
          return true
        }

        const safePayload = filterToEditableSettings(payload)

        const isDevModeSwitch =
          safePayload.dev_mode && safePayload.dev_mode !== prevDevMode

        if (isDevModeSwitch) {
          console.log(`[settings] dev_mode changing from ${prevDevMode} to ${safePayload.dev_mode}. Stopping old extension workers...`)
          if (context.extensionHostManager && typeof context.extensionHostManager.stopAllPersistent === 'function') {
            await context.extensionHostManager.stopAllPersistent().catch(() => {})
          }
        }

        Object.assign(store.settings, safePayload)

        // SECURITY: when switching dev modes, deactivate every extension.
        // The two modes are completely separate environments — a symlink that
        // was active in Dev mode and a loja install that was active in
        // Testar Loja mode share the same id but are different artifacts on
        // disk. Carrying the `enabled` flag across a mode switch would let
        // the wrong artifact start running, which is a security issue.
        if (isDevModeSwitch && Array.isArray(store.extensions)) {
          for (const ext of store.extensions) {
            if (ext && ext.enabled) {
              ext.enabled = false
            }
          }
          console.log(
            `[settings] Deactivated all extensions for the dev_mode switch (${prevDevMode} → ${safePayload.dev_mode}). User must re-enable them in the new mode.`
          )
        }
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

        if (safePayload.dev_mode && safePayload.dev_mode !== prevDevMode) {
          // The two dev modes are completely separate environments. Switching
          // between them just refreshes the registry — no migration, no
          // symlink synthesis. Whatever lives under data/extensions/.dev/
          // is what's visible in symlink mode; whatever lives under
          // data/extensions/<id> is what's visible in store_test mode.
          console.log(`[settings] dev_mode changing from ${prevDevMode} to ${safePayload.dev_mode}. Refreshing skill registry...`)
          if (context.skillRegistry && typeof context.skillRegistry.refresh === 'function') {
            await context.skillRegistry.refresh().catch(() => {})
          }
          // Invalidate the cached /extensions payload so the next GET
          // re-scans the new dev_mode's filesystem root instead of
          // returning a stale payload from the previous mode.
          try {
            const { invalidateExtensionsPayloadCache } = require('./extensions.routes')
            invalidateExtensionsPayloadCache()
          } catch (err) {
            console.log(
              '[settings] Failed to invalidate extensions payload cache:',
              err.message
            )
          }
          const newSkills = context.skillRegistry ? context.skillRegistry.getAll() : []
          for (const skill of newSkills) {
            if (skill.manifest?.background) {
              // Single mode-stable key (with back-compat read of legacy `<id>_dev`).
              const entry =
                store.extensions.find((e) => e.id === skill.id) ||
                store.extensions.find((e) => e.id === `${skill.id}_dev`)
              const isEnabled = entry ? entry.enabled !== false : (skill.kind === 'builtin' || skill.kind === 'packaged')
              if (isEnabled && context.extensionHostManager) {
                console.log(`[settings] Spawning persistent worker for ${skill.id} in ${safePayload.dev_mode} mode...`)
                await context.extensionHostManager.startPersistent(skill.id, skill.dir, skill.manifest).catch(() => {})
              }
            }
          }
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
