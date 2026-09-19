import { useEffect, useRef, useState } from 'react'
import {
  fetchAvatars,
  fetchWidgetHistory,
  WIDGET_HISTORY_POLL_MS,
  type WidgetHistoryMessage
} from '../services/widgetApi'
import { mergeHistoryWithServer } from '../../utils/historySync'
import { useWidgetLiveMessages } from './useWidgetLiveMessages'
import { useWidgetLiveSignal } from './useWidgetLiveSignal'

interface LastMessageState {
  loading: boolean
  error: string
  last: WidgetHistoryMessage | null
  avatar: string | null
}

/**
 * Loads the single most recent message with its sender photo,
 * mirroring the conversation list resolution.
 */
export function useLastMessageWidget(): LastMessageState {
  const [state, setState] = useState<LastMessageState>({
    loading: true,
    error: '',
    last: null,
    avatar: null
  })
  const liveSignal = useWidgetLiveSignal()
  const liveMessages = useWidgetLiveMessages()
  const liveMessagesRef = useRef(liveMessages)
  liveMessagesRef.current = liveMessages

  useEffect(() => {
    let cancelled = false
    async function load(): Promise<void> {
      try {
        const items = await fetchWidgetHistory(5)
        const effective = mergeHistoryWithServer(liveMessagesRef.current, items)
        const last = effective[0] ?? null
        let avatar: string | null = last?.profilePicUrl ?? null
        if (last && !avatar) {
          const avatars = await fetchAvatars([last.jid]).catch((): Record<string, string> => ({}))
          avatar = avatars[last.jid] ?? null
        }
        if (cancelled) return
        setState({ loading: false, error: '', last, avatar })
      } catch (err) {
        if (cancelled) return
        setState({
          loading: false,
          error: err instanceof Error ? err.message : 'Load failed.',
          last: null,
          avatar: null
        })
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
