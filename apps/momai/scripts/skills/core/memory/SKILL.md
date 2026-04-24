---
name: memory
description: Salva e consulta memoria de longo prazo em notas locais. Use para anotar, guardar ou recuperar informacoes relevantes.
intents:
  - memoria
  - anote
  - salve
  - guarde
  - nota
  - remember this
  - save this
allowed-tools: save_note_memory search_note_memory
compatibility: MomAI Node Core Ultra
---

# Memory Skill

Gerencia memoria de longo prazo baseada em notas locais.

## Quando usar

- Usuario pedir para salvar conhecimento ou informacoes estaticas.
- Usuario pedir para recuperar conhecimento salvo.

## Quando NÃO usar

- Usuario pedir para agendar lembretes com data/hora (use a skill `scheduler`).
- Usuario pedir para ser avisado sobre algo no futuro.

## Comportamento

- Use `save_note_memory` para persistir conteudo.
- Use `search_note_memory` para recuperar contexto relevante.
