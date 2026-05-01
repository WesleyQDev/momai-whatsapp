import { useEffect, useRef } from 'react'
import { WS_URL } from '../constants'

interface UseChatWebSocketProps {
  threadId: string
  handleWsMessage: (msg: any) => void
}

function extractJsonObjects(text: string): string[] {
  const results: string[] = []
  let depth = 0
  let start = -1
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') {
      if (depth === 0) start = i
      depth++
    } else if (text[i] === '}') {
      depth--
      if (depth === 0 && start >= 0) {
        results.push(text.slice(start, i + 1))
        start = -1
      }
    }
  }
  return results.length ? results : [text]
}

export function useChatWebSocket({ threadId, handleWsMessage }: UseChatWebSocketProps) {
  const wsRef = useRef<WebSocket | null>(null)
  const handleWsMessageRef = useRef(handleWsMessage)
  handleWsMessageRef.current = handleWsMessage

  useEffect(() => {
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null
    let reconnectAttempts = 0
    const maxReconnectAttempts = 15
    let isUnmounting = false
    let isBooting = true

    const bootTimeout = setTimeout(() => {
      isBooting = false
    }, 15000)

    const scheduleReconnect = () => {
      if (isUnmounting || reconnectAttempts >= maxReconnectAttempts) return

      const delay = Math.min(1000 * Math.pow(1.5, reconnectAttempts), 10000)
      reconnectAttempts++

      reconnectTimeout = setTimeout(() => {
        console.debug(`[WS] Reconnecting (attempt ${reconnectAttempts})...`)
        connect()
      }, delay)
    }

    const connect = () => {
      if (isUnmounting) return

      try {
        wsRef.current = new WebSocket(WS_URL)
      } catch (e) {
        console.error('Erro ao criar WebSocket:', e)
        scheduleReconnect()
        return
      }

      const ws = wsRef.current

      ws.onopen = () => {
        console.debug('[WS] Voice WebSocket connected')
        window.dispatchEvent(new CustomEvent('momai_socket_connected'))
        reconnectAttempts = 0
        if (wsRef.current) {
          wsRef.current.send(JSON.stringify({ type: 'session_sync', thread_id: threadId }))
        }
      }

      ws.onmessage = (event) => {
        const rawData = event.data
        const jsonObjects = extractJsonObjects(rawData)

        for (const jsonStr of jsonObjects) {
          try {
            const msg = JSON.parse(jsonStr)
            handleWsMessageRef.current(msg)
          } catch (e) {
            console.error('Erro ao processar JSON via WS:', e, jsonStr)
          }
        }
      }

      ws.onclose = () => {
        if (!isUnmounting) {
          console.debug('[WS] Disconnected, scheduling reconnect...')
          scheduleReconnect()
        }
      }

      ws.onerror = (err) => {
        if (!isBooting) {
          console.error('Erro no WebSocket:', err)
        }
      }
    }

    connect()

    return () => {
      isUnmounting = true
      clearTimeout(bootTimeout)
      if (reconnectTimeout) clearTimeout(reconnectTimeout)
      if (wsRef.current) {
        wsRef.current.close()
      }
    }
  }, [threadId])

  return { wsRef }
}
