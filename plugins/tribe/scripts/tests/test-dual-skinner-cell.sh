#!/usr/bin/env bash
# test-dual-skinner-cell.sh — contract tripwire for the dual-Skinner audit cell (idea 01).
#
# This is a TRIPWIRE, not a behavior test: it proves the four laws of the cell are WRITTEN into
# the agent prompts, and fails loudly if a later edit deletes one. Behavior is proved by the
# evals in plugins/tribe/evals/evals.json. Offline, no network.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AGENTS="$HERE/../../agents"
WARCHIEF="$AGENTS/warchief.md"
SKINNER="$AGENTS/skinner.md"
PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); printf 'ok - %s\n' "$1"; }
bad() { FAIL=$((FAIL+1)); printf 'not ok - %s\n' "$1"; }

# Agent prompts are hard-wrapped prose, so a sentence routinely straddles a newline. grep is
# line-based and would miss it. Flatten every haystack to one whitespace-normalized line first:
# assertions then match meaning, not line-breaking accidents.
flat() { tr '\n' ' ' | tr -s ' '; }

has() { # has NAME HAYSTACK REGEX — the (flattened) text must contain the regex
  if grep -qiE "$3" <<<"$2"; then ok "$1"; else bad "$1 (missing: $3)"; fi
}
hasnt() { # hasnt NAME HAYSTACK REGEX — the (flattened) text must NOT contain the regex
  if grep -qiE "$3" <<<"$2"; then bad "$1 (found what must be gone: $3)"; else ok "$1"; fi
}

[[ -f "$WARCHIEF" ]] || { printf 'not ok - warchief.md not found\n'; exit 1; }
[[ -f "$SKINNER" ]]  || { printf 'not ok - skinner.md not found\n'; exit 1; }

# The step 6 section only: from its heading up to the step 7 heading, flattened.
STEP6="$(awk '/^### 6\./{f=1} /^### 7\./{f=0} f' "$WARCHIEF" | flat)"
[[ -n "$STEP6" ]] || { printf 'not ok - could not extract step 6 from warchief.md\n'; exit 1; }

# Law 1 — two Skinners, dispatched concurrently in ONE message, on an identical brief.
has   "law1: step 6 audits with two Skinners"        "$STEP6" 'two[[:space:]]+(independent[[:space:]]+)?skinners?'
has   "law1: both dispatched in the same message"    "$STEP6" 'two tool uses in the same message'
# SUPERSEDED by idea 03 (input asymmetry): the briefs are deliberately NOT identical any more.
# The cell still dispatches two Skinners concurrently in one message; what changed is that one gets
# the contract lens and one gets the cold lens. Asserted in full by test-input-asymmetry.sh.
has   "law1: the two briefs are asymmetric (idea 03)" "$STEP6" 'contract lens|cold lens'
hasnt "law1: the single-Skinner dispatch line is gone" "$STEP6" 'dispatch the \*\*skinner\*\* against the diff'

# Law 2 — isolation: neither reviewer sees the other; sequential dispatch is the violation.
has   "law2: sequential dispatch is forbidden"       "$STEP6" 'sequential dispatch'
has   "law2: a fix round re-dispatches fresh instances" "$STEP6" 'two fresh'
has   "law2: never reuse a Skinner across rounds"    "$STEP6" 'never reuse.{0,40}across rounds'

# Law 3 — the Warchief merges: union of findings, tagged by agreement, both reports kept verbatim.
has   "law3: findings are merged as a union"         "$STEP6" 'union'
has   "law3: agreement tag for both-flagged findings" "$STEP6" '\[both\]'
# SUPERSEDED by idea 03 (input asymmetry): `[one]` was idea 01's single-flagged tag. warchief.md's
# Law 3 table now uses the three-tag vocabulary `[both]`/`[contract-only]`/`[cold-only]`; `[one]`
# survives only as a historical "Maps onto idea 01's tag" reference-column footnote, so an assertion
# anchored on it guards documentation, not behavior, and would go spuriously red on a benign doc
# cleanup of that column. The real coverage for the tag vocabulary is asserted in full by
# test-input-asymmetry.sh:108 ('\[both\].{0,200}\[contract-only\].{0,200}\[cold-only\]').
has   "law3: both reports preserved verbatim"        "$STEP6" 'both reports verbatim'

# Law 4 — REWRITTEN (idea-11 task-1): no lens holds a verdict any more, not even the contract
# lens — the Warchief adjudicates every Critical/Important finding itself (CONFIRMED/REFUTED/DEBT).
# The 3-round cap and escalation-with-both-reports survive, worded around the new disposition
# ledger instead of a "round-3 fail report".
has   "law4: no lens holds a verdict; the Warchief adjudicates" "$STEP6" 'no lens holds a verdict.{0,10}you do'
has   "law4: un-auditable from either is a fail"     "$STEP6" 'un-auditable'
has   "law4: the 3-round fix cap is unchanged"       "$STEP6" 'cap fix rounds at 3'
has   "law4: escalation attaches both reports and the disposition ledger" "$STEP6" \
    'both lenses.{0,5}reports.{0,40}full disposition ledger.{0,20}attached verbatim'

# Skinner-side reciprocal invariant — it must know it is one of two, and refuse the peer's findings.
SKIN="$(flat <"$SKINNER")"
has "skinner: knows it is one of two independent reviewers" "$SKIN" 'one of two independent reviewers'
has "skinner: never seeks or accepts the peer findings"     "$SKIN" 'never seek'
has "skinner: reports only what it independently derived"   "$SKIN" 'independently derived'

# Consistency — no passage anywhere in warchief.md may still describe a single-Skinner audit.
WAR="$(flat <"$WARCHIEF")"
has   "consistency: frontmatter description audits with two Skinners" "$WAR" 'audits every deliverable with \*\*two independent skinners\*\*'
has   "consistency: header line audits with two Skinners"   "$WAR" 'you audit the result with \*\*two independent skinners\*\*'
has   "consistency: anti-goal 4 audits with two Skinners"   "$WAR" 'audited by \*\*two independent skinners\*\*'
# REPOINTED (idea-11 task-1): "both skinners' ... fail reports" language is gone — escalation now
# carries "both lenses' reports" plus the disposition ledger, and the final report cites the
# adjudicated disposition (CONFIRMED/REFUTED/DEBT counts), not a pass/fail verdict from the pair.
has   "consistency: anti-goal 4 escalates with both reports" "$WAR" 'both lenses.{1,3}reports and the disposition ledger attached verbatim'
has   "consistency: dispatch contract names the Skinner pair" "$WAR" 'audit its diff with the \*\*skinner\*\* pair'
has   "consistency: wave-failure text carries both reports" "$WAR" 'with both lenses.{1,3}reports and the disposition ledger attached verbatim, per step 6'
has   "consistency: step 5 model note names the Skinner pair" "$WAR" 'stays on the \*\*skinner\*\* pair'
has   "consistency: final report cites the disposition outcome, not a pass/fail verdict" "$WAR" 'audit closed: 5 findings.{0,10}3 fixed, 1 refuted with'
hasnt "consistency: no lone-Skinner audit claim survives"   "$WAR" 'spec by the skinner'
hasnt "consistency: no lone-Skinner escalation survives"    "$WAR" 'attach the skinner'

# --- New load-bearing law (idea-11 task-1): no lens holds a verdict; the Warchief adjudicates ----
SKIN2="$(flat <"$SKINNER")"

# (a) the contract lens's terminator exists in skinner.md — it reports findings, never a verdict.
has "skinner: contract lens ends with a CONTRACT-LENS terminator" "$SKIN2" 'CONTRACT-LENS: N findings'

# (b) warchief step 6 states the three-part audit-close condition in full: every conjunct checked.
has "law4: audit closes iff all three hold — dispositions, no unfixed CONFIRMED, green proof" "$STEP6" \
    'audit CLOSES if and only if all three hold.{0,80}every Critical/Important merged finding has a recorded disposition.{0,80}no CONFIRMED finding remains unfixed-and-unverified.{0,80}the proof runs green in your own hands'

# (c) DEBT is forbidden for Critical findings — the mechanical floor Law 3 gives the disposition.
has "law3: DEBT is forbidden for Critical findings" "$STEP6" \
    'DEBT is FORBIDDEN for.{0,20}any Critical finding'

# (d) a fix round does not, by default, dispatch a fresh dual-skinner pair — targeted verification
# replaces per-round re-discovery.
has "law2: a fix round does not by default dispatch a fresh dual-skinner pair" "$STEP6" \
    'Targeted verification replaces per-round re-discovery.{0,20}A FIX round does not, by default,.{0,10}dispatch a fresh dual-skinner pair'

printf '\n%d passed, %d failed\n' "$PASS" "$FAIL"
exit $((FAIL > 0))
