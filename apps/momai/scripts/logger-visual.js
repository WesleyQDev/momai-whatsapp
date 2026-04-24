/**
 * Visual Logger - Component-based log blocks
 * Separates logs by component (model, chat, voice, etc.)
 * Uses simple visual blocks with icons and colors
 */

const RESET = '\x1b[0m'

const COMPONENTS = {
  model: { icon: '♦', color: '\x1b[35m', label: 'MODEL' },
  chat: { icon: '◊', color: '\x1b[36m', label: 'CHAT' },
  voice: { icon: '✺', color: '\x1b[33m', label: 'VOICE' },
  embedding: { icon: '◎', color: '\x1b[32m', label: 'EMBED' },
  system: { icon: '⚙', color: '\x1b[90m', label: 'SYS' },
  python: { icon: '🐍', color: '\x1b[34m', label: 'PY' }
}

const SEP = '────────────────────────────────────────'

function getTimestamp() {
  const now = new Date()
  const h = now.getHours().toString().padStart(2, '0')
  const m = now.getMinutes().toString().padStart(2, '0')
  const s = now.getSeconds().toString().padStart(2, '0')
  const ms = now.getMilliseconds().toString().padStart(3, '0')
  return `${h}:${m}:${s}.${ms}`
}

function detectComponent(message) {
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

function formatMessage(message) {
  const component = detectComponent(message)
  const style = COMPONENTS[component] || COMPONENTS.system
  const cleanMsg = message.replace(/^\[(DEBUG|INFO|WARN|ERROR)\]\s*/, '')
  return { component, style, cleanMsg }
}

function logBlock(component, lines) {
  const style = COMPONENTS[component] || COMPONENTS.system
  console.log(`\n${style.color}${style.icon} ${style.label}${RESET}`)
  console.log(`${style.color}${SEP}${RESET}`)
  lines.forEach((line) => {
    const text = typeof line === 'string' ? line : `${line.timestamp}  ${line.message}`
    console.log(`  ${style.color}${text}${RESET}`)
  })
  console.log(`${style.color}${SEP}${RESET}\n`)
}

function log(component, message, level = 'INFO') {
  const style = COMPONENTS[component] || COMPONENTS.system
  const timestamp = getTimestamp()
  const icon = level === 'ERROR' ? '✗' : level === 'WARN' ? '⚠' : '✔'
  console.log(`  ${timestamp}  ${style.icon} ${message} ${icon}`)
}

function info(message) {
  const { component, style, cleanMsg } = formatMessage(message)
  const timestamp = getTimestamp()
  console.log(`  ${timestamp}  ${style.color}${style.icon}${RESET} ${cleanMsg}`)
}

function warn(message) {
  const { component, style, cleanMsg } = formatMessage(message)
  const timestamp = getTimestamp()
  console.log(`  ${timestamp}  ${style.color}${style.icon}${RESET} ⚠ ${cleanMsg}`)
}

function error(message) {
  const { component, style, cleanMsg } = formatMessage(message)
  const timestamp = getTimestamp()
  console.log(`  ${timestamp}  ${style.color}${style.icon}${RESET} ✗ ${cleanMsg}`)
}

function debug(message) {
  const { component, style, cleanMsg } = formatMessage(message)
  const timestamp = getTimestamp()
  console.log(`  ${timestamp}  ${style.color}${style.icon}${RESET} ${cleanMsg}`)
}

module.exports = {
  log,
  info,
  warn,
  error,
  debug,
  logBlock,
  detectComponent,
  COMPONENTS
}
