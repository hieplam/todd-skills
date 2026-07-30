#!/usr/bin/env bash
# list-session-ids.sh <path-to-campaign-state.json>
# Prints each card's SDK session id (sequence order) and copies them to the
# clipboard, ready to paste into Kanna's Import dialog (multi-id paste).
set -euo pipefail

state="${1:?usage: list-session-ids.sh <campaign-state.json>}"
[[ -f "$state" ]] || { echo "state file not found: $state" >&2; exit 1; }

ids="$(jq -r '.sequence[] as $id | .cards[$id].sessionId | select(. != null)' "$state")"
if [[ -z "$ids" ]]; then
  echo "no session ids recorded yet (no card has run)" >&2
  exit 2
fi

echo "$ids"
if command -v pbcopy >/dev/null 2>&1; then
  printf '%s\n' "$ids" | pbcopy
  echo "(copied $(wc -l <<<"$ids" | tr -d ' ') ids to clipboard)" >&2
elif command -v xclip >/dev/null 2>&1; then
  printf '%s\n' "$ids" | xclip -selection clipboard
  echo "(copied to clipboard via xclip)" >&2
fi
