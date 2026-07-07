const fs = require('node:fs')
const { TIERS_CONFIG_PATH } = require('./constants')
const { error } = require('../infrastructure/logger')

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
  } catch (err) {
    error('[NodeCore] Failed to parse ai_tiers.json:', err)
    return DEFAULT_TIERS
  }
}

module.exports = {
  DEFAULT_TIERS,
  loadTierConfig
}
