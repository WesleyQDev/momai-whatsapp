#!/usr/bin/env python3
"""
graphify-explain.py - Explain a single concept/node from the graph.
Usage: python .opencode/scripts/graphify-explain.py <concept>
"""
import json
import sys
from pathlib import Path
from networkx.readwrite import json_graph

GRAPH_PATH = Path("graphify-out/graph.json")

def load_graph():
    if not GRAPH_PATH.exists():
        print("ERROR: graph.json not found.", file=sys.stderr)
        sys.exit(1)
    data = json.loads(GRAPH_PATH.read_text())
    return json_graph.node_link_graph(data, edges="links")

def find_node(G, term):
    term_lower = term.lower()
    scored = sorted(
        [(sum(1 for w in term_lower.split() if w in G.nodes[n].get("label","").lower()), n)
         for n in G.nodes()],
        reverse=True
    )
    return scored[0][1] if scored and scored[0][0] > 0 else None

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python graphify-explain.py <concept>", file=sys.stderr)
        sys.exit(1)
    
    G = load_graph()
    nid = find_node(G, sys.argv[1])
    
    if not nid:
        print(f"No node matching: {sys.argv[1]!r}")
        sys.exit(0)
    
    d = G.nodes[nid]
    print(f"=== {d.get('label', nid)} ===")
    print(f"Source: {d.get('source_file', 'unknown')}")
    print(f"Type: {d.get('file_type', 'unknown')}")
    print(f"Degree: {G.degree(nid)}")
    print()
    print("CONNECTIONS:")
    for neighbor in G.neighbors(nid):
        edge = G.edges[nid, neighbor]
        nlabel = G.nodes[neighbor].get("label", neighbor)
        rel = edge.get("relation", "")
        conf = edge.get("confidence", "")
        src = G.nodes[neighbor].get("source_file", "")
        print(f"  --{rel}--> {nlabel} [{conf}] ({src})")
