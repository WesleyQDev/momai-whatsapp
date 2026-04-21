import { useCallback } from 'react'
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
import { createAssistantMessageId, isToolTraceMessage, splitToolTraceContent, buildToolTraceContent } from '../utils/chatUtils'
import { cleanMomaiActions } from '../utils/text'

interface UseChatActionsProps {
  threadId: string
  currentThreadRef: React.MutableRefObject<string>
  messagesRef: React.MutableRefObject<Message[]>
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>
  setSpeakingIndex: React.Dispatch<React.SetStateAction<number | null>>
  setCallHistory: React.Dispatch<React.SetStateAction<any[]>>
  toolTraceRef: React.MutableRefObject<any>
  setGraphState: React.Dispatch<React.SetStateAction<any>>
  isCallMode: boolean
  setIsCallMode: React.Dispatch<React.SetStateAction<boolean>>
  isCallModeRef: React.MutableRefObject<boolean>
  setText: React.Dispatch<React.SetStateAction<string>>
}

export function useChatActions({
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
}: UseChatActionsProps) {
  const buildInjectedMemory = useCallback(async (content: string) => {
    const query = content.trim()
    if (!query || query.length < 3) {
      return { memory_context: undefined as string | undefined, memory_sources: undefined as Source[] | undefined }
    }

    try {
      const hits = await searchMemory(query, 6)
      if (!hits.length) {
        return { memory_context: undefined, memory_sources: undefined }
      }

      const unique = new Map<string, typeof hits[number]>()
      for (const hit of hits) {
        if (!unique.has(hit.note_id)) unique.set(hit.note_id, hit)
      }

      const selected = Array.from(unique.values()).slice(0, 4)
      const sections = selected
        .map((hit) => {
          const text = (hit.text || '').trim()
          if (!text) return ''
          return `--- [TITULO DA NOTA: ${String(hit.title || 'Nota').toUpperCase()}] ---\n${text}\n`
        })
        .filter(Boolean)

      const memory_context = sections.length
        ? `CONHECIMENTO (NOTAS LOCAIS):\n${sections.join('\n')}`
        : undefined

      const memory_sources: Source[] = selected.map((hit) => ({
        url: `momai://note/${hit.note_id}`,
        title: `Nota: ${hit.title || 'Sem título'}`,
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
    } catch (err) {
      console.error('Erro ao parar geração:', err)
    } finally {
      setIsLoading(false)
    }
  }, [setIsLoading])

  const stopVoice = useCallback(async () => {
    try {
      await stopVoiceApi()
    } catch (err) {
      console.error('Erro ao parar voz:', err)
    } finally {
      setSpeakingIndex(null)
    }
  }, [setSpeakingIndex])

  const sendMessage = useCallback(
    async (content: string, isSilent: boolean = false, skipUserMessage: boolean = false) => {
      if (!content.trim()) return

      if (!isSilent && !skipUserMessage) {
        const userMessage: Message = { role: 'user', content }
        setMessages((prev) => [...prev, userMessage])

        if (isCallModeRef.current) {
          setCallHistory((prev) =>
            [
              ...prev,
              { id: `user-${Date.now()}`, role: 'user' as const, content }
            ].slice(-5)
          )
        }
      }

      setText('')

      if (isSilent) {
        try {
          const memoryPayload = await buildInjectedMemory(content)
          await sendChatMessage(content, threadId, {
            onToken: () => {},
            onStatus: () => {},
            onSources: () => {},
            onSnippets: () => {},
            onCards: () => {},
            onToolSteps: () => {},
            onDone: () => {},
            onError: (err) => console.error('[SilentTool] Error:', err)
          }, memoryPayload)
        } catch (err) {
          console.error('[SilentTool] Error:', err)
        }
        return
      }

      setIsLoading(true)
      toolTraceRef.current = { activeMsgId: null, byToolId: {} }
      
      const assistantMsgId = createAssistantMessageId()
      toolTraceRef.current.activeMsgId = assistantMsgId
      setMessages((prev) => [
        ...prev,
        { id: assistantMsgId, role: 'assistant', content: '...' }
      ])

      const messageThreadId = threadId
      const isFirstMessage = messagesRef.current.length <= 1

      try {
        const memoryPayload = await buildInjectedMemory(content)
        await sendChatMessage(content, threadId, {
          onToken: (token) => {
            if (currentThreadRef.current !== messageThreadId) return
            setMessages((prev) => {
              const updated = [...prev]
              const lastIdx = updated.length - 1
              if (
                updated[lastIdx]?.role === 'assistant' &&
                !updated[lastIdx].content.startsWith('Cérebro alterado')
              ) {
                const currentContent = updated[lastIdx].content
                const newBase = currentContent === '...' ? '' : currentContent

                if (isToolTraceMessage(updated[lastIdx])) {
                  const parsed = splitToolTraceContent(updated[lastIdx].content)
                  let traceData: any = null
                  const textPart = parsed?.textPart || ''
                  try {
                    traceData = parsed?.jsonPart ? JSON.parse(parsed.jsonPart) : null
                  } catch {
                    traceData = null
                  }
                  updated[lastIdx] = {
                    ...updated[lastIdx],
                    content: buildToolTraceContent(traceData || {}, textPart + token)
                  }
                } else {
                  updated[lastIdx] = {
                    ...updated[lastIdx],
                    content: newBase + token
                  }
                }
                return updated
              }
              return updated
            })

            if (isCallModeRef.current) {
              const cleanTokenForCall = token.split('__MOMAI_ACTIONS__')[0]
              if (cleanTokenForCall !== undefined) {
                setCallHistory((prevHistory) => {
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
                    return [...prevHistory, { id: `assistant-${Date.now()}`, role: 'assistant' as const, content: trimmed }].slice(-5)
                  }
                  return prevHistory
                })
              }
            }
          },
          onStatus: (status) => {
            if (currentThreadRef.current !== messageThreadId) return
            setMessages((prev) => {
              const updated = [...prev]
              const lastIdx = updated.length - 1
              if (lastIdx >= 0 && updated[lastIdx].role === 'assistant') {
                const currentActivities = updated[lastIdx].activities || []
                const buscandoIdx = currentActivities.findIndex((a: string) => a.startsWith('Buscando'))
                if (buscandoIdx !== -1 && status.startsWith('Buscando')) {
                  const updatedActivities = [...currentActivities]
                  updatedActivities[buscandoIdx] = status
                  updated[lastIdx] = { ...updated[lastIdx], activities: updatedActivities }
                } else if (!currentActivities.includes(status)) {
                  updated[lastIdx] = { ...updated[lastIdx], activities: [...currentActivities, status] }
                }
              }
              return updated
            })
          },
          onSources: (sources) => {
            if (currentThreadRef.current !== messageThreadId) return
            setMessages((prev) => {
              const updated = [...prev]
              const lastIdx = updated.length - 1
              if (lastIdx >= 0 && updated[lastIdx].role === 'assistant') {
                updated[lastIdx] = { ...updated[lastIdx], sources }
              }
              return updated
            })
          },
          onSnippets: (snippets) => {
            if (currentThreadRef.current !== messageThreadId) return
            setMessages((prev) => {
              const updated = [...prev]
              const lastIdx = updated.length - 1
              if (lastIdx >= 0 && updated[lastIdx].role === 'assistant') {
                updated[lastIdx] = { ...updated[lastIdx], snippets }
              }
              return updated
            })
          },
          onCards: (cards) => {
            if (currentThreadRef.current !== messageThreadId) return
            setMessages((prev) => {
              const updated = [...prev]
              const lastIdx = updated.length - 1
              if (lastIdx >= 0 && updated[lastIdx].role === 'assistant') {
                updated[lastIdx] = { ...updated[lastIdx], cards }
              }
              return updated
            })
          },
          onToolSteps: (toolSteps) => {
            if (currentThreadRef.current !== messageThreadId) return
            setMessages((prev) => {
              const updated = [...prev]
              const lastIdx = updated.length - 1
              if (lastIdx >= 0 && updated[lastIdx].role === 'assistant') {
                updated[lastIdx] = { ...updated[lastIdx], toolSteps }
              }
              return updated
            })
          },
          onActiveSkill: (skillName) => {
            if (currentThreadRef.current !== messageThreadId) return
            setMessages((prev) => {
              const updated = [...prev]
              const lastIdx = updated.length - 1
              if (lastIdx >= 0 && updated[lastIdx].role === 'assistant') {
                updated[lastIdx] = { ...updated[lastIdx], activeSkill: skillName }
              }
              return updated
            })
          },
          onStructuredResponse: (response) => {
            if (currentThreadRef.current !== messageThreadId) return
            setMessages((prev) => {
              const updated = [...prev]
              const lastIdx = updated.length - 1
              if (lastIdx >= 0 && updated[lastIdx].role === 'assistant') {
                updated[lastIdx] = { ...updated[lastIdx], structuredResponse: response }
              }
              return updated
            })
          },
          onDone: () => {
            if (currentThreadRef.current !== messageThreadId) return
            setIsLoading(false)
            if (isFirstMessage) {
              const lastMsgs = messagesRef.current
              const assistantReply = lastMsgs[lastMsgs.length - 1]?.content || ''
              generateSessionTitle(messageThreadId, content, assistantReply).then((title) => {
                if (title) {
                  window.dispatchEvent(new CustomEvent('momai_session_title_generated', { detail: { threadId: messageThreadId, title } }))
                }
              }).catch(console.error)
            }
          },
          onError: (err) => {
            if (currentThreadRef.current !== messageThreadId) return
            setIsLoading(false)
            setMessages((prev) => {
              const updated = [...prev]
              const lastIdx = updated.length - 1
              if (lastIdx >= 0) {
                updated[lastIdx].content = `Erro: ${err}`
              }
              return updated
            })
          }
        }, memoryPayload)
      } catch (err) {
        setIsLoading(false)
        console.error('Erro ao enviar mensagem:', err)
      }
    },
    [threadId, currentThreadRef, messagesRef, setMessages, setIsLoading, toolTraceRef, setCallHistory, isCallModeRef, setText]
  )

  const handleClear = useCallback(async () => {
    setMessages([])
    setSpeakingIndex(null)
    setCallHistory([])
    toolTraceRef.current = { activeMsgId: null, byToolId: {} }
    window.dispatchEvent(new CustomEvent('momai_clear_history'))
    try {
      await Promise.all([stopVoiceApi(), clearChatHistory(threadId)])
    } catch (err) {
      console.error('Erro ao limpar histórico:', err)
    }
  }, [threadId, setMessages, setSpeakingIndex, setCallHistory, toolTraceRef])

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
      setMessages((prev) => prev.filter((_, i) => i !== index))
    },
    [threadId, setMessages, messagesRef]
  )

  const regenerateMessage = useCallback(
    async (index: number) => {
      const msgs = messagesRef.current
      const assistantMsg = msgs[index]
      if (!assistantMsg || assistantMsg.role !== 'assistant') return

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
    [messagesRef, removeMessage, sendMessage]
  )

  const speakMessage = useCallback(async (content: string, index: number) => {
    const cleanText = cleanMomaiActions(content)
    if (!cleanText) return
    try {
      setSpeakingIndex(index)
      await speakTextApi(cleanText)
    } catch (err) {
      console.error('Erro ao sintetizar voz:', err)
      setSpeakingIndex(null)
    }
  }, [setSpeakingIndex])

  const toggleCallMode = useCallback(async () => {
    const newState = !isCallMode
    if (newState) {
      await Promise.allSettled([stopGenerationApi(), stopVoiceApi()])
      setIsLoading(false)
      setSpeakingIndex(null)
    }
    setIsCallMode(newState)
    setCallHistory([])
    if (!newState) {
      await stopVoice()
    }
    try {
      await setCallModeApi(newState)
    } catch (err) {
      console.error('Erro ao alterar modo chamada:', err)
    }
  }, [isCallMode, setIsCallMode, setCallHistory, stopVoice, setIsLoading, setSpeakingIndex])

  const handleGraphOption = useCallback(
    (option: string) => {
      setGraphState((prev: any) => ({ ...prev, view: null }))
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
    [setGraphState, sendMessage]
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
