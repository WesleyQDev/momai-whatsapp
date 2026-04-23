# Graphify Tools for OpenCode
# These tools enable graph-aware queries without inline Python scripts.
# Usage: The assistant reads these definitions and knows how to query the graph
# using the standard tool.execute protocol.

## Tool: graphify_query

Execute a graph query using the pre-installed graphify Python package.

**When to use:**
- "How does X work?"
- "What connects X to Y?"
- "Show me the architecture around Z"

**Parameters:**
- `question` (string, required): The natural language question to query
- `mode` (string, optional): `"bfs"` (default, broad context) or `"dfs"` (trace specific path)
- `budget` (number, optional): Max tokens for response, default 2000

**Implementation:**
This tool runs `python -m graphify.query` against `graphify-out/graph.json`.

**Fallback:** If graphify CLI is not available, falls back to reading `graphify-out/GRAPH_REPORT.md`.

**Example:**
```json
{
  "tool": "graphify_query",
  "args": {
    "question": "how does WakeWordDetector connect to TTS",
    "mode": "bfs"
  }
}
```

---

## Tool: graphify_path

Find the shortest path between two concepts in the knowledge graph.

**When to use:**
- "How does X reach Y?"
- "What is the dependency chain from A to B?"

**Parameters:**
- `from` (string, required): Starting concept/node name
- `to` (string, required): Target concept/node name

**Implementation:**
Runs NetworkX shortest_path on `graphify-out/graph.json`.

**Fallback:** If path not found in graph, falls back to grep search.

**Example:**
```json
{
  "tool": "graphify_path",
  "args": {
    "from": "WakeWordDetector",
    "to": "TTSManager"
  }
}
```

---

## Tool: graphify_explain

Get a plain-language explanation of any node/concept in the graph.

**When to use:**
- "What is X?"
- "Explain how Y works"

**Parameters:**
- `concept` (string, required): The concept/node to explain

**Implementation:**
Looks up node in graph.json and returns its connections, source file, and community.

**Fallback:** If node not in graph, falls back to reading the source file directly.

**Example:**
```json
{
  "tool": "graphify_explain",
  "args": {
    "concept": "FortScript"
  }
}
```

---

## Tool: graphify_report

Read the GRAPH_REPORT.md summary for high-level architecture context.

**When to use:**
- At the START of any architecture discussion
- When you need to understand the big picture
- Before diving into specific files

**Parameters:**
- `section` (string, optional): `"god_nodes"`, `"communities"`, `"surprising_connections"`, `"suggested_questions"`, or `"all"` (default)

**Implementation:**
Direct file read of `graphify-out/GRAPH_REPORT.md`.

**Example:**
```json
{
  "tool": "graphify_report",
  "args": {
    "section": "god_nodes"
  }
}
```

---

## Tool: graphify_update

Update the knowledge graph incrementally (only changed files).

**When to use:**
- After significant code refactoring
- After adding new features
- Before committing if you want the graph current

**Parameters:**
- `path` (string, optional): Path to update, default "."
- `mode` (string, optional): `"ast"` (code only, fast, no LLM) or `"full"` (includes semantic)

**Implementation:**
Runs `graphify update <path>`.

**Example:**
```json
{
  "tool": "graphify_update",
  "args": {
    "path": ".",
    "mode": "ast"
  }
}
```

---

## Usage Protocol for Assistants

1. **Always check graph first** for architecture questions
2. **Use `graphify_report` at session start** if discussing codebase structure
3. **Prefer `graphify_query` over `grep`** for "how/what/why" questions
4. **Use `graphify_path`** to trace dependencies
5. **Use `graphify_explain`** to understand specific concepts
6. **Fallback to file-read** only when:
   - Graph has no relevant nodes
   - You need exact current code lines
   - It's a specific bug in a single file

## Notes
- All tools use `graphify-out/graph.json` (persistent graph)
- AST-only updates (`graphify update .`) are fast and LLM-free
- The graph is the map. File reads are the street view. Use the map first.
