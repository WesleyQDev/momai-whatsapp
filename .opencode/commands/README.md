# Comandos OpenCode - MomAI

Comandos customizados disponíveis via `/comando` no OpenCode.

## Comandos Atuais

| Comando | Descrição |
|---------|-----------|
| `/auditoria` | Auditoria completa do código com relatório PDF. Aceita escopo opcional: `/auditoria apps/momai/src/components` |
| `/changelog` | Gerencia o changelog (`CHANGELOG.md` raiz): refatora entradas existentes, identifica versões faltando entre tags git, e adiciona novas entradas em linguagem de usuário final |
| `/documentacao` | Gera documentação técnica completa do projeto em PDF, explorando código, configs e pipelines |
| `/llamareport` | Verifica versão do llama.cpp contra upstream e gera relatório de mudanças focado em Vulkan/AMD |
| `/new-version` | Cria nova versão: gera changelog entry, commit e tag git |
| `/release` | Build e release para Windows (.exe/.appx) e Linux. Suporta local (via script PowerShell) ou GitHub Actions. Verifica Docker se necessário |
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
