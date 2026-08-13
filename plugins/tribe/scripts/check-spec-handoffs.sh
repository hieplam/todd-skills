#!/usr/bin/env bash
# check-spec-handoffs.sh — inherited-obligations cross-check for batch-authored spec waves
# (docs/tribe/fixlists/2026-08-08-outstanding-17/P8-inherited-obligations-check.md).
#
# Usage: check-spec-handoffs.sh [--strict] <specs-dir> [<more-dirs>...]
#
# Greps every *.md under the given dirs, case-insensitive, for handoff phrases ("deferred
# to B14's own future spec" and similar) and prints one `<file>:<line>: <matched text>`
# line per hit, followed by a summary count.
#
# The script FINDS CANDIDATES; it does not judge. Judgment — is this hit a real obligation,
# was it acknowledged by the receiving spec — is the Shaman's, recorded in a `handoffs.md`
# ledger committed next to the wave's specs (see the ledger convention in the spec above).
#
# Exit 0 always when only listing. With --strict: exit 1 if there is at least one hit and
# no `handoffs.md` ledger file exists next to the first dir given (the wave's own spec dir).
set -euo pipefail

PATTERN='deferred to|deferred until|handed to|hands off to|future spec|own spec will|out of scope for this card.*(spec|card)|will be addressed (in|by)'

STRICT=0
DIRS=()
for arg in "$@"; do
  case "$arg" in
    --strict) STRICT=1 ;;
    *)        DIRS+=("$arg") ;;
  esac
done

if [ "${#DIRS[@]}" -eq 0 ]; then
  echo "usage: check-spec-handoffs.sh [--strict] <specs-dir> [<more-dirs>...]" >&2
  exit 2
fi
for d in "${DIRS[@]}"; do
  [ -d "$d" ] || { echo "check-spec-handoffs: not a directory: $d" >&2; exit 2; }
done

hits="$(grep -rinE --include='*.md' "$PATTERN" "${DIRS[@]}" | sed -E 's/^([^:]+:[0-9]+):/\1: /' || true)"

count=0
if [ -n "$hits" ]; then
  printf '%s\n' "$hits"
  count="$(printf '%s\n' "$hits" | wc -l | tr -d ' ')"
fi
printf 'check-spec-handoffs: %d hit(s) across %d dir(s)\n' "$count" "${#DIRS[@]}"

if [ "$STRICT" -eq 1 ] && [ "$count" -gt 0 ]; then
  ledger="${DIRS[0]%/}/handoffs.md"
  [ -f "$ledger" ] || {
    echo "check-spec-handoffs: --strict: $count hit(s) found and no ledger at $ledger" >&2
    exit 1
  }
fi

exit 0
