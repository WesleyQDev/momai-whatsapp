import { useEffect, useState, useCallback } from 'react'
import { XMarkIcon } from '@heroicons/react/24/outline'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export default function OverlayView() {
  const [data, setData] = useState<any>(null)

  useEffect(() => {
    document.documentElement.style.setProperty('background', 'transparent', 'important')
    document.body.style.setProperty('background', 'transparent', 'important')
    const root = document.getElementById('root')
    if (root) root.style.setProperty('background', 'transparent', 'important')

    // @ts-ignore
    const removeListener = window.electron.ipcRenderer.on('update-overlay-content', (_, contentData) => {
      setData(contentData)
    })

    // @ts-ignore
    window.electron.ipcRenderer.send('overlay-ready')

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // @ts-ignore
        window.electron.ipcRenderer.send('close-overlay')
      }
    }
    window.addEventListener('keydown', handleEsc)

    return () => {
      removeListener()
      window.removeEventListener('keydown', handleEsc)
    }
  }, [])

  const handleClose = useCallback(() => {
    // @ts-ignore
    window.electron.ipcRenderer.send('close-overlay')
  }, [])

  const handleRespond = useCallback(async (message: string) => {
    try {
      await fetch(`${API_URL}/extensions/whatsapp/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toolName: 'send_message',
          args: { contact: data?.contactJid || data?.contact, message }
        })
      })
    } catch {}
    handleClose()
  }, [data, handleClose])

  if (!data) return <div className="w-screen h-screen bg-transparent" />

  if (data.type === 'whatsapp_notification') {
    const contact = data?.contact || data?.from || 'Desconhecido'
    const message = data?.message || data?.text || ''
    const quickReplies = data?.quickReplies || []

    return (
      <div className="w-screen h-screen flex items-center justify-center bg-transparent select-none" onClick={handleClose}>
        <div
          className="rounded-2xl border border-white/10 bg-zinc-900/95 backdrop-blur-xl shadow-2xl p-5 w-full max-w-md mx-4 animate-fade-in pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
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
            <button onClick={handleClose} className="text-text-muted hover:text-white p-1" style={{ WebkitAppRegion: 'no-drag' } as any}>
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
            <button
              onClick={() => handleRespond('__open_chat__')}
              className="px-3 py-1.5 text-xs rounded-full bg-white/5 text-text-muted hover:text-white hover:bg-white/10 transition-colors"
              style={{ WebkitAppRegion: 'no-drag' } as any}
            >
              ✏️ Responder
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="w-screen h-screen flex justify-end items-start p-4 bg-transparent">
      <div className="bg-black/80 backdrop-blur-xl rounded-xl border border-white/10 overflow-hidden shadow-2xl max-h-[80vh] w-[400px]">
        <div className="p-4 text-white">
          <p className="text-sm">{JSON.stringify(data)}</p>
          <button onClick={handleClose} className="mt-2 text-xs text-text-muted hover:text-white">
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}
