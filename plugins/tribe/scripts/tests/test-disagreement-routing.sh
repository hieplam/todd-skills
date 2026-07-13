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

has 'routed value ESCALATED for spec ambiguity' "$STEP6" \
    '`routed`[[:space:]]*\|[^|]*\|[^|]*ESCALATED \(spec ambiguity\)'

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

# Second conjunct of the same paragraph (W5 bar #3, split per the F14/F8 precedent above rather
# than one long bridge): WHY it lives there — so a re-dispatched Warchief resuming this card can
# see which finding keys already spent their one tie-break round. "re-dispatched Warchief resuming
# this card" is itself a literal, zero-gap phrase coined only by this clause (never used elsewhere
# in step 6); bridged (~37-char actual gap, D17 headroom) to the tie-break-round phrase that is the
# whole reason this ledger lives on disk rather than in the Warchief's head.
has 'the report file lets a re-dispatched Warchief see which findings already spent their tie-break' "$STEP6" \
    're-dispatched Warchief resuming this card.{0,90}spent their one tie-break round'

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

has 'routed value ESCALATED standoff, listed distinctly from ESCALATED spec ambiguity' "$STEP6" \
    '`routed`[[:space:]]*\|[^|]*\|[^|]*ESCALATED \(standoff\)'

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

printf '\n# passed: %d, failed: %d\n' "$PASS" "$FAIL"
[[ "$FAIL" -eq 0 ]]
