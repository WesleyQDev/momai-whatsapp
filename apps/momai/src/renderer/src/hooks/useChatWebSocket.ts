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

  useEffect(() => {
    handleWsMessageRef.current = handleWsMessage
  }, [handleWsMessage])

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
        // Create the WebSocket in the renderer's context (window.WebSocket is
        // Chromium's). The contextBridge cannot safely proxy WebSocket objects
        // (methods like .close() are stripped), so we don't use apiWebSocket.
        // SECURITY: the browser WebSocket API does not support custom request
        // headers, so the session token is sent as a `?token=...` query
        // parameter. This is a known limitation: the token will appear in any
        // process or proxy that observes the WS URL. The token is bound to
        // the local Electron session, accepted only on loopback, and rotated
        // on every app restart, which limits the blast radius.
        // TODO(audit-S006): migrate to a sub-protocol header or a post-open
        // auth handshake once we have a way to gate the server on a message
        // sent right after the upgrade.
        const token = window.api.getSessionToken()
        const wsUrl = token
          ? `${WS_URL}${WS_URL.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`
          : WS_URL
        wsRef.current = new WebSocket(wsUrl)
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

      ws.onclose = (event) => {
        if (!isUnmounting) {
          console.debug('[WS] Disconnected, scheduling reconnect...')
          scheduleReconnect()
        }
      }

      ws.onerror = (err) => {
        if (!isBooting) {
          console.error('[WS] Erro de conexao:', err)
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
