import { useEffect, useState } from 'react'
import { isSameChat } from '../utils/chatJid'

const STORAGE_KEY = 'momai_wa_history_overlay_open'
// Mesmo TTL do worker (15s) com heartbeat de 5s: se o `closed` se perder, a
// conversa some do NOVA junto com a supressão de notificações do worker.
const PRESENCE_TTL_MS = 15 * 1000

/**
 * JIDs com overlay de contatos (chat) aberto neste momento.
 *
 * O panel anuncia `history_overlay_opened/heartbeat/closed` no
 * BroadcastChannel `momai-whatsapp-channel` e espelha em localStorage (para
 * leitura instantânea na montagem). TTL expira sozinho se o overlay fechar
 * sem avisar. Usado pelo widget NOVA para ocultar a conversa que já está
 * sendo vista no chat aberto.
 */
export function useHistoryOverlayPresence(): string[] {
  const [openJids, setOpenJids] = useState<string[]>([])

  useEffect(() => {
    const seen = new Map<string, number>()

    const readStorage = () => {
      try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (!raw) return
        const parsed = JSON.parse(raw)
        const jid = String(parsed?.jid || '')
        const at = Number(parsed?.at || 0)
        if (jid && at) seen.set(jid, at)
      } catch {}
    }

    const refresh = () => {
      const now = Date.now()
      const open: string[] = []
      for (const [jid, at] of seen) {
        if (now - at < PRESENCE_TTL_MS) open.push(jid)
        else seen.delete(jid)
      }
      setOpenJids(open)
    }

    readStorage()
    refresh()

    let bc: BroadcastChannel | null = null
    try {
      bc = new BroadcastChannel('momai-whatsapp-channel')
      bc.onmessage = (event) => {
        const type = String(event.data?.type || '')
        const jid = String(event.data?.data?.jid || event.data?.data?.contactJid || '')
        if (!jid) return
        if (type === 'history_overlay_opened' || type === 'history_overlay_heartbeat') {
          seen.set(jid, Date.now())
          refresh()
        } else if (type === 'history_overlay_closed') {
          seen.delete(jid)
          refresh()
        }
      }
    } catch {}

    const timer = setInterval(() => {
      readStorage()
      refresh()
    }, 5000)

    return () => {
      clearInterval(timer)
      try {
        bc?.close()
      } catch {}
    }
  }, [])

  return openJids
}

/** True quando `jid` tem overlay de contatos aberto (mesmo chat, JIDs equivalentes). */
export function isChatOpenInOverlay(openJids: string[], jid: string): boolean {
  if (!jid) return false
  return openJids.some((open) => isSameChat(open, jid))
}
