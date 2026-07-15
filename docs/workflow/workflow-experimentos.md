# Workflow — Experimentos Rápidos

Fluxo para demandas rápidas que não passam por PR nem revisão formal.

## Regra geral

Mudaças urgentes ou experimentais vão pra branch `draft`. Sem PR, sem revisão, sem issue. Commit direto.

## Fluxo do dia

```bash
git checkout main
git pull origin main
git checkout -b draft

# Cada tarefa vira um commit
git add -A && git commit -m "feat: descricao concisa"
git add -A && git commit -m "fix: descricao concisa"

# Fim do dia: integra na main
git checkout main
git merge draft
```

## Se algo não ficou pronto

```bash
git checkout main
git cherry-pick <hash-do-commit-1> <hash-do-commit-2>
git branch -D draft
```

## Observações

- `draft` não mergeia em nenhuma outra branch além de `main`
- Se um experimento virar algo maior, criar issue e PR normalmente
- Esta branch existe para velocidade, não para rastreamento
