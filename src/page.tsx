import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import QRCode from 'qrcode'
import sdk from 'momai:sdk'
import ContextMenu from './components/ContextMenu'
import MonitoringDropdown from './components/MonitoringDropdown'
import { api } from './services/api'
import { useExtensionEvents } from './hooks/useExtensionEvents'
import { useI18n } from './hooks/useI18n'
import { resolveWhatsAppChannel } from './utils/whatsappChannel'
import { toUnixSeconds, getHistoryMessageKey, mergeHistoryWithServer } from './utils/historySync'
import ImageViewer from 'momai:image-viewer'

const getApiBaseUrl = (): string => {
  const fromHost =
    (window as any)?.momaiAPI?.getApiBaseUrl?.() ||
    (window as any)?.api?.getApiBaseUrl?.()
  if (fromHost) return String(fromHost).replace(/\/+$/, '')
  const fromSdk = (sdk as any)?.API_URL
  if (fromSdk) return String(fromSdk).replace(/\/+$/, '')
  return 'http://127.0.0.1:8050'
}

const getStickerUrl = (filename: string): string => {
  const base = getApiBaseUrl()
  return `${base}/extensions/momai-whatsapp/storage/stickers/${encodeURIComponent(filename)}`
}

interface Message {
  from: string
  jid: string
  text: string
  timestamp: number
  direction: 'incoming' | 'outgoing'
  isGroup?: boolean
  groupName?: string | null
  senderJid?: string
  profilePicUrl?: string | null
  audio?: string
  sticker?: string
  image?: string
  document?: string
  documentName?: string
  video?: string
}

interface ConversationTurn {
  incoming: Message
  replies: Message[]
}

interface ConversationHistoryLine {
  direction: 'incoming' | 'outgoing'
  text: string
  timestamp: number
  from?: string
  audio?: string
  sticker?: string
  image?: string
  document?: string
  documentName?: string
  video?: string
}

interface ConversationSummary {
  jid: string
  turns: ConversationTurn[]
  latestIncoming: Message
  latestReplies: Message[]
  lastMessage: Message
  incomingCount: number
  contactLabel: string
  isGroup: boolean
  groupName: string | null
  profilePicUrl: string | null
}

function normalizeTimestamp(ts: number): number {
  return ts > 1e12 ? ts : ts * 1000
}

function formatTime(ts: number, locale = 'pt-BR'): string {
  const ms = normalizeTimestamp(ts)
  if (!ms || isNaN(ms)) return '--:--'
  return new Date(ms).toLocaleDateString(locale) === new Date().toLocaleDateString(locale)
    ? new Date(ms).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
    : new Date(ms).toLocaleDateString(locale, { day: '2-digit', month: '2-digit' })
}

function buildTurns(sorted: Message[]): ConversationTurn[] {
  const turns: ConversationTurn[] = []
  let current: ConversationTurn | null = null

  for (const msg of sorted) {
    if (msg.direction === 'incoming') {
      if (current) turns.push(current)
      current = { incoming: msg, replies: [] }
    } else if (msg.direction === 'outgoing') {
      if (current) {
        current.replies.push(msg)
      } else {
        current = {
          incoming: {
            from: msg.from || 'Contato',
            jid: msg.jid,
            text: msg.text,
            timestamp: msg.timestamp,
            direction: 'incoming',
            audio: msg.audio,
            sticker: msg.sticker,
            image: msg.image,
            document: msg.document,
            documentName: msg.documentName,
            video: msg.video
          },
          replies: [msg]
        }
      }
    }
  }
  if (current) turns.push(current)

  return turns
}

function turnsToHistoryLines(turns: ConversationTurn[]): ConversationHistoryLine[] {
  const lines: ConversationHistoryLine[] = []
  for (const turn of turns) {
    if (turn.incoming.text || turn.incoming.audio || turn.incoming.sticker || turn.incoming.image || turn.incoming.document || turn.incoming.video) {
      lines.push({
        direction: 'incoming',
        text: turn.incoming.text,
        timestamp: turn.incoming.timestamp,
        from: turn.incoming.from,
        audio: turn.incoming.audio,
        sticker: turn.incoming.sticker,
        image: turn.incoming.image,
        document: turn.incoming.document,
        documentName: turn.incoming.documentName,
        video: turn.incoming.video
      })
    }
    for (const reply of turn.replies) {
      lines.push({
        direction: 'outgoing',
        text: reply.text,
        timestamp: reply.timestamp,
        audio: reply.audio,
        sticker: reply.sticker,
        image: reply.image,
        document: reply.document,
        documentName: reply.documentName,
        video: reply.video
      })
    }
  }
  return lines
}

/** Chave única para agrupar mensagens da mesma conversa (unifica @lid e @s.whatsapp.net de um mesmo contato 1:1) */
function getConversationGroupKey(msg: Message): string {
  const jid = msg.jid || ''
  if (jid.endsWith('@g.us')) return jid

  // Se a mensagem possui replyJid ou senderJid com número de telefone/@s.whatsapp.net, use como chave comum
  const replyJid = (msg as any).replyJid
  if (replyJid && typeof replyJid === 'string' && replyJid.includes('@')) {
    const raw = replyJid.includes(':') ? replyJid.split('@')[0].split(':')[0] + '@' + replyJid.split('@')[1] : replyJid
    return raw
  }

  const senderJid = msg.senderJid
  if (senderJid && typeof senderJid === 'string' && senderJid.includes('@') && !senderJid.endsWith('@g.us')) {
    const raw = senderJid.includes(':') ? senderJid.split('@')[0].split(':')[0] + '@' + senderJid.split('@')[1] : senderJid
    return raw
  }

  // Strip device suffix (e.g. 5511...@s.whatsapp.net)
  if (jid.includes(':') && jid.includes('@')) {
    const [user, domain] = jid.split('@')
    return user.split(':')[0] + '@' + domain
  }

  return jid
}

/** Um card por conversa (jid): preview = última mensagem (recebida ou enviada); histórico completo no overlay. */
function buildConversationSummaries(history: Message[]): ConversationSummary[] {
  const byKey = new Map<string, Message[]>()
  for (const msg of history) {
    const key = getConversationGroupKey(msg)
    const list = byKey.get(key) || []
    list.push(msg)
    byKey.set(key, list)
  }

  const summaries: ConversationSummary[] = []

  for (const [, messages] of byKey) {
    const sorted = [...messages].sort(
      (a, b) => normalizeTimestamp(a.timestamp) - normalizeTimestamp(b.timestamp)
    )
    const turns = buildTurns(sorted)
    if (turns.length === 0) continue

    const latestTurn = turns[turns.length - 1]
    const latestIncoming =
      [...sorted].reverse().find((m) => m.direction === 'incoming') || latestTurn.incoming
    const lastMessage = sorted[sorted.length - 1]
    const profilePicUrl = [...sorted].reverse().find((m) => m.profilePicUrl)?.profilePicUrl || null
    // Escolhe o melhor JID de destino para abrir e responder (prefere @s.whatsapp.net ou @g.us antes de @lid)
    const isGroup = messages.some((m) => m.isGroup || m.jid?.endsWith('@g.us'))
    const groupName = isGroup
      ? ([...sorted].reverse().find((m) => m.groupName)?.groupName ?? latestIncoming.groupName ?? 'Grupo')
      : null
    const contactLabel = isGroup
      ? (groupName || 'Grupo')
      : ([...sorted].reverse().find((m) => m.from && m.from !== 'Você')?.from ||
         latestTurn.incoming.from ||
         'Contato')
    const preferredJid =
      [...sorted]
        .reverse()
        .map((m) => (m as any).replyJid || m.jid)
        .find((j) => typeof j === 'string' && (isGroup ? j.endsWith('@g.us') : j.endsWith('@s.whatsapp.net')) && !j.includes(':')) ||
      lastMessage.jid

    summaries.push({
      jid: preferredJid,
      turns,
      latestIncoming: latestTurn.incoming,
      latestReplies: latestTurn.replies,
      lastMessage,
      incomingCount: turns.length,
      contactLabel,
      isGroup,
      groupName,
      profilePicUrl
    })
  }

  summaries.sort((a, b) => {
    const aLatest = a.turns[a.turns.length - 1]
    const bLatest = b.turns[b.turns.length - 1]
    const aMax = Math.max(
      normalizeTimestamp(aLatest.incoming.timestamp),
      ...aLatest.replies.map((r) => normalizeTimestamp(r.timestamp))
    )
    const bMax = Math.max(
      normalizeTimestamp(bLatest.incoming.timestamp),
      ...bLatest.replies.map((r) => normalizeTimestamp(r.timestamp))
    )
    return bMax - aMax
  })

  return summaries
}

interface Contact {
  id: string
  name: string
  number: string
}

interface WaContact {
  id: string
  displayName: string
  name: string | null
  notify: string | null
  phone: string
  monitoring: boolean
  profilePicUrl?: string | null
}

const getAvatarColor = (id: string) => {
  let hash = 0
  const str = id || 'default'
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  const hue = Math.abs(hash) % 360
  return `hsl(${hue}, 55%, 40%)`
}

const getInitials = (name: string): string => {
  if (!name) return ''
  const clean = name.replace(/[^\p{L}\p{N}\s]/gu, '').trim()
  if (!clean || /^\d+$/.test(clean)) return ''
  const parts = clean.split(/\s+/)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase()
  }
  return parts[0].slice(0, 1).toUpperCase()
}

function WhatsAppIcon({ className = 'w-7 h-7' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        d="M12 2.5C6.753 2.5 2.5 6.753 2.5 12c0 1.7.446 3.296 1.226 4.684L2.5 21.5l4.916-1.29A9.45 9.45 0 0 0 12 21.5c5.247 0 9.5-4.253 9.5-9.5S17.247 2.5 12 2.5z"
        fill="none"
        stroke="#25D366"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path
        d="M16.3 14.66c-.2.56-1.18 1.08-1.64 1.12-.42.04-.96.2-2.78-.52-2.32-.92-3.78-3.28-3.9-3.44-.12-.16-.94-1.24-.94-2.36 0-1.12.58-1.68.8-1.9.2-.22.44-.28.6-.28h.46c.14 0 .34.04.52.48l.92 2.24c.08.2.12.4.02.64-.08.16-.18.36-.3.48-.12.12-.24.26-.1.48.52.88 1.16 1.56 2.06 2.08.22.14.38.08.54-.08.14-.16.66-.76.84-1 .18-.24.36-.2.64-.1.26.1 1.68.8 1.96.94.28.14.48.2.54.32.08.12.08.68-.14 1.28z"
        fill="#25D366"
      />
    </svg>
  )
}

function ContactAvatar({ src, name, id }: { src?: string | null; name: string; id: string }) {
  const [error, setError] = useState(false)
  const [showViewer, setShowViewer] = useState(false)

  useEffect(() => {
    setError(false)
  }, [src])

  if (src && !error) {
    return (
      <>
        <img
          src={src}
          alt={name}
          onError={() => setError(true)}
          className="w-10 h-10 rounded-full object-cover shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
          onClick={(e) => {
            e.stopPropagation()
            setShowViewer(true)
          }}
        />
        {showViewer && <ImageViewer src={src} alt={name} onClose={() => setShowViewer(false)} />}
      </>
    )
  }

  const initials = getInitials(name)
  if (initials) {
    const color = getAvatarColor(id)
    return (
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold text-sm shrink-0"
        style={{ backgroundColor: color }}
      >
        {initials}
      </div>
    )
  }

  const isPhone = /^[+\d\s().-]*$/.test(name)
  const isGroup = id.endsWith('@g.us')
  return (
    <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-lg shrink-0">
      {isGroup ? '👥' : isPhone ? '📱' : '👤'}
    </div>
  )
}

// Fallback labels for tools/params not yet covered by locales; toolLabel/paramLabel prefer t().
const TOOL_LABELS: Record<string, string> = {
  send_message: 'Enviar mensagem',
  list_contacts: 'Listar contatos',
  add_contact: 'Adicionar contato',
  remove_contact: 'Remover contato',
  get_stats: 'Estatísticas',
  get_history: 'Histórico',
  get_wa_contacts: 'Buscar contatos',
  get_wa_groups: 'Buscar grupos'
}

const PARAM_LABELS: Record<string, string> = {
  contact: 'Contato ou número',
  message: 'Mensagem',
  image: 'Imagem',
  media: 'Imagem'
}

const PLACEHOLDERS = [
  { token: '{contact}', label: 'Contato' },
  { token: '{message}', label: 'Texto' },
  { token: '{timestamp}', label: 'Horário' },
  { token: '{isGroup}', label: 'É grupo' },
  { token: '{event.imageDataUri}', label: 'Imagem' }
]

const ENTITY_PARAMS = new Set(['contact'])

interface AutomationWhen {
  contact?: string
  groupName?: string
  isGroup?: string
  startsWith?: string
  endsWith?: string
  contains?: string
}

interface AutomationAction {
  id?: string
  target: string
  tool: string
  args?: Record<string, unknown>
  when?: AutomationWhen
}
interface CatalogParam {
  type?: string
  description?: string
  default?: unknown
  enum?: string[]
}
interface CatalogTool {
  name: string
  description?: string
  parameters?: { properties?: Record<string, CatalogParam> } | null
}
interface CatalogExt {
  id: string
  name?: string
  installed?: boolean
  enabled?: boolean
  tools?: CatalogTool[]
}

function humanizeKey(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

type TranslateFn = (key: string, vars?: Record<string, string | number>) => string

function resolveWithFallback(t: TranslateFn, key: string, fallback: string): string {
  const resolved = t(key)
  return resolved === key ? fallback : resolved
}

function toolLabel(t: TranslateFn, name: string): string {
  return resolveWithFallback(t, `tools.${name}`, TOOL_LABELS[name] || humanizeKey(name))
}

function paramLabel(t: TranslateFn, name: string): string {
  return resolveWithFallback(t, `params.${name}`, PARAM_LABELS[name] || humanizeKey(name))
}

function formatActionArgsI18n(t: TranslateFn, args?: Record<string, unknown>): string {
  if (!args) return ''
  return Object.entries(args)
    .filter(([, v]) => !(typeof v === 'string' && !v.trim()))
    .map(([k, v]) => {
      const val = v && typeof v === 'object' ? JSON.stringify(v) : String(v)
      return `${paramLabel(t, k)}: ${val}`
    })
    .join(' · ')
}

function formatWhenI18n(t: TranslateFn, when?: AutomationWhen): string {
  if (!when) return ''
  const parts: string[] = []
  if (when.contact?.trim()) parts.push(t('automations.contact', { contact: when.contact.trim() }))
  if (when.groupName?.trim()) parts.push(t('automations.group', { group: when.groupName.trim() }))
  if (when.isGroup === 'true') parts.push(t('automations.group_messages'))
  if (when.isGroup === 'false') parts.push(t('automations.direct_messages'))
  if (when.startsWith?.trim()) parts.push(t('automations.starts_with', { text: when.startsWith.trim() }))
  if (when.endsWith?.trim()) parts.push(t('automations.ends_with', { text: when.endsWith.trim() }))
  if (when.contains?.trim()) parts.push(t('automations.contains', { text: when.contains.trim() }))
  return parts.join(', ')
}

// Ao editar uma ação, remove valores que são apenas um placeholder solto de
// outro contexto (ex.: "{event.imageDataUri}") salvos por versões antigas.
const SOLO_PLACEHOLDER = /^\{[a-zA-Z0-9_.]+\}$/
function cleanSavedArgs(args?: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(args || {})) {
    if (typeof v === 'string' && SOLO_PLACEHOLDER.test(v.trim())) continue
    out[k] = v
  }
  return out
}

/**
 * Modal de automações (MOM-115): lê o catálogo de extensões do host e deixa o
 * usuário montar actions (evento → ação) de forma genérica, salvas via
 * set_actions/get_actions.
 */
function AutomationsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n()
  const [catalog, setCatalog] = useState<CatalogExt[]>([])
  const [actions, setActions] = useState<AutomationAction[]>([])
  const [loading, setLoading] = useState(true)
  const [showDraft, setShowDraft] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [target, setTarget] = useState('')
  const [tool, setTool] = useState('')
  const [draftArgs, setDraftArgs] = useState<Record<string, unknown>>({})
  const [draftWhen, setDraftWhen] = useState<AutomationWhen>({})

  const load = () => {
    setLoading(true)
    Promise.all([
      api.get('/extensions'),
      api.post('/extensions/whatsapp/command', { toolName: 'get_actions' })
    ])
      .then(([cat, act]) => {
        const installed = (cat.data || []).filter(
          (e: any) =>
            e.installed !== false &&
            e.enabled !== false &&
            Array.isArray(e.tools) &&
            e.tools.length > 0
        )
        setCatalog(installed)
        setActions(act.data?.actions || [])
        if (installed.length > 0) setTarget((prev) => prev || installed[0].id)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (open) {
      setShowDraft(false)
      setEditingId(null)
      setDraftWhen({})
      setSaveState('idle')
      load()
    }
  }, [open])

  const targetExt = catalog.find((e) => e.id === target)
  const toolDef = targetExt?.tools?.find((t) => t.name === tool)
  const props = toolDef?.parameters?.properties || {}

  function selectTarget(next: string) {
    setTarget(next)
    const ext = catalog.find((e) => e.id === next)
    const first = ext?.tools?.find((t) => t.name !== 'get_actions' && t.name !== 'set_actions') || ext?.tools?.[0]
    setTool(first?.name || '')
    setDraftArgs(first ? defaultArgsFor(first) : {})
  }

  function selectTool(next: string) {
    setTool(next)
    const def = targetExt?.tools?.find((t) => t.name === next)
    setDraftArgs(defaultArgsFor(def))
  }

  function defaultArgsFor(def?: CatalogTool): Record<string, unknown> {
    const out: Record<string, unknown> = {}
    for (const [key, param] of Object.entries(def?.parameters?.properties || {})) {
      const d = param && param.default
      // Não pré-preenche placeholders {token} vindos do schema de outra
      // extensão (ex.: {event.imageDataUri} do Vision).
      out[key] = typeof d === 'string' && d.includes('{') ? '' : (d ?? '')
    }
    return out
  }

  function persist(next: AutomationAction[]) {
    setActions(next)
    setSaveState('saving')
    api
      .post('/extensions/whatsapp/command', { toolName: 'set_actions', args: { actions: next } })
      .then(() => setSaveState('saved'))
      .catch(() => setSaveState('error'))
  }

  function startEdit(a: AutomationAction) {
    setEditingId(a.id || null)
    setTarget(a.target)
    setTool(a.tool)
    setDraftArgs(cleanSavedArgs(a.args))
    setDraftWhen(a.when ? { ...a.when } : {})
    setShowDraft(true)
  }

  function cancelDraft() {
    setShowDraft(false)
    setEditingId(null)
  }

  function saveDraft() {
    if (!target || !tool) return
    const clean: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(draftArgs)) {
      if (typeof value === 'string' && !value.trim()) continue
      clean[key] = value
    }
    const cleanWhen: AutomationWhen = {}
    for (const key of ['contact', 'groupName', 'isGroup', 'startsWith', 'endsWith', 'contains'] as const) {
      const value = draftWhen[key]
      if (typeof value === 'string' && value.trim()) cleanWhen[key] = value.trim()
    }
    const entry: AutomationAction = {
      id: editingId || `act-${Date.now()}`,
      target,
      tool,
      args: Object.keys(clean).length ? clean : undefined,
      when: Object.keys(cleanWhen).length ? cleanWhen : undefined
    }
    const next = editingId
      ? actions.map((a) => (a.id === editingId ? entry : a))
      : [...actions, entry]
    persist(next)
    cancelDraft()
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 bg-zinc-950/60 shrink-0">
          <h2 className="text-base font-bold text-white">{t('page.automations')}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-white rounded-lg p-1.5 hover:bg-white/10 transition-colors"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto custom-scrollbar flex-1">
          <p className="text-xs text-gray-400">
            {t('page.automations_desc')}
          </p>

          {loading ? (
            <p className="text-xs text-gray-500">{t('page.loading_actions')}</p>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-300">{t('page.actions')}</span>
                <button
                  type="button"
                  onClick={showDraft ? cancelDraft : () => setShowDraft(true)}
                  className="text-[11px] font-medium text-emerald-400 hover:text-emerald-300 border border-emerald-500/30 hover:border-emerald-400 px-2.5 py-1 rounded-lg transition-colors"
                >
                  {showDraft ? t('page.cancel') : t('page.add_action')}
                </button>
              </div>

              {actions.length === 0 && !showDraft ? (
                <p className="text-[11px] text-gray-500">
                  {t('page.no_automations', { tokens: PLACEHOLDERS.map((p) => p.token).join(', ') })}{' '}
                  {PLACEHOLDERS.map((p) => p.token).join(', ')}
                </p>
              ) : null}

              {actions.map((a, i) => (
                <div
                  key={a.id || i}
                  className="flex items-start justify-between gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-gray-100">
                      {catalog.find((e) => e.id === a.target)?.name || a.target}
                      <span className="text-gray-400"> / </span>
                      {toolLabel(t, a.tool)}
                    </div>
                    {a.when && Object.keys(a.when).length > 0 ? (
                      <div className="text-[11px] text-emerald-400 truncate">
                        {t('page.when', { condition: formatWhenI18n(t, a.when) })}
                      </div>
                    ) : null}
                    {a.args && Object.keys(a.args).length > 0 ? (
                      <div className="text-[11px] text-gray-500 truncate">{formatActionArgsI18n(t, a.args)}</div>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => startEdit(a)}
                      title={t('page.edit')}
                      aria-label={t('page.edit')}
                      className="text-gray-500 hover:text-emerald-300 text-sm p-0.5"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => persist(actions.filter((_, j) => j !== i))}
                      className="text-gray-500 hover:text-red-400 text-sm"
                      aria-label={t('page.remove')}
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}

              {showDraft ? (
                <div className="space-y-3 bg-white/5 border border-white/10 rounded-xl p-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-400 mb-1">
                      {t('page.trigger_label')}
                    </label>
                    <div className="space-y-2">
                      <div>
                        <label className="block text-[11px] font-semibold text-gray-400 mb-1">{t('page.trigger_contact')}</label>
                        <SearchableInput
                          target="whatsapp"
                          paramKey="contact"
                          value={draftWhen.contact ?? ''}
                          onChange={(v) => setDraftWhen((d) => ({ ...d, contact: v }))}
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-gray-400 mb-1">{t('page.trigger_group')}</label>
                        <input
                          type="text"
                          value={draftWhen.groupName ?? ''}
                          onChange={(e) => setDraftWhen((d) => ({ ...d, groupName: e.target.value }))}
                          placeholder={t('page.trigger_any')}
                          className="w-full bg-zinc-800 border border-white/10 rounded-xl px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-gray-400 mb-1">
                          {t('page.trigger_group_type')}
                        </label>
                        <select
                          value={draftWhen.isGroup ?? ''}
                          onChange={(e) => setDraftWhen((d) => ({ ...d, isGroup: e.target.value }))}
                          className="w-full bg-zinc-800 border border-white/10 rounded-xl px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-emerald-500"
                        >
                          <option value="">{t('page.trigger_any')}</option>
                          <option value="true">{t('page.trigger_groups')}</option>
                          <option value="false">{t('page.trigger_direct')}</option>
                        </select>
                      </div>

                      <div className="pt-1 border-t border-white/5">
                        <label className="block text-[11px] font-semibold text-gray-400 mb-1">
                          {t('page.trigger_starts')}
                        </label>
                        <input
                          type="text"
                          value={draftWhen.startsWith ?? ''}
                          onChange={(e) => setDraftWhen((d) => ({ ...d, startsWith: e.target.value }))}
                          placeholder={t('page.trigger_placeholder_starts')}
                          className="w-full bg-zinc-800 border border-white/10 rounded-xl px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-gray-400 mb-1">
                          {t('page.trigger_ends')}
                        </label>
                        <input
                          type="text"
                          value={draftWhen.endsWith ?? ''}
                          onChange={(e) => setDraftWhen((d) => ({ ...d, endsWith: e.target.value }))}
                          placeholder={t('page.trigger_placeholder_ends')}
                          className="w-full bg-zinc-800 border border-white/10 rounded-xl px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-gray-400 mb-1">
                          {t('page.trigger_contains')}
                        </label>
                        <input
                          type="text"
                          value={draftWhen.contains ?? ''}
                          onChange={(e) => setDraftWhen((d) => ({ ...d, contains: e.target.value }))}
                          placeholder={t('page.trigger_placeholder_contains')}
                          className="w-full bg-zinc-800 border border-white/10 rounded-xl px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-emerald-500"
                        />
                      </div>

                      <p className="text-[10px] text-gray-500">
                        {t('page.trigger_hint')}
                      </p>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-gray-400 mb-1">
                      {t('page.target_ext')}
                    </label>
                    <select
                      value={target}
                      onChange={(e) => selectTarget(e.target.value)}
                      className="w-full bg-zinc-800 border border-white/10 rounded-xl px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-emerald-500"
                    >
                      {catalog.length === 0 ? (
                        <option value="">{t('page.target_none')}</option>
                      ) : null}
                      {catalog.map((ext) => (
                        <option key={ext.id} value={ext.id}>
                          {ext.name || ext.id}
                        </option>
                      ))}
                    </select>
                  </div>

                  {toolDef ? (
                    <>
                      <div>
                        <label className="block text-[11px] font-semibold text-gray-400 mb-1">{t('page.action_label')}</label>
                        <select
                          value={tool}
                          onChange={(e) => selectTool(e.target.value)}
                          className="w-full bg-zinc-800 border border-white/10 rounded-xl px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-emerald-500"
                        >
                          {targetExt?.tools
                            ?.filter((toolItem) => toolItem.name !== 'get_actions' && toolItem.name !== 'set_actions')
                            .map((toolItem) => (
                              <option key={toolItem.name} value={toolItem.name}>
                                {toolLabel(t, toolItem.name)}
                              </option>
                            ))}
                        </select>
                      </div>

                      <div className="space-y-2">
                        {Object.entries(props).map(([key, param]) => (
                          <div key={key}>
                            <label className="block text-[11px] font-semibold text-gray-400 mb-1">
                              {paramLabel(t, key)}
                              {param?.default !== undefined ? t('page.action_prefilled') : ''}
                            </label>
                            {param?.enum ? (
                              <select
                                value={String(draftArgs[key] ?? '')}
                                onChange={(e) => setDraftArgs((d) => ({ ...d, [key]: e.target.value }))}
                                className="w-full bg-zinc-800 border border-white/10 rounded-xl px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-emerald-500"
                              >
                                {param.enum.map((opt) => (
                                  <option key={opt} value={opt}>
                                    {opt}
                                  </option>
                                ))}
                              </select>
                            ) : ENTITY_PARAMS.has(key) ? (
                              <SearchableInput
                                target={target}
                                paramKey={key}
                                value={String(draftArgs[key] ?? '')}
                                onChange={(v) => setDraftArgs((d) => ({ ...d, [key]: v }))}
                              />
                            ) : (
                              <input
                                type="text"
                                value={String(draftArgs[key] ?? '')}
                                onChange={(e) => setDraftArgs((d) => ({ ...d, [key]: e.target.value }))}
                                placeholder={param?.description || ''}
                                className="w-full bg-zinc-800 border border-white/10 rounded-xl px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-emerald-500"
                              />
                            )}
                          </div>
                        ))}
                      </div>

                      <div className="flex flex-wrap gap-1.5">
                        {PLACEHOLDERS.map((p) => (
                          <button
                            key={p.token}
                            type="button"
                            onClick={() =>
                              setDraftArgs((d) => {
                                const firstEmpty = Object.keys(props).find(
                                  (k) => !String(d[k] ?? '').trim()
                                )
                                if (!firstEmpty) return d
                                return { ...d, [firstEmpty]: p.token }
                              })
                            }
                            className="text-[10px] text-gray-400 border border-white/10 hover:border-emerald-500/50 hover:text-emerald-300 rounded-lg px-2 py-0.5 transition-colors"
                          >
                            {p.label} {p.token}
                          </button>
                        ))}
                      </div>

                      <button
                        type="button"
                        onClick={saveDraft}
                        className="text-[11px] font-semibold bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg transition-colors"
                      >
                        {editingId ? t('page.save_changes') : t('page.use_action')}
                      </button>
                    </>
                  ) : null}
                </div>
              ) : null}
            </>
          )}
        </div>

        <div className="px-5 py-3 border-t border-white/10 shrink-0 flex items-center justify-between gap-2">
          <span
            className={`text-[11px] ${saveState === 'error' ? 'text-red-400' : saveState === 'saved' ? 'text-emerald-400' : 'text-gray-500'}`}
          >
            {saveState === 'saving'
              ? t('page.saving')
              : saveState === 'saved'
                ? t('page.saved')
                : saveState === 'error'
                  ? t('page.save_error')
                  : t('page.auto_save')}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2 rounded-xl transition-colors"
          >
            {t('panel.close')}
          </button>
        </div>
      </div>
    </div>
  )
}

function SearchableInput({
  paramKey,
  target,
  value,
  onChange
}: {
  paramKey: string
  target: string
  value: string
  onChange: (v: string) => void
}) {
  const { t } = useI18n()
  const [options, setOptions] = useState<string[]>([])
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    const listTool = paramKey === 'contact' ? 'get_wa_contacts' : null
    if (!listTool) return
    api
      .post(`/extensions/${target}/command`, { toolName: listTool, args: {} })
      .then((res: any) => {
        if (cancelled || !res.ok) return
        const items = res.data?.contacts
        const names = (items || [])
          .map((c: any) => c.name || c.notify || c.phone || '')
          .filter(Boolean) as string[]
        setOptions(Array.from(new Set(names)))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [paramKey, target])

  const filtered = value.trim()
    ? options.filter((o) => o.toLowerCase().includes(value.toLowerCase()))
    : options

  return (
    <div className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={options.length > 0 ? t('page.contact_placeholder_search') : t('page.contact_placeholder_number')}
        className="w-full bg-zinc-800 border border-white/10 rounded-xl px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-emerald-500"
      />
      {open && filtered.length > 0 ? (
        <div className="absolute z-20 mt-1 w-full max-h-40 overflow-y-auto bg-zinc-800 border border-white/10 rounded-xl shadow-xl custom-scrollbar">
          {filtered.slice(0, 30).map((opt) => (
            <button
              key={opt}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault()
                onChange(opt)
                setOpen(false)
              }}
              className="block w-full text-left px-3 py-1.5 text-xs text-gray-200 hover:bg-emerald-500/10 hover:text-emerald-300 transition-colors"
            >
              {opt}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

const LOCAL_STORAGE_SESSION_KEY = 'momai_whatsapp_has_session'
const LOCAL_STORAGE_STATS_KEY = 'momai_whatsapp_cached_stats'
const LOCAL_STORAGE_HISTORY_KEY = 'momai_whatsapp_cached_history'
const LOCAL_STORAGE_CONTACTS_KEY = 'momai_whatsapp_cached_contacts'
const LOCAL_STORAGE_GROUPS_KEY = 'momai_whatsapp_cached_groups'

function getInitialHasSession(): boolean {
  try {
    return localStorage.getItem(LOCAL_STORAGE_SESSION_KEY) === 'true'
  } catch {
    return false
  }
}

function getInitialCachedStats() {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_STATS_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return { totalMessages: 0, monitoredCount: 0, syncedContacts: 0 }
}

function getInitialCachedHistory(): Message[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_HISTORY_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return []
}

function getInitialCachedContacts(): WaContact[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_CONTACTS_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return []
}

function getInitialCachedGroups(): WaContact[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_GROUPS_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return []
}

const _initialStats = getInitialCachedStats()

const CONNECTED_HISTORY_POLL_MS = 10_000

// Module-level cache: survives component re-mounts (tab switches) so the UI
// never flashes the QR screen or empty lists when the user returns to an already-connected
// session. Cleared only on explicit disconnect / logged_out.
const _stateCache = {
  connected: getInitialHasSession(),
  hasCredentials: getInitialHasSession(),
  totalMessages: _initialStats.totalMessages,
  syncedContacts: _initialStats.syncedContacts,
  monitoredCount: _initialStats.monitoredCount,
  history: getInitialCachedHistory(),
  paginatedContacts: getInitialCachedContacts(),
  paginatedGroups: getInitialCachedGroups(),
  avatars: {} as Record<string, string | null>,
  statsLoaded: false
}

export default function WhatsAppView() {
  const { locale, t } = useI18n()
  const [connected, _setConnected] = useState(_stateCache.connected)
  const [totalMessages, setTotalMessages] = useState(_stateCache.totalMessages)
  const [syncedContacts, setSyncedContacts] = useState(_stateCache.syncedContacts)
  const [monitoredCount, setMonitoredCount] = useState(_stateCache.monitoredCount)
  const [history, _setHistory] = useState<Message[]>(_stateCache.history)
  const [qrUrl, setQrUrl] = useState<string | null>(null)
  const [statsLoaded, setStatsLoaded] = useState(_stateCache.statsLoaded)
  const [hasCredentials, _setHasCredentials] = useState(_stateCache.hasCredentials)
  const [pairingActive, setPairingActive] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'reconnecting' | 'disconnected'>(
    _stateCache.connected ? 'connected' : 'disconnected'
  )
  const [showQrFallback, setShowQrFallback] = useState(
    !_stateCache.hasCredentials && !_stateCache.connected
  )
  const disconnectGraceTimerRef = useRef<NodeJS.Timeout | null>(null)
  const pendingQrRef = useRef<string | null>(null)
  const connectedAtRef = useRef<number>(0)

  // Wrappers that also update the module-level cache and localStorage
  const setConnected = useCallback((v: boolean) => {
    _stateCache.connected = v
    _setConnected(v)
  }, [])

  const setHasCredentials = useCallback((v: boolean) => {
    _stateCache.hasCredentials = v
    _setHasCredentials(v)
    try {
      if (v) {
        localStorage.setItem(LOCAL_STORAGE_SESSION_KEY, 'true')
      } else {
        localStorage.removeItem(LOCAL_STORAGE_SESSION_KEY)
      }
    } catch {}
  }, [])

  const setHistory = useCallback((action: Message[] | ((prev: Message[]) => Message[])) => {
    _setHistory((prev) => {
      const next = typeof action === 'function' ? action(prev) : action
      _stateCache.history = next
      try {
        localStorage.setItem(LOCAL_STORAGE_HISTORY_KEY, JSON.stringify(next.slice(0, 100)))
      } catch {}
      return next
    })
  }, [])

  const clearDisconnectGraceTimer = useCallback(() => {
    if (disconnectGraceTimerRef.current) {
      clearTimeout(disconnectGraceTimerRef.current)
      disconnectGraceTimerRef.current = null
    }
  }, [])

  const qrRequestInFlight = useRef(false)
  const editingNameRef = useRef<string | null>(null)
  const [editingName, setEditingName] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [monitoringOverrides, setMonitoringOverrides] = useState<Record<string, boolean>>({})
  const [syncing, setSyncing] = useState(false)
  const syncingRef = useRef(false)

  const handleStartEdit = useCallback((id: string, initialValue: string) => {
    editingNameRef.current = id
    setEditingName(id)
    setEditValue(initialValue)
  }, [])

  const handleCancelEdit = useCallback(() => {
    editingNameRef.current = null
    setEditingName(null)
  }, [])

  const handleDeleteConversation = useCallback(async (convoJid: string) => {
    try {
      await api.post('/extensions/whatsapp/command', {
        toolName: 'delete_message',
        args: { jid: convoJid }
      })
      setHistory((prev) => {
        const targetConvos = buildConversationSummaries(prev)
        const targetConvo = targetConvos.find((c) => c.jid === convoJid)
        if (targetConvo) {
          const matchingKeys = new Set(
            targetConvo.turns.flatMap((t) => [
              getConversationGroupKey(t.incoming),
              ...t.replies.map(getConversationGroupKey)
            ])
          )
          return prev.filter((m) => !matchingKeys.has(getConversationGroupKey(m)) && m.jid !== convoJid)
        }
        return prev.filter((m) => m.jid !== convoJid)
      })
    } catch (err) {
      console.error('[whatsapp] delete conversation failed:', err)
    }
  }, [setHistory])

  useEffect(() => {
    syncingRef.current = syncing
  }, [syncing])

  // Paginated contacts state
  const [contactsPage, setContactsPage] = useState(1)
  const [contactsPerPage] = useState(10)
  const [contactSearch, setContactSearch] = useState('')
  const [paginatedContacts, _setPaginatedContacts] = useState<WaContact[]>(_stateCache.paginatedContacts)
  const [totalFilteredContacts, setTotalFilteredContacts] = useState(0)
  const [contactsTotalPages, setContactsTotalPages] = useState(1)
  const [contactsLoading, setContactsLoading] = useState(false)

  const [groupsPage, setGroupsPage] = useState(1)
  const [groupsPerPage] = useState(10)
  const [groupSearch, setGroupSearch] = useState('')
  const [paginatedGroups, _setPaginatedGroups] = useState<WaContact[]>(_stateCache.paginatedGroups)
  const [totalFilteredGroups, setTotalFilteredGroups] = useState(0)
  const [groupsTotalPages, setGroupsTotalPages] = useState(1)
  const [groupsLoading, setGroupsLoading] = useState(false)
  const [avatarsRefreshing, setAvatarsRefreshing] = useState(false)
  const [avatarByJid, setAvatarByJid] = useState<Record<string, string | null>>({})
  const [conversationsPage, setConversationsPage] = useState(1)
  const [conversationsPerPage] = useState(10)
  const [notificationsDisabled, setNotificationsDisabled] = useState(false)
  const [showNotificationDropdown, setShowNotificationDropdown] = useState(false)
  const notificationDropdownRef = useRef<HTMLDivElement>(null)
  const [showAutomations, setShowAutomations] = useState(false)
  const [listMenu, setListMenu] = useState<{
    x: number
    y: number
    kind: 'conversation' | 'group' | 'contact'
    id: string
    label: string
    preview?: string
  } | null>(null)

  const setPaginatedContacts = useCallback(
    (action: WaContact[] | ((prev: WaContact[]) => WaContact[])) => {
      _setPaginatedContacts((prev) => {
        const next = typeof action === 'function' ? action(prev) : action
        _stateCache.paginatedContacts = next
        try {
          localStorage.setItem(LOCAL_STORAGE_CONTACTS_KEY, JSON.stringify(next.slice(0, 50)))
        } catch {}
        return next
      })
    },
    []
  )

  const setPaginatedGroups = useCallback(
    (action: WaContact[] | ((prev: WaContact[]) => WaContact[])) => {
      _setPaginatedGroups((prev) => {
        const next = typeof action === 'function' ? action(prev) : action
        _stateCache.paginatedGroups = next
        try {
          localStorage.setItem(LOCAL_STORAGE_GROUPS_KEY, JSON.stringify(next.slice(0, 50)))
        } catch {}
        return next
      })
    },
    []
  )

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        notificationDropdownRef.current &&
        !notificationDropdownRef.current.contains(event.target as Node)
      ) {
        setShowNotificationDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Load notifications state
  useEffect(() => {
    api
      .post('/extensions/whatsapp/command', { toolName: 'get_settings' })
      .then((res: any) => {
        const data = res.data
        if (data?.settings?.notificationsDisabled !== undefined) {
          setNotificationsDisabled(data.settings.notificationsDisabled)
        }
      })
      .catch(() => {})
  }, [])

  const toggleNotifications = async () => {
    const newState = !notificationsDisabled
    setNotificationsDisabled(newState)
    try {
      await api.post('/extensions/whatsapp/command', {
        toolName: 'update_settings',
        args: { notificationsDisabled: newState }
      })
    } catch {
      setNotificationsDisabled(!newState)
    }
  }

  const allConversations = useMemo(() => {
    return buildConversationSummaries(history).map((c) => ({
      ...c,
      profilePicUrl: avatarByJid[c.jid] ?? c.profilePicUrl ?? null
    }))
  }, [history, avatarByJid])

  const conversationsTotalPages = Math.max(
    1,
    Math.ceil(allConversations.length / conversationsPerPage)
  )

  const conversations = useMemo(() => {
    const start = (conversationsPage - 1) * conversationsPerPage
    return allConversations.slice(start, start + conversationsPerPage)
  }, [allConversations, conversationsPage, conversationsPerPage])

  useEffect(() => {
    if (conversationsPage > conversationsTotalPages) {
      setConversationsPage(conversationsTotalPages)
    }
  }, [conversationsPage, conversationsTotalPages])

  const applyQrString = useCallback((qr: string) => {
    QRCode.toDataURL(qr, { width: 256, margin: 1 })
      .then(setQrUrl)
      .catch(() => {})
  }, [])

  const requestQr = useCallback(
    async (opts?: { force?: boolean }): Promise<boolean> => {
      if (qrRequestInFlight.current) return false
      qrRequestInFlight.current = true
      try {
        // Default `force` to false. The worker only wipes the auth dir when
        // `force: true` is explicitly passed (e.g. an explicit "Reset session"
        // button). Auto-pairing (beginPairing) must NOT wipe, otherwise we
        // delete the Baileys creds the worker just decrypted and the user
        // gets a QR on every page open. The worker now self-heals on
        // `loggedOut` (background-worker.js) so the QR appears when the
        // session is genuinely invalid.
        const { data } = await api.post('/extensions/whatsapp/command', {
          toolName: 'request_qr',
          args: { force: opts?.force ?? false }
        })
        if (data?.qr) {
          applyQrString(data.qr)
          return true
        }
        return false
      } catch {
        return false
      } finally {
        qrRequestInFlight.current = false
      }
    },
    [applyQrString]
  )

  const startDisconnectGraceTimer = useCallback(() => {
    if (disconnectGraceTimerRef.current) return
    disconnectGraceTimerRef.current = setTimeout(() => {
      disconnectGraceTimerRef.current = null
      setShowQrFallback(true)
      setConnectionStatus('disconnected')
      if (pendingQrRef.current) {
        applyQrString(pendingQrRef.current)
      } else {
        requestQr().catch(() => {})
      }
    }, 60_000)
  }, [applyQrString, requestQr])

  const beginPairing = useCallback(() => {
    clearDisconnectGraceTimer()
    pendingQrRef.current = null
    setShowQrFallback(true)
    setPairingActive(true)
    setHasCredentials(false)
    _stateCache.connected = false
    _stateCache.hasCredentials = false
    _stateCache.totalMessages = 0
    _stateCache.monitoredCount = 0
    _stateCache.syncedContacts = 0
    _stateCache.history = []
    _stateCache.paginatedContacts = []
    _stateCache.paginatedGroups = []
    _stateCache.statsLoaded = false
    try {
      localStorage.removeItem(LOCAL_STORAGE_SESSION_KEY)
      localStorage.removeItem(LOCAL_STORAGE_STATS_KEY)
      localStorage.removeItem(LOCAL_STORAGE_HISTORY_KEY)
      localStorage.removeItem(LOCAL_STORAGE_CONTACTS_KEY)
      localStorage.removeItem(LOCAL_STORAGE_GROUPS_KEY)
    } catch {}
    setQrUrl(null)
    qrRequestInFlight.current = false
    // No `force: true` — see comment in requestQr above.
    requestQr().catch(() => {})
  }, [clearDisconnectGraceTimer, requestQr, setHasCredentials])

  const loadAvatars = useCallback(async (jids: string[], opts?: { force?: boolean }) => {
    const unique = [...new Set(jids.filter((j) => typeof j === 'string' && j.includes('@')))]
    if (unique.length === 0) return
    const toFetch = opts?.force
      ? unique
      : unique.filter((jid) => !_stateCache.avatars || !_stateCache.avatars[jid])
    if (toFetch.length === 0) return

    for (let i = 0; i < toFetch.length; i += 25) {
      const batch = toFetch.slice(i, i + 25)
      try {
        const { data } = await api.post('/extensions/whatsapp/command', {
          toolName: 'get_avatars',
          args: { jids: batch, force: opts?.force === true }
        })
        if (data?.avatars) {
          if (!_stateCache.avatars) _stateCache.avatars = {}
          Object.assign(_stateCache.avatars, data.avatars)
          setAvatarByJid((prev) => ({ ...prev, ...data.avatars }))
        }
      } catch {}
      if (i + 25 < toFetch.length) {
        await new Promise((r) => setTimeout(r, 40))
      }
    }
  }, [])

  const loadStats = useCallback(async () => {
    try {
      const { data } = await api.post('/extensions/whatsapp/command', {
        toolName: 'get_stats',
        args: {}
      })
      if (!data) return
      if (data.ok === false) return
      const isConnected = Boolean(data.connected)
      const hasCreds = Boolean(data.hasCredentials)
      const recentlyConnected = Date.now() - connectedAtRef.current < 15000
      if (isConnected) {
        clearDisconnectGraceTimer()
        setConnected(true)
        setPairingActive(false)
        setConnectionStatus('connected')
        setShowQrFallback(false)
        setQrUrl(null)
        pendingQrRef.current = null
        setHasCredentials(true)
      } else if (recentlyConnected) {
        // Keep active connection state: Baileys is still finishing handshake / writing creds
        setConnected(true)
        setPairingActive(false)
        setHasCredentials(true)
        setShowQrFallback(false)
      } else if (hasCreds || hasCredentials) {
        setConnected(false)
        setPairingActive(false)
        setShowQrFallback(false)
        setHasCredentials(true)
        setConnectionStatus((prev) => (prev === 'connected' ? 'reconnecting' : prev))
        startDisconnectGraceTimer()
      } else if (!hasCreds && !hasCredentials) {
        setConnected(false)
        setHasCredentials(false)
        setShowQrFallback(true)
        setConnectionStatus('disconnected')
      }
      const msgs = data.totalMessages || 0
      const synced = data.syncedContacts || 0
      const monitored = data.monitoredCount || 0
      setTotalMessages(msgs)
      setSyncedContacts(synced)
      setMonitoredCount(monitored)
      // Update module-level cache and localStorage so tab switches & app restarts are instant
      _stateCache.totalMessages = msgs
      _stateCache.syncedContacts = synced
      _stateCache.monitoredCount = monitored
      _stateCache.statsLoaded = true
      try {
        localStorage.setItem(
          LOCAL_STORAGE_STATS_KEY,
          JSON.stringify({ totalMessages: msgs, monitoredCount: monitored, syncedContacts: synced })
        )
      } catch {}
      if (data.qr) {
        pendingQrRef.current = data.qr
        if (showQrFallback || pairingActive) {
          applyQrString(data.qr)
        }
      }
    } catch {
    } finally {
      setStatsLoaded(true)
    }
  }, [
    clearDisconnectGraceTimer,
    startDisconnectGraceTimer,
    showQrFallback,
    pairingActive,
    applyQrString,
    hasCredentials,
    setConnected,
    setHasCredentials
  ])

  const loadHistory = useCallback(async () => {
    try {
      const { data } = await api.post('/extensions/whatsapp/command', {
        toolName: 'get_history',
        args: {}
      })
      if (data?.history) {
        const serverHistory = data.history as Message[]
        setHistory((prev) => mergeHistoryWithServer(prev, serverHistory))
        const jids = [
          ...new Set(serverHistory.map((m: Message) => m.jid).filter(Boolean))
        ] as string[]
        loadAvatars(jids)
      }
    } catch {}
  }, [loadAvatars, setHistory])

  const loadPaginatedContacts = useCallback(
    async (page: number, search: string) => {
      setContactsLoading(true)
      try {
        const { data } = await api.post('/extensions/whatsapp/command', {
          toolName: 'get_wa_contacts',
          args: {
            page,
            perPage: contactsPerPage,
            search: search.trim()
          }
        })
        if (data?.contacts) {
          setPaginatedContacts(data.contacts)
          setTotalFilteredContacts(data.totalFiltered || 0)
          setContactsTotalPages(data.totalPages || 1)
          const ids = (data.contacts as WaContact[]).map((c) => c.id).filter(Boolean)
          if (ids.length > 0) void loadAvatars(ids)
        }
        return data
      } catch {
        return null
      } finally {
        setContactsLoading(false)
      }
    },
    [contactsPerPage, loadAvatars]
  )

  const loadPaginatedGroups = useCallback(
    async (page: number, search: string) => {
      setGroupsLoading(true)
      try {
        const { data } = await api.post('/extensions/whatsapp/command', {
          toolName: 'get_wa_groups',
          args: {
            page,
            perPage: groupsPerPage,
            search: search.trim()
          }
        })
        if (data?.contacts) {
          setPaginatedGroups(data.contacts)
          setTotalFilteredGroups(data.totalFiltered || 0)
          setGroupsTotalPages(data.totalPages || 1)
          const ids = (data.contacts as WaContact[]).map((c) => c.id).filter(Boolean)
          if (ids.length > 0) void loadAvatars(ids)
        }
        return data
      } catch {
        return null
      } finally {
        setGroupsLoading(false)
      }
    },
    [groupsPerPage, loadAvatars]
  )

  // Força o refetch de TODAS as fotos de perfil (grupos + contatos + conversas)
  // e atualiza a UI ao final. Único caminho para sincronizar avatares após a
  // primeira sincronização.
  const refreshAvatars = useCallback(async () => {
    if (avatarsRefreshing) return
    setAvatarsRefreshing(true)
    try {
      const jids = [
        ...new Set(
          [
            ...paginatedGroups.map((g) => g.id),
            ...paginatedContacts.map((c) => c.id),
            ...allConversations.map((c) => c.jid)
          ].filter((j): j is string => typeof j === 'string' && j.includes('@'))
        )
      ]
      await loadAvatars(jids, { force: true })
      // Recarrega as listas para refletir as novas fotos
      await Promise.all([
        loadPaginatedGroups(groupsPage, groupSearch),
        loadPaginatedContacts(contactsPage, contactSearch)
      ])
    } catch {
    } finally {
      setAvatarsRefreshing(false)
    }
  }, [
    avatarsRefreshing,
    paginatedGroups,
    paginatedContacts,
    allConversations,
    loadAvatars,
    loadPaginatedGroups,
    loadPaginatedContacts,
    groupsPage,
    groupSearch,
    contactsPage,
    contactSearch
  ])

  const tryFinishContactSync = useCallback(
    async (reportedCount?: number, isFinal?: boolean) => {
      if (reportedCount === 0 || isFinal) {
        setSyncing(false)
        return
      }
      const [data] = await Promise.all([
        loadPaginatedContacts(contactsPage, contactSearch),
        loadPaginatedGroups(groupsPage, groupSearch)
      ])
      const total = data?.totalFiltered ?? 0
      const pageCount = data?.contacts?.length ?? 0
      if (pageCount > 0 || total === 0) {
        // If not final, only stop if we're not also waiting for the 10s timer
        // For now, let's just rely on isFinal or reportedCount === 0
        if (isFinal) setSyncing(false)
      }
    },
    [
      loadPaginatedContacts,
      loadPaginatedGroups,
      contactsPage,
      contactSearch,
      groupsPage,
      groupSearch
    ]
  )

  const refresh = useCallback(async () => {
    await Promise.all([
      loadStats(),
      loadHistory(),
      loadPaginatedContacts(contactsPage, contactSearch),
      loadPaginatedGroups(groupsPage, groupSearch)
    ])
  }, [
    loadStats,
    loadHistory,
    loadPaginatedContacts,
    loadPaginatedGroups,
    contactsPage,
    contactSearch,
    groupsPage,
    groupSearch
  ])

  const handleSync = useCallback(async () => {
    if (syncing) return
    setSyncing(true)
    try {
      const { data } = await api.post('/extensions/whatsapp/command', {
        toolName: 'sync_contacts',
        args: {}
      })
      if (data?.syncedContacts !== undefined) {
        setSyncedContacts(data.syncedContacts)
      }
      // Reload all UI data after sync completes
      await Promise.all([
        loadStats(),
        loadPaginatedContacts(contactsPage, contactSearch),
        loadPaginatedGroups(groupsPage, groupSearch)
      ])
    } catch {
    } finally {
      setSyncing(false)
    }
  }, [syncing, loadStats, loadPaginatedContacts, loadPaginatedGroups, contactsPage, contactSearch, groupsPage, groupSearch])

  const toggleMonitoring = async (contactId: string) => {
    try {
      const { data } = await api.post('/extensions/whatsapp/command', {
        toolName: 'toggle_monitoring',
        args: { contact: contactId }
      })
      if (data?.ok) {
        const updater = (prev: WaContact[]) =>
          prev.map((c) => (c.id === contactId ? { ...c, monitoring: data.monitoring } : c))
        setPaginatedContacts(updater)
        setPaginatedGroups(updater)
        setMonitoringOverrides((prev) => ({ ...prev, [contactId]: data.monitoring }))
        loadStats()
      }
    } catch {}
  }

  const resolveMonitoring = (jid: string): boolean => {
    if (!jid) return true
    const override = monitoringOverrides[jid]
    if (override !== undefined) return override
    const pool = jid.endsWith('@g.us') ? paginatedGroups : paginatedContacts
    const direct = pool.find((c) => c.id === jid)?.monitoring
    if (direct !== undefined) return direct
    const digits = jid.split('@')[0].replace(/\D/g, '')
    if (digits) {
      const hit = pool.find((c) => {
        const candidate = c.id.split('@')[0].replace(/\D/g, '')
        return candidate.length > 0 && (candidate.endsWith(digits) || digits.endsWith(candidate))
      })
      if (hit?.monitoring !== undefined) return hit.monitoring
    }
    return true
  }

  const saveContactName = async (targetJidOrPhone: string) => {
    if (editingNameRef.current !== targetJidOrPhone) return
    editingNameRef.current = null
    setEditingName(null)

    const trimmed = editValue.trim()
    if (!trimmed) return

    const cleanKey = targetJidOrPhone.split('@')[0].replace(/\D/g, '')
    const jid = targetJidOrPhone.includes('@') ? targetJidOrPhone : `${cleanKey}@s.whatsapp.net`

    // Optimistic UI update
    setHistory((prev) =>
      prev.map((m) => {
        const match =
          m.jid === targetJidOrPhone ||
          m.jid === jid ||
          m.senderJid === targetJidOrPhone ||
          m.senderJid === jid ||
          (cleanKey && (m.jid?.split('@')[0] === cleanKey || m.senderJid?.split('@')[0] === cleanKey))
        if (match) {
          return {
            ...m,
            from: trimmed,
            contactName: trimmed,
            groupName: m.isGroup ? trimmed : m.groupName
          }
        }
        return m
      })
    )
    setPaginatedContacts((prev) =>
      prev.map((c) =>
        c.id === targetJidOrPhone || c.id === jid || (cleanKey && (c.phone === cleanKey || c.id?.split('@')[0] === cleanKey))
          ? { ...c, displayName: trimmed, hasName: true }
          : c
      )
    )
    setPaginatedGroups((prev) =>
      prev.map((c) =>
        c.id === targetJidOrPhone || c.id === jid || (cleanKey && c.id?.split('@')[0] === cleanKey)
          ? { ...c, displayName: trimmed, hasName: true }
          : c
      )
    )

    try {
      await api.post('/extensions/whatsapp/command', {
        toolName: 'set_contact_name',
        args: { contact: targetJidOrPhone, name: trimmed }
      })
      await refresh()
    } catch {}
  }

  const disconnect = useCallback(async () => {
    clearDisconnectGraceTimer()
    pendingQrRef.current = null
    setShowQrFallback(true)
    setConnectionStatus('disconnected')
    setPairingActive(true)
    setHasCredentials(false)
    setConnected(false)
    setHistory([])
    setPaginatedContacts([])
    setPaginatedGroups([])
    setTotalMessages(0)
    setMonitoredCount(0)
    setSyncedContacts(0)
    setQrUrl(null)
    beginPairing()
    try {
      await api.post('/extensions/whatsapp/command', {
        toolName: 'disconnect',
        args: {}
      })
    } catch {}
  }, [beginPairing, clearDisconnectGraceTimer, setHistory, setConnected, setHasCredentials])

  const [generatingQr, setGeneratingQr] = useState(false)

  const reconnect = useCallback(async () => {
    setGeneratingQr(true)
    clearDisconnectGraceTimer()
    setShowQrFallback(true)
    try {
      beginPairing()
      setConnected(false)
      const res = await api.post('/extensions/whatsapp/command', {
        toolName: 'request_qr',
        args: { force: true }
      }).catch(() => null)
      if (res?.data?.qr) {
        pendingQrRef.current = res.data.qr
        applyQrString(res.data.qr)
      }
    } catch {} finally {
      setGeneratingQr(false)
    }
  }, [beginPairing, applyQrString, clearDisconnectGraceTimer, setConnected])

  const openConversationOverlay = useCallback((convo: ConversationSummary) => {
    const { jid, latestIncoming: contextMsg, turns } = convo
    if (!jid) return

    const isGroupChat = jid.endsWith('@g.us')
    const replyJid =
      !isGroupChat && contextMsg.senderJid && !contextMsg.senderJid.endsWith('@g.us')
        ? contextMsg.senderJid
        : jid
    const { contactJid, isGroup, groupName } = resolveWhatsAppChannel({
      contactJid: replyJid,
      isGroup: isGroupChat,
      groupName: isGroupChat ? contextMsg.groupName : undefined
    })
    const conversationHistory = turnsToHistoryLines(turns)

    const contactAvatar =
      convo.profilePicUrl ||
      avatarByJid[jid] ||
      avatarByJid[replyJid] ||
      avatarByJid[contactJid] ||
      null

    const contactName = convo.contactLabel || (isGroup ? groupName : t('panel.unknown_contact'))
    const defaultQuickReplies = [
      `Obrigado pela mensagem, ${contactName}!`,
      'Vou verificar e respondo em breve.'
    ]

    const overlayData = {
      skillId: 'momai-whatsapp',
      panel: 'dist/panel.js',
      panelType: 'whatsapp-panel',
      overlaySize: { width: 592, height: 472 },
      center: true,
      isHistoryOverlay: true,
      structuredResponse: {
        type: 'whatsapp-panel',
        data: {
          contact: convo.contactLabel,
          contactJid,
          message: contextMsg.text,
          isGroup,
          groupName,
          contactAvatar,
          quickReplies: [],
          conversationHistory,
          isHistoryOverlay: true,
          audio: contextMsg.audio,
          sticker: contextMsg.sticker,
          image: contextMsg.image,
          document: contextMsg.document,
          documentName: contextMsg.documentName,
          video: contextMsg.video
        }
      }
    }

    const openOverlay = (window as Window & { api?: { openOverlay?: (data: unknown) => void } }).api
      ?.openOverlay
    if (openOverlay) {
      openOverlay(overlayData)
    }
  }, [avatarByJid])

  const openContactOrGroupOverlay = useCallback(
    (item: WaContact) => {
      const existingConvo = allConversations.find((c) => c.jid === item.id)
      if (existingConvo) {
        return openConversationOverlay(existingConvo)
      }

      const isGroup = item.id.endsWith('@g.us')
      const contactJid = item.id
      const contactLabel =
        item.displayName || item.name || item.notify || (isGroup ? t('panel.groups') : item.phone ? `+${item.phone}` : item.id)
      const groupName = isGroup ? item.displayName || item.name || t('panel.groups') : undefined

      const contactAvatar = avatarByJid[item.id] ?? item.profilePicUrl ?? null

      const overlayData = {
        skillId: 'momai-whatsapp',
        panel: 'dist/panel.js',
        panelType: 'whatsapp-panel',
        overlaySize: { width: 592, height: 472 },
        center: true,
        isHistoryOverlay: true,
        structuredResponse: {
          type: 'whatsapp-panel',
          data: {
            contact: contactLabel,
            contactJid,
            message: '',
            isGroup,
            groupName,
            contactAvatar,
            quickReplies: [],
            conversationHistory: [],
            isHistoryOverlay: true
          }
        }
      }

      const openOverlay = (window as Window & { api?: { openOverlay?: (data: unknown) => void } }).api
        ?.openOverlay
      if (openOverlay) {
        openOverlay(overlayData)
      }
    },
    [allConversations, avatarByJid, openConversationOverlay]
  )

  // Initial data load on mount
  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Removemos o auto-começo de pairing automático para que o QR code seja gerado apenas manualmente via clique no botão.

  // Debounced search / pagination trigger
  useEffect(() => {
    const timer = setTimeout(() => {
      loadPaginatedContacts(contactsPage, contactSearch)
    }, 300)
    return () => clearTimeout(timer)
  }, [contactsPage, contactSearch, loadPaginatedContacts])

  useEffect(() => {
    const timer = setTimeout(() => {
      loadPaginatedGroups(groupsPage, groupSearch)
    }, 300)
    return () => clearTimeout(timer)
  }, [groupsPage, groupSearch, loadPaginatedGroups])

  // Reset page to 1 when search changes
  useEffect(() => {
    setContactsPage(1)
  }, [contactSearch])

  useEffect(() => {
    setGroupsPage(1)
  }, [groupSearch])

  // Poll faster while waiting for QR after disconnect
  useEffect(() => {
    if (connected) return
    const ms = pairingActive && !qrUrl ? 1500 : 5000
    const interval = setInterval(loadStats, ms)
    return () => clearInterval(interval)
  }, [connected, pairingActive, qrUrl, loadStats])

  // While connected, refresh recent messages periodically and when the view
  // regains focus, so a missed realtime event never leaves the list stale.
  useEffect(() => {
    if (!connected) return
    const interval = setInterval(() => {
      void loadHistory()
      void loadStats()
    }, CONNECTED_HISTORY_POLL_MS)
    const onFocus = () => {
      void loadHistory()
      void loadStats()
    }
    const onVisibility = () => {
      if (!document.hidden) {
        void loadHistory()
        void loadStats()
      }
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      clearInterval(interval)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [connected, loadHistory, loadStats])

  // First contacts sync runs automatically on every (re)connect, mirroring the
  // manual sync button, so names and profile pictures appear without user action.
  const autoContactsSyncRef = useRef(false)
  useEffect(() => {
    if (!connected) {
      autoContactsSyncRef.current = false
      return
    }
    if (autoContactsSyncRef.current || syncingRef.current) return
    autoContactsSyncRef.current = true
    void handleSync()
  }, [connected, handleSync])

  // Safety: stop spinner if contacts_synced never arrives
  useEffect(() => {
    if (!syncing) return
    const timeout = setTimeout(() => setSyncing(false), 120_000)
    return () => clearTimeout(timeout)
  }, [syncing])

  // Cleanup do timer de carência ao desmontar
  useEffect(() => {
    return () => {
      clearDisconnectGraceTimer()
    }
  }, [clearDisconnectGraceTimer])

  useExtensionEvents({
    onEvent: useCallback(
      (event: any) => {
        if (event.eventType === 'qr_code' && event.data?.qr) {
          pendingQrRef.current = event.data.qr
          // Só exibe a tela de QR code se o usuário clicou explicitamente em Gerar QR / Reconectar,
          // ou se a carência de 60s expirou / não possui credenciais salvas.
          if (pairingActive || showQrFallback || (!hasCredentials && !connected && !disconnectGraceTimerRef.current)) {
            applyQrString(event.data.qr)
            setPairingActive(false)
          }
          return
        } else if (event.eventType === 'connection_status') {
          const status = event.data?.status
          if (status === 'connected') {
            connectedAtRef.current = Date.now()
            clearDisconnectGraceTimer()
            setConnected(true)
            setConnectionStatus('connected')
            setShowQrFallback(false)
            setPairingActive(false)
            setQrUrl(null)
            pendingQrRef.current = null
            setHasCredentials(true)
            void loadStats()
            void loadHistory()
            void loadPaginatedContacts(contactsPage, contactSearch)
            void loadPaginatedGroups(groupsPage, groupSearch)
          } else if (status === 'reconnecting') {
            setConnected(false)
            setConnectionStatus('reconnecting')
            if (hasCredentials || _stateCache.hasCredentials) {
              startDisconnectGraceTimer()
            }
          } else if (status === 'disconnected') {
            setConnected(false)
            if (hasCredentials || _stateCache.hasCredentials) {
              setConnectionStatus('reconnecting')
              startDisconnectGraceTimer()
            } else {
              setConnectionStatus('disconnected')
              setShowQrFallback(true)
            }
          }
          return
        } else if (event.eventType === 'contacts_synced') {
          setSyncedContacts(event.data?.count || 0)
          void loadStats()
          void loadPaginatedContacts(contactsPage, contactSearch)
          void loadPaginatedGroups(groupsPage, groupSearch)
          void tryFinishContactSync(event.data?.count, event.data?.isFinal)
          return
        } else if (event.eventType === 'contacts_updated') {
          void loadStats()
          if (syncingRef.current) void tryFinishContactSync()
          void loadPaginatedContacts(contactsPage, contactSearch)
          void loadPaginatedGroups(groupsPage, groupSearch)
          return
        } else if (
          event.eventType === 'message_sent' ||
          event.eventType === 'message_received' ||
          event.eventType === 'whatsapp_message' ||
          event.eventType === 'whatsapp_notification' ||
          event.eventType === 'history_loaded'
        ) {
          if (event.eventType === 'whatsapp_notification' && event.data) {
            const d = event.data
            const jid = d.contactJid || d.senderJid || d.contact || ''
            const text = d.message || d.text || ''
            if (jid && typeof jid === 'string' && jid.includes('@') && (text || d.audio || d.image || d.document || d.video)) {
              const isGroupMsg = Boolean(d.isGroup)
              const incomingMsg: Message = {
                from: (isGroupMsg ? d.senderName || d.contact : d.contact || d.senderName) || 'Contato',
                jid,
                text,
                timestamp: toUnixSeconds(d.timestamp),
                direction: 'incoming',
                isGroup: isGroupMsg,
                groupName: d.groupName || null,
                senderJid: d.senderJid,
                profilePicUrl: d.contactAvatar || null,
                audio: d.audio,
                image: d.image,
                document: d.document,
                documentName: d.documentName,
                video: d.video
              }
              ;(incomingMsg as Message & { replyJid?: string }).replyJid = jid
              setHistory((prev) => {
                const key = getHistoryMessageKey(incomingMsg)
                if (prev.some((m) => getHistoryMessageKey(m) === key)) return prev
                return [incomingMsg, ...prev].slice(0, 100)
              })
              if (jid) void loadAvatars([jid])
            }
          }
          loadHistory()
          void loadStats()
          return
        } else if (event.eventType === 'authenticated') {
          const status = event.data?.status
          if (status === 'logged_out') {
            if (pairingActive || showQrFallback || !hasCredentials) {
              beginPairing()
              setConnected(false)
              setConnectionStatus('disconnected')
              setSyncing(false)
            } else {
              setConnected(false)
              setConnectionStatus('reconnecting')
              startDisconnectGraceTimer()
            }
          } else if (status === 'connected') {
            connectedAtRef.current = Date.now()
            clearDisconnectGraceTimer()
            setConnected(true)
            setConnectionStatus('connected')
            setShowQrFallback(false)
            setPairingActive(false)
            setQrUrl(null)
            pendingQrRef.current = null
            setHasCredentials(true)
            setSyncing(true)
            void loadStats()
            loadHistory()
            void loadPaginatedContacts(contactsPage, contactSearch)
            void loadPaginatedGroups(groupsPage, groupSearch)
          } else {
            setConnected(false)
            if (hasCredentials || _stateCache.hasCredentials) {
              setConnectionStatus('reconnecting')
              startDisconnectGraceTimer()
            }
          }
          return
        }
      },
      [
        loadHistory,
        loadAvatars,
        setHistory,
        applyQrString,
        tryFinishContactSync,
        loadStats,
        beginPairing,
        clearDisconnectGraceTimer,
        startDisconnectGraceTimer,
        loadPaginatedContacts,
        loadPaginatedGroups,
        contactsPage,
        contactSearch,
        groupsPage,
        groupSearch,
        pairingActive,
        showQrFallback,
        hasCredentials,
        connected,
        setConnected
      ]
    )
  })

  // Exibe o dashboard se estiver conectado, ou com sessão salva durante o período de carência (sem forçar tela de QR code).
  const showDashboard = connected || (hasCredentials && !pairingActive && !showQrFallback)

  return (
    <div className="flex-1 h-full flex flex-col min-h-0">
      <div className="shrink-0 px-6 pt-6 pb-4 w-full">
        <div className="flex items-center gap-3">
          <WhatsAppIcon className="w-8 h-8 shrink-0" />
          <h1 className="text-xl font-semibold">{t('page.title')}</h1>
          <div className="ml-auto flex items-center gap-2">
            {showDashboard && (
              <div className="relative" ref={notificationDropdownRef}>
                <button
                  onClick={() => setShowNotificationDropdown(!showNotificationDropdown)}
                  className={`py-2 px-3 rounded-full border border-border bg-card hover:bg-input text-text transition-all flex items-center gap-2 group ${
                    showNotificationDropdown ? 'bg-input' : ''
                  }`}
                  title={notificationsDisabled ? t('page.notifications_disabled') : t('page.notifications_active')}
                >
                  {!notificationsDisabled ? (
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                    </svg>
                  ) : (
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-text-muted"
                    >
                      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                      <path d="M18.63 13A17.89 17.89 0 0 1 18 8" />
                      <path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14" />
                      <path d="M18 8a6 6 0 0 0-9.33-5" />
                      <line x1="2" y1="2" x2="22" y2="22" />
                    </svg>
                  )}
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={`transition-transform duration-200 ${showNotificationDropdown ? 'rotate-180' : ''}`}
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>

                {showNotificationDropdown && (
                  <div className="absolute top-full mt-2 right-0 w-48 rounded-xl border border-border bg-card shadow-2xl z-[100] py-2 overflow-hidden animate-in fade-in zoom-in duration-200">
                    <button
                      onClick={() => {
                        if (notificationsDisabled) toggleNotifications()
                        setShowNotificationDropdown(false)
                      }}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                        !notificationsDisabled
                          ? 'bg-input text-text'
                          : 'text-text-muted hover:bg-input hover:text-text'
                      }`}
                    >
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                      </svg>
                      {t('page.active')}
                    </button>
                    <button
                      onClick={() => {
                        if (!notificationsDisabled) toggleNotifications()
                        setShowNotificationDropdown(false)
                      }}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                        notificationsDisabled
                          ? 'bg-input text-text'
                          : 'text-text-muted hover:bg-input hover:text-text'
                      }`}
                    >
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                        <path d="M18.63 13A17.89 17.89 0 0 1 18 8" />
                        <path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14" />
                        <path d="M18 8a6 6 0 0 0-9.33-5" />
                        <line x1="2" y1="2" x2="22" y2="22" />
                      </svg>
                      {t('page.deactivated')}
                    </button>
                  </div>
                )}
              </div>
            )}
            {showDashboard && (
              <button
                onClick={handleSync}
                disabled={syncing}
                className={`p-1.5 rounded-lg border transition-colors flex items-center justify-center ${
                  syncing
                    ? 'bg-accent/10 border-accent/30 text-accent cursor-wait'
                    : 'bg-white/5 border-white/10 hover:bg-white/10 text-text-muted hover:text-text disabled:opacity-50'
                }`}
                title={syncing ? t('page.syncing') : t('page.sync')}
                aria-busy={syncing}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={syncing ? 'animate-spin' : ''}
                  aria-hidden
                >
                  <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                  <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                  <path d="M16 16h5v5" />
                </svg>
              </button>
            )}
            {showDashboard && (
              <button
                onClick={disconnect}
                className="px-3 py-1.5 rounded-lg border border-red-500/20 bg-red-500/5 hover:bg-red-500/15 text-red-400 transition-colors flex items-center gap-2 group cursor-pointer"
                title={t('page.disconnect_confirm')}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                <span className="text-xs font-medium">{t('page.disconnect')}</span>
              </button>
            )}
          </div>{' '}
        </div>
      </div>

      {!showDashboard && (
        <div className="flex-1 w-full flex flex-col items-center justify-center px-6 pb-8 text-center space-y-5 min-h-0">
          <div className="space-y-4 flex flex-col items-center">
            {qrUrl ? (
              <>
                <p className="text-sm text-text-muted max-w-sm">
                  {t('page.scan_qr')}
                </p>
                <img
                  src={qrUrl}
                  alt="QR Code"
                  className="block mx-auto rounded-xl p-2 bg-white border border-white/10 shadow-2xl"
                  width={240}
                  height={240}
                />
              </>
            ) : (
              <div className="flex justify-center">
                <div className="w-48 h-48 rounded-xl bg-white/5 flex items-center justify-center border border-white/10">
                  <WhatsAppIcon className="w-16 h-16 opacity-30" />
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={reconnect}
              disabled={generatingQr}
              className="mt-2 py-2.5 px-6 text-sm font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-all duration-200 border border-emerald-500/30 hover:shadow-[0_0_15px_rgba(16,185,129,0.2)] cursor-pointer flex items-center gap-2 disabled:opacity-50"
            >
              <svg className={`w-4 h-4 ${generatingQr ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span>{generatingQr ? 'Gerando...' : qrUrl ? 'Gerar Novo QR Code' : 'Gerar QR Code'}</span>
            </button>
          </div>
        </div>
      )}

      {showDashboard && (
        <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-6 min-h-0">
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-xl border border-white/5 bg-card p-4">
              <p className="text-2xl font-bold">{totalMessages}</p>
              <p className="text-xs text-text-muted">{t('page.stats_messages')}</p>
            </div>
            <div className="rounded-xl border border-white/5 bg-card p-4">
              <p className="text-2xl font-bold">{monitoredCount}</p>
              <p className="text-xs text-text-muted">{t('page.stats_monitored')}</p>
            </div>
            <div className="rounded-xl border border-white/5 bg-card p-4">
              <p className="text-2xl font-bold">
                {connected ? t('panel.connected') : connectionStatus === 'reconnecting' ? t('panel.reconnecting') : t('panel.disconnected')}
              </p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <div
                  className={`w-1.5 h-1.5 rounded-full ${
                    connected
                      ? 'bg-green-400 animate-pulse'
                      : connectionStatus === 'reconnecting'
                        ? 'bg-amber-400 animate-pulse'
                        : 'bg-red-400'
                  }`}
                />
                <p className="text-xs text-text-muted">
                  {connected
                    ? t('panel.connected')
                    : connectionStatus === 'reconnecting'
                      ? t('panel.reconnecting_bg')
                      : t('panel.disconnected')}
                </p>
              </div>
            </div>
          </div>

          {(connected || allConversations.length > 0) && (
            <div className="rounded-xl border border-white/5 bg-card">
              <div className="px-4 py-3 border-b border-white/5 font-medium text-sm flex items-center justify-between">
                <span>{t('page.recent_title')}</span>
                <span className="text-xs text-text-muted">
                  {t(allConversations.length === 1 ? 'page.recent_count_one' : 'page.recent_count_other', { count: allConversations.length })} ·{' '}
                  {t('page.recent_hint')}
                </span>
              </div>
              {allConversations.length === 0 && (
                <div className="p-6 text-center text-sm text-text-muted">
                  {t('page.no_messages')}
                </div>
              )}
              {conversations.map((convo) => {
                const lastMsg = convo.lastMessage || convo.latestIncoming
                const avatarName = convo.isGroup ? convo.groupName || t('panel.unknown_group') : convo.contactLabel
                const isOutgoing = lastMsg.direction === 'outgoing'

                return (
                  <div
                    key={convo.jid}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      if (editingName !== convo.jid) openConversationOverlay(convo)
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      setListMenu({
                        x: e.clientX,
                        y: e.clientY,
                        kind: 'conversation',
                        id: convo.jid,
                        label: convo.isGroup
                          ? convo.groupName || convo.contactLabel
                          : convo.contactLabel,
                        preview: lastMsg.text || ''
                      })
                    }}
                    onKeyDown={(e) => {
                      if (editingName === convo.jid) return
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        openConversationOverlay(convo)
                      }
                    }}
                    className="px-4 py-3 border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors cursor-pointer focus:outline-none focus:bg-white/10"
                    title={t('page.view_conversation')}
                  >
                    <div className="flex gap-3">
                      <div onClick={(e) => e.stopPropagation()}>
                        <ContactAvatar src={convo.profilePicUrl} name={avatarName} id={convo.jid} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          {editingName === convo.jid ? (
                            <div className="flex-1 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                              <input
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onKeyDown={(e) => {
                                  e.stopPropagation()
                                  if (e.key === 'Enter') {
                                    e.preventDefault()
                                    saveContactName(convo.jid)
                                  }
                                  if (e.key === 'Escape') {
                                    e.preventDefault()
                                    handleCancelEdit()
                                  }
                                }}
                                onBlur={() => saveContactName(convo.jid)}
                                autoFocus
                                className="w-full max-w-xs bg-white/10 rounded px-2 py-0.5 text-sm border border-emerald-500/50 outline-none text-text"
                              />
                            </div>
                          ) : (
                            <>
                              {convo.isGroup && convo.groupName ? (
                                <>
                                  <span className="font-medium text-sm truncate">
                                    {convo.groupName}
                                  </span>
                                  <span className="text-xs text-text-muted truncate shrink-0">
                                    · {convo.contactLabel}
                                  </span>
                                </>
                              ) : (
                                <span className="font-medium text-sm truncate">
                                  {convo.contactLabel}
                                </span>
                              )}
                            </>
                          )}
                          <div className="ml-auto flex items-center gap-2 shrink-0">
                            {editingName !== convo.jid && !convo.isGroup && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleStartEdit(convo.jid, convo.contactLabel)
                                }}
                                className="text-text-muted hover:text-emerald-400 p-1 rounded-lg hover:bg-white/10 transition-colors"
                                title={t('page.rename')}
                              >
                                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                                  <path d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 0 1-.927-.928l.929-3.25c.081-.286.235-.547.445-.758l8.61-8.61Zm.176 4.823L9.75 4.81l-6.286 6.287a.253.253 0 0 0-.064.108l-.558 1.953 1.953-.558a.253.253 0 0 0 .108-.064Zm1.238-3.763a.25.25 0 0 0-.354 0L10.811 3.75l1.439 1.44 1.263-1.263a.25.25 0 0 0 0-.354Z" />
                                </svg>
                              </button>
                            )}
                            {editingName !== convo.jid && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleDeleteConversation(convo.jid)
                                }}
                                className="text-text-muted hover:text-red-400 p-1 rounded-lg hover:bg-white/10 transition-colors"
                                title={t('page.delete_conversation')}
                              >
                                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                                  <path d="M6.5 1.75a.25.25 0 0 1 .25-.25h2.5a.25.25 0 0 1 .25.25V3h-3V1.75Zm4.5 0V3h2.25a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1 0-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75ZM4.496 6.675a.75.75 0 1 0-1.492.15l.66 6.6A1.75 1.75 0 0 0 5.405 15h5.19a1.75 1.75 0 0 0 1.741-1.575l.66-6.6a.75.75 0 0 0-1.492-.15l-.66 6.6a.25.25 0 0 1-.249.225h-5.19a.25.25 0 0 1-.249-.225l-.66-6.6Z" />
                                </svg>
                              </button>
                            )}
                            {editingName !== convo.jid && (
                              <MonitoringDropdown
                                id={convo.jid}
                                monitoring={resolveMonitoring(convo.jid)}
                                onToggle={toggleMonitoring}
                              />
                            )}
                            <span className="text-xs text-text-muted">
                              {formatTime(lastMsg.timestamp, locale)}
                            </span>
                          </div>
                        </div>
                        <div className="text-sm text-text-muted mt-0.5 flex items-center gap-1.5 min-h-[1.75rem]">
                          {isOutgoing && (
                            <span className="font-semibold text-text-muted/90 shrink-0">
                              {t('page.you_label')}
                            </span>
                          )}
                          {lastMsg.sticker ? (
                            <div className="flex items-center gap-1.5 py-0.5">
                              <img
                                src={getStickerUrl(lastMsg.sticker)}
                                alt="Sticker"
                                className="w-8 h-8 sm:w-9 sm:h-9 object-contain rounded drop-shadow-sm shrink-0 select-none hover:scale-105 transition-transform"
                                loading="lazy"
                              />
                            </div>
                          ) : (
                            <span className="truncate">
                              {lastMsg.text ||
                                (lastMsg.audio
                                  ? t('page.audio_fallback')
                                  : lastMsg.image
                                    ? t('media.photo')
                                    : lastMsg.video
                                      ? t('media.video')
                                      : lastMsg.document
                                        ? `📄 ${lastMsg.documentName || t('page.document_default')}`
                                        : '')}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}

              {conversationsTotalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-white/5">
                  <span className="text-xs text-text-muted">
                    {t('page.pagination_showing', {
                      from: (conversationsPage - 1) * conversationsPerPage + 1,
                      to: Math.min(conversationsPage * conversationsPerPage, allConversations.length),
                      total: allConversations.length
                    })}{' '}
                    {t('page.pagination_unit_conversations')}
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setConversationsPage((p) => Math.max(1, p - 1))}
                      disabled={conversationsPage === 1}
                      className="px-3 py-1.5 text-xs rounded-lg bg-white/5 text-text hover:bg-white/10 border border-white/5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      {t('page.pagination_previous')}
                    </button>
                    <span className="text-xs self-center px-2 text-text-muted">
                      {conversationsPage} / {conversationsTotalPages}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setConversationsPage((p) => Math.min(conversationsTotalPages, p + 1))
                      }
                      disabled={conversationsPage === conversationsTotalPages}
                      className="px-3 py-1.5 text-xs rounded-lg bg-white/5 text-text hover:bg-white/10 border border-white/5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      {t('page.pagination_next')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {showDashboard && (
            <>
              <div className="rounded-xl border border-white/5 bg-card">
                <div className="px-4 py-3 border-b border-white/5 font-medium text-sm flex items-center justify-between flex-wrap gap-2">
                  <span>{t('page.groups_tab')}</span>
                  <div className="flex items-center gap-2">
                    <div className="relative w-64">
                      <input
                        value={groupSearch}
                        onChange={(e) => setGroupSearch(e.target.value)}
                        placeholder={t('page.search_group')}
                        className="w-full bg-white/5 rounded-lg pl-3 pr-8 py-1.5 text-xs border border-white/10 outline-none focus:border-accent/50"
                      />
                      {groupsLoading && (
                        <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
                          <div className="w-3.5 h-3.5 border-2 border-accent/40 border-t-accent rounded-full animate-spin" />
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={refreshAvatars}
                      disabled={avatarsRefreshing}
                      className={`p-1.5 rounded-lg border transition-colors flex items-center justify-center ${
                        avatarsRefreshing
                          ? 'bg-accent/10 border-accent/30 text-accent cursor-wait'
                          : 'bg-white/5 border-white/10 hover:bg-white/10 text-text-muted hover:text-text disabled:opacity-50'
                      }`}
                      title={
                        avatarsRefreshing ? t('page.refreshing_avatars') : t('page.refresh_avatars')
                      }
                      aria-busy={avatarsRefreshing}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className={avatarsRefreshing ? 'animate-spin' : ''}
                        aria-hidden
                      >
                        <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                        <path d="M3 3v5h5" />
                        <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                        <path d="M16 16h5v5" />
                      </svg>
                    </button>
                  </div>
                </div>

                {paginatedGroups.length === 0 ? (
                  <div className="p-6 text-center text-sm text-text-muted">
                    {groupsLoading ? t('page.loading_groups') : t('page.no_groups')}
                  </div>
                ) : (
                  <div className="divide-y divide-white/5">
                    {paginatedGroups.map((c) => (
                      <div
                        key={c.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                          if (editingName !== c.id) openContactOrGroupOverlay(c)
                        }}
                        onContextMenu={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          setListMenu({
                            x: e.clientX,
                            y: e.clientY,
                            kind: 'group',
                            id: c.id,
                            label: c.displayName
                          })
                        }}
                        onKeyDown={(e) => {
                          if (editingName === c.id) return
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            openContactOrGroupOverlay(c)
                          }
                        }}
                        className="px-4 py-3 flex items-center gap-3 hover:bg-white/5 transition-colors cursor-pointer focus:outline-none focus:bg-white/10"
                        title={t('page.send_message')}
                      >
                        <div onClick={(e) => e.stopPropagation()}>
                          <ContactAvatar src={c.profilePicUrl} name={c.displayName} id={c.id} />
                        </div>
                        <div
                          className="flex-1 min-w-0"
                          onClick={(e) => {
                            if (editingName === c.id) e.stopPropagation()
                          }}
                        >
                          {editingName === c.id ? (
                            <input
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onKeyDown={(e) => {
                                e.stopPropagation()
                                if (e.key === 'Enter') saveContactName(c.id)
                                if (e.key === 'Escape') handleCancelEdit()
                              }}
                              onBlur={() => saveContactName(c.id)}
                              autoFocus
                              className="w-full max-w-xs bg-white/10 rounded px-2 py-0.5 text-sm border border-accent/50 outline-none text-text"
                            />
                          ) : (
                            <>
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-medium truncate">{c.displayName}</p>
                                {c.name && c.notify && c.name !== c.notify && (
                                  <span className="text-xs text-text-muted opacity-60">
                                    ({c.notify})
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-text-muted truncate">
                                {c.id.replace('@g.us', '')}
                              </p>
                            </>
                          )}
                        </div>

                        {editingName !== c.id && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleStartEdit(c.id, c.displayName)
                            }}
                            className="text-text-muted hover:text-text p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                            title={t('page.rename')}
                          >
                            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                              <path d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 0 1-.927-.928l.929-3.25c.081-.286.235-.547.445-.758l8.61-8.61Zm.176 4.823L9.75 4.81l-6.286 6.287a.253.253 0 0 0-.064.108l-.558 1.953 1.953-.558a.253.253 0 0 0 .108-.064Zm1.238-3.763a.25.25 0 0 0-.354 0L10.811 3.75l1.439 1.44 1.263-1.263a.25.25 0 0 0 0-.354Z" />
                            </svg>
                          </button>
                        )}
                        {editingName !== c.id && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDeleteConversation(c.id)
                            }}
                            className="text-text-muted hover:text-red-400 p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                            title={t('page.delete_conversation')}
                          >
                            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                              <path d="M6.5 1.75a.25.25 0 0 1 .25-.25h2.5a.25.25 0 0 1 .25.25V3h-3V1.75Zm4.5 0V3h2.25a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1 0-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75ZM4.496 6.675a.75.75 0 1 0-1.492.15l.66 6.6A1.75 1.75 0 0 0 5.405 15h5.19a1.75 1.75 0 0 0 1.741-1.575l.66-6.6a.75.75 0 0 0-1.492-.15l-.66 6.6a.25.25 0 0 1-.249.225h-5.19a.25.25 0 0 1-.249-.225l-.66-6.6Z" />
                            </svg>
                          </button>
                        )}

                        <MonitoringDropdown
                          id={c.id}
                          monitoring={c.monitoring}
                          onToggle={toggleMonitoring}
                        />
                      </div>
                    ))}
                  </div>
                )}

                {groupsTotalPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t border-white/5">
                    <span className="text-xs text-text-muted">
                      {t('page.pagination_showing', {
                        from: (groupsPage - 1) * groupsPerPage + 1,
                        to: Math.min(groupsPage * groupsPerPage, totalFilteredGroups),
                        total: totalFilteredGroups
                      })}{' '}
                      {t('page.pagination_unit_groups')}
                    </span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setGroupsPage((p) => Math.max(1, p - 1))}
                        disabled={groupsPage === 1}
                        className="px-3 py-1.5 text-xs rounded-lg bg-white/5 text-text hover:bg-white/10 border border-white/5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        {t('page.pagination_previous')}
                      </button>
                      <span className="text-xs self-center px-2 text-text-muted">
                        {groupsPage} / {groupsTotalPages}
                      </span>
                      <button
                        type="button"
                        onClick={() => setGroupsPage((p) => Math.min(groupsTotalPages, p + 1))}
                        disabled={groupsPage === groupsTotalPages}
                        className="px-3 py-1.5 text-xs rounded-lg bg-white/5 text-text hover:bg-white/10 border border-white/5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        {t('page.pagination_next')}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-white/5 bg-card">
                <div className="px-4 py-3 border-b border-white/5 font-medium text-sm flex items-center justify-between flex-wrap gap-2">
                  <span>{t('page.contacts_tab')}</span>
                  <div className="relative w-64">
                    <input
                      value={contactSearch}
                      onChange={(e) => setContactSearch(e.target.value)}
                      placeholder={t('page.search_contact')}
                      className="w-full bg-white/5 rounded-lg pl-3 pr-8 py-1.5 text-xs border border-white/10 outline-none focus:border-accent/50"
                    />
                    {contactsLoading && (
                      <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
                        <div className="w-3.5 h-3.5 border-2 border-accent/40 border-t-accent rounded-full animate-spin" />
                      </div>
                    )}
                  </div>
                </div>

                {paginatedContacts.length === 0 ? (
                  <div className="p-6 text-center text-sm text-text-muted">
                    {contactsLoading ? t('page.loading_contacts') : t('page.no_contacts')}
                  </div>
                ) : (
                  <div className="divide-y divide-white/5">
                    {paginatedContacts.map((c) => (
                      <div
                        key={c.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                          if (editingName !== c.id) openContactOrGroupOverlay(c)
                        }}
                        onContextMenu={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          setListMenu({
                            x: e.clientX,
                            y: e.clientY,
                            kind: 'contact',
                            id: c.id,
                            label: c.displayName
                          })
                        }}
                        onKeyDown={(e) => {
                          if (editingName === c.id) return
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            openContactOrGroupOverlay(c)
                          }
                        }}
                        className="px-4 py-3 flex items-center gap-3 hover:bg-white/5 transition-colors cursor-pointer focus:outline-none focus:bg-white/10"
                        title={t('page.send_message')}
                      >
                        <div onClick={(e) => e.stopPropagation()}>
                          <ContactAvatar src={c.profilePicUrl} name={c.displayName} id={c.id} />
                        </div>
                        <div
                          className="flex-1 min-w-0"
                          onClick={(e) => {
                            if (editingName === c.id) e.stopPropagation()
                          }}
                        >
                          {editingName === c.id ? (
                            <input
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onKeyDown={(e) => {
                                e.stopPropagation()
                                if (e.key === 'Enter') saveContactName(c.id)
                                if (e.key === 'Escape') handleCancelEdit()
                              }}
                              onBlur={() => saveContactName(c.id)}
                              autoFocus
                              className="w-full max-w-xs bg-white/10 rounded px-2 py-0.5 text-sm border border-accent/50 outline-none text-text"
                            />
                          ) : (
                            <>
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-medium truncate">{c.displayName}</p>
                                {c.name && c.notify && c.name !== c.notify && (
                                  <span className="text-xs text-text-muted opacity-60">
                                    ({c.notify})
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-text-muted truncate">+{c.phone}</p>
                            </>
                          )}
                        </div>

                        {editingName !== c.id && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleStartEdit(c.id, c.displayName)
                            }}
                            className="text-text-muted hover:text-text p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                            title={t('page.rename')}
                          >
                            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                              <path d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 0 1-.927-.928l.929-3.25c.081-.286.235-.547.445-.758l8.61-8.61Zm.176 4.823L9.75 4.81l-6.286 6.287a.253.253 0 0 0-.064.108l-.558 1.953 1.953-.558a.253.253 0 0 0 .108-.064Zm1.238-3.763a.25.25 0 0 0-.354 0L10.811 3.75l1.439 1.44 1.263-1.263a.25.25 0 0 0 0-.354Z" />
                            </svg>
                          </button>
                        )}
                        {editingName !== c.id && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDeleteConversation(c.id)
                            }}
                            className="text-text-muted hover:text-red-400 p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                            title={t('page.delete_conversation')}
                          >
                            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                              <path d="M6.5 1.75a.25.25 0 0 1 .25-.25h2.5a.25.25 0 0 1 .25.25V3h-3V1.75Zm4.5 0V3h2.25a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1 0-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75ZM4.496 6.675a.75.75 0 1 0-1.492.15l.66 6.6A1.75 1.75 0 0 0 5.405 15h5.19a1.75 1.75 0 0 0 1.741-1.575l.66-6.6a.75.75 0 0 0-1.492-.15l-.66 6.6a.25.25 0 0 1-.249.225h-5.19a.25.25 0 0 1-.249-.225l-.66-6.6Z" />
                            </svg>
                          </button>
                        )}

                        <MonitoringDropdown
                          id={c.id}
                          monitoring={c.monitoring}
                          onToggle={toggleMonitoring}
                        />
                      </div>
                    ))}
                  </div>
                )}

                {/* Pagination Controls */}
                {contactsTotalPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t border-white/5">
                    <span className="text-xs text-text-muted">
                      {t('page.pagination_showing', {
                        from: (contactsPage - 1) * contactsPerPage + 1,
                        to: Math.min(contactsPage * contactsPerPage, totalFilteredContacts),
                        total: totalFilteredContacts
                      })}{' '}
                      {t('page.pagination_unit_contacts')}
                    </span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setContactsPage((p) => Math.max(1, p - 1))}
                        disabled={contactsPage === 1}
                        className="px-3 py-1.5 text-xs rounded-lg bg-white/5 text-text hover:bg-white/10 border border-white/5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        {t('page.pagination_previous')}
                      </button>
                      <span className="text-xs self-center px-2 text-text-muted">
                        {contactsPage} / {contactsTotalPages}
                      </span>
                      <button
                        type="button"
                        onClick={() => setContactsPage((p) => Math.min(contactsTotalPages, p + 1))}
                        disabled={contactsPage === contactsTotalPages}
                        className="px-3 py-1.5 text-xs rounded-lg bg-white/5 text-text hover:bg-white/10 border border-white/5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        {t('page.pagination_next')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
      {listMenu && (
        <ContextMenu
          x={listMenu.x}
          y={listMenu.y}
          onClose={() => setListMenu(null)}
          items={[
            {
              id: 'open',
              label: listMenu.kind === 'conversation' ? t('page.open_conversation') : t('page.send_message'),
              onClick: () => {
                if (listMenu.kind === 'conversation') {
                  const convo = allConversations.find((c) => c.jid === listMenu.id)
                  if (convo) openConversationOverlay(convo)
                } else {
                  const target =
                    paginatedGroups.find((c) => c.id === listMenu.id) ||
                    paginatedContacts.find((c) => c.id === listMenu.id)
                  if (target) openContactOrGroupOverlay(target)
                }
              }
            },
            {
              id: 'rename',
              label: t('page.rename'),
              onClick: () => handleStartEdit(listMenu.id, listMenu.label)
            },
            {
              id: 'copy-name',
              label: t('panel.copy_name'),
              onClick: () => {
                try {
                  void navigator.clipboard?.writeText?.(listMenu.label)
                } catch {}
              }
            },
            {
              id: 'copy-id',
              label: t('page.copy_id'),
              onClick: () => {
                try {
                  void navigator.clipboard?.writeText?.(listMenu.id)
                } catch {}
              }
            },
            ...(listMenu.kind === 'conversation' && listMenu.preview
              ? [
                  {
                    id: 'copy-preview',
                    label: t('page.copy_last_message'),
                    onClick: () => {
                      try {
                        void navigator.clipboard?.writeText?.(listMenu.preview || '')
                      } catch {}
                    }
                  }
                ]
              : []),
            {
              id: resolveMonitoring(listMenu.id) ? 'ignore' : 'monitor',
              label: resolveMonitoring(listMenu.id) ? t('page.ignore') : t('page.monitor'),
              onClick: () => toggleMonitoring(listMenu.id)
            },
            {
              id: 'delete',
              label: t('page.delete_conversation'),
              danger: true,
              onClick: () => handleDeleteConversation(listMenu.id)
            }
          ]}
        />
      )}
    </div>
  )
}

sdk.registry.registerRenderer('whatsapp-page', WhatsAppView)
