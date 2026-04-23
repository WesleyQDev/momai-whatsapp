#!/usr/bin/env python3
"""
graphify-path.py - Find shortest path between two concepts in the graph.
Usage: python .opencode/scripts/graphify-path.py <from_concept> <to_concept>
"""
import json
import sys
from pathlib import Path
from networkx.readwrite import json_graph
import networkx as nx

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
    if len(sys.argv) < 3:
        print("Usage: python graphify-path.py <from> <to>", file=sys.stderr)
        sys.exit(1)
    
    G = load_graph()
    src = find_node(G, sys.argv[1])
    tgt = find_node(G, sys.argv[2])
    
    if not src or not tgt:
        print(f"Could not find nodes: {sys.argv[1]!r} or {sys.argv[2]!r}")
        sys.exit(0)
    
    try:
        path = nx.shortest_path(G, src, tgt)
        print(f"Shortest path ({len(path)-1} hops):")
        for i, nid in enumerate(path):
            label = G.nodes[nid].get("label", nid)
            if i < len(path) - 1:
                edge = G.edges[nid, path[i+1]]
                rel = edge.get("relation", "")
                conf = edge.get("confidence", "")
                print(f"  {label}")
                print(f"    --{rel}--> [{conf}]")
            else:
                print(f"  {label}")
    except nx.NetworkXNoPath:
        print(f"No path found between {sys.argv[1]!r} and {sys.argv[2]!r}")
    except nx.NodeNotFound as e:
        print(f"Node not found: {e}")
