const { execSync } = require('node:child_process')

// Force UTF-8 encoding for Windows console
if (process.platform === 'win32') {
  try {
    execSync('chcp 65001', { stdio: 'ignore' })
  } catch {}
  if (process.stdout) process.stdout.setDefaultEncoding('utf8')
  if (process.stderr) process.stderr.setDefaultEncoding('utf8')
}

function log(message) {
  if (typeof process.send === 'function') {
    process.send({ type: 'node-core-log', message })
  } else {
    console.log(message)
  }
}

const LOG_LEVEL = (process.env.LOG_LEVEL || 'info').toLowerCase()
const LEVEL_RANK = { debug: 0, info: 1, warn: 2, error: 3 }
const CURRENT_RANK = LEVEL_RANK[LOG_LEVEL] ?? 1

// ANSI color codes for console output (only used when running standalone)
const COLORS = {
  reset: '\x1b[0m',
  gray: '\x1b[90m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  magenta: '\x1b[35m'
}

function getTimestamp() {
  const now = new Date()
  const h = now.getHours().toString().padStart(2, '0')
  const m = now.getMinutes().toString().padStart(2, '0')
  const s = now.getSeconds().toString().padStart(2, '0')
  const ms = now.getMilliseconds().toString().padStart(3, '0')
  return `${h}:${m}:${s}.${ms}`
}

// When running under Electron, the parent process (electron-log) already adds timestamps.
// Only add timestamps when running standalone (no IPC channel).
const IS_STANDALONE = typeof process.send !== 'function'

function prefix(level, color) {
  if (IS_STANDALONE) {
    return `${COLORS.gray}${getTimestamp()}${COLORS.reset} ${color}[${level}]${COLORS.reset} `
  }
  return `[${level}] `
}

function debug(message) {
  if (CURRENT_RANK <= LEVEL_RANK.debug) {
    log(`${prefix('DEBUG', COLORS.gray)}${message}`)
  }
}

function info(message) {
  if (CURRENT_RANK <= LEVEL_RANK.info) {
    log(`${prefix('INFO', COLORS.cyan)}${message}`)
  }
}

function warn(message) {
  if (CURRENT_RANK <= LEVEL_RANK.warn) {
    log(`${prefix('WARN', COLORS.yellow)}${message}`)
  }
}

function error(message) {
  if (CURRENT_RANK <= LEVEL_RANK.error) {
    log(`${prefix('ERROR', COLORS.red)}${message}`)
  }
}

module.exports = {
  log,
  debug,
  info,
  warn,
  error,
  COLORS,
  getTimestamp,
  prefix,
  IS_STANDALONE
}
