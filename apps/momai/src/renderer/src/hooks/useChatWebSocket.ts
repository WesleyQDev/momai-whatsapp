import { useEffect, useRef } from 'react'
import { WS_URL } from '../constants'

interface UseChatWebSocketProps {
  threadId: string
  handleWsMessage: (msg: any) => void
}

export function useChatWebSocket({ threadId, handleWsMessage }: UseChatWebSocketProps) {
  const wsRef = useRef<WebSocket | null>(null)

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
        const jsonObjects = rawData.match(/\{.*?\}(?=\{|$)/g) || [rawData]

        for (const jsonStr of jsonObjects) {
          try {
            const msg = JSON.parse(jsonStr)
            handleWsMessage(msg)
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
        ws?.close()
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
  }, [threadId, handleWsMessage])

  return { wsRef }
}
