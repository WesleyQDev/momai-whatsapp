import { useEffect, useState } from 'react'
import { createElement } from 'react'
import { getRenderer, registerRenderer } from '../components/chat/SkillResponseRegistry'
import WhatsAppNotificationCard from '../components/chat/WhatsAppNotificationCard'

registerRenderer('whatsapp_notification', WhatsAppNotificationCard)

export default function OverlayView() {
  const [data, setData] = useState<any>(null)

  useEffect(() => {
    document.documentElement.style.setProperty('background', 'transparent', 'important')
    document.body.style.setProperty('background', 'transparent', 'important')
    const root = document.getElementById('root')
    if (root) root.style.setProperty('background', 'transparent', 'important')

    // @ts-ignore
    const removeListener = window.electron.ipcRenderer.on(
      'update-overlay-content',
      (_, contentData) => {
        setData(contentData)
      }
    )

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

  const handleClose = () => {
    ;(window as any).api?.reinstateEconomySleep?.()
    // @ts-ignore
    window.electron.ipcRenderer.send('close-overlay')
  }

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (data?.structuredResponse?.type === 'whatsapp_notification') {
      // Bloqueia clique no backdrop para WhatsApp
      return
    }
    handleClose()
  }

  if (!data) return <div className="w-screen h-screen bg-transparent" />

  // Render structured responses generically via SkillResponseRegistry
  if (data?.structuredResponse) {
    const Renderer = getRenderer(data.structuredResponse.type)
    if (Renderer) {
      return (
        <div
          className="w-screen h-screen flex items-center justify-center bg-transparent p-4 box-border overflow-hidden"
          onClick={handleBackdropClick}
        >
          <div className="max-h-full flex flex-col min-h-0" onClick={(e) => e.stopPropagation()}>
            {createElement(Renderer, {
              data: {
                ...data.structuredResponse.data,
                onClose: handleClose,
                onSend: data.structuredResponse.data?.onSend
              }
            })}
          </div>
        </div>
      )
    }
  }

  return (
    <div
      className="w-screen h-screen flex items-center justify-center bg-transparent select-none"
      onClick={handleClose}
    >
      <div
        className="rounded-2xl border border-white/10 bg-zinc-900/95 backdrop-blur-xl shadow-2xl p-5 w-full max-w-md mx-4"
        onClick={(e) => e.stopPropagation()}
        style={{ WebkitAppRegion: 'drag' } as any}
      >
        <p className="text-sm text-gray-300">{JSON.stringify(data)}</p>
        <button
          onClick={handleClose}
          className="mt-3 text-xs text-text-muted hover:text-white px-3 py-1 rounded-lg bg-white/5"
          style={{ WebkitAppRegion: 'no-drag' } as any}
        >
          Fechar
        </button>
      </div>
    </div>
  )
}
