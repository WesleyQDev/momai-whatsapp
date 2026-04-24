module.exports = {
  tools: [
    { name: 'save_note_memory', description: 'Salva uma nota semantica local.' },
    { name: 'search_note_memory', description: 'Busca notas por semantica e palavras-chave.' }
  ],

  async execute({ content, context }) {
    const text = String(content || '').trim()
    const isReminder = /(às\s*\d|horas|amanhã|agendar|lembrete|schedule|reminder|pm|am)/i.test(text)

    if (/(salve|anote|memorize|guarde|save this|remember this)/i.test(text) && !isReminder) {
      const note = context.saveMemoryNote(text)
      return {
        tool: 'save_note_memory',
        instruction: `Resultado da ferramenta save_note_memory:\nMemoria salva na nota "${note.title}" (${note.id}).`
      }
    }

    const hits = await context.searchMemory(text, 4)
    const lines = hits.length
      ? hits.map((h) => `- ${h.title}: ${String(h.text || '').slice(0, 140)}`)
      : ['- Nenhuma memoria relevante encontrada.']

    return {
      tool: 'search_note_memory',
      instruction: `Resultado da ferramenta search_note_memory:\n${lines.join('\n')}`
    }
  }
}
