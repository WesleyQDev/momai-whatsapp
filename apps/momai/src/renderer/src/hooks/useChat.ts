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
    speakingIndex,
    setSpeakingIndex,
    isCallMode,
    setIsCallMode,
    voiceStatus,
    setVoiceStatus,
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

  // 1. Actions Hook (Needs to be defined before handlers if handlers use them, or vice-versa)
  // To avoid circularity, we pass a dummy handleGraphOption first if needed, 
  // but here we can just define actions first as it doesn't depend on handlers yet.
  const actions = useChatActions({
    threadId,
    currentThreadRef,
    messagesRef,
    setMessages,
    setIsLoading,
    setSpeakingIndex,
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
    setSpeakingIndex,
    setVoiceStatus,
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
    speakingIndex,
    speakMessage: actions.speakMessage,
    removeMessage: actions.removeMessage,
    regenerateMessage: actions.regenerateMessage,
    isCallMode,
    toggleCallMode: actions.toggleCallMode,
    voiceStatus,
    callHistory,
    threadId,
    setThreadId,
    scrollToBottom
  }
}
