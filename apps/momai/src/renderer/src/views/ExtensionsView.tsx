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
import { useLocation } from 'react-router'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  fetchExtensions,
  toggleExtension,
  uninstallExtension,
  fetchExtensionManifest,
  fetchExtensionReleases,
  fetchSettings,
  updateSettingsPartial,
  Extension,
  ExtensionRelease
} from '../services/api'
import { useInstallProgress } from '../hooks/useInstallProgress'
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
  XMarkIcon,
  FolderIcon
} from '@heroicons/react/24/outline'
import { StarIcon as StarIconSolid } from '@heroicons/react/24/solid'
import { useI18n } from '../i18n'
import { getPermissionGroup, groupPermissions } from '../utils/permission-groups'
import { computeRecommendations } from '../utils/recommendations'
import { computeCategories, inferExtensionCategory } from '../utils/category-inference'

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
      <div
        style={{
          maskImage: `url(${iconUrl})`,
          WebkitMaskImage: `url(${iconUrl})`,
          maskSize: 'contain',
          WebkitMaskSize: 'contain',
          maskRepeat: 'no-repeat',
          WebkitMaskRepeat: 'no-repeat',
          maskPosition: 'center',
          WebkitMaskPosition: 'center'
        }}
        className={`${className} bg-current`}
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

/* ─── Extension Badges ─── */
interface Badge {
  label: string
  className: string
}

/* Badges removidas — lojas não usam badges, apenas botões e mensagens claras */

/* ─── Hero Carousel (promotional, one slide at a time) ─── */
function HeroCarousel({ onSelect }: { onSelect: (id: string) => void }) {
  const [current, setCurrent] = useState(0)
  const slides = [
    {
      id: 'assistente',
      title: 'Extensões da Assistente',
      description: 'Faça a MomAI cuidar dos seus sistemas, automatizar tarefas e conectar seus aplicativos favoritos — tudo por voz ou texto.',
      gradient: 'from-violet-700 via-violet-600 to-purple-800',
      svg: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
      action: null
    },
    {
      id: 'whatsapp',
      title: 'WhatsApp + MomAI',
      description: 'Conecte seu WhatsApp à assistente e responda mensagens, monitore conversas e gerencie contatos sem precisar pegar o celular.',
      gradient: 'from-emerald-700 via-emerald-600 to-green-800',
      svg: 'M12 2C6.48 2 2 6.48 2 12c0 1.88.54 3.63 1.48 5.12L2 22l5.12-1.48C8.37 21.46 10.12 22 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2z',
      action: { label: 'Detalhe', extId: 'whatsapp' }
    },
    {
      id: 'camera',
      title: 'Monitoramento por Câmera',
      description: 'Conecte uma câmera para monitorar sua saúde sem enviar seus dados para fora — tudo local e privado.',
      gradient: 'from-sky-700 via-blue-600 to-indigo-800',
      svg: 'M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z',
      action: { label: 'Em breve', extId: null }
    },
    {
      id: 'automacao',
      title: 'Automação Residencial',
      description: 'Controle dispositivos inteligentes, crie rotinas e automatize sua casa com comandos de voz.',
      gradient: 'from-amber-700 via-orange-600 to-rose-800',
      svg: 'M21 10.5h.375c.621 0 1.125.504 1.125 1.125v2.25c0 .621-.504 1.125-1.125 1.125H21M4.5 10.5h6.75V3.75M4.5 19.5V10.5m13.5 0v-3a2.25 2.25 0 0 0-2.25-2.25h-3',
      action: { label: 'Em breve', extId: null }
    }
  ]

  useEffect(() => {
    if (slides.length <= 1) return
    const timer = setInterval(() => setCurrent((p) => (p + 1) % slides.length), 10000)
    return () => clearInterval(timer)
  }, [])

  const prev = () => setCurrent((p) => (p - 1 + slides.length) % slides.length)
  const next = () => setCurrent((p) => (p + 1) % slides.length)

  const slide = slides[current]

  return (
    <div className="relative rounded-2xl overflow-hidden mb-8 h-56 md:h-72">
      <div className={`absolute inset-0 bg-gradient-to-br ${slide.gradient}`} />
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.12),transparent_70%)]" />

      {/* Decorative SVG icon */}
      <svg className="absolute -right-8 -top-8 w-64 h-64 text-white/5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="0.5">
        <path d={slide.svg} />
        <path d={slide.svg} transform="scale(1.5) translate(-4,-4)" opacity="0.5" />
      </svg>
      <svg className="absolute -left-4 bottom-4 w-32 h-32 text-white/5 rotate-45" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="0.5">
        <path d={slide.svg} />
      </svg>

      {/* Side arrows */}
      <button onClick={prev} className="absolute left-3 top-1/2 -translate-y-1/2 z-20 p-2 rounded-full bg-black/30 text-white/80 hover:bg-black/50 hover:text-white transition-all backdrop-blur-sm border border-white/10">
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
      </button>
      <button onClick={next} className="absolute right-3 top-1/2 -translate-y-1/2 z-20 p-2 rounded-full bg-black/30 text-white/80 hover:bg-black/50 hover:text-white transition-all backdrop-blur-sm border border-white/10">
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
      </button>

      <div className="relative z-10 h-full flex flex-col justify-between p-6 md:p-8">
        <div>
          <h3 className="text-xl md:text-2xl font-black text-white mb-2">{slide.title}</h3>
          <p className="text-sm md:text-base text-white/80 max-w-xl leading-relaxed">{slide.description}</p>
        </div>
        <div className="flex items-center justify-between">
          {slide.action ? (
            <button
              onClick={() => slide.action.extId && onSelect(slide.action.extId)}
              className={`px-5 py-2 rounded-full text-sm font-bold transition-all ${
                slide.action.label === 'Em breve'
                  ? 'bg-white/15 text-white/70 border border-white/20 cursor-default'
                  : 'bg-white text-gray-900 hover:bg-white/90 active:scale-[0.97] shadow-lg'
              }`}
            >
              {slide.action.label}
            </button>
          ) : <div />}
          <div className="flex gap-1.5">
            {slides.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrent(i)}
                className={`w-2 h-2 rounded-full transition-all ${
                  i === current ? 'bg-white w-5' : 'bg-white/40 hover:bg-white/60'
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
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
              key={`${skill.id}-${skill.category}`}
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

const ActiveGlow = () => (
  <span className="inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500 mr-1 shrink-0" />
)

/* ─── Skill Card ─── */
function SkillCard({ skill, onSelect, devMode }: { skill: Extension; onSelect: (s: Extension) => void; devMode?: string }) {
  const accentClasses = getAccentClasses(skill.manifest)
  const isInstalled =
    skill.installed !== false && (skill.category === 'core' || skill.category === 'extension')
  return (
    <div
      onClick={() => onSelect(skill)}
      className={`group bg-zinc-950/20 hover:bg-zinc-900/40 border border-zinc-850 hover:border-zinc-700/60 rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_8px_30px_rgb(0,0,0,0.45)] active:scale-[0.99]`}
    >
      <div className="p-5">
        <div className="flex items-start justify-between mb-4">
          <div
            className={`p-3 rounded-2xl ${getIconBgStyle(skill) ? '' : `bg-gradient-to-br ${getSkillGradient(skill.name, skill.manifest)}`} shadow-md`}
            style={getIconBgStyle(skill)}
          >
            <SkillIcon skill={skill} className="w-6 h-6 text-white" />
          </div>
          <div className="flex flex-col items-end gap-1.5">
            {skill.category === 'core' ? (
              <div className="flex items-center gap-1 px-2 py-0.5 bg-blue-500/10 text-blue-400 rounded-full text-[9px] font-bold uppercase tracking-wider border border-blue-500/25">
                <CpuChipIcon className="w-3.5 h-3.5" />
                CORE
              </div>
            ) : skill.is_official ? (
              <div className="flex items-center gap-1 px-2 py-0.5 bg-emerald-500/10 text-emerald-400 rounded-full text-[9px] font-bold uppercase tracking-wider border border-emerald-500/25">
                <CheckBadgeIcon className="w-3.5 h-3.5" />
                Oficial
              </div>
            ) : (
              <div className="px-2 py-0.5 bg-zinc-800/60 text-zinc-400 rounded-full text-[9px] font-bold uppercase tracking-wider border border-zinc-750">
                Comunidade
              </div>
            )}
            {import.meta.env.DEV && devMode === 'symlink' && skill.isSymlink && (
              <div
                title={skill.symlinkPath || ''}
                className="flex items-center gap-1 px-2 py-0.5 bg-amber-500/10 text-amber-400 rounded-full text-[9px] font-bold uppercase tracking-wider border border-amber-500/25"
              >
                Symlink
              </div>
            )}
            {import.meta.env.DEV && devMode === 'store_test' && !skill.isSymlink && skill.source === 'store_test' && (
              <div
                title="Instalado via Testar Loja — só fica ativo enquanto o modo Testar Loja estiver selecionado"
                className="flex items-center gap-1 px-2 py-0.5 bg-blue-500/10 text-blue-400 rounded-full text-[9px] font-bold uppercase tracking-wider border border-blue-500/25"
              >
                Loja
              </div>
            )}
            {import.meta.env.DEV && devMode === 'symlink' && !skill.isSymlink && skill.source === 'symlink' && (
              <div
                title="Registrado no modo Dev — o symlink .dev/<id> ainda não foi criado pelo usuário"
                className="flex items-center gap-1 px-2 py-0.5 bg-violet-500/10 text-violet-400 rounded-full text-[9px] font-bold uppercase tracking-wider border border-violet-500/25"
              >
                Dev
              </div>
            )}
            {skill.updateAvailable && (
              <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/25 animate-pulse">
                Upgrade
              </span>
            )}
            {isInstalled &&
              (skill.enabled ? (
                <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 flex items-center gap-1">
                  <ActiveGlow />
                  Ativa
                </span>
              ) : (
                <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded-full bg-zinc-900 text-zinc-650 border border-zinc-850">
                  Inativa
                </span>
              ))}
          </div>
        </div>
        <h3
          className={`text-base font-bold text-zinc-100 mb-1.5 transition-colors group-hover:text-violet-400`}
        >
          {skill.name}
        </h3>
        {(skill.source as string) === 'dev' && (
          <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/25 mb-2 inline-block">
            Dev 🔧
          </span>
        )}
        <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed mb-4 min-h-[2.5rem]">
          {skill.description}
        </p>
        <div className="flex items-center justify-between pt-4 border-t border-zinc-800/60">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-full bg-zinc-800 flex items-center justify-center overflow-hidden border border-zinc-750">
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
              <div className="flex items-center gap-1 text-[10px] text-amber-400 font-bold bg-amber-400/10 px-1.5 py-0.5 rounded-md border border-amber-400/20">
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

/* ─── Skeleton Card (loading/shimmer placeholder) ─── */
function SkeletonCard() {
  return (
    <div className="p-4 rounded-2xl border border-zinc-800 bg-zinc-950/20 animate-pulse space-y-3">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-zinc-800/60 shrink-0" />
        <div className="flex-1 space-y-1.5">
          <div className="h-3 w-24 rounded bg-zinc-800/60" />
          <div className="h-2 w-16 rounded bg-zinc-800/40" />
        </div>
      </div>
      <div className="h-2 w-full rounded bg-zinc-800/40" />
      <div className="h-2 w-3/4 rounded bg-zinc-800/40" />
      <div className="flex items-center gap-2 pt-1">
        <div className="h-5 w-14 rounded-full bg-zinc-800/60" />
        <div className="h-5 w-14 rounded-full bg-zinc-800/40" />
      </div>
    </div>
  )
}

function formatSize(bytes: number | null | undefined): string {
  if (!bytes) return ''
  const mb = bytes / (1024 * 1024)
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`
  return `${mb.toFixed(0)} MB`
}

/* ─── Version History Section (reused in main column on mobile, sidebar on large) ─── */
function VersionHistorySection({
  loadingReleases,
  releasesError,
  releases,
  installedVersion,
  recommendedVersion,
  skill,
  inCard
}: {
  loadingReleases: boolean
  releasesError: string | null
  releases: ExtensionRelease[]
  installedVersion: string | null
  recommendedVersion: string | null
  skill: Extension
  inCard?: boolean
}) {
  const visibleReleases = useMemo(
    () => [...releases].sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true })).slice(0, 3),
    [releases]
  )
  const repoUrl = skill.repo ? `https://github.com/${skill.repo}/releases` : null

  const inner = (
    <>
      <h2 className="text-xs font-bold text-text-muted mb-4">
        Histórico de Versões
      </h2>
      <div>
        {loadingReleases && (
          <p className="text-xs text-zinc-500 italic animate-pulse">
            Carregando versões...
          </p>
        )}
        {releasesError && (
          <p className="text-xs text-red-400 italic">Erro: {releasesError}</p>
        )}
        {!loadingReleases && !releasesError && releases.length === 0 && (
          <p className="text-xs text-zinc-500 italic">Nenhuma versão encontrada.</p>
        )}
        {!loadingReleases && !releasesError && releases.length > 0 && (
          <div className="relative border-l border-zinc-850 ml-2 pl-4 space-y-5">
            {visibleReleases.map((rel) => {
              const isCurrent = !!(installedVersion && rel.version === installedVersion)
              const isRecommended = !!(
                recommendedVersion && rel.version === recommendedVersion
              )
              return (
                <div key={rel.version} className="relative group/timeline text-left">
                  <div
                    className={`absolute -left-[23px] top-1 w-2.5 h-2.5 rounded-full border-2 border-zinc-900 transition-all ${
                      isCurrent
                        ? 'bg-violet-500 shadow-[0_0_8px_rgba(139,92,246,0.6)]'
                        : rel.compatible
                          ? 'bg-zinc-700 group-hover/timeline:bg-zinc-500'
                          : 'bg-red-700 group-hover/timeline:bg-red-500'
                    }`}
                  />
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs text-white font-extrabold">
                        v{rel.version}
                      </span>
                      {rel.date && (
                        <span className="text-[9px] text-zinc-500">
                          {new Date(rel.date).toLocaleDateString()}
                        </span>
                      )}
                      {!rel.compatible && (
                        <span className="text-[8px] font-bold text-red-400 uppercase tracking-wide bg-red-500/10 px-1.5 py-0.5 rounded border border-red-500/20">
                          Incompatível
                        </span>
                      )}
                      {isCurrent && (
                        <span className="px-1.5 py-0.5 rounded bg-violet-500/10 border border-violet-500/20 text-[8px] text-violet-400 font-extrabold uppercase tracking-wide">
                          Instalada
                        </span>
                      )}
                      {isRecommended && !isCurrent && (
                        <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-[8px] text-emerald-400 font-extrabold uppercase tracking-wide">
                          Recomendada
                        </span>
                      )}
                    </div>
                    {rel.changelog && (
                      <p className="text-[10px] text-zinc-400 leading-normal line-clamp-2">
                        {rel.changelog}
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
        {repoUrl && releases.length > 3 && (
          <a
            href={repoUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-4 block text-center text-[10px] font-bold text-zinc-500 hover:text-zinc-300 uppercase tracking-wider transition-colors no-underline border border-zinc-800 rounded-lg py-2 hover:border-zinc-700"
          >
            Ver todas as {releases.length} versões →
          </a>
        )}
      </div>
    </>
  )

  if (inCard) return inner
  return (
    <section className="bg-card rounded-2xl p-6 border border-zinc-800/60">
      {inner}
    </section>
  )
}

/* ─── Skill Detail (inline, keeps navbar) ─── */
function SkillDetailView({
  skill,
  onBack,
  onInstall,
  onToggle,
  onUninstall,
  recommendedVersionByExtId,
  installingId,
  allSkills,
  onSelectSkill,
  devMode
}: {
  skill: Extension
  onBack: () => void
  onInstall: (s: Extension, downloadUrl?: string) => void
  onToggle: (s: Extension) => void
  onUninstall: (s: Extension) => void
  recommendedVersionByExtId?: Record<string, string | null>
  installingId?: string | null
  allSkills?: Extension[]
  onSelectSkill?: (s: Extension) => void
  devMode?: string
}) {
  const { t } = useI18n()
  const accentClasses = getAccentClasses(skill.manifest)
  const isInstalled =
    skill.installed !== false && (skill.category === 'core' || skill.category === 'extension')
  const isBuiltin = skill.category === 'core'
  if (skill.id === 'whatsapp') {
    console.log('[DIAG] SkillDetailView whatsapp:', { id: skill.id, category: skill.category, installed: skill.installed, isInstalled, isBuiltin, compat: skill.compat_status, source: skill.source, isSymlink: skill.isSymlink, devMode })
  }

  const [releasesExpanded, setReleasesExpanded] = useState(true)
  const [releases, setReleases] = useState<ExtensionRelease[]>([])
  const [loadingReleases, setLoadingReleases] = useState(false)
  const [releasesError, setReleasesError] = useState<string | null>(null)
  const [installedVersion, setInstalledVersion] = useState<string | null>(null)
  const [recommendedVersion, setRecommendedVersion] = useState<string | null>(null)
  const [fetchedReadme, setFetchedReadme] = useState<string | null>(null)

  const recommendations = useMemo(() => {
    if (!allSkills || !allSkills.length) return []
    return computeRecommendations(skill, allSkills, 12)
  }, [skill, allSkills])

  const compatFallbackVersion = useMemo(() => {
    if (skill.compat_status !== 'incompatible') return null
    const compatReleases = releases.filter((r) => r.compatible)
    const best = compatReleases.sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }))[0]
    return best?.version || recommendedVersion || null
  }, [releases, recommendedVersion, skill.compat_status])

  const compatFallbackUrl = useMemo(() => {
    if (!compatFallbackVersion) return undefined
    const compatReleases = releases.filter((r) => r.compatible)
    const best = compatReleases.sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }))[0]
    return best?.download_url || undefined
  }, [releases, compatFallbackVersion])

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
  }, [releasesExpanded, skill.id, skill.repo, skill.version])

  useEffect(() => {
    const hasFullReadme = skill.instructions && skill.instructions.length > 200
    if (hasFullReadme || !skill.repo) return
    const [owner, repo] = skill.repo.split('/')
    if (!owner || !repo) return
    const url = `https://raw.githubusercontent.com/${owner}/${repo}/main/README.md`
    fetch(url)
      .then((r) => (r.ok ? r.text() : null))
      .then((text) => {
        if (text) setFetchedReadme(text)
      })
      .catch(() => {})
  }, [skill.repo, skill.instructions])

  return (
    <div className="animate-fade-in max-w-6xl mx-auto px-6 pb-20">

      {/* Tighter Hero Header */}
      <div className="relative flex flex-col md:flex-row items-center md:items-start gap-8 mb-6 pt-8 pb-6 border-b border-zinc-800/50">
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
          <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mb-2">
            <h1 className="text-2xl md:text-3xl font-black text-text tracking-tight leading-none">
              {skill.name}
            </h1>
            {skill.category === 'core' ? (
              <div className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-500/10 border border-blue-500/20 rounded-md text-[9px] text-blue-400 font-bold uppercase tracking-wider h-fit">
                <CpuChipIcon className="w-3 h-3" />
                CORE
              </div>
            ) : skill.is_official ? (
              <div className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded-md text-[9px] text-emerald-400 font-bold uppercase tracking-wider h-fit">
                <CheckBadgeIcon className="w-3 h-3" />
                Oficial
              </div>
            ) : null}
            {import.meta.env.DEV && devMode === 'symlink' && skill.isSymlink && (
              <div className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-500/10 border border-amber-500/20 rounded-md text-[9px] text-amber-400 font-bold uppercase tracking-wider h-fit">
                Symlink
              </div>
            )}
          </div>

          <div className="flex items-center justify-center md:justify-start gap-3 text-xs text-text-muted flex-wrap mb-6">
            <div className="flex items-center gap-1.5">
              {(skill.repo || (!skill.is_official && skill.author)) && (
                <img
                  src={`https://avatars.githubusercontent.com/${encodeURIComponent((skill.repo?.split('/')[0] || skill.author || '').trim())}?s=32`}
                  alt=""
                  className="w-4 h-4 rounded-full border border-zinc-800"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement
                    if (!target.src.includes('github.png')) {
                      target.src = 'https://github.com/github.png?s=32'
                    }
                  }}
                />
              )}
              <span className="font-medium">{skill.author || 'MomAI'}</span>
            </div>
            <span className="text-zinc-700">·</span>
            <span className="font-medium">v{recommendedVersion || skill.version || '1.0.0'}</span>
            {skill.repo && (
              <>
                <span className="text-zinc-700">·</span>
                <a
                  href={`https://github.com/${skill.repo}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-text-muted hover:text-text transition-colors no-underline"
                >
                  <GitHubIcon className="w-3.5 h-3.5" />
                  <span className="font-medium">{skill.stars || 0}</span>
                </a>
              </>
            )}
          </div>
            {isInstalled && (
              <div className="flex items-center gap-3">
                {skill.updateAvailable && (
                  <button
                    onClick={() => onInstall(skill)}
                    disabled={installingId === skill.id}
                    className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all shadow-lg shadow-blue-500/25 ${installingId === skill.id ? 'bg-zinc-700 text-zinc-500 cursor-not-allowed' : 'bg-gradient-to-br from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 active:scale-[0.97] text-white'}`}
                  >
                    {installingId === skill.id ? 'Obtendo...' : 'Atualizar'}
                  </button>
                )}
                <button
                  onClick={() => onToggle(skill)}
                  className={`inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold transition-all ${
                    skill.enabled
                      ? 'bg-zinc-800/60 text-zinc-400 border border-zinc-700 hover:bg-zinc-800 hover:text-zinc-200'
                      : 'bg-emerald-600 text-white border border-emerald-500/50 shadow-lg hover:bg-emerald-500'
                  }`}
                >
                  {!skill.enabled && <PowerIcon className="w-4 h-4" />}
                  {skill.enabled ? 'Desativar' : 'Ativar'}
                </button>
                {!skill.isSymlink && skill.category !== 'core' && (
                  <button
                    onClick={() => onUninstall(skill)}
                    className="px-4 py-2.5 rounded-xl text-xs font-bold text-zinc-400 border border-zinc-700 hover:text-red-400 hover:border-red-500/50 hover:bg-red-500/10 transition-all"
                  >
                    Desinstalar
                  </button>
                )}
              </div>
            )}
            {!isInstalled && skill.hasNewerIncompatible && (
              <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 px-2 py-1 rounded border border-amber-500/20">
                Incompatível mais recente
              </span>
            )}

          <p className="text-sm text-text-muted mb-6 max-w-2xl leading-relaxed">
            {skill.description}
          </p>

          {!isInstalled && skill.compat_status === 'incompatible' && (
            <p className="text-red-400 text-xs text-center md:text-left">
              Esta extensão possui uma nova versão v{skill.version} que requer atualizar a MomAI para a{' '}
              {skill.momai_compat?.replace('>=', 'v') || 'versão mais recente'}.
            </p>
          )}

          <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 mt-6">
            {skill.tags?.[0] && (
              <span className="inline-flex items-center px-3 py-1 rounded-full bg-zinc-800 text-zinc-300 text-xs font-medium">
                {skill.tags[0]}
              </span>
            )}
            {!isBuiltin && !isInstalled && skill.compat_status !== 'incompatible' && (
              <button
                onClick={() => onInstall(skill)}
                disabled={installingId === skill.id}
                className={`px-10 py-3 text-white font-bold transition-all shadow-lg rounded-xl text-base ${installingId === skill.id ? 'opacity-50 cursor-not-allowed bg-violet-600' : 'bg-violet-600 hover:bg-violet-500 active:scale-[0.97]'}`}
              >
                {installingId === skill.id ? 'Obtendo...' : 'Obter'}
              </button>
            )}
            {!isBuiltin && !isInstalled && skill.compat_status === 'incompatible' && compatFallbackVersion && (
              <button
                onClick={() => onInstall(skill, compatFallbackUrl)}
                disabled={installingId === skill.id}
                className="px-10 py-3 text-white font-bold transition-all shadow-lg rounded-xl text-base bg-violet-600 hover:bg-violet-500 active:scale-[0.97]"
              >
                {installingId === skill.id ? 'Obtendo...' : 'Obter'}
              </button>
            )}
            {isInstalled && skill.updateAvailable && (
              <button
                onClick={() => onInstall(skill)}
                disabled={installingId === skill.id}
                className={`px-10 py-3 text-white font-bold transition-all shadow-lg rounded-xl text-base ${installingId === skill.id ? 'bg-zinc-700 text-zinc-500 cursor-not-allowed' : 'bg-violet-600 hover:bg-violet-500 active:scale-[0.97]'}`}
              >
                {installingId === skill.id ? 'Obtendo...' : 'Atualizar'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 2-Column Grid: Main content (left) + Sidebar (right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Main Column: About + Requirements only (keeps full width on large) */}
        <div className="lg:col-span-9 space-y-6">
          {/* Description Section */}
              <section className="bg-card rounded-2xl p-8 border border-zinc-800/60">
                <h2 className="text-xs font-bold text-text-muted mb-5">
                  Sobre esta extensão
                </h2>
            <div
              className="prose prose-invert prose-zinc max-w-none 
              prose-headings:text-zinc-50 prose-headings:font-bold prose-headings:mt-6 prose-headings:mb-3
              prose-p:text-zinc-200 prose-p:text-sm prose-p:leading-relaxed prose-p:mb-3
              prose-li:text-zinc-200 prose-li:text-sm prose-li:mb-1.5
              prose-strong:text-white prose-code:text-violet-300 prose-code:bg-violet-500/15 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded"
            >
              {fetchedReadme || skill.instructions || skill.readme ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {fetchedReadme || skill.instructions || skill.readme}
                </ReactMarkdown>
              ) : (
                <div className="py-16 flex flex-col items-center justify-center text-center">
                  <div className="w-12 h-12 rounded-full bg-zinc-900/50 flex items-center justify-center mb-3 border border-zinc-800">
                    <CommandLineIcon className="w-6 h-6 text-zinc-650" />
                  </div>
                  <p className="text-zinc-500 text-xs italic">
                    Esta extensão não forneceu um README detalhado.
                  </p>
                </div>
              )}
            </div>
          </section>

          {/* Version History Section - mobile only (below About) */}
          {skill.repo && (
            <div className="lg:hidden">
              <VersionHistorySection
                loadingReleases={loadingReleases}
                releasesError={releasesError}
                releases={releases}
                installedVersion={installedVersion}
                recommendedVersion={recommendedVersion}
                skill={skill}
              />
            </div>
          )}
        </div>

        {/* Right Column: Sidebar (25% -> lg:col-span-3) — single card */}
        <div className="lg:col-span-3">
          <section className="bg-card border border-zinc-800/60 rounded-2xl p-6 space-y-6">
            {/* Informações */}
            <div>
              <h3 className="text-xs font-bold text-text-muted mb-4">
                Informações
              </h3>
              <div className="space-y-5">
                <div>
                  <p className="text-[10px] text-text-muted font-medium mb-1">
                    Desenvolvedor
                  </p>
                  <div className="flex items-center gap-2">
                    {skill.repo || skill.author ? (
                      <img
                        src={`https://avatars.githubusercontent.com/${encodeURIComponent((skill.repo?.split('/')[0] || skill.author || '').trim())}?s=32`}
                        alt="Avatar"
                        className="w-6 h-6 rounded-full border border-zinc-800 shrink-0"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement
                          if (!target.src.includes('github.png')) {
                            target.src = 'https://github.com/github.png?size=32'
                          }
                        }}
                      />
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-violet-600/20 flex items-center justify-center text-[9px] text-violet-400 font-black border border-violet-500/30 uppercase shrink-0">
                        M
                      </div>
                    )}
                    <p className="text-xs text-zinc-100 font-bold">{skill.author || 'MomAI Team'}</p>
                  </div>
                </div>



              </div>
            </div>

            <hr className="border-zinc-800" />

            {/* Permissões */}
            <div>
              <h3 className="text-xs font-bold text-text-muted mb-3">
                Permissões
              </h3>
              <ul className="space-y-3">
                {skill.permissionSummary && skill.permissionSummary.length > 0 ? (
                  (() => {
                    const grouped = groupPermissions(skill.permissionSummary)
                    return Array.from(grouped.entries()).map(([group, perms]) => (
                      <li
                        key={group}
                        className="flex items-start gap-1.5 text-[10px] text-zinc-300 font-medium leading-snug"
                      >
                        <span className="text-zinc-500 mt-0.5 shrink-0">•</span>
                        <span>{t(`extensions.permissions.group.${group}`)}</span>
                      </li>
                    ))
                  })()
                ) : (
                  <li className="text-[10px] text-zinc-500 italic">
                    {t('extensions.permissions.none')}
                  </li>
                )}
              </ul>
            </div>

            {skill.repo && (
              <>
                <hr className="border-zinc-800" />
                <div className="hidden lg:block">
                  <VersionHistorySection
                    loadingReleases={loadingReleases}
                    releasesError={releasesError}
                    releases={releases}
                    installedVersion={installedVersion}
                    recommendedVersion={recommendedVersion}
                    skill={skill}
                    inCard
                  />
                </div>
              </>
            )}
          </section>
        </div>
      </div>

      {/* Recomendações — carrossel horizontal com scroll */}
      {recommendations.length > 0 && (
        <section className="mt-10 max-w-6xl mx-auto">
          <h2 className="text-sm font-bold text-text mb-4">
            Extensões Relacionadas
          </h2>
          <div className="relative group min-w-0">
            <div className="flex gap-3 overflow-x-auto scrollbar-none pb-1">
              {recommendations.slice(0, 12).map((rec) => {
                const ext = rec.item
                const gradient = getSkillGradient(ext.name, ext)
                return (
                  <div
                    key={`${ext.id}-${ext.category || 'community'}`}
                    onClick={() => onSelectSkill?.(ext as Extension)}
                    className="shrink-0 w-72 h-40 rounded-xl overflow-hidden cursor-pointer group/card relative border border-zinc-700/50 transition-all hover:-translate-y-0.5 hover:shadow-lg hover:border-violet-500/50"
                  >
                    <div className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-30`} />
                    <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 via-zinc-900/40 to-transparent" />
                    <div className="absolute inset-0 p-4 flex flex-col justify-between">
                      <div className="flex items-start justify-between">
                        <div className="p-2 rounded-lg bg-zinc-800/80 backdrop-blur-sm border border-zinc-700/50">
                          <SkillIcon skill={ext as Extension} className="w-5 h-5 text-white" />
                        </div>
                        {ext.is_official && (
                          <div className="flex items-center gap-1 px-1.5 py-0.5 bg-emerald-500/20 border border-emerald-500/30 rounded text-[9px] text-emerald-400 font-semibold uppercase tracking-wider">
                            <CheckBadgeIcon className="w-3 h-3" />
                            Oficial
                          </div>
                        )}
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-white mb-0.5">{ext.name}</h3>
                        <p className="text-[10px] text-zinc-400 line-clamp-2 leading-relaxed">
                          {ext.description}
                        </p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </section>
      )}
    </div>
  )
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
    version: ext.version || manifest.version,
    author: manifest.author || ext.author,
    permissionSummary: perms
  }
}

/* ─── Main View ─── */
interface ExtensionsViewProps {
  statusInfo?: any
}

export default function ExtensionsView({ statusInfo }: ExtensionsViewProps = {}) {
  const { t, locale } = useI18n()
  const location = useLocation()
  const [allSkills, setAllSkills] = useState<Extension[]>([])
  const [loading, setLoading] = useState(true)
  const { handleInstall: globalHandleInstall, simulateInstall, state: installState } = useInstallProgress()
  const [uninstallTarget, setUninstallTarget] = useState<{ id: string; name: string } | null>(null)
  const [recommendedVersionByExtId, setRecommendedVersionByExtId] = useState<
    Record<string, string | null>
  >({})
  const [viewMode, setViewMode] = useState<'store' | 'library'>('store')
  const [selectedSkill, setSelectedSkill] = useState<Extension | null>(null)
  const [selectedManifest, setSelectedManifest] = useState<Record<string, any> | null>(null)
  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  const [activeTypeFilter, setActiveTypeFilter] = useState<string>('Todas')
  const [browseCategory, setBrowseCategory] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [devMode, setDevMode] = useState<'symlink' | 'store_test'>('symlink')
  const [switchingMode, setSwitchingMode] = useState<'symlink' | 'store_test' | null>(null)
  const [modeSwitchNotice, setModeSwitchNotice] = useState<string | null>(null)
  const tagsDragScrollRef = useRef<HTMLDivElement | null>(null)
  const tagsDragScroll = useDragScroll(tagsDragScrollRef)

  const handleSetDevMode = async (mode: 'symlink' | 'store_test') => {
    const prevMode = devMode
    if (prevMode === mode) return
    setSwitchingMode(mode)
    try {
      // Count currently-active extensions in the previous mode so we can
      // tell the user how many were deactivated by the security policy.
      const wasActive = allSkills.filter((s) => s.category === 'extension' && s.enabled).length
      await updateSettingsPartial({ dev_mode: mode })
      setDevMode(mode)
      const fresh = await loadData(true)
      if (wasActive > 0) {
        const modeLabel = mode === 'symlink' ? 'Dev (Symlinks)' : 'Testar Loja'
        setModeSwitchNotice(
          `Modo trocado para ${modeLabel}. ${wasActive} extensão(ões) desativada(s) por segurança — reative manualmente as que deseja usar neste ambiente.`
        )
        // Auto-dismiss after a few seconds
        setTimeout(() => setModeSwitchNotice(null), 8000)
      }
    } catch (err) {
      console.error('Erro ao atualizar modo dev:', err)
    } finally {
      setSwitchingMode(null)
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
      console.log('[DIAG] allSkills loaded:', data.length, 'entries')
      data.forEach(e => console.log(`[DIAG]   id=${e.id} cat=${e.category} installed=${e.installed} source=${e.source} compat=${e.compat_status}`))
      setAllSkills(data)
      window.dispatchEvent(new CustomEvent('momai_extensions_sync', { detail: data }))
      return data
    } catch (err) {
      console.error('Erro ao carregar skills:', err)
      const isBackendReady = statusInfo?.status === 'ok'
      if (!silent && isBackendReady) {
        alert(t('extensions.errors.fetch', { error: String(err) }))
      }
      return []
    } finally {
      setLoading(false)
    }
  }

  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let cancelled = false

    const loadWithRetry = async (attempt = 0) => {
      const data = await loadData(true) // Silent — no alert during boot
      if (cancelled) return
      if (data.length === 0 && attempt < 15) {
        // Server not ready yet — keep skeleton visible and retry
        setLoading(true)
        retryTimerRef.current = setTimeout(() => loadWithRetry(attempt + 1), 2000)
      }
    }

    loadWithRetry()

    const handleReady = () => {
      // Backend just became available — cancel any pending retry and load immediately
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current)
        retryTimerRef.current = null
      }
      loadWithRetry(0)
    }
    window.addEventListener('momai_backend_ready', handleReady)
    return () => {
      cancelled = true
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
      window.removeEventListener('momai_backend_ready', handleReady)
    }
  }, [locale])

  useEffect(() => {
    const tab = (location.state as any)?.tab
    if (tab === 'store') setViewMode('store')
    if (tab === 'installed') setViewMode('library')
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
    await globalHandleInstall(ext.id, ext.name, ext.icon, downloadUrl)
    if (!installState.error) {
      const freshData = await loadData(true)
      if (selectedSkill?.id === ext.id) {
        const updated = freshData.find((s) => s.id === ext.id)
        if (updated) setSelectedSkill(updated)
        setSelectedManifest(null)
      }
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
    const targetId = uninstallTarget.id

    // Dismiss the modal immediately
    setUninstallTarget(null)
    localStorage.removeItem(`${targetId}_has_connected_once`)

    try {
      await uninstallExtension(targetId)
      const freshData = await loadData(true)
      const updated = freshData.find((s) => s.id === targetId)
      if (updated) {
        setSelectedSkill(updated)
        if (updated.repo) {
          const manifest = await fetchExtensionManifest(updated.id)
          setSelectedManifest(manifest)
        }
      } else {
        // Extension not in community catalog — go back to list
        setSelectedSkill(null)
        setSelectedManifest(null)
      }
    } catch (err) {
      alert(t('extensions.errors.uninstall', { error: String(err) }))
      // Revert / refresh the state on failure
      loadData(true)
    }
  }

  const cancelUninstall = () => setUninstallTarget(null)

  const builtinSkills = useMemo(() => allSkills.filter((s) => s.category === 'core'), [allSkills])
  const installedSkills = useMemo(
    () => allSkills.filter((s) => s.category === 'extension'),
    [allSkills]
  )
  const isDev = window.api?.isDev?.() ?? false
  const storeSkills = useMemo(() => {
    // Em produção (build NSIS), a loja sempre mostra o catálogo completo
    // da comunidade + extensões instaladas. O filtro por devMode só se
    // aplica em desenvolvimento, onde o usuário pode alternar entre
    // symlink (dev local) e store_test (catálogo remoto).
    if (isDev && devMode === 'symlink') {
      return allSkills.filter((s) => s.category === 'extension')
    }
    if (isDev && devMode === 'store_test') {
      return allSkills.filter((s) => s.category !== 'core')
    }
    return allSkills.filter((s) => s.category !== 'core')
  }, [allSkills, devMode, isDev])

  const categories = useMemo(() => computeCategories(storeSkills), [storeSkills])
  const browseCatData = useMemo(
    () => (browseCategory ? categories.find((c) => c.id === browseCategory) : null),
    [browseCategory, categories]
  )

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

  const typeFilters = ['Todas', 'Skills', 'UI', 'Background', 'Temas']
  const filteredByType = useMemo(() => {
    if (activeTypeFilter === 'Todas') return storeSkills
    const typeMap: Record<string, string> = { Skills: 'skill', UI: 'ui', Background: 'background', Temas: 'theme' }
    const targetType = typeMap[activeTypeFilter]
    return storeSkills.filter((s) => s.inferredTypes?.includes(targetType))
  }, [storeSkills, activeTypeFilter])

  const currentList = viewMode === 'library' ? [...builtinSkills, ...installedSkills] : filteredByType

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
    const candidates = viewMode === 'store' ? storeSkills : allSkills
    return candidates.slice(0, 6)
  }, [viewMode, storeSkills, allSkills])

  return (
    <div className="flex-1 h-full bg-bg min-w-0 flex flex-col overflow-hidden relative">
      {/* Gradient background when viewing skill detail */}
      {selectedSkill && (() => {
        const bgStyle = getIconBgStyle(selectedSkill)
        const grad = getSkillGradient(selectedSkill.name, selectedSkill.manifest)
        return (
          <div className="absolute inset-x-0 top-0 h-[55vh] pointer-events-none overflow-hidden">
            {bgStyle ? (
              <div className="w-full h-full" style={{
                background: `linear-gradient(180deg, ${bgStyle.background}0D 0%, ${bgStyle.background}05 50%, transparent 80%)`
              }} />
            ) : (
              <div className={`w-full h-full bg-gradient-to-b ${grad} opacity-[0.04]`} />
            )}
          </div>
        )
      })()}
      {/* ─── Content ─── */}
      <div className="flex-1 min-w-0 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-6 py-5">
          {modeSwitchNotice && (
            <div className="mb-4 flex items-center gap-3 px-4 py-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-300 text-sm animate-fade-in">
              <ExclamationCircleIcon className="w-5 h-5 shrink-0" />
              <span className="flex-1">{modeSwitchNotice}</span>
              <button
                onClick={() => setModeSwitchNotice(null)}
                className="text-amber-400/60 hover:text-amber-300 transition-colors"
                title="Fechar"
              >
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>
          )}
          {/* ─── Tabs & Search ─── */}
          <div className="flex items-center justify-between mb-5">
            {!selectedSkill ? (
              <div className="flex items-center gap-3">
                {/* Dev Mode Switcher */}
                {import.meta.env.DEV && (
                  <div className="flex items-center gap-1 p-0.5 bg-zinc-950/40 rounded-lg border border-zinc-800/80">
                    <button
                      onClick={() => handleSetDevMode('symlink')}
                      disabled={!!switchingMode}
                      title="Ambiente DEV: só lê de .dev/ (links simbólicos para checkouts locais). Ambientes completamente separados."
                      className={`px-2.5 py-1 rounded-md text-[9px] font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 ${
                        devMode === 'symlink'
                          ? 'bg-amber-500/10 border border-amber-500/30 text-amber-400 font-extrabold shadow-sm'
                          : 'text-zinc-600 hover:text-zinc-400'
                      } ${switchingMode ? 'opacity-60 cursor-wait' : ''}`}
                    >
                      {switchingMode === 'symlink' ? (
                        <ArrowPathIcon className="w-3 h-3 animate-spin" />
                      ) : (
                        'Dev (Symlinks)'
                      )}
                    </button>
                    <button
                      onClick={() => handleSetDevMode('store_test')}
                      disabled={!!switchingMode}
                      title="Ambiente LOJA: só lê de extensionsDir/ (downloads reais). Ambientes completamente separados."
                      className={`px-2.5 py-1 rounded-md text-[9px] font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 ${
                        devMode === 'store_test'
                          ? 'bg-blue-500/10 border border-blue-500/30 text-blue-400 font-extrabold shadow-sm'
                          : 'text-zinc-600 hover:text-zinc-400'
                      } ${switchingMode ? 'opacity-60 cursor-wait' : ''}`}
                    >
                      {switchingMode === 'store_test' ? (
                        <ArrowPathIcon className="w-3 h-3 animate-spin" />
                      ) : (
                        'Testar Loja'
                      )}
                    </button>
                    <button
                      onClick={() => simulateInstall('debug-ext', 'Debug Extension')}
                      className="px-2.5 py-1 rounded-md text-[9px] font-bold uppercase tracking-wider text-zinc-600 hover:text-zinc-400 border border-dashed border-zinc-700/50 hover:border-zinc-500 transition-all"
                      title="Simular instalação (debug)"
                    >
                      Simular
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={() => {
                  setSelectedSkill(null)
                  setSelectedManifest(null)
                }}
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
                title="Recarregar dados"
              >
                <ArrowPathIcon className="w-4 h-4" />
              </button>

              {/* Library (Biblioteca) Toggle Button */}
              {!selectedSkill && (
                <button
                  onClick={() => setViewMode(viewMode === 'store' ? 'library' : 'store')}
                  className={`p-1.5 rounded-lg border transition-all flex items-center gap-1.5 ${
                    viewMode === 'library'
                      ? 'bg-violet-600/20 border-violet-500/50 text-violet-400 font-bold'
                      : 'bg-zinc-800 border-zinc-700 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700'
                  }`}
                  title="Biblioteca"
                >
                  <FolderIcon className="w-4 h-4" />
                  <span className="text-[10px] uppercase tracking-wider font-bold pr-1">
                    Biblioteca
                  </span>
                </button>
              )}
            </div>
          </div>
          {selectedSkill ? (
            /* ─── Detail View ─── */
            <SkillDetailView
              skill={
                selectedManifest
                  ? enrichExtensionWithManifest(selectedSkill, selectedManifest)
                  : selectedSkill
              }
              onBack={() => {
                setSelectedSkill(null)
                setSelectedManifest(null)
              }}
              onInstall={handleInstall}
              onToggle={handleToggle}
              installingId={installState.id}
              onUninstall={handleUninstall}
              recommendedVersionByExtId={recommendedVersionByExtId}
              allSkills={allSkills}
              onSelectSkill={handleSelectSkill}
              devMode={devMode}
            />
          ) : (
            /* ─── List View ─── */
            <>
              {viewMode === 'library' ? (
                /* ─── Library View (Biblioteca) ─── */
                <div className="w-full space-y-6">
                  <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
                    <div>
                      <h2 className="text-xl font-extrabold text-white">Biblioteca</h2>
                      <p className="text-xs text-zinc-500 mt-1">
                        Gerencie suas extensões e habilidades instaladas localmente.
                      </p>
                    </div>
                    <button
                      onClick={() => loadData(false)}
                      className="px-3.5 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs transition-all shadow-lg flex items-center gap-1.5"
                    >
                      <ArrowPathIcon className="w-3.5 h-3.5" />
                      Verificar Atualizações
                    </button>
                  </div>

                  {[...builtinSkills, ...installedSkills].length > 0 ? (
                    <div className="w-full overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950/20 backdrop-blur-xl">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-zinc-800 text-[10px] text-zinc-500 font-black uppercase tracking-wider bg-zinc-900/40">
                            <th className="p-4">Nome</th>
                            <th className="p-4">Versão</th>
                            <th className="p-4">Status</th>
                            <th className="p-4 text-right">Ações</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-850">
                          {[...builtinSkills, ...installedSkills].map((skill) => {
                            const isCore = skill.category === 'core'
                            return (
                              <tr key={`${skill.id}-${skill.category}`} className="hover:bg-zinc-850/10 transition-colors">
                                <td className="p-4 flex items-center gap-3">
                                  <div className="p-2 rounded-xl bg-zinc-800/60 border border-zinc-700/30 flex items-center justify-center shrink-0">
                                    <SkillIcon skill={skill} className="w-5 h-5 text-white" />
                                  </div>
                                  <div>
                                    <p
                                      onClick={() => handleSelectSkill(skill)}
                                      className="text-xs font-extrabold text-zinc-200 hover:text-white cursor-pointer hover:underline"
                                    >
                                      {skill.name}
                                    </p>
                                    <p className="text-[10px] text-zinc-500 mt-0.5">
                                      {skill.description}
                                    </p>
                                  </div>
                                </td>
                                <td className="p-4 text-xs font-mono text-zinc-400">
                                  v{skill.version || '1.0.0'}
                                </td>
                                <td className="p-4">
                                  {isCore ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-500/10 text-blue-400 text-[9px] font-bold uppercase tracking-wider rounded-full border border-blue-500/20">
                                      Core
                                    </span>
                                  ) : skill.enabled ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-500/10 text-emerald-400 text-[9px] font-bold uppercase tracking-wider rounded-full border border-emerald-500/20">
                                      <ActiveGlow />
                                      Ativa
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-zinc-900 text-zinc-650 text-[9px] font-bold uppercase tracking-wider rounded-full border border-zinc-850">
                                      Inativa
                                    </span>
                                  )}
                                </td>
                                <td className="p-4 text-right">
                                  <div className="flex items-center justify-end gap-2">
                                    {!isCore && (
                                      <>
                                        <button
                                          onClick={() => handleToggle(skill)}
                                          className={`px-3 py-1.5 rounded-lg border text-[10px] font-bold uppercase tracking-wider transition-all ${
                                            skill.enabled
                                              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
                                              : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200'
                                          }`}
                                        >
                                          {skill.enabled ? 'Desativar' : 'Ativar'}
                                        </button>
                                        <button
                                          onClick={() => handleUninstall(skill)}
                                          className="p-1.5 rounded-lg border border-zinc-700 text-zinc-400 hover:text-red-400 hover:border-red-500/50 hover:bg-red-500/10 transition-all"
                                          title="Desinstalar"
                                        >
                                          <TrashIcon className="w-3.5 h-3.5" />
                                        </button>
                                      </>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-24 text-zinc-600 border border-dashed border-zinc-800 rounded-2xl">
                      <PuzzlePieceIcon className="w-12 h-12 mb-4 opacity-25" />
                      <p className="text-sm font-bold">Nenhuma extensão instalada</p>
                      <p className="text-xs text-zinc-700 mt-1">
                        Navegue pelo catálogo da loja para descobrir e instalar extensões.
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  {/* Store Catalog View */}
                  {browseCategory && browseCatData ? (
                    /* ─── Category Browse View ─── */
                    <div className="animate-fade-in">
                      <button
                        onClick={() => { setBrowseCategory(null); setSearchQuery('') }}
                        className="flex items-center gap-2 text-zinc-400 hover:text-white text-sm font-medium transition-colors mb-5"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                        Voltar
                      </button>

                      <h2 className="text-xl font-bold text-text mb-6">{browseCatData.label}</h2>

                      <div className="flex flex-col md:flex-row gap-6">
                        {/* Category sidebar */}
                        <div className="md:w-48 shrink-0 space-y-1">
                          <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-2">Categorias</p>
                          {categories.map((cat) => {
                            const isActive = cat.id === browseCategory
                            const clr = ({
                              utilities: 'text-amber-400', communication: 'text-emerald-400',
                              system: 'text-blue-400', productivity: 'text-orange-400', ai: 'text-purple-400'
                            } as Record<string, string>)[cat.id] || 'text-zinc-400'
                            return (
                              <button
                                key={cat.id}
                                onClick={() => setBrowseCategory(cat.id)}
                                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all ${
                                  isActive
                                    ? 'bg-zinc-800/80 text-white font-bold'
                                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800/40'
                                }`}
                              >
                                <span className={isActive ? clr : ''}>{cat.label}</span>
                              </button>
                            )
                          })}
                        </div>

                        {/* Grid */}
                        <div className="flex-1 min-w-0">
                        {loading ? (
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
                          </div>
                        ) : (() => {
                          const catList = storeSkills.filter((s) => inferExtensionCategory(s) === browseCategory)
                          const filtered = searchQuery.trim()
                            ? catList.filter((s) =>
                                s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                s.description.toLowerCase().includes(searchQuery.toLowerCase()))
                            : catList
                          return filtered.length > 0 ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                              {filtered.map((skill) => (
                                <SkillCard key={`${skill.id}-${skill.category}`} skill={skill} onSelect={handleSelectSkill} devMode={devMode} />
                              ))}
                            </div>
                          ) : (
                            <div className="flex flex-col items-center justify-center py-20 text-zinc-600">
                              <WrenchIcon className="w-12 h-12 mb-4 opacity-30" />
                              <p className="text-sm font-medium">Nenhuma extensão encontrada</p>
                            </div>
                          )
                        })()}
                        </div>
                      </div>
                    </div>
                  ) : (
                  <>
                  {/* Hero Carousel */}
                  {!loading && !searchQuery && (
                    <HeroCarousel onSelect={(id) => {
                      const ext = allSkills.find((s) => s.id === id)
                      if (ext) handleSelectSkill(ext)
                    }} />
                  )}

                  {/* Category Filters — colored buttons, no border */}
                  {!loading && categories.length > 0 && (
                    <div className="mb-8">
                    <h3 className="text-xl font-bold text-text mb-6">Principais Categorias</h3>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                      {categories.map((cat) => {
                        const style = ({
                          utilities: { bg: 'bg-amber-500/10', text: 'text-amber-400', active: 'bg-amber-500 text-white', icon: 'M21 10.5h.375c.621 0 1.125.504 1.125 1.125v2.25c0 .621-.504 1.125-1.125 1.125H21M4.5 10.5H18M4.5 10.5l2.25-2.25M4.5 10.5l2.25 2.25' },
                          communication: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', active: 'bg-emerald-500 text-white', icon: 'M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z' },
                          system: { bg: 'bg-blue-500/10', text: 'text-blue-400', active: 'bg-blue-500 text-white', icon: 'M9 17.25v1.007a3 3 0 0 1-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0 1 15 18.257V17.25m6-12V15a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 15V5.25m18 0A2.25 2.25 0 0 0 18.75 3H5.25A2.25 2.25 0 0 0 3 5.25m18 0V12a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 12V5.25' },
                          productivity: { bg: 'bg-orange-500/10', text: 'text-orange-400', active: 'bg-orange-500 text-white', icon: 'M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z' },
                          ai: { bg: 'bg-purple-500/10', text: 'text-purple-400', active: 'bg-purple-500 text-white', icon: 'M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z' }
                        } as Record<string, { bg: string; text: string; active: string; icon: string }>)[cat.id] || { bg: 'bg-zinc-800', text: 'text-zinc-400', active: 'bg-zinc-600 text-white', icon: '' }
                        return (
                          <button
                            key={cat.id}
                            onClick={() => setBrowseCategory(cat.id)}
                            className={`flex items-center justify-between px-5 py-4 rounded-xl text-sm font-bold transition-all ${
                              browseCategory === cat.id ? style.active : `${style.bg} ${style.text} hover:brightness-125`
                            }`}
                          >
                            <span>{cat.label}</span>
                            <svg className="w-5 h-5 shrink-0 ml-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d={style.icon} />
                            </svg>
                          </button>
                        )
                      })}
                    </div>
                    </div>
                  )}

                  {/* Per-category sections — top 4 of each */}
                  {!loading && !searchQuery && (() => {
                    const catSections = categories.filter((cat) => {
                      return storeSkills.filter((s) => inferExtensionCategory(s) === cat.id).length > 0
                    })
                    const renderCat = (cat: typeof categories[0], idx: number) => {
                      const catExts = storeSkills.filter((s) => inferExtensionCategory(s) === cat.id).slice(0, 4)
                      return (
                        <div key={cat.id} className="mb-14">
                          <div className="flex items-center justify-between mb-8">
                            <h3 className="text-2xl font-bold text-text">Principais categorias de {cat.label}</h3>
                            <button
                              onClick={() => setBrowseCategory(cat.id)}
                              className="text-xs font-medium text-zinc-500 hover:text-white transition-colors"
                            >
                              Ver todas →
                            </button>
                          </div>
                          <div className="flex gap-3 overflow-x-auto scrollbar-none pb-1">
                            {catExts.map((ext) => (
                              <div key={`${ext.id}-${ext.category || 'community'}`} className="shrink-0 w-72">
                                <SkillCard skill={ext} onSelect={handleSelectSkill} devMode={devMode} />
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    }
                    return (
                      <>
                        {catSections[0] && renderCat(catSections[0], 0)}

                        {/* Open platform section */}
                        <div className="mb-14">
                          <div className="relative rounded-2xl overflow-hidden h-40 md:h-48 bg-zinc-900/80">
                            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.03),transparent_70%)]" />
                            <svg className="absolute -right-6 -top-6 w-48 h-48 text-white/5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="0.5">
                              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                            </svg>
                            <div className="relative z-10 h-full flex flex-col justify-between p-6 md:p-8">
                              <div>
                                <p className="text-sm md:text-base text-zinc-400 max-w-xl leading-relaxed">
                                  O sistema de extensões da MomAI é aberto. Crie suas próprias extensões e compartilhe com a comunidade.
                                </p>
                              </div>
                              <div className="flex items-center justify-between">
                                <a
                                  href="https://github.com/WesleyQDev/MomAI-App"
                                  target="_blank"
                                  rel="noreferrer"
                                  className="px-4 py-2 rounded-full text-xs font-bold bg-zinc-700 text-zinc-200 hover:bg-zinc-600 active:scale-[0.97] transition-all no-underline"
                                >
                                  Saiba mais →
                                </a>
                              </div>
                            </div>
                          </div>
                        </div>

                        {catSections.slice(1).map((cat, i) => renderCat(cat, i + 1))}
                      </>
                    )
                  })()}
                  </>  
                  )}
                </>
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
    </div>
  )
}
