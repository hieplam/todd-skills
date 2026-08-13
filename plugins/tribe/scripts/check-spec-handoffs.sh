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

grep_out="$(mktemp)"; grep_err="$(mktemp)"
trap 'rm -f "$grep_out" "$grep_err"' EXIT
set +e
grep -rinE --include='*.md' "$PATTERN" "${DIRS[@]}" >"$grep_out" 2>"$grep_err"
grep_status=$?
set -e

# grep exit codes: 0 = matches found, 1 = no matches (expected, not an error).
# Anything else (e.g. 2 = permission denied / read error on a scanned file) means the
# scan was incomplete and must not be silently reported as a clean zero/undercount.
if [ "$grep_status" -gt 1 ]; then
  cat "$grep_err" >&2
  echo "check-spec-handoffs: grep failed (exit $grep_status) — scan incomplete, aborting" >&2
  exit "$grep_status"
fi
cat "$grep_err" >&2

hits="$(sed -E 's/^([^:]+:[0-9]+):/\1: /' "$grep_out")"

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
