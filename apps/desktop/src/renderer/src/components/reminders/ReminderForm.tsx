import { useState } from 'react'
import {
  CalendarIcon,
  ClockIcon,
  ArrowPathIcon,
  ChevronDownIcon,
  XMarkIcon
} from '@heroicons/react/24/outline'
import { CheckCircleIcon as CheckCircleSolid } from '@heroicons/react/24/solid'
import { useI18n } from '../../i18n'

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
}

interface ReminderFormProps {
  initialData?: Partial<ReminderFormData>
  onSubmit: (data: ReminderFormData) => Promise<void>
  onCancel: () => void
  isSaving?: boolean
  variant?: 'modal' | 'inline'
}

const getTodayISO = () => new Date().toISOString().split('T')[0]
const getInOneHourTime = () => {
  const d = new Date(Date.now() + 3600000)
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
    newTime: initialData?.newTime || getInOneHourTime(),
    repeat_interval: initialData?.repeat_interval || null,
    repeat_value: initialData?.repeat_value || 1,
    id: initialData?.id
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.title.trim() || isSaving) return

    // Manual local time construction string to avoid offset issues
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
      ? "relative w-full max-w-md bg-card border border-white/10 rounded-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
      : "w-full bg-white/[0.03] border border-white/10 p-4 rounded-xl animate-in zoom-in-95 duration-200 backdrop-blur-xl shadow-2xl"

  const paddingClasses = variant === 'modal' ? "p-6" : ""

  return (
    <form onSubmit={handleSubmit} className={containerClasses}>
      <div className={`${paddingClasses} space-y-4`}>
        <div className="space-y-2">
          <div className="flex items-start justify-between">
            <input
              required
              autoFocus
              type="text"
              placeholder={t('reminders.modal.fields.titlePlaceholder') || "Título do lembrete"}
              className={`w-full bg-transparent border-none font-bold p-0 placeholder:text-text-muted/20 outline-none focus:ring-0 text-text ${variant === 'modal' ? 'text-xl' : 'text-sm'}`}
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            />
            {variant === 'inline' && (
              <button
                type="button"
                onClick={onCancel}
                className="p-1 -mr-1 text-text/20 hover:text-text/50 transition-colors"
                title={t('common.cancel') || "Cancelar"}
              >
                <XMarkIcon className="w-4 h-4" />
              </button>
            )}
          </div>
          <textarea
            placeholder={t('reminders.modal.fields.detailsLabel') || "Notas..."}
            className={`w-full bg-transparent border-none p-0 placeholder:text-text-muted/20 outline-none focus:ring-0 text-text/60 resize-none ${variant === 'modal' ? 'text-xs min-h-[60px]' : 'text-[10px] min-h-[30px]'}`}
            value={formData.content}
            onChange={(e) => setFormData({ ...formData, content: e.target.value })}
          />
        </div>

        <div className={`flex flex-wrap items-center gap-2 ${variant === 'modal' ? 'pt-4 border-t border-white/5' : ''}`}>
          {/* Date Picker */}
          <div 
            className="flex items-center gap-1.5 px-3 py-2 bg-text/5 rounded-lg border border-white/5 hover:border-accent/30 transition-colors cursor-pointer"
            onClick={handlePicker}
          >
            <CalendarIcon className="w-4 h-4 text-accent" />
            <input
              required
              type="date"
              className="bg-transparent border-none text-[11px] font-black uppercase tracking-tight text-text outline-none p-0 focus:ring-0 w-24 cursor-pointer [&::-webkit-calendar-picker-indicator]:hidden [color-scheme:dark]"
              value={formData.newDate}
              onChange={(e) => setFormData({ ...formData, newDate: e.target.value })}
            />
          </div>
          
          {/* Time Picker */}
          <div 
            className="flex items-center gap-1.5 px-3 py-2 bg-text/5 rounded-lg border border-white/5 hover:border-accent/30 transition-colors cursor-pointer"
            onClick={handlePicker}
          >
            <ClockIcon className="w-4 h-4 text-accent" />
            <input
              required
              type="time"
              className="bg-transparent border-none text-[11px] font-black uppercase tracking-tight text-text outline-none p-0 focus:ring-0 w-16 cursor-pointer [&::-webkit-calendar-picker-indicator]:hidden [color-scheme:dark]"
              value={formData.newTime}
              onChange={(e) => setFormData({ ...formData, newTime: e.target.value })}
            />
          </div>

          {/* Custom Repetition Dropdown */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsRepeatMenuOpen(!isRepeatMenuOpen)}
                className={`flex items-center gap-2 px-3 py-2 bg-text/5 rounded-lg border transition-all hover:border-accent/30 ${isRepeatMenuOpen ? 'border-accent/50 ring-1 ring-accent/20' : 'border-white/5'}`}
              >
                <ArrowPathIcon className={`w-4 h-4 ${formData.repeat_interval ? 'text-emerald-500' : 'text-text-muted/40'}`} />
                <span className="text-[11px] font-black uppercase tracking-tight text-text/80 min-w-[70px] text-left">
                  {formData.repeat_interval 
                      ? t(`reminders.repeat.${formData.repeat_interval}`) || formData.repeat_interval 
                      : t('reminders.repeat.none') || 'Sem repetição'}
                </span>
                <ChevronDownIcon className={`w-3 h-3 text-text-muted/40 transition-transform ${isRepeatMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              {isRepeatMenuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setIsRepeatMenuOpen(false)}></div>
                  <div className={`absolute ${variant === 'modal' ? 'bottom-full mb-2' : 'bottom-full mb-2'} left-0 w-48 bg-card border border-white/10 rounded-xl shadow-2xl py-2 z-20 animate-in fade-in slide-in-from-bottom-1 duration-200 backdrop-blur-xl`}>
                    {[
                      { id: null, label: t('reminders.repeat.none') || 'Sem repetição' },
                      { id: 'minutes', label: t('reminders.repeat.minutes') || 'Minutos' },
                      { id: 'hours', label: t('reminders.repeat.hours') || 'Horas' },
                      { id: 'days', label: t('reminders.repeat.days') || 'Dias' },
                      { id: 'weeks', label: t('reminders.repeat.weeks') || 'Semanas' },
                      { id: 'months', label: t('reminders.repeat.months') || 'Meses' }
                    ].map((opt) => (
                      <button
                        key={opt.id || 'none'}
                        type="button"
                        className={`w-full px-4 py-2 text-left text-[11px] font-black uppercase tracking-widest flex items-center justify-between transition-colors ${formData.repeat_interval === opt.id ? 'text-accent bg-accent/5' : 'text-text-muted hover:text-text hover:bg-white/5'}`}
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
                          <CheckCircleSolid className="w-3.5 h-3.5" />
                        )}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {formData.repeat_interval && (
              <div className="flex items-center gap-2 px-3 py-2 bg-text/5 rounded-lg border border-white/5 animate-in fade-in slide-in-from-left-2 duration-300">
                <span className="text-[9px] font-black uppercase tracking-widest text-text-muted/40">
                  {t('reminders.interval.label') || "A cada"}
                </span>
                <input
                  type="number"
                  min="1"
                  max="999"
                  className="w-8 bg-transparent border-none p-0 text-[11px] font-black text-accent outline-none focus:ring-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none text-center"
                  value={formData.repeat_value}
                  onChange={(e) => setFormData({...formData, repeat_value: parseInt(e.target.value) || 1})}
                />
              </div>
            )}

          </div>
        </div>
      </div>

      <div className={`${variant === 'modal' ? 'px-6 py-4 bg-white/5 border-t border-white/5 flex justify-end' : 'mt-4 flex'} gap-3`}>
        <button
          type="button"
          onClick={onCancel}
          className={`${variant === 'modal' ? 'px-5 py-2.5 flex-none' : 'flex-1 py-1.5'} text-[11px] font-black text-text-muted hover:text-text uppercase tracking-widest transition-all rounded-lg hover:bg-white/5 border border-transparent ${variant === 'inline' ? 'border-white/5' : ''}`}
        >
          {t('common.cancel') || 'Cancelar'}
        </button>
        <button
          type="submit"
          disabled={isSaving || !formData.title.trim()}
          className={`${variant === 'modal' ? 'px-8 py-2.5 flex-none' : 'flex-[2] py-1.5'} bg-accent text-white rounded-xl text-[11px] font-black uppercase tracking-[0.2em] hover:brightness-110 shadow-xl shadow-accent/20 transition-all border border-white/10 active:scale-[0.98] disabled:opacity-50`}
        >
          {isSaving ? '...' : (t('common.save') || 'Salvar')}
        </button>
      </div>
    </form>
  )
}
