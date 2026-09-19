import type { JSX } from 'react'
import ContactAvatar from '../components/ContactAvatar'
import { useI18n } from '../hooks/useI18n'
import { useUnreadWidget } from './hooks/useUnreadWidget'
import { resolveWidgetLabel, type WidgetHistoryMessage } from './services/widgetApi'
import { WidgetLoading, WidgetState } from './components/WidgetState'

function formatTime(timestamp: number): string {
  if (!timestamp) return ''
  const value = timestamp > 1e12 ? timestamp : timestamp * 1000
  try {
    return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

function describePreview(
  message: WidgetHistoryMessage,
  youLabel: string,
  photoLabel: string
): string {
  const prefix = message.direction === 'outgoing' ? `${youLabel} ` : ''
  if (message.text !== '') return `${prefix}${message.text}`
  if (message.hasMedia) return `${prefix}${photoLabel}`
  return prefix.trim()
}

export default function WhatsappUnreadWidget(): JSX.Element {
  const { t } = useI18n()
  const { loading, connected, total, rows, error } = useUnreadWidget()

  if (loading) return <WidgetLoading message={t('widget.unread.loading')} />
  if (error) return <WidgetState title={t('widget.unread.title')} message={error} />
  if (!connected) return <WidgetState title={t('widget.unread.title')} message={t('widget.unread.disconnected')} />
  if (rows.length === 0) return <WidgetState title={t('widget.unread.title')} message={t('widget.unread.empty')} />

  const youLabel = t('page.you_label')
  const photoLabel = t('media.photo')

  return (
    <div className="w-full h-full flex flex-col min-h-0 overflow-hidden p-3 gap-2">
      <div className="flex items-center justify-between shrink-0">
        <span className="text-xs font-bold text-text">{t('widget.unread.title')}</span>
        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-accent/15 text-accent border border-accent/20">
          {total > 0 ? total : rows.length}
        </span>
      </div>
      <div className="flex flex-col gap-1 min-h-0 overflow-hidden">
        {rows.map(({ message, avatar }) => {
          const label = resolveWidgetLabel(message, t('widget.unread.unknown'), t('panel.groups'))
          return (
            <div
              key={message.jid}
              className="flex items-center gap-2.5 px-2 py-1.5 rounded-xl bg-bg/50 border border-border/20 min-w-0"
            >
              <ContactAvatar src={avatar} name={label} id={message.jid} />
              <div className="flex-1 flex flex-col min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-text truncate">{label}</span>
                  <span className="text-[10px] text-text-muted shrink-0">
                    {formatTime(message.timestamp)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-text-muted truncate">
                    {describePreview(message, youLabel, photoLabel)}
                  </span>
                  <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-px rounded bg-accent text-white shrink-0">
                    {t('page.new_badge')}
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
