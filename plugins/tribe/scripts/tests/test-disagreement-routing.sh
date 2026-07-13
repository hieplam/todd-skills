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

# F14 — these two were a single bridging regex apiece and reddened under a legal,
# meaning-preserving reword that simply added a few words inside the bridge (a W5 bar-1
# violation, proven by mutation). Re-cut per W5's own guidance: several short assertions, each
# anchored on a phrase unique to its clause, beat one assertion spanning editorial prose with a
# long `.{0,N}` bridge. The ORIGINAL assertion NAME is kept for the half that most directly
# carries it; a differently-named companion assertion covers the other conjunct, so the
# invariant's full coverage survives the split (both conjuncts still checked, just not by a
# single regex that has to bridge between them).

# "applies to every finding" is a literal, zero-gap anchor: nothing needs to be bridged past it,
# so no insertion anywhere else in the sentence can ever touch this assertion.
has 'reproduce-first still applies to an agreed finding' "$STEP6" \
    'Reproduce-first applies to every finding'

# "including an `agreed` one" is likewise a literal, zero-gap anchor for the other conjunct —
# that `agreed` is explicitly named as included, not an accidental omission.
has 'reproduce-first explicitly names agreed as included, not exempt' "$STEP6" \
    'including an `agreed` one'

# The NOT_REPRODUCED/agreed trigger needs a short bridge (the two tokens are not literally
# adjacent), but the bridge is now bounded generously (5x the actual ~9-char gap) instead of the
# old `.{0,10}` that a mere "is reported" insertion could already overflow. Word order
# (`NOT_REPRODUCED` before `agreed`) keeps this unique: the only other co-occurrence in step 6
# reverses the order ("For an `agreed` finding ... `NOT_REPRODUCED` case"), which cannot satisfy
# this pattern.
has 'NOT_REPRODUCED on an agreed finding escalates immediately' "$STEP6" \
    '`NOT_REPRODUCED`.{0,50}for an `agreed` finding'

# "escalates to you immediately for adjudication" is its own literal, zero-gap anchor — it no
# longer needs to bridge all the way back to the NOT_REPRODUCED/agreed trigger (that was the
# `.{0,200}` span that a longer, still meaning-preserving restatement of the reasoning in between
# could overflow). This phrase is unique to this sentence.
has 'a NOT_REPRODUCED, agreed finding escalates to the Warchief immediately, not next round' "$STEP6" \
    'escalates to you immediately for adjudication'

# F9/F11 — Law 3's dispositions vs the single row's "do not pre-filter" must be reconciled
# explicitly, AND the reconciliation must be scoped to the `[cold-only]` half only — a
# `[contract-only]` finding is carried by the contract lens's own verdict (Law 4) and is never a
# hypothesis for the Warchief to pre-filter (W8/F11). Each assertion below is short and anchored on
# a phrase unique to its own conjunct, with no long bridging span (W5 bar #1, F12b): a legal,
# meaning-preserving rewording of the prose between two phrases must not push a bridge span past
# its budget and redden an assertion that never asked to guard that prose. Every phrase named is
# coined by this clause and appears nowhere else in step 6 (confirmed against the pre-fix file), so
# deleting only this clause reddens only these five assertions.

has 'pre-filter is scoped to cold-only, never to contract-only' "$STEP6" \
    'ONLY permitted pre-filter on a `single` finding.s `\[cold-only\]` half.{0,40}never on its `\[contract-only\]` half'

has 'cold-only finding is a hypothesis and gets an evidence-bearing disposition' "$STEP6" \
    '`\[cold-only\]` finding is a hypothesis.{0,40}exactly one of Law 3.s three evidence-bearing dispositions'

has 'contract-only finding is not a hypothesis; carried by the contract lens own verdict' "$STEP6" \
    '`\[contract-only\]` finding is not a hypothesis.{0,40}carried by the contract lens.s own verdict'

has 'contract-only finding is never pre-filtered by the Warchief and goes to the fixer' "$STEP6" \
    'never pre-filtered by the Warchief.{0,40}goes straight to the fixer'

has 'do not pre-filter forbids the evidence-free drop, scoped to cold-only' "$STEP6" \
    'do not pre-filter.{0,40}forbids.{0,40}`\[cold-only\]` half.{0,40}evidence-free drop'

# F8 — the agreed/single NOT_REPRODUCED supersession must be said out loud, not just implied.
# F14 recut: the original single assertion bridged FOUR anchors with a `.{0,250}` span ending in
# a fully literal, zero-gap tail ("...rule below governs unchanged") that a one-word insertion
# ("still") broke outright. Split into two, each anchored on "ledger-adjudication rule below" — a
# phrase this disambiguation clause coins and that appears nowhere else in step 6, so deleting
# only this new clause removes every occurrence and reddens both assertions (W5 bar #2/D14); the
# pre-existing "Adjudicate the ledger after each re-audit" heading and the reproduce-first
# paragraph above never use this exact wording, so neither can hold these green in its absence.

# First conjunct: the `agreed` clause explicitly does NOT wait on the ledger rule below. No
# bridge to `single` is needed for this half — "does not wait on the ledger-adjudication rule
# below" is itself unique in step 6.
has 'agreed does not wait on the ledger rule below; single is governed by it unchanged' "$STEP6" \
    'does not wait on the ledger-adjudication rule below'

# Second conjunct: the `single` clause explicitly says that same ledger rule governs it
# unchanged. A short bounded bridge (15 chars, vs. the old zero-gap literal) survives an
# insertion like "still" between "below" and "governs" without needing a huge span.
has 'single finding: the ledger-adjudication rule below governs it unchanged' "$STEP6" \
    'ledger-adjudication rule below.{0,15}governs unchanged'

# --- Item 1 (F13/D16): what the agreed/NOT_REPRODUCED adjudication DOES -----------------------
# The plan's mandated text says a `NOT_REPRODUCED` on an `agreed` finding "escalates to you
# immediately for adjudication" but never said what that adjudication DOES — no output, no
# evidence bar, no effect on the fix-round cap (F13, cold-lens Critical). D16 ratifies option (a):
# the Warchief weighs the fixer's falsification artifact against both reviewers' reports and
# records exactly one of UPHELD / REJECTED / ESCALATED, and the act consumes no fix round. Each
# outcome is its own short assertion, anchored on its own unique all-caps token plus its
# consequence phrase, with no bridge that has to span across to a sibling outcome.

has 'agreed adjudication UPHELD drops the finding as falsified, no fixer round spent' "$STEP6" \
    'UPHELD.{0,40}artifact defeats the finding.{0,60}DROPPED \(falsified\).{0,50}no fixer round is spent'

has 'agreed adjudication REJECTED sends it back to the fixer with the condition named' "$STEP6" \
    'REJECTED.{0,50}does not cover the condition.{0,150}back to the fixer with that condition named'

has 'agreed adjudication ESCALATED goes to the Shaman as NEEDS_DIRECTION' "$STEP6" \
    'ESCALATED.{0,50}does not let you tell.{0,40}NEEDS_DIRECTION.{0,15}to the Shaman'

has 'agreed adjudication is a review act: it consumes no fix round' "$STEP6" \
    'is a REVIEW act.{0,100}consumes NO fix round'

# --- Item 2 (D16 cross-card pointer): the ledger rule names its own boundary --------------------
# Idea-05's shipped ledger-adjudication rule opened with no signal that an `agreed` finding's
# `NOT_REPRODUCED` does not wait for it (the carve-out lived only in a paragraph 30 lines earlier
# that the rule never acknowledged). D16 authorizes exactly one pointer clause, added to the
# rule's own text, changing no duties and none of its three outcomes.

has 'ledger-adjudication rule points to the agreed carve-out: it governs single, not agreed' "$STEP6" \
    'governs a `single` finding.s `NOT_REPRODUCED`.{0,60}`agreed` finding.s `NOT_REPRODUCED`.{0,40}adjudicated immediately.{0,40}per the routing table above'

printf '\n# passed: %d, failed: %d\n' "$PASS" "$FAIL"
[[ "$FAIL" -eq 0 ]]
