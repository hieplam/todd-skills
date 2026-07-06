#!/usr/bin/env bash
# install.sh — tribe plugin post-install hook.
#
# Appends each guidance snippet in claude-md/ to the global CLAUDE.md if not
# already present. Idempotent: a snippet's first line (its section heading) is
# the presence marker — if that exact line exists in CLAUDE.md, the snippet is
# skipped.
#
# CLAUDE_DIR overrides the target root (default: ~/.claude) — used by tests.

set -euo pipefail

PLUGIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
CLAUDE_DIR="${CLAUDE_DIR:-$HOME/.claude}"
TARGET="$CLAUDE_DIR/CLAUDE.md"

[ -d "$PLUGIN_DIR/claude-md" ] || exit 0

mkdir -p "$CLAUDE_DIR"
touch "$TARGET"

for snippet in "$PLUGIN_DIR/claude-md"/*.md; do
  [ -e "$snippet" ] || continue
  marker="$(head -n 1 "$snippet")"
  if [ -z "$marker" ]; then
    printf 'WARN: %s: first line empty — cannot use as marker, skipped\n' "$(basename "$snippet")" >&2
    continue
  fi
  if grep -qxF "$marker" "$TARGET"; then
    printf '  ok      CLAUDE.md %s (already present)\n' "$(basename "$snippet")"
  else
    { printf '\n'; cat "$snippet"; } >> "$TARGET"
    printf '  added   CLAUDE.md %s -> %s\n' "$(basename "$snippet")" "$TARGET"
  fi
done
