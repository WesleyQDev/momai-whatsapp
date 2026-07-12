const LATIN_LANGUAGE_HINTS = {
  'pt-BR': [
    'oi',
    'ola',
    'olá',
    'você',
    'voce',
    'pra',
    'não',
    'nao',
    'como',
    'obrigado',
    'obrigada',
    'tudo bem',
    'quero'
  ],
  en: [
    'hello',
    'hi',
    'please',
    'thanks',
    'thank you',
    'can you',
    'could you',
    'what',
    'why',
    'how',
    'the',
    'and'
  ],
  es: [
    'hola',
    'gracias',
    'por favor',
    'puedes',
    'puede',
    'como',
    'cómo',
    'necesito',
    'quiero',
    'que',
    'qué'
  ],
  fr: [
    'bonjour',
    'merci',
    "s'il vous plait",
    "s'il te plait",
    'comment',
    'pourquoi',
    'je',
    'vous',
    'avec',
    'aide'
  ],
  de: ['hallo', 'danke', 'bitte', 'ich', 'du', 'sie', 'wie', 'warum', 'kannst', 'hilfe'],
  it: ['ciao', 'grazie', 'per favore', 'come', 'perché', 'puoi', 'voglio', 'aiuto']
}

function normalizeLanguageTag(tag) {
  const raw = String(tag || '').trim()
  if (!raw) return 'pt-BR'
  const short = raw.toLowerCase().split('-')[0]

  if (short === 'pt') return 'pt-BR'
  if (short === 'en') return 'en'
  if (short === 'es') return 'es'
  if (short === 'fr') return 'fr'
  if (short === 'de') return 'de'
  if (short === 'it') return 'it'
  if (short === 'ja') return 'ja'
  if (short === 'ko') return 'ko'
  if (short === 'zh') return 'zh-CN'
  if (short === 'ru') return 'ru'
  if (short === 'ar') return 'ar'
  if (short === 'hi') return 'hi'

  return 'pt-BR'
}

function normalizeForMatch(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function detectLanguageTag(text) {
  const value = String(text || '').trim()
  if (!value) return 'und'

  if (/[\u3040-\u30ff]/.test(value)) return 'ja'
  if (/[\uac00-\ud7af]/.test(value)) return 'ko'
  if (/[\u4e00-\u9fff]/.test(value)) return 'zh-CN'
  if (/[\u0400-\u04ff]/.test(value)) return 'ru'
  if (/[\u0600-\u06ff]/.test(value)) return 'ar'
  if (/[\u0900-\u097f]/.test(value)) return 'hi'

  const normalized = value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

  const scores = {}
  for (const [lang, hints] of Object.entries(LATIN_LANGUAGE_HINTS)) {
    let score = 0
    for (const hint of hints) {
      const safe = hint.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const regex = new RegExp(`(^|\\s)${safe}(\\s|$)`, 'i')
      if (regex.test(normalized)) score += 1
    }
    scores[lang] = score
  }

  if (/[ãõç]/i.test(value)) scores['pt-BR'] += 1
  if (/[ñ]/i.test(value)) scores.es += 1
  if (/[ß]/i.test(value)) scores.de += 1

  let bestLang = 'und'
  let bestScore = 0
  for (const [lang, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score
      bestLang = lang
    }
  }

  return bestScore > 0 ? bestLang : 'und'
}

function localizeReply(language, key, summary, reason, userName) {
  const lang = normalizeLanguageTag(language)
  const safeSummary = String(summary || '').trim()
  const safeReason = String(reason || '').trim() || 'unknown reason'

  if (lang === 'pt-BR') {
    if (key === 'empty') return 'Me envie uma pergunta e eu te ajudo.'
    if (key === 'greeting') {
      const name = userName ? `, ${userName}` : ''
      return `Oi${name}! Estou online. Como posso te ajudar agora?`
    }
    if (key === 'reason')
      return `O modelo local ficou indisponível no momento (${safeReason}). Posso tentar novamente em seguida.`
    if (key === 'with_memory')
      return `Entendi seu pedido: "${safeSummary}". Também considerei o contexto das suas notas locais.`
    return `Entendi seu pedido: "${safeSummary}". Vou seguir com isso.`
  }

  if (lang === 'en') {
    if (key === 'empty') return 'Send me a question and I will help you.'
    if (key === 'greeting') {
      const name = userName ? `, ${userName}` : ''
      return `Hi${name}! I am online. How can I help you now?`
    }
    if (key === 'reason')
      return `Local model unavailable right now (${safeReason}). Fallback reply for: "${safeSummary}".`
    if (key === 'with_memory')
      return `Got it: "${safeSummary}". I also considered your local notes context.`
    return `Got it: "${safeSummary}". I will proceed with that.`
  }

  if (lang === 'es') {
    if (key === 'empty') return 'Enviame una pergunta y te ayudare.'
    if (key === 'greeting') {
      const name = userName ? `, ${userName}` : ''
      return `Hola${name}! Estou en linea. Como posso te ajudar agora?`
    }
    if (key === 'reason')
      return `Modelo local no disponible en este momento (${safeReason}). Respuesta de respaldo para: "${safeSummary}".`
    if (key === 'with_memory')
      return `Entendi tu pedido: "${safeSummary}". Tambien considere el contexto de tus notas locales.`
    return `Entendi tu pedido: "${safeSummary}". Voy a continuar con eso.`
  }

  return safeSummary
}

function humanizeFallbackReason(reason, language = 'pt-BR') {
  const raw = String(reason || '').toLowerCase()
  const lang = normalizeLanguageTag(language)
  const isPt = lang === 'pt-BR'

  if (raw.includes('exceeds the available context size') || raw.includes('exceed_context_size')) {
    return isPt
      ? 'o contexto da conversa ficou maior que o limite atual'
      : 'the conversation context is larger than the current limit'
  }
  if (raw.includes('healthcheck timeout')) {
    return isPt ? 'o modelo local demorou para iniciar' : 'the local model took too long to start'
  }
  if (raw.includes('llama unavailable')) {
    return isPt ? 'o modelo local não ficou disponível' : 'the local model is unavailable'
  }
  return isPt ? 'falha temporária no modelo local' : 'temporary local model failure'
}

function isLikelyIncompleteResponse(text, finishReason) {
  const value = String(text || '').trim()
  if (!value) return false
  if (String(finishReason || '').toLowerCase() === 'length') return true

  const fenceMatches = value.match(/```/g)
  const fenceCount = fenceMatches ? fenceMatches.length : 0
  if (fenceCount % 2 !== 0) return true

  if (/<html[\s>]/i.test(value) && !/<\/html>/i.test(value)) return true
  if (/<body[\s>]/i.test(value) && !/<\/body>/i.test(value)) return true

  if (/[{[(]$/.test(value)) return true
  if (/[,:;]$/.test(value) && value.length > 120) return true

  return false
}

function resolveResponseLanguage({ content, threadId, settings, getThreadMessages, detect }) {
  const fromContent = detect(content)
  if (fromContent !== 'und') return normalizeLanguageTag(fromContent)

  const messages = getThreadMessages(threadId)
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i]
    if (!msg || msg.role !== 'user') continue
    const detected = detect(msg.content)
    if (detected !== 'und') return normalizeLanguageTag(detected)
  }

  return normalizeLanguageTag(settings.locale || 'pt-BR')
}

module.exports = {
  LATIN_LANGUAGE_HINTS,
  normalizeLanguageTag,
  normalizeForMatch,
  detectLanguageTag,
  localizeReply,
  humanizeFallbackReason,
  isLikelyIncompleteResponse,
  resolveResponseLanguage
}
