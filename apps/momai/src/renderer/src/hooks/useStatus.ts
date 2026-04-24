import { useState, useEffect, useCallback } from 'react'
import { StatusData, fetchStatus, updateMode, fetchInitStatus } from '../services/api'

const STALLED_TIMEOUT_MS = 20000

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
  if (message.startsWith('Downloading model (')) {
    return message.replace('Downloading model', 'Baixando modelo')
  }
  if (message.startsWith('Model downloaded (')) {
    return message.replace('Model downloaded', 'Modelo baixado')
  }
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
  const [visualProgress, setVisualProgress] = useState<number>(2)

  const isBrainReady = statusInfo?.brain_ready ?? false
  const isBrainLoading = statusInfo?.is_loading ?? false
  const isReady = initProgress >= 100 && !isBooting

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

      // Only finish boot when the model is fully ready.
      // Guard: during a mode change (isUpdating), the OLD backend may still
      // respond with brain_ready=true. Ignore that stale response.
      if (data.status === 'ok' && data.brain_ready && !data.is_loading && !isUpdating) {
        setIsBooting(false)
        setInitProgress(100)
      } else if (isUpdating || data.is_loading || !data.brain_ready) {
        if (!isBooting) {
          setVisualProgress(2)
          setInitProgress(0)
        }
        setIsBooting(true)
        if (data.is_loading || !data.brain_ready) {
          setInitProgress((prev) => Math.max(prev, 5))
        }
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
  }, [isBooting, isUpdating])

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
    // NOTE: We intentionally do NOT set isBooting=false here.
    // Only the status poll (checkStatus) should end the boot phase,
    // because it checks brain_ready + !is_loading — which covers
    // Ultra mode where the llamaserver model loads AFTER Python init.
    // @ts-ignore
    const removeIpcListener = window.api?.onInitProgress?.((data) => {
      setInitMessage(translateMessage(data.message))
      setInitProgress((prev) => Math.max(prev, data.progress))
      setLastProgressTime(Date.now())
      setIsStalled(false)
      setIsRetrying(false)

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
        const parsed = parseInt(match[1])
        setInitProgress((prev) => Math.max(prev, parsed))
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
    setVisualProgress(2)
    setInitMessage('Aplicando novo nível de IA...')
    try {
      await updateMode(mode)
      // @ts-ignore
      await window.api.restartBackend()
      // Removed window.location.href reload to prevent state loss and "flash"
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

  // Watchdog: detect stalled progress and check /init-status for errors
  useEffect(() => {
    if (!isBooting || initProgress >= 100 || isStalled || isRetrying) return undefined

    const interval = setInterval(async () => {
      const timeSinceLastProgress = Date.now() - lastProgressTime

      if (timeSinceLastProgress < STALLED_TIMEOUT_MS) return

      // Only check init-status if backend HTTP is reachable
      if (!backendOnline) {
        setIsStalled(true)
        setInitMessage('Isso está demorando mais que o normal...')
        return
      }

      try {
        const data = await fetchInitStatus()

        if (data.error) {
          setIsStalled(true)
          window.dispatchEvent(
            new CustomEvent('momai_bootstrap_error', {
              detail: {
                type: 'startup_failed',
                message: 'Backend initialization failed',
                details: data.error
              }
            })
          )
          return
        }

        if (data.stage === 'error') {
          setIsStalled(true)
          window.dispatchEvent(
            new CustomEvent('momai_bootstrap_error', {
              detail: {
                type: 'startup_failed',
                message: data.message || 'Backend initialization failed',
                details: data.message
              }
            })
          )
          return
        }

        setIsStalled(true)
        setInitMessage('Isso está demorando mais que o normal...')
      } catch {
        setIsStalled(true)
        setInitMessage('Isso está demorando mais que o normal...')
      }
    }, 5000)

    return () => clearInterval(interval)
  }, [isBooting, initProgress, lastProgressTime, isStalled, isRetrying, backendOnline])

  // Visual progress simulation
  // Timing targets: 0-30% in ~20s, 30-70% in ~30s, 70-96% in ~60s
  // Interval is 200ms, so 5 ticks/second.
  useEffect(() => {
    const interval = setInterval(() => {
      setVisualProgress((prev) => {
        // Phase 1: Backend says we're fully done (brain_ready + !is_loading)
        // Rush to 100% quickly (~1-2s) so the user isn't waiting unnecessarily
        if (!isBooting && initProgress >= 100) {
          if (prev >= 100) return 100
          const remaining = 100 - prev
          const finishStep = Math.max(2.5, remaining * 0.18)
          return Math.min(100, prev + finishStep)
        }

        // Phase 2: Still loading – simulate realistic fake progress
        if (initProgress < 100 || isBooting) {
          // If already past the loading cap (e.g. Phase 1 was running), hold position
          if (prev >= 96.4) return prev

          // Pure autonomous crawl — ignores backend initProgress jumps
          // to prevent the bar from rushing when IPC sends large values
          // 0-30% in 20s = 30% / 100 ticks = 0.30/tick
          // 30-70% in 30s = 40% / 150 ticks = 0.267/tick
          // 70-96% in 60s = 26% / 300 ticks = 0.087/tick
          let autoStep: number
          if (prev < 30) {
            autoStep = 0.3
          } else if (prev < 70) {
            autoStep = 0.267
          } else if (prev < 85) {
            autoStep = 0.087
          } else if (prev < 92) {
            autoStep = 0.05
          } else {
            autoStep = 0.02
          }

          // Cap at 96.4 so display shows max "96%" while loading
          return Math.min(96.4, prev + autoStep)
        }

        return prev
      })
    }, 200)

    return () => clearInterval(interval)
  }, [isBooting, initProgress])

  const resetVisualProgress = useCallback(() => {
    setVisualProgress(2)
  }, [])

  return {
    statusInfo,
    localMode,
    isOnline,
    isUpdating,
    hasUpdate,
    initMessage,
    initProgress,
    visualProgress,
    isReady,
    isBooting,
    isStalled,
    isRetrying,
    refreshStatus: checkStatus,
    changeMode,
    resetVisualProgress
  }
}
