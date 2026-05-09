# Plataforma de Extensões e Skills

## Visão Geral

O MomAI possui uma plataforma de extensões que permite adicionar novas capacidades ao assistente. Extensões podem fornecer ferramentas executadas pelo LLM, hooks de ciclo de vida, eventos personalizados, UI na barra lateral e configurações próprias. Existem três tipos de extensões:

1. **Built-in (core)**: Skills nativas incluídas no app em `scripts/skills/core/`
2. **Packaged**: Skills empacotadas pré-instaladas em `scripts/skills/packaged/`
3. **Extension**: Extensões instaladas pelo usuário em `data/extensions/`

## Como Funciona o Sistema de Skills

As skills são carregadas dinamicamente pelo **Skill Registry** (`scripts/skills/registry.js`, 621 linhas). Este registro:

1. **Escaneia** os diretórios de skills (core, packaged, extensions)
2. **Parseia** o arquivo `SKILL.md` de cada skill (formato frontmatter YAML + markdown)
3. **Carrega** o `runtime.js` (execução da skill) via import dinâmico
4. **Registra** ferramentas (tools) que o LLM pode invocar
5. **Expõe** as skills via API no formato OpenAI function calling

### Skill Registry (registry.js)

O arquivo `registry.js` exporta uma fábrica `createSkillRegistry()` que retorna um objeto com métodos:

| Método | Função |
|--------|--------|
| `initialize()` | Carrega todas as skills (builtins, packaged, extensions) |
| `refresh()` | Recarrega tudo |
| `getAll()` | Retorna todas as skills |
| `getEnabled()` | Retorna skills habilitadas |
| `getById(id)` | Busca por ID (busca em builtins, packaged, extensions) |
| `discover(query)` | Descoberta lexical de skill por texto |
| `execute(id, input, context)` | Executa uma skill |
| `executeHook(id, hookName, payload)` | Executa hook de ciclo de vida |
| `toListPayload()` | Gera payload para API listar skills |
| `toOpenAITools(ids?)` | Gera tools no formato OpenAI function calling |

O registro mantém um **cache de tools** (`_toolsCache`) que é invalidado quando a geração de skills muda (`_skillsGeneration`), evitando recomputar a cada requisição.

### Descoberta de Skills (discovery)

Quando o usuário faz uma pergunta, o método `discover(query)` usa um algoritmo lexical simples para encontrar a skill mais relevante:

1. Para cada skill habilitada, calcula um score baseado em:
   - **+3 pontos** por intent correspondente (palavras-chave definidas no SKILL.md)
   - **+1 ponto** por token da query que aparece na descrição
2. Retorna a skill com maior score (mínimo > 0)
3. Confiança = `min(0.95, score / 3)`

Isso permite roteamento rápido sem depender de embeddings para descoberta, embora o **Semantic Engine** (LanceDB) também possa ser usado para intenções mais complexas em tiers superiores.

## Manifesto de Extensão (manifest.json)

Toda extensão instalada pelo usuário deve ter um `manifest.json` na raiz:

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
| `name` | ✅ | Nome exibido na UI |
| `description` | ✅ | Descrição curta |
| `runtime` | ✅ | `python` ou `node` |
| `entrypoint` | ✅ | Arquivo principal |
| `permissions` | ❌ | Permissões declarativas (network, filesystem, subprocess) |
| `settings_schema` | ❌ | Schema JSON Schema para configurações da extensão |
| `events` | ❌ | Eventos que a extensão escuta |
| `ui.sidebar` | ❌ | Entrada na barra lateral |

## Skills Node.js (runtime.js)

Skills que rodam no runtime Node.js (dentro do Node Core) expõem **ferramentas** que o LLM pode invocar.

### Estrutura

```
scripts/skills/core/my-skill/
├── SKILL.md          # Documentação da skill (frontmatter + instructions)
├── ABOUT.md          # Descrição para o usuário
├── runtime.js        # Implementação (tools + execute)
├── locales/          # Traduções (opcional)
│   ├── pt-BR.json
│   └── en-US.json
└── README.md         # READMEs em múltiplos idiomas
├── README.en-US.md
```

### SKILL.md

Arquivo com frontmatter YAML que define metadados da skill:

```yaml
---
name: Weather
description: Previsão do tempo para qualquer localidade
intents:
  - tempo
  - clima
  - previsão do tempo
  - weather
  - forecast
allowed-tools:
  - web_search
icon: Cloud
author: MomAI Team
version: 1.0.0
---

Instruções detalhadas para o LLM sobre como usar esta skill...
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

O frontend registra um renderizador para cada tipo de resposta estruturada em `SkillResponseRegistry.ts`. O fluxo completo:

```
Skill runtime.js
    |
    v
return { structuredResponse: { type: 'weather', data: {...} } }
    |
    v
node-core.js streams { structured_response: {...} } via SSE
    |
    v
Frontend recebe via callback onStructuredResponse
    |
    v
StructuredResponseRenderer dispatche para o componente registrado
    |
    v
WeatherCard (ou outro renderer) exibe a UI
```

### Renderizadores Disponíveis

| Componente | Type | Propósito |
|------------|------|-----------|
| `WeatherCard.tsx` | `weather` | Previsão do tempo (77 linhas) |
| `RemindersCard.tsx` | `reminders` | Lista de lembretes |
| `DevResultCard.tsx` | `dev_result` | Resultados de execução de código |
| `DevConfirmationCard.tsx` | `dev_confirmation` | Confirmação de ação de código |
| `DevHtmlRenderCard.tsx` | `dev_html` | Preview HTML renderizado |
| `HtmlPreviewCard.tsx` | `html_preview` | Preview HTML genérico |
| `GenericExtensionCard.tsx` | `extension` | Output genérico de extensão |
| `ExtensionRendererLoader.tsx` | dinâmico | Lazy-load de renderizadores de extensão |
| `ExtrasRenderer.tsx` | extras | Output de ferramentas extras |

## APIs de Extensão

| Rota | Método | Descrição |
|------|--------|-----------|
| `/extensions/:id/settings` | GET | Obtém configurações da extensão |
| `/extensions/:id/settings` | POST | Atualiza configurações |
| `/extensions/sidebar-menu` | GET | Menu da sidebar de extensões |
| `/extensions/events/emit` | POST | Emite evento para extensões |

## Ciclo de Vida

Extensões Node.js podem implementar hooks no `module.exports.hooks`:

| Hook | Disparado Quando |
|------|-----------------|
| `onInstall` | Extensão instalada |
| `onActivate` | Extensão ativada |
| `onDeactivate` | Extensão desativada |
| `onUninstall` | Extensão desinstalada |

```javascript
module.exports = {
  hooks: {
    async onInstall({ extId, extDir }) {
      // Inicialização: criar diretórios, configurar estado
    },
    async onUninstall({ extId, extDir }) {
      // Limpeza: remover arquivos temporários
    }
  }
}
```

## Permissões

O sistema de permissões usa um schema declarativo com níveis de risco:

- **network.allowed**: Acesso à rede (domínios específicos)
- **filesystem.allowed**: Leitura/escrita em diretórios específicos
- **subprocess.allowed**: Execução de comandos
- **shell.allowed**: Acesso ao shell
- **process.allowed**: Gerenciamento de processos
- **system_info.allowed**: Acesso a informações do sistema

O `createPermissionSchema()` em `scripts/node-core/permissions/schema.js` permite:
- Mesclar permissões do manifest com defaults
- Calcular nível de risco (low, medium, high)
- Resumir permissões para exibição ao usuário

## Skills Built-in

| Skill | Diretório | Função |
|-------|-----------|--------|
| Weather | `scripts/skills/core/weather/` | Previsão do tempo via Open-Meteo API (246 linhas) |
| Search | `scripts/skills/core/search/` | Pesquisa web via DuckDuckGo (22 linhas) |
| Scheduler | `scripts/skills/core/scheduler/` | Lembretes agendados |
| Memory | `scripts/skills/core/memory/` | Memória persistente do usuário |

### Weather Skill (Exemplo Detalhado)

A skill de clima demonstra o padrão completo de resposta estruturada:

1. Extrai localização do texto do usuário via regex (`extractLocation()`)
2. Chama API de geocoding (Open-Meteo) para resolver coordenadas
3. Busca previsão de 7 dias na API Open-Meteo
4. Mapeia códigos WMO para condições legíveis em português
5. Retorna `structuredResponse` com type `'weather'`
6. O WeatherCard no frontend renderiza o card visual com emoji, temperatura e previsão

## Skills Packaged

| Skill | Diretório | Função |
|-------|-----------|--------|
| Dev | `scripts/skills/packaged/dev/` | Execução de código |
| Launcher | `scripts/skills/packaged/launcher/` | Lançador de aplicativos |

## Execution Isolada

Extensões (não-builtins) são executadas em um **host isolado** via `extension-host-manager.js`. Isso significa que:

- Skills built-in rodam no mesmo processo do Node Core (rápido, sem overhead)
- Extensões e skills packaged rodam em processo separado (segurança, isolamento)
- O sistema de permissões é verificado antes da execução
