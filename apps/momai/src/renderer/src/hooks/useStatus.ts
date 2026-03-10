import { useState, useEffect, useCallback } from 'react'
import { StatusData, fetchStatus, updateMode, fetchInitStatus } from '../services/api'

const STALLED_TIMEOUT_MS = 60000

const MESSAGE_TRANSLATIONS: Record<string, string> = {
  'Creating isolated environment...': 'Criando ambiente isolado...',
  'Installing dependencies...': 'Instalando dependências...',
  'System protocols initialized': 'Inicializando protocolos do sistema...',
  'Database connected': 'Conectando ao banco de dados...',
  'AI modules loaded': 'Carregando módulos de IA...',
  'Indexing tools...': 'Indexando ferramentas...',
  'Indexing skills...': 'Indexando habilidades...',
  'Applying settings...': 'Aplicando configurações...',
  'Resource monitor enabled': 'Monitor de recursos ativado',
  'Starting voice detector...': 'Iniciando detector de voz...',
  'Finalizing brain connection...': 'Finalizando conexão com o cérebro...',
  'Syncing local voice...': 'Sincronizando voz local...',
  'System ready.': 'Sistema pronto.'
}

function translateMessage(message: string): string {
  return MESSAGE_TRANSLATIONS[message] || message
}

export function useStatus() {
  const [statusInfo, setStatusInfo] = useState<StatusData | null>(null)
  const [localMode, setLocalMode] = useState<string>('waiting')
  const [isOnline, setIsOnline] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)
  const [hasUpdate, setHasUpdate] = useState(false)

  const [initMessage, setInitMessage] = useState<string>('Iniciando...')
  const [initProgress, setInitProgress] = useState<number>(0)
  const [isBooting, setIsBooting] = useState(true)
  const [retryCount, setRetryCount] = useState(0)
  const [hasReceivedWSEvent, setHasReceivedWSEvent] = useState(false)
  const [backendOnline, setBackendOnline] = useState(false)
  const [isStalled, setIsStalled] = useState(false)
  const [isRetrying, setIsRetrying] = useState(false)
  const [lastProgressTime, setLastProgressTime] = useState<number>(Date.now())

  const isBrainReady = statusInfo?.brain_ready ?? false
  const isBrainLoading = statusInfo?.is_loading ?? false
  const isReady = initProgress >= 100 && !isBooting && !isBrainLoading

  // Polling de fallback para progresso de init
  const checkInitProgress = useCallback(async () => {
    try {
      const data = await (fetchInitStatus() as any)

      setInitMessage(translateMessage(data.message))
      setInitProgress((prev) => Math.max(prev, data.progress))
    } catch {
      // Silent fail
    }
  }, []) // Removed initProgress from deps to avoid interval restarts

  const checkStatus = useCallback(async () => {
    try {
      const data = await fetchStatus()
      setStatusInfo(data)
      setLocalMode(data.mode)
      setIsOnline(data.status === 'ok')
      setBackendOnline(true)

      // Evita encerrar boot antes do modelo estar realmente pronto
      if (data.status === 'ok' && data.brain_ready && !data.is_loading) {
        setIsBooting(false)
        setInitProgress(100)
      } else if (data.is_loading) {
        setInitProgress((prev) => Math.max(prev, 50))
      }

      setRetryCount(0)

      if (data.setup.local_installed && data.setup.installed_version && data.setup.latest_version) {
        setHasUpdate(data.setup.installed_version !== data.setup.latest_version)
      }
    } catch (error) {
      if (!isBooting) {
        console.error('Erro ao buscar status:', error)
      }
      setStatusInfo(null)
      setIsOnline(false)
      setRetryCount((prev) => prev + 1)
    }
  }, [isBooting]) // Removed retryCount from deps to avoid infinite loop

  useEffect(() => {
    const handleInitProgress = (e: any) => {
      const { message, progress } = e.detail
      setHasReceivedWSEvent(true)
      setInitMessage(translateMessage(message))
      setInitProgress((prev) => Math.max(prev, progress))
      setLastProgressTime(Date.now())
      setIsStalled(false)
      setIsRetrying(false)
    }

    window.addEventListener('momai_init_progress', handleInitProgress)

    // Listen for Core IPC progress (faster than WS/HTTP polling)
    // @ts-ignore
    const removeIpcListener = window.api?.onInitProgress?.((data) => {
      setInitMessage(translateMessage(data.message))
      setInitProgress((prev) => Math.max(prev, data.progress))
      setLastProgressTime(Date.now())
      setIsStalled(false)
      setIsRetrying(false)

      // Se recebemos progresso do backend, ele definitivamente está rodando
      if (!backendOnline) {
        setBackendOnline(true)
        window.dispatchEvent(new CustomEvent('momai_backend_ready'))
      }

    })

    // Listen for backend ready signal
    // @ts-ignore
    const removeOnlineListener = window.api?.onBackendOnline?.(() => {
      setBackendOnline(true)
      setLastProgressTime(Date.now())
      setIsStalled(false)
      window.dispatchEvent(new CustomEvent('momai_backend_ready'))
    })

    // Listen for retry events
    // @ts-ignore
    const removeRetryListener = window.api?.onBackendRetry?.(() => {
      setIsRetrying(true)
      setInitMessage('Reiniciando...')
    })

    // Listen for AI model change events
    const handleModelChangeStart = () => {
      setIsBooting(true)
      setInitProgress(5)
      setInitMessage('Inicializando troca de modelo...')
    }

    const handleModelChangeProgress = (e: any) => {
      const { status } = e.detail
      setInitMessage(translateMessage(status))

      // Parse "(X%)" from status string if present
      const match = status.match(/\((\d+)%\)/)
      if (match) {
        setInitProgress(parseInt(match[1]))
      }
    }

    window.addEventListener('ai_model_change_start', handleModelChangeStart)
    window.addEventListener('ai_model_change_progress', handleModelChangeProgress)

    return () => {
      window.removeEventListener('momai_init_progress', handleInitProgress)
      window.removeEventListener('ai_model_change_start', handleModelChangeStart)
      window.removeEventListener('ai_model_change_progress', handleModelChangeProgress)
      if (removeIpcListener) removeIpcListener()
      if (removeOnlineListener) removeOnlineListener()
      if (removeRetryListener) removeRetryListener()
    }
  }, [backendOnline])

  const changeMode = async (mode: string) => {
    if (mode === localMode) return
    window.dispatchEvent(new CustomEvent('ai_model_change_start', { detail: mode }))
    setLocalMode(mode)
    setIsUpdating(true)
    setIsBooting(true)
    setInitProgress(5)
    setInitMessage('Aplicando novo nível de IA...')
    try {
      await updateMode(mode)
      // @ts-ignore
      await window.api.restartBackend()
      window.location.href = window.location.pathname + '#/'
    } catch (error) {
      console.error('Erro ao trocar modo:', error)
    } finally {
      setIsUpdating(false)
    }
  }

  useEffect(() => {
    let statusInterval: NodeJS.Timeout
    let initInterval: NodeJS.Timeout

    const startPolling = () => {
      // Tentativa proativa imediata mesmo se backendOnline for falso
      // Isso resolve o caso onde o sinal foi enviado antes do hook montar
      checkStatus()
      checkInitProgress()

      if (!backendOnline) return

      const pollInterval = isBooting || (initProgress >= 100 && !isReady) ? 2000 : 8000
      statusInterval = setInterval(checkStatus, pollInterval)
    }

    if (backendOnline && isBooting && initProgress < 100) {
      initInterval = setInterval(checkInitProgress, 1500)
    }

    startPolling()
    return () => {
      clearInterval(statusInterval)
      if (initInterval) clearInterval(initInterval)
    }
  }, [checkStatus, checkInitProgress, isBooting, backendOnline])

  // Detectar progresso estagnado
  useEffect(() => {
    if (isBooting && initProgress < 100 && !isStalled) {
      const interval = setInterval(() => {
        const timeSinceLastProgress = Date.now() - lastProgressTime
        if (timeSinceLastProgress > STALLED_TIMEOUT_MS && !isRetrying) {
          setIsStalled(true)
          setInitMessage('Isso está demorando mais que o normal...')
        }
      }, 5000)
      return () => clearInterval(interval)
    }
    return undefined
  }, [isBooting, initProgress, lastProgressTime, isStalled, isRetrying])

  return {
    statusInfo,
    localMode,
    isOnline,
    isUpdating,
    hasUpdate,
    initMessage,
    initProgress,
    isReady,
    isBooting,
    isStalled,
    isRetrying,
    refreshStatus: checkStatus,
    changeMode
  }
}
