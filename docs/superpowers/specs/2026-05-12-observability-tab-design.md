# Observabilidade de IA — Design

## Problema

Desenvolvedores não têm visibilidade do que acontece "por baixo dos panos" na MomAI: velocidade real de tokens, prompt completo enviado ao LLM, tools executadas em detalhe, latência de cada etapa.

## Solução

Nova tab **Observability** na LateralBar principal, controlada por um toggle na aba Dev de Settings.

## Arquitetura

```
Node Core (chat-service.js)
  │  Coleta trace ao final de streamLlamaChat()
  │  Emite via WebSocket: { type: "observability_trace", data: Trace }
  │  Mantém buffer circular (50 traces) em memória
  ▼
Renderer (useChatHandlers.ts)
  │  Escuta evento, armazena em buffer no React context/state
  ▼
ObservabilityView (nova view)
  │  Lista + detalhes + gráfico
  ▼
LateralBar.tsx
  │  Exibe ícone "Observability" se momai_observability_enabled === 'true'
  ▼
DeveloperTab.tsx
  │  Toggle "Observabilidade de IA"
```

## Trace Data

```typescript
interface ObservabilityTrace {
  id: string
  timestamp: number
  type: 'llm_call' | 'skill' | 'fallback'

  // Timing (ms)
  total_duration: number
  pre_llm_duration: number
  first_token_duration: number
  generation_duration: number

  // LLM
  system_prompt?: string
  messages?: { role: string; content: string }[]
  response?: string
  tokens_per_second: number
  total_tokens: number
  estimated_prompt_tokens: number
  generated_tokens: number

  // Config
  model: string
  tier: string
  tools_count: number

  // Skills/Tools
  tool_calls?: {
    tool_name: string
    args: any
    result?: string
    duration_ms?: number
  }[]
  active_skill?: string

  // Thread
  thread_id: string

  // Status
  status: 'success' | 'error'
  error?: string
}
```

## Telas

### Tabela com expansão inline (visão principal)

- Colunas: Hora | Tipo (ícone) | Duração | Tok/s (barra) | Tokens
- Cada linha expansível via clique no ▶
- Expandido mostra:
  - **System Prompt** (com contagem de tokens)
  - **Messages** (user + tool_calls + tool_results + assistant)
  - **Timing** (árvore: pre-llama, first token, generation, total)
  - **Ferramentas** (tabela: tool, args, duração, resultado)
- Cores: LLM=azul, Skill=verde, Erro=vermelho

### Gráfico de tendência (topo)

- Mini gráfico de tokens/s ao longo do tempo (últimos 30 pontos)
- Usando SVG inline (sem lib extra) para performance

### Filtros

- Abas: Todas | LLM | Skills | Erros
- Campo de busca textual

## Mudanças necessárias

### Node Core

1. **`chat-service.js`**: No final de `streamLlamaChat()` (após `done` ou `error`), emitir trace via `broadcast({ type: 'observability_trace', data: {...} })`
2. **`shared-state.js`**: Adicionar `observabilityBuffer: []` (array circular, max 50)
3. API REST opcional: `GET /observability/traces` (opcional, o buffer WebSocket cobre o caso real-time)

### Renderer

4. **`useChatHandlers.ts`**: Adicionar handler para `msg.type === 'observability_trace'` → dispara evento `momai_observability_trace`
5. **`ObservabilityView.tsx`**: Nova view em `src/renderer/src/views/`
6. **`MainViewRenderer.tsx`**: Adicionar `ObservabilityDashboard: ObservabilityView` no VIEW_MAP
7. **`App.tsx`**: Adicionar `'/observability': 'ObservabilityDashboard'` no viewMapping
8. **`LateralBar.tsx`**: Adicionar botão condicional (só se `momai_observability_enabled === 'true'`)
9. **`DeveloperTab.tsx`**: Adicionar card "Observabilidade de IA" com toggle

## Toggle persistence

- `localStorage('momai_observability_enabled')` — mesmo padrão do dev mode
- Evento `momai_observability_sync` para sincronização entre componentes
- Padrão: desligado

## Performance

- Buffer circular de 50 traces (sem crescimento infinito)
- Expansão inline: detalhes só renderizam quando clicados
- Gráfico SVG inline, sem dependências
- WebSocket já aberto, sem conexão extra
