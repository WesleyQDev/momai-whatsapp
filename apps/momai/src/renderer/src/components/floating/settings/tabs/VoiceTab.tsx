import { Settings, Tab } from '../../../../hooks/useSettingsCard'
import React, { useState, useEffect, useMemo } from 'react'
import { useTTS } from '../../../../hooks/useTTS'
import { fetchExtensions, fetchSkillKeywords, updateSkillKeywords } from '../../../../services/api'

interface VoiceTabProps {
  t: any
  settings: Settings
  setActiveTab: (tab: Tab) => void
  expandedLang: string | null
  setExpandedLang: (lang: string | null) => void
  updateField: (field: string, v: any, s?: boolean) => Promise<void>
}

const KOKORO_VOICES = [
  { id: 'pf_dora', name: 'Dora', lang: 'pt-BR', gender: 'Feminina', suggested: true },
  { id: 'pm_alex', name: 'Alex', lang: 'pt-BR', gender: 'Masculina' },
  { id: 'pm_santa', name: 'Santa', lang: 'pt-BR', gender: 'Masculina' },
  { id: 'af_heart', name: 'Heart', lang: 'en-US', gender: 'Feminina' },
  { id: 'af_bella', name: 'Bella', lang: 'en-US', gender: 'Feminina' },
  { id: 'am_adam', name: 'Adam', lang: 'en-US', gender: 'Masculina' },
  { id: 'am_fenrir', name: 'Fenrir', lang: 'en-US', gender: 'Masculina' },
  { id: 'bf_alice', name: 'Alice', lang: 'en-GB', gender: 'Feminina' },
  { id: 'bm_george', name: 'George', lang: 'en-GB', gender: 'Masculina' },
  { id: 'ef_dora', name: 'Dora', lang: 'es', gender: 'Feminina' },
  { id: 'em_alex', name: 'Alex', lang: 'es', gender: 'Masculina' },
  { id: 'if_sara', name: 'Sara', lang: 'it', gender: 'Feminina' },
  { id: 'im_nicola', name: 'Nicola', lang: 'it', gender: 'Masculina' },
  { id: 'ff_amelie', name: 'Amélie', lang: 'fr', gender: 'Feminina' },
  { id: 'fm_henri', name: 'Henri', lang: 'fr', gender: 'Masculina' }
]

const EDGE_VOICES_FALLBACK = [
  { id: 'pt-BR-FranciscaNeural', name: 'Juliana', lang: 'pt-BR', gender: 'Feminina' },
  { id: 'pt-BR-AntonioNeural', name: 'Fernando', lang: 'pt-BR', gender: 'Masculina' },
  { id: 'en-US-JennyNeural', name: 'Jenny', lang: 'en-US', gender: 'Feminina' },
  { id: 'en-US-GuyNeural', name: 'Guy', lang: 'en-US', gender: 'Masculina' },
  { id: 'en-GB-SoniaNeural', name: 'Sonia', lang: 'en-GB', gender: 'Feminina' },
  { id: 'en-GB-RyanNeural', name: 'Ryan', lang: 'en-GB', gender: 'Masculina' },
  { id: 'es-ES-ElviraNeural', name: 'Elvira', lang: 'es', gender: 'Feminina' },
  { id: 'es-ES-AlvaroNeural', name: 'Alvaro', lang: 'es', gender: 'Masculina' },
  { id: 'it-IT-ElsaNeural', name: 'Elsa', lang: 'it', gender: 'Feminina' },
  { id: 'it-IT-DiegoNeural', name: 'Diego', lang: 'it', gender: 'Masculina' }
]

const LANG_MAP: Record<string, string> = {
  'pt-BR': 'Português (Brasil)',
  'en-US': 'English (US)',
  'en-GB': 'English (UK)',
  es: 'Espanhol',
  it: 'Italiano',
  fr: 'Francês',
  unknown: 'Outros'
}

function normalizeLang(langCode?: string): string {
  if (!langCode) return 'pt-BR'
  const l = langCode.toLowerCase()
  if (l.includes('pt') || l === 'p') return 'pt-BR'
  if (l.includes('en-gb') || l === 'b') return 'en-GB'
  if (l.includes('en') || l === 'a') return 'en-US'
  if (l.includes('es') || l === 'e') return 'es'
  if (l.includes('it') || l === 'i') return 'it'
  if (l.includes('fr') || l === 'f') return 'fr'
  return langCode
}

export const VoiceTab = React.memo(
  ({ t, settings, setActiveTab, expandedLang, setExpandedLang, updateField }: VoiceTabProps) => {
    const {
      isReady,
      isSpeaking,
      currentEngine,
      availableVoices,
      setEngine,
      setVoice,
      refreshVoices
    } = useTTS()
    const [localEngine, setLocalEngine] = useState(currentEngine)
    const [isLoadingVoices, setIsLoadingVoices] = useState(false)
    const [triggers, setTriggers] = useState<any[]>([])
    const [extList, setExtList] = useState<any[]>([])
    const [showAddForm, setShowAddForm] = useState(false)
    const [newKeyword, setNewKeyword] = useState('')
    const [newSkill, setNewSkill] = useState('')
    const [selectedLang, setSelectedLang] = useState<string>('pt-BR')

    const currentVoiceId = settings.tts_voice || 'pf_dora'

    useEffect(() => {
      setLocalEngine(currentEngine)
      refreshVoices(currentEngine)
    }, [currentEngine, refreshVoices])

    interface VoiceOption {
      id: string
      name: string
      lang: string
      gender?: string
      suggested?: boolean
    }

    const engineVoices = useMemo<VoiceOption[]>(() => {
      if (localEngine === 'kokoro' || !localEngine) {
        if (availableVoices && availableVoices.length > 0) {
          return availableVoices.map((v) => {
            const meta = KOKORO_VOICES.find((k) => k.id === v.id)
            return {
              id: v.id,
              name: v.name || meta?.name || v.id,
              lang: normalizeLang(v.language || meta?.lang),
              gender: v.gender || meta?.gender,
              suggested: meta?.suggested
            }
          })
        }
        return KOKORO_VOICES
      } else if (localEngine === 'edge-tts') {
        if (availableVoices && availableVoices.length > 0) {
          return availableVoices.map((v) => ({
            id: v.id,
            name: v.name || v.id,
            lang: normalizeLang(v.language),
            gender:
              v.gender === 'female' ? 'Feminina' : v.gender === 'male' ? 'Masculina' : undefined
          }))
        }
        return EDGE_VOICES_FALLBACK
      } else {
        if (availableVoices && availableVoices.length > 0) {
          return availableVoices.map((v) => ({
            id: v.id,
            name: v.name || v.id,
            lang: normalizeLang(v.language || 'unknown')
          }))
        }
        return [{ id: 'default', name: 'Voz padrão do sistema', lang: 'pt-BR' }]
      }
    }, [localEngine, availableVoices])

    const availableLanguages = useMemo(() => {
      const langSet = new Set<string>()
      engineVoices.forEach((v) => {
        if (v.lang) langSet.add(v.lang)
      })
      if (langSet.size === 0) langSet.add('pt-BR')

      const list = Array.from(langSet).map((code) => ({
        code,
        label: LANG_MAP[code] || code
      }))

      list.sort((a, b) => {
        if (a.code === 'pt-BR') return -1
        if (b.code === 'pt-BR') return 1
        return a.label.localeCompare(b.label)
      })

      return list
    }, [engineVoices])

    useEffect(() => {
      const activeVoice = engineVoices.find((v) => v.id === currentVoiceId)
      if (activeVoice && activeVoice.lang) {
        if (availableLanguages.some((l) => l.code === activeVoice.lang)) {
          setSelectedLang(activeVoice.lang)
          return
        }
      }
      if (
        availableLanguages.length > 0 &&
        !availableLanguages.some((l) => l.code === selectedLang)
      ) {
        setSelectedLang(availableLanguages[0].code)
      }
    }, [currentVoiceId, engineVoices, availableLanguages])

    const filteredVoices = useMemo(() => {
      return engineVoices.filter((v) => v.lang === selectedLang)
    }, [engineVoices, selectedLang])

    const handleEngineChange = async (engineId: 'kokoro' | 'edge-tts' | 'say') => {
      try {
        await (window as any).momaiAPI?.stopTts?.()
      } catch {}
      setLocalEngine(engineId)
      setEngine(engineId)
      updateField('tts_engine', engineId, true)
      setIsLoadingVoices(true)

      let defaultVoice = 'pf_dora'
      const defaultLang = 'pt-BR'
      if (engineId === 'edge-tts') {
        defaultVoice = 'pt-BR-AntonioNeural'
      } else if (engineId === 'say') {
        defaultVoice = ''
      }

      if (defaultVoice) {
        setVoice(defaultVoice)
        updateField('tts_voice', defaultVoice, true)
      }
      setSelectedLang(defaultLang)

      setTimeout(async () => {
        try {
          await refreshVoices(engineId)
        } catch {}
        setIsLoadingVoices(false)
      }, 300)
    }

    const handleLangChange = (langCode: string) => {
      setSelectedLang(langCode)
      const voicesInLang = engineVoices.filter((v) => v.lang === langCode)
      if (voicesInLang.length > 0) {
        handleVoiceSelect(voicesInLang[0].id)
      }
    }

    const handleVoiceSelect = async (voiceId: string) => {
      try {
        await (window as any).momaiAPI?.stopTts?.()
      } catch {}
      setVoice(voiceId)
      updateField('tts_voice', voiceId, true)
    }

    useEffect(() => {
      fetchExtensions()
        .then((exts) => {
          setExtList(Array.isArray(exts) ? exts.filter((e: any) => !e.is_community) : [])
        })
        .catch(() => {})
    }, [])

    useEffect(() => {
      fetchSkillKeywords()
        .then((data) => {
          if (data?.keywords) {
            const list: any[] = []
            for (const [skillId, keywords] of Object.entries(data.keywords)) {
              for (const kw of keywords as unknown as string[]) list.push({ skillId, keyword: kw })
            }
            setTriggers(list)
          }
        })
        .catch(() => {})
    }, [])

    const addTrigger = async () => {
      if (!newKeyword.trim() || !newSkill) return
      const current: any = await fetchSkillKeywords().catch(() => ({ keywords: {} }))
      const updated: Record<string, string[]> = { ...(current?.keywords || {}) }
      if (!updated[newSkill]) updated[newSkill] = []
      updated[newSkill] = [...updated[newSkill], newKeyword.trim()]
      await (updateSkillKeywords as any)(updated)
      setTriggers((prev) => [...prev, { skillId: newSkill, keyword: newKeyword.trim() }])
      setNewKeyword('')
      setNewSkill('')
      setShowAddForm(false)
    }

    const removeTrigger = async (skillId: string, keyword: string) => {
      const current: any = await fetchSkillKeywords().catch(() => ({ keywords: {} }))
      const updated: Record<string, string[]> = { ...(current?.keywords || {}) }
      if (updated[skillId]) updated[skillId] = updated[skillId].filter((k: string) => k !== keyword)
      await (updateSkillKeywords as any)(updated)
      setTriggers((prev) => prev.filter((t) => !(t.skillId === skillId && t.keyword === keyword)))
    }

    const isLite = settings.ai_tier === 'lite'

    return (
      <div className="space-y-5">
        {/* Lite overlay */}
        {isLite && (
          <div className="rounded-xl bg-white/[0.03] border border-border/40 overflow-hidden">
            <div className="flex items-center justify-between p-4">
              <div>
                <div className="text-xs font-semibold text-text">Foco em Desempenho</div>
                <div className="text-[11px] text-text-muted font-medium mt-0.5">
                  Voz não disponível no modo Lite.
                </div>
              </div>
              <button
                onClick={() => setActiveTab('general')}
                className="px-3 py-1.5 rounded-lg text-[10px] font-semibold bg-accent/10 text-accent border border-accent/20"
              >
                Alterar para Pro ou Ultra
              </button>
            </div>
          </div>
        )}

        {/* Daily Briefing */}
        <span className="text-xs font-bold text-text-muted uppercase tracking-wide block">
          Saudação Diária
        </span>
        <div
          className={`rounded-xl bg-white/[0.03] border border-border/40 overflow-hidden ${isLite ? 'opacity-20 pointer-events-none grayscale' : ''}`}
        >
          <div className="flex items-center justify-between p-4">
            <div>
              <div className="text-xs font-semibold text-text">Saudação automática</div>
              <div className="text-[11px] text-text-muted font-medium mt-0.5">
                Reproduz uma saudação ao iniciar
              </div>
            </div>
            <button
              onClick={() => {
                updateField('daily_briefing_enabled', !settings.daily_briefing_enabled, true)
              }}
              className={`relative w-11 h-5 rounded-full transition-all shrink-0 ${settings.daily_briefing_enabled ? 'bg-accent' : 'bg-white/10'}`}
            >
              <div
                className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-lg transition-all ${settings.daily_briefing_enabled ? 'left-6' : 'left-0.5'}`}
              />
            </button>
          </div>
          {settings.daily_briefing_enabled && (
            <>
              <div className="flex items-center justify-between p-4 border-t border-border/20">
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-text">Saudação personalizada</div>
                  <input
                    value={settings.greeting_acao || ''}
                    onChange={(e) => updateField('greeting_acao', e.target.value, true)}
                    placeholder="Ex: Me conte uma curiosidade"
                    className="mt-1 w-full bg-transparent text-[11px] text-text-muted font-medium outline-none border-b border-border/10 pb-0.5 focus:border-accent/40"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between p-4 border-t border-border/20">
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-text">Mensagem fixa</div>
                  <input
                    value={settings.greeting_fixa || ''}
                    onChange={(e) => updateField('greeting_fixa', e.target.value, true)}
                    placeholder="Ex: Bem-vindo de volta!"
                    className="mt-1 w-full bg-transparent text-[11px] text-text-muted font-medium outline-none border-b border-border/10 pb-0.5 focus:border-accent/40"
                  />
                </div>
              </div>
            </>
          )}
        </div>

        {/* Engine + Idioma + Voz Dropdowns */}
        <span className="text-xs font-bold text-text-muted uppercase tracking-wide block">Voz</span>
        <div
          className={`rounded-xl bg-white/[0.03] border border-border/40 overflow-hidden ${isLite ? 'opacity-20 pointer-events-none grayscale' : ''}`}
        >
          {/* Dropdown 1: Motor TTS */}
          <div className="flex items-center justify-between p-4 border-b border-border/20">
            <div>
              <div className="text-xs font-semibold text-text">Motor de Síntese (TTS)</div>
              <div className="text-[11px] text-text-muted font-medium mt-0.5">
                Tecnologia para geração de áudio
              </div>
            </div>
            <div className="relative">
              <select
                value={localEngine}
                onChange={(e) =>
                  handleEngineChange(e.target.value as 'kokoro' | 'edge-tts' | 'say')
                }
                className="bg-zinc-800 border border-border/30 rounded-lg pl-3 pr-8 py-1.5 text-xs text-text outline-none focus:border-accent/40 cursor-pointer min-w-[170px]"
              >
                <option value="kokoro">Kokoro (Local Neural)</option>
                <option value="edge-tts">Edge TTS (Online Natural)</option>
                <option value="say">Say.js (Sistema)</option>
              </select>
              <svg
                className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted/50 pointer-events-none"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </div>
          </div>

          {/* Dropdown 2: Idioma */}
          <div className="flex items-center justify-between p-4 border-b border-border/20">
            <div>
              <div className="text-xs font-semibold text-text">Idioma</div>
              <div className="text-[11px] text-text-muted font-medium mt-0.5">
                Filtrar vozes pelo idioma
              </div>
            </div>
            <div className="relative">
              <select
                value={selectedLang}
                onChange={(e) => handleLangChange(e.target.value)}
                disabled={isLoadingVoices}
                className="bg-zinc-800 border border-border/30 rounded-lg pl-3 pr-8 py-1.5 text-xs text-text outline-none focus:border-accent/40 cursor-pointer min-w-[170px] disabled:opacity-50"
              >
                {availableLanguages.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.label}
                  </option>
                ))}
              </select>
              <svg
                className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted/50 pointer-events-none"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </div>
          </div>

          {/* Dropdown 3: Voz */}
          <div className="flex items-center justify-between p-4">
            <div>
              <div className="text-xs font-semibold text-text">Voz da Assistente</div>
              <div className="text-[11px] text-text-muted font-medium mt-0.5">
                Selecione a voz para reprodução
              </div>
            </div>
            <div className="relative">
              {isLoadingVoices ? (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 border border-border/30 rounded-lg text-xs text-text-muted">
                  <div className="w-3 h-3 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
                  <span>Carregando...</span>
                </div>
              ) : (
                <>
                  <select
                    value={currentVoiceId}
                    onChange={(e) => handleVoiceSelect(e.target.value)}
                    className="bg-zinc-800 border border-border/30 rounded-lg pl-3 pr-8 py-1.5 text-xs text-text outline-none focus:border-accent/40 cursor-pointer min-w-[170px]"
                  >
                    {filteredVoices.length > 0 ? (
                      filteredVoices.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name} {v.gender ? `(${v.gender})` : ''}{' '}
                          {v.suggested ? '★ Sugerida' : ''}
                        </option>
                      ))
                    ) : (
                      <option value="">Nenhuma voz encontrada</option>
                    )}
                  </select>
                  <svg
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted/50 pointer-events-none"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Atalhos de Voz */}
        <span className="text-xs font-bold text-text-muted uppercase tracking-wide block">
          Atalhos de Voz
        </span>
        <div
          className={`rounded-xl bg-white/[0.03] border border-border/40 overflow-hidden ${isLite ? 'opacity-20 pointer-events-none grayscale' : ''}`}
        >
          <div className="flex items-center justify-between p-4 border-b border-border/20">
            <span className="text-xs font-semibold text-text">
              Palavras-chave ativas: {triggers.length}
            </span>
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="px-2.5 py-1 rounded-lg text-[10px] font-semibold bg-accent/10 text-accent border border-accent/20 hover:bg-accent/20 transition-colors"
            >
              {showAddForm ? 'Cancelar' : 'Adicionar'}
            </button>
          </div>
          {showAddForm && (
            <div className="p-4 border-b border-border/20 space-y-2">
              <select
                value={newSkill}
                onChange={(e) => setNewSkill(e.target.value)}
                className="w-full bg-input border border-border/30 rounded-lg px-3 py-2 text-xs text-text outline-none focus:border-accent/40"
              >
                <option value="">Selecione uma skill...</option>
                {extList.map((ext: any) => (
                  <option key={ext.id} value={ext.id} disabled={!ext.enabled}>
                    {ext.name}
                  </option>
                ))}
              </select>
              <div className="flex gap-2">
                <input
                  value={newKeyword}
                  onChange={(e) => setNewKeyword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addTrigger()}
                  placeholder="Palavra-chave"
                  className="flex-1 bg-input border border-border/30 rounded-lg px-3 py-2 text-xs text-text outline-none focus:border-accent/40"
                />
                <button
                  onClick={addTrigger}
                  disabled={!newKeyword.trim() || !newSkill}
                  className="px-3 py-2 rounded-lg text-[10px] font-semibold bg-accent/10 text-accent border border-accent/20 hover:bg-accent/20 transition-colors disabled:opacity-40"
                >
                  Adicionar
                </button>
              </div>
            </div>
          )}
          {triggers.length > 0 ? (
            triggers.map((tr, i) => (
              <div
                key={i}
                className="flex items-center justify-between p-4 border-b border-border/20 last:border-none"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-text">{tr.keyword}</div>
                  <div className="text-[11px] text-text-muted font-medium mt-0.5">{tr.skillId}</div>
                </div>
                <button
                  onClick={() => removeTrigger(tr.skillId, tr.keyword)}
                  className="w-6 h-6 rounded-lg bg-white/5 hover:bg-red-500/20 flex items-center justify-center transition-colors shrink-0 ml-3"
                >
                  <svg
                    className="w-3 h-3 text-text-muted/50"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))
          ) : (
            <div className="p-4 text-[11px] text-text-muted/50">Nenhum atalho configurado.</div>
          )}
        </div>
      </div>
    )
  }
)
VoiceTab.displayName = 'VoiceTab'
