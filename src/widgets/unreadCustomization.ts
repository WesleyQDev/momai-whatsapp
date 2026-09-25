import ptBR from '../../locales/pt-BR.json'
import enUS from '../../locales/en-US.json'
import es from '../../locales/es.json'
import fr from '../../locales/fr.json'
import de from '../../locales/de.json'
import it from '../../locales/it.json'

export const DEFAULT_UNREAD_LIMIT = 3

export const UNREAD_LIMIT_CHOICES = ['2', '3', '5']

const DICTIONARIES: Record<string, Record<string, unknown>> = {
  'pt-BR': ptBR as Record<string, unknown>,
  'en-US': enUS as Record<string, unknown>,
  es: es as Record<string, unknown>,
  fr: fr as Record<string, unknown>,
  de: de as Record<string, unknown>,
  it: it as Record<string, unknown>
}

// Synchronous lookup for the module-level customization static, which cannot
// call the i18n hook. Mirrors the hook locale resolution with a pt-BR
// fallback, then falls back to the key itself.
export function translateWidget(key: string): string {
  let locale = 'pt-BR'
  try {
    if (typeof window !== 'undefined') {
      const raw =
        (window as any).__MOMAI_LOCALE__ || localStorage.getItem('momai_locale') || 'pt-BR'
      if (typeof raw === 'string' && raw in DICTIONARIES) locale = raw
    }
  } catch {}
  const parts = key.split('.')
  let current: unknown = DICTIONARIES[locale] || DICTIONARIES['pt-BR']
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      current = undefined
      break
    }
    current = (current as Record<string, unknown>)[part]
  }
  if (typeof current === 'string') return current
  return key
}

export function resolveUnreadLimit(config?: Record<string, unknown> | null): number {
  const raw = (config as { limit?: number | string } | undefined)?.limit
  const parsed = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_UNREAD_LIMIT
  return Math.floor(parsed)
}

export function isUnreadConfigCustomized(config?: Record<string, unknown> | null): boolean {
  const raw = (config as { limit?: number | string } | undefined)?.limit
  if (raw === undefined || raw === null || raw === '') return false
  return Number(raw) !== DEFAULT_UNREAD_LIMIT
}

export const WHATSAPP_UNREAD_CUSTOMIZATION = {
  isCustomized: (config?: Record<string, unknown>) => isUnreadConfigCustomized(config),
  title: translateWidget('widget.unread.customizeTitle'),
  defaults: {},
  options: [
    {
      key: 'limit',
      kind: 'select',
      label: translateWidget('widget.unread.limit'),
      options: UNREAD_LIMIT_CHOICES.map((value) => ({ value, label: value }))
    }
  ]
}
