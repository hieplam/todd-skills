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

# Agent prompts are hard-wrapped prose, so a sentence routinely straddles a newline. grep is
# line-based and would miss it. Flatten every haystack to one whitespace-normalized line first:
# assertions then match meaning, not line-breaking accidents (W5 bar #1; see
# test-dual-skinner-cell.sh for the established convention this follows). Also strip literal
# `**` bold markers: which words a legal reword chooses to bold is decoration, not invariant
# (F7 — a re-bolding that keeps only the label, e.g. `**Rule A** — silence is not dissent.`,
# must not redden an assertion that never asked to own the bold span in the first place).
flat() { tr '\n' ' ' | tr -s ' ' | sed -E 's/\*\*//g'; }

# Step 6 spans from its own heading up to (but not including) the step 7 heading.
STEP6="$(awk '/^### 6\./{f=1} /^### 7\./{f=0} f' "$WARCHIEF" | flat)"
[[ -n "$STEP6" ]] || { printf 'not ok - could not extract step 6 from warchief.md\n'; exit 1; }

has() {   # has NAME HAYSTACK REGEX — the (flattened) text must contain the regex
  if grep -Eqi -- "$3" <<<"$2"; then ok "$1"; else bad "$1 (missing: $3)"; fi
}
hasnt() { # hasnt NAME HAYSTACK REGEX — the (flattened) text must NOT contain the regex
  if grep -Eqi -- "$3" <<<"$2"; then bad "$1 (found forbidden: $3)"; else ok "$1"; fi
}

# --- Task 1: the three confidence classes -----------------------------------
# Each regex binds the class-table row's own token to the pipe cell that immediately
# follows it, then to a phrase unique to that row's own definition ([^|]* never crosses
# into the next table cell). This is per-clause anchoring (W5 bar #2 / D14): deleting only
# the phrase this assertion names turns only this assertion red — a bare token that recurs
# elsewhere in step 6 (agreed/single/conflicting all do) can never hold it green.
has 'class token: agreed'       "$STEP6" '`agreed`[[:space:]]*\|[^|]*same claim direction'
has 'class token: single'       "$STEP6" '`single`[[:space:]]*\|[^|]*said nothing about it'
has 'class token: conflicting'  "$STEP6" '`conflicting`[[:space:]]*\|[^|]*mutually unsatisfiable'

# Compound claim: computed AT MERGE TIME, and BEFORE the fixer is dispatched — both
# conjuncts of the sentence, in the order they appear, not an alternation that is
# satisfied by either half alone (W5 bar #3).
has 'classes are computed at merge, before the fixer is dispatched' "$STEP6" \
    'at merge time.{0,40}before any fixer is dispatched'

# Word-order anchor, not a bold-span anchor: a legal, meaning-preserving re-bolding of the
# clause (e.g. bolding only the "Rule A" label instead of the whole sentence) must not redden
# this assertion (W5 bar #1/F7). This stays unique to the guarded clause because the W2 mapping
# paragraph's restatement puts "(Rule A)" AFTER the phrase ("...silence is not dissent (Rule A)"),
# which cannot satisfy a "Rule A ... silence is not dissent" word-order match (D14 survives).
has 'Rule A: silence is not dissent' "$STEP6" \
    'Rule A .{1,3} silence is not dissent'

# Compound claim: one-flags-one-silent is classed `single` — AND — the same sentence
# says it is never `conflicting`. Both conjuncts, anchored to the sentence that makes
# them (W5 bar #3); a rewrite that keeps only the "never conflicting" half is not this
# assertion's clause and must not hold it green.
has 'Rule A: one-flags-one-silent is single, never conflicting' "$STEP6" \
    'one-flags-one-silent is therefore `single`.{0,20}never.{0,15}`?conflicting`?'

# Same word-order anchor as Rule A above (F7): stays unique to the guarded clause because the
# W2 mapping paragraph never restates "Rule B" before "co-location"/"conflict" in this order.
has 'Rule B: co-location alone is not a conflict' "$STEP6" \
    'Rule B .{1,3} co-location is not conflict'

has 'Rule B: the one yes/no compatibility test' "$STEP6" \
    'can one edit satisfy both remedies'

# --- Task 2: the routing table ----------------------------------------------
# Each regex anchors to its own class token immediately followed by the table's cell
# separator, then to a phrase inside THAT cell only ([^|]* never crosses into the next
# cell or the next row) — same per-clause technique as task 1 (W5 bar #2). This is what
# stops "agreed"/"single"/"conflicting" bare-token collisions with task 1's class-definition
# table and with idea 03's Law-3-tag mapping paragraph, both of which also use these tokens.

# Simple claim, anchored to the agreed row's own clause; deleting only this clause reddens
# only this assertion (the "straight into the fixer's brief" clause is a separate substring
# in the same cell, guarded by the next assertion).
has 'agreed raises severity to Critical' "$STEP6" \
    '`agreed`[[:space:]]*\|[^|]*raised to Critical by default'

# The apostrophe in "fixer's" is matched with a wildcard (`.`) rather than a literal quote,
# since bash single-quoted regex strings cannot contain a literal apostrophe.
has 'agreed goes straight into the fixer brief' "$STEP6" \
    '`agreed`[[:space:]]*\|[^|]*straight into the fixer.s brief'

# Compound claim: single is ROUTED to the fixer's brief AND the fixer (not the Warchief)
# ADJUDICATES it. Both conjuncts checked, in the order they appear in the single row, so
# deleting either clause alone reddens this assertion (W5 bar #3). This also disambiguates
# from the Warchief's own "you adjudicate any finding that conflicts with what the plan
# mandated" text elsewhere in step 6, which is a different subject doing the adjudicating.
has 'single is routed to the fixer, which adjudicates' "$STEP6" \
    '`single`[[:space:]]*\|[^|]*fixer.s brief[^|]*fixer adjudicates it'

has 'single findings are not pre-filtered by the Warchief' "$STEP6" \
    '`single`[[:space:]]*\|[^|]*do not pre-filter'

# Two independent clauses in the same conflicting-row sentence, each guarded separately so
# deleting either alone reddens only its own assertion.
has 'conflicting is never routed to the fixer as-is' "$STEP6" \
    '`conflicting`[[:space:]]*\|[^|]*never routed to the fixer as-is'
has 'conflicting is never self-reconciled' "$STEP6" \
    '`conflicting`[[:space:]]*\|[^|]*never self-reconciled by you'

# Compound claim: the reproduce-first mandate applies to EVERY finding AND explicitly names
# `agreed` as included, in that order — a rewrite that keeps only the general rule but drops
# the explicit agreed callout (or vice versa) must redden this assertion.
has 'reproduce-first still applies to an agreed finding' "$STEP6" \
    'Reproduce-first applies to every finding.{0,20}including an `agreed` one'

# Compound claim: NOT_REPRODUCED tied to an agreed finding, AND that this escalates to the
# Warchief immediately (not at the next audit round). Anchored on word order, unique to this
# sentence — no other "immediately" in step 6 is preceded by this NOT_REPRODUCED/agreed pairing.
has 'NOT_REPRODUCED on an agreed finding escalates immediately' "$STEP6" \
    '`NOT_REPRODUCED`.{0,10}for an `agreed` finding.{0,200}escalates to you immediately'

printf '\n# passed: %d, failed: %d\n' "$PASS" "$FAIL"
[[ "$FAIL" -eq 0 ]]
