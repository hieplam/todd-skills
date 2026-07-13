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
has   "law3: agreement tag for single-flagged findings" "$STEP6" '\[one\]'
has   "law3: both reports preserved verbatim"        "$STEP6" 'both reports verbatim'

# Law 4 — PASS requires BOTH; the 3-round cap survives; escalation carries both reports.
# SUPERSEDED by idea 03: the cold lens holds no verdict, so unanimity is not the rule any more.
# The safety property it protected is preserved by the disposition rule (no cold hypothesis may be
# silently dropped). Asserted in full by test-input-asymmetry.sh.
has   "law4: only the contract lens holds the verdict (idea 03)" "$STEP6" 'only the contract lens'
has   "law4: un-auditable from either is a fail"     "$STEP6" 'un-auditable'
has   "law4: the 3-round fix cap is unchanged"       "$STEP6" 'cap fix-rounds at 3'
has   "law4: escalation attaches both reports"       "$STEP6" 'both round-3 fail reports'

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
has   "consistency: anti-goal 4 escalates with both reports" "$WAR" 'both skinners.{0,3} last fail reports'
has   "consistency: dispatch contract names the Skinner pair" "$WAR" 'audit its diff with the \*\*skinner\*\* pair'
has   "consistency: wave-failure text carries both reports" "$WAR" 'both skinners.{0,3} round-3 fail'
has   "consistency: step 5 model note names the Skinner pair" "$WAR" 'stays on the \*\*skinner\*\* pair'
has   "consistency: final report cites both Skinners"       "$WAR" 'audited pass against the spec by both skinners'
hasnt "consistency: no lone-Skinner audit claim survives"   "$WAR" 'spec by the skinner'
hasnt "consistency: no lone-Skinner escalation survives"    "$WAR" 'attach the skinner'

printf '\n%d passed, %d failed\n' "$PASS" "$FAIL"
exit $((FAIL > 0))
