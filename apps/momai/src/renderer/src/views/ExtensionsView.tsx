import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react'

/* ─── Hook: Drag to Scroll ─── */
function useDragScroll(scrollRef: React.RefObject<HTMLDivElement | null>) {
  const isDragging = useRef(false)
  const hasDragged = useRef(false)
  const initialX = useRef(0)
  const initialScrollLeft = useRef(0)
  const onMouseUpRef = useRef<(() => void) | null>(null)

  const onMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging.current) return
      const deltaX = Math.abs(e.pageX - initialX.current)
      if (deltaX > 5) {
        hasDragged.current = true
      }
      const walk = e.pageX - initialX.current
      if (scrollRef.current) {
        scrollRef.current.scrollLeft = initialScrollLeft.current - walk
      }
    },
    [scrollRef]
  )

  const onMouseUp = useCallback(() => {
    isDragging.current = false
    window.removeEventListener('mousemove', onMouseMove)
    if (onMouseUpRef.current) {
      window.removeEventListener('mouseup', onMouseUpRef.current)
    }
    if (scrollRef.current) {
      scrollRef.current.style.cursor = 'grab'
      scrollRef.current.style.userSelect = ''
    }
  }, [onMouseMove, scrollRef])

  useEffect(() => {
    onMouseUpRef.current = onMouseUp
  }, [onMouseUp])

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      isDragging.current = true
      hasDragged.current = false
      initialX.current = e.pageX
      initialScrollLeft.current = scrollRef.current?.scrollLeft || 0
      scrollRef.current!.style.cursor = 'grabbing'
      scrollRef.current!.style.userSelect = 'none'
      window.addEventListener('mousemove', onMouseMove)
      window.addEventListener('mouseup', onMouseUp)
    },
    [onMouseMove, onMouseUp, scrollRef]
  )

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      hasDragged.current = false
      initialX.current = e.touches[0].pageX
      initialScrollLeft.current = scrollRef.current?.scrollLeft || 0
    },
    [scrollRef]
  )

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      const deltaX = Math.abs(e.touches[0].pageX - initialX.current)
      if (deltaX > 5) {
        hasDragged.current = true
      }
      const walk = e.touches[0].pageX - initialX.current
      if (scrollRef.current) {
        scrollRef.current.scrollLeft = initialScrollLeft.current - walk
      }
    },
    [scrollRef]
  )

  const isDraggingScroll = useCallback(() => {
    return hasDragged.current
  }, [])

  return {
    mouseDown: handleMouseDown,
    touchStart: handleTouchStart,
    touchMove: handleTouchMove,
    isDraggingScroll,
    grabCursor: 'grab' as const
  }
}
import { useLocation } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  fetchExtensions,
  installExtension,
  toggleExtension,
  uninstallExtension,
  fetchExtensionManifest,
  fetchExtensionReleases,
  fetchSettings,
  updateSettingsPartial,
  Extension,
  ExtensionRelease,
  InstallProgress,
  InstallError
} from '../services/api'
import ExtensionInstallCard from '../components/extensions/ExtensionInstallCard'
import ExtensionUninstallModal from '../components/extensions/ExtensionUninstallModal'
import {
  WrenchIcon,
  StarIcon,
  CheckBadgeIcon,
  CloudArrowDownIcon,
  ArrowPathIcon,
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
  ArrowUpRightIcon,
  SparklesIcon,
  SunIcon,
  CloudIcon,
  MagnifyingGlassIcon,
  ClockIcon,
  BookOpenIcon,
  RocketLaunchIcon,
  UserIcon,
  TagIcon,
  BoltIcon,
  ShieldCheckIcon,
  ShoppingBagIcon,
  ChevronRightIcon,
  InformationCircleIcon,
  PuzzlePieceIcon,
  ChevronLeftIcon,
  XMarkIcon
} from '@heroicons/react/24/outline'
import { StarIcon as StarIconSolid } from '@heroicons/react/24/solid'
import { useI18n } from '../i18n'

/* ─── Icon Registry ─── */
const GitHubIcon = ({ className }: { className?: string }) => (
  <svg fill="currentColor" viewBox="0 0 24 24" className={className} aria-hidden="true">
    <path
      fillRule="evenodd"
      d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
      clipRule="evenodd"
    />
  </svg>
)

const iconMap: Record<string, React.ElementType> = {
  Cpu: CpuChipIcon,
  CpuChip: CpuChipIcon,
  Search: MagnifyingGlassIcon,
  MagnifyingGlass: MagnifyingGlassIcon,
  GlobeAlt: GlobeAltIcon,
  Music: MusicalNoteIcon,
  MusicalNote: MusicalNoteIcon,
  Calendar: CalendarIcon,
  Clock: ClockIcon,
  MessageSquare: CommandLineIcon,
  CommandLine: CommandLineIcon,
  FolderOpen: PuzzlePieceIcon,
  Puzzle: PuzzlePieceIcon,
  PuzzlePiece: PuzzlePieceIcon,
  Sparkles: SparklesIcon,
  Variable: CpuChipIcon,
  Sun: SunIcon,
  Cloud: CloudIcon,
  BookOpen: BookOpenIcon,
  RocketLaunch: RocketLaunchIcon,
  launcher: RocketLaunchIcon,
  Launcher: RocketLaunchIcon,
  Wrench: WrenchIcon,
  Star: StarIcon,
  User: UserIcon,
  Tag: TagIcon,
  Bolt: BoltIcon,
  Shield: ShieldCheckIcon,
  ShieldCheck: ShieldCheckIcon,
  Information: InformationCircleIcon,
  CheckBadge: CheckBadgeIcon,
  Trash: TrashIcon,
  ArrowPath: ArrowPathIcon,
  CloudArrowDown: CloudArrowDownIcon
}

const ALLOWED_GRADIENTS = new Set([
  'from-emerald-500 to-green-600',
  'from-blue-500 to-indigo-600',
  'from-violet-600 to-purple-500',
  'from-rose-600 to-pink-500',
  'from-cyan-600 to-blue-500',
  'from-emerald-600 to-teal-500',
  'from-amber-600 to-orange-500',
  'from-fuchsia-600 to-pink-500',
  'from-indigo-600 to-violet-500',
  'from-lime-600 to-green-500',
  'from-sky-600 to-cyan-500',
  'from-red-600 to-rose-500'
])

function getSkillGradient(name: string, manifest?: any): string {
  const claimed = manifest?.theme?.gradient
  if (claimed && ALLOWED_GRADIENTS.has(claimed)) return claimed
  const gradients = Array.from(ALLOWED_GRADIENTS)
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return gradients[Math.abs(hash) % gradients.length]
}

function getSkillIcon(name: string, skillId?: string, skillName?: string, manifest?: any) {
  const icon = manifest?.icon
  if (icon && iconMap[icon]) return iconMap[icon]
  if (icon && typeof icon === 'string' && icon.length <= 4) return PuzzlePieceIcon
  return (
    iconMap[name] ||
    (skillId && iconMap[skillId]) ||
    (skillName && iconMap[skillName]) ||
    PuzzlePieceIcon
  )
}

function getIconBgStyle(skill: Extension) {
  const iconBg = skill.icon_bg || skill.manifest?.icon_bg
  if (iconBg) {
    if (iconBg.startsWith('#') || iconBg.startsWith('rgb') || iconBg.includes('gradient')) {
      return { background: iconBg }
    }
  }
  return undefined
}

interface SkillIconProps {
  skill: Extension
  className?: string
}

function SkillIcon({ skill, className = 'w-6 h-6' }: SkillIconProps) {
  const icon = skill.icon || skill.manifest?.icon
  const iconUrl = skill.icon_url || skill.manifest?.icon_url

  // 1. Raw SVG string
  if (icon && typeof icon === 'string' && icon.trim().startsWith('<svg')) {
    return (
      <div
        className={`${className} [&>svg]:w-full [&>svg]:h-full [&>svg]:text-current flex items-center justify-center`}
        dangerouslySetInnerHTML={{ __html: icon }}
      />
    )
  }

  // 2. Custom icon URL
  if (iconUrl) {
    return (
      <img
        src={iconUrl}
        alt=""
        className={`${className} object-contain brightness-0 invert`}
        loading="lazy"
      />
    )
  }

  // 3. Known icon Name from iconMap
  if (icon && iconMap[icon]) {
    const IconComp = iconMap[icon]
    return <IconComp className={className} />
  }

  // 4. Mapped icon names from name, id, or skillName
  const iconName = skill.name || skill.id
  if (iconName && iconMap[iconName]) {
    const IconComp = iconMap[iconName]
    return <IconComp className={className} />
  }

  // 5. Fallback Puzzle Piece
  const DefaultIcon = PuzzlePieceIcon
  return <DefaultIcon className={className} />
}

function getAccentClasses(manifest?: any) {
  const accent: string = manifest?.theme?.accent || 'violet'
  return (
    (
      {
        emerald: {
          shadow: 'shadow-emerald-500/15',
          button: 'bg-emerald-600 hover:bg-emerald-500',
          progress: 'bg-emerald-400/30',
          border: 'hover:border-emerald-500/50',
          text: 'group-hover:text-emerald-400'
        },
        blue: {
          shadow: 'shadow-blue-500/15',
          button: 'bg-blue-600 hover:bg-blue-500',
          progress: 'bg-blue-400/30',
          border: 'hover:border-blue-500/50',
          text: 'group-hover:text-blue-400'
        },
        violet: {
          shadow: 'shadow-violet-500/10',
          button: 'bg-violet-600 hover:bg-violet-500',
          progress: 'bg-violet-400/30',
          border: 'hover:border-violet-500/50',
          text: 'group-hover:text-violet-400'
        }
      } as const
    )[accent as 'emerald' | 'blue' | 'violet'] || {
      shadow: 'shadow-violet-500/10',
      button: 'bg-violet-600 hover:bg-violet-500',
      progress: 'bg-violet-400/30',
      border: 'hover:border-violet-500/50',
      text: 'group-hover:text-violet-400'
    }
  )
}

/* ─── Carousel Banner ─── */
function FeaturedCarousel({
  skills,
  onSelect
}: {
  skills: Extension[]
  onSelect: (s: Extension) => void
}) {
  const dragScrollRef = useRef<HTMLDivElement | null>(null)
  const dragScroll = useDragScroll(dragScrollRef)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(true)

  const checkScroll = () => {
    if (!dragScrollRef.current) return
    const { scrollLeft, scrollWidth, clientWidth } = dragScrollRef.current
    setCanScrollLeft(scrollLeft > 0)
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 10)
  }

  useEffect(() => {
    checkScroll()
    const el = dragScrollRef.current
    el?.addEventListener('scroll', checkScroll)
    return () => el?.removeEventListener('scroll', checkScroll)
  }, [skills])

  const scroll = (dir: 'left' | 'right') => {
    dragScrollRef.current?.scrollBy({
      left: dir === 'left' ? -320 : 320,
      behavior: 'smooth'
    })
  }

  if (skills.length === 0) return null

  return (
    <div className="relative group min-w-0">
      {canScrollLeft && (
        <button
          onClick={() => scroll('left')}
          className="absolute left-2 top-1/2 -translate-y-1/2 z-10 p-1.5 rounded-full bg-zinc-800/90 border border-zinc-700 text-zinc-300 hover:text-white hover:bg-zinc-700 shadow-lg opacity-0 group-hover:opacity-100 transition-all"
        >
          <ChevronLeftIcon className="w-4 h-4" />
        </button>
      )}
      {canScrollRight && (
        <button
          onClick={() => scroll('right')}
          className="absolute right-2 top-1/2 -translate-y-1/2 z-10 p-1.5 rounded-full bg-zinc-800/90 border border-zinc-700 text-zinc-300 hover:text-white hover:bg-zinc-700 shadow-lg opacity-0 group-hover:opacity-100 transition-all"
        >
          <ChevronRightIcon className="w-4 h-4" />
        </button>
      )}

      <div
        ref={dragScrollRef}
        onMouseDown={dragScroll.mouseDown}
        onTouchStart={dragScroll.touchStart}
        onTouchMove={dragScroll.touchMove}
        className="flex gap-3 overflow-x-auto scrollbar-none pb-1"
        style={{ cursor: dragScroll.grabCursor }}
      >
        {skills.map((skill) => {
          const accentClasses = getAccentClasses(skill.manifest)
          return (
            <div
              key={skill.id}
              onClick={() => !dragScroll.isDraggingScroll() && onSelect(skill)}
              className={`shrink-0 w-72 h-40 rounded-xl overflow-hidden cursor-pointer group/card relative border border-zinc-700/50 transition-all hover:-translate-y-0.5 hover:shadow-lg ${accentClasses.border}`}
            >
              <div
                className={`absolute inset-0 ${getIconBgStyle(skill) ? '' : `bg-gradient-to-br ${getSkillGradient(skill.name, skill.manifest)}`} opacity-30`}
                style={
                  getIconBgStyle(skill) ? { ...getIconBgStyle(skill), opacity: 0.3 } : undefined
                }
              />
              <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 via-zinc-900/40 to-transparent" />
              <div className="absolute inset-0 p-4 flex flex-col justify-between">
                <div className="flex items-start justify-between">
                  <div className="p-2 rounded-lg bg-zinc-800/80 backdrop-blur-sm border border-zinc-700/50">
                    <SkillIcon skill={skill} className="w-5 h-5 text-white" />
                  </div>
                  {skill.category === 'core' ? (
                    <div className="flex items-center gap-1 px-1.5 py-0.5 bg-blue-500/20 border border-blue-500/30 rounded text-[9px] text-blue-400 font-semibold uppercase tracking-wider">
                      <CpuChipIcon className="w-3 h-3" />
                      CORE
                    </div>
                  ) : skill.is_official ? (
                    <div className="flex items-center gap-1 px-1.5 py-0.5 bg-emerald-500/20 border border-emerald-500/30 rounded text-[9px] text-emerald-400 font-semibold uppercase tracking-wider">
                      <CheckBadgeIcon className="w-3 h-3" />
                      Oficial
                    </div>
                  ) : null}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white mb-0.5">{skill.name}</h3>
                  <p className="text-[10px] text-zinc-400 line-clamp-2 leading-relaxed">
                    {skill.description}
                  </p>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ─── Skill Card ─── */
function SkillCard({ skill, onSelect }: { skill: Extension; onSelect: (s: Extension) => void }) {
  const accentClasses = getAccentClasses(skill.manifest)
  const isInstalled =
    skill.installed !== false && (skill.category === 'core' || skill.category === 'extension')
  return (
    <div
      onClick={() => onSelect(skill)}
      className={`group bg-zinc-800/40 border border-zinc-700/50 rounded-2xl overflow-hidden cursor-pointer hover:bg-zinc-800/80 transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl active:scale-[0.98] ${accentClasses.border}`}
    >
      <div className="p-5">
        <div className="flex items-start justify-between mb-4">
          <div
            className={`p-3 rounded-2xl ${getIconBgStyle(skill) ? '' : `bg-gradient-to-br ${getSkillGradient(skill.name, skill.manifest)}`} shadow-lg ${accentClasses.shadow}`}
            style={getIconBgStyle(skill)}
          >
            <SkillIcon skill={skill} className="w-6 h-6 text-white" />
          </div>
          <div className="flex flex-col items-end gap-1.5">
            {skill.category === 'core' ? (
              <div className="flex items-center gap-1 px-2 py-0.5 bg-blue-500/10 border border-blue-500/20 rounded-full text-[9px] text-blue-400 font-bold uppercase tracking-wider">
                <CpuChipIcon className="w-3.5 h-3.5" />
                CORE
              </div>
            ) : skill.is_official ? (
              <div className="flex items-center gap-1 px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-[9px] text-emerald-400 font-bold uppercase tracking-wider">
                <CheckBadgeIcon className="w-3.5 h-3.5" />
                Oficial
              </div>
            ) : (
              <div className="px-2 py-0.5 bg-zinc-700/30 border border-zinc-700/50 rounded-full text-[9px] text-zinc-400 font-bold uppercase tracking-wider">
                Comunidade
              </div>
            )}
            {import.meta.env.DEV && skill.isSymlink && (
              <div
                title={skill.symlinkPath || ''}
                className="flex items-center gap-1 px-2 py-0.5 bg-amber-500/10 border border-amber-500/20 rounded-full text-[9px] text-amber-400 font-bold uppercase tracking-wider"
              >
                Symlink
              </div>
            )}
            {skill.updateAvailable && (
              <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 animate-pulse">
                Upgrade
              </span>
            )}
            {isInstalled &&
              (skill.enabled ? (
                <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Ativa
                </span>
              ) : (
                <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded-full bg-zinc-900 text-zinc-600 border border-zinc-800">
                  Inativa
                </span>
              ))}
          </div>
        </div>
        <h3
          className={`text-base font-bold text-zinc-100 mb-1.5 transition-colors ${accentClasses.text}`}
        >
          {skill.name}
        </h3>
        <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed mb-4 min-h-[2.5rem]">
          {skill.description}
        </p>
        <div className="flex items-center justify-between pt-4 border-t border-zinc-700/30">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-full bg-zinc-800 flex items-center justify-center overflow-hidden border border-zinc-700/50">
              {skill.repo || (!skill.is_official && skill.author) ? (
                <img
                  src={`https://avatars.githubusercontent.com/${encodeURIComponent((skill.repo?.split('/')[0] || skill.author || '').trim())}?s=32`}
                  alt="Avatar"
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement
                    if (!target.src.includes('github.png')) {
                      target.src = 'https://github.com/github.png?size=32'
                    }
                  }}
                />
              ) : (
                <UserIcon className="w-3 h-3 text-zinc-500" />
              )}
            </div>
            <span className="text-[11px] text-zinc-500 font-medium">{skill.author || 'MomAI'}</span>
          </div>
          <div className="flex items-center gap-1.5">
            {skill.repo ? (
              <div className="flex items-center gap-1 text-[10px] text-amber-400 font-bold bg-amber-400/10 px-1.5 py-0.5 rounded-md">
                <StarIconSolid className="w-3 h-3 text-amber-400" />
                {skill.stars || 0}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ─── Skill Detail (inline, keeps navbar) ─── */
function SkillDetailView({
  skill,
  onBack,
  onInstall,
  onToggle,
  onUninstall,
  installing,
  installProgress,
  installError,
  recommendedVersionByExtId
}: {
  skill: Extension
  onBack: () => void
  onInstall: (s: Extension, downloadUrl?: string) => void
  onToggle: (s: Extension) => void
  onUninstall: (s: Extension) => void
  installing: string | null
  installProgress?: InstallProgress | null
  installError?: InstallError | null
  recommendedVersionByExtId?: Record<string, string | null>
}) {
  const { t } = useI18n()
  const accentClasses = getAccentClasses(skill.manifest)
  const isInstalled =
    skill.installed !== false && (skill.category === 'core' || skill.category === 'extension')
  const isBuiltin = skill.category === 'core'

  const [releasesExpanded, setReleasesExpanded] = useState(false)
  const [releases, setReleases] = useState<ExtensionRelease[]>([])
  const [loadingReleases, setLoadingReleases] = useState(false)
  const [releasesError, setReleasesError] = useState<string | null>(null)
  const [installedVersion, setInstalledVersion] = useState<string | null>(null)
  const [recommendedVersion, setRecommendedVersion] = useState<string | null>(null)

  useEffect(() => {
    if (!releasesExpanded || !skill.repo) return
    setLoadingReleases(true)
    setReleasesError(null)
    fetchExtensionReleases(skill.id)
      .then((res) => {
        setReleases(res.releases)
        setInstalledVersion(res.installed_version)
        setRecommendedVersion(res.recommended_version)
      })
      .catch((err) => {
        setReleasesError(String(err.message || err))
      })
      .finally(() => {
        setLoadingReleases(false)
      })
  }, [releasesExpanded, skill.id, skill.repo])

  return (
    <div className="animate-fade-in max-w-6xl mx-auto px-6 pb-20">

      {/* Tighter Hero Header */}
      <div className="flex flex-col md:flex-row items-center md:items-start gap-8 mb-6 pb-6 border-b border-zinc-800/50">
        <div
          className={`w-20 h-20 md:w-24 md:h-24 rounded-2xl ${getIconBgStyle(skill) ? '' : `bg-gradient-to-br ${getSkillGradient(skill.name, skill.manifest)}`} shadow-xl ${accentClasses.shadow} flex items-center justify-center shrink-0 border-2 border-zinc-800 relative overflow-hidden`}
          style={getIconBgStyle(skill)}
        >
          <div className="absolute inset-0 bg-white/5" />
          <SkillIcon
            skill={skill}
            className="w-10 h-10 md:w-12 md:h-12 text-white relative z-10 drop-shadow-lg"
          />
        </div>

        <div className="flex-1 text-center md:text-left pt-0">
          <div className="flex flex-col md:flex-row md:items-end gap-3 md:gap-4 mb-3">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight leading-none">
                {skill.name}
              </h1>
            </div>
            {skill.category === 'core' ? (
              <div className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-500/10 border border-blue-500/20 rounded-md text-[9px] text-blue-400 font-black uppercase tracking-wider h-fit mb-0.5">
                <CpuChipIcon className="w-3 h-3" />
                Componente CORE
              </div>
            ) : skill.is_official ? (
              <div className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded-md text-[9px] text-emerald-400 font-black uppercase tracking-wider h-fit mb-0.5">
                <CheckBadgeIcon className="w-3 h-3" />
                Oficial
              </div>
            ) : null}
            {import.meta.env.DEV && skill.isSymlink && (
              <div
                title={skill.symlinkPath || ''}
                className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-500/10 border border-amber-500/20 rounded-md text-[9px] text-amber-400 font-black uppercase tracking-wider h-fit mb-0.5"
              >
                Symlink: {skill.symlinkPath}
              </div>
            )}
          </div>

          <p className="text-sm text-zinc-400 font-medium mb-6 max-w-2xl leading-relaxed">
            {skill.description}
          </p>

          <div className="flex flex-wrap items-center justify-center md:justify-start gap-5 mb-8">
            <div className="flex flex-col">
              <span className="text-[9px] text-zinc-600 uppercase font-black tracking-tighter mb-1">
                Autor
              </span>
              <div className="flex items-center gap-2">
                {(skill.repo || (!skill.is_official && skill.author)) && (
                  <img
                    src={`https://avatars.githubusercontent.com/${encodeURIComponent((skill.repo?.split('/')[0] || skill.author || '').trim())}?s=64`}
                    alt="Author"
                    className="w-5 h-5 rounded-full border border-zinc-800 shadow-sm"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement
                      if (!target.src.includes('github.png')) {
                        target.src = 'https://github.com/github.png?s=64'
                      }
                    }}
                  />
                )}
                <span className="text-sm text-white font-black">{skill.author || 'MomAI'}</span>
              </div>
            </div>
            <div className="w-px h-6 bg-zinc-800" />
            <div className="flex flex-col">
              <span className="text-[9px] text-zinc-600 uppercase font-black tracking-tighter">
                Versão
              </span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-300 font-bold">{skill.version || '1.0.0'}</span>
                {skill.updateAvailable && (
                  <span className="inline-flex items-center px-1.5 py-0.5 bg-blue-500/10 border border-blue-500/20 rounded text-[8px] text-blue-400 font-black uppercase tracking-wider animate-pulse">
                    Upgrade disponível ({skill.latestCompatibleVersion})
                  </span>
                )}
                {skill.hasNewerIncompatible && (
                  <span className="inline-flex items-center px-1.5 py-0.5 bg-amber-500/10 border border-amber-500/20 rounded text-[8px] text-amber-400 font-black uppercase tracking-wider" title="Requer versão mais recente do MomAI">
                    Incompatível mais recente
                  </span>
                )}
                {skill.compat_status === 'incompatible' && (
                  <span
                    className="inline-flex items-center px-2 py-0.5 rounded-full bg-red-900/30 text-red-300 text-xs font-medium"
                    title="Versão instalada não é compatível com a sua versão do MomAI"
                  >
                    {t('extensions.install.incompatible')}
                  </span>
                )}
              </div>
              {skill.compat_status === 'incompatible' && (
                <div className="mt-2">
                  <button
                    onClick={() => onInstall(skill, undefined)}
                    disabled={installing === skill.id || recommendedVersionByExtId?.[skill.id] === null}
                    title={
                      recommendedVersionByExtId?.[skill.id] === null
                        ? t('extensions.install.no_compatible')
                        : ''
                    }
                    className="px-3 py-1.5 bg-blue-600/80 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all"
                  >
                    {t('extensions.actions.update')}
                  </button>
                </div>
              )}
            </div>
            <div className="w-px h-6 bg-zinc-800" />
            <div className="flex flex-col">
              <span className="text-[9px] text-zinc-600 uppercase font-black tracking-tighter">
                GitHub Stars
              </span>
              {skill.repo ? (
                <div className="flex items-center gap-1.5 text-sm text-amber-400 font-black">
                  <StarIconSolid className="w-4 h-4 text-amber-400" />
                  {skill.stars || 0}
                </div>
              ) : (
                <span className="text-xs text-zinc-500 font-bold">N/A</span>
              )}
            </div>
          </div>

          <div className="flex items-center justify-center md:justify-start gap-3">
            {skill.repo && (
              <a
                href={`https://github.com/${skill.repo}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 px-4 py-2 bg-zinc-900 border border-zinc-800 text-zinc-400 rounded-xl text-[10px] font-bold hover:text-white hover:border-zinc-700 transition-all uppercase tracking-widest no-underline"
              >
                <GitHubIcon className="w-3.5 h-3.5" />
                GitHub
              </a>
            )}
            {!isBuiltin && !isInstalled ? (
              <div className="flex flex-col gap-2 min-w-[140px]">
                <button
                  onClick={() => onInstall(skill)}
                  disabled={installing === skill.id}
                  className={`px-8 py-2.5 text-white rounded-xl text-xs font-black disabled:opacity-50 transition-all uppercase tracking-widest relative overflow-hidden ${accentClasses.button}`}
                >
                  <span className="relative z-10">
                    {installing === skill.id && installProgress
                      ? installProgress.status || 'Obtendo...'
                      : 'Instalar'}
                  </span>
                </button>
                {installing === skill.id && installProgress && (
                  <ExtensionInstallCard
                    progress={installProgress}
                    extName={skill.name}
                  />
                )}
                {installing === skill.id && installError && (
                  <ExtensionInstallCard
                    error={installError}
                    extName={skill.name}
                  />
                )}
              </div>
            ) : (
              <div className="flex items-center gap-3">
                {skill.updateAvailable && (
                  <div className="flex flex-col gap-1 min-w-[140px]">
                    <button
                      onClick={() => onInstall(skill)}
                      disabled={installing === skill.id}
                      className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-black disabled:opacity-50 transition-all uppercase tracking-widest relative overflow-hidden active:scale-[0.98]"
                    >
                      <span className="relative z-10 flex items-center justify-center gap-1">
                        <CloudArrowDownIcon className="w-3.5 h-3.5" />
                        {installing === skill.id && installProgress
                          ? installProgress.status || 'Atualizando...'
                          : 'Atualizar'}
                      </span>
                    </button>
                    {installing === skill.id && installProgress && (
                      <ExtensionInstallCard
                        progress={installProgress}
                        extName={skill.name}
                      />
                    )}
                    {installing === skill.id && installError && (
                      <ExtensionInstallCard
                        error={installError}
                        extName={skill.name}
                      />
                    )}
                  </div>
                )}
                <button
                  onClick={() => onToggle(skill)}
                  className={`inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-xs font-black transition-all uppercase tracking-widest ${
                    skill.enabled
                      ? 'bg-zinc-800/60 text-zinc-400 border border-zinc-700 hover:bg-zinc-800 hover:text-zinc-200 hover:border-zinc-600'
                      : 'bg-emerald-600 text-white border border-emerald-500/50 shadow-lg shadow-emerald-500/25 hover:bg-emerald-500 hover:shadow-emerald-500/35 active:scale-[0.98]'
                  }`}
                >
                  {!skill.enabled && <PowerIcon className="w-4 h-4" />}
                  {skill.enabled ? 'Desativar' : 'Ativar'}
                </button>
                {!skill.isSymlink && (
                  <button
                    onClick={() => onUninstall(skill)}
                    className="px-5 py-2 rounded-xl text-xs font-bold text-zinc-500 border border-zinc-800 hover:text-red-400 hover:border-red-500/40 transition-all uppercase tracking-widest"
                  >
                    Desinstalar
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Balanced 2-Column Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 items-start">
        <div className="lg:col-span-3 space-y-8">
          {/* Description Section - Lighter and clearer */}
          <section className="bg-zinc-800/20 rounded-2xl p-8 border border-zinc-700/50 backdrop-blur-xl">
            <h2 className="text-xs font-black text-zinc-300 mb-8 flex items-center gap-2 uppercase tracking-[0.2em]">
              <InformationCircleIcon className="w-4 h-4 text-violet-400" />
              Sobre esta extensão
            </h2>
            <div
              className="prose prose-invert prose-zinc max-w-none 
              prose-headings:text-zinc-50 prose-headings:font-bold prose-headings:mt-8 prose-headings:mb-4
              prose-p:text-zinc-200 prose-p:text-sm prose-p:leading-relaxed prose-p:mb-4
              prose-li:text-zinc-200 prose-li:text-sm prose-li:mb-2
              prose-strong:text-white prose-code:text-violet-300 prose-code:bg-violet-500/20 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded"
            >
              {skill.instructions || skill.readme ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {skill.instructions || skill.readme}
                </ReactMarkdown>
              ) : (
                <div className="py-24 flex flex-col items-center justify-center text-center">
                  <div className="w-16 h-16 rounded-full bg-zinc-800/50 flex items-center justify-center mb-4 border border-zinc-700/50">
                    <CommandLineIcon className="w-8 h-8 text-zinc-600" />
                  </div>
                  <p className="text-zinc-500 text-xs italic font-medium">
                    Esta extensão não forneceu um README detalhado.
                  </p>
                </div>
              )}
            </div>
          </section>

          {/* System Requirements */}
          <section className="p-8 rounded-2xl bg-zinc-800/10 border border-zinc-700/30">
            <h2 className="text-xs font-black text-zinc-400 mb-6 flex items-center gap-2 uppercase tracking-[0.2em]">
              <CpuChipIcon className="w-4 h-4 text-violet-400/80" />
              Requisitos do Sistema
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
              <div className="flex items-center gap-4">
                <div className="p-2.5 rounded-2xl bg-zinc-700/50 border border-zinc-600/50 shadow-inner">
                  <ShieldCheckIcon className="w-5 h-5 text-emerald-400/80" />
                </div>
                <div>
                  <p className="text-[9px] text-zinc-400 uppercase font-black tracking-widest mb-0.5">
                    Arquitetura
                  </p>
                  <p className="text-xs text-white font-bold">x64 / ARM64 / WSL2</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="p-2.5 rounded-2xl bg-zinc-700/50 border border-zinc-600/50 shadow-inner">
                  <GlobeAltIcon className="w-5 h-5 text-sky-400/80" />
                </div>
                <div>
                  <p className="text-[9px] text-zinc-400 uppercase font-black tracking-widest mb-0.5">
                    Internet
                  </p>
                  <p className="text-xs text-white font-bold">Recomendado para atualizações</p>
                </div>
              </div>
            </div>
          </section>

          {/* Version History Section */}
          {skill.repo && (
            <section className="bg-zinc-800/20 rounded-2xl p-8 border border-zinc-700/50 backdrop-blur-xl">
              <button
                onClick={() => setReleasesExpanded(!releasesExpanded)}
                className="w-full flex items-center justify-between text-left focus:outline-none group"
              >
                <h2 className="text-xs font-black text-zinc-300 flex items-center gap-2 uppercase tracking-[0.2em]">
                  <ClockIcon className="w-4 h-4 text-violet-400" />
                  Histórico de Versões
                </h2>
                <div className="flex items-center gap-2 text-xs text-zinc-500 group-hover:text-zinc-300 transition-colors">
                  {releasesExpanded ? 'Ocultar' : 'Mostrar'}
                  <ChevronRightIcon className={`w-4 h-4 transition-transform ${releasesExpanded ? 'rotate-90' : ''}`} />
                </div>
              </button>

              {releasesExpanded && (
                <div className="mt-6 space-y-4">
                  {loadingReleases && (
                    <p className="text-xs text-zinc-500 italic animate-pulse">Carregando versões...</p>
                  )}
                  {releasesError && (
                    <p className="text-xs text-red-400 italic">Erro: {releasesError}</p>
                  )}
                  {!loadingReleases && !releasesError && releases.length === 0 && (
                    <p className="text-xs text-zinc-500 italic">Nenhuma versão encontrada no GitHub.</p>
                  )}
                  {!loadingReleases && !releasesError && releases.length > 0 && (
                    <div className="space-y-3">
                      {releases.map((rel) => {
                        const isCurrent = !!(installedVersion && rel.version === installedVersion)
                        const isRecommended = !!(recommendedVersion && rel.version === recommendedVersion)
                        return (
                          <div key={rel.version} className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-850 flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div className="flex-1 space-y-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm text-white font-extrabold">v{rel.version}</span>
                                {rel.date && (
                                  <span className="text-[10px] text-zinc-500">
                                    {new Date(rel.date).toLocaleDateString()}
                                  </span>
                                )}
                                {isCurrent && (
                                  <span className="px-2 py-0.5 rounded bg-violet-500/10 border border-violet-500/30 text-[9px] text-violet-400 font-extrabold uppercase">
                                    Instalada
                                  </span>
                                )}
                                {isRecommended && !isCurrent && (
                                  <span className="px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-[9px] text-emerald-400 font-extrabold uppercase">
                                    Recomendada
                                  </span>
                                )}
                                {rel.compatible ? (
                                  <span className="px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-[9px] text-emerald-400 font-extrabold uppercase">
                                    Compatível
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded bg-red-500/10 border border-red-500/30 text-[9px] text-red-400 font-extrabold uppercase" title={rel.requires_momai ? `Requer MomAI ${rel.requires_momai}` : undefined}>
                                    Incompatível
                                  </span>
                                )}
                              </div>
                              {rel.changelog && (
                                <p className="text-xs text-zinc-400 line-clamp-2 mt-1">
                                  {rel.changelog}
                                </p>
                              )}
                            </div>
                            <div className="shrink-0">
                              {rel.compatible ? (
                                <button
                                  onClick={() => onInstall(skill, rel.download_url)}
                                  disabled={installing === skill.id || isCurrent}
                                  className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all border ${
                                    isCurrent
                                      ? 'border-zinc-800 text-zinc-600 cursor-default'
                                      : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500 hover:text-white'
                                  }`}
                                >
                                  {isCurrent ? 'Instalada' : 'Instalar'}
                                </button>
                              ) : (
                                <button
                                  disabled
                                  className="px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider border border-zinc-800 text-zinc-600 cursor-not-allowed"
                                  title={rel.requires_momai ? `Esta versão requer o MomAI ${rel.requires_momai}` : 'Incompatível'}
                                >
                                  Incompatível
                                </button>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </section>
          )}
        </div>

        {/* Sidebar - Brighter and Elevated */}
        <div className="space-y-6 lg:mt-0">
          <section className="bg-zinc-800/40 border border-zinc-600/30 rounded-2xl p-6 shadow-2xl shadow-black/40 backdrop-blur-md">
            <h3 className="text-[10px] font-black text-zinc-200 mb-6 uppercase tracking-widest">
              Informações
            </h3>

            <div className="space-y-5">
              <div>
                <p className="text-[9px] text-zinc-400 uppercase font-black tracking-widest mb-1.5">
                  Desenvolvedor
                </p>
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-violet-600/20 flex items-center justify-center text-[9px] text-violet-400 font-black border border-violet-500/30 uppercase">
                    {(skill.author || 'M')[0]}
                  </div>
                  <p className="text-xs text-white font-bold">{skill.author || 'MomAI Team'}</p>
                </div>
              </div>

              <div>
                <p className="text-[9px] text-zinc-400 uppercase font-black tracking-widest mb-1.5">
                  Categoria
                </p>
                <p className="text-xs text-white font-bold capitalize">
                  {skill.tags?.[0] || 'Utilitário'}
                </p>
              </div>

              <div>
                <p className="text-[9px] text-zinc-400 uppercase font-black tracking-widest mb-1.5">
                  Nível de Risco
                </p>
                <div className="flex items-center gap-2">
                  <div
                    className={`w-2 h-2 rounded-full shadow-[0_0_8px] ${skill.riskLevel === 'high' ? 'bg-red-500 shadow-red-500/50' : 'bg-emerald-400 shadow-emerald-400/50'}`}
                  />
                  <p
                    className={`text-xs font-black ${
                      skill.riskLevel === 'high' ? 'text-red-400' : 'text-emerald-400'
                    }`}
                  >
                    {skill.riskLevel === 'high' ? 'Acesso ao Sistema' : 'Sandbox Segura'}
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section className="bg-zinc-800/20 border border-zinc-700/50 rounded-2xl p-6">
            <h3 className="text-[10px] font-black text-zinc-400 mb-5 flex items-center gap-2 uppercase tracking-widest">
              <BoltIcon className="w-4 h-4 text-amber-400" />
              Permissões
            </h3>
            <ul className="space-y-3">
              {skill.permissionSummary && skill.permissionSummary.length > 0 ? (
                skill.permissionSummary.map((perm, idx) => (
                  <li
                    key={idx}
                    className="flex items-start gap-2.5 text-[10px] text-zinc-300 font-medium leading-snug"
                  >
                    <div className="w-1 h-1 rounded-full bg-violet-400 mt-1.5 shrink-0 shadow-[0_0_5px_rgba(167,139,250,0.5)]" />
                    {perm}
                  </li>
                ))
              ) : (
                <li className="text-[10px] text-zinc-500 italic">Nenhuma permissão especial</li>
              )}
            </ul>
          </section>
        </div>
      </div>
    </div>
  )
}

const CAPABILITIES: Record<string, { risk: string; description: string }> = {
  network: { risk: 'high', description: 'Acesso à rede' },
  'filesystem:read': { risk: 'medium', description: 'Leitura de arquivos' },
  'filesystem:write': { risk: 'high', description: 'Escrita de arquivos' },
  'ui:sidebar': { risk: 'low', description: 'Adicionar painéis na barra lateral' },
  'ui:commands': { risk: 'low', description: 'Registrar comandos' },
  'chat:messages': { risk: 'medium', description: 'Ler mensagens do chat' },
  'system:info': { risk: 'low', description: 'Ver informações do sistema' },
  process: { risk: 'critical', description: 'Acesso a processos do sistema' },
  shell: { risk: 'critical', description: 'Execução de comandos shell' }
}

function computeRiskLevel(permissions: string[]): 'low' | 'medium' | 'high' | 'critical' {
  const riskOrder = ['low', 'medium', 'high', 'critical']
  let maxRisk = 'low'
  for (const id of permissions) {
    const cap = CAPABILITIES[id]
    const risk = cap?.risk || 'medium'
    if (riskOrder.indexOf(risk) > riskOrder.indexOf(maxRisk)) {
      maxRisk = risk
    }
  }
  return maxRisk as 'low' | 'medium' | 'high' | 'critical'
}

function computePermissionSummary(permissions: string[]): string[] {
  return permissions.map((id) => {
    const cap = CAPABILITIES[id]
    return cap ? cap.description : id
  })
}

function enrichExtensionWithManifest(ext: Extension, manifest: Record<string, any>): Extension {
  if (!manifest) return ext
  const perms = Array.isArray(manifest.permissions) ? manifest.permissions : []
  return {
    ...ext,
    icon: manifest.icon || ext.icon,
    icon_url: manifest.icon_url || ext.icon_url,
    icon_bg: manifest.icon_bg || ext.icon_bg,
    theme: manifest.theme || ext.theme,
    tags: manifest.tags?.length ? manifest.tags : ext.tags,
    version: manifest.version || ext.version,
    author: manifest.author || ext.author,
    permissionSummary: computePermissionSummary(perms),
    riskLevel: computeRiskLevel(perms)
  }
}

/* ─── Main View ─── */
export default function ExtensionsView() {
  const { t, locale } = useI18n()
  const location = useLocation()
  const [allSkills, setAllSkills] = useState<Extension[]>([])
  const [loading, setLoading] = useState(true)
  const [installing, setInstalling] = useState<string | null>(null)
  const [installProgress, setInstallProgress] = useState<InstallProgress | null>(null)
  const [installError, setInstallError] = useState<InstallError | null>(null)
  const [uninstallTarget, setUninstallTarget] = useState<{ id: string; name: string } | null>(null)
  const [recommendedVersionByExtId, setRecommendedVersionByExtId] = useState<Record<string, string | null>>({})
  const [activeTab, setActiveTab] = useState<'installed' | 'store'>('store')
  const [selectedSkill, setSelectedSkill] = useState<Extension | null>(null)
  const [selectedManifest, setSelectedManifest] = useState<Record<string, any> | null>(null)
  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [devMode, setDevMode] = useState<'symlink' | 'store_test'>('symlink')
  const tagsDragScrollRef = useRef<HTMLDivElement | null>(null)
  const tagsDragScroll = useDragScroll(tagsDragScrollRef)

  const handleSetDevMode = async (mode: 'symlink' | 'store_test') => {
    try {
      await updateSettingsPartial({ dev_mode: mode })
      setDevMode(mode)
      await loadData()
    } catch (err) {
      console.error('Erro ao atualizar modo dev:', err)
    }
  }

  const loadData = async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      // Fetch settings to sync the current devMode
      const settings = await fetchSettings().catch(() => ({ dev_mode: 'symlink' }))
      if (settings.dev_mode === 'store_test' || settings.dev_mode === 'symlink') {
        setDevMode(settings.dev_mode)
      }

      const data = await fetchExtensions(locale)
      setAllSkills(data)
      window.dispatchEvent(new CustomEvent('momai_extensions_sync', { detail: data }))
      return data
    } catch (err) {
      console.error('Erro ao carregar skills:', err)
      alert(t('extensions.errors.fetch', { error: String(err) }))
      return []
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [locale])

  useEffect(() => {
    const tab = (location.state as any)?.tab
    if (tab === 'store' || tab === 'installed') setActiveTab(tab)
  }, [location.state])

  const handleSelectSkill = async (ext: Extension) => {
    setSelectedSkill(ext)
    setSelectedManifest(null)
    if (!ext.installed && ext.repo) {
      const manifest = await fetchExtensionManifest(ext.id)
      setSelectedManifest(manifest)
    }
  }

  const handleInstall = async (ext: Extension, downloadUrl?: string) => {
    setInstalling(ext.id)
    setInstallProgress({ stage: 'downloading', status: 'Iniciando...', percent: 0, global_percent: 0, bytes_total: null, bytes_done: null, speed_bps: 0, eta_seconds: null })
    setInstallError(null)
    let errored = false
    try {
      await installExtension(
        ext.id,
        downloadUrl
          ? {
              downloadUrl,
              onProgress: (p) => setInstallProgress(p),
              onError: (e) => {
                setInstallError(e)
                errored = true
              }
            }
          : {
              onProgress: (p) => setInstallProgress(p),
              onError: (e) => {
                setInstallError(e)
                errored = true
              }
            }
      )
      if (errored) return
      const freshData = await loadData(true)

      // Update selectedSkill if it's the one we just installed
      if (selectedSkill?.id === ext.id) {
        const updated = freshData.find((s) => s.id === ext.id)
        if (updated) setSelectedSkill(updated)
        setSelectedManifest(null)
      }
    } catch (err) {
      setInstallError({
        ok: false,
        status: 500,
        error: 'install_failed',
        message: String(err)
      })
      errored = true
    } finally {
      setInstalling(null)
      if (!errored) setInstallProgress(null)
    }
  }

  const handleToggle = async (ext: Extension) => {
    try {
      await toggleExtension(ext.id, !ext.enabled)
      const freshData = await loadData(true)
      if (selectedSkill?.id === ext.id) {
        const updated = freshData.find((s) => s.id === ext.id)
        if (updated) setSelectedSkill(updated)
      }
    } catch (err) {
      alert(t('extensions.errors.toggle', { error: String(err) }))
    }
  }

  const handleUninstall = (ext: Extension) => {
    setUninstallTarget({ id: ext.id, name: ext.name })
  }

  const confirmUninstall = async () => {
    if (!uninstallTarget) return
    try {
      await uninstallExtension(uninstallTarget.id)
      setSelectedSkill(null)
      await loadData(true)
    } catch (err) {
      alert(t('extensions.errors.uninstall', { error: String(err) }))
    } finally {
      setUninstallTarget(null)
    }
  }

  const cancelUninstall = () => setUninstallTarget(null)

  const builtinSkills = useMemo(() => allSkills.filter((s) => s.category === 'core'), [allSkills])
  const installedSkills = useMemo(
    () => allSkills.filter((s) => s.category === 'extension'),
    [allSkills]
  )
  const storeSkills = useMemo(() => allSkills.filter((s) => s.category !== 'core'), [allSkills])

  useEffect(() => {
    installedSkills
      .filter((s) => s.compat_status === 'incompatible')
      .forEach(async (s) => {
        if (s.id in recommendedVersionByExtId) return
        try {
          const res = await fetchExtensionReleases(s.id)
          setRecommendedVersionByExtId((prev) => ({ ...prev, [s.id]: res.recommended_version }))
        } catch {
          setRecommendedVersionByExtId((prev) => ({ ...prev, [s.id]: null }))
        }
      })
  }, [installedSkills])

  const currentList =
    activeTab === 'installed' ? [...builtinSkills, ...installedSkills] : storeSkills

  const allTags = useMemo(() => {
    const tags = new Set<string>()
    currentList.forEach((s) => s.tags?.forEach((tag: string) => tags.add(tag)))
    return Array.from(tags).sort()
  }, [currentList])

  const filteredList = useMemo(() => {
    let list = currentList
    if (selectedTag) list = list.filter((s) => s.tags?.includes(selectedTag))
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q) ||
          s.tags?.some((t: string) => t.toLowerCase().includes(q))
      )
    }
    return list
  }, [currentList, selectedTag, searchQuery])

  const featuredSkills = useMemo(() => {
    const candidates = activeTab === 'store' ? storeSkills : allSkills
    return candidates.slice(0, 6)
  }, [activeTab, storeSkills, allSkills])

  return (
    <div className="flex-1 h-full bg-zinc-900 min-w-0 flex flex-col overflow-hidden">
      {/* ─── Content ─── */}
      <div className="flex-1 min-w-0 overflow-y-auto">
        <div className="w-full px-6 py-5">
          {/* ─── Tabs & Search ─── */}
          <div className="flex items-center justify-between mb-5">
            {!selectedSkill ? (
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1 p-0.5 bg-zinc-800 rounded-lg border border-zinc-700">
                  <button
                    onClick={() => setActiveTab('store')}
                    className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide transition-all ${
                      activeTab === 'store'
                        ? 'bg-violet-600 text-white shadow-sm'
                        : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    <ShoppingBagIcon className="w-3.5 h-3.5" />
                    Loja
                  </button>
                  <button
                    onClick={() => setActiveTab('installed')}
                    className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide transition-all ${
                      activeTab === 'installed'
                        ? 'bg-violet-600 text-white shadow-sm'
                        : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    <Squares2X2Icon className="w-3.5 h-3.5" />
                    Minhas Skills
                  </button>
                </div>

                {/* Dev Mode Switcher (less prominent, next to tabs) */}
                {import.meta.env.DEV && (
                  <div className="flex items-center gap-1 p-0.5 bg-zinc-950/40 rounded-lg border border-zinc-800/80">
                    <button
                      onClick={() => handleSetDevMode('symlink')}
                      title="Testar extensões usando links simbólicos locais"
                      className={`px-2.5 py-1 rounded-md text-[9px] font-bold uppercase tracking-wider transition-all ${
                        devMode === 'symlink'
                          ? 'bg-amber-500/10 border border-amber-500/30 text-amber-400 font-extrabold shadow-sm'
                          : 'text-zinc-600 hover:text-zinc-400'
                      }`}
                    >
                      Dev (Symlinks)
                    </button>
                    <button
                      onClick={() => handleSetDevMode('store_test')}
                      title="Testar fluxo de download da loja usando dev-extensions.json"
                      className={`px-2.5 py-1 rounded-md text-[9px] font-bold uppercase tracking-wider transition-all ${
                        devMode === 'store_test'
                          ? 'bg-blue-500/10 border border-blue-500/30 text-blue-400 font-extrabold shadow-sm'
                          : 'text-zinc-600 hover:text-zinc-400'
                      }`}
                    >
                      Testar Loja
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={() => setSelectedSkill(null)}
                className="flex items-center gap-2 text-zinc-500 hover:text-zinc-300 text-[11px] font-bold transition-colors group uppercase tracking-widest"
              >
                <ArrowLeftIcon className="w-3 h-3 transition-transform group-hover:-translate-x-0.5" />
                Voltar para a loja
              </button>
            )}

            <div className="flex items-center gap-3">
              <div className="relative">
                <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-600" />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar skills..."
                  className="pl-8 pr-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-xs text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-violet-500/50 focus:bg-zinc-800/80 w-48 transition-all"
                />
              </div>
              <button
                onClick={() => loadData()}
                className="p-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700 transition-colors"
              >
                <ArrowPathIcon className="w-4 h-4" />
              </button>
            </div>
          </div>
          {selectedSkill ? (
            /* ─── Detail View ─── */
            <SkillDetailView
              skill={selectedManifest ? enrichExtensionWithManifest(selectedSkill, selectedManifest) : selectedSkill}
              onBack={() => { setSelectedSkill(null); setSelectedManifest(null) }}
              onInstall={handleInstall}
              onToggle={handleToggle}
              onUninstall={handleUninstall}
              installing={installing}
              installProgress={installProgress}
              installError={installError}
              recommendedVersionByExtId={recommendedVersionByExtId}
            />
          ) : (
            /* ─── List View ─── */
            <>
              {/* Featured Carousel */}
              {featuredSkills.length > 0 && !searchQuery && (
                <div className="mb-6">
                  <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-3">
                    {activeTab === 'store' ? 'Destaques' : 'Suas Skills'}
                  </h2>
                  <FeaturedCarousel skills={featuredSkills} onSelect={handleSelectSkill} />
                </div>
              )}

              {/* Tag Filters */}
              {allTags.length > 0 && (
                <div
                  ref={tagsDragScrollRef}
                  onMouseDown={tagsDragScroll.mouseDown}
                  onTouchStart={tagsDragScroll.touchStart}
                  onTouchMove={tagsDragScroll.touchMove}
                  className="flex gap-2 overflow-x-auto scrollbar-none mb-5 pb-1"
                  style={{ cursor: tagsDragScroll.grabCursor }}
                >
                  <button
                    onClick={() => setSelectedTag(null)}
                    className={`shrink-0 px-3 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wide border transition-all ${
                      !selectedTag
                        ? 'bg-violet-600 text-white border-violet-500'
                        : 'bg-zinc-800 text-zinc-500 border-zinc-700 hover:text-zinc-300 hover:border-zinc-600'
                    }`}
                  >
                    Todas
                  </button>
                  {allTags.map((tag) => (
                    <button
                      key={tag}
                      onClick={() => setSelectedTag(tag === selectedTag ? null : tag)}
                      className={`shrink-0 px-3 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wide border transition-all ${
                        selectedTag === tag
                          ? 'bg-violet-600 text-white border-violet-500'
                          : 'bg-zinc-800 text-zinc-500 border-zinc-700 hover:text-zinc-300 hover:border-zinc-600'
                      }`}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              )}

              {/* Skills Grid */}
              {filteredList.length > 0 ? (
                <div className="w-full min-w-0 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {filteredList.map((skill) => (
                    <SkillCard key={skill.id} skill={skill} onSelect={handleSelectSkill} />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-20 text-zinc-600">
                  <WrenchIcon className="w-12 h-12 mb-4 opacity-30" />
                  <p className="text-sm font-medium">
                    {activeTab === 'store' ? 'Nenhuma skill disponível' : 'Nenhuma skill instalada'}
                  </p>
                  <p className="text-xs mt-1 text-zinc-700">
                    {activeTab === 'store'
                      ? 'Todas as skills já estão instaladas.'
                      : 'Vá até a Loja para explorar novas funcionalidades.'}
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {uninstallTarget && (
        <ExtensionUninstallModal
          ext={uninstallTarget}
          onConfirm={confirmUninstall}
          onCancel={cancelUninstall}
        />
      )}

      {installing && !selectedSkill && (installProgress || installError) && (
        <div className="fixed bottom-4 right-4 z-50 max-w-md">
          <ExtensionInstallCard
            progress={installError ? undefined : installProgress || undefined}
            error={installError || undefined}
            extName={allSkills.find((s) => s.id === installing)?.name || installing}
            onDismiss={
              installError
                ? () => {
                    setInstallError(null)
                    setInstalling(null)
                    setInstallProgress(null)
                  }
                : undefined
            }
          />
        </div>
      )}
    </div>
  )
}
