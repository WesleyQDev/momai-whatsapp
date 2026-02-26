import React, { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  fetchExtensions,
  fetchExtensionRegistry,
  installExtension,
  toggleExtension,
  uninstallExtension,
  Extension
} from '../services/api'
import {
  PuzzlePieceIcon,
  CheckBadgeIcon,
  CloudArrowDownIcon,
  ArrowPathIcon,
  ShieldCheckIcon,
  CpuChipIcon,
  GlobeAltIcon,
  MusicalNoteIcon,
  CalendarIcon,
  CommandLineIcon,
  PowerIcon,
  Squares2X2Icon,
  TrashIcon,
  ArrowLeftIcon,
  ExclamationCircleIcon,
  ArrowUpRightIcon
} from '@heroicons/react/24/outline'
import { useI18n } from '../i18n'

// Mapeamento de ícones para exibição (Nomes do HeroIcons ou Alias)
const iconMap: Record<string, any> = {
  Cpu: <CpuChipIcon />,
  CpuChip: <CpuChipIcon />,
  Search: <GlobeAltIcon />,
  GlobeAlt: <GlobeAltIcon />,
  Music: <MusicalNoteIcon />,
  MusicalNote: <MusicalNoteIcon />,
  Calendar: <CalendarIcon />,
  MessageSquare: <CommandLineIcon />,
  CommandLine: <CommandLineIcon />,
  FolderOpen: <PuzzlePieceIcon />, // Fallback aprimorado
  Puzzle: <PuzzlePieceIcon />,
  PuzzlePiece: <PuzzlePieceIcon />,
  Sparkles: <PuzzlePieceIcon />, // Temporário até importar SparklesIcon se necessário
  Variable: <CpuChipIcon />
}

import SecurityConfirm from '../components/floating/SecurityConfirm'

export default function ExtensionsView() {
  const { t } = useI18n()
  const location = useLocation()
  const [installed, setInstalled] = useState<Extension[]>([])
  const [available, setAvailable] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [installing, setInstalling] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'store' | 'installed' | 'system'>('installed')
  const [selectedExt, setSelectedExt] = useState<Extension | any | null>(null)

  // Security Modal State
  const [securityModal, setSecurityModal] = useState<{
    isOpen: boolean
    ext?: Extension
  }>({ isOpen: false })

  const loadData = async () => {
    setLoading(true)
    try {
      const [installedData, registryData] = await Promise.all([
        fetchExtensions(),
        fetchExtensionRegistry()
      ])
      setInstalled(installedData)
      setAvailable(registryData)

      // Sync selection if it's already open
      if (selectedExt) {
        const updated = installedData.find(e => e.id === selectedExt.id) || 
                        registryData.find(e => e.id === selectedExt.id)
        if (updated) setSelectedExt(updated)
      }
    } catch (err) {
      console.error('Erro ao carregar extensões:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    const tab = (location.state as any)?.tab
    if (tab === 'store' || tab === 'installed' || tab === 'system') {
      setActiveTab(tab)
    }
  }, [location.state])

  const handleInstall = async (ext: any) => {
    setInstalling(ext.id)
    try {
      await installExtension(ext.id, ext.download_url)
      await loadData()
    } catch (err) {
      alert(t('extensions.errors.install', { error: String(err) }))
    } finally {
      setInstalling(null)
    }
  }

  const handleToggle = async (ext: Extension) => {
    const newStatus = !ext.enabled

    if (newStatus && ext.category !== 'builtin') {
      setSecurityModal({ isOpen: true, ext })
      return
    }

    try {
      await toggleExtension(ext.id, newStatus)
      await loadData()
    } catch (err) {
      alert(t('extensions.errors.toggle', { error: String(err) }))
    }
  }

  const confirmToggle = async () => {
    const ext = securityModal.ext
    if (!ext) return

    try {
      await toggleExtension(ext.id, true)
      setSecurityModal({ isOpen: false })
      await loadData()
    } catch (err) {
      alert(t('extensions.errors.toggle', { error: String(err) }))
    }
  }

  const handleUninstall = async (ext: Extension) => {
    if (!window.confirm(t('extensions.confirmUninstall', { name: ext.name }))) {
      return
    }

    try {
      await uninstallExtension(ext.id)
      setSelectedExt(null)
      await loadData()
    } catch (err) {
      alert(t('extensions.errors.uninstall', { error: String(err) }))
    }
  }

  const isInstalled = (id: string) => installed.some((ext) => ext.id === id)

  const systemExtensions = installed.filter((ext) => ext.category === 'builtin')
  const userExtensions = installed.filter((ext) => ext.category !== 'builtin')

  const currentList = activeTab === 'installed' 
    ? userExtensions 
    : activeTab === 'system' 
      ? systemExtensions 
      : available.filter(ext => !isInstalled(ext.id)).map(ext => ({ ...ext, isStore: true }))

  return (
    <div className="flex-1 h-full bg-bg overflow-hidden flex flex-col font-sans">
      {/* Header Area (Compact Desktop) */}
      <div className={`p-2 flex items-center justify-between border-b border-white/5 bg-bg/80 backdrop-blur-xl z-20 flex-shrink-0 ${selectedExt ? 'opacity-40 pointer-events-none grayscale' : ''}`}>
        <div className="flex items-center gap-4">
          <h1 className="text-xs font-black text-text flex items-center gap-2 tracking-tight uppercase px-2 py-1">
            <PuzzlePieceIcon className="w-4 h-4 text-accent" />
            <span className="hidden sm:inline">{t('extensions.header.title')}</span>
          </h1>

          {/* Navigation Tabs (Icons only) */}
          <div className="flex items-center gap-1 p-0.5 bg-white/5 border border-white/5 rounded-lg">
            <button
              onClick={() => setActiveTab('installed')}
              title={t('extensions.tabs.installed')}
              className={`p-1.5 rounded-md flex items-center gap-1.5 ${
                activeTab === 'installed' ? 'bg-accent text-white shadow-sm' : 'text-text-muted hover:text-text hover:bg-white/5'
              }`}
            >
              <Squares2X2Icon className="w-3.5 h-3.5" />
              <span className="text-[9px] font-black">{userExtensions.length}</span>
            </button>

            <button
              onClick={() => setActiveTab('store')}
              title={t('extensions.tabs.store')}
              className={`p-1.5 rounded-md ${
                activeTab === 'store' ? 'bg-accent text-white shadow-sm' : 'text-text-muted hover:text-text hover:bg-white/5'
              }`}
            >
              <CloudArrowDownIcon className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => setActiveTab('system')}
              title={t('extensions.tabs.system')}
              className={`p-1.5 rounded-md ${
                activeTab === 'system' ? 'bg-accent text-white shadow-sm' : 'text-text-muted hover:text-text hover:bg-white/5'
              }`}
            >
              <CpuChipIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <button
          onClick={loadData}
          className="p-1 px-2 flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/5 rounded-md text-text-muted hover:text-text transition-colors"
        >
          <ArrowPathIcon className="w-3.5 h-3.5" />
          <span className="text-[8px] font-black uppercase tracking-widest hidden md:inline">Sync</span>
        </button>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* List Section */}
        <div className={`flex flex-col ${selectedExt ? 'w-[320px] border-r border-white/5' : 'w-full'}`}>
          <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
            <div className={`grid gap-3 ${selectedExt ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'}`}>
              {currentList.map((ext: any) => {
                const isSelected = selectedExt?.id === ext.id
                const isSystem = activeTab === 'system'
                const isStore = activeTab === 'store'
                
                return (
                  <div
                    key={ext.id}
                    onClick={() => setSelectedExt(ext)}
                    className={`group relative p-3.5 rounded-xl bg-card border cursor-pointer flex flex-col gap-3 overflow-hidden
                      ${isSelected ? 'border-accent bg-accent/[0.02] ring-2 ring-accent/5' : 'border-border/5 hover:border-white/10 hover:bg-white/[0.01]'}
                      ${!ext.enabled && !isStore ? 'opacity-60 grayscale-[0.5]' : ''}
                    `}
                  >
                    <div className="flex justify-between items-start z-10">
                      <div className={`p-2 rounded-lg bg-bg border border-white/5 ${isSelected ? 'border-accent/20' : ''}`}>
                         {iconMap[ext.icon || ext.manifest?.icon] ? (
                            React.cloneElement(iconMap[ext.icon || ext.manifest?.icon], { className: 'w-5 h-5 text-accent' })
                         ) : (
                           <PuzzlePieceIcon className="w-5 h-5 text-accent/50" />
                         )}
                      </div>
                      
                      <div className="flex flex-col items-end gap-1">
                        {ext.is_official || ext.author === 'WesleyQDev' ? (
                          <div className="flex items-center gap-1 px-1.5 py-0.5 bg-accent/10 border border-accent/20 rounded-md text-[8px] text-accent font-black uppercase tracking-widest text-center">
                            <CheckBadgeIcon className="w-2.5 h-2.5" />
                            {t('extensions.badges.trusted')}
                          </div>
                        ) : (
                          <div className="px-1.5 py-0.5 bg-orange-500/10 border border-orange-500/20 rounded-md text-[8px] text-orange-400 font-black uppercase tracking-widest">
                            {t('extensions.badges.thirdParty')}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="z-10">
                      <div className="flex items-center gap-2 mb-0.5">
                        <h3 className="font-black text-xs text-text tracking-tight flex items-center gap-2">
                          {ext.name}
                        </h3>
                        {!ext.enabled && !isStore && (
                           <span className="text-[7px] font-black uppercase tracking-tighter px-1 py-0.5 rounded-md bg-red-500/10 text-red-500 border border-red-500/20">
                             OFF
                           </span>
                        )}
                      </div>
                      <p className="text-[10px] text-text-muted/60 line-clamp-2 leading-relaxed font-medium">
                        {(ext.description || t('extensions.store.noDescription')).replace(/[\\"]/g, '')}
                      </p>
                    </div>

                    {!selectedExt && (
                      <div className="mt-auto pt-2 flex items-center justify-between z-10">
                        <div className="flex flex-col">
                          <span className="text-[8px] text-text-muted/30 uppercase font-black tracking-widest">
                            {ext.category || 'EXTENSÃO'}
                          </span>
                        </div>
                        <div className="flex items-center text-accent/30 group-hover:text-accent transition-colors">
                          <ArrowUpRightIcon className="w-3 h-3" />
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {currentList.length === 0 && !loading && (
               <div className="flex flex-col items-center justify-center p-12 text-center gap-4 opacity-20 grayscale">
                 <div className="p-5 rounded-full bg-white/5 border border-white/5">
                   <PuzzlePieceIcon className="w-10 h-10 text-text-muted" />
                 </div>
                 <div className="space-y-0.5">
                   <p className="text-xs font-black uppercase tracking-[0.2em]">{t('extensions.installed.emptyTitle')}</p>
                 </div>
               </div>
            )}
          </div>
        </div>

        {/* Details Section */}
        <div className={`flex-1 bg-card/20 backdrop-blur-xl overflow-hidden flex flex-col border-l border-white/5 ${selectedExt ? 'translate-x-0' : 'translate-x-full absolute'}`}>
          {selectedExt && (
            <>
              {/* Detail Header (Slim) */}
              <div className="p-3 border-b border-white/5 bg-white/[0.02] relative overflow-hidden flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 relative z-10">
                  <button 
                    onClick={() => setSelectedExt(null)}
                    title={t('common.back')}
                    className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-text-muted hover:text-text ring-1 ring-white/5 active:bg-accent active:text-white"
                  >
                    <ArrowLeftIcon className="w-3.5 h-3.5" />
                  </button>

                  <div className="p-2 rounded-xl bg-bg border border-white/10 shadow-lg shrink-0">
                    {iconMap[selectedExt.icon || selectedExt.manifest?.icon] ? (
                        React.cloneElement(iconMap[selectedExt.icon || selectedExt.manifest?.icon], { className: 'w-5 h-5 text-accent' })
                    ) : (
                      <PuzzlePieceIcon className="w-5 h-5 text-accent/50" />
                    )}
                  </div>

                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm font-black tracking-tight text-text uppercase leading-none">
                        {selectedExt.name}
                      </h2>
                      <span className="text-[8px] font-black text-accent tracking-widest px-1.5 py-0.5 bg-accent/10 rounded-md border border-accent/20">
                        V{selectedExt.version || selectedExt.manifest?.version || '0.1.0'}
                      </span>
                    </div>
                    <p className="text-[9px] font-black text-text-muted/70 uppercase tracking-tighter mt-0.5">
                      {selectedExt.author || selectedExt.manifest?.author || 'UNKNOWN'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 relative z-10">
                  {/* Persistent / System Badge */}
                  <div className={`px-2 py-1 rounded-md text-[8px] font-black uppercase tracking-widest border ${
                    selectedExt.category === 'builtin' 
                      ? 'bg-blue-500/5 text-blue-400 border-blue-500/10' 
                      : 'bg-green-500/5 text-green-400 border-green-500/10'
                  }`}>
                    {selectedExt.category === 'builtin' ? 'CORE' : 'ROAMING'}
                  </div>

                  {!isInstalled(selectedExt.id) ? (
                    <button
                      onClick={() => handleInstall(selectedExt)}
                      disabled={installing === selectedExt.id}
                      className="px-3 py-1.5 bg-accent text-white rounded-lg text-[9px] font-black uppercase tracking-widest hover:brightness-110 disabled:opacity-50 shadow-sm flex items-center gap-1.5"
                    >
                      {installing === selectedExt.id ? (
                        <ArrowPathIcon className="w-3 h-3" />
                      ) : (
                        <CloudArrowDownIcon className="w-3 h-3" />
                      )}
                      {installing === selectedExt.id ? t('extensions.actions.installing') : t('extensions.actions.install')}
                    </button>
                  ) : selectedExt.category !== 'builtin' ? (
                    <>
                      <button
                        onClick={() => handleToggle(selectedExt)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest shadow-sm ring-1 ${
                          selectedExt.enabled 
                          ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20 ring-red-500/10' 
                          : 'bg-accent/10 text-accent hover:bg-accent/20 ring-accent/10'
                        }`}
                      >
                        <PowerIcon className="w-3 h-3" />
                        {selectedExt.enabled ? t('extensions.actions.disable') : t('extensions.actions.enable')}
                      </button>
                      <button
                        onClick={() => handleUninstall(selectedExt)}
                        className="p-1.5 rounded-lg bg-red-400/5 text-red-400 hover:bg-red-500/10 hover:text-red-500 border border-red-500/5 shadow-sm"
                        title={t('extensions.actions.uninstall')}
                      >
                        <TrashIcon className="w-3.5 h-3.5" />
                      </button>
                    </>
                  ) : (
                     <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest bg-white/5 text-text-muted ring-1 ring-white/5 opacity-50">
                       <ShieldCheckIcon className="w-3 h-3" />
                       {t('extensions.status.core')}
                     </div>
                  )}
                </div>
              </div>

              {/* Detail Content */}
              <div className="flex-1 overflow-y-auto custom-scrollbar p-6 bg-card/[0.01]">
                <div className="max-w-3xl space-y-6 pb-8">
                   {(selectedExt.download_url || selectedExt.repo) && (
                     <div className="flex items-center justify-between p-2 px-3 rounded-lg bg-white/5 border border-white/5">
                        <div className="flex items-center gap-2">
                          <GlobeAltIcon className="w-3.5 h-3.5 text-accent/50" />
                          <span className="text-[9px] font-black text-text-muted uppercase tracking-widest">Source Repo</span>
                        </div>
                        <a 
                          href={selectedExt.download_url || selectedExt.repo} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-[9px] font-black text-accent hover:underline flex items-center gap-1"
                        >
                          GITHUB
                          <ArrowUpRightIcon className="w-3 h-3" />
                        </a>
                     </div>
                   )}

                   <div className="prose prose-invert prose-sm max-w-none prose-accent prose-headings:font-black prose-headings:tracking-tight prose-headings:uppercase prose-p:text-text-muted/70 prose-pre:bg-bg/40 prose-pre:border prose-pre:border-white/5 prose-pre:rounded-xl">
                     {selectedExt.manifest?.readme ? (
                       <ReactMarkdown remarkPlugins={[remarkGfm]}>
                         {selectedExt.manifest.readme}
                       </ReactMarkdown>
                     ) : (
                       <div className="flex flex-col items-center justify-center py-12 opacity-20 gap-3">
                         <ExclamationCircleIcon className="w-8 h-8" />
                         <p className="text-[10px] font-black uppercase tracking-widest">{t('extensions.detail.noReadme')}</p>
                       </div>
                     )}
                   </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <SecurityConfirm
        isOpen={securityModal.isOpen}
        extensionName={securityModal.ext?.name || ''}
        extensionAuthor={securityModal.ext?.author || ''}
        onConfirm={confirmToggle}
        onCancel={() => setSecurityModal({ isOpen: false })}
      />
    </div>
  )
}
