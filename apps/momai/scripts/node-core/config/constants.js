const path = require('node:path')
const { execSync } = require('node:child_process')

// Force UTF-8 encoding for Windows console
if (process.platform === 'win32') {
  try {
    // Set console code page to UTF-8 (65001)
    execSync('chcp 65001', { stdio: 'ignore' })
  } catch {}
  // Set stdout/stderr to UTF-8
  if (process.stdout) process.stdout.setDefaultEncoding('utf8')
  if (process.stderr) process.stderr.setDefaultEncoding('utf8')
}

const HOST = process.env.MOMAI_NODE_CORE_HOST || '127.0.0.1'
const PORT = Number(process.env.MOMAI_NODE_CORE_PORT || 8000)
const DATA_DIR = process.env.MOMAI_NODE_CORE_DATA_DIR || path.join(process.cwd(), 'data')
const STORE_FILE = path.join(DATA_DIR, 'node-core-store.json')
const CORE_PATH =
  process.env.MOMAI_CORE_PATH || path.resolve(__dirname, '..', '..', '..', '..', 'core')
const MODELS_DIR = resolveModelsDir()
const LLAMA_BIN_CANDIDATES = [
  process.env.MOMAI_LLAMA_BIN_PATH,
  path.resolve(__dirname, '..', '..', '..', 'bin', 'llama'),
  process.resourcesPath ? path.join(process.resourcesPath, 'bin', 'llama') : null,
  process.resourcesPath
    ? path.join(process.resourcesPath, 'app.asar.unpacked', 'bin', 'llama')
    : null
].filter(Boolean)
const TIERS_CONFIG_PATH = path.join(CORE_PATH, 'ai_tiers.json')
const MODEL_DOWNLOAD_TIMEOUT_MS = Number(
  process.env.MOMAI_MODEL_DOWNLOAD_TIMEOUT_MS || 15 * 60 * 1000
)

const PYTHON_HOST = process.env.MOMAI_PYTHON_SIDECAR_HOST || '127.0.0.1'
const PYTHON_PORT = Number(process.env.MOMAI_PYTHON_SIDECAR_PORT || 8001)
const PYTHON_BASE_URL = `http://${PYTHON_HOST}:${PYTHON_PORT}`

const LLAMA_HOST = '127.0.0.1'
const LLAMA_PORT = Number(process.env.MOMAI_LLAMA_PORT || 8080)
const EMBEDDING_PORT = Number(process.env.MOMAI_EMBEDDING_PORT || 8081)
const EMBEDDING_BASE_URL = `http://${LLAMA_HOST}:${EMBEDDING_PORT}`

const NOTES_DIR = path.join(DATA_DIR, 'notes')
const NOTES_INDEX_FILE = path.join(NOTES_DIR, '.index.json')
const SEMANTIC_DIR = path.join(DATA_DIR, 'semantic')
const SEMANTIC_DB_DIR = path.join(SEMANTIC_DIR, 'lancedb')
const PROMPTS_DIR = path.resolve(__dirname, '..', '..', '..', 'prompts')

const MAX_EMBEDDING_CACHE_SIZE = 512
const EMBEDDING_CACHE_TTL_MS = 10 * 60 * 1000
const EMBEDDING_TIMEOUT_MS = 8000
const SEMANTIC_SYNC_INTERVAL_MS = 30 * 1000

const THREAD_RETENTION_DAYS = Number(process.env.MOMAI_THREAD_RETENTION_DAYS) || 90
const REMINDER_RETENTION_DAYS = Number(process.env.MOMAI_REMINDER_RETENTION_DAYS) || 30

function resolveModelsDir() {
  const envPath = String(process.env.MOMAI_MODELS_DIR || '').trim()
  if (envPath) return envPath
  if (process.resourcesPath) {
    const packagedCorePath = path.join(process.resourcesPath, 'core')
    if (CORE_PATH === packagedCorePath || CORE_PATH.startsWith(packagedCorePath + path.sep)) {
      return path.join(DATA_DIR, 'models')
    }
  }
  return path.join(CORE_PATH, 'models')
}

module.exports = {
  HOST,
  PORT,
  DATA_DIR,
  STORE_FILE,
  CORE_PATH,
  MODELS_DIR,
  LLAMA_BIN_CANDIDATES,
  TIERS_CONFIG_PATH,
  MODEL_DOWNLOAD_TIMEOUT_MS,
  PYTHON_HOST,
  PYTHON_PORT,
  PYTHON_BASE_URL,
  LLAMA_HOST,
  LLAMA_PORT,
  EMBEDDING_PORT,
  EMBEDDING_BASE_URL,
  NOTES_DIR,
  NOTES_INDEX_FILE,
  SEMANTIC_DIR,
  SEMANTIC_DB_DIR,
  PROMPTS_DIR,
  MAX_EMBEDDING_CACHE_SIZE,
  EMBEDDING_CACHE_TTL_MS,
  EMBEDDING_TIMEOUT_MS,
  SEMANTIC_SYNC_INTERVAL_MS,
  THREAD_RETENTION_DAYS,
  REMINDER_RETENTION_DAYS,
  resolveModelsDir
}
