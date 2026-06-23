import { useCallback, useEffect, useRef } from 'react'
import {
  Message,
  sendChatMessage,
  searchMemory,
  Source,
  clearChatHistory,
  stopVoice as stopVoiceApi,
  deleteMessage as deleteMessageApi,
  speakText as speakTextApi,
  stopGeneration as stopGenerationApi,
  setCallMode as setCallModeApi,
  generateSessionTitle
} from '../services/api'
import {
  createAssistantMessageId,
  isToolTraceMessage,
  splitToolTraceContent,
  buildToolTraceContent
} from '../utils/chatUtils'
import { cleanMomaiActions } from '../utils/text'
import type { ChatAction } from './chatReducer'

interface UseChatActionsProps {
  threadId: string
  currentThreadRef: React.MutableRefObject<string>
  messagesRef: React.MutableRefObject<Message[]>
  dispatch: React.Dispatch<ChatAction>
  toolTraceRef: React.MutableRefObject<any>
  isCallMode: boolean
  isCallModeRef: React.MutableRefObject<boolean>
  setText: React.Dispatch<React.SetStateAction<string>>
}

export function useChatActions({
  threadId,
  currentThreadRef,
  messagesRef,
  dispatch,
  toolTraceRef,
  isCallMode,
  isCallModeRef,
  setText
}: UseChatActionsProps) {
  const abortControllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort()
      abortControllerRef.current = null
    }
  }, [])

  const buildInjectedMemory = useCallback(async (content: string) => {
    const query = content.trim()
    if (!query || query.length < 3) {
      return {
        memory_context: undefined as string | undefined,
        memory_sources: undefined as Source[] | undefined
      }
    }

    try {
      const hits = await searchMemory(query, 6)
      if (!hits.length) {
        return { memory_context: undefined, memory_sources: undefined }
      }

      const unique = new Map<string, (typeof hits)[number]>()
      for (const hit of hits) {
        if (!unique.has(hit.note_id)) unique.set(hit.note_id, hit)
      }

      const selected = Array.from(unique.values()).slice(0, 4)
      const sections = selected
        .map((hit) => {
          const text = (hit.text || '').trim()
          if (!text) return ''
          return `--- [NOTE: ${String(hit.title || 'Nota').toUpperCase()}] ---\n${text}\n`
        })
        .filter(Boolean)

      const memory_context = sections.length
        ? `KNOWLEDGE (LOCAL NOTES):\n${sections.join('\n')}`
        : undefined

      const memory_sources: Source[] = selected.map((hit) => ({
        url: `momai://note/${hit.note_id}`,
        title: `Note: ${hit.title || 'Untitled'}`,
        snippet: (hit.text || '').slice(0, 200)
      }))

      return { memory_context, memory_sources }
    } catch {
      return { memory_context: undefined, memory_sources: undefined }
    }
  }, [])

  const stopGeneration = useCallback(async () => {
    try {
      await stopGenerationApi()
      await stopVoiceApi().catch(() => {})
    } catch (err) {
      console.error('Erro ao parar geração:', err)
    } finally {
      dispatch({ type: 'SET_LOADING', isLoading: false })
    }
  }, [dispatch])

  const stopVoice = useCallback(async () => {
    try {
      await stopVoiceApi()
    } catch (err) {
      console.error('Erro ao parar voz:', err)
    } finally {
      dispatch({ type: 'SET_SPEAKING', messageId: null })
    }
  }, [dispatch])

  const sendMessage = useCallback(
    async (content: string, isSilent: boolean = false, skipUserMessage: boolean = false) => {
      if (!content.trim()) return

      abortControllerRef.current?.abort()
      const abortController = new AbortController()
      abortControllerRef.current = abortController

      stopVoiceApi().catch(() => {})
      dispatch({ type: 'SET_SPEAKING', messageId: null })

      if (!isSilent && !skipUserMessage) {
        const userMessage: Message = { role: 'user', content }
        dispatch({ type: 'UPDATE_MESSAGES', updater: (prev) => [...prev, userMessage] })

        if (isCallModeRef.current) {
          dispatch({
            type: 'SET_CALL_HISTORY',
            updater: (prev) =>
              [...prev, { id: `user-${Date.now()}`, role: 'user' as const, content }].slice(-5)
          })
        }
      }

      setText('')

      if (isSilent) {
        const messageThreadId = currentThreadRef.current || threadId
        try {
          const memoryPayload = await buildInjectedMemory(content)
          await sendChatMessage(
            content,
            messageThreadId,
            {
              onToken: () => {},
              onStatus: () => {},
              onSources: () => {},
              onSnippets: () => {},
              onCards: () => {},
              onToolSteps: () => {},
              onDone: () => {},
              onError: (err) => console.error('[SilentTool] Error:', err)
            },
            { ...memoryPayload, signal: abortController.signal }
          )
        } catch (err) {
          if (abortController.signal.aborted) return
          console.error('[SilentTool] Error:', err)
        }
        return
      }

      dispatch({ type: 'SET_LOADING', isLoading: true })
      toolTraceRef.current = { activeMsgId: null, byToolId: {} }

      const memoryPromise = buildInjectedMemory(content)

      const assistantMsgId = createAssistantMessageId()
      toolTraceRef.current.activeMsgId = assistantMsgId
      dispatch({
        type: 'UPDATE_MESSAGES',
        updater: (prev) => [...prev, { id: assistantMsgId, role: 'assistant', content: '...' }]
      })

      const messageThreadId = currentThreadRef.current || threadId
      const isFirstMessage = messagesRef.current.length <= 1

      try {
        const memoryPayload = await memoryPromise
        await sendChatMessage(
          content,
          messageThreadId,
          {
            onToken: (token) => {
              if (currentThreadRef.current !== messageThreadId) return
              dispatch({
                type: 'UPDATE_LAST_MESSAGE',
                updater: (last) => {
                  if (last.role !== 'assistant' || last.content.startsWith('Cérebro alterado')) {
                    return last
                  }
                  const currentContent = last.content
                  const newBase = currentContent === '...' ? '' : currentContent

                  if (isToolTraceMessage(last)) {
                    const parsed = splitToolTraceContent(last.content)
                    let traceData: any = null
                    const textPart = parsed?.textPart || ''
                    try {
                      traceData = parsed?.jsonPart ? JSON.parse(parsed.jsonPart) : null
                    } catch {
                      traceData = null
                    }
                    return {
                      ...last,
                      content: buildToolTraceContent(traceData || {}, textPart + token)
                    }
                  }
                  return { ...last, content: newBase + token }
                }
              })

              if (isCallModeRef.current) {
                const cleanTokenForCall = token.split('__MOMAI_ACTIONS__')[0]
                if (cleanTokenForCall !== undefined) {
                  dispatch({
                    type: 'SET_CALL_HISTORY',
                    updater: (prevHistory) => {
                      const last = prevHistory[prevHistory.length - 1]
                      if (last && last.role === 'assistant') {
                        const history = [...prevHistory]
                        const prevContent = history[history.length - 1].content
                        let nextToken = cleanTokenForCall
                        if (prevContent === '...' || prevContent === '') {
                          nextToken = nextToken.replace(/^\s+/, '')
                        }
                        history[history.length - 1] = {
                          ...last,
                          content: (prevContent === '...' ? '' : prevContent) + nextToken
                        }
                        return history
                      }
                      const trimmed = cleanTokenForCall.replace(/^\s+/, '')
                      if (trimmed) {
                        return [
                          ...prevHistory,
                          {
                            id: `assistant-${Date.now()}`,
                            role: 'assistant' as const,
                            content: trimmed
                          }
                        ].slice(-5)
                      }
                      return prevHistory
                    }
                  })
                }
              }
            },
            onStatus: (status) => {
              if (currentThreadRef.current !== messageThreadId) return
              dispatch({
                type: 'UPDATE_LAST_MESSAGE',
                updater: (last) => {
                  if (last.role !== 'assistant') return last
                  const currentActivities = last.activities || []
                  const buscandoIdx = currentActivities.findIndex((a: string) =>
                    a.startsWith('Buscando')
                  )
                  if (buscandoIdx !== -1 && status.startsWith('Buscando')) {
                    const updatedActivities = [...currentActivities]
                    updatedActivities[buscandoIdx] = status
                    return { ...last, activities: updatedActivities }
                  }
                  if (!currentActivities.includes(status)) {
                    return { ...last, activities: [...currentActivities, status] }
                  }
                  return last
                }
              })
            },
            onSources: (sources) => {
              if (currentThreadRef.current !== messageThreadId) return
              dispatch({
                type: 'UPDATE_LAST_MESSAGE',
                updater: (last) => (last.role === 'assistant' ? { ...last, sources } : last)
              })
            },
            onSnippets: (snippets) => {
              if (currentThreadRef.current !== messageThreadId) return
              dispatch({
                type: 'UPDATE_LAST_MESSAGE',
                updater: (last) => (last.role === 'assistant' ? { ...last, snippets } : last)
              })
            },
            onCards: (cards) => {
              if (currentThreadRef.current !== messageThreadId) return
              dispatch({
                type: 'UPDATE_LAST_MESSAGE',
                updater: (last) => (last.role === 'assistant' ? { ...last, cards } : last)
              })
            },
            onToolSteps: (toolSteps) => {
              if (currentThreadRef.current !== messageThreadId) return
              dispatch({
                type: 'UPDATE_LAST_MESSAGE',
                updater: (last) =>
                  last.role === 'assistant' ? { ...last, toolSteps } : last
              })
            },
            onActiveSkill: (skillName) => {
              if (currentThreadRef.current !== messageThreadId) return
              dispatch({
                type: 'UPDATE_LAST_MESSAGE',
                updater: (last) =>
                  last.role === 'assistant' ? { ...last, activeSkill: skillName } : last
              })
            },
            onStructuredResponse: (response) => {
              if (currentThreadRef.current !== messageThreadId) return
              dispatch({
                type: 'UPDATE_LAST_MESSAGE',
                updater: (last) =>
                  last.role === 'assistant' ? { ...last, structuredResponse: response } : last
              })
            },
            onDone: () => {
              if (currentThreadRef.current !== messageThreadId) return
              dispatch({ type: 'SET_LOADING', isLoading: false })
              if (isFirstMessage) {
                const lastMsgs = messagesRef.current
                const assistantReply = lastMsgs[lastMsgs.length - 1]?.content || ''
                generateSessionTitle(messageThreadId, content, assistantReply)
                  .then((title) => {
                    if (title) {
                      window.dispatchEvent(
                        new CustomEvent('momai_session_title_generated', {
                          detail: { threadId: messageThreadId, title }
                        })
                      )
                    }
                  })
                  .catch(console.error)
              }
            },
            onError: (err) => {
              if (currentThreadRef.current !== messageThreadId) return
              dispatch({ type: 'SET_LOADING', isLoading: false })
              dispatch({
                type: 'UPDATE_LAST_MESSAGE',
                updater: (last) => ({ ...last, content: `Erro: ${err}` })
              })
            }
          },
          { ...memoryPayload, signal: abortController.signal }
        )
      } catch (err) {
        if (abortController.signal.aborted) return
        dispatch({ type: 'SET_LOADING', isLoading: false })
        console.error('Erro ao enviar mensagem:', err)
      }
    },
    [threadId, currentThreadRef, messagesRef, dispatch, toolTraceRef, isCallModeRef, setText]
  )

  const handleClear = useCallback(async () => {
    dispatch({ type: 'SET_MESSAGES', messages: [] })
    dispatch({ type: 'SET_SPEAKING', messageId: null })
    dispatch({ type: 'SET_CALL_HISTORY', updater: () => [] })
    toolTraceRef.current = { activeMsgId: null, byToolId: {} }
    window.dispatchEvent(new CustomEvent('momai_clear_history'))
    try {
      await Promise.all([stopVoiceApi(), clearChatHistory(threadId)])
    } catch (err) {
      console.error('Erro ao limpar histórico:', err)
    }
  }, [threadId, dispatch, toolTraceRef])

  const removeMessage = useCallback(
    async (index: number) => {
      const msg = messagesRef.current[index]
      if (msg && msg.id) {
        try {
          await deleteMessageApi(msg.id as any)
        } catch (err) {
          console.error('Erro ao deletar mensagem:', err)
        }
      }
      dispatch({ type: 'UPDATE_MESSAGES', updater: (prev) => prev.filter((_, i) => i !== index) })
    },
    [threadId, dispatch, messagesRef]
  )

  const regenerateMessage = useCallback(
    async (index: number) => {
      const msgs = messagesRef.current
      const assistantMsg = msgs[index]
      if (!assistantMsg || assistantMsg.role !== 'assistant') return

      await stopVoiceApi().catch(() => {})
      dispatch({ type: 'SET_SPEAKING', messageId: null })

      let userPrompt = ''
      for (let i = index - 1; i >= 0; i--) {
        if (msgs[i].role === 'user') {
          userPrompt = msgs[i].content
          break
        }
      }

      if (!userPrompt) return

      await removeMessage(index)
      await sendMessage(userPrompt, false, true)
    },
    [messagesRef, removeMessage, sendMessage, dispatch]
  )

  const speakMessage = useCallback(
    async (content: string, index: number) => {
      const msg = messagesRef.current[index]
      if (!msg || !msg.id) return

      const cleanText = cleanMomaiActions(content)
      if (!cleanText || cleanText === '...') return
      try {
        await stopVoiceApi().catch(() => {})
        await new Promise((resolve) => setTimeout(resolve, 150))
        dispatch({ type: 'SET_SPEAKING', messageId: msg.id })

        let engine: string | undefined
        try {
          const { getTTSServiceRenderer } = await import('../services/ttsService')
          const ttsService = getTTSServiceRenderer()
          const configResponse = await ttsService.getConfig()
          if (configResponse.success && configResponse.data) {
            engine = configResponse.data.engine
          }
        } catch {}

        await speakTextApi(cleanText, engine)
      } catch (err) {
        console.error('Erro ao sintetizar voz:', err)
        dispatch({ type: 'SET_SPEAKING', messageId: null })
      }
    },
    [dispatch, messagesRef]
  )

  const toggleCallMode = useCallback(async () => {
    const newState = !isCallMode
    const prevState = isCallMode
    if (newState) {
      await Promise.allSettled([stopGenerationApi(), stopVoiceApi()])
      dispatch({ type: 'SET_LOADING', isLoading: false })
      dispatch({ type: 'SET_SPEAKING', messageId: null })
    }
    dispatch({ type: 'SET_CALL_MODE', enabled: newState })
    dispatch({ type: 'SET_CALL_HISTORY', updater: () => [] })
    if (!newState) {
      await stopVoice()
    }
    try {
      await setCallModeApi(newState)
    } catch (err) {
      console.error('Erro ao alterar modo chamada:', err)
      dispatch({ type: 'SET_CALL_MODE', enabled: prevState })
      dispatch({ type: 'SET_CALL_HISTORY', updater: () => [] })
    }
  }, [isCallMode, dispatch, stopVoice])

  const handleGraphOption = useCallback(
    (option: string) => {
      dispatch({ type: 'SET_GRAPH_STATE', state: { view: null } })
      if (option.toUpperCase() === 'OK') return
      if (option === 'open_extensions_store') {
        window.dispatchEvent(new CustomEvent('momai_open_extensions'))
        return
      }
      if (option === 'open_settings_ultra') {
        window.dispatchEvent(new CustomEvent('momai_open_settings_ultra'))
        return
      }
      if (option === 'dismiss') return
      sendMessage(option, option.startsWith('__TOOL__:'))
    },
    [dispatch, sendMessage]
  )

  return {
    regenerateMessage,
    sendMessage,
    handleClear,
    removeMessage,
    speakMessage,
    stopGeneration,
    stopVoice,
    toggleCallMode,
    handleGraphOption
  }
}
