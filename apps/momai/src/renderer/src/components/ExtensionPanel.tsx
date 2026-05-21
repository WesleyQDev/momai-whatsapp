import { useEffect, useState, useCallback, createElement } from 'react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { getRenderer } from './chat/SkillResponseRegistry'
import { API_URL } from '../constants'

interface ExtensionPanelProps {
  extensionId: string
  label: string
  icon: string
  panelEndpoint: string
  onClose: () => void
}

export default function ExtensionPanel({
  extensionId,
  label,
  icon,
  panelEndpoint,
  onClose
}: ExtensionPanelProps) {
  const [loading, setLoading] = useState(true)
  const [response, setResponse] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  const loadPanel = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_URL}${panelEndpoint}`, {
        method: 'GET',
        headers: { Accept: 'application/json' }
      })
      const data = await res.json()
      setResponse(data)
    } catch (err: any) {
      setError(err.message || 'Failed to load panel')
    } finally {
      setLoading(false)
    }
  }, [panelEndpoint])

  useEffect(() => {
    loadPanel()
  }, [loadPanel])

  return (
    <div className="w-80 h-full border-l border-white/5 bg-bg/90 backdrop-blur-xl flex flex-col shrink-0">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <div className="flex items-center gap-2">
          <span className="text-lg">{icon}</span>
          <span className="font-medium text-sm">{label}</span>
        </div>
        <button
          onClick={onClose}
          className="text-text-muted hover:text-text p-1 rounded-lg hover:bg-white/5"
        >
          <XMarkIcon className="w-4 h-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {loading && <div className="text-text-muted text-sm animate-pulse">Carregando...</div>}
        {error && <div className="text-red-400 text-sm">{error}</div>}
        {response?.structuredResponse && (
          <ExtensionPanelRenderer response={response.structuredResponse} />
        )}
        {!response?.structuredResponse && response && !error && !loading && (
          <p className="text-text-muted text-sm">Painel indisponivel</p>
        )}
      </div>
    </div>
  )
}

function ExtensionPanelRenderer({ response }: { response: any }) {
  const Renderer = getRenderer(response.type)
  if (Renderer) {
    return createElement(Renderer, { data: response.data })
  }
  return <div className="text-text-muted text-sm">Tipo não suportado: {response.type}</div>
}
