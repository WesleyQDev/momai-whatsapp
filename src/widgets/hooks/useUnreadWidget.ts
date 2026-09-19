import { useEffect, useRef, useState } from 'react'
import {
  fetchAvatars,
  fetchConnection,
  fetchWidgetHistory,
  groupLatestByConversation,
  WIDGET_HISTORY_POLL_MS,
  type WidgetHistoryMessage
} from '../services/widgetApi'
import { mergeHistoryWithServer } from '../../utils/historySync'
import { useWidgetLiveMessages } from './useWidgetLiveMessages'
import { useWidgetLiveSignal } from './useWidgetLiveSignal'

export interface UnreadRow {
  message: WidgetHistoryMessage
  avatar: string | null
}

interface UnreadWidgetState {
  loading: boolean
  connected: boolean
  total: number
  rows: UnreadRow[]
  error: string
}

const initialState: UnreadWidgetState = {
  loading: true,
  connected: true,
  total: 0,
  rows: [],
  error: ''
}

/**
 * Loads connection status plus the latest message of each conversation,
 * enriching rows with avatar URLs like the conversation list does.
 * Always live, even in edit mode.
 */
export function useUnreadWidget(): UnreadWidgetState {
  const [state, setState] = useState<UnreadWidgetState>(initialState)
  const liveSignal = useWidgetLiveSignal()
  const liveMessages = useWidgetLiveMessages()
  const liveMessagesRef = useRef(liveMessages)
  liveMessagesRef.current = liveMessages

  useEffect(() => {
    let cancelled = false
    async function load(): Promise<void> {
      try {
        const [connection, history] = await Promise.all([fetchConnection(), fetchWidgetHistory(20)])
        if (cancelled) return
        const effective = mergeHistoryWithServer(liveMessagesRef.current, history)
        const latest = groupLatestByConversation(effective, 3)
        const missing = latest.filter((item) => !item.profilePicUrl).map((item) => item.jid)
        const avatars = await fetchAvatars(missing).catch((): Record<string, string> => ({}))
        if (cancelled) return
        setState({
          loading: false,
          connected: connection.connected,
          total: connection.totalMessages,
          rows: latest.map((message) => ({
            message,
            avatar: message.profilePicUrl ?? avatars[message.jid] ?? null
          })),
          error: ''
        })
      } catch (err) {
        if (cancelled) return
        setState((prev) => ({
          ...prev,
          loading: false,
          error: err instanceof Error ? err.message : 'Load failed.'
        }))
      }
    }
    void load()
    const timer = setInterval(() => {
      void load()
    }, WIDGET_HISTORY_POLL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [liveSignal])

  return state
}
