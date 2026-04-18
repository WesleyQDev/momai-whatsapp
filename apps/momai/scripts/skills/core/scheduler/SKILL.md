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
- Caso contrario, use `create_reminder` inferindo horario relativo quando possivel.
