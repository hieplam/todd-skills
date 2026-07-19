#!/usr/bin/env bash
# tribe-home.sh — single source of truth for the tribe's per-repo local home.
#   ~/.tribe/<encoded-main-worktree-path>/  (Claude Code transcript model).
# Every linked worktree of one repo resolves to the SAME home.
# Usage: tribe-home.sh [repo-dir]   → prints "$HOME/.tribe/<key>"
#        source tribe-home.sh; tribe_home [repo-dir]
set -euo pipefail

tribe_home_key() {
  local repo="${1:-$PWD}" common main
  common="$(git -C "$repo" rev-parse --path-format=absolute --git-common-dir 2>/dev/null)" \
    || { echo "tribe-home: not a git repository: $repo" >&2; return 2; }
  main="$(cd "$(dirname "$common")" && pwd -P)"
  printf '%s' "$main" | sed 's#/#-#g'
}

tribe_home() {
  local key; key="$(tribe_home_key "${1:-$PWD}")" || return 2
  printf '%s/.tribe/%s' "$HOME" "$key"
}

# When executed (not sourced), print the home for the given/current repo.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  tribe_home "${1:-$PWD}"
fi
