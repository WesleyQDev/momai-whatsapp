import { useEffect, useRef, useState, useCallback } from 'react'
import {
  StatusData,
  fetchSettings,
  updateSettingsPartial,
  quickTranscribe
} from '../../services/api'
import { useI18n } from '../../i18n'
import {
  PaperAirplaneIcon,
  StopIcon,
  MicrophoneIcon,
  SpeakerWaveIcon
} from '@heroicons/react/24/solid'
import { useAutocomplete } from '../../hooks/useAutocomplete'

interface ChatInputProps {
  text: string
  onSend: (text?: string) => void
  isLoading: boolean
  isModeChanging?: boolean
  statusInfo: StatusData | null
  onStopGeneration?: () => void
  onStopVoice?: () => void
  isCallMode?: boolean
  onToggleCallMode?: () => void
  speakingMessageId?: string | null
  voiceStatus?: 'idle' | 'listening' | 'processing'
}

const WaveIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <rect x="3" y="10" width="3" height="4" rx="1.5" />
    <rect x="8" y="7" width="3" height="10" rx="1.5" />
    <rect x="13" y="5" width="3" height="14" rx="1.5" />
    <rect x="18" y="8" width="3" height="8" rx="1.5" />
  </svg>
)

const ParamsIcon = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    className={className}
  >
    <path d="M4 10h16M4 16h16" />
    <circle cx="15" cy="10" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="9" cy="16" r="1.5" fill="currentColor" stroke="none" />
  </svg>
)

export default function ChatInput({
  text,
  onSend,
  isLoading,
  isModeChanging = false,
  statusInfo,
  onStopGeneration,
  onStopVoice,
  isCallMode = false,
  onToggleCallMode,
  speakingMessageId = null,
  voiceStatus = 'idle'
}: ChatInputProps) {
  const { t } = useI18n()
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const ghostRef = useRef<HTMLDivElement>(null)
  const [localText, setLocalText] = useState(text)
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  const [isSavingSettings, setIsSavingSettings] = useState(false)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [voiceSettings, setVoiceSettings] = useState({
    wake_word_enabled: false,
    tts_enabled: true
  })
  const [aiTier, setAiTier] = useState<string | null>(null)
  const [isQuickRecording, setIsQuickRecording] = useState(false)
  const isBrainUnavailable = statusInfo ? !statusInfo.brain_ready || statusInfo.is_loading : false

  const { suggestion, addToHistory, getSuggestion, clearSuggestion, acceptSuggestion } =
    useAutocomplete()

  // Sync local text with external text
  useEffect(() => {
    setLocalText(text)
  }, [text])

  // Get tier from statusInfo or fetch it
  useEffect(() => {
    if (statusInfo?.ai_tier) {
      setAiTier(statusInfo.ai_tier)
    }
  }, [statusInfo])

  // Auto-resize textarea + sync ghost scroll
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto'
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 160)}px`
    }
  }, [localText])

  useEffect(() => {
    inputRef.current?.focus()

    const handleFocus = () => {
      setTimeout(() => {
        inputRef.current?.focus()
      }, 50)
    }

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const activeElement = document.activeElement
      const isTyping =
        activeElement instanceof HTMLInputElement ||
        activeElement instanceof HTMLTextAreaElement ||
        activeElement instanceof HTMLSelectElement

      const isSpecialKey = e.key.length > 1 && e.key !== 'Backspace'

      if (!isTyping && !isSpecialKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        inputRef.current?.focus()
      }
    }

    window.addEventListener('focus', handleFocus)
    window.addEventListener('keydown', handleGlobalKeyDown)
    return () => {
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('keydown', handleGlobalKeyDown)
    }
  }, [])

  useEffect(() => {
    const loadSettings = async () => {
      if (settingsLoaded || (statusInfo && statusInfo.status !== 'ok')) return

      try {
        const data = await fetchSettings()
        setVoiceSettings({
          wake_word_enabled: !!data.wake_word_enabled,
          tts_enabled: !!data.tts_enabled
        })
        if (data.ai_tier) setAiTier(data.ai_tier)
        setSettingsLoaded(true)
      } catch (error) {
        console.error('Erro ao carregar configuracoes:', error)
      }
    }

    loadSettings()
  }, [statusInfo, settingsLoaded])

  // Reload voice settings when tier changes
  useEffect(() => {
    if (!settingsLoaded) return

    const reloadVoiceSettings = async () => {
      try {
        const data = await fetchSettings()
        setVoiceSettings({
          wake_word_enabled: !!data.wake_word_enabled,
          tts_enabled: !!data.tts_enabled
        })
        if (data.ai_tier) setAiTier(data.ai_tier)
      } catch (error) {
        console.error('Erro ao recarregar configuracoes de voz:', error)
      }
    }

    const handleTierChange = () => {
      reloadVoiceSettings()
    }

    window.addEventListener('momai_tier_change_start', handleTierChange)
    window.addEventListener('momai_settings_sync', handleTierChange)

    return () => {
      window.removeEventListener('momai_tier_change_start', handleTierChange)
      window.removeEventListener('momai_settings_sync', handleTierChange)
    }
  }, [settingsLoaded])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('.voice-dropdown')) {
        setIsDropdownOpen(false)
      }
    }

    if (isDropdownOpen) {
      document.addEventListener('click', handleClickOutside)
      return () => document.removeEventListener('click', handleClickOutside)
    }
    return undefined
  }, [isDropdownOpen])

  const handleSend = useCallback(() => {
    if (!localText.trim() || isLoading || isModeChanging || isBrainUnavailable) return
    addToHistory(localText)
    clearSuggestion()
    onSend(localText)
    setLocalText('')
  }, [
    localText,
    isLoading,
    isModeChanging,
    isBrainUnavailable,
    addToHistory,
    clearSuggestion,
    onSend
  ])

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value
      setLocalText(value)
      getSuggestion(value)
    },
    [getSuggestion]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
        return
      }

      if ((e.key === 'Tab' || e.key === 'ArrowRight') && suggestion) {
        const textarea = inputRef.current
        if (e.key === 'ArrowRight' && textarea) {
          const cursorAtEnd = textarea.selectionStart === localText.length
          if (!cursorAtEnd) return
        }
        e.preventDefault()
        const completed = acceptSuggestion(localText)
        setLocalText(completed)
        clearSuggestion()
      }
    },
    [suggestion, localText, handleSend, acceptSuggestion, clearSuggestion]
  )

  const handleMicClick = async () => {
    if (isQuickRecording) return

    setIsQuickRecording(true)
    try {
      const result = await quickTranscribe()
      if (result.success && result.text.trim()) {
        addToHistory(result.text.trim())
        onSend(result.text.trim())
      }
    } catch (error) {
      console.error('Erro na transcrição rápida:', error)
    } finally {
      setIsQuickRecording(false)
    }
  }

  const toggleSetting = async (key: 'wake_word_enabled' | 'tts_enabled') => {
    if (!settingsLoaded || isSavingSettings) return

    // Restriction Logic
    if (key === 'wake_word_enabled' && aiTier !== 'ultra') return
    if (key === 'tts_enabled' && aiTier === 'lite') return

    const previous = voiceSettings[key]
    const next = !previous
    setVoiceSettings((prev) => ({ ...prev, [key]: next }))
    setIsSavingSettings(true)
    setIsDropdownOpen(false)

    try {
      await updateSettingsPartial({ [key]: next })
    } catch (error) {
      console.error('Erro ao atualizar configuracoes:', error)
      setVoiceSettings((prev) => ({ ...prev, [key]: previous }))
    } finally {
      setIsSavingSettings(false)
    }
  }

  const handleCallModeClick = () => {
    if (aiTier !== 'ultra') return
    onToggleCallMode?.()
  }

  return (
    <footer className="p-4 bg-transparent relative">
      <div className="max-w-4xl mx-auto relative">
        <div className="flex flex-col bg-white/[0.03] hover:bg-white/[0.05] backdrop-blur-xl rounded-2xl transition-all duration-300 focus-within:bg-white/[0.07] focus-within:ring-1 focus-within:ring-white/5">
          <div className="relative">
            {/* Ghost text overlay for autocomplete suggestion */}
            <div
              ref={ghostRef}
              aria-hidden="true"
              className="absolute inset-0 pointer-events-none py-2 px-4 text-[15px] sm:text-[16px] whitespace-pre-wrap break-words overflow-hidden"
              style={{ lineHeight: 'inherit' }}
            >
              <span className="invisible">{localText}</span>
              {suggestion && <span className="text-text-muted/25 select-none">{suggestion}</span>}
            </div>

            <textarea
              ref={inputRef}
              rows={1}
              className="flex-1 w-full bg-transparent border-none py-2 px-4 text-[15px] sm:text-[16px] text-text outline-none placeholder:text-text-muted/70 disabled:opacity-50 min-w-0 resize-none scrollbar-none relative z-10"
              style={{ caretColor: 'auto' }}
              value={localText}
              onChange={handleInputChange}
              placeholder={t('chatInput.placeholder')}
              onKeyDown={handleKeyDown}
              onBlur={clearSuggestion}
            />
          </div>

          <div className="flex items-center justify-between px-3 pb-3 pt-0">
            <div className="flex items-center gap-1">
              <div className="relative voice-dropdown">
                <button
                  type="button"
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  disabled={!settingsLoaded || isSavingSettings}
                  className={`flex items-center justify-center rounded-full w-8 h-8 transition-all duration-200 ${
                    isDropdownOpen
                      ? 'bg-accent/10 text-accent'
                      : 'bg-transparent text-text-muted hover:text-text hover:bg-white/5'
                  } ${!settingsLoaded ? 'opacity-50' : ''}`}
                  title={t('chatInput.opcoesVoz')}
                >
                  <ParamsIcon className="w-4 h-4" />
                </button>

                {isDropdownOpen && (
                  <div className="absolute bottom-full left-0 mb-3 bg-card border border-border/30 rounded-xl shadow-2xl overflow-hidden min-w-[240px] z-50 animate-in fade-in slide-in-from-bottom-2 duration-200">
                    {/* Wake Word Option */}
                    <button
                      type="button"
                      onClick={() => toggleSetting('wake_word_enabled')}
                      disabled={!settingsLoaded || isSavingSettings || aiTier !== 'ultra'}
                      className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-all ${
                        voiceSettings.wake_word_enabled && aiTier === 'ultra'
                          ? 'bg-accent/5 text-accent'
                          : ''
                      } ${aiTier !== 'ultra' ? 'cursor-default opacity-80' : ''}`}
                    >
                      <MicrophoneIcon
                        className={`w-4 h-4 ${voiceSettings.wake_word_enabled && aiTier === 'ultra' ? 'text-accent' : 'text-text-muted opacity-50'}`}
                      />
                      <div className="flex flex-col items-start flex-1">
                        <span className="text-[11px] font-bold">
                          {t('chatInput.reconhecimento')}
                        </span>
                        <span
                          className={`text-[9px] font-medium leading-tight ${aiTier === 'ultra' ? 'text-text-muted opacity-70' : aiTier === 'lite' ? 'text-emerald-500' : 'text-red-500'}`}
                        >
                          {aiTier === 'ultra'
                            ? t('chatInput.reconhecimentoDesc')
                            : 'Recurso disponível apenas no Ultra'}
                        </span>
                      </div>
                      {aiTier === 'ultra' && (
                        <div
                          className={`w-1.5 h-1.5 rounded-full ${voiceSettings.wake_word_enabled ? 'bg-accent' : 'bg-white/10'}`}
                        />
                      )}
                    </button>

                    {/* TTS Option */}
                    <button
                      type="button"
                      onClick={() => toggleSetting('tts_enabled')}
                      disabled={!settingsLoaded || isSavingSettings || aiTier === 'lite'}
                      className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-all border-t border-border/10 ${
                        voiceSettings.tts_enabled && aiTier !== 'lite'
                          ? 'bg-accent/5 text-accent'
                          : ''
                      } ${aiTier === 'lite' ? 'cursor-default opacity-80' : ''}`}
                    >
                      <SpeakerWaveIcon
                        className={`w-4 h-4 ${voiceSettings.tts_enabled && aiTier !== 'lite' ? 'text-accent' : 'text-text-muted opacity-50'}`}
                      />
                      <div className="flex flex-col items-start flex-1">
                        <span className="text-[11px] font-bold">{t('chatInput.falar')}</span>
                        <span
                          className={`text-[9px] font-medium leading-tight ${aiTier !== 'lite' ? 'text-text-muted opacity-70' : 'text-emerald-500'}`}
                        >
                          {aiTier !== 'lite'
                            ? t('chatInput.falarDesc')
                            : 'Recurso disponível a partir do Pro'}
                        </span>
                      </div>
                      {aiTier !== 'lite' && (
                        <div
                          className={`w-1.5 h-1.5 rounded-full ${voiceSettings.tts_enabled ? 'bg-accent' : 'bg-white/10'}`}
                        />
                      )}
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1">
              {/* Botão de Microfone - Transcrição rápida */}
              {!isLoading && !localText.trim() && (
                <button
                  type="button"
                  onClick={handleMicClick}
                  disabled={
                    isLoading ||
                    isModeChanging ||
                    isBrainUnavailable ||
                    isQuickRecording ||
                    aiTier !== 'ultra'
                  }
                  className={`flex items-center justify-center rounded-full w-8 h-8 transition-all duration-200 ${
                    isQuickRecording
                      ? 'bg-red-500 text-white animate-pulse'
                      : aiTier === 'ultra'
                        ? 'bg-transparent text-text-muted hover:text-text hover:bg-white/5'
                        : 'text-text-muted/20 cursor-not-allowed grayscale'
                  }`}
                  title={
                    aiTier !== 'ultra'
                      ? 'Transcrição de voz disponível apenas no modo Ultra'
                      : isQuickRecording
                        ? 'Escutando...'
                        : 'Gravar mensagem de voz'
                  }
                >
                  {isQuickRecording ? (
                    <div className="relative flex items-center justify-center">
                      <MicrophoneIcon className="w-4 h-4" />
                      <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 flex items-end gap-[1px]">
                        <span className="stt-eq-bar h-1 w-[2px] rounded-full bg-white/90" />
                        <span className="stt-eq-bar stt-eq-bar--2 h-1.5 w-[2px] rounded-full bg-white" />
                        <span className="stt-eq-bar stt-eq-bar--3 h-[7px] w-[2px] rounded-full bg-white/90" />
                      </div>
                    </div>
                  ) : (
                    <MicrophoneIcon className="w-4 h-4" />
                  )}
                </button>
              )}

              {isLoading ? (
                <button
                  type="button"
                  className="bg-accent text-white rounded-full w-8 h-8 flex items-center justify-center transition-all hover:scale-105 active:scale-95 shadow-lg shadow-accent/20"
                  onClick={onStopGeneration}
                >
                  <StopIcon className="w-4 h-4" />
                </button>
              ) : speakingMessageId !== null ? (
                <button
                  type="button"
                  className="bg-red-500 text-white rounded-full w-8 h-8 flex items-center justify-center transition-all hover:scale-105 active:scale-95 shadow-lg shadow-red-500/20"
                  onClick={onStopVoice}
                  title="Parar voz"
                >
                  <StopIcon className="w-4 h-4" />
                </button>
              ) : localText.trim() ? (
                <button
                  type="button"
                  className="bg-transparent text-text-muted rounded-full w-8 h-8 flex items-center justify-center transition-all hover:scale-110 hover:text-text hover:bg-white/5 active:scale-90 disabled:opacity-40"
                  onClick={handleSend}
                  disabled={
                    isLoading ||
                    isModeChanging ||
                    isBrainUnavailable
                  }
                  title="Enviar mensagem"
                >
                  <PaperAirplaneIcon className="w-5 h-5" />
                </button>
              ) : (
                <button
                  type="button"
                  disabled={aiTier !== 'ultra'}
                  className={`rounded-full w-8 h-8 flex items-center justify-center transition-all hover:scale-105 active:scale-95 ${
                    isCallMode
                      ? 'bg-red-500 text-white shadow-lg shadow-red-500/20'
                      : aiTier === 'ultra'
                        ? 'bg-white/5 text-text-muted hover:text-text hover:bg-white/10 border border-border/10'
                        : 'bg-white/[0.02] text-text-muted/20 cursor-not-allowed grayscale'
                  }`}
                  onClick={handleCallModeClick}
                  title={aiTier === 'ultra' ? 'Call Mode' : 'Call Mode (Ultra Only)'}
                >
                  <WaveIcon className={`w-4 h-4 ${isCallMode ? 'animate-pulse' : ''}`} />
                </button>
              )}
            </div>
          </div>

        </div>
      </div>
    </footer>
  )
}
