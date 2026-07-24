import { RefObject, JSX, memo, useRef, useEffect, useCallback } from 'react'
import { MessageItem } from '../../features/chat/message'
import { Message, StatusData } from '../../services/api'

interface MessageListProps {
  messages: Message[]
  isLoading: boolean
  messagesEndRef: RefObject<HTMLDivElement | null>
  scrollPositionRef?: RefObject<number>
  onReopenGraph: (data: any) => void
  onGraphOption: (option: string) => void
  onSendMessage: (text: string) => void
  onStopVoice?: () => void
  onStopGeneration?: () => void
  onSpeakMessage?: (content: string, index: number) => void
  onRemoveMessage?: (index: number) => void
  onRegenerateMessage?: (index: number) => void
  speakingMessageId?: string | null
  statusInfo: StatusData | null
  ttsEnabled?: boolean
  llmStarting?: boolean
}

const MessageList = memo(function MessageList({
  messages,
  isLoading,
  messagesEndRef,
  scrollPositionRef,
  onReopenGraph,
  onGraphOption,
  onSendMessage,
  onStopVoice,
  onStopGeneration,
  onSpeakMessage,
  onRemoveMessage,
  onRegenerateMessage,
  speakingMessageId = null,
  statusInfo,
  ttsEnabled = false,
  llmStarting = false
}: MessageListProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const isAtBottomRef = useRef(true)
  const lastMessagesLength = useRef(messages.length)
  const hasRestoredScroll = useRef(false)

  const handleScroll = useCallback(() => {
    if (!containerRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current
    const atBottom = scrollHeight - scrollTop <= clientHeight + 50
    isAtBottomRef.current = atBottom

    // Save scroll position for tab switching
    if (scrollPositionRef) {
      scrollPositionRef.current = scrollTop
    }
  }, [scrollPositionRef])

  // Restore scroll position when component mounts (e.g. switching back to chat tab)
  useEffect(() => {
    if (hasRestoredScroll.current) return
    hasRestoredScroll.current = true

    if (scrollPositionRef?.current && containerRef.current) {
      containerRef.current.scrollTop = scrollPositionRef.current
    }
  }, [scrollPositionRef])

  useEffect(() => {
    const isNewMessage = messages.length > lastMessagesLength.current
    lastMessagesLength.current = messages.length

    if (isNewMessage || isAtBottomRef.current) {
      const lastMsg = messages[messages.length - 1]
      const hasStructuredCard =
        lastMsg?.role === 'assistant' && lastMsg?.structuredResponses?.length

      if (hasStructuredCard && containerRef.current) {
        setTimeout(() => {
          if (!containerRef.current) return
          const cardEls = containerRef.current.querySelectorAll('[data-structured-response]')
          const cardEl = cardEls[cardEls.length - 1]
          if (cardEl) {
            cardEl.scrollIntoView({ behavior: 'smooth', block: 'start' })
          } else {
            messagesEndRef.current?.scrollIntoView({
              behavior: isNewMessage ? 'smooth' : 'auto'
            })
          }
        }, 100)
        if (isNewMessage) isAtBottomRef.current = true
        return
      }

      messagesEndRef.current?.scrollIntoView({
        behavior: isNewMessage ? 'smooth' : 'auto'
      })

      if (isNewMessage) isAtBottomRef.current = true
    }
  }, [messages, messagesEndRef])

  return (
    <main
      ref={containerRef}
      onScroll={handleScroll}
      className="flex-1 flex flex-col gap-5 p-4 overflow-y-auto overflow-x-hidden relative"
    >
      {(() => {
        let lastAssistantIdx = -1
        for (let i = messages.length - 1; i >= 0; i--) {
          if (messages[i].role === 'assistant') {
            lastAssistantIdx = i
            break
          }
        }

        return messages.map((msg, i) => {
          if (msg.role === 'user' && msg.content.startsWith('__TOOL__:')) return null

          const isLastAssistant = i === lastAssistantIdx
          const isSelfSpeaking =
            speakingMessageId === msg.id || (isLastAssistant && speakingMessageId !== null)

          return (
            <MessageItem
              key={msg.id || i}
              message={msg}
              isLoading={isLoading && isLastAssistant}
              onReopenGraph={onReopenGraph}
              onGraphOption={onGraphOption}
              isSpeaking={isSelfSpeaking}
              ttsEnabled={ttsEnabled}
              onStopVoice={onStopVoice}
              onStopGeneration={onStopGeneration}
              onSpeak={() => onSpeakMessage?.(msg.content, i)}
              onDelete={() => onRemoveMessage?.(i)}
              onRetry={
                msg.role === 'assistant'
                  ? () => onRegenerateMessage?.(i)
                  : () => onSendMessage(msg.content)
              }
              aiTier={statusInfo?.ai_tier || 'pro'}
              llmStarting={llmStarting}
            />
          )
        })
      })()}

      <div ref={messagesEndRef} />
    </main>
  )
})

export default MessageList
