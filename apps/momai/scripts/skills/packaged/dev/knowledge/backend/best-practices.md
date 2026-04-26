# Backend Playbook (MomAI Node Core)

## Arquitetura
- Rotas em api/routes/*.js com handlers enxutos.
- Regras de domínio ficam em services/ e domain/.
- Retorno padrão em JSON com ok/error/message quando aplicável.

## Segurança
- Validar e normalizar entrada de path sempre com path.resolve.
- Bloquear operações fora da allowlist.
- Evitar execução shell arbitrária quando houver alternativa declarativa.

## Snippets úteis
```js
const abs = path.resolve(String(input || '').trim())
if (!isAllowed(abs)) return sendJson(res, 400, { ok: false, error: 'fora do escopo' })
```

## Erros
- Mensagens de erro objetivas, sem stack trace para usuário final.
