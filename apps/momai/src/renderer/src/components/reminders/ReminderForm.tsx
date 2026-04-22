import { useState, useEffect } from 'react'
import {
  CalendarIcon,
  ClockIcon,
  ArrowPathIcon,
  ChevronDownIcon,
  XMarkIcon,
  PlusIcon,
  SpeakerWaveIcon,
  CommandLineIcon
} from '@heroicons/react/24/outline'
import { CheckCircleIcon as CheckCircleSolid } from '@heroicons/react/24/solid'
import { useI18n } from '../../i18n'
import { createMemoryNote } from '../../services/api'
import { DocumentTextIcon } from '@heroicons/react/24/outline'

export type RepeatInterval = 'minutes' | 'hours' | 'days' | 'weeks' | 'months' | null

export interface ReminderFormData {
  id?: number
  title: string
  content: string
  scheduled_time: string
  newDate: string
  newTime: string
  repeat_interval: RepeatInterval
  repeat_value: number
  note_id?: string | null
  action_type: 'reminder' | 'cron'
  voice_response: boolean
}

interface ReminderFormProps {
  initialData?: Partial<ReminderFormData>
  onSubmit: (data: ReminderFormData) => Promise<void>
  onCancel: () => void
  isSaving?: boolean
  variant?: 'modal' | 'inline'
}

const getTodayISO = () => new Date().toISOString().split('T')[0]
const getInOneMinuteTime = () => {
  const d = new Date(Date.now() + 60000)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export default function ReminderForm({
  initialData,
  onSubmit,
  onCancel,
  isSaving = false,
  variant = 'modal'
}: ReminderFormProps) {
  const { t } = useI18n()
  const [isRepeatMenuOpen, setIsRepeatMenuOpen] = useState(false)
  const [aiTier, setAiTier] = useState<string | null>(
    () => localStorage.getItem('momai_ai_tier') || 'pro'
  )

  useEffect(() => {
    const handleSync = (e: any) => {
      if (e.detail?.ai_tier) {
        setAiTier(e.detail.ai_tier)
      }
    }
    window.addEventListener('momai_settings_sync', handleSync as any)
    return () => window.removeEventListener('momai_settings_sync', handleSync as any)
  }, [])

  const [formData, setFormData] = useState<ReminderFormData>({
    title: initialData?.title || '',
    content: initialData?.content || '',
    scheduled_time: initialData?.scheduled_time || '',
    newDate: initialData?.newDate || getTodayISO(),
    newTime: initialData?.newTime || getInOneMinuteTime(),
    repeat_interval: initialData?.repeat_interval || null,
    repeat_value: initialData?.repeat_value || 1,
    id: initialData?.id,
    note_id: initialData?.note_id,
    action_type: initialData?.action_type || 'reminder',
    voice_response: aiTier === 'lite' 
      ? false 
      : (initialData?.voice_response !== undefined ? initialData.voice_response : true)
  })
  const [isCreatingNote, setIsCreatingNote] = useState(false)
  const [showNoteSection, setShowNoteSection] = useState(!!initialData?.note_id)

  const handleToggleNote = async () => {
    if (formData.note_id || isCreatingNote) {
      setShowNoteSection(true)
      return
    }

    try {
      setIsCreatingNote(true)
      const note = await createMemoryNote(
        formData.title || t('reminders.newReminder') || 'Novo Lembrete',
        formData.content || '',
        'Lembretes'
      )
      setFormData((prev) => ({ ...prev, note_id: note.id }))
      setShowNoteSection(true)
    } catch (err) {
      console.error('Failed to create linked note', err)
    } finally {
      setIsCreatingNote(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.title.trim() || isSaving) return

    const scheduledTimeStr = `${formData.newDate}T${formData.newTime}:00`

    await onSubmit({
      ...formData,
      scheduled_time: scheduledTimeStr
    })
  }

  const handlePicker = (e: React.MouseEvent) => {
    const input = e.currentTarget.querySelector('input')
    if (input) {
      try {
        input.showPicker()
      } catch (err) {
        input.focus()
      }
    }
  }

  const containerClasses = 
    variant === 'modal'
      ? "relative w-full max-w-sm bg-card border border-white/10 rounded-2xl shadow-2xl animate-in zoom-in-95 duration-200"
      : "w-full bg-white/[0.03] border border-white/10 p-3 rounded-xl animate-in zoom-in-95 duration-200 backdrop-blur-xl shadow-2xl"

  const paddingClasses = variant === 'modal' ? "p-5" : ""

  return (
    <form onSubmit={handleSubmit} className={containerClasses}>
      <div className={`${paddingClasses} space-y-3`}>
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <input
              required
              autoFocus
              type="text"
              placeholder={t('reminders.modal.fields.titlePlaceholder') || "Título"}
              className={`w-full bg-transparent border-none font-bold p-0 placeholder:text-text-muted/20 outline-none focus:ring-0 text-text ${variant === 'modal' ? 'text-lg' : 'text-sm'}`}
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            />
            {variant === 'inline' && (
              <button
                type="button"
                onClick={onCancel}
                className="p-1 text-text/20 hover:text-text/50 transition-colors"
              >
                <XMarkIcon className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {/* Date Picker */}
          <div 
            className="flex items-center gap-2 px-3 py-1.5 bg-white/[0.03] rounded-lg border border-white/5 hover:border-accent/30 transition-colors cursor-pointer group"
            onClick={handlePicker}
          >
            <CalendarIcon className="w-3.5 h-3.5 text-accent opacity-70 group-hover:opacity-100" />
            <input
              required
              type="date"
              className="bg-transparent border-none text-[10px] font-bold uppercase tracking-wider text-text outline-none p-0 focus:ring-0 w-full cursor-pointer [&::-webkit-calendar-picker-indicator]:hidden [color-scheme:dark]"
              value={formData.newDate}
              onChange={(e) => setFormData({ ...formData, newDate: e.target.value })}
            />
          </div>
          
          {/* Time Picker */}
          <div 
            className="flex items-center gap-2 px-3 py-1.5 bg-white/[0.03] rounded-lg border border-white/5 hover:border-accent/30 transition-colors cursor-pointer group"
            onClick={handlePicker}
          >
            <ClockIcon className="w-3.5 h-3.5 text-accent opacity-70 group-hover:opacity-100" />
            <input
              required
              type="time"
              className="bg-transparent border-none text-[10px] font-bold uppercase tracking-wider text-text outline-none p-0 focus:ring-0 w-full cursor-pointer [&::-webkit-calendar-picker-indicator]:hidden [color-scheme:dark]"
              value={formData.newTime}
              onChange={(e) => setFormData({ ...formData, newTime: e.target.value })}
            />
          </div>
        </div>

        {/* Repeat Toggle */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <button
              type="button"
              onClick={() => setIsRepeatMenuOpen(!isRepeatMenuOpen)}
              className={`w-full flex items-center justify-between gap-2 px-3 py-1.5 bg-white/[0.03] rounded-lg border transition-all hover:border-accent/30 ${isRepeatMenuOpen ? 'border-accent/50 ring-1 ring-accent/20' : 'border-white/5'}`}
            >
              <div className="flex items-center gap-2">
                <ArrowPathIcon className={`w-3.5 h-3.5 ${formData.repeat_interval ? 'text-emerald-500' : 'text-text-muted/40'}`} />
                <span className="text-[10px] font-bold uppercase tracking-wider text-text/80">
                  {formData.repeat_interval 
                      ? t(`reminders.repeat.${formData.repeat_interval}`) || formData.repeat_interval 
                      : t('reminders.repeat.none') || 'Não repetir'}
                </span>
              </div>
              <ChevronDownIcon className={`w-3 h-3 text-text-muted/40 transition-transform ${isRepeatMenuOpen ? 'rotate-180' : ''}`} />
            </button>

            {isRepeatMenuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setIsRepeatMenuOpen(false)}></div>
                <div className="absolute top-full mt-1 left-0 w-full bg-card/95 border border-white/10 rounded-xl shadow-2xl py-1.5 z-20 animate-in fade-in slide-in-from-top-1 duration-200 backdrop-blur-xl max-h-40 overflow-y-auto custom-scrollbar">
                  {[
                    { id: null, label: t('reminders.repeat.none') || 'Não repetir' },
                    { id: 'minutes', label: t('reminders.repeat.minutes') || 'Minutos' },
                    { id: 'hours', label: t('reminders.repeat.hours') || 'Horas' },
                    { id: 'days', label: t('reminders.repeat.days') || 'Dias' },
                    { id: 'weeks', label: t('reminders.repeat.weeks') || 'Semanas' },
                    { id: 'months', label: t('reminders.repeat.months') || 'Meses' }
                  ].map((opt) => (
                    <button
                      key={opt.id || 'none'}
                      type="button"
                      className={`w-full px-4 py-1.5 text-left text-[10px] font-bold uppercase tracking-widest flex items-center justify-between transition-colors ${formData.repeat_interval === opt.id ? 'text-accent bg-accent/5' : 'text-text-muted hover:text-text hover:bg-white/5'}`}
                      onClick={() => {
                        setFormData({
                          ...formData,
                          repeat_interval: opt.id as any,
                          repeat_value: opt.id ? formData.repeat_value || 1 : 1
                        })
                        setIsRepeatMenuOpen(false)
                      }}
                    >
                      <span>{opt.label}</span>
                      {formData.repeat_interval === opt.id && (
                        <CheckCircleSolid className="w-3 h-3" />
                      )}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {formData.repeat_interval && (
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-accent/10 rounded-lg border border-accent/20 animate-in fade-in slide-in-from-left-2 duration-300">
              <input
                type="number"
                min="1"
                max="99"
                className="w-8 bg-transparent border-none p-0 text-[10px] font-bold text-accent outline-none focus:ring-0 text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                value={formData.repeat_value}
                onFocus={(e) => e.currentTarget.select()}
                onChange={(e) => setFormData({...formData, repeat_value: parseInt(e.target.value) || 1})}
              />
            </div>
          )}
        </div>

        {/* Note Area */}
        {showNoteSection ? (
          <div className="space-y-1.5 animate-in fade-in slide-in-from-top-1 duration-300">
             <div className="flex items-center gap-1.5 px-1 opacity-40">
                <DocumentTextIcon className="w-3 h-3" />
                <span className="text-[9px] font-bold uppercase tracking-widest">{t('reminders.modal.fields.attachedNoteActive') || 'Anotação'}</span>
             </div>
             <textarea
              placeholder={t('reminders.modal.fields.detailsLabel') || "Escreva os detalhes aqui..."}
              className={`w-full bg-white/[0.03] border border-white/5 rounded-lg p-3 placeholder:text-text-muted/20 outline-none focus:ring-1 focus:ring-accent/20 text-text/80 resize-none text-[11px] min-h-[80px] transition-all`}
              value={formData.content}
              onChange={(e) => setFormData({ ...formData, content: e.target.value })}
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={handleToggleNote}
            disabled={isCreatingNote}
            className="w-full flex items-center justify-center gap-2 py-2 bg-white/[0.03] border border-dashed border-white/10 rounded-lg text-text-muted/60 hover:text-accent hover:border-accent/30 hover:bg-accent/5 transition-all text-[10px] font-bold uppercase tracking-widest group"
          >
            <PlusIcon className={`w-3.5 h-3.5 transition-transform group-hover:rotate-90 ${isCreatingNote ? 'animate-spin' : ''}`} />
            {isCreatingNote ? '...' : (t('reminders.modal.fields.attachNote') || 'Adicionar Anotação')}
          </button>
        )}

        {/* Action Type & Voice Toggle */}
        <div className="flex flex-col gap-2 pt-1 border-t border-white/5 mt-1">
           <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setFormData({ ...formData, action_type: 'reminder' })}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg border transition-all text-[10px] font-bold uppercase tracking-widest ${formData.action_type === 'reminder' ? 'bg-accent/10 border-accent/30 text-accent' : 'bg-white/[0.03] border-white/5 text-text-muted hover:text-text/80'}`}
              >
                <SpeakerWaveIcon className="w-3.5 h-3.5" />
                Lembrete
              </button>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, action_type: 'cron' })}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg border transition-all text-[10px] font-bold uppercase tracking-widest ${formData.action_type === 'cron' ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400' : 'bg-white/[0.03] border-white/5 text-text-muted hover:text-text/80'}`}
              >
                <CommandLineIcon className="w-3.5 h-3.5" />
                Agendador
              </button>
           </div>

           {aiTier !== 'lite' && (
             <div className="flex items-center justify-between px-3 py-2 bg-white/[0.03] rounded-lg border border-white/5 animate-in slide-in-from-top-1 duration-200">
               <div className="flex items-center gap-2">
                  <SpeakerWaveIcon className={`w-3.5 h-3.5 ${formData.voice_response ? 'text-accent' : 'text-text-muted/40'}`} />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-text/80">
                    {formData.action_type === 'cron' 
                      ? (t('reminders.modal.fields.voicePrompt') || 'Ouvir voz do prompt') 
                      : (t('reminders.modal.fields.voiceReminder') || 'Ouvir voz do lembrete')}
                  </span>
               </div>
               <button
                 type="button"
                 onClick={() => setFormData({ ...formData, voice_response: !formData.voice_response })}
                 className={`relative inline-flex h-4 w-8 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${formData.voice_response ? 'bg-accent' : 'bg-white/10'}`}
               >
                 <span
                   className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${formData.voice_response ? 'translate-x-4' : 'translate-x-0'}`}
                 />
               </button>
             </div>
           )}
        </div>
      </div>

      <div className={`${variant === 'modal' ? 'px-5 py-4 bg-white/[0.02] border-t border-white/5 flex rounded-b-2xl' : 'mt-4 flex'} gap-2`}>
        <button
          type="button"
          onClick={onCancel}
          className={`${variant === 'modal' ? 'flex-1 py-2' : 'flex-none px-4'} text-[10px] font-bold text-text-muted hover:text-text uppercase tracking-widest transition-all rounded-xl hover:bg-white/5 border border-transparent`}
        >
          {t('common.cancel') || 'Cancelar'}
        </button>
        <button
          type="submit"
          disabled={isSaving || !formData.title.trim()}
          className={`${variant === 'modal' ? 'flex-[2] py-2' : 'flex-1 py-1.5'} bg-accent text-white rounded-xl text-[10px] font-bold uppercase tracking-widest hover:brightness-110 shadow-lg shadow-accent/10 transition-all active:scale-[0.98] disabled:opacity-50`}
        >
          {isSaving ? '...' : (t('common.save') || 'Salvar')}
        </button>
      </div>
    </form>
  )
}
