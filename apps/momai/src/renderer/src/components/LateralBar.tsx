import { useState, useEffect, useCallback } from 'react'
import { fetchExtensions } from '../services/api'
import icon from '../assets/icon.png'
import {
  ChatBubbleLeftRightIcon,
  CalendarIcon,
  WrenchIcon,
  Cog6ToothIcon,
  CpuChipIcon,
  GlobeAltIcon,
  DocumentTextIcon,
  HomeIcon,
  QuestionMarkCircleIcon,
  Square3Stack3DIcon,
  ChartBarIcon
} from '@heroicons/react/24/outline'
import { useI18n } from '../i18n'

interface LateralBarProps {
  activeRoute: string
  onNavigate: (path: string) => void
  onOpenSettings?: () => void
  onOpenPanel?: (extensionId: string | null) => void
  isCompact?: boolean
}

interface ExtensionItem {
  id: string
  name: string
  description?: string
  category?: string
  enabled: boolean
  features?: {
    sidebar?: boolean
    sidebarPanel?: {
      icon: string
      label: string
      panelEndpoint: string
    } | null
  }
}

const iconMap: Record<string, any> = {
  Cpu: CpuChipIcon,
  MessageSquare: ChatBubbleLeftRightIcon,
  Calendar: CalendarIcon,
  Puzzle: WrenchIcon,
  Wrench: WrenchIcon,
  Layout: GlobeAltIcon,
  Sun: GlobeAltIcon,
  MagnifyingGlass: GlobeAltIcon,
  Clock: CalendarIcon,
  BookOpen: DocumentTextIcon,
  RocketLaunch: CpuChipIcon
}

export default function LateralBar({
  activeRoute,
  onNavigate,
  onOpenSettings,
  onOpenPanel,
  isCompact = false
}: LateralBarProps) {
  const { t } = useI18n()
  const [extensions, setExtensions] = useState<ExtensionItem[]>([])
  const [observabilityEnabled, setObservabilityEnabled] = useState(
    () => localStorage.getItem('momai_observability_enabled') === 'true'
  )

  useEffect(() => {
    const handler = () => {
      setObservabilityEnabled(localStorage.getItem('momai_observability_enabled') === 'true')
    }
    window.addEventListener('momai_observability_sync', handler)
    return () => window.removeEventListener('momai_observability_sync', handler)
  }, [])

  const loadExtensions = useCallback(async () => {
    try {
      const allExts = await fetchExtensions()
      const sorted = (allExts as any[]).sort((a, b) => {
        if (a.id?.includes('responder')) return -1
        if (b.id?.includes('responder')) return 1
        return 0
      })
      // Core extensions should always be in the list if they exist
      setExtensions(sorted)
    } catch (err) {
      console.error('Error loading extensions in sidebar:', err)
    }
  }, [])

  useEffect(() => {
    let loaded = false
    loadExtensions().then(() => {
      loaded = true
    })

    const handleSync = (e: any) => {
      const allExts = e.detail as ExtensionItem[]
      const sorted = allExts.sort((a, b) => {
        if (a.id?.includes('responder')) return -1
        if (b.id?.includes('responder')) return 1
        return 0
      })
      setExtensions(sorted)
    }

    const handleReady = () => {
      loadExtensions()
    }

    window.addEventListener('momai_extensions_sync', handleSync)
    window.addEventListener('momai_backend_ready', handleReady)

    // Fallback retry
    const timer = setTimeout(() => {
      if (!loaded) loadExtensions()
    }, 3000)

    return () => {
      window.removeEventListener('momai_extensions_sync', handleSync)
      window.removeEventListener('momai_backend_ready', handleReady)
      clearTimeout(timer)
    }
  }, [loadExtensions])

  return (
    <div
      className={`${isCompact ? 'w-12 py-2' : 'w-16 py-4'} bg-bg/80 backdrop-blur-xl border-r border-white/5 flex flex-col justify-between z-50 transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] shadow-2xl animate-slide-right`}
    >
      <div
        className={`flex flex-col items-center w-full ${isCompact ? 'gap-2' : 'gap-4'} overflow-y-auto scrollbar-none`}
      >
        {/* All items are now dynamic and reordered */}
        {(() => {
          const chatIcon = extensions.find((e) => e.name === 'responder')

          const renderExt = (ext: ExtensionItem, IconComponent: any = WrenchIcon) => {
            const isChat = ext.name === 'responder'
            const route = isChat ? '/' : `/extensions/${ext.id}`
            const isActive = isChat ? activeRoute === '/' : activeRoute === `/extensions/${ext.id}`

            return (
              <button
                key={ext.id}
                onClick={() => onNavigate(route)}
                title={ext.name}
                id={isChat ? 'tutorial-chat' : undefined}
                className={`group relative ${isCompact ? 'w-8 h-8 rounded-lg' : 'w-10 h-10 rounded-xl'} shrink-0 bg-transparent border-none flex items-center justify-center transition-all duration-300 ease-out hover:bg-accent/10 ${isActive ? 'text-accent bg-accent/5' : 'text-text-muted hover:text-text'}`}
              >
                {isActive && (
                  <div
                    className={`absolute ${isCompact ? '-left-2 h-4' : '-left-3 h-6'} w-1 bg-accent rounded-r-full animate-fade-in`}
                  />
                )}
                <IconComponent
                  className={`${isCompact ? 'w-4 h-4' : 'w-5 h-5'} transition-all duration-300 ease-out group-hover:scale-110`}
                />
              </button>
            )
          }

          const renderNotes = () => (
            <button
              onClick={() => onNavigate('/notes')}
              title={t('sidebar.notes')}
              id="tutorial-notes"
              className={`group relative ${isCompact ? 'w-8 h-8 rounded-lg' : 'w-10 h-10 rounded-xl'} shrink-0 bg-transparent border-none flex items-center justify-center transition-all duration-300 ease-out hover:bg-accent/10 ${activeRoute === '/notes' ? 'text-accent bg-accent/5' : 'text-text-muted hover:text-text'}`}
            >
              {activeRoute === '/notes' && (
                <div
                  className={`absolute ${isCompact ? '-left-2 h-4' : '-left-3 h-6'} w-1 bg-accent rounded-r-full animate-fade-in`}
                />
              )}
              <DocumentTextIcon
                className={`${isCompact ? 'w-4 h-4' : 'w-5 h-5'} transition-all duration-300 ease-out group-hover:scale-110`}
              />
            </button>
          )

          const renderScheduler = () => {
            const isActive = activeRoute === '/agenda'
            return (
              <button
                onClick={() => onNavigate('/agenda')}
                title={t('sidebar.agenda') || 'Agenda'}
                className={`group relative ${isCompact ? 'w-8 h-8 rounded-lg' : 'w-10 h-10 rounded-xl'} shrink-0 bg-transparent border-none flex items-center justify-center transition-all duration-300 ease-out hover:bg-accent/10 ${isActive ? 'text-accent bg-accent/5' : 'text-text-muted hover:text-text'}`}
              >
                {isActive && (
                  <div
                    className={`absolute ${isCompact ? '-left-2 h-4' : '-left-3 h-6'} w-1 bg-accent rounded-r-full animate-fade-in`}
                  />
                )}
                <CalendarIcon
                  className={`${isCompact ? 'w-4 h-4' : 'w-5 h-5'} transition-all duration-300 ease-out group-hover:scale-110`}
                />
              </button>
            )
          }

          const otherExtensions = extensions.filter(
            (e) =>
              e.features?.sidebar && e.enabled && e.name !== 'responder' && e.name !== 'scheduler'
          )

          const panelExtensions = extensions.filter(
            (e) => e.features?.sidebarPanel && e.enabled && e.id !== 'responder'
          )

          return (
            <>
              {renderExt(
                chatIcon || { id: 'com.momai.builtin.responder', name: 'responder', enabled: true },
                HomeIcon
              )}
              {renderNotes()}
              {renderScheduler()}
              {otherExtensions.map((ext) => renderExt(ext, iconMap[ext.category || 'Puzzle']))}

              {/* Extension Panels Section */}
              {panelExtensions.length > 0 && (
                <>
                  <div className="w-6 h-px bg-white/10 my-1" />
                  {panelExtensions.map((ext) => {
                    const panel = ext.features?.sidebarPanel
                    return (
                      <button
                        key={`panel-${ext.id}`}
                        onClick={() => onOpenPanel?.(ext.id)}
                        title={panel?.label || ext.name}
                        className={`group relative ${isCompact ? 'w-8 h-8 rounded-lg' : 'w-10 h-10 rounded-xl'} shrink-0 bg-transparent border-none flex items-center justify-center transition-all duration-300 ease-out hover:bg-accent/10 text-text-muted hover:text-text`}
                      >
                        <span className="text-base transition-all duration-300 ease-out group-hover:scale-110">
                          {panel?.icon || '🧩'}
                        </span>
                      </button>
                    )
                  })}
                </>
              )}
            </>
          )
        })()}

        <button
          onClick={() => onNavigate('/extensions')}
          title={t('sidebar.store')}
          id="tutorial-store"
          className={`group relative ${isCompact ? 'w-8 h-8 rounded-lg' : 'w-10 h-10 rounded-xl'} shrink-0 bg-transparent border-none flex items-center justify-center transition-all duration-300 ease-out hover:bg-accent/10 ${activeRoute === '/extensions' ? 'text-accent bg-accent/5' : 'text-text-muted hover:text-text'}`}
        >
          {activeRoute === '/extensions' && (
            <div
              className={`absolute ${isCompact ? '-left-2 h-4' : '-left-3 h-6'} w-1 bg-accent rounded-r-full animate-fade-in`}
            />
          )}
          <Square3Stack3DIcon
            className={`${isCompact ? 'w-4 h-4' : 'w-5 h-5'} transition-all duration-300 ease-out group-hover:scale-110`}
          />
        </button>

        {/* Observability Icon */}
        {observabilityEnabled && (
          <button
            onClick={() => onNavigate('/observability')}
            title="Observabilidade"
            className={`group relative ${isCompact ? 'w-8 h-8 rounded-lg' : 'w-10 h-10 rounded-xl'} shrink-0 bg-transparent border-none flex items-center justify-center transition-all duration-300 ease-out hover:bg-accent/10 ${activeRoute === '/observability' ? 'text-accent bg-accent/5' : 'text-text-muted hover:text-text'}`}
          >
            {activeRoute === '/observability' && (
              <div
                className={`absolute ${isCompact ? '-left-2 h-4' : '-left-3 h-6'} w-1 bg-accent rounded-r-full animate-fade-in`}
              />
            )}
            <ChartBarIcon
              className={`${isCompact ? 'w-4 h-4' : 'w-5 h-5'} transition-all duration-300 ease-out group-hover:scale-110`}
            />
          </button>
        )}

        {/* About Icon */}
        <button
          onClick={() => onNavigate('/about')}
          title={t('sidebar.about')}
          className={`group relative ${isCompact ? 'w-8 h-8 rounded-lg' : 'w-10 h-10 rounded-xl'} shrink-0 bg-transparent border-none flex items-center justify-center transition-all duration-300 ease-out hover:bg-accent/10 ${activeRoute === '/about' ? 'text-accent bg-accent/5' : 'text-text-muted hover:text-text'}`}
        >
          {activeRoute === '/about' && (
            <div
              className={`absolute ${isCompact ? '-left-2 h-4' : '-left-3 h-6'} w-1 bg-accent rounded-r-full animate-fade-in`}
            />
          )}
          <QuestionMarkCircleIcon
            className={`${isCompact ? 'w-4 h-4' : 'w-5 h-5'} transition-all duration-300 ease-out group-hover:scale-110`}
          />
        </button>
      </div>

      <div className="flex flex-col items-center w-full gap-2">
        <button
          onClick={onOpenSettings}
          title={t('sidebar.settings')}
          className={`${isCompact ? 'w-8 h-8 rounded-lg' : 'w-10 h-10 rounded-xl'} bg-transparent border-none text-text-muted cursor-pointer flex items-center justify-center transition-all duration-300 ease-out hover:bg-white/5 hover:text-text`}
        >
          <Cog6ToothIcon className={`${isCompact ? 'w-4 h-4' : 'w-5 h-5'}`} />
        </button>
      </div>
    </div>
  )
}
