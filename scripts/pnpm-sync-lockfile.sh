#!/usr/bin/env bash
set -euo pipefail

# Called from git hooks (post-merge, post-rewrite) to detect stale lockfile.
# Does NOT auto-commit — only warns the developer.

CHANGED=$(git diff-tree -r --name-only HEAD ORIG_HEAD 2>/dev/null || true)

if echo "$CHANGED" | grep -qE '(package\.json$|pnpm-lock\.yaml$)'; then
  PROJECT_ROOT=$(git rev-parse --show-toplevel)
  cd "$PROJECT_ROOT"

  if ! pnpm install --frozen-lockfile 2>/dev/null; then
    echo ""
    echo "  pnpm-lock.yaml esta desatualizado em relacao ao package.json."
    echo "  Execute o comando abaixo para sincronizar:"
    echo ""
    echo "    pnpm install && git add pnpm-lock.yaml && git commit -m \"chore(deps): sync lockfile\""
    echo ""
  fi
fi
