import FloatingCard from './FloatingCard'
import HelpCard from './HelpCard'
import { Tab, useSettingsCard } from '../../hooks/useSettingsCard'
import { Sidebar } from './settings/Sidebar'
import { GeneralTab } from './settings/tabs/GeneralTab'
import { BrainTab } from './settings/tabs/BrainTab'
import { VoiceTab } from './settings/tabs/VoiceTab'
import { EconomyTab } from './settings/tabs/EconomyTab'
import { UpdatesTab } from './settings/tabs/UpdatesTab'
import LogsCard from './LogsCard'

interface SettingsCardProps {
  onClose: () => void
  initialTab?: Tab
}

export default function SettingsCard({ onClose, initialTab = 'general' }: SettingsCardProps) {
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
    resetOnboarding
  } = useSettingsCard(initialTab, onClose)

  if (isLoading)
    return (
      <FloatingCard title={t('settings.loadingTitle')} onClose={onClose} width="max-w-2xl">
        <div className="p-10 text-center text-text-muted text-sm font-medium">
          {t('settings.loadingBody')}
        </div>
      </FloatingCard>
    )

  return (
    <FloatingCard title={t('settings.title')} onClose={onClose} width="max-w-4xl">
      <div className="flex h-[520px] -mx-6 -my-6 bg-card">
        <Sidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          t={t}
          localDetails={localDetails}
          settings={settings}
          setShowHelp={setShowHelp}
        />

        <div className="flex-1 overflow-y-auto custom-scrollbar p-8">
          {activeTab === 'general' && (
            <GeneralTab
              t={t}
              settings={settings}
              theme={theme}
              updateField={updateField}
              saveSettings={saveSettings}
              changeTheme={changeTheme}
              handleTierChange={handleTierChange}
              handleDevMode={handleDevMode}
              resetOnboarding={resetOnboarding}
              tiersConfig={tiersConfig}
            />
          )}

          {activeTab === 'brain' && (
            <BrainTab
              t={t}
              settings={settings}
              tiersConfig={tiersConfig}
              localDetails={localDetails}
              isAdvancedHardwareOpen={isAdvancedHardwareOpen}
              setIsAdvancedHardwareOpen={setIsAdvancedHardwareOpen}
              updateField={updateField}
              saveSettings={saveSettings}
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
            />
          )}

          {activeTab === 'logs' && <LogsCard onClose={() => setActiveTab('general')} />}
        </div>
      </div>

      {showHelp && <HelpCard onClose={() => setShowHelp(false)} />}
    </FloatingCard>
  )
}
