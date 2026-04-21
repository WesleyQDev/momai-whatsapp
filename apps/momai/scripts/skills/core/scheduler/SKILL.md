---
name: scheduler
description: Cria e consulta lembretes locais. Use quando o usuario pedir para lembrar, agendar ou listar lembretes.
intents:
  - lembrete
  - lembre
  - me lembre
  - agenda
  - agendar
  - reminder
  - remind me
allowed-tools: create_reminder list_reminders
compatibility: MomAI Node Core Ultra
---

# Scheduler Skill

Use esta skill para gerenciar lembretes locais no MomAI.

## Quando usar
- Usuario pedir para criar lembrete/agendamento.
- Usuario pedir para listar lembretes ativos.

## Comportamento
- Se a intencao for listar, use a ferramenta `list_reminders`.
- Caso contrario, use `create_reminder` com argumentos estruturados.

## Regras para create_reminder

### Nome do lembrete (title)
- Seja OBJETIVO e CONCISO (max 5 palavras)
- Use verbo no infinitivo ou substantivo direto
- Exemplos CORRETOS: "Tomar remedio", "Reuniao projeto", "Pagar conta luz"
- Exemplos ERRADOS: "Me lembre de tomar o remedio as 8h", "Lembrete importante para amanha"

### Data e hora (scheduled_time)
- Use formato ISO 8601: YYYY-MM-DDTHH:mm:ss
- Referencia: hoje e a data atual do sistema
- "hoje as 15h" -> hoje as 15:00
- "amanha as 8h30" -> amanha as 08:30
- "daqui 30 minutos" -> agora + 30 min
- "sexta que vem as 10h" -> proxima sexta as 10:00
- "dia 25 as 14h" -> dia 25 do mes atual (ou proximo se ja passou) as 14:00
- Se nao especificar hora, use 09:00 como padrao
- Se nao especificar data, use hoje

### Conteudo (content)
- Descricao completa do lembrete (texto original do usuario)
- Inclua detalhes adicionais que nao estao no title
