# Graphify — Knowledge Graph do Projeto

## Visão Geral

O projeto mantém um **grafo de conhecimento** (knowledge graph) do código e documentação em `graphify-out/`, gerado pela ferramenta `graphify`. Este grafo mapeia todo o código-fonte, documentação e suas relações em um grafo navegável.

## O que o Graphify Cria

- **Nós**: Arquivos, classes, funções, conceitos, dependências — tudo vira um nó no grafo
- **Arestas**: Relações entre os nós (importa, estende, implementa, chama, etc.)
- **Comunidades**: Clusters de nós relacionados — 268 comunidades foram detectadas na análise atual

## Estrutura

```
graphify-out/
├── GRAPH_REPORT.md       # Relatório completo do grafo
├── graph.json            # Grafo em formato JSON
├── manifest.json         # Metadados da análise
├── cost.json             # Custo computacional da análise
├── cache/                # Cache de chunks analisados
└── wiki/                 # Wiki gerado automaticamente (se existir)
```

## Comandos

```bash
# Atualizar o grafo após modificar código
graphify update .

# Explicar um conceito (mostra contexto do grafo)
graphify explain "<conceito>"

# Encontrar caminho entre dois componentes
graphify path "<Componente A>" "<Componente B>"

# Consultar o grafo
graphify query "<pergunta>"
```

## Quando Usar

1. **Antes de refatorar**: Entenda como módulos se relacionam
2. **Para encontrar dependências não óbvias**: O grafo revela conexões que você não esperava
3. **Para descobrir dead code**: Nós sem arestas = código não utilizado
4. **Para entender o impacto de mudanças**: Quem depende de quem
5. **Para onboarding**: Navegue pelo grafo para entender a arquitetura

## Interface Visual

O frontend do MomAI também inclui um visualizador de grafo interativo (via `react-force-graph-2d` em `GraphInterface.tsx`) que pode exibir o grafo de agentes LangGraph em tempo real durante conversas.
