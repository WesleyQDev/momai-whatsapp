import { useEffect, useRef } from 'react'
import ContactAvatar from './ContactAvatar'
import MonitoringDropdown from './MonitoringDropdown'
import { useI18n } from '../hooks/useI18n'

export interface RenameInputProps {
  value: string
  onChange: (val: string) => void
  onSave: (val?: string) => void
  onCancel: () => void
  className?: string
}

export function RenameInput({
  value,
  onChange,
  onSave,
  onCancel,
  className = 'w-full max-w-xs bg-white/10 rounded px-2 py-0.5 text-sm border border-accent/50 outline-none text-text'
}: RenameInputProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const mountTimeRef = useRef(Date.now())

  useEffect(() => {
    mountTimeRef.current = Date.now()
    const timer = setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus()
        inputRef.current.select()
      }
    }, 40)
    return () => clearTimeout(timer)
  }, [])

  return (
    <input
      ref={inputRef}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter') {
          e.preventDefault()
          onSave(e.currentTarget.value)
        }
        if (e.key === 'Escape') {
          e.preventDefault()
          onCancel()
        }
      }}
      onBlur={(e) => {
        if (Date.now() - mountTimeRef.current < 200) {
          inputRef.current?.focus()
          return
        }
        onSave(e.currentTarget.value)
      }}
      className={className}
    />
  )
}

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
  gif?: string
  isGif?: boolean
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
  isPinned?: boolean
  isFavorite?: boolean
  isSelected?: boolean
  onEditValueChange: (value: string) => void
  onStartEdit?: () => void
  onSaveEdit: (val?: string) => void
  onCancelEdit: () => void
  onOpen: () => void
  onOpenMenu: (position: { x: number; y: number }) => void
  onDelete?: () => void
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
  isPinned = false,
  isFavorite = false,
  isSelected = false,
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
      className={`wa-conversation-item group relative px-4 py-3 border-b border-white/5 last:border-0 cursor-pointer focus:outline-none transition-colors ${
        isSelected ? 'bg-accent/15 ring-1 ring-accent/30' : ''
      }`}
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
                <RenameInput
                  value={editValue}
                  onChange={onEditValueChange}
                  onSave={onSaveEdit}
                  onCancel={onCancelEdit}
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
            {isPinned && (
              <span title={t('page.pin')} className="text-text-muted shrink-0">
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="17" x2="12" y2="22" />
                  <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.89A2 2 0 0 1 15 10.77V6h1a1 1 0 0 0 0-2H8a1 1 0 0 0 0 2h1v4.77a2 2 0 0 1-1.11 1.79l-1.78.89A2 2 0 0 0 5 15.24V17z" />
                </svg>
              </span>
            )}
            {isFavorite && (
              <span title={t('page.favorite')} className="text-highlight shrink-0">
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
              </span>
            )}
            {hasNew && (
              <span
                className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide shadow-xs bg-card text-accent border border-accent/40"
              >
                {t('page.new_badge')}
              </span>
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
                {stickerSrc ? (
                  <img
                    src={stickerSrc || ''}
                    alt="Sticker"
                    className="w-8 h-8 sm:w-9 sm:h-9 object-contain rounded drop-shadow-sm shrink-0 select-none hover:scale-105 transition-transform"
                    loading="lazy"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none'
                    }}
                  />
                ) : null}
                <span className="truncate">🏷️ Figurinha</span>
              </div>
            ) : preview.gif || preview.isGif ? (
              <span className="truncate">🎞️ GIF{preview.text && preview.text !== '[GIF]' ? ` · ${preview.text}` : ''}</span>
            ) : preview.text === '[Sticker]' ? (
              <span className="truncate">🏷️ Figurinha</span>
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
