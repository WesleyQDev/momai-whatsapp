import React, { useEffect, useState, useRef } from 'react'
import { fetchExtensions, fetchSkillKeywords, updateSkillKeywords } from '../../../../services/api'
import { useI18n } from '../../../../i18n'

interface SkillEntry {
  id: string
  name: string
  description: string
  category: string
  enabled: boolean
  icon?: string
  keywords?: string[]
}

export function SkillsTab() {
  const { t } = useI18n()
  const [skills, setSkills] = useState<SkillEntry[]>([])
  const [keywordsMap, setKeywordsMap] = useState<Record<string, string[]>>({})
  const [editing, setEditing] = useState<string | null>(null)
  const [editBuffer, setEditBuffer] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const inputRef = useRef<HTMLInputElement>(null)

  async function loadData() {
    try {
      const [extensions, keywords] = await Promise.all([
        fetchExtensions(),
        fetchSkillKeywords()
      ])
      setSkills(extensions.filter((s: any) => s.category !== 'community'))
      setKeywordsMap(keywords)
    } catch (err) {
      console.error('Failed to load skills:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  async function handleSave(skillId: string) {
    // Flush any text still in the input
    const pending = inputRef.current?.value?.trim()
    const allKeywords = pending && !editBuffer.includes(pending)
      ? [...editBuffer, pending]
      : editBuffer
    const normalized = allKeywords.map((k) => k.trim()).filter((k) => k.length > 0)

    const conflictMap: Record<string, string[]> = {}
    for (const kw of normalized) {
      for (const [sid, words] of Object.entries(keywordsMap)) {
        if (sid !== skillId && words.includes(kw)) {
          if (!conflictMap[kw]) conflictMap[kw] = []
          conflictMap[kw].push(sid)
        }
      }
    }
    if (Object.keys(conflictMap).length > 0) {
      const conflicts = Object.entries(conflictMap)
        .map(([kw, ids]) => `${kw} → ${ids.join(', ')}`)
        .join('; ')
      alert(`${t('settings.skills.keywordsInUse')} ${conflicts}`)
      return
    }

    try {
      await updateSkillKeywords(skillId, normalized)
      setKeywordsMap((prev) => ({ ...prev, [skillId]: normalized }))
      setEditing(null)
    } catch (err) {
      console.error('Failed to save keywords:', err)
      alert('Erro ao salvar palavras-chave. Verifique o console para detalhes.')
    }
  }

  function startEdit(skillId: string) {
    setEditBuffer([...(keywordsMap[skillId] || [])])
    setEditing(skillId)
    if (inputRef.current) inputRef.current.value = ''
  }

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 bg-white/5 rounded-xl" />
        ))}
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-lg font-bold text-text">{t('settings.skills.title')}</h2>
        <p className="text-sm text-text-muted mt-1">{t('settings.skills.subtitle')}</p>
      </div>

      <div className="space-y-2">
        {skills.map((skill) => (
          <div
            key={skill.id}
            className="flex items-center justify-between p-4 rounded-xl bg-white/[0.03] border border-border/20"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-text text-sm">{skill.name}</span>
                {!skill.enabled && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-text-muted/10 text-text-muted uppercase tracking-wider">
                    off
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {(keywordsMap[skill.id] || []).length > 0 ? (
                  (keywordsMap[skill.id] || []).map((kw) => (
                    <span
                      key={kw}
                      className="text-xs px-2 py-0.5 rounded-full bg-accent/10 text-accent"
                    >
                      {kw}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-text-muted/60 italic">
                    {t('settings.skills.noKeywords')}
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={() => startEdit(skill.id)}
              className="ml-3 px-3 py-1.5 text-xs font-semibold rounded-lg bg-accent/10 text-accent hover:bg-accent/20 transition-colors shrink-0"
            >
              {t('settings.skills.edit')}
            </button>
          </div>
        ))}
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-zinc-900 border border-border/20 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-sm font-bold text-text mb-4">
              {t('settings.tabs.skills')}: {skills.find((s) => s.id === editing)?.name}
            </h3>
            <div className="flex flex-wrap gap-2 mb-4">
              {editBuffer.map((kw, i) => (
                <span
                  key={i}
                  className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-accent/10 text-accent"
                >
                  {kw}
                  <button
                    onClick={() => setEditBuffer(editBuffer.filter((_, j) => j !== i))}
                    className="ml-0.5 hover:text-red-400 transition-colors"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2 mb-4">
              <input
                ref={inputRef}
                type="text"
                className="flex-1 px-3 py-1.5 text-sm rounded-lg bg-white/5 border border-border/40 text-text placeholder:text-text-muted/40 outline-none focus:border-accent/50 transition-colors"
                placeholder={t('settings.skills.addKeyword')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const val = (e.target as HTMLInputElement).value.trim()
                    if (val && !editBuffer.includes(val)) {
                      setEditBuffer([...editBuffer, val])
                    }
                    ;(e.target as HTMLInputElement).value = ''
                  }
                }}
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setEditing(null); if (inputRef.current) inputRef.current.value = '' }}
                className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-white/5 text-text-muted hover:bg-white/10 transition-colors"
              >
                {t('settings.skills.cancel')}
              </button>
              <button
                onClick={() => handleSave(editing)}
                className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-accent text-white hover:bg-accent/90 transition-colors"
              >
                {t('settings.skills.save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
