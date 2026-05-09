// Visual logger for component-based log blocks
let visualLogger = null
try {
  visualLogger = require('../../logger-visual.js')
} catch {
  // Visual logger not available, will use legacy logging
}

function log(...args) {
  const message = args.map((a) => (a instanceof Error ? a.stack || a.message : String(a))).join(' ')
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
    if (visualLogger && IS_STANDALONE) {
      visualLogger.debug(message)
    } else {
      log(`${prefix('DEBUG', COLORS.gray)}${message}`)
    }
  }
}

function info(message) {
  if (CURRENT_RANK <= LEVEL_RANK.info) {
    if (visualLogger && IS_STANDALONE) {
      visualLogger.info(message)
    } else {
      log(`${prefix('INFO', COLORS.cyan)}${message}`)
    }
  }
}

function warn(message) {
  if (CURRENT_RANK <= LEVEL_RANK.warn) {
    if (visualLogger && IS_STANDALONE) {
      visualLogger.warn(message)
    } else {
      log(`${prefix('WARN', COLORS.yellow)}${message}`)
    }
  }
}

function error(message) {
  if (CURRENT_RANK <= LEVEL_RANK.error) {
    if (visualLogger && IS_STANDALONE) {
      visualLogger.error(message)
    } else {
      log(`${prefix('ERROR', COLORS.red)}${message}`)
    }
  }
}

module.exports = {
  log,
  debug,
  info,
  warn,
  error,
  LOG_LEVEL,
  LEVEL_RANK,
  CURRENT_RANK,
  COLORS,
  getTimestamp,
  prefix,
  IS_STANDALONE,
  visualLogger
}
