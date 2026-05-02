import { useState, useRef, useEffect, useCallback } from 'react'
import { useChatState } from './useChatState'
import { useChatWebSocket } from './useChatWebSocket'
import { useChatHandlers } from './useChatHandlers'
import { useChatActions } from './useChatActions'
import { useChatInit } from './useChatInit'
import { getTTSServiceRenderer } from '../services/ttsService'

export function useChat() {
  const [text, setText] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollPositionRef = useRef<number>(0)

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
    toolTraceRef,
    animationFinished,
    setAnimationFinished
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
      console.debug('[useChat] Backend notified as online. Syncing session...')
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'session_sync', thread_id: threadId }))
      }
    })

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

  const reopenGraph = useCallback(
    (data: any) => {
      setGraphState(data)
    },
    [setGraphState]
  )

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

  // Listen to renderer TTS events for non-Kokoro engines (edge-tts, say)
  // Kokoro uses WebSocket tts_start/tts_stop handled by useChatHandlers
  useEffect(() => {
    const tts = getTTSServiceRenderer()

    const handleSpeakingStart = () => {
      setSpeakingMessageId((prev) => {
        if (prev !== null) return prev
        const msgs = messagesRef.current
        for (let i = msgs.length - 1; i >= 0; i--) {
          const msg = msgs[i]
          if (msg.role === 'assistant' && msg.id) {
            return msg.id
          }
        }
        return 'tts-active'
      })
    }

    const handleSpeakingEnd = () => {
      setSpeakingMessageId(null)
    }

    tts.on('speaking-start', handleSpeakingStart)
    tts.on('speaking-end', handleSpeakingEnd)

    return () => {
      tts.off('speaking-start', handleSpeakingStart)
      tts.off('speaking-end', handleSpeakingEnd)
    }
  }, [setSpeakingMessageId])

  // Reset states on new session (e.g. tier change)
  useEffect(() => {
    const handleNewSession = () => {
      setThreadId(`sessao_${Date.now()}`)
      setMessages([])
      setIsLoading(false)
      setSpeakingMessageId(null)
      setVoiceStatus('idle')
      setVoiceEngineLoading(null)
    }
    window.addEventListener('momai_new_session', handleNewSession)
    return () => window.removeEventListener('momai_new_session', handleNewSession)
  }, [setThreadId, setMessages, setIsLoading, setSpeakingMessageId, setVoiceStatus])

  useEffect(() => {
    const handleDevExecTrace = (event: Event) => {
      const detail = (event as CustomEvent<any>)?.detail || {}
      const traceId = String(detail.traceId || '').trim()
      if (!traceId) return

      if (detail.phase === 'start') {
        const summary = String(detail.summary || 'Aplicando alteracao solicitada')
        setMessages((prev) => [
          ...prev,
          {
            id: traceId,
            role: 'assistant',
            content: '',
            toolSteps: [
              {
                tool: 'confirm_mutation',
                name: 'confirm_mutation',
                description: summary,
                status: 'running',
                started_at: new Date().toISOString()
              }
            ]
          }
        ])
        return
      }

      if (detail.phase === 'done' || detail.phase === 'error') {
        const doneStatus = detail.phase === 'done' ? 'success' : 'error'
        const message = String(detail.message || '')
        setMessages((prev) =>
          prev.map((msg) => {
            if (msg.id !== traceId) return msg
            const prevSteps = Array.isArray(msg.toolSteps) ? msg.toolSteps : []
            const nextSteps = prevSteps.length
              ? prevSteps.map((step: any) => ({ ...step, status: doneStatus }))
              : [
                  {
                    tool: 'confirm_mutation',
                    name: 'confirm_mutation',
                    description: 'Confirmacao de alteracao',
                    status: doneStatus,
                    started_at: new Date().toISOString()
                  }
                ]
            return {
              ...msg,
              content: message,
              toolSteps: nextSteps,
              structuredResponse: detail.structuredResponse || msg.structuredResponse
            }
          })
        )
      }
    }

    window.addEventListener('momai_dev_exec_trace', handleDevExecTrace as EventListener)
    return () =>
      window.removeEventListener('momai_dev_exec_trace', handleDevExecTrace as EventListener)
  }, [setMessages])

  return {
    text,
    setText,
    messages,
    isLoading,
    sendMessage: actions.sendMessage,
    messagesEndRef,
    scrollPositionRef,
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
    scrollToBottom,
    animationFinished,
    setAnimationFinished
  }
}
