import FloatingCard from './FloatingCard'
import HelpCard from './HelpCard'
import { Tab, useSettingsCard } from '../../hooks/useSettingsCard'
import { useWindowMaximized } from '../../hooks/useWindowMaximized'
import { Sidebar } from './settings/Sidebar'
import { GeneralTab } from './settings/tabs/GeneralTab'
import { BrainTab } from './settings/tabs/BrainTab'
import { ModelTab } from './settings/tabs/ModelTab'
import { VoiceTab } from './settings/tabs/VoiceTab'
import { EconomyTab } from './settings/tabs/EconomyTab'
import { UpdatesTab } from './settings/tabs/UpdatesTab'
import DeveloperTab from './settings/tabs/DeveloperTab'
import LogsCard from './LogsCard'

function SettingsSkeleton({ fullScreen }: { fullScreen: boolean }) {
  return (
    <div className="flex h-full bg-card animate-pulse">
      {/* Fake Sidebar */}
      <div
        className={`${fullScreen ? 'w-44' : 'w-40'} border-r border-border bg-sidebar ${fullScreen ? 'p-4' : 'p-3'} flex flex-col gap-2`}
      >
        <div className="h-8 bg-white/5 rounded-lg mb-2" />
        <div className="h-px bg-border/40 mb-2" />
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-8 bg-white/5 rounded-lg" />
        ))}
        <div className="flex-1" />
        <div className="h-8 bg-white/5 rounded-lg" />
      </div>

      {/* Fake Content */}
      <div className={`flex-1 overflow-hidden ${fullScreen ? 'p-8' : 'p-6'} space-y-6`}>
        <div className="space-y-2">
          <div className="h-6 w-48 bg-white/5 rounded" />
          <div className="h-3 w-72 bg-white/5 rounded" />
        </div>

        <div className="grid grid-cols-1 gap-6">
          <div className="space-y-2">
            <div className="h-3 w-24 bg-white/5 rounded" />
            <div className="h-10 w-full bg-white/5 rounded-lg" />
          </div>

          <div className="space-y-2">
            <div className="h-3 w-24 bg-white/5 rounded" />
            <div className="grid grid-cols-2 gap-2">
              <div className="h-10 bg-white/5 rounded-lg" />
              <div className="h-10 bg-white/5 rounded-lg" />
            </div>
          </div>

          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-16 w-full bg-white/5 rounded-xl" />
            ))}
          </div>

          <div className="space-y-3 pt-4 border-t border-border/40">
            <div className="h-3 w-40 bg-white/5 rounded" />
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-20 w-full bg-white/5 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

interface SettingsCardProps {
  onClose: () => void
  initialTab?: Tab
}

export default function SettingsCard({ onClose, initialTab = 'general' }: SettingsCardProps) {
  const isMaximized = useWindowMaximized()
  const {
    t,
    activeTab,
    setActiveTab,
    isLoading,
    showHelp,
    setShowHelp,
    theme,
    settings,
    installStatus,
    installProgress,
    localDetails,
    gamingApps,
    newApp,
    setNewApp,
    appVersion,
    isAdvancedHardwareOpen,
    setIsAdvancedHardwareOpen,
    tiersConfig,
    expandedLang,
    setExpandedLang,
    changeTheme,
    checkLocalStatus,
    handleInstallEngine,
    handleAddGamingApp,
    handleDeleteGamingApp,
    handleTierChange,
    saveSettings,
    updateField,
    handleDevMode,
    resetOnboarding,
    economyConfig,
    handleUpdateEconomyConfig,
    economyState
  } = useSettingsCard(initialTab, onClose)

  const sidebar = (
    <Sidebar
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      onClose={onClose}
      t={t}
      localDetails={localDetails}
      settings={settings}
      setShowHelp={setShowHelp}
      compact={!isMaximized}
    />
  )

  const mainContent = (
    <div className="flex-1 min-w-0 overflow-y-auto custom-scrollbar pl-8 pr-12 py-8">
      {activeTab === 'general' && (
        <GeneralTab
          t={t}
          settings={settings}
          theme={theme}
          updateField={updateField}
          saveSettings={saveSettings}
          changeTheme={changeTheme}
          handleTierChange={handleTierChange}
          resetOnboarding={resetOnboarding}
          tiersConfig={tiersConfig}
        />
      )}

      {activeTab === 'memoria' && (
        <BrainTab t={t} settings={settings} tiersConfig={tiersConfig} updateField={updateField} />
      )}

      {activeTab === 'modelo' && (
        <ModelTab
          t={t}
          settings={settings}
          tiersConfig={tiersConfig}
          localDetails={localDetails}
          updateField={updateField}
          checkLocalStatus={checkLocalStatus}
        />
      )}

      {activeTab === 'voice' && (
        <VoiceTab
          t={t}
          settings={settings}
          setActiveTab={setActiveTab}
          expandedLang={expandedLang}
          setExpandedLang={setExpandedLang}
          updateField={updateField}
        />
      )}

      {activeTab === 'updates' && (
        <UpdatesTab
          t={t}
          appVersion={appVersion}
          localDetails={localDetails}
          installStatus={installStatus}
          installProgress={installProgress}
          handleInstallEngine={handleInstallEngine}
          settings={settings}
        />
      )}

      {activeTab === 'economy' && (
        <EconomyTab
          t={t}
          newApp={newApp}
          setNewApp={setNewApp}
          handleAddGamingApp={handleAddGamingApp}
          handleDeleteGamingApp={handleDeleteGamingApp}
          gamingApps={gamingApps}
          economyConfig={economyConfig}
          onUpdateConfig={handleUpdateEconomyConfig}
          economyState={economyState}
        />
      )}

      {activeTab === 'developer' && (
        <DeveloperTab t={t} handleDevMode={handleDevMode} onClose={onClose} />
      )}
    </div>
  )

  if (isLoading) {
    if (isMaximized) {
      return (
        <FloatingCard
          title={t('settings.loadingTitle')}
          onClose={onClose}
          width="max-w-5xl w-[92vw] xl:w-[85vw]"
        >
          <SettingsSkeleton fullScreen={false} />
        </FloatingCard>
      )
    }
    return (
      <div className="fixed top-8 left-0 right-0 bottom-0 z-[400] flex flex-col bg-bg animate-fade-in">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-sidebar shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="p-1 rounded-md hover:bg-text/10 text-text-muted hover:text-text transition-colors"
              aria-label="Close"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
            </button>
            <h3 className="text-xs font-black text-text/80 uppercase tracking-widest">
              {t('settings.loadingTitle')}
            </h3>
          </div>
        </div>
        <div className="flex-1 overflow-hidden">
          <SettingsSkeleton fullScreen={true} />
        </div>
      </div>
    )
  }

  if (isMaximized) {
    return (
      <FloatingCard
        title={t('settings.title')}
        onClose={onClose}
        width="max-w-5xl w-[92vw] xl:w-[85vw]"
      >
        <div className="flex h-[61vh] min-h-[460px] max-h-[600px] -m-4">
          {sidebar}
          {mainContent}
        </div>
        {showHelp && <HelpCard onClose={() => setShowHelp(false)} />}
      </FloatingCard>
    )
  }

  return (
    <div className="fixed top-8 left-0 right-0 bottom-0 z-[400] flex flex-col bg-bg animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-sidebar shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-text/10 text-text-muted hover:text-text transition-colors"
            aria-label="Close"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>
          <h3 className="text-xs font-black text-text/80 uppercase tracking-widest">
            {t('settings.title')}
          </h3>
        </div>
      </div>

      {/* Body - sidebar + content */}
      <div className="flex-1 overflow-hidden flex">
        {sidebar}
        {mainContent}
      </div>

      {showHelp && <HelpCard onClose={() => setShowHelp(false)} />}
    </div>
  )
}
