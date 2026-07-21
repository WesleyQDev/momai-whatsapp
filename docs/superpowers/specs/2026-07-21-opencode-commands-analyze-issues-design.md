# Design — Comandos `/comandos` e `/analyze-issues`

Data: 2026-07-21
Branch: `feat/opencode-commands-analyze-issues`

## Objetivo

Criar dois novos comandos OpenCode (prompts em `.md`) no projeto MomAI:

1. `/comandos` — lista os comandos customizados disponíveis, lendo `.opencode/commands/README.md` e cruzando com os arquivos `.md` reais da pasta.
2. `/analyze-issues` e `/analyze-issue` — analisa issues de `WesleyQDev/MomAI`. Sem argumento: lista todas as issues abertas ordenadas por prioridade. Com argumento `#NUM` ou `NUM`: faz uma análise amigável de uma issue específica no estilo do `/analyze-pr`.

## Escopo

Apenas criação de novos arquivos `.md` na pasta `.opencode/commands/`. Sem mudanças em código do app, sem dependências novas, sem alteração de configs.

## Não-escopo

- Não criar scripts auxiliares fora da pasta `commands/`.
- Não modificar o `README.md` existente (o comando `/comandos` apenas o lê).
- Não automatizar a atualização do `README.md` quando novos comandos forem criados (apenas aponta não-documentados em runtime).

## Comando 1: `/comandos`

### Comportamento

1. Ler `.opencode/commands/README.md`.
2. Extrair a tabela de comandos (linhas `| /xxx | descrição |`).
3. Listar todos os arquivos `.md` da pasta `.opencode/commands/` (exceto `README.md`).
4. Cruzar: identificar comandos com arquivo `.md` mas SEM entrada no README.
5. Apresentar o resultado em PT-BR, formato amigável e curto, no terminal.

### Output

```markdown
### 🧰 Comandos OpenCode disponíveis

Comando     | O que faz
------------|-----------
/auditoria  | Auditoria completa do código com relatório PDF
/changelog  | Gerencia o changelog...
...

### 📝 Não documentados no README
- `/novo-comando` (existe o arquivo mas não está no README)
```

Se todos os comandos estiverem documentados: "✅ Todos os X comandos estão documentados no README."

### Regras

- Somente leitura. Nunca edita `README.md` ou qualquer outro arquivo.
- Ordem da lista segue a ordem do README.
- Comandos não-documentados aparecem em ordem alfabética no final.

## Comando 2: `/analyze-issues` (e `/analyze-issue`)

Um único arquivo `.md` cobre os dois modos (OpenCode despacha como `/analyze-issues` ou `/analyze-issue` — o nome do arquivo define o comando; mas o prompt é praticamente idêntico então criamos `analyze-issues.md` como principal e referenciamos).

**Decisão:** criar um único arquivo `analyze-issues.md` que suporta argumento opcional. Quando invocado sem args → modo lista. Com args → modo single.

### Repositório alvo

Hardcoded: `WesleyQDev/MomAI` (conforme AGENTS.md §10 — issues nunca vão pra `MomAI-App`).

### Modo 1: Lista priorizada (sem argumento)

#### Passo 1 — Coletar issues abertas

```bash
gh issue list --repo WesleyQDev/MomAI --state open --limit 200 --json number,title,labels,createdAt,author,body,reactionGroups,comments
```

Usar `--json reactionGroups` para capturar reações (+1, -1). Não há campo direto de menções: derivar do `body` (regex `@[\w-]+`) e dos `comments[].body` (mesmo regex). Menções únicas contam uma vez por issue.

Se `gh` não estiver autenticado ou a API falhar (503 etc), avisar e parar.

#### Passo 2 — Calcular score de prioridade

Para cada issue, calcular:

```
score = 0
  labels:
    priority:critical | critical                 -> +50
    priority:high | high | bug                   -> +20
    enhancement | feature                        -> +10
    documentation | docs                         -> +3
  reactions:
    net = (count +1) - (count -1)
    score += clamp(net * 2, -20, +20)
  mentions:
    unique @mentions in body + comments
    score += min(uniqueMentions * 5, 15)
  age:
    days = (today - createdAt) in days
    score += min(days / 7, 12)         # 1 semana = +1, 12 semanas = teto
```

Labels não reconhecidas não somam nem subtraem.

#### Passo 3 — Ordenar e exibir

Ordem decrescente por score. Empates quebram por `createdAt` ascendente (mais antiga primeiro).

### Output (modo lista)

```markdown
### 📋 Issues abertas — WesleyQDev/MomAI
Total: X abertas

1. **#42 — Título aqui** — score 67
   🔴 Crítica | 👍 12 | 👎 1 | @ 3 menções | 18 dias
2. **#17 — Outra issue** — score 54
   🟡 Alta | 👍 4 | 👎 0 | @ 1 menção | 92 dias
...

### 🧮 Como o score foi calculado
Labels pesam mais; reações (+1/-1) dão até ±20; menções até +15; idade até +12 (1 semana = +1). Detalhes no comando.
```

### Modo 2: Issue única (com argumento)

Argumento aceito: `#NUM` ou `NUM`. Usar `gh issue view` + `gh api` para coletar body, comentários, reações, labels, eventos (atribuição, fechamento).

#### Passo a passo

1. Normalizar o número.
2. Em paralelo:
   - `gh issue view <num> --repo WesleyQDev/MomAI --json number,title,body,author,createdAt,labels,assignees,state,reactionGroups,comments`
   - Eventos de timeline: `gh api repos/WesleyQDev/MomAI/issues/<num>/events`
   - Comentários já vêm no `--json comments`, mas se houver paginação, usar `gh api repos/WesleyQDev/MomAI/issues/<num>/comments --paginate`.
3. Montar relatório no estilo `analyze-pr.md` (tom de café, emojis, direto).

### Output (modo single)

```markdown
### 🔗 Issue analisada
<url>

### 📖 Contando por cima
2-4 frases simples sobre o problema/pedido.

### 🐛 O que tá pegando
Resumo do body, em linguagem clara.

### 👥 Quem comentou
- Pessoa X (resumo da opinião)
- Pessoa Y ...
Ou: "Ninguém falou nada ainda."

### 🧸 Plano sugerido
- Passo 1
- Passo 2
- ...

### ✅ Check-list pra fechar
- Reproduz o bug?
- Teste cobre o caso?
- Lint/typecheck passam?
- Docs atualizadas?

### 🤔 Veredito
Sugestão amigável e direta: urgente / pode esperar / falta contexto / precisa de reprodução.
```

### Tom e estilo

- PT-BR, descontraído, "explicando pra um colega no café" — idêntico ao `analyze-pr.md`.
- Sem jargão técnico quando dá pra evitar.
- Emojis nos headers (mesma família do `analyze-pr.md`).
- Não edita nada. Não comenta na issue. Não fecha. Não atribui. Apenas leitura.

## Configuração dos arquivos

### `.opencode/commands/comandos.md`

```yaml
---
description: Lista os comandos OpenCode customizados disponíveis no projeto, lendo o README.md da pasta commands e apontando os não-documentados
---
```

Conteúdo → prompt com as instruções do Comando 1.

### `.opencode/commands/analyze-issues.md`

```yaml
---
description: Analisa issues de WesleyQDev/MomAI ordenando por prioridade (labels + reações + menções + idade), ou analisa uma issue específica de forma amigável quando recebe um número
---
```

Conteúdo → prompt com as instruções do Comando 2 (modos lista + single).

## Verificação

- Após criar os dois `.md`, executar `/comandos` e confirmar que os dois novos comandos aparecem como não-documentados (porque não os adicionaremos ao `README.md` manualmente — o comando `/comandos` vai apontar; depois disso o usuário decide se documenta).
- Executar `/analyze-issues` e `/analyze-issue #<num-existente>` para sanity check do fluxo (depende do `gh` autenticado).
- Não há testes automatizados para prompts em `.md`. A validação é manual.

## Riscos e mitigações

| Risco | Mitigação |
|-------|-----------|
| API GitHub 503 em listas grandes | Retry implícito no prompt (como `analyze-pr.md`); se persistir, parar com mensagem clara |
| `gh` não autenticado | Falhar cedo com mensagem "rode `gh auth login`" |
| Labels de prioridade não existirem no repo | Heuristica tolerante: labels desconhecidas viram 0 — sem erro, apenas score baixo |
| Menções em código-blocks inflarem score | Ignorar Blocos de código fenced (` ``` `) ao contar @mentions |
| `reactionGroups` vs `reactions` naming no gh | Usar `reactionGroups` (atual) e mapear `THUMBS_UP`/`THUMBS_DOWN` para +1/-1 |

## Definition of Done

- [ ] `.opencode/commands/comandos.md` criado
- [ ] `.opencode/commands/analyze-issues.md` criado
- [ ] Spec commitado na branch
- [ ] Mantém a regra do AGENTS.md: issues sempre em WesleyQDev/MomAI
- [ ] Sem alterar código do app, configs, deps ou lockfiles
