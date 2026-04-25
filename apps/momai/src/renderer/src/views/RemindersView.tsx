import { useState, useEffect, useMemo } from 'react'
import {
  PlusIcon,
  TrashIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CalendarIcon,
  ClockIcon,
  ArrowPathIcon,
  PencilSquareIcon,
  CheckCircleIcon,
  SpeakerWaveIcon,
  CommandLineIcon
} from '@heroicons/react/24/outline'
import { CheckCircleIcon as CheckCircleSolid } from '@heroicons/react/24/solid'
import ReminderForm, { ReminderFormData } from '../components/reminders/ReminderForm'
import {
  fetchReminders as fetchRemindersApi,
  createReminder,
  updateReminder,
  deleteReminder,
  type Reminder
} from '../services/api'
import { useI18n } from '../i18n'

type RepeatInterval = 'minutes' | 'hours' | 'days' | 'weeks' | 'months' | null

interface LegacyReminderFormData {
  id?: number
  title: string
  content: string
  scheduled_time: string
  newDate: string
  newTime: string
  repeat_interval: RepeatInterval
  repeat_value: number
  note_id?: string | null
  action_type?: 'reminder' | 'cron'
  voice_response?: boolean
}

// --- Helper Functions ---

const getTodayISO = () => new Date().toISOString().split('T')[0]
const getInOneMinuteTime = () => {
  const d = new Date(Date.now() + 60000)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const isOverdue = (date: Date) => {
  const now = new Date()
  return date < now
}

const isToday = (date: Date) => {
  const now = new Date()
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  )
}

const isTomorrow = (date: Date) => {
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  return (
    date.getFullYear() === tomorrow.getFullYear() &&
    date.getMonth() === tomorrow.getMonth() &&
    date.getDate() === tomorrow.getDate()
  )
}

const isFuture = (date: Date) => {
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(23, 59, 59, 999)
  return date > tomorrow
}

// --- Main Component ---

export default function RemindersView() {
  const { t, formatDate, formatTime } = useI18n()
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [expandedSections, setExpandedSections] = useState({
    overdue: true,
    today: true,
    tomorrow: true,
    upcoming: true
  })

  const [formData, setFormData] = useState<LegacyReminderFormData>({
    title: '',
    content: '',
    scheduled_time: '',
    newDate: getTodayISO(),
    newTime: getInOneMinuteTime(),
    repeat_interval: null,
    repeat_value: 1,
    action_type: 'reminder',
    voice_response: true
  })

  const fetchReminders = async () => {
    try {
      const data = await fetchRemindersApi()
      if (Array.isArray(data)) setReminders(data)
    } catch (error) {
      console.error('Erro ao buscar lembretes:', error)
    }
  }

  useEffect(() => {
    fetchReminders()
    const handleUpdate = () => fetchReminders()
    window.addEventListener('momai_reminders_updated', handleUpdate)
    return () => window.removeEventListener('momai_reminders_updated', handleUpdate)
  }, [])

  const groupedReminders = useMemo(() => {
    const sorted = [...reminders].sort(
      (a, b) => new Date(a.scheduled_time).getTime() - new Date(b.scheduled_time).getTime()
    )

    return {
      overdue: sorted.filter((r) => isOverdue(new Date(r.scheduled_time))),
      today: sorted.filter(
        (r) => isToday(new Date(r.scheduled_time)) && !isOverdue(new Date(r.scheduled_time))
      ),
      tomorrow: sorted.filter((r) => isTomorrow(new Date(r.scheduled_time))),
      upcoming: sorted.filter((r) => isFuture(new Date(r.scheduled_time)))
    }
  }, [reminders])

  const handleOpenCreate = () => {
    setFormData({
      title: '',
      content: '',
      scheduled_time: '',
      newDate: getTodayISO(),
      newTime: getInOneMinuteTime(),
      repeat_interval: null,
      repeat_value: 1,
      action_type: 'reminder',
      voice_response: true
    })
    setIsModalOpen(true)
  }

  const handleOpenEdit = (reminder: Reminder) => {
    const d = new Date(reminder.scheduled_time)
    const dateStr = d.toISOString().split('T')[0]
    const timeStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

    setFormData({
      id: reminder.id,
      title: reminder.title,
      content: reminder.content || '',
      scheduled_time: reminder.scheduled_time,
      newDate: dateStr,
      newTime: timeStr,
      repeat_interval: reminder.repeat_interval as RepeatInterval,
      repeat_value: reminder.repeat_value || 1,
      action_type: (reminder.action_type as any) || 'reminder',
      voice_response: reminder.voice_response !== undefined ? reminder.voice_response : true
    })
    setIsModalOpen(true)
  }

  const handleDelete = async (id: number) => {
    await deleteReminder(id)
    setReminders((prev) => prev.filter((r) => r.id !== id))
  }

  const handleSubmit = async (data: ReminderFormData) => {
    const payload = {
      title: data.title,
      content: data.content,
      scheduled_time: data.scheduled_time,
      repeat_interval: data.repeat_interval,
      repeat_value: data.repeat_interval ? data.repeat_value : null,
      action_type: data.action_type || 'reminder',
      voice_response: data.voice_response
    }

    data.id ? await updateReminder(data.id, payload) : await createReminder(payload as any)
    setIsModalOpen(false)
    fetchReminders()
  }

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }))
  }

  const TaskItem = ({ r }: { r: Reminder }) => {
    const date = new Date(r.scheduled_time)
    const overdue = isOverdue(date)

    return (
      <div className="group flex items-start gap-3 p-3 hover:bg-white/5 border-b border-border/5 transition-all">
        <button
          onClick={() => handleDelete(r.id)}
          className="mt-0.5 shrink-0 relative flex items-center justify-center w-5 h-5 rounded-full border border-text/10 group-hover:border-accent/40 transition-all hover:scale-110"
        >
          <CheckCircleIcon className="w-4 h-4 text-transparent" />
          <CheckCircleSolid className="absolute inset-0 w-[18px] h-[18px] m-auto text-accent opacity-0 scale-50 group-hover:opacity-20 group-hover:scale-90 active:opacity-100 transition-all" />
        </button>

        <div className="flex-1 min-w-0" onClick={() => handleOpenEdit(r)}>
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-[13px] font-medium text-text group-hover:text-accent transition-colors cursor-pointer truncate">
              {r.title}
            </h3>
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handleOpenEdit(r)
                }}
                className="p-1 hover:bg-accent/10 rounded text-text-muted hover:text-accent transition-all"
              >
                <PencilSquareIcon className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handleDelete(r.id)
                }}
                className="p-1 hover:bg-rose-500/10 rounded text-text-muted hover:text-rose-500 transition-all"
              >
                <TrashIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {r.content && (
            <p className="text-[11px] text-text-muted/60 mt-0.5 line-clamp-1 leading-relaxed">
              {r.content}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3 mt-1.5">
            <div
              className={`flex items-center gap-1 text-[10px] font-bold ${overdue ? 'text-rose-500' : 'text-text-muted/40'}`}
            >
              <CalendarIcon className="w-3 h-3" />
              <span>{formatDate(date, { day: 'numeric', month: 'short' })}</span>
              <span className="mx-0.5 opacity-30">•</span>
              <ClockIcon className="w-3 h-3" />
              <span>{formatTime(date, { hour: '2-digit', minute: '2-digit' })}</span>
            </div>

            {r.repeat_interval && (
              <div className="flex items-center gap-1 text-[10px] uppercase font-black tracking-widest text-emerald-500/70">
                <ArrowPathIcon className="w-3 h-3" />
                <span>
                  R:{r.repeat_value} {r.repeat_interval}
                </span>
              </div>
            )}

            <div
              className={`flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest ${r.action_type === 'cron' ? 'text-indigo-400' : 'text-accent/60'}`}
            >
              {r.action_type === 'cron' ? (
                <>
                  <CommandLineIcon className="w-3 h-3" />
                  <span>{t('reminders.type.scheduler')}</span>
                </>
              ) : (
                <>
                  <SpeakerWaveIcon className="w-3 h-3" />
                  <span>{t('reminders.type.reminder')}</span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  const Section = ({
    title,
    items,
    id,
    color = 'text-text',
    isOverdue = false
  }: {
    title: string
    items: Reminder[]
    id: keyof typeof expandedSections
    color?: string
    isOverdue?: boolean
  }) => {
    if (items.length === 0 && id !== 'today') return null

    return (
      <div className="mb-4">
        <div
          className="flex items-center justify-between py-1.5 cursor-pointer group select-none px-1"
          onClick={() => toggleSection(id)}
        >
          <div className="flex items-center gap-1.5">
            <div
              className={`transition-transform duration-200 ${expandedSections[id] ? 'rotate-90' : ''}`}
            >
              <ChevronRightIcon className="w-3 h-3 text-text-muted/30" />
            </div>
            <h2
              className={`text-xs font-black uppercase tracking-widest ${isOverdue ? 'text-rose-500' : color} opacity-80`}
            >
              {title}
            </h2>
            <span className="text-[9px] font-black text-text-muted/20 ml-1">{items.length}</span>
          </div>
        </div>

        {expandedSections[id] && (
          <div className="mt-1 bg-white/[0.01] rounded-lg border border-white/5 overflow-hidden">
            {items.length > 0 ? (
              items.map((r) => <TaskItem key={r.id} r={r} />)
            ) : (
              <div className="p-8 text-center bg-transparent">
                <p className="text-xs text-text-muted/30 uppercase font-black tracking-widest">
                  {t('reminders.emptyToday')}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex h-full w-full bg-bg font-sans overflow-hidden">
      <main className="flex-1 overflow-y-auto custom-scrollbar bg-bg relative">
        {/* Background Gradients */}
        <div className="absolute inset-0 pointer-events-none opacity-40">
          <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-accent/5 blur-[120px] rounded-full" />
          <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-violet-500/5 blur-[100px] rounded-full" />
        </div>

        <div className="max-w-2xl mx-auto px-4 py-8 relative z-10">
          <header className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-black text-text tracking-tight flex items-center gap-2">
                {t('reminders.title') || 'Hoje'}
                <span className="text-sm font-bold text-accent bg-accent/10 px-2 py-0.5 rounded-full border border-accent/20">
                  {groupedReminders.today.length + groupedReminders.overdue.length}
                </span>
              </h1>
              <p className="text-[10px] text-text-muted/40 mt-1 font-bold uppercase tracking-wider">
                {formatDate(new Date(), { weekday: 'long', day: 'numeric', month: 'long' })}
              </p>
            </div>

            <button
              onClick={handleOpenCreate}
              className="px-5 py-2.5 bg-accent/10 border border-accent/20 text-accent rounded-xl text-[11px] font-black uppercase tracking-[0.2em] hover:bg-accent/20 active:scale-95 transition-all flex items-center gap-2 group"
            >
              <div className="bg-accent/20 p-1 rounded-md group-hover:rotate-90 transition-transform duration-300">
                <PlusIcon className="w-3 h-3" />
              </div>
              {t('reminders.newReminder') || 'Novo'}
            </button>
          </header>

          <Section
            title={t('reminders.sections.overdue')}
            items={groupedReminders.overdue}
            id="overdue"
            isOverdue
          />

          <Section
            title={t('reminders.sections.today')}
            items={groupedReminders.today}
            id="today"
            color="text-accent"
          />

          <Section
            title={t('reminders.sections.tomorrow')}
            items={groupedReminders.tomorrow}
            id="tomorrow"
            color="text-emerald-500"
          />

          <Section
            title={t('reminders.sections.upcoming')}
            items={groupedReminders.upcoming}
            id="upcoming"
            color="text-violet-500"
          />

          {!reminders.length && (
            <div className="flex flex-col items-center justify-center py-20 bg-white/[0.02] rounded-3xl border border-dashed border-white/5">
              <div className="w-16 h-16 bg-accent/5 rounded-full flex items-center justify-center mb-4">
                <CheckCircleIcon className="w-8 h-8 text-accent/20" />
              </div>
              <p className="text-sm font-bold text-text-muted/40 uppercase tracking-widest">
                {t('reminders.emptyState.title')}
              </p>
              <button
                onClick={handleOpenCreate}
                className="mt-6 text-xs font-black text-accent hover:text-accent/80 underline underline-offset-8 decoration-dotted"
              >
                {t('reminders.emptyState.cta')}
              </button>
            </div>
          )}
        </div>
      </main>

      {/* Modal - Redesigned to match Todoist clean style */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-bg/80 backdrop-blur-md animate-in fade-in duration-300">
          <div className="absolute inset-0" onClick={() => setIsModalOpen(false)}></div>
          <div className="relative w-full max-w-md bg-zinc-800 border border-white/10 rounded-2xl p-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <ReminderForm
              initialData={formData}
              onSubmit={handleSubmit}
              onCancel={() => setIsModalOpen(false)}
              variant="modal"
            />
          </div>
        </div>
      )}
    </div>
  )
}
