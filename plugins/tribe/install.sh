#!/usr/bin/env bash
# install.sh — tribe plugin post-install hook.
#
# Two jobs:
#   1. Appends each guidance snippet in claude-md/ to the global CLAUDE.md if not
#      already present. Idempotent: a snippet's first line (its section heading) is
#      the presence marker — if that exact line exists in CLAUDE.md, the snippet is
#      skipped.
#   2. Symlinks scripts/ (the deterministic validator scripts, e.g. heartbeat-check.sh,
#      validate-plan.sh) to $CLAUDE_DIR/scripts/tribe. scripts/ is a bare directory, not
#      a skill — it has no SKILL.md, so it must not live under skills/ where the root
#      install.sh's generic "any dir under skills/ gets symlinked" logic would pick it
#      up implicitly. This hook is the explicit, documented way a plugin ships files
#      that aren't agents/ or skills/.
#
# CLAUDE_DIR overrides the target root (default: ~/.claude) — used by tests.

set -euo pipefail

PLUGIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
CLAUDE_DIR="${CLAUDE_DIR:-$HOME/.claude}"
TARGET="$CLAUDE_DIR/CLAUDE.md"

if [ -d "$PLUGIN_DIR/claude-md" ]; then
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
fi

if [ -d "$PLUGIN_DIR/scripts" ]; then
  SCRIPTS_LINK="$CLAUDE_DIR/scripts/tribe"
  mkdir -p "$CLAUDE_DIR/scripts"
  if [ -L "$SCRIPTS_LINK" ] && [ "$(readlink "$SCRIPTS_LINK")" = "$PLUGIN_DIR/scripts" ]; then
    printf '  ok      scripts tribe (already linked)\n'
  else
    if [ -e "$SCRIPTS_LINK" ] || [ -L "$SCRIPTS_LINK" ]; then
      bak="$SCRIPTS_LINK.bak.$(date +%s)"
      mv "$SCRIPTS_LINK" "$bak"
      printf 'WARN: scripts tribe: existing target backed up to %s\n' "$bak" >&2
    fi
    ln -s "$PLUGIN_DIR/scripts" "$SCRIPTS_LINK"
    printf '  linked  scripts tribe -> %s\n' "$SCRIPTS_LINK"
  fi
fi
