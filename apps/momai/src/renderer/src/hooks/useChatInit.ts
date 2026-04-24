import { useEffect } from 'react'
import { fetchChatHistory } from '../services/api'
import { Message } from '../services/api'

interface UseChatInitProps {
  threadId: string
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>
  setIsHistoryLoaded: React.Dispatch<React.SetStateAction<boolean>>
  setThreadId: React.Dispatch<React.SetStateAction<string>>
}

export function useChatInit({
  threadId,
  setMessages,
  setIsHistoryLoaded,
  setThreadId
}: UseChatInitProps) {
  useEffect(() => {
    let retries = 0
    const maxRetries = 5

    const loadHistory = async () => {
      try {
        const history = await fetchChatHistory(threadId)
        const processedHistory = history.map((msg) => ({
          ...msg,
          isGraph: msg.role === 'assistant' && !!msg.graphData
        }))
        setMessages(processedHistory)
        setIsHistoryLoaded(true)
      } catch (err) {
        retries++
        if (retries < maxRetries) {
          const delay = Math.min(500 * Math.pow(1.5, retries), 5000)
          setTimeout(loadHistory, delay)
        } else {
          console.error('Erro ao carregar histórico:', err)
          setIsHistoryLoaded(true)
        }
      }
    }

    loadHistory()
  }, [threadId, setMessages, setIsHistoryLoaded])

  useEffect(() => {
    const handleClear = () => setMessages([])
    const handleNewSession = () => {
      setThreadId(`sessao_${Date.now()}`)
    }

    window.addEventListener('momai_clear_history', handleClear)
    window.addEventListener('momai_new_session', handleNewSession)

    return () => {
      window.removeEventListener('momai_clear_history', handleClear)
      window.removeEventListener('momai_new_session', handleNewSession)
    }
  }, [setMessages, setThreadId])
}
