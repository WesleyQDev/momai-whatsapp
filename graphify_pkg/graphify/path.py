#!/usr/bin/env python3
"""Módulo graphify.path - wrapper para graphify-path.py"""
import sys
import subprocess
from pathlib import Path

def main(args=None):
    if args is None:
        args = sys.argv[1:]
    script = Path(__file__).parent.parent.parent / ".opencode" / "scripts" / "graphify-path.py"
    cmd = [sys.executable, str(script)] + list(args)
    result = subprocess.run(cmd, cwd=Path(__file__).parent.parent.parent)
    return result.returncode

if __name__ == "__main__":
    raise SystemExit(main())
