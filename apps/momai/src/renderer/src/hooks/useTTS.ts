import { useState, useEffect, useCallback } from 'react'
import { getTTSServiceRenderer, TTSEngine, TTSVoice, TTSConfig } from '../services/ttsService'

export function useTTS() {
  const [isReady, setIsReady] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [currentEngine, setCurrentEngine] = useState<TTSEngine>('kokoro')
  const [availableVoices, setAvailableVoices] = useState<TTSVoice[]>([])
  const [config, setConfig] = useState<TTSConfig | null>(null)
  const [error, setError] = useState<string | null>(null)

  const ttsService = getTTSServiceRenderer()

  useEffect(() => {
    // Carregar configuração inicial
    const loadInitialConfig = async () => {
      try {
        const configResponse = await ttsService.getConfig()
        if (configResponse.success && configResponse.data) {
          setConfig(configResponse.data)
          setCurrentEngine(configResponse.data.engine)
        }
        setIsReady(true)
      } catch (err) {
        console.error('[useTTS] Erro ao carregar configuração:', err)
        setError(String(err))
        setIsReady(true)
      }
    }

    loadInitialConfig()

    // Setup event listeners
    const handleSpeakingStart = () => setIsSpeaking(true)
    const handleSpeakingEnd = () => setIsSpeaking(false)
    const handleError = (err: string) => setError(err)
    const handleEngineChanged = (engine: TTSEngine) => {
      setCurrentEngine(engine)
      loadVoicesForEngine(engine)
    }

    ttsService.on('speaking-start', handleSpeakingStart)
    ttsService.on('speaking-end', handleSpeakingEnd)
    ttsService.on('error', handleError)
    ttsService.on('engine-changed', handleEngineChanged)

    return () => {
      ttsService.off('speaking-start', handleSpeakingStart)
      ttsService.off('speaking-end', handleSpeakingEnd)
      ttsService.off('error', handleError)
      ttsService.off('engine-changed', handleEngineChanged)
    }
  }, [])

  const loadVoicesForEngine = useCallback(async (engine: TTSEngine) => {
    try {
      const response = await ttsService.getVoices(engine)
      if (response.success && response.data) {
        setAvailableVoices(response.data)
      }
    } catch (err) {
      console.error('[useTTS] Erro ao carregar vozes:', err)
      setError(String(err))
    }
  }, [ttsService])

  const speak = useCallback(async (text: string, engine?: TTSEngine) => {
    try {
      setError(null)
      const response = await ttsService.speak(text, engine)
      if (!response.success) {
        setError(response.error || 'Erro ao falar')
      }
      return response.success
    } catch (err) {
      const errorMessage = String(err)
      setError(errorMessage)
      return false
    }
  }, [ttsService])

  const stop = useCallback(async () => {
    try {
      const response = await ttsService.stop()
      return response.success
    } catch (err) {
      console.error('[useTTS] Erro ao parar:', err)
      return false
    }
  }, [ttsService])

  const setEngine = useCallback(async (engine: TTSEngine) => {
    try {
      setError(null)
      const response = await ttsService.setEngine(engine)
      if (response.success) {
        setCurrentEngine(engine)
        await loadVoicesForEngine(engine)
        
        // Atualizar configuração local
        if (config) {
          setConfig({ ...config, engine })
        }
      }
      return response.success
    } catch (err) {
      setError(String(err))
      return false
    }
  }, [ttsService, loadVoicesForEngine, config])

  const setVoice = useCallback(async (voice: string) => {
    try {
      setError(null)
      const response = await ttsService.setVoice(voice)
      if (response.success && config) {
        setConfig({ ...config, voice })
      }
      return response.success
    } catch (err) {
      setError(String(err))
      return false
    }
  }, [ttsService, config])

  const setSpeed = useCallback(async (speed: number) => {
    try {
      setError(null)
      const response = await ttsService.setSpeed(speed)
      if (response.success && config) {
        setConfig({ ...config, speed })
      }
      return response.success
    } catch (err) {
      setError(String(err))
      return false
    }
  }, [ttsService, config])

  const setEnabled = useCallback(async (enabled: boolean) => {
    try {
      setError(null)
      const response = await ttsService.setEnabled(enabled)
      if (response.success && config) {
        setConfig({ ...config, enabled })
      }
      return response.success
    } catch (err) {
      setError(String(err))
      return false
    }
  }, [ttsService, config])

  const getEngines = useCallback(async () => {
    try {
      const response = await ttsService.getEngines()
      return response.success ? response.data : []
    } catch (err) {
      console.error('[useTTS] Erro ao obter engines:', err)
      return []
    }
  }, [ttsService])

  const getEngineInfo = useCallback(async (engine: TTSEngine) => {
    try {
      const response = await ttsService.getEngineInfo(engine)
      return response.success ? response.data : null
    } catch (err) {
      console.error('[useTTS] Erro ao obter info da engine:', err)
      return null
    }
  }, [ttsService])

  const refreshVoices = useCallback(async (engine?: TTSEngine) => {
    const targetEngine = engine || currentEngine
    await loadVoicesForEngine(targetEngine)
  }, [currentEngine, loadVoicesForEngine])

  return {
    // Estado
    isReady,
    isSpeaking,
    currentEngine,
    availableVoices,
    config,
    error,

    // Ações
    speak,
    stop,
    setEngine,
    setVoice,
    setSpeed,
    setEnabled,
    getEngines,
    getEngineInfo,
    refreshVoices,

    // Utilitários
    clearError: () => setError(null)
  }
}