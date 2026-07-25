import React from 'react'
import { Tab, LocalDetails } from '../../../hooks/useSettingsCard'

interface SidebarProps {
  activeTab: Tab; setActiveTab: (tab: Tab) => void; onClose: () => void; t: any
  localDetails: LocalDetails; settings: any; setShowHelp: (show: boolean) => void; compact?: boolean
}

export const Sidebar = ({ activeTab, setActiveTab, onClose, t, localDetails, settings, setShowHelp, compact = false }: SidebarProps) => {
  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'general', label: 'Geral', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg> },
    { id: 'memoria', label: 'Memória', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2a7 7 0 0 1 7 7c0 2-.7 3.5-2 5a6 6 0 0 0-2 4v2M12 2a7 7 0 0 0-7 7c0 2 .7 3.5 2 5a6 6 0 0 1 2 4v2"/><path d="M12 2v20"/><path d="M9 9h6"/></svg> },
    { id: 'modelo', label: 'Motor', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg> },
    { id: 'voice', label: 'Voz', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg> },
    { id: 'economy', label: 'Economia', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg> },
    { id: 'updates', label: 'Atualizações', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> },
    { id: 'developer', label: 'Dev', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg> },
  ]

  return (
    <div className={`${compact ? 'w-40' : 'w-44'} border-r border-border/25 bg-white/[0.015] ${compact ? 'pl-4 pr-2 py-4' : 'pl-5 pr-3 py-5'} flex flex-col gap-0.5`}>
      {tabs.map((tab) => (
        <button key={tab.id} onClick={() => setActiveTab(tab.id)}
          className={`flex items-center gap-2.5 ${compact ? 'px-2.5 py-2' : 'px-3 py-2.5'} rounded-lg text-sm transition-all duration-200 ${activeTab === tab.id ? 'bg-accent/10 text-accent font-bold' : 'text-text-muted/60 hover:bg-white/[0.03] hover:text-text font-medium'}`}>
          {tab.icon}
          {tab.label}
          {tab.id === 'updates' && localDetails.installed_version !== localDetails.latest_version && localDetails.latest_version && (
            <div className="ml-auto w-2 h-2 rounded-full bg-accent" />
          )}
        </button>
      ))}
      <div className="flex-1" />
      <button onClick={() => setShowHelp(true)}
        className={`flex items-center gap-2 ${compact ? 'px-2.5 py-2' : 'gap-3 px-3 py-2.5'} rounded-lg text-sm font-medium transition-all duration-200 text-text-muted/60 hover:bg-white/[0.03] hover:text-text`}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        Ajuda
      </button>
    </div>
  )
}
