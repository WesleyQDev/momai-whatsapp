import { useState, useEffect } from 'react'
import {
  CalendarIcon,
  PlusIcon,
  XMarkIcon,
  ClockIcon,
  CheckCircleIcon,
  PencilIcon,
  TrashIcon,
  DocumentDuplicateIcon
} from '@heroicons/react/24/outline'
import { CheckCircleIcon as CheckCircleSolid } from '@heroicons/react/24/solid'
import { useActiveReminders } from '../../hooks/useActiveReminders'
import { deleteReminder, createReminder, type ActiveReminder } from '../../services/api'
import { useI18n } from '../../i18n'
import { getNextOccurrence, getOccurrenceForDate } from '../../utils/reminders'

const getTodayISO = () => new Date().toISOString().split('T')[0]
const getInOneHourISO = () => {
  const d = new Date()
  d.setHours(d.getHours() + 1)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

interface RemindersSidebarProps {
  onNavigate?: () => void
}

/**
 * Returns a human-readable recurrence badge label and a "category" color.
 */
function getRecurrenceMeta(
  t: (key: string, vars?: Record<string, string | number>) => string,
  interval: string | null,
  value: number | null
): { label: string; category: 'intraday' | 'multiday' } | null {
  if (!interval) return null
  const v = value || 1

  switch (interval) {
    case 'minutes':
      return {
        label: t('remindersSidebar.repeat.minutes', { value: v }),
        category: 'intraday'
      }
    case 'hours':
      return {
        label: t('remindersSidebar.repeat.hours', { value: v }),
        category: 'intraday'
      }
    case 'days':
      return {
        label: t('remindersSidebar.repeat.days', { value: v }),
        category: 'multiday'
      }
    case 'weeks':
      return {
        label: t('remindersSidebar.repeat.weeks', { value: v }),
        category: 'multiday'
      }
    case 'months':
      return {
        label: t('remindersSidebar.repeat.months', { value: v }),
        category: 'multiday'
      }
    default:
      return null
  }
}

export default function RemindersSidebar({ onNavigate }: RemindersSidebarProps) {
  const { reminders, refresh } = useActiveReminders()
  const { t, formatTime } = useI18n()
  const [showQuickAdd, setShowQuickAdd] = useState(false)
  const [newReminderTitle, setNewReminderTitle] = useState('')
  const [newReminderContent, setNewReminderContent] = useState('')
  const [newReminderDate, setNewReminderDate] = useState(getTodayISO())
  const [newReminderTime, setNewReminderTime] = useState(getInOneHourISO())
  const [newReminderInterval, setNewReminderInterval] = useState<string | null>(null)
  const [newReminderValue, setNewReminderValue] = useState(1)
  const [isSaving, setIsSaving] = useState(false)
  const [editingReminder, setEditingReminder] = useState<ActiveReminder | null>(null)
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    reminder: ActiveReminder
  } | null>(null)

  const handleContextMenu = (e: React.MouseEvent, r: ActiveReminder) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, reminder: r })
  }

  const handleDuplicate = async (r: ActiveReminder) => {
    // Optimistic UI update or just fast execution
    setContextMenu(null)
    try {
      await createReminder({
        title: `${r.title} (Cópia)`,
        content: r.content || '',
        scheduled_time: r.scheduled_time,
        repeat_interval: r.repeat_interval as any,
        repeat_value: r.repeat_value
      })
      refresh()
      window.dispatchEvent(new CustomEvent('momai_reminders_updated'))
    } catch (err) {
      console.error('Erro ao duplicar lembrete:', err)
    }
  }

  const handleOpenEdit = (r: ActiveReminder) => {
    setEditingReminder(r)
    setNewReminderTitle(r.title)
    setNewReminderContent(r.content || '')
    
    // Parse scheduled_time (YYYY-MM-DDTHH:MM)
    const [d, t] = r.scheduled_time.split('T')
    setNewReminderDate(d)
    setNewReminderTime(t.slice(0, 5))
    setNewReminderInterval(r.repeat_interval)
    setNewReminderValue(r.repeat_value || 1)
    setContextMenu(null)
    setShowQuickAdd(false) // Close quick add if open
  }

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingReminder || !newReminderTitle.trim() || isSaving) return

    setIsSaving(true)
    try {
      const scheduledTimeStr = `${newReminderDate}T${newReminderTime}:00`
      const { updateReminder } = await import('../../services/api')
      
      await updateReminder(editingReminder.id, {
        title: newReminderTitle,
        content: newReminderContent,
        scheduled_time: scheduledTimeStr,
        repeat_interval: newReminderInterval as any,
        repeat_value: newReminderInterval ? newReminderValue : null
      })

      setEditingReminder(null)
      window.dispatchEvent(new CustomEvent('momai_reminders_updated'))
      refresh()
    } catch (error) {
      console.error('Failed to update reminder:', error)
    } finally {
      setIsSaving(false)
    }
  }

  useEffect(() => {
    const handleClick = () => setContextMenu(null)
    window.addEventListener('click', handleClick)
    return () => window.removeEventListener('click', handleClick)
  }, [])

  const today = new Date()

  const handleDelete = async (id: number) => {
    try {
      await deleteReminder(id)
      window.dispatchEvent(new CustomEvent('momai_reminders_updated'))
    } catch (error) {
      console.error('Failed to delete reminder:', error)
    }
  }

  const handleQuickAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newReminderTitle.trim() || isSaving) return

    setIsSaving(true)
    try {
      const scheduledTimeStr = `${newReminderDate}T${newReminderTime}:00`

      await createReminder({
        title: newReminderTitle,
        content: newReminderContent,
        scheduled_time: scheduledTimeStr,
        repeat_interval: newReminderInterval as any,
        repeat_value: newReminderInterval ? newReminderValue : null
      })

      setNewReminderTitle('')
      setNewReminderContent('')
      setNewReminderDate(getTodayISO())
      setNewReminderTime(getInOneHourISO())
      setNewReminderInterval(null)
      setShowQuickAdd(false)
      window.dispatchEvent(new CustomEvent('momai_reminders_updated'))
    } catch (error) {
      console.error('Failed to create quick reminder:', error)
    } finally {
      setIsSaving(false)
    }
  }

  const allOccurrences = reminders
    .map((r) => {
      const todayOcc = getOccurrenceForDate(r, today, today)
      let time = todayOcc
      let isToday = false
      if (todayOcc) {
        isToday = true
      } else {
        time = getNextOccurrence(r)
      }
      return { reminder: r, time, isToday }
    })
    .filter((o) => o.time !== null) as { reminder: ActiveReminder; time: Date; isToday: boolean }[]

  allOccurrences.sort((a, b) => a.time.getTime() - b.time.getTime())
  const displayItems = allOccurrences.slice(0, 6)

  return (
    <div className="flex flex-col h-full bg-card overflow-hidden">
      <div className="p-3 border-b border-white/5 flex items-center justify-between">
        <h2 className="text-[9px] font-black text-text-muted/30 uppercase tracking-[0.2em]">
          Próximos
        </h2>
        <span className="flex items-center justify-center w-4 h-4 bg-text/5 rounded-full text-[9px] font-black text-text-muted/30">
          {displayItems.length}
        </span>
      </div>

      <div className="flex-1 flex flex-col min-h-0">
        {displayItems.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-4 -mt-4">
            {showQuickAdd ? (
              <form
                onSubmit={handleQuickAdd}
                className="w-full space-y-3 bg-white/[0.02] border border-white/5 p-4 rounded-xl animate-in zoom-in-95 duration-200"
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-[10px] font-black uppercase text-accent tracking-widest">
                    Novo
                  </h3>
                  <button
                    type="button"
                    onClick={() => setShowQuickAdd(false)}
                    className="p-1 text-text-muted/40 hover:text-text"
                  >
                    <XMarkIcon className="w-3.5 h-3.5" />
                  </button>
                </div>

                <input
                  autoFocus
                  type="text"
                  required
                  className="w-full bg-input/50 p-2 text-xs rounded border border-white/5 outline-none focus:border-accent/40"
                  placeholder="O que devo lembrar?"
                  value={newReminderTitle}
                  onChange={(e) => setNewReminderTitle(e.target.value)}
                />

                <div className="grid grid-cols-2 gap-2">
                  <div className="relative group">
                    <CalendarIcon className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-accent/40 group-focus-within:text-accent transition-colors" />
                    <input
                      type="date"
                      required
                      className="w-full bg-input/40 pl-7 pr-2 py-1.5 text-[10px] rounded border border-white/5 outline-none focus:border-accent/40 text-text font-bold"
                      value={newReminderDate}
                      onChange={(e) => setNewReminderDate(e.target.value)}
                    />
                  </div>
                  <div className="relative group">
                    <ClockIcon className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-accent/40 group-focus-within:text-accent transition-colors" />
                    <input
                      type="time"
                      required
                      className="w-full bg-input/40 pl-7 pr-2 py-1.5 text-[10px] rounded border border-white/5 outline-none focus:border-accent/40 text-text font-bold"
                      value={newReminderTime}
                      onChange={(e) => setNewReminderTime(e.target.value)}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSaving}
                  className="w-full py-1.5 bg-accent text-[10px] font-black uppercase text-black rounded hover:brightness-110 active:scale-95 transition-all shadow-lg shadow-accent/10"
                >
                  Salvar
                </button>
              </form>
            ) : (
              <button
                onClick={() => setShowQuickAdd(true)}
                className="px-6 py-2.5 bg-accent/10 hover:bg-accent/20 border border-accent/20 rounded-xl text-accent transition-all active:scale-95 group shadow-lg shadow-accent/5 flex items-center gap-2.5"
              >
                <PlusIcon className="w-3.5 h-3.5" />
                <span className="text-[10px] font-black uppercase tracking-[0.15em] transition-all">
                  Novo Lembrete
                </span>
              </button>
            )}
        </div>
        ) : (
          <div className="flex-1 overflow-y-auto custom-scrollbar px-2 space-y-1 pb-4 pt-2">
            {showQuickAdd && (
              <div className="mb-4 mt-2 px-1">
                <form
                  onSubmit={handleQuickAdd}
                  className="w-full bg-card/60 border border-border/10 rounded-2xl p-4 shadow-xl animate-in slide-in-from-top-2 duration-300"
                >
                  <div className="flex items-center justify-between mb-3 px-1">
                    <span className="text-[9px] font-black uppercase tracking-widest text-accent">
                      Ação Rápida
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowQuickAdd(false)}
                      className="p-1 text-text/30 hover:text-text transition-colors"
                    >
                      <XMarkIcon className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <input
                    autoFocus
                    required
                    type="text"
                    placeholder="O que devo lembrar?"
                    className="w-full bg-input/50 border border-border/5 rounded-xl px-4 py-2 text-xs font-bold outline-none focus:border-accent/40 text-text mb-2.5 shadow-inner"
                    value={newReminderTitle}
                    onChange={(e) => setNewReminderTitle(e.target.value)}
                  />

                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <input
                      type="date"
                      className="w-full bg-input/50 border border-border/5 rounded-lg px-2 py-1.5 text-[9px] font-bold text-text outline-none focus:border-accent/40 [color-scheme:dark]"
                      value={newReminderDate}
                      onChange={(e) => setNewReminderDate(e.target.value)}
                    />
                    <input
                      type="time"
                      className="w-full bg-input/50 border border-border/5 rounded-lg px-2 py-1.5 text-[9px] font-bold text-text outline-none focus:border-accent/40 [color-scheme:dark]"
                      value={newReminderTime}
                      onChange={(e) => setNewReminderTime(e.target.value)}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={!newReminderTitle.trim() || isSaving}
                    className="w-full py-2 bg-accent text-white rounded-lg text-[9px] font-black uppercase tracking-widest hover:brightness-110 disabled:opacity-30 transition-all active:scale-[0.98]"
                  >
                    {isSaving ? '...' : 'Salvar'}
                  </button>
                </form>
              </div>
            )}
            {displayItems.map(({ reminder: r, time, isToday }) => {
              const recurrence = getRecurrenceMeta(t, r.repeat_interval, r.repeat_value)

              let dateLabel = 'Hoje'
              if (!isToday) {
                const tomorrow = new Date(today)
                tomorrow.setDate(tomorrow.getDate() + 1)

                if (
                  time.getDate() === tomorrow.getDate() &&
                  time.getMonth() === tomorrow.getMonth() &&
                  time.getFullYear() === tomorrow.getFullYear()
                ) {
                  dateLabel = 'Amanhã'
                } else {
                  dateLabel = time.toLocaleDateString(undefined, {
                    day: '2-digit',
                    month: '2-digit'
                  })
                }
              }

              if (editingReminder?.id === r.id) {
                return (
                  <form
                    key={"edit-" + r.id}
                    onSubmit={handleUpdate}
                    className="mb-4 mt-2 px-1 w-full space-y-3 bg-white/[0.04] border border-accent/20 p-4 rounded-xl animate-in slide-in-from-top-2 duration-300"
                  >
                    <div className="flex items-center justify-between mb-2 px-1">
                      <span className="text-[9px] font-black uppercase tracking-widest text-accent">
                        Editando
                      </span>
                      <button
                        type="button"
                        onClick={() => setEditingReminder(null)}
                        className="p-1 text-text/30 hover:text-text transition-colors"
                      >
                        <XMarkIcon className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <input
                      autoFocus
                      required
                      type="text"
                      className="w-full bg-input/50 border border-border/5 rounded-xl px-4 py-2 text-xs font-bold outline-none focus:border-accent/40 text-text mb-2 animate-pulse-subtle"
                      value={newReminderTitle}
                      onChange={(e) => setNewReminderTitle(e.target.value)}
                    />
                    <textarea
                      className="w-full bg-input/40 p-2 text-[10px] rounded-lg border border-white/5 outline-none focus:border-accent/40 text-text/70 resize-none min-h-[40px] mb-2"
                      placeholder="Notas..."
                      value={newReminderContent}
                      onChange={(e) => setNewReminderContent(e.target.value)}
                    />
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      <input
                        type="date"
                        className="w-full bg-input/50 border border-border/5 rounded-lg px-2 py-1.5 text-[9px] font-bold text-text outline-none focus:border-accent/40 [color-scheme:dark]"
                        value={newReminderDate}
                        onChange={(e) => setNewReminderDate(e.target.value)}
                      />
                      <input
                        type="time"
                        className="w-full bg-input/50 border border-border/5 rounded-lg px-2 py-1.5 text-[9px] font-bold text-text outline-none focus:border-accent/40 [color-scheme:dark]"
                        value={newReminderTime}
                        onChange={(e) => setNewReminderTime(e.target.value)}
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="submit"
                        disabled={isSaving}
                        className="flex-1 py-2 bg-accent text-white rounded-lg text-[9px] font-black uppercase tracking-widest hover:brightness-110 active:scale-[0.98] transition-all"
                      >
                        {isSaving ? '...' : 'Salvar'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingReminder(null)}
                        className="px-4 py-2 bg-white/5 text-[9px] font-black uppercase text-text/40 rounded-lg hover:text-text transition-all"
                      >
                        Cancelar
                      </button>
                    </div>
                  </form>
                )
              }

              return (
                <div
                  key={r.id + '-' + time.getTime()}
                  onContextMenu={(e) => handleContextMenu(e, r)}
                  className="group p-2 rounded hover:bg-card/30 transition-all flex items-center gap-3 cursor-default"
                >
                  <button
                    onClick={() => handleDelete(r.id)}
                    className="relative flex items-center justify-center shrink-0 w-5 h-5 transition-all"
                    title="Concluir lembrete"
                  >
                    <CheckCircleIcon className="w-5 h-5 text-text/10 group-hover:text-accent/30 transition-colors" />
                    <CheckCircleSolid className="absolute inset-0 w-5 h-5 text-accent opacity-0 scale-50 group-hover:opacity-20 group-hover:scale-100 active:opacity-100 transition-all" />
                  </button>

                  <div className="flex-1 min-w-0 pr-1">
                    <span className="block text-[11px] text-text/80 font-bold truncate">
                      {r.title}
                    </span>
                    <div className="flex items-center gap-2 text-[9px] text-text-muted/60 mt-0.5">
                      <span className="uppercase tracking-tight">{dateLabel}</span>
                      <span className="w-1 h-1 rounded-full bg-text/10" />
                      <span className="font-medium text-accent/70">
                        {formatTime(time, { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    {recurrence && (
                      <div className="flex items-center gap-1 mt-1">
                        <span
                          className={`text-[8px] font-black uppercase tracking-wider px-1 rounded-sm ${
                            recurrence.category === 'intraday'
                              ? 'text-emerald-400/60 bg-emerald-400/5'
                              : 'text-violet-400/60 bg-violet-400/5'
                          }`}
                        >
                          {recurrence.label}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {contextMenu && (
        <div
          className="fixed z-[9999] bg-card border border-border/20 rounded-lg shadow-2xl py-1 min-w-[140px] animate-in fade-in zoom-in-95 duration-100"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => handleOpenEdit(contextMenu.reminder)}
            className="w-full px-3 py-1.5 text-left text-[11px] font-bold text-text-muted hover:text-text hover:bg-accent/10 flex items-center gap-2 transition-colors"
          >
            <PencilIcon className="w-3.5 h-3.5 text-accent" />
            Editar
          </button>
          <button
            onClick={() => handleDuplicate(contextMenu.reminder)}
            className="w-full px-3 py-1.5 text-left text-[11px] font-bold text-text-muted hover:text-text hover:bg-accent/10 flex items-center gap-2 transition-colors"
          >
            <DocumentDuplicateIcon className="w-3.5 h-3.5 text-emerald-500" />
            Duplicar
          </button>
          <div className="h-px bg-border/10 my-1" />
          <button
            onClick={async () => {
              await handleDelete(contextMenu.reminder.id)
              setContextMenu(null)
            }}
            className="w-full px-3 py-1.5 text-left text-[11px] font-bold text-rose-500 hover:bg-rose-500/10 flex items-center gap-2 transition-colors"
          >
            <TrashIcon className="w-3.5 h-3.5" />
            Excluir
          </button>
        </div>
      )}

      {displayItems.length > 0 && (
        <div className="p-2 border-t border-white/5 grid grid-cols-2 gap-1.5 shrink-0 bg-bg/50">
          <button
            onClick={() => setShowQuickAdd(true)}
            className="flex items-center justify-center gap-1.5 py-2 bg-accent/10 hover:bg-accent/20 text-accent rounded transition-all active:scale-95"
          >
            <PlusIcon className="w-3 h-3" />
            <span className="text-[9px] font-black uppercase tracking-widest">Criar</span>
          </button>
          <button
            onClick={onNavigate}
            className="flex items-center justify-center gap-1.5 py-2 bg-white/5 hover:bg-white/10 text-text/60 hover:text-text rounded transition-all active:scale-95 border border-border/5"
          >
            <CalendarIcon className="w-3 h-3" />
            <span className="text-[9px] font-black uppercase tracking-widest">Agenda</span>
          </button>
        </div>
      )}
    </div>
  )
}
