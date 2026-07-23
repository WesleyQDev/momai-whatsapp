# MOM-72: Memória .md + prompts + harness 3-tier + skill loading progressivo

## Contexto

Reformular sistema de memória, histórico, prompt e skills da MomAI inspirado no Hermes Agent.

Esta issue cobre 5 das 6 frentes originais. A frente D (SQLite + FTS5) foi extraída para [MOM-78](https://linear.app/momaiapp/issue/MOM-78).

## Section 1: Memória persistente em arquivos .md

### Arquivos

```
data/memories/usuario.md
data/memories/persona.md
data/memories/conhecimento.md
```

Caminho configurado em `constants.js` como `MEMORIES_DIR = DATA_DIR/memories`.

| Arquivo | Editável pela IA | Editável pelo usuário (UI) |
|---------|:---:|:---:|
| `usuario.md` | Sim (tool memory) | Sim |
| `persona.md` | **Não** | Sim |
| `conhecimento.md` | Sim (tool memory) | Sim |

### Formato

Entradas separadas por `§`, sem XML. Texto puro, uma entrada por fato/preferência.

Exemplo (`usuario.md`):
```
Chama o usuário de Wes
§
Prefere resposta curta e direta
§
Gosta de tecnologia, programação e IA
```

### Limites

- Por arquivo: 2200 chars
- Por entrada individual: 1375 chars
- Lock de arquivo + escrita atômica (tmp + rename)
- Snapshot congelado no início da sessão (não relê a cada turno)
- **Semântica de snapshot vs escrita**: a escrita via tool `memory` é persistida imediatamente no arquivo, mas o snapshot injetado no prompt da sessão **atual** não é atualizado — só reflete na **próxima** sessão. Isso impede que a IA alucine loops "escrevi → releio → escrevo de novo" e mantém o cache do Context tier estável. A persistência imediata garante que o usuário veja o conteúdo atualizado na Settings UI.

### Tool `memory` (meta-tool)

Sempre disponível no payload de tools (junto com `list_skills` e `request_skill`).

```json
{
  "name": "memory",
  "description": "Save, list or delete information in MomAI's memory files.",
  "parameters": {
    "type": "object",
    "properties": {
      "action": { "type": "string", "enum": ["add", "delete", "list"] },
      "target": { "type": "string", "enum": ["user", "knowledge"] },
      "content": { "type": "string" }
    },
    "required": ["action", "target"]
  }
}
```

- `add`: append nova entrada (separador §) ao final do arquivo
- `delete`: remove entrada que corresponda a `content` (exato ou substring)
- `list`: retorna o conteúdo do arquivo (para a IA ler o que já sabe)

### Coexistência com sistema de notas

- Notas/LanceDB continuam existindo como estão
- Memória semântica via notas + LanceDB **continua só no tier ultra**
- Memória .md funciona em **todos os tiers** (lite, pro, ultra)
- Nenhuma migração de dados

## Section 2: Settings UI

### Localização

Dentro da aba **"brain"** existente do `SettingsCard` (`apps/momai/src/renderer/src/components/floating/SettingsCard.tsx`).

### Layout

- Tabs internas (sub-abas) ou seção colapsável com 3 arquivos:
  - **Usuário** → `usuario.md`
  - **Persona** → `persona.md`
  - **Conhecimento** → `conhecimento.md`
- Cada arquivo: textarea com preview markdown
- Botão "Salvar" por arquivo (POST para nova rota `/memories/:filename`)
- Persona.md editável pelo usuário; os outros dois também

### Rota backend

**Rotas:**
- `PATCH /memories/:filename` — recebe `{ content }` e escreve atomicamente.
- `GET /memories/:filename` — retorna `{ content }`.

**`filename` permitlist:** só os 3 valores `usuario`, `persona`, `conhecimento` (sem extensão; a rota adiciona `.md`). Qualquer outro valor retorna `400 Bad Request`. Isso previne path traversal (`../../etc/passwd`) e escrita em arquivos não previstos.

**Validação de `content`:**
- Trim → tamanho ≤ 2200 chars (limite por arquivo, ver Section 1)
- Reject se ultrapassar
- Sanitizar minimamente (strip de NULs)

## Section 3: Corrigir prompts conflitantes

### #1 — Greeting triplicado

**Remover dos 3 lugares:**
1. `prompts.json`: remover frase "Greet the user by their name..." de todos os tiers
2. `prompt-registry.js`: remover regex que troca greeting por "NEVER greet" (linhas 113-120)
3. `chat-service.js`: remover bloco `<no_greeting>` (linhas 855-857)

**Substituir por volatile tier:**
- `!hasHistory`: "This is a new conversation — greet naturally."
- `hasHistory`: "Continue the conversation — be direct."

### #2 — max_sentences vs tool_mandate

Remover `default_max_sentences` de `prompts.json` e de toda a lógica.
O stable tier já diz "Be direct but natural." — suficiente.

### #3 — XML tags

Remover todas as tags XML do prompt:
- `<system_prompt>` (prompts.json, no `system_template`)
- `<available_skills>`, `<tool_mandate>`, `<tool_priority>` (chat-service.js)
- `<tier name="...">` (prompts.json, no `tier_instructions`)
- `<no_greeting>` (chat-service.js)
- Quaisquer outras tags XML que existirem em prompts.json (ex.: `<identity>` se presente)

Substituir por texto puro em linguagem natural.

Antes:
```
<tool_mandate>CRITICAL: You MUST use the appropriate tool... Do NOT answer from your training data</tool_mandate>
```

Depois (no **Stable tier**):
```
Use the skills listed when relevant.
```

Frase complementar adicionada ao **Volatile tier** (linha de skills, ver Section 5 F2):
```
If you need another skill, use list_skills to search or request_skill to load.
```

Ambas convivem em tiers diferentes — não há redundância.

### #4 — tool_mandate proibindo conhecimento

Remover "Do NOT answer from your training data" de todo o sistema.
Se skills forem relevantes, o modelo deve usá-las; se não, pode responder do conhecimento interno.

## Section 4: Harness 3-tier + prompt cache

### Arquitetura 3 camadas

#### Stable tier (1x/sessão, inglês)

```
You are MomAI, assisting {{userName}}.
- Be direct but natural.
- Use the skills listed when relevant.
- If unsure, ask for clarification.
```

#### Context tier (1x/sessão)

```
{{memorySnapshot}}
```

Onde `memorySnapshot` é o conteúdo lido de `memories/usuario.md`, `memories/persona.md` e `memories/conhecimento.md` no início da sessão, formatado como:

```
-- User Profile --
<content>

-- MomAI Identity --
<content>

-- Known Facts --
<content>
```

O separador `§` do arquivo .md é convertido para `\n- ` (bullet) ao montar o snapshot do Context tier — i.e., cada vira um bullet point. Ex.: arquivo `Chama o usuário de Wes § Prefere resposta curta` vira `-- User Profile --\n- Chama o usuário de Wes\n- Prefere resposta curta`. Isso evita que o modelo veja `§` cru no prompt e tente imitar o formato.

#### Volatile tier (a cada turno, 2-3 linhas)

```
Conversation: {{sessionStart}}
Model: {{modelName}} ({{tier}})
User language: {{locale}}
{{greetingPolicy}}
```

`greetingPolicy` = "This is a new conversation — greet naturally." ou "Continue the conversation — be direct."

### System prompt cache

```js
promptCache = {
  sessionKey: `${threadId}:${persona}:${locale}:${tier}`,
  stable: "...",
  context: "...",
  timestamp: Date.now()
}
```

- `sessionKey` não inclui `memoriesVersion` — o snapshot de memória é **congelado** para a sessão atual (ver Section 1: escrita só reflete na próxima sessão)
- `sessionKey` muda quando `persona`, `locale` ou `tier` mudam no meio da sessão (ex.: usuário altera idioma/IA nas Settings) — nesses casos stable + context são reconstruídos
- Nova threadId sempre invalida o cache
- Só volatile é reconstruído por turno (barato — 2-3 linhas)

### Refatoração de prompt-registry.js

O módulo atual (212 linhas) será refatorado para:

1. `loadPrompts()` cacheado com mtime check (não relê disco toda vez)
2. `buildStableTier(input)` — retorna stable prompt em inglês
3. `buildContextTier(input)` — lê e snapshot das memórias .md
4. `buildVolatileTier(input)` — session info + locale + greeting
5. `buildSystemPrompt(input)` — tenta cache; se miss, constrói e salva; se hit, só volatile
6. `formatMemoryContext(sections)` — mantido mas agora lê de .md em vez de notas
7. `buildFallbackReply(error)` — mantido

### Locale/idioma

- Stable tier: **inglês** (modelo responde melhor a instruções em inglês)
- Volatile tier: `"User language: {{locale}}"` — instrui a responder no idioma do usuário
- `locale` já existe em `store.settings.locale` (default `pt-BR`)

## Section 5: Skill loading progressivo

### F1 — Orçamento dinâmico (remove maxSkills=2)

**Mudanças em `chat/skills.js`:**
- `pickToolSkillIds` perde `maxSkills` e ganha `tokenBudget`
- `estimateToolTokens(toolDef)` calcula tokens de uma tool definition
- Orçamento = `15% do contextWindow` (ex.: Qwen 3.5-4B c/ 8192 = ~1228 tokens)
- Prioridade: meta-tools > activeSkillIds > discovered skills por score
- Se orçamento estourar, skills de menor score são cortadas

**Mudanças em `chat-service.js`:**
- Remove `MAX_OPENAI_TOOLS = 8`
- Remove redistribuição por regex de `Skill: <name>` na descrição (linhas 812-843)
- Passa `tokenBudget` para `pickToolSkillIds`
- Meta-tools são injetadas antes do orçamento (sempre disponíveis)

### R1 — Tool-to-skill attribution

Como o sufixo `"\n\nSkill: <name>"` está sendo removido das descrições (era usado tanto para redistribuição quanto para saber qual skill uma tool chamada pertence), é necessária uma fonte alternativa de attribution:

- `skillRegistry.toOpenAITools(skillIds)` deve retornar adicionalmente um `Map<toolName, skillId>` (mapa `toolName → skillId`)
- Esse mapa é mantido por turno em `streamLlamaChat` e usado para: (a) adicionar o `skillId` ao `activeSkillIds` quando o LLM chama uma tool, (b) rotear a chamada de execução para a skill correta
- Isso substitui o parsing de regex da descrição por uma fonte canônica
- Descrição das tools passa a ser só `${tool.description}` (sem o sufixo `Skill: <name>`)

### F2 — 3 meta-tools genéricas

Sempre disponíveis no payload de tools:

1. **`memory(action, target, content)`** — descrito na Section 1
2. **`list_skills(query)`**
3. **`request_skill(skill_name)`**

Definição de `list_skills`:
```json
{
  "name": "list_skills",
  "description": "Search available skills by query. Returns skill names and descriptions.",
  "parameters": {
    "type": "object",
    "properties": {
      "query": { "type": "string", "description": "What you need help with" }
    },
    "required": ["query"]
  }
}
```

Definição de `request_skill`:
```json
{
  "name": "request_skill",
  "description": "Load tools from a specific skill so you can use it. Skill must be installed.",
  "parameters": {
    "type": "object",
    "properties": {
      "skill_name": { "type": "string", "description": "Skill name as returned by list_skills" }
    },
    "required": ["skill_name"]
  }
}
```

Nenhum ID de skill hardcoded. Funciona com qualquer skill core ou extensão.

**request_skill — habilidade não existente:**

Se o LLM chamar `request_skill("inexistente")`:
- Retornar tool result: `{"error": "Skill 'inexistente' not found. Use list_skills to see available skills."}`
- NÃO adicionar nada a `activeSkillIds`
- O LLM deve ler a mensagem e tentar `list_skills` novamente

Isso mantém o fluxo genérico e evita hardcodes de IDs.

### F3 — Re-descoberta por turno

Já existe: `chat-service.js` roda discovery a cada turno (linhas 711-761).
Combinar resultados com `activeSkillIds`.

### F4 — activeSkillIds

```js
// Em memória, na sessão (dentro de streamLlamaChat ou shared state)
const activeSkillIds = new Set()
```

- Skills adicionadas quando `request_skill` é chamado
- Skills adicionadas quando LLM chama uma tool de uma skill
- Mantidas por toda a sessão (até `context/reset` ou nova thread)
- Tools de `activeSkillIds` SEMPRE incluídas no payload (dentro do orçamento)

### System prompt (volatile tier, parte de skills)

```
Active skills this turn: WhatsApp (messages), Launcher (open apps).
If you need another skill, use list_skills to search or request_skill to load.
```

Texto montado dinamicamente baseado em `activeSkillIds` + discovered skills deste turno.
Se nenhuma skill ativa, linha some ou vira: "No skills loaded this turn."

## Critérios de sucesso

1. **Velocidade preservada** — TTFB não deve aumentar >100ms. Cache de prompt deve acelerar.
2. **Skills funcionam** — 100% das skills core (e extensões instaladas) continuam chamáveis.
3. **Sem breaking de extensões** — Nenhuma extensão precisa de update.
4. **Multi-skill num turno** — Modelo orquestra 3+ skills sem erro.
5. **Idioma consistente** — Respostas em pt-BR quando esse for o setting.
6. **Qualidade** — Respostas naturais, sem XML, sem auto-correção.

## Estratégia de testes

1. `pnpm --filter momai test` — regressão existente
2. Testar greeting: nova conversa vs conversa em andamento
3. Testar memória: tool memory cria/lê .md corretamente
4. Testar `list_skills` + `request_skill`: carregar skill por nome
5. Testar idioma: locale = pt-BR, resposta em pt-BR
6. Testar prompt: sem XML tags visíveis no output

## Arquivos envolvidos

| Arquivo | Mudança |
|---------|---------|
| `apps/momai/scripts/prompt-registry.js` | Refatorar para 3 tiers + cache + remover greeting regex |
| `apps/momai/prompts/prompts.json` | Simplificar: sem greeting, sem max_sentences, sem XML, em inglês |
| `apps/momai/scripts/node-core/services/chat-service.js` | Remover `<no_greeting>`, `<tool_mandate>`, XML; remover MAX_OPENAI_TOOLS; injetar meta-tools; orçamento dinâmico |
| `apps/momai/scripts/node-core/services/chat/context.js` | Manter (truncamento existente continua) |
| `apps/momai/scripts/node-core/services/chat/skills.js` | Remover maxSkills=2; adicionar estimateToolTokens; activeSkillIds |
| `apps/momai/scripts/skills/registry.js` | Adicionar meta-tools handlers (list_skills, request_skill) |
| `apps/momai/scripts/node-core/services/skill-orchestrator.js` | Ajustar discovery para incluir activeSkillIds |
| `apps/momai/scripts/node-core/config/constants.js` | Adicionar MEMORIES_DIR |
| `apps/momai/src/renderer/src/hooks/useSettingsCard.ts` | Adicionar aba/sub-aba de memória |
| `apps/momai/src/renderer/src/components/floating/SettingsCard.tsx` | Renderizar editor de .md |
| `apps/momai/scripts/node-core/api/routes/settings.routes.js` | Adicionar GET/PATCH /memories/:filename |
| `apps/momai/scripts/node-core/infrastructure/memory-fs.js` (novo) | Operações atômicas em .md (read/write/lock) |
