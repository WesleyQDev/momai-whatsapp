# OpenCode Commands `/comandos` and `/analyze-issues` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create two new OpenCode command prompts (`.opencode/commands/*.md`) that list available commands and analyze GitHub issues by priority.

**Architecture:** Two standalone prompt files in `.opencode/commands/`. No dependencies, no code changes. Each prompt contains the full agent instructions in PT-BR with casual tone matching `analyze-pr.md`.

**Tech Stack:** Markdown frontmatter + agent prompts. Shell calls via `gh` CLI for data collection.

---

### Task 1: Create `/comandos` command

**Files:**
- Create: `.opencode/commands/comandos.md`

- [ ] **Step 1: Write the command file**

`.opencode/commands/comandos.md`:

```markdown
---
description: Lista os comandos OpenCode customizados disponíveis no projeto, lendo o README.md da pasta commands e apontando os não-documentados
---

## Passo 1 — Ler o README e os arquivos

1. Leia `.opencode/commands/README.md`.
2. Extraia a tabela de comandos: linhas no formato `| /xxx | descrição |`.
3. Liste todos os arquivos `.md` dentro de `.opencode/commands/` (ignorando `README.md` e o próprio arquivo sendo executado).

## Passo 2 — Cruzar os dados

Para cada `.md` encontrado:
- Se o comando (nome do arquivo sem `.md`, prefixado com `/`) aparece na tabela do README, está documentado.
- Se não aparece, está não-documentado.

## Passo 3 — Exibir resultado

Saída em PT-BR, formato limpo no terminal:

```
### 🧰 Comandos OpenCode disponíveis

Comando      | O que faz
-------------|-----------
/auditoria   | Auditoria completa do código com relatório PDF
/changelog   | Gerencia o changelog...
...
```

No final, se houver comandos não-documentados:

```
### 📝 Não documentados no README
- `/comandos` (existe o arquivo mas não está no README)
```

Se todos estiverem documentados:

```
✅ Todos os X comandos estão documentados no README.
```

## Regras

- Somente leitura. Nunca edite nenhum arquivo.
- Liste os comandos na ordem em que aparecem no README.
- Não-documentados em ordem alfabética ao final.
- Se o README.md não existir ou estiver vazio, diga "Nenhum comando documentado ainda" e liste todos `.md` encontrados.
```

- [ ] **Step 2: Sanity check**

Run: `/comandos` in an OpenCode session.
Expected: output with the table + "📝 Não documentados no README" listing `/comandos` and `/analyze-issues`.

- [ ] **Step 3: Commit**

```bash
git add .opencode/commands/comandos.md
git commit -m "feat(opencode-commands): add /comandos command"
```

---

### Task 2: Create `/analyze-issues` command

**Files:**
- Create: `.opencode/commands/analyze-issues.md`

- [ ] **Step 1: Write the command file**

`.opencode/commands/analyze-issues.md`:

```markdown
---
description: Analisa issues de WesleyQDev/MomAI ordenando por prioridade (labels + reações + menções + idade), ou analisa uma issue específica de forma amigável quando recebe um número
---

Você é um colega experiente e gente boa que entende de programação e sabe explicar as coisas de um jeito simples e descontraído, sem jargão desnecessário. Sua missão é analisar issues do GitHub e entregar um relatório fácil de entender, com tom amigável mas direto — como se estivesse resumindo pra um dev colega no café.

## Repositório

Todas as queries usam `WesleyQDev/MomAI` (hardcoded). Issues nunca vão pra `WesleyQDev/MomAI-App`.

## Modo de operação

- **Sem argumento** (`/analyze-issues`): lista todas as issues abertas ordenadas por prioridade (score calculado).
- **Com argumento** (`/analyze-issue #123` ou `/analyze-issue 123`): analisa uma issue específica em detalhe estilo `analyze-pr.md`.

---

## MODO 1: Lista priorizada (sem argumento)

### Passo 1 — Coletar issues abertas

Use `gh` em paralelo (um comando só já basta):

```bash
gh issue list --repo WesleyQDev/MomAI --state open --limit 200 --json number,title,labels,createdAt,author,body,reactionGroups,comments
```

Se `gh` não estiver autenticado, informe e pare. Se a API der 503, tente novamente uma vez após alguns segundos.

### Passo 2 — Calcular score de prioridade

Para cada issue, calcule:

```
score = 0
  labels:
    priority:critical, critical                    -> +50
    priority:high, high, bug                       -> +20
    enhancement, feature                           -> +10
    documentation, docs                            -> +3
  reactions:
    net = (count THUMBS_UP +1) - (count THUMBS_DOWN -1)
    score += clamp(net * 2, -20, +20)
  mentions:
    Extraia @menções únicas do body e de cada comment.body.
    Ignore menções dentro de blocos de código fenced (``` ```).
    score += min(totalUniqueMentions * 5, 15)
  age:
    dias = (hoje - createdAt) em dias
    score += min(dias / 7, 12)
```

Labels não reconhecidas = 0.

### Passo 3 — Ordenar e exibir

Ordem decrescente por score. Empates: `createdAt` ascendente (mais antiga primeiro).

```
### 📋 Issues abertas — WesleyQDev/MomAI
Total: 12 abertas

1. **#42 — Título da issue** — score 67
   🔴 Crítica | 👍 12 | 👎 1 | @ 3 menções | 18 dias
2. **#17 — Outra issue** — score 54
   🟡 Alta | 👍 4 | 👎 0 | @ 1 menção | 92 dias
...

### 🧮 Como o score foi calculado
- Labels: priority:critical/critical = +50, priority:high/high/bug = +20, enhancement/feature = +10, docs = +3
- Reações: (👍 - 👎) × 2, capado em ±20
- Menções @: 5 pontos por menção única, até +15
- Idade: 1 ponto por semana, até +12
```

---

## MODO 2: Issue específica (com argumento)

### Passo 1 — Normalizar

Argumento pode ser `#123` ou `123`. Extraia o número.

### Passo 2 — Coletar dados (paralelo)

```bash
gh issue view <NUM> --repo WesleyQDev/MomAI --json number,title,body,author,createdAt,labels,assignees,state,reactionGroups,comments,url
gh api repos/WesleyQDev/MomAI/issues/<NUM>/events --paginate
```

### Passo 3 — Montar relatório

Formato amigável, PT-BR, tom casual:

```
### 🔗 Issue analisada
<url>

### 📖 Contando por cima
2-4 frases simples sobre o problema/pedido.

### 🐛 O que tá pegando
Resumo do body em linguagem clara, sem jargão.

### 👥 Quem comentou
- Pessoa X: resumo do comentário
- Pessoa Y: ...
Ou: "Ninguém comentou ainda."

### 🧸 Plano sugerido
- Passo 1
- Passo 2
- ...

### ✅ Check-list pra fechar
- Reproduz o bug / clareza do pedido?
- Teste que cobre o caso?
- Lint/typecheck?
- Docs atualizadas?

### 🤔 Veredito
Sugestão amigável e direta: urgente / pode esperar / falta contexto / precisa de reprodução.
```

## Regras de ouro

- NUNCA edite nenhum arquivo. Somente leitura.
- NUNCA comente, feche, atribua ou modifique a issue. Apenas análise.
- Não deixe exemplos hardcoded de números de issue no reasoning. Use sempre o argumento real.
- Se a API falhar após retry, seja honesto: "não consegui buscar os dados agora."
- Mantenha o tom leve e natural, mas preciso nas conclusões.
```

- [ ] **Step 2: Sanity check**

Run: `/analyze-issues` in an OpenCode session.
Expected: ordered list of open issues with scores.

Then: `/analyze-issue 1` (or some existent issue number).
Expected: friendly single-issue report.

- [ ] **Step 3: Commit**

```bash
git add .opencode/commands/analyze-issues.md
git commit -m "feat(opencode-commands): add /analyze-issues command"
```
