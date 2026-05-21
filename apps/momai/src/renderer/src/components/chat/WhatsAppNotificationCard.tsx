import { XMarkIcon } from '@heroicons/react/24/outline'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export default function WhatsAppNotificationCard({ data }: { data: any }) {
  if (!data) return null

  const contact = data?.contact || data?.from || 'Desconhecido'
  const message = data?.message || data?.text || ''
  const quickReplies = data?.quickReplies || []
  const contactJid = data?.contactJid || data?.contact || ''
  const onClose = data?.onClose || (() => {})
  const onSend = data?.onSend

  const handleRespond = async (label: string) => {
    if (onSend) {
      await onSend(label)
      return
    }

    let finalMessage = label
    if (!label.startsWith('__')) {
      try {
        const res = await fetch(`${API_URL}/extensions/llm/complete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: `Mensagem recebida: "${message}". Intencao do usuario: ${label}. Gere APENAS o texto da resposta para enviar no WhatsApp, sem explicacoes.`
          })
        })
        const d = await res.json()
        finalMessage = (d?.text || '').trim() || label
      } catch {}
    }

    try {
      await fetch(`${API_URL}/extensions/whatsapp/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toolName: 'send_message',
          args: { contact: contactJid, message: finalMessage }
        })
      })
    } catch {}
    onClose()
  }

  return (
    <div
      className="rounded-2xl border border-white/10 bg-zinc-900/95 backdrop-blur-xl shadow-2xl p-5 w-full max-w-md mx-4"
      style={{ WebkitAppRegion: 'drag' } as any}
    >
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center text-lg">
          {data?.contactAvatar || '👤'}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white truncate">{contact}</p>
          <p className="text-xs text-text-muted">WhatsApp</p>
        </div>
        <button onClick={onClose} className="text-text-muted hover:text-white p-1" style={{ WebkitAppRegion: 'no-drag' } as any}>
          <XMarkIcon className="w-4 h-4" />
        </button>
      </div>
      <p className="text-sm text-gray-300 mb-4">{message}</p>
      <div className="flex flex-wrap gap-2">
            {quickReplies.map((reply: string, i: number) => (
              <button
                key={i}
                onClick={() => handleRespond(reply)}
                className="px-3 py-1.5 text-xs rounded-full bg-accent/10 text-accent hover:bg-accent/20 transition-colors border border-accent/20"
                style={{ WebkitAppRegion: 'no-drag' } as any}
              >
                {reply}
              </button>
            ))}
      </div>
    </div>
  )
}
