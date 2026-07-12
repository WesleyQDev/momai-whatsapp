function parseLlamaDataLine(line) {
  const payload = line.replace(/^data:\s*/, '').trim()
  if (!payload) return { type: 'skip' }
  if (payload === '[DONE]') return { type: 'done' }

  try {
    const json = JSON.parse(payload)
    if (json.error?.message) return { type: 'error', error: json.error.message }

    const choice = json.choices?.[0]
    const finishReason = choice?.finish_reason

    const delta = choice?.delta?.content
    const full = choice?.message?.content
    const token = typeof delta === 'string' ? delta : typeof full === 'string' ? full : ''

    const toolCalls = choice?.delta?.tool_calls
    if (Array.isArray(toolCalls) && toolCalls.length > 0) {
      return { type: 'tool_calls', tool_calls: toolCalls, finish_reason: finishReason }
    }

    if (finishReason === 'tool_calls' && choice?.message?.tool_calls) {
      return {
        type: 'tool_calls',
        tool_calls: choice.message.tool_calls,
        finish_reason: finishReason
      }
    }

    if (!token) return { type: 'skip', finish_reason: finishReason }
    return { type: 'token', token, finish_reason: finishReason }
  } catch {
    return { type: 'skip' }
  }
}

module.exports = { parseLlamaDataLine }
