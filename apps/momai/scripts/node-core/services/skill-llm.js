const { ensureLlamaReady, getLlamaBaseUrl } = require('./llama-manager')
const { loadTierConfig, DEFAULT_TIERS } = require('../config/tiers')

function estimateTokenCount(text) {
  const safe = String(text || '')
  if (!safe) return 0
  return Math.max(1, Math.ceil(safe.length / 4))
}

function computeDynamicMaxTokens(tierMaxTokens, estimatedPromptTokens, contextTotalTokens) {
  const total = Math.max(512, Number(contextTotalTokens || 8192))
  const prompt = Math.max(0, Number(estimatedPromptTokens || 0))
  const reserve = Math.max(96, Math.floor(total * 0.06))
  const available = Math.max(64, total - prompt - reserve)
  const hardCap = Math.max(256, Math.min(3072, Math.floor(total * 0.35)))
  const desired = Math.max(64, Number(tierMaxTokens || 512))
  const candidate = Math.min(available, hardCap)
  if (candidate >= desired) return desired
  if (candidate >= 160) return candidate
  return Math.max(64, candidate)
}

function createSkillLlmHelper({ llamaState, tierName, temperature } = {}) {
  const tiersConfig = loadTierConfig()
  const tier = tiersConfig[tierName || 'ultra'] || tiersConfig.ultra || DEFAULT_TIERS.ultra

  return {
    async completeText({ system, user, maxTokens, topP } = {}) {
      const ready = await ensureLlamaReady()
      if (!ready) {
        throw new Error('Local model unavailable for skill execution.')
      }

      const messages = [
        { role: 'system', content: String(system || '').trim() },
        { role: 'user', content: String(user || '').trim() }
      ]
      const estimatedPromptTokens = messages.reduce(
        (acc, msg) => acc + estimateTokenCount(msg.content),
        0
      )
      const requestBody = {
        model: 'gpt-4o',
        stream: false,
        temperature: Number.isFinite(temperature) ? temperature : Number(tier.temperature || 0.4),
        top_p: Number.isFinite(topP) ? topP : Number(tier.top_p || 0.9),
        max_tokens: computeDynamicMaxTokens(
          Number(maxTokens || tier.max_tokens || 900),
          estimatedPromptTokens,
          Number(llamaState?.contextTotalTokens || 16384)
        ),
        messages
      }

      const response = await fetch(`${getLlamaBaseUrl()}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      })

      if (!response.ok) {
        const txt = await response.text().catch(() => '')
        throw new Error(`llama HTTP ${response.status}: ${txt.slice(0, 240)}`)
      }

      const json = await response.json()
      const choice = json?.choices?.[0]
      const text = String(choice?.message?.content || '').trim()
      return {
        text,
        finishReason: choice?.finish_reason || null
      }
    }
  }
}

module.exports = { createSkillLlmHelper }
