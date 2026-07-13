# Comandos OpenCode - MomAI

Comandos customizados disponíveis via `/comando` no OpenCode.

## Comandos Atuais

| Comando | Descrição |
|---------|-----------|
| `/auditoria` | Auditoria completa do código com relatório PDF. Aceita escopo opcional: `/auditoria apps/momai/src/components` |
| `/changelog` | Gerencia o changelog da landing page (`apps/landing-page/public/CHANGELOG.md`): refatora entradas existentes, identifica versões faltando entre tags git, e adiciona novas entradas em linguagem de usuário final |
| `/documentacao` | Gera documentação técnica completa do projeto em PDF, explorando código, configs e pipelines |
| `/llamareport` | Verifica versão do llama.cpp contra upstream e gera relatório de mudanças focado em Vulkan/AMD |

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
