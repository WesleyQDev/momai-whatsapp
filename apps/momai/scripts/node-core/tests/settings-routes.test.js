const { createSettingsRoutes } = require('../api/routes/settings.routes')

describe('settings routes', () => {
  function makeCtx(overrides = {}) {
    const store = {
      settings: {
        user_name: 'Original Name',
        assistant_persona: 'Original Persona',
        ai_provider: 'local',
        ai_model: 'Qwen 3.5',
        local_backend: 'auto',
        tts_engine: 'edge-tts',
        tts_voice: 'pf_dora',
        tts_enabled: true,
        wake_word_enabled: false,
        wake_word_sensitivity: 5,
        locale: 'pt-BR',
        onboarding_completed: true,
        daily_briefing_enabled: false,
        greeting_auto_saudacao: true,
        greeting_resumo: true,
        greeting_acao: '',
        greeting_fixa: '',
        ai_tier: 'pro'
      }
    }
    let lastStatus, lastData
    const ctx = {
      store,
      sendJson: (res, status, data) => {
        lastStatus = status
        lastData = data
      },
      isValidTier: (tier) => ['lite', 'pro', 'ultra'].includes(tier),
      normalizeBackendMode: (mode) => mode || 'auto',
      normalizeContextWindowMode: (mode) => mode || 'min',
      clampContextTokens: (tokens) => tokens || 2048,
      saveStore: vi.fn(),
      saveStoreNow: vi.fn(),
      maybeRestartLlamaOnTierChange: vi.fn().mockResolvedValue(true),
      syncWakeWordState: vi.fn().mockResolvedValue(undefined),
      readJsonBody: async () => ({}),
      ...overrides
    }
    return { ctx, getLast: () => ({ status: lastStatus, data: lastData }) }
  }

  test('GET /settings returns filtered editable settings containing user_name and assistant_persona', async () => {
    const { ctx, getLast } = makeCtx()
    const handler = createSettingsRoutes(ctx)

    const handled = await handler({ method: 'GET' }, {}, '/settings', {
      searchParams: new URLSearchParams()
    })

    expect(handled).toBe(true)
    expect(getLast().status).toBe(200)
    expect(getLast().data.user_name).toBe('Original Name')
    expect(getLast().data.assistant_persona).toBe('Original Persona')
    expect(getLast().data.locale).toBe('pt-BR')
    expect(getLast().data.daily_briefing_enabled).toBe(false)
  })

  test('PATCH /settings updates allowed settings including user_name and assistant_persona', async () => {
    const payload = {
      user_name: 'New Name',
      assistant_persona: 'New Persona',
      locale: 'en-US',
      daily_briefing_enabled: true,
      greeting_auto_saudacao: false,
      evil_key: 'malicious'
    }

    const { ctx, getLast } = makeCtx({
      readJsonBody: async () => payload
    })
    const handler = createSettingsRoutes(ctx)

    const handled = await handler({ method: 'PATCH' }, {}, '/settings', {
      searchParams: new URLSearchParams()
    })

    expect(handled).toBe(true)
    expect(getLast().status).toBe(200)

    // Verify store was updated
    expect(ctx.store.settings.user_name).toBe('New Name')
    expect(ctx.store.settings.assistant_persona).toBe('New Persona')
    expect(ctx.store.settings.locale).toBe('en-US')
    expect(ctx.store.settings.daily_briefing_enabled).toBe(true)
    expect(ctx.store.settings.greeting_auto_saudacao).toBe(false)
    expect(ctx.store.settings.evil_key).toBeUndefined() // filtered out

    // Verify saveStore was called
    expect(ctx.saveStore).toHaveBeenCalled()
  })
})
