import { RefObject, JSX, memo, useRef, useEffect, useCallback } from 'react'
import MessageItem from './MessageItem'
import { Message, StatusData } from '../../services/api'
import WelcomeTips from './WelcomeTips'

interface MessageListProps {
  messages: Message[]
  isLoading: boolean
  messagesEndRef: RefObject<HTMLDivElement | null>
  onReopenGraph: (data: any) => void
  onGraphOption: (option: string) => void
  onSendMessage: (text: string) => void
  onStopVoice?: () => void
  onStopGeneration?: () => void
  onSpeakMessage?: (content: string, index: number) => void
  onRemoveMessage?: (index: number) => void
  onRegenerateMessage?: (index: number) => void
  speakingIndex?: number | null
  statusInfo: StatusData | null
}

const MessageList = memo(function MessageList({
  messages,
  isLoading,
  messagesEndRef,
  onReopenGraph,
  onGraphOption,
  onSendMessage,
  onStopVoice,
  onStopGeneration,
  onSpeakMessage,
  onRemoveMessage,
  onRegenerateMessage,
  speakingIndex = null,
  statusInfo
}: MessageListProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const isAtBottomRef = useRef(true)
  const lastMessagesLength = useRef(messages.length)

  const handleScroll = useCallback(() => {
    if (!containerRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current
    // More precise threshold of 50px
    const atBottom = scrollHeight - scrollTop <= clientHeight + 50
    isAtBottomRef.current = atBottom
  }, [])

  useEffect(() => {
    const isNewMessage = messages.length > lastMessagesLength.current
    lastMessagesLength.current = messages.length

    // Scroll if it's a new message OR if we are already at the bottom (follow stream)
    if (isNewMessage || isAtBottomRef.current) {
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
      className="flex-1 flex flex-col gap-5 p-4 overflow-y-auto overflow-x-hidden relative scroll-smooth"
    >
      {messages.map((msg, i) => {
        // Prevent system tool action triggers from being visibly rendered as chat balloons
        if (msg.role === 'user' && msg.content.startsWith('__TOOL__:')) return null
        
        return (
          <MessageItem
            key={i}
            message={msg}
            isLoading={isLoading && i === messages.length - 1 && msg.role === 'assistant'}
            onReopenGraph={onReopenGraph}
            onGraphOption={onGraphOption}
            isSpeaking={speakingIndex === i}
            onStopVoice={onStopVoice}
            onStopGeneration={onStopGeneration}
            onSpeak={() => onSpeakMessage?.(msg.content, i)}
            onDelete={() => onRemoveMessage?.(i)}
            onRetry={msg.role === 'assistant' ? () => onRegenerateMessage?.(i) : () => onSendMessage(msg.content)}
            aiTier={statusInfo?.ai_tier || 'pro'}
          />
        )
      })}

      <div ref={messagesEndRef} />
    </main>
  )
})

export default MessageList
