import { useState, useRef, useEffect, useCallback } from 'react'
import { useChatState } from './useChatState'
import { useChatWebSocket } from './useChatWebSocket'
import { useChatHandlers } from './useChatHandlers'
import { useChatActions } from './useChatActions'
import { useChatInit } from './useChatInit'

export function useChat() {
  const [text, setText] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const chatState = useChatState()
  const {
    messages,
    setMessages,
    isLoading,
    setIsLoading,
    threadId,
    setThreadId,
    isHistoryLoaded,
    setIsHistoryLoaded,
    speakingMessageId,
    setSpeakingMessageId,
    isCallMode,
    setIsCallMode,
    voiceStatus,
    setVoiceStatus,
    voiceEngineLoading,
    setVoiceEngineLoading,
    callHistory,
    setCallHistory,
    graphState,
    setGraphState,
    messagesRef,
    currentThreadRef,
    isCallModeRef,
    currentGraphOptionsRef,
    isGraphOpenRef,
    toolTraceRef
  } = chatState

  // 1. Actions Hook
  const actions = useChatActions({
    threadId,
    currentThreadRef,
    messagesRef,
    setMessages,
    setIsLoading,
    setSpeakingMessageId,
    setCallHistory,
    toolTraceRef,
    setGraphState,
    isCallMode,
    setIsCallMode,
    isCallModeRef,
    setText
  })

  // 2. Handlers Hook
  const { handleWsMessage } = useChatHandlers({
    messagesRef,
    setMessages,
    setSpeakingMessageId,
    setVoiceStatus,
    setVoiceEngineLoading,
    setCallHistory,
    setGraphState,
    setIsLoading,
    toolTraceRef,
    isCallModeRef,
    isGraphOpenRef,
    currentGraphOptionsRef,
    handleGraphOption: actions.handleGraphOption
  })

  // 3. WebSocket Hook
  const { wsRef } = useChatWebSocket({
    threadId,
    handleWsMessage
  })

  // 4. Initialization Hook
  useChatInit({
    threadId,
    setMessages,
    setIsHistoryLoaded,
    setThreadId
  })

  // Listen for backend online to connect WS if not connected
  useEffect(() => {
    // @ts-ignore
    const removeOnlineListener = window.api?.onBackendOnline?.(() => {
      console.log('[useChat] Backend notified as online. Syncing session...');
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'session_sync', thread_id: threadId }))
      }
    });

    return () => {
      if (removeOnlineListener) removeOnlineListener()
    }
  }, [threadId, wsRef])

  // Stop generation/voice on thread change
  useEffect(() => {
    if (currentThreadRef.current !== threadId) {
      actions.stopGeneration()
      actions.stopVoice()
      currentThreadRef.current = threadId
    }
  }, [threadId, isLoading, actions])

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  const reopenGraph = useCallback((data: any) => {
    setGraphState(data)
  }, [setGraphState])

  const closeGraph = useCallback(() => {
    setGraphState((prev: any) => ({ ...prev, view: null }))
  }, [setGraphState])

  // ESC to close graph
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeGraph()
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [closeGraph])

  return {
    text,
    setText,
    messages,
    isLoading,
    sendMessage: actions.sendMessage,
    messagesEndRef,
    graphState,
    handleGraphOption: actions.handleGraphOption,
    closeGraph,
    reopenGraph,
    clearHistory: actions.handleClear,
    stopCurrentGeneration: actions.stopGeneration,
    stopCurrentVoice: actions.stopVoice,
    speakingMessageId,
    speakMessage: actions.speakMessage,
    removeMessage: actions.removeMessage,
    regenerateMessage: actions.regenerateMessage,
    isCallMode,
    toggleCallMode: actions.toggleCallMode,
    voiceStatus,
    voiceEngineLoading,
    callHistory,
    threadId,
    setThreadId,
    scrollToBottom
  }
}
