import React, { useState, useCallback } from 'react'
import { API_URL } from '../../constants'

/* ──────────────────────────────────────────────
   Types
   ────────────────────────────────────────────── */

interface BadgeVariant {
  text: string
  variant?: 'success' | 'warning' | 'error' | 'info' | 'default'
}

interface ItemAction {
  type?: 'primary' | 'secondary' | 'ghost'
  icon?: string
  label: string
  endpoint?: string
  payload?: Record<string, unknown>
  actionType?: 'open' | 'navigate' | 'execute' | 'toggle'
}

interface ExtensionItem {
  id?: string
  type?: string
  label: string
  description?: string
  meta?: string
  badge?: BadgeVariant | string
  primaryAction?: ItemAction
  actions?: ItemAction[]
  progress?: number
}

interface ExtensionSection {
  title?: string
  items: ExtensionItem[]
}

interface ExtensionLayout {
  mode?: 'grid' | 'list' | 'single' | 'stats'
  columns?: number
}

interface ExtensionStatus {
  type: 'success' | 'error' | 'info'
  message: string
}

interface ExtensionData {
  extension?: string
  layout?: ExtensionLayout
  header?: {
    icon?: string
    title: string
    subtitle?: string
  }
  sections?: ExtensionSection[]
  items?: ExtensionItem[]
  status?: ExtensionStatus
  footer?: { text?: string; extension?: string }
}

/* ──────────────────────────────────────────────
   SVG Icons
   ────────────────────────────────────────────── */

const IconCheck = ({ className = '' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 6L9 17l-5-5" />
  </svg>
)

const IconFolder = ({ className = '' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
  </svg>
)

const IconFile = ({ className = '' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
  </svg>
)

const IconApp = ({ className = '' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="4" width="16" height="16" rx="2" />
    <path d="M9 9h6v6H9z" />
  </svg>
)

const IconLink = ({ className = '' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </svg>
)

const IconTerminal = ({ className = '' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="4 17 10 11 4 5" />
    <line x1="12" y1="19" x2="20" y2="19" />
  </svg>
)

const IconArrowRight = ({ className = '' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14M12 5l7 7-7 7" />
  </svg>
)

const IconSearch = ({ className = '' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
)

const TYPE_ICON_MAP: Record<string, React.FC<{ className?: string }>> = {
  Pasta: IconFolder,
  Arquivo: IconFile,
  Programa: IconApp,
  Atalho: IconLink,
  CLI: IconTerminal,
}

const TYPE_COLORS: Record<string, string> = {
  Pasta: 'text-zinc-400',
  Arquivo: 'text-zinc-400',
  Programa: 'text-zinc-400',
  Atalho: 'text-zinc-400',
  CLI: 'text-zinc-400',
}

const TYPE_BG_COLORS: Record<string, string> = {
  Pasta: 'bg-zinc-700/30',
  Arquivo: 'bg-zinc-700/30',
  Programa: 'bg-zinc-700/30',
  Atalho: 'bg-zinc-700/30',
  CLI: 'bg-zinc-700/30',
}

/* ──────────────────────────────────────────────
   Helpers
   ────────────────────────────────────────────── */

async function executeAction(
  action: ItemAction,
  onStatus: (s: ExtensionStatus | null) => void
): Promise<boolean> {
  if (!action.endpoint) return false

  try {
    const response = await fetch(`${API_URL}${action.endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(action.payload || {}),
    })
    const result = await response.json()

    if (result.ok) {
      onStatus({ type: 'success', message: result.message || `${action.label} executado com sucesso` })
      return true
    }
    onStatus({ type: 'error', message: result.error || `Erro ao executar ${action.label}` })
    return false
  } catch {
    onStatus({ type: 'error', message: `Erro de conexao` })
    return false
  }
}

function resolveBadge(badge: BadgeVariant | string | undefined): { text: string; className: string } | null {
  if (!badge) return null
  if (typeof badge === 'string') return { text: badge, className: 'text-zinc-400 bg-zinc-700/30' }
  const map: Record<string, string> = {
    success: 'text-zinc-300 bg-zinc-700/30',
    warning: 'text-zinc-300 bg-zinc-700/30',
    error: 'text-zinc-300 bg-zinc-700/30',
    info: 'text-zinc-300 bg-zinc-700/30',
    default: 'text-zinc-400 bg-zinc-700/30',
  }
  return {
    text: badge.text,
    className: map[badge.variant || 'default'] || map.default,
  }
}

/* ──────────────────────────────────────────────
   Success State (minimalist)
   ────────────────────────────────────────────── */

const SuccessState = ({ header }: { header?: ExtensionData['header'] }) => {
  if (!header) return null
  return (
    <div className="flex items-start gap-3 px-1 py-1">
      <div className="mt-0.5 w-6 h-6 rounded-full bg-white/[0.06] flex items-center justify-center shrink-0">
        <IconCheck className="w-3.5 h-3.5 text-white/50" />
      </div>
      <div className="flex-1 min-w-0">
        <h4 className="text-[13px] font-medium text-white/90 leading-snug">
          {header.title}
        </h4>
        {header.subtitle && (
          <p className="mt-0.5 text-[11px] text-white/40 font-mono truncate">
            {header.subtitle}
          </p>
        )}
      </div>
    </div>
  )
}

/* ──────────────────────────────────────────────
   List Item (modern, clean)
   ────────────────────────────────────────────── */

const ExtensionItemRow = ({
  item,
  loadingId,
  onAction,
}: {
  item: ExtensionItem
  loadingId: string | null
  onAction: (action: ItemAction) => void
}) => {
  const badgeInfo = resolveBadge(item.badge)
  const IconComp = TYPE_ICON_MAP[item.type || ''] || IconFile
  const typeColor = TYPE_COLORS[item.type || ''] || 'text-zinc-400'
  const typeBg = TYPE_BG_COLORS[item.type || ''] || 'bg-zinc-800/60'
  const hasPrimary = !!item.primaryAction
  const isLoading = loadingId !== null && hasPrimary

  return (
    <button
      onClick={() => {
        if (hasPrimary && item.primaryAction) {
          onAction(item.primaryAction)
        }
      }}
      disabled={isLoading}
      className={`group flex items-center gap-3 w-full text-left px-2.5 py-2 rounded-lg transition-colors duration-150 ${
        hasPrimary ? 'hover:bg-white/[0.03] cursor-pointer' : 'cursor-default'
      } ${isLoading ? 'opacity-40' : ''}`}
    >
      {/* Icon */}
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${typeBg}`}>
        {isLoading ? (
          <span className="w-3.5 h-3.5 border-[1.5px] border-zinc-600 border-t-zinc-300 rounded-full animate-spin" />
        ) : (
          <IconComp className={`w-4 h-4 ${typeColor}`} />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-medium text-white/90 truncate">
            {item.label}
          </span>
          {badgeInfo && (
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-md shrink-0 ${badgeInfo.className}`}>
              {badgeInfo.text}
            </span>
          )}
        </div>
        {item.description && (
          <p className="text-[11px] text-white/35 truncate mt-0.5 font-mono">
            {item.description}
          </p>
        )}
      </div>

      {/* Arrow */}
      {hasPrimary && (
        <div className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <IconArrowRight className="w-4 h-4 text-white/20" />
        </div>
      )}
    </button>
  )
}

/* ──────────────────────────────────────────────
   Section Block
   ────────────────────────────────────────────── */

const SectionBlock = ({
  section,
  loadingId,
  onAction,
}: {
  section: ExtensionSection
  loadingId: string | null
  onAction: (action: ItemAction) => void
}) => (
  <div className="mb-1 last:mb-0">
    {section.title && (
      <div className="px-3 py-2">
        <h5 className="text-[10px] font-semibold text-white/30 uppercase tracking-widest">
          {section.title}
        </h5>
      </div>
    )}
    <div className="flex flex-col">
      {section.items.map((item, idx) => (
        <ExtensionItemRow
          key={item.id || `${item.label}-${idx}`}
          item={item}
          loadingId={loadingId}
          onAction={onAction}
        />
      ))}
    </div>
  </div>
)

/* ──────────────────────────────────────────────
   Main Component
   ────────────────────────────────────────────── */

interface GenericExtensionCardProps {
  data: ExtensionData
}

const GenericExtensionCard = ({ data }: GenericExtensionCardProps) => {
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [actionStatus, setActionStatus] = useState<ExtensionStatus | null>(null)

  const handleAction = useCallback(
    async (action: ItemAction) => {
      const key = `${action.label}-${Date.now()}`
      setLoadingId(key)
      try {
        await executeAction(action, setActionStatus)
      } finally {
        setLoadingId(null)
      }
    },
    []
  )

  const header = data.header
  const sections = data.sections || []
  const flatItems = data.items || []
  const footer = data.footer
  const itemStatus = data.status

  const hasContent = sections.length > 0 || flatItems.length > 0
  const isSuccessState = itemStatus?.type === 'success' && !hasContent

  /* ── Success-only card (minimal) ── */
  if (isSuccessState) {
    return (
      <div className="my-2">
        <SuccessState header={header} />
      </div>
    )
  }

  /* ── Full card (list/results) ── */
  return (
    <div className="my-2 rounded-2xl bg-zinc-900/90 border border-white/[0.06] overflow-hidden">
      {/* Header */}
      {header && (
        <div className="px-4 pt-4 pb-2">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-white/[0.04] flex items-center justify-center shrink-0">
              <IconSearch className="w-3.5 h-3.5 text-white/30" />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-[13px] font-semibold text-white/90 truncate">
                {header.title}
              </h4>
              {header.subtitle && (
                <p className="text-[11px] text-white/40 mt-0.5">
                  {header.subtitle}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Status after action */}
      {actionStatus && (
        <div className="px-4 pb-2">
          <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium text-white/50 bg-white/[0.04]`}>
            {actionStatus.type === 'success' && <IconCheck className="w-3 h-3" />}
            {actionStatus.message}
          </div>
        </div>
      )}

      {/* Content */}
      {hasContent && (
        <div className="py-1">
          {sections.length > 0 ? (
            <div className="max-h-[280px] overflow-y-auto custom-scrollbar">
              {sections.map((section, idx) => (
                <SectionBlock
                  key={section.title || `section-${idx}`}
                  section={section}
                  loadingId={loadingId}
                  onAction={handleAction}
                />
              ))}
            </div>
          ) : (
            <div className="max-h-[280px] overflow-y-auto custom-scrollbar">
              {flatItems.map((item, idx) => (
                <ExtensionItemRow
                  key={item.id || `${item.label}-${idx}`}
                  item={item}
                  loadingId={loadingId}
                  onAction={handleAction}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!hasContent && !actionStatus && (
        <div className="px-4 py-6 text-center">
          <p className="text-[12px] text-white/20">Nenhum resultado encontrado</p>
        </div>
      )}

      {/* Footer */}
      {(hasContent || header) && footer && (
        <div className="px-4 py-2 border-t border-white/[0.03]">
          <span className="text-[9px] text-white/10 tracking-wide">
            {footer.text || data.extension || ''}
          </span>
        </div>
      )}
    </div>
  )
}

export default GenericExtensionCard
