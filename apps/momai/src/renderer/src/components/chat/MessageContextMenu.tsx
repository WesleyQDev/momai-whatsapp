import { JSX, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  ClipboardDocumentIcon,
  SpeakerWaveIcon,
  TrashIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline'
import { useI18n } from '../../i18n'

interface MessageContextMenuProps {
  x: number
  y: number
  onClose: () => void
  onCopy: () => void
  onSpeak: () => void
  onDelete: () => void
  onRetry?: () => void
  isUser: boolean
  showSpeak?: boolean
}

export default function MessageContextMenu({
  x,
  y,
  onClose,
  onCopy,
  onSpeak,
  onDelete,
  onRetry,
  isUser,
  showSpeak = true
}: MessageContextMenuProps): JSX.Element {
  const { t } = useI18n()
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  // Ajustar posição para não sair da tela (usando uma largura e altura estimadas menores)
  const adjustedX = Math.min(x, window.innerWidth - 160)
  const adjustedY = Math.min(y, window.innerHeight - 180)

  const menu = (
    <div
      ref={menuRef}
      className="fixed z-[9999] min-w-[150px] bg-zinc-50/90 dark:bg-[#1a1b1e]/90 backdrop-blur-md border border-black/5 dark:border-white/5 rounded-lg shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-100"
      style={{ top: adjustedY, left: adjustedX }}
    >
      <div className="flex flex-col p-1">
        <button
          onClick={() => {
            onCopy()
            onClose()
          }}
          className="flex items-center gap-2.5 px-3 py-2 text-[13px] text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200/50 dark:hover:bg-white/10 rounded-md transition-colors whitespace-nowrap"
        >
          <ClipboardDocumentIcon className="w-4 h-4 opacity-70" />
          <span>{isUser ? t('chat.context.copyUser') : t('chat.context.copyAssistant')}</span>
        </button>

        {!isUser && showSpeak && (
          <button
            onClick={() => {
              onSpeak()
              onClose()
            }}
            className="flex items-center gap-2.5 px-3 py-2 text-[13px] text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200/50 dark:hover:bg-white/10 rounded-md transition-colors whitespace-nowrap"
          >
            <SpeakerWaveIcon className="w-4 h-4 opacity-70" />
            <span>{t('chat.context.speak')}</span>
          </button>
        )}

        {onRetry && (
          <button
            onClick={() => {
              onRetry()
              onClose()
            }}
            className="flex items-center gap-2.5 px-3 py-2 text-[13px] text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200/50 dark:hover:bg-white/10 rounded-md transition-colors whitespace-nowrap"
          >
            <ArrowPathIcon className="w-4 h-4 opacity-70" />
            <span>{isUser ? t('chat.context.retryUser') : t('chat.context.retryAssistant')}</span>
          </button>
        )}

        <div className="h-px bg-black/5 dark:bg-white/10 my-1 mx-1" />

        <button
          onClick={() => {
            onDelete()
            onClose()
          }}
          className="flex items-center gap-2.5 px-3 py-2 text-[13px] text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-md transition-colors whitespace-nowrap"
        >
          <TrashIcon className="w-4 h-4 opacity-80" />
          <span>{t('chat.context.delete')}</span>
        </button>
      </div>
    </div>
  )

  return createPortal(menu, document.body)
}
