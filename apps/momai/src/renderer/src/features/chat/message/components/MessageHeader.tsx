import React from 'react'
import { Message } from '../../../../services/api'

interface MessageHeaderProps {
  message: Message
  aiTier?: string | null
  isLoading?: boolean
  isThinkingOpen: boolean
  onToggleThinking: () => void
  thoughts: string[]
}

export const MessageHeader: React.FC<MessageHeaderProps> = ({
  message,
  aiTier,
  isLoading,
  isThinkingOpen,
  onToggleThinking,
  thoughts
}) => {
  return (
    <>
      {/* Thinking Block */}
      {thoughts.length > 0 && (
        <div className="think-container animate-in fade-in slide-in-from-top-2 duration-500">
          <button
            type="button"
            onClick={onToggleThinking}
            className="think-header w-full text-[15px]"
          >
            <div className="flex items-center gap-2 flex-1">
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                className="text-text/30"
              >
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              <span>Pensamento</span>
            </div>
            <svg
              width="12"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              className={`text-text/30 transition-transform duration-300 ${isThinkingOpen ? 'rotate-180' : ''}`}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          {isThinkingOpen && (
            <div className="think-content animate-in fade-in zoom-in-95 duration-300">
              {thoughts.map((thought, i) => (
                <div key={i} className={i > 0 ? 'mt-4 pt-4 border-t border-white/5' : ''}>
                  <div className="text-[13px] text-zinc-500 italic">Pensamento {i + 1}:</div>
                  <div className="mt-1 text-[14px] text-zinc-700 dark:text-zinc-300">{thought}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  )
}
