# Comandos OpenCode - MomAI

Comandos customizados disponíveis via `/comando` no OpenCode.

## Comandos Atuais

| Comando | Descrição |
|---------|-----------|
| `/auditoria` | Auditoria completa do código com relatório PDF. Aceita escopo opcional: `/auditoria apps/momai/src/components` |
| `/changelog` | Gerencia o changelog (`CHANGELOG.md` raiz): refatora entradas existentes, identifica versões faltando entre tags git, e adiciona novas entradas em linguagem de usuário final |
| `/documentacao` | Gera documentação técnica completa do projeto em PDF, explorando código, configs e pipelines |
| `/llamareport` | Verifica versão do llama.cpp contra upstream e gera relatório de mudanças focado em Vulkan/AMD |
| `/release` | Pipeline de release em 2 partes: bump + tag + build AppX (Parte 1, manual) e build EXE + Linux + changelog PR + blog PR (Parte 2, agente). Uso: `/release v1.x.x` |
| `/checklist-release` | Exibe o checklist de testes manuais para fazer antes do build no domingo |
| `/analyze-issues` | Analisa issues do repositório WesleyQDev/MomAI: lista todas as abertas ordenadas por prioridade, ou analisa uma issue específica de forma amigável |
| `/comandos` | Lista os comandos OpenCode disponíveis, lendo o README.md e apontando os não-documentados |
| `/blog` | Cria posts para o blog da MomAI com base no diff entre versões git. Gera versões pt-BR, en e resumo para LinkedIn |

## Como Usar

```
/comando             # Executa o comando
/comando argumentos  # Executa com argumentos (quando suportado)
```

## Como Criar um Novo Comando

Crie um arquivo `.md` nesta pasta com frontmatter:

```yaml
---
description: Descrição curta do que o comando faz
---
```

O conteúdo do arquivo é o prompt que será passado para o agente.
