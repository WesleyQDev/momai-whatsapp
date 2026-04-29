# Plataforma de Extensões / Skills

## Visão Geral

MomAI possui uma plataforma de extensões que permite adicionar novas capacidades ao assistente. As extensões podem fornecer **ferramentas** (executadas pelo LLM), **hooks de lifecycle**, **eventos**, **UI na sidebar** e **configurações próprias**.

## Tipos de Extensão

| Tipo | Diretório | Descrição |
|------|-----------|-----------|
| **Built-in (core)** | `scripts/skills/core/` | Skills nativas incluídas no app |
| **Packaged** | `scripts/skills/packaged/` | Skills empacotadas pré-instaladas |
| **Extension** | `data/extensions/` | Extensões instaladas pelo usuário |

## Manifest v1

Toda extensão deve ter um `manifest.json` na raiz:

```json
{
  "manifest_version": 1,
  "id": "my-extension",
  "name": "Minha Extensão",
  "description": "Descrição da extensão.",
  "runtime": "python",
  "entrypoint": "main.py",
  "permissions": {
    "network": { "allowed": false, "domains": [] },
    "filesystem": { "allowed": true, "read": ["./data"], "write": [] },
    "subprocess": { "allowed": false, "commands": [] }
  },
  "settings_schema": {
    "type": "object",
    "required": ["api_key"],
    "properties": {
      "api_key": { "type": "string" },
      "enabled": { "type": "boolean", "default": true }
    }
  },
  "events": ["app_started", "idle_tick"],
  "ui": {
    "sidebar": {
      "enabled": true,
      "label": "Minha Ext",
      "route": "/extensions/my-extension",
      "icon": "Puzzle"
    }
  }
}
```

### Campos do Manifest

| Campo | Obrigatório | Descrição |
|-------|-------------|-----------|
| `manifest_version` | ✅ | Atualmente sempre `1` |
| `id` | ✅ | Identificador único |
| `name` | ✅ | Nome exibido |
| `description` | ✅ | Descrição curta |
| `runtime` | ✅ | `python` ou `node` |
| `entrypoint` | ✅ | Arquivo principal |
| `permissions` | ❌ | Permissões declarativas |
| `settings_schema` | ❌ | Schema JSON de configurações |
| `events` | ❌ | Eventos que a extensão escuta |
| `ui.sidebar` | ❌ | Entrada na barra lateral |

## Skills (Node.js)

Skills são extensões que rodam no runtime Node.js (dentro do Node Core) e expõem **ferramentas** que o LLM pode invocar.

### Estrutura de uma Skill

```
scripts/skills/core/my-skill/
├── SKILL.md          # Documentação da skill
├── ABOUT.md          # Descrição para o usuário
└── runtime.js        # Implementação
```

### runtime.js

```javascript
module.exports = {
  tools: [
    {
      name: 'my_tool',
      description: 'Faz alguma coisa',
      parameters: {
        type: 'object',
        properties: {
          param1: { type: 'string', description: 'Parâmetro 1' }
        },
        required: ['param1']
      }
    }
  ],

  async execute({ content, context }) {
    // Lógica da skill
    return {
      tool: 'my_tool',
      directResponse: 'Resultado da execução',
      instruction: JSON.stringify(result)
    }
  }
}
```

### Respostas Estruturadas

Skills podem retornar componentes UI ricos em vez de texto puro:

```javascript
return {
  tool: 'weather',
  structuredResponse: {
    type: 'weather',
    data: {
      location: 'São Paulo',
      temperature: 28,
      condition: 'Sunny'
    }
  },
  instruction: JSON.stringify(result),
  webSources: ['https://api.weather.com']
}
```

O frontend registra renderizadores para cada tipo:

```tsx
import { registerRenderer } from './SkillResponseRegistry'
import WeatherCard from './WeatherCard'

registerRenderer('weather', WeatherCard)
```

## APIs de Extensão

| Rota | Método | Descrição |
|------|--------|-----------|
| `/extensions/:id/settings` | GET | Obtém configurações |
| `/extensions/:id/settings` | POST | Atualiza configurações |
| `/extensions/sidebar-menu` | GET | Menu da sidebar das extensões |
| `/extensions/events/emit` | POST | Emite evento para extensões |

## Hooks de Lifecycle

Extensões podem implementar hooks em seu `manifest.json` via events:

| Evento | Disparado Quando |
|--------|-----------------|
| `app_started` | Aplicação inicializada |
| `idle_tick` | Tick de idle (a cada N segundos) |
| (custom) | Emitido via API `/extensions/events/emit` |

## Skills Built-in

| Skill | Diretório | Função |
|-------|-----------|--------|
| Weather | `scripts/skills/core/weather/` | Previsão do tempo via DuckDuckGo |
| Search | `scripts/skills/core/search/` | Pesquisa web |
| Scheduler | `scripts/skills/core/scheduler/` | Lembretes agendados |
| Memory | `scripts/skills/core/memory/` | Memória persistente |
