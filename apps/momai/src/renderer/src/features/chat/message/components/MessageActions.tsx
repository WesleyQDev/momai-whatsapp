import React from 'react'
import {
  ClipboardIcon,
  CheckIcon,
  SpeakerWaveIcon,
  StopIcon,
  TrashIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline'
import { useI18n } from '../../../../i18n'

interface MessageActionsProps {
  hasActualContent: boolean
  isCopied: boolean
  onCopy: () => void
  onRetry?: () => void
  aiTier?: string | null
  isSpeaking?: boolean
  isLoading?: boolean
  ttsEnabled?: boolean
  onStopVoice?: () => void
  onSpeak?: () => void
  hideStopButton?: boolean
  onReportResponse: () => void
  showReportConfirm: boolean
  onCancelReport: () => void
  onConfirmReport: () => void
}

export const MessageActions: React.FC<MessageActionsProps> = ({
  hasActualContent,
  isCopied,
  onCopy,
  onRetry,
  aiTier,
  isSpeaking,
  isLoading,
  ttsEnabled,
  onStopVoice,
  onSpeak,
  hideStopButton,
  onReportResponse,
  showReportConfirm,
  onCancelReport,
  onConfirmReport
}) => {
  const { t } = useI18n()

  if (!hasActualContent) return null

  return (
    <div className="flex flex-col items-start gap-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex items-center justify-center p-1.5 rounded-md hover:bg-zinc-200 dark:hover:bg-white/10 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors opacity-50 hover:opacity-100"
          title="Copiar"
          aria-label="Copiar resposta"
        >
          {isCopied ? (
            <CheckIcon className="w-[14px] h-[14px] text-green-500" />
          ) : (
            <ClipboardIcon className="w-[14px] h-[14px]" />
          )}
        </button>

        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center justify-center p-1.5 rounded-md hover:bg-zinc-200 dark:hover:bg-white/10 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors opacity-50 hover:opacity-100"
            title="Regerar resposta"
            aria-label="Regerar resposta"
          >
            <ArrowPathIcon className="w-[14px] h-[14px]" />
          </button>
        )}

        {aiTier !== 'lite' && (
          <>
            <div className="w-[1px] h-3 bg-zinc-200 dark:bg-white/10 mx-0.5"></div>

            <div className="flex items-center">
              {isSpeaking || (isLoading && ttsEnabled) ? (
                <button
                  type="button"
                  onClick={onStopVoice}
                  className="inline-flex items-center justify-center p-1.5 rounded-md hover:bg-zinc-200 dark:hover:bg-white/10 text-accent hover:text-accent/80 transition-colors animate-pulse"
                  title={t('chat.voice.stop')}
                  aria-label={t('chat.voice.stop')}
                >
                  <StopIcon className="w-[14px] h-[14px]" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onSpeak}
                  className="inline-flex items-center justify-center p-1.5 rounded-md hover:bg-zinc-200 dark:hover:bg-white/10 text-zinc-400 hover:text-accent transition-colors opacity-50 hover:opacity-100"
                  title={t('chat.voice.listen')}
                  aria-label={t('chat.voice.listen')}
                >
                  <SpeakerWaveIcon className="w-[14px] h-[14px]" />
                </button>
              )}
            </div>
          </>
        )}

        <button
          type="button"
          onClick={onReportResponse}
          className="inline-flex items-center justify-center p-1.5 rounded-md hover:bg-zinc-200 dark:hover:bg-white/10 text-zinc-400 hover:text-red-500 transition-colors opacity-50 hover:opacity-100"
          title={t('chat.report.title')}
          aria-label={t('chat.report.title')}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
            <line x1="4" y1="22" x2="4" y2="15" />
          </svg>
        </button>
      </div>

      {showReportConfirm && (
        <div className="w-full max-w-[320px] p-3 rounded-xl border border-border/20 bg-card/95 shadow-xl backdrop-blur-sm">
          <p className="text-xs text-text-muted leading-relaxed">{t('chat.report.message')}</p>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={onCancelReport}
              className="px-3 py-1.5 rounded-lg text-xs border border-border/20 bg-white/5 hover:bg-white/10 text-text-muted transition-colors"
            >
              {t('chat.report.cancel')}
            </button>
            <button
              type="button"
              onClick={onConfirmReport}
              className="px-3 py-1.5 rounded-lg text-xs bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-300 transition-colors"
            >
              {t('chat.report.confirm')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
