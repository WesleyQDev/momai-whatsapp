import { useState, useEffect, useCallback } from 'react'
import { fetchExtensions } from '../services/api'
import icon from '../assets/icon.png'
import {
  ChatBubbleLeftRightIcon,
  CalendarIcon,
  PuzzlePieceIcon,
  Cog6ToothIcon,
  CpuChipIcon,
  GlobeAltIcon,
  DocumentTextIcon,
  HomeIcon,
  QuestionMarkCircleIcon
} from '@heroicons/react/24/outline'
import { useI18n } from '../i18n'

interface LateralBarProps {
  activeRoute: string
  onNavigate: (path: string) => void
  onOpenSettings?: () => void
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
  }
}

const iconMap: Record<string, any> = {
  Cpu: CpuChipIcon,
  MessageSquare: ChatBubbleLeftRightIcon,
  Calendar: CalendarIcon,
  Puzzle: PuzzlePieceIcon,
  Layout: GlobeAltIcon
}

export default function LateralBar({
  activeRoute,
  onNavigate,
  onOpenSettings,
  isCompact = false
}: LateralBarProps) {
  const { t } = useI18n()
  const [extensions, setExtensions] = useState<ExtensionItem[]>([])
  const [showAbout, setShowAbout] = useState(false)
  const [version, setVersion] = useState('...')

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
    loadExtensions()
    window.api.getAppVersion().then(setVersion)

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
    const timer = setTimeout(loadExtensions, 3000)

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

          const renderExt = (ext: ExtensionItem, IconComponent: any = PuzzlePieceIcon) => {
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

          return (
            <>
              {renderExt(
                chatIcon || { id: 'com.momai.builtin.responder', name: 'responder', enabled: true },
                HomeIcon
              )}
              {renderNotes()}
              {renderScheduler()}
              {otherExtensions.map((ext) => renderExt(ext, iconMap[ext.category || 'Puzzle']))}
            </>
          )
        })()}

        <div className="w-8 h-[1px] bg-border/30 my-2" />

        {/* Store Icon */}
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
          <PuzzlePieceIcon
            className={`${isCompact ? 'w-4 h-4' : 'w-5 h-5'} transition-all duration-300 ease-out group-hover:scale-110`}
          />
        </button>

        {/* About Icon */}
        <button
          onClick={() => setShowAbout(true)}
          title="Sobre"
          className={`group relative ${isCompact ? 'w-8 h-8 rounded-lg' : 'w-10 h-10 rounded-xl'} shrink-0 bg-transparent border-none flex items-center justify-center transition-all duration-300 ease-out hover:bg-accent/10 text-text-muted hover:text-text`}
        >
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

      {showAbout && (
        <div
          className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          onClick={() => setShowAbout(false)}
        >
          <div
            className="w-full max-w-lg bg-card border border-border rounded-lg shadow-2xl overflow-hidden animate-zoom-in relative max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowAbout(false)}
              className="absolute top-3 right-3 p-1.5 rounded-lg text-text-muted hover:bg-white/5 hover:text-text transition-colors z-10"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>

            {/* Header */}
            <div className="flex flex-col items-center p-6 text-center border-b border-border">
              <h2 className="text-lg font-black text-text uppercase tracking-wider">MomAI</h2>
              <p className="text-xs text-text-muted mt-1">{version}</p>
              <p className="text-sm text-text-muted mt-4">Assistente pessoal inteligente</p>
              <p className="text-xs text-text-muted mt-4">Desenvolvido por</p>
              <p className="text-sm font-bold text-accent">Wesley Developer Studios</p>
              <p className="text-[10px] text-text-muted/50 mt-4">
                © 2025-2026 MomAI. Todos os direitos reservados.
              </p>
            </div>

            {/* Contato */}
            <div className="p-6">
              <h3 className="text-sm font-bold text-text mb-4 text-center">Fale Conosco</h3>
              <p className="text-xs text-text-muted text-center mb-4">
                Estamos aqui para ajudar! Entre em contato pela plataforma que preferir.
              </p>

              <div className="grid grid-cols-2 gap-3 mb-6">
                {/* Email */}
                <a
                  href="mailto:wesleyqueirozdeveloper@gmail.com"
                  className="flex flex-col items-center p-3 bg-bg border border-border rounded-lg hover:border-accent/50 hover:bg-accent/5 transition-all group"
                >
                  <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center mb-2 group-hover:bg-accent/20 transition-colors">
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className="text-accent"
                    >
                      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                      <polyline points="22,6 12,13 2,6" />
                    </svg>
                  </div>
                  <h4 className="text-xs font-bold text-text">Email</h4>
                  <p className="text-[10px] text-text-muted text-center mt-1">
                    wesleyqueirozdeveloper@gmail.com
                  </p>
                </a>

                {/* GitHub */}
                <a
                  href="https://github.com/Wesley-Developer-Studios"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex flex-col items-center p-3 bg-bg border border-border rounded-lg hover:border-accent/50 hover:bg-accent/5 transition-all group"
                >
                  <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center mb-2 group-hover:bg-accent/20 transition-colors">
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      className="text-accent"
                    >
                      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                    </svg>
                  </div>
                  <h4 className="text-xs font-bold text-text">GitHub</h4>
                  <p className="text-[10px] text-text-muted text-center mt-1">
                    Wesley Developer Studios
                  </p>
                </a>

                {/* YouTube */}
                <a
                  href="https://www.youtube.com/@WesleyDev"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex flex-col items-center p-3 bg-bg border border-border rounded-lg hover:border-accent/50 hover:bg-accent/5 transition-all group"
                >
                  <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center mb-2 group-hover:bg-accent/20 transition-colors">
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      className="text-accent"
                    >
                      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                    </svg>
                  </div>
                  <h4 className="text-xs font-bold text-text">YouTube</h4>
                  <p className="text-[10px] text-text-muted text-center mt-1">@WesleyDev</p>
                </a>

                {/* Repositório */}
                <a
                  href="https://github.com/WesleyQDev/MomAI"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex flex-col items-center p-3 bg-bg border border-border rounded-lg hover:border-accent/50 hover:bg-accent/5 transition-all group"
                >
                  <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center mb-2 group-hover:bg-accent/20 transition-colors">
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className="text-accent"
                    >
                      <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z" />
                      <polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02" />
                    </svg>
                  </div>
                  <h4 className="text-xs font-bold text-text">Repositório</h4>
                  <p className="text-[10px] text-text-muted text-center mt-1">
                    github.com/WesleyQDev/MomAI
                  </p>
                </a>
              </div>

              {/* Outras dúvidas */}
              <div className="border-t border-border pt-4 text-center">
                <h4 className="text-xs font-bold text-text mb-1">Outras dúvidas?</h4>
                <p className="text-[10px] text-text-muted mb-3">
                  Para questões, sugestões ou relatórios de bugs, abra uma issue no GitHub.
                </p>
                <a
                  href="https://github.com/WesleyQDev/MomAI/issues"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-accent text-white text-xs font-medium rounded-lg hover:bg-accent/90 transition-colors"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="16" x2="12" y2="12" />
                    <line x1="12" y1="8" x2="12.01" y2="8" />
                  </svg>
                  Abrir Issue no GitHub
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
