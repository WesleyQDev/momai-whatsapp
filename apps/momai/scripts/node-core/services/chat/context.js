const { sanitizePromptText } = require('../../utils/text')

function estimateTokenCount(text) {
  const safe = String(text || '')
  if (!safe) return 0
  return Math.max(1, Math.ceil(safe.length / 3))
}

async function tokenizePrompt(messages, getLlamaBaseUrl) {
  try {
    const text = messages.map((m) => `${m.role}: ${m.content}`).join('\n')
    const resp = await fetch(`${getLlamaBaseUrl()}/v1/tokenize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: text })
    })
    if (!resp.ok) return null
    const data = await resp.json()
    if (Array.isArray(data.tokens)) return data.tokens.length
    return null
  } catch {
    return null
  }
}

function trimMessageForContext(text, maxChars = 900) {
  const clean = sanitizePromptText(String(text || '').trim())
  if (clean.length <= maxChars) return clean
  return `${clean.slice(0, maxChars)}...`
}

function buildCompactedMessages(systemMessage, currentMessages, userContent = '') {
  const compactSystem = {
    ...systemMessage,
    content: trimMessageForContext(systemMessage.content, 1200)
  }
  const compactHistory = currentMessages
    .filter((m) => m.role !== 'system')
    .slice(-2)
    .map((m) => ({ ...m, content: trimMessageForContext(m.content, 700) }))
  const hasUser = compactHistory.some((m) => m.role === 'user')
  if (!hasUser) {
    compactHistory.push({
      role: 'user',
      content: trimMessageForContext(userContent, 700)
    })
  }
  return [compactSystem, ...compactHistory]
}

function buildHistoryWithinBudget(messages, tokenBudget) {
  const safeBudget = Math.max(200, Number(tokenBudget || 0))
  const normalized = (Array.isArray(messages) ? messages : [])
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant'))
    .map((m) => {
      const maxChars = m.role === 'assistant' ? 520 : 820
      return {
        role: m.role,
        content: trimMessageForContext(m.content, maxChars)
      }
    })

  const picked = []
  let consumed = 0
  let hasUser = false

  for (let i = normalized.length - 1; i >= 0; i -= 1) {
    const msg = normalized[i]
    const cost = estimateTokenCount(msg.content)
    if (picked.length > 0 && consumed + cost > safeBudget) continue
    picked.unshift(msg)
    consumed += cost
    if (msg.role === 'user') hasUser = true
    if (consumed >= safeBudget) break
  }

  if (!hasUser) {
    const lastUser = [...normalized].reverse().find((m) => m.role === 'user')
    if (lastUser) picked.push(lastUser)
  }

  return picked
}

function computeDynamicMaxTokens(tierMaxTokens, estimatedPromptTokens, contextTotalTokens) {
  const total = Math.max(512, Number(contextTotalTokens || 2048))
  const prompt = Math.max(0, Number(estimatedPromptTokens || 0))
  const reserve = Math.max(96, Math.floor(total * 0.06))
  const available = Math.max(64, total - prompt - reserve)
  const hardCap = Math.max(256, Math.min(3072, Math.floor(total * 0.35)))
  const desired =
    total >= 12000
      ? Math.max(Number(tierMaxTokens || 0), 1200)
      : total >= 8000
        ? Math.max(Number(tierMaxTokens || 0), 900)
        : Math.max(Number(tierMaxTokens || 0), 600)

  const candidate = Math.min(available, hardCap)
  if (candidate >= desired) return desired
  if (candidate >= 160) return candidate
  return Math.max(64, candidate)
}

module.exports = {
  estimateTokenCount,
  tokenizePrompt,
  trimMessageForContext,
  buildCompactedMessages,
  buildHistoryWithinBudget,
  computeDynamicMaxTokens
}
