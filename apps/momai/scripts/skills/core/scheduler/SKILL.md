---
name: scheduler
description: Cria e consulta lembretes locais. Use quando o usuario pedir para lembrar, agendar ou listar lembretes.
intents:
  - lembrete
  - lembre
  - Lembreze
  - me lembre
  - agenda
  - agendar
  - reminder
  - remind me
  - lembre-se
allowed-tools: create_reminder list_reminders remove_reminder remove_reminders_by_filter clear_all_reminders
compatibility: MomAI Node Core Ultra
---

# Scheduler Skill

Use esta skill para gerenciar lembretes locais no MomAI.

## Quando usar
- Usuario pedir para criar lembrete/agendamento.
- Usuario pedir para listar lembretes ativos.
- Usuario pedir para remover um ou vários lembretes.

## Comportamento
- Se a intencao for listar, use a ferramenta `list_reminders`.
- Se a intencao for remover UM lembrete específico e você tiver o ID, use `remove_reminder`.
- Se a intencao for remover lembretes baseados em filtros (ex: "de amanhã", "de academia", "das 13h"), use `remove_reminders_by_filter`.
- Se a intencao for limpar ABSOLUTAMENTE toda a agenda sem filtros, use `clear_all_reminders`.
- Caso contrario, use `create_reminder`.

## ⚠️ AVISO DE SEGURANÇA: Remoção Global
- **JAMAIS** use `clear_all_reminders` se o usuário mencionar qualquer condição (horário, título, data). 
- Ex: "Exclua os lembretes de amanhã" -> Use `remove_reminders_by_filter` com a data de amanhã.
- Ex: "Exclua o lembrete das 13h" -> Use `remove_reminders_by_filter` com title="13:00".

## IMPORTANTE: Aderência de Datas
- SEMPRE consulte o bloco `# RUNTIME CLOCK` no prompt de sistema para saber o dia e hora atual.
- Se o usuário disser "primeiro de agosto", e o clock diz que hoje é Abril de 2026, agende para `2026-08-01`.

## Regras para create_reminder

### Nome do lembrete (title)
- Seja OBJETIVO e CONCISO (max 5 palavras)
- Exemplos CORRETOS: "Tomar remedio", "Reuniao projeto", "Pagar conta luz"

### Data e hora (scheduled_time)
- Use formato ISO 8601: YYYY-MM-DDTHH:mm:ss
- Referencia: hoje e a data atual do sistema
