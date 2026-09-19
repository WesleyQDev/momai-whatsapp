import type { JSX } from 'react'
import ContactAvatar from '../components/ContactAvatar'
import { useI18n } from '../hooks/useI18n'
import { useLastMessageWidget } from './hooks/useLastMessageWidget'
import { resolveWidgetLabel } from './services/widgetApi'
import { WidgetLoading, WidgetState } from './components/WidgetState'

export default function WhatsappLastMessageWidget(): JSX.Element {
  const { t } = useI18n()
  const { loading, error, last, avatar } = useLastMessageWidget()

  if (loading) return <WidgetLoading message={t('widget.lastMessage.loading')} />
  if (error) return <WidgetState title={t('widget.lastMessage.title')} message={error} />
  if (!last) return <WidgetState title={t('widget.lastMessage.title')} message={t('widget.lastMessage.empty')} />

  const label = resolveWidgetLabel(last, t('widget.lastMessage.unknown'), t('panel.groups'))
  const outgoing = last.direction === 'outgoing'
  const body =
    last.text !== ''
      ? last.text
      : last.hasMedia
        ? t('media.photo')
        : ''

  return (
    <div className="w-full h-full flex flex-col min-h-0 overflow-hidden p-3 gap-2">
      <div className="flex items-center gap-2.5 min-w-0 shrink-0">
        <ContactAvatar src={avatar} name={label} id={last.jid} />
        <div className="flex-1 flex flex-col min-w-0">
          <span className="text-xs font-semibold text-text truncate">{label}</span>
          <span className="text-[10px] text-text-muted">
            {last.timestamp
              ? new Date(last.timestamp > 1e12 ? last.timestamp : last.timestamp * 1000).toLocaleString()
              : ''}
          </span>
        </div>
        {last.hasMedia && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 border border-border/30 text-text-muted shrink-0">
            {t('widget.lastMessage.mediaBadge')}
          </span>
        )}
      </div>
      <p className="text-xs text-text leading-snug line-clamp-4">
        {outgoing && <span className="font-semibold text-text-muted">{t('page.you_label')} </span>}
        {body || t('widget.lastMessage.media')}
      </p>
    </div>
  )
}
