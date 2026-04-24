#!/usr/bin/env python3
"""
graphify-path.py - Find shortest path between two concepts in the graph.
Usage: python .opencode/scripts/graphify-path.py <from_concept> <to_concept>
"""
import json
import os
import sys
import time
from pathlib import Path
from networkx.readwrite import json_graph
import networkx as nx
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeout

SCRIPT_DIR = Path(__file__).parent.parent
PROJECT_ROOT = SCRIPT_DIR.parent
GRAPH_PATH = PROJECT_ROOT / "graphify-out" / "graph.json"
TIMEOUT_SECONDS = 60  # Increased from 30
NODE_TIMEOUT = 15
PATH_TIMEOUT = 45
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
        log_error("graph.json não encontrado.")
        fallback_grep()
        sys.exit(1)
    
    log_info(f"Carregando grafo de {GRAPH_PATH}...")
    start = time.time()
    try:
        with ThreadPoolExecutor() as executor:
            future = executor.submit(_load_graph_inner)
            G = future.result(timeout=TIMEOUT_SECONDS)
        elapsed = time.time() - start
        log_info(f"Grafo carregado em {elapsed:.2f}s - {G.number_of_nodes()} nós")
        return G
    except FuturesTimeout:
        log_error(f"Timeout ({TIMEOUT_SECONDS}s) ao carregar grafo!")
        fallback_grep()
        sys.exit(1)
    except Exception as e:
        log_error(f"Erro ao carregar grafo: {e}")
        fallback_grep()
        sys.exit(1)

def _load_graph_inner():
    data = json.loads(GRAPH_PATH.read_text())
    return json_graph.node_link_graph(data, edges="links")

def fallback_grep():
    log_fallback("Usando grep como fallback para busca simples...")
    print("\n=== FALLBACK: Busca por grep ===")
    print("O grafo não está disponível. Instale o graphify e execute 'graphify .'")

def fallback_grep_search(term1, term2):
    log_fallback(f"Busca grep para '{term1}' e '{term2}'...")
    print(f"\n=== FALLBACK: Busca textual ===")
    print(f"Termos: '{term1}', '{term2}'")
    print("Dica: Execute 'graphify .' para usar o grafo completo.")

def find_node(G, term, timeout=NODE_TIMEOUT):
    log_info(f"Procurando nó: '{term}'")
    start = time.time()
    term_lower = term.lower()
    scored = []
    for n in G.nodes():
        if time.time() - start > timeout:
            log_warn(f"Timeout procurando nó '{term}'")
            break
        score = sum(1 for w in term_lower.split() if w in G.nodes[n].get("label","").lower())
        if score > 0:
            scored.append((score, n))
    scored.sort(reverse=True)
    result = scored[0][1] if scored and scored[0][0] > 0 else None
    log_info(f"Nó encontrado: {result is not None}")
    return result

def find_path_with_timeout(G, src, tgt, timeout=PATH_TIMEOUT):
    log_info(f"Calculando caminho mais curto: {src} -> {tgt}")
    start = time.time()
    with ThreadPoolExecutor() as executor:
        future = executor.submit(nx.shortest_path, G, src, tgt)
        try:
            path = future.result(timeout=timeout)
            elapsed = time.time() - start
            log_info(f"Caminho encontrado em {elapsed:.2f}s: {len(path)-1} hops")
            return path
        except FuturesTimeout:
            log_error(f"Timeout ({timeout}s) calculando caminho!")
            raise nx.NetworkXNoPath(f"Timeout calculando caminho entre {src} e {tgt}")

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python graphify-path.py <from> <to>", file=sys.stderr)
        sys.exit(1)
    
    G = load_graph()
    src = find_node(G, sys.argv[1])
    tgt = find_node(G, sys.argv[2])
    
    if not src or not tgt:
        log_error(f"Nós não encontrados: {sys.argv[1]!r} ou {sys.argv[2]!r}")
        fallback_grep_search(sys.argv[1], sys.argv[2])
        sys.exit(0)
    
    try:
        path = find_path_with_timeout(G, src, tgt)
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
        log_warn(f"Sem caminho entre {sys.argv[1]!r} e {sys.argv[2]!r}")
        fallback_grep_search(sys.argv[1], sys.argv[2])
    except nx.NodeNotFound as e:
        log_error(f"Nó não encontrado: {e}")
        fallback_grep_search(sys.argv[1], sys.argv[2])
