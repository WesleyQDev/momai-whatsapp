function shouldPreferSilentForCodeRequest(userText) {
  const text = String(userText || '').toLowerCase()
  if (!text) return false
  return /(c[óo]digo|code|html|css|javascript|typescript|react|vue|angular|sql|python|java|c\+\+|snippet)/i.test(
    text
  )
}

function containsCodeLikeContent(text) {
  const value = String(text || '')
  if (!value) return false
  if (/```[\s\S]*?```/.test(value)) return true
  if (/```/.test(value)) return true
  if (/<html[\s>]/i.test(value) || /<!doctype html>/i.test(value)) return true
  if (/<(div|span|section|header|main|script|style)[\s>]/i.test(value)) return true
  return false
}

function findFlushCut(pending) {
  for (let i = pending.length - 1; i >= 0; i -= 1) {
    const ch = pending[i]
    if (ch === '.' || ch === '!' || ch === '?' || ch === '\n' || ch === ';' || ch === ':') {
      return i + 1
    }
  }
  return -1
}

function shouldFlushTtsChunk({
  assembled,
  ttsCursor,
  speakResponse,
  silentForCodeIntent,
  stopGenerationRequested,
  generationMatch,
  closed,
  prebufferChars,
  final
}) {
  if (!speakResponse || silentForCodeIntent || stopGenerationRequested) return false
  if (!generationMatch || closed) return false
  if (containsCodeLikeContent(assembled)) return false
  const pending = assembled.slice(ttsCursor)
  if (!pending) return false
  if (!final && pending.length < prebufferChars) return false
  return true
}

module.exports = {
  shouldPreferSilentForCodeRequest,
  containsCodeLikeContent,
  findFlushCut,
  shouldFlushTtsChunk
}
