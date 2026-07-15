# Workflow — Release

Ciclo quinzenal de release. Data fixa, escopo flexível.

## Ciclo (14 dias)

```
Dia 1-12:   Desenvolvimento (PRs → main)
Dia 13:     Congela, testa, ajusta
Dia 14:     Release (workflow_dispatch)
```

## O que vai na release

Tudo que estiver em `main` no dia 13 e estiver estável.

Se um PR do Kurai ou uma feature do mantenedor não ficou pronta a tempo? Espera o próximo ciclo. **A data não move.**

## Tipos de release

| Release | Conteúdo típico |
|---------|-----------------|
| Feature | Features novas + hotfixes |
| Hardening | Dívida técnica, segurança, refactor, docs |

Alterna entre Feature e Hardening.

## Hotfix (fora do ciclo)

Se algo quebra o app pro usuário:

1. Branch da main: `git checkout -b hotfix/descricao`
2. Conserta, commit, push
3. PR pra main, revisão rápida, mergeia
4. Roda release manual (`workflow_dispatch` no GitHub)

Depois do hotfix, volta pro ciclo normal. Se hotfix for frequente, o critério de "urgente" está frouxo — aperta.

## Comandos

```bash
# Release manual
gh workflow run release.yml --ref main -f version=v1.14.0
```
