import { useState } from 'react'
import {
  CalendarIcon,
  ClockIcon,
  ArrowPathIcon,
  ChevronDownIcon,
  XMarkIcon,
  PlusIcon,
  SpeakerWaveIcon
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
    voice_response: initialData?.voice_response !== undefined ? initialData.voice_response : true
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

  const isModal = variant === 'modal'

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div className="space-y-3">
        {/* Title */}
        <input
          required
          autoFocus
          type="text"
          placeholder="O que devo lembrar?"
          className="w-full bg-transparent border-b border-white/10 pb-2 placeholder:text-text-muted/50 outline-none focus:border-accent/50 text-text text-[15px] font-medium transition-colors"
          value={formData.title}
          onChange={(e) => setFormData({ ...formData, title: e.target.value })}
        />

        {/* Type Selector - Moved to top */}
        <div className="flex items-center gap-2.5">
          <span className="text-[10px] text-text-muted/60 uppercase tracking-wider shrink-0">Tipo</span>
          <div className="flex items-center bg-white/[0.03] rounded-lg p-0.5 flex-1">
            <button
              type="button"
              onClick={() => setFormData({ ...formData, action_type: 'reminder' })}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs transition-all ${formData.action_type === 'reminder' ? 'bg-accent/15 text-accent' : 'text-text-muted/60 hover:text-text-muted'}`}
            >
              <SpeakerWaveIcon className="w-3 h-3" />
              Notificação
            </button>
            <button
              type="button"
              onClick={() => setFormData({ ...formData, action_type: 'cron' })}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs transition-all ${formData.action_type === 'cron' ? 'bg-indigo-500/15 text-indigo-400' : 'text-text-muted/60 hover:text-text-muted'}`}
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 002 2v12a2 2 0 002 2z" />
              </svg>
              Ação
            </button>
          </div>
        </div>

        {/* Date & Time */}
        <div className="flex items-center gap-3">
          <div
            className="flex items-center gap-2 flex-1 cursor-pointer group"
            onClick={handlePicker}
          >
            <CalendarIcon className="w-4 h-4 text-text-muted/60 group-hover:text-accent transition-colors shrink-0" />
            <div className="flex flex-col min-w-0">
              <span className="text-[9px] text-text-muted/60 uppercase tracking-wider leading-none mb-0.5">Quando</span>
              <input
                required
                type="date"
                className="bg-transparent border-none text-sm text-text/90 outline-none p-0 focus:ring-0 cursor-pointer [&::-webkit-calendar-picker-indicator]:hidden [color-scheme:dark]"
                value={formData.newDate}
                onChange={(e) => setFormData({ ...formData, newDate: e.target.value })}
              />
            </div>
          </div>

          <div
            className="flex items-center gap-2 flex-1 cursor-pointer group"
            onClick={handlePicker}
          >
            <ClockIcon className="w-4 h-4 text-text-muted/60 group-hover:text-accent transition-colors shrink-0" />
            <div className="flex flex-col min-w-0">
              <span className="text-[9px] text-text-muted/60 uppercase tracking-wider leading-none mb-0.5">Hora</span>
              <input
                required
                type="time"
                className="bg-transparent border-none text-sm text-text/90 outline-none p-0 focus:ring-0 cursor-pointer [&::-webkit-calendar-picker-indicator]:hidden [color-scheme:dark]"
                value={formData.newTime}
                onChange={(e) => setFormData({ ...formData, newTime: e.target.value })}
              />
            </div>
          </div>
        </div>

        {/* Repeat */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setIsRepeatMenuOpen(!isRepeatMenuOpen)}
            className="flex items-center gap-2 text-sm text-text-muted/70 hover:text-text-muted transition-colors w-full"
          >
            <ArrowPathIcon className={`w-3.5 h-3.5 ${formData.repeat_interval ? 'text-emerald-500' : ''}`} />
            <span className="truncate">
              {formData.repeat_interval
                ? `A cada ${formData.repeat_value} ${t(`reminders.repeat.${formData.repeat_interval}`) || formData.repeat_interval}`
                : 'Sem repetição'}
            </span>
            <ChevronDownIcon className={`w-3 h-3 ml-auto shrink-0 transition-transform ${isRepeatMenuOpen ? 'rotate-180' : ''}`} />
          </button>

          {isRepeatMenuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setIsRepeatMenuOpen(false)} />
              <div className="absolute top-full mt-1 left-0 w-full bg-zinc-900 border border-white/10 rounded-xl shadow-2xl py-1 z-20 animate-in fade-in slide-in-from-top-1">
                {[
                  { id: null, label: 'Sem repetição' },
                  { id: 'minutes', label: 'Minutos' },
                  { id: 'hours', label: 'Horas' },
                  { id: 'days', label: 'Dias' },
                  { id: 'weeks', label: 'Semanas' },
                  { id: 'months', label: 'Meses' }
                ].map((opt) => (
                  <button
                    key={opt.id || 'none'}
                    type="button"
                    className={`w-full px-3 py-2 text-left text-sm flex items-center justify-between transition-colors ${formData.repeat_interval === opt.id ? 'text-accent bg-accent/5' : 'text-text-muted hover:text-text hover:bg-white/5'}`}
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
                      <CheckCircleSolid className="w-4 h-4" />
                    )}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Note */}
        {!showNoteSection ? (
          <button
            type="button"
            onClick={handleToggleNote}
            disabled={isCreatingNote}
            className="flex items-center gap-1.5 text-xs text-text-muted/60 hover:text-accent transition-colors"
          >
            <PlusIcon className={`w-3.5 h-3.5 ${isCreatingNote ? 'animate-spin' : ''}`} />
            {isCreatingNote ? 'Criando...' : 'Adicionar nota'}
          </button>
        ) : (
          <div className="space-y-2 animate-in fade-in">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <DocumentTextIcon className="w-3.5 h-3.5 text-text-muted/60" />
                <span className="text-xs text-text-muted/70">Nota</span>
              </div>
              <button type="button" onClick={() => setShowNoteSection(false)} className="text-text-muted/50 hover:text-text-muted">
                <XMarkIcon className="w-3.5 h-3.5" />
              </button>
            </div>
            <textarea
              placeholder="Detalhes..."
              className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2.5 placeholder:text-text-muted/40 outline-none focus:ring-1 focus:ring-accent/20 text-text/90 resize-none text-sm min-h-[60px]"
              value={formData.content}
              onChange={(e) => setFormData({ ...formData, content: e.target.value })}
            />
          </div>
        )}
      </div>

      {/* Voice toggle */}
      <div className="flex items-center justify-between py-2">
        <span className="text-xs text-text-muted/70">Ler em voz alta</span>
        <button
          type="button"
          onClick={() => setFormData({ ...formData, voice_response: !formData.voice_response })}
          className={`relative inline-flex h-5 w-9 cursor-pointer rounded-full transition-colors ${formData.voice_response ? 'bg-accent' : 'bg-white/10'}`}
        >
          <span className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${formData.voice_response ? 'translate-x-4' : ''}`} />
        </button>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 mt-4 pt-3 border-t border-white/5">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-2 text-xs text-text-muted/70 hover:text-text-muted rounded-lg hover:bg-white/5 transition-colors"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={isSaving || !formData.title.trim()}
          className="flex-1 bg-accent text-white rounded-xl text-xs font-medium py-2 hover:brightness-110 transition-all active:scale-[0.98] disabled:opacity-40"
        >
          {isSaving ? 'Salvando...' : 'Salvar'}
        </button>
      </div>
    </form>
  )
}
