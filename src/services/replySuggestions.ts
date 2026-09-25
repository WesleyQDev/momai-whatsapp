export interface ReplySuggestionContext {
  contactName?: string
  contactJid?: string
  isGroup?: boolean
  latestMessage?: string
  history?: Array<{ direction?: string; text?: string; from?: string }>
  language?: string
}

export interface ReplySuggestionLlm {
  has?: (method: string) => boolean
  completeJson?: <T = any>(opts: {
    system?: string
    user?: string
    temperature?: number
    maxTokens?: number
    timeoutMs?: number
  }) => Promise<{ data: T }>
  complete?: (opts: {
    system?: string
    user?: string
    temperature?: number
    maxTokens?: number
    timeoutMs?: number
  }) => Promise<{ text: string }>
}

export interface ReplySuggestionApi {
  post?: (path: string, body?: Record<string, unknown>) => Promise<unknown>
}

export interface ReplySuggestionCache {
  get(key: string): string[] | null
  set(key: string, value: string[]): void
}

export const REPLY_SUGGESTIONS_CACHE_TTL_MS = 30000

const MAX_HISTORY_LINES = 8
const MAX_SUGGESTIONS = 3
const MAX_SUGGESTION_CHARS = 120
const MAX_ATTEMPTS = 2
const RETRY_DELAY_MS = 700

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function buildReplySuggestionPrompt(ctx: ReplySuggestionContext): {
  system: string
  user: string
} {
  const language = ctx.language || 'pt-BR'
  const lines = (ctx.history || [])
    .filter((line) => line && typeof line.text === 'string' && line.text.trim())
    .slice(-MAX_HISTORY_LINES)
    .map((line) => {
      const text = String(line.text).trim()
      if (line.direction === 'outgoing') return `Eu: ${text}`
      const speaker = String(line.from || '').trim()
      return isGenericSpeaker(speaker) ? text : `${speaker}: ${text}`
    })
  const latest = String(ctx.latestMessage || '').trim()
  const transcript =
    lines.length > 0 ? lines.join('\n') : latest ? `Última mensagem recebida: "${latest}"` : ''
  const counterpart = ctx.isGroup ? 'Grupo' : 'Conversa com'
  const header = ctx.contactName ? `${counterpart}: ${ctx.contactName}` : ''

  const system = [
    'Você sugere respostas curtas de WhatsApp para o usuário enviar.',
    `Responda no idioma "${language}".`,
    'Gere de 2 a 3 sugestões curtas, cada uma com no máximo 80 caracteres.',
    'Inclua variedade: uma pergunta, uma confirmação e uma ação objetiva.',
    'Use o contexto da conversa e não invente fatos nem preços.',
    "Nunca use rótulos como 'Contato' ou 'Participante' como nome de pessoa; se não souber o nome, não se dirija pelo nome.",
    ctx.isGroup
      ? 'É um grupo: considere quem enviou a última mensagem ao sugerir a resposta.'
      : '',
    'Responda APENAS com JSON no formato {"suggestions": ["...", "..."]}.'
  ]
    .filter(Boolean)
    .join(' ')

  const user = [
    header,
    transcript ? `Últimas mensagens:\n${transcript}` : ''
  ]
    .filter(Boolean)
    .join('\n\n')

  return { system, user }
}

export function sanitizeSuggestions(raw: unknown, max = MAX_SUGGESTIONS): string[] {
  const records = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray((raw as { suggestions?: unknown }).suggestions)
      ? ((raw as { suggestions: unknown[] }).suggestions as unknown[])
      : []

  const out: string[] = []
  for (const item of records) {
    if (typeof item !== 'string') continue
    const value = item.replace(/\s+/g, ' ').trim()
    if (!value) continue
    const clipped =
      value.length > MAX_SUGGESTION_CHARS ? value.slice(0, MAX_SUGGESTION_CHARS).trim() : value
    if (!out.includes(clipped)) out.push(clipped)
    if (out.length >= max) break
  }
  return out
}

export function createReplySuggestionCache(
  ttlMs = REPLY_SUGGESTIONS_CACHE_TTL_MS,
  now: () => number = () => Date.now()
): ReplySuggestionCache {
  const store = new Map<string, { value: string[]; expiresAt: number }>()
  return {
    get(key: string): string[] | null {
      const entry = store.get(key)
      if (!entry) return null
      if (now() >= entry.expiresAt) {
        store.delete(key)
        return null
      }
      return entry.value
    },
    set(key: string, value: string[]): void {
      store.set(key, { value, expiresAt: now() + ttlMs })
    }
  }
}

export function replySuggestionCacheKey(ctx: ReplySuggestionContext): string {
  const last = String(ctx.latestMessage || '').trim()
  const history = ctx.history || []
  const tail = history.length > 0 ? String(history[history.length - 1]?.text || '').trim() : ''
  return `${ctx.contactJid || ctx.contactName || 'unknown'}|${last}|${tail}|${ctx.language || ''}`
}

function hasContext(ctx: ReplySuggestionContext): boolean {
  if (String(ctx.latestMessage || '').trim()) return true
  return (ctx.history || []).some((line) => line && typeof line.text === 'string' && line.text.trim())
}

// Tolerant JSON extraction: models often wrap the payload in prose or fences.
export function extractJson(text: unknown): unknown {
  const value = String(text || '').trim()
  if (!value) return undefined
  const fenced = value.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = (fenced ? fenced[1] : value).trim()
  try {
    return JSON.parse(candidate)
  } catch {
    // Fall through to the brace/bracket extraction below.
  }
  const start = candidate.search(/[[{]/)
  if (start === -1) return undefined
  const end = Math.max(candidate.lastIndexOf('}'), candidate.lastIndexOf(']'))
  if (end <= start) return undefined
  try {
    return JSON.parse(candidate.slice(start, end + 1))
  } catch {
    return undefined
  }
}

function methodAvailable(llm: ReplySuggestionLlm, method: string): boolean {
  if (typeof llm.has !== 'function') return true
  return llm.has(method)
}

// Placeholders from the UI/history must never reach the model as if they were
// a person's name — otherwise it starts replies with "Contato, ...".
const GENERIC_SPEAKERS = new Set([
  'contato',
  'contact',
  'participante',
  'participant',
  'grupo',
  'group',
  'unknown',
  'desconhecido',
  'sem nome',
  'voce',
  'você'
])

function isGenericSpeaker(speaker: string): boolean {
  return !speaker || GENERIC_SPEAKERS.has(speaker.toLowerCase())
}

// Small local models often wrap JSON in prose, use bullet lists or add
// numbering. Accept all of them instead of failing the whole request.
function parseLineSuggestions(text: unknown, max = MAX_SUGGESTIONS): string[] {
  const lines = String(text || '').split(/\r?\n/)
  const cleaned = lines
    .map((line) =>
      line
        .replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '')
        .replace(/^["'`]+|["'`]+$/g, '')
        .trim()
    )
    .filter(
      (line) =>
        line.length > 0 &&
        line.length <= MAX_SUGGESTION_CHARS &&
        // Never surface JSON/brackets fragments as a suggestion.
        !/[{}[\]"]/.test(line)
    )
  return sanitizeSuggestions(cleaned, max)
}

function parseSuggestionsText(text: unknown): string[] {
  const fromJson = sanitizeSuggestions(extractJson(text))
  if (fromJson.length > 0) return fromJson
  return parseLineSuggestions(text)
}

async function requestSuggestions(
  llm: ReplySuggestionLlm,
  system: string,
  user: string
): Promise<string[]> {
  const opts = { system, user, temperature: 0.5, maxTokens: 160, timeoutMs: 15000, format: 'json' }
  // `complete` returns the raw text, so we can parse it tolerantly even when
  // the model does not produce strict JSON.
  if (typeof llm.complete === 'function' && methodAvailable(llm, 'llm.complete')) {
    const result = await llm.complete(opts)
    const parsed = parseSuggestionsText(result?.text)
    if (parsed.length > 0) return parsed
  }
  if (typeof llm.completeJson === 'function' && methodAvailable(llm, 'llm.completeJson')) {
    const result = await llm.completeJson(opts)
    const parsed = sanitizeSuggestions(result?.data)
    if (parsed.length > 0) return parsed
  }
  return []
}

// Overlay windows may only expose the minimal SDK shim (api/events/overlay)
// without `llm` — fall back to the raw host route the same way the panel
// already expands quick replies.
function unwrapApiResponse(response: unknown): Record<string, unknown> | null {
  if (!response || typeof response !== 'object') return null
  const record = response as Record<string, unknown>
  if ('data' in record && record.data !== undefined) {
    return (record.data || null) as Record<string, unknown> | null
  }
  return record
}

async function requestSuggestionsViaApi(
  api: ReplySuggestionApi,
  system: string,
  user: string
): Promise<string[]> {
  if (!api || typeof api.post !== 'function') return []
  const response = await api.post('/extensions/llm/complete', {
    system,
    user,
    format: 'json',
    temperature: 0.5,
    maxTokens: 160
  })
  const data = unwrapApiResponse(response)
  if (!data) return []
  const text = typeof data.text === 'string' ? data.text : ''
  if (data.json !== undefined) {
    const fromJson = sanitizeSuggestions(data.json)
    if (fromJson.length > 0) return fromJson
  }
  return parseSuggestionsText(text)
}

export async function generateReplySuggestions(
  llm: ReplySuggestionLlm | null | undefined,
  ctx: ReplySuggestionContext,
  options: { cache?: ReplySuggestionCache; fallback?: string[]; api?: ReplySuggestionApi } = {}
): Promise<string[]> {
  const fallback = (options.fallback || []).filter(
    (suggestion) => typeof suggestion === 'string' && suggestion.trim()
  )
  const canApi = Boolean(options.api && typeof options.api.post === 'function')
  const canJson = Boolean(
    llm && typeof llm.completeJson === 'function' && methodAvailable(llm, 'llm.completeJson')
  )
  const canText = Boolean(
    llm && typeof llm.complete === 'function' && methodAvailable(llm, 'llm.complete')
  )
  if (!canJson && !canText && !canApi) return fallback
  if (!hasContext(ctx)) return fallback

  const cache = options.cache
  const key = replySuggestionCacheKey(ctx)
  if (cache) {
    const cached = cache.get(key)
    if (cached && cached.length > 0) return cached
  }

  const { system, user } = buildReplySuggestionPrompt(ctx)
  let lastError: unknown = null
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      let suggestions = canJson || canText ? await requestSuggestions(llm!, system, user) : []
      if (suggestions.length === 0 && canApi) {
        suggestions = await requestSuggestionsViaApi(options.api!, system, user)
      }
      if (suggestions.length > 0) {
        if (cache) cache.set(key, suggestions)
        return suggestions
      }
    } catch (err) {
      lastError = err
    }
    if (attempt < MAX_ATTEMPTS) await delay(RETRY_DELAY_MS)
  }
  console.warn(
    '[replySuggestions] falling back:',
    lastError ? (lastError as Error)?.message || lastError : 'model returned no usable suggestions'
  )
  return fallback
}
