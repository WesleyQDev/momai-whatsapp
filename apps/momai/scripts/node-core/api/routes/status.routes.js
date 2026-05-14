function createStatusRoutes(context) {
  const {
    store,
    llamaState,
    modelDownloadState,
    getSetupInfo,
    buildSemanticRuntimeStatus,
    promptRegistry,
    tiersConfig,
    sendJson,
    ensureLlamaReady,
    isValidTier,
    normalizeBackendMode,
    saveStore,
    saveStoreNow,
    maybeRestartLlamaOnTierChange,
    syncWakeWordState,
    syncSkillAndToolIndexes,
    syncNoteIndex,
    semanticState
  } = context

  return async function handleStatusRoutes(req, res, pathname, parsedUrl) {
    if (pathname === '/status' && req.method === 'GET') {
      const autoStart = store.settings.auto_start_llm !== false
      sendJson(res, 200, {
        status: 'ok',
        mode: store.mode,
        brain_ready: autoStart ? llamaState.ready : true,
        is_loading: llamaState.starting || modelDownloadState.in_progress,
        setup: getSetupInfo(),
        ai_tier: store.settings.ai_tier || 'pro',
        auto_start_llm: autoStart,
        llama_runtime: {
          current_tier: llamaState.currentTier,
          backend_active: llamaState.backend,
          backend_reason: llamaState.backendReason,
          backend_mode:
            llamaState.backendMode || normalizeBackendMode(store.settings.local_backend || 'auto'),
          configured_model_file: llamaState.configuredModelFile,
          loaded_model_path: llamaState.modelPath,
          loaded_model_file: llamaState.modelPath
            ? require('node:path').basename(llamaState.modelPath)
            : null,
          loaded_model_name: llamaState.currentModelName,
          using_fallback_model: llamaState.usingFallbackModel,
          parallel_slots: llamaState.parallelSlots || 2
        },
        model_download: modelDownloadState,
        semantic_runtime: buildSemanticRuntimeStatus(),
        prompt_runtime: promptRegistry.getRuntimeStatus(),
        tiers_config: tiersConfig
      })
      return true
    }

    if (pathname === '/init-status' && req.method === 'GET') {
      sendJson(res, 200, store.init_status)
      return true
    }

    if (pathname === '/internal/shutdown' && req.method === 'POST') {
      sendJson(res, 200, { status: 'ok', message: 'Shutting down node core.' })
      setTimeout(() => {
        context.shutdownAll().catch(() => process.exit(0))
      }, 20)
      return true
    }

    if (pathname === '/llama/ensure' && req.method === 'POST') {
      const autoStart = store.settings.auto_start_llm !== false
      if (!autoStart) {
        sendJson(res, 200, {
          status: 'ok',
          ready: true,
          skipped: true,
          reason: 'auto_start_llm_disabled',
          is_loading: false,
          error: null
        })
        return true
      }
      const ready = await ensureLlamaReady(false, false)
      sendJson(res, 200, {
        status: ready ? 'ok' : 'pending',
        ready,
        skipped: false,
        is_loading: llamaState.starting || modelDownloadState.in_progress,
        error: ready ? null : llamaState.lastError || null
      })
      return true
    }

    if (pathname === '/setup/status' && req.method === 'GET') {
      const setup = getSetupInfo()
      sendJson(res, 200, {
        status: 'ok',
        engine_installed: setup.local_installed,
        installed_version: setup.installed_version,
        latest_version: setup.latest_version,
        cpu_name: setup.cpu_name,
        detected_hardware: setup.detected_hardware,
        recommended_build: setup.recommended_build,
        installed_backends: setup.installed_backends,
        current_local_backend: setup.current_local_backend,
        total_ram_gb: setup.total_ram_gb,
        total_vram_gb: setup.total_vram_gb,
        os_name: setup.os_name,
        ai_tier: store.settings.ai_tier || 'pro',
        llama_runtime: {
          backend_active: llamaState.backend,
          backend_reason: llamaState.backendReason,
          backend_mode:
            llamaState.backendMode || normalizeBackendMode(store.settings.local_backend || 'auto'),
          parallel_slots: llamaState.parallelSlots || 2,
          vram_used_mb: llamaState.vramUsedMb || 0,
          vram_total_mb: llamaState.vramTotalMb || 0
        },
        model_download: modelDownloadState,
        semantic_runtime: buildSemanticRuntimeStatus(),
        prompt_runtime: promptRegistry.getRuntimeStatus(),
        tiers_config: tiersConfig
      })
      return true
    }

    if (pathname === '/setup/apply-tier' && req.method === 'POST') {
      const requestedTier = String(parsedUrl.searchParams.get('tier') || '').toLowerCase()
      if (!isValidTier(requestedTier)) {
        sendJson(res, 400, { status: 'error', message: 'Invalid tier. Use lite, pro or ultra.' })
        return true
      }
      const prevTier = store.settings.ai_tier || '__unset__'
      const prevBackend = normalizeBackendMode(store.settings.local_backend || 'auto')
      store.mode = 'local'
      store.settings.ai_tier = requestedTier
      if (requestedTier === 'lite') {
        store.settings.tts_enabled = true
        store.settings.wake_word_enabled = false
        store.settings.tts_engine = 'edge-tts'
      } else if (requestedTier === 'pro') {
        store.settings.tts_enabled = true
        store.settings.wake_word_enabled = false
        if (!store.settings.tts_engine) store.settings.tts_engine = 'kokoro'
      } else if (requestedTier === 'ultra') {
        store.settings.tts_enabled = true
        store.settings.wake_word_enabled = true
        if (!store.settings.tts_engine) store.settings.tts_engine = 'kokoro'
      }
      saveStoreNow()
      const ready = await maybeRestartLlamaOnTierChange(
        prevTier,
        requestedTier,
        prevBackend,
        normalizeBackendMode(store.settings.local_backend || 'auto')
      )
      if (!ready) {
        sendJson(res, 503, {
          status: 'error',
          message: llamaState.lastError || 'Failed to initialize selected model'
        })
        return true
      }
      void syncWakeWordState('setup_apply_tier')
      sendJson(res, 200, { status: 'ok', ai_tier: store.settings.ai_tier })
      return true
    }

    if (pathname === '/semantic/reindex' && req.method === 'POST') {
      const payload = await context.readJsonBody(req).catch(() => ({}))
      const force = payload?.force !== false
      if ((store.settings.ai_tier || 'pro') !== 'ultra') {
        sendJson(res, 200, {
          status: 'ok',
          skipped: true,
          reason: 'semantic indexing available only in ultra tier',
          semantic_runtime: buildSemanticRuntimeStatus()
        })
        return true
      }
      await syncSkillAndToolIndexes(force)
      await syncNoteIndex(force)
      sendJson(res, 200, {
        status: 'ok',
        semantic_runtime: buildSemanticRuntimeStatus(),
        notes_indexed_at: semanticState.lastNotesSyncAt || null,
        skills_indexed_at: semanticState.lastSkillSyncAt || null
      })
      return true
    }

    if (pathname === '/llama/stop' && req.method === 'POST') {
      await context.stopLlamaServer()
      sendJson(res, 200, { stopped: true })
      return true
    }

    if (pathname === '/llama/start' && req.method === 'POST') {
      const result = await context.ensureLlamaReady(false)
      sendJson(res, 200, { ready: result.ready, is_loading: !!result.is_loading })
      return true
    }

    return false
  }
}

module.exports = { createStatusRoutes }
