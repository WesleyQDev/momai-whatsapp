# Architecture Notes

## Organização de mudanças

- Agrupar mudanças por comportamento e não apenas por arquivo.
- Priorizar compatibilidade com fluxos existentes.

## Structured responses

- type define renderer.
- data deve ser JSON serializável e estável.
- Preferir payloads pequenos e orientados a UI.

## HITL

- Ação mutante deve ter duas fases: criar pendência e confirmar/cancelar.
- Registrar mutationId e metadata suficiente para auditoria básica.
