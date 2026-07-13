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
# assertions then match meaning, not line-breaking accidents (D17, mutation class (i); see
# test-dual-skinner-cell.sh for the established convention this follows). Also strip literal
# `**` bold markers: which words a legal reword chooses to bold is decoration, not invariant
# (D17, mutation class (ii) — a re-bolding that keeps only the label, e.g. `**Rule A** —
# silence is not dissent.`, must not redden an assertion that never asked to own the bold span
# in the first place).
#
# D17 (bounded W5 bar #1): every `.{0,N}` bridge below is sized so `N` leaves >=30 characters
# of headroom over that bridge's ACTUAL current consumption — i.e. it survives inserting up to
# 30 characters of clarifying text at that bridge point (mutation class (iii)) without going
# hollow. No guarded invariant is matched as one contiguous literal spanning more than a single
# clause; a literal covering an entire clause (e.g. "artifact ... defeats the finding") is itself
# split by an internal bridge rather than left as a zero-tolerance run of words. Unbounded
# paraphrase remains explicitly out of scope.
#
# F15 fix round: rung 2's tie-break clause lives in a markdown blockquote, so every physical
# line starts with `> `. Joining newlines with a bare space (as above) used to leave that `> `
# sitting mid-sentence wherever the blockquote happened to be hard-wrapped — a pure formatting
# accident, not invariant content, and no assertion in this file's regex ever names a literal
# `>` — so also strip a leading `> ` from every line before flattening. This is the same
# reflow-immunity `flat()` already exists to buy (D17, mutation class (i)); it just closes a gap
# specific to blockquote prose that plain paragraphs, tables, and bullets never hit.
flat() { sed -E 's/^> ?//' | tr '\n' ' ' | tr -s ' ' | sed -E 's/\*\*//g'; }

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
# this assertion (D17 mutation class (ii), was W5 bar #1/F7). The bridge is widened to `.{1,40}`
# (D17: >=30 headroom over the ~1-char actual gap) so up to 30 characters of clarifying text
# between "Rule A" and "silence" survives too (D17 mutation class (iii)). This stays unique to
# the guarded clause because the W2 mapping paragraph's restatement puts "(Rule A)" AFTER the
# phrase ("...silence is not dissent (Rule A)"), which cannot satisfy a "Rule A ... silence is
# not dissent" word-order match within 40 characters (D14 survives).
has 'Rule A: silence is not dissent' "$STEP6" \
    'Rule A .{1,40} silence is not dissent'

# Compound claim: one-flags-one-silent is classed `single` — AND — the same sentence
# says it is never `conflicting`. Both conjuncts, anchored to the sentence that makes
# them (W5 bar #3); a rewrite that keeps only the "never conflicting" half is not this
# assertion's clause and must not hold it green. Both bridges are widened to `.{0,40}`
# (D17: >=30 headroom over their ~2-char actual gaps).
has 'Rule A: one-flags-one-silent is single, never conflicting' "$STEP6" \
    'one-flags-one-silent is therefore `single`.{0,40}never.{0,40}`?conflicting`?'

# Same word-order anchor as Rule A above (F7): stays unique to the guarded clause because the
# W2 mapping paragraph never restates "Rule B" before "co-location"/"conflict" in this order.
# Widened to `.{1,40}` for the same D17 reason as Rule A above.
has 'Rule B: co-location alone is not a conflict' "$STEP6" \
    'Rule B .{1,40} co-location is not conflict'

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
# a phrase unique to its own conjunct, with every `.{0,N}` bridge sized to D17's >=30-char-headroom
# floor (F12b flagged the previous `.{0,40}` on the hypothesis/dispositions bridge as only 27 chars
# of headroom over its 13-char actual gap; widened to `.{0,50}` here). Every phrase named is
# coined by this clause and appears nowhere else in step 6 (confirmed against the pre-fix file), so
# deleting only this clause reddens only these five assertions.

has 'pre-filter is scoped to cold-only, never to contract-only' "$STEP6" \
    'ONLY permitted pre-filter on a `single` finding.s `\[cold-only\]` half.{0,40}never on its `\[contract-only\]` half'

has 'cold-only finding is a hypothesis and gets an evidence-bearing disposition' "$STEP6" \
    '`\[cold-only\]` finding is a hypothesis.{0,50}exactly one of Law 3.s three evidence-bearing dispositions'

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
# unchanged. D17: the bridge is `.{0,40}` (>=30 headroom over the ~1-char actual gap between
# "below" and "governs"), replacing the earlier `.{0,15}` that was under the 30-char floor and
# could still be overflowed by an insertion like "still, only".
has 'single finding: the ledger-adjudication rule below governs it unchanged' "$STEP6" \
    'ledger-adjudication rule below.{0,40}governs unchanged'

# --- Item 1 (F13/D16): what the agreed/NOT_REPRODUCED adjudication DOES -----------------------
# The plan's mandated text says a `NOT_REPRODUCED` on an `agreed` finding "escalates to you
# immediately for adjudication" but never said what that adjudication DOES — no output, no
# evidence bar, no effect on the fix-round cap (F13, cold-lens Critical). D16 ratifies option (a):
# the Warchief weighs the fixer's falsification artifact against both reviewers' reports and
# records exactly one of UPHELD / REJECTED / ESCALATED, and the act consumes no fix round. Each
# outcome is its own short assertion, anchored on its own unique all-caps token plus its
# consequence phrase, with no bridge that has to span across to a sibling outcome. D17: each
# clause verb phrase that used to be one zero-gap literal ("artifact defeats the finding", "does
# not cover the condition", "does not let you tell") is itself split by an internal `.{0,40}`
# bridge, so a plausible clarifying word inserted mid-clause (e.g. "still") no longer breaks it —
# and the ESCALATED tail bridge is widened from `.{0,15}` to `.{0,40}` for the same >=30-headroom
# reason as the assertions above.

has 'agreed adjudication UPHELD drops the finding as falsified, no fixer round spent' "$STEP6" \
    'UPHELD.{0,40}artifact.{0,40}defeats the finding.{0,60}DROPPED \(falsified\).{0,50}no fixer round is spent'

has 'agreed adjudication REJECTED sends it back to the fixer with the condition named' "$STEP6" \
    'REJECTED.{0,50}does not.{0,40}cover the condition.{0,150}back to the fixer with that condition named'

has 'agreed adjudication ESCALATED goes to the Shaman as NEEDS_DIRECTION' "$STEP6" \
    'ESCALATED.{0,50}does not.{0,40}let you tell.{0,40}NEEDS_DIRECTION.{0,40}to the Shaman'

has 'agreed adjudication is a review act: it consumes no fix round' "$STEP6" \
    'is a REVIEW act.{0,100}consumes NO fix round'

# --- Item 2 (D16 cross-card pointer): the ledger rule names its own boundary --------------------
# Idea-05's shipped ledger-adjudication rule opened with no signal that an `agreed` finding's
# `NOT_REPRODUCED` does not wait for it (the carve-out lived only in a paragraph 30 lines earlier
# that the rule never acknowledged). D16 authorizes exactly one pointer clause, added to the
# rule's own text, changing no duties and none of its three outcomes. D17: each
# "finding's `NOT_REPRODUCED`" occurrence is itself split by an internal `.{0,40}` bridge (rather
# than left as one zero-gap literal run), so a clarifying insertion right after "finding's" (e.g.
# "finding's own") cannot break this — the most sensitive edit in the campaign gets the same
# >=30-headroom treatment as everything else.

has 'ledger-adjudication rule points to the agreed carve-out: it governs single, not agreed' "$STEP6" \
    'governs a `single` finding.s.{0,40}`NOT_REPRODUCED`.{0,60}`agreed` finding.s.{0,40}`NOT_REPRODUCED`.{0,40}adjudicated immediately.{0,40}per the routing table above'

# --- Task 3: the conflict ladder --------------------------------------------
# Three rungs, strictly ordered, bounded so they can never grind (spec §2.3). Every bridge
# below is sized against the ladder text's OWN actual current consumption (measured directly
# against the flattened block before it shipped) so it keeps >=30 chars of headroom over that
# consumption (D17). No guarded invariant is one contiguous literal spanning more than a single
# clause — where a clause has an internal seam (e.g. citation -> verbatim -> file:line) the
# regex bridges it rather than gluing it into one zero-tolerance run.

# Rung 1 — citation, not judgment. Both conjuncts of "quote verbatim, with its file:line"
# checked (W5 bar #3); a rewording that drops the file:line requirement reddens this alone,
# nothing else in step 6 pairs "quote the deciding sentence" with "file:line".
has 'rung 1: resolve by verbatim contract citation' "$STEP6" \
    'quote the deciding sentence.{0,40}verbatim, with its.{0,40}`?file:line`?'

# "No citation" also appears in rung 3's own opening clause ("No citation settles it"), but that
# clause is never followed by "this rung does not apply" within 40 chars, so this bridge stays
# unique to rung 1's fall-through sentence; deleting only that sentence reddens only this
# assertion.
has 'rung 1: no citation means the rung does not apply' "$STEP6" \
    'No citation.{0,40}this rung does not apply'

has 'rung 1: an intention is not a citation' "$STEP6" \
    'plan clearly intends.{0,40}is not a citation'

# Rung 2 — mechanical tie-break, dispatched cold, bounded.
has 'rung 2: exactly one tie-break Skinner is dispatched' "$STEP6" \
    'Dispatch.{0,40}one third Skinner'

# "dispatched" recurs elsewhere in step 6 (e.g. "before any fixer is dispatched", "re-dispatched
# fresh") but never as "tie-break Skinner ... dispatched COLD" — unique to this clause.
has 'rung 2: the tie-break Skinner is dispatched COLD' "$STEP6" \
    'tie-break Skinner.{0,40}is dispatched COLD'

# F15 (Critical, cold-only) — rung 2's old itemization claimed C "receives exactly the brief A and
# B received — the contract, the diff, the repo's rules", which collides with idea 03's reserved
# "cold" (the cold brief forbids the contract by name) AND with Law 1's own "briefs are deliberately
# not identical" (A and B never shared a brief to begin with). W9 rules the fix is a derivation, not
# a relabel: rung 2 is reached only once rung 1 found no citation, so the dispute is never a
# conformance question — it is exactly the cold lens's job, so C gets the cold brief (bare diff,
# never the contract), the same brief as Skinner B. This is the positive assertion that the fixed
# itemization says so; actual bridge consumption (measured against the shipped clause) is 42 chars,
# so `.{0,80}` keeps 38 chars of D17 headroom. F17: the inner `bare ... diff` bridge was left at
# `.{0,10}` (actual gap 1 char, so only 9 chars of headroom — under D17's floor and demonstrated to
# break on a 14-char insertion). Widened to `.{0,40}` for the same >=30-headroom reason as every
# other bridge in this file.
has 'rung 2: C receives the cold lens brief — bare diff only, never the contract' "$STEP6" \
    'tie-break Skinner C is dispatched COLD.{0,80}bare.{0,40}diff.{0,40}only.{0,40}and never the contract'

# W9's supersession must be said OUT LOUD, not silently: the plan's original itemization assumed A
# and B held one identical brief, and that assumption predates idea 03's two asymmetric lenses. Two
# short, tightly anchored assertions rather than one long bridge (W5 bar #2): each clause's own
# actual gap is small (<=5 chars), so `.{0,40}` keeps well over 30 chars of headroom on the first,
# and the second is a near-literal run with no bridge to overflow.
has 'rung 2: the fix states its own supersession of the plans one-identical-brief text' "$STEP6" \
    'This supersedes.{0,40}plan.s earlier itemization'
has 'rung 2: supersession is because idea 03 made the two lenses asymmetric' "$STEP6" \
    'predates idea 03.s two asymmetric lenses'

# The property the plan called "cold" but actually meant gets its own name (W9 item 2): C is never
# shown a report, finding, or verdict, and never told a disagreement exists — that is what makes it
# a genuine third *sample* and not an *arbiter*. Grep-guarded as its own token, separate from the
# lens question above. F17: the bridge was `.{0,10}` over a 1-char actual gap (the hyphen) — 9
# chars of headroom, under D17's floor and demonstrated to break on an 18-char insertion. Widened
# to `.{0,40}`.
has 'rung 2: C is disagreement-blind' "$STEP6" \
    '`disagreement.{0,40}blind`'

# Regression guards (F15) — the exact broken phrases from the pre-fix text must never come back.
# Both are literal, unique substrings of the old itemization (confirmed absent from every other use
# of "the contract"/"the diff"/"the repo's rules" in step 6, which always appears as a numbered
# list, never this comma-joined run) so no legitimate rewrite collides with either guard.
hasnt 'rung 2 no longer claims C receives exactly the brief A and B received' "$STEP6" \
    'exactly the brief A and B received'
hasnt 'rung 2 no longer itemizes the contract, the diff, the repos rules as Cs brief' "$STEP6" \
    "the contract, the diff, the repo's rules"

# Compound claim, one sentence, one shared "never": it never receives A/B's reports, findings,
# verdicts, OR even the fact that a disagreement exists. Both conjuncts share the governing
# "never", so they are kept as ONE assertion (not split) — a split would let deleting the first
# conjunct alone leave the second assertion's own regex still satisfied by "their reports,
# findings, verdicts" text that conjunct 1's clause still supplies (proven by mutation; a split
# here is exactly the false independence W5 bar #3 warns against). The bridge to the second
# conjunct crosses the blockquote's `>` line-continuation but stays short (D17 headroom checked).
# F17: a prior fix round needlessly loosened "the fact" into a `the.{0,15}fact` bridge (actual
# gap 1 char, so only 14 chars of headroom — under D17's floor, and demonstrated to break on a
# 20-char insertion) against unchanged prompt text. "the" and "fact" are literally adjacent in
# the clause, so there is nothing to bridge: reverted to the bare literal.
has 'rung 2: it never receives A or Bs reports, findings, verdicts, or even that a disagreement exists' "$STEP6" \
    'never.{0,40}their reports, findings, verdicts.{0,60}the fact that a disagreement exists'

# Same split rationale for "third sample, not an arbiter": the two phrases sit ~270 chars apart
# across the blockquote's explanatory prose, so each gets its own short, tightly anchored
# assertion instead of one assertion with an unbounded-feeling bridge between them. F17: a prior
# fix round needlessly loosened "not an arbiter" into a `not.{0,10}an arbiter` bridge (actual gap
# 1 char, so only 9 chars of headroom — under D17's floor, and demonstrated to break on a 23-char
# insertion) against unchanged prompt text. "not" and "an" are literally adjacent in the clause, so
# there is nothing to bridge: reverted to the bare literal.
has 'rung 2: it is a third independent sample' "$STEP6" \
    'third independent sample'
has 'rung 2: it is not an arbiter reading two briefs' "$STEP6" \
    'not an arbiter.{0,40}reading two briefs'

has 'rung 2: majority direction across three independent samples' "$STEP6" \
    'majority direction.{0,50}three independent samples'

# Distinguishes from "silence is not dissent" (Rule A, task 1) and "Silence is not a disposition"
# (Law 3) elsewhere in step 6 — this exact clause, "silence is not a vote", occurs nowhere else.
has 'rung 2: silence from C is not a vote' "$STEP6" \
    'silence is not a vote'

# F16 (Important, cold-only) — the old 3-bullet branch set had a hole: C is disagreement-blind, so
# nothing stopped it flagging BOTH disputed directions at once (recognizing the two remedies are
# mutually unsatisfiable is Rule B's job, never asked of C), and neither "A's direction" nor "B's
# direction" excluded the other firing too. W9 rules this is additive: a both-directions report is
# `no majority`, exactly like a third direction or silence — making the branch set exhaustive and
# mutually exclusive. Guarded as its own assertion so deleting only the "both directions" clause
# reddens this alone, not the pre-existing silence/third-direction coverage above.
has 'rung 2: C flagging both disputed directions is no majority, not a tie-break win for either' \
    "$STEP6" 'both directions.{0,90}no majority'

# The A/B majority bullets are scoped to "only" their own direction (not merely "A's direction"),
# which is what makes the both-directions branch above mutually exclusive with these two rather
# than silently overlapping them.
has 'rung 2: A-direction majority requires A only (never shared with a both-directions report)' \
    "$STEP6" "A.s direction only.{0,40}majority \\(2 of 3\\)"
has 'rung 2: B-direction majority requires B only, symmetric' "$STEP6" \
    "B.s direction only.{0,40}symmetric"

has 'rung 2: at most ONE tie-break round per finding key per campaign' "$STEP6" \
    'At most.{0,40}ONE tie-break round per finding key.{0,40}campaign'

# Distinguishes from the agreed-adjudication's own "This is a REVIEW act ... consumes NO fix
# round" (task 2, a different noun — "act" not "round" — and a different verb phrase —
# "consumes NO" not "does not consume"), so deleting only the ladder's bounds sentence cannot
# leave this assertion held green by task 2's unrelated review-act text.
has 'rung 2: a tie-break does NOT consume a fix round' "$STEP6" \
    'tie-break is a.{0,40}REVIEW round.{0,40}does not consume a fix round'

# Rung 3 — the conflict IS the finding.
# Compound claim (W5 bar #3): returns NEEDS_DIRECTION, to the Shaman, at once, not at round 3 —
# every conjunct checked in the order the sentence makes them.
has 'rung 3: immediate NEEDS_DIRECTION, not at round 3' "$STEP6" \
    'Return.{0,40}NEEDS_DIRECTION.{0,40}to the Shaman.{0,40}at once.{0,40}not at round 3'

has 'rung 3: a question no experiment can settle is not a code question' "$STEP6" \
    'A question no experiment can settle is not a code question'

has 'rung 3: escalation carries both reports verbatim' "$STEP6" \
    'Both reviewers.{0,40}reports, verbatim'

# --- Task 4: the ledger columns ---------------------------------------------
# This EXTENDS idea 05's existing disposition ledger (its finding-ID / finding-key / disposition
# machinery is already above, in "Assign each routed Critical/Important finding a stable ID" and
# "Require a disposition ledger back") with two Warchief-owned columns (spec §2.4) — it does not
# create a second ledger. A bare-phrase grep on this task's own vocabulary would be HOLLOW: `class`
# (capitalized, unbackticked) is already this file's own confidence-classes table header;
# `DROPPED (contract` and `DROPPED (tie-break` already occur in rung 1 and rung 2's prose above;
# bare `ESCALATED` already occurs three times in the agreed-adjudication outcomes. Every assertion
# below is therefore anchored to THIS task's own `| Column | Filled by | Values |` table
# specifically — `` `class`|`routed`[[:space:]]*\|[^|]*\|[^|]*VALUE `` — which crosses the row's own
# "Filled by" cell via a structural, pipe-bounded `[^|]*` (immune to text-length changes by
# construction — it is not a `.{0,N}` bridge and needs no D17 headroom measurement; the same
# technique already used by task 2's `single`-row assertion above). No other row in step 6 opens
# with a first cell reading `` `class` `` or `` `routed` ``, so deleting only this task's new table
# reddens only these assertions.

has 'ledger has a class column, filled by the Warchief per round' "$STEP6" \
    '`class`[[:space:]]*\|[[:space:]]*you, per round'

has 'ledger has a routed column, filled by the Warchief per round' "$STEP6" \
    '`routed`[[:space:]]*\|[[:space:]]*you, per round'

has 'routed value TO_FIXER' "$STEP6" \
    '`routed`[[:space:]]*\|[^|]*\|[^|]*TO_FIXER'

has 'routed value DROPPED with a contract citation' "$STEP6" \
    '`routed`[[:space:]]*\|[^|]*\|[^|]*DROPPED \(contract'

has 'routed value DROPPED by tie-break' "$STEP6" \
    '`routed`[[:space:]]*\|[^|]*\|[^|]*DROPPED \(tie-break'

# D20 retires this closed-list ROW assertion (`ESCALATED (spec ambiguity)` as a literal enum
# member): the value went PARAMETRIC (`ESCALATED (<trigger>)`), so the row no longer lists
# individual triggers at all. See the "Task 4, D20 fix round" block at the end of this file for the
# parametric-form assertion that replaces this one, and for why retiring it (rather than leaving it
# to redden permanently) is the correct response to a design change, not a silently-abandoned guard.

# Compound claim (W5 bar #3): disposition stays empty — AND — that emptiness is scoped to a
# finding whose `routed` is not `TO_FIXER` (i.e. one that never reached the fixer). Both conjuncts
# checked, in the order the sentence makes them. Each bridge is measured against this sentence's
# own actual consumption (~17-18 chars per gap) and widened to keep >=30 chars of D17 headroom.
has 'disposition stays empty when the finding never reached the fixer' "$STEP6" \
    'stays empty.{0,50}whose `routed` is not `TO_FIXER`.{0,50}never reached the fixer'

# "report file" alone already occurs 4 times earlier in step 6 (idea 05's ledger machinery), so a
# bare grep would be hollow. Anchored instead to this clause's own literal, zero-gap phrase
# ("ledger lives in your report file"), then (D17 bridge, ~2-char actual gap) to the parenthetical
# that is unique to this sentence.
has 'the ledger lives in the report file, on disk and append-only' "$STEP6" \
    'ledger lives in your report file.{0,40}on disk, append-only'

# D18/F22 superseded the original second conjunct here ("the report file is what lets a
# re-dispatched Warchief see spent tie-breaks") — that claim is exactly the collision F22 found
# against the crash-safe-resume doctrine 500 lines above, and it is now false. See the "Task 4,
# 4th fix round (D18/F22)" block below for the replacement assertions guarding the corrected text.

# --- Task 4 fix round (W10/F18/F19): the enum must express every outcome the section --------
# already produces, and the timing claim must not contradict the ledger's own append-only rule.
# F18: the pre-fix enum (5 values) could not express D16's `DROPPED (falsified)`, idea 05's
# `DROPPED (falsified, round N)`, or the standoff `NEEDS_DIRECTION` outcome, and `TIEBREAK` was
# listed with no trigger anywhere else in the file. F19: "you, at merge ... before the fixer is
# dispatched" is false for outcomes only known after the fixer returns, and the ledger is
# append-only so a cell can never be rewritten later — resolved by making each row per finding
# PER ROUND, appended, never overwritten. Every bridge below is measured against this new text's
# OWN actual consumption (1-9 chars per gap, confirmed by direct measurement of the shipped
# clause) and widened to `.{0,40}`, keeping >=30 chars of D17 headroom on every one.

# The three added enum values, each anchored the same structural way as the plan's original five
# above: `` `routed`[^|]*\|[^|]*VALUE `` is bounded by the row's own pipes, not a `.{0,N}` bridge,
# so it is immune to text-length changes by construction and reddens only when the value is
# removed from THIS table row (the literal closing paren after "falsified" also keeps the plain
# and round-N forms mutually exclusive: "DROPPED (falsified)" cannot match inside "DROPPED
# (falsified, round N)", which has a comma, not a paren, immediately after "falsified").
has 'routed value DROPPED falsified (agreed UPHELD, no fixer round spent)' "$STEP6" \
    '`routed`[[:space:]]*\|[^|]*\|[^|]*DROPPED \(falsified\)'

has 'routed value DROPPED falsified round N (single finding not re-raised)' "$STEP6" \
    '`routed`[[:space:]]*\|[^|]*\|[^|]*DROPPED \(falsified, round N\)'

# D20 retires this closed-list ROW assertion (`ESCALATED (standoff)` as a literal enum member) for
# the same reason as the spec-ambiguity one above: the value is now parametric. See the "Task 4,
# D20 fix round" block at the end of this file.

# TIEBREAK must have a stated trigger and a stated resolution — a listed value nobody ever
# produces is a trap (W10 ruling 2). First assertion is the definition's own header sentence
# (near-adjacent, no bridge needed — matches D17's own convention of leaving a true zero-gap
# phrase as a bare literal rather than manufacturing a bridge that has nothing to span).
has 'TIEBREAK is defined as a transient state, not a dead end' "$STEP6" \
    '`TIEBREAK` names a transient state, not a dead end'

# Compound claim: all three resolutions named, in order, each conjunct anchored on phrasing
# unique to this clause ("C sided with the finding" / "C sided against it" / "no majority" occur
# nowhere else in step 6 paired with these tokens) so deleting any one resolution reddens only
# this assertion (W5 bar #3).
has 'TIEBREAK resolves onward to TO_FIXER, DROPPED tie-break round N, or a rung-3 escalation' \
    "$STEP6" \
    'resolves onward to one of three places.{0,40}`TO_FIXER`.{0,40}C sided with the.{0,40}finding.{0,40}`DROPPED \(tie-break, round N\)`.{0,40}C sided against it.{0,40}rung-3 escalation \(no majority\)'

# ESCALATED (standoff) must be distinct from ESCALATED (spec ambiguity) — mislabelling a standoff
# as a spec ambiguity would falsify the record (W10 ruling 1). Each definition is its own
# assertion, anchored on phrasing unique to that outcome; the final assertion guards the
# conflation warning itself so a later edit cannot silently drop the distinction.
has 'ESCALATED spec ambiguity is defined as rung 3s contract-underdetermined outcome' "$STEP6" \
    '`ESCALATED \(spec ambiguity\)` is rung 3.{0,40}outcome: no citation settles the dispute and no majority exists.{0,40}contract itself is underdetermined'

has 'ESCALATED standoff is defined as the ledger-adjudication rules own outcome' "$STEP6" \
    '`ESCALATED \(standoff\)` is the ledger-adjudication rule.{0,40}outcome below: the Skinner re-raises a `NOT_REPRODUCED` finding unchanged'

has 'ESCALATED standoff is an evidence deadlock, never a contract ambiguity' "$STEP6" \
    'evidence.{0,40}deadlock.{0,40}never a.{0,40}contract ambiguity'

has 'the two ESCALATED values are never to be conflated' "$STEP6" \
    'must never be recorded as `ESCALATED \(spec ambiguity\)`'

# DROPPED (falsified) and DROPPED (falsified, round N) get their own definitions, tying each back
# to the rule that produces it (D16's UPHELD adjudication vs the ledger-adjudication rule's
# not-re-raised branch), so the enum value is never left floating without a producing rule.
has 'DROPPED falsified and DROPPED falsified round N are defined as the two falsification outcomes' \
    "$STEP6" \
    '`DROPPED \(falsified\)`.{0,40}and `DROPPED \(falsified, round N\)`.{0,40}two falsification outcomes'

has 'DROPPED falsified is an agreed findings NOT_REPRODUCED adjudicated UPHELD, no fixer round spent' \
    "$STEP6" \
    'adjudicated UPHELD drops.{0,40}immediately as `DROPPED \(falsified\)`.{0,40}no fixer round spent'

has 'DROPPED falsified round N is a single findings NOT_REPRODUCED the next Skinner does not re-raise' \
    "$STEP6" \
    'does not re-raise.{0,40}falls as `DROPPED \(falsified, round N\)`'

# F19: the ledger is per finding PER ROUND — appended, never overwritten. Each conjunct of the
# rule is its own assertion so deleting any one clause alone reddens only its own guard.
has 'a ledger row is per finding per round, never overwritten, always appended' "$STEP6" \
    'A row is per finding, per round.{0,40}never overwritten, always appended'

has 'a later adjudication appends a brand-new row for the later round rather than editing an earlier one' \
    "$STEP6" \
    'finding adjudicated later.{0,90}gets a brand-new row for.{0,40}the later round.{0,90}the new `routed` value.{0,40}it never edits the row an earlier round wrote'

has 'append-only holds even though falsified outcomes are only known after the fixer has returned' \
    "$STEP6" \
    'keeps the ledger append-only even though outcomes like.{0,40}`DROPPED \(falsified\)`.{0,40}are only known after the fixer has already returned'

# --- Task 4, 2nd fix round (W11/F20): the enum's THIRD escalation trigger has no home ---------
# D16 defines three outcomes for the Warchief's immediate adjudication of an `agreed` finding's
# `NOT_REPRODUCED`: UPHELD, REJECTED, and ESCALATED ("the artifact does not let you tell" ->
# NEEDS_DIRECTION). W10 sharpened the enum with TWO distinctly-triggered ESCALATED values
# (spec ambiguity / standoff) but left D16's third outcome with no legal `routed` value: it is
# neither a re-raised standoff (no Skinner ever re-raises on the `agreed` immediate-adjudication
# path) nor a spec ambiguity (the contract is fine; only the artifact is inconclusive). W11 adds
# `ESCALATED (inconclusive artifact)` and extends the disambiguation prose to name all three
# triggers so no two of them can be collapsed into each other.
#
# D20 retires the ROW assertion this comment used to introduce (`ESCALATED (inconclusive
# artifact)` as a literal enum member) and the three "header names N ESCALATED values" assertions
# that followed it — the enum went PARAMETRIC and the header no longer counts values at all. See
# the "Task 4, D20 fix round" block at the end of this file for the parametric-form, actual-cause,
# openness, and named-triggers assertions that replace all four, plus regression guards for every
# retired fixed-count wording (two/three/four/five).

# The new value's own definition: it is D16's own agreed-adjudication outcome, triggered when the
# artifact does not let the Warchief tell either way, and it consumes no fixer round (same
# no-fixer-round accounting as the other two "no fixer round"/"no majority" outcomes already
# guarded above). Split into short, per-clause-anchored assertions (W5 bar #2/#3) rather than one
# long bridge, each on phrasing unique to this new sentence.
has 'ESCALATED inconclusive artifact is defined as the agreed-adjudication rules own outcome' \
    "$STEP6" \
    '`ESCALATED \(inconclusive artifact\)` is the agreed-adjudication rule.{0,40}own outcome above'

has 'ESCALATED inconclusive artifact fires when the artifact does not let the Warchief tell either way' \
    "$STEP6" \
    'the artifact does not let it tell either way.{0,60}goes to `NEEDS_DIRECTION`.{0,40}no fixer round spent'

# Distinguishes it from `ESCALATED (standoff)`: no Skinner ever re-raises anything on the `agreed`
# immediate-adjudication path, because D16's design resolves the finding before the next re-audit.
has 'ESCALATED inconclusive artifact is never a standoff: no Skinner ever re-raises on the agreed path' \
    "$STEP6" \
    'never.{0,40}`ESCALATED \(standoff\)`.{0,60}no Skinner ever re-raises anything on the `agreed`.{0,40}immediate-adjudication path'

has 'ESCALATED inconclusive artifact standoff-exclusion is because D16 resolves before the next re-audit' \
    "$STEP6" \
    "D16.s design resolves the finding before the next re-audit.{0,50}nothing to re-raise"

# Distinguishes it from `ESCALATED (spec ambiguity)`: the contract itself is not in question here
# -- only the artifact is inconclusive, not the text the two reviewers read.
has 'ESCALATED inconclusive artifact is never a spec ambiguity: the contract itself is not in question' \
    "$STEP6" \
    'never.{0,40}`ESCALATED \(spec ambiguity\)`.{0,60}the contract itself is not in question here'

has 'ESCALATED inconclusive artifact spec-ambiguity-exclusion is because only the artifact is inconclusive' \
    "$STEP6" \
    'only the artifact is inconclusive.{0,40}not the text the two reviewers read'

# --- Task 4, 3rd fix round (W12/F21): TIEBREAK needs a write-time AND a row-anchored guard -----
# F21a (cold lens): rung 2 read as synchronous (dispatch C -> apply majority -> record the FINAL
# outcome), so the in-flight `TIEBREAK` state was never persisted -- a legal value no rule ever
# writes. F21b (contract lens): `TIEBREAK`'s membership in the enum row had NO row-anchored
# assertion (unlike its 8 siblings above) -- deleting ` / `TIEBREAK`` from the row left the whole
# suite green. W12 fixes both: a write-BEFORE-dispatch rule (spends the key's one tie-break so a
# crash can't lose it), an append-on-return rule, a resumed-Warchief-treats-it-as-spent rule, and
# the row anchor itself.

# F21b: the row-anchored guard `TIEBREAK` itself never had, in the exact structural shape as its
# 8 siblings above (`` `routed`[^|]*\|[^|]*VALUE `` bounded by the row's own pipes -- immune to
# text-length changes by construction, no D17 headroom needed). Proven to bite: deleting only
# ` / `TIEBREAK`` from the enum row reddens this assertion and none other (see task's repro).
has 'routed value TIEBREAK is row-anchored in the enum, like its siblings' "$STEP6" \
    '`routed`[[:space:]]*\|[^|]*\|[^|]*`TIEBREAK`'

# F21a, part 1: the write-time rule itself. D18/F22 superseded this clause's own artifact — the
# write-BEFORE-dispatch act that spends the key's one tie-break is no longer the report-file
# ledger row, it is a committed state-file line (see the "Task 4, 4th fix round (D18/F22)" block
# below for why: the report file is never git-committed mid-round, so it cannot be what a crash
# survives). This assertion is updated in place because its invariant changed, per the brief's own
# rule ("update any assertion whose invariant D18 has now changed"). Single long literal, no
# internal bridge needed (D17 convention: a true zero-gap phrase stays a bare literal).
has 'before dispatching C, the Warchief WRITEs AND COMMITS the finding key to the state files Tie-breaks spent heading' \
    "$STEP6" \
    "Before dispatching C, WRITE AND COMMIT the finding key under a \`## Tie-breaks spent\` heading in the card.s state file"

# F21a, part 2: WHY that write happens before dispatch -- it is what SPENDS the key's one
# tie-break, and the timing (before, not after) is what survives a crash. Three conjuncts
# (W5 bar #3), each anchored on phrasing unique to this clause. Actual gaps are 9 and 12 chars;
# `.{0,40}`/`.{0,45}` keep >=28-31 chars of D17 headroom.
has 'the write spends the keys one tie-break' "$STEP6" \
    'SPENDS the key.s one tie-break'

has 'the write lands before C is dispatched so a crash mid-tie-break cannot lose the fact' \
    "$STEP6" \
    'SPENDS the key.s one tie-break.{0,40}lands before C is dispatched.{0,45}a crash mid-tie-break cannot lose the fact'

# F21a, part 3: the append-on-return rule -- when C returns, the outcome is a NEW appended row,
# not an overwrite, and the three onward outcomes are named (same three as the pre-existing
# "TIEBREAK resolves onward to..." assertion above, restated here at the write/append-rule's own
# location so a later editor cannot silently drop this rule while leaving the outcome definition).
# Actual gaps: 58, 2, 3, 2, 5 chars; bridges widened to keep >=30 chars of D17 headroom each.
has 'when C returns, the outcome is APPENDED as a new row' "$STEP6" \
    'When C returns, APPEND the outcome as a new row'

has 'the appended outcome names all three onward values: TO_FIXER, DROPPED tie-break round N, or a rung-3 escalation' \
    "$STEP6" \
    'APPEND the outcome as a new row.{0,90}`TO_FIXER`.{0,40}if C sided with the finding.{0,40}`DROPPED \(tie-break, round N\)`.{0,40}if C sided against it.{0,40}a rung-3 escalation if there is no majority'

# F21a, part 4: WHO looks, and WHEN -- D19/F23 superseded this clause's own subject. It used to
# read "A resumed Warchief" as if the resume protocol itself delivered a Warchief back into this
# rung; F23 (cold-only, Critical) proved that is false (resume-check.sh's next_action() has no
# branch for a mid-flight audit round -- see the "Task 4, 5th fix round (D19/F23)" block below for
# the reproduction and the honest replacement text). The corrected clause names the actor
# generically ("any Warchief -- fresh or resumed -- that ENTERS an audit round"), because the only
# thing that is actually true is that whichever Warchief is running an audit round, at whatever
# point it reaches this rung, consults the heading first. Updated in place (invariant changed, per
# the brief's own rule). Two conjuncts (W5 bar #3), each anchored on phrasing unique to this
# clause; actual gaps 27 and 12 chars, so `.{0,60}`/`.{0,45}` keep >=30 chars of D17 headroom.
# W15/F29 UPDATES this clause in place (invariant changed): the pre-fix text treated bare KEY
# PRESENCE alone as sufficient to label a resumed conflict `ESCALATED (tie-break spent)`,
# unconditionally, "never a crash" -- which made `ESCALATED (oracle unavailable)` unreachable by any
# rule the document defined (F29, Critical, cold-only). The fix inserts "under EITHER status" at the
# presence-check clause (new actual gap there is 22 chars, so the bridge widens from a bare literal to
# `.{0,55}`, keeping 33 chars of D17 headroom) -- the assertion now guards the CORRECTED claim: key
# presence alone still means SPENT (rung 3, no second C), but which trigger fires is a SEPARATE
# decision the two new branch assertions below cover. Guarding the old unconditional bare-literal tail
# here would be guarding the false statement F29 found, so it is retired in favor of this rewrite,
# per the brief's own instruction.
has 'any Warchief entering an audit round consults the state files Tie-breaks spent heading first, fresh or resumed' \
    "$STEP6" \
    'Any Warchief.{0,60}ENTERS an audit round consults the state file.s `## Tie-breaks spent` heading FIRST.{0,45}finds a finding key listed there.{0,55}treats that key.s tie-break as SPENT'

# Regression guard: the retired bare-key-presence-decides wording (no status check at all) must never
# come back verbatim -- this is the exact phrasing F29 proved makes `oracle unavailable` unreachable.
hasnt 'the Bounds rule no longer decides the trigger from bare key presence alone, without a status check' \
    "$STEP6" 'listed there, treats that key.s tie-break as SPENT'

# This half of the old sentence is untouched by D19/F23 (the consequence of finding the key spent
# is unchanged), so its assertion keeps its NAME and regex stable (brief's own instruction).
has 'a spent tie-break sends a resumed Warchief straight to rung 3, never a second tie-break Skinner' \
    "$STEP6" \
    'tie-break as SPENT.{0,40}it goes straight to rung 3.{0,40}never dispatches a second tie-break Skinner on that key'

# F21a, part 5 (W12's reconciliation clause): the idempotence sentence now says out loud that
# classes are re-derivable from the diff but a key's spent tie-break count is NOT -- it is history
# that must be written down. D19/F23 reworded the LEAD-IN clause ("a resumed Warchief re-runs the
# round" -> "any audit round that runs again ... re-derives"), for the same reason as the rename
# above; the tail this assertion anchors on is untouched. Actual gaps: 2, 3 chars; `.{0,40}` keeps
# >=36 chars of D17 headroom on each.
has 'classes are re-derivable from the diff, but spent tie-break history is not and must be written down' \
    "$STEP6" \
    'Classes are re-derivable this way.{0,40}how many tie-breaks a key has already spent is not.{0,40}that is history, and history must be written down'

# --- Task 4, 4th fix round (D18/F22): the tie-break-spent record moves to the STATE FILE --------
# F22 (cold-only, Critical, Confirmed): warchief.md's own shipped "Crash-safe state & resume"
# doctrine (~500 lines above step 6, untouched by this campaign) says twice that anything
# uncommitted is DEFINED as never having happened, and that the report file must never be used to
# re-derive resume progress. But W12/spec §2.4 put the TIEBREAK-spent record in the report file --
# which lives in scratch, is never git-committed mid-round, and is exactly the artifact the
# doctrine forbids. Traced failure: Warchief writes the TIEBREAK row, dispatches C, dies;
# resume-check.sh says REVERT_AND_REDO; the round's work is discarded and "never happened" -- but
# the report-file ledger still claims the key's tie-break is spent, so the resumed Warchief
# escalates to a human instead of ever retrying the mechanical oracle. D18 (Shaman ruling) settles
# it: the AUTHORITATIVE record moves to the card's STATE FILE (docs/tribe/state/CARD-SLUG.md,
# already the tribe's one sanctioned resume artifact), written and committed BEFORE the tie-break
# Skinner is dispatched -- the same commit-before-act discipline as D12a. The report-file ledger
# keeps its TIEBREAK row as the human-readable audit trail, EXPLICITLY NON-AUTHORITATIVE for the
# cap. Every bridge below is measured against this new text's OWN actual consumption (measured by
# direct extraction of the shipped clause) and widened to keep >=30 chars of D17 headroom.

# Regression guard: the exact sentence that caused F22 (spec §2.4's "No state-file change is
# needed", carried into the pre-fix ledger prose) must never survive a later edit reverting it.
hasnt 'the old No state-file change is needed claim (the cause of F22) does not survive' "$STEP6" \
    'No state-file change is needed'

# The write-and-commit-BEFORE-dispatch rule cites D12a's own commit-before-act discipline: a
# record is an artifact, not a claim. Actual gap 2 chars; `.{0,40}` keeps 38 chars of headroom.
has 'the pre-dispatch state-file write cites D12as commit-before-act discipline' "$STEP6" \
    'the same commit-before-act discipline as D12a.{0,40}a record is an artifact, not a claim'

# WHY the record now survives a crash: it is git-committed history, never the report file, which
# the doctrine above already forbids treating as resume truth. Two conjuncts (W5 bar #3), each
# anchored on phrasing unique to this clause. Actual gaps 14 and 12 chars; `.{0,50}` keeps >=36
# chars of headroom on each.
has 'the per-key cap survives a crash because the record is git-committed history, never the report file' \
    "$STEP6" \
    'the record is git-committed history.{0,50}never the report file.{0,50}crash-safe-resume doctrine above already forbids treating as resume truth'

# The report-file ledger row is STILL written (it stays the audit trail) -- this is what keeps
# D18's fix additive rather than deleting W12's ledger machinery outright. Actual gaps 2, 2, 22
# chars; bridges widened to keep >=30 chars of headroom on the widest.
has 'the report-file TIEBREAK row is still written too, as the human-readable audit trail' "$STEP6" \
    'report-file ledger still gets its.{0,40}routed: TIEBREAK.{0,40}row too, same as always.{0,60}human-readable audit trail'

# ...and it is EXPLICITLY NON-AUTHORITATIVE for the cap -- the state-file line is what is
# authoritative. Anchored on "for the cap" (not "for the one-tie-break-per-key cap", which is the
# DIFFERENT, later paragraph's own wording -- see below), so this stays unique to rung 2's clause.
# Actual gaps 1, 2 chars; `.{0,40}` keeps >=38 chars of headroom.
has 'the report-file row is explicitly non-authoritative for the cap; the state-file line is authoritative' \
    "$STEP6" \
    'explicitly NON-AUTHORITATIVE.{0,40}for the cap.{0,40}the state-file line is the authoritative record'

# The resumed-Warchief bounds paragraph: the report-file TIEBREAK row is consulted for NONE of
# this on resume -- only the state file's heading decides. Three conjuncts (W5 bar #3). Actual
# gaps 3, 1, 6 chars; `.{0,40}` keeps >=34 chars of headroom on each.
# F32 sweep: the 67-char tail "only the state file's `## Tie-breaks spent` heading decides whether
# a key's tie-break is spent" was itself a zero-gap literal spanning more than a single clause, and
# reddened on independent legal insertions -- "definitively" after "decides" (reproduced) and
# "already" before "spent" (reproduced). Bridged at all three internal joints (actual gaps 1 char
# each; `.{0,40}` keeps 39 chars of headroom on each).
has 'on resume, the report-file TIEBREAK row is consulted for none of it; only the state file decides' \
    "$STEP6" \
    "report-file ledger.s \`TIEBREAK\` row is consulted for none of this.{0,40}it is the audit trail, not the.{0,40}authoritative record.{0,40}only the state file.s \`## Tie-breaks spent\` heading decides.{0,40}whether a key.s tie-break.{0,40}is.{0,40}spent"

# The "Recording it" reconciliation paragraph: the report file is explicitly non-authoritative for
# the one-tie-break-per-key cap (distinct wording from rung 2's "for the cap" clause above, so
# deleting either clause alone reddens only its own assertion). Actual gap 1 char; `.{0,40}` keeps
# 39 chars of headroom.
has 'the ledger prose says the report file is explicitly non-authoritative for the one-tie-break-per-key cap' \
    "$STEP6" \
    'explicitly NON-AUTHORITATIVE.{0,40}for the one-tie-break-per-key cap'

# WHY: per the crash-safe-resume doctrine above, anything not git-committed is defined as never
# having happened, and the report file is never committed mid-round -- this is the reconciliation
# clause conforming to the doctrine without rewording the doctrine itself. Two conjuncts. Actual
# gaps 2, 6 chars; `.{0,40}` keeps >=34 chars of headroom on each.
has 'the reconciliation clause: uncommitted is never-happened, and the report file is never committed mid-round' \
    "$STEP6" \
    'per the crash-safe-resume doctrine above.{0,40}anything not git-committed is defined as never having happened.{0,40}the report file is never committed mid-round'

# The state file is named as THE authoritative, crash-safe record -- already the tribe's one
# sanctioned resume artifact (the crash-safe-resume doctrine's own vocabulary, cited rather than
# reworded). Actual gap 1 char; `.{0,40}` keeps 39 chars of headroom.
# F32 sweep: the 106-char lead-in "authoritative, crash-safe record that a finding key has spent
# its tie-break lives in the card's state file" was itself a zero-gap literal spanning more than a
# single clause, and reddened on two independent legal insertions -- "already" before "spent"
# (reproduced) and "one" before "tie-break" (reproduced). Bridged at both internal joints (actual
# gaps 1 char each; `.{0,40}` keeps 39 chars of headroom on each).
has 'the state file is the authoritative crash-safe record, the tribes one sanctioned resume artifact' \
    "$STEP6" \
    'authoritative, crash-safe record that a finding key has.{0,40}spent its.{0,40}tie-break lives in the card.s state file.{0,40}docs/tribe/state/CARD-SLUG.md.{0,40}already the tribe.s one sanctioned resume artifact'

# ...and it is written and committed BEFORE the tie-break Skinner is dispatched, per rung 2 above
# -- the Shaman's one binding requirement from D18. Actual gaps 3, 2 chars; `.{0,40}` keeps >=36
# chars of headroom on each.
has 'the state-file tie-break line is written and committed before the tie-break Skinner is dispatched' \
    "$STEP6" \
    'under its `## Tie-breaks spent` heading.{0,40}written and committed before the tie-break Skinner is dispatched.{0,40}per rung 2 above'

# --- Task 4, 5th fix round (D19/F23): ship the honest law about resume, and name the trailer ----
# F23 (cold-only, Critical, Confirmed): the previous text's "A resumed Warchief that finds..."
# sentence read as if the resume protocol itself delivers a Warchief back into rung 2 whenever a
# tie-break was interrupted. Reproduced by reading resume-check.sh's next_action(): every branch
# (VERIFY_SHIPPED / REDO_MERGE / DISCARD_AND_RESUME_DELIVERY / REVERT_AND_REDO task N / RESUME_DELIVERY
# / CONTINUE task N) is driven only by delivery status, a dirty tree, and the highest completed
# `Tribe-Task` trailer -- none of it has any notion of "an audit round is mid-flight". Since a
# Hunter's task-N commit already carries `Tribe-Task: N/TOTAL` before the Warchief's audit of that
# diff even begins, a Warchief that dies mid-tie-break resumes to `CONTINUE task N+1` (or
# `RESUME_DELIVERY` if N was the last task) -- never back into this rung. `resume-check.sh` is out
# of this card's fence (spec §3), so the fix is not there: it is telling the truth in the prompt
# text instead. D19 (Shaman ruling) ratifies option (a): drop the automatic-return claim, say
# plainly what `resume-check.sh` does NOT do, and name the real backstop -- the final whole-branch
# audit always runs before merge, so a stranded record is always re-consulted there. The honest
# degradation is one wasted REVIEW round, never a wrong merge. Every bridge below is measured
# against this new text's OWN actual consumption (measured by direct extraction of the shipped
# clause) and widened to keep >=30 chars of D17 headroom.

# The trailer loose end (also cold-lens-caught, same finding): the pre-dispatch tie-break write is
# a MILESTONE commit, not a task commit -- it is the Warchief's own housekeeping act, never a
# Hunter's task-N deliverable, so it takes `Tribe-Milestone:`, never `Tribe-Task:`. Split into two
# per-clause assertions (W5 bar #2/#3): the label ("milestone, never task") is a separate clause
# from the concrete trailer values, so deleting either alone reddens only its own guard. Actual
# gaps 15 and 2 chars; `.{0,50}`/`.{0,40}` keep >=30 chars of D17 headroom.
has 'the pre-dispatch tie-break write is a milestone commit, never a task commit' "$STEP6" \
    'milestone commit, never a task commit.{0,50}`Tribe-Milestone: TIEBREAK-<finding-key>`'

has 'the milestone commit carries Tribe-Milestone alongside Tribe-Card, never Tribe-Task' "$STEP6" \
    '`Tribe-Milestone: TIEBREAK-<finding-key>`.{0,40}alongside `Tribe-Card:`.{0,40}never `Tribe-Task: N/TOTAL`'

# WHY it takes that trailer: spending a tie-break is the Warchief's own act, not a Hunter's task-N
# deliverable. Self-contained (no bridge back to the trailer-values clause above), so deleting the
# "alongside .../never Tribe-Task" clause above cannot also redden this one, and vice versa. Actual
# gap ~2 chars; `.{0,40}` keeps 38 chars of headroom.
has 'the milestone-commit reasoning: spending a tie-break is the Warchiefs own housekeeping act, not a Hunters task-N deliverable' \
    "$STEP6" \
    'spending a tie-break is the Warchief.s own housekeeping act.{0,40}not a Hunter.s task-N deliverable'

# What the record does NOT deliver: resume-check.sh has no branch for a mid-flight audit round.
# Actual gap (fence -> has no notion) is 15 chars, including the "(spec §3)" aside; `.{0,50}`
# keeps 35 chars of D17 headroom. Anchored without the "(spec §3)" parenthetical itself (kept as a
# comment-only citation above) so the regex needs no non-ASCII literal.
has 'resume-check.sh is out of this cards fence and has no notion of a mid-flight audit round' "$STEP6" \
    'resume-check\.sh.{0,40}is out of this card.s fence.{0,50}has no notion of a mid-flight audit round'

has 'next_action comes only from commit trailers and plan checkboxes' "$STEP6" \
    'next_action.{0,40}comes only from commit trailers and plan checkboxes'

# The reproduction, stated as law: dies mid-tie-break -> CONTINUE task N+1 or RESUME_DELIVERY,
# never back into this rung. `+` is escaped for ERE. "Resumes" is bridged all the way to the quoted
# token (spanning the disposable connective "straight to", actual gap 13 chars) rather than left as
# one contiguous literal ending inside the quoted token, since that whole span is a plausible
# clarifying-insertion point (D17) whichever side of "straight to" it lands on; the other two gaps
# are 21 and 2 chars. `.{0,50}`/`.{0,55}`/`.{0,40}` keep >=30 chars of D17 headroom on each.
has 'a Warchief that dies mid-tie-break resumes to CONTINUE task N+1 or RESUME_DELIVERY, never back into this rung' \
    "$STEP6" \
    'dies mid-tie-break resumes.{0,50}`CONTINUE task N\+1`.{0,55}or `RESUME_DELIVERY`.{0,40}never back into this rung'

# Self-contained (no bridge back to the "never back into this rung" clause above), so the two
# assertions mutate independently.
has 'the resume protocol never reads the Tie-breaks spent heading for you' "$STEP6" \
    'the resume protocol never reads the `## Tie-breaks spent` heading for you'

# The real backstop: the final whole-branch audit always runs before merge, and it too is a
# Warchief entering an audit round, so it re-consults the heading. Actual gaps 1 and 5 chars;
# `.{0,35}`/`.{0,40}` keep >=30 chars of D17 headroom.
# F32 fix: "always runs before any merge" was itself a 28-char zero-gap literal spanning more than
# a single clause (D17), and reddened on two independent legal, meaning-preserving insertions —
# ", without fail," after "always" (reproduced) and "absolutely" before "any merge" (reproduced).
# Bridged at both internal joints (actual gaps 1 char each; `.{0,40}` keeps 39 chars of headroom on
# each), matching the convention already used at this assertion's own other two bridges.
has 'the final whole-branch audit always runs before any merge, and is itself a Warchief entering an audit round' \
    "$STEP6" \
    'the final whole-branch audit.{0,35}always.{0,40}runs before.{0,40}any merge.{0,40}is itself a Warchief entering an audit round'

# Self-contained (no bridge back to the previous assertion's own clause), so the two mutate
# independently. Actual gap 11 chars; `.{0,45}` keeps 34 chars of D17 headroom.
has 'a TIEBREAK row stranded by a crash is re-consulted by the final audit and its spent status honored before any merge' \
    "$STEP6" \
    'a `TIEBREAK` row stranded by an earlier crash is always re-consulted.{0,45}its key.s spent status honored before anything can merge'

# --- Task 4, 6th fix round (D19/F24): the degradation clause must state the TRUE cost ----------
# F24 (cold-only, Important, Confirmed): the old degradation sentence claimed the worst a crash can
# do is "one repeated tie-break round" -- but the pre-dispatch write above (rung 2) SPENDS the key
# BEFORE C is dispatched, and the absolute rule a few lines above this clause says a spent key
# "never dispatches a second tie-break Skinner on that key". Reproduced by tracing the crash window:
# Warchief commits the spend record -> dispatches C -> dies before C's outcome is appended. Any
# Warchief that later enters an audit round (including the mandatory final whole-branch audit)
# finds the key already listed as spent and, per the absolute rule, goes straight to rung 3 --
# NO second C is ever dispatched on that key. So the mechanical-oracle resolution for that finding
# is lost permanently, not merely "repeated": the two sentences cannot both be true, and the vague
# "repeated tie-break round" phrasing reads as licence to redispatch C, directly contradicting the
# absolute rule two sentences above it. D19 (Shaman ruling) ratifies the precise cost: a crash in
# that window means the key is spent and the mechanical oracle never ran, so the finding is forced
# to rung 3 (a human ruling) on the next audit round that touches it, with no second tie-break
# Skinner ever dispatched on that key -- and the ONLY safety property that survives is that this is
# a needless escalation, never a wrong merge. Every bridge below is measured against this new
# text's OWN actual consumption (measured by direct extraction of the shipped clause) and widened to
# keep >=30 chars of D17 headroom.

# Regression guard: the old, false "repeated tie-break round" cost claim must never come back --
# it is exactly the phrasing F24 proved contradicts the absolute rule above it.
hasnt 'the old, false one-repeated-tie-break-round cost claim does not survive' "$STEP6" \
    'one repeated tie-break round'

# Part 1: WHAT actually happens in the crash window -- the key is spent and the mechanical oracle
# never ran. Actual gap ("outcome lands" -> "the key is spent") is 7 chars; `.{0,40}` keeps 33
# chars of D17 headroom.
has 'a crash after the spend-commit but before Cs outcome lands means the key is spent and the oracle never ran' \
    "$STEP6" \
    'crash landing after the spend-commit but before C.s outcome lands.{0,40}the key is spent and the mechanical oracle never ran'

# Part 2: the CONSEQUENCE -- forced to rung 3 (a human ruling) on the next audit round that touches
# it. Three conjuncts (W5 bar #3), each anchored on phrasing unique to this clause. Actual gaps 1,
# 3, 3 chars; `.{0,35}` keeps >=32 chars of D17 headroom on each.
# F32 fix: the 39-char tail "on the next audit round that touches it" was itself a zero-gap literal
# spanning more than a single clause, and reddened on two independent legal insertions -- "very"
# after "the" (reproduced) and "eventually" before "touches" (reproduced). Bridged at all three
# internal joints (actual gaps 1 char each; `.{0,40}` keeps 39 chars of headroom on each).
has 'the finding is forced to rung 3, a human ruling, on the next audit round that touches it' \
    "$STEP6" \
    'forced to.{0,35}rung 3.{0,35}a human ruling.{0,35}on the.{0,40}next audit round.{0,40}that.{0,40}touches it'

# Part 3: the consequence is CONSISTENT with the absolute rule above, never in tension with it --
# no second tie-break Skinner is ever dispatched on that key. Three conjuncts, each bridged
# separately rather than gluing "the absolute rule" and "above" into one zero-tolerance literal
# (D17 mutation class (iii)): actual gaps 3, 1, 2 chars; `.{0,35}` keeps >=32 chars of D17 headroom
# on each.
has 'no second tie-break Skinner is dispatched on that key, consistent with the absolute rule, not in tension' \
    "$STEP6" \
    'no second tie-break Skinner is ever dispatched on that key.{0,35}consistent with the absolute rule.{0,35}above.{0,35}not in tension with it'

# Part 4 (RETIRED by W13/F25): the "needless escalation, never a wrong merge" claim was false and
# is retired below -- a crash DURING the final whole-branch audit itself has no branch back into any
# audit round (resume-check.sh's next_action() returns RESUME_DELIVERY / DISCARD_AND_RESUME_DELIVERY
# once every task is committed, and warchief.md's own resume protocol defines both as "re-enter step
# 7"), so a crash there can produce an unaudited merge. See the "Task 4, LAST fix round (W13/F25 &
# F26)" block below for the honest replacement text and its assertions.
hasnt 'the retired needless-escalation-never-a-wrong-merge claim (F25) does not survive unqualified' \
    "$STEP6" 'needless escalation, never a wrong merge'

# --- Task 4, LAST fix round (W13/F25 & F26): say the whole truth about the crash-during-audit -----
# hazard, and give the crash-forced rung-3 trip its own `routed` value ----------------------------
#
# F25 (cold-only, Critical, Confirmed): the previous text claimed the final whole-branch audit is a
# backstop that resolves a stranded `TIEBREAK` "before any merge", full stop -- but reproduction
# shows that is false once a crash lands DURING that very audit. `resume-check.sh`'s `next_action()`
# has exactly two branches once every Hunter task is committed: `DISCARD_AND_RESUME_DELIVERY` (tree
# dirty) or `RESUME_DELIVERY` (tree clean) -- see resume-check.sh lines 198-211 (`next_action`):
# both are reached only via `card["total_tasks"] and card["last_completed_task"] >= ...`, and
# warchief.md's own "Crash-safe state & resume" section (~500 lines above step 6) defines BOTH as
# "re-enter step 7" verbatim ("re-enter step 7 -- never redo a committed task" /
# "re-enter step 7 (push / PR / CI watch)"). There is NO branch anywhere in `next_action()` that
# re-enters step 6, rung 2, or the final whole-branch audit. So a Warchief that dies mid-final-audit
# resumes straight into delivery and can open/merge the PR with that audit never finished -- exactly
# the "wrong merge" the retired claim said could never happen. W13 (Shaman ruling) orders the law to
# say the WHOLE truth: the backstop holds in the ordinary, no-crash case only; under a crash there is
# NO backstop at all (a pre-existing, cross-cutting, already-filed gap, not created by this card);
# and the "never a wrong merge" claim is RETIRED, replaced by the narrower true claim that survives.
#
# F26 (cold-only, Important, Confirmed): a crash-forced rung-3 trip (tie-break spent, oracle never
# ran) has no distinct `routed` value -- filing it under `ESCALATED (spec ambiguity)` would misstate
# the record (no contract is ambiguous; the oracle simply never ran), which the file's own
# conflation-is-forbidden rule already outlaws. W13 adds `ESCALATED (oracle unavailable)` and extends
# the disambiguation prose to name all FOUR triggers distinctly (the header update above is part of
# this same fix).
#
# Every bridge below is measured against this new text's OWN actual consumption (measured by direct
# extraction of the shipped, flattened clause) and widened to keep >=30 chars of D17 headroom on
# every one; a true zero/near-zero gap is left as a bare (or near-bare) literal per this file's own
# established convention rather than manufacturing a bridge that has nothing real to span.

# F25, part 1: the backstop is now scoped explicitly to the ordinary, no-crash case -- and ONLY
# there. Actual gaps 3 and 3 chars; `.{0,35}` keeps 32 chars of D17 headroom on each.
has 'the final-audit backstop is now scoped explicitly to the ordinary, no-crash case, and only there' \
    "$STEP6" \
    'In the ordinary, no-crash case.{0,35}and only there.{0,35}what keeps the record safe despite that gap'

# F25, part 2: the hazard, stated plainly -- after a crash, the backstop above is simply not there.
# Literal, zero-gap phrase (D17 convention).
has 'after a crash, that backstop is not there' "$STEP6" \
    'After a crash, that backstop is not there'

# F25, part 3: the reproduction, stated as law -- resume-check.sh's next_action() returns
# RESUME_DELIVERY or DISCARD_AND_RESUME_DELIVERY once every task is committed. Actual gaps 2, 1, 26
# chars; `.{0,35}`/`.{0,35}`/`.{0,60}` keep >=33 chars of D17 headroom on each.
has 'once every Hunter task is committed, next_action returns RESUME_DELIVERY or DISCARD_AND_RESUME_DELIVERY' \
    "$STEP6" \
    'next_action\(\).{0,35}returns.{0,35}`RESUME_DELIVERY`.{0,60}DISCARD_AND_RESUME_DELIVERY'

# F25, part 4: BOTH values mean "re-enter step 7" per the resume protocol above -- and there is no
# branch that re-enters step 6. Actual gaps 1 and 36 chars; `.{0,35}`/`.{0,70}` keep >=34 chars of
# D17 headroom on each.
has 'the resume protocol above defines both outcomes as re-entering step 7, and no branch re-enters step 6' \
    "$STEP6" \
    'defines BOTH as.{0,35}re-entering step 7.{0,70}no branch that re-enters step 6'

# F25, part 5: the concrete hazard this produces -- a Warchief dying during the final whole-branch
# audit resumes into delivery and can merge before that audit ever finishes. Actual gap 3 chars;
# `.{0,35}` keeps 32 chars of D17 headroom.
# F32 sweep: the 142-char lead-in "dies DURING the final whole-branch audit itself resumes straight
# into delivery and can open and merge the PR without that audit ever finishing" was itself a
# zero-gap literal spanning more than a single clause, and reddened on two independent legal
# insertions -- "eventually" before "resumes" (reproduced) and "eventually" before "open"
# (reproduced). Bridged at both internal joints (actual gaps 1 char each; `.{0,40}` keeps 39 chars
# of headroom on each).
has 'a Warchief dying during the final whole-branch audit resumes into delivery and can merge before that audit finishes' \
    "$STEP6" \
    'dies DURING the final whole-branch audit itself.{0,40}resumes straight into delivery and can.{0,40}open and merge the PR without that audit ever finishing.{0,35}a crash mid-audit can therefore produce an unaudited merge'

# F25, part 6: the cause is named -- resume-check.sh has no notion of a mid-audit state, the same
# pre-existing gap named earlier in this rung, now shown to reach the final audit too. Actual gaps 2
# and 2 chars; `.{0,35}` keeps 33 chars of D17 headroom on each.
has 'the mid-audit gap is named as resume-check.sh having no notion of a mid-audit state, the same pre-existing gap, now reaching the final audit too' \
    "$STEP6" \
    'has no notion of a mid-audit state.{0,35}the same pre-existing gap named above.{0,35}now shown to reach the final audit too'

# F25, part 7: it is a KNOWN, FILED follow-up -- pre-existing and cross-cutting, not created by this
# card. Actual gap 3 chars; `.{0,35}` keeps 32 chars of D17 headroom.
# F32 fix: the 56-char tail "pre-existing and cross-cutting, not created by this card" was itself a
# zero-gap literal spanning more than a single clause, and reddened on two independent legal
# insertions -- "in nature" before the comma (reproduced) and "or introduced" after "created"
# (reproduced). Bridged at both internal joints (actual gaps 2 and 1 chars; `.{0,40}` keeps >=38
# chars of headroom on each).
has 'the mid-audit gap is a known, filed follow-up: pre-existing and cross-cutting, not created by this card' \
    "$STEP6" \
    'a known, filed follow-up.{0,35}pre-existing and cross-cutting.{0,40}not created.{0,40}by this card'

# F25, part 8: the retraction, in so many words -- the "never a wrong merge" safety claim is
# explicitly RETIRED. Literal, zero-gap phrase (D17 convention).
has 'the never a wrong merge safety claim is explicitly RETIRED' "$STEP6" \
    'The "never a wrong merge" safety claim is RETIRED'

# F25, part 9: what survives, stated no more strongly than true -- absent a crash, this routing law
# is sound. Literal, zero-gap phrase (D17 convention).
has 'what survives: absent a crash, this routing law is sound' "$STEP6" \
    'absent a crash, this routing law is sound'

# F25, part 10: and under a crash, it is the tribe's resume machinery -- never this routing law --
# that fails. Actual gaps 3 and 3 chars; `.{0,35}` keeps 32 chars of D17 headroom on each.
has "under a crash, it is the tribe's resume machinery, never this routing law, that fails" "$STEP6" \
    'Under a crash, it is the tribe.s resume machinery.{0,35}never this routing law.{0,35}that fails'

# F26, part 1: D20 retires this row-anchored assertion (`ESCALATED (oracle unavailable)` as a
# literal enum member) -- the value went PARAMETRIC. See the "Task 4, D20 fix round" block below
# for the parametric-form assertion that replaces it.

# F26, part 2: its own definition -- a crash-forced rung-3 trip, where the pre-dispatch write
# already spent the finding key's one tie-break. Actual gaps 1 and 2 chars; `.{0,35}` keeps >=33
# chars of D17 headroom on each. Unchanged by D20/F27 (this assertion was never one of the four
# flagged as a zero-bridge, whole-clause literal).
has 'ESCALATED oracle unavailable is defined as a crash-forced rung-3 trip where the tie-break was already spent' \
    "$STEP6" \
    '`ESCALATED \(oracle unavailable\)` is a crash-forced rung-3 trip.{0,35}the pre-dispatch write already spent the finding key.s one tie-break'

# F27 fix (was F26 part 3): this assertion used to match the ENTIRE "trigger, means, consequence"
# sentence as one bare literal with NO bridge at the "means" joint -- a legal 7-16 char clarifying
# insertion right there (D17's own bound) reddened it (reproduced: inserting ", unfortunately,"
# before "means" broke the old regex). Bridged the same way the W11 exclusion clauses a few lines
# above this block already do for the identical sentence shape. Actual gap at the "landed
# means the mechanical" joint is 1 char; `.{0,40}` keeps 39 chars of D17 headroom.
has 'oracle unavailable fires when a crash lands before Cs outcome landed, so the oracle never ran and its result never landed' \
    "$STEP6" \
    "a crash after that write and before C.s outcome landed.{0,40}means the mechanical oracle never ran and its result never landed either"

# F27 fix (was F26 part 4): same defect, at the "because" joint -- a legal 7-char insertion
# ("simply ") reddened the old bare-literal regex (reproduced). Actual gap 2 chars; `.{0,40}` keeps
# 38 chars of D17 headroom.
has 'oracle unavailable is never a spec ambiguity: no contract is ambiguous, only unrun' "$STEP6" \
    'never `ESCALATED \(spec ambiguity\)`.{0,40}because no contract is ambiguous here, only unrun'

# F27 fix (was F26 part 5): same defect -- a legal 16-char insertion (", unfortunately,") reddened
# the old bare-literal regex (reproduced). Actual gap 2 chars; `.{0,40}` keeps 38 chars of headroom.
has 'oracle unavailable is never a standoff: no Skinner was ever re-dispatched to re-raise anything' \
    "$STEP6" \
    'never `ESCALATED \(standoff\)`.{0,40}because no Skinner was ever re-dispatched to re-raise anything'

# F27 fix (was F26 part 6): same defect -- a legal 7-char insertion ("simply ") reddened the old
# bare-literal regex (reproduced). Actual gap 2 chars; `.{0,40}` keeps 38 chars of headroom.
has 'oracle unavailable is never an inconclusive artifact: no adjudication of a falsification artifact ever ran on this finding' \
    "$STEP6" \
    'never `ESCALATED \(inconclusive artifact\)`.{0,40}because no adjudication of a falsification artifact ever ran on this finding at all'

# --- Task 4, D20 fix round (F27/F28): ESCALATED (<trigger>) goes PARAMETRIC ------------------------
# F27 (Critical, contract lens): the four assertions just above used to match a full "trigger,
# because/means, consequence" sentence as ONE bare literal with no `.{0,N}` bridge at the
# because/means joint at all -- a legal 7-16 char clarifying insertion right there (well inside
# D17's 30-char survival bound) reddened each one (reproduced above, and every other bridge in this
# file already keeps >=30 chars of headroom at that same joint shape). Fixed by bridging the joint,
# per the convention the W11 exclusion clauses already use a few hundred lines above.
#
# F28 (Important, cold lens): the non-crash path "a conflict resurfacing on the same key has
# already spent its tie-break and goes straight to rung 3" (the rung-2 Bounds paragraph) had NO
# legal `routed` value -- `ESCALATED (spec ambiguity)` would lie (no contract is ambiguous) and
# `ESCALATED (oracle unavailable)` would lie (no crash occurred). Two prior rounds (W11, W13) each
# patched one homeless trigger and another turned up. D20 (Shaman ruling) ends the whack-a-mole:
# `ESCALATED (<trigger>)` goes PARAMETRIC, not a closed list. The recorded trigger must be the
# ACTUAL cause (never a near-miss) -- the existing "conflating misstates the record" rule,
# generalized to govern every trigger, not just the enumerated ones. The currently known triggers
# are named and the list is explicitly OPEN: spec ambiguity, standoff, inconclusive artifact,
# oracle unavailable, and the new `tie-break spent` (the non-crash resurfacing case F28 found
# homeless). Per D20 ruling 4, the suite below guards the RULE mechanically, not the list: the
# parametric form, the actual-cause rule, the list's openness, and each currently-known trigger
# being *named* -- so a future trigger needs a new prose sentence naming itself, never a new
# assertion here or an edit to the enum row.

# The parametric marker itself, row-anchored the same structural, pipe-bounded way as its
# siblings above (`` `routed`[^|]*\|[^|]*VALUE ``, bounded by the row's own pipes) -- immune to
# text-length changes by construction, no D17 headroom needed. This is what replaces all four
# closed-list ROW assertions D20 retired above (spec ambiguity / standoff / inconclusive artifact /
# oracle unavailable): the row no longer lists individual triggers, so there is nothing left in the
# row for those four to guard, and one parametric-form assertion covers every trigger, present and
# future, without ever touching this row again.
has 'routed value is the parametric ESCALATED (<trigger>), not a closed list of individual values' \
    "$STEP6" \
    '`routed`[[:space:]]*\|[^|]*\|[^|]*ESCALATED \(<trigger>\)'

# Regression guards: none of the four retired closed-list ROW literals may resurface in the enum
# row's own cell -- a later editor reverting to a fixed list (even partially) is exactly the
# whack-a-mole D20 ends. Anchored to the ROW specifically (same pipe-bounded shape), so a trigger
# name appearing in the DEFINITION prose below (where it legitimately belongs) cannot falsely
# redden these.
hasnt 'the routed row no longer lists ESCALATED (spec ambiguity) as a fixed member' "$STEP6" \
    '`routed`[[:space:]]*\|[^|]*\|[^|]*ESCALATED \(spec ambiguity\)'
hasnt 'the routed row no longer lists ESCALATED (standoff) as a fixed member' "$STEP6" \
    '`routed`[[:space:]]*\|[^|]*\|[^|]*ESCALATED \(standoff\)'
hasnt 'the routed row no longer lists ESCALATED (inconclusive artifact) as a fixed member' "$STEP6" \
    '`routed`[[:space:]]*\|[^|]*\|[^|]*ESCALATED \(inconclusive artifact\)'
hasnt 'the routed row no longer lists ESCALATED (oracle unavailable) as a fixed member' "$STEP6" \
    '`routed`[[:space:]]*\|[^|]*\|[^|]*ESCALATED \(oracle unavailable\)'

# The parametric-form statement itself, and that it grows by a trigger naming itself rather than by
# editing the row. Actual gap 3 chars; `.{0,40}` keeps 37 chars of D17 headroom.
# F32 sweep: the 91-char tail "the set of known triggers grows by a rule naming its own trigger,
# never by editing this row" was itself a zero-gap literal spanning more than a single clause, and
# reddened on two independent legal insertions -- "organically" after "grows" (reproduced) and
# "and certainly" before "never" (reproduced). Bridged at both internal joints (actual gaps 1 char
# each; `.{0,40}` keeps 39 chars of headroom on each).
has 'the ESCALATED value is parametric, not a closed list, and grows by a trigger naming itself, never by editing the row' \
    "$STEP6" \
    'ESCALATED \(<trigger>\)` is parametric, not a closed list.{0,40}the set of known triggers grows.{0,40}by a rule naming its own trigger,.{0,40}never by editing this row'

# (b) The actual-cause rule, generalized to govern every trigger (D20 ruling 2): the recorded
# trigger must be the real cause, never a near-miss, and this is the SAME "conflating misstates the
# record" rule that used to guard only the four enumerated values -- now made general. Four
# conjuncts (W5 bar #3), each its own bridge. Actual gaps 2, 13, 2, 1 chars; the second bridge is
# widened to `.{0,45}` (45-13=32 headroom -- `.{0,40}` would only give 27, under D17's floor); the
# other three keep `.{0,40}`, giving >=38 chars of headroom each.
has 'the recorded ESCALATED trigger must be the actual cause; never a near-miss; this generalizes conflating-misstates-the-record to every trigger' \
    "$STEP6" \
    'The recorded trigger must be the ACTUAL cause.{0,40}never substitute a near-miss for it.{0,45}conflating them would misstate the record.{0,40}rule that used to guard only four enumerated values.{0,40}now governs every trigger'

# (c) Openness of the list: it is explicitly OPEN, not exhaustive. Actual gap 6 chars; `.{0,40}`
# keeps 34 chars of D17 headroom.
has 'the currently known trigger list is explicitly OPEN, not exhaustive' "$STEP6" \
    'The currently known triggers are named below.{0,40}the list is explicitly OPEN'

# (d) Each currently-known trigger is NAMED (conjunct completeness, W5 bar #3: all five, not an
# alternation satisfied by any one) -- independent of (c)'s openness clause, per mutation: deleting
# ONLY "explicitly OPEN" must redden (c) alone, never this assertion too, so the lead-in bridge is
# widened to cross that clause rather than stopping just short of it. Anchored on "named below" (not
# "explicitly OPEN") so this cannot be hollowly satisfied by the same five words appearing scattered
# elsewhere in the trigger definitions below (they never appear in this exact order there). Actual
# gap from "named below" to the first name is 35 chars (spans "and the list is explicitly OPEN: ");
# `.{0,70}` keeps 35 chars of D17 headroom. The remaining four bridges have actual gaps 2, 2, 2, 2,
# 6 chars; `.{0,40}` keeps >=34 chars of headroom on each.
has 'all five currently known triggers are named: spec ambiguity, standoff, inconclusive artifact, oracle unavailable, tie-break spent' \
    "$STEP6" \
    'triggers are named below.{0,70}`spec ambiguity`.{0,40}`standoff`.{0,40}`inconclusive artifact`.{0,40}`oracle unavailable`.{0,40}`tie-break spent`'

# Regression guards: no fixed-count phrasing may resurface -- neither the ones D20 retired (two/
# three/four) nor the naive next mistake of just bumping the count again to five. This is the
# direct, mechanical expression of D20's own point: a fifth fixed enum value would only buy a
# sixth.
hasnt 'the header no longer claims a fixed two-value count' "$STEP6" \
    'The two `ESCALATED` values name two different failures'
hasnt 'the header no longer claims a fixed three-value count' "$STEP6" \
    'The three `ESCALATED` values name three different failures'
hasnt 'the header no longer claims a fixed four-value count' "$STEP6" \
    'The four `ESCALATED` values name four different failures'
hasnt 'the header does not just bump the fixed count to five -- that is the whack-a-mole D20 ends' \
    "$STEP6" 'The five `ESCALATED` values name five different failures'

# The new `tie-break spent` trigger's OWN definition, matching the shape every other trigger's
# definition already has in this file: what it is, what fires it, and what it is never confused
# with. Every bridge below is measured against this new text's own actual consumption and widened
# to keep >=30 chars of D17 headroom, applying F27's lesson from birth rather than shipping a fifth
# zero-bridge literal.

has 'ESCALATED tie-break spent is defined as the non-crash rung-2 bound' "$STEP6" \
    '`ESCALATED \(tie-break spent\)` is the non-crash rung-2 bound above'

# Trigger condition, bridged at its own "so" joint (actual gap 2 chars; `.{0,40}` keeps 38 chars of
# headroom) -- the same joint shape F27 flagged, fixed from birth.
has 'tie-break spent fires when a conflict resurfaces on a key whose one tie-break is already spent' \
    "$STEP6" \
    'a conflict resurfaces on a finding key whose one tie-break this campaign has already spent.{0,40}so rung 2 is skipped outright'

# Never confused with `oracle unavailable` (no crash occurred) -- actual gap 2 chars; `.{0,40}`
# keeps 38 chars of headroom.
has 'tie-break spent is never oracle unavailable: no crash occurred' "$STEP6" \
    'never `ESCALATED \(oracle unavailable\)`.{0,40}because no crash occurred here at all'

# Never confused with `spec ambiguity` (no citation dispute is even being read) -- actual gap 2
# chars; `.{0,40}` keeps 38 chars of headroom.
has 'tie-break spent is never spec ambiguity: no citation dispute is even being read' "$STEP6" \
    'never `ESCALATED \(spec ambiguity\)`.{0,40}because no citation dispute is even being read here'

# Never confused with `standoff` (no Skinner ever re-raised anything on this key) -- actual gap 2
# chars; `.{0,40}` keeps 38 chars of headroom.
has 'tie-break spent is never a standoff: no Skinner ever re-raised anything on this key' "$STEP6" \
    'never `ESCALATED \(standoff\)`.{0,40}because no Skinner ever re-raised anything on this key'

# The rung-2 Bounds paragraph itself (F28's original site) now names its own trigger explicitly,
# per D20 ruling 3 ("every new escalation rule must name its own trigger"). Actual gap 3 chars;
# `.{0,40}` keeps 37 chars of headroom.
has 'the resurfacing forced rung-3 trip in the Bounds paragraph is recorded as ESCALATED (tie-break spent)' \
    "$STEP6" \
    'This forced rung-3 trip is recorded as `ESCALATED \(tie-break spent\)`.{0,40}the trigger is that the key.s one tie-break is already spent'

# Compound claim (W5 bar #3): the trigger is the spent key -- AND -- never a crash -- AND -- never
# an actually-ambiguous contract. Three conjuncts, each its own bridge. Actual gaps 2, 2, 2, 2
# chars; `.{0,40}` keeps 38 chars of D17 headroom on each.
has 'the Bounds-paragraph trigger is the spent key, never a crash, never an ambiguous contract' \
    "$STEP6" \
    'is already spent.{0,40}never a crash.{0,40}`oracle unavailable`.s trigger, defined below.{0,40}never a contract that is actually ambiguous.{0,40}`spec ambiguity`.s'

# --- Task 4, W15 fix round (F29): the state file records STATUS, not just the key -----------------
# F29 (Critical, cold-only, Confirmed): the Bounds rule (just above) unconditionally labeled ANY
# resumed conflict on a listed key `ESCALATED (tie-break spent)`, "never a crash" -- while the crash
# paragraph (a few lines below it) said a Warchief that died between the spend-commit and C's outcome
# landing must record `ESCALATED (oracle unavailable)`. Both fire on the exact same observable event
# (the finding key is present under `## Tie-breaks spent`) because the pre-fix heading recorded "one
# finding key per line" -- no outcome, no status -- so nothing in the committed record could ever
# distinguish "the oracle ran and resolved" from "the oracle was spent and then lost to a crash". The
# Bounds rule's hard-wired first label therefore made the second trigger unreachable by any rule the
# document defined, directly violating D20's own "the recorded trigger must be the ACTUAL cause; never
# a near-miss" two paragraphs after it was stated. Reinforcing evidence: `tie-break spent`'s own
# definition already excluded `oracle unavailable` ("never ... because no crash occurred here at
# all"), but `oracle unavailable`'s definition never reciprocated.
#
# W15 (Shaman ruling) fixes this at the root: the `## Tie-breaks spent` heading now records KEY PLUS
# STATUS (`dispatched` written+committed before C is dispatched; `resolved` appended+committed, never
# overwriting, when C's outcome lands), so the two triggers become DECIDABLE from committed state
# alone -- latest status `resolved` -> `ESCALATED (tie-break spent)`; latest status `dispatched` with
# no `resolved` ever landing -> `ESCALATED (oracle unavailable)` -- and the mutual exclusion is stated
# from BOTH sides. Every bridge below is measured against this new text's OWN actual consumption
# (measured by direct extraction of the shipped, flattened clause) and widened to keep >=30 chars of
# D17 headroom on every one; a true near-zero gap is left as a bare (or near-bare) literal per this
# file's own established convention.

# The line format itself: key plus status, never a bare key. Two short assertions (W5 bar #2), each
# on its own unique clause. First: the format change is named. Actual gap 2 chars (near-zero, left
# bare per convention).
has 'the Tie-breaks spent heading now records key PLUS STATUS, never a bare key' "$STEP6" \
    'heading records key PLUS STATUS.{0,40}never a bare key'

# Second: the format itself is stated -- `<finding-key>: dispatched`. F30/W16 fix: this used to read
# "the concrete, greppable line format is" -- a false mechanism claim (below). Actual gap 2 chars
# (near-zero, left bare per convention).
has 'the line format itself is stated: <finding-key>: dispatched' "$STEP6" \
    'the line format is.{0,40}`<finding-key>: dispatched`'

# When C's outcome lands, `resolved` is APPENDED (never overwriting `dispatched`) to the SAME state
# file heading -- this is the other half of the format, without which `resolved` could never be
# produced. Actual gap 21 chars; `.{0,55}` keeps 34 chars of D17 headroom.
has 'when Cs outcome lands, resolved is appended to the state files Tie-breaks spent heading too' \
    "$STEP6" \
    'ALSO APPEND `<finding-key>: resolved`.{0,55}`## Tie-breaks spent` heading \(W15\)'

# ...and it never overwrites the `dispatched` line laid down before dispatch -- append-only, same
# discipline as the report-file ledger. Near-zero actual gap (3 chars), left as a near-bare literal
# per convention; `.{0,40}` keeps 37 chars of headroom for safety.
has 'the resolved line never overwrites the dispatched line laid down before dispatch' "$STEP6" \
    '`## Tie-breaks spent` heading \(W15\).{0,40}never overwriting the `dispatched` line laid down before dispatch'

# The two-branch decision rule itself -- this is the mechanism that makes both triggers reachable.
# Branch 1: latest status `resolved` -> `ESCALATED (tie-break spent)`. Actual gap 43 chars; `.{0,75}`
# keeps 32 chars of D17 headroom.
has 'decision rule branch 1: latest status resolved fires ESCALATED (tie-break spent)' "$STEP6" \
    'Latest line is `<finding-key>: resolved`.{0,75}This forced rung-3 trip is recorded as `ESCALATED \(tie-break spent\)`'

# Branch 2: latest status `dispatched`, no `resolved` ever landing -> `ESCALATED (oracle
# unavailable)`. Actual gap 70 chars; `.{0,105}` keeps 35 chars of D17 headroom.
has 'decision rule branch 2: latest status dispatched with no resolved ever landing fires ESCALATED (oracle unavailable)' \
    "$STEP6" \
    'Latest line is `<finding-key>: dispatched`, with no `resolved` line ever landing.{0,105}This forced rung-3 trip is recorded as `ESCALATED \(oracle unavailable\)` instead'

# The mutual exclusion, stated from BOTH sides (W15 ruling 3). First: the two statuses are exhaustive
# and exclusive by construction -- a key's latest line is always exactly one of the two, never both.
# Actual gap 29 chars; `.{0,60}` keeps 31 chars of D17 headroom.
has 'the two statuses are mutually exclusive by construction: always exactly one, never both' "$STEP6" \
    'a key.s latest status line is always exactly one of.{0,60}never both at once'

# Second: `oracle unavailable`'s OWN definition now reciprocally excludes `tie-break spent` -- this is
# the reinforcing-evidence gap F29 named explicitly (the exclusion existed only from the tie-break-spent
# side before this fix). Near-zero actual gap (2 chars), left as a near-bare literal per convention.
# F32 sweep: this assertion's own regex was a 120-char zero-gap literal spanning more than a single
# clause -- unlike its three sibling exclusion assertions above (spec ambiguity / standoff /
# inconclusive artifact), which already bridge their own "because" joint per F27's fix, this later
# W15-added sibling never got the same treatment. Reddened on two independent legal insertions --
# "simply" before "because" (reproduced) and "genuinely" before "`resolved`" (reproduced). Bridged
# at both internal joints (actual gaps 1 char each; `.{0,40}` keeps 39 chars of headroom on each).
has 'oracle unavailable reciprocally excludes tie-break spent: fires only when latest status is resolved' \
    "$STEP6" \
    'never `ESCALATED \(tie-break spent\)`,.{0,40}because that trigger fires only when the key.s LATEST state-file line.{0,40}is `resolved`'

# The crash-cost paragraph (rung 2's honest-cost sentence) now names its OWN produced trigger
# explicitly, tying the general decision rule above to the concrete crash-window scenario it describes.
# Two conjuncts (W5 bar #3): the label fires -- AND -- the other label explicitly does not. Actual gaps
# 16 and 3 chars; `.{0,50}`/`.{0,40}` keep >=30 chars of D17 headroom on each.
has 'the crash-cost paragraph names its own outcome as ESCALATED (oracle unavailable), never tie-break spent' \
    "$STEP6" \
    'Per the status-based rule above.{0,50}recorded as `ESCALATED \(oracle unavailable\)`.{0,40}never as `ESCALATED \(tie-break spent\)`'

# --- F30 / W16: the tie-break key lookup is a JUDGMENT, not a grep -- and doubt defaults SAFE -------
#
# F30 (Critical, cold-only): the rung-2 write-format sentence called the `## Tie-breaks spent` lookup
# "concrete, greppable", and (separately) the pre-existing idea-05 finding-key definition (out of this
# card's fence -- left verbatim, see the assertions above at "loop termination below mechanical instead
# of a judgment call") claims the key is what makes termination mechanical. But the finding key is
# free-text, LLM-authored prose with no normalization, no hash, no canonical form, and no script
# anywhere implements the lookup -- `grep -rn "Tie-breaks spent" plugins/tribe/scripts/` matches only
# THIS test file's own prose-greps of step 6, never an actual key-comparison implementation. Two
# independent Skinner runs will not reproduce a one-line claim byte-for-byte across a commit boundary
# or a crash, so the cap's enforcement is a Warchief JUDGMENT, and the old text promised a mechanism it
# does not have. W16 (Shaman ruling) fixes this: drop the false "greppable" framing for THIS lookup
# (the old assertion asserting it, above, was retired/rewritten rather than left vouching for a false
# claim), state the judgment plainly, and make the SAFE error (treat an ambiguous key as NOT spent) the
# default, because the two errors are not symmetric.
#
# Every bridge below is measured against the shipped, flattened clause and widened to keep >=30 chars
# of D17 headroom over its actual current consumption; near-zero gaps are left near-bare per this
# file's convention.

# The lookup is stated as a JUDGMENT, never a grep/string-compare. Actual gap 2 chars; `.{0,40}` keeps
# 38 chars of headroom.
has 'recognizing a listed key as the current finding is the Warchiefs JUDGMENT, never a grep or string-compare' \
    "$STEP6" \
    'the Warchief.s JUDGMENT.{0,40}never a grep or string-compare'

# That judgment is explicitly the SAME recognition Law 3's merge already relies on -- not a new
# capability the state file invents (guards against re-treating this as a novel mechanical faculty).
# Actual gap 38 chars; `.{0,70}` keeps 32 chars of headroom.
has 'the key-recognition judgment is the same recognition Laws 3 merge already relies on, not a new capability' \
    "$STEP6" \
    'the same recognition Law 3.s merge already relies on.{0,70}not a new capability the state file invents'

# On doubt, the key is treated as NOT SPENT -- the safe default, stated plainly. Actual gap 3 chars;
# `.{0,35}` keeps 32 chars of headroom.
has 'on doubt, the key is treated as NOT SPENT because the two errors are not symmetric' "$STEP6" \
    'On doubt, treat the key as NOT SPENT.{0,35}the two errors this default trades off are not symmetric'

# The asymmetry's two conjuncts (W5 bar #3 -- conjunct completeness): the cheap error (one extra
# review round) AND the expensive error (a burned human ruling, a denied mechanical oracle) are both
# named, never just one side of the trade. Each assertion below is anchored WITHIN its own clause only
# (D14/W4 per-clause isolation) so deleting one conjunct's clause cannot redden the other's assertion.
# Cheap-error clause, self-contained: actual gap 1 char; `.{0,40}` keeps 39 chars of headroom.
has 'the cheap error is named: wrongly treating a spent key as unspent costs one extra review round' \
    "$STEP6" \
    'wrongly treating a spent key as unspent.{0,40}costs one extra review round'

# Expensive-error clause, self-contained, its own two conjuncts (burns AND denies): actual gaps 1 and
# 5 chars; `.{0,40}` keeps >=35 chars of headroom on each.
has 'the expensive error is named: it burns a human ruling and denies the mechanical oracle' "$STEP6" \
    'wrongly treating an unspent key as spent.{0,40}burns a human ruling at rung 3.{0,40}denies a genuinely new finding the mechanical oracle this rung exists to give it'

# Regression guard: no future editor may re-inflate the tie-break key lookup back into a
# "greppable"/mechanical guarantee. The word does not survive anywhere in step 6.
hasnt 'no "greppable" claim survives anywhere in step 6' "$STEP6" 'greppable'

# --- Task 5: negative assertions (regression guards) ------------------------
# The three regression guards that matter most (spec §4): each is a specific way this card can
# be silently un-done by a later edit, unrelated to whether the positive assertions above still
# pass. Per W4/D14, every one of these is proven to BITE by mutation: injected forbidden text
# turns it red, and the guard is currently green because step 6, as shipped, contains none of
# these forbidden phrasings (confirmed by direct grep against the shipped, flattened text before
# these assertions were written — none of the three regexes below match anything currently in
# step 6). D17 headroom is measured the same way as every assertion above.

# The rung-1 loophole: resolving a conflict by picking a winner, dressed up as adjudication,
# with no contract citation. This is a pure alternation of fixed phrases (no `.{0,N}` bridge, so
# no D17 headroom applies — per this file's own convention, a zero-gap phrase is left bare rather
# than manufacturing a bridge with nothing to span). It is carefully NOT a bare "winner"/"pick"
# grep: step 6 already legitimately contains "picking a winner by taste is not [your job]" (rung
# 1's own prohibition) and "either oscillates or silently picks one" (the routing table's own
# explanation of why `conflicting` must never reach the fixer) — both are NEGATIONS of the
# loophole, not instances of it, and neither contains the literal "pick the winner" / "choose
# the winner" / "decide which reviewer is right" shapes this regex requires. Proven to bite:
# injecting "On a conflict, decide which reviewer is right." (this task's own RED repro, below)
# turns this red; the shipped text (no such sentence) leaves it green.
hasnt 'rung-1 loophole: no permission to resolve a conflict by picking a winner without a contract citation' \
      "$STEP6" \
      'choose (the )?winner|pick (the )?winner|decide which reviewer is right'

# The rung-2 leak: handing the tie-break Skinner (C) either reviewer's report, findings, or even
# the bare fact that a disagreement exists — the thing that would turn C from a third independent
# sample into an arbiter reading two briefs. Bridges are widened past a realistic actual gap
# ("both reports" ~1 char, "that a disagreement exists" ~1 char) to `.{0,50}`, keeping >=30 chars
# of D17 headroom even against a verbose future insertion. This is deliberately NOT a bare
# "reports"/"disagreement" grep: step 6 already legitimately says C "never receives their reports,
# findings, verdicts, or even the fact that a disagreement exists" and that "handing it the two
# reports would destroy the very independence that makes agreement meaningful" — both are the
# PROHIBITION itself, worded as a negation, and neither matches "(attach|include|hand|pass|
# forward|give) (both|A's and B's|the two) ... (reports|findings)" or "tell C ... a disagreement
# exists" (confirmed: the shipped, flattened text does not satisfy either alternative — the
# forbidding sentences use "never receives"/"would destroy", never an imperative instruction to
# attach/hand/tell). Proven to bite: injecting "Attach both reports to C's brief so it can weigh
# in." or "Also tell C up front that a disagreement exists between A and B." turns this red.
hasnt 'rung-2 leak: no text hands, attaches, or tells the tie-break Skinner either reviewers reports, findings, or that a disagreement exists' \
      "$STEP6" \
      "(attach|include|hand|pass|forward|give) (both|A.s and B.s|the two).{0,50}(reports?|findings?)|tell C.{0,50}(a disagreement|there is disagreement|that a disagreement exists)"

# Delegating an unresolvable conflict downward: routing a `conflicting` finding to the fixer
# as-is instead of walking the ladder. The bridge (`.{0,50}`) is widened past the realistic actual
# gap (the word "finding" plus punctuation, ~8-10 chars) to keep >=30 chars of D17 headroom. This
# is deliberately NOT a bare "conflicting"/"fixer" grep: the routing table's own row already says
# `conflicting` is "Never routed to the fixer as-is" — but that sentence puts "conflicting" BEFORE
# "routed", where this regex requires "route" to come BEFORE "conflicting" (the shipped negation
# is never a substring match for this forbidding-instruction shape; confirmed against the shipped,
# flattened text). Proven to bite: injecting "When rung 2 finds no majority, just route the
# `conflicting` finding to the fixer anyway." turns this red.
hasnt 'delegating an unresolvable conflict downward: no text routes a conflicting finding to the fixer as-is' \
      "$STEP6" \
      'route (the )?`?conflicting`? .{0,50}to the fixer'

printf '\n# passed: %d, failed: %d\n' "$PASS" "$FAIL"
[[ "$FAIL" -eq 0 ]]
