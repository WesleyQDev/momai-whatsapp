import { useEffect } from 'react'
import { fetchChatHistory } from '../services/api'
import type { ChatAction } from './chatReducer'

interface UseChatInitProps {
  threadId: string
  dispatch: React.Dispatch<ChatAction>
}

export function useChatInit({ threadId, dispatch }: UseChatInitProps) {
  useEffect(() => {
    let cancelled = false
    let retries = 0
    const maxRetries = 5

    const loadHistory = async () => {
      try {
        const history = await fetchChatHistory(threadId)
        if (cancelled) return
        const processedHistory = history.map((msg) => ({
          ...msg,
          isGraph: msg.role === 'assistant' && !!msg.graphData
        }))
        dispatch({ type: 'SET_MESSAGES', messages: processedHistory })
        dispatch({ type: 'SET_HISTORY_LOADED', loaded: true })
      } catch (err) {
        if (cancelled) return
        retries++
        if (retries < maxRetries) {
          const delay = Math.min(500 * Math.pow(1.5, retries), 5000)
          setTimeout(loadHistory, delay)
        } else {
          console.error('Erro ao carregar histórico:', err)
          dispatch({ type: 'SET_HISTORY_LOADED', loaded: true })
        }
      }
    }

    loadHistory()

    return () => {
      cancelled = true
    }
  }, [threadId, dispatch])

  useEffect(() => {
    const handleClear = () => dispatch({ type: 'SET_MESSAGES', messages: [] })

    window.addEventListener('momai_clear_history', handleClear)

    return () => {
      window.removeEventListener('momai_clear_history', handleClear)
    }
  }, [dispatch])
}
