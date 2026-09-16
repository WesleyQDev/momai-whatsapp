import ContactAvatar from './ContactAvatar'
import MonitoringDropdown from './MonitoringDropdown'
import { useI18n } from '../hooks/useI18n'

export interface ConversationListItemPreview {
  direction: 'incoming' | 'outgoing'
  timestamp: number
  text: string
  audio?: string
  sticker?: string
  image?: string
  document?: string
  documentName?: string
  video?: string
}

export interface ConversationListItemProps {
  jid: string
  isGroup: boolean
  groupName: string | null
  contactLabel: string
  avatarName: string
  avatarSrc?: string | null
  preview: ConversationListItemPreview
  stickerSrc?: string | null
  timeLabel: string
  hasNew: boolean
  monitoring: boolean
  editing: boolean
  editValue: string
  onEditValueChange: (value: string) => void
  onStartEdit: () => void
  onSaveEdit: () => void
  onCancelEdit: () => void
  onOpen: () => void
  onOpenMenu: (position: { x: number; y: number }) => void
  onDelete: () => void
  onToggleMonitoring: () => void
}

export default function ConversationListItem({
  jid,
  isGroup,
  groupName,
  contactLabel,
  avatarName,
  avatarSrc,
  preview,
  stickerSrc,
  timeLabel,
  hasNew,
  monitoring,
  editing,
  editValue,
  onEditValueChange,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onOpen,
  onOpenMenu,
  onDelete,
  onToggleMonitoring
}: ConversationListItemProps) {
  const { t } = useI18n()
  const isOutgoing = preview.direction === 'outgoing'

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => {
        if (!editing) onOpen()
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onOpenMenu({ x: e.clientX, y: e.clientY })
      }}
      onKeyDown={(e) => {
        if (editing) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen()
        }
      }}
      className="wa-conversation-item group relative px-4 py-3 border-b border-white/5 last:border-0 cursor-pointer focus:outline-none"
      title={t('page.view_conversation')}
    >
      <div className="flex gap-3">
        <div onClick={(e) => e.stopPropagation()}>
          <ContactAvatar src={avatarSrc} name={avatarName} id={jid} />
        </div>
        <div
          className="flex-1 min-w-0 grid gap-x-2"
          style={{ gridTemplateColumns: 'minmax(0, 1fr) auto' }}
        >
          <div className="flex items-center gap-2 min-w-0">
            {editing ? (
              <div className="flex-1 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                <input
                  value={editValue}
                  onChange={(e) => onEditValueChange(e.target.value)}
                  onKeyDown={(e) => {
                    e.stopPropagation()
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      onSaveEdit()
                    }
                    if (e.key === 'Escape') {
                      e.preventDefault()
                      onCancelEdit()
                    }
                  }}
                  onBlur={() => onSaveEdit()}
                  autoFocus
                  className="w-full max-w-xs bg-white/10 rounded px-2 py-0.5 text-sm border border-emerald-500/50 outline-none text-text"
                />
              </div>
            ) : (
              <>
                {isGroup && groupName ? (
                  <>
                    <span className="font-medium text-sm truncate">{groupName}</span>
                    <span className="text-xs text-text-muted truncate shrink-0">
                      · {contactLabel}
                    </span>
                  </>
                ) : (
                  <span className="font-medium text-sm truncate">{contactLabel}</span>
                )}
              </>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {hasNew && (
              <span
                className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide shadow-sm"
                style={{
                  backgroundColor: '#ffffff',
                  color: '#16a34a',
                  border: '1px solid #16a34a'
                }}
              >
                {t('page.new_badge')}
              </span>
            )}
            {!editing && !isGroup && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onStartEdit()
                }}
                className="text-text-muted hover:text-emerald-400 p-1 rounded-lg hover:bg-white/10 transition-colors"
                title={t('page.rename')}
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 0 1-.927-.928l.929-3.25c.081-.286.235-.547.445-.758l8.61-8.61Zm.176 4.823L9.75 4.81l-6.286 6.287a.253.253 0 0 0-.064.108l-.558 1.953 1.953-.558a.253.253 0 0 0 .108-.064Zm1.238-3.763a.25.25 0 0 0-.354 0L10.811 3.75l1.439 1.44 1.263-1.263a.25.25 0 0 0 0-.354Z" />
                </svg>
              </button>
            )}
            {!editing && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete()
                }}
                className="text-text-muted hover:text-red-400 p-1 rounded-lg hover:bg-white/10 transition-colors"
                title={t('page.delete_conversation')}
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M6.5 1.75a.25.25 0 0 1 .25-.25h2.5a.25.25 0 0 1 .25.25V3h-3V1.75Zm4.5 0V3h2.25a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1 0-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75ZM4.496 6.675a.75.75 0 1 0-1.492.15l.66 6.6A1.75 1.75 0 0 0 5.405 15h5.19a1.75 1.75 0 0 0 1.741-1.575l.66-6.6a.75.75 0 0 0-1.492-.15l-.66 6.6a.25.25 0 0 1-.249.225h-5.19a.25.25 0 0 1-.249-.225l-.66-6.6Z" />
                </svg>
              </button>
            )}
            {!editing && (
              <MonitoringDropdown id={jid} monitoring={monitoring} onToggle={onToggleMonitoring} />
            )}
            <span className="text-xs text-text-muted">{timeLabel}</span>
          </div>
          <div className="text-sm text-text-muted mt-0.5 flex items-center gap-1.5 min-h-[1.75rem]">
            {isOutgoing && (
              <span className="font-semibold text-text-muted/90 shrink-0">{t('page.you_label')}</span>
            )}
            {preview.sticker ? (
              <div className="flex items-center gap-1.5 py-0.5">
                <img
                  src={stickerSrc || ''}
                  alt="Sticker"
                  className="w-8 h-8 sm:w-9 sm:h-9 object-contain rounded drop-shadow-sm shrink-0 select-none hover:scale-105 transition-transform"
                  loading="lazy"
                />
              </div>
            ) : (
              <span className="truncate">
                {preview.text ||
                  (preview.audio
                    ? t('page.audio_fallback')
                    : preview.image
                      ? t('media.photo')
                      : preview.video
                        ? t('media.video')
                        : preview.document
                          ? `📄 ${preview.documentName || t('page.document_default')}`
                          : '')}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
