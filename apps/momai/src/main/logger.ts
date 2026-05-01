import log from 'electron-log'
import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'
import { TuiLogger } from './logger-tui'

let logsDir: string
try {
  logsDir = join(app.getPath('userData'), 'logs')
} catch {
  logsDir = join(process.cwd(), 'logs')
}

try {
  if (!existsSync(logsDir)) {
    mkdirSync(logsDir, { recursive: true })
  }
} catch (e) {
  console.error('Failed to create logs directory:', e)
}

log.transports.file.resolvePathFn = () => join(logsDir, 'main.log')
log.transports.file.maxSize = 5 * 1024 * 1024
log.transports.file.level = 'info'
log.transports.console.level = 'debug'

// Format file logs without colors (plain text)
log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}'

// ── Component-based visual logging ──────────────────────────
const COMPONENT_STYLES: Record<string, { icon: string; color: string }> = {
  model: { icon: '♦', color: '\x1b[35m' },
  chat: { icon: '◊', color: '\x1b[36m' },
  voice: { icon: '✺', color: '\x1b[33m' },
  embedding: { icon: '◎', color: '\x1b[32m' },
  python: { icon: '🐍', color: '\x1b[34m' },
  system: { icon: '⚙', color: '\x1b[90m' }
}
const RESET = '\x1b[0m'

function getTimestamp(): string {
  const now = new Date()
  const h = now.getHours().toString().padStart(2, '0')
  const m = now.getMinutes().toString().padStart(2, '0')
  const s = now.getSeconds().toString().padStart(2, '0')
  const ms = now.getMilliseconds().toString().padStart(3, '0')
  return `${h}:${m}:${s}.${ms}`
}

function detectComponent(message: string): string {
  const msg = message.toLowerCase()
  if (msg.includes('[llama]') || msg.includes('model') || msg.includes('llama-server'))
    return 'model'
  if (msg.includes('[chat]') || msg.includes('streamllamachat') || msg.includes('assistant'))
    return 'chat'
  if (msg.includes('[voice]') || msg.includes('tts') || msg.includes('wake') || msg.includes('stt'))
    return 'voice'
  if (msg.includes('[embedding]') || msg.includes('semantic')) return 'embedding'
  if (msg.includes('[python]') || msg.includes('sidecar')) return 'python'
  return 'system'
}

function visualLog(message: string) {
  const component = detectComponent(message)
  const style = COMPONENT_STYLES[component] || COMPONENT_STYLES.system
  const cleanMsg = message.replace(/^\[(DEBUG|INFO|WARN|ERROR)\]\s*/, '')
  const timestamp = getTimestamp()
  console.log(`  ${timestamp}  ${style.color}${style.icon}${RESET} ${cleanMsg}`)
}

const recentLogCache = new Map<string, number>()
const LOG_DEDUP_MS = 120
const LOG_DEDUP_MAX = 500

function shouldEmitLogLine(text: string): boolean {
  const line = String(text || '').trim()
  if (!line) return false
  const now = Date.now()
  const last = recentLogCache.get(line)
  if (last && now - last < LOG_DEDUP_MS) return false
  recentLogCache.set(line, now)

  if (recentLogCache.size > LOG_DEDUP_MAX) {
    for (const [key, ts] of recentLogCache) {
      if (now - ts > LOG_DEDUP_MS * 4) recentLogCache.delete(key)
      if (recentLogCache.size <= LOG_DEDUP_MAX) break
    }
  }
  return true
}

// ── TUI mode ────────────────────────────────────────────────
const useTui = process.env.TUI_LOGS === '1' || process.env.TUI_LOGS === 'true'

let tui: TuiLogger | undefined

if (useTui) {
  tui = new TuiLogger('MomAI')

  // Intercept console.* so TUI tables capture everything
  console.log = (...args: unknown[]) => {
    tui!.log('info', args.map(String).join(' '))
  }
  console.info = (...args: unknown[]) => {
    tui!.log('info', args.map(String).join(' '))
  }
  console.warn = (...args: unknown[]) => {
    tui!.log('warn', args.map(String).join(' '))
  }
  console.error = (...args: unknown[]) => {
    tui!.log('error', args.map(String).join(' '))
  }

  // Hook electron-log console transport so table rendering wins
  log.transports.console.level = false
  const tuiHookKey = '__momaiTuiHookInstalled'
  if (!(log as any)[tuiHookKey]) {
    ;(log as any)[tuiHookKey] = true
    log.hooks.push((msg) => {
      const level = String(msg.level).toLowerCase()
      const text = String(msg.data.join(' '))
      if (!shouldEmitLogLine(text)) return false
      tui!.log(level as any, text)
      return msg // return msg so file transport gets it
    })
  }
} else {
  // Component-based visual format
  log.transports.console.level = false // disable default console
  // Guard against duplicate hooks (e.g., during dev reloads)
  const hookKey = '__momaiVisualHookInstalled'
  if (!(log as any)[hookKey]) {
    ;(log as any)[hookKey] = true
    log.hooks.push((msg) => {
      const text = msg.data.map((d: any) => String(d)).join(' ')
      if (!shouldEmitLogLine(text)) return false
      visualLog(text)
      return msg // return the message so file transport still gets it!
    })
  }
}

log.variables.version = app.getVersion()

log.info('[Bootstrap] Logging initialized')
log.info(`[Bootstrap] Log file: ${join(logsDir, 'main.log')}`)

export const logger = log

export function getLogsPath(): string {
  return logsDir
}

export function getMainLogPath(): string {
  return join(logsDir, 'main.log')
}
