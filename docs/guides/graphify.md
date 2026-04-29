# Graphify

O projeto Mantém um **knowledge graph** do código e documentação em `graphify-out/`, gerado pela ferramenta `graphify`.

## O que é

Graphify analisa todo o código-fonte e documentação para construir um grafo de conhecimento com:
- **Nós:** Arquivos, classes, funções, conceitos, dependências
- **Arestas:** Relações entre os nós (importa, estende, implementa, etc.)
- **Comunidades:** Clusters de nós relacionados (268 comunidades detectadas)

## Como Usar

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

## Estrutura

```
graphify-out/
├── GRAPH_REPORT.md       # Relatório completo do grafo
├── graph.json            # Grafo em JSON
├── manifest.json         # Metadados
├── cost.json             # Custo da análise
├── cache/                # Cache de chunks analisados
└── wiki/                 # Wiki gerado (se existir)
```

## Quando Consultar

- Antes de refatorar código de módulos diferentes
- Para entender como dois componentes se relacionam
- Para encontrar dependências não óbvias
- Para descobrir dead code ou código legado
