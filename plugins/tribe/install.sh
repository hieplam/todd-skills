#!/usr/bin/env bash
# install.sh — tribe plugin post-install hook.
#
# Appends each guidance snippet in claude-md/ to the global CLAUDE.md if not
# already present. Idempotent: a snippet's first line (its section heading) is
# the presence marker — if that exact line exists in CLAUDE.md, the snippet is
# skipped.
#
# The first line alone is not a sufficient guard. When a snippet grows a NEW
# top-level heading above an existing section, the marker misses against a
# CLAUDE.md that already carries that section under the old shape — the snippet
# appends and the target ends up with the section twice. Two copies of one rule
# drift apart and then contradict each other, which is worse than either copy
# alone. So ANY heading the snippet shares with the target also blocks the
# append: the hook reports the overlap and leaves reconciliation to the owner,
# whose copy may hold local edits this script must never silently bury.
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
    continue
  fi

  # Marker missed — but check every other heading before appending (see header note).
  overlap=""
  while IFS= read -r heading; do
    [ -n "$heading" ] || continue
    if grep -qxF "$heading" "$TARGET"; then overlap="$heading"; break; fi
  done < <(grep -E '^#{1,6} ' "$snippet" || true)

  if [ -n "$overlap" ]; then
    printf '  skip    CLAUDE.md %s (section already present, under a different top heading)\n' "$(basename "$snippet")"
    printf 'WARN: %s: not appended — "%s" already exists in %s.\n' "$(basename "$snippet")" "$overlap" "$TARGET" >&2
    printf 'WARN: appending would duplicate it. Reconcile by hand, then re-run to pick up the rest.\n' >&2
    continue
  fi

  { printf '\n'; cat "$snippet"; } >> "$TARGET"
  printf '  added   CLAUDE.md %s -> %s\n' "$(basename "$snippet")" "$TARGET"
done
