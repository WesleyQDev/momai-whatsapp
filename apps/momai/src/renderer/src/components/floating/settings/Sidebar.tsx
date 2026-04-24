import { Tab, LocalDetails } from '../../../hooks/useSettingsCard'

interface SidebarProps {
  activeTab: Tab
  setActiveTab: (tab: Tab) => void
  t: any
  localDetails: LocalDetails
  settings: any
  setShowHelp: (show: boolean) => void
}

export const Sidebar = ({
  activeTab,
  setActiveTab,
  t,
  localDetails,
  settings,
  setShowHelp
}: SidebarProps) => {
  const icons = {
    general: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="3"></circle>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
      </svg>
    ),
    brain: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
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
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
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
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="2" y="6" width="20" height="12" rx="2" />
        <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    ),
    logs: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <line x1="8" y1="10" x2="16" y2="10" />
        <line x1="8" y1="14" x2="12" y2="14" />
        <circle cx="6" cy="10" r="0.5" fill="currentColor" />
        <circle cx="6" cy="14" r="0.5" fill="currentColor" />
      </svg>
    ),
    voice: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
        <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
        <line x1="12" y1="19" x2="12" y2="23"></line>
        <line x1="8" y1="23" x2="16" y2="23"></line>
      </svg>
    )
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
    { id: 'logs', label: 'Logs', icon: icons.logs },
    { id: 'updates', label: t('settings.tabs.updates'), icon: icons.updates }
  ]

  return (
    <div className="w-44 border-r border-border bg-sidebar p-4 flex flex-col gap-1">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => setActiveTab(tab.id as Tab)}
          className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-bold transition-all duration-200 ${activeTab === tab.id ? 'bg-accent/10 text-accent shadow-sm' : 'text-text-muted hover:bg-text/5 hover:text-text'}`}
        >
          {tab.icon}
          {tab.label}
          {tab.id === 'updates' &&
            localDetails.installed_version !== localDetails.latest_version &&
            localDetails.latest_version && (
              <div className="ml-auto w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
            )}
        </button>
      ))}

      <div className="flex-1" />

      <button
        onClick={() => setShowHelp(true)}
        className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-bold transition-all duration-200 text-text-muted hover:bg-text/5 hover:text-text"
      >
        <svg
          width="16"
          height="16"
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
