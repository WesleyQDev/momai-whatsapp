import { useState, useCallback, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import LateralBar from './components/LateralBar'
import { useChat } from './hooks/useChat'
import { useStatus } from './hooks/useStatus'
import SettingsCard from './components/floating/SettingsCard'
import UpdateToast from './components/floating/UpdateToast'
import GraphInterface from './components/GraphInterface'
import TitleBar from './components/TitleBar'
import ConfirmationCard from './components/floating/ConfirmationCard'
import OnboardingCard from './components/floating/OnboardingCard'
import AutoUpdateCard from './components/floating/AutoUpdateCard'
import MainViewRenderer from './components/MainViewRenderer'
import TTSEngineLoadingAnimation from './components/chat/TTSEngineLoadingAnimation'

// New modular imports
import WelcomeScreen from './components/WelcomeScreen'
import TierChangeOverlay from './components/TierChangeOverlay'
import BootstrapError from './components/BootstrapError'
import InfoPanel from './components/InfoPanel'
import ExtensionPanel from './components/ExtensionPanel'
import NotificationOverlay from './components/NotificationOverlay'
import ExtensionPageRoute from './views/ExtensionPageRoute'
import { useAudioFallback } from './hooks/useAudioFallback'
import { useInitTtsRenderer } from './hooks/useInitTtsRenderer'
import { useAppTheme } from './hooks/useAppTheme'
import { useAppInitialization } from './hooks/useAppInitialization'
import { useAppEvents } from './hooks/useAppEvents'
import { useOverlayBridge } from './hooks/useOverlayBridge'

function App(): React.JSX.Element {
  const navigate = useNavigate()
  const location = useLocation()

  // Custom Hooks for logic separation
  const chat = useChat()
  const { graphState, handleGraphOption, closeGraph, clearHistory } = chat

  const {
    statusInfo,
    hasUpdate,
    initMessage,
    initProgress,
    visualProgress,
    isBooting,
    isOnline,
    isReady,
    isUpdating,
    resetVisualProgress
  } = useStatus()

  // App initialization and global state
  const {
    showWelcome,
    showOnboarding,
    setShowOnboarding,
    isFirstLaunch,
    appVersion,
    bootstrapError,
    firstLaunchChecked,
    settingsLoaded,
    settings,
    extensions,
    handleWelcomeComplete,
    setPendingOnboardingSettings
  } = useAppInitialization(isOnline, isReady)

  // Sub-logic hooks
  const { isCompact } = useAppTheme()
  useAudioFallback()
  useInitTtsRenderer()
  useOverlayBridge(graphState)

  // Local UI State
  const [showSettings, setShowSettings] = useState(false)
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [settingsTab, setSettingsTab] = useState<
    'general' | 'brain' | 'voice' | 'economy' | 'updates'
  >('general')
  const [historyOpen, setHistoryOpen] = useState(false)
  const [showOverlay, setShowOverlay] = useState(false)
  const [overlayTier, setOverlayTier] = useState<string | null>(null)
  const [isTierChanging, setIsTierChanging] = useState(false)
  const [activePanel, setActivePanel] = useState<string | null>(null)

  useEffect(() => {
    const handleStart = (e: any) => {
      setOverlayTier(e.detail)
      setShowOverlay(true)
      setIsTierChanging(true)
    }
    const handleEnd = () => {
      setShowOverlay(false)
      setOverlayTier(null)
      setTimeout(() => setIsTierChanging(false), 2000)
    }
    window.addEventListener('momai_tier_change_start', handleStart)
    window.addEventListener('momai_tier_change_end', handleEnd)
    return () => {
      window.removeEventListener('momai_tier_change_start', handleStart)
      window.removeEventListener('momai_tier_change_end', handleEnd)
    }
  }, [])

  const openSettings = useCallback(
    (tab: 'general' | 'brain' | 'voice' | 'economy' | 'updates' = 'general') => {
      setSettingsTab(tab)
      setShowSettings(true)
    },
    []
  )

  // ESC key to close settings
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showSettings) {
        setShowSettings(false)
      }
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [showSettings])

  // Event Listeners registration
  useAppEvents({ openSettings, handleGraphOption })

  // Reset loading animation when the app UI becomes visible while still booting.
  // This prevents the loading screen from being skipped if the animation completed
  // while the app was invisible (during welcome/onboarding screens).
  const isAppVisible = !showWelcome && !showOnboarding && !bootstrapError && firstLaunchChecked
  useEffect(() => {
    if (isAppVisible && isBooting) {
      chat.setAnimationFinished(false)
      resetVisualProgress()
    }
  }, [isAppVisible, isBooting])

  // When the backend reboots (e.g. dev-reset wipes python_env), force the
  // chat loading animation to re-run. Without this, animationFinished stays
  // sticky from the previous session and ContainerChat skips the loading
  // state, showing the regular chat with a disabled send button instead.
  useEffect(() => {
    const handleRebooting = () => {
      chat.setAnimationFinished(false)
      resetVisualProgress()
    }
    window.addEventListener('momai_rebooting', handleRebooting)
    return () => window.removeEventListener('momai_rebooting', handleRebooting)
  }, [chat])

  const triggerClearHistory = () => setShowClearConfirm(true)
  const confirmClearHistory = () => {
    clearHistory()
    setShowClearConfirm(false)
  }

  const currentExtension =
    location.pathname === '/'
      ? extensions.find((e) => e.name === 'responder')
      : extensions.find((e) => location.pathname.includes(e.id))

  const viewMapping: Record<string, string> = {
    '/extensions': 'ExtensionsStore',
    '/notes': 'NotesDashboard',
    '/agenda': 'RemindersDashboard',
    '/about': 'AboutDashboard',
    '/observability': 'ObservabilityDashboard',
    '/': 'ChatDashboard'
  }

  const extensionPageMatch = location.pathname.match(/^\/extensions\/([^/]+)$/)
  const extensionPageId = extensionPageMatch ? extensionPageMatch[1] : null

  const uiView = extensionPageId
    ? 'ExtensionPage'
    : viewMapping[location.pathname] || 'ChatDashboard'
  const isChat = uiView === 'ChatDashboard'
  const showSidebar = uiView === 'ChatDashboard'

  return (
    <>
      {showWelcome && (
        <WelcomeScreen
          isFirstLaunch={isFirstLaunch}
          onComplete={handleWelcomeComplete}
          version={appVersion}
        />
      )}

      <div
        className="h-full flex flex-col overflow-hidden bg-bg"
        onContextMenu={(e) => {
          const target = e.target as HTMLElement
          const isEditable =
            target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.isContentEditable ||
            target.closest('input, textarea, [contenteditable]')
          if (!isEditable && !e.defaultPrevented) e.preventDefault()
        }}
        style={{
          transition: 'opacity 0.6s ease-in',
          opacity: showWelcome || showOnboarding || !!bootstrapError || !firstLaunchChecked ? 0 : 1,
          pointerEvents:
            showWelcome || showOnboarding || !!bootstrapError || !firstLaunchChecked
              ? 'none'
              : 'auto'
        }}
      >
        <NotificationOverlay />
        <TitleBar onClearHistory={triggerClearHistory} activeRoute={location.pathname} />

        <div className="flex-1 flex w-full min-h-0 relative">
          <LateralBar
            activeRoute={location.pathname}
            onNavigate={(path, state) => {
              if (path === '/') {
                if (state?.prefillText) {
                  const hasYoutubeCard = chat.messages.some(
                    (msg: any) => msg.structuredResponse?.type === 'youtube_results'
                  )
                  if (hasYoutubeCard) {
                    chat.setText(state.prefillText)
                  } else {
                    window.dispatchEvent(
                      new CustomEvent('momai_new_session', {
                        detail: { prefillText: state.prefillText }
                      })
                    )
                  }
                } else {
                  chat.setText(' ')
                  setTimeout(() => {
                    chat.setText('')
                  }, 0)
                }
                navigate('/')
              } else {
                navigate(path, { state })
              }
            }}
            onOpenSettings={() => openSettings('general')}
            onOpenPanel={(id) => setActivePanel(id === activePanel ? null : id)}
            isCompact={isCompact}
          />

          {activePanel && (
            <ExtensionPanel
              extensionId={activePanel}
              label=""
              icon=""
              panelEndpoint={`/extensions/${activePanel}/panel`}
              onClose={() => setActivePanel(null)}
            />
          )}

          <main className="flex-1 relative flex overflow-hidden">
            <div className="absolute inset-0 z-0 bg-bg">
              <div className="absolute inset-0 opacity-20 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-accent/20 via-bg to-bg" />
            </div>

            <div className="relative z-10 flex-1 flex min-h-0 overflow-hidden bg-transparent">
              <div
                className={`w-full h-full flex min-w-0 ${
                  isCompact
                    ? 'flex-col'
                    : `flex-row ${
                        isChat
                          ? 'p-4 xl:p-4 gap-4 xl:gap-8 justify-center w-full max-w-[1500px] mx-auto overflow-x-auto overflow-y-hidden'
                          : 'overflow-hidden'
                      }`
                }`}
              >
                <div
                  className="flex-1 flex min-h-0 min-w-0"
                  style={{ display: extensionPageId ? 'none' : 'flex' }}
                >
                  <MainViewRenderer
                    viewName={uiView}
                    isCompact={isCompact}
                    onOpenSettings={openSettings}
                    extensionData={currentExtension}
                    chat={chat}
                    statusInfo={statusInfo}
                    initProgress={initProgress}
                    visualProgress={visualProgress}
                    initMessage={initMessage}
                    isBooting={isBooting}
                    isUpdating={isUpdating}
                    isTierChanging={isTierChanging}
                    setHistoryOpen={setHistoryOpen}
                    isFirstLaunch={isFirstLaunch}
                  />
                </div>
                {extensionPageId && (
                  <ExtensionPageRoute
                    extensionId={extensionPageId}
                    fallback={({ extensionId }) => (
                      <div className="p-8 text-text-muted">
                        Extensão "{extensionId}" não tem UI full-page
                      </div>
                    )}
                  />
                )}

                {graphState.view === 'side' && !isCompact && (
                  <div className="flex-1 min-w-[280px] xl:min-w-[380px] max-w-[650px] rounded-xl bg-card border border-border/10 shadow-2xl overflow-hidden relative animate-in slide-in-from-right duration-500 shrink">
                    <GraphInterface view="side" content={graphState.content} onClose={closeGraph} />
                  </div>
                )}

                {!isCompact && showSidebar && (
                  <InfoPanel
                    statusInfo={statusInfo}
                    settings={settings}
                    chat={chat}
                    historyOpen={historyOpen}
                    setHistoryOpen={setHistoryOpen}
                    isBooting={isBooting}
                  />
                )}
              </div>
            </div>
          </main>
        </div>
      </div>

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

      {graphState.view === 'center' && (
        <GraphInterface view="center" content={graphState.content} onClose={closeGraph} />
      )}

      {bootstrapError && <BootstrapError error={bootstrapError} />}

      <AutoUpdateCard />
      {hasUpdate && !showSettings && (
        <UpdateToast
          installedVersion={statusInfo?.setup.installed_version}
          latestVersion={statusInfo?.setup.latest_version}
          onOpenSettings={openSettings}
        />
      )}

      <TierChangeOverlay isChanging={showOverlay} tier={overlayTier} />

      {showOnboarding && (
        <OnboardingCard
          onFinish={(savedSettings?: Record<string, any>) => {
            setShowOnboarding(false)
            if (savedSettings) setPendingOnboardingSettings(savedSettings)
            navigate('/')
          }}
        />
      )}

      {chat.voiceEngineLoading && (
        <TTSEngineLoadingAnimation
          loading={chat.voiceEngineLoading.loading}
          pendingAutoTts={chat.voiceEngineLoading.pendingAutoTts}
          message={chat.voiceEngineLoading.message}
        />
      )}
    </>
  )
}

export default App
