#!/usr/bin/env python3
"""
graphify-query.py - Query the knowledge graph without inline Python scripts.
Usage: python .opencode/scripts/graphify-query.py <question> [--mode bfs|dfs] [--budget N]
"""
import json
import sys
from pathlib import Path
from networkx.readwrite import json_graph

GRAPH_PATH = Path("graphify-out/graph.json")

def load_graph():
    if not GRAPH_PATH.exists():
        print("ERROR: graph.json not found. Run 'graphify .' first.", file=sys.stderr)
        sys.exit(1)
    data = json.loads(GRAPH_PATH.read_text())
    return json_graph.node_link_graph(data, edges="links")

def find_nodes(G, term):
    term_lower = term.lower()
    scored = []
    for nid, ndata in G.nodes(data=True):
        label = ndata.get("label", "").lower()
        score = sum(1 for w in term_lower.split() if w in label)
        if score > 0:
            scored.append((score, nid))
    scored.sort(reverse=True)
    return [nid for _, nid in scored[:3]]

def bfs_traversal(G, start_nodes, depth=3):
    subgraph_nodes = set(start_nodes)
    frontier = set(start_nodes)
    edges = []
    for _ in range(depth):
        next_frontier = set()
        for n in frontier:
            for neighbor in G.neighbors(n):
                if neighbor not in subgraph_nodes:
                    next_frontier.add(neighbor)
                    edges.append((n, neighbor))
        subgraph_nodes.update(next_frontier)
        frontier = next_frontier
    return subgraph_nodes, edges

def dfs_traversal(G, start_nodes, max_depth=6):
    visited = set()
    stack = [(n, 0) for n in reversed(start_nodes)]
    edges = []
    while stack:
        node, depth = stack.pop()
        if node in visited or depth > max_depth:
            continue
        visited.add(node)
        for neighbor in G.neighbors(node):
            if neighbor not in visited:
                stack.append((neighbor, depth + 1))
                edges.append((node, neighbor))
    return visited, edges

def print_results(G, nodes, edges, terms):
    print(f"Nodes found: {len(nodes)}")
    print(f"Edges found: {len(edges)}")
    print()
    
    # Rank by relevance
    def relevance(nid):
        label = G.nodes[nid].get("label", "").lower()
        return sum(1 for t in terms if t in label)
    
    ranked = sorted(nodes, key=relevance, reverse=True)
    
    print("=== NODES ===")
    for nid in ranked[:20]:
        d = G.nodes[nid]
        print(f"  {d.get('label', nid)} [{d.get('file_type','?')}] {d.get('source_file','')}")
    
    print()
    print("=== CONNECTIONS ===")
    for u, v in edges[:30]:
        if u in nodes and v in nodes:
            ed = G.edges[u, v]
            print(f"  {G.nodes[u].get('label',u)} --{ed.get('relation','')}--> {G.nodes[v].get('label',v)} [{ed.get('confidence','')}]")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python graphify-query.py <question> [--mode bfs|dfs] [--budget N]", file=sys.stderr)
        sys.exit(1)
    
    question = sys.argv[1]
    mode = "bfs"
    budget = 2000
    
    for i, arg in enumerate(sys.argv[2:], 2):
        if arg == "--mode" and i + 1 < len(sys.argv):
            mode = sys.argv[i + 1]
        elif arg == "--budget" and i + 1 < len(sys.argv):
            budget = int(sys.argv[i + 1])
    
    G = load_graph()
    terms = [t.lower() for t in question.split() if len(t) > 3]
    start_nodes = find_nodes(G, question)
    
    if not start_nodes:
        print(f"No nodes found for: {question}")
        sys.exit(0)
    
    if mode == "dfs":
        nodes, edges = dfs_traversal(G, start_nodes)
    else:
        nodes, edges = bfs_traversal(G, start_nodes)
    
    print_results(G, nodes, edges, terms)
