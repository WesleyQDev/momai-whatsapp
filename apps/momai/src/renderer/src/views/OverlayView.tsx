import { useEffect, useState } from 'react'
import { createElement } from 'react'
import { getRenderer, hasRenderer } from '../components/chat/SkillResponseRegistry'
import { loadSkillRenderer } from '../components/chat/ExtensionRendererLoader'

export default function OverlayView() {
  const [data, setData] = useState<any>(null)
  const [loadingRenderer, setLoadingRenderer] = useState(false)

  useEffect(() => {
    document.documentElement.style.setProperty('background', 'transparent', 'important')
    document.body.style.setProperty('background', 'transparent', 'important')
    const root = document.getElementById('root')
    if (root) root.style.setProperty('background', 'transparent', 'important')

    const removeListener = window.momaiAPI.onUpdateOverlayContent(async (contentData) => {
      setData((prevData: any) => {
        if (!contentData) return null
        if (!prevData) return contentData
        const prevType = prevData.structuredResponse?.type
        const newType = contentData.structuredResponse?.type
        if (prevType && newType && prevType !== newType) {
          return contentData
        }

        const prevJid = prevData.structuredResponse?.data?.contactJid || prevData.structuredResponse?.data?.contact
        const newJid = contentData.structuredResponse?.data?.contactJid || contentData.structuredResponse?.data?.contact
        const prevMsg = prevData.structuredResponse?.data?.message || prevData.structuredResponse?.data?.text
        const newMsg = contentData.structuredResponse?.data?.message || contentData.structuredResponse?.data?.text
        const prevTs = prevData.structuredResponse?.data?.timestamp
        const newTs = contentData.structuredResponse?.data?.timestamp

        if (prevJid !== newJid || prevMsg !== newMsg || prevTs !== newTs) {
          return contentData
        }

        return {
          ...prevData,
          ...contentData,
          structuredResponse: {
            ...prevData.structuredResponse,
            ...contentData.structuredResponse,
            data: {
              ...prevData.structuredResponse?.data,
              ...contentData.structuredResponse?.data
            }
          }
        }
      })

      const type = contentData?.structuredResponse?.type
      const skillId = contentData?.skillId
      const panelPath = contentData?.panel
      const panelType = contentData?.panelType

      if (type && skillId && panelPath && panelType && !hasRenderer(type)) {
        setLoadingRenderer(true)
        try {
          await loadSkillRenderer(
            skillId,
            { panel: panelPath, panelType },
            `/extensions/${skillId}`
          )
        } catch (err) {
          console.error('[OverlayView] Failed to load skill renderer:', err)
        } finally {
          setLoadingRenderer(false)
        }
      }
    })

    window.momaiAPI.markOverlayReady()

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        window.momaiAPI.closeOverlay()
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
    window.momaiAPI.closeOverlay()
  }

  const handleBackdropClick = (e: React.MouseEvent) => {
    const type = data?.structuredResponse?.type
    if (type && hasRenderer(type)) {
      return
    }
    handleClose()
  }

  if (!data) return <div className="w-screen h-screen bg-transparent" />

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

    if (loadingRenderer) {
      return (
        <div className="w-screen h-screen flex items-center justify-center bg-transparent">
          <div className="rounded-2xl border border-white/10 bg-zinc-900/95 p-4">
            <p className="text-sm text-gray-300">Carregando...</p>
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
