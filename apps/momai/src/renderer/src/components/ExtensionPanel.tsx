import { useEffect, useState, useCallback, createElement } from 'react'
import { XMarkIcon, CheckCircleIcon, XCircleIcon, ArrowPathIcon } from '@heroicons/react/24/outline'
import { getRenderer } from './chat/SkillResponseRegistry'
import { useExtensionEvents } from '../hooks/useExtensionEvents'
import { API_URL } from '../constants'
import QRCode from 'qrcode'

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
  const [qrData, setQrData] = useState<string | null>(null)
  const [qrUrl, setQrUrl] = useState<string | null>(null)
  const [connected, setConnected] = useState(false)

  const loadPanel = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await window.api.apiFetch(`${API_URL}${panelEndpoint}`, {
        method: 'GET',
        headers: { Accept: 'application/json' }
      })
      const data = await res.json()
      setResponse(data)
      const sr = data?.structuredResponse?.data
      if (sr?.connected !== undefined) setConnected(sr.connected)
    } catch (err: any) {
      setError(err.message || 'Failed to load panel')
    } finally {
      setLoading(false)
    }
  }, [panelEndpoint])

  useEffect(() => {
    loadPanel()
  }, [loadPanel])

  useEffect(() => {
    if (qrData) {
      QRCode.toDataURL(qrData, { width: 256, margin: 1 }).then(setQrUrl)
    }
  }, [qrData])

  useExtensionEvents({
    onEvent: useCallback((event) => {
      if (event.eventType === 'qr_code') {
        setQrData(event.data?.qr)
      } else if (event.eventType === 'authenticated') {
        setConnected(event.data?.status === 'connected')
        setQrData(null)
        setQrUrl(null)
      } else if (event.eventType === 'connection_status') {
        setConnected(event.data?.status === 'connected')
      }
    }, [])
  })

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
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Connection Status */}
        <div
          className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm ${
            connected ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
          }`}
        >
          {connected ? (
            <CheckCircleIcon className="w-4 h-4 shrink-0" />
          ) : (
            <XCircleIcon className="w-4 h-4 shrink-0" />
          )}
          <span>{connected ? 'Conectado' : 'Desconectado'}</span>
        </div>

        {/* QR Code for authentication */}
        {!connected && qrUrl && (
          <div className="text-center space-y-3">
            <p className="text-xs text-text-muted">
              Abra o WhatsApp no celular e escaneie o QR code
            </p>
            <img
              src={qrUrl}
              alt="QR Code"
              className="mx-auto rounded-xl border border-white/10"
              width={256}
              height={256}
            />
          </div>
        )}

        {!connected && !qrUrl && !loading && (
          <div className="text-center py-4">
            <ArrowPathIcon className="w-6 h-6 text-text-muted animate-spin mx-auto mb-2" />
            <p className="text-xs text-text-muted">Aguardando QR code...</p>
          </div>
        )}

        {/* Structured response from extension */}
        {loading && <div className="text-text-muted text-sm animate-pulse">Carregando...</div>}
        {error && <div className="text-red-400 text-sm">{error}</div>}
        {response?.structuredResponse && (
          <ExtensionPanelRenderer response={response.structuredResponse} />
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
