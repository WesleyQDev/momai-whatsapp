function formatReminderForList(raw, idx) {
  const dt = new Date(raw.scheduled_time)
  const isToday = dt.toDateString() === new Date().toDateString()
  const isTomorrow = dt.toDateString() === new Date(Date.now() + 86400000).toDateString()

  const timeStr = dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const dateStr = isToday ? 'Hoje' : isTomorrow ? 'Amanhã' : dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })

  return {
    id: raw.id,
    title: raw.title,
    datetime: `${dateStr} às ${timeStr}`,
    content: raw.content || '',
    isActive: raw.is_active
  }
}

function formatReminderDetail(reminder) {
  const dt = new Date(reminder.scheduled_time)
  const dateStr = dt.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
  const timeStr = dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

  return {
    id: reminder.id,
    title: reminder.title,
    date: dateStr,
    time: timeStr,
    content: reminder.content || '',
    isActive: reminder.is_active
  }
}

function isListIntent(text) {
  return /(listar|list|quais|mostrar|ver)\s*(lembrete|reminder|agenda|pendente)/i.test(text) ||
         /^(lembrete|reminder|agenda)s?\s*$/i.test(text) ||
         /^\/list$/i.test(text)
}

module.exports = {
  tools: [
    {
      name: 'create_reminder',
      description: 'Cria um lembrete local com argumentos estruturados. IMPORTANTE: Use a "Local datetime" do prompt de sistema para calcular o scheduled_time corretamente (ex: se hoje é Abril e o usuário pede Agosto, use o ano atual).',
      parameters: {
        type: 'object',
        required: ['title', 'scheduled_time'],
        properties: {
          title: {
            type: 'string',
            description: 'Nome objetivo do lembrete (max 5 palavras). Ex: "Tomar remedio", "Reuniao projeto"'
          },
          scheduled_time: {
            type: 'string',
            description: 'Data e hora no formato ISO 8601 (YYYY-MM-DDTHH:mm:ss). Ex: "2026-08-01T09:00:00"'
          },
          content: {
            type: 'string',
            description: 'Descricao completa do lembrete com detalhes adicionais'
          },
          voice_response: {
            type: 'boolean',
            description: 'Se o lembrete deve ser lido em voz alta quando disparar'
          }
        }
      }
    },
    { name: 'list_reminders', description: 'Lista lembretes ativos e seus horários.' },
    {
      name: 'remove_reminder',
      description: 'Remove um lembrete específico pelo ID numérico.',
      parameters: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'number', description: 'ID exato do lembrete (obtido via list_reminders)' }
        }
      }
    },
    {
      name: 'remove_reminders_by_filter',
      description: 'Remove lembretes que correspondam a um filtro (texto ou data). Use para remover lembretes de "hoje", "de trabalho", "das 13h", etc.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Palavra-chave no título ou conteúdo (ex: "academia", "13:00")' },
          date: { type: 'string', description: 'Data opcional no formato YYYY-MM-DD' }
        }
      }
    },
    { 
      name: 'clear_all_reminders', 
      description: 'CUIDADO: Apaga ABSOLUTAMENTE TODOS os lembretes da conta. Use APENAS se o usuário pedir explicitamente para "limpar tudo" ou "apagar toda a agenda". Nunca use se houver um filtro de data ou assunto.' 
    }
  ],

  async execute({ content, args, context, toolName }) {
    const text = String(content || '').trim()
    const toolArgs = args || {}

    // Se o LLM chamou uma tool especifica, executa diretamente
    if (toolName === 'list_reminders') {
      const raw = context.listActiveReminders(10)
      const items = raw.map((r, i) => formatReminderForList(r, i))

      return {
        tool: 'list_reminders',
        structuredResponse: {
          type: 'reminders',
          data: { items, mode: 'list' }
        },
        instruction: JSON.stringify({ items, mode: 'list' }),
        webSources: []
      }
    }

    if (toolName === 'remove_reminder') {
      const id = Number(toolArgs.id)
      const success = context.removeReminder(id)
      return {
        tool: 'remove_reminder',
        instruction: success ? `Lembrete ${id} removido com sucesso.` : `Lembrete ${id} não encontrado.`
      }
    }

    if (toolName === 'remove_reminders_by_filter') {
      const result = context.removeRemindersByFilter({
        title: toolArgs.title,
        date: toolArgs.date
      })
      return {
        tool: 'remove_reminders_by_filter',
        instruction: result.success 
          ? `${result.count} lembrete(s) removido(s) com sucesso.` 
          : `Nenhum lembrete encontrado para os filtros aplicados.`
      }
    }

    if (toolName === 'clear_all_reminders') {
      const success = context.removeAllReminders()
      return {
        tool: 'clear_all_reminders',
        instruction: success ? 'TODOS os lembretes foram removidos da agenda.' : 'Nenhum lembrete para remover.'
      }
    }

    if (toolName === 'create_reminder') {
      // Se o LLM passou argumentos estruturados, usa diretamente
      if (toolArgs.title && toolArgs.scheduled_time) {
        const reminder = context.createReminder({
          title: toolArgs.title,
          scheduled_time: toolArgs.scheduled_time,
          content: toolArgs.content || text,
          voice_response: toolArgs.voice_response ?? true
        })
        const detail = formatReminderDetail(reminder)

        return {
          tool: 'create_reminder',
          structuredResponse: {
            type: 'reminders',
            data: { items: [detail], mode: 'created' }
          },
          instruction: JSON.stringify({ items: [detail], mode: 'created' }),
          webSources: []
        }
      }

      // Fallback: parse texto bruto
      const reminder = context.createReminderFromText(text)
      const detail = formatReminderDetail(reminder)

      return {
        tool: 'create_reminder',
        structuredResponse: {
          type: 'reminders',
          data: { items: [detail], mode: 'created' }
        },
        instruction: JSON.stringify({ items: [detail], mode: 'created' }),
        webSources: []
      }
    }

    // Fallback por intencao no texto (legado)
    if (isListIntent(text)) {
      const raw = context.listActiveReminders(10)
      const items = raw.map((r, i) => formatReminderForList(r, i))

      return {
        tool: 'list_reminders',
        structuredResponse: {
          type: 'reminders',
          data: { items, mode: 'list' }
        },
        instruction: JSON.stringify({ items, mode: 'list' }),
        webSources: []
      }
    }

    const reminder = context.createReminderFromText(text)
    const detail = formatReminderDetail(reminder)

    return {
      tool: 'create_reminder',
      structuredResponse: {
        type: 'reminders',
        data: { items: [detail], mode: 'created' }
      },
      instruction: JSON.stringify({ items: [detail], mode: 'created' }),
      webSources: []
    }
  }
}