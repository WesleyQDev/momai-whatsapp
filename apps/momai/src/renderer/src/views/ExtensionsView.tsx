import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react'

/* ─── Hook: Drag to Scroll ─── */
function useDragScroll() {
  const scrollRef = useRef<HTMLDivElement>(null)
  const isDragging = useRef(false)
  const startX = useRef(0)
  const scrollLeft = useRef(0)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    isDragging.current = true
    startX.current = e.pageX
    scrollLeft.current = scrollRef.current?.scrollLeft || 0
    scrollRef.current!.style.cursor = 'grabbing'
    scrollRef.current!.style.userSelect = 'none'
  }, [])

  const handleMouseUp = useCallback(() => {
    isDragging.current = false
    if (scrollRef.current) {
      scrollRef.current.style.cursor = 'grab'
      scrollRef.current.style.userSelect = ''
    }
  }, [])

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging.current) return
    const x = e.pageX
    const walk = (x - startX.current) * 1.5
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = scrollLeft.current - walk
    }
  }, [])

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    startX.current = e.touches[0].pageX
    scrollLeft.current = scrollRef.current?.scrollLeft || 0
  }, [])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const x = e.touches[0].pageX
    const walk = (x - startX.current) * 1.5
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = scrollLeft.current - walk
    }
  }, [])

  useEffect(() => {
    window.addEventListener('mouseup', handleMouseUp)
    window.addEventListener('mousemove', handleMouseMove)
    return () => {
      window.removeEventListener('mouseup', handleMouseUp)
      window.removeEventListener('mousemove', handleMouseMove)
    }
  }, [handleMouseUp, handleMouseMove])

  return {
    scrollRef,
    mouseDown: handleMouseDown,
    mouseUp: handleMouseUp,
    mouseMove: handleMouseMove,
    touchStart: handleTouchStart,
    touchMove: handleTouchMove,
    grabCursor: 'grab'
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
  Extension
} from '../services/api'
import {
  WrenchIcon,
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
  StarIcon,
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
import { useI18n } from '../i18n'

/* ─── Icon Registry ─── */
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
  Wrench: WrenchIcon,
  Star: StarIcon,
  User: UserIcon,
  Tag: TagIcon,
  Bolt: BoltIcon,
  Shield: ShieldCheckIcon
}

function getSkillGradient(name: string) {
  const gradients = [
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
  ]
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return gradients[Math.abs(hash) % gradients.length]
}

function getSkillIcon(name: string) {
  return iconMap[name] || PuzzlePieceIcon
}

/* ─── Star Rating ─── */
function StarRating({ value = 4.8 }: { value?: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <StarIcon
          key={i}
          className={`w-3 h-3 ${i <= Math.round(value) ? 'text-amber-400 fill-amber-400' : 'text-zinc-600'}`}
        />
      ))}
      <span className="text-[10px] text-zinc-500 ml-1 font-medium">{value}</span>
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
  const dragScroll = useDragScroll()
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(true)

  const checkScroll = () => {
    if (!dragScroll.scrollRef.current) return
    const { scrollLeft, scrollWidth, clientWidth } = dragScroll.scrollRef.current
    setCanScrollLeft(scrollLeft > 0)
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 10)
  }

  useEffect(() => {
    checkScroll()
    const el = dragScroll.scrollRef.current
    el?.addEventListener('scroll', checkScroll)
    return () => el?.removeEventListener('scroll', checkScroll)
  }, [skills])

  const scroll = (dir: 'left' | 'right') => {
    dragScroll.scrollRef.current?.scrollBy({ left: dir === 'left' ? -320 : 320, behavior: 'smooth' })
  }

  if (skills.length === 0) return null

  return (
    <div className="relative group">
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
        ref={dragScroll.scrollRef}
        onMouseDown={dragScroll.mouseDown}
        onMouseUp={dragScroll.mouseUp}
        onMouseLeave={dragScroll.mouseUp}
        onMouseMove={dragScroll.mouseMove}
        onTouchStart={dragScroll.touchStart}
        onTouchMove={dragScroll.touchMove}
        className="flex gap-3 overflow-x-auto scrollbar-none pb-1"
        style={{ cursor: dragScroll.grabCursor }}
      >
        {skills.map((skill) => {
          const IconComponent = getSkillIcon(skill.icon || 'PuzzlePiece')
          return (
            <div
              key={skill.id}
              onClick={() => onSelect(skill)}
              className="shrink-0 w-72 h-40 rounded-xl overflow-hidden cursor-pointer group/card relative border border-zinc-700/50 hover:border-zinc-600 transition-all hover:-translate-y-0.5 hover:shadow-lg"
            >
              <div
                className={`absolute inset-0 bg-gradient-to-br ${getSkillGradient(skill.name)} opacity-30`}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 via-zinc-900/40 to-transparent" />
              <div className="absolute inset-0 p-4 flex flex-col justify-between">
                <div className="flex items-start justify-between">
                  <div className="p-2 rounded-lg bg-zinc-800/80 backdrop-blur-sm border border-zinc-700/50">
                    {React.createElement(IconComponent, { className: 'w-5 h-5 text-white' })}
                  </div>
                  {skill.is_official && (
                    <div className="flex items-center gap-1 px-1.5 py-0.5 bg-emerald-500/20 border border-emerald-500/30 rounded text-[9px] text-emerald-400 font-semibold">
                      <CheckBadgeIcon className="w-3 h-3" />
                      Oficial
                    </div>
                  )}
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
  const IconComponent = getSkillIcon(skill.icon || 'PuzzlePiece')
  return (
    <div
      onClick={() => onSelect(skill)}
      className="group bg-zinc-800/60 border border-zinc-700/50 rounded-xl overflow-hidden cursor-pointer hover:border-zinc-600 hover:bg-zinc-800/80 transition-all hover:-translate-y-0.5 hover:shadow-lg"
    >
      <div className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className={`p-2.5 rounded-xl bg-gradient-to-br ${getSkillGradient(skill.name)}`}>
            {React.createElement(IconComponent, { className: 'w-5 h-5 text-white' })}
          </div>
          <div className="flex flex-col items-end gap-1">
            {skill.is_official ? (
              <div className="flex items-center gap-1 px-1.5 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded text-[8px] text-emerald-400 font-semibold">
                <CheckBadgeIcon className="w-3 h-3" />
                Oficial
              </div>
            ) : (
              <div className="px-1.5 py-0.5 bg-amber-500/10 border border-amber-500/20 rounded text-[8px] text-amber-400 font-semibold">
                Terceiro
              </div>
            )}
            {!skill.enabled && (
              <span className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded bg-zinc-700 text-zinc-500">
                Off
              </span>
            )}
          </div>
        </div>
        <h3 className="text-sm font-semibold text-zinc-200 mb-1">{skill.name}</h3>
        <p className="text-[11px] text-zinc-500 line-clamp-2 leading-relaxed mb-3">
          {skill.description}
        </p>
        <div className="flex items-center justify-between pt-2.5 border-t border-zinc-700/50">
          <div className="flex items-center gap-1.5">
            <UserIcon className="w-3 h-3 text-zinc-600" />
            <span className="text-[10px] text-zinc-500">{skill.author || 'Desconhecido'}</span>
          </div>
          <StarRating value={skill.is_official ? 5 : 4.5} />
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
  installing
}: {
  skill: Extension
  onBack: () => void
  onInstall: (s: Extension) => void
  onToggle: (s: Extension) => void
  onUninstall: (s: Extension) => void
  installing: string | null
}) {
  const IconComponent = getSkillIcon(skill.icon || 'PuzzlePiece')
  const isInstalled = skill.category !== 'builtin'
  const isBuiltin = skill.category === 'builtin'

  return (
    <div className="animate-fade-in">
      {/* Banner */}
      <div className="relative -mx-6 -mt-5 mb-6">
        <div className={`h-40 bg-gradient-to-br ${getSkillGradient(skill.name)} opacity-30`} />
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 via-zinc-900/50 to-transparent" />
      </div>

      {/* Back button */}
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-zinc-500 hover:text-zinc-300 text-xs font-medium mb-4 transition-colors"
      >
        <ArrowLeftIcon className="w-4 h-4" />
        Voltar para lista
      </button>

      {/* Title section */}
      <div className="flex items-start gap-4 mb-6">
        <div
          className={`p-3 rounded-2xl bg-gradient-to-br ${getSkillGradient(skill.name)} shadow-lg shrink-0`}
        >
          {React.createElement(IconComponent, { className: 'w-8 h-8 text-white' })}
        </div>
        <div className="flex-1 pt-1">
          <h1 className="text-2xl font-bold text-white">{skill.name}</h1>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-sm text-zinc-400">{skill.author || 'Desconhecido'}</span>
            <span className="text-zinc-700">•</span>
            <span className="text-sm text-zinc-500">v{skill.version || '1.0.0'}</span>
            <StarRating value={skill.is_official ? 5 : 4.5} />
          </div>
        </div>
        {/* Status badge */}
        <div className="shrink-0">
          {isBuiltin ? (
            <div className="px-3 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-[10px] font-semibold text-zinc-400 uppercase tracking-wide">
              Integrada
            </div>
          ) : isInstalled ? (
            <div className="px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-semibold text-emerald-400 uppercase tracking-wide">
              Instalada
            </div>
          ) : (
            <div className="px-3 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-[10px] font-semibold text-zinc-400 uppercase tracking-wide">
              Disponível
            </div>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-3 mb-6">
        {!isBuiltin && !isInstalled ? (
          <button
            onClick={() => onInstall(skill)}
            disabled={installing === skill.id}
            className="flex items-center gap-2 px-6 py-2.5 bg-violet-600 text-white rounded-xl text-sm font-semibold hover:bg-violet-500 disabled:opacity-50 transition-colors"
          >
            {installing === skill.id ? (
              <ArrowPathIcon className="w-4 h-4 animate-spin" />
            ) : (
              <CloudArrowDownIcon className="w-4 h-4" />
            )}
            {installing === skill.id ? 'Instalando...' : 'Instalar'}
          </button>
        ) : (
          <button
            onClick={() => onToggle(skill)}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
              skill.enabled
                ? 'bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20'
                : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20'
            }`}
          >
            <PowerIcon className="w-4 h-4" />
            {skill.enabled ? 'Desativar' : 'Ativar'}
          </button>
        )}
        {!isBuiltin && isInstalled && (
          <button
            onClick={() => onUninstall(skill)}
            className="p-2.5 rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-red-400 hover:border-red-500/30 transition-colors"
          >
            <TrashIcon className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Tags */}
      {skill.tags && skill.tags.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6">
          {skill.tags.map((tag: string) => (
            <span
              key={tag}
              className="px-3 py-1 rounded-full bg-zinc-800 border border-zinc-700 text-xs text-zinc-400 font-medium"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Description */}
      <div className="mb-8">
        <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide mb-3">Sobre</h2>
        <div className="prose prose-invert prose-sm max-w-none prose-headings:text-zinc-200 prose-p:text-zinc-400 prose-a:text-violet-400">
          {skill.manifest?.readme || skill.manifest?.instructions ? (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {skill.manifest?.readme || skill.manifest?.instructions}
            </ReactMarkdown>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-zinc-600">
              <ExclamationCircleIcon className="w-10 h-10 mb-3" />
              <p className="text-sm">Nenhuma documentação detalhada encontrada para esta skill.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ─── Main View ─── */
export default function ExtensionsView() {
  const { t } = useI18n()
  const location = useLocation()
  const [allSkills, setAllSkills] = useState<Extension[]>([])
  const [loading, setLoading] = useState(true)
  const [installing, setInstalling] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'installed' | 'store'>('installed')
  const [selectedSkill, setSelectedSkill] = useState<Extension | null>(null)
  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const tagsDragScroll = useDragScroll()

  const loadData = async () => {
    setLoading(true)
    try {
      const data = await fetchExtensions()
      setAllSkills(data)
    } catch (err) {
      console.error('Erro ao carregar skills:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    const tab = (location.state as any)?.tab
    if (tab === 'store' || tab === 'installed') setActiveTab(tab)
  }, [location.state])

  const handleInstall = async (ext: Extension) => {
    setInstalling(ext.id)
    try {
      await installExtension(ext.id, ext.download_url || '')
      await loadData()
    } catch (err) {
      alert(t('extensions.errors.install', { error: String(err) }))
    } finally {
      setInstalling(null)
    }
  }

  const handleToggle = async (ext: Extension) => {
    try {
      await toggleExtension(ext.id, !ext.enabled)
      await loadData()
    } catch (err) {
      alert(t('extensions.errors.toggle', { error: String(err) }))
    }
  }

  const handleUninstall = async (ext: Extension) => {
    if (!window.confirm(t('extensions.confirmUninstall', { name: ext.name }))) return
    try {
      await uninstallExtension(ext.id)
      setSelectedSkill(null)
      await loadData()
    } catch (err) {
      alert(t('extensions.errors.uninstall', { error: String(err) }))
    }
  }

  const installedSkills = useMemo(
    () => allSkills.filter((s) => s.category !== 'builtin'),
    [allSkills]
  )
  const builtinSkills = useMemo(
    () => allSkills.filter((s) => s.category === 'builtin'),
    [allSkills]
  )
  const storeSkills = useMemo(
    () =>
      allSkills.filter(
        (s) => s.category !== 'builtin' && !installedSkills.some((i) => i.id === s.id)
      ),
    [allSkills, installedSkills]
  )

  const allTags = useMemo(() => {
    const tags = new Set<string>()
    allSkills.forEach((s) => s.tags?.forEach((tag: string) => tags.add(tag)))
    return Array.from(tags).sort()
  }, [allSkills])

  const currentList =
    activeTab === 'installed' ? [...builtinSkills, ...installedSkills] : storeSkills

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
    <div className="flex-1 h-full bg-zinc-900 overflow-hidden flex flex-col">
      {/* ─── Content ─── */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-6 py-5">
          {/* ─── Tabs & Search ─── */}
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-1 p-0.5 bg-zinc-800 rounded-lg border border-zinc-700">
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
            </div>

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
                onClick={loadData}
                className="p-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700 transition-colors"
              >
                <ArrowPathIcon className="w-4 h-4" />
              </button>
            </div>
          </div>
          {selectedSkill ? (
            /* ─── Detail View ─── */
            <SkillDetailView
              skill={selectedSkill}
              onBack={() => setSelectedSkill(null)}
              onInstall={handleInstall}
              onToggle={handleToggle}
              onUninstall={handleUninstall}
              installing={installing}
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
                  <FeaturedCarousel skills={featuredSkills} onSelect={setSelectedSkill} />
                </div>
              )}

              {/* Tag Filters */}
              {allTags.length > 0 && (
                <div
                  ref={tagsDragScroll.scrollRef}
                  onMouseDown={tagsDragScroll.mouseDown}
                  onMouseUp={tagsDragScroll.mouseUp}
                  onMouseLeave={tagsDragScroll.mouseUp}
                  onMouseMove={tagsDragScroll.mouseMove}
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
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {filteredList.map((skill) => (
                    <SkillCard key={skill.id} skill={skill} onSelect={setSelectedSkill} />
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
    </div>
  )
}
