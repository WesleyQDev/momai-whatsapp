import { useState, useEffect, useMemo } from 'react'
import { StatusData, listMemoryNotes, fetchSettings, SettingsData } from '../../services/api'
import { useI18n } from '../../i18n'

interface WelcomeTipsProps {
  onSendMessage: (text: string) => void
  statusInfo: StatusData | null
}

const MAX_SUGGESTIONS = 4

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

export function WelcomeHeader({
  statusInfo,
  settings
}: {
  statusInfo: StatusData | null
  settings: SettingsData | null
}) {
  const { t } = useI18n()
  const userName = settings?.user_name || ''
  const showSeparator = userName && userName !== ''
  const tier =
    localStorage.getItem('momai_ai_tier') || statusInfo?.ai_tier || settings?.ai_tier || 'lite'

  return (
    <div className="flex flex-col items-center text-center space-y-6 max-w-md w-full mb-2 animate-in fade-in slide-in-from-bottom-4 duration-1000">
      <div className="space-y-1">
        <h2 className="text-[32px] font-extrabold text-text tracking-tight flex items-center justify-center gap-3">
          <span>
            {t('home.greeting')}
            {showSeparator ? ', ' : ' '}
            {userName}
          </span>
          {tier !== 'ultra' && (
            <span
              className={`px-2 py-1 rounded-md border text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 mt-1 ${
                tier === 'pro'
                  ? 'bg-red-500/10 border-red-500/20 text-red-500/80 shadow-[0_0_15px_rgba(239,68,68,0.1)]'
                  : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500/80 shadow-[0_0_15px_rgba(16,185,129,0.1)]'
              }`}
            >
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
              >
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
              </svg>
              {tier}
            </span>
          )}
        </h2>
        <div className="flex flex-col gap-1 items-center">
          <p className="text-[16px] text-text-muted/60 font-semibold tracking-tight">
            {t('home.askHelp')}
          </p>
          {tier !== 'ultra' && (
            <p className="text-[11px] text-text-muted/30 font-medium max-w-xs text-center pt-2 leading-relaxed">
              {t('home.economyHint')} <span className="text-accent/60 font-bold">Ultra</span>.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

export function WelcomeActions({
  onSendMessage,
  tier,
  dynamicSuggestion,
  randomSuggestions
}: {
  onSendMessage: (text: string) => void
  tier: string
  dynamicSuggestion: string | null
  randomSuggestions: string[]
}) {
  if (tier !== 'ultra') return null

  return (
    <div className="w-full max-w-2xl flex flex-wrap justify-center gap-2 mt-4 animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-300">
      {dynamicSuggestion && (
        <button
          onClick={() => onSendMessage(dynamicSuggestion)}
          className="py-1.5 px-4 rounded-full bg-accent/10 hover:bg-accent/20 text-accent transition-all text-[11px] font-bold flex items-center gap-2 shadow-sm"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
          <span className="truncate max-w-[200px]">{dynamicSuggestion}</span>
        </button>
      )}

      {randomSuggestions.map((suggestion, index) => (
        <button
          key={index}
          onClick={() => onSendMessage(suggestion)}
          className="py-1.5 px-5 rounded-full bg-white/[0.04] hover:bg-white/[0.08] hover:text-accent transition-all text-[11px] font-semibold text-text-muted/80 shadow-sm"
        >
          {suggestion}
        </button>
      ))}
    </div>
  )
}

export default function WelcomeTips({ onSendMessage, statusInfo }: WelcomeTipsProps) {
  const { t } = useI18n()
  const [dynamicSuggestion, setDynamicSuggestion] = useState<string | null>(null)
  const [settings, setSettings] = useState<SettingsData | null>(null)
  const isBrainReady = statusInfo?.brain_ready ?? false

  const allSuggestions = useMemo(
    () =>
      Array.from({ length: 12 }, (_, idx) => t(`home.suggestion.${idx}`)).filter(
        (value) => !value.startsWith('home.suggestion.')
      ),
    [t]
  )

  const randomSuggestions = useMemo(() => {
    return shuffleArray(allSuggestions).slice(0, MAX_SUGGESTIONS)
  }, [allSuggestions])

  useEffect(() => {
    const cachedName = localStorage.getItem('momai_user_name')
    if (cachedName && !settings) {
      setSettings((prev) => (prev ? prev : ({ user_name: cachedName } as any)))
    }

    const loadSettings = async () => {
      try {
        const data = await fetchSettings()
        setSettings(data)
        if (data.user_name) {
          localStorage.setItem('momai_user_name', data.user_name)
        }
      } catch (err) {
        console.error('Failed to load settings for welcome state:', err)
      }
    }
    loadSettings()
  }, [statusInfo?.status])

  useEffect(() => {
    const handleSync = (e: any) => {
      if (e.detail) {
        setSettings(e.detail)
        if (e.detail.user_name) {
          localStorage.setItem('momai_user_name', e.detail.user_name)
        }
      }
    }
    window.addEventListener('momai_settings_sync', handleSync)
    return () => window.removeEventListener('momai_settings_sync', handleSync)
  }, [])

  useEffect(() => {
    const loadDynamic = async () => {
      if (!isBrainReady) return

      try {
        const notes = await listMemoryNotes()
        const validNotes =
          notes?.filter((note) => {
            const t = note.title.toLowerCase().trim()
            return t !== '' && t !== 'new note' && t !== 'nova nota'
          }) || []

        if (validNotes.length > 0) {
          const randomNote = validNotes[Math.floor(Math.random() * validNotes.length)]
          setDynamicSuggestion(t('home.noteSuggestionPrefix', { title: randomNote.title }))
        }
      } catch (err) {
        console.error('Failed to load notes for smart suggestion:', err)
      }
    }
    loadDynamic()
  }, [isBrainReady, t])

  const tier =
    localStorage.getItem('momai_ai_tier') || statusInfo?.ai_tier || settings?.ai_tier || 'lite'

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4 select-none">
      <WelcomeHeader statusInfo={statusInfo} settings={settings} />
      <WelcomeActions
        onSendMessage={onSendMessage}
        tier={tier}
        dynamicSuggestion={dynamicSuggestion}
        randomSuggestions={randomSuggestions}
      />
    </div>
  )
}
