# Workflow — Contribuições Externas

Fluxo para PRs de contribuidores: revisão, teste e merge na main.

## Fluxo

1. Contribuidor abre PR apontando para `main` (branch nomeada de forma descritiva)
2. Mantenedor revisa e testa
3. Se aprovado, mergeia em `main`

## Regras de revisão

- **1 PR = 1 conceito**: não misturar assuntos
- **Máximo ~300 linhas** (recomendado, não obrigatório): PRs maiores podem ser mais difíceis de revisar
- **Testes**: `pnpm --filter momai test` precisa passar
- **Código sensível** (auth, dados, IPC, release): revisão linha a linha + testar local
- **Código isolado** (UI, docs): revisão visual + lint/typecheck

## Testando o PR

```bash
git fetch origin pull/<NUMERO>/head:test/pr-review
git checkout test/pr-review
pnpm --filter momai lint
pnpm --filter momai typecheck
pnpm --filter momai test -- --related apps/momai/src/caminho/afetado
git checkout main
git merge test/pr-review
```

## Sinais de alerta

- Muda dependências sem justificativa clara
- Acessa sistema, rede ou IPC de forma inesperada
- Código obscuro ou ofuscado
- Não quer mostrar a mudança funcionando (vídeo curto resolve)

Nesses casos: não mergeia. Pergunta primeiro.

## Timing

- PR chega quando chega
- Mantenedor revisa no tempo que tiver
- O que não entrar na release atual, espera a próxima
