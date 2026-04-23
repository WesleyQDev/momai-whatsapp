---
description: Graphify Knowledge Graph - Always-On Context
globs:
alwaysApply: true
---

# Graphify Knowledge Graph Context

## Status
A knowledge graph for this project EXISTS at `graphify-out/`.
- **Graph:** `graphify-out/graph.json` (1069 nodes, 1718 edges, 30 communities)
- **Report:** `graphify-out/GRAPH_REPORT.md` (god nodes, surprising connections, suggested questions)
- **HTML Viz:** `graphify-out/graph.html` (interactive browser graph)

## When to Use the Graph

### ALWAYS use the graph first for:
- Architecture questions ("how does X relate to Y?")
- Cross-module dependencies
- Understanding community structure
- Finding surprising connections
- "Why was this built this way?" (rationale edges)

### Use grep/file-read ONLY when:
- The graph has no relevant nodes (check GRAPH_REPORT.md first)
- You need the exact current line of code
- It's a specific bug in a single file

## How to Query the Graph (No Inline Python!)

Use the pre-built scripts in `.opencode/scripts/` via `bash` tool:

### Query (Broad Context)
```bash
python .opencode/scripts/graphify-query.py "how does WakeWordDetector connect to TTS"
```
Options: `--mode bfs` (default) or `--mode dfs`, `--budget 1500`

### Path (Trace Dependencies)
```bash
python .opencode/scripts/graphify-path.py "WakeWordDetector" "TTSManager"
```

### Explain (Single Concept)
```bash
python .opencode/scripts/graphify-explain.py "FortScript"
```

### Fallbacks
If scripts fail:
1. Read `graphify-out/GRAPH_REPORT.md` directly
2. Use `grep` in `graphify-out/graph.json` for raw data
3. Only then fall back to file reads

## Key God Nodes (Most Connected)
1. **React** (54 edges) - UI layer bridge across communities
2. **WakeWordDetector** (35 edges) - Voice subsystem core
3. **handleRequest()** (27 edges) - Main request handler
4. **t()** (26 edges) - i18n translation function
5. **streamLlamaChat()** (25 edges) - LLM streaming

## Key Communities
- **Backend Orchestration** (99 nodes) - Core business logic
- **Frontend API & Features** (54 nodes) - Renderer API surface
- **Voice & State Management** (68 nodes) - Voice pipeline, state
- **React UI Layer** (16 nodes) - Component rendering
- **Skill Runtimes** (16 nodes) - Skill execution engine

## Rules
1. **Before answering architecture questions:** Run graphify scripts or read GRAPH_REPORT.md
2. **Prefer graph over grep:** For "how does X work?" or "what connects to Y?"
3. **Cite the graph:** When answering from graph data, mention which community/node you found it in
4. **Update after changes:** Run `graphify update .` after significant refactoring
5. **Never hallucinate:** If the graph doesn't have the answer, say so - don't make up edges
6. **No inline Python:** Always use `.opencode/scripts/graphify-*.py` scripts instead of inline `python -c "..."`
