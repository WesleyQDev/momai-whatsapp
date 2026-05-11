import { Tab, LocalDetails } from '../../../hooks/useSettingsCard'

interface SidebarProps {
  activeTab: Tab
  setActiveTab: (tab: Tab) => void
  onClose: () => void
  t: any
  localDetails: LocalDetails
  settings: any
  setShowHelp: (show: boolean) => void
  compact?: boolean
}

export const Sidebar = ({
  activeTab,
  setActiveTab,
  onClose,
  t,
  localDetails,
  settings,
  setShowHelp,
  compact = false
}: SidebarProps) => {
  const icons = {
    general: (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="3"></circle>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
      </svg>
    ),
    brain: (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M12 2a10 10 0 1 0 10 10H12V2z"></path>
        <path d="M12 2a10 10 0 0 1 10 10"></path>
      </svg>
    ),
    updates: (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </svg>
    ),
    economy: (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="2" y="6" width="20" height="12" rx="2" />
        <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    ),
    developer: (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline points="16 18 22 12 16 6" />
        <polyline points="8 6 2 12 8 18" />
      </svg>
    ),
    voice: (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
        <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
        <line x1="12" y1="19" x2="12" y2="23"></line>
        <line x1="8" y1="23" x2="16" y2="23"></line>
      </svg>
    ),
  }

  const tabs = [
    { id: 'general', label: t('settings.tabs.general'), icon: icons.general },
    { id: 'brain', label: t('settings.tabs.brain'), icon: icons.brain },
    {
      id: 'voice',
      label: t('settings.tabs.voice'),
      icon:
        settings.ai_tier === 'lite' ? (
          <div className="relative">
            {icons.voice}
            <div className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-text-muted/40 border border-black" />
          </div>
        ) : (
          icons.voice
        )
    },
    { id: 'economy', label: t('settings.tabs.economy'), icon: icons.economy },
    { id: 'updates', label: t('settings.tabs.updates'), icon: icons.updates },
    { id: 'developer', label: 'Dev', icon: icons.developer },
  ]

  return (
    <div
      className={`${compact ? 'w-40' : 'w-44'} border-r border-border bg-sidebar ${compact ? 'pl-4 pr-2 py-4' : 'pl-5 pr-3 py-5'} flex flex-col gap-1`}
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => setActiveTab(tab.id as Tab)}
          className={`flex items-center gap-2 ${compact ? 'px-2.5 py-2' : 'gap-3 px-3 py-2.5'} rounded-lg text-sm font-semibold transition-all duration-200 ${activeTab === tab.id ? 'bg-accent/10 text-accent' : 'text-text-muted hover:bg-white/[0.03] hover:text-text'}`}
        >
          {tab.icon}
          {tab.label}
          {tab.id === 'updates' &&
            localDetails.installed_version !== localDetails.latest_version &&
            localDetails.latest_version && (
              <div className="ml-auto w-2 h-2 rounded-full bg-accent" />
            )}
        </button>
      ))}

      <div className="flex-1" />

      <button
        onClick={() => setShowHelp(true)}
        className={`flex items-center gap-2 ${compact ? 'px-2.5 py-2' : 'gap-3 px-3 py-2.5'} rounded-lg text-sm font-semibold transition-all duration-200 text-text-muted hover:bg-white/[0.03] hover:text-text`}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        {t('settings.help')}
      </button>
    </div>
  )
}
