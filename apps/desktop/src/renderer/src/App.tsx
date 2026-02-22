import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import LateralBar from './components/LateralBar'
import { useChat } from './hooks/useChat'
import { useStatus } from './hooks/useStatus'
import SettingsCard from './components/floating/SettingsCard'
import UpdateToast from './components/floating/UpdateToast'
import GraphInterface from './components/GraphInterface'
import TitleBar from './components/TitleBar'
import RemindersSidebar from './components/chat/RemindersSidebar'
import ConfirmationCard from './components/floating/ConfirmationCard'
import OnboardingCard from './components/floating/OnboardingCard'
import TutorialTour from './components/floating/TutorialTour'
import AutoUpdateCard from './components/floating/AutoUpdateCard'
import logo from './assets/icon.gif'

import MainViewRenderer from './components/MainViewRenderer'
import { fetchExtensions, fetchSettings, SettingsData } from './services/api'
import { useI18n } from './i18n'

const WelcomeScreen = ({ onComplete }: { onComplete: () => void }) => {
  const [version] = useState('0.3.7')
  const [fading, setFading] = useState(false)

  useEffect(() => {
    // Start fade-out 600ms before the total 2s duration
    const fadeTimer = setTimeout(() => {
      setFading(true)
    }, 1400)

    const completeTimer = setTimeout(() => {
      onComplete()
    }, 2000)

    return () => {
      clearTimeout(fadeTimer)
      clearTimeout(completeTimer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      className="fixed inset-0 z-[9999] bg-bg flex flex-col items-center justify-center"
      style={{
        transition: 'opacity 0.6s ease-out',
        opacity: fading ? 0 : 1,
        pointerEvents: fading ? 'none' : 'auto',
      }}
    >
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 bg-bg" />
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-accent/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-accent/5 rounded-full blur-[120px]" />
      </div>

      <div className="relative flex flex-col items-center animate-[fadeIn_0.5s_ease-out]">
        <div className="relative mb-8">
          <div className="absolute inset-0 bg-violet-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '2s' }} />
          <img
            src={logo}
            alt="MomAI"
            className="w-36 h-36 object-contain relative z-10 drop-shadow-2xl animate-[bounce_2s_ease-in-out_infinite]"
          />
        </div>

        <h1 className="text-3xl font-bold text-text mb-3 tracking-wide">
          Bem vind<span className="text-violet-400">o</span> a <span className="text-violet-400">MomAI</span>
        </h1>

        <p className="text-lg text-violet-400 font-medium mb-4">
          Sua assistente local
        </p>

        {version && (
          <p className="text-xs text-text-muted/50 font-mono">
            Versão {version}
          </p>
        )}
      </div>
    </div>
  )
}

function App(): React.JSX.Element {
  const [showWelcome, setShowWelcome] = useState(true)
  const { setLocale } = useI18n()
  const navigate = useNavigate()
  const location = useLocation()

  const chat = useChat()
  const { graphState, handleGraphOption, closeGraph, clearHistory } = chat
  const { localMode, statusInfo, hasUpdate, initMessage, initProgress, isBooting, isReady, isOnline, isStalled, isRetrying } =
    useStatus()
  const [showSettings, setShowSettings] = useState(false)
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [showTutorial, setShowTutorial] = useState(false)
  const [settingsTab, setSettingsTab] = useState<
    'general' | 'brain' | 'voice' | 'economy' | 'updates'
  >('general')
  const [isCompact, setIsCompact] = useState(window.innerWidth < 850)
  const [extensions, setExtensions] = useState<any[]>([])
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  const [settings, setSettings] = useState<SettingsData | null>(null)
  const [bootstrapError, setBootstrapError] = useState<{type: string; message: string; details?: string} | null>(null)
  const [pendingOnboardingSettings, setPendingOnboardingSettings] = useState<Record<string, any> | null>(null)
  const [firstLaunchChecked, setFirstLaunchChecked] = useState(false)
  const [onboardingAttempted, setOnboardingAttempted] = useState(false)

  // Overlay Helper
  useEffect(() => {
    const checkAndTriggerOverlay = async () => {
      if (graphState.view) {
        const state = await window.electron.ipcRenderer.invoke('get-window-state')
        // Se a janela principal estiver minimizada ou oculta, envia para overlay
        if (state.minimized || !state.visible) {
          window.electron.ipcRenderer.send('open-overlay', graphState)
        } else {
          // Se janela visivel, garante que overlay fecha (opcional)
          window.electron.ipcRenderer.send('close-overlay')
        }
      } else {
        window.electron.ipcRenderer.send('close-overlay')
      }
    }
    checkAndTriggerOverlay()
  }, [graphState])

  // Listen for bootstrap errors
  useEffect(() => {
    // @ts-ignore
    const remove = window.electron.ipcRenderer.on('bootstrap-error', (error: {type: string; message: string; details?: string}) => {
      setBootstrapError(error)
    })
    return () => {
      remove()
    }
  }, [])

  // Check if this is a first launch and show onboarding immediately
  // Uses invoke (request/response) instead of events to avoid timing issues
  useEffect(() => {
    const checkFirstLaunch = async () => {
      try {
        const firstLaunch = await window.api?.isFirstLaunch?.()
        if (firstLaunch) {
          console.log('[App] First launch detected, showing onboarding immediately')
          setShowOnboarding(true)
          setOnboardingAttempted(true)
        }
      } catch (err) {
        console.error('[App] Failed to check first launch:', err)
      } finally {
        setFirstLaunchChecked(true)
      }
    }
    checkFirstLaunch()
  }, [])

  // Proactive onboarding trigger when booting starts (0%)
  useEffect(() => {
    if (isBooting && initProgress === 0 && !showOnboarding && !settingsLoaded && firstLaunchChecked) {
      // Re-verify if we should show onboarding if we are stuck at 0% and nothing is shown
      window.api?.isFirstLaunch?.().then((firstLaunch) => {
        if (firstLaunch && !showOnboarding) {
          setShowOnboarding(true)
          setOnboardingAttempted(true)
        }
      })
    }
  }, [isBooting, initProgress, showOnboarding, settingsLoaded, firstLaunchChecked])

  // Flush pending onboarding settings when backend comes online
  useEffect(() => {
    if (isOnline && pendingOnboardingSettings) {
      console.log('[App] Backend is online, flushing pending onboarding settings...')
      const flush = async () => {
        try {
          const { api: apiService } = await import('./services/api')
          await apiService.patch('/settings', pendingOnboardingSettings)
          window.dispatchEvent(new CustomEvent('momai_settings_sync', { detail: pendingOnboardingSettings }))
          console.log('[App] Pending onboarding settings saved successfully')
        } catch (err) {
          console.error('[App] Failed to save pending onboarding settings, retrying...', err)
          // Will retry next time isOnline changes
          return
        }
        setPendingOnboardingSettings(null)
      }
      flush()
    }
  }, [isOnline, pendingOnboardingSettings])

  // Trigger app-ready when app is fully ready (replaces SplashScreen onFinished)
  useEffect(() => {
    if (isReady && settingsLoaded && !showOnboarding && !bootstrapError) {
      window.electron.ipcRenderer.send('app-ready')
    }
  }, [isReady, settingsLoaded, showOnboarding, bootstrapError])

  // Listen for actions from Overlay
  useEffect(() => {
    // @ts-ignore
    const remove = window.electron.ipcRenderer.on('trigger-action', (_, action) => {
      handleGraphOption(action)
    })
    return () => {
      remove()
    }
  }, [handleGraphOption])

  const openSettings = (tab: 'general' | 'brain' | 'voice' | 'economy' | 'updates' = 'general') => {
    setSettingsTab(tab)
    setShowSettings(true)
  }

  const triggerClearHistory = () => {
    setShowClearConfirm(true)
  }

  const confirmClearHistory = () => {
    clearHistory()
    setShowClearConfirm(false)
  }

  // Sincroniza configurações e decide se mostra onboarding/tutorial
  useEffect(() => {
    if (!isOnline || settingsLoaded) return

    const syncLocale = async () => {
      try {
        const data = await fetchSettings()
        setSettings(data)
        if (data.locale) {
          setLocale(data.locale as any)
        }

        if (data && data.onboarding_completed === false) {
          setShowOnboarding(true)
        }
        setSettingsLoaded(true)

        // Carrega extensões agora que sabemos que o backend responde
        const exts = await fetchExtensions()
        setExtensions(exts)
      } catch (err) {
        console.error('Retrying settings sync...', err)
      }
    }

    syncLocale()
  }, [isOnline, settingsLoaded, setLocale])

  // Sincroniza configurações via evento global
  useEffect(() => {
    const handleSync = (e: any) => {
      if (e.detail) {
        setSettings(e.detail)
      }
    }
    window.addEventListener('momai_settings_sync', handleSync)
    return () => window.removeEventListener('momai_settings_sync', handleSync)
  }, [])

  // AUDIO FALLBACK PLAYER (Plays audio if backend cannot use PortAudio)
  useEffect(() => {
    let audioCtx: AudioContext | null = null
    let nextStartTime = 0

    const handleAudioChunk = (_: any, base64Data: string) => {
      try {
        if (!audioCtx) {
          audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
          nextStartTime = audioCtx.currentTime
        }

        // Decode base64 to Float32Array
        const binary = atob(base64Data)
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
        const samples = new Float32Array(bytes.buffer)

        // Create buffer and play
        const audioBuffer = audioCtx.createBuffer(1, samples.length, 24000)
        audioBuffer.getChannelData(0).set(samples)

        const source = audioCtx.createBufferSource()
        source.buffer = audioBuffer
        source.connect(audioCtx.destination)

        // Scheduling to avoid clicks
        const startTime = Math.max(nextStartTime, audioCtx.currentTime)
        source.start(startTime)
        nextStartTime = startTime + audioBuffer.duration
      } catch (err) {
        console.error('Audio fallback player error:', err)
      }
    }

    const remove = window.electron.ipcRenderer.on('play-audio-chunk', handleAudioChunk)
    
    return () => {
      remove()
      if (audioCtx) audioCtx.close()
    }
  }, [])

  useEffect(() => {
    const savedTheme = localStorage.getItem('momai_theme') || 'dark'
    document.documentElement.setAttribute('data-theme', savedTheme)

    const handleResize = () => setIsCompact(window.innerWidth < 850)
    window.addEventListener('resize', handleResize)

    // Event listeners only need to be attached once
    const handleSync = (e: any) => setExtensions(e.detail)
    window.addEventListener('momai_extensions_sync', handleSync)

    const handleOpenExtensions = () => {
      navigate('/extensions', { state: { tab: 'store' } })
    }
    window.addEventListener('momai_open_extensions', handleOpenExtensions)

    const handleNavigate = (e: any) => {
      const detail = e.detail || {}
      if (detail.path) {
        navigate(detail.path, detail.state ? { state: detail.state } : undefined)
      }
    }
    window.addEventListener('momai_navigate', handleNavigate)

    const handleOpenSettings = (e: any) => {
      const tab = e.detail?.tab || 'general'
      openSettings(tab)
    }
    window.addEventListener('momai_open_settings', handleOpenSettings)

    const handleSetTheme = (e: any) => {
      const theme = e.detail?.theme
      if (theme === 'dark' || theme === 'light') {
        localStorage.setItem('momai_theme', theme)
        document.documentElement.setAttribute('data-theme', theme)
      }
    }
    window.addEventListener('momai_set_theme', handleSetTheme)

    return () => {
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('momai_extensions_sync', handleSync)
      window.removeEventListener('momai_open_extensions', handleOpenExtensions)
      window.removeEventListener('momai_navigate', handleNavigate)
      window.removeEventListener('momai_open_settings', handleOpenSettings)
      window.removeEventListener('momai_set_theme', handleSetTheme)
    }
  }, [])

  const currentExtension =
    location.pathname === '/'
      ? extensions.find((e) => e.name === 'responder')
      : extensions.find((e) => location.pathname.includes(e.id))

  let uiView = 'ChatDashboard'
  if (location.pathname === '/extensions') {
    uiView = 'ExtensionsStore'
  }
  if (location.pathname === '/notes') {
    uiView = 'NotesDashboard'
  }
  if (location.pathname === '/agenda') {
    uiView = 'RemindersDashboard'
  }

  const isChat = uiView === 'ChatDashboard' || uiView === 'RemindersDashboard'

  return (
    <>
      {showWelcome && <WelcomeScreen onComplete={() => setShowWelcome(false)} />}
      <div
        className="h-full flex flex-col overflow-hidden bg-bg"
        style={{
          transition: 'opacity 0.6s ease-in',
          // Hide app if: we are on welcome, onboarding is showing, there's a boot error, 
          // we haven't checked first launch yet, OR we are at 0% and booting (prevents flicker)
          // After onboarding is attempted, show the app even during boot
          opacity: (showWelcome || showOnboarding || !!bootstrapError || !firstLaunchChecked || (isBooting && initProgress === 0 && !settingsLoaded && !onboardingAttempted)) ? 0 : 1,
          pointerEvents: (showWelcome || showOnboarding || !!bootstrapError || !firstLaunchChecked || (isBooting && initProgress === 0 && !settingsLoaded && !onboardingAttempted)) ? 'none' : 'auto'
        }}
      >
      <TitleBar onClearHistory={triggerClearHistory} activeRoute={location.pathname} />

      <div className="flex-1 flex w-full min-h-0 relative">
        <LateralBar
          activeRoute={location.pathname}
          onNavigate={(path) => navigate(path)}
          onOpenSettings={() => openSettings('general')}
          isCompact={isCompact}
        />

        <main className="flex-1 relative flex overflow-hidden">
          <div className="absolute inset-0 z-0 bg-bg">
            <div className="absolute inset-0 opacity-20 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-accent/20 via-bg to-bg" />
          </div>

          <div className="relative z-10 flex-1 flex min-h-0 overflow-hidden bg-transparent">
            <div
              className={`w-full h-full flex ${isCompact ? 'flex-col' : `flex-row ${isChat ? 'p-6 gap-6 justify-center' : ''}`}`}
            >
              {/* DYNAMIC MAIN VIEW (Chat, Extensions, etc) */}
              <MainViewRenderer
                viewName={uiView}
                isCompact={isCompact}
                onOpenSettings={openSettings}
                extensionData={currentExtension}
                chat={chat}
                statusInfo={statusInfo}
                initProgress={initProgress}
                initMessage={initMessage}
                isBooting={isBooting}
              />

              {/* 2. Graph Panel (Middle Column - Conditional) */}
              {graphState.view === 'side' && !isCompact && (
                <div className="flex-1 min-w-[320px] max-w-[600px] rounded-xl bg-card border border-border/10 shadow-2xl overflow-hidden relative animate-in slide-in-from-right duration-500">
                  <GraphInterface
                    view="side"
                    content={graphState.content}
                    options={graphState.options}
                    optionsMap={graphState.optionsMap}
                    uiSchema={graphState.uiSchema}
                    onOptionSelect={handleGraphOption}
                    onClose={closeGraph}
                  />
                </div>
              )}

              {/* 3. Desktop Sidebar (Right Side - Visible only in Chat) */}
              {!isCompact && isChat && (
                <div className="w-[320px] flex flex-col gap-2 h-full shrink-0">
                  <div className="flex flex-col items-center justify-center animate-fade-in shrink-0">
                    <div className="relative w-32 h-24 flex items-center justify-center overflow-visible">
                      <div className="absolute inset-0 bg-accent/20 blur-2xl rounded-full opacity-50"></div>
                      <img
                        src={logo}
                        alt="MomAI"
                        className="w-28 h-28 object-contain relative z-10 drop-shadow-2xl"
                      />
                    </div>

                    <div className="relative flex flex-col items-center -mt-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
                      {/* Pontinhos brilhantes flutuantes */}
                      <div className="absolute -inset-6 pointer-events-none">
                        <div
                          className="absolute top-1/2 left-0 w-1 h-1 rounded-full bg-accent/60 animate-pulse"
                          style={{ animationDuration: '1.5s' }}
                        />
                        <div
                          className="absolute top-1/2 right-0 w-1 h-1 rounded-full bg-accent/60 animate-pulse"
                          style={{ animationDuration: '1.5s', animationDelay: '0.3s' }}
                        />
                        <div
                          className="absolute top-0 left-1/2 w-1.5 h-1.5 rounded-full bg-accent/40 animate-ping"
                          style={{ animationDuration: '2s' }}
                        />
                        <div
                          className="absolute bottom-0 left-1/2 w-1 h-1 rounded-full bg-accent/50 animate-pulse"
                          style={{ animationDuration: '1.8s', animationDelay: '0.5s' }}
                        />
                        <div
                          className="absolute top-1/4 left-1/4 w-0.5 h-0.5 rounded-full bg-accent/70 animate-ping"
                          style={{ animationDuration: '2.5s' }}
                        />
                        <div
                          className="absolute top-3/4 right-1/4 w-0.5 h-0.5 rounded-full bg-accent/70 animate-ping"
                          style={{ animationDuration: '2.5s', animationDelay: '1s' }}
                        />
                      </div>

                      {/* Texto com brilho suave e efeito de profundidade */}
                      <div className="relative">
                        <div
                          className="absolute -inset-3 bg-accent/20 blur-2xl animate-pulse"
                          style={{ animationDuration: '3s' }}
                        />
                        <span className="relative text-sm font-medium text-text-muted/80 whitespace-nowrap">
                          Tente dizer{' '}
                          <span className="text-accent font-bold text-lg drop-shadow-[0_0_12px_rgba(var(--accent-rgb),0.6)]">
                            &quot;Luna&quot;
                          </span>
                          ..
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex-1 rounded-xl bg-card border border-border/10 shadow-2xl overflow-hidden relative flex flex-col">
                    <RemindersSidebar
                      onNavigate={() => navigate('/extensions/com.momai.builtin.scheduler')}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>

      {/* Floating Interfaces */}
      {showSettings && (
        <SettingsCard onClose={() => setShowSettings(false)} initialTab={settingsTab} />
      )}

      {showClearConfirm && (
        <ConfirmationCard
          title="Limpar Histórico"
          message="Deseja realmente apagar todo o histórico de mensagens? Esta ação não pode ser desfeita."
          options={['Cancelar', 'Confirmar']}
          onCancel={() => setShowClearConfirm(false)}
          onSelect={(opt) => {
            if (opt === 'Confirmar') confirmClearHistory()
            else setShowClearConfirm(false)
          }}
        />
      )}

      {/* Center Graph (Modal) */}
      {graphState.view === 'center' && (
        <GraphInterface
          view="center"
          content={graphState.content}
          options={graphState.options}
          optionsMap={graphState.optionsMap}
          uiSchema={graphState.uiSchema}
          onOptionSelect={handleGraphOption}
          onClose={closeGraph}
        />
      )}

      {/* Bootstrap Error Display */}
      {bootstrapError && (
        <div className="fixed inset-0 z-[9999] bg-bg/95 flex items-center justify-center p-8">
          <div className="max-w-md w-full bg-card border border-red-500/30 rounded-xl p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
                <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-bold text-text">Erro de Inicialização</h2>
                <p className="text-xs text-text/50 uppercase tracking-wider">{bootstrapError.type.replace(/_/g, ' ')}</p>
              </div>
            </div>
            
            <p className="text-text/70 mb-4">{bootstrapError.message}</p>
            
            {bootstrapError.details && (
              <div className="bg-text/5 border border-text/10 rounded-lg p-3 mb-4">
                <p className="text-xs text-text/50 font-mono break-all">{bootstrapError.details}</p>
              </div>
            )}
            
            <div className="flex gap-3">
              <button
                onClick={() => window.electron.ipcRenderer.invoke('open-logs-folder')}
                className="flex-1 px-4 py-2 bg-text/5 hover:bg-text/10 border border-text/10 rounded-lg text-sm text-text/70 hover:text-text transition-colors"
              >
                Ver Logs
              </button>
              <button
                onClick={() => window.location.reload()}
                className="flex-1 px-4 py-2 bg-accent hover:bg-accent/80 rounded-lg text-sm text-white font-medium transition-colors"
              >
                Tentar Novamente
              </button>
            </div>
          </div>
        </div>
      )}



      {/* Update Notification */}
      <AutoUpdateCard />
      {hasUpdate && !showSettings && (
        <UpdateToast
          installedVersion={statusInfo?.setup.installed_version}
          latestVersion={statusInfo?.setup.latest_version}
          onOpenSettings={openSettings}
        />
      )}

      {showOnboarding && (
        <OnboardingCard
          onFinish={(savedSettings?: Record<string, any>) => {
            setShowOnboarding(false)
            setOnboardingAttempted(true)
            // If backend isn't online yet, queue the settings for later
            if (!isOnline && savedSettings) {
              console.log('[App] Backend not online yet, queuing onboarding settings')
              setPendingOnboardingSettings(savedSettings)
            }
            // Agora que o onboarding acabou, podemos redimensionar a janela
            window.electron.ipcRenderer.send('app-ready')
          }}
        />
      )}

      {/* showTutorial && <TutorialTour onFinish={() => setShowTutorial(false)} /> */}
      {/*
      <FortScriptToast />

      {!isCompact && <ResourceFooter />}
      */}
    </>
  )
}

export default App
