#!/usr/bin/env python3
"""Módulo graphify.update - fallback update for local wrapper package."""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path


def main(args=None):
    if args is None:
        args = sys.argv[1:]

    repo_root = Path(__file__).parent.parent.parent
    target_input = args[0] if args else "."
    target_path = Path(target_input)
    if not target_path.is_absolute():
        target_path = (repo_root / target_path).resolve()

    graphify_out = repo_root / "graphify-out"
    manifest_path = graphify_out / "manifest.json"
    graph_path = graphify_out / "graph.json"

    if not target_path.exists():
        print(f"[ERROR] Target path not found: {target_path}", file=sys.stderr)
        return 1

    graphify_out.mkdir(parents=True, exist_ok=True)
    manifest = {}
    if manifest_path.exists():
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        except Exception:
            manifest = {}

    manifest["last_wrapper_update"] = {
        "at": datetime.now(timezone.utc).isoformat(),
        "target": str(target_path),
        "mode": "ast",
        "note": "Fallback local update. Full graph rebuild CLI not available in this environment.",
    }
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    if graph_path.exists():
        print(f"[OK] Wrapper update completed. Existing graph preserved at: {graph_path}")
    else:
        print(
            "[WARN] Wrapper metadata updated, but graphify-out/graph.json was not found. "
            "Generate the graph at least once before running queries.",
            file=sys.stderr,
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
