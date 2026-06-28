const SETTINGS_EDITABLE_KEYS = new Set([
  'user_name',
  'assistant_persona',
  'ai_provider',
  'ai_model',
  'ai_tier',
  'tts_enabled',
  'tts_engine',
  'tts_voice',
  'tts_speed',
  'wake_word_enabled',
  'wake_word_sensitivity',
  'local_backend',
  'local_model',
  'embedding_model',
  'context_window_mode',
  'context_window_tokens',
  'auto_start_llm',
  'theme',
  'language',
  'locale',
  'transcription_language',
  'min_interface_chars',
  'prebuffer_chars',
  'onboarding_completed',
  'tutorial_completed',
  'skip_intro',
  'daily_briefing_enabled',
  'greeting_auto_saudacao',
  'greeting_resumo',
  'greeting_acao',
  'greeting_fixa',
  'call_mode_voice_activity_threshold',
  'call_mode_silence_duration_ms',
  'gaming_mode_enabled',
  'idle_timeout_app_open',
  'idle_timeout_minimized',
  'auto_detect_known_games',
  'developer_mode',
  'keep_in_tray'
])

function filterToEditableSettings(payload) {
  const out = {}
  if (!payload || typeof payload !== 'object') return out
  for (const key of Object.keys(payload)) {
    if (SETTINGS_EDITABLE_KEYS.has(key)) {
      out[key] = payload[key]
    }
  }
  return out
}

module.exports = { SETTINGS_EDITABLE_KEYS, filterToEditableSettings }
