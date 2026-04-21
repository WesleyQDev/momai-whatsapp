import { useCallback } from 'react'
import { Message } from '../services/api'
import {
  splitToolTraceContent,
  buildToolTraceContent,
  parseStructuredToolResult,
  toCompactJson,
  extractToolQuery,
  findLastAssistantIndex,
  createAssistantMessageId
} from '../utils/chatUtils'

interface UseChatHandlersProps {
  messagesRef: React.MutableRefObject<Message[]>
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>
  setSpeakingIndex: React.Dispatch<React.SetStateAction<number | null>>
  setVoiceStatus: React.Dispatch<React.SetStateAction<'idle' | 'listening' | 'processing'>>
  setVoiceEngineLoading: React.Dispatch<
    React.SetStateAction<{
      loading: boolean
      pendingAutoTts: boolean
      message: string
    } | null>
  >
  setCallHistory: React.Dispatch<React.SetStateAction<{ id: string; role: 'user' | 'assistant'; content: string }[]>>
  setGraphState: React.Dispatch<React.SetStateAction<any>>
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>
  toolTraceRef: React.MutableRefObject<{
    activeMsgId: string | null
    byToolId: Record<string, { msgId: string; stepIndex: number }>
  }>
  isCallModeRef: React.MutableRefObject<boolean>
  isGraphOpenRef: React.MutableRefObject<boolean>
  currentGraphOptionsRef: React.MutableRefObject<string[]>
  handleGraphOption: (option: string) => void
}

export function useChatHandlers({
  messagesRef,
  setMessages,
  setSpeakingIndex,
  setVoiceStatus,
  setVoiceEngineLoading,
  setCallHistory,
  setGraphState,
  setIsLoading,
  toolTraceRef,
  isCallModeRef,
  isGraphOpenRef,
  currentGraphOptionsRef,
  handleGraphOption
}: UseChatHandlersProps) {
  
  const handleWsMessage = useCallback((msg: any) => {
    if (msg.type === 'init_progress') {
      window.dispatchEvent(new CustomEvent('momai_init_progress', { detail: msg.data }))
    } else if (msg.type === 'extensions_sync') {
      window.dispatchEvent(new CustomEvent('momai_extensions_sync', { detail: msg.data }))
    } else if (msg.type === 'setup_progress') {
      window.dispatchEvent(new CustomEvent('momai_setup_progress', { detail: msg.data }))
    } else if (msg.type === 'setup_complete') {
      window.dispatchEvent(new CustomEvent('momai_setup_complete', { detail: msg.data }))
    } else if (msg.type === 'navigate') {
      window.dispatchEvent(new CustomEvent('momai_navigate', { detail: msg.data }))
    } else if (msg.type === 'open_settings') {
      window.dispatchEvent(new CustomEvent('momai_open_settings', { detail: msg.data }))
    } else if (msg.type === 'set_theme') {
      window.dispatchEvent(new CustomEvent('momai_set_theme', { detail: msg.data }))
    } else if (msg.type === 'tts_start') {
      const idx = findLastAssistantIndex(messagesRef.current)
      setSpeakingIndex(idx >= 0 ? idx : null)
    } else if (msg.type === 'tts_stop') {
      setSpeakingIndex(null)
    } else if (msg.type === 'voice_bands') {
      window.dispatchEvent(new CustomEvent('momai_voice_bands', { detail: msg.bands }))
    } else if (msg.type === 'voice_volume') {
      window.dispatchEvent(new CustomEvent('momai_voice_volume', { detail: msg.volumes }))
    } else if (msg.type === 'voice_status') {
      setVoiceStatus(msg.status)
    } else if (msg.type === 'voice_engine_loading') {
      const data = msg.data || {}
      setVoiceEngineLoading({
        loading: Boolean(data.loading),
        pendingAutoTts: Boolean(data.pending_auto_tts),
        message:
          String(data.message || '').trim() ||
          'Motor de voz carregando... vou reproduzir automaticamente quando estiver pronto.'
      })

      if (!data.loading) {
        setTimeout(() => {
          setVoiceEngineLoading(null)
        }, 3500)
      }
    } else if (msg.type === 'tool_start') {
      const toolId = msg.data?.id || `${msg.data?.name || 'tool'}-${Date.now()}`
      setMessages((prev) => {
        const updated = [...prev]
        const fallbackMsgId = `tool-trace:${Date.now()}`

        const ensureTraceTarget = () => {
          const active = toolTraceRef.current.activeMsgId
          if (active) {
            const activeIdx = updated.findIndex((m) => m.id === active)
            if (activeIdx >= 0) return { idx: activeIdx, msgId: active }
          }

          const latestAssistantIdx = findLastAssistantIndex(updated)
          if (latestAssistantIdx >= 0) {
            const existingId = updated[latestAssistantIdx].id || fallbackMsgId
            updated[latestAssistantIdx] = { ...updated[latestAssistantIdx], id: existingId }
            return { idx: latestAssistantIdx, msgId: existingId }
          }

          updated.push({ id: fallbackMsgId, role: 'assistant', content: '...' })
          return { idx: updated.length - 1, msgId: fallbackMsgId }
        }

        const { idx, msgId } = ensureTraceTarget()
        const current = updated[idx]
        const parsed = splitToolTraceContent(current.content)

        let traceData: any = {
          kind: 'tool_trace',
          steps: [],
          startedAt: new Date().toISOString()
        }
        let textPart = parsed?.textPart || ''
        try {
          if (parsed?.jsonPart) {
            traceData = JSON.parse(parsed.jsonPart)
          }
        } catch {
          traceData = { kind: 'tool_trace', steps: [], startedAt: new Date().toISOString() }
        }

        if (!parsed) {
          textPart = current.content && current.content !== '...' ? current.content : ''
        }

        const steps = Array.isArray(traceData.steps) ? [...traceData.steps] : []
        const stepIndex = steps.length
        steps.push({
          id: toolId,
          name: msg.data?.name || 'tool',
          status: 'running',
          args: toCompactJson(msg.data?.args),
          query: extractToolQuery(msg.data?.args),
          startedAt: new Date().toISOString()
        })

        const nextTrace = {
          ...traceData,
          kind: 'tool_trace',
          steps,
          status: 'running',
          updatedAt: new Date().toISOString()
        }

        updated[idx] = {
          ...current,
          id: msgId,
          content: buildToolTraceContent(nextTrace, textPart)
        }

        toolTraceRef.current.activeMsgId = msgId
        toolTraceRef.current.byToolId[toolId] = { msgId, stepIndex }

        return updated
      })
    } else if (msg.type === 'tool_result') {
      const toolId = msg.data?.id
      const status = msg.data?.status === 'error' ? 'error' : 'done'
      const ref = toolId ? toolTraceRef.current.byToolId[toolId] : null
      const parsedOutcome = parseStructuredToolResult(msg.data?.result)

      setMessages((prev) => {
        const updated = [...prev]
        let idx = ref ? updated.findIndex((m) => m.id === ref.msgId) : -1
        if (idx < 0) {
          idx = findLastAssistantIndex(updated)
        }
        if (idx >= 0) {
          const current = updated[idx]
          const parsed = splitToolTraceContent(current.content)
          const textPart = parsed?.textPart || ''
          let traceData: any = null

          try {
            traceData = parsed?.jsonPart ? JSON.parse(parsed.jsonPart) : null
          } catch {
            traceData = null
          }

          const steps = Array.isArray(traceData?.steps) ? [...traceData.steps] : []
          const stepIndex = typeof ref?.stepIndex === 'number' ? ref.stepIndex : -1

          if (stepIndex >= 0 && steps[stepIndex]) {
            steps[stepIndex] = {
              ...steps[stepIndex],
              name: msg.data?.name || steps[stepIndex].name || 'tool',
              status,
              result: parsedOutcome.result || undefined,
              error: parsedOutcome.error || undefined,
              finishedAt: new Date().toISOString()
            }
          }

          const hasRunning = steps.some((s: any) => s.status === 'running')
          const nextTrace = {
            ...(traceData || {}),
            kind: 'tool_trace',
            steps,
            status: hasRunning ? 'running' : status,
            updatedAt: new Date().toISOString()
          }

          updated[idx] = {
            ...current,
            content: buildToolTraceContent(nextTrace, textPart)
          }

          if (!hasRunning) {
            toolTraceRef.current.activeMsgId = null
          }
          if (toolId) {
            delete toolTraceRef.current.byToolId[toolId]
          }
          return updated
        }

        const fallbackTrace = {
          kind: 'tool_trace',
          status,
          steps: [
            {
              id: toolId,
              name: msg.data?.name || 'tool',
              status,
              args: toCompactJson(msg.data?.args),
              query: extractToolQuery(msg.data?.args),
              result: parsedOutcome.result || undefined,
              error: parsedOutcome.error || undefined,
              finishedAt: new Date().toISOString()
            }
          ]
        }
        const fallbackAssistantIdx = findLastAssistantIndex(updated)
        if (fallbackAssistantIdx >= 0) {
          const existing = updated[fallbackAssistantIdx]
          updated[fallbackAssistantIdx] = {
            ...existing,
            content: buildToolTraceContent(
              fallbackTrace,
              existing.content && existing.content !== '...' ? existing.content : ''
            )
          }
          return updated
        }

        return [
          ...updated,
          { role: 'assistant', content: buildToolTraceContent(fallbackTrace, '') }
        ]
      })
    } else if (msg.type === 'fortscript_event') {
      window.dispatchEvent(new CustomEvent('momai_fortscript_event', { detail: msg }))
    } else if (msg.type === 'graph_open') {
      const optionsMap = msg.data.options_map || msg.data.optionsMap
      const newGraphState = {
        view: msg.data.view,
        content: msg.data.content,
        options: msg.data.options || [],
        optionsMap,
        uiSchema: msg.data.ui_schema
      }

      if (msg.data.view === 'side' || msg.data.view === 'center') {
        setGraphState(newGraphState)
      } else {
        setGraphState({
          view: null,
          content: '',
          options: [],
          optionsMap: {},
          bypass_wake_word: false
        })
      }

      setMessages((prev) => {
        const updated = [...prev]
        const lastIdx = updated.length - 1
        const lastMsg = updated[lastIdx]

        if (lastIdx >= 0 && lastMsg.role === 'assistant' && !lastMsg.isGraph) {
          updated[lastIdx] = {
            ...lastMsg,
            isGraph: true,
            graphData: newGraphState
          }
          return updated
        }

        if (
          lastMsg?.role === 'assistant' &&
          lastMsg.isGraph &&
          lastMsg.content === msg.data.content
        ) {
          return prev
        }

        return [
          ...prev,
          {
            role: 'assistant',
            content: msg.data.content,
            isGraph: true,
            graphData: newGraphState
          }
        ]
      })
    } else if (msg.type === 'graph_close') {
      setGraphState((prev: any) => ({ ...prev, view: null }))
    } else if (msg.type === 'model_changed') {
      window.dispatchEvent(new CustomEvent('ai_model_changed', { detail: msg.data.new_mode }))
    } else if (msg.type === 'model_change_start') {
      window.dispatchEvent(new CustomEvent('ai_model_change_start', { detail: msg.data.mode }))
    } else if (msg.type === 'model_change_progress') {
      window.dispatchEvent(new CustomEvent('ai_model_change_progress', { detail: msg.data }))
    } else if (msg.type === 'voice_partial') {
      if (isCallModeRef.current && msg.text) {
        setCallHistory((prev) => {
          const last = prev[prev.length - 1]
          if (last && last.role === 'user') {
            const updated = [...prev]
            updated[updated.length - 1] = { ...last, content: msg.text }
            return updated
          }
          return [
            ...prev,
            { id: `user-${Date.now()}`, role: 'user' as const, content: msg.text }
          ].slice(-5)
        })
      }
    } else if (msg.type === 'reminders_updated') {
      window.dispatchEvent(new CustomEvent('momai_reminders_updated'))
    } else if (msg.type === 'reminder_trigger') {
      if ((window as any).electron) {
        (window as any).electron.ipcRenderer.send('show-notification', {
          title: `\ud83d\udd14 Lembrete: ${msg.data.title}`,
          body: msg.data.content || ''
        })
      }
    } else if (msg.type === 'user') {
      const content = msg.content.toLowerCase()

      if (isCallModeRef.current) {
        setCallHistory((prev) => {
          const last = prev[prev.length - 1]
          if (last && last.role === 'user') {
            const updated = [...prev]
            updated[updated.length - 1] = { ...last, content: msg.content }
            return updated
          }
          return [
            ...prev,
            { id: `user-${Date.now()}`, role: 'user' as const, content: msg.content }
          ].slice(-5)
        })
      }

      if (isGraphOpenRef.current && currentGraphOptionsRef.current.length > 0) {
        const matchedOption = currentGraphOptionsRef.current.find(
          (opt) => content.includes(opt.toLowerCase()) || opt.toLowerCase().includes(content)
        )

        if (matchedOption) {
          handleGraphOption(matchedOption)
          return
        }

        if (content.includes('sim') || content.includes('confirmar')) {
          const yesOpt = currentGraphOptionsRef.current.find(
            (o) => o.toLowerCase() === 'sim' || o.toLowerCase() === 'confirmar'
          )
          if (yesOpt) {
            handleGraphOption(yesOpt)
            return
          }
        }
      }

      setMessages((prev) => [...prev, { role: 'user', content: msg.content }])
      const assistantMsgId = createAssistantMessageId()
      toolTraceRef.current.activeMsgId = assistantMsgId
      setMessages((prev) => [
        ...prev,
        { id: assistantMsgId, role: 'assistant', content: '...' }
      ])
      setIsLoading(true)
    } else if (msg.type === 'assistant') {
      const { data } = msg

      if (data.status) {
        const statusText =
          data.status === 'thinking'
            ? 'Pensando...'
            : data.status === 'responding'
              ? null
              : data.status

        if (statusText) {
          setMessages((prev) => {
            const updated = [...prev]
            const lastIdx = findLastAssistantIndex(updated)
            if (lastIdx >= 0) {
              const currentActivities = updated[lastIdx].activities || []
              if (!currentActivities.includes(statusText)) {
                updated[lastIdx] = {
                  ...updated[lastIdx],
                  activities: [...currentActivities, statusText]
                }
              }
            }
            return updated
          })
        }
      }

      if (data.token) {
        if (isCallModeRef.current) {
          const cleanTokenForCall = data.token.split('__MOMAI_ACTIONS__')[0]
          if (cleanTokenForCall !== undefined) {
             setCallHistory((prevHistory) => {
              const last = prevHistory[prevHistory.length - 1]
              if (last && last.role === 'assistant') {
                const history = [...prevHistory]
                history[history.length - 1] = {
                  ...last,
                  content: last.content + cleanTokenForCall
                }
                return history
              }
              return [
                ...prevHistory,
                {
                  id: `assistant-${Date.now()}`,
                  role: 'assistant' as const,
                  content: cleanTokenForCall
                }
              ].slice(-5)
            })
          }
        }

        setMessages((prev) => {
          const updated = [...prev]
          let lastIdx = -1

          const active = toolTraceRef.current.activeMsgId
          if (active) {
            lastIdx = updated.findIndex((m) => m.id === active)
          }

          if (lastIdx < 0) {
            lastIdx = findLastAssistantIndex(updated)
          }

          if (lastIdx >= 0) {
            const current = updated[lastIdx]
            const isToolTrace = current.content.startsWith('TOOL_TRACE::')

            if (isToolTrace) {
              const parsed = splitToolTraceContent(current.content)
              if (parsed) {
                updated[lastIdx] = {
                  ...current,
                  content: buildToolTraceContent(
                    JSON.parse(parsed.jsonPart),
                    parsed.textPart + data.token
                  )
                }
              }
            } else {
              updated[lastIdx] = {
                ...current,
                content: (current.content === '...' ? '' : current.content) + data.token
              }
            }
          }
          return updated
        })
      }

      if (data.tool_steps) {
        setMessages((prev) => {
          const updated = [...prev]
          const lastIdx = findLastAssistantIndex(updated)
          if (lastIdx >= 0) {
            updated[lastIdx] = { ...updated[lastIdx], toolSteps: data.tool_steps }
          }
          return updated
        })
      }

      if (data.active_skill) {
        setMessages((prev) => {
          const updated = [...prev]
          const lastIdx = findLastAssistantIndex(updated)
          if (lastIdx >= 0) {
            updated[lastIdx] = { ...updated[lastIdx], activeSkill: data.active_skill }
          }
          return updated
        })
      }

      if (data.structured_response) {
        setMessages((prev) => {
          const updated = [...prev]
          const lastIdx = findLastAssistantIndex(updated)
          if (lastIdx >= 0) {
            updated[lastIdx] = { ...updated[lastIdx], structuredResponse: data.structured_response }
          }
          return updated
        })
      }

      if (data.done) {
        setIsLoading(false)
      }
    }
  }, [
    messagesRef,
    setMessages,
    setSpeakingIndex,
    setVoiceStatus,
    setVoiceEngineLoading,
    setCallHistory,
    setGraphState,
    setIsLoading,
    toolTraceRef,
    isCallModeRef,
    isGraphOpenRef,
    currentGraphOptionsRef,
    handleGraphOption
  ])

  return { handleWsMessage }
}
