function setupLanguageDetector({ store, getThreadMessages }) {
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

  function resolveResponseLanguage(content, threadId) {
    const fromContent = detectLanguageTag(content)
    if (fromContent !== 'und') return normalizeLanguageTag(fromContent)

    const messages = getThreadMessages(threadId)
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const msg = messages[i]
      if (!msg || msg.role !== 'user') continue
      const detected = detectLanguageTag(msg.content)
      if (detected !== 'und') return normalizeLanguageTag(detected)
    }

    return normalizeLanguageTag(store.settings.locale || 'pt-BR')
  }

  return {
    LATIN_LANGUAGE_HINTS,
    normalizeLanguageTag,
    detectLanguageTag,
    resolveResponseLanguage
  }
}

module.exports = { setupLanguageDetector }
