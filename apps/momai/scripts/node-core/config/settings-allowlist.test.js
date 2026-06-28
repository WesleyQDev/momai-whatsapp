const { SETTINGS_EDITABLE_KEYS, filterToEditableSettings } = require('./settings-allowlist.js')

describe('SETTINGS_EDITABLE_KEYS', () => {
  it('contains the expected user-tunable keys', () => {
    expect(SETTINGS_EDITABLE_KEYS.has('ai_tier')).toBe(true)
    expect(SETTINGS_EDITABLE_KEYS.has('tts_enabled')).toBe(true)
    expect(SETTINGS_EDITABLE_KEYS.has('wake_word_enabled')).toBe(true)
    expect(SETTINGS_EDITABLE_KEYS.has('local_backend')).toBe(true)
    expect(SETTINGS_EDITABLE_KEYS.has('theme')).toBe(true)
    expect(SETTINGS_EDITABLE_KEYS.has('language')).toBe(true)
    expect(SETTINGS_EDITABLE_KEYS.has('keep_in_tray')).toBe(true)
    expect(SETTINGS_EDITABLE_KEYS.has('user_name')).toBe(true)
    expect(SETTINGS_EDITABLE_KEYS.has('assistant_persona')).toBe(true)
    expect(SETTINGS_EDITABLE_KEYS.has('locale')).toBe(true)
    expect(SETTINGS_EDITABLE_KEYS.has('onboarding_completed')).toBe(true)
    expect(SETTINGS_EDITABLE_KEYS.has('daily_briefing_enabled')).toBe(true)
    expect(SETTINGS_EDITABLE_KEYS.has('greeting_auto_saudacao')).toBe(true)
  })

  it('does NOT contain sensitive keys', () => {
    expect(SETTINGS_EDITABLE_KEYS.has('modes')).toBe(false)
    expect(SETTINGS_EDITABLE_KEYS.has('internal_token')).toBe(false)
    expect(SETTINGS_EDITABLE_KEYS.has('debug')).toBe(false)
  })
})

describe('filterToEditableSettings', () => {
  it('keeps only allowed keys', () => {
    const input = { ai_tier: 'ultra', theme: 'dark', evil_key: 'rm -rf /' }
    const out = filterToEditableSettings(input)
    expect(out).toEqual({ ai_tier: 'ultra', theme: 'dark' })
  })

  it('returns empty object when input is empty', () => {
    expect(filterToEditableSettings({})).toEqual({})
  })

  it('returns empty object when no keys are allowed', () => {
    expect(filterToEditableSettings({ x: 1, y: 2 })).toEqual({})
  })

  it('does not mutate the input', () => {
    const input = { ai_tier: 'ultra', evil: 'x' }
    const snapshot = { ...input }
    filterToEditableSettings(input)
    expect(input).toEqual(snapshot)
  })
})
