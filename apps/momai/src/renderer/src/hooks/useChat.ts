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
    isLoading,
    threadId,
    isHistoryLoaded,
    speakingMessageId,
    isCallMode,
    voiceStatus,
    voiceEngineLoading,
    callHistory,
    graphState,
    messagesRef,
    currentThreadRef,
    isCallModeRef,
    currentGraphOptionsRef,
    isGraphOpenRef,
    toolTraceRef,
    animationFinished,
    dispatch
  } = chatState

  const setThreadId = useCallback(
    (id: string) => {
      dispatch({ type: 'SET_THREAD_ID', threadId: id })
    },
    [dispatch]
  )

  const setAnimationFinished = useCallback(
    (finished: boolean) => {
      dispatch({ type: 'SET_ANIMATION_FINISHED', finished })
    },
    [dispatch]
  )

  // 1. Actions Hook
  const actions = useChatActions({
    threadId,
    currentThreadRef,
    messagesRef,
    dispatch,
    toolTraceRef,
    isCallMode,
    isCallModeRef,
    setText
  })

  // 2. Handlers Hook
  const { handleWsMessage } = useChatHandlers({
    messagesRef,
    dispatch,
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
    dispatch
  })

  // Sync session on thread change or backend online
  useEffect(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'session_sync', thread_id: threadId }))
    }

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
      dispatch({ type: 'SET_GRAPH_STATE', state: data })
    },
    [dispatch]
  )

  const closeGraph = useCallback(() => {
    dispatch({ type: 'SET_GRAPH_STATE', state: { view: null } })
  }, [dispatch])

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
      const msgs = messagesRef.current
      for (let i = msgs.length - 1; i >= 0; i--) {
        const msg = msgs[i]
        if (msg.role === 'assistant' && msg.id) {
          dispatch({ type: 'SET_SPEAKING', messageId: msg.id })
          return
        }
      }
      dispatch({ type: 'SET_SPEAKING', messageId: 'tts-active' })
    }

    const handleSpeakingEnd = () => {
      dispatch({ type: 'SET_SPEAKING', messageId: null })
    }

    tts.on('speaking-start', handleSpeakingStart)
    tts.on('speaking-end', handleSpeakingEnd)

    return () => {
      tts.off('speaking-start', handleSpeakingStart)
      tts.off('speaking-end', handleSpeakingEnd)
    }
  }, [dispatch, messagesRef])

  // Reset states on new session (e.g. tier change)
  useEffect(() => {
    const handleNewSession = (event: Event) => {
      const customEvent = event as CustomEvent<{ prefillText?: string }>
      const prefillText = customEvent.detail?.prefillText || ''
      dispatch({
        type: 'BATCH_UPDATE',
        updates: {
          threadId: `sessao_${Date.now()}`,
          messages: [],
          isLoading: false,
          speakingMessageId: null,
          voiceStatus: 'idle',
          voiceEngineLoading: null
        }
      })
      setText('')
      setTimeout(() => {
        setText(prefillText)
      }, 0)
    }
    window.addEventListener('momai_new_session', handleNewSession as EventListener)
    return () => window.removeEventListener('momai_new_session', handleNewSession as EventListener)
  }, [dispatch, setText])

  useEffect(() => {
    const handleDevExecTrace = (event: Event) => {
      const detail = (event as CustomEvent<any>)?.detail || {}
      const traceId = String(detail.traceId || '').trim()
      if (!traceId) return

      if (detail.phase === 'start') {
        const summary = String(detail.summary || 'Aplicando alteracao solicitada')
        dispatch({
          type: 'UPDATE_MESSAGES',
          updater: (prev) => [
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
          ]
        })
        return
      }

      if (detail.phase === 'done' || detail.phase === 'error') {
        const doneStatus = detail.phase === 'done' ? 'success' : 'error'
        const message = String(detail.message || '')
        dispatch({
          type: 'UPDATE_MESSAGES',
          updater: (prev) =>
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
                structuredResponses: detail.structuredResponses || msg.structuredResponses
              }
            })
        })
      }
    }

    window.addEventListener('momai_dev_exec_trace', handleDevExecTrace as EventListener)
    return () =>
      window.removeEventListener('momai_dev_exec_trace', handleDevExecTrace as EventListener)
  }, [dispatch])

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
    setAnimationFinished,
    isHistoryLoaded
  }
}
