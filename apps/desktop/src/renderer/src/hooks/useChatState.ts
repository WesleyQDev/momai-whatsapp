import { useState, useRef, useEffect } from 'react'
import { Message } from '../services/api'

export interface GraphState {
  view: 'center' | 'side' | null
  content: string
  options: string[]
  optionsMap?: Record<string, string>
  uiSchema?: any
  bypass_wake_word?: boolean
}

export function useChatState() {
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [threadId, setThreadId] = useState(() => `sessao_${Date.now()}`)
  const [isHistoryLoaded, setIsHistoryLoaded] = useState(false)
  const [speakingIndex, setSpeakingIndex] = useState<number | null>(null)
  const [isCallMode, setIsCallMode] = useState(false)
  const [voiceStatus, setVoiceStatus] = useState<'idle' | 'listening' | 'processing'>('idle')
  const [callHistory, setCallHistory] = useState<
    { id: string; role: 'user' | 'assistant'; content: string }[]
  >([])

  const [graphState, setGraphState] = useState<GraphState>({
    view: null,
    content: '',
    options: [],
    optionsMap: {},
    bypass_wake_word: false
  })

  const messagesRef = useRef<Message[]>([])
  const currentThreadRef = useRef(threadId)
  const isCallModeRef = useRef(isCallMode)
  const currentGraphOptionsRef = useRef<string[]>([])
  const isGraphOpenRef = useRef<boolean>(false)
  const toolTraceRef = useRef<{
    activeMsgId: string | null
    byToolId: Record<string, { msgId: string; stepIndex: number }>
  }>({ activeMsgId: null, byToolId: {} })

  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  useEffect(() => {
    currentThreadRef.current = threadId
  }, [threadId])

  useEffect(() => {
    isCallModeRef.current = isCallMode
  }, [isCallMode])

  useEffect(() => {
    currentGraphOptionsRef.current = graphState.options
    isGraphOpenRef.current = graphState.view !== null
  }, [graphState])

  return {
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
  }
}
