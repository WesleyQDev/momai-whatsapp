# Progressive Disclosure Skills System

## Problem

MomAI expõe todas as tools de todas as skills no mesmo round do LLM. Com 5 skills carregadas, o modelo Qwen3.5-4B (2048 ctx) recebe até 11 tools de uma vez — e falha em escolher a correta (alucina "não tenho acesso à previsão do tempo" mesmo com `get_weather` disponível).

Além disso, o corpo do `SKILL.md` (instruções de quando e como usar cada skill) nunca chega ao LLM. Apenas o `tool.description` da runtime.js é enviado.

## Solução: Progressive Disclosure

Dividir em dois rounds:

### Round 1: Escolha da skill

- **Tools expostas**: apenas `use_skill` (única OpenAI function)
- **Contexto extra**: lista das top 5 skills com nome + descrição curta do SKILL.md
- **LLM decide**: se a pergunta se encaixa em alguma skill, chama `use_skill(name: "weather")`
- Se não encaixar em nenhuma: LLM responde normalmente sem ativar skill

### Round 2+: Execução da skill

- **Tools expostas**: apenas as tools da skill escolhida (ex: `get_weather`)
- **Contexto extra**: SKILL.md body completo injetado como system message
- **LLM executa**: chama as tools da skill com os parâmetros corretos
- Se a skill não tiver tools (skill só de prompt): apenas o body do SKILL.md vai pro contexto

## Arquitetura

### `registry.js`

Nova função `buildUseSkillTool(topSkills)` que gera a tool `use_skill` com `enum` dos nomes das skills elegíveis:

```json
{
  "name": "use_skill",
  "description": "Ativa uma skill especializada... Skills: weather (previsao do tempo), search (busca web)...",
  "parameters": {
    "type": "object",
    "properties": {
      "name": {
        "type": "string",
        "enum": ["weather", "search", "memory", "scheduler", "launcher"],
        "description": "Nome da skill a ativar"
      }
    },
    "required": ["name"]
  }
}
```

### `chat-service.js`

Modificar o loop de rounds:

```
activeSkillId = null (inicia vazio)

round = 1:
  top5 = semantic search (ultra) ou lexical (non-ultra)
  if activeSkillId is null:
    tools = [use_skill(top5)]
    system += "Available skills: nome + descricao das top5"
    send to LLM

    if LLM returns use_skill(name):
      activeSkillId = name
      inject SKILL.md body as system message
      tools = tools da skill ativada
      continue (round 2 com contexto novo)

    else:
      // LLM respondeu sem ativar skill
      break

round >= 2:
  tools = tools da skill ativada
  system += SKILL.md body
  send to LLM

  if LLM calls tool:
    execute, tool result → continue
  else:
    break
```

### `semantic-engine.js`

Remover o early return `enabledSkills.length <= 5` que impede o embedding real de rodar. Scores reais são necessários para ranquear as top 5 skills corretamente.

### Fluxo de desativação

A cada nova mensagem do usuário, `activeSkillId` volta a `null`. A skill ativa só dura durante a resposta atual.

## Casos de borda

1. **LLM chama `use_skill` com nome inválido**: tool result com erro "skill desconhecida", LLM tenta novamente
2. **LLM pula `use_skill` e já quer chamar tool de skill interna**: a tool não existe no round 1 → erro "unknown tool" → LLM aprende
3. **Nenhuma skill é relevante**: LLM responde normalmente, sem ativar skill
4. **Skill sem tools (só prompt)**: SKILL.md body vai pro contexto, LLM usa o conhecimento
5. **Múltiplas tools na mesma skill**: scheduler tem 5 tools, todas disponíveis no round 2

## Tokens

| Item | Tokens |
|---|---|
| Tool `use_skill` + enum N skills | ~80-120 |
| Descrições das top 5 skills | ~200-350 |
| SKILL.md body (só se ativada) | ~200-500 |
| Tools da skill específica (só se ativada) | ~50-200 |
| **Total sem ativar skill** | **~280-470** |
| **Total com skill ativada** | **~530-1170** |

Contra ~900+ tokens do modelo atual (sempre expondo todas as tools).

## Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `scripts/skills/registry.js` | Adicionar `buildUseSkillTool()` |
| `scripts/node-core/services/chat-service.js` | Modificar round loop para progressive disclosure |
| `scripts/node-core/services/semantic-engine.js` | Remover early return `<= 5` |
