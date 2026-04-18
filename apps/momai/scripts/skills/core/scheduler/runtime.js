module.exports = {
  tools: [
    { name: 'create_reminder', description: 'Cria um lembrete local a partir de linguagem natural.' },
    { name: 'list_reminders', description: 'Lista lembretes ativos e seus horarios.' }
  ],

  async execute({ content, context }) {
    const text = String(content || '').trim()

    if (/(listar|list|quais|mostrar).*(lembrete|reminder|agenda)/i.test(text)) {
      const active = context.listActiveReminders(8)
      const lines = active.length
        ? active.map((r) => `- ${r.title} (${new Date(r.scheduled_time).toLocaleString()})`)
        : ['- Nenhum lembrete ativo.']
      return {
        tool: 'list_reminders',
        instruction: `Resultado da ferramenta list_reminders:\n${lines.join('\n')}`
      }
    }

    const reminder = context.createReminderFromText(text)
    return {
      tool: 'create_reminder',
      instruction:
        `Resultado da ferramenta create_reminder:\n` +
        `Lembrete criado para ${new Date(reminder.scheduled_time).toLocaleString()} com titulo "${reminder.title}".`
    }
  }
}
