import { useState, useEffect } from 'react'
import {
  PlusIcon,
  PencilIcon,
  TrashIcon,
  DocumentDuplicateIcon,
  CalendarIcon
} from '@heroicons/react/24/outline'
import { useActiveReminders } from '../../hooks/useActiveReminders'
import { deleteReminder, createReminder, type ActiveReminder } from '../../services/api'
import { useI18n } from '../../i18n'
import { getNextOccurrence, getOccurrenceForDate } from '../../utils/reminders'
import ReminderForm, { ReminderFormData } from '../reminders/ReminderForm'

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
    setContextMenu(null)
    setShowQuickAdd(false)
  }

  const handleUpdate = async (data: ReminderFormData) => {
    if (!editingReminder || isSaving) return

    setIsSaving(true)
    try {
      const { updateReminder } = await import('../../services/api')
      
      await updateReminder(editingReminder.id, {
        title: data.title,
        content: data.content,
        scheduled_time: data.scheduled_time,
        repeat_interval: data.repeat_interval as any,
        repeat_value: data.repeat_interval ? data.repeat_value : null
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

  const handleQuickAdd = async (data: ReminderFormData) => {
    if (isSaving) return

    setIsSaving(true)
    try {
      await createReminder({
        title: data.title,
        content: data.content,
        scheduled_time: data.scheduled_time,
        repeat_interval: data.repeat_interval as any,
        repeat_value: data.repeat_interval ? data.repeat_value : null
      })

      setShowQuickAdd(false)
      window.dispatchEvent(new CustomEvent('momai_reminders_updated'))
      refresh()
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
        <h2 className="text-[10px] font-black text-text-muted/50 uppercase tracking-[0.2em]">
          Próximos
        </h2>
        <span className="flex items-center justify-center w-4 h-4 bg-text/5 rounded-full text-[10px] font-black text-text-muted/30">
          {displayItems.length}
        </span>
      </div>

      <div className="flex-1 flex flex-col min-h-0">
        {displayItems.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-4">
            {showQuickAdd ? (
              <div className="w-full flex-1 flex flex-col items-center justify-start pt-2">
                <ReminderForm
                  onSubmit={handleQuickAdd}
                  onCancel={() => setShowQuickAdd(false)}
                  isSaving={isSaving}
                  variant="inline"
                />
              </div>
            ) : (
              <button
                onClick={() => setShowQuickAdd(true)}
                className="px-6 py-3 bg-accent/5 hover:bg-accent/10 border border-accent/10 rounded-xl text-accent transition-all active:scale-95 group flex items-center gap-3"
              >
                <PlusIcon className="w-4 h-4" />
                <span className="text-[11px] font-black uppercase tracking-[0.2em]">
                  Novo Lembrete
                </span>
              </button>
            )}
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto custom-scrollbar px-2 space-y-1 pb-4 pt-2">
            {showQuickAdd && (
              <div className="mb-4 mt-2 px-1">
                <ReminderForm
                  onSubmit={handleQuickAdd}
                  onCancel={() => setShowQuickAdd(false)}
                  isSaving={isSaving}
                  variant="inline"
                />
              </div>
            )}
            {(() => {
              let lastDateLabel: string | null = null
              return displayItems.map(({ reminder: r, time, isToday }) => {
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

                const showHeader = dateLabel !== 'Hoje' && dateLabel !== lastDateLabel
                if (showHeader) lastDateLabel = dateLabel

                const content = (
                  <div key={r.id + '-' + time.getTime()}>
                    {showHeader && (
                      <div className="px-2 pt-3 pb-1 mb-1">
                        <h3 className="text-[10px] font-black text-text-muted/30 uppercase tracking-[0.2em] border-b border-white/5 pb-1">
                          {dateLabel}
                        </h3>
                      </div>
                    )}
                    {editingReminder?.id === r.id ? (
                      <div className="mb-4 mt-2 px-1">
                        <ReminderForm
                          initialData={{
                            id: editingReminder.id,
                            title: editingReminder.title,
                            content: editingReminder.content || '',
                            newDate: editingReminder.scheduled_time.split('T')[0],
                            newTime: editingReminder.scheduled_time.split('T')[1].slice(0, 5),
                            repeat_interval: editingReminder.repeat_interval as any,
                            repeat_value: editingReminder.repeat_value || 1
                          }}
                          onSubmit={handleUpdate}
                          onCancel={() => setEditingReminder(null)}
                          isSaving={isSaving}
                          variant="inline"
                        />
                      </div>
                    ) : (
                      <div
                        onContextMenu={(e) => handleContextMenu(e, r)}
                        className="group p-2 rounded hover:bg-card/30 transition-all flex items-center gap-3 cursor-default"
                      >
                        <button
                          onClick={() => handleDelete(r.id)}
                          className="shrink-0 w-5 h-5 rounded-full border-2 border-text/20 group-hover:border-accent/50 transition-all flex items-center justify-center active:scale-90"
                          title="Concluir lembrete"
                        >
                          <div className="w-2.5 h-2.5 rounded-full bg-accent opacity-0 group-hover:opacity-20 active:opacity-100 transition-all" />
                        </button>

                        <div className="flex-1 min-w-0 pr-1 flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <span className="block text-[13px] text-text font-bold truncate">
                              {r.title}
                            </span>
                            <div className="flex items-center gap-2 text-[11px] text-text-muted/80 mt-0.5">
                              <span className="uppercase tracking-tight">{dateLabel}</span>
                              <span className="w-1 h-1 rounded-full bg-text/10" />
                              <span className="font-medium text-accent">
                                {formatTime(time, { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                          </div>

                          <div className="flex flex-col items-end gap-1.5 shrink-0 pt-0.5">
                            {recurrence && (
                              <span
                                className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-sm shrink-0 ${
                                  recurrence.category === 'intraday'
                                    ? 'text-emerald-400/90 bg-emerald-400/10'
                                    : 'text-violet-400/90 bg-violet-400/10'
                                }`}
                              >
                                {recurrence.label}
                              </span>
                            )}
                            
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => handleOpenEdit(r)}
                                className="p-1 text-text/30 hover:text-accent transition-colors"
                                title="Editar"
                              >
                                <PencilIcon className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDelete(r.id)}
                                className="p-1 text-text/30 hover:text-rose-500 transition-colors"
                                title="Excluir"
                              >
                                <TrashIcon className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )

                return content
              })
            })()}
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
        <div className="p-4 pt-1 flex flex-col gap-2 shrink-0">
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setShowQuickAdd(true)}
              className="flex items-center justify-center gap-2 py-3 bg-accent/10 hover:bg-accent/20 text-accent rounded-xl transition-all active:scale-95 group border border-accent/20"
            >
              <div className="bg-accent/20 p-1 rounded-md group-hover:rotate-90 transition-transform duration-300">
                <PlusIcon className="w-3 h-3" />
              </div>
              <span className="text-[11px] font-black uppercase tracking-[0.2em]">Criar</span>
            </button>
            <button
              onClick={onNavigate}
              className="flex items-center justify-center gap-2 py-2.5 bg-white/[0.02] hover:bg-white/[0.05] text-text/60 hover:text-text/80 rounded-xl transition-all active:scale-95 border border-white/5"
            >
              <CalendarIcon className="w-3.5 h-3.5" />
              <span className="text-[11px] font-black uppercase tracking-[0.15em]">Agenda</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
