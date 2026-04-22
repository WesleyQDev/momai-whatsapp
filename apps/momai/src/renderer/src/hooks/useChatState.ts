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
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null)
  const [isCallMode, setIsCallMode] = useState(false)
  const [voiceStatus, setVoiceStatus] = useState<'idle' | 'listening' | 'processing'>('idle')
  const [voiceEngineLoading, setVoiceEngineLoading] = useState<{
    loading: boolean
    pendingAutoTts: boolean
    message: string
  } | null>(null)
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

  const [animationFinished, setAnimationFinished] = useState(false)

  return {
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
  }
}
