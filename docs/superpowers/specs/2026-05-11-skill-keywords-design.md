# Palavra-chave Personalizada por Skill

**Data:** 2026-05-11
**Status:** Design aprovado, aguardando implementação
**Trello:** [Adicionar palavra chave personalizada por skill 4h](https://trello.com/c/PWoAueZN)

## Resumo

Permitir que o usuário defina palavras-chave customizadas para cada skill, funcionando como atalhos de voz que ignoram a wake word "Luna". Por exemplo, definir "Abrir" para a skill Launcher permite dizer "Abrir pasta x" para acionar diretamente, sem precisar de "Luna abrir pasta x".

## Arquitetura

### Fluxo de Voz (Proposto)

```
Usuário fala
  → Python (STT + wake word "Luna")
  → Node Core /chat/voice-command
      ├── KeywordRouter (novo módulo)
      │   → match de keyword? roteia direto pra skill via skillRegistry.execute()
      │   → sem match? fluxo normal (LLM descobre a skill)
```

O TTS não é afetado — o KeywordRouter atua apenas no texto de entrada.

### KeywordRouter

Novo módulo em `scripts/node-core/services/keyword-router.js`:

```javascript
function routeByKeyword(text, skillRegistry, store) {
  const normalized = text.toLowerCase().trim()
  const keywords = store.skillKeywords || {}

  for (const [skillId, words] of Object.entries(keywords)) {
    const skill = skillRegistry.getById(skillId)
    if (!skill || !skill.enabled) continue

    for (const kw of words) {
      const kwLower = kw.toLowerCase().trim()
      const kwTokens = kwLower.split(/\s+/)
      const inputTokens = normalized.split(/\s+/)

      // Subsequência de tokens no início do input
      let inputIdx = 0
      let match = true
      for (const token of kwTokens) {
        while (inputIdx < inputTokens.length && inputTokens[inputIdx] !== token) {
          inputIdx++ // pula palavras entre os tokens da keyword
        }
        if (inputIdx >= inputTokens.length) {
          match = false
          break
        }
        inputIdx++
      }

      if (match) {
        return { skillId, keyword: kw, matched: true }
      }
    }
  }

  return { matched: false }
}
```

**Algoritmo de matching:**
- Tokeniza a keyword e o input do usuário
- Verifica se os tokens da keyword aparecem como **subsequência** no início do input
- Pula palavras intermediárias (artigos, preposições) sem hardcode de stop words
- Funciona para qualquer idioma naturalmente
- Complexidade: O(K × N) na prática < 300 operações

### Armazenamento

Em `store.json` (mesmo arquivo de `store.extensions`):

```json
{
  "skillKeywords": {
    "launcher": ["abre", "abrir", "abra"],
    "whatsapp": ["mensagem", "envia"],
    "web-search": ["busca", "pesquisa", "procura"]
  }
}
```

### API

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/skills/keywords` | Retorna `{ skillId: [keywords] }` |
| `PUT` | `/skills/keywords/:skillId` | Body: `{ keywords: ["abre", "abrir"] }` |

### Integração com Extensões

| Ação | Comportamento |
|------|--------------|
| **Instalar extensão** | Keywords populadas automaticamente dos `intents` do SKILL.md |
| **Desinstalar extensão** | `delete store.skillKeywords[extId]` — limpeza automática |
| **Desabilitar skill** | Keywords persistem, KeywordRouter ignora se skill estiver desabilitada |
| **Reabilitar skill** | Keywords voltam a funcionar imediatamente |

### UI — Settings > Skills

Nova seção em Settings (compartilhando `GET /extensions` com ExtensionsView):

```
┌──────────────────────────────────────────────┐
│  Skills                                       │
│                                               │
│  ┌──────────────────────────────────────────┐ │
│  │ 🔧 Launcher          Palavras-chave:     │ │
│  │   [abre] [abrir] [abra]                  │ │
│  │                          [Editar]        │ │
│  ├──────────────────────────────────────────┤ │
│  │ 💬 WhatsApp           Palavras-chave:    │ │
│  │   [mensagem]                             │ │
│  │                          [Editar]        │ │
│  └──────────────────────────────────────────┘ │
└──────────────────────────────────────────────┘
```

Popup de edição:

```
┌──────────────────────────┐
│ Editar keywords: launcher│
│                          │
│ [abre] [abrir] [abra]    │
│                          │
│ [+ Adicionar palavra]    │
│                          │
│ [Cancelar]  [Salvar]     │
└──────────────────────────┘
```

### Casos de Borda

| Caso | Comportamento |
|------|--------------|
| Sem match de keyword | Fluxo normal: LLM descobre a skill |
| Keyword match | Roteia direto pra skill sem LLM |
| Skill desabilitada | Keyword ignorada |
| Remover todas keywords | Skill deixa de ter atalho de voz |
| Múltiplas skills mesma keyword | Validação na UI: "Essa keyword já está em uso pela skill X" |
| Extensão removida | Keywords deletadas do store junto |

## Arquivos Envolvidos

| Arquivo | Tipo | Mudança |
|---------|------|---------|
| `scripts/node-core/services/keyword-router.js` | **Novo** | Lógica de matching |
| `scripts/node-core/api/routes/extensions.routes.js` | **Modificar** | Seeding/cleanup de keywords em install/uninstall |
| `scripts/node-core/services/chat-service.js` | **Modificar** | Injetar KeywordRouter antes do LLM |
| `scripts/node-core/store.js` | **Modificar** | Adicionar `skillKeywords` ao defaultStore |
| `scripts/node-core/services/skill-orchestrator.js` | **Modificar** | Incluir keywords no payload |
| `scripts/skills/registry.js` | **Modificar** | Opcional: expor método getAllEnabled |
| `src/renderer/src/views/SettingsSkillsView.tsx` | **Novo** | UI de configuração de keywords |
| `src/renderer/src/services/api.ts` | **Modificar** | Adicionar fetch/update keywords |
