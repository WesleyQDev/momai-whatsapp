#!/usr/bin/env python3
"""
graphify-query.py - Query the knowledge graph without inline Python scripts.
Usage: python .opencode/scripts/graphify-query.py <question> [--mode bfs|dfs] [--budget N]
"""
import json
import os
import sys
import time
from pathlib import Path
from networkx.readwrite import json_graph
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeout

SCRIPT_DIR = Path(__file__).parent.parent  # C:\Users\wesle\dev\momai\.opencode\scripts\.. = C:\Users\wesle\dev\momai\.opencode
PROJECT_ROOT = SCRIPT_DIR.parent  # C:\Users\wesle\dev\momai
GRAPH_PATH = PROJECT_ROOT / "graphify-out" / "graph.json"
REPORT_PATH = PROJECT_ROOT / "graphify-out" / "GRAPH_REPORT.md"
TIMEOUT_SECONDS = 60  # Increased from 30 for larger graphs
NODE_TIMEOUT = 10
TRAVERSAL_TIMEOUT = 45
QUIET = os.getenv("GRAPHIFY_QUIET", "").lower() in {"1", "true", "yes", "on"}

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

def _log(level, msg):
    if QUIET and level == "INFO":
        return
    print(f"[{level}] {msg}", file=sys.stderr)

def log_info(msg):
    _log("INFO", msg)

def log_warn(msg):
    _log("WARN", msg)

def log_error(msg):
    _log("ERROR", msg)

def log_fallback(msg):
    _log("FALLBACK", msg)

def load_graph():
    if not GRAPH_PATH.exists():
        log_error("graph.json não encontrado. Execute 'graphify .' primeiro.")
        fallback_to_report()
        sys.exit(1)
    
    log_info(f"Carregando grafo de {GRAPH_PATH}...")
    start = time.time()
    try:
        with ThreadPoolExecutor() as executor:
            future = executor.submit(_load_graph_inner)
            G = future.result(timeout=TIMEOUT_SECONDS)
        elapsed = time.time() - start
        log_info(f"Grafo carregado em {elapsed:.2f}s - {G.number_of_nodes()} nós, {G.number_of_edges()} arestas")
        return G
    except FuturesTimeout:
        log_error(f"Timeout ({TIMEOUT_SECONDS}s) ao carregar grafo!")
        fallback_to_report()
        sys.exit(1)
    except Exception as e:
        log_error(f"Erro ao carregar grafo: {e}")
        fallback_to_report()
        sys.exit(1)

def _load_graph_inner():
    data = json.loads(GRAPH_PATH.read_text())
    return json_graph.node_link_graph(data, edges="links")

def fallback_to_report():
    log_fallback("Tentando ler GRAPH_REPORT.md...")
    if REPORT_PATH.exists():
        log_info(f"Lendo {REPORT_PATH} como fallback")
        print("\n=== FALLBACK: GRAPH REPORT ===")
        print(REPORT_PATH.read_text())
    else:
        log_error("GRAPH_REPORT.md também não encontrado!")
        print("Execute 'graphify .' para gerar o grafo.")

def find_nodes(G, term, timeout=NODE_TIMEOUT):
    log_info(f"Buscando nós para: '{term}'")
    start = time.time()
    term_lower = term.lower()
    scored = []
    for nid, ndata in G.nodes(data=True):
        if time.time() - start > timeout:
            log_warn(f"Timeout buscando nós após {timeout}s")
            break
        label = ndata.get("label", "").lower()
        score = sum(1 for w in term_lower.split() if w in label)
        if score > 0:
            scored.append((score, nid))
    scored.sort(reverse=True)
    result = [nid for _, nid in scored[:5]]  # Increased from 3
    log_info(f"Encontrados {len(result)} nós")
    return result

def bfs_traversal(G, start_nodes, depth=3, timeout=TRAVERSAL_TIMEOUT):
    log_info(f"BFS traversal a partir de {len(start_nodes)} nós (depth={depth})")
    start = time.time()
    subgraph_nodes = set(start_nodes)
    frontier = set(start_nodes)
    edges = []
    for d in range(depth):
        if time.time() - start > timeout:
            log_warn(f"Timeout BFS no nível {d}")
            break
        next_frontier = set()
        for n in frontier:
            for neighbor in G.neighbors(n):
                if neighbor not in subgraph_nodes:
                    next_frontier.add(neighbor)
                    edges.append((n, neighbor))
        subgraph_nodes.update(next_frontier)
        frontier = next_frontier
    elapsed = time.time() - start
    log_info(f"BFS concluído em {elapsed:.2f}s: {len(subgraph_nodes)} nós, {len(edges)} arestas")
    return subgraph_nodes, edges

def dfs_traversal(G, start_nodes, max_depth=6, timeout=TRAVERSAL_TIMEOUT):
    log_info(f"DFS traversal a partir de {len(start_nodes)} nós (max_depth={max_depth})")
    start = time.time()
    visited = set()
    stack = [(n, 0) for n in reversed(start_nodes)]
    edges = []
    while stack:
        if time.time() - start > timeout:
            log_warn("Timeout DFS")
            break
        node, depth = stack.pop()
        if node in visited or depth > max_depth:
            continue
        visited.add(node)
        for neighbor in G.neighbors(node):
            if neighbor not in visited:
                stack.append((neighbor, depth + 1))
                edges.append((node, neighbor))
    elapsed = time.time() - start
    log_info(f"DFS concluído em {elapsed:.2f}s: {len(visited)} nós, {len(edges)} arestas")
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
