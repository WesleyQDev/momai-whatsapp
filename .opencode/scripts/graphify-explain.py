#!/usr/bin/env python3
"""
graphify-explain.py - Explain a single concept/node from the graph.
Usage: python .opencode/scripts/graphify-explain.py <concept>
"""
import json
import os
import sys
import time
from pathlib import Path
from networkx.readwrite import json_graph
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeout

SCRIPT_DIR = Path(__file__).parent.parent
PROJECT_ROOT = SCRIPT_DIR.parent
GRAPH_PATH = PROJECT_ROOT / "graphify-out" / "graph.json"
TIMEOUT_SECONDS = 60  # Increased from 30
NODE_TIMEOUT = 15
EXPLAIN_TIMEOUT = 45
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
        fallback_source_file(sys.argv[1] if len(sys.argv) > 1 else None)
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
        fallback_source_file(sys.argv[1] if len(sys.argv) > 1 else None)
        sys.exit(1)
    except Exception as e:
        log_error(f"Erro ao carregar grafo: {e}")
        fallback_source_file(sys.argv[1] if len(sys.argv) > 1 else None)
        sys.exit(1)

def _load_graph_inner():
    data = json.loads(GRAPH_PATH.read_text())
    return json_graph.node_link_graph(data, edges="links")

def fallback_source_file(concept):
    log_fallback(f"Tentando encontrar arquivo fonte para '{concept}'...")
    print(f"\n=== FALLBACK: Busca por arquivo fonte para '{concept}' ===")
    print("O grafo não está disponível. Execute 'graphify .' para gerar.")

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

def explain_node_with_timeout(G, nid, timeout=EXPLAIN_TIMEOUT):
    log_info(f"Explicando nó: {nid}")
    start = time.time()
    with ThreadPoolExecutor() as executor:
        future = executor.submit(lambda: G.nodes[nid])
        try:
            d = future.result(timeout=timeout)
            elapsed = time.time() - start
            log_info(f"Explicação concluída em {elapsed:.2f}s")
            return d
        except FuturesTimeout:
            log_error(f"Timeout ({timeout}s) explicando nó!")
            raise TimeoutError("Timeout explicando nó")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python graphify-explain.py <concept>", file=sys.stderr)
        sys.exit(1)
    
    concept = sys.argv[1]
    
    try:
        G = load_graph()
        nid = find_node(G, concept)
        
        if not nid:
            log_error(f"Nó não encontrado para: {concept!r}")
            fallback_source_file(concept)
            sys.exit(0)
        
        d = explain_node_with_timeout(G, nid)
        
        print(f"=== {d.get('label', nid)} ===")
        print(f"Source: {d.get('source_file', 'unknown')}")
        print(f"Type: {d.get('file_type', 'unknown')}")
        print(f"Degree: {G.degree(nid)}")
        print()
        print("CONNECTIONS:")
        
        start = time.time()
        count = 0
        for neighbor in G.neighbors(nid):
            if time.time() - start > TIMEOUT_SECONDS:
                log_warn("Timeout listando conexões")
                break
            edge = G.edges[nid, neighbor]
            nlabel = G.nodes[neighbor].get("label", neighbor)
            rel = edge.get("relation", "")
            conf = edge.get("confidence", "")
            src = G.nodes[neighbor].get("source_file", "")
            print(f"  --{rel}--> {nlabel} [{conf}] ({src})")
            count += 1
        log_info(f"Listadas {count} conexões")
        
    except TimeoutError:
        log_error("Timeout na explicação")
        fallback_source_file(concept)
    except Exception as e:
        log_error(f"Erro inesperado: {e}")
        fallback_source_file(concept)
