#!/usr/bin/env bash
# test-disagreement-routing.sh — conformance test for idea-04 (disagreement routing).
# Asserts that warchief.md step 6 carries the confidence classes, the routing table,
# the conflict ladder, and the ledger columns. Offline, no network.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WARCHIEF="$HERE/../../agents/warchief.md"
PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); printf 'ok - %s\n' "$1"; }
bad() { FAIL=$((FAIL+1)); printf 'not ok - %s\n' "$1"; }

[[ -f "$WARCHIEF" ]] || { printf 'not ok - warchief.md not found at %s\n' "$WARCHIEF"; exit 1; }

# Step 6 spans from its own heading to the next same-level heading (step 7).
STEP6="$(awk '/^### 6\./,/^### 7\./' "$WARCHIEF")"
[[ -n "$STEP6" ]] || { printf 'not ok - could not extract step 6 from warchief.md\n'; exit 1; }

has() {   # has NAME REGEX — step 6 MUST match
  if grep -Eqi -- "$2" <<<"$STEP6"; then ok "$1"; else bad "$1 (missing: $2)"; fi
}
hasnt() { # hasnt NAME REGEX — step 6 must NOT match
  if grep -Eqi -- "$2" <<<"$STEP6"; then bad "$1 (found forbidden: $2)"; else ok "$1"; fi
}

# --- Task 1: the three confidence classes -----------------------------------
has 'class token: agreed'       '`?agreed`?'
has 'class token: single'       '`?single`?'
has 'class token: conflicting'  '`?conflicting`?'
has 'classes are computed at merge, before the fixer is dispatched' \
    'before any fixer is dispatched|at merge time'
has 'Rule A: silence is not dissent' \
    'silence is not dissent'
has 'Rule A: one-flags-one-silent is single, never conflicting' \
    'never.{0,20}`?conflicting`?'
has 'Rule B: co-location alone is not a conflict' \
    'co-location is not conflict|mutually unsatisfiable'
has 'Rule B: the one yes/no compatibility test' \
    'can one edit satisfy both remedies'

printf '\n# passed: %d, failed: %d\n' "$PASS" "$FAIL"
[[ "$FAIL" -eq 0 ]]
