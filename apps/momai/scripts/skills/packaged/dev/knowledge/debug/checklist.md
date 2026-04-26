# Debug Playbook

## Fluxo recomendado
1. Reproduzir problema com passos claros.
2. Conferir logs do node-core e renderer.
3. Isolar componente/serviço responsável.
4. Validar hipótese com teste rápido.
5. Aplicar correção mínima e verificar regressão.

## Checklist
- O erro é de contexto/token ou de execução de tool?
- O estado persistido foi carregado corretamente?
- O retorno do endpoint tem shape compatível com o renderer?
- Existe race condition entre stream e update de UI?

## Mensagens de fallback
- Evitar respostas técnicas cruas no chat final.
- Humanizar causa e sugerir próximo passo.
