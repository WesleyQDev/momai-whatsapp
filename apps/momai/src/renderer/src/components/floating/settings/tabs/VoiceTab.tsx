import { Settings, Tab } from '../../../../hooks/useSettingsCard'
import React, { useState, useEffect } from 'react'
import { useTTS } from '../../../../hooks/useTTS'
import { fetchExtensions, fetchSkillKeywords, updateSkillKeywords } from '../../../../services/api'

interface VoiceTabProps {
  t: any; settings: Settings; setActiveTab: (tab: Tab) => void
  expandedLang: string | null; setExpandedLang: (lang: string | null) => void
  updateField: (field: string, v: any, s?: boolean) => Promise<void>
}

const ENGINE_META: Record<string, { name: string; desc: string }> = {
  kokoro: { name: 'Kokoro', desc: 'Voz local, rápida e offline' },
  'edge-tts': { name: 'Edge TTS', desc: 'Voz natural via Microsoft' },
  say: { name: 'Say.js', desc: 'Voz sintética padrão do sistema' }
}

const VOICE_CATALOG = [
  { langKey: 'settings.voice.lang.ptBR', code: 'p', voices: [
    { id: 'pf_dora', name: 'Dora', trait: 'female', suggested: true },
    { id: 'pm_alex', name: 'Alex', trait: 'male' },
    { id: 'pm_santa', name: 'Santa', trait: 'male' }
  ]},
  { langKey: 'settings.voice.lang.enUS', code: 'a', voices: [
    { id: 'af_heart', name: 'Heart', trait: 'female' },
    { id: 'af_bella', name: 'Bella', trait: 'female' },
    { id: 'am_adam', name: 'Adam', trait: 'male' },
    { id: 'am_fenrir', name: 'Fenrir', trait: 'male' }
  ]},
  { langKey: 'settings.voice.lang.enUK', code: 'b', voices: [
    { id: 'bf_alice', name: 'Alice', trait: 'female' },
    { id: 'bm_george', name: 'George', trait: 'male' }
  ]},
  { langKey: 'settings.voice.lang.es', code: 'e', voices: [
    { id: 'ef_dora', name: 'Dora', trait: 'female' },
    { id: 'em_alex', name: 'Alex', trait: 'male' }
  ]},
  { langKey: 'settings.voice.lang.it', code: 'i', voices: [
    { id: 'if_sara', name: 'Sara', trait: 'female' },
    { id: 'im_nicola', name: 'Nicola', trait: 'male' }
  ]},
  { langKey: 'settings.voice.lang.fr', code: 'f', voices: [
    { id: 'ff_amelie', name: 'Amélie', trait: 'female' },
    { id: 'fm_henri', name: 'Henri', trait: 'male' }
  ]}
]

export const VoiceTab = React.memo(({ t, settings, setActiveTab, expandedLang, setExpandedLang, updateField }: VoiceTabProps) => {
  const { isReady, isSpeaking, currentEngine, availableVoices, setEngine, setVoice, refreshVoices } = useTTS()
  const [localEngine, setLocalEngine] = useState(currentEngine)
  const [isLoadingVoices, setIsLoadingVoices] = useState(false)
  const [triggers, setTriggers] = useState<any[]>([])
  const [extList, setExtList] = useState<any[]>([])
  const [showAddForm, setShowAddForm] = useState(false)
  const [newKeyword, setNewKeyword] = useState('')
  const [newSkill, setNewSkill] = useState('')

  const handleEngineChange = async (engineId: 'kokoro' | 'edge-tts' | 'say') => {
    try { await (window as any).momaiAPI?.stopTts?.() } catch {}
    setLocalEngine(engineId)
    setEngine(engineId)
    setIsLoadingVoices(true)
    // Set a default voice for the engine
    const defaultVoices: Record<string, string> = { kokoro: 'pf_dora', 'edge-tts': 'pt-BR-AntonioNeural', say: '' }
    if (defaultVoices[engineId]) setVoice(defaultVoices[engineId])
    setTimeout(async () => {
      try { await refreshVoices() } catch {}
      setIsLoadingVoices(false)
    }, 300)
  }

  const handleVoiceSelect = async (voiceId: string) => {
    try { await (window as any).momaiAPI?.stopTts?.() } catch {}
    setVoice(voiceId)
  }

  const currentVoiceId = settings.tts_voice || 'pf_dora'

  useEffect(() => { setLocalEngine(currentEngine) }, [currentEngine])

  useEffect(() => {
    fetchExtensions().then((exts) => {
      setExtList(Array.isArray(exts) ? exts.filter((e: any) => !e.is_community) : [])
    }).catch(() => {})
  }, [])

  useEffect(() => {
    fetchSkillKeywords().then((data) => {
      if (data?.keywords) {
        const list: any[] = []
        for (const [skillId, keywords] of Object.entries(data.keywords)) {
          for (const kw of keywords as unknown as string[]) list.push({ skillId, keyword: kw })
        }
        setTriggers(list)
      }
    }).catch(() => {})
  }, [])

  const addTrigger = async () => {
    if (!newKeyword.trim() || !newSkill) return
    const current: any = await fetchSkillKeywords().catch(() => ({ keywords: {} }))
    const updated: Record<string, string[]> = { ...(current?.keywords || {}) }
    if (!updated[newSkill]) updated[newSkill] = []
    updated[newSkill] = [...updated[newSkill], newKeyword.trim()]
    await (updateSkillKeywords as any)(updated)
    setTriggers((prev) => [...prev, { skillId: newSkill, keyword: newKeyword.trim() }])
    setNewKeyword(''); setNewSkill(''); setShowAddForm(false)
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
              <div className="text-[11px] text-text-muted font-medium mt-0.5">Voz não disponível no modo Lite.</div>
            </div>
            <button onClick={() => setActiveTab('general')} className="px-3 py-1.5 rounded-lg text-[10px] font-semibold bg-accent/10 text-accent border border-accent/20">Alterar para Pro ou Ultra</button>
          </div>
        </div>
      )}

      {/* Daily Briefing */}
      <span className="text-xs font-bold text-text-muted uppercase tracking-wide block">Saudação Diária</span>
      <div className={`rounded-xl bg-white/[0.03] border border-border/40 overflow-hidden ${isLite ? 'opacity-20 pointer-events-none grayscale' : ''}`}>
        <div className="flex items-center justify-between p-4">
          <div>
            <div className="text-xs font-semibold text-text">Saudação automática</div>
            <div className="text-[11px] text-text-muted font-medium mt-0.5">Reproduz uma saudação ao iniciar</div>
          </div>
          <button onClick={() => {
              updateField('daily_briefing_enabled', !settings.daily_briefing_enabled, true)
            }}
            className={`relative w-11 h-5 rounded-full transition-all shrink-0 ${settings.daily_briefing_enabled ? 'bg-accent' : 'bg-white/10'}`}>
            <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-lg transition-all ${settings.daily_briefing_enabled ? 'left-6' : 'left-0.5'}`} />
          </button>
        </div>
        {settings.daily_briefing_enabled && (
          <>
            <div className="flex items-center justify-between p-4 border-t border-border/20">
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-text">Saudação personalizada</div>
                <input value={settings.greeting_acao || ''} onChange={(e) => updateField('greeting_acao', e.target.value, true)}
                  placeholder="Ex: Me conte uma curiosidade" className="mt-1 w-full bg-transparent text-[11px] text-text-muted font-medium outline-none border-b border-border/10 pb-0.5 focus:border-accent/40" />
              </div>
            </div>
            <div className="flex items-center justify-between p-4 border-t border-border/20">
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-text">Mensagem fixa</div>
                <input value={settings.greeting_fixa || ''} onChange={(e) => updateField('greeting_fixa', e.target.value, true)}
                  placeholder="Ex: Bem-vindo de volta!" className="mt-1 w-full bg-transparent text-[11px] text-text-muted font-medium outline-none border-b border-border/10 pb-0.5 focus:border-accent/40" />
              </div>
            </div>
          </>
        )}
      </div>

      {/* Engine + Vozes integrados */}
      <span className="text-xs font-bold text-text-muted uppercase tracking-wide block">Voz</span>
      <div className={`rounded-xl bg-white/[0.03] border border-border/40 overflow-hidden ${isLite ? 'opacity-20 pointer-events-none grayscale' : ''}`}>
        <div className="grid grid-cols-3 gap-0 border-b border-border/20">
          {['kokoro', 'edge-tts', 'say'].map((id) => {
            const meta = ENGINE_META[id]
            const active = localEngine === id || (id === 'kokoro' && (!localEngine || localEngine === 'kokoro'))
            return (
              <button key={id} onClick={() => handleEngineChange(id as 'kokoro' | 'edge-tts' | 'say')}
                className={`p-3 text-center transition-all ${active ? 'bg-accent/5' : 'hover:bg-white/[0.02]'} ${id !== 'kokoro' ? 'border-l border-l-border/10' : ''}`}>
                <div className={`text-xs font-semibold ${active ? 'text-accent' : 'text-text'}`}>{meta.name}</div>
                <div className="text-[10px] text-text-muted font-medium mt-0.5">{meta.desc}</div>
              </button>
            )
          })}
        </div>
        {isLoadingVoices ? (
          <div className="p-6 text-center">
            <div className="w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin mx-auto mb-2" />
            <div className="text-xs text-text-muted/70">Carregando vozes...</div>
          </div>
        ) : localEngine === 'kokoro' || !localEngine ? (
          <div className="p-3 space-y-3">
              {VOICE_CATALOG.map((lang) => (
                <div key={lang.code}>
                  <div className="text-[10px] font-semibold text-text-muted/70 uppercase tracking-wide mb-1.5">{t(lang.langKey)}</div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                    {lang.voices.map((v) => {
                      const active = currentVoiceId === v.id
                      return (
                        <button key={v.id} onClick={() => handleVoiceSelect(v.id)}
                          className={`p-2.5 rounded-lg border text-left transition-all ${active ? 'bg-accent/10 border-accent/40' : 'bg-white/[0.02] border-border/20 hover:bg-white/[0.04]'}`}>
                          <div className="text-xs font-semibold text-text">{v.name}</div>
                          <div className="text-[10px] text-text-muted/70 mt-0.5">{v.trait === 'female' ? 'Fem' : 'Masc'}</div>
                          {v.suggested && <div className="text-[9px] font-bold text-emerald-400 uppercase mt-0.5">Recomendada</div>}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
        ) : availableVoices.length > 0 ? (
          <div className="p-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {availableVoices.map((v: any) => {
                const active = currentVoiceId === v.id
                return (
                  <button key={v.id} onClick={() => handleVoiceSelect(v.id)}
                    className={`p-2.5 rounded-lg border text-left transition-all ${active ? 'bg-accent/10 border-accent/40' : 'bg-white/[0.02] border-border/20 hover:bg-white/[0.04]'}`}>
                    <div className="text-xs font-semibold text-text">{v.name || v.id}</div>
                    <div className="text-[10px] text-text-muted/70 mt-0.5">{v.locale || ''}</div>
                  </button>
                )
              })}
            </div>
          </div>
        ) : (
          <div className="p-4 text-xs text-text-muted/50">Nenhuma voz disponível para este engine.</div>
        )}
      </div>

      {/* Atalhos de Voz */}
      <span className="text-xs font-bold text-text-muted uppercase tracking-wide block">Atalhos de Voz</span>
      <div className={`rounded-xl bg-white/[0.03] border border-border/40 overflow-hidden ${isLite ? 'opacity-20 pointer-events-none grayscale' : ''}`}>
        <div className="flex items-center justify-between p-4 border-b border-border/20">
          <span className="text-xs font-semibold text-text">Palavras-chave ativas: {triggers.length}</span>
          <button onClick={() => setShowAddForm(!showAddForm)}
            className="px-2.5 py-1 rounded-lg text-[10px] font-semibold bg-accent/10 text-accent border border-accent/20 hover:bg-accent/20 transition-colors">
            {showAddForm ? 'Cancelar' : 'Adicionar'}
          </button>
        </div>
        {showAddForm && (
          <div className="p-4 border-b border-border/20 space-y-2">
            <select value={newSkill} onChange={(e) => setNewSkill(e.target.value)}
              className="w-full bg-input border border-border/30 rounded-lg px-3 py-2 text-xs text-text outline-none focus:border-accent/40">
              <option value="">Selecione uma skill...</option>
              {extList.map((ext: any) => (
                <option key={ext.id} value={ext.id} disabled={!ext.enabled}>{ext.name}</option>
              ))}
            </select>
            <div className="flex gap-2">
              <input value={newKeyword} onChange={(e) => setNewKeyword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addTrigger()}
                placeholder="Palavra-chave" className="flex-1 bg-input border border-border/30 rounded-lg px-3 py-2 text-xs text-text outline-none focus:border-accent/40" />
              <button onClick={addTrigger} disabled={!newKeyword.trim() || !newSkill}
                className="px-3 py-2 rounded-lg text-[10px] font-semibold bg-accent/10 text-accent border border-accent/20 hover:bg-accent/20 transition-colors disabled:opacity-40">Adicionar</button>
            </div>
          </div>
        )}
        {triggers.length > 0 ? triggers.map((tr, i) => (
          <div key={i} className="flex items-center justify-between p-4 border-b border-border/20 last:border-none">
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-text">{tr.keyword}</div>
              <div className="text-[11px] text-text-muted font-medium mt-0.5">{tr.skillId}</div>
            </div>
            <button onClick={() => removeTrigger(tr.skillId, tr.keyword)}
              className="w-6 h-6 rounded-lg bg-white/5 hover:bg-red-500/20 flex items-center justify-center transition-colors shrink-0 ml-3">
              <svg className="w-3 h-3 text-text-muted/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>
        )) : (
          <div className="p-4 text-[11px] text-text-muted/50">Nenhum atalho configurado.</div>
        )}
      </div>
    </div>
  )
})
VoiceTab.displayName = 'VoiceTab'
