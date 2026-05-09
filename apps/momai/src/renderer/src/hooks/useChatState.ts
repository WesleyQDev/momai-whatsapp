import { useReducer, useRef, useEffect } from 'react'
import type { Message } from '../services/api'
import { chatReducer, initialChatState, type GraphState } from './chatReducer'

export type { GraphState }

export function useChatState() {
  const [chat, dispatch] = useReducer(chatReducer, initialChatState)

  const messagesRef = useRef<Message[]>([])
  const currentThreadRef = useRef(chat.threadId)
  const isCallModeRef = useRef(chat.isCallMode)
  const currentGraphOptionsRef = useRef<string[]>([])
  const isGraphOpenRef = useRef<boolean>(false)
  const toolTraceRef = useRef<{
    activeMsgId: string | null
    byToolId: Record<string, { msgId: string; stepIndex: number }>
  }>({ activeMsgId: null, byToolId: {} })

  useEffect(() => {
    messagesRef.current = chat.messages
  }, [chat.messages])
  useEffect(() => {
    currentThreadRef.current = chat.threadId
  }, [chat.threadId])
  useEffect(() => {
    isCallModeRef.current = chat.isCallMode
  }, [chat.isCallMode])
  useEffect(() => {
    currentGraphOptionsRef.current = chat.graphState.options
    isGraphOpenRef.current = chat.graphState.view !== null
  }, [chat.graphState])

  return {
    ...chat,
    dispatch,
    messagesRef,
    currentThreadRef,
    isCallModeRef,
    currentGraphOptionsRef,
    isGraphOpenRef,
    toolTraceRef
  }
}
