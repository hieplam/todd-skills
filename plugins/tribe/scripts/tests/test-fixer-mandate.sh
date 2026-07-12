#!/usr/bin/env bash
# test-fixer-mandate.sh — conformance tests for the fixer's reproduce-first mandate (idea 05).
# Prompt files have no runtime, so the proof is mechanical: assert that the invariants which make
# the mandate real still exist in the prompt text. A careless future edit deletes them silently;
# this suite is what makes that deletion loud.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TRIBE="$(cd "$HERE/../.." && pwd)"          # plugins/tribe
HUNTER="$TRIBE/agents/hunter.md"
WARCHIEF="$TRIBE/agents/warchief.md"
README="$TRIBE/README.md"
REVIEW_DOC="$TRIBE/claude-md/review-agents.md"
PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); printf 'ok - %s\n' "$1"; }
bad() { FAIL=$((FAIL+1)); printf 'not ok - %s\n' "$1"; }
has()   { if grep -qiF -- "$2" "$1"; then ok "$3"; else bad "$3"; fi; }   # has FILE STRING NAME
lacks() { if grep -qiE -- "$2" "$1"; then bad "$3"; else ok "$3"; fi; }   # lacks FILE REGEX NAME

# --- group A: hunter.md carries the fixer-mode charter -------------------------------
has "$HUNTER" "Fixer mode" "hunter: has a Fixer mode section"
has "$HUNTER" "hypothesis, not an order" "hunter: a finding is a hypothesis, not an order"
has "$HUNTER" "FIXED" "hunter: disposition FIXED"
has "$HUNTER" "NOT_REPRODUCED" "hunter: disposition NOT_REPRODUCED"
has "$HUNTER" "ESCALATED" "hunter: disposition ESCALATED"
has "$HUNTER" "falsification test" "hunter: defines the falsification test"
has "$HUNTER" "RED-rule carve-out" "hunter: carve-out to the immediate-pass RED rule"
has "$HUNTER" "that green IS the result" "hunter: a green falsification test is a result, not a bug"
has "$HUNTER" "No blind fixing" "hunter: blind fixing is an anti-goal"

# --- group B: warchief.md step 6 carries the fixer-brief template ---------------------
has "$WARCHIEF" "The fixer brief" "warchief: has a fixer-brief template"
has "$WARCHIEF" "stable ID" "warchief: assigns each finding a stable ID"
has "$WARCHIEF" "finding key" "warchief: records a finding key for cross-round identity"
has "$WARCHIEF" "Reproduce it before you fix it" "warchief: brief carries the mandate verbatim"
has "$WARCHIEF" "disposition ledger" "warchief: requires a disposition ledger back"
has "$WARCHIEF" "Never send the fixer's report to the Skinner" "warchief: seals the reviewer's context"

printf '\n%d passed, %d failed\n' "$PASS" "$FAIL"
exit $((FAIL > 0))
