#!/usr/bin/env python3
"""CLI entrypoint for the local graphify wrapper package."""
from __future__ import annotations

import argparse
from typing import Sequence

from . import explain, path, query, update


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="graphify",
        description="Local graphify wrapper used by OpenCode tools.",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    query_parser = sub.add_parser("query", help="Query graph context.")
    query_parser.add_argument("args", nargs=argparse.REMAINDER)

    path_parser = sub.add_parser("path", help="Find shortest path between concepts.")
    path_parser.add_argument("args", nargs=argparse.REMAINDER)

    explain_parser = sub.add_parser("explain", help="Explain a single concept.")
    explain_parser.add_argument("args", nargs=argparse.REMAINDER)

    update_parser = sub.add_parser("update", help="Refresh graph metadata.")
    update_parser.add_argument("args", nargs=argparse.REMAINDER)
    return parser


def _dispatch(command: str, passthrough: Sequence[str]) -> int:
    if command == "query":
        return query.main(list(passthrough))
    if command == "path":
        return path.main(list(passthrough))
    if command == "explain":
        return explain.main(list(passthrough))
    if command == "update":
        return update.main(list(passthrough))
    return 1


def main(argv: Sequence[str] | None = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)
    passthrough = getattr(args, "args", [])
    return _dispatch(args.command, passthrough)


if __name__ == "__main__":
    raise SystemExit(main())
