const fs = require('node:fs')
const path = require('node:path')
const { resolveModelsDir } = require('./constants')

const TIERS_CONFIG_PATH = path.join(__dirname, '..', '..', '..', 'apps', 'momai', 'scripts', '..', '..', 'core', 'ai_tiers.json')

const DEFAULT_TIERS = {
  lite: {
    file: 'Qwen3.5-0.8B-Q4_K_M.gguf',
    repo: 'unsloth/Qwen3.5-0.8B-GGUF',
    enable_vision: false,
    ctx_size: 8192,
    request_ctx_size: 4096,
    gpu_layers: 99,
    temperature: 0.7,
    top_p: 0.8,
    top_k: 20,
    presence_penalty: 0.6,
    repetition_penalty: 1.05,
    max_tokens: 192
  },
  pro: {
    file: 'Qwen3.5-2B-Q4_K_M.gguf',
    repo: 'unsloth/Qwen3.5-2B-GGUF',
    enable_vision: false,
    ctx_size: 8192,
    request_ctx_size: 6144,
    gpu_layers: 99,
    temperature: 0.7,
    top_p: 0.8,
    top_k: 20,
    presence_penalty: 0.6,
    repetition_penalty: 1.05,
    max_tokens: 320
  },
  ultra: {
    file: 'Qwen3.5-4B-Q4_K_M.gguf',
    repo: 'unsloth/Qwen3.5-4B-GGUF',
    enable_vision: false,
    ctx_size: 8192,
    request_ctx_size: 8192,
    gpu_layers: 99,
    temperature: 0.7,
    top_p: 0.8,
    top_k: 20,
    presence_penalty: 0.6,
    repetition_penalty: 1.05,
    max_tokens: 512,
    embedding_file: 'LFM2.5-Embedding-350M-Q8_0.gguf',
    embedding_repo: 'LiquidAI/LFM2.5-Embedding-350M-GGUF'
  }
}

function loadTierConfig() {
  if (!fs.existsSync(TIERS_CONFIG_PATH)) return DEFAULT_TIERS
  try {
    const parsed = JSON.parse(fs.readFileSync(TIERS_CONFIG_PATH, 'utf8'))
    const merged = { ...DEFAULT_TIERS }
    for (const tierName of Object.keys(parsed || {})) {
      const tierValue = parsed[tierName]
      if (tierValue && typeof tierValue === 'object' && !Array.isArray(tierValue)) {
        merged[tierName] = {
          ...(DEFAULT_TIERS[tierName] || {}),
          ...tierValue
        }
      } else {
        merged[tierName] = tierValue
      }
    }
    return merged
  } catch (error) {
    console.error('[NodeCore] Failed to parse ai_tiers.json:', error)
    return DEFAULT_TIERS
  }
}

function resolveModelPath(tierConfig) {
  const configuredFile = String(tierConfig?.file || '').trim()
  if (!configuredFile) return null

  const MODELS_DIR = resolveModelsDir()
  const targetPath = path.join(MODELS_DIR, configuredFile)
  if (fs.existsSync(targetPath)) {
    return targetPath
  }

  return null
}

function resolveTierModelUrl(tierName, tierConfig) {
  const modelFile = String(tierConfig?.file || '').trim()
  if (!modelFile) return null

  const explicitUrl = String(tierConfig?.download_url || '').trim()
  if (explicitUrl) return explicitUrl

  const explicitBase = String(tierConfig?.download_base_url || '').trim()
  if (explicitBase) {
    const sep = explicitBase.includes('?') ? '&' : '?'
    return `${explicitBase.replace(/\/+$/, '')}/${encodeURIComponent(modelFile)}${sep}download=1`
  }

  const repo = String(tierConfig?.repo || '').trim()
  if (!repo) return null
  return `https://huggingface.co/${repo}/resolve/main/${encodeURIComponent(modelFile)}?download=1`
}

module.exports = {
  DEFAULT_TIERS,
  loadTierConfig,
  resolveModelPath,
  resolveTierModelUrl,
  TIERS_CONFIG_PATH
}
