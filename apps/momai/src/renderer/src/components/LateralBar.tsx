import { useState, useEffect, useCallback } from 'react'
import { fetchExtensions } from '../services/api'
import icon from '../assets/icon.png'
import DOMPurify from 'dompurify'
import {
  ChatBubbleLeftRightIcon,
  CalendarIcon,
  WrenchIcon,
  Cog6ToothIcon,
  CpuChipIcon,
  GlobeAltIcon,
  DocumentTextIcon,
  QuestionMarkCircleIcon,
  Square3Stack3DIcon,
  ChartBarIcon,
  PuzzlePieceIcon,
  HomeIcon
} from '@heroicons/react/24/outline'
import { useI18n } from '../i18n'

const STORAGE_KEY = 'momai_sidebar_order'

const DEFAULT_ORDER = ['chat', 'notes', 'agenda', 'youtube', 'logs']

const BOTTOM_ITEMS = ['store', 'observability', 'about']

interface LateralBarProps {
  activeRoute: string
  onNavigate: (path: string, state?: Record<string, any>) => void
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
  icon?: string | null
  icon_url?: string | null
  manifest?: any
  features?: {
    sidebar?: boolean
    sidebarPanel?: {
      icon: string
      label: string
      panelEndpoint: string
    } | null
  }
}

function resolveSkillIconName(ext: any): string {
  if (ext?.icon) return ext.icon
  if (ext?.manifest?.icon) return ext.manifest.icon
  return ''
}

const LauncherIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path
      d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"
      fill="currentColor"
      fillOpacity="0.15"
    />
  </svg>
)

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
  RocketLaunch: CpuChipIcon,
  Launcher: LauncherIcon,
  Home: HomeIcon,
  home: HomeIcon
}

function InlineSvgIcon({ svg, className }: { svg: string; className?: string }) {
  const sanitized = DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true },
    ADD_ATTR: [
      'fill',
      'stroke',
      'stroke-width',
      'stroke-linecap',
      'stroke-linejoin',
      'fill-opacity',
      'stroke-opacity'
    ]
  })

  const cleaned = sanitized.replace(/<svg([^>]*)>/i, (_match, attrs) => {
    const noSize = attrs.replace(/\s(width|height)=("[^"]*"|'[^']*')/gi, '')
    const fillMatch = noSize.match(/\sfill=("[^"]*"|'[^']*')/i)
    if (fillMatch) {
      if (fillMatch[1] === '"none"' || fillMatch[1] === "'none'") {
        return `<svg${noSize}>`
      }
      const replaced = noSize.replace(/\sfill=("[^"]*"|'[^']*')/i, ' fill="currentColor"')
      return `<svg${replaced}>`
    }
    return `<svg${noSize} fill="currentColor">`
  })
  return (
    <span className={className} aria-hidden="true" dangerouslySetInnerHTML={{ __html: cleaned }} />
  )
}

function resolveSkillIcon(ext: any): React.ComponentType<any> | string {
  const icon = ext?.icon ?? ext?.manifest?.icon
  if (!icon) return PuzzlePieceIcon
  if (typeof icon === 'string' && icon.trim().toLowerCase().startsWith('<svg')) {
    return { __svg: icon } as any
  }
  if (iconMap[icon]) return iconMap[icon]
  if (typeof icon === 'string' && icon.length <= 4) return icon
  return PuzzlePieceIcon
}

function loadOrder(skipLogs = false): string[] {
  const hideLogs = skipLogs || localStorage.getItem('momai_logs_enabled') !== 'true'
  const defaults = hideLogs ? DEFAULT_ORDER.filter((id) => id !== 'logs') : [...DEFAULT_ORDER]
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored) as string[]
      if (Array.isArray(parsed) && parsed.length > 0) {
        const valid = parsed.filter((id) => !id.startsWith('__'))
        const validFiltered = hideLogs ? valid.filter((id) => id !== 'logs') : valid
        const merged = [...new Set([...validFiltered, ...defaults])]
        saveOrder(merged)
        return merged
      }
    }
  } catch {}
  saveOrder(defaults)
  return defaults
}

function saveOrder(order: string[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(order))
}

function useSidebarOrder(isDev: boolean) {
  const [order, setOrder] = useState<string[]>(() => loadOrder(!isDev))

  const reorder = useCallback((fromIndex: number, toIndex: number) => {
    setOrder((prev) => {
      const next = [...prev]
      const [moved] = next.splice(fromIndex, 1)
      next.splice(toIndex, 0, moved)
      saveOrder(next)
      return next
    })
  }, [])

  const ensureInOrder = useCallback((ids: string[]) => {
    setOrder((prev) => {
      const next = [...prev]
      let changed = false
      for (const id of ids) {
        if (!next.includes(id)) {
          next.push(id)
          changed = true
        }
      }
      if (changed) {
        saveOrder(next)
        return next
      }
      return prev
    })
  }, [])

  return { order, setOrder, reorder, ensureInOrder }
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
  const [seenPanels, setSeenPanels] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('momai_seen_panels')
      return stored ? JSON.parse(stored) : []
    } catch {
      return []
    }
  })
  const [devMode, setDevMode] = useState(() => localStorage.getItem('momai_dev_mode') === 'true')
  const [logsEnabled, setLogsEnabled] = useState(
    () => localStorage.getItem('momai_logs_enabled') === 'true'
  )
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [dropIdx, setDropIdx] = useState<number | null>(null)
  const { order, setOrder, reorder, ensureInOrder } = useSidebarOrder(devMode)

  const markAsSeen = (extId: string) => {
    if (!seenPanels.includes(extId)) {
      const newSeen = [...seenPanels, extId]
      setSeenPanels(newSeen)
      localStorage.setItem('momai_seen_panels', JSON.stringify(newSeen))
    }
  }

  useEffect(() => {
    if (extensions.length === 0) return

    const enabledPanelIds = extensions
      .filter(
        (e) =>
          (e.features?.sidebarPanel || e.features?.sidebar) && e.enabled && e.name !== 'responder'
      )
      .map((e) => e.id)

    setSeenPanels((prev) => {
      const filtered = prev.filter((id) => enabledPanelIds.includes(id))
      if (filtered.length !== prev.length) {
        localStorage.setItem('momai_seen_panels', JSON.stringify(filtered))
        return filtered
      }
      return prev
    })
  }, [extensions])

  const handlePanelClick = (extId: string) => {
    markAsSeen(extId)
    onOpenPanel?.(extId)
  }

  useEffect(() => {
    const handler = () => {
      setObservabilityEnabled(localStorage.getItem('momai_observability_enabled') === 'true')
    }
    const devHandler = () => {
      const enabled = localStorage.getItem('momai_dev_mode') === 'true'
      setDevMode(enabled)
      setLogsEnabled(localStorage.getItem('momai_logs_enabled') === 'true')
      setOrder(loadOrder(!enabled))
    }
    const logsHandler = () => {
      const isDev = localStorage.getItem('momai_dev_mode') === 'true'
      const enabled = localStorage.getItem('momai_logs_enabled') === 'true'
      setLogsEnabled(enabled)
      setOrder(loadOrder(!isDev))
    }
    window.addEventListener('momai_observability_sync', handler)
    window.addEventListener('momai_dev_mode_sync', devHandler)
    window.addEventListener('momai_logs_sync', logsHandler)
    return () => {
      window.removeEventListener('momai_observability_sync', handler)
      window.removeEventListener('momai_dev_mode_sync', devHandler)
      window.removeEventListener('momai_logs_sync', logsHandler)
    }
  }, [])

  const loadExtensions = useCallback(async () => {
    try {
      const allExts = await fetchExtensions()
      const sorted = (allExts as any[]).sort((a, b) => {
        if (a.id?.includes('responder')) return -1
        if (b.id?.includes('responder')) return 1
        return 0
      })
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

    const timer = setTimeout(() => {
      if (!loaded) loadExtensions()
    }, 3000)

    return () => {
      window.removeEventListener('momai_extensions_sync', handleSync)
      window.removeEventListener('momai_backend_ready', handleReady)
      clearTimeout(timer)
    }
  }, [loadExtensions])

  const otherExtensions = extensions.filter(
    (e) => e.features?.sidebar && e.enabled && e.name !== 'responder' && e.name !== 'scheduler'
  )

  const panelExtensions = extensions.filter(
    (e) => e.features?.sidebarPanel && e.enabled && e.id !== 'responder'
  )

  useEffect(() => {
    const extIds: string[] = []
    for (const ext of otherExtensions) {
      extIds.push(`ext:${ext.id}`)
    }
    for (const ext of panelExtensions) {
      extIds.push(`panel:${ext.id}`)
    }
    if (extIds.length > 0) {
      ensureInOrder(extIds)
    }
  }, [otherExtensions, panelExtensions, ensureInOrder])

  const chatIcon = extensions.find((e) => e.name === 'responder')

  const renderExt = (ext: ExtensionItem) => {
    const isChat = ext.name === 'responder'
    const route = isChat ? '/' : `/extensions/${ext.id}`
    const isActive = isChat ? activeRoute === '/' : activeRoute === `/extensions/${ext.id}`
    const Icon = resolveSkillIcon(ext)
    const isNew = ext.name !== 'responder' && !seenPanels.includes(ext.id)

    return (
      <button
        key={ext.id}
        onClick={() => {
          markAsSeen(ext.id)
          onNavigate(route)
        }}
        title={isChat ? t('sidebar.chat') || 'Chat' : ext.name}
        id={isChat ? 'tutorial-chat' : undefined}
        className={`group relative ${isCompact ? 'w-8 h-8 rounded-lg' : 'w-10 h-10 rounded-xl'} shrink-0 bg-transparent border-none flex items-center justify-center transition-all duration-300 ease-out hover:bg-accent/10 ${isActive ? 'text-accent bg-accent/5' : 'text-text-muted hover:text-text'}`}
      >
        {isActive && (
          <div
            className={`absolute ${isCompact ? '-left-2 h-4' : '-left-3 h-6'} w-1 bg-accent rounded-r-full animate-fade-in`}
          />
        )}
        {ext.icon_url || ext.manifest?.icon_url ? (
          <div
            style={{
              maskImage: `url(${ext.icon_url || ext.manifest?.icon_url})`,
              WebkitMaskImage: `url(${ext.icon_url || ext.manifest?.icon_url})`,
              maskSize: 'contain',
              WebkitMaskSize: 'contain',
              maskRepeat: 'no-repeat',
              WebkitMaskRepeat: 'no-repeat',
              maskPosition: 'center',
              WebkitMaskPosition: 'center'
            }}
            className={`${isCompact ? 'w-4 h-4' : 'w-5 h-5'} bg-current transition-all duration-300 ease-out group-hover:scale-110`}
          />
        ) : (Icon as any)?.__svg ? (
          <InlineSvgIcon
            svg={(Icon as any).__svg}
            className={`${isCompact ? 'w-4 h-4' : 'w-5 h-5'} transition-all duration-300 ease-out group-hover:scale-110 [&>svg]:w-full [&>svg]:h-full`}
          />
        ) : typeof Icon === 'string' ? (
          <span
            className={`${isCompact ? 'text-sm' : 'text-base'} transition-all duration-300 ease-out group-hover:scale-110`}
          >
            {Icon}
          </span>
        ) : (
          <Icon
            className={`${isCompact ? 'w-4 h-4' : 'w-5 h-5'} transition-all duration-300 ease-out group-hover:scale-110`}
          />
        )}
        {isNew && (
          <span
            className={`absolute left-1/2 -translate-x-1/2 ${isCompact ? 'bottom-[-7px] px-1 text-[6px] h-3' : 'bottom-[-11px] px-1.5 text-[7px] h-3.5'} flex items-center justify-center rounded-full bg-emerald-500 font-extrabold uppercase tracking-wider text-white shadow-[0_0_8px rgba(16,185,129,0.5)] animate-pulse z-10 pointer-events-none`}
          >
            New
          </span>
        )}
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

  const renderYouTube = () => (
    <button
      onClick={() => onNavigate('/', { prefillText: 'Pesquisar no Youtube: ' })}
      title="YouTube"
      className={`group relative ${isCompact ? 'w-8 h-8 rounded-lg' : 'w-10 h-10 rounded-xl'} shrink-0 bg-transparent border-none flex items-center justify-center transition-all duration-300 ease-out hover:bg-accent/10 text-text-muted hover:text-text`}
    >
      <svg
        className={`${isCompact ? 'w-4 h-4' : 'w-5 h-5'} transition-all duration-300 ease-out group-hover:scale-110`}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="2" y="4" width="20" height="16" rx="4" />
        <polygon points="10,8.5 16,12 10,15.5" fill="currentColor" stroke="none" />
      </svg>
    </button>
  )

  const renderLogs = () => {
    const isActive = activeRoute === '/logs'
    return (
      <button
        onClick={() => onNavigate('/logs')}
        title="Logs"
        className={`group relative ${isCompact ? 'w-8 h-8 rounded-lg' : 'w-10 h-10 rounded-xl'} shrink-0 bg-transparent border-none flex items-center justify-center transition-all duration-300 ease-out hover:bg-accent/10 ${isActive ? 'text-accent bg-accent/5' : 'text-text-muted hover:text-text'}`}
      >
        {isActive && (
          <div
            className={`absolute ${isCompact ? '-left-2 h-4' : '-left-3 h-6'} w-1 bg-accent rounded-r-full animate-fade-in`}
          />
        )}
        <svg
          className={`${isCompact ? 'w-4 h-4' : 'w-5 h-5'} transition-all duration-300 ease-out group-hover:scale-110`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="2" y="3" width="20" height="14" rx="2" />
          <line x1="8" y1="10" x2="16" y2="10" />
          <line x1="8" y1="14" x2="12" y2="14" />
        </svg>
      </button>
    )
  }

  const renderExtensionGroup = () => <>{otherExtensions.map((ext) => renderExt(ext))}</>

  const renderPanelExtensions = () => {
    if (panelExtensions.length === 0) return null
    return (
      <>
        <div className="w-6 h-px bg-white/10 my-1" />
        {panelExtensions.map((ext) => {
          const panel = ext.features?.sidebarPanel
          const isNew = !seenPanels.includes(ext.id)
          return (
            <button
              key={`panel-${ext.id}`}
              onClick={() => handlePanelClick(ext.id)}
              title={panel?.label || ext.name}
              className={`group relative ${isCompact ? 'w-8 h-8 rounded-lg' : 'w-10 h-10 rounded-xl'} shrink-0 bg-transparent border-none flex items-center justify-center transition-all duration-300 ease-out hover:bg-accent/10 text-text-muted hover:text-text`}
            >
              <span className="text-base transition-all duration-300 ease-out group-hover:scale-110">
                {panel?.icon || '🧩'}
              </span>
              {isNew && (
                <span
                  className={`absolute left-1/2 -translate-x-1/2 ${isCompact ? 'bottom-[-7px] px-1 text-[6px] h-3' : 'bottom-[-11px] px-1.5 text-[7px] h-3.5'} flex items-center justify-center rounded-full bg-emerald-500 font-extrabold uppercase tracking-wider text-white shadow-[0_0_8px rgba(16,185,129,0.5)] animate-pulse z-10 pointer-events-none`}
                >
                  New
                </span>
              )}
            </button>
          )
        })}
      </>
    )
  }

  const renderStore = () => (
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
  )

  const renderObservability = () => {
    if (!observabilityEnabled) return null
    return (
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
    )
  }

  const renderAbout = () => (
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
  )

  const handleDragStart = (idx: number) => (e: React.DragEvent) => {
    e.dataTransfer.effectAllowed = 'move'
    setDragIdx(idx)
  }

  const handleDragOver = (idx: number) => (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDropIdx(idx)
  }

  const handleDragEnd = () => {
    if (dragIdx !== null && dropIdx !== null && dragIdx !== dropIdx) {
      reorder(dragIdx, dropIdx)
    }
    setDragIdx(null)
    setDropIdx(null)
  }

  const withDrag = (itemId: string, idx: number, content: React.ReactNode) => (
    <div key={itemId} className="relative w-full flex flex-col items-center">
      {dropIdx === idx && dragIdx !== null && dragIdx !== idx && (
        <div className="w-10 h-0.5 rounded-full bg-accent/60 my-0.5" />
      )}
      <div
        draggable
        onDragStart={handleDragStart(idx)}
        onDragOver={handleDragOver(idx)}
        onDragEnd={handleDragEnd}
        className={`${dragIdx === idx ? 'opacity-40 scale-95' : ''} transition-all duration-200 ease-out`}
      >
        {content}
      </div>
    </div>
  )

  const renderItem = (itemId: string, idx: number) => {
    if (itemId === '__extensions__') {
      return (
        <div key={itemId} className="w-full flex flex-col items-center">
          {renderExtensionGroup()}
        </div>
      )
    }
    if (itemId === '__panel_extensions__') {
      return (
        <div key={itemId} className="w-full flex flex-col items-center">
          {renderPanelExtensions()}
        </div>
      )
    }
    if (itemId === 'chat') {
      return withDrag(
        itemId,
        idx,
        renderExt(
          chatIcon || {
            id: 'com.momai.builtin.responder',
            name: 'responder',
            enabled: true,
            icon: 'MessageSquare'
          }
        )
      )
    }
    if (itemId === 'notes') return withDrag(itemId, idx, renderNotes())
    if (itemId === 'agenda') return withDrag(itemId, idx, renderScheduler())
    if (itemId === 'youtube') return withDrag(itemId, idx, renderYouTube())
    if (itemId === 'logs' && !logsEnabled) return null
    if (itemId === 'logs') return withDrag(itemId, idx, renderLogs())
    if (itemId.startsWith('ext:')) {
      const ext = otherExtensions.find((e) => e.id === itemId.slice(4))
      if (!ext) return null
      return withDrag(itemId, idx, renderExt(ext))
    }
    if (itemId.startsWith('panel:')) {
      const ext = panelExtensions.find((e) => e.id === itemId.slice(6))
      if (!ext) return null
      const panel = ext.features?.sidebarPanel
      const isNew = !seenPanels.includes(ext.id)
      return withDrag(
        itemId,
        idx,
        <button
          onClick={() => handlePanelClick(ext.id)}
          title={panel?.label || ext.name}
          className={`group relative ${isCompact ? 'w-8 h-8 rounded-lg' : 'w-10 h-10 rounded-xl'} shrink-0 bg-transparent border-none flex items-center justify-center transition-all duration-300 ease-out hover:bg-accent/10 text-text-muted hover:text-text`}
        >
          <span className="text-base transition-all duration-300 ease-out group-hover:scale-110">
            {panel?.icon || '🧩'}
          </span>
          {isNew && (
            <span
              className={`absolute left-1/2 -translate-x-1/2 ${isCompact ? 'bottom-[-7px] px-1 text-[6px] h-3' : 'bottom-[-11px] px-1.5 text-[7px] h-3.5'} flex items-center justify-center rounded-full bg-emerald-500 font-extrabold uppercase tracking-wider text-white shadow-[0_0_8px rgba(16,185,129,0.5)] animate-pulse z-10 pointer-events-none`}
            >
              New
            </span>
          )}
        </button>
      )
    }
    return null
  }

  return (
    <div
      className={`${isCompact ? 'w-12 py-2' : 'w-16 py-4'} bg-bg/80 backdrop-blur-xl border-r border-white/5 flex flex-col justify-between z-50 transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] shadow-2xl animate-slide-right`}
    >
      <div
        className={`flex flex-col items-center w-full ${isCompact ? 'gap-1' : 'gap-2'} overflow-y-auto scrollbar-none`}
      >
        {order.map((itemId, idx) => renderItem(itemId, idx))}
        <div className="w-6 h-px bg-white/10 my-1" />
        {BOTTOM_ITEMS.map((itemId) => {
          if (itemId === 'store')
            return (
              <div key={itemId} className="w-full flex flex-col items-center">
                {renderStore()}
              </div>
            )
          if (itemId === 'observability')
            return (
              <div key={itemId} className="w-full flex flex-col items-center">
                {renderObservability()}
              </div>
            )
          if (itemId === 'about')
            return (
              <div key={itemId} className="w-full flex flex-col items-center">
                {renderAbout()}
              </div>
            )
          return null
        })}
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
