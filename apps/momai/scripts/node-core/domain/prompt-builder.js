function setupPromptBuilder({ promptRegistry, normalizeLanguageTag }) {
  function buildLocalizedFallbackReply({ key, summary, reason, language, userName }) {
    const lang = normalizeLanguageTag(language)
    const safeSummary = String(summary || '').trim()
    const safeReason = String(reason || '').trim() || 'unknown reason'

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
      if (key === 'empty') return 'Enviame una pregunta y te ayudare.'
      if (key === 'greeting') {
        const name = userName ? `, ${userName}` : ''
        return `Hola${name}! Estoy en línea. ¿Cómo puedo ayudarte ahora?`
      }
      if (key === 'reason')
        return `Modelo local no disponible en este momento (${safeReason}). Respuesta de respaldo para: "${safeSummary}".`
      if (key === 'with_memory')
        return `Entendi tu pedido: "${safeSummary}". Tambien considere el contexto de tus notas locales.`
      return `Entendi tu pedido: "${safeSummary}". Voy a continuar con eso.`
    }

    return promptRegistry.buildFallbackReply({
      key,
      summary: safeSummary,
      reason: safeReason,
      userName
    })
  }

  function generateFallbackReply(content, memoryContext, reason, responseLanguage, userName) {
    const trimmed = String(content || '').trim()
    if (!trimmed) {
      return buildLocalizedFallbackReply({ key: 'empty', language: responseLanguage, userName })
    }

    if (/^(oi|ol[aá]|bom dia|boa tarde|boa noite|hello|hi|hola|buenas)\b/i.test(trimmed)) {
      return buildLocalizedFallbackReply({ key: 'greeting', language: responseLanguage, userName })
    }

    const summary = trimmed.length > 320 ? `${trimmed.slice(0, 320)}...` : trimmed
    const hasMemory = typeof memoryContext === 'string' && memoryContext.trim().length > 0

    if (reason) {
      return buildLocalizedFallbackReply({
        key: 'reason',
        summary,
        reason,
        language: responseLanguage,
        userName
      })
    }
    if (hasMemory) {
      return buildLocalizedFallbackReply({
        key: 'with_memory',
        summary,
        language: responseLanguage,
        userName
      })
    }
    return buildLocalizedFallbackReply({
      key: 'default',
      summary,
      language: responseLanguage,
      userName
    })
  }

  return {
    buildLocalizedFallbackReply,
    generateFallbackReply
  }
}

module.exports = { setupPromptBuilder }
