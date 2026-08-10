import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import QRCode from 'qrcode'
import sdk from 'momai:sdk'
import { api } from './services/api'
import { useExtensionEvents } from './hooks/useExtensionEvents'
import { resolveWhatsAppChannel } from './utils/whatsappChannel'
import ImageViewer from 'momai:image-viewer'

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
}

interface ConversationSummary {
  jid: string
  turns: ConversationTurn[]
  latestIncoming: Message
  latestReplies: Message[]
  incomingCount: number
  contactLabel: string
  isGroup: boolean
  groupName: string | null
  profilePicUrl: string | null
}

function normalizeTimestamp(ts: number): number {
  return ts > 1e12 ? ts : ts * 1000
}

function formatTime(ts: number): string {
  const ms = normalizeTimestamp(ts)
  if (!ms || isNaN(ms)) return '--:--'
  return new Date(ms).toLocaleDateString('pt-BR') === new Date().toLocaleDateString('pt-BR')
    ? new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : new Date(ms).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

function buildTurns(sorted: Message[]): ConversationTurn[] {
  const turns: ConversationTurn[] = []
  let current: ConversationTurn | null = null

  for (const msg of sorted) {
    if (msg.direction === 'incoming') {
      if (current) turns.push(current)
      current = { incoming: msg, replies: [] }
    } else if (msg.direction === 'outgoing' && current) {
      current.replies.push(msg)
    }
  }
  if (current) turns.push(current)

  return turns
}

function turnsToHistoryLines(turns: ConversationTurn[]): ConversationHistoryLine[] {
  const lines: ConversationHistoryLine[] = []
  for (const turn of turns) {
    lines.push({
      direction: 'incoming',
      text: turn.incoming.text,
      timestamp: turn.incoming.timestamp,
      from: turn.incoming.from,
      audio: turn.incoming.audio
    })
    for (const reply of turn.replies) {
      lines.push({
        direction: 'outgoing',
        text: reply.text,
        timestamp: reply.timestamp,
        audio: reply.audio
      })
    }
  }
  return lines
}

/** Um card por conversa (jid): preview = última recebida; histórico completo no overlay. */
function buildConversationSummaries(history: Message[]): ConversationSummary[] {
  const byJid = new Map<string, Message[]>()
  for (const msg of history) {
    const list = byJid.get(msg.jid) || []
    list.push(msg)
    byJid.set(msg.jid, list)
  }

  const summaries: ConversationSummary[] = []

  for (const [jid, messages] of byJid) {
    const sorted = [...messages].sort(
      (a, b) => normalizeTimestamp(a.timestamp) - normalizeTimestamp(b.timestamp)
    )
    const turns = buildTurns(sorted)
    if (turns.length === 0) continue

    const latestTurn = turns[turns.length - 1]
    const profilePicUrl = [...sorted].reverse().find((m) => m.profilePicUrl)?.profilePicUrl || null

    summaries.push({
      jid,
      turns,
      latestIncoming: latestTurn.incoming,
      latestReplies: latestTurn.replies,
      incomingCount: turns.length,
      contactLabel: latestTurn.incoming.from,
      isGroup: jid.endsWith('@g.us'),
      groupName: jid.endsWith('@g.us') ? (latestTurn.incoming.groupName ?? null) : null,
      profilePicUrl
    })
  }

  summaries.sort(
    (a, b) =>
      normalizeTimestamp(b.latestIncoming.timestamp) -
      normalizeTimestamp(a.latestIncoming.timestamp)
  )

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
        fill="#000000"
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

  sdk.registry.registerRenderer('whatsapp-page', WhatsAppView)

  const isPhone = /^[+\d\s().-]*$/.test(name)
  const isGroup = id.endsWith('@g.us')
  return (
    <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-lg shrink-0">
      {isGroup ? '👥' : isPhone ? '📱' : '👤'}
    </div>
  )
}

interface WaContact {
  id: string
  name?: string | null
  notify?: string | null
  phone?: string
  monitoring?: boolean
  profilePicUrl?: string | null
}

const TOOL_LABELS: Record<string, string> = {
  send_message: 'Enviar mensagem',
  list_contacts: 'Listar contatos',
  add_contact: 'Adicionar contato',
  remove_contact: 'Remover contato',
  get_stats: 'Estatísticas',
  get_history: 'Histórico',
  get_wa_contacts: 'Buscar contatos',
  get_wa_groups: 'Buscar grupos',
  control_device: 'Controlar dispositivo',
  set_light_color: 'Cor da luz',
  control_tv_remote: 'Controle da TV',
  control_climate: 'Controlar clima',
  call_ha_service: 'Serviço da casa',
  list_devices: 'Listar dispositivos',
  query_device: 'Consultar dispositivo',
  capture_snapshot: 'Capturar print',
  start_monitoring: 'Iniciar monitoramento'
}

const PARAM_LABELS: Record<string, string> = {
  contact: 'Contato ou número',
  message: 'Mensagem',
  image: 'Imagem',
  media: 'Imagem',
  device_name: 'Dispositivo',
  action: 'Ação',
  brightness: 'Brilho',
  color: 'Cor',
  temperature: 'Temperatura',
  domain: 'Domínio',
  service: 'Serviço',
  data: 'Dados',
  room: 'Cômodo',
  cameraId: 'Câmera',
  monitorId: 'Monitor',
  label: 'Rótulo'
}

const PLACEHOLDERS = [
  { token: '{contact}', label: 'Contato' },
  { token: '{message}', label: 'Texto' },
  { token: '{timestamp}', label: 'Horário' },
  { token: '{isGroup}', label: 'É grupo' },
  { token: '{event.imageDataUri}', label: 'Imagem' }
]

const ENTITY_PARAMS = new Set(['contact', 'device_name', 'cameraId', 'monitorId'])

interface AutomationAction {
  id?: string
  target: string
  tool: string
  args?: Record<string, unknown>
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

function formatActionArgs(args?: Record<string, unknown>): string {
  if (!args) return ''
  return Object.entries(args)
    .filter(([, v]) => !(typeof v === 'string' && !v.trim()))
    .map(([k, v]) => {
      const val = v && typeof v === 'object' ? JSON.stringify(v) : String(v)
      return `${PARAM_LABELS[k] || humanizeKey(k)}: ${val}`
    })
    .join(' · ')
}

/**
 * Modal de automações (MOM-115): lê o catálogo de extensões do host e deixa o
 * usuário montar actions (evento → ação) de forma genérica, salvas via
 * set_actions/get_actions.
 */
function AutomationsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [catalog, setCatalog] = useState<CatalogExt[]>([])
  const [actions, setActions] = useState<AutomationAction[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showDraft, setShowDraft] = useState(false)
  const [target, setTarget] = useState('')
  const [tool, setTool] = useState('')
  const [draftArgs, setDraftArgs] = useState<Record<string, unknown>>({})

  const load = () => {
    setLoading(true)
    Promise.all([
      api.get('/extensions'),
      api.post('/extensions/whatsapp/command', { toolName: 'get_actions' })
    ])
      .then(([cat, act]) => {
        const installed = (cat.data || []).filter(
          (e) =>
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
      out[key] = param && param.default !== undefined ? param.default : ''
    }
    return out
  }

  function addAction() {
    if (!target || !tool) return
    const clean: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(draftArgs)) {
      if (typeof value === 'string' && !value.trim()) continue
      clean[key] = value
    }
    setActions((prev) => [
      ...prev,
      { id: `act-${Date.now()}`, target, tool, args: Object.keys(clean).length ? clean : undefined }
    ])
    setShowDraft(false)
  }

  async function save() {
    setSaving(true)
    try {
      await api.post('/extensions/whatsapp/command', {
        toolName: 'set_actions',
        args: { actions }
      })
      onClose()
    } catch {
      /* falha ao salvar */
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 bg-zinc-950/60 shrink-0">
          <h2 className="text-base font-bold text-white">Automações</h2>
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
            Ações executadas automaticamente quando chegar uma mensagem (ex.: ligar uma luz
            na casa inteligente).
          </p>

          {loading ? (
            <p className="text-xs text-gray-500">Carregando…</p>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-300">Ações</span>
                <button
                  type="button"
                  onClick={() => setShowDraft((v) => !v)}
                  className="text-[11px] font-medium text-emerald-400 hover:text-emerald-300 border border-emerald-500/30 hover:border-emerald-400 px-2.5 py-1 rounded-lg transition-colors"
                >
                  {showDraft ? 'Cancelar' : '+ Adicionar ação'}
                </button>
              </div>

              {actions.length === 0 && !showDraft ? (
                <p className="text-[11px] text-gray-500">
                  Nenhuma automação. Campos disponíveis:{' '}
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
                      {TOOL_LABELS[a.tool] || humanizeKey(a.tool)}
                    </div>
                    {a.args && Object.keys(a.args).length > 0 ? (
                      <div className="text-[11px] text-gray-500 truncate">{formatActionArgs(a.args)}</div>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => setActions(actions.filter((_, j) => j !== i))}
                    className="text-gray-500 hover:text-red-400 text-sm shrink-0"
                    aria-label="Remover"
                  >
                    ×
                  </button>
                </div>
              ))}

              {showDraft ? (
                <div className="space-y-3 bg-white/5 border border-white/10 rounded-xl p-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-400 mb-1">
                      Extensão alvo
                    </label>
                    <select
                      value={target}
                      onChange={(e) => selectTarget(e.target.value)}
                      className="w-full bg-zinc-800 border border-white/10 rounded-xl px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-emerald-500"
                    >
                      {catalog.length === 0 ? (
                        <option value="">Nenhuma extensão com ações instalada</option>
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
                        <label className="block text-[11px] font-semibold text-gray-400 mb-1">Ação</label>
                        <select
                          value={tool}
                          onChange={(e) => selectTool(e.target.value)}
                          className="w-full bg-zinc-800 border border-white/10 rounded-xl px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-emerald-500"
                        >
                          {targetExt?.tools
                            ?.filter((t) => t.name !== 'get_actions' && t.name !== 'set_actions')
                            .map((t) => (
                              <option key={t.name} value={t.name}>
                                {TOOL_LABELS[t.name] || humanizeKey(t.name)}
                              </option>
                            ))}
                        </select>
                      </div>

                      <div className="space-y-2">
                        {Object.entries(props).map(([key, param]) => (
                          <div key={key}>
                            <label className="block text-[11px] font-semibold text-gray-400 mb-1">
                              {PARAM_LABELS[key] || humanizeKey(key)}
                              {param?.default !== undefined ? ' (pré-preenchido)' : ''}
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
                        onClick={addAction}
                        className="text-[11px] font-semibold bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg transition-colors"
                      >
                        Usar esta ação
                      </button>
                    </>
                  ) : null}
                </div>
              ) : null}
            </>
          )}
        </div>

        <div className="px-5 py-3 border-t border-white/10 shrink-0 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="text-xs font-medium text-gray-300 hover:text-white bg-white/5 hover:bg-white/10 px-4 py-2 rounded-xl transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2 rounded-xl transition-colors disabled:opacity-60"
          >
            {saving ? 'Salvando…' : 'Salvar automações'}
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
  const [options, setOptions] = useState<string[]>([])
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    const listTool =
      paramKey === 'contact'
        ? 'get_wa_contacts'
        : paramKey === 'device_name'
          ? 'list_devices'
          : null
    if (!listTool) return
    api
      .post(`/extensions/${target}/command`, { toolName: listTool, args: {} })
      .then((res) => {
        if (cancelled || !res.ok) return
        const items = paramKey === 'contact' ? res.data?.contacts : res.data?.devices
        const names = (items || [])
          .map((c: any) => {
            if (paramKey === 'contact') return c.name || c.notify || c.phone || ''
            return String(c.name || '')
          })
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
        placeholder={options.length > 0 ? 'Digite para buscar…' : 'Digite nome ou número'}
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

export default function WhatsAppView() {
  const [connected, setConnected] = useState(false)
  const [totalMessages, setTotalMessages] = useState(0)
  const [syncedContacts, setSyncedContacts] = useState(0)
  const [monitoredCount, setMonitoredCount] = useState(0)
  const [history, setHistory] = useState<Message[]>([])
  const [qrUrl, setQrUrl] = useState<string | null>(null)
  const [statsLoaded, setStatsLoaded] = useState(false)
  const [hasCredentials, setHasCredentials] = useState(false)
  const [pairingActive, setPairingActive] = useState(false)
  const qrRequestInFlight = useRef(false)
  const [editingName, setEditingName] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [openMonitoringDropdown, setOpenMonitoringDropdown] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const syncingRef = useRef(false)

  useEffect(() => {
    syncingRef.current = syncing
  }, [syncing])

  // Paginated contacts state
  const [contactsPage, setContactsPage] = useState(1)
  const [contactsPerPage] = useState(10)
  const [contactSearch, setContactSearch] = useState('')
  const [paginatedContacts, setPaginatedContacts] = useState<WaContact[]>([])
  const [totalFilteredContacts, setTotalFilteredContacts] = useState(0)
  const [contactsTotalPages, setContactsTotalPages] = useState(1)
  const [contactsLoading, setContactsLoading] = useState(false)

  const [groupsPage, setGroupsPage] = useState(1)
  const [groupsPerPage] = useState(10)
  const [groupSearch, setGroupSearch] = useState('')
  const [paginatedGroups, setPaginatedGroups] = useState<WaContact[]>([])
  const [totalFilteredGroups, setTotalFilteredGroups] = useState(0)
  const [groupsTotalPages, setGroupsTotalPages] = useState(1)
  const [groupsLoading, setGroupsLoading] = useState(false)
  const [avatarByJid, setAvatarByJid] = useState<Record<string, string | null>>({})
  const [conversationsPage, setConversationsPage] = useState(1)
  const [conversationsPerPage] = useState(10)
  const [notificationsDisabled, setNotificationsDisabled] = useState(false)
  const [showNotificationDropdown, setShowNotificationDropdown] = useState(false)
  const notificationDropdownRef = useRef<HTMLDivElement>(null)
  const [showAutomations, setShowAutomations] = useState(false)

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
      .then((res) => {
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

  const beginPairing = useCallback(() => {
    setPairingActive(true)
    setHasCredentials(false)
    setQrUrl(null)
    qrRequestInFlight.current = false
    // No `force: true` — see comment in requestQr above.
    requestQr().catch(() => {})
  }, [requestQr])

  const loadAvatars = useCallback(async (jids: string[]) => {
    const unique = [...new Set(jids.filter((j) => typeof j === 'string' && j.includes('@')))]
    if (unique.length === 0) return
    try {
      const { data } = await api.post('/extensions/whatsapp/command', {
        toolName: 'get_avatars',
        args: { jids: unique }
      })
      if (data?.avatars) {
        setAvatarByJid((prev) => ({ ...prev, ...data.avatars }))
      }
    } catch {}
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
      setConnected(isConnected)
      setHasCredentials(Boolean(data.hasCredentials))
      setTotalMessages(data.totalMessages || 0)
      setSyncedContacts(data.syncedContacts || 0)
      setMonitoredCount(data.monitoredCount || 0)
      if (isConnected) {
        setQrUrl(null)
      } else if (data.qr) {
        applyQrString(data.qr)
      }
    } catch {
    } finally {
      setStatsLoaded(true)
    }
  }, [applyQrString])

  const loadHistory = useCallback(async () => {
    try {
      const { data } = await api.post('/extensions/whatsapp/command', {
        toolName: 'get_history',
        args: {}
      })
      if (data?.history) {
        setHistory(data.history)
        const jids = [
          ...new Set(data.history.map((m: Message) => m.jid).filter(Boolean))
        ] as string[]
        loadAvatars(jids)
      }
    } catch {}
  }, [loadAvatars])

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
        }
        return data
      } catch {
        return null
      } finally {
        setContactsLoading(false)
      }
    },
    [contactsPerPage]
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
        }
        return data
      } catch {
        return null
      } finally {
        setGroupsLoading(false)
      }
    },
    [groupsPerPage]
  )

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
      // Manual sync is considered "final" for the UI response
      await tryFinishContactSync(data?.syncedContacts, true)
    } catch {
      setSyncing(false)
    }
  }, [syncing, tryFinishContactSync])

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
        loadStats()
      }
    } catch {}
  }

  const saveContactName = async (contactId: string) => {
    if (!editValue.trim()) return
    try {
      await api.post('/extensions/whatsapp/command', {
        toolName: 'set_contact_name',
        args: { contact: contactId, name: editValue.trim() }
      })
      setEditingName(null)
      refresh()
    } catch {}
  }

  const disconnect = useCallback(async () => {
    beginPairing()
    setConnected(false)
    try {
      await api.post('/extensions/whatsapp/disconnect')
    } catch {}
  }, [beginPairing])

  const reconnect = useCallback(async () => {
    try {
      beginPairing()
      setConnected(false)
      // Force um QR realmente novo: o worker apaga a sessão Baileys e gera um
      // pairing novo. Sem `force`, o worker re-exibe o MESMO QR por até 65s
      // (QR_TTL_MS) porque _qrStillValid() devolve o QR em cache.
      await api.post('/extensions/whatsapp/restart', { force: true })
    } catch {}
  }, [beginPairing])

  const openConversationOverlay = useCallback(async (convo: ConversationSummary) => {
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

    const recentIncoming = turns
      .map((t) => t.incoming.text)
      .slice(-5)
      .join(' | ')

    let quickReplies: string[] = []
    try {
      const { data: llmData } = await api.post('/extensions/whatsapp/process-notification', {
        contact: contextMsg.from,
        message: recentIncoming || contextMsg.text,
        contactJid,
        isGroup,
        groupName
      })
      quickReplies = llmData?.quickReplies || []
    } catch {}

    let contactAvatar = convo.profilePicUrl
    const avatarJids = [...new Set([jid, replyJid, contactJid].filter((j) => j?.includes('@')))]
    if (!contactAvatar && avatarJids.length > 0) {
      try {
        const { data: avData } = await api.post('/extensions/whatsapp/command', {
          toolName: 'get_avatars',
          args: { jids: avatarJids }
        })
        contactAvatar =
          avData?.avatars?.[jid] ||
          avData?.avatars?.[replyJid] ||
          avData?.avatars?.[contactJid] ||
          null
        if (contactAvatar) {
          setAvatarByJid((prev) => ({ ...prev, [jid]: contactAvatar }))
        }
      } catch {}
    }

    const overlayData = {
      skillId: 'whatsapp',
      panel: 'dist/panel.js',
      panelType: 'whatsapp-panel',
      structuredResponse: {
        type: 'whatsapp-panel',
        data: {
          contact: convo.contactLabel,
          contactJid,
          message: contextMsg.text,
          isGroup,
          groupName,
          contactAvatar,
          quickReplies,
          conversationHistory
        }
      }
    }

    const openOverlay = (window as Window & { api?: { openOverlay?: (data: unknown) => void } }).api
      ?.openOverlay
    if (openOverlay) {
      openOverlay(overlayData)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  // First visit without session: enter pairing mode
  useEffect(() => {
    if (!statsLoaded || connected || qrUrl || pairingActive) return
    if (hasCredentials && connected) return
    beginPairing()
  }, [statsLoaded, connected, qrUrl, hasCredentials, pairingActive, beginPairing])

  // After disconnect / logout: poll until QR appears (worker may still be starting)
  useEffect(() => {
    if (!pairingActive || connected || qrUrl || syncingRef.current) return

    let cancelled = false
    const poll = async () => {
      for (let attempt = 0; attempt < 30 && !cancelled; attempt++) {
        await loadStats()
        // No `force: true` here either — see comment in requestQr.
        const gotQr = await requestQr()
        if (cancelled || gotQr || qrUrl) return
        await new Promise((r) => setTimeout(r, Math.min(400 + attempt * 80, 1200)))
      }
    }
    void poll()
    return () => {
      cancelled = true
    }
  }, [pairingActive, connected, qrUrl, loadStats, requestQr])

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

  // Safety: stop spinner if contacts_synced never arrives
  useEffect(() => {
    if (!syncing) return
    const timeout = setTimeout(() => setSyncing(false), 120_000)
    return () => clearTimeout(timeout)
  }, [syncing])

  useExtensionEvents({
    onEvent: useCallback(
      (event) => {
        if (event.eventType === 'qr_code' && event.data?.qr) {
          applyQrString(event.data.qr)
          setPairingActive(false)
        } else if (event.eventType === 'connection_status') {
          const status = event.data?.status
          if (status === 'connected') setConnected(true)
          else if (status === 'disconnected') setConnected(false)
        } else if (event.eventType === 'contacts_synced') {
          setSyncedContacts(event.data?.count || 0)
          void loadStats()
          void tryFinishContactSync(event.data?.count, event.data?.isFinal)
        } else if (event.eventType === 'contacts_updated') {
          void loadStats()
          if (syncingRef.current) void tryFinishContactSync()
          void loadPaginatedContacts(contactsPage, contactSearch)
          void loadPaginatedGroups(groupsPage, groupSearch)
          return
        } else if (event.eventType === 'history_loaded') {
          loadHistory()
          return
        } else if (event.eventType === 'authenticated') {
          const status = event.data?.status
          if (status === 'logged_out') {
            beginPairing()
            setConnected(false)
            setSyncing(false)
          } else if (status === 'connected') {
            setConnected(true)
            setPairingActive(false)
            setQrUrl(null)
            setSyncing(true)
            loadHistory()
          } else {
            setConnected(false)
          }
          return
        }
        refresh()
      },
      [
        refresh,
        loadHistory,
        applyQrString,
        tryFinishContactSync,
        loadStats,
        beginPairing,
        loadPaginatedContacts,
        loadPaginatedGroups,
        contactsPage,
        contactSearch,
        groupsPage,
        groupSearch
      ]
    )
  })

  return (
    <div className="flex-1 h-full flex flex-col min-h-0">
      <div className="shrink-0 px-6 pt-6 pb-4 w-full">
        <div className="flex items-center gap-3">
          <WhatsAppIcon className="w-8 h-8 shrink-0" />
          <h1 className="text-xl font-semibold">WhatsApp</h1>
          <div className="ml-auto flex items-center gap-2">
            {connected && (
              <div className="relative" ref={notificationDropdownRef}>
                <button
                  onClick={() => setShowNotificationDropdown(!showNotificationDropdown)}
                  className={`py-2 px-3 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 text-white transition-all flex items-center gap-2 group ${
                    showNotificationDropdown ? 'bg-white/10' : ''
                  }`}
                  title={notificationsDisabled ? 'Notificações desativadas' : 'Notificações ativas'}
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
                  <div className="absolute top-full mt-2 right-0 w-48 rounded-xl border border-white/10 bg-zinc-900 shadow-2xl z-[100] py-2 overflow-hidden animate-in fade-in zoom-in duration-200">
                    <button
                      onClick={() => {
                        if (notificationsDisabled) toggleNotifications()
                        setShowNotificationDropdown(false)
                      }}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                        !notificationsDisabled
                          ? 'bg-white/10 text-white'
                          : 'text-text-muted hover:bg-white/5'
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
                      Ativa
                    </button>
                    <button
                      onClick={() => {
                        if (!notificationsDisabled) toggleNotifications()
                        setShowNotificationDropdown(false)
                      }}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                        notificationsDisabled
                          ? 'bg-white/10 text-white'
                          : 'text-text-muted hover:bg-white/5'
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
                      Desativada
                    </button>
                  </div>
                )}
              </div>
            )}
            <button
              onClick={() => setShowAutomations(true)}
              className="p-1.5 rounded-lg border bg-white/5 border-white/10 hover:bg-white/10 text-text-muted hover:text-white transition-colors flex items-center justify-center"
              title="Automações"
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
                <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </button>
            {connected && (
              <button
                onClick={handleSync}
                disabled={syncing}
                className={`p-1.5 rounded-lg border transition-colors flex items-center justify-center ${
                  syncing
                    ? 'bg-accent/10 border-accent/30 text-accent cursor-wait'
                    : 'bg-white/5 border-white/10 hover:bg-white/10 text-text-muted hover:text-text disabled:opacity-50'
                }`}
                title={syncing ? 'Sincronizando contatos...' : 'Sincronizar contatos'}
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
            {connected && (
              <button
                onClick={disconnect}
                className="px-3 py-1.5 rounded-lg border border-red-500/20 bg-red-500/5 hover:bg-red-500/15 text-red-400 transition-colors flex items-center gap-2 group"
                title="Desconectar sessão"
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
                <span className="text-xs font-medium">Desconectar</span>
              </button>
            )}
          </div>{' '}
        </div>
      </div>

      {!connected && (
        <div className="flex-1 w-full flex flex-col items-center justify-center px-6 pb-8 text-center space-y-5 min-h-0">
          {qrUrl ? (
            <div className="space-y-4 flex flex-col items-center">
              <p className="text-sm text-text-muted max-w-sm">
                Escaneie o QR code com o WhatsApp do celular
              </p>
              <img
                src={qrUrl}
                alt="QR Code"
                className="block mx-auto rounded-xl p-2 bg-white border border-white/10 shadow-2xl"
                width={240}
                height={240}
              />
              <button
                type="button"
                onClick={reconnect}
                className="mt-2 py-2 px-5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-all duration-200 border border-emerald-500/30 hover:shadow-[0_0_15px_rgba(16,185,129,0.2)] cursor-pointer flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span>Gerar Novo QR Code</span>
              </button>
            </div>
          ) : (
            <div className="space-y-4 flex flex-col items-center">
              <div className="animate-pulse flex justify-center">
                <div className="w-48 h-48 rounded-xl bg-white/5 flex items-center justify-center border border-white/10">
                  <WhatsAppIcon className="w-16 h-16 opacity-30" />
                </div>
              </div>
              <p className="text-sm text-text-muted">Aguardando QR code...</p>
              <button
                type="button"
                onClick={reconnect}
                className="py-2 px-5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-all duration-200 border border-emerald-500/30 hover:shadow-[0_0_15px_rgba(16,185,129,0.2)] cursor-pointer flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span>Gerar Novo QR Code</span>
              </button>
            </div>
          )}
        </div>
      )}

      {connected && (
        <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-6 min-h-0">
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-xl border border-white/5 bg-card p-4">
              <p className="text-2xl font-bold">{totalMessages}</p>
              <p className="text-xs text-text-muted">Mensagens</p>
            </div>
            <div className="rounded-xl border border-white/5 bg-card p-4">
              <p className="text-2xl font-bold">{monitoredCount}</p>
              <p className="text-xs text-text-muted">Monitorados</p>
            </div>
            <div className="rounded-xl border border-white/5 bg-card p-4">
              <p className="text-2xl font-bold">{connected ? 'Online' : 'Offline'}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <div
                  className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`}
                />
                <p className="text-xs text-text-muted">
                  {connected ? 'Conectado' : 'Desconectado'}
                </p>
              </div>
            </div>
          </div>

          {(connected || allConversations.length > 0) && (
            <div className="rounded-xl border border-white/5 bg-card">
              <div className="px-4 py-3 border-b border-white/5 font-medium text-sm flex items-center justify-between">
                <span>Últimas Mensagens</span>
                <span className="text-xs text-text-muted">
                  {allConversations.length} conversa{allConversations.length !== 1 ? 's' : ''} ·
                  clique para responder
                </span>
              </div>
              {allConversations.length === 0 && (
                <div className="p-6 text-center text-sm text-text-muted">
                  Nenhuma mensagem recebida ainda
                </div>
              )}
              {conversations.map((convo) => {
                const msg = convo.latestIncoming
                const avatarName = convo.isGroup ? convo.groupName || 'Grupo' : convo.contactLabel
                return (
                  <div
                    key={convo.jid}
                    role="button"
                    tabIndex={0}
                    onClick={() => openConversationOverlay(convo)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        openConversationOverlay(convo)
                      }
                    }}
                    className="px-4 py-3 border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors cursor-pointer focus:outline-none focus:bg-white/10"
                    title="Ver conversa e responder"
                  >
                    <div className="flex gap-3">
                      <div onClick={(e) => e.stopPropagation()}>
                        <ContactAvatar src={convo.profilePicUrl} name={avatarName} id={convo.jid} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
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
                          {convo.incomingCount > 1 && (
                            <span className="text-xs px-1.5 py-0.5 rounded-full bg-white/10 text-text-muted shrink-0">
                              {convo.incomingCount} msgs
                            </span>
                          )}
                          {/^\d+$/.test(convo.contactLabel) && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                const newName = prompt('Digite o nome para este contato:', '')
                                if (newName?.trim()) {
                                  api
                                    .post('/extensions/whatsapp/command', {
                                      toolName: 'set_contact_name',
                                      args: {
                                        contact: convo.jid.split('@')[0],
                                        name: newName.trim()
                                      }
                                    })
                                    .then(() => refresh())
                                }
                              }}
                              className="text-xs text-accent hover:text-accent/80 px-1.5 py-0.5 rounded bg-accent/10 hover:bg-accent/20 shrink-0"
                              title="Definir nome para este contato"
                            >
                              ✏️ Nomear
                            </button>
                          )}
                          <span className="ml-auto text-xs text-text-muted shrink-0">
                            {formatTime(msg.timestamp)}
                          </span>
                        </div>
                        <p className="text-sm text-text-muted mt-0.5 line-clamp-2">{msg.text}</p>
                        {convo.latestReplies.map((reply, ri) => (
                          <div
                            key={`${reply.timestamp}-${ri}`}
                            className="mt-2 flex items-center gap-2.5 group/reply"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="flex flex-col items-center w-3 shrink-0">
                              <div className="h-1.5 w-px bg-white/10" />
                              <div className="w-2 h-2 rounded-full border border-white/20 bg-white/5 flex items-center justify-center">
                                <div className="w-1 h-1 rounded-full bg-white/20" />
                              </div>
                            </div>
                            <div className="flex-1 min-w-0 flex items-center gap-1.5">
                              <span className="text-xs text-text-muted font-bold shrink-0">
                                Você:
                              </span>
                              <span className="text-xs text-text-muted/70 truncate flex-1">
                                {reply.text}
                              </span>
                              <span className="text-[10px] font-medium text-text-muted/30 shrink-0">
                                {formatTime(reply.timestamp)}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )
              })}

              {conversationsTotalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-white/5">
                  <span className="text-xs text-text-muted">
                    Mostrando {(conversationsPage - 1) * conversationsPerPage + 1} a{' '}
                    {Math.min(conversationsPage * conversationsPerPage, allConversations.length)} de{' '}
                    {allConversations.length} conversas
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setConversationsPage((p) => Math.max(1, p - 1))}
                      disabled={conversationsPage === 1}
                      className="px-3 py-1.5 text-xs rounded-lg bg-white/5 text-text hover:bg-white/10 border border-white/5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      Anterior
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
                      Próximo
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {connected && (
            <>
              <div className="rounded-xl border border-white/5 bg-card">
                <div className="px-4 py-3 border-b border-white/5 font-medium text-sm flex items-center justify-between flex-wrap gap-2">
                  <span>Grupos do WhatsApp</span>
                  <div className="relative w-64">
                    <input
                      value={groupSearch}
                      onChange={(e) => setGroupSearch(e.target.value)}
                      placeholder="Buscar grupo..."
                      className="w-full bg-white/5 rounded-lg pl-3 pr-8 py-1.5 text-xs border border-white/10 outline-none focus:border-accent/50"
                    />
                    {groupsLoading && (
                      <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
                        <div className="w-3.5 h-3.5 border-2 border-accent/40 border-t-accent rounded-full animate-spin" />
                      </div>
                    )}
                  </div>
                </div>

                {paginatedGroups.length === 0 ? (
                  <div className="p-6 text-center text-sm text-text-muted">
                    {groupsLoading ? 'Carregando grupos...' : 'Nenhum grupo encontrado'}
                  </div>
                ) : (
                  <div className="divide-y divide-white/5">
                    {paginatedGroups.map((c) => (
                      <div
                        key={c.id}
                        className="px-4 py-3 flex items-center gap-3 hover:bg-white/5 transition-colors"
                      >
                        <ContactAvatar src={c.profilePicUrl} name={c.displayName} id={c.id} />
                        <div className="flex-1 min-w-0">
                          {editingName === c.id ? (
                            <input
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') saveContactName(c.id)
                                if (e.key === 'Escape') setEditingName(null)
                              }}
                              onBlur={() => saveContactName(c.id)}
                              autoFocus
                              className="w-full max-w-xs bg-white/10 rounded px-2 py-0.5 text-sm border border-accent/50 outline-none"
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
                            onClick={() => {
                              setEditingName(c.id)
                              setEditValue(c.displayName)
                            }}
                            className="text-text-muted hover:text-text p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                            title="Renomear"
                          >
                            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                              <path d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 0 1-.927-.928l.929-3.25c.081-.286.235-.547.445-.758l8.61-8.61Zm.176 4.823L9.75 4.81l-6.286 6.287a.253.253 0 0 0-.064.108l-.558 1.953 1.953-.558a.253.253 0 0 0 .108-.064Zm1.238-3.763a.25.25 0 0 0-.354 0L10.811 3.75l1.439 1.44 1.263-1.263a.25.25 0 0 0 0-.354Z" />
                            </svg>
                          </button>
                        )}

                        <div className="relative">
                          <button
                            onClick={() =>
                              setOpenMonitoringDropdown(
                                openMonitoringDropdown === c.id ? null : c.id
                              )
                            }
                            className={`py-1.5 px-3 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 text-white transition-all flex items-center gap-2 group ${
                              openMonitoringDropdown === c.id ? 'bg-white/10' : ''
                            }`}
                            title={c.monitoring ? 'Monitorado' : 'Ignorado'}
                          >
                            {c.monitoring ? (
                              <svg
                                width="16"
                                height="16"
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
                                width="16"
                                height="16"
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
                              width="12"
                              height="12"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className={`transition-transform duration-200 ${openMonitoringDropdown === c.id ? 'rotate-180' : ''}`}
                            >
                              <path d="m6 9 6 6 6-6" />
                            </svg>
                          </button>

                          {openMonitoringDropdown === c.id && (
                            <div className="absolute top-full mt-2 right-0 w-40 rounded-xl border border-white/10 bg-zinc-900 shadow-2xl z-[100] py-1.5 overflow-hidden animate-in fade-in zoom-in duration-200">
                              <button
                                onClick={() => {
                                  if (!c.monitoring) toggleMonitoring(c.id)
                                  setOpenMonitoringDropdown(null)
                                }}
                                className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors ${
                                  c.monitoring
                                    ? 'bg-white/10 text-white'
                                    : 'text-text-muted hover:bg-white/5'
                                }`}
                              >
                                <svg
                                  width="16"
                                  height="16"
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
                                Monitorado
                              </button>
                              <button
                                onClick={() => {
                                  if (c.monitoring) toggleMonitoring(c.id)
                                  setOpenMonitoringDropdown(null)
                                }}
                                className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors ${
                                  !c.monitoring
                                    ? 'bg-white/10 text-white'
                                    : 'text-text-muted hover:bg-white/5'
                                }`}
                              >
                                <svg
                                  width="16"
                                  height="16"
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
                                Ignorado
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {groupsTotalPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t border-white/5">
                    <span className="text-xs text-text-muted">
                      Mostrando {(groupsPage - 1) * groupsPerPage + 1} a{' '}
                      {Math.min(groupsPage * groupsPerPage, totalFilteredGroups)} de{' '}
                      {totalFilteredGroups} grupos
                    </span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setGroupsPage((p) => Math.max(1, p - 1))}
                        disabled={groupsPage === 1}
                        className="px-3 py-1.5 text-xs rounded-lg bg-white/5 text-text hover:bg-white/10 border border-white/5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        Anterior
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
                        Próximo
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-white/5 bg-card">
                <div className="px-4 py-3 border-b border-white/5 font-medium text-sm flex items-center justify-between flex-wrap gap-2">
                  <span>Contatos do WhatsApp</span>
                  <div className="relative w-64">
                    <input
                      value={contactSearch}
                      onChange={(e) => setContactSearch(e.target.value)}
                      placeholder="Buscar contato..."
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
                    {contactsLoading ? 'Carregando contatos...' : 'Nenhum contato encontrado'}
                  </div>
                ) : (
                  <div className="divide-y divide-white/5">
                    {paginatedContacts.map((c) => (
                      <div
                        key={c.id}
                        className="px-4 py-3 flex items-center gap-3 hover:bg-white/5 transition-colors"
                      >
                        <ContactAvatar src={c.profilePicUrl} name={c.displayName} id={c.id} />
                        <div className="flex-1 min-w-0">
                          {editingName === c.id ? (
                            <input
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') saveContactName(c.id)
                                if (e.key === 'Escape') setEditingName(null)
                              }}
                              onBlur={() => saveContactName(c.id)}
                              autoFocus
                              className="w-full max-w-xs bg-white/10 rounded px-2 py-0.5 text-sm border border-accent/50 outline-none"
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
                            onClick={() => {
                              setEditingName(c.id)
                              setEditValue(c.displayName)
                            }}
                            className="text-text-muted hover:text-text p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                            title="Renomear"
                          >
                            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                              <path d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 0 1-.927-.928l.929-3.25c.081-.286.235-.547.445-.758l8.61-8.61Zm.176 4.823L9.75 4.81l-6.286 6.287a.253.253 0 0 0-.064.108l-.558 1.953 1.953-.558a.253.253 0 0 0 .108-.064Zm1.238-3.763a.25.25 0 0 0-.354 0L10.811 3.75l1.439 1.44 1.263-1.263a.25.25 0 0 0 0-.354Z" />
                            </svg>
                          </button>
                        )}

                        <div className="relative">
                          <button
                            onClick={() =>
                              setOpenMonitoringDropdown(
                                openMonitoringDropdown === c.id ? null : c.id
                              )
                            }
                            className={`py-1.5 px-3 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 text-white transition-all flex items-center gap-2 group ${
                              openMonitoringDropdown === c.id ? 'bg-white/10' : ''
                            }`}
                            title={c.monitoring ? 'Monitorado' : 'Ignorado'}
                          >
                            {c.monitoring ? (
                              <svg
                                width="16"
                                height="16"
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
                                width="16"
                                height="16"
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
                              width="12"
                              height="12"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className={`transition-transform duration-200 ${openMonitoringDropdown === c.id ? 'rotate-180' : ''}`}
                            >
                              <path d="m6 9 6 6 6-6" />
                            </svg>
                          </button>

                          {openMonitoringDropdown === c.id && (
                            <div className="absolute top-full mt-2 right-0 w-40 rounded-xl border border-white/10 bg-zinc-900 shadow-2xl z-[100] py-1.5 overflow-hidden animate-in fade-in zoom-in duration-200">
                              <button
                                onClick={() => {
                                  if (!c.monitoring) toggleMonitoring(c.id)
                                  setOpenMonitoringDropdown(null)
                                }}
                                className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors ${
                                  c.monitoring
                                    ? 'bg-white/10 text-white'
                                    : 'text-text-muted hover:bg-white/5'
                                }`}
                              >
                                <svg
                                  width="16"
                                  height="16"
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
                                Monitorado
                              </button>
                              <button
                                onClick={() => {
                                  if (c.monitoring) toggleMonitoring(c.id)
                                  setOpenMonitoringDropdown(null)
                                }}
                                className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors ${
                                  !c.monitoring
                                    ? 'bg-white/10 text-white'
                                    : 'text-text-muted hover:bg-white/5'
                                }`}
                              >
                                <svg
                                  width="16"
                                  height="16"
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
                                Ignorado
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Pagination Controls */}
                {contactsTotalPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t border-white/5">
                    <span className="text-xs text-text-muted">
                      Mostrando {(contactsPage - 1) * contactsPerPage + 1} a{' '}
                      {Math.min(contactsPage * contactsPerPage, totalFilteredContacts)} de{' '}
                      {totalFilteredContacts} contatos
                    </span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setContactsPage((p) => Math.max(1, p - 1))}
                        disabled={contactsPage === 1}
                        className="px-3 py-1.5 text-xs rounded-lg bg-white/5 text-text hover:bg-white/10 border border-white/5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        Anterior
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
                        Próximo
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
      <AutomationsModal open={showAutomations} onClose={() => setShowAutomations(false)} />
    </div>
  )
}
